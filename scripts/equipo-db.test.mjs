import {loadEnvFile} from 'node:process';
import {randomUUID} from 'node:crypto';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {confirmarEntrega,panelEquipo} from '../servicios/equipo.js';
import {metadatosGestion,listarTabla,modificarTabla} from '../servicios/gestion.js';
loadEnvFile(new URL('../.env',import.meta.url));
const pool=new pg.Pool({host:'127.0.0.1',port:5432,database:'valora_operacion_pruebas',user:process.env.MIGRATION_DB_USER,password:process.env.MIGRATION_DB_PASSWORD,ssl:false});
assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,'valora_operacion_pruebas');
const tag=randomUUID();
const {rows:[u]}=await pool.query('INSERT INTO usuario(nombre,correo,password_hash,activo) VALUES($1,$2,$3,0) RETURNING id_usuario',['Prueba entregas','entrega-'+tag+'@example.invalid','sin-acceso']);
const {rows:[c]}=await pool.query('INSERT INTO cliente(nombre,correo,telefono) VALUES($1,$2,$3) RETURNING id_cliente',['Cliente sintético','cliente-'+tag+'@example.invalid','0000000000']);
let pedido;
after(async()=>{try{await pool.query('DELETE FROM auditoria_admin WHERE id_usuario=$1',[u.id_usuario]);if(pedido)await pool.query('DELETE FROM solicitud WHERE id_solicitud=$1',[pedido]);await pool.query('DELETE FROM cliente WHERE id_cliente=$1',[c.id_cliente]);await pool.query('DELETE FROM usuario WHERE id_usuario=$1',[u.id_usuario]);}finally{await pool.end();}});
const actor={id:String(u.id_usuario),roles:['CONDUCTOR']};

test('dos confirmaciones concurrentes generan una sola entrega y auditoría',async()=>{
 const {rows:[s]}=await pool.query("INSERT INTO solicitud(id_cliente,tipo,estado,fecha_evento,hora_evento,entrega,direccion) VALUES($1,'PEDIDO','EN_PROCESO',(CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil')::date,'12:00','DOMICILIO','Dirección sintética') RETURNING id_solicitud",[c.id_cliente]);pedido=s.id_solicitud;
 const p=await panelEquipo(pool,actor);const entrega=p.entregas.solicitudes.find(x=>x.id===String(pedido));assert(entrega);assert.equal(entrega.telefono,'0000000000');assert.equal(entrega.totalCentavos,undefined);
 const r=await Promise.allSettled([confirmarEntrega(pool,String(pedido),{estado:'ENTREGADA'},actor),confirmarEntrega(pool,String(pedido),{estado:'ENTREGADA'},actor)]);
 assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.find(x=>x.status==='rejected').reason.estado,409);
 assert.equal((await pool.query('SELECT estado FROM solicitud WHERE id_solicitud=$1',[pedido])).rows[0].estado,'ENTREGADA');
 assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM auditoria_admin WHERE id_usuario=$1 AND accion='ENTREGA'",[u.id_usuario])).rows[0].n,1);
});

test('HSE consulta vencimientos y alérgenos sin escribir ni ver cuentas',async()=>{
 const hse={id:String(u.id_usuario),roles:['HSE']};const meta=await metadatosGestion(pool,hse);const insumo=meta.secciones.flatMap(s=>s.tablas).find(t=>t.nombre==='insumo');assert(insumo.campos.some(c=>c.nombre==='alergenos_declarados'));assert.equal(insumo.editar,false);
 await listarTabla(pool,'lote_insumo',{},hse);
 await assert.rejects(modificarTabla(pool,'insumo','PATCH',{clave:{id_insumo:'1'},valores:{activo:0}},hse),e=>e.estado===403);
 await assert.rejects(listarTabla(pool,'usuario',{},hse),e=>e.estado===403);
});
