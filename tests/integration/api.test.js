const path = require('path');
const os = require('os');

process.env.DB_PATH = path.join(os.tmpdir(), `mini-inventario-${Date.now()}.db`);

const request = require('supertest');
const app = require('../../server/server');

describe('API de inventario', () => {
  test('login del administrador funciona y el catálogo responde', async () => {
    const agent = request.agent(app);

    const login = await agent.post('/api/auth/login').send({ usuario: 'Admin', contrasena: 'Admin' });
    expect(login.statusCode).toBe(200);
    expect(login.body.usuario.rol).toBe('admin');

    const productos = await agent.get('/api/productos');
    expect(productos.statusCode).toBe(200);
    expect(productos.body.productos.length).toBeGreaterThan(0);
  });

  test('compra y venta actualizan el stock con transacción', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ usuario: 'Admin', contrasena: 'Admin' });

    const antes = await agent.get('/api/productos/1');
    const stockInicial = Number(antes.body.producto.stock_disponible);

    const compra = await agent.post('/api/compras').send({ id_producto: 1, cantidad_comprada: 5, precio_unitario: 5000 });
    expect(compra.statusCode).toBe(201);

    const venta = await agent.post('/api/ventas').send({ id_producto: 1, cantidad: 3, precio_unitario: 9800 });
    expect(venta.statusCode).toBe(201);

    const despues = await agent.get('/api/productos/1');
    expect(Number(despues.body.producto.stock_disponible)).toBe(stockInicial + 5 - 3);
  });

  test('la venta por encima del stock devuelve el error exacto', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ usuario: 'Admin', contrasena: 'Admin' });

    const venta = await agent.post('/api/ventas').send({ id_producto: 1, cantidad: 99999, precio_unitario: 9800 });
    expect(venta.statusCode).toBe(400);
    expect(venta.body.error).toBe('Inventario insuficiente');
  });
});
