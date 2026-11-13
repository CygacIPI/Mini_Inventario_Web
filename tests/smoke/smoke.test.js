const path = require('path');
const os = require('os');

process.env.DB_PATH = path.join(os.tmpdir(), `mini-inventario-smoke-${Date.now()}.db`);

const request = require('supertest');
const app = require('../../server/server');

describe('smoke test', () => {
  test('la app responde y el login del Admin funciona', async () => {
    const agent = request.agent(app);

    const salud = await agent.get('/api/salud');
    expect(salud.statusCode).toBe(200);
    expect(salud.body.estado).toBe('ok');

    const root = await agent.get('/');
    expect(root.statusCode).toBe(200);

    const login = await agent.post('/api/auth/login').send({ usuario: 'Admin', contrasena: 'Admin' });
    expect(login.statusCode).toBe(200);
    expect(login.body.usuario.rol).toBe('admin');

    const productos = await agent.get('/api/productos');
    expect(productos.statusCode).toBe(200);
    expect(productos.body.productos.length).toBeGreaterThan(0);
  });
});
