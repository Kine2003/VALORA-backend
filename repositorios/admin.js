/*
 * Consultas del panel administrativo.
 * El total de una solicitud suma los detalles del pedido, los complementos
 * por persona y el costo de entrega. Los importes se guardan en centavos.
 */
const TOTALES = `
  WITH totales AS (
    SELECT s.id_solicitud, s.id_cliente, s.tipo, s.estado, s.creado_en, s.costo_entrega_centavos,
      COALESCE((
        SELECT SUM(d.personas * (d.precio_base_centavos + d.precio_menu_centavos))
        FROM detalle_solicitud d WHERE d.id_solicitud = s.id_solicitud
      ), 0)
      + COALESCE((
        SELECT SUM(d.personas * e.precio_centavos)
        FROM detalle_solicitud d
        JOIN extra_solicitud e ON e.id_detalle = d.id_detalle
        WHERE d.id_solicitud = s.id_solicitud
      ), 0)
      + s.costo_entrega_centavos AS total
    FROM solicitud s
  )
`;

const numero = valor => Number(valor ?? 0);

const ESTADOS = ["NUEVA", "EN_REVISION", "COTIZADA", "CONFIRMADA", "EN_PROCESO", "ENTREGADA", "RECHAZADA", "CANCELADA"];

export { ESTADOS };

function mapearSolicitud(fila) {
  return {
    id: String(fila.id_solicitud),
    tipo: fila.tipo,
    estado: fila.estado,
    fechaEvento: fila.fecha_evento ? String(fila.fecha_evento).slice(0, 10) : null,
    horaEvento: fila.hora_evento ?? null,
    personas: fila.personas === null ? null : Number(fila.personas),
    entrega: fila.entrega,
    direccion: fila.direccion,
    mensaje: fila.mensaje,
    creadoEn: fila.creado_en,
    totalCentavos: numero(fila.total),
    cliente: fila.cliente,
    empresa: fila.empresa,
    correo: fila.correo,
    telefono: fila.telefono,
    estadoPago: fila.estado_pago ?? "PENDIENTE_PAGO",
    metodoPago: fila.metodo_pago ?? null,
    pagadoEn: fila.pagado_en ?? null,
    lineas: [],
  };
}

async function lineasDeSolicitudes(db, ids) {
  if (!ids.length) return new Map();
  const { rows } = await db.query(
    `SELECT d.id_solicitud, d.id_detalle, d.personas, d.notas,
            d.precio_base_centavos, d.precio_menu_centavos,
            o.nombre AS menu, p.nombre AS paquete,
            COALESCE(json_agg(json_build_object('nombre', eo.nombre, 'precioCentavos', e.precio_centavos))
                     FILTER (WHERE e.id_extra IS NOT NULL), '[]') AS extras
     FROM detalle_solicitud d
     JOIN opcion_paquete o ON o.id_opcion = d.id_menu
     JOIN paquete p ON p.id_paquete = o.id_paquete
     LEFT JOIN extra_solicitud e ON e.id_detalle = d.id_detalle
     LEFT JOIN opcion_paquete eo ON eo.id_opcion = e.id_extra
     WHERE d.id_solicitud = ANY($1::bigint[])
     GROUP BY d.id_detalle, d.id_solicitud, o.nombre, p.nombre
     ORDER BY d.id_detalle`,
    [ids],
  );
  const mapa = new Map();
  for (const fila of rows) {
    const extras = (fila.extras ?? []).map(extra => ({
      nombre: extra.nombre,
      precioCentavos: numero(extra.precioCentavos),
    }));
    const base = numero(fila.precio_base_centavos);
    const menu = numero(fila.precio_menu_centavos);
    const personas = Number(fila.personas);
    const totalCentavos = personas * (base + menu + extras.reduce((suma, extra) => suma + extra.precioCentavos, 0));
    const lista = mapa.get(String(fila.id_solicitud)) ?? [];
    lista.push({
      id: String(fila.id_detalle),
      paquete: fila.paquete,
      menu: fila.menu,
      personas,
      notas: fila.notas,
      precioBaseCentavos: base,
      precioMenuCentavos: menu,
      extras,
      totalCentavos,
    });
    mapa.set(String(fila.id_solicitud), lista);
  }
  return mapa;
}

export async function listarSolicitudes(db, limite = 200) {
  const { rows } = await db.query(
    `${TOTALES}
     SELECT s.id_solicitud, s.tipo, s.estado, s.fecha_evento, s.hora_evento, s.personas,
            s.entrega, s.direccion, s.mensaje, s.estado_pago, s.metodo_pago, s.pagado_en, s.creado_en, t.total,
            c.nombre AS cliente, c.empresa, c.correo, c.telefono
     FROM solicitud s
     JOIN cliente c ON c.id_cliente = s.id_cliente
     JOIN totales t ON t.id_solicitud = s.id_solicitud
     ORDER BY s.creado_en DESC, s.id_solicitud DESC
     LIMIT $1`,
    [limite],
  );
  const solicitudes = rows.map(mapearSolicitud);
  const lineas = await lineasDeSolicitudes(db, solicitudes.map(solicitud => solicitud.id));
  for (const solicitud of solicitudes) solicitud.lineas = lineas.get(solicitud.id) ?? [];
  return solicitudes;
}

