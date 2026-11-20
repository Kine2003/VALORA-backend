# Válora backend

API Node.js de Válora con PostgreSQL para publicar como **Web Service** en Render.

En Render usa:

- **Build Command:** `npm ci && npm run db:migrate && npm run db:seed`
- **Start Command:** `npm start`

En Render crea una base PostgreSQL y configura `DATABASE_URL` con la URL interna de la base, además de `FRONTEND_ORIGIN`. Ejecuta en la base los archivos [sql/esquema-postgres.sql](sql/esquema-postgres.sql) y [sql/vistas-postgres.sql](sql/vistas-postgres.sql), y después `npm run db:seed` usando la misma `DATABASE_URL`.

En este equipo PostgreSQL 18 está instalado como servicio de Windows y pgAdmin tiene la conexión **VÁLORA local**. La base se llama `valora`, el usuario es `admin`, el host es `127.0.0.1` y el puerto es `5432`. La contraseña está en el archivo local `.env`, excluido de Git.

Para trabajar con la base local, ejecuta `npm start` desde esta carpeta. El archivo local `.env` configura la API en el puerto 3001. Puedes comprobar la conexión en `http://127.0.0.1:3001/api/v1/salud`.

En una instalación nueva, crea la base y su usuario, configura `DATABASE_URL` o las variables `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD`, y ejecuta `npm run db:migrate` y `npm run db:seed`.

Render ya tiene una base independiente llamada `valora-db`. El comando de construcción ejecuta la migración y la carga inicial sobre la base indicada por `DATABASE_URL`. Los pedidos creados en el equipo local y los creados en Render se guardan en sus respectivas bases. Para gestionar Render desde pgAdmin, registra otra conexión usando los datos externos que muestra Render. El backend alojado en Render debe usar la URL interna de la base.

`FRONTEND_ORIGIN` debe contener `https://kine2003.github.io`. La URL completa de GitHub Pages es `https://kine2003.github.io/VALORA-frontend/`. El servidor usa el origen para permitir las peticiones del navegador.

## CI/CD

El workflow `Backend CI/CD` valida en cada cambio a `main` o pull request:

- Sintaxis JavaScript, estructura del backend y catálogos.
- Compatibilidad de `package.json` con `package-lock.json` y Node.js 24.
- Rutas `/api/v1/`, métodos HTTP, respuestas JSON y validación de entradas.
- Árbol de dependencias y vulnerabilidades con `npm audit`.
- Vulnerabilidades de código mediante CodeQL.

Las pruebas HTTP usan servicios simulados, por lo que no requieren credenciales ni una base de datos durante CI.
