import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
if(process.env.DATABASE_URL||process.env.NODE_ENV==='production'||!['localhost','127.0.0.1'].includes(process.env.DB_HOST||'127.0.0.1'))throw Error('Este comando solo configura PostgreSQL local.');
const migrador=process.env.MIGRATION_DB_USER||process.env.DB_USER;
const passwordMigrador=process.env.MIGRATION_DB_PASSWORD||process.env.DB_PASSWORD;
const config={host:'127.0.0.1',port:Number(process.env.DB_PORT||5432),user:migrador,password:passwordMigrador};
const admin=new pg.Client({...config,user:process.env.LOCAL_ROLE_USER||migrador,password:process.env.LOCAL_ROLE_PASSWORD||passwordMigrador,database:'postgres'});await admin.connect();
const rol='valora_runtime';
const {rows}=await admin.query('SELECT rolname FROM pg_roles WHERE rolname=$1',[rol]);
let passwordRuntime=process.env.DB_USER===rol?process.env.DB_PASSWORD:null;
if(rows.length&&!passwordRuntime)throw Error('El rol ya existe; no se alterarán sus credenciales.');
if(!rows.length){passwordRuntime=randomBytes(48).toString('base64url');await admin.query(`CREATE ROLE ${rol} LOGIN NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${passwordRuntime}'`);}
await admin.end();
for(const database of ['valora','valora_operacion_pruebas']) {
  const db=new pg.Client({...config,database});await db.connect();
  try {
    await db.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
    await db.query(`GRANT CONNECT ON DATABASE ${database} TO ${rol}`);
    await db.query(`GRANT USAGE ON SCHEMA public TO ${rol}`);
    await db.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${rol}`);
    await db.query(`REVOKE UPDATE,DELETE ON auditoria_admin,operacion_cocina FROM ${rol}`);
    await db.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${rol}`);
    await db.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${rol}`);
    await db.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO ${rol}`);
  }finally{await db.end();}
}
let contenido=await readFile(new URL('../.env',import.meta.url),'utf8');
function fijar(nombre,valor){const rx=new RegExp('^'+nombre+'=.*$','m');contenido=rx.test(contenido)?contenido.replace(rx,nombre+'='+valor):contenido.trimEnd()+'\n'+nombre+'='+valor+'\n';}
fijar('MIGRATION_DB_USER',migrador);fijar('MIGRATION_DB_PASSWORD',passwordMigrador);fijar('DB_USER',rol);fijar('DB_PASSWORD',passwordRuntime);
await writeFile(new URL('../.env',import.meta.url),contenido);
const runtime=new pg.Client({...config,user:rol,password:passwordRuntime,database:'valora'});await runtime.connect();
try {const {rows:[r]}=await runtime.query("SELECT rolcreatedb,rolcreaterole,rolsuper,has_schema_privilege(current_user,'public','CREATE') AS crea_esquema FROM pg_roles WHERE rolname=current_user");if(r.rolcreatedb||r.rolcreaterole||r.rolsuper||r.crea_esquema)throw Error('Los permisos runtime no son mínimos.');console.log('API local con rol sin creación de bases, roles ni esquema; migrador separado.');}finally{await runtime.end();}
