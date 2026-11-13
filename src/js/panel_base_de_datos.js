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
const archivoCsv = document.getElementById('archivo-csv');

const state = {
  tablas: [],
  filas: [],
  esquema: [],
  pagina: 1,
  limite: 20,
  total: 0,
  tablaActual: 'productos',
  temporizadorBusqueda: null
};

async function apiFetch(url, options = {}) {
  const { headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, {
    headers: { Accept: 'application/json', ...headers },
    ...fetchOptions
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'No se pudo completar la operación.');
  return body;
}

function crearCelda(fila, valor, tag = 'td') {
  const celda = document.createElement(tag);
  celda.textContent = valor === null || valor === undefined ? '' : String(valor);
  fila.appendChild(celda);
  return celda;
}

function obtenerTablaActual() {
  return state.tablas.find((tabla) => tabla.nombre === state.tablaActual);
}

function renderListaTablas() {
  tablaSeleccionada.replaceChildren();
  listaTablas.replaceChildren();

  state.tablas.forEach((tabla) => {
    const opcion = document.createElement('option');
    opcion.value = tabla.nombre;
    opcion.textContent = `${tabla.nombre} (${tabla.total})`;
    tablaSeleccionada.appendChild(opcion);

    const elemento = document.createElement('li');
    elemento.dataset.tabla = tabla.nombre;
    elemento.classList.toggle('active', tabla.nombre === state.tablaActual);
    elemento.tabIndex = 0;
    elemento.setAttribute('role', 'button');
    elemento.setAttribute('aria-current', tabla.nombre === state.tablaActual ? 'page' : 'false');

    const nombre = document.createElement('span');
    nombre.textContent = tabla.nombre;
    const cantidad = document.createElement('small');
    cantidad.textContent = String(tabla.total);
    elemento.append(nombre, cantidad);
    elemento.addEventListener('click', () => seleccionarTabla(tabla.nombre));
    elemento.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') seleccionarTabla(tabla.nombre);
    });
    listaTablas.appendChild(elemento);
  });

  tablaSeleccionada.value = state.tablaActual;
}

async function cargarTablas() {
  const data = await apiFetch('/api/bd/tablas');
  state.tablas = data.tablas || [];
  if (!state.tablas.some((tabla) => tabla.nombre === state.tablaActual)) {
    state.tablaActual = state.tablas[0]?.nombre || '';
  }
  renderListaTablas();
  await Promise.all([cargarTablaActual(), cargarUsuarios()]);
}

async function cargarTablaActual() {
  if (!state.tablaActual) return;
  const url = new URL(`/api/bd/tabla/${encodeURIComponent(state.tablaActual)}`, window.location.origin);
  url.searchParams.set('page', String(state.pagina));
  url.searchParams.set('limit', String(state.limite));
  url.searchParams.set('q', buscadorTabla.value.trim());
  const respuesta = await apiFetch(url.pathname + url.search);
  state.filas = respuesta.filas || [];
  state.total = Number(respuesta.total || 0);

  const tabla = obtenerTablaActual();
  state.esquema = tabla?.esquema || [];
  renderTabla();
  renderEstructura();
  renderListaTablas();
}

