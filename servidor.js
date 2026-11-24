import { panelEquipo, confirmarEntrega } from './servicios/equipo.js';
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { comprobarConexion, conectar } from "./datos/postgres.js";
import { productos, servicios } from "./modelos/catalogo.js";
import { cotizar, guardarPedido } from "./servicios/solicitudes.js";
import { cerrarSesion, iniciarSesion, obtenerSesion, registrarCliente, renovarSesion } from "./servicios/autenticacion.js";
import { cabecerasSeguridad, validarOrigen } from './middleware/seguridad.js';
import { configuracionJwt } from './lib/autorizacion.js';
import { metadatosGestion,listarTabla,modificarTabla,crearCuentaAdmin,revocarSesionAdmin,cambiarFactura } from './servicios/gestion.js';
import {consultarCocina,guardarReceta,registrarCompra,registrarProduccion,planificarCocina,crearPlato} from './servicios/cocina.js';
import { servirFrontend } from './middleware/frontend.js';
import {
  actualizarEstado,
  catalogoAdministrable,
  clientesAdmin,
  crearProducto,
  editarProducto,
  eliminarProducto,
  pagarOrdenCliente,
  resumenAdmin,
  solicitudesAdmin,
  solicitudesCuenta,
} from "./servicios/admin.js";
import { SolicitudInvalida } from "./modelos/solicitud-invalida.js";
import { json } from "./middleware/json.js";
import { atenderApi } from "./rutas/api.js";

export function crearServidor(serviciosApi) {
  return createServer(async (peticion, respuesta) => {
    respuesta.setHeader("X-Content-Type-Options", "nosniff");
    respuesta.setHeader("X-Frame-Options", "DENY");
    respuesta.setHeader("Referrer-Policy", "no-referrer");
    respuesta.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    respuesta.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    cabecerasSeguridad(respuesta);
    try {
      const configurado = (process.env.APP_ORIGIN || process.env.FRONTEND_ORIGIN)?.trim();
      const origenPermitido = configurado
        ? new URL(configurado).origin
        : (process.env.NODE_ENV === "production" ? null : "http://127.0.0.1:3002");
      const origenSolicitud = peticion.headers.origin;
      if (origenSolicitud) {
        if (!origenPermitido || origenSolicitud !== origenPermitido) {
          return json(respuesta, 403, { error: "Origen no permitido." });
        }
        respuesta.setHeader("Access-Control-Allow-Origin", origenPermitido);
        respuesta.setHeader('Access-Control-Allow-Credentials','true');
        respuesta.setHeader("Vary", "Origin");
      }
      respuesta.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
      respuesta.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      if (peticion.method === "OPTIONS") {
        respuesta.writeHead(204);
        return respuesta.end();
      }
      const ruta = new URL(peticion.url, "http://127.0.0.1").pathname;
      if(ruta.startsWith('/api/')||ruta.startsWith('/data/'))validarOrigen(peticion);
      if (await atenderApi(peticion, respuesta, ruta, serviciosApi)) return;
      if(await servirFrontend(peticion,respuesta,ruta))return;
      return json(respuesta, 404, { error: "Ruta no encontrada." });
    } catch (error) {
      if (error instanceof SolicitudInvalida || Number.isInteger(error.status)) return json(respuesta, error.status || error.estado || 400, { error: error.message });
      const erroresSql={'23505':[409,'Ya existe un registro con esos datos.'],'23503':[409,'El registro tiene relaciones pendientes o la referencia no existe.'],'23514':[400,'Los datos no cumplen las reglas del registro.'],'23502':[400,'Completa los campos obligatorios.'],'22003':[400,'Un valor numérico supera el rango permitido.'],'22007':[400,'Revisa las fechas y horas.']};
      if(erroresSql[error.code])return json(respuesta,...erroresSql[error.code].map((x,i)=>i?{error:x}:x));
      console.error("Error del servidor:", error.code || error.name);
      return json(respuesta, 500, { error: "No se pudo completar la operación. Intenta nuevamente." });
    }
  });
}

export function serviciosDeAplicacion(pool) {
  const salud = () => comprobarConexion(pool);
  return {
      panelEquipo:u=>panelEquipo(pool,u), confirmarEntrega:(id,d,u)=>confirmarEntrega(pool,id,d,u),
      salud, servicios: () => servicios(pool), productos: () => productos(pool),
      cotizar: (datos, usuarioId) => cotizar(pool, datos, usuarioId),
      guardarPedido: (contacto, lineas, usuarioId) => guardarPedido(pool, contacto, lineas, usuarioId),
      iniciarSesion: (datos,contexto) => iniciarSesion(pool, datos,contexto),
      registrarCliente: (datos,contexto) => registrarCliente(pool, datos,contexto),
      obtenerSesion: token => obtenerSesion(pool, token),
      cerrarSesion: (token,refresh) => cerrarSesion(pool, token,refresh),
      renovarSesion: refresh => renovarSesion(pool,refresh),
      metadatosGestion: u=>metadatosGestion(pool,u),
      listarTabla:(t,p,u)=>listarTabla(pool,t,p,u),
      modificarTabla:(t,m,d,u)=>modificarTabla(pool,t,m,d,u),
      crearCuentaAdmin:(d,u)=>crearCuentaAdmin(pool,d,u),
      revocarSesionAdmin:(id,u)=>revocarSesionAdmin(pool,id,u),
      cambiarFactura:(id,a,u)=>cambiarFactura(pool,id,a,u),
      consultarCocina:()=>consultarCocina(pool),
      crearPlato:(d,u)=>crearPlato(pool,d,u),
      guardarReceta:(d,u)=>guardarReceta(pool,d,u),
      registrarCompra:(d,u)=>registrarCompra(pool,d,u),
      registrarProduccion:(d,u)=>registrarProduccion(pool,d,u),
      planificarCocina:d=>planificarCocina(pool,d),
      resumenAdmin: () => resumenAdmin(pool),
      solicitudesAdmin: () => solicitudesAdmin(pool),
      clientesAdmin: () => clientesAdmin(pool),
      catalogoAdministrable: () => catalogoAdministrable(pool),
      crearProducto: datos => crearProducto(pool, datos),
      editarProducto: (id, datos) => editarProducto(pool, id, datos),
      eliminarProducto: id => eliminarProducto(pool, id),
      pagarOrden: (usuario, id, metodo) => pagarOrdenCliente(pool, usuario, id, metodo),
      solicitudesCuenta: usuario => solicitudesCuenta(pool, usuario),
      actualizarEstado: (id, estado, usuario) => actualizarEstado(pool, id, estado, usuario),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = conectar();
  try {
    configuracionJwt();
    await comprobarConexion(pool);
    const servidor=crearServidor(serviciosDeAplicacion(pool));
    const puerto = Number(process.env.PORT || 3000);
    servidor.on("error", async error => {
      console.error("No se pudo iniciar el servidor:", error.code || error.name);
      await pool.end();
      process.exitCode = 1;
    });
    servidor.listen(puerto, "0.0.0.0", () => console.log("API de Válora en el puerto " + puerto));
  } catch (error) {
    console.error("No se pudo conectar a PostgreSQL:", error.code || error.name);
    await pool.end();
    process.exitCode = 1;
  }
}
