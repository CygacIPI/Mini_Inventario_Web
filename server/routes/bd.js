const express = require('express');
const multer = require('multer');
const { all, get, run, withTransaction } = require('../db');
const { requiereAdmin, requierePasoPorPanelAdmin } = require('../middleware/auth');
const { esConsultaSelectSegura } = require('../utils');

const router = express.Router();
const importarCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

const TABLAS_PERMITIDAS = new Set([
  'usuarios',
  'productos',
  'facturas_compra',
  'facturas_venta',
  'movimientos_inventario',
  'caja'
]);

function validarNombreTabla(nombre) {
  if (!TABLAS_PERMITIDAS.has(nombre)) {
    throw new Error('Tabla no permitida.');
  }
  return nombre;
}

async function obtenerEsquemaTabla(tabla) {
  const columnas = await all(`PRAGMA table_info(${tabla})`);
  return columnas.map((columna) => ({
    name: columna.name,
    type: columna.type,
    pk: Boolean(columna.pk),
    notnull: Boolean(columna.notnull),
    default: columna.dflt_value
  }));
}

async function obtenerClavePrimaria(tabla) {
  const columnas = await obtenerEsquemaTabla(tabla);
  const pk = columnas.find((columna) => columna.pk);
  return pk ? pk.name : null;
}

function validarDatos(tabla, datos, permitirClavePrimaria = false) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new Error('Los datos del registro no son válidos.');
  }

  return obtenerEsquemaTabla(tabla).then((columnas) => {
    const disponibles = columnas.filter((columna) =>
      columna.name !== 'contrasena_hash' &&
      (permitirClavePrimaria || !columna.pk)
    );
    const nombresDisponibles = new Set(disponibles.map((columna) => columna.name));
    const campos = Object.keys(datos);
    const desconocidos = campos.filter((campo) => !nombresDisponibles.has(campo));

    if (desconocidos.length) {
      throw new Error(`Campo no permitido: ${desconocidos.join(', ')}`);
    }

    const resultado = {};
    for (const campo of campos) {
      const valor = datos[campo];
      if (valor !== null && !['string', 'number', 'boolean'].includes(typeof valor)) {
        throw new Error(`El valor de ${campo} no es válido.`);
      }

      const columna = disponibles.find((item) => item.name === campo);
      if (valor === null || valor === '') {
        if (columna.notnull && columna.default === null) {
          throw new Error(`${campo} es obligatorio.`);
        }
        resultado[campo] = valor === '' && columna.type.toUpperCase().includes('TEXT') ? '' : null;
        continue;
      }

      if (/INT|REAL|NUM|DEC|FLOAT|DOUBLE/i.test(columna.type)) {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) {
          throw new Error(`${campo} debe ser numérico.`);
        }
        if (/INT/i.test(columna.type) && !Number.isInteger(numero)) {
          throw new Error(`${campo} debe ser un número entero.`);
        }
        resultado[campo] = numero;
      } else {
        resultado[campo] = String(valor);
      }
    }
    return { columnas: disponibles, valores: resultado };
  });
}

