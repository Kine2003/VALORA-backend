import { ESTADOS, cambiarEstadoSolicitud, listarClientes, listarSolicitudes, resumenSolicitudes, solicitudesDeCliente } from "../repositorios/admin.js";
import { pagarSolicitudCliente } from "../repositorios/admin.js";
import { SolicitudInvalida } from "../modelos/solicitud-invalida.js";
import { actualizarPaquete, borrarPaquete, crearPaquete } from "../repositorios/catalogo.js";
import { catalogoAdmin } from "../modelos/catalogo.js";
import { transaccion } from '../datos/postgres.js';
import { validarValor,auditar } from './gestion.js';

export async function resumenAdmin(pool) {
  const [resumen, recientes] = await Promise.all([
    resumenSolicitudes(pool),
    listarSolicitudes(pool, 5),
  ]);
  return { ...resumen, recientes };
}

export async function solicitudesAdmin(pool) {
  return { solicitudes: await listarSolicitudes(pool) };
}

export async function clientesAdmin(pool) {
  return { clientes: await listarClientes(pool) };
}

export async function solicitudesCuenta(pool, usuario) {
  return {
    solicitudes: await solicitudesDeCliente(pool, {
      idUsuario: usuario.id,
      correo: usuario.correo,
    }),
  };
}

export async function actualizarEstado(pool, id, estado, usuario) {
  const identificador = String(id ?? "");
  if (!/^\d+$/u.test(identificador)) throw new SolicitudInvalida("La solicitud indicada no es válida.");
  const codigo = String(estado ?? "").trim().toUpperCase();
  if (!ESTADOS.includes(codigo)) throw new SolicitudInvalida("Selecciona un estado válido para la solicitud.");
  const fila = await transaccion(pool,async db=>{
    const {rows:[actual]}=await db.query('SELECT estado FROM solicitud WHERE id_solicitud=$1 FOR UPDATE',[identificador]);
    if(!actual)return null;
    if(['ENTREGADA','CANCELADA','RECHAZADA'].includes(actual.estado)&&actual.estado!==codigo)throw new SolicitudInvalida('Una solicitud finalizada conserva su estado.');
    const resultado=await cambiarEstadoSolicitud(db,identificador,codigo,usuario.id);
    await auditar(db,usuario,'solicitud','ESTADO',{id_solicitud:identificador,anterior:actual.estado,nuevo:codigo});return resultado;
  });
  if (!fila) throw new SolicitudInvalida("La solicitud ya no existe.");
  return { id: String(fila.id_solicitud), estado: fila.estado };
}

export async function catalogoAdministrable(pool) {
  return catalogoAdmin(pool);
}

function textoPaquete(valor, nombre, minimo, maximo) {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (texto.length < minimo || texto.length > maximo) {
    throw new SolicitudInvalida(`${nombre} debe tener entre ${minimo} y ${maximo} caracteres.`);
  }
  return texto;
}

function validarPaquete(datos, nuevo = false) {
  const id = typeof datos?.id === "string" ? datos.id.trim().toLowerCase() : "";
  if (nuevo && !/^[a-z0-9][a-z0-9-]{2,79}$/u.test(id)) {
    throw new SolicitudInvalida("El identificador debe usar letras minúsculas, números o guiones.");
  }
  const servicioId = textoPaquete(datos?.servicioId, "El servicio", 1, 80);
  const nombre = textoPaquete(datos?.nombre, "El nombre", 3, 160);
  const descripcion = textoPaquete(datos?.descripcion, "La descripción", 10, 2000);
  const imagen = textoPaquete(datos?.imagen, "La URL de imagen", 1, 1000);
  validarValor({nombre:'imagen',tipo:'text',longitud:1000},imagen);
  const imagenAlt = textoPaquete(datos?.imagenAlt, "El texto alternativo", 3, 240);
  const etiqueta = textoPaquete(datos?.etiqueta, "La etiqueta", 2, 80);
  if(![true,false,0,1].includes(datos?.activo)||![true,false,0,1].includes(datos?.mostrarInicio))throw new SolicitudInvalida('La visibilidad y el estado deben ser indicadores válidos.');
  const activo = Number(datos.activo);
  const mostrarInicio = Number(datos.mostrarInicio);
  const ordenInicio = Number.isInteger(datos?.ordenInicio) ? datos.ordenInicio : 100;
  if (ordenInicio < 0 || ordenInicio > 100000) {
    throw new SolicitudInvalida("El orden debe estar entre 0 y 100000.");
  }
  const tipoComida = ["DESAYUNO", "ALMUERZO", "MERIENDA"].includes(datos?.tipoComida) ? datos.tipoComida : null;
  const precioCentavos = Number.isInteger(datos?.precioCentavos) ? datos.precioCentavos : 0;
  const minPersonas = Number.isInteger(datos?.minPersonas) ? datos.minPersonas : 10;
  const maxPersonas = Number.isInteger(datos?.maxPersonas) ? datos.maxPersonas : 500;
  if (![datos?.precioCentavos??0,datos?.minPersonas??10,datos?.maxPersonas??500].every(Number.isSafeInteger) || precioCentavos < 0 || precioCentavos>10000000 || minPersonas < 1 || maxPersonas < minPersonas || maxPersonas>100000) {
    throw new SolicitudInvalida("Revisa el precio y los límites de personas del producto.");
  }
  return { id, servicioId, nombre, descripcion, imagen, imagenAlt, etiqueta, activo, mostrarInicio, ordenInicio,
    tipoComida, precioCentavos, minPersonas, maxPersonas };
}

