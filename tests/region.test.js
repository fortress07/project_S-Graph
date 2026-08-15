import { analyze } from '../src/core/analyze.js';
import { ExplicitCurve, InverseCurve } from '../src/core/curve.js';
import { findFeaturePoints, findIntersections } from '../src/core/features.js';
import { analyzeRegion } from '../src/core/region.js';
import { test, near, ok, equal } from './harness.js';

const VIEW = {
  xMin: -10, xMax: 10, yMin: -10, yMax: 10,
  width: 900, height: 900, pixelSize: 20 / 900,
};

const axes = () => [
  new ExplicitCurve({ f: () => 0, latex: 'y=0', label: 'Trục Ox', isAxis: true, exprLatex: '0' }),
  new InverseCurve({ g: () => 0, latex: 'x=0', label: 'Trục Oy', isAxis: true, exprLatex: '0' }),
];

function curvesFrom(...latexList) {
  return latexList.map((l) => {
    const result = analyze(l);
    if (result.error) throw new Error(`"${l}": ${result.error}`);
    return result.curve;
  });
}

/* ------------------------------------------------------------------ */
/* Giao điểm                                                           */
/* ------------------------------------------------------------------ */

test('giao điểm parabol và đường thẳng', () => {
  const [p, l] = curvesFrom('y=x^2', 'y=x');
  const hits = findIntersections(p, l, VIEW).sort((a, b) => a.x - b.x);
  equal(hits.length, 2, 'số giao điểm');
  near(hits[0].x, 0, 1e-9); near(hits[0].y, 0, 1e-9);
  near(hits[1].x, 1, 1e-9); near(hits[1].y, 1, 1e-9);
});

test('giao điểm hàm số với đường tròn ẩn — Newton hai chiều', () => {
  const [line, circle] = curvesFrom('y=x', 'x^2+y^2=8');
  const hits = findIntersections(line, circle, VIEW).sort((a, b) => a.x - b.x);
  equal(hits.length, 2, 'số giao điểm');
  near(hits[1].x, 2, 1e-9, 'x giao điểm');
  near(hits[1].y, 2, 1e-9, 'y giao điểm');
});

test('không sinh điểm rác trên toàn lưới số nguyên', () => {
  // Bản cũ thêm mọi điểm nguyên của mọi hàm, cho ra hàng trăm chấm.
  const curves = [...curvesFrom('y=x^2', 'y=x'), ...axes()];
  const points = findFeaturePoints(curves, VIEW);
  ok(points.length < 30, `số điểm phải ít, nhận ${points.length}`);
  ok(
    points.some((p) => Math.abs(p.x - 1) < 1e-6 && Math.abs(p.y - 1) < 1e-6),
    'phải có giao điểm (1, 1)'
  );
});

/* ------------------------------------------------------------------ */
/* Diện tích — các bài toán chuẩn                                      */
/* ------------------------------------------------------------------ */

test('diện tích giữa y = x² và y = x', () => {
  const curves = [...curvesFrom('y=x^2', 'y=x'), ...axes()];
  const result = analyzeRegion([{ x: 0, y: 0 }, { x: 1, y: 1 }], curves, VIEW);
  ok(result.ok, 'phải tính được');
  near(result.area, 1 / 6, 1e-9, 'S');
  equal(result.exact, '1/6', 'dạng phân số');
  equal(result.syntheticCount, 0, 'không cần cạnh nối thẳng');
});

test('diện tích dưới parabol tới trục Ox', () => {
  const curves = [...curvesFrom('y=4-x^2'), ...axes()];
  const result = analyzeRegion([{ x: -2, y: 0 }, { x: 2, y: 0 }], curves, VIEW);
  ok(result.ok, 'phải tính được');
  near(result.area, 32 / 3, 1e-9, 'S = ∫₋₂² (4−x²) dx');
});

