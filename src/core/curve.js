/**
 * curve.js — Mô hình đường cong thống nhất.
 *
 * Mọi loại đường cong (tường minh, ẩn theo x, cực, tham số, ẩn tổng quát) đều
 * cài đặt cùng một giao diện, nhờ đó bộ tìm giao điểm và bộ tính diện tích chỉ
 * cần viết một lần:
 *
 *   branches(view)        → danh sách nhánh liên tục, mỗi nhánh là một đường gấp
 *                           khúc kèm mảng tham số tương ứng
 *   residual(x, y)        → F(x, y) triệt tiêu trên đường cong (dùng Newton)
 *   pointAt(branch, t)    → toạ độ của tham số t
 *   arcIntegral(b, t0, t1)→ đóng góp ∮ −y dx của cung, dùng cho định lý Green
 *
 * Bản cũ phải viết riêng từng nhánh mã cho hàm số, hàm ngược, đường cực và
 * hình tròn — và nhánh đường cực chứa lỗi biến chưa khai báo.
 */

import { derivative, integrate, projectOntoImplicit, clamp } from './numeric.js';

/** Ngắt nét vẽ khi bước nhảy vượt quá ngần này lần chiều cao khung nhìn. */
const JUMP_FACTOR = 3;

let curveIdCounter = 0;

/* ================================================================== */
/* Lớp cơ sở                                                           */
/* ================================================================== */

export class Curve {
  /**
   * @param {{kind: string, latex?: string, color?: string, label?: string,
   *          domain?: ((scope: object) => number) | null}} spec
   */
  constructor(spec) {
    this.id = `curve_${curveIdCounter++}`;
    this.kind = spec.kind;
    this.latex = spec.latex ?? '';
    /** Chỉ vế phải, dùng khi dựng công thức tích phân hiển thị cho người dùng. */
    this.exprLatex = spec.exprLatex ?? this.latex;
    this.color = spec.color ?? '#5b8def';
    this.label = spec.label ?? this.latex;
    this.domain = spec.domain ?? null;
    this.isAxis = Boolean(spec.isAxis);
    this.hasResidual = true;
    this._cache = null;
  }

  /** Ràng buộc miền `{a < x < b}` có cho phép điểm tham số này không. */
  inDomain(scope) {
    if (!this.domain) return true;
    return this.domain(scope) !== 0;
  }

  /** Lấy mẫu đường cong, có nhớ đệm theo khung nhìn. */
  branches(view, options = {}) {
    const key = `${view.xMin},${view.xMax},${view.yMin},${view.yMax},${view.width},${view.height},${options.quality ?? 1}`;
    if (this._cache && this._cache.key === key) return this._cache.value;
    const value = this.computeBranches(view, options);
    this._cache = { key, value };
    return value;
  }

  invalidate() { this._cache = null; }

  /* --- Các phương thức lớp con phải cài đặt --- */
  computeBranches() { return []; }
  residual() { return NaN; }
  pointAt() { return null; }

  /**
   * Đóng góp của cung vào tích phân đường ∮ −y dx.
   * Mặc định: dùng công thức tham số tổng quát −∫ y(t)·x′(t) dt.
   */
  arcIntegral(branchIndex, t0, t1) {
    const step = Math.abs(t1 - t0) * 1e-6 || 1e-8;
    const integrand = (t) => {
      const p = this.pointAt(branchIndex, t);
      if (!p) return NaN;
      const dxdt = derivative((s) => {
        const q = this.pointAt(branchIndex, s);
        return q ? q[0] : NaN;
      }, t, step);
      return -p[1] * dxdt;
    };
    return integrate(integrand, t0, t1, { tol: 1e-10 });
  }

