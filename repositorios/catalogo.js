const ofertaDisponible = "o.activo = 1 AND t.activo = 1 AND o.vigente_desde <= CURRENT_DATE() AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= CURRENT_DATE())";

export async function consultarServicios(db) {
  const [filas] = await db.query(
    "SELECT id_servicio AS id, nombre, categoria, resumen, descripcion, etiqueta, frase, icono, estilo FROM servicio WHERE activo = 1 ORDER BY etiqueta, id_servicio",
  );
  const [incluidos] = await db.query(
    "SELECT id_servicio AS id, descripcion FROM servicio_incluye ORDER BY id_servicio, orden",
  );
  return { filas, incluidos };
}

export async function consultarProductos(db) {
  const [paquetes] = await db.query(
    "SELECT id_paquete AS id, id_servicio AS servicioId, nombre, descripcion, imagen, imagen_alt AS imagenAlt, etiqueta FROM paquete WHERE activo = 1 AND id_servicio IS NOT NULL ORDER BY id_paquete",
  );
  const [incluidos] = await db.query(
    "SELECT id_paquete AS id, descripcion FROM paquete_incluye ORDER BY id_paquete, orden",
  );
  const [ofertas] = await db.query(
    "SELECT o.id_paquete, t.codigo AS tipoComida, o.precio_base_centavos, o.min_personas, o.max_personas FROM paquete_tipo_comida o JOIN tipo_comida t USING (id_tipo_comida) WHERE " + ofertaDisponible + " ORDER BY o.id_paquete, t.id_tipo_comida",
  );
  const [opciones] = await db.query(
    "SELECT x.id_paquete, t.codigo AS tipoComida, x.tipo, x.id_opcion AS id, x.codigo, x.nombre, x.precio_adicional_centavos FROM opcion_paquete x JOIN paquete_tipo_comida o USING (id_paquete, id_tipo_comida) JOIN tipo_comida t USING (id_tipo_comida) WHERE x.activo = 1 AND " + ofertaDisponible + " ORDER BY x.id_opcion",
  );
  return { paquetes, incluidos, ofertas, opciones };
}
