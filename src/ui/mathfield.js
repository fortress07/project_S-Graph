/**
 * mathfield.js — Bọc MathQuill trong một giao diện ổn định.
 *
 * MathQuill được nạp từ CDN nên có thể không tải được (mạng chặn, ngoại tuyến).
 * Khi đó ta tự động chuyển sang ô nhập văn bản thường: bộ phân tích cú pháp của
 * dự án đọc được cả LaTeX lẫn ký hiệu gõ tay như `x^2`, `sqrt(x)`, nên ứng dụng
 * vẫn dùng được đầy đủ thay vì hỏng hoàn toàn.
 */

import { sanitizeLatex } from '../core/latex.js';

let mathQuillInterface = null;

/** @returns {boolean} MathQuill có sẵn sàng không. */
export function isMathQuillReady() {
  if (mathQuillInterface) return true;
  const globalMQ = window.MathQuill;
  if (!globalMQ || typeof globalMQ.getInterface !== 'function') return false;
  if (!window.jQuery) return false;
  try {
    mathQuillInterface = globalMQ.getInterface(2);
    return true;
  } catch {
    return false;
  }
}

const AUTO_COMMANDS = 'pi theta tau phi sqrt nthroot infty le ge neq cdot times div';
const AUTO_OPERATORS =
  'sin cos tan cot sec csc arcsin arccos arctan arccot sinh cosh tanh coth ' +
  'ln log exp abs floor ceil min max mod gcd lcm sign round';

/**
 * Tạo ô nhập công thức.
 * @param {HTMLElement} host
 * @param {{onEdit?: Function, onEnter?: Function, onFocus?: Function,
 *          onBlur?: Function, onDelete?: Function}} handlers
 */
export function createMathField(host, handlers = {}) {
  return isMathQuillReady()
    ? new MathQuillField(host, handlers)
    : new PlainTextField(host, handlers);
}

/* ------------------------------------------------------------------ */
/* Bản dùng MathQuill                                                  */
/* ------------------------------------------------------------------ */

class MathQuillField {
  constructor(host, handlers) {
    this.host = host;
    this.handlers = handlers;
    this.usesMathQuill = true;

    this.field = mathQuillInterface.MathField(host, {
      spaceBehavesLikeTab: false,
      autoCommands: AUTO_COMMANDS,
      autoOperatorNames: AUTO_OPERATORS,
      restrictMismatchedBrackets: true,
      handlers: {
        edit: () => this.handlers.onEdit?.(this.latex()),
        enter: () => this.handlers.onEnter?.(),
        deleteOutOf: () => this.handlers.onDelete?.(),
      },
    });

    host.addEventListener('focusin', () => this.handlers.onFocus?.(this));
    host.addEventListener('focusout', () => this.handlers.onBlur?.(this));

    // Dán văn bản: MathQuill mặc định coi toàn bộ chuỗi dán là lệnh LaTeX và
    // dựng thẳng lên DOM (`\text{<img src=x onerror=…>}` chạy được). Đây là
    // nguồn không tin cậy — nạn nhân có thể bị lừa sao chép một "công thức"
    // độc hại từ trang khác — nên phải đưa qua đúng bộ lọc dùng cho liên kết
    // chia sẻ. Bắt sự kiện ngay trên textarea ẩn và chặn nó lan lên handler
    // mặc định của MathQuill ở phần tử cha.
    host.querySelector('textarea')?.addEventListener('paste', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (text) this.write(sanitizeLatex(text));
    }, { capture: true });
  }

  latex(value) {
    if (value === undefined) return this.field.latex();
    this.field.latex(value);
    return value;
  }

  focus() { this.field.focus(); }
  blur() { this.field.blur(); }
  write(latex) { this.field.write(latex); }
  cmd(name) { this.field.cmd(name); }
  keystroke(keys) { this.field.keystroke(keys); }
  typedText(text) { this.field.typedText(text); }
  clear() { this.field.latex(''); }
}

/* ------------------------------------------------------------------ */
/* Bản dự phòng bằng ô nhập thường                                     */
/* ------------------------------------------------------------------ */

