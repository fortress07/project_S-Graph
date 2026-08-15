/**
 * parser.js — Tách token và phân tích cú pháp chuỗi trung tố thành cây AST.
 *
 * Bộ phân tích kiểu Pratt, xử lý đúng:
 *   - Phép nhân ngầm:      `2x`, `3\pi`, `(x+1)(x-2)`, `2\sin x`
 *   - Hàm không ngoặc:     `sin x^2` → sin(x²);  `sin x cos x` → sin(x)·cos(x)
 *   - Luỹ thừa của hàm:    `sin^2 x` → (sin x)²
 *   - Logarit có cơ số:    `log[2] x` → logb(x, 2)
 *   - So sánh nối chuỗi:   `0 < x < 3`
 *   - Giai thừa hậu tố:    `5!`
 */

import { FUNCTIONS, CONSTANTS, VARIABLES, isFunctionName, isConstantName } from './mathlib.js';

const RELATIONS = new Set(['=', '<', '>', '<=', '>=', '!=']);

export class ParseError extends Error {
  constructor(message, position = -1) {
    super(message);
    this.name = 'ParseError';
    this.position = position;
  }
}

/* ------------------------------------------------------------------ */
/* Tách token                                                          */
/* ------------------------------------------------------------------ */

const TOKEN = {
  NUM: 'num', NAME: 'name', OP: 'op',
  LPAREN: '(', RPAREN: ')',
  LBRACKET: '[', RBRACKET: ']',
  COMMA: ',', END: 'end',
};

export function tokenize(input) {
  const src = String(input ?? '');
  const tokens = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (/\s/.test(ch)) { i++; continue; }

    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^[0-9]*\.?[0-9]+/.exec(src.slice(i));
      tokens.push({ type: TOKEN.NUM, value: parseFloat(m[0]), pos: i });
      i += m[0].length;
      continue;
    }

    if (/[a-zA-Z]/.test(ch)) {
      const m = /^[a-zA-Z]+/.exec(src.slice(i));
      // Tên dài nhất khớp với một hàm/hằng đã biết được ưu tiên, phần còn lại
      // tách thành các biến riêng: `xsinx` → x · sin(x).
      const word = m[0];
      const taken = longestKnownPrefix(word);
      tokens.push({ type: TOKEN.NAME, value: taken, pos: i });
      i += taken.length;
      continue;
    }

    if (ch === '(') { tokens.push({ type: TOKEN.LPAREN, pos: i++ }); continue; }
    if (ch === ')') { tokens.push({ type: TOKEN.RPAREN, pos: i++ }); continue; }
    if (ch === '[') { tokens.push({ type: TOKEN.LBRACKET, pos: i++ }); continue; }
    if (ch === ']') { tokens.push({ type: TOKEN.RBRACKET, pos: i++ }); continue; }
    if (ch === ',') { tokens.push({ type: TOKEN.COMMA, pos: i++ }); continue; }

    const two = src.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '!=') {
      tokens.push({ type: TOKEN.OP, value: two, pos: i });
      i += 2;
      continue;
    }

    if ('+-*/^=<>!°'.includes(ch)) {
      tokens.push({ type: TOKEN.OP, value: ch, pos: i });
      i++;
      continue;
    }

    throw new ParseError(`Ký tự không hợp lệ: “${ch}”`, i);
  }

  tokens.push({ type: TOKEN.END, pos: src.length });
  return tokens;
}

/**
 * Cắt tiền tố dài nhất của `word` trùng với một tên đã biết.
 * Nhờ vậy `sinx` đọc thành `sin` + `x`, còn `xy` thành `x` + `y`.
 */
function longestKnownPrefix(word) {
  const lower = word.toLowerCase();
  for (let len = word.length; len >= 2; len--) {
    const candidate = lower.slice(0, len);
    if (isFunctionName(candidate) || isConstantName(candidate) || VARIABLES.includes(candidate)) {
      return word.slice(0, len);
    }
  }
  return word[0];
}

/* ------------------------------------------------------------------ */
/* Phân tích cú pháp                                                   */
/* ------------------------------------------------------------------ */

