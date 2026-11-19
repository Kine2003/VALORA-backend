-- Ejecutar solo si se cre? un rol local llamado valora_app.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO valora_app;
GRANT INSERT ON cliente, solicitud, detalle_solicitud, extra_solicitud TO valora_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO valora_app;
