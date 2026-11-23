import test from 'node:test';
import assert from 'node:assert/strict';
import { capacidad, decimal, formato, planificar, porciones } from '../lib/cocina.js';
import { consultarCocina, guardarReceta, registrarCompra, registrarProduccion, planificarCocina } from '../servicios/cocina.js';
import { randomUUID } from 'node:crypto';

test('cantidades mantienen seis decimales exactos', () => {
  assert.equal(formato(decimal('0.000001') * 3n), '0.000003');
  assert.equal(formato(decimal('12.30', 4), 4), '12.3000');
  assert.equal(decimal('0', 4, true), 0n);
});
test('rechaza cantidades ambiguas, negativas, cero, precisión y rango excesivos', () => {
  for (const valor of [undefined, null, {}, '', '-1', '0', 'NaN', Infinity, '1e3', '0.0000001', '100000000', ' 1', '1,5']) assert.throws(() => decimal(valor));
  for (const valor of [0, -1, 1.5, '01', 1000000, undefined]) assert.throws(() => porciones(valor));
});
test('capacidad toma el ingrediente limitante y redondea hacia abajo', () => {
  assert.equal(capacidad([{ activo: true, cantidad: '0.3', stock: '0.9' }, { activo: true, cantidad: '2', stock: '5' }]), '2');
  assert.equal(capacidad([{ activo: true, cantidad: '0.3', stock: '0.9' }]), '3');
  assert.equal(capacidad([{ activo: true, cantidad: '1', stock: '0' }]), '0');
  assert.equal(capacidad([{ activo: true, cantidad: '1', stock: '199999998.000000' }]), '199999998');
});
test('no afirma capacidad de recetas pendientes o ingredientes inactivos', () => {
  assert.equal(capacidad([]), null);
  assert.equal(capacidad([{ activo: false, cantidad: '1', stock: '10' }]), null);
  assert.equal(capacidad([{ activo: true, cantidad: '1', stock: '10' }], false), null);
  assert.equal(capacidad([{ activo: true, unidad: 'KG', cantidad: '1', stock: '10' }]), null);
});
const componente = { idInsumo: '1', nombre: 'Arroz', unidad: 'G', cantidad: '100', stock: '500', activo: true };
const recetas = ['a', 'b'].map(idOpcion => ({ idOpcion, activo: true, capacidad: '5', ingredientes: [componente] }));
test('plan suma ingredientes compartidos y entradas repetidas', () => {
  const plan = planificar(recetas, [{ idOpcion: 'a', porciones: 3 }, { idOpcion: 'b', porciones: 3 }]);
  assert.equal(plan.listo, false);
  assert.equal(plan.ingredientes.length, 1);
  assert.equal(plan.ingredientes[0].necesario, '600.000000');
  assert.equal(plan.ingredientes[0].faltante, '100.000000');
  assert.equal(planificar(recetas, [{ idOpcion: 'a', porciones: 2 }, { idOpcion: 'a', porciones: 3 }]).listo, true);
});
test('plan rechaza platos ausentes y pendientes', () => {
  assert.throws(() => planificar(recetas, []));
  assert.throws(() => planificar(recetas, [{ idOpcion: 'x', porciones: 1 }]));
  assert.throws(() => planificar([{ ...recetas[0], capacidad: null }], [{ idOpcion: 'a', porciones: 1 }]));
});

