# Revisión de seguridad y operación

Fecha: 23 de noviembre de 2026. Alcance: código y ejecución local; integración con una copia de PostgreSQL y revisión visual de la interfaz. No se ha ejecutado una prueba de penetración ni comprobado el despliegue remoto actualizado. Este informe no es una certificación OWASP.

## Controles y evidencia

| Riesgo OWASP Top 10:2025 | Medida aplicada y límite de la comprobación |
| --- | --- |
| A01 Control de acceso | Permisos por sección y operación en la API; pedidos por propietario; registro sin elevación de roles; protección del último administrador. Pruebas de denegación y filtros de cuenta. |
| A02 Configuración | Cookies HttpOnly y Secure en producción, CSRF por Origin y JSON, cabeceras, CSP al servir frontend, secretos fuera de Git y rol local de datos separado del migrador. Render necesita configurar estas variables y permisos antes de publicar. |
| A03 Cadena de suministro | jose y pg con lockfile, npm audit y workflows con pruebas y CodeQL. La auditoría de dependencias de producción ejecutada devolvió cero vulnerabilidades conocidas; no garantiza ausencia de fallos. |
| A04 Criptografía | JWT con HS256 permitido explícitamente, clave aleatoria independiente y validación de emisor, audiencia, sujeto, jti y vencimiento. scrypt con N=131072, r=8, p=1, sal aleatoria y comparación constante; actualización de hashes antiguos al login. TLS PostgreSQL con verificación del certificado en producción. |
| A05 Inyección | Tablas y columnas declaradas por el servidor, consultas parametrizadas, tipos/rangos/longitudes estrictos y protocolos de imagen permitidos. La interfaz crea nodos y utiliza textContent para datos; validar entrada no sustituye codificar la salida. |
| A06 Diseño inseguro | Operaciones transaccionales para catálogo, recetas, compras y producción; stock no negativo; bajas con historial. Facturas emitidas protegidas y referencias duplicadas rechazadas. |
| A07 Autenticación | Acceso de 15 minutos; renovación rotatoria con límite absoluto de siete días y detección de reutilización; logout revoca familia. Límites persistidos en PostgreSQL y máximo de dos derivaciones scrypt simultáneas, con cola acotada. Contraseñas nuevas de 15–128 caracteres; las cuentas anteriores se conservan. |
| A08 Integridad | Recálculo de precios en servidor, claves foráneas, restricciones SQL e idempotencia de compras/producción. La planificación conjunta suma necesidades compartidas. |
| A09 Registros | Auditoría administrativa y operaciones de cocina con actor, fecha y recurso, sin contraseñas ni tokens. El rol local de la API no puede actualizar ni borrar esos registros. Falta conectar alertas operativas externas. |
| A10 Condiciones excepcionales | Errores públicos sin detalles SQL, límite del cuerpo JSON, respuestas diferenciadas y rollback. Pruebas de entradas malformadas, recursos ausentes y operaciones concurrentes. |

Referencia de las categorías: https://top10.owasp.org/2025/. Guías utilizadas: https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html y https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html.

## Pruebas realizadas

- Autenticación: JWT alterado, expirado, de otra audiencia/emisor, algoritmo incorrecto y sesión inexistente; cookies y CSRF; límites y ausencia de elevación en registro; compatibilidad de hashes y sobrecarga acotada.
- PostgreSQL real en valora_operacion_pruebas: registro, login, revocación, dos renovaciones simultáneas, reutilización de refresh y expiración absoluta.
- Gestión: metadatos de 29 tablas, exclusión de hashes, permisos, indicadores estrictos, edición de facturas, emisión/anulación y rechazo de líneas repetidas o trasladadas. Prueba de nueva opción de menú sin receta inventada y formato de fechas de pedidos.
- Cocina: cantidades decimales exactas, ingrediente limitante, receta pendiente, planificación compartida y stock agregado. Integración SQL de compras/producción repetidas concurrentes, rollback por faltantes y exclusión de lotes vencidos/bloqueados o ingredientes inactivos.
- Frontend: sesión sin tokens persistidos, cookies, renovación concurrente única, campos libres y selectores, fechas válidas/ausentes/malformadas y render de pedidos.
- Navegador: acceso real del administrador, secciones, formulario de ingrediente, filtros y detalles de pedidos con datos ficticios, y vista de 390 píxeles. Se corrigió un fallo de fecha detectado al probar los pedidos.

La validación completa terminó correctamente: 39 archivos JavaScript del backend y 57 archivos del frontend inspeccionados. Las pruebas de interfaz no cubren cada combinación de navegador, lector de pantalla o dispositivo.

## Conservación de datos

Se hizo un respaldo local antes de migrar. La base valora mantuvo 2 usuarios, 6 paquetes, 207 opciones y 3 solicitudes. No se rellenaron recetas con cantidades supuestas. Los datos ficticios de integración permanecen en valora_operacion_pruebas, separada de la base de trabajo. Las sesiones opacas anteriores se revocan al migrar.

## Condiciones antes de publicar

Configurar el mismo origen de frontend y API, JWT_SECRET privada, TLS y permisos de PostgreSQL en Render. Publicar primero el frontend actualizado y después el backend. Verificar el flujo real sobre la base remota con respaldo previo. La cuenta administrativa existente conserva su contraseña; conviene que su propietario utilice una contraseña larga y exclusiva. No se ha añadido MFA ni recuperación de contraseña por correo.

La dirección IP del socket puede ser compartida por el proxy de Render. El límite por IP puede restringir varios usuarios y debe comprobarse allí; no se confía automáticamente en X-Forwarded-For. Los límites por cuenta permanecen activos.

Los pagos electrónicos y las facturas son internos o de demostración, sin proveedor bancario ni autorización del SRI. Las capacidades son por receta y existencias actuales; no representan reservas de inventario de pedidos futuros. Para varios platos se debe usar la planificación conjunta.