  /** Đường gấp khúc mô tả cung, dùng để tô màu miền. */
  arcPoints(branchIndex, t0, t1, count = 96) {
    const pts = [];
    for (let i = 0; i <= count; i++) {
      const t = t0 + (t1 - t0) * (i / count);
      const p = this.pointAt(branchIndex, t);
      if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) pts.push(p);
    }
    return pts;
  }

  /**
   * Tìm tham số của một điểm nằm trên đường cong.
   * @returns {{branch: number, t: number, distance: number} | null}
   */
  findParam(x, y, view, tolerance) {
    let best = null;
    const list = this.branches(view);
    for (let b = 0; b < list.length; b++) {
      const { pts, ts } = list[b];
      for (let i = 0; i < pts.length - 1; i++) {
        const hit = nearestOnSegment(pts[i], pts[i + 1], x, y);
        if (best === null || hit.distance < best.distance) {
          best = {
            branch: b,
            t: ts[i] + (ts[i + 1] - ts[i]) * hit.ratio,
            distance: hit.distance,
          };
        }
      }
      if (pts.length === 1) {
        const d = Math.hypot(pts[0][0] - x, pts[0][1] - y);
        if (best === null || d < best.distance) best = { branch: b, t: ts[0], distance: d };
      }
    }
    if (best && tolerance !== undefined && best.distance > tolerance) return null;
    return best;
  }
}

/* ================================================================== */
/* y = f(x)                                                            */
/* ================================================================== */

export class ExplicitCurve extends Curve {
  constructor(spec) {
    super({ ...spec, kind: 'explicit' });
    this.f = spec.f;
  }

  evaluate(x) {
    if (this.domain && !this.inDomain({ x })) return NaN;
    return this.f(x);
  }

  residual(x, y) {
    const value = this.f(x);
    return Number.isFinite(value) ? y - value : NaN;
  }

  pointAt(_branchIndex, t) {
    const y = this.evaluate(t);
    return Number.isFinite(y) ? [t, y] : null;
  }

  computeBranches(view, options) {
    const samples = sampleCount(view, options);
    const step = (view.xMax - view.xMin) / samples;
    const limit = view.height * JUMP_FACTOR;
    const bound = (view.yMax - view.yMin) * 40;
    return splitIntoBranches(samples + 1, (i) => {
      const x = view.xMin + i * step;
      const y = this.evaluate(x);
      if (!Number.isFinite(y)) return null;
      return { t: x, p: [x, clamp(y, view.yMin - bound, view.yMax + bound)], raw: y };
    }, (prev, curr) => Math.abs(curr.raw - prev.raw) > limit * (view.yMax - view.yMin) / view.height);
  }

  /** ∮ −y dx = −∫ f(x) dx — dạng giải tích, không cần đạo hàm số. */
  arcIntegral(_branchIndex, t0, t1) {
    const result = integrate((x) => this.evaluate(x), t0, t1, { tol: 1e-12 });
    return { ...result, value: -result.value };
  }

  findParam(x, y, view, tolerance) {
    const value = this.evaluate(x);
    if (!Number.isFinite(value)) return null;
    const distance = Math.abs(y - value);
    if (tolerance !== undefined && distance > tolerance) return null;
    const list = this.branches(view);
    const branch = list.findIndex((b) => x >= b.ts[0] - 1e-9 && x <= b.ts[b.ts.length - 1] + 1e-9);
    return { branch: branch < 0 ? 0 : branch, t: x, distance };
  }
}

/* ================================================================== */
/* x = g(y)                                                            */
/* ================================================================== */

export class InverseCurve extends Curve {
  constructor(spec) {
    super({ ...spec, kind: 'inverse' });
    this.g = spec.g;
  }

  evaluate(y) {
    if (this.domain && !this.inDomain({ y })) return NaN;
    return this.g(y);
  }

  residual(x, y) {
    const value = this.g(y);
    return Number.isFinite(value) ? x - value : NaN;
  }

  pointAt(_branchIndex, t) {
    const x = this.evaluate(t);
    return Number.isFinite(x) ? [x, t] : null;
  }

  computeBranches(view, options) {
    const samples = sampleCount(view, options);
    const step = (view.yMax - view.yMin) / samples;
    const limit = (view.xMax - view.xMin) * JUMP_FACTOR;
    const bound = (view.xMax - view.xMin) * 40;
    return splitIntoBranches(samples + 1, (i) => {
      const y = view.yMin + i * step;
      const x = this.evaluate(y);
      if (!Number.isFinite(x)) return null;
      return { t: y, p: [clamp(x, view.xMin - bound, view.xMax + bound), y], raw: x };
    }, (prev, curr) => Math.abs(curr.raw - prev.raw) > limit);
  }

