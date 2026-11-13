const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'dazi_solar.db');
const dbDir = path.dirname(dbPath);
fs.mkdirSync(dbDir, { recursive: true });

const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

async function withTransaction(operation) {
  await run('BEGIN IMMEDIATE');
  try {
    const result = await operation();
    await run('COMMIT');
    return result;
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  }
}

async function initializeDatabase() {
  await run('PRAGMA foreign_keys = ON');

  const schema = [
    `CREATE TABLE IF NOT EXISTS usuarios (
      id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT UNIQUE NOT NULL,
      contrasena_hash TEXT NOT NULL,
      rol TEXT CHECK(rol IN ('admin', 'cliente')) NOT NULL,
      fecha_creacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS productos (
      id_producto INTEGER PRIMARY KEY,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      precio_compra REAL NOT NULL CHECK(precio_compra >= 0),
      precio_venta REAL NOT NULL CHECK(precio_venta >= 0),
      stock_disponible INTEGER NOT NULL CHECK(stock_disponible >= 0),
      imagen TEXT,
      activo INTEGER NOT NULL DEFAULT 1 CHECK(activo IN (0,1))
    )`,
    `CREATE TABLE IF NOT EXISTS facturas_compra (
      id_factura INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_producto INTEGER NOT NULL,
      cantidad_comprada INTEGER NOT NULL CHECK(cantidad_comprada > 0),
      precio_unitario REAL NOT NULL CHECK(precio_unitario >= 0),
      total_compra REAL NOT NULL CHECK(total_compra >= 0),
      tipo_movimiento TEXT NOT NULL DEFAULT 'Entrada' CHECK(tipo_movimiento = 'Entrada'),
      FOREIGN KEY(id_producto) REFERENCES productos(id_producto)
    )`,
    `CREATE TABLE IF NOT EXISTS facturas_venta (
      id_factura INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_producto INTEGER NOT NULL,
      cantidad_vendida INTEGER NOT NULL CHECK(cantidad_vendida > 0),
      precio_unitario REAL NOT NULL CHECK(precio_unitario >= 0),
      total_venta REAL NOT NULL CHECK(total_venta >= 0),
      tipo_movimiento TEXT NOT NULL DEFAULT 'Salida' CHECK(tipo_movimiento = 'Salida'),
      id_usuario INTEGER NOT NULL,
      FOREIGN KEY(id_producto) REFERENCES productos(id_producto),
      FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario)
    )`,
    `CREATE TABLE IF NOT EXISTS movimientos_inventario (
      id_movimiento INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_producto INTEGER NOT NULL,
      cantidad INTEGER NOT NULL CHECK(cantidad > 0),
      tipo_movimiento TEXT NOT NULL CHECK(tipo_movimiento IN ('Entrada', 'Salida')),
      id_factura INTEGER,
      origen TEXT NOT NULL CHECK(origen IN ('compra', 'venta')),
      FOREIGN KEY(id_producto) REFERENCES productos(id_producto)
    )`
  ];

  for (const statement of schema) {
    await run(statement);
  }

  const usuarioAdmin = await get('SELECT id_usuario FROM usuarios WHERE usuario = ?', ['Admin']);
  if (!usuarioAdmin) {
    const hash = await bcrypt.hash('Admin', 10);
    await run(
      'INSERT INTO usuarios (usuario, contrasena_hash, rol) VALUES (?, ?, ?)',
      ['Admin', hash, 'admin']
    );
  }

  const totalProductos = await get('SELECT COUNT(*) AS total FROM productos');
  if ((totalProductos?.total || 0) === 0) {
    const datosProductos = [
      {
        id_producto: 1,
        nombre: 'Panel Solar Monocristalino 400W',
        descripcion: 'Panel fotovoltaico de alta eficiencia para hogares y pequeños negocios.',
        precio_compra: 7600,
        precio_venta: 9800,
        stock_disponible: 18,
        imagen: '/img/productos/panel_400w.svg'
      },
      {
        id_producto: 2,
        nombre: 'Panel Solar Monocristalino 500W',
        descripcion: 'Modelo de 500W ideal para sistemas domésticos con mayor demanda.',
        precio_compra: 9000,
        precio_venta: 11600,
        stock_disponible: 12,
        imagen: '/img/productos/panel_500w.svg'
      },
      {
        id_producto: 3,
        nombre: 'Inversor Híbrido 3kW',
        descripcion: 'Inversor híbrido con monitoreo inteligente y compatibilidad con baterías.',
        precio_compra: 26000,
        precio_venta: 33800,
        stock_disponible: 8,
        imagen: '/img/productos/inversor_hibrido.svg'
      },
      {
        id_producto: 4,
        nombre: 'Batería de Litio 5kWh',
        descripcion: 'Batería modular para almacenamiento seguro de energía solar.',
        precio_compra: 45000,
        precio_venta: 58900,
        stock_disponible: 6,
        imagen: '/img/productos/bateria_litio.svg'
      },
      {
        id_producto: 5,
        nombre: 'Controlador de Carga MPPT 60A',
        descripcion: 'Regulador inteligente para optimizar el flujo de energía hacia la batería.',
        precio_compra: 12000,
        precio_venta: 15800,
        stock_disponible: 14,
        imagen: '/img/productos/controlador_mppt.svg'
      },
      {
        id_producto: 6,
        nombre: 'Kit Solar Residencial 3kW',
        descripcion: 'Sistema completo para viviendas con consumo medio.',
        precio_compra: 51000,
        precio_venta: 67400,
        stock_disponible: 5,
        imagen: '/img/productos/kit_residencial.svg'
      },
      {
        id_producto: 7,
        nombre: 'Cable Solar 6mm',
        descripcion: 'Cable de cobre resistente a la intemperie para instalaciones fotovoltaicas.',
        precio_compra: 800,
        precio_venta: 1200,
        stock_disponible: 90,
        imagen: '/img/productos/cable_solar.svg'
      },
      {
        id_producto: 8,
        nombre: 'Estructura de Montaje para Techo',
        descripcion: 'Kit de fijación para paneles solares en techos inclinados.',
        precio_compra: 5200,
        precio_venta: 7600,
        stock_disponible: 21,
        imagen: '/img/productos/estructura_montaje.svg'
      },
      {
        id_producto: 9,
        nombre: 'Kit de Energía Solar para Off-Grid',
        descripcion: 'Solución completa para zonas sin conexión a la red eléctrica.',
        precio_compra: 68000,
        precio_venta: 89200,
        stock_disponible: 4,
        imagen: '/img/productos/kit_offgrid.svg'
      },
      {
        id_producto: 10,
        nombre: 'Inversor On-Grid 5kW',
        descripcion: 'Inversor para instalaciones conectadas a la red con alto rendimiento.',
        precio_compra: 31000,
        precio_venta: 40500,
        stock_disponible: 7,
        imagen: '/img/productos/inversor_ongrid.svg'
      }
    ];

    for (const producto of datosProductos) {
      await run(
        `INSERT INTO productos (id_producto, nombre, descripcion, precio_compra, precio_venta, stock_disponible, imagen, activo)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          producto.id_producto,
          producto.nombre,
          producto.descripcion,
          producto.precio_compra,
          producto.precio_venta,
          producto.stock_disponible,
          producto.imagen
        ]
      );
    }
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  withTransaction,
  initializeDatabase,
  getDb: () => db,
  dbPath
};
