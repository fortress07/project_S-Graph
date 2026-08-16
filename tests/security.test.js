/**
 * Kiểm thử hồi quy cho các lỗ hổng đã vá.
 *
 * Bề mặt tấn công là liên kết chia sẻ `#s=<base64>`: kẻ tấn công dựng URL rồi
 * gửi cho nạn nhân, trình duyệt nạn nhân tự giải mã và dựng lại trạng thái.
 * Mọi dữ liệu đi qua `sanitize()` đều phải coi là không đáng tin.
 */

import { sanitizeLatex } from '../src/core/latex.js';
import { sanitize } from '../src/ui/store.js';
import { test, equal, ok } from './harness.js';

/* ------------------------------------------------------------------ */
/* Thực thi mã tuỳ ý qua MathQuill                                     */
/* ------------------------------------------------------------------ */

test('loại bỏ \\text cùng toàn bộ nội dung bên trong', () => {
  // MathQuill 0.10.1 chèn thẳng nội dung `\text{}` vào DOM mà không thoát ký tự.
  const cleaned = sanitizeLatex('y=x+\\text{<img src=x onerror="fetch(evil)">}');
  ok(!cleaned.includes('\\text'), `còn \\text: ${cleaned}`);
  ok(!cleaned.includes('<'), `còn dấu <: ${cleaned}`);
  ok(!/onerror/i.test(cleaned), `còn onerror: ${cleaned}`);
  equal(cleaned, 'y=x+', 'phần toán học hợp lệ được giữ lại');
});

test('loại bỏ mọi lệnh lạ ngoài danh sách cho phép', () => {
  for (const attack of [
    '\\class{a"onload="x}{y}',
    '\\style{background:url(http://evil)}{x}',
    '\\href{javascript:alert(1)}{x}',
    '\\includegraphics{http://evil/a.png}',
  ]) {
    const cleaned = sanitizeLatex(attack);
    ok(!/\\(class|style|href|includegraphics)/.test(cleaned),
       `lệnh lạ còn sót trong "${cleaned}"`);
  }
});

test('lọc sạch nội dung của lệnh lấy nguyên văn, kể cả khi ngoặc lồng nhau', () => {
  // Chỉ còn chữ và số thì không thể ghép thành thẻ HTML, dù có tình cờ chứa
  // những chữ cái như "onerror" đi nữa.
  const cleaned = sanitizeLatex('\\operatorname{a{<img src=x onerror=1>}b}');
  ok(!/[<>="'/]/.test(cleaned), `còn ký tự dựng được thẻ HTML: ${cleaned}`);
});

test('loại bỏ ký tự điều khiển', () => {
  const cleaned = sanitizeLatex('y=x\u0000\u001F\u007F+1');
  equal(cleaned, 'y=x+1', 'chuỗi sau khi lọc');
});

test('không phá hỏng công thức toán hợp lệ', () => {
  for (const valid of [
    'y=x^2',
    '\\frac{x^{2}+1}{\\sqrt{x}}',
    '\\left|x-3\\right|',
    'r=2\\cos\\theta',
    '\\sin^{-1}x+\\log_{2}8',
    'y=x^2\\left\\{0<x<3\\right\\}',
    '\\sqrt[3]{x}\\cdot\\pi',
  ]) {
    equal(sanitizeLatex(valid), valid, `giữ nguyên "${valid}"`);
  }
});

/* ------------------------------------------------------------------ */
/* Rò rỉ thông tin qua CSS                                             */
/* ------------------------------------------------------------------ */

test('màu chỉ được phép ở dạng mã hex', () => {
  const hostile = sanitize({
    functions: [{ latex: 'y=x', color: 'url("http://evil/beacon.png")' }],
  });
  equal(hostile.functions[0].color, undefined, 'màu độc hại bị loại');
});

test('giữ lại màu hex hợp lệ', () => {
  const clean = sanitize({
    functions: [
      { latex: 'y=x', color: '#4c8dff' },
      { latex: 'y=x', color: '#abc' },
    ],
  });
  equal(clean.functions[0].color, '#4c8dff', 'mã 6 ký tự');
  equal(clean.functions[1].color, '#abc', 'mã 3 ký tự');
});

test('chặn các dạng màu lách luật khác', () => {
  for (const bad of [
    'red; background: url(http://evil)',
    'image-set("http://evil/a.png")',
    '#4c8dff; background:url(http://evil)',
    'var(--x)',
  ]) {
    const out = sanitize({ functions: [{ latex: 'y=x', color: bad }] });
    equal(out.functions[0].color, undefined, `phải loại "${bad}"`);
  }
});

/* ------------------------------------------------------------------ */
/* Treo trình duyệt qua khung nhìn                                     */
/* ------------------------------------------------------------------ */

test('kẹp tâm nhìn về khoảng an toàn', () => {
  // cx = 1e17 làm bước chia nhỏ hơn khoảng cách giữa hai số thực liền nhau,
  // khiến vòng lặp vẽ lưới không tiến được và treo cứng cả thẻ trình duyệt.
  const out = sanitize({ functions: [], view: { cx: 1e17, cy: -1e300, s: 45 } });
  ok(Math.abs(out.view.cx) <= 1e12, `cx = ${out.view.cx}`);
  ok(Math.abs(out.view.cy) <= 1e12, `cy = ${out.view.cy}`);
});

test('kẹp hệ số phóng về khoảng an toàn', () => {
  const huge = sanitize({ functions: [], view: { cx: 0, cy: 0, s: 1e308 } });
  ok(huge.view.s <= 1e12, `s = ${huge.view.s}`);
  const tiny = sanitize({ functions: [], view: { cx: 0, cy: 0, s: 5e-324 } });
  ok(tiny.view.s >= 1e-9, `s = ${tiny.view.s}`);
});

test('bỏ qua khung nhìn có giá trị không phải số', () => {
  const out = sanitize({ functions: [], view: { cx: 'x', cy: null, s: NaN } });
  equal(out.view.cx, undefined, 'cx');
  equal(out.view.s, undefined, 's');
});

/* ------------------------------------------------------------------ */
/* Bền với dữ liệu dị dạng                                             */
/* ------------------------------------------------------------------ */

test('chịu được dữ liệu dị dạng mà không ném lỗi', () => {
  for (const junk of [null, 42, 'abc', [], { functions: 'x' }, { functions: [null, 5] }]) {
    sanitize(junk);
  }
  const many = sanitize({ functions: Array(500).fill({ latex: 'y=x' }) });
  ok(many.functions.length <= 24, `giới hạn số hàm: ${many.functions.length}`);
});

test('không bị ô nhiễm nguyên mẫu qua __proto__', () => {
  sanitize(JSON.parse('{"functions":[],"view":{"__proto__":{"polluted":1}}}'));
  equal({}.polluted, undefined, 'Object.prototype phải sạch');
});
