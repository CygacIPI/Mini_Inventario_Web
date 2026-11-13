const { get } = require('../db');

async function cargarUsuarioSesion(req, res, next) {
  if (!req.session || !req.session.userId) {
    return next();
  }

  try {
    const usuario = await get('SELECT id_usuario, usuario, rol FROM usuarios WHERE id_usuario = ?', [req.session.userId]);
    req.usuario = usuario || null;
    req.session.rol = usuario ? usuario.rol : null;
    return next();
  } catch (error) {
    return res.status(500).json({ error: 'Error al cargar la sesión' });
  }
}

function requiereSesion(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Debe iniciar sesión' });
  }
  return next();
}

async function requiereAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Debe iniciar sesión' });
  }

  try {
    const usuario = await get('SELECT rol FROM usuarios WHERE id_usuario = ?', [req.session.userId]);
    if (!usuario || usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'No tienes permisos de administrador' });
    }
    return next();
  } catch (error) {
    return res.status(500).json({ error: 'Error al verificar permisos' });
  }
}

function requierePasoPorPanelAdmin(req, res, next) {
  if (!req.session || req.session.pasoPorPanelAdmin !== true) {
    return res.redirect('/panel-administrativo');
  }
  return next();
}

module.exports = {
  cargarUsuarioSesion,
  requiereSesion,
  requiereAdmin,
  requierePasoPorPanelAdmin
};
