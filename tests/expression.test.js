import { latexToInfix } from '../src/core/latex.js';
import { parse } from '../src/core/parser.js';
import { compile } from '../src/core/compile.js';
import { test, near, throws } from './harness.js';

/** Rút gọn: LaTeX → giá trị tại một scope cho trước. */
function evalLatex(latex, scope = {}) {
  return compile(parse(latexToInfix(latex)))(scope);
}

/* --- Chuyển đổi LaTeX, đặc biệt là ngoặc lồng nhau --- */

test('phân số lồng ngoặc — lỗi của bản cũ', () => {
  near(evalLatex('\\frac{x^{2}}{3}', { x: 6 }), 12);
  near(evalLatex('\\frac{x^{2}+1}{x-1}', { x: 3 }), 5);
  near(evalLatex('\\frac{\\frac{1}{2}}{\\frac{1}{4}}'), 2);
});

test('căn thức lồng ngoặc — lỗi của bản cũ', () => {
  near(evalLatex('\\sqrt{x^{2}}', { x: -5 }), 5);
  near(evalLatex('\\sqrt{x^{2}+9}', { x: 4 }), 5);
  near(evalLatex('\\sqrt[3]{x}', { x: -27 }), -3);
  near(evalLatex('\\sqrt[{3}]{8}'), 2);
});

test('phân số dạng rút gọn \\frac12', () => {
  near(evalLatex('\\frac12'), 0.5);
});

test('trị tuyệt đối', () => {
  near(evalLatex('\\left|x-3\\right|', { x: 1 }), 2);
  near(evalLatex('|x|', { x: -7 }), 7);
  near(evalLatex('\\left|x\\right|+\\left|y\\right|', { x: -2, y: -3 }), 5);
});

test('sàn, trần', () => {
  near(evalLatex('\\lfloor x\\rfloor', { x: 2.7 }), 2);
  near(evalLatex('\\lceil x\\rceil', { x: 2.1 }), 3);
});

/* --- Nhân ngầm và hàm không ngoặc --- */

test('nhân ngầm', () => {
  near(evalLatex('2x', { x: 5 }), 10);
  near(evalLatex('2\\pi'), 2 * Math.PI);
  near(evalLatex('\\left(x+1\\right)\\left(x-2\\right)', { x: 4 }), 10);
  near(evalLatex('3x^2', { x: 2 }), 12);
  near(evalLatex('xy', { x: 3, y: 4 }), 12);
});

test('hàm không ngoặc gom đối số đúng', () => {
  near(evalLatex('\\sin x^2', { x: Math.sqrt(Math.PI / 2) }), 1);   // sin(x²)
  near(evalLatex('\\sin 2x', { x: Math.PI / 4 }), 1);               // sin(2x)
  near(evalLatex('\\sin x\\cos x', { x: 0.7 }), Math.sin(0.7) * Math.cos(0.7));
  near(evalLatex('\\sin x+1', { x: 0 }), 1);
  near(evalLatex('2\\sin x', { x: Math.PI / 2 }), 2);
  near(evalLatex('\\sin x/2', { x: Math.PI / 2 }), 0.5);
});

test('luỹ thừa và hàm ngược của hàm lượng giác', () => {
  near(evalLatex('\\sin^2 x', { x: Math.PI / 2 }), 1);
  near(evalLatex('\\sin^{2}x+\\cos^{2}x', { x: 1.234 }), 1);
  near(evalLatex('\\sin^{-1}x', { x: 1 }), Math.PI / 2);
});

/* --- Logarit --- */

test('logarit theo quy ước Việt Nam', () => {
  near(evalLatex('\\ln e'), 1);
  near(evalLatex('\\log 1000'), 3);          // log = cơ số 10
  near(evalLatex('\\log_{2}8'), 3);
  near(evalLatex('\\log_{2}\\left(x\\right)', { x: 32 }), 5);
  near(evalLatex('\\log_{3}9x', { x: 3 }), 3);  // log_3(27)
});

/* --- Luỹ thừa, giai thừa, độ --- */

test('căn bậc lẻ của số âm', () => {
  near(evalLatex('x^{\\frac{1}{3}}', { x: -8 }), -2);
});

test('dấu âm và luỹ thừa', () => {
  near(evalLatex('-x^2', { x: 3 }), -9);
  near(evalLatex('2^{-x}', { x: 3 }), 0.125);
  near(evalLatex('2^{3^{2}}'), 512);        // kết hợp phải
});

test('giai thừa và số đo độ', () => {
  near(evalLatex('5!'), 120);
  near(evalLatex('\\sin 30^\\circ'), 0.5);
});

/* --- Tập xác định trả về NaN thay vì số phức --- */

test('ngoài tập xác định trả về NaN', () => {
  if (!Number.isNaN(evalLatex('\\sqrt{x}', { x: -1 }))) throw new Error('sqrt(-1) phải là NaN');
  if (!Number.isNaN(evalLatex('\\ln x', { x: -1 }))) throw new Error('ln(-1) phải là NaN');
  if (!Number.isNaN(evalLatex('\\arcsin x', { x: 2 }))) throw new Error('arcsin(2) phải là NaN');
});

/* --- Báo lỗi rõ ràng --- */

test('biến lạ bị từ chối kèm thông báo', () => {
  throws(() => evalLatex('a x^2', { x: 1 }), /Không nhận ra/);
});

test('thiếu đối số bị từ chối', () => {
  throws(() => evalLatex('\\sin'), /thiếu đối số/i);
});

/* --- So sánh nối chuỗi (dùng cho ràng buộc miền) --- */

test('so sánh nối chuỗi', () => {
  near(evalLatex('0<x<3', { x: 2 }), 1);
  near(evalLatex('0<x<3', { x: 5 }), 0);
  near(evalLatex('x\\ge 2', { x: 2 }), 1);
});
