import { readFile } from "node:fs/promises";
import pg from "pg";
import { configuracionPostgres,configuracionDesdeUrl } from "./datos/postgres.js";

const { Pool } = pg;
const configMigracion=process.env.MIGRATION_DATABASE_URL
  ? configuracionDesdeUrl(process.env.MIGRATION_DATABASE_URL)
  : {...configuracionPostgres,...(process.env.MIGRATION_DB_USER?{user:process.env.MIGRATION_DB_USER,password:process.env.MIGRATION_DB_PASSWORD}:{})};
const pool = new Pool(configMigracion);
const conexion = await pool.connect();
try {
  await conexion.query('BEGIN');
  await conexion.query('SELECT pg_advisory_xact_lock(8911023)');
  const { rows } = await conexion.query("SELECT to_regclass('public.servicio') AS tabla");
  if (!rows[0].tabla) {
    const esquema = await readFile(new URL("./sql/esquema-postgres.sql", import.meta.url), "utf8");
    await conexion.query(esquema);
  } else {
    await conexion.query(`
      ALTER TABLE paquete ADD COLUMN IF NOT EXISTS mostrar_inicio SMALLINT NOT NULL DEFAULT 1;
      ALTER TABLE paquete ADD COLUMN IF NOT EXISTS orden_inicio INTEGER NOT NULL DEFAULT 100;
      ALTER TABLE paquete ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);
      ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS estado_pago VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE_PAGO';
      ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(20);
      ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS pagado_en TIMESTAMP(6);
      ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS referencia_pago VARCHAR(100);
      DO $$ BEGIN
        ALTER TABLE solicitud ADD CONSTRAINT ck_solicitud_estado_pago
          CHECK (estado_pago IN ('PENDIENTE_PAGO','PAGO_EN_REVISION','PAGADO'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
      DO $$ BEGIN
        ALTER TABLE paquete ADD CONSTRAINT ck_paquete_mostrar_inicio CHECK (mostrar_inicio IN (0,1));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }
  const vistas = await readFile(new URL("./sql/vistas-postgres.sql", import.meta.url), "utf8");
  await conexion.query(vistas);
  for (const archivo of ['actualizacion-gestion.sql', 'actualizacion-auth.sql', 'actualizacion-operacion.sql']) {
    await conexion.query(await readFile(new URL('./sql/' + archivo, import.meta.url), 'utf8'));
  }
  await conexion.query('COMMIT');
  console.log("Esquema y vistas de PostgreSQL disponibles.");
} catch (error) {
  await conexion.query('ROLLBACK');
  throw error;
} finally {
  conexion.release();
  await pool.end();
}
