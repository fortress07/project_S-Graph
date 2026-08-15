/**
 * mathlib.js — Bảng hằng số và hàm số của ngôn ngữ biểu thức.
 *
 * Mọi hàm ở đây trả về `NaN` khi đối số nằm ngoài tập xác định (thay vì ném lỗi
 * hoặc trả về số phức). Bộ vẽ đồ thị dựa vào quy ước đó để ngắt nét vẽ đúng chỗ.
 */

/** Hằng số toán học dùng được trong biểu thức. */
export const CONSTANTS = Object.freeze({
  pi: Math.PI,
  tau: 2 * Math.PI,
  e: Math.E,
  phi: (1 + Math.sqrt(5)) / 2,
  infty: Infinity,
  infinity: Infinity,
});

/** Tên được coi là biến chứ không phải hằng số. */
export const VARIABLES = Object.freeze(['x', 'y', 't', 'theta', 'r']);

const EPS = 1e-12;

/**
 * Luỹ thừa "thân thiện với người học": cho phép căn bậc lẻ của số âm.
 * `(-8)^(1/3)` trả về -2 thay vì NaN như `Math.pow`.
 */
export function pow(a, b) {
  if (a >= 0 || Number.isInteger(b)) return Math.pow(a, b);
  const q = rationalDenominator(b);
  if (q !== null && q % 2 === 1) return -Math.pow(-a, b);
  return NaN;
}

/**
 * Tìm mẫu số q (<= 64) nếu `value` xấp xỉ một phân số p/q tối giản.
 * Dùng để quyết định `(-8)^(1/3)` có xác định hay không.
 */
function rationalDenominator(value) {
  for (let q = 1; q <= 64; q++) {
    const p = value * q;
    if (Math.abs(p - Math.round(p)) < 1e-10) {
      const g = gcdInt(Math.abs(Math.round(p)), q);
      return q / (g || 1);
    }
  }
  return null;
}

