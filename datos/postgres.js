import pg from "pg";

const { Pool } = pg;

export const configuracionPostgres = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || "valora",
      user: process.env.DB_USER || "valora_app",
      password: process.env.DB_PASSWORD,
      ssl: false,
    };

export async function transaccion(pool, operar) {
  const conexion = await pool.connect();
  try {
    await conexion.query("BEGIN");
    const resultado = await operar(conexion);
    await conexion.query("COMMIT");
    return resultado;
  } catch (error) {
    await conexion.query("ROLLBACK");
    throw error;
  } finally {
    conexion.release();
  }
}

export const conectar = () => new Pool(configuracionPostgres);

export const comprobarConexion = pool => pool.query("SELECT 1 FROM servicio");
