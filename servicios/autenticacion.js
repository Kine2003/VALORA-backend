import { transaccion } from "../datos/postgres.js";
import {
  crearToken,
  huellaToken,
  firmarAcceso,
  verificarAcceso,
} from "../lib/autorizacion.js";
import { hashearClave, verificarClave } from "../lib/passwords.js";
import { SolicitudInvalida } from "../modelos/solicitud-invalida.js";
import {
  buscarSesion,
  buscarUsuarioPorCorreo,
  crearUsuarioCliente,
  guardarSesion,
  marcarAcceso,
  revocarSesion,
  consumirLimite,
  bloquearRefresh,
  consumirRefresh,
  revocarFamilia,
} from "../repositorios/usuarios.js";
const texto = (x) => (typeof x === "string" ? x.trim() : "");
export function errorAuth(mensaje, status = 400) {
  return Object.assign(new SolicitudInvalida(mensaje), { status });
}
function usuarioPublico(u) {
  const roles = Array.isArray(u.roles) ? u.roles.filter(Boolean) : [];
  return {
    id: String(u.id_usuario),
    nombre: u.nombre,
    correo: u.correo,
    roles: roles.includes("CLIENTE")
      ? [...new Set([...roles, "USUARIO"])]
      : roles,
  };
}
async function emitir(db, usuario, familia = crearToken(), expiraEn = null) {
  const jti = crearToken(),
    refresh = crearToken();
  const token = await firmarAcceso(usuario.id_usuario, jti);
  await guardarSesion(
    db,
    usuario.id_usuario,
    huellaToken(jti),
    168,
    huellaToken(refresh),
    familia,
    expiraEn,
  );
  return { token, refresh, usuario: usuarioPublico(usuario) };
}
async function limitar(pool, correo, contexto = {}) {
  if (
    contexto.ip &&
    !(await consumirLimite(pool, huellaToken("ip:" + contexto.ip), 60))
  )
    throw errorAuth("Demasiados intentos. Espera diez minutos.", 429);
  if (!(await consumirLimite(pool, huellaToken("cuenta:" + correo), 10)))
    throw errorAuth("Demasiados intentos. Espera diez minutos.", 429);
}
export async function iniciarSesion(pool, datos, contexto) {
  const correo = texto(datos?.correo).toLowerCase(),
    clave = datos?.password;
  if (
    !correo ||
    correo.length > 254 ||
    typeof clave !== "string" ||
    !clave ||
    clave.length > 128
  )
    throw errorAuth("Escribe un correo y una contraseña válidos.");
  await limitar(pool, correo, contexto);
  const usuario = await buscarUsuarioPorCorreo(pool, correo);
  const valida = await verificarClave(
    clave,
    usuario?.password_hash ??
      "scrypt$v2$" + "0".repeat(32) + "$" + "0".repeat(128),
  );
  if (!usuario || usuario.activo !== 1 || !valida)
    throw errorAuth("El usuario o la contraseña no son correctos.", 401);
  if(!usuario.password_hash.startsWith('scrypt$v2$'))await pool.query('UPDATE usuario SET password_hash=$1 WHERE id_usuario=$2 AND password_hash=$3',[await hashearClave(clave),usuario.id_usuario,usuario.password_hash]);
  const resultado = await emitir(pool, usuario);
  await marcarAcceso(pool, usuario.id_usuario);
  return resultado;
}
export async function registrarCliente(pool, datos, contexto) {
  const nombre = texto(datos?.nombre),
    correo = texto(datos?.correo).toLowerCase(),
    telefono = texto(datos?.telefono),
    clave = datos?.password;
  if (
    nombre.length < 3 ||
    nombre.length > 120 ||
    /[\u0000-\u001f]/u.test(nombre)
  )
    throw errorAuth("Escribe tu nombre completo.");
  if (correo.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(correo))
    throw errorAuth("Escribe un correo válido.");
  if (!/^\+?[0-9\s()\-]{9,25}$/u.test(telefono))
    throw errorAuth("Escribe un teléfono válido.");
  if (typeof clave !== "string" || clave.length < 15 || clave.length > 128)
    throw errorAuth("La contraseña debe tener entre 15 y 128 caracteres.");
  await limitar(pool, correo, contexto);
  const hash = await hashearClave(clave);
  try {
    return await transaccion(pool, async (db) => {
      const u = await crearUsuarioCliente(db, {
        nombre,
        correo,
        password_hash: hash,
      });
      return emitir(db, { ...u, roles: ["USUARIO", "CLIENTE"] });
    });
  } catch (error) {
    if (error.code === "23505")
      throw errorAuth("Ese correo ya tiene una cuenta.", 409);
    throw error;
  }
}
export async function obtenerSesion(pool, token) {
  if (!token || typeof token !== "string" || token.length > 4096) return null;
  let claims;
  try {
    claims = await verificarAcceso(token);
  } catch {
    return null;
  }
  const usuario = await buscarSesion(pool, huellaToken(claims.jti));
  return usuario && String(usuario.id_usuario) === claims.sub
    ? usuarioPublico(usuario)
    : null;
}
export async function cerrarSesion(pool, token, refresh) {
  if (refresh && typeof refresh === "string" && refresh.length <= 128)
    await revocarSesion(pool, huellaToken(refresh));
  if (token) {
    try {
      const claims = await verificarAcceso(token);
      await revocarSesion(pool, huellaToken(claims.jti));
    } catch (error) {
      if (!error.code?.startsWith("ERR_J")) throw error;
    }
  }
  return { cerrada: true };
}
export async function renovarSesion(pool, refresh) {
  if (typeof refresh !== "string" || !/^[\w-]{43}$/u.test(refresh))
    throw errorAuth("Inicia sesión para continuar.", 401);
  const resultado = await transaccion(pool, async (db) => {
    const sesion = await bloquearRefresh(db, huellaToken(refresh));
    if (!sesion) return null;
    if (sesion.refresh_usado_en || sesion.revocada_en) {
      await revocarFamilia(db, sesion.familia);
      return null;
    }
    if (!sesion.vigente) return null;
    const u = await buscarSesion(db, sesion.token_hash);
    if (!u) return null;
    await consumirRefresh(db, sesion.id_sesion);
    return emitir(db, u, sesion.familia, sesion.expira_en);
  });
  if (!resultado) throw errorAuth("La sesión ha caducado. Inicia sesión.", 401);
  return resultado;
}