function gcdInt(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Căn bậc n, xử lý được căn bậc lẻ của số âm. */
export function nthroot(x, n) {
  if (!Number.isFinite(n) || n === 0) return NaN;
  if (x < 0) {
    if (Number.isInteger(n) && Math.abs(n) % 2 === 1) return -Math.pow(-x, 1 / n);
    return NaN;
  }
  return Math.pow(x, 1 / n);
}

/** Hàm Gamma (Lanczos) — nền tảng cho giai thừa của số thực. */
export function gamma(z) {
  if (Number.isInteger(z) && z <= 0) return NaN;
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  z -= 1;
  let a = c[0];
  const tt = z + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (z + i);
  return Math.sqrt(2 * Math.PI) * Math.pow(tt, z + 0.5) * Math.exp(-tt) * a;
}

export function factorial(n) {
  if (n < 0 && Number.isInteger(n)) return NaN;
  if (Number.isInteger(n) && n <= 170) {
    let acc = 1;
    for (let i = 2; i <= n; i++) acc *= i;
    return acc;
  }
  return gamma(n + 1);
}

/** Chia lấy dư theo quy ước toán học (kết quả cùng dấu với số chia). */
function mod(a, b) {
  if (b === 0) return NaN;
  return a - Math.floor(a / b) * b;
}

function guardDomain(fn, isValid) {
  return (x) => (isValid(x) ? fn(x) : NaN);
}

/**
 * Bảng hàm số. Mỗi mục gồm `fn` và số lượng đối số cho phép (`arity`);
 * `arity: -1` nghĩa là nhận số lượng đối số bất kỳ.
 */
export const FUNCTIONS = Object.freeze({
  // --- Lượng giác ---
  sin: { fn: Math.sin, arity: 1 },
  cos: { fn: Math.cos, arity: 1 },
  tan: { fn: Math.tan, arity: 1 },
  cot: { fn: (x) => 1 / Math.tan(x), arity: 1 },
  sec: { fn: (x) => 1 / Math.cos(x), arity: 1 },
  csc: { fn: (x) => 1 / Math.sin(x), arity: 1 },

  // --- Lượng giác ngược ---
  arcsin: { fn: guardDomain(Math.asin, (x) => x >= -1 && x <= 1), arity: 1 },
  arccos: { fn: guardDomain(Math.acos, (x) => x >= -1 && x <= 1), arity: 1 },
  arctan: { fn: Math.atan, arity: 1 },
  arccot: { fn: (x) => Math.PI / 2 - Math.atan(x), arity: 1 },
  arcsec: { fn: guardDomain((x) => Math.acos(1 / x), (x) => Math.abs(x) >= 1), arity: 1 },
  arccsc: { fn: guardDomain((x) => Math.asin(1 / x), (x) => Math.abs(x) >= 1), arity: 1 },

  // --- Hyperbolic ---
  sinh: { fn: Math.sinh, arity: 1 },
  cosh: { fn: Math.cosh, arity: 1 },
  tanh: { fn: Math.tanh, arity: 1 },
  coth: { fn: (x) => 1 / Math.tanh(x), arity: 1 },
  arcsinh: { fn: Math.asinh, arity: 1 },
  arccosh: { fn: guardDomain(Math.acosh, (x) => x >= 1), arity: 1 },
  arctanh: { fn: guardDomain(Math.atanh, (x) => x > -1 && x < 1), arity: 1 },

  // --- Luỹ thừa & logarit ---
  // Quy ước Việt Nam: log = log cơ số 10, ln = log tự nhiên.
  ln: { fn: guardDomain(Math.log, (x) => x > 0), arity: 1 },
  log: { fn: guardDomain(Math.log10, (x) => x > 0), arity: 1 },
  logb: { fn: (x, b) => (x > 0 && b > 0 && b !== 1 ? Math.log(x) / Math.log(b) : NaN), arity: 2 },
  exp: { fn: Math.exp, arity: 1 },
  sqrt: { fn: guardDomain(Math.sqrt, (x) => x >= 0), arity: 1 },
  cbrt: { fn: Math.cbrt, arity: 1 },
  nthroot: { fn: nthroot, arity: 2 },

  // --- Làm tròn & dấu ---
  abs: { fn: Math.abs, arity: 1 },
  floor: { fn: Math.floor, arity: 1 },
  ceil: { fn: Math.ceil, arity: 1 },
  round: { fn: Math.round, arity: 1 },
  sign: { fn: Math.sign, arity: 1 },
  trunc: { fn: Math.trunc, arity: 1 },

  // --- Nhiều đối số ---
  min: { fn: Math.min, arity: -1 },
  max: { fn: Math.max, arity: -1 },
  hypot: { fn: Math.hypot, arity: -1 },
  mod: { fn: mod, arity: 2 },
  gcd: { fn: (...a) => a.map(Math.round).reduce(gcdInt), arity: -1 },
  lcm: { fn: (...a) => a.map(Math.round).reduce((x, y) => Math.abs(x * y) / (gcdInt(x, y) || 1)), arity: -1 },
  atan2: { fn: Math.atan2, arity: 2 },

  // --- Tổ hợp ---
  factorial: { fn: factorial, arity: 1 },
  gamma: { fn: gamma, arity: 1 },
  binom: { fn: (n, k) => factorial(n) / (factorial(k) * factorial(n - k)), arity: 2 },
});

/** Ánh xạ `sin^{-1}` → `arcsin` cho ký hiệu hàm ngược. */
export const INVERSE_NAMES = Object.freeze({
  sin: 'arcsin', cos: 'arccos', tan: 'arctan',
  cot: 'arccot', sec: 'arcsec', csc: 'arccsc',
  sinh: 'arcsinh', cosh: 'arccosh', tanh: 'arctanh',
});

export function isFunctionName(name) {
  return Object.prototype.hasOwnProperty.call(FUNCTIONS, name);
}

export function isConstantName(name) {
  return Object.prototype.hasOwnProperty.call(CONSTANTS, name);
}

/** Số gần bằng nhau trong phạm vi sai số cho phép. */
export function nearlyEqual(a, b, tol = EPS) {
  return Math.abs(a - b) <= tol;
}
