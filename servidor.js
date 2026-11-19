import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { comprobarConexion, conectar } from "./datos/mysql.js";
import { productos, servicios } from "./modelos/catalogo.js";
import { cotizar, guardarPedido } from "./servicios/solicitudes.js";
import { SolicitudInvalida } from "./modelos/solicitud-invalida.js";
import { json } from "./middleware/json.js";
import { atenderApi } from "./rutas/api.js";

export function crearServidor(serviciosApi) {
  return createServer(async (peticion, respuesta) => {
    respuesta.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const origen = process.env.FRONTEND_ORIGIN || "*";
      respuesta.setHeader("Access-Control-Allow-Origin", origen);
      respuesta.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      respuesta.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
      cotizar: datos => cotizar(pool, datos),
      guardarPedido: (contacto, lineas) => guardarPedido(pool, contacto, lineas),
    });
    const puerto = Number(process.env.PORT || 3000);
    servidor.on("error", async error => {
      console.error("No se pudo iniciar el servidor:", error.code || error.name);
      await pool.end();
      process.exitCode = 1;
    });
    servidor.listen(puerto, "0.0.0.0", () => console.log("API de Válora en el puerto " + puerto));
  } catch (error) {
    console.error("No se pudo conectar a MySQL:", error.code || error.name);
    await pool.end();
    process.exitCode = 1;
  }
}
