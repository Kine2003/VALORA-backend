import { errorAuth } from "../servicios/autenticacion.js";
/** Ejecutar antes de procesar cualquier escritura de la API, incluido login. */
export function validarOrigen(peticion) {
  if (["GET", "HEAD", "OPTIONS"].includes(peticion.method)) return;
  const origen = peticion.headers.origin;
  const destino = process.env.APP_ORIGIN || process.env.FRONTEND_ORIGIN;
  const host = peticion.headers.host;
  const protocolo = process.env.NODE_ENV === "production" ? "https:" : "http:";
  const esperado = destino ? new URL(destino).origin : `${protocolo}//${host}`;
  if (
    peticion.headers["sec-fetch-site"] === "cross-site" ||
    !origen ||
    origen !== esperado
  )
    throw errorAuth("Origen de solicitud no permitido.", 403);
  if (
    !/^application\/json(?:\s*;|$)/iu.test(
      peticion.headers["content-type"] || "",
    )
  )
    throw errorAuth("Envía el cuerpo como application/json.", 415);
}
export function cabecerasSeguridad(respuesta) {
  respuesta.setHeader("Cache-Control", "no-store");
  if (process.env.NODE_ENV === "production")
    respuesta.setHeader("Strict-Transport-Security", "max-age=31536000");
}
