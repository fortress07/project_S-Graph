/**
 * theme.js — Giao diện sáng/tối, ghi nhớ lựa chọn của người dùng.
 */

const KEY = 's-graph:theme';
const listeners = new Set();

export function initTheme() {
  const stored = read();
  apply(stored ?? (prefersDark() ? 'dark' : 'light'), false);

  // Theo dõi thiết lập hệ thống khi người dùng chưa chọn thủ công.
  window.matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener?.('change', (event) => {
      if (read()) return;
      apply(event.matches ? 'dark' : 'light', false);
    });
}

export function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  apply(next, true);
  return next;
}

export function onThemeChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function apply(theme, persist) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  if (persist) {
    try { localStorage.setItem(KEY, theme); } catch { /* bỏ qua */ }
  }
  for (const listener of listeners) listener(theme);
}

function read() {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function prefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
}
