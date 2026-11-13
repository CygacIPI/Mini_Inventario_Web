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

  test('el checkout valida y guarda los datos del comprador y el método de pago', async () => {
    const comprador = request.agent(app);
    const usuario = `buyer${Date.now()}`;
    await comprador.post('/api/auth/registro').send({ usuario, contrasena: 'Compra123' }).expect(201);

    const producto = await comprador.get('/api/productos/1');
    const sinDatos = await comprador.post('/api/ventas').send({
      id_producto: 1,
      cantidad: 1,
      precio_unitario: producto.body.producto.precio_venta,
      metodo_pago: 'tarjeta'
    });
    expect(sinDatos.statusCode).toBe(400);

    const email = `${usuario}@example.com`;
    const venta = await comprador.post('/api/ventas').send({
      id_producto: 1,
      cantidad: 1,
      precio_unitario: producto.body.producto.precio_venta,
      metodo_pago: 'tarjeta',
      nombre_cliente: 'Comprador de Prueba',
      email_cliente: email,
      telefono_cliente: '8095550101',
      direccion_cliente: 'Santo Domingo, República Dominicana'
    });
    expect(venta.statusCode).toBe(201);
    expect(venta.body.factura).toMatchObject({
      id_factura: venta.body.facturaId,
      nombre_producto: producto.body.producto.nombre,
      cantidad_vendida: 1,
      nombre_cliente: 'Comprador de Prueba',
      email_cliente: email,
      metodo_pago: 'tarjeta'
    });

    const administrador = request.agent(app);
    await administrador.post('/api/auth/login').send({ usuario: 'Admin', contrasena: 'Admin' }).expect(200);
    const factura = await administrador.get(`/api/facturas-venta?q=${encodeURIComponent(email)}`).expect(200);
    expect(factura.body.facturas[0]).toMatchObject({
      nombre_cliente: 'Comprador de Prueba',
      email_cliente: email,
      telefono_cliente: '8095550101',
      direccion_cliente: 'Santo Domingo, República Dominicana',
      metodo_pago: 'tarjeta'
    });
  });

  test('el panel de BD permite importar, consultar, editar y exportar CSV', async () => {
    const administrador = request.agent(app);
    await administrador.post('/api/auth/login').send({ usuario: 'Admin', contrasena: 'Admin' }).expect(200);
    await administrador.get('/panel-administrativo').expect(200);
    const paginaBd = await administrador.get('/panel-base-de-datos').expect(200);
    expect(paginaBd.text).toContain('Importar CSV');
    expect(paginaBd.text).toContain('Estructura de la tabla');

    const tablas = await administrador.get('/api/bd/tablas').expect(200);
    expect(tablas.body.tablas.map((tabla) => tabla.nombre)).toContain('caja');
    expect(JSON.stringify(tablas.body)).not.toContain('contrasena_hash');

    const idProducto = 100000 + (Date.now() % 1000000);
    const csv = [
      'id_producto,nombre,descripcion,precio_compra,precio_venta,stock_disponible,imagen,activo',
      `${idProducto},Producto CSV,Registro importado,100,150,4,,1`
    ].join('\r\n');

    const importacion = await administrador
      .post('/api/bd/importar/productos')
      .attach('archivo', Buffer.from(csv), 'productos.csv')
      .expect(201);
    expect(importacion.body.total).toBe(1);

    const consulta = await administrador
      .get('/api/bd/tabla/productos?q=Producto%20CSV')
      .expect(200);
    expect(consulta.body.filas[0].id_producto).toBe(idProducto);

    const saldoInicial = (await administrador.get('/api/caja/saldo').expect(200)).body.saldo_actual;
    await administrador
      .post('/api/bd/tabla/facturas_compra')
      .send({
        id_producto: idProducto,
        cantidad_comprada: 2,
        precio_unitario: 100,
        total_compra: 200,
        proveedor: 'Proveedor de prueba',
        metodo_pago: 'efectivo'
      })
      .expect(201);
    const inventarioConCompra = await administrador.get(`/api/productos/${idProducto}`).expect(200);
    expect(inventarioConCompra.body.producto.stock_disponible).toBe(6);
    expect((await administrador.get('/api/caja/saldo').expect(200)).body.saldo_actual).toBe(saldoInicial - 200);

    const facturas = await administrador.get('/api/facturas-compra?q=Proveedor%20de%20prueba').expect(200);
    const facturaCompra = facturas.body.facturas[0];
    await administrador.delete(`/api/bd/tabla/facturas_compra/${facturaCompra.id_factura}`).expect(200);
    const inventarioRevertido = await administrador.get(`/api/productos/${idProducto}`).expect(200);
    expect(inventarioRevertido.body.producto.stock_disponible).toBe(4);
    expect((await administrador.get('/api/caja/saldo').expect(200)).body.saldo_actual).toBe(saldoInicial);

    await administrador
      .put(`/api/bd/tabla/productos/${idProducto}`)
      .send({ nombre: 'Producto CSV actualizado' })
      .expect(200);

    const exportacion = await administrador.get('/api/bd/exportar/productos').expect(200);
    expect(exportacion.text).toContain('Producto CSV actualizado');
    await administrador.delete(`/api/bd/tabla/productos/${idProducto}`).expect(200);

    const consultaPrivada = await administrador.post('/api/bd/sql').send({ sql: 'SELECT * FROM usuarios' });
    expect(consultaPrivada.statusCode).toBe(403);
  });
});