function renderTabla() {
  const columnas = state.esquema.map((columna) => columna.name);
  theadTabla.replaceChildren();
  tbodyTabla.replaceChildren();

  const encabezado = document.createElement('tr');
  columnas.forEach((columna) => crearCelda(encabezado, columna, 'th'));
  const puedeAdministrarFilas = !['usuarios', 'movimientos_inventario'].includes(state.tablaActual);
  if (puedeAdministrarFilas) crearCelda(encabezado, 'Acciones', 'th');
  theadTabla.appendChild(encabezado);

  if (!state.filas.length) {
    const vacio = document.createElement('tr');
    const celda = crearCelda(vacio, 'No hay registros para mostrar.');
    celda.colSpan = Math.max(1, columnas.length + (puedeAdministrarFilas ? 1 : 0));
    tbodyTabla.appendChild(vacio);
  } else {
    const clave = state.esquema.find((columna) => columna.pk)?.name;
    state.filas.forEach((datos) => {
      const fila = document.createElement('tr');
      columnas.forEach((columna) => crearCelda(fila, datos[columna]));
      if (puedeAdministrarFilas) {
        const acciones = document.createElement('td');
        const editar = document.createElement('button');
        editar.className = 'action-btn';
        editar.type = 'button';
        editar.textContent = 'Editar';
        editar.addEventListener('click', () => abrirFormularioRegistro('editar', datos));

        const eliminar = document.createElement('button');
        eliminar.className = 'action-btn delete';
        eliminar.type = 'button';
        eliminar.textContent = 'Eliminar';
        eliminar.addEventListener('click', () => eliminarRegistro(datos[clave]));
        acciones.append(editar, eliminar);
        fila.appendChild(acciones);
      }
      tbodyTabla.appendChild(fila);
    });
  }

  document.getElementById('titulo-tabla').textContent = state.tablaActual;
  document.getElementById('detalle-tabla').textContent =
    `${state.total} registros · Página ${state.pagina} · ${state.limite} filas por página`;
  paginaIndicador.textContent = `Página ${state.pagina} de ${Math.max(1, Math.ceil(state.total / state.limite))} · ${state.total} registros`;
  botonAnterior.disabled = state.pagina <= 1;
  botonSiguiente.disabled = state.pagina >= Math.ceil(state.total / state.limite);

  const usuarios = state.tablaActual === 'usuarios';
  const soloLectura = state.tablaActual === 'movimientos_inventario';
  document.getElementById('btn-importar-csv').disabled = usuarios || soloLectura;
  document.getElementById('btn-crear-registro').disabled =
    usuarios || soloLectura || (state.tablaActual === 'caja' && state.total > 0);
}

function renderEstructura() {
  const cuerpo = document.getElementById('estructura-tabla');
  cuerpo.replaceChildren();
  state.esquema.forEach((columna) => {
    const fila = document.createElement('tr');
    crearCelda(fila, columna.name);
    crearCelda(fila, columna.type || '—');
    crearCelda(fila, columna.pk ? 'PRIMARY KEY' : '—');
    crearCelda(fila, columna.notnull ? 'Sí' : 'No');
    crearCelda(fila, columna.default === null ? '—' : columna.default);
    cuerpo.appendChild(fila);
  });
}

async function seleccionarTabla(nombre) {
  if (!state.tablas.some((tabla) => tabla.nombre === nombre)) return;
  state.tablaActual = nombre;
  state.pagina = 1;
  tablaSeleccionada.value = nombre;
  try {
    await cargarTablaActual();
  } catch (error) {
    window.appUI.notify(error.message, 'error');
  }
}

function crearCampo(columna, valor, id) {
  const label = document.createElement('label');
  label.className = 'record-field';
  label.htmlFor = id;
  label.textContent = `${columna.name}${columna.notnull && columna.default === null ? ' *' : ''}`;

  let input;
  if (/descripcion|direccion/i.test(columna.name) && /TEXT/i.test(columna.type)) {
    input = document.createElement('textarea');
    input.rows = 3;
  } else if (columna.name === 'metodo_pago') {
    input = document.createElement('select');
    ['efectivo', 'transferencia', 'tarjeta', 'cheque'].forEach((metodo) => {
      const option = document.createElement('option');
      option.value = metodo;
      option.textContent = metodo;
      input.appendChild(option);
    });
  } else if (columna.name === 'tipo_movimiento' || columna.name === 'origen') {
    input = document.createElement('select');
    const opciones = columna.name === 'tipo_movimiento' ? ['Entrada', 'Salida'] : ['compra', 'venta'];
    opciones.forEach((opcionTexto) => {
      const option = document.createElement('option');
      option.value = opcionTexto;
      option.textContent = opcionTexto;
      input.appendChild(option);
    });
  } else {
    input = document.createElement('input');
    input.type = /INT|REAL|NUM|DEC|FLOAT|DOUBLE/i.test(columna.type) ? 'number' : 'text';
    if (/INT/i.test(columna.type)) input.step = '1';
    else if (input.type === 'number') input.step = 'any';
  }

  input.id = id;
  input.name = columna.name;
  let valorInicial = valor;
  if ((valorInicial === null || valorInicial === undefined) && columna.default !== null) {
    const predeterminado = String(columna.default);
    if (/^-?\d+(?:\.\d+)?$/.test(predeterminado) || /^'.*'$/.test(predeterminado)) {
      valorInicial = predeterminado.replace(/^'(.*)'$/, '$1');
    }
  }
  input.value = valorInicial === null || valorInicial === undefined ? '' : String(valorInicial);
  input.required = Boolean(columna.notnull && columna.default === null);
  if (columna.name === 'activo' && input.type === 'number') {
    input.min = '0';
    input.max = '1';
  }
  label.appendChild(input);
  return label;
}

