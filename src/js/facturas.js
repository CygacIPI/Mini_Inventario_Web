(function () {
  const logo = '/img/Logo_Horiz_DaziSolar_orig-Copy.svg';

  function escaparHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, (caracter) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[caracter]);
  }

  function formatearPrecio(valor) {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP'
    }).format(Number(valor) || 0);
  }

  function formatearFecha(valor) {
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime()) ? 'Fecha no disponible' : fecha.toLocaleString('es-DO');
  }

  function crearModal() {
    const modal = document.createElement('div');
    modal.id = 'modal-factura';
    modal.className = 'invoice-overlay';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'factura-titulo');
    modal.innerHTML = `
      <section class="invoice-dialog">
        <div id="factura-imprimible" class="invoice-sheet"></div>
        <div class="invoice-actions">
          <button type="button" class="invoice-button invoice-close">Cerrar</button>
          <button type="button" class="invoice-button invoice-print">Imprimir factura</button>
        </div>
      </section>
    `;

    modal.querySelector('.invoice-close').addEventListener('click', () => {
      modal.hidden = true;
    });
    modal.querySelector('.invoice-print').addEventListener('click', () => window.print());
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.hidden = true;
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') modal.hidden = true;
    });
    document.body.appendChild(modal);
    return modal;
  }

  let modal;

  function mostrar(factura, tipo = 'venta') {
    if (!factura) return;
    if (!modal) modal = crearModal();

    const compra = tipo === 'compra';
    const cantidad = compra ? factura.cantidad_comprada : factura.cantidad_vendida;
    const total = compra ? factura.total_compra : factura.total_venta;
    const numero = factura.id_factura ?? factura.facturaId ?? '—';
    const cliente = compra
      ? factura.proveedor || 'Proveedor no especificado'
      : factura.nombre_cliente || factura.usuario_cuenta || 'Cliente';
    const contacto = compra
      ? ''
      : [factura.email_cliente, factura.telefono_cliente].filter(Boolean).join(' · ');
    const direccion = compra ? '' : factura.direccion_cliente || '';
    const producto = factura.nombre_producto || factura.producto || `Producto ${factura.id_producto ?? ''}`;
    const metodoPago = factura.metodo_pago || 'No especificado';

    modal.querySelector('#factura-imprimible').innerHTML = `
      <header class="invoice-heading">
        <img src="${logo}" alt="Dazi Solar" />
        <div>
          <span>${compra ? 'FACTURA DE COMPRA' : 'FACTURA DE VENTA'}</span>
          <h2 id="factura-titulo">Factura #${escaparHtml(numero)}</h2>
          <p>${escaparHtml(formatearFecha(factura.fecha))}</p>
        </div>
      </header>
      <div class="invoice-parties">
        <section>
          <span class="invoice-label">${compra ? 'Proveedor' : 'Cliente'}</span>
          <strong>${escaparHtml(cliente)}</strong>
          ${contacto ? `<span>${escaparHtml(contacto)}</span>` : ''}
          ${direccion ? `<span>${escaparHtml(direccion)}</span>` : ''}
        </section>
        <section>
          <span class="invoice-label">Emisor</span>
          <strong>DAZI SOLAR</strong>
          <span>República Dominicana</span>
        </section>
      </div>
      <table class="invoice-items">
        <thead>
          <tr><th>Descripción</th><th>Cantidad</th><th>Precio unitario</th><th>Total</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>${escaparHtml(producto)}</td>
            <td>${escaparHtml(cantidad)}</td>
            <td>${escaparHtml(formatearPrecio(factura.precio_unitario))}</td>
            <td>${escaparHtml(formatearPrecio(total))}</td>
          </tr>
        </tbody>
      </table>
      <div class="invoice-totals">
        <span>Método de pago: ${escaparHtml(metodoPago)}</span>
        <strong>Total: ${escaparHtml(formatearPrecio(total))}</strong>
      </div>
      <footer class="invoice-footer">Gracias por confiar en Dazi Solar.</footer>
    `;
    modal.hidden = false;
    modal.querySelector('.invoice-close').focus();
  }

  window.facturasUI = { mostrar };
})();