export async function resumenSolicitudes(db) {
  const [{ rows: [conteos] }, { rows: estados }] = await Promise.all([
    db.query(
      `${TOTALES}
       SELECT
         (SELECT COUNT(*)::int FROM totales) AS solicitudes,
         (SELECT COUNT(*)::int FROM totales WHERE tipo = 'PEDIDO') AS pedidos,
         (SELECT COUNT(*)::int FROM totales WHERE tipo = 'COTIZACION') AS cotizaciones,
         (SELECT COUNT(*)::int FROM totales WHERE estado = 'NUEVA') AS nuevas,
         (SELECT COUNT(*)::int FROM totales WHERE estado IN ('CONFIRMADA','EN_PROCESO','ENTREGADA')) AS confirmadas,
         (SELECT COALESCE(SUM(total), 0) FROM totales WHERE estado IN ('CONFIRMADA','EN_PROCESO','ENTREGADA')) AS ingreso_confirmado,
         (SELECT COUNT(*)::int FROM cliente) AS clientes,
         (SELECT COALESCE(SUM(personas), 0)::int FROM detalle_solicitud) AS personas,
         (SELECT COUNT(*)::int FROM solicitud
           WHERE fecha_evento >= CURRENT_DATE AND estado NOT IN ('CANCELADA','RECHAZADA')) AS proximos`,
    ),
    db.query("SELECT estado, COUNT(*)::int AS cantidad FROM solicitud GROUP BY estado"),
  ]);
  const porEstado = ESTADOS.map(estado => ({
    estado,
    cantidad: Number(estados.find(fila => fila.estado === estado)?.cantidad ?? 0),
  }));
  return {
    solicitudes: Number(conteos.solicitudes),
    pedidos: Number(conteos.pedidos),
    cotizaciones: Number(conteos.cotizaciones),
    nuevas: Number(conteos.nuevas),
    confirmadas: Number(conteos.confirmadas),
    ingresoConfirmadoCentavos: numero(conteos.ingreso_confirmado),
    clientes: Number(conteos.clientes),
    personas: Number(conteos.personas),
    proximos: Number(conteos.proximos),
    porEstado,
  };
}

export async function listarClientes(db) {
  const { rows } = await db.query(
    `${TOTALES}
     SELECT c.id_cliente, c.nombre, c.empresa, c.correo, c.telefono, c.creado_en,
            COUNT(t.id_solicitud)::int AS solicitudes,
            COALESCE(SUM(t.total), 0) AS total,
            MAX(t.creado_en) AS ultima_solicitud
     FROM cliente c
     LEFT JOIN totales t ON t.id_cliente = c.id_cliente
     GROUP BY c.id_cliente
     ORDER BY MAX(t.creado_en) DESC NULLS LAST, c.creado_en DESC
     LIMIT 300`,
  );
  return rows.map(fila => ({
    id: String(fila.id_cliente),
    nombre: fila.nombre,
    empresa: fila.empresa,
    correo: fila.correo,
    telefono: fila.telefono,
    creadoEn: fila.creado_en,
    solicitudes: Number(fila.solicitudes),
    totalCentavos: numero(fila.total),
    ultimaSolicitud: fila.ultima_solicitud,
  }));
}

export async function solicitudesDeCliente(db, { idUsuario, correo }) {
  const { rows } = await db.query(
    `${TOTALES}
     SELECT s.id_solicitud, s.tipo, s.estado, s.fecha_evento, s.hora_evento, s.personas,
            s.entrega, s.direccion, s.mensaje, s.estado_pago, s.metodo_pago, s.pagado_en, s.creado_en, t.total,
            c.nombre AS cliente, c.empresa, c.correo, c.telefono
     FROM solicitud s
     JOIN cliente c ON c.id_cliente = s.id_cliente
     JOIN totales t ON t.id_solicitud = s.id_solicitud
     WHERE c.id_usuario = $1
     ORDER BY s.creado_en DESC, s.id_solicitud DESC
     LIMIT 50`,
    [idUsuario ?? null],
  );
  return rows.map(mapearSolicitud);
}

export async function cambiarEstadoSolicitud(db, id, estado, idUsuario) {
  const { rows } = await db.query(
    "UPDATE solicitud SET estado = $1, id_gestionado_por = $2 WHERE id_solicitud = $3 RETURNING id_solicitud, estado",
    [estado, idUsuario, id],
  );
  return rows[0] ?? null;
}

export async function pagarSolicitudCliente(db, id, idUsuario, correo, metodo) {
  const pagado = metodo === "EFECTIVO" ? "PENDIENTE_PAGO" : "PAGADO";
  let consulta;
  let valores;
  if (metodo === "EFECTIVO") {
    consulta = `UPDATE solicitud s SET estado_pago=$1, metodo_pago=$2
      FROM cliente c
      WHERE s.id_solicitud=$3 AND s.tipo='PEDIDO' AND s.id_cliente=c.id_cliente
        AND c.id_usuario=$4
      RETURNING s.id_solicitud, s.estado, s.estado_pago, s.metodo_pago, s.pagado_en`;
    valores = [pagado, metodo, id, idUsuario];
  } else {
    consulta = `UPDATE solicitud s SET estado_pago=$1, metodo_pago=$2,
      pagado_en=CURRENT_TIMESTAMP(6), estado='CONFIRMADA'
      FROM cliente c
      WHERE s.id_solicitud=$3 AND s.tipo='PEDIDO' AND s.id_cliente=c.id_cliente
        AND c.id_usuario=$4
      RETURNING s.id_solicitud, s.estado, s.estado_pago, s.metodo_pago, s.pagado_en`;
    valores = [pagado, metodo, id, idUsuario];
  }
  const { rows } = await db.query(consulta, valores);
  return rows[0] ?? null;
}
