# Válora backend

API Node.js 24+ y PostgreSQL para clientes, catálogo y operación de cocina. El frontend conserva su propio repositorio; este servidor lo entrega bajo el mismo origen para usar cookies protegidas.

## Inicio local

Ejecuta npm ci, npm run db:migrate y npm start en esta carpeta. Abre http://127.0.0.1:3001/. No hace falta iniciar otro servidor para ver el frontend.

La configuración privada está en .env, excluida de Git. La API local usa valora_runtime, sin permisos para crear bases, roles o tablas; MIGRATION_DB_USER y MIGRATION_DB_PASSWORD identifican al propietario que migra. La base principal es valora. valora_operacion_pruebas es una copia para integración.

npm run db:seed solo es necesario en una instalación vacía, con ADMIN_CORREO y ADMIN_PASSWORD configurados. Conserva las cuentas y contraseñas existentes.

## Acceso y administración

El JWT de acceso y el token de renovación viajan en cookies HttpOnly. El navegador conserva solo el usuario público en memoria. El acceso vence a los 15 minutos y la familia de renovación a los siete días, con rotación y revocación. Las cookies son Secure en producción. Las escrituras requieren Origin permitido y application/json, también desde Postman.

Las personas se guardan en usuario, con permisos en rol y usuario_rol. El registro asigna USUARIO y CLIENTE como alias compatible. ADMINISTRADOR tiene acceso completo; CATALOGO, OPERACIONES y FINANZAS limitan las operaciones disponibles. Las nuevas cuentas requieren contraseñas de 15–128 caracteres. Las cuentas anteriores conservan su acceso y sus hashes se actualizan al entrar correctamente.

Las 29 tablas originales se agrupan en Personas y acceso, Cocina y catálogo, Pedidos y contratos, Inventario y compras, y Facturación. El editor avanzado admite campos declarados por el servidor. Los secretos, movimientos de inventario y documentos emitidos tienen controles específicos.

## Cocina

Crea platos, asigna ingredientes por porción, registra compras por lote y consulta capacidad. Las unidades base son G, ML y UNIDAD: un kilogramo se registra como 1000 G. La planificación conjunta suma ingredientes compartidos; las capacidades individuales no se suman. Registrar producción descuenta stock por lotes con transacción e idempotencia.

Las 207 opciones existentes se conservan. Sus recetas permanecen pendientes hasta introducir cantidades reales. Los pagos son una demostración: PAGO_SIMULADO=false deshabilita los pagos electrónicos simulados en producción. No hay integración bancaria ni facturación electrónica del SRI.

## API bajo /api/v1

- POST auth/login, auth/registro, auth/renovar y auth/logout; GET auth/sesion.
- GET productos y servicios; POST pedidos y cotizaciones.
- GET cuenta/solicitudes, con detalle de los pedidos propios.
- GET admin/gestion y GET/POST/PATCH/DELETE admin/tablas/:tabla. PATCH y DELETE reciben clave; POST y PATCH reciben valores.
- POST admin/usuarios y admin/sesiones/:id/revocar.
- GET admin/cocina y POST admin/cocina/platos, recetas, compras, produccion y planificar.
- POST admin/facturas/:id/emitir y anular.

## Pruebas

npm run validate comprueba estructura y sintaxis. npm test no necesita una base. npm run test:db utiliza exclusivamente valora_operacion_pruebas y añade datos ficticios allí. El test opcional de cocina recibe COCINA_TEST_DATABASE_URL y exige localhost y un nombre terminado en _pruebas. No se debe ejecutar sobre datos de producción.

## Render

Publica primero el frontend actualizado. frontend:build descarga su rama main; FRONTEND_REF permite fijar una rama o etiqueta. Luego publica el backend.

Build Command: npm ci && npm run frontend:build && npm run db:migrate
Start Command: npm start

Configura FRONTEND_DIR=./public, NODE_ENV=production, APP_ORIGIN con la URL HTTPS del servicio sin ruta, DATABASE_URL y una clave JWT_SECRET aleatoria. Para generar esta última utiliza node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))" y guárdala solo en Render.

Usa un rol de datos para la API y MIGRATION_DATABASE_URL para el propietario que migra. La separación local de permisos no cambia la base remota. El certificado PostgreSQL se verifica; DB_SSL_CA admite una CA adicional si es necesaria. render.yaml contiene la plantilla.

Comprueba salud, catálogo, acceso, permisos y cierre de sesión antes de anunciar el despliegue. GitHub Pages puede enlazar a la aplicación de Render. Nunca publiques .env, respaldos ni URLs con credenciales.

La actualización se comprobó localmente; todavía no se ha publicado en GitHub ni aplicado al servicio remoto.

Para esta configuración TLS estricta en Render utiliza la URL externa completa de PostgreSQL con su certificado administrado. La URL interna utiliza certificados autofirmados y no admite verificación completa según la [documentación de Render](https://render.com/docs/postgresql-creating-connecting). No cambies a rejectUnauthorized=false para ocultar un error de certificado. Esta decisión prioriza verificar la identidad del servidor y añade el recorrido de red de la conexión externa.
