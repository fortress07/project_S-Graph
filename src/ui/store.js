/**
 * store.js — Lưu phiên làm việc và tạo liên kết chia sẻ.
 *
 * Trạng thái được nén vào phần `#` của URL nên chia sẻ được mà không cần máy
 * chủ, đồng thời tự lưu vào localStorage để mở lại trang là còn nguyên bài đang
 * làm dở.
 */

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

/** Chỉ nhận lại đúng những trường mong đợi, tránh dữ liệu hỏng làm sập ứng dụng. */
function sanitize(data) {
  if (!data || typeof data !== 'object') return null;
  const functions = Array.isArray(data.functions) ? data.functions : [];
  return {
    functions: functions
      .filter((item) => item && typeof item.latex === 'string')
      .slice(0, 24)
      .map((item) => ({
        latex: item.latex.slice(0, 500),
        color: typeof item.color === 'string' ? item.color : undefined,
        hidden: Boolean(item.hidden),
      })),
    view: data.view && typeof data.view === 'object' ? data.view : null,
  };
}