class PlainTextField {
  constructor(host, handlers) {
    this.handlers = handlers;
    this.usesMathQuill = false;

    host.classList.add('mathfield--plain');
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.spellcheck = false;
    this.input.autocomplete = 'off';
    this.input.className = 'mathfield-plain-input';
    this.input.placeholder = 'ví dụ: x^2 - 2x';
    host.replaceChildren(this.input);

    this.input.addEventListener('input', () => this.handlers.onEdit?.(this.latex()));
    this.input.addEventListener('focus', () => this.handlers.onFocus?.(this));
    this.input.addEventListener('blur', () => this.handlers.onBlur?.(this));
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.handlers.onEnter?.();
      if (event.key === 'Backspace' && this.input.value === '') this.handlers.onDelete?.();
    });
  }

  latex(value) {
    if (value === undefined) return this.input.value;
    this.input.value = value;
    return value;
  }

  focus() { this.input.focus(); }
  blur() { this.input.blur(); }

  /** Chèn văn bản tại vị trí con trỏ, giữ nguyên hành vi bàn phím ảo. */
  write(latex) {
    const start = this.input.selectionStart ?? this.input.value.length;
    const end = this.input.selectionEnd ?? start;
    const text = latexToPlain(latex);
    this.input.value = this.input.value.slice(0, start) + text + this.input.value.slice(end);
    const caret = start + text.length;
    this.input.setSelectionRange(caret, caret);
    this.handlers.onEdit?.(this.latex());
  }

  cmd(name) { this.write(name); }

  keystroke(keys) {
    if (keys === 'Backspace') {
      const start = this.input.selectionStart ?? 0;
      const end = this.input.selectionEnd ?? start;
      if (start === end && start > 0) {
        this.input.value = this.input.value.slice(0, start - 1) + this.input.value.slice(start);
        this.input.setSelectionRange(start - 1, start - 1);
      } else {
        this.input.value = this.input.value.slice(0, start) + this.input.value.slice(end);
        this.input.setSelectionRange(start, start);
      }
      this.handlers.onEdit?.(this.latex());
      return;
    }
    const shift = keys === 'Left' ? -1 : keys === 'Right' ? 1 : 0;
    if (shift) {
      const caret = (this.input.selectionStart ?? 0) + shift;
      const clamped = Math.max(0, Math.min(this.input.value.length, caret));
      this.input.setSelectionRange(clamped, clamped);
    }
  }

  typedText(text) { this.write(text); }
  clear() { this.input.value = ''; this.handlers.onEdit?.(''); }
}

/**
 * Hiển thị một công thức chỉ để đọc (không sửa được).
 * Không có MathQuill thì rơi về văn bản đã rút gọn ký hiệu.
 */
export function renderStaticMath(element, latex) {
  if (isMathQuillReady()) {
    element.textContent = latex;
    try {
      const rendered = mathQuillInterface.StaticMath(element);
      // MathQuill gặp lệnh lạ thì không báo lỗi mà lặng lẽ dựng ra công thức
      // rỗng. Đối chiếu lại kết quả để phát hiện và quay về dạng văn bản.
      if (!latex.trim() || rendered.latex().trim()) return true;
    } catch {
      // rơi xuống nhánh văn bản bên dưới
    }
  }
  element.textContent = latexToPlain(latex);
  return false;
}

/** Rút gọn vài lệnh LaTeX hay dùng về dạng gõ tay cho ô nhập thường. */
function latexToPlain(latex) {
  return latex
    .replace(/\\frac\{\}\{\}/g, '()/()')
    .replace(/\\sqrt\{\}/g, 'sqrt()')
    .replace(/\\left\|\\right\|/g, 'abs()')
    .replace(/\\left\(/g, '(')
    .replace(/\\right\)/g, ')')
    .replace(/\\cdot/g, '*')
    .replace(/\\times/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\pi/g, 'pi')
    .replace(/\\theta/g, 'theta')
    .replace(/\\le/g, '<=')
    .replace(/\\ge/g, '>=')
    .replace(/\\/g, '')
    .replace(/[{}]/g, '');
}
