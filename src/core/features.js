/**
 * features.js — Tìm các điểm đáng chú ý để người dùng chọn làm đỉnh của vùng.
 *
 * Bản cũ sinh điểm bằng cách quét mọi cặp hàm số *và* mọi điểm nguyên trên
 * lưới, rồi với mỗi điểm lại thêm hai hình chiếu lên hai trục — kết quả là
 * hàng trăm chấm vàng chen chúc, rất khó bấm trúng. Ở đây ta:
 *
 *   1. Chỉ sinh điểm thật sự có ý nghĩa hình học: giao điểm, cực trị, đầu mút
 *      tập xác định. Trục Ox và Oy tham gia như hai đường cong bình thường,
 *      nên nghiệm và giao với trục tung xuất hiện tự nhiên.
 *   2. Hình chiếu lên trục được đánh dấu là điểm *phụ*, vẽ mờ và nhỏ hơn.
 *   3. Khử trùng lặp theo khoảng cách tính bằng pixel, giữ lại điểm có ý nghĩa
 *      cao hơn khi hai điểm chồng nhau.
 */

import { refineIntersection, ternarySearch } from './numeric.js';
import { nearestOnSegment } from './curve.js';

/** Thứ tự ưu tiên khi khử trùng lặp — số lớn hơn thì được giữ lại. */
const PRIORITY = { intersection: 4, endpoint: 3, extremum: 2, projection: 1 };

/**
 * @param {import('./curve.js').Curve[]} curves
 * @param {object} view
 * @param {{includeProjections?: boolean, mergePixels?: number}} [options]
 * @returns {Array<{x: number, y: number, kind: string, curves: string[]}>}
 */
export function findFeaturePoints(curves, view, options = {}) {
  const { includeProjections = true, mergePixels = 9 } = options;
  const active = curves.filter((c) => c.kind !== 'point');
  const found = [];

  // 1. Giao điểm giữa từng cặp đường cong.
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      for (const p of findIntersections(active[i], active[j], view)) {
        found.push({ ...p, kind: 'intersection', curves: [active[i].id, active[j].id] });
      }
    }
  }

  // 2. Cực trị và đầu mút của từng đường cong.
  for (const curve of active) {
    for (const p of findExtrema(curve, view)) {
      found.push({ ...p, kind: 'extremum', curves: [curve.id] });
    }
    for (const p of findBranchEndpoints(curve, view)) {
      found.push({ ...p, kind: 'endpoint', curves: [curve.id] });
    }
  }

  // 3. Điểm đánh dấu do người dùng nhập trực tiếp, ví dụ (2, 3).
  for (const curve of curves) {
    if (curve.kind === 'point') {
      found.push({ x: curve.x, y: curve.y, kind: 'intersection', curves: [curve.id] });
    }
  }

  const primary = dedupe(found, view, mergePixels);

  // 4. Hình chiếu lên hai trục — cần cho những vùng chặn bởi đường thẳng đứng
  //    hoặc nằm ngang, nhưng để ở mức phụ để không làm rối đồ thị.
  if (!includeProjections) return primary;

  const projections = [];
  for (const p of primary) {
    if (Math.abs(p.y) > 1e-9) projections.push({ x: p.x, y: 0, kind: 'projection', curves: [] });
    if (Math.abs(p.x) > 1e-9) projections.push({ x: 0, y: p.y, kind: 'projection', curves: [] });
  }

  return dedupe([...primary, ...projections], view, mergePixels);
}

/* ------------------------------------------------------------------ */
/* Giao điểm                                                           */
/* ------------------------------------------------------------------ */

/**
 * Giao điểm của hai đường cong bất kỳ.
 *
 * Cách làm thống nhất cho mọi loại: cắt đoạn trên đường gấp khúc đã lấy mẫu để
 * có vị trí gần đúng, rồi tinh chỉnh bằng Newton hai chiều trên cặp hàm dư khi
 * cả hai đường cong đều có dạng ẩn. Kết quả chính xác tới cỡ sai số máy, kể cả
 * khi một bên là hàm số còn bên kia là đường tròn.
 */