test('vùng chặn bởi đường thẳng đứng dùng cạnh nối thẳng', () => {
  // y = x², trục Ox, và hai cạnh dọc x = 0, x = 2 → S = 8/3
  const curves = [...curvesFrom('y=x^2', 'x=2'), ...axes()];
  const result = analyzeRegion(
    [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 4 }],
    curves, VIEW
  );
  ok(result.ok, 'phải tính được');
  near(result.area, 8 / 3, 1e-8, 'S');
});

test('diện tích hình tròn từ hai đỉnh đối tâm', () => {
  const curves = curvesFrom('x^2+y^2=9');
  const result = analyzeRegion([{ x: -3, y: 0 }, { x: 3, y: 0 }], curves, VIEW);
  ok(result.ok, 'phải tính được');
  near(result.area, 9 * Math.PI, 1e-5, 'S = 9π');
  equal(result.exact, '9π', 'dạng bội của π');
});

test('nửa hình tròn khi thêm trục Ox làm đường chặn', () => {
  const curves = [...curvesFrom('x^2+y^2=9'), ...axes()];
  const result = analyzeRegion([{ x: -3, y: 0 }, { x: 0, y: 3 }, { x: 3, y: 0 }], curves, VIEW);
  ok(result.ok, 'phải tính được');
  near(result.area, 4.5 * Math.PI, 1e-5, 'S = 9π/2');
});

test('vùng lõm — trường hợp bản cũ sắp đỉnh sai', () => {
  // y = sin x trên [0, π] so với trục Ox: S = 2.
  const curves = [...curvesFrom('y=\\sin x'), ...axes()];
  const result = analyzeRegion([{ x: 0, y: 0 }, { x: Math.PI, y: 0 }], curves, VIEW);
  ok(result.ok, 'phải tính được');
  near(result.area, 2, 1e-8, 'S');
});

test('vùng giữa hai nhánh không đối xứng', () => {
  // y = x³ và y = x trên [0, 1]: S = ∫₀¹ (x − x³) dx = 1/4
  const curves = [...curvesFrom('y=x^3', 'y=x'), ...axes()];
  const result = analyzeRegion([{ x: 0, y: 0 }, { x: 1, y: 1 }], curves, VIEW);
  near(result.area, 1 / 4, 1e-9, 'S');
});

test('miền xác định bị chặn — √x và trục Ox tới x = 4', () => {
  const curves = [...curvesFrom('y=\\sqrt{x}', 'x=4'), ...axes()];
  const result = analyzeRegion(
    [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }],
    curves, VIEW
  );
  ok(result.ok, 'phải tính được');
  near(result.area, 16 / 3, 1e-8, 'S = ∫₀⁴ √x dx');
});

/* ------------------------------------------------------------------ */
/* Diễn giải kết quả                                                   */
/* ------------------------------------------------------------------ */

test('liệt kê đúng các đường biên của vùng', () => {
  const curves = [...curvesFrom('y=x^2', 'y=x'), ...axes()];
  const result = analyzeRegion([{ x: 0, y: 0 }, { x: 1, y: 1 }], curves, VIEW);
  const labels = result.boundary.map((b) => b.label).sort();
  equal(labels.join(' | '), 'y=x | y=x^2', 'danh sách đường biên');
});

test('dựng được công thức tích phân cho vùng đơn giản', () => {
  const curves = [...curvesFrom('y=x^2', 'y=x'), ...axes()];
  const result = analyzeRegion([{ x: 0, y: 0 }, { x: 1, y: 1 }], curves, VIEW);
  ok(result.formula, 'phải có công thức');
  ok(/\\int_\{0\}\^\{1\}/.test(result.formula), `cận tích phân sai: ${result.formula}`);
});

test('chọn dưới 2 điểm thì không tính', () => {
  const curves = curvesFrom('y=x^2');
  const result = analyzeRegion([{ x: 0, y: 0 }], curves, VIEW);
  ok(!result.ok, 'phải từ chối');
  equal(result.reason, 'need-more-points', 'lý do');
});
