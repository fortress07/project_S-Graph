/**
 * analyze.js — Nhận diện loại đối tượng từ chuỗi người dùng nhập.
 *
 * Bản cũ chỉ nhận ra hình tròn nhờ một biểu thức chính quy viết cứng, nên
 * elip, hypebol hay bất kỳ phương trình ẩn nào khác đều không vẽ được. Ở đây
 * ta phân loại dựa trên cấu trúc cây cú pháp:
 *
 *   y = f(x)          → hàm số tường minh
 *   x = g(y)          → hàm ngược (kể cả đường thẳng đứng x = 2)
 *   r = f(θ)          → đường cong trong toạ độ cực
 *   (x(t), y(t))      → đường cong tham số
 *   (a, b)            → điểm
 *   F(x, y) = 0       → đường cong ẩn bất kỳ (tròn, elip, hypebol, ...)
 *   F(x, y) < 0       → miền nghiệm bất phương trình
 *
 * Kèm theo là ràng buộc miền tuỳ chọn kiểu `y = x^2 \{0 < x < 3\}`.
 */

import { latexToInfix } from './latex.js';
import { parse, ParseError, collectVariables, usesVariable } from './parser.js';
import { compile, compileUnary, compileBinaryXY } from './compile.js';
import {
  ExplicitCurve, InverseCurve, PolarCurve,
  ParametricCurve, ImplicitCurve, PointMarker,
} from './curve.js';

/**
 * @typedef {object} AnalyzeResult
 * @property {import('./curve.js').Curve | null} curve
 * @property {object | null} inequality
 * @property {string | null} error
 * @property {string} kindLabel
 */

/**
 * @param {string} latex Chuỗi LaTeX từ ô nhập
 * @param {{color?: string}} [options]
 * @returns {AnalyzeResult}
 */
export function analyze(latex, options = {}) {
  const raw = String(latex ?? '').trim();
  if (!raw) return empty();

  try {
    const infix = latexToInfix(raw);
    const { expression, restriction } = splitRestriction(infix);
    if (!expression.trim()) return empty();

    const ast = parse(expression);
    const restrictionAst = restriction ? parse(restriction) : null;

    return classify(ast, restrictionAst, raw, options);
  } catch (err) {
    if (err instanceof ParseError) {
      return { curve: null, inequality: null, error: err.message, kindLabel: '' };
    }
    return {
      curve: null,
      inequality: null,
      error: 'Biểu thức không hợp lệ',
      kindLabel: '',
    };
  }
}

function empty() {
  return { curve: null, inequality: null, error: null, kindLabel: '' };
}

/* ------------------------------------------------------------------ */
/* Tách ràng buộc miền `{...}`                                         */
/* ------------------------------------------------------------------ */

function splitRestriction(infix) {
  let depth = 0;
  for (let i = 0; i < infix.length; i++) {
    const ch = infix[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === '{' && depth === 0) {
      const close = infix.lastIndexOf('}');
      return {
        expression: infix.slice(0, i),
        restriction: infix.slice(i + 1, close > i ? close : undefined),
      };
    }
  }
  return { expression: infix, restriction: null };
}

/* ------------------------------------------------------------------ */
/* Phân loại                                                           */
/* ------------------------------------------------------------------ */

function classify(ast, restrictionAst, latex, options) {
  const color = options.color ?? '#5b8def';

  if (ast.type === 'tuple') return buildTuple(ast, restrictionAst, latex, color);

  if (ast.type === 'relation') {
    const isEquation = ast.ops.length === 1 && ast.ops[0] === '=';
    if (!isEquation) return buildInequality(ast, restrictionAst, latex, color);
    return buildEquation(ast.operands[0], ast.operands[1], restrictionAst, latex, color);
  }

  // Biểu thức trần: mặc định hiểu là y = f(x).
  const variables = collectVariables(ast);
  if (variables.has('theta')) {
    return buildPolar(ast, restrictionAst, latex, color);
  }
  if (variables.has('y')) {
    // Có cả x lẫn y mà không có dấu bằng → hiểu là đường mức F(x, y) = 0.
    return buildImplicit(ast, restrictionAst, latex, color);
  }
  return buildExplicit(ast, restrictionAst, latex, color);
}

const isVariable = (node, name) => node.type === 'var' && node.name === name;

function buildEquation(lhs, rhs, restrictionAst, latex, color) {
  // y = f(x)
  if (isVariable(lhs, 'y') && !usesVariable(rhs, 'y')) {
    return buildExplicit(rhs, restrictionAst, latex, color);
  }
  if (isVariable(rhs, 'y') && !usesVariable(lhs, 'y')) {
    return buildExplicit(lhs, restrictionAst, latex, color);
  }

  // x = g(y) — bao gồm cả đường thẳng đứng x = 2
  if (isVariable(lhs, 'x') && !usesVariable(rhs, 'x')) {
    return buildInverse(rhs, restrictionAst, latex, color);
  }
  if (isVariable(rhs, 'x') && !usesVariable(lhs, 'x')) {
    return buildInverse(lhs, restrictionAst, latex, color);
  }

  // r = f(θ)
  if (isVariable(lhs, 'r')) return buildPolar(rhs, restrictionAst, latex, color);
  if (isVariable(rhs, 'r')) return buildPolar(lhs, restrictionAst, latex, color);

  // Còn lại: đường cong ẩn F = lhs − rhs = 0
  return buildImplicit(
    { type: 'binary', op: '-', left: lhs, right: rhs },
    restrictionAst, latex, color
  );
}

