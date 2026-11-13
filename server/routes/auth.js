const express = require('express');
const bcrypt = require('bcryptjs');
const { get, run, all } = require('../db');
const { requiereSesion, requiereAdmin } = require('../middleware/auth');
const { esUsuarioValido, esContrasenaValida } = require('../utils');

const router = express.Router();

function normalizarUsuario(usuario) {
  return String(usuario || '').trim();
}

router.post('/registro', async (req, res) => {
  const usuario = normalizarUsuario(req.body.usuario);
  const contrasena = String(req.body.contrasena || '').trim();

  if (!esUsuarioValido(usuario)) {
    return res.status(400).json({ error: 'El nombre de usuario debe tener entre 4 y 30 caracteres.' });
  }

  if (!esContrasenaValida(contrasena)) {
    return res.status(400).json({ error: 'La contraseña debe tener entre 4 y 80 caracteres.' });
  }

  const usuarioExistente = await get('SELECT id_usuario FROM usuarios WHERE usuario = ?', [usuario]);
  if (usuarioExistente) {
    return res.status(409).json({ error: 'El usuario ya existe.' });
  }

  const contrasenaHash = await bcrypt.hash(contrasena, 10);
  const resultado = await run('INSERT INTO usuarios (usuario, contrasena_hash, rol) VALUES (?, ?, ?)', [usuario, contrasenaHash, 'cliente']);

  req.session.userId = resultado.lastID;
  req.session.rol = 'cliente';

  return res.status(201).json({
    mensaje: 'Usuario registrado correctamente.',
    usuario: { id_usuario: resultado.lastID, usuario, rol: 'cliente' }
  });
});

router.post('/login', async (req, res) => {
  const usuario = normalizarUsuario(req.body.usuario);
  const contrasena = String(req.body.contrasena || '');

  if (!usuario || !contrasena) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios.' });
  }

  const usuarioDb = await get('SELECT * FROM usuarios WHERE usuario = ?', [usuario]);
  if (!usuarioDb) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }

  const coincide = await bcrypt.compare(contrasena, usuarioDb.contrasena_hash);
  if (!coincide) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }

  req.session.userId = usuarioDb.id_usuario;
  req.session.rol = usuarioDb.rol;
  req.session.pasoPorPanelAdmin = Boolean(req.session.pasoPorPanelAdmin);

  return res.json({
    mensaje: 'Sesión iniciada correctamente.',
    usuario: { id_usuario: usuarioDb.id_usuario, usuario: usuarioDb.usuario, rol: usuarioDb.rol }
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'No se pudo cerrar la sesión.' });
    }
    return res.json({ mensaje: 'Sesión cerrada.' });
  });
});

router.get('/yo', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const usuario = await get('SELECT id_usuario, usuario, rol, fecha_creacion FROM usuarios WHERE id_usuario = ?', [req.session.userId]);
  if (!usuario) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  return res.json({ usuario: { ...usuario } });
});

router.get('/usuarios', requiereAdmin, async (req, res) => {
  const rows = await all('SELECT id_usuario, usuario, rol, fecha_creacion FROM usuarios ORDER BY id_usuario ASC');
  return res.json({ usuarios: rows.map((usuario) => ({
    ...usuario,
    contrasena_hash: '********' 
  })) });
});

router.post('/usuarios', requiereAdmin, async (req, res) => {
  const usuario = normalizarUsuario(req.body.usuario);
  const contrasena = String(req.body.contrasena || '');
  const rolSolicitado = req.body.rol === 'admin' ? 'admin' : 'cliente';

  if (!esUsuarioValido(usuario)) {
    return res.status(400).json({ error: 'El nombre de usuario debe tener entre 4 y 30 caracteres.' });
  }

  if (!esContrasenaValida(contrasena)) {
    return res.status(400).json({ error: 'La contraseña debe tener entre 4 y 80 caracteres.' });
  }

  const existe = await get('SELECT id_usuario FROM usuarios WHERE usuario = ?', [usuario]);
  if (existe) {
    return res.status(409).json({ error: 'El usuario ya existe.' });
  }

  const hash = await bcrypt.hash(contrasena, 10);
  const resultado = await run('INSERT INTO usuarios (usuario, contrasena_hash, rol) VALUES (?, ?, ?)', [usuario, hash, rolSolicitado]);

  return res.status(201).json({
    mensaje: 'Usuario creado con éxito.',
    usuario: { id_usuario: resultado.lastID, usuario, rol: rolSolicitado }
  });
});

router.put('/usuarios/:id', requiereAdmin, async (req, res) => {
  const idUsuario = Number(req.params.id);
  const rol = req.body.rol === 'admin' ? 'admin' : 'cliente';

  const usuarioActual = await get('SELECT * FROM usuarios WHERE id_usuario = ?', [idUsuario]);
  if (!usuarioActual) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }

  if (usuarioActual.id_usuario === req.session.userId && rol !== 'admin') {
    return res.status(400).json({ error: 'No puedes quitarte a ti mismo el rol de administrador.' });
  }

  await run('UPDATE usuarios SET rol = ? WHERE id_usuario = ?', [rol, idUsuario]);
  return res.json({ mensaje: 'Rol actualizado.', rol });
});

router.delete('/usuarios/:id', requiereAdmin, async (req, res) => {
  const idUsuario = Number(req.params.id);
  const actual = await get('SELECT * FROM usuarios WHERE id_usuario = ?', [idUsuario]);
  if (!actual) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }

  if (actual.id_usuario === req.session.userId) {
    return res.status(400).json({ error: 'No puedes eliminar tu propio usuario.' });
  }

  const admins = await all('SELECT COUNT(*) AS total FROM usuarios WHERE rol = ?', ['admin']);
  if (actual.rol === 'admin' && Number(admins[0].total) <= 1) {
    return res.status(400).json({ error: 'No se puede dejar el sistema sin administradores.' });
  }

  await run('DELETE FROM usuarios WHERE id_usuario = ?', [idUsuario]);
  return res.json({ mensaje: 'Usuario eliminado.' });
});

module.exports = router;
