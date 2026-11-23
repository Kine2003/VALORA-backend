import { transaccion } from '../datos/postgres.js';
import { SolicitudInvalida } from '../modelos/solicitud-invalida.js';
import { hashearClave } from '../lib/passwords.js';
import {productos} from '../modelos/catalogo.js';
import {validarProductos,imagenValida} from '../lib/cart.js';

// Identificadores SQL declarados por la aplicación; nunca provienen del payload.
const definiciones = {
  usuario: ['personas', 'nombre correo activo', 'id_usuario'],
  cliente: ['personas', 'nombre empresa identificacion correo telefono', 'id_cliente'],
  rol: ['personas', 'nombre descripcion activo', 'id_rol'],
  usuario_rol: ['personas', 'id_usuario id_rol', 'id_usuario id_rol'],
  sesion_usuario: ['personas', '', 'id_sesion'],
  servicio: ['cocina', 'id_servicio nombre categoria resumen descripcion etiqueta frase icono estilo activo', 'id_servicio'],
  servicio_incluye: ['cocina', 'id_servicio orden descripcion', 'id_servicio orden'],
  paquete: ['cocina', 'id_paquete id_servicio nombre descripcion imagen imagen_alt etiqueta activo mostrar_inicio orden_inicio', 'id_paquete'],
  paquete_incluye: ['cocina', 'id_paquete orden descripcion', 'id_paquete orden'],
  tipo_comida: ['cocina', 'codigo nombre activo', 'id_tipo_comida'],
  paquete_tipo_comida: ['cocina', 'id_paquete id_tipo_comida precio_base_centavos min_personas max_personas vigente_desde vigente_hasta activo', 'id_paquete id_tipo_comida'],
  opcion_paquete: ['cocina', 'id_opcion id_paquete id_tipo_comida codigo tipo nombre precio_adicional_centavos consume_inventario alergenos_declarados activo', 'id_opcion'],
  composicion_opcion: ['cocina', '', 'id_opcion id_insumo'],
  contrato: ['pedidos', 'codigo id_cliente fecha_inicio fecha_fin estado entrega direccion_servicio observaciones', 'id_contrato'],
  solicitud: ['pedidos', 'fecha_evento hora_evento direccion mensaje', 'id_solicitud'],
  servicio_contratado: ['pedidos', 'id_contrato codigo_linea id_menu_predeterminado hora_inicio hora_fin personas_habituales precio_persona_centavos activo', 'id_servicio_contratado'],
  detalle_solicitud: ['pedidos', 'notas', 'id_detalle'],
  servicio_dia: ['pedidos', 'id_servicio_contratado dia_semana', 'id_servicio_contratado dia_semana'],
  extra_solicitud: ['pedidos', '', 'id_detalle id_extra'],
  proveedor: ['inventario', 'identificacion razon_social contacto telefono correo direccion activo', 'id_proveedor'],
  proveedor_insumo: ['inventario', 'id_proveedor id_insumo precio_referencia_base plazo_entrega_dias compra_minima_base activo', 'id_proveedor id_insumo'],
  compra: ['inventario', 'observaciones fecha_entrega_prevista', 'id_compra'],
  detalle_compra: ['inventario', '', 'id_detalle_compra'],
  recepcion_compra: ['inventario', '', 'id_recepcion'],
  insumo: ['inventario', 'codigo nombre unidad_base stock_minimo requiere_vencimiento activo alergenos_declarados', 'id_insumo'],
  lote_insumo: ['inventario', 'bloqueado', 'id_lote'],
  kardex: ['inventario', '', 'id_kardex'],
  factura: ['finanzas', 'numero id_cliente razon_social_fact identificacion_fact direccion_fact correo_fact observaciones', 'id_factura'],
  detalle_factura: ['finanzas', 'id_factura id_detalle_solicitud id_solicitud_entrega tipo_linea descripcion cantidad precio_unitario_centavos descuento_centavos tasa_impuesto', 'id_detalle_factura'],
};
const secciones = {personas:'Personas y acceso',cocina:'Cocina y catálogo',pedidos:'Pedidos y contratos',inventario:'Inventario y compras',finanzas:'Facturación'};
const rolesSeccion = {personas:[],cocina:['CATALOGO','OPERACIONES'],pedidos:['OPERACIONES','FINANZAS'],inventario:['OPERACIONES'],finanzas:['FINANZAS']};
const soloEditar = new Set(['usuario','rol','solicitud','detalle_solicitud','compra','lote_insumo']);
const cache = new WeakMap();
const opcionesPermitidas={
  'opcion_paquete.tipo':['MENU','EXTRA'],
  'tipo_comida.codigo':['DESAYUNO','ALMUERZO','MERIENDA'],
  'contrato.estado':['BORRADOR','VIGENTE','SUSPENDIDO','FINALIZADO','CANCELADO'],
  'contrato.entrega':['RETIRO','DOMICILIO'],
  'solicitud.estado':['NUEVA','EN_REVISION','COTIZADA','CONFIRMADA','EN_PROCESO','ENTREGADA','RECHAZADA','CANCELADA'],
  'solicitud.entrega':['RETIRO','DOMICILIO'],
  'insumo.unidad_base':['G','ML','UNIDAD'],
  'detalle_factura.tipo_linea':['CATERING','ENTREGA'],
};
const error = (mensaje,estado=400) => Object.assign(new SolicitudInvalida(mensaje),{estado});
const objeto = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const citar = x => '"'+x+'"';
export function permiteSeccion(usuario,seccion) {return usuario?.roles?.includes('ADMINISTRADOR') || rolesSeccion[seccion]?.some(r=>usuario?.roles?.includes(r)) || false;}
function configuracion(tabla,usuario) {
  if (!Object.hasOwn(definiciones,tabla)) throw error('Tabla no disponible.',404);
  const [seccion,campos,clave]=definiciones[tabla];
  if (!permiteSeccion(usuario,seccion)) throw error('No tienes permiso para esta sección.',403);
  return {seccion,campos:campos.split(' ').filter(Boolean),claves:clave.split(' ')};
}
async function esquema(pool) {
  if (!cache.has(pool)) cache.set(pool,(async()=>{
    const {rows}=await pool.query(`SELECT table_name,column_name,data_type,is_nullable,column_default,is_identity,character_maximum_length,numeric_precision,numeric_scale
      FROM information_schema.columns WHERE table_schema='public' ORDER BY ordinal_position`);
    return {rows};
  })());
  return cache.get(pool);
}
async function camposTabla(pool,tabla,config) {
  const {rows}=await esquema(pool);
  return rows.filter(r=>r.table_name===tabla && !['password_hash','token_hash','refresh_hash','csrf_hash'].includes(r.column_name)).map(r=>{
    const opciones=opcionesPermitidas[tabla+'.'+r.column_name]||[];
    return {nombre:r.column_name,tipo:r.data_type,longitud:r.character_maximum_length,escala:r.numeric_scale,
      requerido:r.is_nullable==='NO' && !r.column_default && r.is_identity!=='YES',nullable:r.is_nullable==='YES',
      editable:config.campos.includes(r.column_name),opciones:[...new Set(opciones)],identidad:r.is_identity==='YES'};
  });
}
export async function metadatosGestion(pool,usuario) {
  const resultado=[];
  for(const [id,nombre] of Object.entries(secciones)) {
    if(!permiteSeccion(usuario,id)) continue;
    const tablas=[];
    for(const tabla of Object.keys(definiciones).filter(t=>definiciones[t][0]===id)) {
      const config=configuracion(tabla,usuario), campos=await camposTabla(pool,tabla,config);
      tablas.push({nombre:tabla,etiqueta:tabla.replaceAll('_',' '),claves:config.claves,campos,
        crear:config.campos.length>0&&!soloEditar.has(tabla),editar:config.campos.length>0,
        eliminar:config.campos.includes('activo')||['usuario_rol','servicio_incluye','paquete_incluye','servicio_dia','proveedor_insumo'].includes(tabla),
        motivo:config.campos.length?'':'Gestiona estos datos desde las operaciones de recetas, compras, producción o documentos.'});
    }
    resultado.push({id,nombre,tablas});
  }
  return {secciones:resultado};
}
export async function listarTabla(pool,tabla,parametros,usuario) {
  const config=configuracion(tabla,usuario), campos=await camposTabla(pool,tabla,config);
  const pagina=Number(parametros?.pagina??1);
  if(!Number.isSafeInteger(pagina)||pagina<1||pagina>100000) throw error('Página no válida.');
  const buscar=String(parametros?.buscar??'').trim();
  if(buscar.length>100) throw error('La búsqueda admite hasta 100 caracteres.');
  const columnas=campos.map(c=>citar(c.nombre));
  const filtro=buscar?` WHERE (${columnas.map(c=>`${c}::text ILIKE $1`).join(' OR ')})`:'';
  const valores=buscar?['%'+buscar.replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_')+'%']:[];
  const {rows:[conteo]}=await pool.query(`SELECT COUNT(*)::int AS total FROM ${citar(tabla)}${filtro}`,valores);
  const {rows}=await pool.query(`SELECT ${columnas.join(',')} FROM ${citar(tabla)}${filtro} ORDER BY ${config.claves.map(citar).join(',')} LIMIT 25 OFFSET $${valores.length+1}`,[...valores,(pagina-1)*25]);
  return {filas:rows,total:conteo.total,pagina,tamano:25};
}
export function validarValor(campo,valor) {
  if(valor===null) {if(!campo.nullable)throw error(`${campo.nombre} es obligatorio.`);return null;}
  if(campo.tipo==='smallint' && ['activo','mostrar_inicio','bloqueado','requiere_vencimiento','consume_inventario'].includes(campo.nombre)) {
    if(![0,1,true,false].includes(valor))throw error(`${campo.nombre} debe ser un indicador válido.`);return Number(valor);
  }
  if(['bigint','integer','smallint','numeric'].includes(campo.tipo)) {
    const s=String(valor);
    if(typeof valor!=='number'&&typeof valor!=='string'||!/^\d+(?:\.\d+)?$/.test(s)||s.length>24||!Number.isFinite(Number(s)))throw error(`${campo.nombre} debe ser un número no negativo.`);
    if(campo.tipo!=='numeric'&&(!/^\d+$/.test(s)||!Number.isSafeInteger(Number(s))))throw error(`${campo.nombre} debe ser un entero seguro.`);
    if(campo.tipo==='numeric'&&s.includes('.')&&s.split('.')[1].length>(campo.escala??6))throw error(`${campo.nombre} tiene demasiados decimales.`);
    return s;
  }
  if(typeof valor!=='string'||valor.length>(campo.longitud??5000)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(valor))throw error(`${campo.nombre} contiene un texto no válido.`);
  const texto=valor.trim().normalize('NFC');
  if(campo.requerido&&!texto)throw error(`${campo.nombre} es obligatorio.`);
  if(campo.opciones?.length&&!campo.opciones.includes(texto))throw error(`${campo.nombre}: selecciona una opción válida.`);
  if(campo.tipo==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(texto)||Number.isNaN(Date.parse(texto))||new Date(texto).toISOString().slice(0,10)!==texto))throw error('Fecha no válida.');
  if(campo.nombre.includes('correo')&&texto&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)&&!(campo.nombre==='correo'&&/^[a-z0-9._-]{3,100}$/.test(texto)))throw error('Correo o usuario no válido.');
  if(campo.nombre==='imagen'&&!imagenValida(texto))throw error('Usa una imagen local de assets o una URL HTTPS sin credenciales.');
  if(campo.nombre==='unidad_base'&&!['G','ML','UNIDAD'].includes(texto))throw error('La unidad base debe ser G, ML o UNIDAD.');
  return campo.nombre==='correo'?texto.toLowerCase():texto;
}
export async function auditar(db,usuario,tabla,accion,clave) {
  await db.query('INSERT INTO auditoria_admin(id_usuario,recurso,accion,clave) VALUES($1,$2,$3,$4)',[usuario.id,tabla,accion,JSON.stringify(clave)]);
}
async function protegerAdministrador(db,tabla,clave,valores,borrar) {
  if(!['usuario','usuario_rol','rol'].includes(tabla))return;
  // Orden global: cualquier modificación de acceso serializa la comprobación del último administrador.
  await db.query("SELECT pg_advisory_xact_lock(892031)");
  const {rows:[antes]}=await db.query(`SELECT COUNT(DISTINCT u.id_usuario)::int AS n FROM usuario u JOIN usuario_rol ur USING(id_usuario) JOIN rol r USING(id_rol) WHERE u.activo=1 AND r.activo=1 AND r.codigo='ADMINISTRADOR'`);
  if(!antes.n)throw error('No hay administrador activo; restaura el acceso antes de editar roles.',409);
  return async()=>{
    const {rows:[despues]}=await db.query(`SELECT COUNT(DISTINCT u.id_usuario)::int AS n FROM usuario u JOIN usuario_rol ur USING(id_usuario) JOIN rol r USING(id_rol) WHERE u.activo=1 AND r.activo=1 AND r.codigo='ADMINISTRADOR'`);
    if(!despues.n)throw error('Debes conservar al menos un administrador activo.',409);
  };
}
export async function modificarTabla(pool,tabla,metodo,datos,usuario) {
  const config=configuracion(tabla,usuario), campos=await camposTabla(pool,tabla,config);
  if(!objeto(datos)||!['POST','PATCH','DELETE'].includes(metodo))throw error('Operación no válida.');
  const crear=metodo==='POST',borrar=metodo==='DELETE';
  if(!config.campos.length||(crear&&soloEditar.has(tabla)))throw error('Usa la operación de negocio de esta sección.',403);
  if(borrar&&!config.campos.includes('activo')&&!['usuario_rol','servicio_incluye','paquete_incluye','servicio_dia','proveedor_insumo'].includes(tabla))throw error('Este registro se conserva por trazabilidad.',409);
  const entrada=borrar?{}:datos.valores;
  if(!objeto(entrada)||Object.keys(entrada).length>40)throw error('Envía los campos del formulario.');
  const valores={};
  for(const [nombre,valor]of Object.entries(entrada)) {
    const campo=campos.find(c=>c.nombre===nombre);
    if(!campo?.editable||(!crear&&config.claves.includes(nombre)))throw error(`No puedes editar el campo ${nombre}.`);
    valores[nombre]=validarValor(campo,valor);
  }
  if(!borrar&&!Object.keys(valores).length)throw error('No hay cambios que guardar.');
  const clave=crear?{}:datos.clave;
  if(!crear&&(!objeto(clave)||Object.keys(clave).length!==config.claves.length||config.claves.some(c=>!Object.hasOwn(clave,c))))throw error('Identificador incompleto.');
  const claves=crear?[]:config.claves.map(n=>validarValor(campos.find(c=>c.nombre===n),clave[n]));
  return transaccion(pool,async db=>{
    if(['factura','detalle_factura'].includes(tabla))await db.query('SELECT pg_advisory_xact_lock(892032)');
    if(['insumo','lote_insumo','opcion_paquete','paquete','paquete_tipo_comida','tipo_comida','proveedor','proveedor_insumo'].includes(tabla))await db.query('SELECT pg_advisory_xact_lock(7250419)');
    const verificar=await protegerAdministrador(db,tabla,clave,valores,borrar);
    const where=config.claves.map((n,i)=>`${citar(n)}=$${i+1}`).join(' AND ');
    if(!crear) {
      const {rows:[fila]}=await db.query(`SELECT * FROM ${citar(tabla)} WHERE ${where} FOR UPDATE`,claves);
      if(!fila)throw error('El registro ya no existe.',404);
      if(tabla==='factura'&&fila.estado!=='BORRADOR')throw error('Una factura emitida se anula; no se modifica.',409);
      if(tabla==='detalle_factura') {
        if(valores.id_factura!==undefined&&String(valores.id_factura)!==String(fila.id_factura))throw error('No se puede trasladar una línea a otra factura.',409);
        const {rows:[f]}=await db.query("SELECT estado FROM factura WHERE id_factura=$1 FOR UPDATE",[fila.id_factura]);
        if(f?.estado!=='BORRADOR')throw error('Solo se editan líneas de facturas en borrador.',409);
      }
      if(tabla==='insumo'&&valores.unidad_base&&valores.unidad_base!==fila.unidad_base){const {rows:[r]}=await db.query('SELECT EXISTS(SELECT 1 FROM lote_insumo WHERE id_insumo=$1) OR EXISTS(SELECT 1 FROM composicion_opcion WHERE id_insumo=$1) AS usado',[fila.id_insumo]);if(r.usado)throw error('La unidad de un ingrediente con recetas o movimientos no se puede cambiar.',409);}
    }
    if(tabla==='detalle_factura'&&crear){const {rows:[f]}=await db.query('SELECT estado FROM factura WHERE id_factura=$1 FOR UPDATE',[valores.id_factura]);if(f?.estado!=='BORRADOR')throw error('Selecciona una factura en borrador.',409);}
    if(crear&&tabla==='contrato')valores.id_registrado_por=usuario.id;
    if(crear&&tabla==='factura'){valores.id_emitido_por=usuario.id;valores.estado='BORRADOR';}
    let resultado;
    const retorno=campos.map(c=>citar(c.nombre)).join(',');
    if(crear){const nombres=Object.keys(valores);resultado=await db.query(`INSERT INTO ${citar(tabla)}(${nombres.map(citar).join(',')}) VALUES(${nombres.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING ${retorno}`,Object.values(valores));}
    else if(borrar&&!config.campos.includes('activo'))resultado=await db.query(`DELETE FROM ${citar(tabla)} WHERE ${where} RETURNING ${retorno}`,claves);
    else {if(borrar)valores.activo=0;const nombres=Object.keys(valores);resultado=await db.query(`UPDATE ${citar(tabla)} SET ${nombres.map((n,i)=>`${citar(n)}=$${claves.length+i+1}`).join(',')} WHERE ${where} RETURNING ${retorno}`,[...claves,...Object.values(valores)]);}
    if(verificar)await verificar();
    if(config.seccion==='cocina'){
      const catalogo=await productos(db);
      if(catalogo.productos.length)try{validarProductos(catalogo);}catch{throw error('Completa los incluidos, ofertas y opciones del catálogo y revisa sus identificadores, precios y límites antes de publicarlo.',409);}
    }
    if(['usuario','usuario_rol','rol'].includes(tabla))await db.query("UPDATE sesion_usuario SET revocada_en=NOW() WHERE revocada_en IS NULL");
    if(tabla==='composicion_opcion')throw error('Edita la receta desde Cocina.');
    await auditar(db,usuario,tabla,metodo,crear?Object.fromEntries(config.claves.map(k=>[k,resultado.rows[0][k]])):clave);
    return {fila:resultado.rows[0]};
  });
}

