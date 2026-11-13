const tablaSeleccionada = document.getElementById('tabla-seleccionada');
const listaTablas = document.getElementById('lista-tablas');
const tbodyTabla = document.getElementById('tbody-tabla');
const theadTabla = document.getElementById('thead-tabla');
const buscadorTabla = document.getElementById('buscador-tabla');
const paginaIndicador = document.getElementById('pagina-indicador');
const botonAnterior = document.getElementById('btn-anterior');
const botonSiguiente = document.getElementById('btn-siguiente');
const sqlConsole = document.getElementById('sql-console');
const sqlResult = document.getElementById('sql-result');
const formUsuarioBd = document.getElementById('form-usuario-bd');
const usuariosTabla = document.getElementById('usuarios-tabla');
const cerrarSesion = document.getElementById('cerrar-sesion');

const state = {
  tablas: [],
  filas: [],
  pagina: 1,
  limit: 20,
  total: 0,
  tablaActual: 'productos'
};

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Error en la operación');
  }
  return body;
}

async function cargarTablas() {
  const data = await apiFetch('/api/bd/tablas');
  state.tablas = data.tablas || [];
  const opciones = state.tablas.map((tabla) => `<option value="${tabla.nombre}">${tabla.nombre}</option>`).join('');
  tablaSeleccionada.innerHTML = opciones;
  tablaSeleccionada.value = state.tablaActual;
  listaTablas.innerHTML = state.tablas.map((tabla) => `<li data-tabla="${tabla.nombre}">${tabla.nombre}</li>`).join('');

  listaTablas.querySelectorAll('li').forEach((li) => {
    li.addEventListener('click', () => seleccionarTabla(li.dataset.tabla));
  });

  await cargarTablaActual();
  await cargarUsuarios();
}

async function cargarTablaActual() {
  const tabla = state.tablaActual || tablaSeleccionada.value;
  state.tablaActual = tabla;
  const respuesta = await apiFetch(`/api/bd/tabla/${tabla}?page=${state.pagina}&limit=${state.limit}`);
  state.filas = respuesta.filas || [];
  state.total = Number(respuesta.total || 0);
  renderTabla();
}

function renderTabla() {
  const filas = state.filas.filter((fila) => {
    const texto = JSON.stringify(fila).toLowerCase();
    return texto.includes((buscadorTabla.value || '').toLowerCase());
  });

  const columnas = filas.length ? Object.keys(filas[0]) : [];
  theadTabla.innerHTML = `<tr>${columnas.map((columna) => `<th>${columna}</th>`).join('')}</tr>`;
  tbodyTabla.innerHTML = filas.map((fila) => `
    <tr>${columnas.map((columna) => `<td>${String(fila[columna] ?? '').replace(/</g, '&lt;')}</td>`).join('')}</tr>
  `).join('');

  paginaIndicador.textContent = `Página ${state.pagina} • ${state.total} registros`;
  botonAnterior.disabled = state.pagina <= 1;
}

async function seleccionarTabla(nombre) {
  state.tablaActual = nombre;
  state.pagina = 1;
  tablaSeleccionada.value = nombre;
  await cargarTablaActual();
}

botonAnterior.addEventListener('click', async () => {
  if (state.pagina <= 1) return;
  state.pagina -= 1;
  await cargarTablaActual();
});

botonSiguiente.addEventListener('click', async () => {
  const totalPaginas = Math.ceil(state.total / state.limit);
  if (state.pagina >= totalPaginas) return;
  state.pagina += 1;
  await cargarTablaActual();
});

tablaSeleccionada.addEventListener('change', async () => {
  state.tablaActual = tablaSeleccionada.value;
  state.pagina = 1;
  await cargarTablaActual();
});

buscadorTabla.addEventListener('input', () => renderTabla());

document.getElementById('btn-exportar-csv').addEventListener('click', () => {
  window.location.href = `/api/bd/exportar/${state.tablaActual}`;
});

document.getElementById('btn-ejecutar-sql').addEventListener('click', async () => {
  const sql = sqlConsole.value.trim();
  if (!sql) {
    sqlResult.textContent = 'Ingresa una consulta SELECT';
    return;
  }

  try {
    const data = await apiFetch('/api/bd/sql', {
      method: 'POST',
      body: JSON.stringify({ sql })
    });
    const filas = data.filas || [];
    sqlResult.textContent = JSON.stringify(filas.slice(0, 20), null, 2);
  } catch (error) {
    sqlResult.textContent = error.message;
  }
});

async function cargarUsuarios() {
  try {
    const data = await apiFetch('/api/auth/usuarios');
    const rows = data.usuarios || [];
    usuariosTabla.innerHTML = '';

    rows.forEach((usuario) => {
      const fila = document.createElement('tr');
      const celdaId = document.createElement('td');
      const celdaUsuario = document.createElement('td');
      const celdaRol = document.createElement('td');
      const celdaFecha = document.createElement('td');
      const celdaAcciones = document.createElement('td');

      celdaId.textContent = String(usuario.id_usuario);
      celdaUsuario.textContent = String(usuario.usuario);
      celdaRol.textContent = String(usuario.rol);
      celdaFecha.textContent = new Date(usuario.fecha_creacion).toLocaleString('es-DO');

      const botonRol = document.createElement('button');
      botonRol.className = 'action-btn';
      botonRol.type = 'button';
      botonRol.dataset.cambiarRol = String(usuario.id_usuario);
      botonRol.dataset.rol = usuario.rol === 'admin' ? 'cliente' : 'admin';
      botonRol.textContent = usuario.rol === 'admin' ? 'Cliente' : 'Admin';

      const botonEliminar = document.createElement('button');
      botonEliminar.className = 'action-btn delete';
      botonEliminar.type = 'button';
      botonEliminar.dataset.eliminarUsuario = String(usuario.id_usuario);
      botonEliminar.textContent = 'Eliminar';

      celdaAcciones.appendChild(botonRol);
      celdaAcciones.appendChild(botonEliminar);
      fila.append(celdaId, celdaUsuario, celdaRol, celdaFecha, celdaAcciones);
      usuariosTabla.appendChild(fila);

      botonRol.addEventListener('click', async () => {
        const id = Number(botonRol.dataset.cambiarRol);
        const rol = botonRol.dataset.rol;
        try {
          await apiFetch(`/api/auth/usuarios/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ rol })
          });
          await cargarUsuarios();
        } catch (error) {
          alert(error.message);
        }
      });

      botonEliminar.addEventListener('click', async () => {
        const id = Number(botonEliminar.dataset.eliminarUsuario);
        try {
          await apiFetch(`/api/auth/usuarios/${id}`, { method: 'DELETE' });
          await cargarUsuarios();
        } catch (error) {
          alert(error.message);
        }
      });
    });
      });
    });
  } catch (_error) {
    usuariosTabla.innerHTML = '<tr><td colspan="5">No autorizado</td></tr>';
  }
}

formUsuarioBd.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(formUsuarioBd);
  const payload = Object.fromEntries(formData.entries());

  try {
    await apiFetch('/api/auth/usuarios', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    formUsuarioBd.reset();
    await cargarUsuarios();
    alert('Usuario creado correctamente.');
  } catch (error) {
    alert(error.message || 'No se pudo crear el usuario.');
  }
});

cerrarSesion.addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  } catch (_error) {
    alert('No se pudo cerrar la sesión.');
  }
});

(async function init() {
  await cargarTablas();
})();
