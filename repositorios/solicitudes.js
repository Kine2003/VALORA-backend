export async function crearCliente(db, { nombre, empresa, correo, telefono }) {
  const { rows } = await db.query(
    "INSERT INTO cliente (nombre, empresa, correo, telefono) VALUES ($1, $2, $3, $4) RETURNING id_cliente",
    [nombre, empresa || null, correo.toLowerCase(), telefono],
  );
  return rows[0].id_cliente;
}

export async function existeServicio(db, id) {
  const { rows: filas } = await db.query("SELECT id_servicio FROM servicio WHERE id_servicio = $1 AND activo = 1", [id]);
  return filas.length > 0;
}

export async function buscarTipoComida(db, codigo) {
  const { rows: filas } = await db.query("SELECT id_tipo_comida FROM tipo_comida WHERE codigo = $1 AND activo = 1", [codigo]);
  return filas[0]?.id_tipo_comida ?? null;
}

export async function insertarCotizacion(db, cliente, idComida, datos) {
  const { rows } = await db.query(
    "INSERT INTO solicitud (id_cliente, id_servicio, id_tipo_comida, tipo, estado, fecha_evento, personas, mensaje) VALUES ($1, $2, $3, 'COTIZACION', 'NUEVA', $4, $5, $6) RETURNING id_solicitud",
    [cliente, datos.servicio, idComida, datos.fecha || null, datos.personas ? Number(datos.personas) : null, datos.mensaje],
  );
  return String(rows[0].id_solicitud);
}

export async function insertarPedido(db, cliente, contacto, costoEntrega, detalles, lineas) {
  const { rows: solicitudes } = await db.query(
    "INSERT INTO solicitud (id_cliente, tipo, estado, fecha_evento, hora_evento, entrega, direccion, mensaje, costo_entrega_centavos) VALUES ($1, 'PEDIDO', 'NUEVA', $2, $3, $4, $5, $6, $7) RETURNING id_solicitud",
    [cliente, contacto.fecha, contacto.hora, contacto.entrega.toUpperCase(), contacto.entrega === "domicilio" ? contacto.direccion : null, contacto.notas || null, costoEntrega],
  );
  const solicitud = solicitudes[0];
  for (const [indice, { oferta, menu, extras }] of detalles.entries()) {
    const linea = lineas[indice];
    const { rows: detallesInsertados } = await db.query(
      "INSERT INTO detalle_solicitud (id_solicitud, id_menu, personas, precio_base_centavos, precio_menu_centavos, notas) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_detalle",
      [solicitud.id_solicitud, menu.id, linea.personas, oferta.precioCentavos, menu.extraCentavos, linea.notas?.trim() || null],
    );
    const detalle = detallesInsertados[0];
    for (const extra of extras) {
      await db.query(
        "INSERT INTO extra_solicitud (id_detalle, id_extra, precio_centavos) VALUES ($1, $2, $3)",
        [detalle.id_detalle, extra.id, extra.precioCentavos],
      );
    }
  }
  return String(solicitud.id_solicitud);
}
