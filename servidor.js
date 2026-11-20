import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { comprobarConexion, conectar } from "./datos/postgres.js";
import { productos, servicios } from "./modelos/catalogo.js";
import { cotizar, guardarPedido } from "./servicios/solicitudes.js";
import { cerrarSesion, iniciarSesion, obtenerSesion, registrarCliente } from "./servicios/autenticacion.js";
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
    try {
      const configurado = process.env.FRONTEND_ORIGIN?.trim();
      const origenPermitido = configurado
        ? new URL(configurado).origin
        : (process.env.NODE_ENV === "production" ? null : "http://127.0.0.1:3002");
      const origenSolicitud = peticion.headers.origin;
      if (origenSolicitud) {
        if (!origenPermitido || origenSolicitud !== origenPermitido) {
          return json(respuesta, 403, { error: "Origen no permitido." });
        }
        respuesta.setHeader("Access-Control-Allow-Origin", origenPermitido);
        respuesta.setHeader("Vary", "Origin");
      }
      respuesta.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
      respuesta.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      if (peticion.method === "OPTIONS") {
        respuesta.writeHead(204);
        return respuesta.end();
      }
      const ruta = new URL(peticion.url, "http://127.0.0.1").pathname;
      if (await atenderApi(peticion, respuesta, ruta, serviciosApi)) return;
      return json(respuesta, 404, { error: "Ruta no encontrada." });
    } catch (error) {
      if (error instanceof SolicitudInvalida) return json(respuesta, 400, { error: error.message });
      console.error("Error del servidor:", error.code || error.name);
      return json(respuesta, 500, { error: "No se pudo completar la operación. Intenta nuevamente." });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = conectar();
  const salud = () => comprobarConexion(pool);
  try {
    await salud();
    const servidor = crearServidor({
      salud, servicios: () => servicios(pool), productos: () => productos(pool),
      cotizar: (datos, usuarioId) => cotizar(pool, datos, usuarioId),
      guardarPedido: (contacto, lineas, usuarioId) => guardarPedido(pool, contacto, lineas, usuarioId),
      iniciarSesion: datos => iniciarSesion(pool, datos),
      registrarCliente: datos => registrarCliente(pool, datos),
      obtenerSesion: token => obtenerSesion(pool, token),
      cerrarSesion: token => cerrarSesion(pool, token),
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
    });
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
