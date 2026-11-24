// Cargos independientes de los roles heredados de administración.
export const ROLES_EQUIPO = [
  {
    "codigo": "GERENTE_NEGOCIOS",
    "nombre": "Gerente de negocios",
    "descripcion": "Supervisión del negocio",
    "permisos": [
      "catalogo",
      "pedidos",
      "ingredientes",
      "tablas"
    ]
  },
  {
    "codigo": "JEFE_OPERACIONES",
    "nombre": "Jefe de operaciones zonal",
    "descripcion": "Supervisión de la operación",
    "permisos": [
      "pedidos",
      "ingredientes",
      "planificar",
      "tablas"
    ]
  },
  {
    "codigo": "HSE",
    "nombre": "HSE",
    "descripcion": "Calidad y vencimientos",
    "permisos": [
      "ingredientes",
      "tablas"
    ]
  },
  {
    "codigo": "COMPRAS_LOGISTICA",
    "nombre": "Compras y logística",
    "descripcion": "Proveedores y existencias",
    "permisos": [
      "compras",
      "ingredientes",
      "tablas"
    ]
  },
  {
    "codigo": "VENTAS_MARKETING",
    "nombre": "Ventas y marketing",
    "descripcion": "Catálogo, clientes y solicitudes",
    "permisos": [
      "catalogo",
      "pedidos",
      "clientes",
      "tablas"
    ]
  },
  {
    "codigo": "CONTADORA",
    "nombre": "Contadora",
    "descripcion": "Facturación",
    "permisos": [
      "finanzas",
      "tablas"
    ]
  },
  {
    "codigo": "CHEF_SUPERVISOR",
    "nombre": "Chef supervisor",
    "descripcion": "Platos, recetas y producción",
    "permisos": [
      "platos",
      "recetas",
      "produccion",
      "planificar",
      "ingredientes",
      "tablas"
    ]
  },
  {
    "codigo": "NUTRICIONISTA",
    "nombre": "Nutricionista",
    "descripcion": "Recetas y alérgenos",
    "permisos": [
      "recetas",
      "ingredientes",
      "tablas"
    ]
  },
  {
    "codigo": "COCINERO",
    "nombre": "Cocinero",
    "descripcion": "Producción diaria",
    "permisos": [
      "produccion",
      "planificar",
      "ingredientes"
    ]
  },
  {
    "codigo": "PASTELERO",
    "nombre": "Pastelero",
    "descripcion": "Producción de pastelería",
    "permisos": [
      "produccion",
      "planificar",
      "ingredientes"
    ]
  },
  {
    "codigo": "AYUDANTE_BODEGA",
    "nombre": "Ayudante de bodega",
    "descripcion": "Recetas y existencias",
    "permisos": [
      "ingredientes"
    ]
  },
  {
    "codigo": "AYUDANTE_COCINA",
    "nombre": "Ayudante de cocina",
    "descripcion": "Recetas y existencias",
    "permisos": [
      "ingredientes"
    ]
  },
  {
    "codigo": "POSILLERO",
    "nombre": "Posillero",
    "descripcion": "Trabajo del día",
    "permisos": []
  },
  {
    "codigo": "LIMPIEZA",
    "nombre": "Limpieza",
    "descripcion": "Trabajo del día",
    "permisos": []
  },
  {
    "codigo": "CONDUCTOR",
    "nombre": "Conductor",
    "descripcion": "Entregas a domicilio",
    "permisos": [
      "entregas"
    ]
  }
];
export const esCargo = u => ROLES_EQUIPO.some(r=>u?.roles?.includes(r.codigo));
const CAPACIDADES_HEREDADAS={CATALOGO:['catalogo','platos','recetas','ingredientes','tablas'],OPERACIONES:['catalogo','platos','recetas','compras','produccion','planificar','ingredientes','pedidos','tablas'],FINANZAS:['finanzas','pedidos','tablas']};
export const permisosEquipo = u => [...new Set([...ROLES_EQUIPO.filter(r=>u?.roles?.includes(r.codigo)).flatMap(r=>r.permisos),...(u?.roles||[]).flatMap(r=>CAPACIDADES_HEREDADAS[r]||[])])];
export const permiteEquipo = (u,p) => u?.roles?.includes('ADMINISTRADOR') || permisosEquipo(u).includes(p);
// Tabla => columnas editables; claves y otras columnas se proyectan por separado.
export const TABLAS_EQUIPO = {
 COMPRAS_LOGISTICA: {proveedor:'identificacion razon_social contacto telefono correo direccion activo',proveedor_insumo:'id_proveedor id_insumo precio_referencia_base plazo_entrega_dias compra_minima_base activo',insumo:'codigo nombre unidad_base stock_minimo requiere_vencimiento activo alergenos_declarados'},
 HSE:{lote_insumo:'',insumo:''},
 NUTRICIONISTA:{opcion_paquete:'alergenos_declarados',insumo:'alergenos_declarados'},
 CHEF_SUPERVISOR:{opcion_paquete:'nombre alergenos_declarados activo'},
 VENTAS_MARKETING:{cliente:'nombre empresa identificacion correo telefono',solicitud:'fecha_evento hora_evento direccion mensaje',paquete:'nombre descripcion imagen imagen_alt etiqueta activo mostrar_inicio orden_inicio'},
 CONTADORA:{factura:'numero id_cliente razon_social_fact identificacion_fact direccion_fact correo_fact observaciones',detalle_factura:'id_factura id_detalle_solicitud id_solicitud_entrega tipo_linea descripcion cantidad precio_unitario_centavos descuento_centavos tasa_impuesto'},
 GERENTE_NEGOCIOS:{solicitud:'',insumo:'',lote_insumo:'',opcion_paquete:''}, JEFE_OPERACIONES:{solicitud:'',insumo:'',lote_insumo:'',opcion_paquete:''}
};
export function accesoTablaEquipo(u,t) {
 const reglas=ROLES_EQUIPO.filter(r=>u?.roles?.includes(r.codigo)).map(r=>TABLAS_EQUIPO[r.codigo]?.[t]).filter(x=>x!==undefined);
 return reglas.length ? [...new Set(reglas.flatMap(x=>x.split(' ').filter(Boolean)))] : null;
}