  /**
   * ∮ −y dx với x = g(y). Tích phân từng phần khử được đạo hàm:
   *   −∫ y·g′(y) dy = −[y·g(y)] + ∫ g(y) dy
   */
  arcIntegral(_branchIndex, t0, t1) {
    const result = integrate((y) => this.evaluate(y), t0, t1, { tol: 1e-12 });
    const boundary = t1 * this.evaluate(t1) - t0 * this.evaluate(t0);
    return { ...result, value: result.value - boundary };
  }

  findParam(x, y, view, tolerance) {
    const value = this.evaluate(y);
    if (!Number.isFinite(value)) return null;
    const distance = Math.abs(x - value);
    if (tolerance !== undefined && distance > tolerance) return null;
    const list = this.branches(view);
    const branch = list.findIndex((b) => y >= b.ts[0] - 1e-9 && y <= b.ts[b.ts.length - 1] + 1e-9);
    return { branch: branch < 0 ? 0 : branch, t: y, distance };
  }
}

/* ================================================================== */
/* r = f(θ)                                                            */
/* ================================================================== */

export class PolarCurve extends Curve {
  constructor(spec) {
    super({ ...spec, kind: 'polar' });
    this.f = spec.f;
    this.thetaMin = spec.thetaMin ?? 0;
    this.thetaMax = spec.thetaMax ?? 2 * Math.PI;
  }

  evaluate(theta) {
    if (this.domain && !this.inDomain({ theta, t: theta })) return NaN;
    return this.f(theta);
  }

  residual(x, y) {
    const theta = Math.atan2(y, x);
    const r = this.f(theta);
    if (!Number.isFinite(r)) return NaN;
    return Math.hypot(x, y) - Math.abs(r);
  }

  pointAt(_branchIndex, t) {
    const r = this.evaluate(t);
    if (!Number.isFinite(r)) return null;
    return [r * Math.cos(t), r * Math.sin(t)];
  }

  computeBranches(view, options) {
    const samples = Math.max(720, sampleCount(view, options));
    const span = this.thetaMax - this.thetaMin;
    const step = span / samples;
    const limit = Math.max(view.xMax - view.xMin, view.yMax - view.yMin) * JUMP_FACTOR;
    const result = splitIntoBranches(samples + 1, (i) => {
      const theta = this.thetaMin + i * step;
      const p = this.pointAt(0, theta);
      if (!p) return null;
      return { t: theta, p, raw: p };
    }, (prev, curr) => Math.hypot(curr.p[0] - prev.p[0], curr.p[1] - prev.p[1]) > limit);

    // Đường cực quét trọn một vòng thì khép kín.
    for (const branch of result) {
      const first = branch.pts[0];
      const last = branch.pts[branch.pts.length - 1];
      branch.closed = Math.hypot(last[0] - first[0], last[1] - first[1]) < 1e-9;
    }
    return result;
  }
}

/* ================================================================== */
/* (x(t), y(t))                                                        */
/* ================================================================== */

export class ParametricCurve extends Curve {
  constructor(spec) {
    super({ ...spec, kind: 'parametric' });
    this.fx = spec.fx;
    this.fy = spec.fy;
    this.tMin = spec.tMin ?? 0;
    this.tMax = spec.tMax ?? 2 * Math.PI;
    this.hasResidual = false;
  }

  pointAt(_branchIndex, t) {
    if (this.domain && !this.inDomain({ t })) return null;
    const x = this.fx(t);
    const y = this.fy(t);
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
  }

  residual(x, y) {
    // Không có dạng ẩn; dùng khoảng cách tới đường gấp khúc thay thế.
    return NaN;
  }

  computeBranches(view, options) {
    const samples = Math.max(720, sampleCount(view, options));
    const step = (this.tMax - this.tMin) / samples;
    const limit = Math.max(view.xMax - view.xMin, view.yMax - view.yMin) * JUMP_FACTOR;
    const result = splitIntoBranches(samples + 1, (i) => {
      const t = this.tMin + i * step;
      const p = this.pointAt(0, t);
      if (!p) return null;
      return { t, p, raw: p };
    }, (prev, curr) => Math.hypot(curr.p[0] - prev.p[0], curr.p[1] - prev.p[1]) > limit);

    for (const branch of result) {
      const first = branch.pts[0];
      const last = branch.pts[branch.pts.length - 1];
      branch.closed = Math.hypot(last[0] - first[0], last[1] - first[1]) < 1e-9;
    }
    return result;
  }
}

