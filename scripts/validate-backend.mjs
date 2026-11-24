import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const requiredFiles = [
  "servidor.js",
  "rutas/api.js",
  "middleware/json.js",
  "middleware/version-api.js",
  "datos/postgres.js",
  "migrar.js",
  "sql/esquema-postgres.sql",
  "sql/vistas-postgres.sql",
  "sql/actualizacion-auth.sql",
  "sql/actualizacion-gestion.sql",
  "sql/actualizacion-operacion.sql",
  "sql/actualizacion-equipo.sql",
  "package.json",
  "package-lock.json",
  "data/productos.json",
  "data/servicios.json",
];

async function archivosJavaScript(directorio) {
  const entradas = await readdir(directorio, { withFileTypes: true });
  const archivos = [];
  for (const entrada of entradas) {
    if (entrada.name === "node_modules" || entrada.name.startsWith(".")) continue;
    const ruta = join(directorio, entrada.name);
    if (entrada.isDirectory()) archivos.push(...await archivosJavaScript(ruta));
    else if (entrada.isFile() && /\.m?js$/.test(ruta)) archivos.push(ruta);
  }
  return archivos;
}

for (const archivo of requiredFiles) {
  try {
    await readFile(join(root, archivo));
  } catch {
    throw new Error(`Falta un archivo requerido: ${archivo}`);
  }
}

const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const packageLock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
if (packageJson.type !== "module" || packageJson.engines?.node !== ">=24") {
  throw new Error("El backend debe declarar módulos ESM y Node.js >=24.");
}
if (packageLock.name !== packageJson.name || packageLock.version !== packageJson.version) {
  throw new Error("package-lock.json no coincide con package.json.");
}
if (packageLock.lockfileVersion < 3) {
  throw new Error("package-lock.json debe usar lockfileVersion 3 o superior.");
}
for (const [nombre, version] of Object.entries({
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
})) {
  if (!packageLock.packages?.["node_modules/" + nombre]) {
    throw new Error(`Dependencia ausente en package-lock.json: ${nombre}@${version}`);
  }
}

const productos = JSON.parse(await readFile(join(root, "data/productos.json"), "utf8"));
const servicios = JSON.parse(await readFile(join(root, "data/servicios.json"), "utf8"));
if (productos.version !== 2 || servicios.version !== 3) {
  throw new Error("Las versiones de los catálogos no coinciden con la API.");
}

for (const archivo of await archivosJavaScript(root)) {
  execFileSync(process.execPath, ["--check", archivo], { stdio: "inherit" });
}
const cantidadArchivos = (await archivosJavaScript(root)).length;
console.log(`Backend válido: ${cantidadArchivos} archivos JavaScript revisados.`);
