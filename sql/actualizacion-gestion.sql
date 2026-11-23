CREATE TABLE IF NOT EXISTS auditoria_admin (
  id_auditoria BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_usuario BIGINT NOT NULL REFERENCES usuario(id_usuario),
  recurso VARCHAR(80) NOT NULL,
  accion VARCHAR(40) NOT NULL,
  clave JSONB NOT NULL DEFAULT '{}',
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_auditoria_actor_fecha ON auditoria_admin(id_usuario,creado_en DESC);
CREATE INDEX IF NOT EXISTS ix_cliente_usuario ON cliente(id_usuario);
CREATE INDEX IF NOT EXISTS ix_sesion_usuario ON sesion_usuario(id_usuario);
CREATE INDEX IF NOT EXISTS ix_detalle_solicitud ON detalle_solicitud(id_solicitud);
CREATE INDEX IF NOT EXISTS ix_composicion_insumo ON composicion_opcion(id_insumo);
CREATE INDEX IF NOT EXISTS ix_kardex_lote ON kardex(id_lote);