/* ================================================================== */
/* F(x, y) = 0                                                         */
/* ================================================================== */

export class ImplicitCurve extends Curve {
  constructor(spec) {
    super({ ...spec, kind: 'implicit' });
    this.F = spec.F;
  }

  residual(x, y) {
    if (this.domain && !this.inDomain({ x, y })) return NaN;
    return this.F(x, y);
  }

  /**
   * Với đường cong ẩn, tham số là *chỉ số thực* dọc đường gấp khúc đã dựng.
   * Nội suy tuyến tính rồi chiếu Newton về đúng đường cong.
   */
  pointAt(branchIndex, t) {
    const branch = this._lastBranches?.[branchIndex];
    if (!branch) return null;
    const { pts } = branch;
    const clamped = clamp(t, 0, pts.length - 1);
    const i = Math.min(Math.floor(clamped), pts.length - 2);
    const frac = clamped - i;
    if (i < 0 || !pts[i + 1]) return pts[Math.round(clamped)] ?? null;
    const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * frac;
    const y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * frac;
    return projectOntoImplicit((a, b) => this.F(a, b), x, y);
  }

  computeBranches(view, options) {
    const resolution = options.quality === 2 ? 420 : 260;
    const branches = marchingSquares(
      (x, y) => this.residual(x, y),
      view, resolution
    );
    for (const branch of branches) {
      branch.ts = branch.pts.map((_, i) => i);
    }
    this._lastBranches = branches;
    return branches;
  }

  /**
   * ∮ −y dx trên cung của đường cong ẩn.
   *
   * Mọi đỉnh của đường gấp khúc đều đã được chiếu Newton nên nằm *đúng* trên
   * đường cong; cái thiếu chỉ là độ cong giữa hai đỉnh. Vì vậy với mỗi đoạn ta
   * chiếu thêm trung điểm rồi tích phân *chính xác* trên cung parabol đi qua ba
   * điểm đó. Sai số giảm từ O(h³) (hình thang trên đa giác nội tiếp) xuống
   * O(h⁵): diện tích hình tròn đạt sai số cỡ 1e-10 thay vì 1e-3.
   */
  arcIntegral(branchIndex, t0, t1) {
    const nodes = this.arcNodes(branchIndex, t0, t1);
    const project = (x, y) => projectOntoImplicit((a, b) => this.F(a, b), x, y);

    const midpointOf = (a, b) => {
      const mx = 0.5 * (a[0] + b[0]);
      const my = 0.5 * (a[1] + b[1]);
      const projected = project(mx, my);
      return Number.isFinite(projected[0]) && Number.isFinite(projected[1])
        ? projected : [mx, my];
    };

    // Chia đôi thêm 2 lần: sai số O(h⁵) nên mỗi lần chia giảm 32 lần, tổng cộng
    // khoảng 1000 lần, đưa sai số diện tích về cỡ 1e-11 với chi phí không đáng kể.
    const contribution = (a, b, depth) => {
      const mid = midpointOf(a, b);
      if (depth === 0) return quadraticArcIntegral(a, mid, b);
      return contribution(a, mid, depth - 1) + contribution(mid, b, depth - 1);
    };

    let sum = 0;
    for (let i = 0; i < nodes.length - 1; i++) {
      sum += contribution(nodes[i], nodes[i + 1], 2);
    }
    return { value: sum, error: 0, nanCount: 0 };
  }

  arcPoints(branchIndex, t0, t1) {
    return this.arcNodes(branchIndex, t0, t1);
  }

  /** Các đỉnh của đường gấp khúc thuộc cung, theo đúng chiều t0 → t1. */
  arcNodes(branchIndex, t0, t1) {
    const branch = this._lastBranches?.[branchIndex];
    if (!branch) return [];

    const lo = Math.min(t0, t1);
    const hi = Math.max(t0, t1);
    const nodes = [this.pointAt(branchIndex, lo)];
    for (let i = Math.ceil(lo + 1e-9); i <= Math.floor(hi - 1e-9); i++) {
      if (branch.pts[i]) nodes.push(branch.pts[i]);
    }
    nodes.push(this.pointAt(branchIndex, hi));

    const clean = nodes.filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (t1 < t0) clean.reverse();
    return clean;
  }
}