export async function crearCuentaAdmin(pool,datos,usuario) {
  if(!usuario.roles.includes('ADMINISTRADOR'))throw error('Requiere administración.',403);
  if(!objeto(datos)||typeof datos.password!=='string'||datos.password.length<15||datos.password.length>128)throw error('La contraseña debe tener entre 15 y 128 caracteres.');
  const nombre=validarValor({nombre:'nombre',tipo:'text',longitud:120,requerido:true},datos.nombre);
  const correo=validarValor({nombre:'correo',tipo:'text',longitud:254,requerido:true},datos.correo);
  const roles=datos.roles;
  if(!Array.isArray(roles)||!roles.length||roles.length>5||roles.some(r=>!['USUARIO','ADMINISTRADOR','CATALOGO','OPERACIONES','FINANZAS'].includes(r)))throw error('Selecciona roles válidos.');
  const hash=await hashearClave(datos.password);
  return transaccion(pool,async db=>{
    const {rows:[fila]}=await db.query('INSERT INTO usuario(nombre,correo,password_hash) VALUES($1,$2,$3) RETURNING id_usuario,nombre,correo',[nombre,correo,hash]);
    for(const rol of new Set(roles))await db.query('INSERT INTO usuario_rol(id_usuario,id_rol) SELECT $1,id_rol FROM rol WHERE codigo=$2 AND activo=1',[fila.id_usuario,rol]);
    await auditar(db,usuario,'usuario','CREAR_CUENTA',{id_usuario:fila.id_usuario});return {usuario:fila};
  });
}

