import { randomUUID } from 'node:crypto';
import { capacidad, decimal, formato, planificar, porciones } from '../lib/cocina.js';
import { SolicitudInvalida } from '../modelos/solicitud-invalida.js';

const saldo = `COALESCE((SELECT SUM(CASE WHEN k.tipo IN ('ENTRADA','AJUSTE_E') THEN k.cantidad ELSE -k.cantidad END) FROM kardex k WHERE k.id_lote=l.id_lote),0)`;
const vigentes = `l.bloqueado=0 AND (l.fecha_vencimiento IS NULL OR l.fecha_vencimiento>=CURRENT_DATE) AND
  (l.fecha_vencimiento IS NOT NULL OR EXISTS(SELECT 1 FROM insumo vi WHERE vi.id_insumo=l.id_insumo AND vi.requiere_vencimiento=0))`;
function texto(valor, maximo, nombre) {
  if (typeof valor !== 'string' || !valor.trim() || valor.length > maximo) throw new SolicitudInvalida(`${nombre} inválido.`);
  return valor.trim();
}
function id(valor) {
  if (!/^[1-9]\d{0,17}$/.test(String(valor))) throw new SolicitudInvalida('Identificador inválido.');
  return String(valor);
}
async function transaccion(pool, accion) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    // Serializa las escrituras de inventario y recetas; evita cálculos sobre saldos simultáneos.
    await cliente.query('SELECT pg_advisory_xact_lock(7250419)');
    const resultado = await accion(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK');
    if (error.code === '23505') throw new SolicitudInvalida('El lote o la referencia ya existe.');
    if (error.code === '23503' || error.code === '23514') throw new SolicitudInvalida('Los datos no cumplen las restricciones del inventario.');
    throw error;
  } finally { cliente.release(); }
}
async function auditada(pool, tipo, datos, usuario, accion) {
  const referencia = texto(datos?.referencia, 80, 'Referencia');
  return transaccion(pool, async cliente => {
    const previa = (await cliente.query('SELECT tipo,resultado,datos=$2::jsonb AS igual FROM operacion_cocina WHERE referencia=$1', [referencia, JSON.stringify(datos)])).rows[0];
    if (previa) {
      if (previa.tipo !== tipo || !previa.igual) throw new SolicitudInvalida('La referencia pertenece a otra operación.');
      return previa.resultado;
    }
    const resultado = await accion(cliente);
    await cliente.query('INSERT INTO operacion_cocina(referencia,tipo,id_usuario,datos,resultado) VALUES($1,$2,$3,$4,$5)', [referencia, tipo, id(usuario?.id), JSON.stringify(datos), JSON.stringify(resultado)]);
    return resultado;
  });
}

export async function consultarCocina(pool) {
  const ingredientes = (await pool.query(`SELECT i.id_insumo::text AS id,i.nombre,i.unidad_base AS unidad,i.activo, COALESCE((SELECT SUM(${saldo}) FROM lote_insumo l WHERE l.id_insumo=i.id_insumo AND ${vigentes}),0)::text AS stock FROM insumo i ORDER BY i.nombre`)).rows.map(i => ({ ...i, activo: i.activo === 1 }));
  const componentes = (await pool.query('SELECT id_opcion,id_insumo::text,cantidad_por_persona::text AS cantidad FROM composicion_opcion')).rows;
  const recetas = (await pool.query('SELECT x.id_opcion,x.nombre,x.activo,x.composicion_lista,x.tipo,p.nombre AS paquete,t.nombre AS "tipoComida" FROM opcion_paquete x JOIN paquete p USING(id_paquete) JOIN tipo_comida t USING(id_tipo_comida) ORDER BY p.nombre,t.id_tipo_comida,x.nombre')).rows.map(r => {
    const componentesReceta = componentes.filter(c => c.id_opcion === r.id_opcion).map(c => {
      const ingrediente = ingredientes.find(i => i.id === c.id_insumo);
      return { idInsumo: c.id_insumo, nombre: ingrediente.nombre, unidad: ingrediente.unidad, stock: ingrediente.stock, activo: ingrediente.activo, cantidad: c.cantidad };
    });
    const disponibles = capacidad(componentesReceta, r.composicion_lista === 1 && r.activo === 1);
    return { idOpcion: r.id_opcion, nombre: r.nombre, paquete:r.paquete,tipoComida:r.tipoComida,tipo:r.tipo, activo: r.activo === 1, ingredientes: componentesReceta, capacidad: disponibles, listo: disponibles !== null && BigInt(disponibles) > 0n };
  });
  const proveedores = (await pool.query('SELECT id_proveedor::text AS id,razon_social AS nombre FROM proveedor WHERE activo=1 ORDER BY razon_social')).rows;
  const paquetes=(await pool.query('SELECT id_paquete AS id,nombre FROM paquete WHERE activo=1 ORDER BY nombre')).rows;
  const tiposComida=(await pool.query('SELECT id_tipo_comida::text AS id,nombre FROM tipo_comida WHERE activo=1 ORDER BY id_tipo_comida')).rows;
  return { ingredientes, recetas, proveedores,paquetes,tiposComida };
}

