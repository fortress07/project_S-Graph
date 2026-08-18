/**
 * compile.js — Biên dịch cây AST thành hàm JavaScript.
 *
 * Dùng kỹ thuật "cây closure": mỗi nút trở thành một hàm nhỏ nhận `scope`.
 * Không dùng `new Function`/`eval` nên an toàn với CSP và không thể chạy mã lạ
 * từ chuỗi người dùng nhập.
 */

import { FUNCTIONS, CONSTANTS, pow } from './mathlib.js';
import { ParseError, collectVariables, walk } from './parser.js';

/**
 * Trần độ phức tạp của một biểu thức.
 *
 * Mỗi nút AST trở thành một lời gọi hàm, mà bộ vẽ gọi hàm đã biên dịch hàng
 * chục nghìn lần cho *mỗi* khung hình. Không có trần này thì một biểu thức lồng
 * sâu đến từ liên kết chia sẻ đẩy chi phí của một lần lấy mẫu lên tuỳ ý, và
 * nhân với số ô lưới là đủ khoá cứng luồng chính. Công thức phổ thông rậm rạp
 * nhất cũng chỉ quanh 30–60 nút, nên 200 là rất rộng rãi.
 */
const MAX_NODES = 200;

/**
 * @param {object} ast Cây cú pháp
 * @param {string[]} allowedVars Danh sách biến hợp lệ
 * @returns {(scope: object) => number}
 */
export function compile(ast, allowedVars = ['x', 'y', 't', 'theta', 'r']) {
  const size = countNodes(ast);
  if (size > MAX_NODES) {
    throw new ParseError(`Biểu thức quá phức tạp (${size} nút, tối đa ${MAX_NODES}).`);
  }

  const allowed = new Set(allowedVars);
  for (const name of collectVariables(ast)) {
    if (!allowed.has(name)) {
      throw new ParseError(
        `Không nhận ra “${name}”. Biến dùng được: ${allowedVars.join(', ')}`
      );
    }
  }
  return build(ast);
}

function countNodes(ast) {
  let total = 0;
  walk(ast, () => { total++; });
  return total;
}

function build(node) {
  switch (node.type) {
    case 'num': {
      const v = node.value;
      return () => v;
    }

    case 'const': {
      const v = CONSTANTS[node.name];
      return () => v;
    }

    case 'var': {
      const name = node.name;
      return (scope) => {
        const v = scope[name];
        return v === undefined ? NaN : v;
      };
    }

    case 'unary': {
      const arg = build(node.arg);
      return (scope) => -arg(scope);
    }

    case 'binary':
      return buildBinary(node);

    case 'call':
      return buildCall(node);

    case 'relation':
      return buildRelation(node);

    default:
      throw new ParseError(`Nút không hỗ trợ: ${node.type}`);
  }
}

function buildBinary(node) {
  const a = build(node.left);
  const b = build(node.right);
  switch (node.op) {
    case '+': return (s) => a(s) + b(s);
    case '-': return (s) => a(s) - b(s);
    case '*': return (s) => a(s) * b(s);
    case '/': return (s) => a(s) / b(s);
    case '^': return (s) => pow(a(s), b(s));
    default: throw new ParseError(`Toán tử không hỗ trợ: ${node.op}`);
  }
}

function buildCall(node) {
  const spec = FUNCTIONS[node.name];
  if (!spec) throw new ParseError(`Không nhận ra hàm “${node.name}”`);
  const args = node.args.map(build);
  const fn = spec.fn;

  // Tách riêng trường hợp 1 và 2 đối số để tránh cấp phát mảng mỗi lần gọi;
  // đường vẽ đồ thị gọi hàm này hàng chục nghìn lần mỗi khung hình.
  if (args.length === 1) {
    const a0 = args[0];
    return (s) => fn(a0(s));
  }
  if (args.length === 2) {
    const [a0, a1] = args;
    return (s) => fn(a0(s), a1(s));
  }
  return (s) => fn(...args.map((a) => a(s)));
}

/** So sánh nối chuỗi `a < x < b` → 1 nếu mọi vế đúng, ngược lại 0. */
function buildRelation(node) {
  const operands = node.operands.map(build);
  const ops = node.ops;
  return (s) => {
    let prev = operands[0](s);
    for (let i = 0; i < ops.length; i++) {
      const curr = operands[i + 1](s);
      if (!compareValues(prev, ops[i], curr)) return 0;
      prev = curr;
    }
    return 1;
  };
}

function compareValues(a, op, b) {
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  switch (op) {
    case '=': return a === b;
    case '<': return a < b;
    case '>': return a > b;
    case '<=': return a <= b;
    case '>=': return a >= b;
    case '!=': return a !== b;
    default: return false;
  }
}

/**
 * Biên dịch thành hàm một biến — tiện cho các bộ lấy mẫu và tích phân.
 * @returns {(value: number) => number}
 */
export function compileUnary(ast, variable, allowedVars) {
  const fn = compile(ast, allowedVars);
  const scope = Object.create(null);
  return (value) => {
    scope[variable] = value;
    return fn(scope);
  };
}

/**
 * Biên dịch thành hàm hai biến (x, y) — dùng cho đường cong ẩn.
 * @returns {(x: number, y: number) => number}
 */
export function compileBinaryXY(ast, allowedVars) {
  const fn = compile(ast, allowedVars);
  const scope = Object.create(null);
  return (x, y) => {
    scope.x = x;
    scope.y = y;
    return fn(scope);
  };
}