function parsearCsv(contenido) {
  const texto = contenido.replace(/^\uFEFF/, '');
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;

  for (let indice = 0; indice < texto.length; indice += 1) {
    const caracter = texto[indice];
    if (caracter === '"') {
      if (entreComillas && texto[indice + 1] === '"') {
        campo += '"';
        indice += 1;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (caracter === ',' && !entreComillas) {
      fila.push(campo);
      campo = '';
    } else if ((caracter === '\n' || caracter === '\r') && !entreComillas) {
      if (caracter === '\r' && texto[indice + 1] === '\n') indice += 1;
      fila.push(campo);
      if (fila.some((valor) => valor !== '')) filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += caracter;
    }
  }

  if (entreComillas) throw new Error('El archivo CSV contiene comillas sin cerrar.');
  fila.push(campo);
  if (fila.some((valor) => valor !== '')) filas.push(fila);
  return filas;
}

async function insertarRegistro(tabla, valores) {
  if (tabla === 'movimientos_inventario') {
    throw new Error('Los movimientos se generan desde las facturas para preservar el historial.');
  }

  if (tabla === 'facturas_compra' || tabla === 'facturas_venta') {
    const compra = tabla === 'facturas_compra';
    const idProducto = Number(valores.id_producto);
    const cantidad = Number(compra ? valores.cantidad_comprada : valores.cantidad_vendida);
    const precio = Number(valores.precio_unitario);
    const total = Number(compra ? valores.total_compra : valores.total_venta);
    const tipo = compra ? 'Entrada' : 'Salida';
    const origen = compra ? 'compra' : 'venta';

    if (!Number.isInteger(idProducto) || idProducto <= 0 ||
        !Number.isInteger(cantidad) || cantidad <= 0 ||
        !Number.isFinite(precio) || precio < 0 ||
        !Number.isFinite(total) || Math.abs(total - cantidad * precio) > 0.01) {
      throw new Error('La factura requiere producto, cantidad y precios válidos; el total debe coincidir con cantidad × precio.');
    }
    if (valores.tipo_movimiento && valores.tipo_movimiento !== tipo) {
      throw new Error(`El tipo de movimiento debe ser ${tipo}.`);
    }

    const producto = await get('SELECT id_producto, stock_disponible FROM productos WHERE id_producto = ?', [idProducto]);
    if (!producto) throw new Error('El producto indicado no existe.');

    if (!compra && Number(producto.stock_disponible) < cantidad) {
      throw new Error('Inventario insuficiente.');
    }

    const campos = Object.keys(valores);
    const sql = `INSERT INTO ${tabla} (${campos.join(', ')}) VALUES (${campos.map(() => '?').join(', ')})`;
    const factura = await run(sql, campos.map((campo) => valores[campo]));
    await run(
      'INSERT INTO movimientos_inventario (id_producto, cantidad, tipo_movimiento, id_factura, origen) VALUES (?, ?, ?, ?, ?)',
      [idProducto, cantidad, tipo, factura.lastID, origen]
    );

    if (compra) {
      await run(
        'UPDATE productos SET stock_disponible = stock_disponible + ?, precio_compra = ? WHERE id_producto = ?',
        [cantidad, precio, idProducto]
      );
      await run('UPDATE caja SET saldo_actual = saldo_actual - ? WHERE id = 1', [total]);
    } else {
      const ajuste = await run(
        'UPDATE productos SET stock_disponible = stock_disponible - ? WHERE id_producto = ? AND stock_disponible >= ?',
        [cantidad, idProducto, cantidad]
      );
      if (!ajuste.changes) throw new Error('Inventario insuficiente.');
      await run('UPDATE caja SET saldo_actual = saldo_actual + ? WHERE id = 1', [total]);
    }
    return factura.lastID;
  }

  const campos = Object.keys(valores);
  if (!campos.length) throw new Error('No se recibieron columnas válidas para insertar.');
  const sql = `INSERT INTO ${tabla} (${campos.join(', ')}) VALUES (${campos.map(() => '?').join(', ')})`;
  const resultado = await run(sql, campos.map((campo) => valores[campo]));
  return resultado.lastID;
}

router.use(requiereAdmin);
router.use(requierePasoPorPanelAdmin);

router.get('/tablas', async (_req, res) => {
  try {
    const tablas = [];
    for (const nombre of [...TABLAS_PERMITIDAS]) {
      const esquemaCompleto = await obtenerEsquemaTabla(nombre);
      const esquema = esquemaCompleto.filter((columna) => columna.name !== 'contrasena_hash');
      const total = await get(`SELECT COUNT(*) AS total FROM ${nombre}`);
      tablas.push({ nombre, esquema, total: Number(total?.total || 0) });
    }
    return res.json({ tablas });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Error al consultar las tablas.' });
  }
});

router.get('/tabla/:tabla', async (req, res) => {
  try {
    const tabla = validarNombreTabla(req.params.tabla);
    const paginaSolicitada = Number(req.query.page || 1);
    const limiteSolicitado = Number(req.query.limit || 20);
    const page = Number.isInteger(paginaSolicitada) ? Math.max(1, paginaSolicitada) : 1;
    const limit = Number.isInteger(limiteSolicitado) ? Math.min(100, Math.max(1, limiteSolicitado)) : 20;
    const offset = (page - 1) * limit;
    const busqueda = String(req.query.q || '').trim().slice(0, 100);
    const columnas = await obtenerEsquemaTabla(tabla);
    const visibles = columnas.filter((columna) => columna.name !== 'contrasena_hash');
    let filtro = '';
    let parametros = [];
    if (busqueda) {
      filtro = ` WHERE (${visibles.map((columna) => `CAST(${columna.name} AS TEXT) LIKE ?`).join(' OR ')})`;
      parametros = visibles.map(() => `%${busqueda}%`);
    }
    const total = await get(`SELECT COUNT(*) AS total FROM ${tabla}${filtro}`, parametros);
    const seleccion = tabla === 'usuarios'
      ? 'id_usuario, usuario, rol, fecha_creacion'
      : '*';
    const filas = await all(
      `SELECT ${seleccion} FROM ${tabla}${filtro} ORDER BY 1 LIMIT ? OFFSET ?`,
      [...parametros, limit, offset]
    );
    return res.json({ tabla, filas, total: Number(total?.total || 0), page, limit });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo leer la tabla.' });
  }
});

router.post('/tabla/:tabla', async (req, res) => {
  try {
    const tabla = validarNombreTabla(req.params.tabla);
    if (tabla === 'usuarios') {
      return res.status(400).json({ error: 'Usa Gestión de usuarios para crear cuentas de forma segura.' });
    }
    if (tabla === 'movimientos_inventario') {
      return res.status(400).json({ error: 'Los movimientos se generan desde las compras y ventas para mantener la trazabilidad.' });
    }
    const { valores } = await validarDatos(tabla, req.body);
    const id = await withTransaction(() => insertarRegistro(tabla, valores));
    return res.status(201).json({ mensaje: 'Registro insertado.', id });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo crear el registro.' });
  }
});

router.put('/tabla/:tabla/:id', async (req, res) => {
  try {
    const tabla = validarNombreTabla(req.params.tabla);
    if (tabla === 'usuarios') {
      return res.status(400).json({ error: 'Usa Gestión de usuarios para modificar cuentas.' });
    }
    if (tabla === 'movimientos_inventario') {
      return res.status(400).json({ error: 'Los movimientos se generan desde las compras y ventas y no se editan manualmente.' });
    }
    const pk = await obtenerClavePrimaria(tabla);
    if (!pk) {
      return res.status(400).json({ error: 'La tabla no tiene clave primaria.' });
    }

    const { valores } = await validarDatos(tabla, req.body);
    const campos = Object.keys(valores);
    if (!campos.length) {
      return res.status(400).json({ error: 'No se recibieron campos válidos para actualizar.' });
    }
    const camposFinancieros = tabla === 'facturas_compra'
      ? ['id_producto', 'cantidad_comprada', 'precio_unitario', 'total_compra', 'tipo_movimiento']
      : tabla === 'facturas_venta'
        ? ['id_producto', 'cantidad_vendida', 'precio_unitario', 'total_venta', 'tipo_movimiento', 'id_usuario']
        : [];
    if (campos.some((campo) => camposFinancieros.includes(campo))) {
      return res.status(400).json({
        error: 'Los datos que afectan inventario y caja no se editan directamente. Registra una compra o venta para conservar los saldos.'
      });
    }

    const sql = `UPDATE ${tabla} SET ${campos.map((campo) => `${campo} = ?`).join(', ')} WHERE ${pk} = ?`;
    const parametros = [...campos.map((campo) => valores[campo]), req.params.id];
    await run(sql, parametros);
    return res.json({ mensaje: 'Registro actualizado.' });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo actualizar el registro.' });
  }
});

router.delete('/tabla/:tabla/:id', async (req, res) => {
  try {
    const tabla = validarNombreTabla(req.params.tabla);
    if (tabla === 'usuarios') {
      return res.status(400).json({ error: 'Usa Gestión de usuarios para eliminar cuentas.' });
    }
    if (tabla === 'movimientos_inventario') {
      return res.status(400).json({ error: 'Los movimientos se conservan como historial de compras y ventas.' });
    }
    if (tabla === 'caja') {
      return res.status(400).json({ error: 'El registro de caja es único y no se puede eliminar.' });
    }
    const pk = await obtenerClavePrimaria(tabla);
    if (!pk) {
      return res.status(400).json({ error: 'La tabla no tiene clave primaria.' });
    }

    if (tabla === 'productos') {
      await run(`UPDATE ${tabla} SET activo = 0 WHERE ${pk} = ?`, [req.params.id]);
      return res.json({ mensaje: 'Registro marcado como inactivo.' });
    }

    if (tabla === 'facturas_compra' || tabla === 'facturas_venta') {
      const esCompra = tabla === 'facturas_compra';
      const factura = await get(`SELECT * FROM ${tabla} WHERE ${pk} = ?`, [req.params.id]);
      if (!factura) return res.status(404).json({ error: 'Factura no encontrada.' });

      await withTransaction(async () => {
        if (esCompra) {
          const ajusteStock = await run(
            `UPDATE productos SET stock_disponible = stock_disponible - ? WHERE id_producto = ? AND stock_disponible >= ?`,
            [factura.cantidad_comprada, factura.id_producto, factura.cantidad_comprada]
          );
          if (!ajusteStock.changes) {
            throw new Error('No se puede eliminar la compra: el stock actual ya no contiene toda esa cantidad.');
          }
          await run('UPDATE caja SET saldo_actual = saldo_actual + ? WHERE id = 1', [factura.total_compra]);
        } else {
          await run(
            'UPDATE productos SET stock_disponible = stock_disponible + ? WHERE id_producto = ?',
            [factura.cantidad_vendida, factura.id_producto]
          );
          await run('UPDATE caja SET saldo_actual = saldo_actual - ? WHERE id = 1', [factura.total_venta]);
        }

        await run(
          'DELETE FROM movimientos_inventario WHERE id_factura = ? AND origen = ?',
          [factura.id_factura, esCompra ? 'compra' : 'venta']
        );
        await run(`DELETE FROM ${tabla} WHERE ${pk} = ?`, [req.params.id]);
      });
      return res.json({ mensaje: 'Factura eliminada y sus efectos de inventario y caja fueron revertidos.' });
    }

    await run(`DELETE FROM ${tabla} WHERE ${pk} = ?`, [req.params.id]);
    return res.json({ mensaje: 'Registro eliminado.' });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo eliminar el registro.' });
  }
});

router.post('/sql', async (req, res) => {
  try {
    const sql = String(req.body.sql || '').trim();
    if (!sql) {
      return res.status(400).json({ error: 'Debes indicar una consulta SQL.' });
    }
    if (!esConsultaSelectSegura(sql)) {
      return res.status(400).json({ error: 'La consulta no es segura. Usa SELECT solamente.' });
    }
    if (/\bcontrasena_hash\b/i.test(sql) || /\b(FROM|JOIN)\s+usuarios\b/i.test(sql)) {
      return res.status(403).json({ error: 'Los datos de autenticación no se pueden consultar desde la consola SQL.' });
    }

    const consulta = /\bLIMIT\b/i.test(sql) ? sql : `${sql} LIMIT 100`;
    const rows = await all(consulta);
    return res.json({ filas: rows });
  } catch (error) {
    return res.status(400).json({ error: `Consulta SQL inválida: ${error.message}` });
  }
});

router.get('/exportar/:tabla', async (req, res) => {
  try {
    const tabla = validarNombreTabla(req.params.tabla);
    const columnasTabla = await obtenerEsquemaTabla(tabla);
    const columnas = columnasTabla
      .filter((columna) => columna.name !== 'contrasena_hash')
      .map((columna) => columna.name);
    const filas = await all(`SELECT ${columnas.join(', ')} FROM ${tabla}`);
    const csv = [columnas.join(',')].concat(
      filas.map((fila) => columnas.map((columna) =>
        `"${String(fila[columna] ?? '').replace(/"/g, '""')}"`
      ).join(','))
    ).join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${tabla}.csv"`);
    return res.send(csv);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo exportar la tabla.' });
  }
});

router.post('/importar/:tabla', (req, res, next) => {
  importarCsv.single('archivo')(req, res, (error) => {
    if (error) {
      return res.status(400).json({ error: error.message || 'El archivo no pudo ser recibido.' });
    }
    return next();
  });
}, async (req, res) => {
  try {
    const tabla = validarNombreTabla(req.params.tabla);
    if (tabla === 'usuarios') {
      return res.status(400).json({ error: 'No se pueden importar usuarios. Créelos desde Gestión de usuarios.' });
    }
    if (tabla === 'movimientos_inventario') {
      return res.status(400).json({ error: 'Los movimientos se generan desde las facturas y no se importan de forma independiente.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Selecciona un archivo CSV.' });
    }

    const filas = parsearCsv(req.file.buffer.toString('utf8'));
    if (filas.length < 2) {
      return res.status(400).json({ error: 'El CSV debe contener encabezados y al menos un registro.' });
    }
    if (filas.length > 2001) {
      return res.status(400).json({ error: 'El CSV supera el límite de 2,000 registros por importación.' });
    }

    const encabezados = filas[0].map((valor) => valor.trim());
    if (new Set(encabezados).size !== encabezados.length || encabezados.some((valor) => !valor)) {
      return res.status(400).json({ error: 'Los encabezados CSV deben ser únicos y no pueden estar vacíos.' });
    }
    const columnas = await obtenerEsquemaTabla(tabla);
    const nombresPermitidos = new Set(columnas.map((columna) => columna.name).filter((nombre) => nombre !== 'contrasena_hash'));
    if (encabezados.some((nombre) => !nombresPermitidos.has(nombre))) {
      return res.status(400).json({ error: 'El CSV contiene columnas que no pertenecen a la tabla.' });
    }

    const registros = filas.slice(1).map((fila, indice) => {
      if (fila.length !== encabezados.length) {
        throw new Error(`La fila ${indice + 2} tiene una cantidad incorrecta de columnas.`);
      }
      return Object.fromEntries(encabezados.map((nombre, index) => [nombre, fila[index]]));
    });

    await withTransaction(async () => {
      for (let indice = 0; indice < registros.length; indice += 1) {
        const { valores } = await validarDatos(tabla, registros[indice], true);
        const campos = Object.keys(valores);
        if (!campos.length) throw new Error(`La fila ${indice + 2} no contiene datos.`);
        try {
          await insertarRegistro(tabla, valores);
        } catch (error) {
          throw new Error(`Fila ${indice + 2}: ${error.message}`);
        }
      }
    });

    return res.status(201).json({ mensaje: `Se importaron ${registros.length} registros.`, total: registros.length });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo importar el CSV.' });
  }
});

module.exports = router;
