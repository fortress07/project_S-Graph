/**
 * renderer.js — Vẽ toàn bộ đồ thị lên canvas.
 *
 * Tự vẽ thay vì dùng thư viện đồ hoạ giúp kiểm soát trọn vẹn phần nhìn: lưới
 * hai cấp, nét đứt cho đường biên bất phương trình, vùng tô có viền sáng, chấm
 * điểm phân cấp chính/phụ, và bảng màu đổi theo giao diện sáng/tối.
 */

import { niceStep, formatTick } from './view.js';

/** Đọc bảng màu từ biến CSS để canvas luôn khớp với giao diện đang dùng. */
export function readPalette(element) {
  const style = getComputedStyle(element);
  const get = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    background: get('--graph-bg', '#0f1117'),
    gridMinor: get('--graph-grid-minor', '#1b1f2a'),
    gridMajor: get('--graph-grid-major', '#262c3a'),
    axis: get('--graph-axis', '#8b94a7'),
    axisText: get('--graph-axis-text', '#9aa4b8'),
    region: get('--graph-region', '#4c8dff'),
    node: get('--graph-node', '#f5a623'),
    nodeSecondary: get('--graph-node-secondary', '#6b7488'),
    nodeSelected: get('--graph-node-selected', '#2ecc71'),
    crosshair: get('--graph-crosshair', '#4c8dff'),
  };
}

