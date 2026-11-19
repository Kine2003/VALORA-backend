CREATE OR REPLACE VIEW v_saldo_lote AS
SELECT l.id_lote, l.id_insumo, l.fecha_vencimiento, l.bloqueado,
       COALESCE(SUM(CASE WHEN k.tipo IN ('ENTRADA','AJUSTE_E') THEN k.cantidad ELSE -k.cantidad END), 0) AS saldo
FROM lote_insumo l LEFT JOIN kardex k USING (id_lote)
GROUP BY l.id_lote, l.id_insumo, l.fecha_vencimiento, l.bloqueado;

CREATE OR REPLACE VIEW v_stock_insumo AS
SELECT i.id_insumo, i.codigo, i.nombre, i.unidad_base, i.stock_minimo,
       COALESCE(SUM(CASE WHEN l.bloqueado = 0 AND l.saldo > 0
                          AND (l.fecha_vencimiento >= CURRENT_DATE()
                               OR (l.fecha_vencimiento IS NULL AND i.requiere_vencimiento = 0))
                         THEN l.saldo ELSE 0 END), 0) AS stock_disponible
FROM insumo i LEFT JOIN v_saldo_lote l USING (id_insumo)
GROUP BY i.id_insumo, i.codigo, i.nombre, i.unidad_base, i.stock_minimo;

CREATE OR REPLACE VIEW v_alerta_stock AS
SELECT *, stock_minimo - stock_disponible AS faltante_base
FROM v_stock_insumo WHERE stock_disponible < stock_minimo;

CREATE OR REPLACE VIEW v_consumo_pedido AS
SELECT id_solicitud, id_insumo, SUM(cantidad) AS cantidad_requerida
FROM (
    SELECT d.id_solicitud, c.id_insumo, d.personas * c.cantidad_por_persona AS cantidad
    FROM detalle_solicitud d JOIN composicion_opcion c ON c.id_opcion = d.id_menu
    UNION ALL
    SELECT d.id_solicitud, c.id_insumo, d.personas * c.cantidad_por_persona
    FROM detalle_solicitud d JOIN extra_solicitud e USING (id_detalle)
    JOIN composicion_opcion c ON c.id_opcion = e.id_extra
) AS requerimientos
GROUP BY id_solicitud, id_insumo;

CREATE OR REPLACE VIEW v_faltante_pedido AS
SELECT c.id_solicitud, c.id_insumo, c.cantidad_requerida, i.stock_disponible,
       c.cantidad_requerida - i.stock_disponible AS faltante_base
FROM v_consumo_pedido c JOIN v_stock_insumo i USING (id_insumo)
JOIN solicitud s USING (id_solicitud)
WHERE s.tipo = 'PEDIDO' AND s.inventario_descontado_en IS NULL
  AND c.cantidad_requerida > i.stock_disponible;

CREATE OR REPLACE VIEW v_linea_factura AS
SELECT id_detalle_factura, id_factura,
       cantidad * precio_unitario_centavos - descuento_centavos AS base_centavos,
       ROUND((cantidad * precio_unitario_centavos - descuento_centavos) * tasa_impuesto / 100) AS impuesto_centavos
FROM detalle_factura;

CREATE OR REPLACE VIEW v_total_factura AS
SELECT f.id_factura, COALESCE(SUM(l.base_centavos), 0) AS base_centavos,
       COALESCE(SUM(l.impuesto_centavos), 0) AS impuesto_centavos,
       COALESCE(SUM(l.base_centavos + l.impuesto_centavos), 0) AS total_centavos
FROM factura f LEFT JOIN v_linea_factura l USING (id_factura)
GROUP BY f.id_factura;
