import { analyze } from '../src/core/analyze.js';
import { test, near, equal, ok } from './harness.js';

const VIEW = { xMin: -10, xMax: 10, yMin: -10, yMax: 10, width: 800, height: 800 };

function curveOf(latex) {
  const result = analyze(latex);
  if (result.error) throw new Error(`analyze("${latex}") lỗi: ${result.error}`);
  if (!result.curve) throw new Error(`analyze("${latex}") không tạo được đường cong`);
  return result;
}

/* --- Nhận diện loại --- */

test('nhận diện đúng từng loại đối tượng', () => {
  equal(curveOf('y=x^2').curve.kind, 'explicit', 'y=x²');
  equal(curveOf('x^2').curve.kind, 'explicit', 'biểu thức trần');
  equal(curveOf('x=2').curve.kind, 'inverse', 'đường thẳng đứng');
  equal(curveOf('x=y^2').curve.kind, 'inverse', 'x theo y');
  equal(curveOf('r=2\\cos\\theta').curve.kind, 'polar', 'toạ độ cực');
  equal(curveOf('x^2+y^2=25').curve.kind, 'implicit', 'đường tròn');
  equal(curveOf('\\frac{x^2}{9}+\\frac{y^2}{4}=1').curve.kind, 'implicit', 'elip');
  equal(curveOf('\\left(\\cos t,\\sin t\\right)').curve.kind, 'parametric', 'tham số');
  equal(curveOf('\\left(2,3\\right)').curve.kind, 'point', 'điểm');
});

test('bất phương trình cho ra miền nghiệm kèm đường biên', () => {
  const result = analyze('y<x^2');
  ok(result.inequality, 'phải có miền nghiệm');
  ok(result.inequality.strict, 'dấu < là nghiêm ngặt');
  ok(result.inequality.test(0, -1), '(0,−1) thuộc miền y < x²');
  ok(!result.inequality.test(0, 1), '(0,1) không thuộc miền');
  equal(result.curve.kind, 'explicit', 'đường biên');
});

test('báo lỗi có nội dung thay vì im lặng', () => {
  const result = analyze('y=\\sin');
  ok(result.error, 'phải có thông báo lỗi');
  ok(/đối số/i.test(result.error), `thông báo phải nói về đối số, nhận: ${result.error}`);
});

/* --- Lấy mẫu và cắt nhánh --- */

test('cắt nhánh tại tiệm cận đứng', () => {
  const { curve } = curveOf('y=\\frac{1}{x}');
  const branches = curve.branches(VIEW);
  ok(branches.length >= 2, `y=1/x phải có ít nhất 2 nhánh, nhận ${branches.length}`);
});

test('cắt nhánh tại biên tập xác định', () => {
  const { curve } = curveOf('y=\\sqrt{x}');
  const branches = curve.branches(VIEW);
  equal(branches.length, 1, 'số nhánh');
  ok(branches[0].pts[0][0] >= -1e-6, 'nhánh phải bắt đầu từ x ≥ 0');
});

test('ràng buộc miền giới hạn đúng khoảng vẽ', () => {
  const { curve } = curveOf('y=x^2\\left\\{1<x<3\\right\\}');
  const branches = curve.branches(VIEW);
  const xs = branches.flatMap((b) => b.pts.map((p) => p[0]));
  ok(Math.min(...xs) >= 1 - 0.05, `x nhỏ nhất phải ≈ 1, nhận ${Math.min(...xs)}`);
  ok(Math.max(...xs) <= 3 + 0.05, `x lớn nhất phải ≈ 3, nhận ${Math.max(...xs)}`);
});

test('đường tròn ẩn dựng thành một vòng khép kín', () => {
  const { curve } = curveOf('x^2+y^2=25');
  const branches = curve.branches(VIEW);
  equal(branches.length, 1, 'số nhánh');
  ok(branches[0].closed, 'phải là đường khép kín');
  for (const [x, y] of branches[0].pts) {
    near(Math.hypot(x, y), 5, 1e-9, 'mọi đỉnh phải nằm trên đường tròn');
  }
});

/* --- Tích phân đường (đóng góp Green) --- */

test('∮ −y dx trên cung hàm số', () => {
  const { curve } = curveOf('y=x^2');
  // −∫₀¹ x² dx = −1/3
  near(curve.arcIntegral(0, 0, 1).value, -1 / 3, 1e-11);
});

test('∮ −y dx trên cung hàm ngược khử được đạo hàm', () => {
  const { curve } = curveOf('x=y^2');
  // ∫₀¹ y² dy − [x·y]₀¹ = 1/3 − 1 = −2/3
  near(curve.arcIntegral(0, 0, 1).value, -2 / 3, 1e-11);
});

test('đường thẳng đứng không đóng góp diện tích', () => {
  const { curve } = curveOf('x=3');
  near(curve.arcIntegral(0, 1, 5).value, 0, 1e-11);
});

test('diện tích hình tròn ẩn chính xác nhiều chữ số', () => {
  const { curve } = curveOf('x^2+y^2=25');
  const branch = curve.branches(VIEW)[0];
  const last = branch.ts[branch.ts.length - 1];
  const area = Math.abs(curve.arcIntegral(0, 0, last).value);
  near(area, 25 * Math.PI, 1e-6, 'diện tích hình tròn bán kính 5');
});

test('tích phân được tới sát biên tập xác định', () => {
  // √(1−x²) trên [−1, 1]: bản cũ phải vá NaN thành 0, ở đây tích phân trực tiếp.
  const { curve } = curveOf('y=\\sqrt{1-x^2}');
  near(Math.abs(curve.arcIntegral(0, -1, 1).value), Math.PI / 2, 1e-8);
});
