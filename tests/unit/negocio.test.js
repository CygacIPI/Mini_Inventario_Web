const {
  calcularStockTrasCompra,
  calcularStockTrasVenta,
  esUsuarioValido,
  esContrasenaValida,
  esConsultaSelectSegura
} = require('../../server/utils');

describe('utilidades del inventario', () => {
  test('una compra aumenta el stock', () => {
    expect(calcularStockTrasCompra(10, 5)).toBe(15);
  });

  test('una venta disminuye el stock', () => {
    expect(calcularStockTrasVenta(15, 3)).toBe(12);
  });

  test('valida usuarios y contraseñas con longitud adecuada', () => {
    expect(esUsuarioValido('Admin')).toBe(true);
    expect(esUsuarioValido('ab')).toBe(false);
    expect(esContrasenaValida('Admin')).toBe(true);
    expect(esContrasenaValida('12')).toBe(false);
  });

  test('acepta solo consultas SELECT seguras', () => {
    expect(esConsultaSelectSegura('SELECT * FROM productos LIMIT 20')).toBe(true);
    expect(esConsultaSelectSegura('DELETE FROM productos')).toBe(false);
    expect(esConsultaSelectSegura('SELECT 1; DROP TABLE usuarios')).toBe(false);
  });
});
