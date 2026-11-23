import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
export const crearToken = () => randomBytes(32).toString("base64url");
export const huellaToken = (token) =>
  createHash("sha256").update(token).digest("hex");
export const DURACION_ACCESO = 900;
export const DURACION_REFRESH = 7 * 86400;
export function configuracionJwt() {
  const secret = process.env.JWT_SECRET;
  if (
    !secret ||
    !/^[A-Za-z0-9_-]{43,}$/u.test(secret) ||
    new Set(secret).size < 16 ||
    Buffer.from(secret, "base64url").length < 32
  )
    throw new Error(
      "JWT_SECRET debe ser una clave aleatoria base64url de al menos 32 bytes.",
    );
  return {
    key: Buffer.from(secret, "base64url"),
    issuer: process.env.JWT_ISSUER || "valora",
    audience: process.env.JWT_AUDIENCE || "valora-web",
  };
}
export async function firmarAcceso(idUsuario, jti, segundos = DURACION_ACCESO) {
  const { key, issuer, audience } = configuracionJwt();
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(idUsuario))
    .setIssuer(issuer)
    .setAudience(audience)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + segundos)
    .sign(key);
}
export async function verificarAcceso(token) {
  const { key, issuer, audience } = configuracionJwt();
  const { payload } = await jwtVerify(token, key, {
    algorithms: ["HS256"],
    issuer,
    audience,
    typ: "JWT",
    requiredClaims: ["sub", "jti", "iat", "exp"],
    maxTokenAge: "15m",
  });
  if (
    typeof payload.sub !== "string" ||
    !/^\d+$/u.test(payload.sub) ||
    typeof payload.jti !== "string" ||
    !payload.jti
  )
    throw new Error("JWT inválido");
  return payload;
}
export function leerCookie(peticion, nombre) {
  const cookies = peticion?.headers?.cookie;
  if (typeof cookies !== "string") return null;
  const valor = cookies
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(nombre + "="));
  return valor?.slice(nombre.length + 1) || null;
}
export function leerToken(peticion) {
  const cabecera = peticion?.headers?.authorization;
  if (typeof cabecera === "string") {
    const [esquema, token, ...resto] = cabecera.trim().split(/\s+/u);
    return esquema.toLowerCase() === "bearer" && token && resto.length === 0
      ? token
      : null;
  }
  return leerCookie(peticion, "valora_access");
}
export function cookiesSesion(token, refresh, limpiar = false) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookie = (nombre, valor, edad) =>
    `${nombre}=${limpiar ? "" : valor}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${limpiar ? 0 : edad}${secure}`;
  return [
    cookie("valora_access", token, DURACION_ACCESO),
    cookie("valora_refresh", refresh, DURACION_REFRESH),
  ];
}
