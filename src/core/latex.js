/**
 * latex.js — Chuyển LaTeX (từ MathQuill) sang chuỗi trung tố.
 *
 * Bản cũ dùng chuỗi regex thay thế nên hỏng ngay khi gặp ngoặc lồng nhau:
 * `\frac{x^{2}}{3}` và `\sqrt{x^{2}}` đều bị cắt sai. Ở đây ta quét từng ký tự
 * và đọc nhóm `{...}` theo đúng độ sâu, nên ngoặc lồng bao nhiêu tầng cũng được.
 *
 * Quy ước đầu ra:
 *   - `\frac{A}{B}`      → `((A)/(B))`
 *   - `\sqrt[n]{A}`      → `nthroot((A),(n))`
 *   - `\left|A\right|`   → `abs((A))`
 *   - `\log_{b}`         → `log[b]`   (chỉ số dưới ghi bằng ngoặc vuông)
 *   - `\sin^{-1}`        → `arcsin`
 *   - `^\circ`           → `*(pi/180)`
 */

import { INVERSE_NAMES } from './mathlib.js';

/** Lệnh LaTeX chỉ tạo khoảng trắng — bỏ qua hoàn toàn. */
const SPACING = new Set([
  ',', ';', ':', '!', ' ', 'quad', 'qquad', 'thinspace', 'medspace', 'thickspace',
]);

/** Lệnh ánh xạ thẳng sang một chuỗi trung tố tương ứng. */
const DIRECT = Object.freeze({
  cdot: '*', times: '*', ast: '*', div: '/',
  le: '<=', leq: '<=', ge: '>=', geq: '>=', ne: '!=', neq: '!=',
  lt: '<', gt: '>', equiv: '=',
  pi: 'pi', tau: 'tau', theta: 'theta', phi: 'phi', infty: 'infty',
  alpha: 'alpha', beta: 'beta', lambda: 'lambda', mu: 'mu', omega: 'omega',
  ln: 'ln', exp: 'exp', deg: 'deg',
});

/** Hàm lượng giác / hyperbolic: giữ nguyên tên, có thể mang mũ `^{-1}` hoặc `^{2}`. */
const NAMED_FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'arcsin', 'arccos', 'arctan', 'arccot', 'arcsec', 'arccsc',
  'sinh', 'cosh', 'tanh', 'coth',
  'min', 'max', 'gcd', 'lcm', 'mod',
]);

/** Lệnh cấu trúc mà bộ chuyển đổi hiểu được. */
const STRUCTURAL = [
  'frac', 'dfrac', 'tfrac', 'sqrt', 'left', 'right',
  'lfloor', 'rfloor', 'lceil', 'rceil', 'log', 'circ', 'binom',
  'operatorname', 'mathrm', 'mathit',
];

/**
 * Toàn bộ lệnh LaTeX được chấp nhận từ nguồn *không tin cậy*.
 *
 * Cố ý **không** có `\text`: MathQuill 0.10.1 chèn thẳng nội dung của `\text{}`
 * vào DOM mà không thoát ký tự, nên `\text{<img onerror=...>}` chạy được mã tuỳ
 * ý. Việc vẽ đồ thị không cần tới lệnh này.
 */
export const ALLOWED_COMMANDS = new Set([
  ...STRUCTURAL,
  ...NAMED_FUNCTIONS,
  ...Object.keys(DIRECT),
  ...SPACING,
]);

/** Lệnh mà nội dung được lấy nguyên văn, phải lọc sạch trước khi dựng lại. */
const VERBATIM_COMMANDS = new Set(['operatorname', 'mathrm', 'mathit']);

/**
 * Lọc chuỗi LaTeX đến từ nguồn không tin cậy (liên kết chia sẻ, localStorage).
 *
 * Chuỗi này sẽ được MathQuill dựng thành DOM, nên đây chính là ranh giới tin
 * cậy. Cách làm: chỉ giữ lại lệnh nằm trong danh sách cho phép, và với những
 * lệnh nhận nội dung nguyên văn thì chỉ chừa lại chữ, số và dấu cách. Bộ quét
 * đọc ngoặc theo đúng độ sâu nên `\operatorname{a{<img>}}` cũng không lọt.
 *
 * @param {unknown} input
 * @param {number} [maxLength]
 * @returns {string}
 */
