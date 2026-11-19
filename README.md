# Válora backend

API Node.js de Válora para publicar como **Web Service** en Render.

En Render usa:

- **Build Command:** `npm ci`
- **Start Command:** `npm start`

Configura `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` y `FRONTEND_ORIGIN` como variables de entorno. La base de datos debe ser MySQL compatible y tener ejecutados `sql/esquema.sql`, `sql/vistas.sql` y `sql/permisos.sql`.

## CI/CD

El workflow `Backend CI/CD` valida en cada cambio a `main` o pull request:

- Sintaxis JavaScript, estructura del backend y catálogos.
- Compatibilidad de `package.json` con `package-lock.json` y Node.js 24.
- Rutas `/api/v1/`, métodos HTTP, respuestas JSON y validación de entradas.
- Árbol de dependencias y vulnerabilidades con `npm audit`.
- Vulnerabilidades de código mediante CodeQL.

Las pruebas HTTP usan servicios simulados, por lo que no requieren credenciales ni una base de datos durante CI.
