import { ROLES_EQUIPO, permisosEquipo, permiteEquipo } from '../lib/equipo.js';
import { consultarCocina } from './cocina.js';
import { transaccion } from '../datos/postgres.js';
import { auditar } from './gestion.js';
import { cambiarEstadoSolicitud } from '../repositorios/admin.js';
import { SolicitudInvalida } from '../modelos/solicitud-invalida.js';
const error=(m,e=403)=>Object.assign(new SolicitudInvalida(m),{estado:e});
export async function panelEquipo(pool,usuario) {
 const perfiles=ROLES_EQUIPO.filter(r=>usuario?.roles?.includes(r.codigo));
 if(!perfiles.length&&!usuario?.roles?.includes('ADMINISTRADOR'))throw error('No tienes acceso al panel de equipo.');
 const permisos=usuario.roles.includes('ADMINISTRADOR')?[...new Set(ROLES_EQUIPO.flatMap(r=>r.permisos))]:permisosEquipo(usuario);
 const perfil=perfiles[0]||{codigo:'ADMINISTRADOR',nombre:'Administrador',descripcion:'Administración completa'};
 const panel={perfil:{codigo:perfil.codigo,nombre:perfil.nombre,descripcion:perfil.descripcion},permisos};
 if(permisos.some(p=>['ingredientes','recetas','platos','produccion','compras','planificar'].includes(p))) {
  const {proveedores,...cocina}=await consultarCocina(pool);
  panel.cocina={...cocina,...(permisos.includes('compras')?{proveedores}:{})};
 }
 if(usuario.roles.some(r=>['ADMINISTRADOR','OPERACIONES','GERENTE_NEGOCIOS','JEFE_OPERACIONES','HSE','COMPRAS_LOGISTICA','VENTAS_MARKETING','CHEF_SUPERVISOR','NUTRICIONISTA','COCINERO','PASTELERO','AYUDANTE_BODEGA','AYUDANTE_COCINA','POSILLERO','LIMPIEZA'].includes(r)))panel.trabajo={solicitudes:(await pool.query(`SELECT s.id_solicitud::text AS id,s.estado,s.fecha_evento::text AS "fechaEvento",s.hora_evento AS "horaEvento",COALESCE(s.personas,(SELECT SUM(d.personas) FROM detalle_solicitud d WHERE d.id_solicitud=s.id_solicitud))::text AS personas,COALESCE((SELECT json_agg(json_build_object('menu',o.nombre,'personas',d.personas::text)) FROM detalle_solicitud d JOIN opcion_paquete o ON o.id_opcion=d.id_menu WHERE d.id_solicitud=s.id_solicitud),'[]'::json) AS lineas FROM solicitud s WHERE s.fecha_evento=(CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil')::date AND s.estado IN ('CONFIRMADA','EN_PROCESO') ORDER BY s.hora_evento,s.id_solicitud LIMIT 100`)).rows};
 if(permisos.includes('entregas'))panel.entregas={solicitudes:(await pool.query(`SELECT id_solicitud::text AS id,estado,fecha_evento::text AS "fechaEvento",hora_evento AS "horaEvento",direccion,(SELECT c.nombre FROM cliente c WHERE c.id_cliente=solicitud.id_cliente) AS cliente,(SELECT c.telefono FROM cliente c WHERE c.id_cliente=solicitud.id_cliente) AS telefono FROM solicitud WHERE tipo='PEDIDO' AND entrega='DOMICILIO' AND estado='EN_PROCESO' ORDER BY fecha_evento,hora_evento,id_solicitud LIMIT 100`)).rows};
 if(usuario.roles.some(r=>['ADMINISTRADOR','GERENTE_NEGOCIOS','JEFE_OPERACIONES'].includes(r)))panel.resumen={solicitudes:(await pool.query('SELECT estado,COUNT(*)::int AS total FROM solicitud GROUP BY estado ORDER BY estado')).rows};
 return panel;
}
export async function confirmarEntrega(pool,id,datos,usuario) {
 if(!permiteEquipo(usuario,'entregas'))throw error('No tienes permiso para confirmar entregas.');
 if(!/^[1-9]\d{0,17}$/.test(String(id))||!datos||Object.keys(datos).length!==1||datos.estado!=='ENTREGADA')throw error('Solo se permite confirmar una entrega.',400);
 return transaccion(pool,async db=>{
  const {rows:[s]}=await db.query('SELECT tipo,entrega,estado FROM solicitud WHERE id_solicitud=$1 FOR UPDATE',[id]);
  if(!s)throw error('Entrega no encontrada.',404);
  if(s.tipo!=='PEDIDO'||s.entrega!=='DOMICILIO'||s.estado!=='EN_PROCESO')throw error('La solicitud no admite confirmar la entrega.',409);
  await cambiarEstadoSolicitud(db,id,'ENTREGADA',usuario.id);
  await auditar(db,usuario,'solicitud','ENTREGA',{id_solicitud:String(id),anterior:s.estado,nuevo:'ENTREGADA'});
  return {id:String(id),estado:'ENTREGADA'};
 });
}