export function sanitizeLatex(input, maxLength = 500) {
  const src = String(input ?? '')
    .slice(0, maxLength)
    .replace(/[\u0000-\u001F\u007F]/g, '');

  let out = '';
  let i = 0;

  while (i < src.length) {
    const ch = src[i];
    if (ch !== '\\') { out += ch; i++; continue; }

    const match = /^\\([a-zA-Z]+)/.exec(src.slice(i));
    if (!match) {
      // Lệnh một ký tự: chỉ giữ lại những ký tự vô hại.
      const next = src[i + 1];
      if (next && '{}|,;:! \\'.includes(next)) out += ch + next;
      i += 2;
      continue;
    }

    const name = match[1];
    i += match[0].length;
    const start = skipSpaces(src, i);
    const hasGroup = src[start] === '{';

    if (!ALLOWED_COMMANDS.has(name)) {
      // Bỏ luôn cả đối số của lệnh lạ. Nếu chỉ bỏ tên lệnh thì phần thân vẫn
      // nằm lại trong chuỗi: `\text{<img onerror=...>}` sẽ còn `{<img ...>}`.
      if (hasGroup) i = readGroup(src, start).next;
      continue;
    }

    out += match[0];

    if (VERBATIM_COMMANDS.has(name) && hasGroup) {
      const group = readGroup(src, start);
      out += `{${group.body.replace(/[^a-zA-Z0-9 ]/g, '')}}`;
      i = group.next;
    }
  }

  return out;
}

/**
 * Chuyển một chuỗi LaTeX sang trung tố.
 * @param {string} latex
 * @returns {string}
 */
export function latexToInfix(latex) {
  const src = String(latex ?? '');
  const state = { absDepth: [] };
  return convert(src, state).trim();
}

function convert(src, state) {
  let out = '';
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (ch === '\\') {
      const res = readCommand(src, i, state);
      out += res.text;
      i = res.next;
      continue;
    }

    if (ch === '{') {
      const g = readGroup(src, i);
      out += '(' + convert(g.body, state) + ')';
      i = g.next;
      continue;
    }

    if (ch === '}') {
      // Dấu `}` thừa (LaTeX chưa hoàn chỉnh khi đang gõ) — bỏ qua.
      i++;
      continue;
    }

    if (ch === '^') {
      const g = readArgument(src, i + 1);
      // `^\circ` = số đo độ. Phát ra toán tử hậu tố `°` để nó gắn vào đúng
      // thừa số đứng trước: `\sin 30^\circ` phải là sin(30°), không phải
      // sin(30)·(π/180).
      if (g.body.trim() === '\\circ' || g.body.trim() === 'circ') {
        out += '°';
      } else {
        out += '^(' + convert(g.body, state) + ')';
      }
      i = g.next;
      continue;
    }

    if (ch === '_') {
      const g = readArgument(src, i + 1);
      out += '[' + convert(g.body, state) + ']';
      i = g.next;
      continue;
    }

    if (ch === '|') {
      // `|` trần: mở/đóng luân phiên theo từng cấp.
      if (state.absDepth.length > 0) {
        state.absDepth.pop();
        out += ')';
      } else {
        state.absDepth.push(true);
        out += 'abs(';
      }
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

/**
 * Đọc một lệnh `\name` bắt đầu tại vị trí `i` (trỏ vào dấu `\`).
 * @returns {{text: string, next: number}}
 */
function readCommand(src, i, state) {
  // Lệnh một ký tự không phải chữ cái: `\{`, `\}`, `\|`, `\%`...
  const single = src[i + 1];
  if (single !== undefined && !/[a-zA-Z]/.test(single)) {
    if (SPACING.has(single)) return { text: ' ', next: i + 2 };
    if (single === '{' || single === '}') return { text: '', next: i + 2 };
    if (single === '|') return { text: '', next: i + 2 };
    if (single === '\\') return { text: ' ', next: i + 2 };
    return { text: single, next: i + 2 };
  }

  const m = /^[a-zA-Z]+/.exec(src.slice(i + 1));
  if (!m) return { text: '', next: i + 1 };
  const name = m[0];
  let next = i + 1 + name.length;

  if (SPACING.has(name)) return { text: ' ', next };

  switch (name) {
    case 'frac':
    case 'dfrac':
    case 'tfrac': {
      const a = readArgument(src, next);
      const b = readArgument(src, a.next);
      return {
        text: `((${convert(a.body, state)})/(${convert(b.body, state)}))`,
        next: b.next,
      };
    }

    case 'sqrt': {
      const opt = readOptional(src, next);
      const arg = readArgument(src, opt.next);
      if (opt.body !== null) {
        return {
          text: `nthroot((${convert(arg.body, state)}),(${convert(opt.body, state)}))`,
          next: arg.next,
        };
      }
      return { text: `sqrt(${convert(arg.body, state)})`, next: arg.next };
    }

    case 'left': {
      const d = readDelimiter(src, next);
      if (d.symbol === '|') return { text: 'abs(', next: d.next };
      if (d.symbol === '.') return { text: '', next: d.next };
      if (d.symbol === '{') return { text: '{', next: d.next }; // ràng buộc miền
      return { text: '(', next: d.next };
    }

    case 'right': {
      const d = readDelimiter(src, next);
      if (d.symbol === '.') return { text: '', next: d.next };
      if (d.symbol === '}') return { text: '}', next: d.next };
      return { text: ')', next: d.next };
    }

    case 'lfloor': return { text: 'floor(', next };
    case 'rfloor': return { text: ')', next };
    case 'lceil': return { text: 'ceil(', next };
    case 'rceil': return { text: ')', next };

    case 'log': {
      // `\log_{b}` → `log[b]`, `\log` → log cơ số 10.
      const after = skipSpaces(src, next);
      if (src[after] === '_') {
        const sub = readArgument(src, after + 1);
        return { text: `log[${convert(sub.body, state)}]`, next: sub.next };
      }
      return { text: 'log', next };
    }

    case 'operatorname':
    case 'mathrm':
    case 'mathit':
    case 'text': {
      const arg = readArgument(src, next);
      return { text: arg.body.trim(), next: arg.next };
    }

    case 'circ':
      return { text: '°', next };

    case 'binom': {
      const a = readArgument(src, next);
      const b = readArgument(src, a.next);
      return {
        text: `binom((${convert(a.body, state)}),(${convert(b.body, state)}))`,
        next: b.next,
      };
    }
  }

  if (NAMED_FUNCTIONS.has(name)) {
    // Xử lý `\sin^{-1}x` (hàm ngược) và `\sin^{2}x` (luỹ thừa của giá trị hàm).
    const after = skipSpaces(src, next);
    if (src[after] === '^') {
      const exp = readArgument(src, after + 1);
      const body = exp.body.trim();
      if (body === '-1' && INVERSE_NAMES[name]) {
        return { text: INVERSE_NAMES[name], next: exp.next };
      }
      // Giữ mũ lại; bộ phân tích cú pháp sẽ bọc thành `(sin(x))^2`.
      return { text: `${name}^(${convert(body, state)})`, next: exp.next };
    }
    return { text: name, next };
  }

  if (DIRECT[name]) return { text: DIRECT[name], next };

  // Lệnh lạ: giữ tên trần, để bộ phân tích cú pháp báo lỗi có ngữ cảnh.
  return { text: name, next };
}

/** Bỏ qua khoảng trắng, trả về chỉ số ký tự khác trắng đầu tiên. */
function skipSpaces(src, i) {
  while (i < src.length && /\s/.test(src[i])) i++;
  return i;
}

/**
 * Đọc nhóm `{...}` cân bằng ngoặc. `i` phải trỏ vào dấu `{`.
 * @returns {{body: string, next: number}}
 */
function readGroup(src, i) {
  let depth = 0;
  let j = i;
  for (; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue; }   // bỏ qua ký tự được escape
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return { body: src.slice(i + 1, j), next: j + 1 };
    }
  }
  // Thiếu `}` (đang gõ dở) — lấy hết phần còn lại.
  return { body: src.slice(i + 1), next: src.length };
}

