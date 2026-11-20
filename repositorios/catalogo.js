const ofertaDisponible = "o.activo = 1 AND t.activo = 1 AND o.vigente_desde <= CURRENT_DATE AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= CURRENT_DATE)";

export async function consultarServicios(db) {
  const { rows: filas } = await db.query(
    "SELECT id_servicio AS id, nombre, categoria, resumen, descripcion, etiqueta, frase, icono, estilo FROM servicio WHERE activo = 1 ORDER BY etiqueta, id_servicio",
  );
  const { rows: incluidos } = await db.query(
    "SELECT id_servicio AS id, descripcion FROM servicio_incluye ORDER BY id_servicio, orden",
  );
  return { filas, incluidos };
}

export async function consultarProductos(db) {
  const { rows: paquetes } = await db.query(
    `SELECT id_paquete AS id, id_servicio AS "servicioId", nombre, descripcion, imagen,
            imagen_alt AS "imagenAlt", etiqueta, activo, mostrar_inicio AS "mostrarInicio",
            orden_inicio AS "ordenInicio"
     FROM paquete
     WHERE activo = 1 AND mostrar_inicio = 1 AND id_servicio IS NOT NULL
     ORDER BY orden_inicio, id_paquete`,
  );
  const { rows: incluidos } = await db.query(
    "SELECT id_paquete AS id, descripcion FROM paquete_incluye ORDER BY id_paquete, orden",
  );
  const { rows: ofertas } = await db.query(
    "SELECT o.id_paquete, t.codigo AS \"tipoComida\", o.precio_base_centavos, o.min_personas, o.max_personas FROM paquete_tipo_comida o JOIN tipo_comida t USING (id_tipo_comida) WHERE " + ofertaDisponible + " ORDER BY o.id_paquete, t.id_tipo_comida",
  );
  const { rows: opciones } = await db.query(
    "SELECT x.id_paquete, t.codigo AS \"tipoComida\", x.tipo, x.id_opcion AS id, x.codigo, x.nombre, x.precio_adicional_centavos FROM opcion_paquete x JOIN paquete_tipo_comida o USING (id_paquete, id_tipo_comida) JOIN tipo_comida t USING (id_tipo_comida) WHERE x.activo = 1 AND " + ofertaDisponible + " ORDER BY x.id_opcion",
  );
  return { paquetes, incluidos, ofertas, opciones };
}

export async function listarCatalogoAdmin(db) {
  const { rows: paquetes } = await db.query(
    `SELECT p.id_paquete AS id, p.id_servicio AS "servicioId", p.nombre,
            p.descripcion, p.imagen, p.imagen_alt AS "imagenAlt", p.etiqueta,
            p.activo, p.mostrar_inicio AS "mostrarInicio", p.orden_inicio AS "ordenInicio"
     FROM paquete p
     ORDER BY p.orden_inicio, p.id_paquete`,
  );
  const { rows: ofertas } = await db.query(
    `SELECT o.id_paquete, t.codigo AS "tipoComida", o.precio_base_centavos,
            o.min_personas, o.max_personas
     FROM paquete_tipo_comida o
     JOIN tipo_comida t USING (id_tipo_comida)
     ORDER BY o.id_paquete, t.id_tipo_comida`,
  );
  return { paquetes, ofertas };
}

export async function crearPaquete(db, datos) {
  const servicio = await db.query(
    "SELECT id_servicio FROM servicio WHERE id_servicio=$1 AND activo=1",
    [datos.servicioId],
  );
  if (!servicio.rows[0]) throw new Error("SERVICIO_INEXISTENTE");
  const { rows } = await db.query(
    `INSERT INTO paquete
       (id_paquete, id_servicio, nombre, descripcion, imagen, imagen_alt, etiqueta, activo, mostrar_inicio, orden_inicio)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id_paquete AS id`,
    [datos.id, datos.servicioId, datos.nombre, datos.descripcion, datos.imagen,
     datos.imagenAlt, datos.etiqueta, datos.activo, datos.mostrarInicio, datos.ordenInicio],
  );
  if (datos.tipoComida && datos.precioCentavos) {
    const { rows: comidas } = await db.query(
      "SELECT id_tipo_comida FROM tipo_comida WHERE codigo=$1",
      [datos.tipoComida],
    );
    if (comidas[0]) {
      await db.query(
        `INSERT INTO paquete_tipo_comida
           (id_paquete,id_tipo_comida,precio_base_centavos,min_personas,max_personas,vigente_desde)
         VALUES ($1,$2,$3,$4,$5,CURRENT_DATE)`,
        [datos.id, comidas[0].id_tipo_comida, datos.precioCentavos,
         datos.minPersonas, datos.maxPersonas],
      );
      await db.query(
        `INSERT INTO opcion_paquete
           (id_opcion,id_paquete,id_tipo_comida,codigo,tipo,nombre,precio_adicional_centavos)
         VALUES ($1,$2,$3,$4,'MENU',$5,0)`,
        [`${datos.id}-menu`, datos.id, comidas[0].id_tipo_comida, "menu-principal", datos.nombre],
      );
    }
  }
  return rows[0];
}

export async function actualizarPaquete(db, id, datos) {
  const servicio = await db.query(
    "SELECT id_servicio FROM servicio WHERE id_servicio=$1 AND activo=1",
    [datos.servicioId],
  );
  if (!servicio.rows[0]) throw new Error("SERVICIO_INEXISTENTE");
  const { rows } = await db.query(
    `UPDATE paquete SET
       id_servicio=$2, nombre=$3, descripcion=$4, imagen=$5, imagen_alt=$6,
       etiqueta=$7, activo=$8, mostrar_inicio=$9, orden_inicio=$10,
       actualizado_en=CURRENT_TIMESTAMP(6)
     WHERE id_paquete=$1
     RETURNING id_paquete AS id, activo, mostrar_inicio AS "mostrarInicio"`,
    [id, datos.servicioId, datos.nombre, datos.descripcion, datos.imagen,
     datos.imagenAlt, datos.etiqueta, datos.activo, datos.mostrarInicio, datos.ordenInicio],
  );
  return rows[0] ?? null;
}

export async function borrarPaquete(db, id) {
  const existente = await db.query("SELECT id_paquete AS id FROM paquete WHERE id_paquete=$1", [id]);
  if (!existente.rows[0]) return null;
  await db.query("DELETE FROM opcion_paquete WHERE id_paquete=$1", [id]);
  await db.query("DELETE FROM paquete_tipo_comida WHERE id_paquete=$1", [id]);
  await db.query("DELETE FROM paquete_incluye WHERE id_paquete=$1", [id]);
  await db.query("DELETE FROM paquete WHERE id_paquete=$1", [id]);
  return existente.rows[0];
}