function buildExplicit(ast, restrictionAst, latex, color) {
  const f = compileUnary(ast, 'x', ['x']);
  const domain = compileDomain(restrictionAst, ['x']);
  return {
    curve: new ExplicitCurve({ f, latex, color, domain, exprLatex: exprLatexOf(latex), label: labelFor(latex, 'y') }),
    inequality: null,
    error: null,
    kindLabel: 'Hàm số',
  };
}

function buildInverse(ast, restrictionAst, latex, color) {
  const g = compileUnary(ast, 'y', ['y']);
  const domain = compileDomain(restrictionAst, ['y']);
  return {
    curve: new InverseCurve({ g, latex, color, domain, exprLatex: exprLatexOf(latex), label: labelFor(latex, 'x') }),
    inequality: null,
    error: null,
    kindLabel: 'Hàm theo y',
  };
}

function buildPolar(ast, restrictionAst, latex, color) {
  const scope = Object.create(null);
  const compiled = compile(ast, ['theta', 't']);
  const f = (theta) => {
    scope.theta = theta;
    scope.t = theta;
    return compiled(scope);
  };

  const range = extractRange(restrictionAst, ['theta', 't']);
  const domain = range ? null : compileDomain(restrictionAst, ['theta', 't']);

  return {
    curve: new PolarCurve({
      f, latex, color, domain, exprLatex: exprLatexOf(latex),
      thetaMin: range ? range[0] : 0,
      thetaMax: range ? range[1] : 2 * Math.PI,
      label: labelFor(latex, 'r'),
    }),
    inequality: null,
    error: null,
    kindLabel: 'Toạ độ cực',
  };
}

function buildImplicit(ast, restrictionAst, latex, color) {
  const F = compileBinaryXY(ast, ['x', 'y']);
  const domain = compileDomain(restrictionAst, ['x', 'y']);
  return {
    curve: new ImplicitCurve({ F, latex, color, domain, exprLatex: exprLatexOf(latex), label: latex }),
    inequality: null,
    error: null,
    kindLabel: 'Đường cong ẩn',
  };
}

function buildTuple(ast, restrictionAst, latex, color) {
  if (ast.items.length !== 2) {
    return { curve: null, inequality: null, error: 'Toạ độ cần đúng 2 thành phần', kindLabel: '' };
  }

  const variables = new Set([
    ...collectVariables(ast.items[0]),
    ...collectVariables(ast.items[1]),
  ]);

  // Không chứa biến → đây là một điểm cố định.
  if (variables.size === 0) {
    const x = compile(ast.items[0], [])({});
    const y = compile(ast.items[1], [])({});
    return {
      curve: new PointMarker({ x, y, latex, color, label: latex }),
      inequality: null,
      error: null,
      kindLabel: 'Điểm',
    };
  }

  const fx = compileUnary(ast.items[0], 't', ['t']);
  const fy = compileUnary(ast.items[1], 't', ['t']);
  const range = extractRange(restrictionAst, ['t']);
  const domain = range ? null : compileDomain(restrictionAst, ['t']);

  return {
    curve: new ParametricCurve({
      fx, fy, latex, color, domain, exprLatex: exprLatexOf(latex),
      tMin: range ? range[0] : 0,
      tMax: range ? range[1] : 2 * Math.PI,
      label: latex,
    }),
    inequality: null,
    error: null,
    kindLabel: 'Tham số',
  };
}

function buildInequality(ast, restrictionAst, latex, color) {
  const test = compileBinaryXY(ast, ['x', 'y']);
  const domain = compileDomain(restrictionAst, ['x', 'y']);
  const strict = ast.ops.some((op) => op === '<' || op === '>');

  // Đường biên: thay quan hệ bằng dấu bằng để vẽ nét viền.
  let boundary = null;
  if (ast.ops.length === 1) {
    const result = buildEquation(ast.operands[0], ast.operands[1], restrictionAst, latex, color);
    boundary = result.curve;
    if (boundary) boundary.dashed = strict;
  }

  return {
    curve: boundary,
    inequality: {
      test: (x, y) => test(x, y) !== 0,
      strict,
      domain,
      color,
    },
    error: null,
    kindLabel: 'Miền nghiệm',
  };
}

/* ------------------------------------------------------------------ */
/* Ràng buộc miền                                                      */
/* ------------------------------------------------------------------ */

function compileDomain(restrictionAst, allowedVars) {
  if (!restrictionAst) return null;
  try {
    return compile(restrictionAst, allowedVars);
  } catch {
    return null;
  }
}

/**
 * Ràng buộc dạng `a < t < b` với a, b là hằng số thì được hiểu là *khoảng chạy*
 * của tham số, chứ không phải bộ lọc — nhờ vậy `(\cos t, \sin t)\{0<t<\pi\}`
 * vẽ đúng nửa đường tròn.
 */
function extractRange(restrictionAst, variableNames) {
  if (!restrictionAst || restrictionAst.type !== 'relation') return null;
  if (restrictionAst.ops.length !== 2) return null;
  const [lo, mid, hi] = restrictionAst.operands;
  if (mid.type !== 'var' || !variableNames.includes(mid.name)) return null;

  try {
    const a = compile(lo, [])({});
    const b = compile(hi, [])({});
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
    return [a, b];
  } catch {
    return null;
  }
}

/** Nhãn hiển thị gọn: thêm `y =` nếu người dùng chỉ gõ vế phải. */
function labelFor(latex, prefix) {
  return /^\s*[a-zA-Z]\s*=/.test(latex) ? latex : `${prefix}=${latex}`;
}

/** Chỉ giữ vế phải, để dựng công thức tích phân hiển thị. */
function exprLatexOf(latex) {
  return latex.replace(/^\s*[a-zA-Z]\s*=\s*/, '').trim();
}