export async function revocarSesionAdmin(pool,id,usuario) {
  if(!usuario.roles.includes('ADMINISTRADOR'))throw error('Requiere administración.',403);
  if(!/^[1-9]\d{0,15}$/.test(String(id)))throw error('Sesión no válida.');
  return transaccion(pool,async db=>{await db.query('UPDATE sesion_usuario SET revocada_en=NOW() WHERE id_sesion=$1',[id]);await auditar(db,usuario,'sesion_usuario','REVOCAR',{id_sesion:id});return {revocada:true};});
}

export async function cambiarFactura(pool,id,accion,usuario) {
  if(!permiteSeccion(usuario,'finanzas'))throw error('No tienes permiso de facturación.',403);
  if(!/^[1-9]\d{0,15}$/.test(String(id))||!['emitir','anular'].includes(accion))throw error('Operación de factura no válida.');
  return transaccion(pool,async db=>{
    await db.query('SELECT pg_advisory_xact_lock(892032)');
    const {rows:[fila]}=await db.query('SELECT * FROM factura WHERE id_factura=$1 FOR UPDATE',[id]);
    if(!fila)throw error('Factura no encontrada.',404);
    if(accion==='emitir') {
      if(fila.estado!=='BORRADOR')throw error('Solo se emiten facturas en borrador.',409);
      const {rows:lineas}=await db.query('SELECT * FROM detalle_factura WHERE id_factura=$1 ORDER BY id_detalle_factura FOR UPDATE',[id]);
      if(!lineas.length)throw error('Agrega al menos una línea antes de emitir.',409);
      const referencias=lineas.map(l=>l.id_detalle_solicitud?'detalle:'+l.id_detalle_solicitud:'entrega:'+l.id_solicitud_entrega);
      if(new Set(referencias).size!==referencias.length)throw error('Una línea de pedido aparece repetida en esta factura.',409);
      const solicitudes=await db.query(`SELECT DISTINCT s.id_solicitud,s.estado,s.id_cliente FROM detalle_factura f
        LEFT JOIN detalle_solicitud d ON d.id_detalle=f.id_detalle_solicitud
        JOIN solicitud s ON s.id_solicitud=COALESCE(d.id_solicitud,f.id_solicitud_entrega)
        WHERE f.id_factura=$1`,[id]);
      if(solicitudes.rows.some(s=>String(s.id_cliente)!==String(fila.id_cliente)||['CANCELADA','RECHAZADA'].includes(s.estado)))throw error('Revisa el cliente y el estado de los pedidos facturados.',409);
      const {rows:[duplicado]}=await db.query(`SELECT EXISTS(SELECT 1 FROM detalle_factura a JOIN detalle_factura b ON
        (a.id_detalle_solicitud=b.id_detalle_solicitud OR a.id_solicitud_entrega=b.id_solicitud_entrega)
        JOIN factura f ON f.id_factura=b.id_factura WHERE a.id_factura=$1 AND b.id_factura<>$1 AND f.estado='EMITIDA') AS existe`,[id]);
      if(duplicado.existe)throw error('Una línea ya pertenece a otra factura emitida.',409);
    } else if(fila.estado!=='EMITIDA')throw error('Solo se anulan facturas emitidas.',409);
    await db.query('UPDATE factura SET estado=$2,id_emitido_por=$3 WHERE id_factura=$1',[id,accion==='emitir'?'EMITIDA':'ANULADA',usuario.id]);
    await auditar(db,usuario,'factura',accion.toUpperCase(),{id_factura:id});return {id,estado:accion==='emitir'?'EMITIDA':'ANULADA'};
  });
}