export class Renderer {
  constructor(canvas, view) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.view = view;
    this.palette = readPalette(canvas);
    this.dpr = 1;
  }

  refreshPalette() {
    this.palette = readPalette(this.canvas);
  }

  /** Đồng bộ kích thước canvas với khung chứa, có tính tỉ lệ điểm ảnh màn hình. */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.view.resize(width, height);
    return { width, height };
  }

  /**
   * @param {object} scene
   * @param {Array} scene.curves        Đường cong đang hiển thị
   * @param {Array} scene.inequalities  Miền nghiệm cần tô
   * @param {Array} scene.nodes         Điểm có thể chọn
   * @param {Array} scene.selected      Chỉ số điểm đang chọn
   * @param {Array|null} scene.region   Đa giác vùng diện tích
   * @param {object|null} scene.hover   Điểm đang rê chuột tới
   * @param {object|null} scene.cursor  Vị trí con trỏ để hiện toạ độ
   */
  draw(scene) {
    const { ctx, view, dpr } = this;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.fillStyle = this.palette.background;
    ctx.fillRect(0, 0, view.width, view.height);

    this.drawGrid();
    for (const item of scene.inequalities ?? []) this.drawInequality(item);
    if (scene.region) this.drawRegion(scene.region);
    this.drawAxes();
    for (const curve of scene.curves ?? []) this.drawCurve(curve);
    this.drawNodes(scene.nodes ?? [], scene.selected ?? [], scene.hover);
    if (scene.cursor) this.drawCursor(scene.cursor);

    ctx.restore();
  }

  /* ---------------------------------------------------------------- */
  /* Lưới và trục                                                      */
  /* ---------------------------------------------------------------- */

  drawGrid() {
    const { ctx, view, palette } = this;
    const step = niceStep(view.scale);
    const minor = step / 5;

    ctx.lineWidth = 1;
    for (const [size, color] of [[minor, palette.gridMinor], [step, palette.gridMajor]]) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      const startX = Math.ceil(view.xMin / size) * size;
      for (let x = startX; x <= view.xMax; x += size) {
        const sx = Math.round(view.screenX(x)) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, view.height);
      }
      const startY = Math.ceil(view.yMin / size) * size;
      for (let y = startY; y <= view.yMax; y += size) {
        const sy = Math.round(view.screenY(y)) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(view.width, sy);
      }
      ctx.stroke();
    }
  }

  drawAxes() {
    const { ctx, view, palette } = this;
    const step = niceStep(view.scale);
    const axisY = Math.round(view.screenY(0)) + 0.5;
    const axisX = Math.round(view.screenX(0)) + 0.5;

    ctx.strokeStyle = palette.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, axisY); ctx.lineTo(view.width, axisY);
    ctx.moveTo(axisX, 0); ctx.lineTo(axisX, view.height);
    ctx.stroke();

    // Nhãn số: kẹp vào trong khung khi trục bị đẩy ra ngoài màn hình.
    ctx.fillStyle = palette.axisText;
    ctx.font = '500 11px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const labelY = clampNumber(axisY + 5, 4, view.height - 16);
    const startX = Math.ceil(view.xMin / step) * step;
    for (let x = startX; x <= view.xMax; x += step) {
      if (Math.abs(x) < step * 1e-6) continue;
      ctx.fillText(formatTick(x, step), view.screenX(x), labelY);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const labelX = clampNumber(axisX - 7, 26, view.width - 4);
    const startY = Math.ceil(view.yMin / step) * step;
    for (let y = startY; y <= view.yMax; y += step) {
      if (Math.abs(y) < step * 1e-6) continue;
      ctx.fillText(formatTick(y, step), labelX, view.screenY(y));
    }

    // Gốc toạ độ: lùi ra xa cả hai trục để chữ O không dính vào nét trục.
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(
      'O',
      clampNumber(axisX - 8, 14, view.width - 4),
      clampNumber(axisY + 6, 2, view.height - 14)
    );
  }

  /* ---------------------------------------------------------------- */
  /* Đường cong                                                        */
  /* ---------------------------------------------------------------- */

  drawCurve(curve) {
    const { ctx, view } = this;
    const branches = curve.branches(view.bounds());

    ctx.save();
    ctx.strokeStyle = curve.color;
    ctx.lineWidth = curve.emphasis ? 3.2 : 2.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (curve.dashed) ctx.setLineDash([7, 5]);
    if (curve.dimmed) ctx.globalAlpha = 0.35;

    for (const branch of branches) {
      if (branch.pts.length === 1) {
        this.drawDot(branch.pts[0], curve.color);
        continue;
      }
      ctx.beginPath();
      let started = false;
      for (const [x, y] of branch.pts) {
        const sx = view.screenX(x);
        const sy = view.screenY(y);
        // Bỏ bớt đỉnh ở rất xa khung nhìn để canvas không phải xử lý toạ độ lớn.
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) { started = false; continue; }
        if (started) ctx.lineTo(sx, sy);
        else { ctx.moveTo(sx, sy); started = true; }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawDot([x, y], color) {
    const { ctx, view } = this;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(view.screenX(x), view.screenY(y), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ---------------------------------------------------------------- */
  /* Miền nghiệm bất phương trình                                      */
  /* ---------------------------------------------------------------- */

  /**
   * Tô miền nghiệm bằng cách kiểm tra trên lưới thô rồi vẽ từng ô. Cách này
   * đúng cho mọi bất phương trình, kể cả `x^2+y^2<9`, mà không cần biết trước
   * hình dạng miền.
   */
  drawInequality({ test, color, domain }) {
    const { ctx, view } = this;
    const cell = 5;
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.16;

    for (let sy = 0; sy < view.height; sy += cell) {
      const y = view.worldY(sy + cell / 2);
      let runStart = null;
      for (let sx = 0; sx <= view.width; sx += cell) {
        const x = view.worldX(sx + cell / 2);
        const inside = sx < view.width &&
          test(x, y) &&
          (!domain || domain({ x, y }) !== 0);
        if (inside && runStart === null) runStart = sx;
        else if (!inside && runStart !== null) {
          ctx.fillRect(runStart, sy, sx - runStart, cell);
          runStart = null;
        }
      }
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------------- */
  /* Vùng diện tích                                                    */
  /* ---------------------------------------------------------------- */

  drawRegion(polygon) {
    if (!polygon || polygon.length < 3) return;
    const { ctx, view, palette } = this;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(view.screenX(polygon[0][0]), view.screenY(polygon[0][1]));
    for (let i = 1; i < polygon.length; i++) {
      ctx.lineTo(view.screenX(polygon[i][0]), view.screenY(polygon[i][1]));
    }
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 0, 0, view.height);
    gradient.addColorStop(0, withAlpha(palette.region, 0.42));
    gradient.addColorStop(1, withAlpha(palette.region, 0.22));
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = withAlpha(palette.region, 0.95);
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------------------------------------------------------- */
  /* Điểm chọn                                                         */
  /* ---------------------------------------------------------------- */

  drawNodes(nodes, selectedIndices, hover) {
    const { ctx, view, palette } = this;
    const selected = new Set(selectedIndices);

    ctx.save();
    nodes.forEach((node, index) => {
      const sx = view.screenX(node.x);
      const sy = view.screenY(node.y);
      if (sx < -20 || sx > view.width + 20 || sy < -20 || sy > view.height + 20) return;

      const isSelected = selected.has(index);
      const isHovered = hover?.index === index;
      const isSecondary = node.kind === 'projection';

      let radius = isSecondary ? 3.2 : 4.6;
      if (isSelected) radius = 6.4;
      if (isHovered) radius += 1.8;

      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(sx, sy, radius + 5, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha(isSelected ? palette.nodeSelected : palette.node, 0.22);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? palette.nodeSelected
        : (isSecondary ? palette.nodeSecondary : palette.node);
      ctx.globalAlpha = isSecondary && !isHovered ? 0.65 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = palette.background;
      ctx.stroke();

      if (isSelected) {
        // Đánh số thứ tự chọn để người dùng theo dõi được đường đi của vùng.
        const order = selectedIndices.indexOf(index) + 1;
        ctx.fillStyle = palette.background;
        ctx.font = '700 9px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(order), sx, sy + 0.5);
      }
    });
    ctx.restore();

    if (hover) this.drawTooltip(nodes[hover.index]);
  }

  drawTooltip(node) {
    if (!node) return;
    const { ctx, view, palette } = this;
    const text = `(${trimNumber(node.x)}; ${trimNumber(node.y)})`;

    ctx.save();
    ctx.font = '600 12px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    const width = ctx.measureText(text).width + 16;
    const height = 24;
    let sx = view.screenX(node.x) + 14;
    let sy = view.screenY(node.y) - height - 10;
    sx = clampNumber(sx, 4, view.width - width - 4);
    sy = clampNumber(sy, 4, view.height - height - 4);

    ctx.fillStyle = withAlpha(palette.background, 0.94);
    ctx.strokeStyle = withAlpha(palette.axis, 0.5);
    ctx.lineWidth = 1;
    roundRect(ctx, sx, sy, width, height, 7);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = palette.axisText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, sx + 8, sy + height / 2);
    ctx.restore();
  }

  drawCursor({ x, y }) {
    const { ctx, view, palette } = this;
    const text = `x = ${trimNumber(x)}   y = ${trimNumber(y)}`;
    ctx.save();
    ctx.font = '500 11px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = withAlpha(palette.axisText, 0.75);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(text, view.width - 12, view.height - 10);
    ctx.restore();
  }

  /** Xuất ảnh PNG của khung đồ thị hiện tại. */
  toDataURL() {
    return this.canvas.toDataURL('image/png');
  }
}

/* ------------------------------------------------------------------ */
/* Tiện ích                                                            */
/* ------------------------------------------------------------------ */

function clampNumber(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

function trimNumber(value) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) < 1e-10) return '0';
  const rounded = Number(value.toPrecision(6));
  return String(rounded);
}

/** Thêm độ trong suốt cho màu dạng #rgb / #rrggbb / rgb(...). */
function withAlpha(color, alpha) {
  const hex = color.trim();
  if (hex.startsWith('#')) {
    let r, g, b;
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (hex.startsWith('rgb(')) return hex.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  return hex;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
