/**
 * region.js — Suy luận xem người dùng đang muốn tính diện tích vùng nào.
 *
 * Ý tưởng: các điểm được chọn là *đỉnh*, còn cạnh của vùng phải là những cung
 * có thật trên các đường cong đang vẽ. Vì vậy ta:
 *
 *   1. Với mỗi đường cong, xác định tham số của từng đỉnh nằm trên nó, sắp xếp
 *      theo tham số rồi nối các đỉnh *liền kề* thành cung. Cung như vậy chắc
 *      chắn liên tục và không nhảy qua đỉnh nào khác.
 *   2. Bổ sung cung thẳng nối mọi cặp đỉnh, nhưng đánh dấu là "cung phụ" để chỉ
 *      dùng khi không còn lựa chọn nào tốt hơn (thường là cạnh dọc x = a).
 *   3. Tìm chu trình đi qua đúng một lần mỗi đỉnh, ưu tiên ít cung phụ nhất,
 *      không tự cắt, và chu vi nhỏ nhất — đó chính là vùng "khít" nhất.
 *   4. Tính diện tích bằng định lý Green: S = |∮ −y dx|, cộng đóng góp của từng
 *      cung theo công thức giải tích riêng cho từng loại đường cong.
 *
 * So với bản cũ (sắp đỉnh theo góc quanh trọng tâm rồi đoán đường cong gần
 * nhất), cách này cho kết quả đúng cả với vùng lõm và vùng nhiều đường biên.
 */

import { formatNumber, recognizeExact } from './numeric.js';

/** Giới hạn số nhánh duyệt để giao diện không bị treo với nhiều đỉnh. */
const MAX_SEARCH_STEPS = 400000;
const MAX_VERTICES = 14;

/* ------------------------------------------------------------------ */
/* Cung                                                                */
/* ------------------------------------------------------------------ */

let arcUidCounter = 0;

class Arc {
  constructor({ curve, branch, from, to, segments, synthetic = false, points = null, uid = null }) {
    this.curve = curve;
    this.branch = branch;
    this.from = from;
    this.to = to;
    this.segments = segments;
    this.synthetic = synthetic;
    this._points = points;
    /**
     * Định danh *không phụ thuộc chiều đi*. Một cung và bản đảo chiều của nó
     * dùng chung uid, nhờ vậy thuật toán tìm chu trình không thể dùng cùng một
     * cung hai lần — điều kiện sống còn khi vùng chỉ có 2 đỉnh, vì lúc đó vòng
     * kín bắt buộc phải gồm hai cung khác nhau (nếu không diện tích luôn bằng 0).
     */
    this.uid = uid ?? `arc_${arcUidCounter++}`;
  }

  /** Bản sao đi ngược chiều — dùng khi chu trình duyệt cung theo chiều kia. */
  reversed() {
    return new Arc({
      curve: this.curve,
      branch: this.branch,
      from: this.to,
      to: this.from,
      segments: [...this.segments].reverse().map(([a, b]) => [b, a]),
      synthetic: this.synthetic,
      points: this._points ? [...this._points].reverse() : null,
      uid: this.uid,
    });
  }

  /** Đóng góp của cung vào ∮ −y dx. */
  integral() {
    if (this.synthetic) return straightLineIntegral(this._points[0], this._points[1]);
    let total = 0;
    let nanCount = 0;
    for (const [t0, t1] of this.segments) {
      const result = this.curve.arcIntegral(this.branch, t0, t1);
      total += result.value;
      nanCount += result.nanCount ?? 0;
    }
    return { value: total, nanCount };
  }

  /**
   * Đường gấp khúc mô tả cung, dùng để tô miền và kiểm tra tự cắt.
   * Luôn trả về mảng mới: bên gọi có quyền cắt gọt đầu mảng khi ghép các cung,
   * nếu trả thẳng mảng nội bộ thì cung sẽ bị hỏng ngay trong lúc dò chu trình.
   */
  points(density = 64) {
    if (this._points && this.synthetic) return this._points.map((p) => [...p]);
    const out = [];
    for (const [t0, t1] of this.segments) {
      const part = [...this.curve.arcPoints(this.branch, t0, t1, density)];
      if (out.length && part.length) part.shift();
      out.push(...part);
    }
    return out;
  }

  get length() {
    const pts = this.points(24);
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    }
    return total;
  }
}

