/**
 * sidebar.js — Danh sách hàm số bên trái.
 *
 * Mỗi dòng hiển thị đủ thông tin để người dùng biết hệ thống *hiểu* biểu thức
 * của mình như thế nào: màu vẽ, loại đối tượng nhận diện được, và thông báo lỗi
 * cụ thể nếu có. Bản cũ khi gặp lỗi chỉ lặng lẽ xoá đồ thị đi.
 */

import { createMathField } from './mathfield.js';

export const CURVE_COLORS = [
  '#4c8dff', '#f2555a', '#22c58b', '#f5a623',
  '#a86bff', '#00bcd4', '#ff6fae', '#8bc34a',
];

export class Sidebar {
  /**
   * @param {HTMLElement} listElement
   * @param {object} handlers
   */
  constructor(listElement, handlers) {
    this.list = listElement;
    this.handlers = handlers;
    this.rows = new Map();
    this.activeId = null;
  }

  /** Dựng lại toàn bộ danh sách theo trạng thái mới. */
  render(items) {
    const seen = new Set();

    items.forEach((item, position) => {
      seen.add(item.id);
      let row = this.rows.get(item.id);
      if (!row) {
        row = this._createRow(item);
        this.rows.set(item.id, row);
      }
      this._updateRow(row, item, position);
      this.list.append(row.element);
    });

    for (const [id, row] of this.rows) {
      if (seen.has(id)) continue;
      row.element.remove();
      this.rows.delete(id);
    }
  }

  focusField(id, { select = false } = {}) {
    const row = this.rows.get(id);
    if (!row) return;
    row.field.focus();
    if (select) row.field.latex(row.field.latex());
  }

  activeField() {
    const row = this.rows.get(this.activeId);
    return row ? row.field : null;
  }

  _createRow(item) {
    const element = document.createElement('div');
    element.className = 'function-row';
    element.dataset.id = item.id;

    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'function-swatch';
    swatch.title = 'Đổi màu đường vẽ';
    swatch.setAttribute('aria-label', 'Đổi màu đường vẽ');
    swatch.addEventListener('click', () => this.handlers.onCycleColor?.(item.id));

    const body = document.createElement('div');
    body.className = 'function-body';

    const fieldHost = document.createElement('div');
    fieldHost.className = 'function-field';

    const meta = document.createElement('div');
    meta.className = 'function-meta';

    body.append(fieldHost, meta);

    const actions = document.createElement('div');
    actions.className = 'function-actions';

    const visibility = document.createElement('button');
    visibility.type = 'button';
    visibility.className = 'icon-button';
    visibility.addEventListener('click', () => this.handlers.onToggleHidden?.(item.id));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-button icon-button--danger';
    remove.innerHTML = ICONS.trash;
    remove.title = 'Xoá hàm số';
    remove.setAttribute('aria-label', 'Xoá hàm số');
    remove.addEventListener('click', () => this.handlers.onRemove?.(item.id));

    actions.append(visibility, remove);
    element.append(swatch, body, actions);

    const field = createMathField(fieldHost, {
      onEdit: (latex) => this.handlers.onEdit?.(item.id, latex),
      onEnter: () => this.handlers.onEnter?.(item.id),
      onDelete: () => this.handlers.onDeleteOut?.(item.id),
      onFocus: () => {
        this.activeId = item.id;
        this._markActive(item.id);
        this.handlers.onFocus?.(item.id);
      },
    });

    element.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.icon-button, .function-swatch')) return;
      this.activeId = item.id;
      this._markActive(item.id);
      // Bấm vào khoảng trống của dòng cũng đưa con trỏ vào ô công thức.
      if (!event.target.closest('.function-field')) {
        event.preventDefault();
        field.focus();
      }
      this.handlers.onFocus?.(item.id);
    });

    if (item.latex) field.latex(item.latex);

    return { element, field, swatch, meta, visibility, lastLatex: item.latex };
  }

  _updateRow(row, item, position) {
    row.element.style.setProperty('--row-color', item.color);
    row.swatch.style.background = item.color;
    row.element.classList.toggle('is-hidden', item.hidden);
    row.element.classList.toggle('has-error', Boolean(item.error));
    row.element.style.setProperty('--row-index', String(position));

    row.visibility.innerHTML = item.hidden ? ICONS.eyeOff : ICONS.eye;
    row.visibility.title = item.hidden ? 'Hiện đường vẽ' : 'Ẩn đường vẽ';
    row.visibility.setAttribute('aria-label', row.visibility.title);
    row.visibility.setAttribute('aria-pressed', String(!item.hidden));

    // Chỉ ghi lại vào ô nhập khi giá trị đến từ bên ngoài (nạp phiên, chia sẻ),
    // nếu không con trỏ soạn thảo sẽ bị nhảy về đầu mỗi lần gõ.
    if (item.latex !== row.lastLatex && item.latex !== row.field.latex()) {
      row.field.latex(item.latex);
    }
    row.lastLatex = item.latex;

    row.meta.replaceChildren();
    if (item.error) {
      const error = document.createElement('span');
      error.className = 'function-error';
      error.innerHTML = `${ICONS.warning}<span>${escapeHtml(item.error)}</span>`;
      row.meta.append(error);
    } else if (item.kindLabel) {
      const chip = document.createElement('span');
      chip.className = 'function-chip';
      chip.textContent = item.kindLabel;
      row.meta.append(chip);
    }
  }

  _markActive(id) {
    for (const [key, row] of this.rows) {
      row.element.classList.toggle('is-active', key === id);
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const ICONS = {
  eye: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 18 18"/><path d="M10.6 5.2A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.2 6.3A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.2-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  warning: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 7v6M12 16.5v.5"/></svg>',
};