/* ================================================================== */
/* Điểm rời rạc                                                        */
/* ================================================================== */

export class PointMarker extends Curve {
  constructor(spec) {
    super({ ...spec, kind: 'point' });
    this.x = spec.x;
    this.y = spec.y;
    this.hasResidual = false;
  }

  computeBranches() {
    return [{ pts: [[this.x, this.y]], ts: [0], closed: false }];
  }

  pointAt() { return [this.x, this.y]; }
  arcIntegral() { return { value: 0, error: 0, nanCount: 0 }; }
}

/* ================================================================== */
/* Hàm dùng chung                                                      */
/* ================================================================== */

function sampleCount(view, options = {}) {
  const quality = options.quality ?? 1;
  return Math.max(400, Math.round(view.width * 1.5 * quality));
}

/**
 * Gom các mẫu liên tiếp thành nhánh liên tục, cắt tại điểm không xác định
 * hoặc tại bước nhảy quá lớn (tiệm cận đứng).
 */
function splitIntoBranches(count, sampleAt, isJump) {
  const branches = [];
  let current = null;
  let previous = null;

  for (let i = 0; i < count; i++) {
    const sample = sampleAt(i);
    if (!sample) {
      current = null;
      previous = null;
      continue;
    }
    if (current && previous && isJump(previous, sample)) {
      current = null;
    }
    if (!current) {
      current = { pts: [], ts: [], closed: false };
      branches.push(current);
    }
    current.pts.push(sample.p);
    current.ts.push(sample.t);
    previous = sample;
  }

  return branches.filter((b) => b.pts.length >= 2 || count === 1);
}

/**
 * ∮ −y dx *chính xác* trên cung parabol đi qua ba điểm P₀, Pₘ, P₁.
 *
 * Tham số hoá bậc hai theo s ∈ [0, 1] với Pₘ ở s = 0.5:
 *   x(s) = x₀ + aₓs + bₓs² ,  y(s) = y₀ + a_ys + b_ys²
 * rồi lấy tích phân đa thức −∫₀¹ y(s)·x′(s) ds ở dạng đóng.
 */
function quadraticArcIntegral(p0, pm, p1) {
  const ax = -3 * p0[0] + 4 * pm[0] - p1[0];
  const bx = 2 * p0[0] - 4 * pm[0] + 2 * p1[0];
  const ay = -3 * p0[1] + 4 * pm[1] - p1[1];
  const by = 2 * p0[1] - 4 * pm[1] + 2 * p1[1];

  const integralY = p0[1] + ay / 2 + by / 3;        // ∫₀¹ y ds
  const integralSY = p0[1] / 2 + ay / 3 + by / 4;   // ∫₀¹ s·y ds
  return -(ax * integralY + 2 * bx * integralSY);
}

/** Điểm gần nhất trên đoạn thẳng AB tới điểm (x, y). */
export function nearestOnSegment(a, b, x, y) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-24) {
    return { ratio: 0, distance: Math.hypot(a[0] - x, a[1] - y), point: a };
  }
  let ratio = ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSq;
  ratio = clamp(ratio, 0, 1);
  const px = a[0] + ratio * dx;
  const py = a[1] + ratio * dy;
  return { ratio, distance: Math.hypot(px - x, py - y), point: [px, py] };
}

/**
 * Marching squares — dựng đường mức F = 0 rồi nối các đoạn thành đường liền.
 * Mỗi đỉnh được chiếu Newton về đường cong để đạt độ chính xác cỡ sai số máy,
 * thay vì chỉ nội suy tuyến tính trên cạnh ô lưới.
 */
