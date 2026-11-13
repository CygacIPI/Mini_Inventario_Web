const catalogo = document.getElementById('catalogo-productos');
const buscador = document.getElementById('buscador-productos');
const mensajeBusqueda = document.getElementById('mensaje-busqueda');
const modal = document.getElementById('modal-auth');
const formLogin = document.getElementById('form-login');
const formRegistro = document.getElementById('form-registro');
const botonLogin = document.getElementById('boton-login');
const botonPanelAdmin = document.getElementById('boton-panel-admin');
const usuarioTexto = document.getElementById('usuario-texto');
const cerrarModal = document.getElementById('cerrar-modal');
const botonAbrirRegistro = document.getElementById('boton-abrir-registro');

const state = {
  usuario: null,
  productos: []
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
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Error de la solicitud');
  }

  return data;
}

async function cargarUsuario() {
  try {
    const data = await apiFetch('/api/auth/yo');
    state.usuario = data.usuario;
    usuarioTexto.textContent = data.usuario.usuario;
    botonLogin.textContent = 'Cerrar sesión';
    if (data.usuario.rol === 'admin') {
      botonPanelAdmin.classList.remove('hidden');
      botonPanelAdmin.onclick = () => {
        window.location.href = '/panel-administrativo';
      };
    } else {
      botonPanelAdmin.classList.add('hidden');
    }
  } catch (_error) {
    state.usuario = null;
    usuarioTexto.textContent = 'Invitado';
    botonLogin.textContent = 'Iniciar sesión';
    botonPanelAdmin.classList.add('hidden');
  }
}

async function cargarProductos(query = '') {
  const url = `/api/productos?q=${encodeURIComponent(query)}`;
  const data = await apiFetch(url);
  state.productos = data.productos || [];

  if (!state.productos.length) {
    mensajeBusqueda.textContent = 'Sin resultados';
    catalogo.innerHTML = '';
    return;
  }

  mensajeBusqueda.textContent = '';
  catalogo.innerHTML = '';

  state.productos.forEach((producto) => {
    const card = document.createElement('article');
    card.className = 'product-card';
    const agotado = Number(producto.stock_disponible) === 0;

    card.innerHTML = `
      <img src="${producto.imagen || '/img/logo-dazi-solar.svg'}" alt="${producto.nombre}" />
      <div class="product-card-body">
        <h3>${producto.nombre}</h3>
        <p>${producto.descripcion}</p>
        <div class="product-price">${formatearPrecio(producto.precio_venta)}</div>
        <div class="product-meta">
          <span>${producto.stock_disponible} disponibles</span>
          <span class="stock-badge ${agotado ? 'agotado' : ''}">${agotado ? 'Agotado' : 'Disponible'}</span>
        </div>
        <div class="product-actions">
          <input type="number" min="1" value="1" aria-label="Cantidad de ${producto.nombre}" data-cantidad="${producto.id_producto}" />
          <button class="btn btn-primary" data-buy="${producto.id_producto}">Comprar</button>
        </div>
      </div>
    `;

    catalogo.appendChild(card);
  });

  catalogo.querySelectorAll('[data-buy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const idProducto = Number(button.dataset.buy);
      const input = document.querySelector(`[data-cantidad="${idProducto}"]`);
      const cantidad = Number(input?.value || 1);
      await comprarProducto(idProducto, cantidad);
    });
  });
}

async function comprarProducto(idProducto, cantidad) {
  if (!state.usuario) {
    mostrarModal('login');
    return;
  }

  const producto = state.productos.find((item) => Number(item.id_producto) === Number(idProducto));
  if (!producto) {
    alert('Producto no disponible.');
    return;
  }

  try {
    const respuesta = await apiFetch('/api/ventas', {
      method: 'POST',
      body: JSON.stringify({
        id_producto: Number(idProducto),
        cantidad,
        precio_unitario: Number(producto.precio_venta)
      })
    });
    alert(`Compra realizada correctamente. Factura: ${respuesta.facturaId}`);
    await cargarProductos(buscador.value);
  } catch (error) {
    alert(error.message || 'No se pudo completar la compra.');
  }
}

formLogin.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(formLogin);
  const payload = Object.fromEntries(formData.entries());

  try {
    const respuesta = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    await cargarUsuario();
    ocultarModal();
    formLogin.reset();
    alert(`Bienvenido, ${respuesta.usuario.usuario}`);
  } catch (error) {
    alert(error.message || 'No se pudo iniciar sesión.');
  }
});

formRegistro.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(formRegistro);
  const payload = Object.fromEntries(formData.entries());

  try {
    const respuesta = await apiFetch('/api/auth/registro', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    await cargarUsuario();
    ocultarModal();
    formRegistro.reset();
    alert(`Cuenta creada correctamente. Bienvenido, ${respuesta.usuario.usuario}`);
  } catch (error) {
    alert(error.message || 'No se pudo registrar la cuenta.');
  }
});

botonLogin.addEventListener('click', async () => {
  if (state.usuario) {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      state.usuario = null;
      usuarioTexto.textContent = 'Invitado';
      botonLogin.textContent = 'Iniciar sesión';
      botonPanelAdmin.classList.add('hidden');
      return;
    } catch (_error) {
      alert('No se pudo cerrar la sesión.');
      return;
    }
  }

  mostrarModal('login');
});

botonAbrirRegistro.addEventListener('click', () => mostrarModal('registro'));
cerrarModal.addEventListener('click', ocultarModal);
modal.addEventListener('click', (event) => {
  if (event.target === modal) ocultarModal();
});
document.querySelectorAll('.auth-tab').forEach((button) => {
  button.addEventListener('click', () => mostrarModal(button.dataset.tab));
});

buscador.addEventListener('input', () => {
  const valor = buscador.value.trim();
  window.clearTimeout(buscador._timer);
  buscador._timer = window.setTimeout(() => {
    cargarProductos(valor);
  }, 250);
});

(async function init() {
  await cargarUsuario();
  await cargarProductos();
})();
