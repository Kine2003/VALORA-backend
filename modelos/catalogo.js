import { consultarServicios, consultarProductos } from "../repositorios/catalogo.js";

export async function servicios(db) {
  const { filas, incluidos } = await consultarServicios(db);
  return {
    version: 3,
    servicios: Object.fromEntries(filas.map(({ id, ...servicio }) => [
      id, { ...servicio, incluye: incluidos.filter(item => item.id === id).map(item => item.descripcion) },
    ])),
  };
}

export async function productos(db) {
  const { paquetes, incluidos, ofertas, opciones } = await consultarProductos(db);
  return {
    version: 2,
    moneda: "USD",
    demostracion: true,
    productos: paquetes.map(paquete => ({
      ...paquete,
      incluye: incluidos.filter(item => item.id === paquete.id).map(item => item.descripcion),
      ofertas: ofertas.filter(oferta => oferta.id_paquete === paquete.id).map(oferta => {
        const seleccion = opciones.filter(opcion => opcion.id_paquete === paquete.id && opcion.tipoComida === oferta.tipoComida);
        return {
          tipoComida: oferta.tipoComida,
          precioCentavos: Number(oferta.precio_base_centavos),
          minPersonas: Number(oferta.min_personas),
          maxPersonas: Number(oferta.max_personas),
          menus: seleccion.filter(opcion => opcion.tipo === "MENU").map(({ id, codigo, nombre, precio_adicional_centavos }) => ({
            id, codigo, nombre, extraCentavos: Number(precio_adicional_centavos),
          })),
          extras: seleccion.filter(opcion => opcion.tipo === "EXTRA").map(({ id, codigo, nombre, precio_adicional_centavos }) => ({
            id, codigo, nombre, precioCentavos: Number(precio_adicional_centavos),
          })),
        };
      }).filter(oferta => oferta.menus.length > 0),
    })).filter(paquete => paquete.ofertas.length > 0),
  };
}
