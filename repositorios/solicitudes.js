export async function crearCliente(db, { nombre, empresa, correo, telefono }) {
  const [resultado] = await db.execute(
    "INSERT INTO cliente (nombre, empresa, correo, telefono) VALUES (?, ?, ?, ?)",
    [nombre, empresa || null, correo.toLowerCase(), telefono],
  );
  return resultado.insertId;
}

export async function existeServicio(db, id) {
  const [filas] = await db.execute("SELECT id_servicio FROM servicio WHERE id_servicio = ? AND activo = 1", [id]);
  return filas.length > 0;
}

export async function buscarTipoComida(db, codigo) {
  const [filas] = await db.execute("SELECT id_tipo_comida FROM tipo_comida WHERE codigo = ? AND activo = 1", [codigo]);
  return filas[0]?.id_tipo_comida ?? null;
}

export async function insertarCotizacion(db, cliente, idComida, datos) {
  const [resultado] = await db.execute(
    "INSERT INTO solicitud (id_cliente, id_servicio, id_tipo_comida, tipo, estado, fecha_evento, personas, mensaje) VALUES (?, ?, ?, 'COTIZACION', 'NUEVA', ?, ?, ?)",
    [cliente, datos.servicio, idComida, datos.fecha || null, datos.personas ? Number(datos.personas) : null, datos.mensaje],
  );
  return String(resultado.insertId);
}

export async function insertarPedido(db, cliente, contacto, costoEntrega, detalles, lineas) {
  const [solicitud] = await db.execute(
    "INSERT INTO solicitud (id_cliente, tipo, estado, fecha_evento, hora_evento, entrega, direccion, mensaje, costo_entrega_centavos) VALUES (?, 'PEDIDO', 'NUEVA', ?, ?, ?, ?, ?, ?)",
    [cliente, contacto.fecha, contacto.hora, contacto.entrega.toUpperCase(), contacto.entrega === "domicilio" ? contacto.direccion : null, contacto.notas || null, costoEntrega],
  );
  for (const [indice, { oferta, menu, extras }] of detalles.entries()) {
    const linea = lineas[indice];
    const [detalle] = await db.execute(
      "INSERT INTO detalle_solicitud (id_solicitud, id_menu, personas, precio_base_centavos, precio_menu_centavos, notas) VALUES (?, ?, ?, ?, ?, ?)",
      [solicitud.insertId, menu.id, linea.personas, oferta.precioCentavos, menu.extraCentavos, linea.notas?.trim() || null],
    );
    for (const extra of extras) {
      await db.execute(
        "INSERT INTO extra_solicitud (id_detalle, id_extra, precio_centavos) VALUES (?, ?, ?)",
        [detalle.insertId, extra.id, extra.precioCentavos],
      );
    }
  }
  return String(solicitud.insertId);
}
