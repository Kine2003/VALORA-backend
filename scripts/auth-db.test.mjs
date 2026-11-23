import { loadEnvFile } from 'node:process';
import { randomBytes } from 'node:crypto';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

// Solo la copia local autorizada, aunque .env apunte a otra base.
loadEnvFile(new URL('../.env', import.meta.url));
delete process.env.DATABASE_URL;
process.env.DB_HOST='127.0.0.1';
process.env.DB_PORT='5432';
process.env.DB_NAME='valora_operacion_pruebas';
process.env.JWT_SECRET=randomBytes(48).toString('base64url');
const {default:pg}=await import('pg');
const {registrarCliente,iniciarSesion,obtenerSesion,cerrarSesion,renovarSesion}=await import('../servicios/autenticacion.js');
const {huellaToken,firmarAcceso}=await import('../lib/autorizacion.js');
const pool=new pg.Pool({host:'127.0.0.1',port:5432,database:'valora_operacion_pruebas',user:process.env.DB_USER||'valora_app',password:process.env.DB_PASSWORD,ssl:false});
const sufijo=randomBytes(10).toString('hex');
const correo=`auth-${sufijo}@example.invalid`;
const password=randomBytes(24).toString('base64url');
const contexto={ip:`prueba-auth-${sufijo}`};
const ids=[];
let registro;

after(async()=>{
 try {
  if(ids.length){
   await pool.query('DELETE FROM sesion_usuario WHERE id_usuario=ANY($1::bigint[])',[ids]);
   await pool.query('DELETE FROM usuario_rol WHERE id_usuario=ANY($1::bigint[])',[ids]);
   await pool.query('DELETE FROM usuario WHERE id_usuario=ANY($1::bigint[]) AND correo=$2',[ids,correo]);
  }
  await pool.query('DELETE FROM limite_autenticacion WHERE clave=ANY($1::text[])',[[huellaToken('cuenta:'+correo),huellaToken('ip:'+contexto.ip)]]);
 }finally{await pool.end();}
});
assert.equal((await pool.query('SELECT current_database() AS nombre')).rows[0].nombre,'valora_operacion_pruebas');
test('registro real ignora elevación, guarda scrypt fuerte y hashes de sesión',async()=>{
 registro=await registrarCliente(pool,{nombre:'Prueba autenticación',correo,telefono:'0999999999',password,roles:['ADMINISTRADOR'],activo:1},contexto);
 ids.push(registro.usuario.id);
 assert.deepEqual(new Set(registro.usuario.roles),new Set(['USUARIO','CLIENTE']));
 const {rows:[fila]}=await pool.query('SELECT password_hash FROM usuario WHERE id_usuario=$1',[registro.usuario.id]);
 assert.match(fila.password_hash,/^scrypt\$v2\$/u);
 const {rows:[sesion]}=await pool.query('SELECT token_hash,refresh_hash FROM sesion_usuario WHERE id_usuario=$1',[registro.usuario.id]);
 assert.match(sesion.token_hash,/^[a-f0-9]{64}$/u);
 assert.equal(sesion.refresh_hash,huellaToken(registro.refresh));
 assert.equal((await obtenerSesion(pool,registro.token)).id,registro.usuario.id);
});
test('login real rechaza contraseña incorrecta y roles se consultan en servidor',async()=>{
 await assert.rejects(iniciarSesion(pool,{correo,password:'incorrecta'},contexto),{status:401});
 const login=await iniciarSesion(pool,{correo,password,roles:['ADMINISTRADOR']},contexto);
 assert.equal(login.usuario.roles.includes('ADMINISTRADOR'),false);
 await pool.query("INSERT INTO usuario_rol(id_usuario,id_rol) SELECT $1,id_rol FROM rol WHERE codigo='CATALOGO' ON CONFLICT DO NOTHING",[registro.usuario.id]);
 assert.equal((await obtenerSesion(pool,login.token)).roles.includes('CATALOGO'),true);
 await pool.query("DELETE FROM usuario_rol WHERE id_usuario=$1 AND id_rol IN (SELECT id_rol FROM rol WHERE codigo='CATALOGO')",[registro.usuario.id]);
 assert.equal((await obtenerSesion(pool,login.token)).roles.includes('CATALOGO'),false);
 await cerrarSesion(pool,login.token,login.refresh);
 assert.equal(await obtenerSesion(pool,login.token),null);
 await assert.rejects(renovarSesion(pool,login.refresh),{status:401});
});
test('rotación real invalida acceso anterior y reutilización revoca toda la familia',async()=>{
 const siguiente=await renovarSesion(pool,registro.refresh);
 assert.notEqual(siguiente.refresh,registro.refresh);
 assert.equal(await obtenerSesion(pool,registro.token),null);
 assert.equal((await obtenerSesion(pool,siguiente.token)).id,registro.usuario.id);
 await assert.rejects(renovarSesion(pool,registro.refresh),{status:401});
 assert.equal(await obtenerSesion(pool,siguiente.token),null);
 await assert.rejects(renovarSesion(pool,siguiente.refresh),{status:401});
});
test('dos renovaciones concurrentes producen un solo refresh y revocan por reutilización',async()=>{
 const login=await iniciarSesion(pool,{correo,password},contexto);
 const resultados=await Promise.allSettled([renovarSesion(pool,login.refresh),renovarSesion(pool,login.refresh)]);
 assert.equal(resultados.filter(x=>x.status==='fulfilled').length,1);
 const rechazada=resultados.find(x=>x.status==='rejected');
 assert.equal(rechazada.reason.status,401);
 const ganadora=resultados.find(x=>x.status==='fulfilled').value;
 assert.equal(await obtenerSesion(pool,ganadora.token),null);
 await assert.rejects(renovarSesion(pool,ganadora.refresh),{status:401});
});
test('JWT firmado sin sesión, expirado y alterado son rechazados contra BD real',async()=>{
 assert.equal(await obtenerSesion(pool,await firmarAcceso(registro.usuario.id,'sin-sesion')),null);
 assert.equal(await obtenerSesion(pool,await firmarAcceso(registro.usuario.id,'sin-sesion',-1)),null);
 assert.equal(await obtenerSesion(pool,registro.token.slice(0,-8)+'AAAAAAAA'),null);
});
test('refresh preserves absolute family expiry instead of extending seven days',async()=>{
 const login=await iniciarSesion(pool,{correo,password},contexto);
 const {rows:[original]}=await pool.query("UPDATE sesion_usuario SET expira_en=NOW()+INTERVAL '2 days' WHERE refresh_hash=$1 RETURNING expira_en",[huellaToken(login.refresh)]);
 const rotated=await renovarSesion(pool,login.refresh);
 const {rows:[nueva]}=await pool.query('SELECT expira_en FROM sesion_usuario WHERE refresh_hash=$1',[huellaToken(rotated.refresh)]);
 assert.equal(nueva.expira_en.getTime(),original.expira_en.getTime());
 await cerrarSesion(pool,rotated.token,rotated.refresh);
});
