const catalogo = document.getElementById('catalogo-productos');
const buscador = document.getElementById('buscador-productos');
const mensajeBusqueda = document.getElementById('mensaje-busqueda');
const modal = document.getElementById('modal-auth');
const formLogin = document.getElementById('form-login');
const formRegistro = document.getElementById('form-registro');
const botonLogin = document.getElementById('boton-login');
const botonPanelAdmin = document.getElementById('boton-panel-admin');
const usuarioTexto = document.getElementById('usuario-texto');
const modalCheckout = document.getElementById('modal-checkout');
const formCheckout = document.getElementById('form-checkout');
const checkoutSubmit = formCheckout.querySelector('[type="submit"]');

const state = {
  usuario: null,
  productos: [],
  checkout: null,
  busquedaId: 0
};

function mostrarModal(tab = 'login') {
  modal.classList.remove('hidden');
  document.querySelectorAll('.auth-tab').forEach((tabButton) => {
    tabButton.classList.toggle('active', tabButton.dataset.tab === tab);
  });
  formLogin.classList.toggle('hidden', tab !== 'login');
  formRegistro.classList.toggle('hidden', tab !== 'registro');
}

function ocultarModal() {
  modal.classList.add('hidden');
}

function formatearPrecio(precio) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(precio);
}

async function apiFetch(url, options = {}) {
  const { headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, {
    headers: { Accept: 'application/json', ...headers },
    ...fetchOptions
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data;
}

async function cargarUsuario() {
  try {
    const data = await apiFetch('/api/auth/yo');
    state.usuario = data.usuario;
    usuarioTexto.textContent = data.usuario.usuario;
    botonLogin.textContent = 'Cerrar sesión';
    botonPanelAdmin.classList.toggle('hidden', data.usuario.rol !== 'admin');
  } catch (error) {
    if (error.message !== 'No autenticado') {
      window.appUI.notify(error.message, 'error');
    }
    state.usuario = null;
    usuarioTexto.textContent = 'Invitado';
    botonLogin.textContent = 'Iniciar sesión';
    botonPanelAdmin.classList.add('hidden');
  }
}

function crearElemento(tag, className, texto) {
  const elemento = document.createElement(tag);
  if (className) elemento.className = className;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

function crearTarjetaProducto(producto) {
  const card = crearElemento('article', 'product-card');
  const agotado = Number(producto.stock_disponible) <= 0;
  const imagen = crearElemento('img');
  const rutaImagen = String(producto.imagen || '');
  imagen.src = rutaImagen.startsWith('/img/') ? rutaImagen : '/img/logo-dazi-solar.svg';
  imagen.alt = String(producto.nombre || 'Producto Dazi Solar');
  imagen.loading = 'lazy';

  const body = crearElemento('div', 'product-card-body');
  const titulo = crearElemento('h3', '', producto.nombre);
  const descripcion = crearElemento('p', '', producto.descripcion || '');
  const precio = crearElemento('div', 'product-price', formatearPrecio(Number(producto.precio_venta)));
  const meta = crearElemento('div', 'product-meta');
  meta.append(
    crearElemento('span', '', `${producto.stock_disponible} disponibles`),
    crearElemento('span', `stock-badge${agotado ? ' agotado' : ''}`, agotado ? 'Agotado' : 'Disponible')
  );

  const actions = crearElemento('div', 'product-actions');
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = String(producto.stock_disponible);
  input.value = '1';
  input.disabled = agotado;
  input.setAttribute('aria-label', `Cantidad de ${producto.nombre}`);

  const buy = crearElemento('button', 'btn btn-primary', agotado ? 'Agotado' : 'Comprar');
  buy.type = 'button';
  buy.disabled = agotado;
  buy.addEventListener('click', () => comprarProducto(Number(producto.id_producto), Number(input.value)));
  actions.append(input, buy);
  body.append(titulo, descripcion, precio, meta, actions);
  card.append(imagen, body);
  return card;
}

async function cargarProductos(query = '') {
  const solicitud = ++state.busquedaId;
  catalogo.setAttribute('aria-busy', 'true');
  try {
    const data = await apiFetch(`/api/productos?q=${encodeURIComponent(query)}`);
    if (solicitud !== state.busquedaId) return;
    state.productos = data.productos || [];
    catalogo.replaceChildren(...state.productos.map(crearTarjetaProducto));
    mensajeBusqueda.textContent = state.productos.length ? '' : 'No encontramos productos con esa búsqueda.';
  } catch (error) {
    if (solicitud === state.busquedaId) {
      catalogo.replaceChildren();
      mensajeBusqueda.textContent = error.message;
      window.appUI.notify(error.message, 'error');
    }
  } finally {
    if (solicitud === state.busquedaId) catalogo.setAttribute('aria-busy', 'false');
  }
}

function cerrarCheckout() {
  modalCheckout.classList.add('hidden');
  state.checkout = null;
}

async function comprarProducto(idProducto, cantidad) {
  if (!state.usuario) {
    window.appUI.notify('Inicia sesión o crea una cuenta para continuar con la compra.', 'info');
    mostrarModal('login');
    return;
  }

  const producto = state.productos.find((item) => Number(item.id_producto) === idProducto);
  if (!producto || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > Number(producto.stock_disponible)) {
    window.appUI.notify('Selecciona una cantidad disponible para este producto.', 'error');
    return;
  }

  state.checkout = { idProducto, cantidad };
  document.getElementById('checkout-producto').textContent = producto.nombre;
  document.getElementById('checkout-cantidad').textContent = `${cantidad} × ${formatearPrecio(producto.precio_venta)}`;
  document.getElementById('checkout-total').textContent = formatearPrecio(cantidad * Number(producto.precio_venta));
  formCheckout.elements.nombre_cliente.value = state.usuario.usuario;
  modalCheckout.classList.remove('hidden');
  formCheckout.elements.nombre_cliente.focus();
}

formCheckout.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.checkout) return;

  const datos = Object.fromEntries(new FormData(formCheckout).entries());
  const submitText = checkoutSubmit.textContent;
  checkoutSubmit.disabled = true;
  checkoutSubmit.textContent = 'Procesando…';

  try {
    const respuesta = await apiFetch('/api/ventas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...state.checkout, ...datos, cantidad: state.checkout.cantidad, id_producto: state.checkout.idProducto })
    });
    cerrarCheckout();
    formCheckout.reset();
    window.appUI.notify(`Compra confirmada. Número de factura: ${respuesta.facturaId}.`, 'success');
    window.facturasUI.mostrar(respuesta.factura, 'venta');
    await cargarProductos(buscador.value.trim());
  } catch (error) {
    window.appUI.notify(error.message, 'error');
  } finally {
    checkoutSubmit.disabled = false;
    checkoutSubmit.textContent = submitText;
  }
});

