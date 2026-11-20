import { resolverVersion } from "../middleware/version-api.js";
import { json, leerJson } from "../middleware/json.js";
import { leerToken } from "../lib/autorizacion.js";
import { recibirCotizacion, recibirPedido } from "../controladores/solicitudes.js";
import { cerrarSesion, consultarSesion, recibirLogin, recibirRegistro } from "../controladores/autenticacion.js";
import {
  actualizarSolicitud,
  consultarClientes,
  consultarCuenta,
  consultarResumen,
  consultarSolicitudes,
  consultarCatalogoAdmin,
  crearProducto,
  editarProducto,
  eliminarProducto,
  pagarOrden,
} from "../controladores/admin.js";

const rutas = [
  ["/salud", { metodo: "GET", estado: 200, ejecutar: async api => {
    await api.salud();
    return { postgres: "conectado" };
  } }],
  ["/productos", { metodo: "GET", estado: 200, ejecutar: api => api.productos() }],
  ["/servicios", { metodo: "GET", estado: 200, ejecutar: api => api.servicios() }],
  ["/cotizaciones", { metodo: "POST", estado: 201, ejecutar: recibirCotizacion }],
  ["/pedidos", { metodo: "POST", estado: 201, autenticado: true, ejecutar: recibirPedido }],
  ["/auth/login", { metodo: "POST", estado: 200, ejecutar: recibirLogin }],
  ["/auth/registro", { metodo: "POST", estado: 201, ejecutar: recibirRegistro }],
  ["/auth/sesion", { metodo: "GET", estado: 200, ejecutar: consultarSesion }],
  ["/auth/logout", { metodo: "POST", estado: 200, ejecutar: cerrarSesion }],
  ["/cuenta/solicitudes", { metodo: "GET", estado: 200, autenticado: true, ejecutar: consultarCuenta }],
  ["/admin/resumen", { metodo: "GET", estado: 200, soloAdmin: true, ejecutar: consultarResumen }],
  ["/admin/solicitudes", { metodo: "GET", estado: 200, soloAdmin: true, ejecutar: consultarSolicitudes }],
  [/^\/admin\/solicitudes\/(\d+)$/u, { metodo: "PATCH", estado: 200, soloAdmin: true, ejecutar: actualizarSolicitud }],
  ["/admin/clientes", { metodo: "GET", estado: 200, soloAdmin: true, ejecutar: consultarClientes }],
  ["/admin/catalogo", { metodo: "GET", estado: 200, soloAdmin: true, ejecutar: consultarCatalogoAdmin }],
  ["/admin/catalogo", { metodo: "POST", estado: 201, soloAdmin: true, ejecutar: crearProducto }],
  [/^\/admin\/catalogo\/([a-z0-9-]+)$/u, { metodo: "PATCH", estado: 200, soloAdmin: true, ejecutar: editarProducto }],
  [/^\/admin\/catalogo\/([a-z0-9-]+)$/u, { metodo: "DELETE", estado: 200, soloAdmin: true, ejecutar: eliminarProducto }],
  [/^\/cuenta\/ordenes\/(\d+)\/pago$/u, { metodo: "POST", estado: 200, autenticado: true, ejecutar: pagarOrden }],
];

function coincidir([ruta, definicion], solicitada) {
  if (typeof ruta === "string") return ruta === solicitada ? { definicion, parametros: [] } : null;
  const coincidencia = ruta.exec(solicitada);
  return coincidencia ? { definicion, parametros: coincidencia.slice(1) } : null;
}

export async function atenderApi(peticion, respuesta, ruta, api) {
  const version = resolverVersion(ruta);
  if (!version) return false;
  if (version.error) {
    json(respuesta, 404, { error: version.error });
    return true;
  }

  const candidatas = rutas.map(par => coincidir(par, version.recurso)).filter(Boolean);
  if (!candidatas.length) {
    json(respuesta, 404, { error: "Ruta no encontrada." });
    return true;
  }

  const elegida = candidatas.find(({ definicion }) => definicion.metodo === peticion.method);
  if (!elegida) {
    respuesta.setHeader("Allow", [...new Set(candidatas.map(({ definicion }) => definicion.metodo))].join(", "));
    json(respuesta, 405, { error: "Método no permitido para esta ruta." });
    return true;
  }

  let usuario = null;
  const token = leerToken(peticion);
  if (token && api.obtenerSesion) usuario = await api.obtenerSesion(token);
  if (elegida.definicion.autenticado || elegida.definicion.soloAdmin) {
    if (!usuario) {
      json(respuesta, 401, { error: "Inicia sesión para continuar." });
      return true;
    }
    if (elegida.definicion.soloAdmin && !usuario.roles.includes("ADMINISTRADOR")) {
      json(respuesta, 403, { error: "Esta sección requiere una cuenta de administrador." });
      return true;
    }
  }

  const conCuerpo = peticion.method === "POST" || peticion.method === "PATCH";
  const datos = conCuerpo ? await leerJson(peticion) : undefined;
  const cuerpo = await elegida.definicion.ejecutar(api, datos, peticion, usuario, elegida.parametros);
  json(respuesta, elegida.definicion.estado ?? 200, cuerpo);
  return true;
}
