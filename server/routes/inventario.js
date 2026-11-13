const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { all, get, run, withTransaction } = require('../db');
const { requiereAdmin, requiereSesion } = require('../middleware/auth');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'img', 'productos');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const nombreBase = file.originalname.replace(/\s+/g, '_');
    const extension = path.extname(nombreBase);
    const nombreLimpio = `${Date.now()}-${Math.round(Math.random() * 1000)}${extension}`;
    cb(null, nombreLimpio);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const tiposPermitidos = ['image/png', 'image/jpeg', 'image/webp'];
    if (!tiposPermitidos.includes(file.mimetype)) {
      return cb(new Error('Tipo de imagen no permitido. Usa PNG, JPG o WEBP.'));
    }
    return cb(null, true);
  }
});

function parseNumero(value, nombreCampo) {
  const numero = Number(value);
  if (!Number.isFinite(numero) || numero < 0) {
    throw new Error(`${nombreCampo} inválido.`);
  }
  return numero;
}

router.get('/productos', async (req, res) => {
  try {
    const filtro = req.query.q ? `%${String(req.query.q).trim()}%` : '%';
    const rows = await all(
      `SELECT * FROM productos WHERE activo = 1 AND nombre LIKE ? ORDER BY id_producto ASC`,
      [filtro]
    );
    return res.json({ productos: rows });
  } catch (error) {
    return res.status(500).json({ error: 'Error al consultar productos.' });
  }
});

router.get('/productos/:id', async (req, res) => {
  const id = Number(req.params.id);
  const producto = await get('SELECT * FROM productos WHERE id_producto = ? AND activo = 1', [id]);
  if (!producto) {
    return res.status(404).json({ error: 'Producto no encontrado.' });
  }
  return res.json({ producto });
});

