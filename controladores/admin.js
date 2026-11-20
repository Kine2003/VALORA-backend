export function consultarResumen(api) {
  return api.resumenAdmin();
}

export function consultarSolicitudes(api) {
  return api.solicitudesAdmin();
}

export function consultarClientes(api) {
  return api.clientesAdmin();
}

export function consultarCuenta(api, _datos, _peticion, usuario) {
  return api.solicitudesCuenta(usuario);
}

export function actualizarSolicitud(api, datos, _peticion, usuario, parametros) {
  return api.actualizarEstado(parametros[0], datos?.estado, usuario);
}

export function consultarCatalogoAdmin(api) {
  return api.catalogoAdministrable();
}

export function crearProducto(api, datos) {
  return api.crearProducto(datos);
}

export function editarProducto(api, datos, _peticion, _usuario, parametros) {
  return api.editarProducto(parametros[0], datos);
}

export function eliminarProducto(api, _datos, _peticion, _usuario, parametros) {
  return api.eliminarProducto(parametros[0]);
}

export function pagarOrden(api, datos, _peticion, usuario, parametros) {
  return api.pagarOrden(usuario, parametros[0], datos?.metodo);
}
