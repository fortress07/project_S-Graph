/**
 * keyboard.js — Bàn phím toán học ảo.
 *
 * Sửa các bất tiện của bản cũ: phím xoá chỉ có ở bảng chữ cái, nút `\theta`
 * hiển thị nguyên chuỗi lệnh, hai phím mũi tên lại vẽ hình dấu bé/dấu lớn, và
 * `x^a` chèn chữ "a" thay vì ô trống để gõ số mũ.
 */

/**
 * Mỗi phím: [nhãn hiển thị, giá trị, kiểu].
 *   kiểu 'w' = ghi LaTeX, 'c' = lệnh MathQuill, 'k' = phím bấm, 'a' = hành động
 */
const LAYOUTS = {
  basic: {
    label: '123',
    title: 'Số và phép tính',
    columns: 6,
    keys: [
      ['7', '7', 'w'], ['8', '8', 'w'], ['9', '9', 'w'],
      ['÷', '\\div', 'w'], ['(', '(', 'c'], [')', ')', 'c'],

      ['4', '4', 'w'], ['5', '5', 'w'], ['6', '6', 'w'],
      ['×', '\\cdot', 'w'], ['x', 'x', 'w', 'accent'], ['y', 'y', 'w', 'accent'],

      ['1', '1', 'w'], ['2', '2', 'w'], ['3', '3', 'w'],
      ['−', '-', 'w'], ['x²', '^2', 'c', 'accent'], ['xⁿ', '^', 'c', 'accent'],

      ['0', '0', 'w'], [',', '.', 'w'], ['π', '\\pi', 'w'],
      ['+', '+', 'w'], ['a⁄b', '/', 'c', 'accent'], ['√', 'sqrt', 'c', 'accent'],

      ['=', '=', 'w'], ['<', '<', 'w'], ['>', '>', 'w'],
      ['≤', '\\le', 'w'], ['≥', '\\ge', 'w'],
      ['⌫', 'Backspace', 'k', 'control'],
    ],
  },

  functions: {
    label: 'f(x)',
    title: 'Hàm số',
    columns: 6,
    keys: [
      ['sin', '\\sin', 'w'], ['cos', '\\cos', 'w'], ['tan', '\\tan', 'w'],
      ['cot', '\\cot', 'w'], ['ln', '\\ln', 'w'], ['log', '\\log', 'w'],

      ['sin⁻¹', '\\arcsin', 'w'], ['cos⁻¹', '\\arccos', 'w'], ['tan⁻¹', '\\arctan', 'w'],
      ['logₐ', '\\log_', 'w'], ['eˣ', 'e^', 'c'], ['|x|', '|', 'c'],

      ['ⁿ√', 'nthroot', 'c'], ['⌊x⌋', '\\lfloor', 'w'], ['⌈x⌉', '\\lceil', 'w'],
      ['n!', '!', 'w'], ['°', '^\\circ', 'w'], ['∞', '\\infty', 'w'],

      ['θ', '\\theta', 'w', 'accent'], ['r', 'r', 'w', 'accent'], ['t', 't', 'w', 'accent'],
      ['e', 'e', 'w'], ['min', '\\min', 'w'], ['max', '\\max', 'w'],

      ['{ }', 'restriction', 'a', 'wide'],
      ['←', 'Left', 'k', 'control'], ['→', 'Right', 'k', 'control'],
      ['⌫', 'Backspace', 'k', 'control'],
    ],
  },

  letters: {
    label: 'abc',
    title: 'Chữ cái',
    columns: 7,
    keys: [
      ['a', 'a', 'w'], ['b', 'b', 'w'], ['c', 'c', 'w'], ['d', 'd', 'w'],
      ['e', 'e', 'w'], ['f', 'f', 'w'], ['g', 'g', 'w'],
      ['h', 'h', 'w'], ['i', 'i', 'w'], ['j', 'j', 'w'], ['k', 'k', 'w'],
      ['l', 'l', 'w'], ['m', 'm', 'w'], ['n', 'n', 'w'],
      ['o', 'o', 'w'], ['p', 'p', 'w'], ['q', 'q', 'w'], ['r', 'r', 'w'],
      ['s', 's', 'w'], ['t', 't', 'w'], ['u', 'u', 'w'],
      ['v', 'v', 'w'], ['w', 'w', 'w'], ['x', 'x', 'w'], ['y', 'y', 'w'],
      ['z', 'z', 'w'], [',', ',', 'w'], ['⌫', 'Backspace', 'k', 'control'],
    ],
  },
};

