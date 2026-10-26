// iOS-style alerts, context menus and popovers, drawn in the page so they
// match the theme (Electron has no window.prompt, and native menus look like Windows).
const Dialogs = (() => {
  const root = document.getElementById('overlay-root');

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // A full-window layer. Escape (and, for non-modal layers, clicking outside) dismisses it.
  function layer({ modal, onDismiss }) {
    const backdrop = el('div', modal ? 'backdrop modal' : 'backdrop');
    const previousFocus = document.activeElement;
    // Only the topmost layer answers Escape (an alert can sit on top of a sheet).
    const onKey = (event) => {
      if (event.key !== 'Escape' || root.lastElementChild !== backdrop) return;
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
    };
    document.addEventListener('keydown', onKey, true);
    if (!modal) {
      backdrop.addEventListener('mousedown', (event) => {
        if (event.target === backdrop) onDismiss();
      });
    }
    backdrop.addEventListener('contextmenu', (event) => event.preventDefault());
    root.append(backdrop);
    return {
      backdrop,
      close() {
        backdrop.remove();
        document.removeEventListener('keydown', onKey, true);
        previousFocus?.focus?.();
      },
    };
  }

  // Places a floating box below an anchor element (or at a point), kept inside the window.
  function position(box, { anchor, x, y }) {
    const margin = 8;
    const { width, height } = box.getBoundingClientRect();
    let left = x;
    let top = y;
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      left = rect.left;
      top = rect.bottom + 6;
      if (top + height > window.innerHeight - margin) top = rect.top - height - 6;
      if (left + width > window.innerWidth - margin) left = rect.right - width;
    } else if (top + height > window.innerHeight - margin) {
      top = y - height;
    }
    box.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - width - margin))}px`;
    box.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - height - margin))}px`;
  }

  // buttons: [{ label, value, role: 'cancel' | 'default' | 'destructive' }]
  // With `input`, resolves to { value, text }; otherwise to the chosen button's value.
  function alert({ title, message, input, buttons = [{ label: 'OK', value: true, role: 'default' }] }) {
    return new Promise((resolve) => {
      const cancel = buttons.find((button) => button.role === 'cancel');
      const confirm = buttons.find((button) => button.role === 'default') ?? buttons[buttons.length - 1];
      let field = null;
      const finish = (button) => {
        const text = field?.value;
        current.close();
        resolve(input ? { value: button.value, text } : button.value);
      };
      const current = layer({ modal: true, onDismiss: () => finish(cancel ?? confirm) });

      const box = el('div', 'alert');
      box.setAttribute('role', 'alertdialog');
      box.append(el('div', 'alert-title', title));
      if (message) box.append(el('div', 'alert-message', message));
      if (input) {
        field = el('input', 'alert-input');
        field.value = input.value ?? '';
        field.placeholder = input.placeholder ?? '';
        field.spellcheck = false;
        field.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          finish(confirm);
        });
        box.append(field);
      }
      const row = el('div', buttons.length > 2 ? 'alert-buttons stacked' : 'alert-buttons');
      for (const button of buttons) {
        const node = el('button', `alert-button ${button.role ?? ''}`, button.label);
        node.addEventListener('click', () => finish(button));
        row.append(node);
      }
      box.append(row);
      current.backdrop.append(box);

      if (field) {
        field.focus();
        field.setSelectionRange(...(input.select ?? [0, field.value.length]));
      } else {
        // Focus Cancel when there is one, so Enter never confirms a destructive action by accident.
        (row.querySelector('.cancel') ?? row.querySelector('.default') ?? row.lastElementChild).focus();
      }
    });
  }

  async function prompt({ title, message, value, placeholder, select, confirmLabel = 'OK' }) {
    const { value: confirmed, text } = await alert({
      title,
      message,
      input: { value, placeholder, select },
      buttons: [
        { label: 'Cancel', value: false, role: 'cancel' },
        { label: confirmLabel, value: true, role: 'default' },
      ],
    });
    return confirmed ? text : null;
  }

  // items: [{ label, value, icon, destructive, checked } | 'separator']
  function menu({ anchor, x, y, title, items }) {
    return new Promise((resolve) => {
      const finish = (value) => {
        current.close();
        resolve(value);
      };
      const current = layer({ modal: false, onDismiss: () => finish(null) });
      const box = el('div', 'menu');
      box.setAttribute('role', 'menu');
      if (title) box.append(el('div', 'menu-title', title));
      for (const item of items) {
        if (item === 'separator') {
          box.append(el('div', 'menu-separator'));
          continue;
        }
        const node = el('button', `menu-item${item.destructive ? ' destructive' : ''}`);
        node.setAttribute('role', item.checked === undefined ? 'menuitem' : 'menuitemradio');
        if (item.checked !== undefined) {
          node.setAttribute('aria-checked', String(item.checked));
          node.append(el('span', 'menu-check', item.checked ? '✓' : ''));
        }
        const label = el('span', 'menu-label', item.label);
        // Font and weight menus show each choice in itself.
        if (item.fontFamily) label.style.fontFamily = `'${item.fontFamily}'`;
        if (item.fontWeight) label.style.fontWeight = item.fontWeight;
        node.append(label);
        if (item.shortcut) node.append(el('span', 'menu-shortcut', item.shortcut));
        if (item.icon) {
          const icon = el('span', 'menu-icon');
          icon.innerHTML = Icons[item.icon];
          node.append(icon);
        }
        node.addEventListener('click', () => finish(item.value));
        box.append(node);
      }
      box.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const nodes = [...box.querySelectorAll('.menu-item')];
        const index = nodes.indexOf(document.activeElement);
        const step = event.key === 'ArrowDown' ? 1 : -1;
        nodes[(index + step + nodes.length) % nodes.length].focus();
      });
      current.backdrop.append(box);
      position(box, { anchor, x, y });
      box.querySelector('.menu-item')?.focus();
    });
  }

  function popover(anchor, content, { className = '', onClose } = {}) {
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      current.close();
      onClose?.();
    };
    const current = layer({ modal: false, onDismiss: close });
    const box = el('div', `popover ${className}`);
    box.append(content);
    current.backdrop.append(box);
    position(box, { anchor });
    return { close, box };
  }

  // A box placed by its CSS class: a centered sheet (modal) or the Goto
  // Anything bar at the top of the window (not modal; clicking outside closes it).
  // `onDismiss` replaces closing on Escape, for sheets that ask first.
  function sheet(content, { modal = true, className = '', onClose, onDismiss } = {}) {
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      current.close();
      onClose?.();
    };
    const current = layer({ modal, onDismiss: onDismiss ?? close });
    const box = el('div', `sheet ${className}`);
    box.append(content);
    current.backdrop.append(box);
    return { close, box };
  }

  const isOpen = () => root.childElementCount > 0;

  return { el, alert, prompt, menu, popover, sheet, isOpen };
})();