export async function crearPlato(pool,datos,usuario) {
  const paquete=texto(datos?.idPaquete,80,'Paquete'),tipoComida=id(datos?.idTipoComida);
  const nombre=texto(datos?.nombre,180,'Nombre del plato');
  if(!['MENU','EXTRA'].includes(datos?.tipo))throw new SolicitudInvalida('Selecciona plato o complemento.');
  if(!Number.isSafeInteger(datos?.precioAdicionalCentavos)||datos.precioAdicionalCentavos<0||datos.precioAdicionalCentavos>10000000)throw new SolicitudInvalida('El precio adicional debe ser un entero en centavos válido.');
  const alergenos=datos.alergenos?texto(datos.alergenos,2000,'Alérgenos'):null;
  return transaccion(pool,async db=>{
    const {rows:[oferta]}=await db.query(`SELECT p.id_paquete,t.codigo FROM paquete p JOIN paquete_tipo_comida o USING(id_paquete) JOIN tipo_comida t USING(id_tipo_comida)
      WHERE p.id_paquete=$1 AND o.id_tipo_comida=$2 AND p.activo=1 AND o.activo=1 AND t.activo=1 FOR UPDATE OF p,o`,[paquete,tipoComida]);
    if(!oferta)throw new SolicitudInvalida('Primero configura una oferta activa de este paquete y tipo de comida en Tablas avanzadas.');
    const codigo=randomUUID(),idOpcion=paquete+'/'+oferta.codigo+'/'+datos.tipo+'/'+codigo;
    const {rows:[conteo]}=await db.query('SELECT COUNT(*)::int AS n FROM opcion_paquete WHERE id_paquete=$1 AND id_tipo_comida=$2 AND tipo=$3 AND activo=1',[paquete,tipoComida,datos.tipo]);
    if(conteo.n>=50)throw new SolicitudInvalida('Esta oferta admite hasta 50 platos de cada tipo; retira uno antes de añadir otro.');
    await db.query(`INSERT INTO opcion_paquete(id_opcion,id_paquete,id_tipo_comida,codigo,tipo,nombre,precio_adicional_centavos,alergenos_declarados)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[idOpcion,paquete,tipoComida,codigo,datos.tipo,nombre,datos.precioAdicionalCentavos,alergenos]);
    await db.query('INSERT INTO operacion_cocina(referencia,tipo,id_usuario,datos,resultado) VALUES($1,$2,$3,$4,$5)',[randomUUID(),'PLATO',id(usuario.id),JSON.stringify({idOpcion,nombre}),JSON.stringify({creado:true})]);
    return {idOpcion,creado:true,recetaPendiente:true};
  });
}

export async function guardarReceta(pool, datos, usuario) {
  const opcion = texto(datos?.idOpcion, 200, 'Plato');
  if (!Array.isArray(datos?.ingredientes) || datos.ingredientes.length > 200) throw new SolicitudInvalida('Lista de ingredientes inválida.');
  const ingredientes = datos.ingredientes.map(i => ({ id: id(i.idInsumo), cantidad: formato(decimal(i.cantidad)) }));
  if (new Set(ingredientes.map(i => i.id)).size !== ingredientes.length) throw new SolicitudInvalida('Un ingrediente está repetido.');
  return transaccion(pool, async cliente => {
    if (!(await cliente.query('SELECT id_opcion FROM opcion_paquete WHERE id_opcion=$1 FOR UPDATE', [opcion])).rowCount) throw new SolicitudInvalida('El plato no existe.');
    for (const ingrediente of ingredientes) {
      const insumo = (await cliente.query('SELECT unidad_base FROM insumo WHERE id_insumo=$1 AND activo=1 FOR UPDATE', [ingrediente.id])).rows[0];
      if (!insumo) throw new SolicitudInvalida('Un ingrediente no existe o está inactivo.');
      if (!['G', 'ML', 'UNIDAD'].includes(insumo.unidad_base)) throw new SolicitudInvalida('Revisa la unidad del ingrediente: se admiten G, ML y UNIDAD.');
    }
    await cliente.query('DELETE FROM composicion_opcion WHERE id_opcion=$1', [opcion]);
    for (const ingrediente of ingredientes) await cliente.query('INSERT INTO composicion_opcion VALUES($1,$2,$3)', [opcion, ingrediente.id, ingrediente.cantidad]);
    await cliente.query('UPDATE opcion_paquete SET composicion_lista=$2 WHERE id_opcion=$1', [opcion, ingredientes.length ? 1 : 0]);
    const resultado = { idOpcion: opcion, guardado: true, pendiente: !ingredientes.length };
    await cliente.query('INSERT INTO operacion_cocina(referencia,tipo,id_usuario,datos,resultado) VALUES($1,$2,$3,$4,$5)', [randomUUID(), 'RECETA', id(usuario?.id), JSON.stringify(datos), JSON.stringify(resultado)]);
    return resultado;
  });
}

export async function registrarCompra(pool, datos, usuario) {
  const insumo = id(datos?.idInsumo), proveedor = id(datos?.idProveedor);
  const cantidad = formato(decimal(datos?.cantidad)), precio = formato(decimal(datos?.precioUnitario, 4, true), 4);
  const lote = texto(datos?.codigoLote, 100, 'Lote');
  const vencimiento = datos?.fechaVencimiento || null;
  const fecha = vencimiento === null ? null : new Date(`${vencimiento}T00:00:00Z`);
  if (vencimiento !== null && (typeof vencimiento !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(vencimiento) || !Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== vencimiento)) throw new SolicitudInvalida('Fecha de vencimiento inválida.');
  return auditada(pool, 'COMPRA', datos, usuario, async cliente => {
    const ingrediente = (await cliente.query('SELECT * FROM insumo WHERE id_insumo=$1 AND activo=1 FOR UPDATE', [insumo])).rows[0];
    if (!ingrediente) throw new SolicitudInvalida('El ingrediente no existe o está inactivo.');
    if (!['G', 'ML', 'UNIDAD'].includes(ingrediente.unidad_base)) throw new SolicitudInvalida('Revisa la unidad del ingrediente: se admiten G, ML y UNIDAD.');
    if (ingrediente.requiere_vencimiento && !vencimiento) throw new SolicitudInvalida('Este ingrediente requiere fecha de vencimiento.');
    if (!(await cliente.query('SELECT id_proveedor FROM proveedor WHERE id_proveedor=$1 AND activo=1 FOR UPDATE', [proveedor])).rowCount) throw new SolicitudInvalida('El proveedor no está activo.');
    if (vencimiento && !(await cliente.query('SELECT $1::date>=CURRENT_DATE AS valido', [vencimiento])).rows[0].valido) throw new SolicitudInvalida('El lote ya está vencido.');
    const compra = (await cliente.query("INSERT INTO compra(numero,id_proveedor,id_creado_por,fecha,estado) VALUES($1,$2,$3,CURRENT_DATE,'RECIBIDA') RETURNING id_compra::text", [`CO-${randomUUID()}`, proveedor, id(usuario?.id)])).rows[0].id_compra;
    const detalle = (await cliente.query('INSERT INTO detalle_compra(id_compra,id_insumo,cantidad_base,precio_unitario_base) VALUES($1,$2,$3,$4) RETURNING id_detalle_compra', [compra, insumo, cantidad, precio])).rows[0].id_detalle_compra;
    const recepcion = (await cliente.query('INSERT INTO recepcion_compra(id_compra,id_recibido_por,numero_guia) VALUES($1,$2,$3) RETURNING id_recepcion', [compra, usuario.id, datos.referencia])).rows[0].id_recepcion;
    const idLote = (await cliente.query('INSERT INTO lote_insumo(id_insumo,codigo_lote,id_proveedor,fecha_ingreso,fecha_vencimiento) VALUES($1,$2,$3,CURRENT_DATE,$4) RETURNING id_lote::text', [insumo, lote, proveedor, vencimiento])).rows[0].id_lote;
    await cliente.query("INSERT INTO kardex(id_lote,id_usuario,id_recepcion,id_detalle_compra,tipo,cantidad,motivo) VALUES($1,$2,$3,$4,'ENTRADA',$5,$6)", [idLote, usuario.id, recepcion, detalle, cantidad, `Compra ${datos.referencia}`]);
    return { idCompra: compra, idLote, cantidad, registrado: true };
  });
}

export async function planificarCocina(pool, datos) {
  return planificar((await consultarCocina(pool)).recetas, datos?.platos);
}

export async function registrarProduccion(pool, datos, usuario) {
  const opcion = texto(datos?.idOpcion, 200, 'Plato');
  porciones(datos?.porciones);
  return auditada(pool, 'PRODUCCION', datos, usuario, async cliente => {
    await cliente.query('SELECT id_opcion FROM opcion_paquete WHERE id_opcion=$1 FOR UPDATE', [opcion]);
    const estado = await consultarCocina(cliente);
    const plan = planificar(estado.recetas, [{ idOpcion: opcion, porciones: datos.porciones }]);
    if (!plan.listo) throw new SolicitudInvalida('No hay existencias suficientes para preparar las porciones.');
    for (const ingrediente of plan.ingredientes) {
      await cliente.query('SELECT id_insumo FROM insumo WHERE id_insumo=$1 FOR UPDATE', [ingrediente.idInsumo]);
      const lotes = (await cliente.query(`SELECT l.id_lote,${saldo}::text AS stock FROM lote_insumo l WHERE l.id_insumo=$1 AND ${vigentes} ORDER BY l.fecha_vencimiento NULLS LAST,l.fecha_ingreso,l.id_lote FOR UPDATE OF l`, [ingrediente.idInsumo])).rows;
      let restante = decimal(ingrediente.necesario, 6, false, 40);
      for (const lote of lotes) {
        const disponible = decimal(lote.stock, 6, true);
        const consumir = disponible < restante ? disponible : restante;
        if (consumir > 0n) await cliente.query("INSERT INTO kardex(id_lote,id_usuario,tipo,cantidad,motivo) VALUES($1,$2,'AJUSTE_S',$3,$4)", [lote.id_lote, usuario.id, formato(consumir), `Producción ${opcion} (${datos.porciones} porciones), ${datos.referencia}`.slice(0, 500)]);
        restante -= consumir;
        if (restante === 0n) break;
      }
      if (restante > 0n) throw new SolicitudInvalida('El stock cambió; vuelve a consultar la capacidad.');
    }
    return { idOpcion: opcion, porciones: String(datos.porciones), registrado: true };
  });
}
