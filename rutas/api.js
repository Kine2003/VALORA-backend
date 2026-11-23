import { resolverVersion } from "../middleware/version-api.js";
import { json, leerJson } from "../middleware/json.js";
import { leerToken } from "../lib/autorizacion.js";
import { recibirCotizacion, recibirPedido } from "../controladores/solicitudes.js";
import { cerrarSesion, consultarSesion, recibirLogin, recibirRegistro, renovarSesion } from "../controladores/autenticacion.js";
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
  ["/auth/renovar", { metodo: "POST", estado: 200, ejecutar: renovarSesion }],
  ["/cuenta/solicitudes", { metodo: "GET", estado: 200, autenticado: true, ejecutar: consultarCuenta }],
  ["/admin/resumen", { metodo: "GET", estado: 200, equipo: true, area:'pedidos', ejecutar: consultarResumen }],
  ["/admin/solicitudes", { metodo: "GET", estado: 200, equipo: true, area:'pedidos', ejecutar: consultarSolicitudes }],
  [/^\/admin\/solicitudes\/(\d+)$/u, { metodo: "PATCH", estado: 200, equipo:true, area:'operaciones', ejecutar: actualizarSolicitud }],
  ["/admin/clientes", { metodo: "GET", estado: 200, soloAdmin: true, ejecutar: consultarClientes }],
  ["/admin/catalogo", { metodo: "GET", estado: 200, equipo: true, area:'cocina', ejecutar: consultarCatalogoAdmin }],
  ["/admin/catalogo", { metodo: "POST", estado: 201, equipo: true, area:'cocina', ejecutar: crearProducto }],
  [/^\/admin\/catalogo\/([a-z0-9-]+)$/u, { metodo: "PATCH", estado: 200, equipo: true, area:'cocina', ejecutar: editarProducto }],
  [/^\/admin\/catalogo\/([a-z0-9-]+)$/u, { metodo: "DELETE", estado: 200, equipo: true, area:'cocina', ejecutar: eliminarProducto }],
  [/^\/cuenta\/ordenes\/(\d+)\/pago$/u, { metodo: "POST", estado: 200, autenticado: true, ejecutar: pagarOrden }],
  ["/admin/gestion", { metodo: "GET", equipo: true, ejecutar: (api,_d,_p,u)=>api.metadatosGestion(u) }],
  [/^\/admin\/tablas\/([a-z_]+)$/u, {metodo:'GET',equipo:true,ejecutar:(api,_d,p,u,k)=>api.listarTabla(k[0],Object.fromEntries(new URL(p.url,'http://localhost').searchParams),u)}],
  ...['POST','PATCH','DELETE'].map(metodo=>[/^\/admin\/tablas\/([a-z_]+)$/u,{metodo,equipo:true,ejecutar:(api,d,_p,u,k)=>api.modificarTabla(k[0],metodo,d,u)}]),
  ['/admin/usuarios',{metodo:'POST',soloAdmin:true,estado:201,ejecutar:(api,d,_p,u)=>api.crearCuentaAdmin(d,u)}],
  [/^\/admin\/sesiones\/(\d+)\/revocar$/u,{metodo:'POST',soloAdmin:true,ejecutar:(api,_d,_p,u,k)=>api.revocarSesionAdmin(k[0],u)}],
  [/^\/admin\/facturas\/(\d+)\/(emitir|anular)$/u,{metodo:'POST',equipo:true,ejecutar:(api,_d,_p,u,k)=>api.cambiarFactura(k[0],k[1],u)}],
  ['/admin/cocina',{metodo:'GET',equipo:true,area:'cocina',ejecutar:api=>api.consultarCocina()}],
  ['/admin/cocina/platos',{metodo:'POST',equipo:true,area:'cocina',estado:201,ejecutar:(api,d,_p,u)=>api.crearPlato(d,u)}],
  ...['recetas','compras','produccion','planificar'].map((recurso,i)=>['/admin/cocina/'+recurso,{metodo:'POST',equipo:true,area:i===0?'cocina':'inventario',ejecutar:(api,d,_p,u)=>api[['guardarReceta','registrarCompra','registrarProduccion','planificarCocina'][i]](d,u)}]),
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
  if (elegida.definicion.autenticado || elegida.definicion.soloAdmin || elegida.definicion.equipo) {
    if (!usuario) {
      json(respuesta, 401, { error: "Inicia sesión para continuar." });
      return true;
    }
    if (elegida.definicion.soloAdmin && !usuario.roles.includes("ADMINISTRADOR")) {
      json(respuesta, 403, { error: "Esta sección requiere una cuenta de administrador." });
      return true;
    }
    if(elegida.definicion.equipo && !usuario.roles.some(r=>['ADMINISTRADOR','CATALOGO','OPERACIONES','FINANZAS'].includes(r))) {
      json(respuesta,403,{error:'Esta sección requiere permisos de gestión.'});return true;
    }
    const area=elegida.definicion.area;
    const permisosArea={cocina:['CATALOGO','OPERACIONES'],inventario:['OPERACIONES'],operaciones:['OPERACIONES'],pedidos:['OPERACIONES','FINANZAS']};
    if(area && !usuario.roles.includes('ADMINISTRADOR') && !permisosArea[area]?.some(r=>usuario.roles.includes(r))) {
      json(respuesta,403,{error:'No tienes permiso para esta operación.'});return true;
    }
  }

  const conCuerpo = ["POST","PATCH","DELETE"].includes(peticion.method);
  const datos = conCuerpo ? await leerJson(peticion) : undefined;
  const cuerpo = await elegida.definicion.ejecutar(api, datos, peticion, usuario, elegida.parametros,respuesta);
  json(respuesta, elegida.definicion.estado ?? 200, cuerpo);
  return true;
}
