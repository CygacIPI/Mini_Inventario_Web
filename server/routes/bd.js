const express = require('express');
const { all, get, run, db } = require('../db');
const { requiereAdmin, requierePasoPorPanelAdmin } = require('../middleware/auth');
const { esConsultaSelectSegura } = require('../utils');

const router = express.Router();

const TABLAS_PERMITIDAS = new Set([
  'usuarios',
  'productos',
  'facturas_compra',
  'facturas_venta',
  'movimientos_inventario'
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

router.use(requiereAdmin);
router.use(requierePasoPorPanelAdmin);

router.get('/tablas', async (_req, res) => {
  try {
    const tablas = [];
    for (const nombre of [...TABLAS_PERMITIDAS]) {
      const esquema = await obtenerEsquemaTabla(nombre);
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
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;
    const total = await get(`SELECT COUNT(*) AS total FROM ${tabla}`);
    const filas = await all(`SELECT * FROM ${tabla} ORDER BY 1 LIMIT ? OFFSET ?`, [limit, offset]);
    return res.json({ tabla, filas, total: Number(total?.total || 0), page, limit });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo leer la tabla.' });
  }
});

router.post('/tabla/:tabla', async (req, res) => {
  try {
    const tabla = validarNombreTabla(req.params.tabla);
    const columnas = await obtenerEsquemaTabla(tabla);
    const campos = Object.keys(req.body || {});
    const columnasValidas = columnas.map((col) => col.name);
    const reales = campos.filter((campo) => columnasValidas.includes(campo));
    if (!reales.length) {
      return res.status(400).json({ error: 'No se recibieron columnas válidas para insertar.' });
    }

    const placeholders = reales.map(() => '?').join(', ');
    const valores = reales.map((campo) => req.body[campo]);
    const sql = `INSERT INTO ${tabla} (${reales.join(', ')}) VALUES (${placeholders})`;
    const resultado = await run(sql, valores);
    return res.status(201).json({ mensaje: 'Registro insertado.', id: resultado.lastID });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo crear el registro.' });
  }
});

router.put('/tabla/:tabla/:id', async (req, res) => {
  try {
    const tabla = validarNombreTabla(req.params.tabla);
    const pk = await obtenerClavePrimaria(tabla);
    if (!pk) {
      return res.status(400).json({ error: 'La tabla no tiene clave primaria.' });
    }

    const columnas = await obtenerEsquemaTabla(tabla);
    const campos = Object.keys(req.body || {}).filter((campo) => camposPermitidos(columnas, campo));
    if (!campos.length) {
      return res.status(400).json({ error: 'No se recibieron campos válidos para actualizar.' });
    }

    const sql = `UPDATE ${tabla} SET ${campos.map((campo) => `${campo} = ?`).join(', ')} WHERE ${pk} = ?`;
    const valores = [...campos.map((campo) => req.body[campo]), req.params.id];
    await run(sql, valores);
    return res.json({ mensaje: 'Registro actualizado.' });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo actualizar el registro.' });
  }
});

function camposPermitidos(columnas, campo) {
  return columnas.some((columna) => columna.name === campo && !columna.pk);
}

router.delete('/tabla/:tabla/:id', async (req, res) => {
  try {
    const tabla = validarNombreTabla(req.params.tabla);
    const pk = await obtenerClavePrimaria(tabla);
    if (!pk) {
      return res.status(400).json({ error: 'La tabla no tiene clave primaria.' });
    }

    if (tabla === 'productos') {
      await run(`UPDATE ${tabla} SET activo = 0 WHERE ${pk} = ?`, [req.params.id]);
      return res.json({ mensaje: 'Registro marcado como inactivo.' });
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
    const filas = await all(`SELECT * FROM ${tabla}`);
    if (!filas.length) {
      return res.status(404).json({ error: 'No hay filas para exportar.' });
    }

    const columnas = Object.keys(filas[0]);
    const csv = [columnas.join(',')].concat(filas.map((fila) => columnas.map((columna) => `"${String(fila[columna] ?? '').replace(/"/g, '""')}"`).join(','))).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${tabla}.csv"`);
    return res.send(csv);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo exportar la tabla.' });
  }
});

module.exports = router;
