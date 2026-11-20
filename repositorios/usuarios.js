const USUARIO_CON_ROLES = `
  SELECT u.id_usuario, u.nombre, u.correo, u.password_hash, u.activo,
         COALESCE(array_agg(DISTINCT r.codigo) FILTER (WHERE r.codigo IS NOT NULL), '{}') AS roles
  FROM usuario u
  LEFT JOIN usuario_rol ur ON ur.id_usuario = u.id_usuario
  LEFT JOIN rol r ON r.id_rol = ur.id_rol
`;

export async function buscarUsuarioPorCorreo(db, correo) {
  const { rows } = await db.query(
    USUARIO_CON_ROLES + " WHERE u.correo = $1 GROUP BY u.id_usuario",
    [correo],
  );
  return rows[0] ?? null;
}

export async function crearUsuarioCliente(db, { nombre, correo, password_hash }) {
  const { rows } = await db.query(
    "INSERT INTO usuario (nombre, correo, password_hash) VALUES ($1, $2, $3) RETURNING id_usuario, nombre, correo",
    [nombre, correo, password_hash],
  );
  const usuario = rows[0];
  const { rows: roles } = await db.query("SELECT id_rol FROM rol WHERE codigo = 'CLIENTE'");
  if (roles[0]) {
    await db.query(
      "INSERT INTO usuario_rol (id_usuario, id_rol) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [usuario.id_usuario, roles[0].id_rol],
    );
  }
  return usuario;
}

export async function guardarSesion(db, idUsuario, tokenHash, horas = 24) {
  await db.query(
    "INSERT INTO sesion_usuario (id_usuario, token_hash, expira_en) VALUES ($1, $2, NOW() + make_interval(hours => $3))",
    [idUsuario, tokenHash, horas],
  );
}

export async function buscarSesion(db, tokenHash) {
  const { rows } = await db.query(
    `SELECT u.id_usuario, u.nombre, u.correo,
            COALESCE(array_agg(DISTINCT r.codigo) FILTER (WHERE r.codigo IS NOT NULL), '{}') AS roles
     FROM sesion_usuario s
     JOIN usuario u ON u.id_usuario = s.id_usuario
     LEFT JOIN usuario_rol ur ON ur.id_usuario = u.id_usuario
     LEFT JOIN rol r ON r.id_rol = ur.id_rol
     WHERE s.token_hash = $1 AND s.revocada_en IS NULL AND s.expira_en > NOW() AND u.activo = 1
     GROUP BY u.id_usuario`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export function revocarSesion(db, tokenHash) {
  return db.query(
    "UPDATE sesion_usuario SET revocada_en = NOW() WHERE token_hash = $1 AND revocada_en IS NULL",
    [tokenHash],
  );
}

export function marcarAcceso(db, idUsuario) {
  return db.query("UPDATE usuario SET ultimo_acceso = NOW() WHERE id_usuario = $1", [idUsuario]);
}
