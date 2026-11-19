import { calcularLinea, calcularTotales, crearResumenPedido } from "../lib/cart.js";
import { transaccion } from "../datos/mysql.js";
import { productos } from "../modelos/catalogo.js";
import { SolicitudInvalida } from "../modelos/solicitud-invalida.js";
import { existeServicio, buscarTipoComida, crearCliente, insertarCotizacion, insertarPedido } from "../repositorios/solicitudes.js";

export function cotizar(pool, datos) {
  return transaccion(pool, async db => {
    if (!await existeServicio(db, datos.servicio)) {
      throw new SolicitudInvalida("El servicio seleccionado ya no está disponible.");
    }
    const idComida = datos.tipoComida ? await buscarTipoComida(db, datos.tipoComida) : null;
    if (datos.tipoComida && idComida === null) {
      throw new SolicitudInvalida("El tipo de comida ya no está disponible.");
    }
    const cliente = await crearCliente(db, datos);
    const id = await insertarCotizacion(db, cliente, idComida, datos);
    return { id };
  });
}

export function guardarPedido(pool, contacto, lineas) {
  return transaccion(pool, async db => {
    const catalogo = (await productos(db)).productos;
    let totales;
    let detalles;
    let resumen;
    try {
      totales = calcularTotales(lineas, catalogo, contacto.entrega);
      detalles = lineas.map(linea => calcularLinea(linea, catalogo));
      resumen = crearResumenPedido(lineas, catalogo, contacto);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      throw new SolicitudInvalida("Revisa los paquetes, menús y cantidades del pedido. El catálogo pudo cambiar.");
    }

    const cliente = await crearCliente(db, contacto);
    const id = await insertarPedido(db, cliente, contacto, totales.entregaCentavos, detalles, lineas);
    return { id, resumen };
  });
}
