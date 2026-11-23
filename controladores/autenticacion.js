import { errorAuth } from "../servicios/autenticacion.js";
import { leerToken, leerCookie, cookiesSesion } from "../lib/autorizacion.js";
const contexto = (peticion) => ({ ip: peticion?.socket?.remoteAddress });
function entregar(resultado, respuesta) {
  if (!respuesta?.setHeader)
    throw new Error("Falta respuesta HTTP para entregar cookies de sesión.");
  respuesta.setHeader(
    "Set-Cookie",
    cookiesSesion(resultado.token, resultado.refresh),
  );
  respuesta.setHeader("Cache-Control", "no-store");
  return { usuario: resultado.usuario };
}
export async function recibirLogin(
  api,
  datos,
  peticion,
  _usuario,
  _parametros,
  respuesta,
) {
  return entregar(
    await api.iniciarSesion(datos, contexto(peticion)),
    respuesta,
  );
}
export async function recibirRegistro(
  api,
  datos,
  peticion,
  _usuario,
  _parametros,
  respuesta,
) {
  return entregar(
    await api.registrarCliente(datos, contexto(peticion)),
    respuesta,
  );
}
export async function consultarSesion(api, _datos, peticion) {
  const usuario = await api.obtenerSesion(leerToken(peticion));
  if (!usuario) throw errorAuth("Inicia sesión para continuar.", 401);
  return usuario;
}
export async function cerrarSesion(
  api,
  _datos,
  peticion,
  _usuario,
  _parametros,
  respuesta,
) {
  const resultado = await api.cerrarSesion(
    leerToken(peticion),
    leerCookie(peticion, "valora_refresh"),
  );
  respuesta.setHeader("Set-Cookie", cookiesSesion("", "", true));
  respuesta.setHeader("Cache-Control", "no-store");
  return resultado;
}
export async function renovarSesion(
  api,
  _datos,
  peticion,
  _usuario,
  _parametros,
  respuesta,
) {
  return entregar(
    await api.renovarSesion(leerCookie(peticion, "valora_refresh")),
    respuesta,
  );
}
