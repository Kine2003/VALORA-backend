import { createHash, randomBytes } from "node:crypto";

/** Token opaco que solo se entrega una vez al navegador. */
export const crearToken = () => randomBytes(32).toString("hex");

/** En la base solo se guarda la huella SHA-256 del token. */
export const huellaToken = token => createHash("sha256").update(token).digest("hex");

export function leerToken(peticion) {
  const cabecera = peticion?.headers?.authorization;
  if (typeof cabecera !== "string") return null;
  const [esquema, token, ...resto] = cabecera.trim().split(/\s+/u);
  return esquema?.toLowerCase() === "bearer" && token && resto.length === 0 ? token : null;
}
