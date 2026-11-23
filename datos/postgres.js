import pg from "pg";

const { Pool } = pg;

export function configuracionDesdeUrl(valor) {
  const url=new URL(valor);
  if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('La conexión debe usar PostgreSQL.');
  // Parsear campos evita que sslmode de la URL anule la verificación TLS de la aplicación.
  return {host:url.hostname.replace(/^\[|\]$/g,''),port:Number(url.port||5432),database:decodeURIComponent(url.pathname.slice(1)),
    user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),
    ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:true,...(process.env.DB_SSL_CA?{ca:process.env.DB_SSL_CA.split('\\n').join('\n')}:{})}:false};
}
export const configuracionPostgres = process.env.DATABASE_URL
  ? configuracionDesdeUrl(process.env.DATABASE_URL)
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
