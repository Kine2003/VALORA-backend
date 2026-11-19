export function validarCatalogo(datos) {
  const textoValido = (valor, maximo) =>
    typeof valor === "string" && valor.trim().length > 0 && valor.length <= maximo;
  if (datos?.version !== 3 || !datos.servicios || typeof datos.servicios !== "object" ||
      Array.isArray(datos.servicios)) throw new Error("Catálogo no válido.");
  const entradas = Object.entries(datos.servicios);
  if (!entradas.length || entradas.length > 30) throw new Error("Catálogo no válido.");
  const categorias = ["diario", "eventos", "bienestar", "abastecimiento"];
  const iconos = ["i-plate", "i-cup", "i-leaf", "i-box"];
  const visuales = ["visual-azul", "visual-morado", "visual-dorado", "visual-suave"];
  return Object.fromEntries(entradas.map(([id, servicio]) => {
    if (!/^[a-z]+(?:-[a-z]+)+$/.test(id) || !servicio ||
        !categorias.includes(servicio.categoria) || !iconos.includes(servicio.icono) ||
        !visuales.includes(servicio.estilo) || !textoValido(servicio.etiqueta, 80) ||
        !textoValido(servicio.frase, 120) || !textoValido(servicio.nombre, 140) ||
        !textoValido(servicio.resumen, 300) || !textoValido(servicio.descripcion, 1200) ||
        !Array.isArray(servicio.incluye) || !servicio.incluye.length ||
        servicio.incluye.length > 12 || !servicio.incluye.every(item => textoValido(item, 300))) {
      throw new Error("El catálogo contiene un servicio no válido.");
    }
    return [id, {
      categoria: servicio.categoria,
      etiqueta: servicio.etiqueta,
      frase: servicio.frase,
      icono: servicio.icono,
      estilo: servicio.estilo,
      nombre: servicio.nombre.trim(),
      resumen: servicio.resumen.trim(),
      descripcion: servicio.descripcion.trim(),
      incluye: servicio.incluye.map(item => item.trim()),
    }];
  }));
}
