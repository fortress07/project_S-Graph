/**
 * run.js — Điểm vào của bộ kiểm thử.
 *
 * Toàn bộ `src/core/` là ES module thuần, không đụng tới DOM, nên chạy trực
 * tiếp được trên Node mà không cần công cụ dựng nào.
 */

import { setFile, report } from './harness.js';

const FILES = [
  ['biểu thức toán học', './expression.test.js'],
  ['đường cong & lấy mẫu', './curve.test.js'],
  ['giao điểm & vùng diện tích', './region.test.js'],
  ['an toàn dữ liệu đầu vào', './security.test.js'],
];

console.log('\n  S-Graph — kiểm thử lõi tính toán');

for (const [label, path] of FILES) {
  setFile(label);
  await import(path);
}

process.exit(report() === 0 ? 0 : 1);
