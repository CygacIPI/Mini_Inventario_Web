const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');

dotenv.config();

const { initializeDatabase, get } = require('./db');
const authRoutes = require('./routes/auth');
const inventarioRoutes = require('./routes/inventario');
const bdRoutes = require('./routes/bd');
const { cargarUsuarioSesion } = require('./middleware/auth');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = path.join(__dirname, '..');
app.locals.dbReady = initializeDatabase();

app.use(async (_req, _res, next) => {
  try {
    await app.locals.dbReady;
    next();
  } catch (error) {
    next(error);
  }
});

app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'mini-inventario-web-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 12
  }
}));

app.use(cargarUsuarioSesion);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta más tarde.' }
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/registro', loginLimiter);

app.use('/api/auth', authRoutes);
app.use('/api', inventarioRoutes);
app.use('/api/bd', bdRoutes);

app.use('/css', express.static(path.join(ROOT_DIR, 'src', 'css')));
app.use('/js', express.static(path.join(ROOT_DIR, 'src', 'js')));
app.use('/img', express.static(path.join(ROOT_DIR, 'img')));

app.get('/api/salud', (_req, res) => {
  res.json({ estado: 'ok' });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'src', 'html', 'tienda.html'));
});

app.get('/panel-administrativo', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/');
  }

  const usuario = await get('SELECT rol FROM usuarios WHERE id_usuario = ?', [req.session.userId]);
  if (!usuario || usuario.rol !== 'admin') {
    return res.redirect('/');
  }

  req.session.pasoPorPanelAdmin = true;
  return res.sendFile(path.join(ROOT_DIR, 'src', 'html', 'panel_administrativo.html'));
});

app.get('/panel-base-de-datos', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/panel-administrativo');
  }

  const usuario = await get('SELECT rol FROM usuarios WHERE id_usuario = ?', [req.session.userId]);
  if (!usuario || usuario.rol !== 'admin') {
    return res.redirect('/panel-administrativo');
  }

  if (req.session.pasoPorPanelAdmin !== true) {
    return res.redirect('/panel-administrativo');
  }

  return res.sendFile(path.join(ROOT_DIR, 'src', 'html', 'panel_base_de_datos.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

async function startServer() {
  await initializeDatabase();
  return app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('No se pudo iniciar el servidor:', error);
    process.exit(1);
  });
}

module.exports = app;
