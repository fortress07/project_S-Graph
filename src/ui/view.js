/**
 * view.js — Khung nhìn: đổi qua lại giữa toạ độ toán học và toạ độ màn hình.
 *
 * Trạng thái chỉ gồm tâm nhìn và một hệ số phóng *duy nhất* cho cả hai trục,
 * nhờ vậy ô lưới luôn vuông và đường tròn không bao giờ bị bóp thành elip.
 */

const MIN_SCALE = 1e-6;
const MAX_SCALE = 1e9;

export class View {
  constructor({ centerX = 0, centerY = 0, scale = 45 } = {}) {
    this.centerX = centerX;
    this.centerY = centerY;
    this.scale = scale;        // pixel trên mỗi đơn vị toán học
    this.width = 800;          // kích thước theo pixel CSS
    this.height = 600;
  }

  resize(width, height) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
  }

  get pixelSize() { return 1 / this.scale; }
  get xMin() { return this.centerX - this.width / (2 * this.scale); }
  get xMax() { return this.centerX + this.width / (2 * this.scale); }
  get yMin() { return this.centerY - this.height / (2 * this.scale); }
  get yMax() { return this.centerY + this.height / (2 * this.scale); }

  screenX(x) { return (x - this.centerX) * this.scale + this.width / 2; }
  screenY(y) { return this.height / 2 - (y - this.centerY) * this.scale; }
  worldX(sx) { return this.centerX + (sx - this.width / 2) / this.scale; }
  worldY(sy) { return this.centerY + (this.height / 2 - sy) / this.scale; }

  /** Bản chụp nhẹ để truyền cho lớp lõi (chỉ đọc). */
  bounds() {
    return {
      xMin: this.xMin, xMax: this.xMax,
      yMin: this.yMin, yMax: this.yMax,
      width: this.width, height: this.height,
      pixelSize: this.pixelSize,
    };
  }

  panByPixels(dx, dy) {
    this.centerX -= dx / this.scale;
    this.centerY += dy / this.scale;
  }

  /** Phóng to/thu nhỏ neo tại một điểm trên màn hình (con trỏ chuột). */
  zoomAt(screenX, screenY, factor) {
    const anchorX = this.worldX(screenX);
    const anchorY = this.worldY(screenY);
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
    if (next === this.scale) return;
    this.scale = next;
    this.centerX = anchorX - (screenX - this.width / 2) / this.scale;
    this.centerY = anchorY + (this.height / 2 - screenY) / this.scale;
  }

  reset() {
    this.centerX = 0;
    this.centerY = 0;
    this.scale = Math.min(this.width, this.height) / 12;
  }

  /** Đưa khung nhìn về bao trọn một vùng, chừa lề. */
  fit(xMin, xMax, yMin, yMax, padding = 0.15) {
    const spanX = Math.max(xMax - xMin, 1e-6);
    const spanY = Math.max(yMax - yMin, 1e-6);
    this.centerX = (xMin + xMax) / 2;
    this.centerY = (yMin + yMax) / 2;
    this.scale = Math.min(
      this.width / (spanX * (1 + padding * 2)),
      this.height / (spanY * (1 + padding * 2))
    );
  }

  serialize() {
    return { cx: round(this.centerX), cy: round(this.centerY), s: round(this.scale) };
  }

  static deserialize(data) {
    if (!data || typeof data !== 'object') return new View();
    const view = new View();
    if (Number.isFinite(data.cx)) view.centerX = data.cx;
    if (Number.isFinite(data.cy)) view.centerY = data.cy;
    if (Number.isFinite(data.s) && data.s > 0) view.scale = data.s;
    return view;
  }
}

function round(value) {
  return Number(value.toPrecision(10));
}

/**
 * Bước chia "đẹp" gần nhất theo dãy 1 – 2 – 5 × 10ⁿ, sao cho mỗi vạch cách nhau
 * ít nhất `minPixels` pixel trên màn hình.
 */
export function niceStep(scale, minPixels = 76) {
  const target = minPixels / scale;
  const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
  const normalized = target / magnitude;
  let step;
  if (normalized <= 1) step = 1;
  else if (normalized <= 2) step = 2;
  else if (normalized <= 5) step = 5;
  else step = 10;
  return step * magnitude;
}

/** Định dạng nhãn trục, tránh hiện tượng 0.30000000000000004. */
export function formatTick(value, step) {
  if (Math.abs(value) < step * 1e-6) return '0';
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  if (Math.abs(value) >= 1e6 || (Math.abs(value) < 1e-4 && value !== 0)) {
    return value.toExponential(1).replace('e+', 'e').replace('e-0', 'e-');
  }
  return Number(value.toFixed(Math.min(decimals, 12))).toString();
}
