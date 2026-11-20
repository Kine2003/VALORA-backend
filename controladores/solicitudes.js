import { MAX_LINEAS, validarCliente } from "../lib/cart.js";
import { obtenerErrorCampo } from "../lib/solicitud.js";
import { SolicitudInvalida } from "../modelos/solicitud-invalida.js";

const reglasCotizacion = {
  nombre: ["nombre", true, 3, 100],
  empresa: ["empresa", true, 2, 120],
  correo: ["correo", true, 0, 160],
  telefono: ["telefono", true, 9, 25],
  servicio: ["servicio", true, 1, 80],
  mensaje: ["mensaje", true, 20, 1200],
  tipoComida: ["tipo-comida", false, 0, 15],
  personas: ["personas", false, 0, 6],
  fecha: ["fecha", false, 0, 10],
};

const texto = valor => typeof valor === "string" ? valor.trim() : "";

function validarCotizacion(datos) {
  return Object.fromEntries(Object.entries(reglasCotizacion).map(([campo, [id, required, minLength, maxLength]]) => {
    const value = texto(datos?.[campo]);
    const error = obtenerErrorCampo({ id, required, minLength, maxLength, value, validity: {} });
    if (error) throw new SolicitudInvalida(error);
    return [campo, value];
  }));
}

function validarPedido(datos) {
  const contacto = Object.fromEntries(
    ["nombre", "correo", "telefono", "fecha", "hora", "entrega", "direccion", "notas"]
      .map(campo => [campo, texto(datos?.contacto?.[campo])]),
  );
  const [error] = Object.values(validarCliente(contacto));
  if (error) throw new SolicitudInvalida(error);
  if (new Date(contacto.fecha + "T" + contacto.hora).getTime() <= Date.now()) {
    throw new SolicitudInvalida("Elige una fecha y hora futuras para tu evento.");
  }
  const lineas = datos?.lineas;
  if (!Array.isArray(lineas) || !lineas.length || lineas.length > MAX_LINEAS || lineas.some(linea => !linea || typeof linea !== "object")) {
    throw new SolicitudInvalida("Agrega entre 1 y 12 paquetes válidos.");
  }
  return { contacto, lineas };
}

export function recibirCotizacion(api, datos, _peticion, usuario) {
  return api.cotizar(validarCotizacion(datos), usuario?.id ?? null);
}

export function recibirPedido(api, datos, _peticion, usuario) {
  const { contacto, lineas } = validarPedido(datos);
  return api.guardarPedido(contacto, lineas, usuario?.id ?? null);
}