export function findIntersections(curveA, curveB, view) {
  const branchesA = curveA.branches(view);
  const branchesB = curveB.branches(view);
  const grid = new SegmentGrid(view);

  for (const branch of branchesA) {
    for (let i = 0; i < branch.pts.length - 1; i++) {
      grid.insert(branch.pts[i], branch.pts[i + 1]);
    }
  }

  const raw = [];
  for (const branch of branchesB) {
    for (let i = 0; i < branch.pts.length - 1; i++) {
      const p0 = branch.pts[i];
      const p1 = branch.pts[i + 1];
      for (const [q0, q1] of grid.candidates(p0, p1)) {
        const hit = segmentIntersection(p0, p1, q0, q1);
        if (hit) raw.push(hit);
      }
    }
  }

  const canRefine = curveA.hasResidual && curveB.hasResidual;
  const refined = raw.map(([x, y]) => {
    if (!canRefine) return { x, y };
    const [rx, ry] = refineIntersection(
      (px, py) => curveA.residual(px, py),
      (px, py) => curveB.residual(px, py),
      x, y
    );
    // Newton có thể trượt đi xa nếu điểm xuất phát nằm gần điểm kỳ dị.
    if (!Number.isFinite(rx) || !Number.isFinite(ry)) return { x, y };
    if (Math.hypot(rx - x, ry - y) > view.pixelSize * 6) return { x, y };
    return { x: rx, y: ry };
  });

  // Quanh mỗi giao điểm có nhiều cặp đoạn cùng cắt nhau, nên phải gộp lại;
  // nếu không, một giao điểm sẽ hoá thành cả chùm điểm chồng lên nhau.
  return mergeNearby(refined.filter((p) => insideView(p, view)), view.pixelSize * 3);
}

/** Gộp các điểm nằm sát nhau thành một, lấy trung bình toạ độ. */
function mergeNearby(points, tolerance) {
  const kept = [];
  for (const p of points) {
    const near = kept.find((q) => Math.hypot(q.x - p.x, q.y - p.y) < tolerance);
    if (near) {
      near.x = (near.x * near.count + p.x) / (near.count + 1);
      near.y = (near.y * near.count + p.y) / (near.count + 1);
      near.count++;
    } else {
      kept.push({ x: p.x, y: p.y, count: 1 });
    }
  }
  return kept.map(({ x, y }) => ({ x, y }));
}

/** Giao điểm của hai đoạn thẳng, trả về null nếu không cắt nhau. */
function segmentIntersection(p0, p1, q0, q1) {
  const r = [p1[0] - p0[0], p1[1] - p0[1]];
  const s = [q1[0] - q0[0], q1[1] - q0[1]];
  const denominator = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denominator) < 1e-18) return null;

  const dx = q0[0] - p0[0];
  const dy = q0[1] - p0[1];
  const t = (dx * s[1] - dy * s[0]) / denominator;
  const u = (dx * r[1] - dy * r[0]) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [p0[0] + t * r[0], p0[1] + t * r[1]];
}

/** Lưới băm không gian để tránh so sánh mọi cặp đoạn (O(n²)). */
class SegmentGrid {
  constructor(view) {
    this.view = view;
    this.cell = Math.max((view.xMax - view.xMin) / 96, 1e-9);
    this.map = new Map();
  }

  key(ix, iy) { return ix * 100003 + iy; }

  cellRange(p0, p1) {
    const x0 = Math.min(p0[0], p1[0]);
    const x1 = Math.max(p0[0], p1[0]);
    const y0 = Math.min(p0[1], p1[1]);
    const y1 = Math.max(p0[1], p1[1]);
    return [
      Math.floor(x0 / this.cell), Math.floor(x1 / this.cell),
      Math.floor(y0 / this.cell), Math.floor(y1 / this.cell),
    ];
  }

  insert(p0, p1) {
    const [ix0, ix1, iy0, iy1] = this.cellRange(p0, p1);
    // Đoạn dài bất thường (nhánh bị kéo tới rìa) sẽ phủ quá nhiều ô — bỏ qua.
    if ((ix1 - ix0) * (iy1 - iy0) > 4096) return;
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iy = iy0; iy <= iy1; iy++) {
        const k = this.key(ix, iy);
        let bucket = this.map.get(k);
        if (!bucket) { bucket = []; this.map.set(k, bucket); }
        bucket.push([p0, p1]);
      }
    }
  }

  candidates(p0, p1) {
    const [ix0, ix1, iy0, iy1] = this.cellRange(p0, p1);
    if ((ix1 - ix0) * (iy1 - iy0) > 4096) return [];
    const seen = new Set();
    const out = [];
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iy = iy0; iy <= iy1; iy++) {
        const bucket = this.map.get(this.key(ix, iy));
        if (!bucket) continue;
        for (const seg of bucket) {
          if (seen.has(seg)) continue;
          seen.add(seg);
          out.push(seg);
        }
      }
    }
    return out;
  }
}