function abrirFormularioRegistro(modo, registro = {}) {
  const pk = state.esquema.find((columna) => columna.pk);
  const camposDeFactura = state.tablaActual === 'facturas_compra'
    ? ['id_producto', 'cantidad_comprada', 'precio_unitario', 'total_compra', 'tipo_movimiento']
    : state.tablaActual === 'facturas_venta'
      ? ['id_producto', 'cantidad_vendida', 'precio_unitario', 'total_venta', 'tipo_movimiento', 'id_usuario']
      : [];
  const columnas = state.esquema.filter((columna) =>
    !columna.pk &&
    columna.name !== 'contrasena_hash' &&
    (modo !== 'editar' || !camposDeFactura.includes(columna.name))
  );
  const overlay = document.createElement('div');
  overlay.className = 'record-overlay';
  const dialogo = document.createElement('section');
  dialogo.className = 'record-dialog';
  dialogo.setAttribute('role', 'dialog');
  dialogo.setAttribute('aria-modal', 'true');

  const titulo = document.createElement('h2');
  titulo.textContent = modo === 'editar' ? `Editar ${state.tablaActual}` : `Nuevo registro · ${state.tablaActual}`;
  const ayuda = document.createElement('p');
  ayuda.textContent = state.tablaActual.startsWith('facturas_')
    ? 'Los datos que afectan inventario y caja están protegidos. Registra compras o ventas desde el panel administrativo para ajustar esos saldos.'
    : 'Los cambios se aplican directamente a la base de datos. Revisa los datos antes de guardar.';
  const formulario = document.createElement('form');
  formulario.className = 'record-form';

  columnas.forEach((columna, indice) => {
    formulario.appendChild(crearCampo(columna, registro[columna.name], `record-field-${indice}`));
  });

  const acciones = document.createElement('div');
  acciones.className = 'record-actions';
  const cancelar = document.createElement('button');
  cancelar.type = 'button';
  cancelar.className = 'btn btn-outline';
  cancelar.textContent = 'Cancelar';
  const guardar = document.createElement('button');
  guardar.type = 'submit';
  guardar.className = 'btn btn-primary';
  guardar.textContent = 'Guardar cambios';
  acciones.append(cancelar, guardar);
  formulario.appendChild(acciones);
  dialogo.append(titulo, ayuda, formulario);
  overlay.appendChild(dialogo);
  document.body.appendChild(overlay);

  const cerrar = () => overlay.remove();
  cancelar.addEventListener('click', cerrar);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) cerrar();
  });

  formulario.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {};
    for (const columna of columnas) {
      const control = formulario.elements.namedItem(columna.name);
      const valor = control.value;
      if (valor === '' && columna.default !== null &&
          (/INT|REAL|NUM|DEC|FLOAT|DOUBLE/i.test(columna.type) || modo === 'crear')) continue;
      payload[columna.name] = valor === ''
        ? null
        : (/INT|REAL|NUM|DEC|FLOAT|DOUBLE/i.test(columna.type) ? Number(valor) : valor);
    }

    guardar.disabled = true;
    try {
      const editar = modo === 'editar';
      const url = editar
        ? `/api/bd/tabla/${encodeURIComponent(state.tablaActual)}/${encodeURIComponent(registro[pk.name])}`
        : `/api/bd/tabla/${encodeURIComponent(state.tablaActual)}`;
      await apiFetch(url, {
        method: editar ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      cerrar();
      window.appUI.notify('Registro guardado correctamente.', 'success');
      await cargarTablas();
    } catch (error) {
      window.appUI.notify(error.message, 'error');
    } finally {
      guardar.disabled = false;
    }
  });
  formulario.querySelector('input, select, textarea')?.focus();
}

