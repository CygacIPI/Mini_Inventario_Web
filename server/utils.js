function calcularStockTrasCompra(stockActual, cantidadComprada) {
  const cantidad = Number(cantidadComprada);
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    throw new Error('La cantidad comprada debe ser un entero positivo.');
  }
  return Number(stockActual) + cantidad;
}

function calcularStockTrasVenta(stockActual, cantidadVendida) {
  const cantidad = Number(cantidadVendida);
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    throw new Error('La cantidad vendida debe ser un entero positivo.');
  }
  return Number(stockActual) - cantidad;
}

function esUsuarioValido(usuario) {
  const valor = String(usuario || '').trim();
  return valor.length >= 4 && valor.length <= 30;
}

function esContrasenaValida(contrasena) {
  const valor = String(contrasena || '').trim();
  return valor.length >= 4 && valor.length <= 80;
}

function esCantidadValida(cantidad) {
  return Number.isInteger(Number(cantidad)) && Number(cantidad) > 0;
}

function esPrecioValido(precio) {
  return Number.isFinite(Number(precio)) && Number(precio) >= 0;
}

function esConsultaSelectSegura(sql) {
  const consulta = String(sql || '').trim();
  if (!consulta || !/^\s*SELECT\b/i.test(consulta)) return false;
  if (/;/.test(consulta) || /\b(INSERT|UPDATE|DELETE|DROP|ALTER|PRAGMA|ATTACH|BEGIN|COMMIT|ROLLBACK|CREATE|REPLACE)\b/i.test(consulta)) {
    return false;
  }
  return true;
}

module.exports = {
  calcularStockTrasCompra,
  calcularStockTrasVenta,
  esUsuarioValido,
  esContrasenaValida,
  esCantidadValida,
  esPrecioValido,
  esConsultaSelectSegura
};