export class MathKeyboard {
  /**
   * @param {HTMLElement} root
   * @param {{getTarget: () => object|null, onAction?: (name: string) => void}} options
   */
  constructor(root, options) {
    this.root = root;
    this.options = options;
    this.current = 'basic';
    this._build();
  }

  _build() {
    this.root.replaceChildren();

    const tabs = document.createElement('div');
    tabs.className = 'keyboard-tabs';
    this.tabButtons = new Map();

    for (const [name, layout] of Object.entries(LAYOUTS)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'keyboard-tab';
      button.textContent = layout.label;
      button.title = layout.title;
      button.addEventListener('mousedown', (e) => e.preventDefault());
      button.addEventListener('click', () => this.show(name));
      tabs.append(button);
      this.tabButtons.set(name, button);
    }

    const spacer = document.createElement('div');
    spacer.className = 'keyboard-spacer';
    tabs.append(spacer);

    const hide = document.createElement('button');
    hide.type = 'button';
    hide.className = 'keyboard-tab keyboard-tab--close';
    hide.innerHTML = '<span aria-hidden="true">⌄</span>';
    hide.title = 'Ẩn bàn phím';
    hide.setAttribute('aria-label', 'Ẩn bàn phím');
    hide.addEventListener('mousedown', (e) => e.preventDefault());
    hide.addEventListener('click', () => this.options.onAction?.('hide'));
    tabs.append(hide);

    this.panels = document.createElement('div');
    this.panels.className = 'keyboard-panels';

    this.panelByName = new Map();
    for (const [name, layout] of Object.entries(LAYOUTS)) {
      const grid = document.createElement('div');
      grid.className = 'keyboard-grid';
      grid.style.setProperty('--keyboard-columns', String(layout.columns));

      for (const [label, value, type, modifier] of layout.keys) {
        const key = document.createElement('button');
        key.type = 'button';
        key.className = 'keyboard-key';
        if (modifier) key.classList.add(`keyboard-key--${modifier}`);
        key.textContent = label;
        // Giữ nguyên tiêu điểm ở ô nhập khi bấm phím ảo.
        key.addEventListener('mousedown', (e) => e.preventDefault());
        key.addEventListener('click', () => this._press(value, type));
        grid.append(key);
      }

      this.panelByName.set(name, grid);
      this.panels.append(grid);
    }

    this.root.append(tabs, this.panels);
    this.show('basic');
  }

  show(name) {
    this.current = name;
    for (const [key, panel] of this.panelByName) {
      panel.classList.toggle('is-active', key === name);
    }
    for (const [key, button] of this.tabButtons) {
      button.classList.toggle('is-active', key === name);
      button.setAttribute('aria-selected', String(key === name));
    }
  }

  _press(value, type) {
    const target = this.options.getTarget?.();
    if (!target) return;

    switch (type) {
      case 'w': target.write(value); break;
      case 'c': target.cmd(value); break;
      case 'k': target.keystroke(value); break;
      case 'a': this._action(value, target); break;
    }
    target.focus();
  }

  _action(name, target) {
    if (name === 'restriction') {
      // Chèn khung ràng buộc miền `{ }` và đưa con trỏ vào giữa.
      target.write('\\left\\{\\right\\}');
      target.keystroke('Left');
      return;
    }
    this.options.onAction?.(name);
  }
}
