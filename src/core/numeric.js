/**
 * numeric.js — Các thuật toán số dùng chung.
 *
 * Tích phân dùng Gauss–Kronrod G7–K15 thích nghi thay vì Simpson cố định.
 * Hai lợi thế quan trọng cho bài toán diện tích:
 *   1. Không bao giờ lấy mẫu tại hai đầu mút, nên `√(1−x²)` trên [−1, 1] hay
 *      `ln x` trên (0, 1] tích phân được mà không cần "vá" NaN thành 0.
 *   2. Có ước lượng sai số nội tại để chia nhỏ đúng chỗ hàm biến thiên mạnh.
 */

/* Nút và trọng số chuẩn của quy tắc Gauss–Kronrod 15 điểm (QUADPACK dqk15). */
const XGK = [
  0.991455371120813, 0.949107912342759, 0.864864423359769, 0.741531185599394,
  0.586087235467691, 0.405845151377397, 0.207784955007898, 0.0,
];
const WGK = [
  0.022935322010529, 0.063092092629979, 0.104790010322250, 0.140653259715525,
  0.169004726639267, 0.190350578064785, 0.204432940075298, 0.209482141084728,
];
/* Trọng số Gauss 7 điểm, ứng với XGK[1], XGK[3], XGK[5] và tâm XGK[7]. */
const WG = [0.129484966168870, 0.279705391489277, 0.381830050505119, 0.417959183673469];

/**
 * Một lần áp dụng quy tắc G7–K15 trên đoạn [a, b].
 * @returns {{value: number, error: number, nanCount: number}}
 */
function kronrod15(f, a, b) {
  const center = 0.5 * (a + b);
  const halfLength = 0.5 * (b - a);
  let nanCount = 0;

  const sample = (x) => {
    const v = f(x);
    if (!Number.isFinite(v)) { nanCount++; return 0; }
    return v;
  };

  const fCenter = sample(center);
  let resultK = WGK[7] * fCenter;
  let resultG = WG[3] * fCenter;

  for (let i = 0; i < 7; i++) {
    const dx = halfLength * XGK[i];
    const pair = sample(center - dx) + sample(center + dx);
    resultK += WGK[i] * pair;
    if (i % 2 === 1) resultG += WG[(i - 1) / 2] * pair;
  }

  resultK *= halfLength;
  resultG *= halfLength;
  return { value: resultK, error: Math.abs(resultK - resultG), nanCount };
}

/**
 * Tích phân xác định thích nghi.
 * @param {(x: number) => number} f
 * @param {number} a
 * @param {number} b
 * @param {{tol?: number, maxDepth?: number}} [options]
 * @returns {{value: number, error: number, nanCount: number}}
 */
export function integrate(f, a, b, options = {}) {
  const { tol = 1e-11, maxDepth = 24 } = options;
  if (a === b) return { value: 0, error: 0, nanCount: 0 };

  const scale = Math.abs(b - a);
  let totalNaN = 0;

  const recurse = (lo, hi, depth, allowance) => {
    const whole = kronrod15(f, lo, hi);
    totalNaN += whole.nanCount;
    if (whole.error <= allowance || depth >= maxDepth) return whole.value;

    const mid = 0.5 * (lo + hi);
    return recurse(lo, mid, depth + 1, allowance / 2) +
           recurse(mid, hi, depth + 1, allowance / 2);
  };

  const value = recurse(a, b, 0, Math.max(tol * Math.max(1, scale), 1e-14));
  return { value, error: 0, nanCount: totalNaN };
}

/**
 * Tìm nghiệm bằng chia đôi kết hợp cát tuyến (Brent rút gọn).
 * Yêu cầu f(a) và f(b) trái dấu.
 */
export function bisect(f, a, b, iterations = 100) {
  let fa = f(a);
  let fb = f(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return null;
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) return null;

  for (let i = 0; i < iterations; i++) {
    // Xen kẽ cát tuyến (hội tụ nhanh) và chia đôi (bảo đảm co khoảng).
    let mid;
    if (i % 3 === 2 && fa !== fb) {
      mid = a - fa * (b - a) / (fb - fa);
      if (!(mid > Math.min(a, b) && mid < Math.max(a, b))) mid = 0.5 * (a + b);
    } else {
      mid = 0.5 * (a + b);
    }

    const fm = f(mid);
    if (fm === 0 || Math.abs(b - a) < 1e-15) return mid;
    if (!Number.isFinite(fm)) return 0.5 * (a + b);

    if (fa * fm < 0) { b = mid; fb = fm; }
    else { a = mid; fa = fm; }
  }
  return 0.5 * (a + b);
}

