import { resolverVersion } from "../middleware/version-api.js";
import { json, leerJson } from "../middleware/json.js";
import { recibirCotizacion, recibirPedido } from "../controladores/solicitudes.js";

const rutas = new Map([
  ["/salud", { metodo: "GET", estado: 200, ejecutar: async api => {
    await api.salud();
    return { postgres: "conectado" };
  } }],
  ["/productos", { metodo: "GET", estado: 200, ejecutar: api => api.productos() }],
  ["/servicios", { metodo: "GET", estado: 200, ejecutar: api => api.servicios() }],
  ["/cotizaciones", { metodo: "POST", estado: 201, ejecutar: recibirCotizacion }],
  ["/pedidos", { metodo: "POST", estado: 201, ejecutar: recibirPedido }],
]);

export async function atenderApi(peticion, respuesta, ruta, api) {
  const version = resolverVersion(ruta);
  if (!version) return false;

  const destino = rutas.get(version.recurso);
  if (!destino) {
    json(respuesta, 404, { error: version.error ?? "Ruta no encontrada." });
  } else if (peticion.method !== destino.metodo) {
    respuesta.setHeader("Allow", destino.metodo);
    json(respuesta, 405, { error: "Método no permitido para esta ruta." });
  } else {
    const datos = destino.metodo === "POST" ? await leerJson(peticion) : undefined;
    json(respuesta, destino.estado, await destino.ejecutar(api, datos));
  }
  return true;
}