async function eliminarRegistro(id) {
  const esProducto = state.tablaActual === 'productos';
  const confirmado = await window.appUI.confirm({
    title: esProducto ? 'Desactivar producto' : 'Eliminar registro',
    message: esProducto
      ? 'El producto se marcará como inactivo para preservar el historial de facturas.'
      : 'Esta acción elimina el registro directamente de la base de datos y no se puede deshacer.',
    confirmText: esProducto ? 'Desactivar' : 'Eliminar',
    danger: true
  });
  if (!confirmado) return;

  try {
    await apiFetch(`/api/bd/tabla/${encodeURIComponent(state.tablaActual)}/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    window.appUI.notify('Registro eliminado.', 'success');
    state.pagina = Math.min(state.pagina, Math.max(1, Math.ceil((state.total - 1) / state.limite)));
    await cargarTablas();
  } catch (error) {
    window.appUI.notify(error.message, 'error');
  }
}

async function exportarCsv() {
  try {
    const response = await fetch(`/api/bd/exportar/${encodeURIComponent(state.tablaActual)}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'No se pudo exportar la tabla.');
    }
    const url = URL.createObjectURL(await response.blob());
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `${state.tablaActual}.csv`;
    enlace.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    window.appUI.notify('CSV exportado correctamente.', 'success');
  } catch (error) {
    window.appUI.notify(error.message, 'error');
  }
}

async function importarCsv(file) {
  if (!file) return;
  const confirmar = await window.appUI.confirm({
    title: 'Importar datos CSV',
    message: `Se añadirán los registros de “${file.name}” a ${state.tablaActual}. La importación se cancela completa si un registro no es válido.`,
    confirmText: 'Importar'
  });
  if (!confirmar) {
    archivoCsv.value = '';
    return;
  }

  const datos = new FormData();
  datos.append('archivo', file);
  try {
    const respuesta = await apiFetch(`/api/bd/importar/${encodeURIComponent(state.tablaActual)}`, {
      method: 'POST',
      body: datos
    });
    window.appUI.notify(respuesta.mensaje, 'success');
    await Promise.all([cargarTablas(), cargarTablaActual()]);
  } catch (error) {
    window.appUI.notify(error.message, 'error');
  } finally {
    archivoCsv.value = '';
  }
}

async function ejecutarConsulta() {
  const sql = sqlConsole.value.trim();
  if (!sql) {
    window.appUI.notify('Escribe una consulta SELECT.', 'info');
    return;
  }

  try {
    const data = await apiFetch('/api/bd/sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql })
    });
    const filas = data.filas || [];
    sqlResult.textContent = JSON.stringify(filas, null, 2);
    window.appUI.notify(`Consulta completada: ${filas.length} filas.`, 'success');
  } catch (error) {
    sqlResult.textContent = error.message;
    window.appUI.notify(error.message, 'error');
  }
}

