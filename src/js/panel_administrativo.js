const tablaProductos = document.getElementById('tabla-productos');
const formProducto = document.getElementById('form-producto');
const formCompra = document.getElementById('form-compra');
const formVenta = document.getElementById('form-venta');
const listadoCompras = document.getElementById('listado-compras');
const listadoVentas = document.getElementById('listado-ventas');
const listadoMovimientos = document.getElementById('listado-movimientos');
const searchProductos = document.getElementById('search-productos');
const searchFacturas = document.getElementById('search-facturas');
const saldoCaja = document.getElementById('saldo-caja');
const usuarioActual = document.getElementById('usuario-actual');
const cerrarSesion = document.getElementById('cerrar-sesion');

const state = {
  productos: [],
  compras: [],
  ventas: [],
  movimientos: []
};

function formatearPrecio(precio) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(precio);
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: { ...(options.headers || {}) },
    ...options
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Error en la operación');
  }
  return body;
}

async function cargarUsuario() {
  try {
    const respuesta = await apiFetch('/api/auth/yo');
    usuarioActual.textContent = respuesta.usuario.usuario;
  } catch (_error) {
    window.location.href = '/';
  }
}

async function cargarProductos() {
  const respuesta = await apiFetch('/api/productos');
  state.productos = respuesta.productos || [];
  renderProductos();
  renderSelectProductos();
}

function renderProductos() {
  const filtro = searchProductos.value.trim().toLowerCase();
  const productosFiltrados = state.productos.filter((producto) => producto.nombre.toLowerCase().includes(filtro));

  tablaProductos.innerHTML = productosFiltrados.map((producto) => `
    <tr>
      <td>${producto.id_producto}</td>
      <td>${producto.nombre}</td>
      <td>${producto.stock_disponible}</td>
      <td>${formatearPrecio(producto.precio_venta)}</td>
      <td>
        <button class="action-btn" data-editar="${producto.id_producto}">Editar</button>
        <button class="action-btn delete" data-eliminar="${producto.id_producto}">Eliminar</button>
      </td>
    </tr>
  `).join('');

  tablaProductos.querySelectorAll('[data-editar]').forEach((boton) => {
    boton.addEventListener('click', () => editarProducto(Number(boton.dataset.editar)));
  });

  tablaProductos.querySelectorAll('[data-eliminar]').forEach((boton) => {
    boton.addEventListener('click', () => eliminarProducto(Number(boton.dataset.eliminar)));
  });
}

function renderSelectProductos() {
  const options = state.productos.map((producto) => `<option value="${producto.id_producto}">${producto.nombre}</option>`).join('');
  formCompra.elements.id_producto.innerHTML = options;
  formVenta.elements.id_producto.innerHTML = options;
}

async function cargarFacturas() {
  const compras = await apiFetch(`/api/facturas-compra?q=${encodeURIComponent(searchFacturas.value.trim())}`);
  const ventas = await apiFetch(`/api/facturas-venta?q=${encodeURIComponent(searchFacturas.value.trim())}`);
  const movimientos = await apiFetch('/api/movimientos');
  const caja = await apiFetch('/api/caja/saldo');
  state.compras = compras.facturas || [];
  state.ventas = ventas.facturas || [];
  state.movimientos = movimientos.movimientos || [];
  saldoCaja.textContent = `Saldo: ${formatearPrecio(caja.saldo_actual)}`;
  renderFacturas();
}

