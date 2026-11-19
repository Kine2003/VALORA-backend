const rutasAnteriores = new Map([
  ["/data/productos.json", "/productos"],
  ["/data/servicios.json", "/servicios"],
  ["/api/salud", "/salud"],
  ["/api/cotizaciones", "/cotizaciones"],
  ["/api/pedidos", "/pedidos"],
]);

export function resolverVersion(ruta) {
  if (rutasAnteriores.has(ruta)) return { recurso: rutasAnteriores.get(ruta) };
  if (ruta !== "/api" && !ruta.startsWith("/api/")) return null;
  const [, , version, ...recurso] = ruta.split("/");
  if (version !== "v1") return { error: "Versión de API no disponible. Usa /api/v1." };
  return { recurso: "/" + recurso.join("/") };
}