formLogin.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = formLogin.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(formLogin).entries());
    await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    await cargarUsuario();
    ocultarModal();
    formLogin.reset();
    window.appUI.notify(`Bienvenido, ${state.usuario.usuario}.`, 'success');
  } catch (error) {
    window.appUI.notify(error.message, 'error');
  } finally {
    submit.disabled = false;
  }
});

formRegistro.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = formRegistro.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(formRegistro).entries());
    await apiFetch('/api/auth/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    await cargarUsuario();
    ocultarModal();
    formRegistro.reset();
    window.appUI.notify(`Cuenta creada. Bienvenido, ${state.usuario.usuario}.`, 'success');
  } catch (error) {
    window.appUI.notify(error.message, 'error');
  } finally {
    submit.disabled = false;
  }
});

botonLogin.addEventListener('click', async () => {
  if (!state.usuario) {
    mostrarModal('login');
    return;
  }
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    state.usuario = null;
    usuarioTexto.textContent = 'Invitado';
    botonLogin.textContent = 'Iniciar sesión';
    botonPanelAdmin.classList.add('hidden');
    window.appUI.notify('Has cerrado sesión.', 'success');
  } catch (error) {
    window.appUI.notify(error.message, 'error');
  }
});

document.getElementById('boton-abrir-registro').addEventListener('click', () => mostrarModal('registro'));
botonPanelAdmin.addEventListener('click', () => {
  window.location.assign('/panel-administrativo');
});
document.getElementById('cerrar-modal').addEventListener('click', ocultarModal);
document.getElementById('cerrar-checkout').addEventListener('click', cerrarCheckout);
document.getElementById('cancelar-checkout').addEventListener('click', cerrarCheckout);

modal.addEventListener('click', (event) => {
  if (event.target === modal) ocultarModal();
});
modalCheckout.addEventListener('click', (event) => {
  if (event.target === modalCheckout) cerrarCheckout();
});
document.querySelectorAll('.auth-tab').forEach((button) => {
  button.addEventListener('click', () => mostrarModal(button.dataset.tab));
});

let temporizadorBusqueda;
buscador.addEventListener('input', () => {
  window.clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = window.setTimeout(() => cargarProductos(buscador.value.trim()), 250);
});

(async function init() {
  await Promise.all([cargarUsuario(), cargarProductos()]);
})();
