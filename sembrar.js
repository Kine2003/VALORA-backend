import { readFile } from "node:fs/promises";
import pg from "pg";
import { configuracionPostgres, transaccion } from "./datos/postgres.js";
import { TIPOS_COMIDA, validarProductos } from "./lib/cart.js";
import { validarCatalogo } from "./lib/catalogo.js";

async function leerCatalogo(archivo) {
  return JSON.parse(await readFile(new URL("./data/" + archivo, import.meta.url), "utf8"));
}

async function insertar(db, tabla, fila) {
  const columnas = Object.keys(fila);
  const parametros = columnas.map((_, indice) => `$${indice + 1}`);
  await db.query(
    "INSERT INTO " + tabla + " (" + columnas.join(", ") + ") VALUES (" +
      parametros.join(", ") + ") ON CONFLICT DO NOTHING",
    Object.values(fila),
  );
}

const catalogoServicios = validarCatalogo(await leerCatalogo("servicios.json"));
const catalogoProductos = validarProductos(await leerCatalogo("productos.json"));
const { Pool } = pg;
const pool = new Pool(configuracionPostgres);
try {
  await transaccion(pool, async db => {
    for (const [codigo, nombre] of Object.entries(TIPOS_COMIDA)) {
      await insertar(db, "tipo_comida", { codigo, nombre });
    }
    for (const [codigo, nombre] of [["ADMINISTRADOR", "Administrador"], ["CLIENTE", "Cliente"]]) {
      await insertar(db, "rol", { codigo, nombre });
    }
    const { rows: comidas } = await db.query("SELECT codigo, id_tipo_comida FROM tipo_comida");
    const idComida = new Map(comidas.map(fila => [fila.codigo, fila.id_tipo_comida]));
    for (const [id_servicio, { incluye, ...servicio }] of Object.entries(catalogoServicios)) {
      await insertar(db, "servicio", { id_servicio, ...servicio });
      for (const [indice, descripcion] of incluye.entries()) {
        await insertar(db, "servicio_incluye", { id_servicio, orden: indice + 1, descripcion });
      }
    }
    for (const paquete of catalogoProductos) {
      const id_paquete = paquete.id;
      await insertar(db, "paquete", {
        id_paquete, id_servicio: paquete.servicioId, nombre: paquete.nombre, descripcion: paquete.descripcion,
        imagen: paquete.imagen, imagen_alt: paquete.imagenAlt, etiqueta: paquete.etiqueta,
      });
      for (const [indice, descripcion] of paquete.incluye.entries()) {
        await insertar(db, "paquete_incluye", { id_paquete, orden: indice + 1, descripcion });
      }
      for (const oferta of paquete.ofertas) {
        const id_tipo_comida = idComida.get(oferta.tipoComida);
        await insertar(db, "paquete_tipo_comida", {
          id_paquete, id_tipo_comida, precio_base_centavos: oferta.precioCentavos,
          min_personas: oferta.minPersonas, max_personas: oferta.maxPersonas, vigente_desde: "2000-01-01",
        });
        for (const [tipo, opciones] of [["MENU", oferta.menus], ["EXTRA", oferta.extras]]) {
          for (const opcion of opciones) {
            await insertar(db, "opcion_paquete", {
              id_opcion: opcion.id, id_paquete, id_tipo_comida, codigo: opcion.codigo, tipo, nombre: opcion.nombre,
              precio_adicional_centavos: opcion.extraCentavos ?? opcion.precioCentavos,
            });
          }
        }
      }
    }
  });
  console.log("Catálogo de Válora cargado en PostgreSQL.");
} finally {
  await pool.end();
}