/** Đọc phần tuỳ chọn `[...]` của `\sqrt[n]{...}`. */
function readOptional(src, i) {
  const j = skipSpaces(src, i);
  if (src[j] !== '[') return { body: null, next: i };
  let depth = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '[') depth++;
    else if (src[k] === ']') {
      depth--;
      if (depth === 0) return { body: src.slice(j + 1, k), next: k + 1 };
    }
  }
  return { body: null, next: i };
}

/**
 * Đọc một đối số: nhóm `{...}`, hoặc một ký tự / lệnh đơn lẻ khi thiếu ngoặc
 * (LaTeX cho phép `\frac12` nghĩa là `\frac{1}{2}`).
 */
function readArgument(src, i) {
  const j = skipSpaces(src, i);
  if (j >= src.length) return { body: '', next: src.length };
  if (src[j] === '{') return readGroup(src, j);
  if (src[j] === '\\') {
    const m = /^\\[a-zA-Z]+|^\\./.exec(src.slice(j));
    if (m) return { body: m[0], next: j + m[0].length };
  }
  // Dấu âm dính liền: `^-1` nghĩa là mũ -1.
  if (src[j] === '-' || src[j] === '+') {
    const rest = readArgument(src, j + 1);
    return { body: src[j] + rest.body, next: rest.next };
  }
  return { body: src[j], next: j + 1 };
}

/** Đọc ký hiệu ngoặc đi sau `\left` / `\right`. */
function readDelimiter(src, i) {
  const j = skipSpaces(src, i);
  if (src[j] === '\\') {
    const m = /^\\[a-zA-Z]+|^\\./.exec(src.slice(j));
    if (m) {
      const sym = m[0].slice(1);
      const map = { lbrace: '{', rbrace: '}', lvert: '|', rvert: '|', vert: '|', '{': '{', '}': '}', '|': '|' };
      return { symbol: map[sym] ?? sym, next: j + m[0].length };
    }
  }
  return { symbol: src[j] ?? '', next: j + 1 };
}