/** ∮ −y dx trên một đoạn thẳng (hình thang). */
function straightLineIntegral(p0, p1) {
  return { value: -0.5 * (p0[1] + p1[1]) * (p1[0] - p0[0]), nanCount: 0 };
}

/* ------------------------------------------------------------------ */
/* Điểm vào chính                                                      */
/* ------------------------------------------------------------------ */

/**
 * @param {Array<{x: number, y: number}>} vertices Các đỉnh người dùng đã chọn
 * @param {import('./curve.js').Curve[]} curves
 * @param {object} view
 * @returns {object} Kết quả phân tích
 */
export function analyzeRegion(vertices, curves, view) {
  if (vertices.length < 2) {
    return { ok: false, reason: 'need-more-points', area: 0, polygon: [], boundary: [] };
  }
  if (vertices.length > MAX_VERTICES) {
    return { ok: false, reason: 'too-many-points', area: 0, polygon: [], boundary: [] };
  }

  const arcs = buildArcs(vertices, curves, view);
  const cycle = findBestCycle(vertices, arcs);

  if (!cycle) {
    return fallbackPolygon(vertices);
  }

  let total = 0;
  let nanCount = 0;
  for (const arc of cycle.arcs) {
    const result = arc.integral();
    if (!Number.isFinite(result.value)) {
      return fallbackPolygon(vertices, 'integral-failed');
    }
    total += result.value;
    nanCount += result.nanCount;
  }

  const polygon = buildPolygon(cycle.arcs);
  const warnings = [];
  if (nanCount > 0) warnings.push('Một phần đường biên nằm ngoài tập xác định.');
  if (cycle.syntheticCount > 0) {
    warnings.push(
      cycle.syntheticCount === 1
        ? 'Một cạnh được nối thẳng vì không có đường cong nào đi qua cả hai đỉnh.'
        : `${cycle.syntheticCount} cạnh được nối thẳng vì không có đường cong nào đi qua.`
    );
  }
  if (cycle.selfIntersections > 0) {
    warnings.push('Đường biên tự cắt — hãy thử bỏ bớt hoặc chọn lại đỉnh.');
  }

  const area = Math.abs(total);
  // Cung của hàm số và hàm ngược được tích phân bằng công thức giải tích nên
  // chính xác tới cỡ 1e-12; cung của đường cong ẩn/cực/tham số đi qua phép lấy
  // mẫu nên chỉ đạt cỡ 1e-10. Ngưỡng nhận dạng "1/6" hay "9π" phải bám theo độ
  // chính xác thật sự, nếu không sẽ bỏ sót hoặc nhận nhầm.
  const analytic = cycle.arcs.every(
    (arc) => arc.synthetic || arc.curve.kind === 'explicit' || arc.curve.kind === 'inverse'
  );

  return {
    ok: true,
    area,
    exact: recognizeExact(area, analytic ? 1e-10 : 1e-8),
    display: formatNumber(area),
    polygon,
    boundary: describeBoundary(cycle.arcs),
    formula: buildFormula(cycle.arcs),
    syntheticCount: cycle.syntheticCount,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Dựng cung                                                           */
/* ------------------------------------------------------------------ */

function buildArcs(vertices, curves, view) {
  const arcs = [];
  const tolerance = view.pixelSize * 8;

  for (const curve of curves) {
    // Danh sách có thể chứa ô nhập đang dở hoặc sai cú pháp.
    if (!curve || curve.kind === 'point') continue;
    const branches = curve.branches(view);

    // Nhóm các đỉnh theo nhánh của đường cong.
    const byBranch = new Map();
    for (let i = 0; i < vertices.length; i++) {
      const hit = curve.findParam(vertices[i].x, vertices[i].y, view, tolerance);
      if (!hit) continue;
      if (!byBranch.has(hit.branch)) byBranch.set(hit.branch, []);
      byBranch.get(hit.branch).push({ index: i, t: hit.t });
    }

    for (const [branchIndex, hits] of byBranch) {
      if (hits.length < 2) continue;
      hits.sort((a, b) => a.t - b.t);

      for (let i = 0; i < hits.length - 1; i++) {
        arcs.push(new Arc({
          curve, branch: branchIndex,
          from: hits[i].index, to: hits[i + 1].index,
          segments: [[hits[i].t, hits[i + 1].t]],
        }));
      }

      // Đường khép kín: nối đỉnh cuối vòng qua chỗ nối về đỉnh đầu.
      const branch = branches[branchIndex];
      if (branch?.closed && hits.length >= 2) {
        const last = hits[hits.length - 1];
        const first = hits[0];
        const tStart = branch.ts[0];
        const tEnd = branch.ts[branch.ts.length - 1];
        arcs.push(new Arc({
          curve, branch: branchIndex,
          from: last.index, to: first.index,
          segments: [[last.t, tEnd], [tStart, first.t]],
        }));
      }
    }
  }

  // Cung phụ: đoạn thẳng nối mọi cặp đỉnh chưa có cung nào nối.
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      arcs.push(new Arc({
        curve: null, branch: 0, from: i, to: j,
        segments: [], synthetic: true,
        points: [[vertices[i].x, vertices[i].y], [vertices[j].x, vertices[j].y]],
      }));
    }
  }

  return arcs;
}

