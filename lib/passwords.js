import {
  randomBytes,
  scrypt as scryptBase,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptBase);
const parametros = { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
let activos=0;
const pendientes=[];
async function derivar(clave,sal,longitud,opciones) {
  if(activos>=2){if(pendientes.length>=8)throw Object.assign(new Error('Demasiados accesos simultáneos. Intenta en unos segundos.'),{status:429});await new Promise(resolve=>pendientes.push(resolve));}
  else activos++;
  try{return await scrypt(clave,sal,longitud,opciones);}finally{const siguiente=pendientes.shift();if(siguiente)siguiente();else activos--;}
}
export async function hashearClave(clave) {
  if (typeof clave !== "string" || clave.length < 8 || clave.length > 128)
    throw new Error("Contraseña inválida");
  const sal = randomBytes(16).toString("hex");
  const derivada = await derivar(clave, sal, 64, parametros);
  return `scrypt$v2$${sal}$${derivada.toString("hex")}`;
}
export async function verificarClave(clave, almacenada) {
  if (
    typeof clave !== "string" ||
    clave.length > 128 ||
    typeof almacenada !== "string"
  )
    return false;
  const partes = almacenada.split("$");
  const moderna = partes.length === 4 && partes[1] === "v2";
  if (partes[0] !== "scrypt" || (!moderna && partes.length !== 3)) return false;
  const sal = partes[moderna ? 2 : 1],
    huella = partes[moderna ? 3 : 2];
  if (!/^[a-f0-9]{32}$/u.test(sal) || !/^[a-f0-9]{128}$/u.test(huella))
    return false;
  const derivada = await derivar(
    clave,
    sal,
    64,
    moderna ? parametros : undefined,
  );
  return timingSafeEqual(Buffer.from(huella, "hex"), derivada);
}
