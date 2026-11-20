import { ESTADOS, cambiarEstadoSolicitud, listarClientes, listarSolicitudes, resumenSolicitudes, solicitudesDeCliente } from "../repositorios/admin.js";
import { pagarSolicitudCliente } from "../repositorios/admin.js";
import { SolicitudInvalida } from "../modelos/solicitud-invalida.js";
import { actualizarPaquete, borrarPaquete, crearPaquete } from "../repositorios/catalogo.js";
import { catalogoAdmin } from "../modelos/catalogo.js";

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
  const fila = await cambiarEstadoSolicitud(pool, identificador, codigo, usuario.id);
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
  const imagenAlt = textoPaquete(datos?.imagenAlt, "El texto alternativo", 3, 240);
  const etiqueta = textoPaquete(datos?.etiqueta, "La etiqueta", 2, 80);
  const activo = datos?.activo ? 1 : 0;
  const mostrarInicio = datos?.mostrarInicio ? 1 : 0;
  const ordenInicio = Number.isInteger(datos?.ordenInicio) ? datos.ordenInicio : 100;
  if (ordenInicio < 0 || ordenInicio > 100000) {
    throw new SolicitudInvalida("El orden debe estar entre 0 y 100000.");
  }
  const tipoComida = ["DESAYUNO", "ALMUERZO", "MERIENDA"].includes(datos?.tipoComida) ? datos.tipoComida : null;
  const precioCentavos = Number.isInteger(datos?.precioCentavos) ? datos.precioCentavos : 0;
  const minPersonas = Number.isInteger(datos?.minPersonas) ? datos.minPersonas : 10;
  const maxPersonas = Number.isInteger(datos?.maxPersonas) ? datos.maxPersonas : 500;
  if (precioCentavos < 0 || minPersonas < 1 || maxPersonas < minPersonas) {
    throw new SolicitudInvalida("Revisa el precio y los límites de personas del producto.");
  }
  return { id, servicioId, nombre, descripcion, imagen, imagenAlt, etiqueta, activo, mostrarInicio, ordenInicio,
    tipoComida, precioCentavos, minPersonas, maxPersonas };
}

export async function crearProducto(pool, datos) {
  const paquete = validarPaquete(datos, true);
  try {
    await crearPaquete(pool, paquete);
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
    fila = await actualizarPaquete(pool, identificador, paquete);
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
  const fila = await borrarPaquete(pool, identificador);
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