async function cargarUsuarios() {
  const data = await apiFetch('/api/auth/usuarios');
  usuariosTabla.replaceChildren();
  (data.usuarios || []).forEach((usuario) => {
    const fila = document.createElement('tr');
    crearCelda(fila, usuario.id_usuario);
    crearCelda(fila, usuario.usuario);
    crearCelda(fila, usuario.rol);
    crearCelda(fila, new Date(usuario.fecha_creacion).toLocaleString('es-DO'));
    const acciones = document.createElement('td');

    const botonRol = document.createElement('button');
    botonRol.className = 'action-btn';
    botonRol.type = 'button';
    botonRol.textContent = usuario.rol === 'admin' ? 'Cambiar a cliente' : 'Hacer admin';
    botonRol.addEventListener('click', async () => {
      const nuevoRol = usuario.rol === 'admin' ? 'cliente' : 'admin';
      try {
        await apiFetch(`/api/auth/usuarios/${usuario.id_usuario}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rol: nuevoRol })
        });
        window.appUI.notify('Rol actualizado.', 'success');
        await cargarUsuarios();
      } catch (error) {
        window.appUI.notify(error.message, 'error');
      }
    });

    const botonEliminar = document.createElement('button');
    botonEliminar.className = 'action-btn delete';
    botonEliminar.type = 'button';
    botonEliminar.textContent = 'Eliminar';
    botonEliminar.addEventListener('click', async () => {
      const confirmado = await window.appUI.confirm({
        title: 'Eliminar usuario',
        message: `¿Quieres eliminar la cuenta ${usuario.usuario}?`,
        confirmText: 'Eliminar',
        danger: true
      });
      if (!confirmado) return;
      try {
        await apiFetch(`/api/auth/usuarios/${usuario.id_usuario}`, { method: 'DELETE' });
        window.appUI.notify('Usuario eliminado.', 'success');
        await cargarUsuarios();
      } catch (error) {
        window.appUI.notify(error.message, 'error');
      }
    });

    acciones.append(botonRol, botonEliminar);
    fila.appendChild(acciones);
    usuariosTabla.appendChild(fila);
  });
}

formUsuarioBd.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = formUsuarioBd.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(formUsuarioBd).entries());
    await apiFetch('/api/auth/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    formUsuarioBd.reset();
    window.appUI.notify('Usuario creado correctamente.', 'success');
    await cargarUsuarios();
  } catch (error) {
    window.appUI.notify(error.message, 'error');
  } finally {
    submit.disabled = false;
  }
});

document.getElementById('btn-anterior').addEventListener('click', async () => {
  if (state.pagina <= 1) return;
  state.pagina -= 1;
  try { await cargarTablaActual(); } catch (error) { window.appUI.notify(error.message, 'error'); }
});

document.getElementById('btn-siguiente').addEventListener('click', async () => {
  if (state.pagina >= Math.ceil(state.total / state.limite)) return;
  state.pagina += 1;
  try { await cargarTablaActual(); } catch (error) { window.appUI.notify(error.message, 'error'); }
});

tablaSeleccionada.addEventListener('change', () => seleccionarTabla(tablaSeleccionada.value));
buscadorTabla.addEventListener('input', () => {
  window.clearTimeout(state.temporizadorBusqueda);
  state.temporizadorBusqueda = window.setTimeout(async () => {
    state.pagina = 1;
    try { await cargarTablaActual(); } catch (error) { window.appUI.notify(error.message, 'error'); }
  }, 250);
});

document.getElementById('btn-exportar-csv').addEventListener('click', exportarCsv);
document.getElementById('btn-crear-registro').addEventListener('click', () => abrirFormularioRegistro('crear'));
document.getElementById('btn-importar-csv').addEventListener('click', () => archivoCsv.click());
document.getElementById('btn-recargar-tabla').addEventListener('click', async () => {
  try {
    await cargarTablas();
    window.appUI.notify('Datos actualizados.', 'success');
  } catch (error) {
    window.appUI.notify(error.message, 'error');
  }
});
document.getElementById('btn-ejecutar-sql').addEventListener('click', ejecutarConsulta);
archivoCsv.addEventListener('change', () => importarCsv(archivoCsv.files[0]));

cerrarSesion.addEventListener('click', async () => {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  } catch (error) {
    window.appUI.notify(error.message, 'error');
  }
});

(async function init() {
  try {
    await cargarTablas();
  } catch (error) {
    window.appUI.notify(error.message || 'No se pudo iniciar el explorador de base de datos.', 'error');
  }
})();