/* ------------------------------------------------------------------ */
/* Tìm chu trình tốt nhất                                              */
/* ------------------------------------------------------------------ */

function findBestCycle(vertices, arcs) {
  const n = vertices.length;
  const adjacency = Array.from({ length: n }, () => []);
  for (const arc of arcs) {
    adjacency[arc.from].push(arc);
    adjacency[arc.to].push(arc.reversed());
  }

  let best = null;
  let steps = 0;

  const consider = (chain) => {
    const syntheticCount = chain.filter((a) => a.synthetic).length;
    const perimeter = chain.reduce((sum, a) => sum + a.length, 0);
    const polygon = buildPolygon(chain, 28);
    const selfIntersections = countSelfIntersections(polygon);
    const candidate = { arcs: chain, syntheticCount, perimeter, selfIntersections };
    if (!best || isBetter(candidate, best)) best = candidate;
  };

  const visited = new Array(n).fill(false);
  const usedArcs = new Set();

  const dfs = (current, chain) => {
    if (steps++ > MAX_SEARCH_STEPS) return;

    if (chain.length === n - 1) {
      // Khép vòng về đỉnh xuất phát.
      for (const arc of adjacency[current]) {
        if (arc.to !== 0 || usedArcs.has(arc.uid)) continue;
        consider([...chain, arc]);
      }
      return;
    }

    for (const arc of adjacency[current]) {
      if (visited[arc.to] || usedArcs.has(arc.uid)) continue;
      visited[arc.to] = true;
      usedArcs.add(arc.uid);
      dfs(arc.to, [...chain, arc]);
      usedArcs.delete(arc.uid);
      visited[arc.to] = false;
    }
  };

  visited[0] = true;
  dfs(0, []);
  return best;
}

function isBetter(a, b) {
  if (a.syntheticCount !== b.syntheticCount) return a.syntheticCount < b.syntheticCount;
  if (a.selfIntersections !== b.selfIntersections) return a.selfIntersections < b.selfIntersections;
  return a.perimeter < b.perimeter - 1e-12;
}

/* ------------------------------------------------------------------ */
/* Đa giác và kiểm tra tự cắt                                          */
/* ------------------------------------------------------------------ */

function buildPolygon(arcs, density = 64) {
  const polygon = [];
  for (const arc of arcs) {
    const pts = arc.points(density);
    if (polygon.length && pts.length) pts.shift();
    polygon.push(...pts);
  }
  return polygon.filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

function countSelfIntersections(polygon) {
  const n = polygon.length;
  if (n < 4) return 0;
  let count = 0;
  const limit = 700;
  const stride = Math.max(1, Math.ceil(n / limit));

  const sampled = [];
  for (let i = 0; i < n; i += stride) sampled.push(polygon[i]);

  for (let i = 0; i < sampled.length - 1; i++) {
    for (let j = i + 2; j < sampled.length - 1; j++) {
      if (i === 0 && j === sampled.length - 2) continue;   // cạnh kề nhau qua chỗ khép vòng
      if (segmentsCross(sampled[i], sampled[i + 1], sampled[j], sampled[j + 1])) count++;
    }
  }
  return count;
}

function segmentsCross(p0, p1, q0, q1) {
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = cross(p0, p1, q0);
  const d2 = cross(p0, p1, q1);
  const d3 = cross(q0, q1, p0);
  const d4 = cross(q0, q1, p1);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/* ------------------------------------------------------------------ */
/* Phương án dự phòng                                                  */
/* ------------------------------------------------------------------ */

/** Không tìm được chu trình: coi các đỉnh là một đa giác thường. */
function fallbackPolygon(vertices, reason = 'no-cycle') {
  const cx = vertices.reduce((s, p) => s + p.x, 0) / vertices.length;
  const cy = vertices.reduce((s, p) => s + p.y, 0) / vertices.length;
  const sorted = [...vertices].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );

  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const b = sorted[(i + 1) % sorted.length];
    total += a.x * b.y - b.x * a.y;
  }
  const area = Math.abs(total) / 2;

  return {
    ok: true,
    approximate: true,
    reason,
    area,
    exact: recognizeExact(area),
    display: formatNumber(area),
    polygon: sorted.map((p) => [p.x, p.y]),
    boundary: [],
    formula: null,
    syntheticCount: sorted.length,
    warnings: ['Không nối được các đỉnh bằng đường cong nào — đang tính theo đa giác nối thẳng.'],
  };
}

