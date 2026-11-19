import { SolicitudInvalida } from "../modelos/solicitud-invalida.js";

export function json(respuesta, estado, cuerpo) {
  respuesta.writeHead(estado, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  respuesta.end(JSON.stringify(cuerpo));
}

export async function leerJson(peticion) {
  if (peticion.headers["content-type"]?.split(";")[0].trim() !== "application/json") {
    throw new SolicitudInvalida("Envía los datos en formato JSON.");
  }
  const partes = [];
  let bytes = 0;
  for await (const parte of peticion) {
    bytes += parte.length;
    if (bytes <= 64_000) partes.push(parte);
  }
  if (bytes > 64_000) throw new SolicitudInvalida("La solicitud supera el tamaño permitido.");
  try {
    return JSON.parse(Buffer.concat(partes).toString("utf8"));
  } catch {
    throw new SolicitudInvalida("Los datos de la solicitud no son válidos.");
  }
}
