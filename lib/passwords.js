import { randomBytes, scrypt as scryptBase, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptBase);
const LONGITUD_CLAVE = 64;

/** Deriva la contraseña con sal aleatoria. Formato: scrypt$sal$huella. */
export async function hashearClave(clave) {
  const sal = randomBytes(16).toString("hex");
  const derivada = await scrypt(clave, sal, LONGITUD_CLAVE);
  return `scrypt$${sal}$${derivada.toString("hex")}`;
}

export async function verificarClave(clave, almacenada) {
  if (typeof clave !== "string" || typeof almacenada !== "string") return false;
  const [algoritmo, sal, huella] = almacenada.split("$");
  if (algoritmo !== "scrypt" || !sal || !huella) return false;
  const esperada = Buffer.from(huella, "hex");
  if (esperada.length !== LONGITUD_CLAVE) return false;
  const derivada = await scrypt(clave, sal, LONGITUD_CLAVE);
  return timingSafeEqual(esperada, derivada);
}