/** Đạo hàm số bậc 4 (sai phân trung tâm 5 điểm). */
export function derivative(f, x, h) {
  const step = h ?? Math.max(1e-7, Math.abs(x) * 1e-7);
  const a = f(x - 2 * step);
  const b = f(x - step);
  const c = f(x + step);
  const d = f(x + 2 * step);
  if (Number.isFinite(a) && Number.isFinite(d)) {
    return (a - 8 * b + 8 * c - d) / (12 * step);
  }
  // Gần biên tập xác định thì lùi về sai phân trung tâm 2 điểm.
  if (Number.isFinite(b) && Number.isFinite(c)) return (c - b) / (2 * step);
  const f0 = f(x);
  if (Number.isFinite(c)) return (c - f0) / step;
  if (Number.isFinite(b)) return (f0 - b) / step;
  return NaN;
}

/** Gradient số của hàm hai biến. */
export function gradient2(F, x, y, h = 1e-6) {
  const gx = (F(x + h, y) - F(x - h, y)) / (2 * h);
  const gy = (F(x, y + h) - F(x, y - h)) / (2 * h);
  return [gx, gy];
}

/**
 * Chiếu một điểm lên đường cong ẩn F(x, y) = 0 bằng lặp Newton theo hướng
 * gradient. Vài vòng lặp là đủ đưa sai số về mức chính xác máy.
 */
export function projectOntoImplicit(F, x, y, iterations = 6) {
  let px = x;
  let py = y;
  for (let i = 0; i < iterations; i++) {
    const value = F(px, py);
    if (!Number.isFinite(value)) return [px, py];
    if (Math.abs(value) < 1e-14) break;
    const [gx, gy] = gradient2(F, px, py);
    const normSq = gx * gx + gy * gy;
    if (!Number.isFinite(normSq) || normSq < 1e-24) break;
    px -= value * gx / normSq;
    py -= value * gy / normSq;
  }
  return [px, py];
}

/**
 * Tinh chỉnh giao điểm của hai đường cong ẩn bằng Newton hai chiều.
 * Đây là lý do mọi loại đường cong đều phải cung cấp hàm dư `residual(x, y)`:
 * chỉ cần thế là tìm được giao điểm chính xác tới cỡ sai số máy, không phụ
 * thuộc việc đường cong ở dạng tường minh, ẩn hay cực.
 */
export function refineIntersection(F, G, x0, y0, iterations = 12) {
  let x = x0;
  let y = y0;
  for (let i = 0; i < iterations; i++) {
    const f = F(x, y);
    const g = G(x, y);
    if (!Number.isFinite(f) || !Number.isFinite(g)) break;
    if (Math.abs(f) < 1e-14 && Math.abs(g) < 1e-14) break;

    const [fx, fy] = gradient2(F, x, y);
    const [gx, gy] = gradient2(G, x, y);
    const det = fx * gy - fy * gx;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-14) break;

    const dx = (f * gy - g * fy) / det;
    const dy = (g * fx - f * gx) / det;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) break;

    x -= dx;
    y -= dy;
    if (Math.abs(dx) + Math.abs(dy) < 1e-15) break;
  }
  return [x, y];
}

/** Tìm cực trị địa phương của hàm một biến trên [a, b] bằng chia ba. */
export function ternarySearch(f, a, b, findMaximum, iterations = 90) {
  let lo = a;
  let hi = b;
  for (let i = 0; i < iterations; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    const f1 = f(m1);
    const f2 = f(m2);
    if (!Number.isFinite(f1) || !Number.isFinite(f2)) break;
    if (findMaximum ? f1 < f2 : f1 > f2) lo = m1;
    else hi = m2;
  }
  return 0.5 * (lo + hi);
}

/** Kẹp giá trị vào đoạn [lo, hi]. */
export function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

/**
 * Làm tròn để hiển thị: cắt bỏ nhiễu số học nhưng giữ đủ chữ số ý nghĩa.
 * `0.16666666666712` → `0.1666667`
 */
export function formatNumber(value, significantDigits = 7) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const rounded = Number(value.toPrecision(significantDigits));
  if (Math.abs(rounded) >= 1e7 || Math.abs(rounded) < 1e-5) {
    return rounded.toExponential(4).replace('e', '×10^');
  }
  return String(rounded);
}

/**
 * Thử nhận diện một số thực dưới dạng phân số hoặc bội của π, để hiển thị
 * kết quả đẹp như "1/6" hay "π/2" bên cạnh giá trị thập phân.
 */
export function recognizeExact(value, tol = 1e-9) {
  if (!Number.isFinite(value) || value === 0) return null;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  for (let q = 1; q <= 64; q++) {
    const p = abs * q;
    if (Math.abs(p - Math.round(p)) < tol * Math.max(1, p)) {
      const num = Math.round(p);
      if (q === 1) return null;               // số nguyên: không cần chú thích
      if (num > 9999) break;
      return `${sign}${num}/${q}`;
    }
  }

  const overPi = abs / Math.PI;
  for (let q = 1; q <= 32; q++) {
    const p = overPi * q;
    if (Math.abs(p - Math.round(p)) < tol * Math.max(1, p)) {
      const num = Math.round(p);
      if (num === 0 || num > 999) break;
      const numerator = num === 1 ? 'π' : `${num}π`;
      return q === 1 ? `${sign}${numerator}` : `${sign}${numerator}/${q}`;
    }
  }
  return null;
}
