import { randomBytes } from 'node:crypto';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve, dirname, basename, relative, isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import pg from 'pg';
import { ROLES_EQUIPO } from '../lib/equipo.js';
import { hashearClave, verificarClave } from '../lib/passwords.js';
import { configuracionPostgres, configuracionDesdeUrl, transaccion } from '../datos/postgres.js';

// Este archivo de salida es una entrega privada; nunca debe estar bajo el frontend.
const usuarios = {
  GERENTE_NEGOCIOS:'gerente', JEFE_OPERACIONES:'jefe.operaciones', HSE:'hse',
  COMPRAS_LOGISTICA:'compras', VENTAS_MARKETING:'ventas', CONTADORA:'contadora',
  CHEF_SUPERVISOR:'chef', NUTRICIONISTA:'nutricionista', COCINERO:'cocinero',
  PASTELERO:'pastelero', AYUDANTE_BODEGA:'ayudante.bodega', AYUDANTE_COCINA:'ayudante.cocina',
  POSILLERO:'posillero', LIMPIEZA:'limpieza', CONDUCTOR:'conductor',
};

export async function aprovisionarEquipo(pool, archivo) {
  const solicitado = resolve(archivo);
  const destino = resolve(await realpath(dirname(solicitado)),basename(solicitado));
  const raizBackend=fileURLToPath(new URL('..',import.meta.url));
  const raices=[resolve(raizBackend,'..'),resolve(raizBackend,process.env.FRONTEND_DIR||'public')];
  for(const raiz of raices) {
    let real=raiz; try{real=await realpath(raiz);}catch(e){if(e.code!=='ENOENT')throw e;}
    const dentro=relative(real,destino);
    if(!dentro || (!dentro.startsWith('..')&&!isAbsolute(dentro))) throw Error('El archivo privado debe estar fuera de los repositorios y de la carpeta publicada.');
  }
  if (!destino.endsWith('.txt')) throw Error('Elige un archivo privado .txt.');
  let existente = null;
  try { existente = await readFile(destino, 'utf8'); } catch (e) { if(e.code!=='ENOENT') throw e; }
  const cuentas = ROLES_EQUIPO.map(rol => {
    if(!usuarios[rol.codigo]) throw Error('Falta definir el usuario de un cargo.');
    const correo = usuarios[rol.codigo]+'.valora.1';
    const patron = new RegExp('Usuario: '+correo.replaceAll('.','\\.')+'\\r?\\nContraseña: ([^\\r\\n]+)');
    const anterior = existente?.match(patron)?.[1];
    if(existente && !anterior) throw Error('El archivo privado existente está incompleto; no se cambiarán cuentas.');
    return {...rol,correo,password:anterior || randomBytes(21).toString('base64url')};
  });
  const texto = '\uFEFFVÁLORA — ACCESOS PRIVADOS\r\n'+
    'Página: https://valora-api-9thl.onrender.com/\r\n'+
    'Fecha: 23 de noviembre de 2026\r\n'+
    'Abre la página, pulsa Ingresar y usa el usuario y contraseña del cargo.\r\n'+
    'Cada cuenta abre su panel. Conserva este archivo en privado.\r\n\r\n'+
    cuentas.map(c=>c.nombre+'\r\nUsuario: '+c.correo+'\r\nContraseña: '+c.password+'\r\n').join('\r\n')+
    '\r\nAdministrador: admin.valora.1 conserva su contraseña y acceso completos.\r\n';
  // Reservar la entrega antes de crear cuentas evita generar accesos sin poder entregar las claves.
  if(!existente) await writeFile(destino,texto,{flag:'wx',mode:0o600});
  try {
    await transaccion(pool, async db=>{
      await db.query('SELECT pg_advisory_xact_lock(892033)');
      for(const c of cuentas) {
        const {rows:[rol]}=await db.query('SELECT id_rol FROM rol WHERE codigo=$1 AND activo=1',[c.codigo]);
        if(!rol) throw Error('Ejecuta primero la migración de roles.');
        const {rows:[previo]}=await db.query('SELECT id_usuario,password_hash,activo FROM usuario WHERE correo=$1 FOR UPDATE',[c.correo]);
        if(previo) {
          if(!existente || previo.activo!==1 || !await verificarClave(c.password,previo.password_hash)) {
            throw Error('Una cuenta ya existe con otras credenciales; no se sobrescribirá.');
          }
          const {rows:asignaciones}=await db.query('SELECT id_rol FROM usuario_rol WHERE id_usuario=$1',[previo.id_usuario]);
          if(asignaciones.length!==1 || String(asignaciones[0].id_rol)!==String(rol.id_rol)) throw Error('Los permisos existentes difieren; revisar manualmente.');
          continue;
        }
        const {rows:[u]}=await db.query('INSERT INTO usuario(nombre,correo,password_hash,activo,correo_verificado) VALUES($1,$2,$3,1,1) RETURNING id_usuario',[c.nombre+' Válora',c.correo,await hashearClave(c.password)]);
        await db.query('INSERT INTO usuario_rol(id_usuario,id_rol) VALUES($1,$2)',[u.id_usuario,rol.id_rol]);
      }
    });
  } catch(e) {
    // Una desconexión durante COMMIT deja un resultado incierto. Conservar las
    // claves permite reintentar sin perder el acceso a cuentas ya confirmadas.
    throw e;
  }
  return {cuentas:cuentas.length,archivo:destino};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(!process.argv[2]) throw Error('Indica la ruta del archivo privado .txt.');
  const config=process.env.MIGRATION_DATABASE_URL ? configuracionDesdeUrl(process.env.MIGRATION_DATABASE_URL) : {...configuracionPostgres,...(process.env.MIGRATION_DB_USER?{user:process.env.MIGRATION_DB_USER,password:process.env.MIGRATION_DB_PASSWORD}:{})};
  const pool=new pg.Pool(config);
  try { console.log(JSON.stringify(await aprovisionarEquipo(pool,process.argv[2]))); }
  catch(e) { console.error('No se completó el aprovisionamiento:',e.code||e.message); process.exitCode=1; }
  finally { await pool.end(); }
}
