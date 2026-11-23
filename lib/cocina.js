import { SolicitudInvalida } from '../modelos/solicitud-invalida.js';

export function decimal(valor, escala = 6, cero = false, digitosEnteros = 14 - escala) {
  if (!['string', 'number'].includes(typeof valor)) throw new SolicitudInvalida('Cantidad inválida.');
  const texto = String(valor);
  if (!new RegExp(`^\\d{1,${digitosEnteros}}(?:\\.\\d{1,${escala}})?$`).test(texto)) throw new SolicitudInvalida('Cantidad fuera de rango o precisión.');
  const [entero, fraccion = ''] = texto.split('.');
  const numero = BigInt(entero) * 10n ** BigInt(escala) + BigInt(fraccion.padEnd(escala, '0'));
  if (numero === 0n && !cero) throw new SolicitudInvalida('La cantidad debe ser mayor que cero.');
  return numero;
}

export function formato(numero, escala = 6) {
  const signo = numero < 0n ? '-' : '';
  const texto = (numero < 0n ? -numero : numero).toString().padStart(escala + 1, '0');
  return `${signo}${texto.slice(0, -escala)}.${texto.slice(-escala)}`;
}

export function porciones(valor) {
  if (!/^[1-9]\d{0,5}$/.test(String(valor))) throw new SolicitudInvalida('Las porciones deben ser un entero entre 1 y 999999.');
  return BigInt(valor);
}

export function capacidad(ingredientes, lista = true) {
  if (!lista || !ingredientes.length || ingredientes.some(i => !i.activo || (i.unidad && !['G', 'ML', 'UNIDAD'].includes(i.unidad)))) return null;
  return ingredientes.reduce((menor, i) => {
    const actual = decimal(i.stock, 6, true, 40) / decimal(i.cantidad);
    return menor === null || actual < menor ? actual : menor;
  }, null).toString();
}

export function planificar(recetas, platos) {
  if (!Array.isArray(platos) || !platos.length || platos.length > 200) throw new SolicitudInvalida('Selecciona entre 1 y 200 platos.');
  const necesidades = new Map();
  for (const plato of platos) {
    const receta = recetas.find(r => r.idOpcion === plato.idOpcion);
    if (!receta?.activo || receta.capacidad === null) throw new SolicitudInvalida('El plato está inactivo o su receta está pendiente.');
    const cantidad = porciones(plato.porciones);
    for (const ingrediente of receta.ingredientes) {
      const anterior = necesidades.get(ingrediente.idInsumo);
      necesidades.set(ingrediente.idInsumo, { ...ingrediente, necesario: (anterior?.necesario ?? 0n) + decimal(ingrediente.cantidad) * cantidad });
    }
  }
  const ingredientes = [...necesidades.values()].map(i => {
    const falta = i.necesario - decimal(i.stock, 6, true, 40);
    return { idInsumo: i.idInsumo, nombre: i.nombre, unidad: i.unidad, stock: i.stock, necesario: formato(i.necesario), faltante: formato(falta > 0n ? falta : 0n) };
  });
  return { listo: ingredientes.every(i => i.faltante === '0.000000'), ingredientes, advertencia: 'Las capacidades individuales comparten inventario. Este plan suma todos los ingredientes.' };
}
