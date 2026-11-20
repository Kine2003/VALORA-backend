import assert from "node:assert/strict";
import { once } from "node:events";
import { crearServidor } from "../servidor.js";
import { SolicitudInvalida } from "../modelos/solicitud-invalida.js";

let cotizacionRecibida = false;
let pedidoRecibido = false;
let estadoRecibido = null;
process.env.FRONTEND_ORIGIN = "https://kine2003.github.io/VALORA-frontend/";
const administrador = { id: "1", nombre: "Administrador", correo: "admin.valora.1", roles: ["ADMINISTRADOR"] };
const servidor = crearServidor({
  salud: async () => {},
  productos: async () => ({ version: 2, productos: [] }),
  servicios: async () => ({ version: 3, servicios: {} }),
  cotizar: async datos => {
    cotizacionRecibida = datos.nombre === "Persona de Prueba";
    return { id: 101 };
  },
  guardarPedido: async () => {
    pedidoRecibido = true;
    return { id: 202, resumen: "Prueba" };
  },
  iniciarSesion: async datos => {
    if (datos?.correo === "admin.valora.1" && datos?.password === "lticPUCE24") {
      return { token: "token-admin", usuario: administrador };
    }
    throw new SolicitudInvalida("El usuario o la contraseña no son correctos.");
  },
  obtenerSesion: async token => token === "token-admin" ? administrador : null,
  cerrarSesion: async () => ({ cerrada: true }),
  resumenAdmin: async () => ({ solicitudes: 0, recientes: [] }),
  solicitudesAdmin: async () => ({ solicitudes: [] }),
  clientesAdmin: async () => ({ clientes: [] }),
  solicitudesCuenta: async () => ({ solicitudes: [] }),
  actualizarEstado: async (id, estado) => {
    estadoRecibido = { id, estado };
    return { id, estado };
  },
});
servidor.listen(0, "127.0.0.1");
await once(servidor, "listening");
const { port } = servidor.address();
const url = `http://127.0.0.1:${port}`;

async function solicitar(ruta, opciones) {
  const respuesta = await fetch(url + ruta, opciones);
  return { respuesta, cuerpo: await respuesta.json() };
}

try {
  let resultado = await solicitar("/api/v1/salud");
  assert.equal(resultado.respuesta.status, 200);
  assert.equal(resultado.respuesta.headers.get("access-control-allow-origin"), "https://kine2003.github.io");
  assert.deepEqual(resultado.cuerpo, { postgres: "conectado" });

  resultado = await solicitar("/api/v1/productos");
  assert.equal(resultado.respuesta.status, 200);
  assert.equal(resultado.cuerpo.version, 2);

  resultado = await solicitar("/api/v1/servicios");
  assert.equal(resultado.respuesta.status, 200);
  assert.equal(resultado.cuerpo.version, 3);

  resultado = await solicitar("/api/v2/salud");
  assert.equal(resultado.respuesta.status, 404);

  resultado = await solicitar("/api/v1/cotizaciones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: "Persona de Prueba", empresa: "Empresa", correo: "prueba@example.com",
      telefono: "0995883856", servicio: "catering", mensaje: "Necesito una cotización para un evento.",
    }),
  });
  assert.equal(resultado.respuesta.status, 201);
  assert.deepEqual(resultado.cuerpo, { id: 101 });
  assert.equal(cotizacionRecibida, true);

  resultado = await solicitar("/api/v1/cotizaciones", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "no es JSON",
  });
  assert.equal(resultado.respuesta.status, 400);

  const fecha = new Date(Date.now() + 86_400_000);
  const fechaTexto = fecha.toISOString().slice(0, 10);
  resultado = await solicitar("/api/v1/pedidos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contacto: {
        nombre: "Persona de Prueba", correo: "prueba@example.com", telefono: "0995883856",
        fecha: fechaTexto, hora: "12:00", entrega: "retiro", direccion: "", notas: "",
      },
      lineas: [{ id: "linea-1" }],
    }),
  });
  assert.equal(resultado.respuesta.status, 201);
  assert.equal(pedidoRecibido, true);

  resultado = await solicitar("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ correo: "admin.valora.1", password: "lticPUCE24" }),
  });
  assert.equal(resultado.respuesta.status, 200);
  assert.equal(resultado.cuerpo.token, "token-admin");
  assert.deepEqual(resultado.cuerpo.usuario.roles, ["ADMINISTRADOR"]);

  resultado = await solicitar("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ correo: "admin.valora.1", password: "incorrecta" }),
  });
  assert.equal(resultado.respuesta.status, 400);

  resultado = await solicitar("/api/v1/admin/resumen");
  assert.equal(resultado.respuesta.status, 401);

  resultado = await solicitar("/api/v1/admin/resumen", {
    headers: { Authorization: "Bearer token-admin" },
  });
  assert.equal(resultado.respuesta.status, 200);

  resultado = await solicitar("/api/v1/cuenta/solicitudes", {
    headers: { Authorization: "Bearer token-admin" },
  });
  assert.equal(resultado.respuesta.status, 200);

  resultado = await solicitar("/api/v1/admin/solicitudes/9", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer token-admin" },
    body: JSON.stringify({ estado: "CONFIRMADA" }),
  });
  assert.equal(resultado.respuesta.status, 200);
  assert.deepEqual(estadoRecibido, { id: "9", estado: "CONFIRMADA" });

  resultado = await solicitar("/api/v1/admin/solicitudes/9", {
    headers: { Authorization: "Bearer token-admin" },
  });
  assert.equal(resultado.respuesta.status, 405);

  resultado = await solicitar("/api/v1/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer token-admin" },
    body: "{}",
  });
  assert.equal(resultado.respuesta.status, 200);
  assert.deepEqual(resultado.cuerpo, { cerrada: true });
} finally {
  servidor.close();
}

console.log("Smoke test de la API: correcto.");
