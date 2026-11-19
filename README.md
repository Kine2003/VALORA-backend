# Válora backend

API Node.js de Válora para publicar como **Web Service** en Render.

En Render usa:

- **Build Command:** `npm ci`
- **Start Command:** `npm start`

Configura `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` y `FRONTEND_ORIGIN` como variables de entorno. La base de datos debe ser MySQL compatible y tener ejecutados `sql/esquema.sql`, `sql/vistas.sql` y `sql/permisos.sql`.
