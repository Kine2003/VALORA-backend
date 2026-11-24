import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES_EQUIPO, permisosEquipo, accesoTablaEquipo } from '../lib/equipo.js';
import { panelEquipo, confirmarEntrega } from '../servicios/equipo.js';
import { crearServidor } from '../servidor.js';
const usuario=roles=>({id:'1',roles});
test('roles are distinct and accumulated without granting unknown roles',()=>{
 assert.equal(ROLES_EQUIPO.length,15);assert.equal(new Set(ROLES_EQUIPO.map(r=>r.codigo)).size,15);
 assert.deepEqual(permisosEquipo(usuario(['DESCONOCIDO','USUARIO'])),[]);
 assert(permisosEquipo(usuario(['COCINERO','CONDUCTOR'])).includes('produccion'));
 assert(permisosEquipo(usuario(['COCINERO','CONDUCTOR'])).includes('entregas'));
 for(const r of ROLES_EQUIPO){assert.equal(accesoTablaEquipo(usuario([r.codigo]),'usuario'),null);assert.equal(accesoTablaEquipo(usuario([r.codigo]),'sesion_usuario'),null);}
 assert.deepEqual(accesoTablaEquipo(usuario(['NUTRICIONISTA']),'opcion_paquete'),['alergenos_declarados']);
});
test('daily work has no kitchen, customer or financial data for cleaning roles',async()=>{
 const db={query:async sql=>{assert(!sql.includes('cliente'));return {rows:[]};}};
 const p=await panelEquipo(db,usuario(['LIMPIEZA']));assert.deepEqual(p.permisos,[]);assert.deepEqual(p.trabajo,{solicitudes:[]});assert.equal(p.cocina,undefined);assert.equal(p.entregas,undefined);
 await assert.rejects(panelEquipo(db,usuario(['UNKNOWN'])),e=>e.estado===403);
});
test('delivery allows only controlled transition and rolls back rejected writes',async()=>{
 let committed=false,audited=false,changed=false;
 const client={query:async(sql)=>{
 if(sql.startsWith('SELECT tipo'))return {rows:[{tipo:'PEDIDO',entrega:'DOMICILIO',estado:'EN_PROCESO'}]};
 if(sql.startsWith('UPDATE'))changed=true;if(sql.startsWith('INSERT INTO auditoria'))audited=true;if(sql==='COMMIT')committed=true;return {rows:[{id_solicitud:'1',estado:'ENTREGADA'}]};},release(){}};
 const db={connect:async()=>client};
 await assert.rejects(confirmarEntrega(db,'1',{estado:'ENTREGADA'},usuario(['LIMPIEZA'])),e=>e.estado===403);
 await assert.rejects(confirmarEntrega(db,'1',{estado:'CANCELADA'},usuario(['CONDUCTOR'])),e=>e.estado===400);
 assert.deepEqual(await confirmarEntrega(db,'1',{estado:'ENTREGADA'},usuario(['CONDUCTOR'])),{id:'1',estado:'ENTREGADA'});assert(committed&&audited&&changed);
});
test('HTTP enforces every new role capability before calling services',async()=>{
 const previo=process.env.APP_ORIGIN;process.env.APP_ORIGIN='http://127.0.0.1:3002';
 let calls=0; let current=usuario(['USUARIO']);
 const server=crearServidor({obtenerSesion:async()=>current,crearPlato:async()=>{calls++;return {};},panelEquipo:async()=>({}),metadatosGestion:async()=>({})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
 for(const r of [...ROLES_EQUIPO.map(x=>x.codigo),'UNKNOWN','USUARIO','ADMINISTRADOR']){
 current=usuario([r]);const res=await fetch(base+'/api/v1/equipo/platos',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json',origin:'http://127.0.0.1:3002'},body:'{}'});
 assert.equal(res.status,['CHEF_SUPERVISOR','ADMINISTRADOR'].includes(r)?200:403,r);
 }
 assert.equal(calls,2);
 current=usuario(['CONDUCTOR']);assert.equal((await fetch(base+'/api/v1/admin/cocina',{headers:{authorization:'Bearer test'}})).status,403);
 }finally{if(previo===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=previo;await new Promise(r=>server.close(r));}
});

test('all fifteen roles receive only authorized metadata tables',async()=>{
 const {metadatosGestion}=await import('../servicios/gestion.js');
 const db={query:async()=>({rows:[]})};
 for(const rol of ROLES_EQUIPO){
 const m=await metadatosGestion(db,usuario([rol.codigo]));
 for(const section of m.secciones)for(const tabla of section.tablas){assert.notEqual(accesoTablaEquipo(usuario([rol.codigo]),tabla.nombre),null);assert.equal(tabla.eliminar,false);}
 }
});

test('mixed legacy and new roles preserve the union of table access',async()=>{
 const {metadatosGestion,listarTabla}=await import('../servicios/gestion.js');
 const db={query:async sql=>({rows:sql.includes('COUNT')?[{total:0}]:[]})};
 const u=usuario(['FINANZAS','HSE']);const m=await metadatosGestion(db,u);
 assert(m.secciones.flatMap(s=>s.tablas).some(t=>t.nombre==='insumo'));
 assert(m.secciones.flatMap(s=>s.tablas).some(t=>t.nombre==='factura'));
 const tabla=m.secciones.flatMap(s=>s.tablas).find(t=>t.nombre==='insumo');assert.equal(tabla.editar,false);
 await listarTabla(db,'insumo',{},u);
});

test('unknown additional roles cannot reveal daily work',async()=>{
 const db={query:async()=>({rows:[]})};
 for(const codigo of ['CONDUCTOR','CONTADORA'])assert.equal((await panelEquipo(db,usuario([codigo,'UNKNOWN']))).trabajo,undefined);
});
test('mixed team and legacy roles expose accumulated capabilities',async()=>{
 const {permiteEquipo}=await import('../lib/equipo.js');
 const u=usuario(['CATALOGO','CONDUCTOR']);assert(permisosEquipo(u).includes('catalogo'));assert(permisosEquipo(u).includes('entregas'));assert(permisosEquipo(u).includes('tablas'));assert(permiteEquipo(u,'recetas'));assert(!permiteEquipo(u,'compras'));
 const p=await panelEquipo({query:async sql=>({rows:[]})},usuario(['FINANZAS','CONDUCTOR']));assert(p.permisos.includes('finanzas'));assert(p.permisos.includes('entregas'));
});
test('sales and operations chief can change state through both authorized routes',async()=>{
 const previo=process.env.APP_ORIGIN;process.env.APP_ORIGIN='http://127.0.0.1:3002';let current;let calls=0;
 const server=crearServidor({obtenerSesion:async()=>current,actualizarEstado:async(id,estado)=>{calls++;return {id,estado};}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{for(const rol of ['VENTAS_MARKETING','JEFE_OPERACIONES','CONDUCTOR'])for(const area of ['admin','equipo']){
 current=usuario([rol]);const res=await fetch(base+`/api/v1/${area}/solicitudes/1`,{method:'PATCH',headers:{authorization:'Bearer test','content-type':'application/json',origin:'http://127.0.0.1:3002'},body:JSON.stringify({estado:'EN_REVISION'})});assert.equal(res.status,rol==='CONDUCTOR'?403:200,rol+' '+area);
 }assert.equal(calls,4);}finally{if(previo===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=previo;await new Promise(r=>server.close(r));}
});
