import { readFile } from "node:fs/promises";
import pg from "pg";
import { configuracionPostgres } from "./datos/postgres.js";

const { Pool } = pg;
const pool = new Pool(configuracionPostgres);
const conexion = await pool.connect();
try {
  const { rows } = await conexion.query("SELECT to_regclass('public.servicio') AS tabla");
  if (!rows[0].tabla) {
    const esquema = await readFile(new URL("./sql/esquema-postgres.sql", import.meta.url), "utf8");
    await conexion.query(esquema);
  }
  const vistas = await readFile(new URL("./sql/vistas-postgres.sql", import.meta.url), "utf8");
  await conexion.query(vistas);
  console.log("Esquema y vistas de PostgreSQL disponibles.");
} finally {
  conexion.release();
  await pool.end();
}
