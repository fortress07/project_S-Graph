/**
 * toast.js — Thông báo ngắn, thay cho `alert()` vốn chặn cả trang.
 */

let container = null;

function ensureContainer() {
  if (container?.isConnected) return container;
  container = document.createElement('div');
  container.className = 'toast-stack';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  document.body.append(container);
  return container;
}

/**
 * @param {string} message
 * @param {{tone?: 'info'|'success'|'warning'|'error', duration?: number}} [options]
 */
export function toast(message, options = {}) {
  const { tone = 'info', duration = 3200 } = options;
  const host = ensureContainer();

  const element = document.createElement('div');
  element.className = `toast toast--${tone}`;
  element.textContent = message;
  host.append(element);

  requestAnimationFrame(() => element.classList.add('is-visible'));

  const remove = () => {
    element.classList.remove('is-visible');
    element.addEventListener('transitionend', () => element.remove(), { once: true });
    setTimeout(() => element.remove(), 400);
  };

  const timer = setTimeout(remove, duration);
  element.addEventListener('click', () => { clearTimeout(timer); remove(); });
  return remove;
}
