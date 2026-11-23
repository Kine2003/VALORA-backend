import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  firmarAcceso,
  verificarAcceso,
  leerToken,
} from "../lib/autorizacion.js";
process.env.JWT_SECRET = randomBytes(48).toString("base64url");
test("JWT rejects tampering, expiry and foreign audience", async () => {
  const token = await firmarAcceso("42", "session");
  assert.equal((await verificarAcceso(token)).sub, "42");
  await assert.rejects(verificarAcceso(token.slice(0, -8) + "AAAAAAAA"));
  await assert.rejects(verificarAcceso(await firmarAcceso("42", "s", -1)));
  const old = process.env.JWT_AUDIENCE;
  process.env.JWT_AUDIENCE = "foreign";
  await assert.rejects(verificarAcceso(token));
  if (old) process.env.JWT_AUDIENCE = old;
  else delete process.env.JWT_AUDIENCE;
});
test("cookie access and bearer compatibility", () => {
  assert.equal(leerToken({ headers: { cookie: "valora_access=abc" } }), "abc");
  assert.equal(leerToken({ headers: { authorization: "Bearer xyz" } }), "xyz");
});
import { hashearClave, verificarClave } from "../lib/passwords.js";
import { validarOrigen } from "../middleware/seguridad.js";
import {
  obtenerSesion,
  registrarCliente,
  renovarSesion,
  cerrarSesion,
} from "../servicios/autenticacion.js";
import { scryptSync } from "node:crypto";
test("passwords use strong parameters and retain legacy compatibility", async () => {
  const hash = await hashearClave("Clave segura 123");
  assert.match(hash, /^scrypt\$v2\$/u);
  assert.equal(await verificarClave("Clave segura 123", hash), true);
  assert.equal(await verificarClave("otra", hash), false);
  assert.equal(await verificarClave("x", "scrypt$bad$abc"), false);
  const sal = "a".repeat(32);
  const legacy = `scrypt$${sal}$${scryptSync("legado", sal, 64).toString("hex")}`;
  assert.equal(await verificarClave("legado", legacy), true);
});
test("CSRF rejects missing and foreign origins and non-JSON", () => {
  const old = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://valora.example";
  const req = {
    method: "POST",
    headers: {
      origin: "https://valora.example",
      "content-type": "application/json",
      host: "valora.example",
    },
  };
  assert.doesNotThrow(() => validarOrigen(req));
  assert.throws(
    () =>
      validarOrigen({
        ...req,
        headers: { ...req.headers, origin: "https://evil.example" },
      }),
    { status: 403 },
  );
  assert.throws(
    () =>
      validarOrigen({ ...req, headers: { ...req.headers, origin: undefined } }),
    { status: 403 },
  );
  assert.throws(
    () =>
      validarOrigen({
        ...req,
        headers: { ...req.headers, "content-type": "text/plain" },
      }),
    { status: 415 },
  );
  if (old) process.env.APP_ORIGIN = old;
  else delete process.env.APP_ORIGIN;
});
test("revoked sessions and JWT subject mismatch cannot authenticate", async () => {
  const token = await firmarAcceso("42", "session");
  assert.equal(
    await obtenerSesion({ query: async () => ({ rows: [] }) }, token),
    null,
  );
  assert.equal(
    await obtenerSesion(
      {
        query: async () => ({
          rows: [{ id_usuario: 43, roles: ["ADMINISTRADOR"] }],
        }),
      },
      token,
    ),
    null,
  );
});
test("registration rejects huge input before any database operation", async () => {
  const db = {
    query: () => {
      throw Error("database must not be called");
    },
  };
  await assert.rejects(
    registrarCliente(db, {
      nombre: "Ana",
      correo: "ana@example.com",
      telefono: "0999999999",
      password: "x".repeat(129),
      roles: ["ADMINISTRADOR"],
    }),
    { status: 400 },
  );
});
test("refresh reuse revokes family and commits that revocation", async () => {
  const effects = [];
  const db = {
    query: async (sql) => {
      effects.push(sql);
      if (sql.startsWith("SELECT"))
        return {
          rows: [
            { familia: "family", refresh_usado_en: new Date(), vigente: true },
          ],
        };
      return { rows: [] };
    },
    release() {},
  };
  await assert.rejects(
    renovarSesion({ connect: async () => db }, "a".repeat(43)),
    { status: 401 },
  );
  assert.ok(effects.some((sql) => sql.includes("WHERE familia=$1")));
  assert.equal(effects.at(-1), "COMMIT");
});
import { cookiesSesion } from "../lib/autorizacion.js";
import { iniciarSesion } from "../servicios/autenticacion.js";
import { SignJWT } from "jose";
test("foreign issuer and wrong algorithm rejected", async () => {
  const key = Buffer.from(process.env.JWT_SECRET, "base64url");
  for (const [alg, iss] of [
    ["HS384", "valora"],
    ["HS256", "foreign"],
  ]) {
    const bad = await new SignJWT({})
      .setProtectedHeader({ alg, typ: "JWT" })
      .setSubject("42")
      .setJti("s")
      .setIssuedAt()
      .setIssuer(iss)
      .setAudience("valora-web")
      .setExpirationTime("5m")
      .sign(key);
    await assert.rejects(verificarAcceso(bad));
  }
});
test("production cookies are HttpOnly Secure SameSite and cleared on logout", () => {
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  assert.ok(
    cookiesSesion("token", "refresh").every(
      (x) =>
        x.includes("HttpOnly") &&
        x.includes("SameSite=Lax") &&
        x.includes("; Secure"),
    ),
  );
  assert.ok(
    cookiesSesion("token", "refresh", true).every(
      (x) => x.includes("Max-Age=0") && !x.includes("=token"),
    ),
  );
  if (old) process.env.NODE_ENV = old;
  else delete process.env.NODE_ENV;
});
test("database rate limit returns 429 before password lookup", async () => {
  await assert.rejects(
    iniciarSesion(
      { query: async () => ({ rows: [{ intentos: 11 }] }) },
      { correo: "ana@example.com", password: "test" },
    ),
    { status: 429 },
  );
});
test("registration ignores supplied roles and assigns only standard roles", async () => {
  const statements = [];
  const db = {
    query: async (sql, params) => {
      statements.push({ sql, params });
      if (sql.startsWith("INSERT INTO usuario("))
        return {
          rows: [{ id_usuario: 8, nombre: "Ana", correo: "ana@example.com" }],
        };
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    connect: async () => db,
    query: async () => ({ rows: [{ intentos: 1 }] }),
  };
  const resultado = await registrarCliente(pool, {
    nombre: "Ana",
    correo: "ana@example.com",
    telefono: "0999999999",
    password: "Clave segura 123",
    roles: ["ADMINISTRADOR"],
  });
  assert.deepEqual(resultado.usuario.roles, ["USUARIO", "CLIENTE"]);
  assert.ok(
    statements.some(({ sql }) =>
      sql.includes("codigo IN ('USUARIO','CLIENTE')"),
    ),
  );
  assert.equal(statements.at(-1).sql, "COMMIT");
});
import { consultarSesion } from '../controladores/autenticacion.js';
test('session endpoint returns 401 when access is expired or absent',async()=>{
 await assert.rejects(consultarSesion({obtenerSesion:async()=>null},undefined,{headers:{}}),{status:401});
});
test('password derivation bounds expensive concurrent work and recovers after overload',async()=>{
 const resultados=await Promise.allSettled(Array.from({length:11},()=>hashearClave('Contraseña de prueba larga')));
 assert.equal(resultados.filter(r=>r.status==='fulfilled').length,10);
 assert.equal(resultados.find(r=>r.status==='rejected').reason.status,429);
 assert.match(await hashearClave('Contraseña de prueba larga'),/^scrypt\$v2\$/);
});
