import mysql from "mysql2/promise";

export const configuracionMySQL = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || "valora",
  user: process.env.DB_USER || "valora_app",
  password: process.env.DB_PASSWORD,
  charset: "utf8mb4",
  timezone: "Z",
  supportBigNumbers: true,
  bigNumberStrings: true,
};

export async function transaccion(pool, operar) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();
    const resultado = await operar(conexion);
    await conexion.commit();
    return resultado;
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

export const conectar = () => mysql.createPool(configuracionMySQL);

export const comprobarConexion = pool => pool.query("SELECT 1 FROM servicio LIMIT 1");