export function parse(input) {
  const parser = new Parser(tokenize(input));
  const node = parser.parseRelation();
  parser.expect(TOKEN.END, 'Còn ký tự thừa ở cuối biểu thức');
  return node;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  peek(offset = 0) { return this.tokens[this.index + offset]; }
  next() { return this.tokens[this.index++]; }

  expect(type, message) {
    const tok = this.peek();
    if (tok.type !== type) throw new ParseError(message, tok.pos);
    return this.next();
  }

  isOp(value, offset = 0) {
    const tok = this.peek(offset);
    return tok.type === TOKEN.OP && tok.value === value;
  }

  /** Mức thấp nhất: quan hệ so sánh, cho phép nối chuỗi `a < x < b`. */
  parseRelation() {
    const operands = [this.parseSum()];
    const ops = [];
    while (this.peek().type === TOKEN.OP && RELATIONS.has(this.peek().value)) {
      ops.push(this.next().value);
      operands.push(this.parseSum());
    }
    if (ops.length === 0) return operands[0];
    return { type: 'relation', ops, operands };
  }

  parseSum() {
    let left = this.parseProduct();
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.next().value;
      const right = this.parseProduct();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  parseProduct() {
    let left = this.parseUnary();
    for (;;) {
      if (this.isOp('*') || this.isOp('/')) {
        const op = this.next().value;
        left = { type: 'binary', op, left, right: this.parseUnary() };
      } else if (this.startsFactor(this.peek(), true)) {
        // Nhân ngầm: `2x`, `(x+1)(x-2)`, `2sin x`
        left = { type: 'binary', op: '*', left, right: this.parseUnary() };
      } else {
        return left;
      }
    }
  }

  parseUnary() {
    if (this.isOp('-')) {
      this.next();
      return { type: 'unary', op: '-', arg: this.parseUnary() };
    }
    if (this.isOp('+')) {
      this.next();
      return this.parseUnary();
    }
    return this.parsePower();
  }

  parsePower() {
    const base = this.parsePostfix();
    if (this.isOp('^')) {
      this.next();
      // Luỹ thừa kết hợp phải, và số mũ có thể mang dấu âm: `2^-x`
      const exponent = this.isOp('-') || this.isOp('+') ? this.parseUnary() : this.parsePower();
      return { type: 'binary', op: '^', left: base, right: exponent };
    }
    return base;
  }

  parsePostfix() {
    let node = this.parsePrimary();
    for (;;) {
      if (this.isOp('!')) {
        this.next();
        node = { type: 'call', name: 'factorial', args: [node] };
      } else if (this.isOp('°')) {
        this.next();
        node = {
          type: 'binary', op: '*',
          left: node,
          right: { type: 'num', value: Math.PI / 180 },
        };
      } else {
        return node;
      }
    }
  }

  parsePrimary() {
    const tok = this.peek();

    if (tok.type === TOKEN.NUM) {
      this.next();
      return { type: 'num', value: tok.value };
    }

    if (tok.type === TOKEN.LPAREN) {
      this.next();
      const first = this.parseRelation();
      // `(x(t), y(t))` là bộ toạ độ — dùng cho đường tham số và điểm rời rạc.
      if (this.peek().type === TOKEN.COMMA) {
        const items = [first];
        while (this.peek().type === TOKEN.COMMA) {
          this.next();
          items.push(this.parseRelation());
        }
        this.expect(TOKEN.RPAREN, 'Thiếu dấu “)”');
        return { type: 'tuple', items };
      }
      this.expect(TOKEN.RPAREN, 'Thiếu dấu “)”');
      return first;
    }

    if (tok.type === TOKEN.NAME) {
      return this.parseName();
    }

    throw new ParseError('Biểu thức chưa hoàn chỉnh', tok.pos);
  }

  parseName() {
    const tok = this.next();
    const raw = tok.value;
    const name = raw.toLowerCase();

    // Chỉ số dưới: `log[2]` là cơ số, `x[1]` là tên biến x_1.
    let subscript = null;
    if (this.peek().type === TOKEN.LBRACKET) {
      this.next();
      subscript = this.parseRelation();
      this.expect(TOKEN.RBRACKET, 'Thiếu dấu “]”');
    }

    if (isFunctionName(name)) {
      return this.parseCall(name, subscript, tok.pos);
    }

    if (subscript !== null) {
      const label = subscript.type === 'num' ? String(subscript.value) : '?';
      return { type: 'var', name: `${name}_${label}`, pos: tok.pos };
    }

    if (isConstantName(name)) {
      return { type: 'const', name, value: CONSTANTS[name] };
    }

    return { type: 'var', name, pos: tok.pos };
  }

  /** Phân tích lời gọi hàm, có hoặc không có ngoặc. */
  parseCall(name, subscript, pos) {
    // `sin^2 x` — số mũ đứng ngay sau tên hàm thì áp lên *giá trị* của hàm.
    let outerExponent = null;
    if (this.isOp('^')) {
      this.next();
      outerExponent = this.isOp('-') ? this.parseUnary() : this.parsePower();
    }

    let args;
    if (this.peek().type === TOKEN.LPAREN) {
      this.next();
      args = [];
      if (this.peek().type !== TOKEN.RPAREN) {
        args.push(this.parseRelation());
        while (this.peek().type === TOKEN.COMMA) {
          this.next();
          args.push(this.parseRelation());
        }
      }
      this.expect(TOKEN.RPAREN, `Thiếu dấu “)” sau ${name}`);
    } else {
      // Không ngoặc: lấy chuỗi thừa số liền sau, dừng khi gặp toán tử
      // hoặc một tên hàm khác. `sin x cos x` = sin(x)·cos(x).
      args = [this.parseArgumentChain(name, pos)];
    }

    // `log[b] x` → logb(x, b)
    let node;
    if (name === 'log' && subscript !== null) {
      node = { type: 'call', name: 'logb', args: [args[0], subscript] };
    } else {
      node = { type: 'call', name, args };
    }

    checkArity(node, pos);

    if (outerExponent) {
      return { type: 'binary', op: '^', left: node, right: outerExponent };
    }
    return node;
  }

  parseArgumentChain(fnName, pos) {
    if (!this.startsFactor(this.peek(), true)) {
      throw new ParseError(`Hàm ${fnName} còn thiếu đối số`, pos);
    }
    let node = this.parseUnary();
    while (this.startsFactor(this.peek(), false)) {
      node = { type: 'binary', op: '*', left: node, right: this.parseUnary() };
    }
    return node;
  }

  /**
   * Token này có thể bắt đầu một thừa số hay không?
   * @param {boolean} allowFunctions Cho phép tên hàm mở đầu thừa số. Đặt `false`
   *   khi đang gom đối số của một hàm không ngoặc, để `sin x cos x` tách đúng.
   */
  startsFactor(tok, allowFunctions) {
    if (tok.type === TOKEN.NUM || tok.type === TOKEN.LPAREN) return true;
    if (tok.type === TOKEN.NAME) {
      if (!allowFunctions && isFunctionName(tok.value.toLowerCase())) return false;
      return true;
    }
    return false;
  }
}

function checkArity(node, pos) {
  const spec = FUNCTIONS[node.name];
  if (!spec) return;
  if (spec.arity !== -1 && node.args.length !== spec.arity) {
    throw new ParseError(
      `Hàm ${node.name} cần ${spec.arity} đối số, đang nhận ${node.args.length}`,
      pos
    );
  }
}

/* ------------------------------------------------------------------ */
/* Tiện ích duyệt cây                                                  */
/* ------------------------------------------------------------------ */

/** Duyệt mọi nút của cây AST. */
export function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  if (node.args) node.args.forEach((a) => walk(a, visit));
  if (node.items) node.items.forEach((a) => walk(a, visit));
  if (node.operands) node.operands.forEach((a) => walk(a, visit));
  if (node.left) walk(node.left, visit);
  if (node.right) walk(node.right, visit);
  if (node.arg) walk(node.arg, visit);
}

/** Tập hợp tên biến xuất hiện trong cây. */
export function collectVariables(node) {
  const names = new Set();
  walk(node, (n) => { if (n.type === 'var') names.add(n.name); });
  return names;
}

/** Cây có chứa biến `name` hay không. */
export function usesVariable(node, name) {
  return collectVariables(node).has(name);
}