function renderFacturas() {
  const termino = (searchFacturas.value || '').trim().toLowerCase();

  const comprasFiltradas = state.compras.filter((factura) => {
    if (!termino) return true;
    const producto = state.productos.find((item) => Number(item.id_producto) === Number(factura.id_producto));
    const texto = [
      String(factura.id_factura),
      producto ? producto.nombre : '',
      String(factura.proveedor || ''),
      String(factura.metodo_pago || ''),
      String(factura.fecha || '')
    ].join(' ').toLowerCase();
    return texto.includes(termino);
  });

  const ventasFiltradas = state.ventas.filter((factura) => {
    if (!termino) return true;
    const producto = state.productos.find((item) => Number(item.id_producto) === Number(factura.id_producto));
    const texto = [
      String(factura.id_factura),
      producto ? producto.nombre : '',
      String(factura.nombre_cliente || ''),
      String(factura.metodo_pago || ''),
      String(factura.fecha || '')
    ].join(' ').toLowerCase();
    return texto.includes(termino);
  });

  listadoCompras.innerHTML = comprasFiltradas.map((factura) => {
    const producto = state.productos.find((item) => Number(item.id_producto) === Number(factura.id_producto));
    return `
      <tr>
        <td>${factura.id_factura}</td>
        <td>${producto ? producto.nombre : factura.id_producto}</td>
        <td>${factura.proveedor || 'Proveedor general'}</td>
        <td>${factura.cantidad_comprada}</td>
        <td>${formatearPrecio(factura.precio_unitario)}</td>
        <td>${formatearPrecio(factura.total_compra)}</td>
        <td>${factura.metodo_pago || 'efectivo'}</td>
        <td>${new Date(factura.fecha).toLocaleString('es-DO')}</td>
      </tr>
    `;
  }).join('');

  listadoVentas.innerHTML = ventasFiltradas.map((factura) => {
    const producto = state.productos.find((item) => Number(item.id_producto) === Number(factura.id_producto));
    return `
      <tr>
        <td>${factura.id_factura}</td>
        <td>${producto ? producto.nombre : factura.id_producto}</td>
        <td>${factura.cantidad_vendida}</td>
        <td>${formatearPrecio(factura.precio_unitario)}</td>
        <td>${formatearPrecio(factura.total_venta)}</td>
        <td>${factura.nombre_cliente || factura.id_usuario}</td>
        <td>${factura.metodo_pago || 'efectivo'}</td>
        <td>${new Date(factura.fecha).toLocaleString('es-DO')}</td>
      </tr>
    `;
  }).join('');

  listadoMovimientos.innerHTML = state.movimientos.map((mov) => {
    const producto = state.productos.find((item) => Number(item.id_producto) === Number(mov.id_producto));
    return `
      <tr>
        <td>${mov.id_movimiento}</td>
        <td>${producto ? producto.nombre : mov.id_producto}</td>
        <td>${mov.cantidad}</td>
        <td>${mov.tipo_movimiento}</td>
        <td>${mov.origen}</td>
        <td>${new Date(mov.fecha).toLocaleString('es-DO')}</td>
      </tr>
    `;
  }).join('');
}

async function guardarProducto(event) {
  event.preventDefault();
  const formData = new FormData(formProducto);
  const idProducto = formData.get('id_producto');
  const url = idProducto ? `/api/productos/${idProducto}` : '/api/productos';
  const metodo = idProducto ? 'PUT' : 'POST';

  try {
    const response = await fetch(url, {
      method: metodo,
      body: formData
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || 'No se pudo guardar el producto.');
    }
    formProducto.reset();
    document.querySelector('input[name="id_producto"]').value = '';
    await cargarProductos();
    await cargarFacturas();
    alert('Producto guardado correctamente.');
  } catch (error) {
    alert(error.message || 'No se pudo guardar el producto.');
  }
}

async function editarProducto(idProducto) {
  const producto = state.productos.find((item) => Number(item.id_producto) === Number(idProducto));
  if (!producto) return;

  formProducto.elements.id_producto.value = producto.id_producto;
  formProducto.elements.nombre.value = producto.nombre;
  formProducto.elements.descripcion.value = producto.descripcion || '';
  formProducto.elements.precio_compra.value = producto.precio_compra;
  formProducto.elements.precio_venta.value = producto.precio_venta;
  formProducto.elements.stock_disponible.value = producto.stock_disponible;
}

async function eliminarProducto(idProducto) {
  if (!confirm('¿Deseas eliminar este producto lógicamente?')) return;

  try {
    await apiFetch(`/api/productos/${idProducto}`, { method: 'DELETE' });
    await cargarProductos();
    await cargarFacturas();
    alert('Producto eliminado.');
  } catch (error) {
    alert(error.message || 'No se pudo eliminar el producto.');
  }
}

async function registrarCompra(event) {
  event.preventDefault();
  const formData = new FormData(formCompra);
  const payload = Object.fromEntries(formData.entries());

  try {
    await apiFetch('/api/compras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    formCompra.reset();
    await cargarProductos();
    await cargarFacturas();
    alert('Compra registrada correctamente.');
  } catch (error) {
    alert(error.message || 'No se pudo registrar la compra.');
  }
}

async function registrarVenta(event) {
  event.preventDefault();
  const formData = new FormData(formVenta);
  const payload = Object.fromEntries(formData.entries());

  try {
    await apiFetch('/api/ventas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    formVenta.reset();
    await cargarProductos();
    await cargarFacturas();
    alert('Venta registrada correctamente.');
  } catch (error) {
    alert(error.message || 'No se pudo registrar la venta.');
  }
}

searchProductos.addEventListener('input', () => renderProductos());
searchFacturas.addEventListener('input', async () => {
  await cargarFacturas();
});
formProducto.addEventListener('submit', guardarProducto);
document.getElementById('reset-producto').addEventListener('click', () => {
  formProducto.reset();
  formProducto.elements.id_producto.value = '';
});
formCompra.addEventListener('submit', registrarCompra);
formVenta.addEventListener('submit', registrarVenta);

cerrarSesion.addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  } catch (_error) {
    alert('No se pudo cerrar la sesión.');
  }
});

(async function init() {
  await cargarUsuario();
  await cargarProductos();
  await cargarFacturas();
})();