export function marchingSquares(F, view, resolution) {
  const nx = resolution;
  const ny = Math.max(16, Math.round(resolution * (view.yMax - view.yMin) / (view.xMax - view.xMin)));
  const dx = (view.xMax - view.xMin) / nx;
  const dy = (view.yMax - view.yMin) / ny;

  // Lấy dư trên toàn lưới (nx+1) × (ny+1).
  const values = new Float64Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      values[j * (nx + 1) + i] = F(view.xMin + i * dx, view.yMin + j * dy);
    }
  }

  const pointOfEdge = new Map();
  const links = new Map();

  const edgeIdH = (i, j) => (j * (nx + 1) + i) * 2;       // cạnh ngang (i,j)–(i+1,j)
  const edgeIdV = (i, j) => (j * (nx + 1) + i) * 2 + 1;   // cạnh dọc  (i,j)–(i,j+1)

  const interpolate = (id, x0, y0, x1, y1, v0, v1) => {
    if (pointOfEdge.has(id)) return id;
    const ratio = v0 / (v0 - v1);
    const x = x0 + (x1 - x0) * ratio;
    const y = y0 + (y1 - y0) * ratio;
    pointOfEdge.set(id, projectOntoImplicit(F, x, y, 4));
    return id;
  };

  const connect = (a, b) => {
    if (a === b) return;
    if (!links.has(a)) links.set(a, []);
    if (!links.has(b)) links.set(b, []);
    links.get(a).push(b);
    links.get(b).push(a);
  };

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v00 = values[j * (nx + 1) + i];
      const v10 = values[j * (nx + 1) + i + 1];
      const v01 = values[(j + 1) * (nx + 1) + i];
      const v11 = values[(j + 1) * (nx + 1) + i + 1];
      if (!Number.isFinite(v00) || !Number.isFinite(v10) ||
          !Number.isFinite(v01) || !Number.isFinite(v11)) continue;

      const code = (v00 > 0 ? 1 : 0) | (v10 > 0 ? 2 : 0) | (v11 > 0 ? 4 : 0) | (v01 > 0 ? 8 : 0);
      if (code === 0 || code === 15) continue;

      const x0 = view.xMin + i * dx;
      const y0 = view.yMin + j * dy;
      const x1 = x0 + dx;
      const y1 = y0 + dy;

      const bottom = () => interpolate(edgeIdH(i, j), x0, y0, x1, y0, v00, v10);
      const top = () => interpolate(edgeIdH(i, j + 1), x0, y1, x1, y1, v01, v11);
      const left = () => interpolate(edgeIdV(i, j), x0, y0, x0, y1, v00, v01);
      const right = () => interpolate(edgeIdV(i + 1, j), x1, y0, x1, y1, v10, v11);

      switch (code) {
        case 1: case 14: connect(left(), bottom()); break;
        case 2: case 13: connect(bottom(), right()); break;
        case 3: case 12: connect(left(), right()); break;
        case 4: case 11: connect(right(), top()); break;
        case 6: case 9: connect(bottom(), top()); break;
        case 7: case 8: connect(left(), top()); break;
        case 5: case 10: {
          // Trường hợp yên ngựa: dùng giá trị tâm ô để chọn cách nối đúng.
          const center = F(0.5 * (x0 + x1), 0.5 * (y0 + y1));
          const centerPositive = center > 0;
          const flip = code === 5 ? centerPositive : !centerPositive;
          if (flip) { connect(left(), top()); connect(bottom(), right()); }
          else { connect(left(), bottom()); connect(right(), top()); }
          break;
        }
      }
    }
  }

  return chainSegments(pointOfEdge, links);
}

/** Nối các đoạn rời rạc của marching squares thành những đường gấp khúc dài. */
function chainSegments(pointOfEdge, links) {
  const visited = new Set();
  const branches = [];

  const walkFrom = (start) => {
    const order = [start];
    visited.add(start);
    let current = start;
    for (;;) {
      const neighbours = links.get(current) ?? [];
      const next = neighbours.find((n) => !visited.has(n));
      if (next === undefined) break;
      visited.add(next);
      order.push(next);
      current = next;
    }
    return order;
  };

  // Ưu tiên bắt đầu từ các đầu mút (bậc 1) để nhánh hở không bị cắt làm đôi.
  const endpoints = [...links.keys()].filter((k) => (links.get(k) ?? []).length === 1);
  const starts = [...endpoints, ...links.keys()];

  for (const start of starts) {
    if (visited.has(start)) continue;
    const order = walkFrom(start);
    if (order.length < 2) continue;
    const pts = order.map((id) => pointOfEdge.get(id)).filter(Boolean);
    if (pts.length < 2) continue;

    // Đường khép kín: nếu đầu và cuối là hàng xóm của nhau thì nối lại.
    const closed = (links.get(order[order.length - 1]) ?? []).includes(order[0]);
    if (closed) pts.push(pts[0]);
    branches.push({ pts, ts: [], closed });
  }

  return branches;
}