/* ------------------------------------------------------------------ */
/* Cực trị và đầu mút                                                  */
/* ------------------------------------------------------------------ */

/** Cực trị địa phương theo cả hai trục — với đường tròn cho ra 4 điểm chính. */
export function findExtrema(curve, view) {
  const results = [];
  for (let b = 0; b < curve.branches(view).length; b++) {
    const branch = curve.branches(view)[b];
    const { pts, ts } = branch;
    if (pts.length < 3 || ts.length !== pts.length) continue;

    for (const axis of [1, 0]) {          // 1 = cực trị theo y, 0 = theo x
      for (let i = 1; i < pts.length - 1; i++) {
        const before = pts[i][axis] - pts[i - 1][axis];
        const after = pts[i + 1][axis] - pts[i][axis];
        if (before === 0 || after === 0 || before * after > 0) continue;

        const isMaximum = before > 0;
        const t = ternarySearch(
          (value) => {
            const p = curve.pointAt(b, value);
            return p ? p[axis] : (isMaximum ? -Infinity : Infinity);
          },
          ts[i - 1], ts[i + 1], isMaximum, 60
        );
        const p = curve.pointAt(b, t);
        if (p && insideView({ x: p[0], y: p[1] }, view)) {
          results.push({ x: p[0], y: p[1] });
        }
      }
    }
  }
  return results;
}

/**
 * Đầu mút của nhánh hở — ví dụ điểm (0, 0) của y = √x, hay hai đầu của một
 * đồ thị bị chặn bởi ràng buộc miền. Bỏ qua đầu mút chỉ do khung nhìn cắt.
 */
export function findBranchEndpoints(curve, view) {
  const results = [];
  const marginX = (view.xMax - view.xMin) * 0.004;
  const marginY = (view.yMax - view.yMin) * 0.004;

  for (const branch of curve.branches(view)) {
    if (branch.closed || branch.pts.length < 2) continue;
    for (const p of [branch.pts[0], branch.pts[branch.pts.length - 1]]) {
      const clippedByView =
        p[0] <= view.xMin + marginX || p[0] >= view.xMax - marginX ||
        p[1] <= view.yMin + marginY || p[1] >= view.yMax - marginY;
      if (!clippedByView) results.push({ x: p[0], y: p[1] });
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/* Khử trùng lặp                                                       */
/* ------------------------------------------------------------------ */

function dedupe(points, view, mergePixels) {
  const tolerance = view.pixelSize * mergePixels;
  const sorted = [...points].sort(
    (a, b) => (PRIORITY[b.kind] ?? 0) - (PRIORITY[a.kind] ?? 0)
  );

  const kept = [];
  for (const p of sorted) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    // Làm sạch nhiễu quanh 0 để (2.0000000001, 0) hiển thị thành (2, 0).
    const x = Math.abs(p.x) < tolerance * 0.05 ? 0 : p.x;
    const y = Math.abs(p.y) < tolerance * 0.05 ? 0 : p.y;

    const duplicate = kept.find(
      (q) => Math.abs(q.x - x) < tolerance && Math.abs(q.y - y) < tolerance
    );
    if (duplicate) {
      // Gộp danh sách đường cong đi qua điểm.
      for (const id of p.curves ?? []) {
        if (!duplicate.curves.includes(id)) duplicate.curves.push(id);
      }
      continue;
    }
    kept.push({ x, y, kind: p.kind, curves: [...(p.curves ?? [])] });
  }
  return kept;
}

function insideView(p, view) {
  const padX = (view.xMax - view.xMin) * 0.02;
  const padY = (view.yMax - view.yMin) * 0.02;
  return p.x >= view.xMin - padX && p.x <= view.xMax + padX &&
         p.y >= view.yMin - padY && p.y <= view.yMax + padY;
}

/** Đường cong gần điểm nhất trong bán kính cho trước — dùng khi bấm lên đồ thị. */
export function nearestCurvePoint(curves, x, y, view, maxDistance) {
  let best = null;
  for (const curve of curves) {
    if (curve.kind === 'point') continue;
    for (const branch of curve.branches(view)) {
      for (let i = 0; i < branch.pts.length - 1; i++) {
        const hit = nearestOnSegment(branch.pts[i], branch.pts[i + 1], x, y);
        if (!best || hit.distance < best.distance) {
          best = { x: hit.point[0], y: hit.point[1], distance: hit.distance, curve };
        }
      }
    }
  }
  if (best && best.distance <= maxDistance) return best;
  return null;
}