export async function crearProducto(pool, datos) {
  const paquete = validarPaquete(datos, true);
  try {
    await transaccion(pool,async db=>{await db.query('SELECT pg_advisory_xact_lock(7250419)');return crearPaquete(db,paquete);});
  } catch (error) {
    if (error.message === "SERVICIO_INEXISTENTE") {
      throw new SolicitudInvalida("El servicio seleccionado ya no está disponible.");
    }
    if (error.code === "23505") throw new SolicitudInvalida("Ya existe un producto con ese identificador.");
    throw error;
  }
  return { creado: true, id: paquete.id };
}

export async function editarProducto(pool, id, datos) {
  const identificador = String(id ?? "").trim();
  if (!identificador) throw new SolicitudInvalida("El producto indicado no es válido.");
  const paquete = validarPaquete({ ...datos, id: identificador }, false);
  let fila;
  try {
    fila = await transaccion(pool,async db=>{await db.query('SELECT pg_advisory_xact_lock(7250419)');return actualizarPaquete(db,identificador,paquete);});
  } catch (error) {
    if (error.message === "SERVICIO_INEXISTENTE") {
      throw new SolicitudInvalida("El servicio seleccionado ya no está disponible.");
    }
    throw error;
  }
  if (!fila) throw new SolicitudInvalida("El producto ya no existe.");
  return { id: identificador, activo: Boolean(fila.activo), mostrarInicio: Boolean(fila.mostrarInicio) };
}

export async function eliminarProducto(pool, id) {
  const identificador = String(id ?? "").trim();
  const fila = await transaccion(pool,db=>borrarPaquete(db,identificador));
  if (!fila) throw new SolicitudInvalida("El producto ya no existe.");
  return { id: identificador, activo: false, mostrarInicio: false };
}

export async function pagarOrdenCliente(pool, usuario, id, metodo) {
  const identificador = String(id ?? "");
  if (!/^\d+$/u.test(identificador)) throw new SolicitudInvalida("La orden indicada no es válida.");
  if (!["TRANSFERENCIA", "TARJETA", "EFECTIVO"].includes(String(metodo ?? "").toUpperCase())) {
    throw new SolicitudInvalida("Selecciona un método de pago válido.");
  }
  const metodoNormalizado = String(metodo).toUpperCase();
  const {rows:[actual]}=await pool.query('SELECT s.estado,s.estado_pago FROM solicitud s JOIN cliente c USING(id_cliente) WHERE s.id_solicitud=$1 AND c.id_usuario=$2',[identificador,usuario.id]);
  if(!actual||['CANCELADA','RECHAZADA','ENTREGADA'].includes(actual.estado)||actual.estado_pago==='PAGADO')throw new SolicitudInvalida('Esta orden no admite registrar otro pago.');
  if (metodoNormalizado !== "EFECTIVO" &&
      process.env.NODE_ENV === "production" &&
      process.env.PAGO_SIMULADO !== "true") {
    throw new SolicitudInvalida("Los pagos electrónicos requieren integración real con un proveedor.");
  }
  const fila = await pagarSolicitudCliente(pool, identificador, usuario.id, usuario.correo,
    metodoNormalizado);
  if (!fila) throw new SolicitudInvalida("La orden ya no existe o no pertenece a esta cuenta.");
  return {
    id: String(fila.id_solicitud),
    estado: fila.estado,
    estadoPago: fila.estado_pago,
    metodoPago: fila.metodo_pago,
  };
}