/* ------------------------------------------------------------------ */
/* Diễn giải cho người dùng                                            */
/* ------------------------------------------------------------------ */

function describeBoundary(arcs) {
  const seen = new Map();
  for (const arc of arcs) {
    if (arc.synthetic) {
      if (!seen.has('__line')) seen.set('__line', { label: 'Đoạn thẳng nối đỉnh', count: 0, synthetic: true });
      seen.get('__line').count++;
      continue;
    }
    const key = arc.curve.id;
    if (!seen.has(key)) {
      seen.set(key, {
        label: arc.curve.label || arc.curve.latex,
        latex: arc.curve.latex,
        color: arc.curve.color,
        isAxis: arc.curve.isAxis,
        count: 0,
      });
    }
    seen.get(key).count++;
  }
  return [...seen.values()];
}

/**
 * Với vùng "đơn giản theo phương đứng" (đúng hai cung, đều là hàm số, cùng
 * khoảng x) thì viết được công thức tích phân quen thuộc để người học đối chiếu.
 */
function buildFormula(arcs) {
  if (arcs.length !== 2) return null;
  const [a, b] = arcs;
  if (a.synthetic || b.synthetic) return null;
  if (a.curve.kind !== 'explicit' || b.curve.kind !== 'explicit') return null;

  const rangeA = [a.segments[0][0], a.segments[0][1]].sort((m, n) => m - n);
  const rangeB = [b.segments[0][0], b.segments[0][1]].sort((m, n) => m - n);
  if (Math.abs(rangeA[0] - rangeB[0]) > 1e-6 || Math.abs(rangeA[1] - rangeB[1]) > 1e-6) return null;

  const lower = formatBound(rangeA[0]);
  const upper = formatBound(rangeA[1]);
  const fa = a.curve.exprLatex ?? a.curve.latex;
  const fb = b.curve.exprLatex ?? b.curve.latex;

  // Không chèn `\,` (dấu cách mỏng): MathQuill 0.10.1 không hiểu lệnh này và
  // hiển thị *toàn bộ* công thức thành rỗng chứ không bỏ qua riêng nó.
  // Trục Ox: rút gọn |f − 0| thành |f|.
  if (a.curve.isAxis) return `S=\\int_{${lower}}^{${upper}}\\left|${fb}\\right|dx`;
  if (b.curve.isAxis) return `S=\\int_{${lower}}^{${upper}}\\left|${fa}\\right|dx`;
  return `S=\\int_{${lower}}^{${upper}}\\left|${fa}-${wrapIfCompound(fb)}\\right|dx`;
}

/**
 * Chỉ thêm ngoặc khi vế trừ có phép cộng/trừ ở mức ngoài cùng.
 * Nhờ vậy công thức hiện `|x^2 − x|` thay vì `|x^2 − (x)|`.
 */
function wrapIfCompound(latex) {
  let depth = 0;
  for (let i = 1; i < latex.length; i++) {
    const ch = latex[i];
    if (ch === '{' || ch === '(') depth++;
    else if (ch === '}' || ch === ')') depth--;
    else if ((ch === '+' || ch === '-') && depth === 0) {
      return `\\left(${latex}\\right)`;
    }
  }
  return latex;
}

function formatBound(value) {
  const exact = recognizeExact(value);
  if (exact) return exact.replace('π', '\\pi').replace(/^(-?)(.*)\/(.*)$/, '$1\\frac{$2}{$3}');
  return formatNumber(value, 6);
}