if (process.env.COCINA_TEST_DATABASE_URL) test('PostgreSQL: compra idempotente, producción, rollback y planificación compartida', async () => {
  const conexion = new URL(process.env.COCINA_TEST_DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(conexion.hostname) && conexion.pathname.endsWith('_pruebas'), 'Solo se admite una base local desechable terminada en _pruebas.');
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: conexion.toString() });
  try {
    const usuario = { id: (await pool.query('SELECT id_usuario::text FROM usuario ORDER BY id_usuario LIMIT 1')).rows[0].id_usuario };
    const opciones = (await pool.query('SELECT id_opcion FROM opcion_paquete WHERE activo=1 LIMIT 2')).rows;
    assert.equal(opciones.length, 2, 'La copia necesita dos platos activos.');
    const marca = randomUUID();
    const proveedor = (await pool.query('INSERT INTO proveedor(identificacion,razon_social) VALUES($1,$2) RETURNING id_proveedor::text', [marca.slice(0, 30), 'Prueba cocina'])).rows[0].id_proveedor;
    const insumo = (await pool.query("INSERT INTO insumo(codigo,nombre,unidad_base,stock_minimo) VALUES($1,'Ingrediente prueba','G',0) RETURNING id_insumo::text", [marca])).rows[0].id_insumo;
    for (const opcion of opciones) await guardarReceta(pool, { idOpcion: opcion.id_opcion, ingredientes: [{ idInsumo: insumo, cantidad: '0.3' }] }, usuario);
    const datosCompra = { idInsumo: insumo, cantidad: '0.9', precioUnitario: '0.1234', idProveedor: proveedor, codigoLote: marca, referencia: `compra-${marca}` };
    const compras = await Promise.all([registrarCompra(pool, datosCompra, usuario), registrarCompra(pool, datosCompra, usuario)]);
    assert.equal(compras[0].idCompra, compras[1].idCompra);
    await assert.rejects(registrarCompra(pool, { ...datosCompra, cantidad: '1' }, usuario));
    let cocina = await consultarCocina(pool);
    assert.equal(cocina.recetas.find(r => r.idOpcion === opciones[0].id_opcion).capacidad, '3');
    const plan = await planificarCocina(pool, { platos: opciones.map(o => ({ idOpcion: o.id_opcion, porciones: 2 })) });
    assert.equal(plan.listo, false);
    assert.equal(plan.ingredientes[0].faltante, '0.300000');
    const produccion = { idOpcion: opciones[0].id_opcion, porciones: 2, referencia: `prod-${marca}` };
    const resultados = await Promise.all([registrarProduccion(pool, produccion, usuario), registrarProduccion(pool, produccion, usuario)]);
    assert.deepEqual(resultados[0], resultados[1]);
    await assert.rejects(registrarProduccion(pool, { ...produccion, porciones: 2, referencia: `faltante-${marca}` }, usuario));
    cocina = await consultarCocina(pool);
    assert.equal(cocina.ingredientes.find(i => i.id === insumo).stock, '0.300000');
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM operacion_cocina WHERE referencia=$1', [`faltante-${marca}`])).rows[0].n, 0);
    await pool.query('UPDATE lote_insumo SET bloqueado=1 WHERE id_lote=$1', [compras[0].idLote]);
    assert.equal((await consultarCocina(pool)).recetas.find(r => r.idOpcion === opciones[0].id_opcion).capacidad, '0');
    await pool.query('UPDATE lote_insumo SET bloqueado=0,fecha_ingreso=CURRENT_DATE-1,fecha_vencimiento=CURRENT_DATE-1 WHERE id_lote=$1', [compras[0].idLote]);
    assert.equal((await consultarCocina(pool)).recetas.find(r => r.idOpcion === opciones[0].id_opcion).capacidad, '0');
    await assert.rejects(registrarCompra(pool, { ...datosCompra, fechaVencimiento: '2026-02-30', referencia: `fecha-${marca}` }, usuario));
    await assert.rejects(registrarCompra(pool, { ...datosCompra, fechaVencimiento: '2000-01-01', referencia: `vencido-${marca}` }, usuario));
    await pool.query('UPDATE insumo SET activo=0 WHERE id_insumo=$1', [insumo]);
    assert.equal((await consultarCocina(pool)).recetas.find(r => r.idOpcion === opciones[0].id_opcion).capacidad, null);
  } finally { await pool.end(); }
});
