import { leerToken } from "../lib/autorizacion.js";

export function recibirLogin(api, datos) {
  return api.iniciarSesion(datos);
}

export function recibirRegistro(api, datos) {
  return api.registrarCliente(datos);
}

export function consultarSesion(api, _datos, peticion) {
  return api.obtenerSesion(leerToken(peticion));
}

export function cerrarSesion(api, _datos, peticion) {
  return api.cerrarSesion(leerToken(peticion));
}
