# Válora backend

API Node.js de Válora con PostgreSQL para publicar como **Web Service** en Render.

En Render usa:

- **Build Command:** `npm ci`
- **Start Command:** `npm start`

En Render crea una base PostgreSQL y configura `DATABASE_URL` con la URL interna de la base, además de `FRONTEND_ORIGIN`. Ejecuta en la base los archivos [sql/esquema-postgres.sql](sql/esquema-postgres.sql) y [sql/vistas-postgres.sql](sql/vistas-postgres.sql), y después `npm run db:seed` usando la misma `DATABASE_URL`.

Para una instalación local administrada con pgAdmin, copia [.env.example](.env.example), completa `DATABASE_URL` y ejecuta esos mismos scripts SQL desde pgAdmin.

## CI/CD

El workflow `Backend CI/CD` valida en cada cambio a `main` o pull request:

- Sintaxis JavaScript, estructura del backend y catálogos.
- Compatibilidad de `package.json` con `package-lock.json` y Node.js 24.
- Rutas `/api/v1/`, métodos HTTP, respuestas JSON y validación de entradas.
- Árbol de dependencias y vulnerabilidades con `npm audit`.
- Vulnerabilidades de código mediante CodeQL.

Las pruebas HTTP usan servicios simulados, por lo que no requieren credenciales ni una base de datos durante CI.
