# Acceso por cargo

El administrador conserva el panel completo. Los cargos del organigrama entran al panel de equipo y reciben únicamente los datos y operaciones autorizados por el servidor.

| Cargo | Trabajo disponible |
| --- | --- |
| Gerente de negocios | Resumen y consulta de operación, platos y existencias |
| Jefe zonal de operaciones | Supervisión, planificación y estados de solicitudes |
| HSE | Consulta de ingredientes, alérgenos, lotes y vencimientos |
| Compras y logística | Proveedores, ingredientes y registro de compras con recepción |
| Ventas y marketing | Catálogo, clientes y solicitudes |
| Contadora | Facturas, líneas, emisión y anulación controladas |
| Chef supervisor | Platos, recetas, planificación y producción |
| Nutricionista | Recetas y declaración de alérgenos |
| Cocinero / Pastelero | Recetas, existencias, planificación y producción |
| Ayudante de cocina / Ayudante de bodega | Consulta de recetas y existencias |
| Posillero / Limpieza | Servicios y menús programados para hoy |
| Conductor | Dirección y contacto de entregas pendientes; confirmación de entrega |

Los cargos separados en una fila siguen siendo roles independientes. Los permisos de varios roles se acumulan; un código desconocido no concede acceso. Los cargos nuevos no pueden consultar usuarios, sesiones ni asignaciones de acceso. Las vistas de jornada usan la fecha de Ecuador.

## API

`GET /api/v1/equipo/panel` entrega perfil, capacidades y proyecciones de cocina, jornada o entregas según corresponda. Las operaciones `/equipo/platos`, `/equipo/recetas`, `/equipo/compras`, `/equipo/produccion` y `/equipo/planificar` reutilizan las validaciones y transacciones de cocina. Los metadatos de `/admin/gestion` limitan tablas, columnas y acciones por cargo; el servidor vuelve a comprobar esos límites al escribir.

La confirmación de una entrega solo admite `EN_PROCESO → ENTREGADA` para pedidos a domicilio. El bloqueo de fila evita duplicar la confirmación y su auditoría.

## Cuentas privadas

La migración agrega los 15 roles sin eliminar datos existentes. `scripts/aprovisionar-equipo.mjs` crea una cuenta por cargo con contraseña aleatoria independiente. Requiere una ruta `.txt` fuera del proyecto y de la carpeta publicada. No sobrescribe cuentas existentes con otras credenciales. Reejecutarlo con el mismo archivo comprueba los accesos y conserva las claves.

Las contraseñas se entregan al propietario en un archivo privado. No se incluyen en Git, GitHub Pages ni archivos servidos por la aplicación. El administrador puede crear otras cuentas desde Personas y acceso.

## Verificación

`npm test` cubre autenticación, capacidades, permisos acumulados, rechazo de roles desconocidos y límites del archivo privado. `npm run test:db` usa exclusivamente `valora_operacion_pruebas` en `127.0.0.1`; incluye dos confirmaciones concurrentes y consultas de HSE. No ejecutar pruebas con datos sintéticos sobre producción.
