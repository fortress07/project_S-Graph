/**
 * harness.js — Bộ chạy kiểm thử tối giản, không phụ thuộc gói ngoài.
 * Chạy bằng `npm test`.
 */

const results = [];
let currentFile = '';

export function setFile(name) {
  currentFile = name;
}

export function test(name, fn) {
  try {
    fn();
    results.push({ file: currentFile, name, ok: true });
  } catch (err) {
    results.push({ file: currentFile, name, ok: false, error: err });
  }
}

/** Hai số bằng nhau trong sai số cho phép. */
export function near(actual, expected, tol = 1e-9, label = '') {
  if (typeof actual !== 'number' || Number.isNaN(actual)) {
    throw new Error(`${label} nhận ${actual}, mong đợi ${expected}`);
  }
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${label} nhận ${actual}, mong đợi ${expected} (lệch ${Math.abs(actual - expected).toExponential(2)})`);
  }
}

export function equal(actual, expected, label = '') {
  if (actual !== expected) {
    throw new Error(`${label} nhận ${JSON.stringify(actual)}, mong đợi ${JSON.stringify(expected)}`);
  }
}

export function ok(value, label = 'giá trị') {
  if (!value) throw new Error(`${label} phải đúng, nhận ${value}`);
}

export function throws(fn, pattern) {
  let thrown = null;
  try { fn(); } catch (err) { thrown = err; }
  if (!thrown) throw new Error('Mong đợi có lỗi được ném ra');
  if (pattern && !pattern.test(thrown.message)) {
    throw new Error(`Thông báo lỗi “${thrown.message}” không khớp ${pattern}`);
  }
}

export function report() {
  const failed = results.filter((r) => !r.ok);
  const byFile = new Map();
  for (const r of results) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push(r);
  }

  for (const [file, list] of byFile) {
    const bad = list.filter((r) => !r.ok).length;
    console.log(`\n  ${bad === 0 ? '✓' : '✗'} ${file}  (${list.length - bad}/${list.length})`);
    for (const r of list) {
      if (r.ok) console.log(`      · ${r.name}`);
      else console.log(`    ✗ ${r.name}\n        ${r.error.message}`);
    }
  }

  console.log(`\n  ${results.length - failed.length}/${results.length} phép thử đạt\n`);
  return failed.length;
}