router.post('/productos', requiereAdmin, (req, res, next) => {
  upload.single('imagen')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Error al subir la imagen.' });
    }

    try {
      const nombre = String(req.body.nombre || '').trim();
      const descripcion = String(req.body.descripcion || '').trim();
      const precioCompra = parseNumero(req.body.precio_compra, 'Precio de compra');
      const precioVenta = parseNumero(req.body.precio_venta, 'Precio de venta');
      const stock = Number(req.body.stock_disponible);
      if (!nombre) {
        return res.status(400).json({ error: 'El nombre del producto es obligatorio.' });
      }
      if (!Number.isInteger(stock) || stock < 0) {
        return res.status(400).json({ error: 'El stock debe ser un número entero mayor o igual a 0.' });
      }
      if (precioVenta < 0 || precioCompra < 0) {
        return res.status(400).json({ error: 'Los precios no pueden ser negativos.' });
      }

      const idProducto = Number(req.body.id_producto || 0) || null;
      let insertId = idProducto;
      if (!insertId) {
        const ultimo = await get('SELECT MAX(id_producto) AS max_id FROM productos');
        insertId = (ultimo?.max_id || 0) + 1;
      }

      const imagen = req.file ? `/img/productos/${req.file.filename}` : (req.body.imagen || '/img/logo-dazi-solar.svg');
      await run(
        `INSERT INTO productos (id_producto, nombre, descripcion, precio_compra, precio_venta, stock_disponible, imagen, activo)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [insertId, nombre, descripcion, precioCompra, precioVenta, stock, imagen]
      );

      return res.status(201).json({ mensaje: 'Producto agregado con éxito.', producto: { id_producto: insertId } });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Validación incorrecta del producto.' });
    }
  });
});

router.put('/productos/:id', requiereAdmin, (req, res, next) => {
  upload.single('imagen')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Error al subir la imagen.' });
    }

    try {
      const producto = await get('SELECT * FROM productos WHERE id_producto = ?', [Number(req.params.id)]);
      if (!producto) {
        return res.status(404).json({ error: 'Producto no encontrado.' });
      }

      const nombre = String(req.body.nombre || producto.nombre).trim();
      const descripcion = String(req.body.descripcion ?? producto.descripcion).trim();
      const precioCompra = parseNumero(req.body.precio_compra ?? producto.precio_compra, 'Precio de compra');
      const precioVenta = parseNumero(req.body.precio_venta ?? producto.precio_venta, 'Precio de venta');
      const stock = Number(req.body.stock_disponible ?? producto.stock_disponible);
      if (!nombre) {
        return res.status(400).json({ error: 'El nombre del producto es obligatorio.' });
      }
      if (!Number.isInteger(stock) || stock < 0) {
        return res.status(400).json({ error: 'El stock debe ser un número entero mayor o igual a 0.' });
      }

      const imagen = req.file ? `/img/productos/${req.file.filename}` : (req.body.imagen || producto.imagen);
      await run(
        `UPDATE productos SET nombre = ?, descripcion = ?, precio_compra = ?, precio_venta = ?, stock_disponible = ?, imagen = ? WHERE id_producto = ?`,
        [nombre, descripcion, precioCompra, precioVenta, stock, imagen, producto.id_producto]
      );
      return res.json({ mensaje: 'Producto actualizado con éxito.' });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Validación incorrecta del producto.' });
    }
  });
});

router.delete('/productos/:id', requiereAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const producto = await get('SELECT * FROM productos WHERE id_producto = ?', [id]);
  if (!producto) {
    return res.status(404).json({ error: 'Producto no encontrado.' });
  }

  await run('UPDATE productos SET activo = 0 WHERE id_producto = ?', [id]);
  return res.json({ mensaje: 'Producto eliminado lógicamente.' });
});

router.post('/compras', requiereAdmin, async (req, res) => {
  try {
    const inputIdProducto = Number(req.body.id_producto);
    const idProducto = Number.isFinite(inputIdProducto) && inputIdProducto > 0 ? inputIdProducto : null;
    const cantidadComprada = Number(req.body.cantidad_comprada);
    const precioUnitario = Number(req.body.precio_unitario);
    const proveedor = String(req.body.proveedor || '').trim() || 'Proveedor general';
    const metodoPago = String(req.body.metodo_pago || 'efectivo').trim().toLowerCase();
    const nombreProducto = String(req.body.nombre || '').trim();
    const descripcionProducto = String(req.body.descripcion || '').trim();
    let precioVenta = Number(req.body.precio_venta ?? NaN);

    if (!['efectivo', 'transferencia', 'tarjeta', 'cheque'].includes(metodoPago)) {
      return res.status(400).json({ error: 'El método de pago no es válido.' });
    }
    if (!Number.isInteger(cantidadComprada) || cantidadComprada <= 0) {
      return res.status(400).json({ error: 'La cantidad comprada debe ser un entero mayor que 0.' });
    }
    if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
      return res.status(400).json({ error: 'El precio unitario debe ser válido.' });
    }

    let producto = idProducto ? await get('SELECT * FROM productos WHERE id_producto = ? AND activo = 1', [idProducto]) : null;
    let productoId = idProducto;

    if (!producto) {
      if (!nombreProducto) {
        return res.status(400).json({ error: 'Debes indicar el nombre del producto si no existe en el catálogo.' });
      }
      const ultimo = await get('SELECT MAX(id_producto) AS max_id FROM productos');
      productoId = (ultimo?.max_id || 0) + 1;
      precioVenta = Number(req.body.precio_venta ?? precioUnitario);
      await run(
        'INSERT INTO productos (id_producto, nombre, descripcion, precio_compra, precio_venta, stock_disponible, imagen, activo) VALUES (?, ?, ?, ?, ?, ?, "/img/logo-dazi-solar.svg", 1)',
        [productoId, nombreProducto, descripcionProducto, precioUnitario, precioVenta, 0]
      );
      producto = { id_producto: productoId, precio_venta: precioVenta };
    } else {
      precioVenta = Number(req.body.precio_venta ?? producto.precio_venta ?? precioUnitario);
    }

    if (!Number.isFinite(precioVenta) || precioVenta < 0) {
      return res.status(400).json({ error: 'El precio de venta debe ser válido.' });
    }

    const totalCompra = cantidadComprada * precioUnitario;

    await withTransaction(async () => {
      const factura = await run(
        'INSERT INTO facturas_compra (id_producto, cantidad_comprada, precio_unitario, total_compra, proveedor, metodo_pago) VALUES (?, ?, ?, ?, ?, ?)',
        [productoId, cantidadComprada, precioUnitario, totalCompra, proveedor, metodoPago]
      );

      await run(
        'INSERT INTO movimientos_inventario (id_producto, cantidad, tipo_movimiento, id_factura, origen) VALUES (?, ?, ?, ?, ?)',
        [productoId, cantidadComprada, 'Entrada', factura.lastID, 'compra']
      );

      await run(
        'UPDATE productos SET stock_disponible = stock_disponible + ?, precio_compra = ?, precio_venta = ? WHERE id_producto = ?',
        [cantidadComprada, precioUnitario, precioVenta, productoId]
      );

      await run(
        'INSERT INTO caja (id, saldo_actual) VALUES (1, 0) ON CONFLICT(id) DO NOTHING'
      );
      await run('UPDATE caja SET saldo_actual = saldo_actual - ? WHERE id = 1', [totalCompra]);
    });

    return res.status(201).json({ mensaje: 'Compra registrada correctamente.' });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo registrar la compra.' });
  }
});

router.post('/ventas', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Debe iniciar sesión para comprar.' });
    }

    const idProducto = Number(req.body.id_producto);
    const cantidadVendida = Number(req.body.cantidad);
    const usuarioId = req.session.userId;
    const metodoPago = String(req.body.metodo_pago || 'efectivo').trim().toLowerCase();

    if (!['efectivo', 'transferencia', 'tarjeta', 'cheque'].includes(metodoPago)) {
      return res.status(400).json({ error: 'El método de pago no es válido.' });
    }
    if (!Number.isInteger(idProducto) || idProducto <= 0) {
      return res.status(400).json({ error: 'Producto inválido.' });
    }
    if (!Number.isInteger(cantidadVendida) || cantidadVendida <= 0) {
      return res.status(400).json({ error: 'La cantidad debe ser un entero mayor que 0.' });
    }
    const producto = await get('SELECT * FROM productos WHERE id_producto = ? AND activo = 1', [idProducto]);
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    const precioSolicitado = Number(req.body.precio_unitario ?? req.body.precio_venta);
    const precioUnitario = Number(producto.precio_venta);

    if (Number.isFinite(precioSolicitado) && precioSolicitado !== precioUnitario) {
      return res.status(400).json({ error: 'El precio de venta debe coincidir con el precio registrado del producto.' });
    }

    if (cantidadVendida > producto.stock_disponible) {
      return res.status(400).json({ error: 'Inventario insuficiente' });
    }

    const totalVenta = cantidadVendida * precioUnitario;

    const resultado = await withTransaction(async () => {
      const factura = await run(
        'INSERT INTO facturas_venta (id_producto, cantidad_vendida, precio_unitario, total_venta, id_usuario, metodo_pago) VALUES (?, ?, ?, ?, ?, ?)',
        [idProducto, cantidadVendida, precioUnitario, totalVenta, usuarioId, metodoPago]
      );

      await run(
        'INSERT INTO movimientos_inventario (id_producto, cantidad, tipo_movimiento, id_factura, origen) VALUES (?, ?, ?, ?, ?)',
        [idProducto, cantidadVendida, 'Salida', factura.lastID, 'venta']
      );

      await run(
        'UPDATE productos SET stock_disponible = stock_disponible - ? WHERE id_producto = ?',
        [cantidadVendida, idProducto]
      );

      await run(
        'INSERT INTO caja (id, saldo_actual) VALUES (1, 0) ON CONFLICT(id) DO NOTHING'
      );
      await run('UPDATE caja SET saldo_actual = saldo_actual + ? WHERE id = 1', [totalVenta]);

      return factura.lastID;
    });

    return res.status(201).json({ mensaje: 'Venta registrada correctamente.', facturaId: resultado });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo registrar la venta.' });
  }
});

router.get('/facturas-compra', requiereAdmin, async (req, res) => {
  const busqueda = String(req.query.q || '').trim();
  let sql = `
    SELECT fc.*, p.nombre AS nombre_producto
    FROM facturas_compra fc
    LEFT JOIN productos p ON p.id_producto = fc.id_producto
    WHERE 1 = 1
  `;
  const params = [];

  if (busqueda) {
    sql += ' AND (CAST(fc.id_factura AS TEXT) LIKE ? OR p.nombre LIKE ? OR fc.proveedor LIKE ? OR fc.metodo_pago LIKE ? OR DATE(fc.fecha) LIKE ?)';
    const valor = `%${busqueda}%`;
    params.push(valor, valor, valor, valor, valor);
  }

  sql += ' ORDER BY fc.id_factura DESC';
  const facturas = await all(sql, params);
  return res.json({ facturas });
});

router.get('/facturas-venta', requiereAdmin, async (req, res) => {
  const busqueda = String(req.query.q || '').trim();
  let sql = `
    SELECT fv.*, p.nombre AS nombre_producto, u.usuario AS nombre_cliente
    FROM facturas_venta fv
    LEFT JOIN productos p ON p.id_producto = fv.id_producto
    LEFT JOIN usuarios u ON u.id_usuario = fv.id_usuario
    WHERE 1 = 1
  `;
  const params = [];

  if (busqueda) {
    sql += ' AND (CAST(fv.id_factura AS TEXT) LIKE ? OR p.nombre LIKE ? OR u.usuario LIKE ? OR fv.metodo_pago LIKE ? OR DATE(fv.fecha) LIKE ?)';
    const valor = `%${busqueda}%`;
    params.push(valor, valor, valor, valor, valor);
  }

  sql += ' ORDER BY fv.id_factura DESC';
  const facturas = await all(sql, params);
  return res.json({ facturas });
});

router.get('/caja/saldo', requiereAdmin, async (_req, res) => {
  const saldo = await get('SELECT saldo_actual FROM caja WHERE id = 1');
  return res.json({ saldo_actual: Number(saldo?.saldo_actual || 0) });
});

router.get('/movimientos', requiereAdmin, async (_req, res) => {
  const movimientos = await all('SELECT * FROM movimientos_inventario ORDER BY id_movimiento DESC');
  return res.json({ movimientos });
});

module.exports = router;
