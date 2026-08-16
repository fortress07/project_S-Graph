/**
 * bootstrap-check.js — Báo cho người dùng khi mã nguồn không nạp được.
 *
 * Mở trang bằng `file://` sẽ khiến trình duyệt chặn ES module và người dùng chỉ
 * thấy một trang trắng. Tệp này nằm riêng (không nội tuyến trong HTML) để trang
 * dùng được Content-Security-Policy nghiêm ngặt, không cần `'unsafe-inline'`.
 */

setTimeout(function checkStarted() {
  if (window.__S_GRAPH_READY__) return;
  var loader = document.getElementById('app-loader');
  if (loader) loader.remove();
  var note = document.getElementById('module-error');
  if (note) note.hidden = false;
}, 2500);
