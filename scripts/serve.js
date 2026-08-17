/**
 * serve.js — Máy chủ tĩnh tối giản, không cần cài thêm gói nào.
 *
 * Dự án dùng ES module nên trình duyệt từ chối nạp khi mở bằng `file://`.
 * Chạy `npm start` để có một máy chủ cục bộ.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

const server = createServer(async (request, response) => {
  try {
    // Chống DNS rebinding: tên miền của kẻ tấn công trỏ về 127.0.0.1 sẽ mang
    // Origin của chính tên miền đó, cho phép đọc mọi tệp trong dự án từ cùng
    // nguồn. Chỉ nhận tên máy cục bộ hoặc địa chỉ IP trực tiếp.
    if (!isLocalHost(request.headers.host)) {
      response.writeHead(403).end('403 Forbidden');
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    // Không phục vụ tệp ẩn (.git, .gitignore, .env…) — chúng nằm ngay gốc dự án.
    if (pathname.split(/[\\/]/).some((part) => part.startsWith('.'))) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
      return;
    }

    // Chặn truy cập ra ngoài thư mục dự án.
    const target = resolve(join(ROOT, normalize(pathname)));
    if (target !== ROOT && !target.startsWith(ROOT + sep)) {
      response.writeHead(403).end('403 Forbidden');
      return;
    }

    const info = await stat(target);
    const file = info.isDirectory() ? join(target, 'index.html') : target;
    const body = await readFile(file);

    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
  }
});

/** Tên máy là "localhost" hoặc địa chỉ IP — những dạng không thể bị DNS rebinding. */
function isLocalHost(hostHeader) {
  if (typeof hostHeader !== 'string' || !hostHeader) return false;
  const host = hostHeader.startsWith('[')
    ? hostHeader.slice(0, hostHeader.indexOf(']') + 1)
    : hostHeader.split(':')[0];
  return host === 'localhost' || /^[0-9.]+$/.test(host) || /^\[[0-9a-f:]+\]$/i.test(host);
}

server.listen(PORT, () => {
  console.log(`\n  S-Graph đang chạy tại  http://localhost:${PORT}\n  Dừng bằng Ctrl + C\n`);
});
