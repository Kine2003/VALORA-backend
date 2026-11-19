-- Crear primero la cuenta local 'valora_app'@'localhost' con su contraseña.
GRANT SELECT ON valora.servicio TO 'valora_app'@'localhost';
GRANT SELECT ON valora.servicio_incluye TO 'valora_app'@'localhost';
GRANT SELECT ON valora.paquete TO 'valora_app'@'localhost';
GRANT SELECT ON valora.paquete_incluye TO 'valora_app'@'localhost';
GRANT SELECT ON valora.tipo_comida TO 'valora_app'@'localhost';
GRANT SELECT ON valora.paquete_tipo_comida TO 'valora_app'@'localhost';
GRANT SELECT ON valora.opcion_paquete TO 'valora_app'@'localhost';
GRANT INSERT ON valora.cliente TO 'valora_app'@'localhost';
GRANT INSERT ON valora.solicitud TO 'valora_app'@'localhost';
GRANT INSERT ON valora.detalle_solicitud TO 'valora_app'@'localhost';
GRANT INSERT ON valora.extra_solicitud TO 'valora_app'@'localhost';
