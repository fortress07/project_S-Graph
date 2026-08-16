/**
 * store.js — Lưu phiên làm việc và tạo liên kết chia sẻ.
 *
 * Trạng thái được nén vào phần `#` của URL nên chia sẻ được mà không cần máy
 * chủ, đồng thời tự lưu vào localStorage để mở lại trang là còn nguyên bài đang
 * làm dở.
 */

import { sanitizeLatex } from '../core/latex.js';

const STORAGE_KEY = 's-graph:session:v2';

/** @typedef {{functions: Array<{latex: string, color: string, hidden: boolean}>, view: object}} Session */

export function saveSession(session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Chế độ riêng tư có thể chặn localStorage — bỏ qua, không ảnh hưởng chức năng.
  }
}

export function loadSession() {
  const fromHash = readHash();
  if (fromHash) return fromHash;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* bỏ qua */ }
}

/** Tạo liên kết chia sẻ chứa toàn bộ trạng thái hiện tại. */
export function buildShareLink(session) {
  const encoded = encodeState(session);
  const url = new URL(window.location.href);
  url.hash = `s=${encoded}`;
  return url.toString();
}

function readHash() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash.startsWith('s=')) return null;
  try {
    return sanitize(decodeState(hash.slice(2)));
  } catch {
    return null;
  }
}

/* Base64 an toàn cho URL, giữ được ký tự tiếng Việt và ký hiệu LaTeX. */

function encodeState(session) {
  const json = JSON.stringify(session);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeState(encoded) {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Chỉ chấp nhận màu ở dạng mã hex.
 *
 * Trước đây chỉ kiểm tra `typeof === 'string'`, nên một liên kết chia sẻ có thể
 * đặt màu thành `url("http://kẻ-tấn-công/beacon.png")`. Chuỗi này đi thẳng vào
 * `style.background`, khiến trình duyệt nạn nhân gửi yêu cầu tới máy chủ lạ và
 * làm lộ địa chỉ IP cùng User-Agent ngay khi mở liên kết.
 */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Giới hạn khung nhìn để dữ liệu ngoài không đẩy được vào vùng số vô lý. */
const MAX_CENTER = 1e12;
const MIN_SCALE = 1e-9;
const MAX_SCALE = 1e12;

/**
 * Chỉ nhận lại đúng những trường mong đợi, tránh dữ liệu hỏng làm sập ứng dụng.
 * Xuất ra ngoài để bộ kiểm thử gọi trực tiếp được mà không cần tới trình duyệt.
 */
export function sanitize(data) {
  if (!data || typeof data !== 'object') return null;
  const functions = Array.isArray(data.functions) ? data.functions : [];
  return {
    functions: functions
      .filter((item) => item && typeof item.latex === 'string')
      .slice(0, 24)
      .map((item) => ({
        // Chuỗi này sẽ được MathQuill dựng thành DOM — phải lọc tại đây.
        latex: sanitizeLatex(item.latex),
        color: HEX_COLOR.test(item.color) ? item.color : undefined,
        hidden: Boolean(item.hidden),
      })),
    view: sanitizeView(data.view),
  };
}

function sanitizeView(view) {
  if (!view || typeof view !== 'object') return null;
  const clamp = (value, limit) =>
    (Number.isFinite(value) ? Math.max(-limit, Math.min(limit, value)) : undefined);

  const scale = Number.isFinite(view.s)
    ? Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.s))
    : undefined;

  return {
    cx: clamp(view.cx, MAX_CENTER),
    cy: clamp(view.cy, MAX_CENTER),
    s: scale > 0 ? scale : undefined,
  };
}
