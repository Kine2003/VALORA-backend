import { transaccion } from "../datos/postgres.js";
import { crearToken, huellaToken } from "../lib/autorizacion.js";
import { hashearClave, verificarClave } from "../lib/passwords.js";
import { SolicitudInvalida } from "../modelos/solicitud-invalida.js";
import {
  buscarSesion,
  buscarUsuarioPorCorreo,
  crearUsuarioCliente,
  guardarSesion,
  marcarAcceso,
  revocarSesion,
} from "../repositorios/usuarios.js";

const DURACION_SESION_HORAS = 24;
const MAX_INTENTOS = 6;
const BLOQUEO_MS = 10 * 60_000;
const HASH_FICTICIO = "scrypt$" + "0".repeat(32) + "$" + "0".repeat(128);
const intentos = new Map();

const texto = valor => typeof valor === "string" ? valor.trim() : "";

function normalizarCorreo(valor) {
  return texto(valor).toLowerCase();
}

function usuarioPublico(fila) {
  const roles = Array.isArray(fila.roles) ? fila.roles.filter(Boolean) : [];
  return {
    id: String(fila.id_usuario),
    nombre: fila.nombre,
    correo: fila.correo,
    roles,
  };
}

export async function iniciarSesion(pool, datos) {
  const correo = normalizarCorreo(datos?.correo);
  const clave = typeof datos?.password === "string" ? datos.password : "";
  if (!correo || !clave) throw new SolicitudInvalida("Escribe tu correo o usuario y tu contraseña.");

  const bloqueo = intentos.get(correo);
  if (bloqueo && bloqueo.hasta > Date.now()) {
    throw new SolicitudInvalida("Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.");
  }

  const usuario = await buscarUsuarioPorCorreo(pool, correo);
  const valida = await verificarClave(clave, usuario?.password_hash ?? HASH_FICTICIO);
  if (!usuario || usuario.activo !== 1 || !valida) {
    const registro = intentos.get(correo) ?? { conteo: 0, hasta: 0 };
    registro.conteo += 1;
    if (registro.conteo >= MAX_INTENTOS) {
      registro.conteo = 0;
      registro.hasta = Date.now() + BLOQUEO_MS;
    }
    intentos.set(correo, registro);
    throw new SolicitudInvalida("El usuario o la contraseña no son correctos.");
  }

  intentos.delete(correo);
  const token = crearToken();
  await guardarSesion(pool, usuario.id_usuario, huellaToken(token), DURACION_SESION_HORAS);
  await marcarAcceso(pool, usuario.id_usuario);
  return { token, usuario: usuarioPublico(usuario) };
}

export async function registrarCliente(pool, datos) {
  const nombre = texto(datos?.nombre);
  const correo = normalizarCorreo(datos?.correo);
  const telefono = texto(datos?.telefono);
  const clave = typeof datos?.password === "string" ? datos.password : "";

  if (nombre.length < 3 || nombre.length > 120) throw new SolicitudInvalida("Escribe tu nombre completo.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(correo) || correo.length > 160) {
    throw new SolicitudInvalida("Escribe un correo electrónico válido.");
  }
  if (!/^\+?[0-9\s()\-]{9,25}$/u.test(telefono)) throw new SolicitudInvalida("Escribe un teléfono válido.");
  if (clave.length < 8) throw new SolicitudInvalida("La contraseña debe tener al menos 8 caracteres.");
  if (clave.length > 128) throw new SolicitudInvalida("La contraseña no puede superar 128 caracteres.");

  const hash = await hashearClave(clave);
  let usuario;
  try {
    usuario = await transaccion(pool, db => crearUsuarioCliente(db, {
      nombre,
      correo,
      password_hash: hash,
    }));
  } catch (error) {
    if (error.code === "23505") throw new SolicitudInvalida("Ese correo ya tiene una cuenta. Inicia sesión.");
    throw error;
  }

  const token = crearToken();
  await guardarSesion(pool, usuario.id_usuario, huellaToken(token), DURACION_SESION_HORAS);
  await marcarAcceso(pool, usuario.id_usuario);
  return {
    token,
    usuario: usuarioPublico({ ...usuario, roles: ["CLIENTE"] }),
  };
}

export async function obtenerSesion(pool, token) {
  if (!token) return null;
  const fila = await buscarSesion(pool, huellaToken(token));
  return fila ? usuarioPublico(fila) : null;
}

export async function cerrarSesion(pool, token) {
  if (token) await revocarSesion(pool, huellaToken(token));
  return { cerrada: true };
}
