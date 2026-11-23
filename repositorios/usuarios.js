const USUARIO_CON_ROLES = `SELECT u.id_usuario,u.nombre,u.correo,u.password_hash,u.activo,COALESCE(array_agg(DISTINCT r.codigo) FILTER(WHERE r.codigo IS NOT NULL AND r.activo=1),'{}') AS roles FROM usuario u LEFT JOIN usuario_rol ur ON ur.id_usuario=u.id_usuario LEFT JOIN rol r ON r.id_rol=ur.id_rol`;
export async function buscarUsuarioPorCorreo(db, correo) {
  return (
    (
      await db.query(
        USUARIO_CON_ROLES + " WHERE u.correo=$1 GROUP BY u.id_usuario",
        [correo],
      )
    ).rows[0] ?? null
  );
}
export async function crearUsuarioCliente(
  db,
  { nombre, correo, password_hash },
) {
  const usuario = (
    await db.query(
      "INSERT INTO usuario(nombre,correo,password_hash) VALUES($1,$2,$3) RETURNING id_usuario,nombre,correo",
      [nombre, correo, password_hash],
    )
  ).rows[0];
  await db.query(
    "INSERT INTO usuario_rol(id_usuario,id_rol) SELECT $1,id_rol FROM rol WHERE codigo IN ('USUARIO','CLIENTE') ON CONFLICT DO NOTHING",
    [usuario.id_usuario],
  );
  return usuario;
}
export async function guardarSesion(
  db,
  idUsuario,
  tokenHash,
  horas = 168,
  refreshHash = null,
  familia = null,
  expiraEn = null,
) {
  await db.query(
    "INSERT INTO sesion_usuario(id_usuario,token_hash,expira_en,refresh_hash,familia) VALUES($1,$2,COALESCE($6::timestamp,NOW()+make_interval(hours=>$3)),$4,$5)",
    [idUsuario, tokenHash, horas, refreshHash, familia, expiraEn],
  );
}
export async function buscarSesion(db, tokenHash) {
  return (
    (
      await db.query(
        USUARIO_CON_ROLES +
          ` JOIN sesion_usuario s ON s.id_usuario=u.id_usuario WHERE s.token_hash=$1 AND s.revocada_en IS NULL AND s.expira_en>NOW() AND s.refresh_usado_en IS NULL AND u.activo=1 GROUP BY u.id_usuario`,
        [tokenHash],
      )
    ).rows[0] ?? null
  );
}
export async function revocarSesion(db, tokenHash) {
  return db.query(
    "UPDATE sesion_usuario SET revocada_en=NOW() WHERE familia IN (SELECT familia FROM sesion_usuario WHERE token_hash=$1 OR refresh_hash=$1) AND revocada_en IS NULL",
    [tokenHash],
  );
}
export const marcarAcceso = (db, id) =>
  db.query("UPDATE usuario SET ultimo_acceso=NOW() WHERE id_usuario=$1", [id]);
export async function consumirLimite(db, clave, maximo = 10) {
  await db.query(
    "DELETE FROM limite_autenticacion WHERE clave IN (SELECT clave FROM limite_autenticacion WHERE ventana<NOW()-INTERVAL '1 day' LIMIT 100)",
  );
  const { rows } = await db.query(
    `INSERT INTO limite_autenticacion(clave) VALUES($1) ON CONFLICT(clave) DO UPDATE SET intentos=CASE WHEN limite_autenticacion.ventana<NOW()-INTERVAL '10 minutes' THEN 1 ELSE limite_autenticacion.intentos+1 END, ventana=CASE WHEN limite_autenticacion.ventana<NOW()-INTERVAL '10 minutes' THEN NOW() ELSE limite_autenticacion.ventana END RETURNING intentos`,
    [clave],
  );
  return rows[0].intentos <= maximo;
}
export async function bloquearRefresh(db, hash) {
  return (
    (
      await db.query(
        "SELECT *,expira_en>NOW() AS vigente FROM sesion_usuario WHERE refresh_hash=$1 FOR UPDATE",
        [hash],
      )
    ).rows[0] ?? null
  );
}
export const consumirRefresh = (db, id) =>
  db.query(
    "UPDATE sesion_usuario SET refresh_usado_en=NOW(),revocada_en=NOW() WHERE id_sesion=$1",
    [id],
  );
export const revocarFamilia = (db, familia) =>
  db.query(
    "UPDATE sesion_usuario SET revocada_en=COALESCE(revocada_en,NOW()) WHERE familia=$1",
    [familia],
  );
