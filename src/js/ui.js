(function () {
  const toastRegion = document.createElement('div');
  toastRegion.className = 'toast-region';
  toastRegion.setAttribute('role', 'status');
  toastRegion.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastRegion);

  function notify(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `app-toast ${type}`;
    toast.textContent = String(message);
    toastRegion.appendChild(toast);
    window.setTimeout(() => {
      toast.classList.add('leaving');
      window.setTimeout(() => toast.remove(), 220);
    }, 4200);
  }

  function confirm(options = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'app-confirm-overlay';
      overlay.setAttribute('role', 'presentation');

      const dialog = document.createElement('section');
      dialog.className = 'app-confirm-dialog';
      dialog.setAttribute('role', 'alertdialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'app-confirm-title');
      dialog.setAttribute('aria-describedby', 'app-confirm-message');

      const title = document.createElement('h2');
      title.id = 'app-confirm-title';
      title.textContent = options.title || 'Confirmar acción';

      const message = document.createElement('p');
      message.id = 'app-confirm-message';
      message.textContent = options.message || '¿Deseas continuar?';

      const actions = document.createElement('div');
      actions.className = 'app-confirm-actions';

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn btn-outline';
      cancel.textContent = options.cancelText || 'Cancelar';

      const accept = document.createElement('button');
      accept.type = 'button';
      accept.className = options.danger ? 'btn btn-danger' : 'btn btn-primary';
      accept.textContent = options.confirmText || 'Confirmar';

      let completed = false;
      const finish = (accepted) => {
        if (completed) return;
        completed = true;
        overlay.remove();
        document.removeEventListener('keydown', onKeyDown);
        resolve(accepted);
      };
      const onKeyDown = (event) => {
        if (event.key === 'Escape') finish(false);
      };

      cancel.addEventListener('click', () => finish(false));
      accept.addEventListener('click', () => finish(true));
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) finish(false);
      });
      document.addEventListener('keydown', onKeyDown);

      actions.append(cancel, accept);
      dialog.append(title, message, actions);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      accept.focus();
    });
  }

  window.appUI = { notify, confirm };
})();
