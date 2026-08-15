/**
 * graph.js — Tương tác với đồ thị: kéo, phóng to, rê chuột, chọn điểm.
 *
 * Khác với bản cũ (phải tắt chức năng kéo khi vào chế độ chọn điểm), ở đây ta
 * phân biệt "bấm" với "kéo" theo quãng đường di chuyển, nên người dùng vẫn di
 * chuyển và phóng to đồ thị bình thường trong lúc đang chọn vùng.
 */

import { Renderer } from './renderer.js';
import { View } from './view.js';

const CLICK_TOLERANCE_PX = 5;
const NODE_HIT_RADIUS_PX = 14;
const CURVE_HIT_RADIUS_PX = 10;

export class GraphCanvas {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.view = new View();
    this.renderer = new Renderer(canvas, this.view);
    this.handlers = handlers;

    this.curves = [];
    this.inequalities = [];
    this.nodes = [];
    this.selected = [];
    this.region = null;
    this.hover = null;
    this.cursor = null;
    this.selectMode = false;

    this._pointers = new Map();
    this._pinchDistance = 0;
    this._drag = null;
    this._frame = null;

    this.renderer.resize();
    this.view.reset();
    this._bindEvents();
  }

  /* ---------------------------------------------------------------- */
  /* Trạng thái cảnh                                                   */
  /* ---------------------------------------------------------------- */

  setCurves(curves) { this.curves = curves; this.requestDraw(); }
  setInequalities(list) { this.inequalities = list; this.requestDraw(); }
  setNodes(nodes) { this.nodes = nodes; this.requestDraw(); }
  setRegion(polygon) { this.region = polygon; this.requestDraw(); }
  setSelected(indices) { this.selected = indices; this.requestDraw(); }

  setSelectMode(enabled) {
    this.selectMode = enabled;
    this.canvas.classList.toggle('is-selecting', enabled);
    this.requestDraw();
  }

  resize() {
    this.renderer.resize();
    this.requestDraw();
    this.handlers.onViewChange?.();
  }

  refreshTheme() {
    this.renderer.refreshPalette();
    this.requestDraw();
  }

  /** Gom nhiều yêu cầu vẽ trong cùng một khung hình. */
  requestDraw() {
    if (this._frame !== null) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      this.renderer.draw({
        curves: this.curves,
        inequalities: this.inequalities,
        nodes: this.selectMode ? this.nodes : [],
        selected: this.selectMode ? this.selected : [],
        region: this.region,
        hover: this.selectMode ? this.hover : null,
        cursor: this.cursor,
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Sự kiện                                                           */
  /* ---------------------------------------------------------------- */

  _bindEvents() {
    const canvas = this.canvas;

    canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this._onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this._onPointerUp(e));
    canvas.addEventListener('pointercancel', (e) => this._onPointerUp(e));
    canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.cursor = null;
      this.requestDraw();
    });
    canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    canvas.addEventListener('dblclick', (e) => this._onDoubleClick(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _localPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /**
   * Bắt/thả con trỏ có thể ném lỗi (`NotFoundError`) khi con trỏ đã kết thúc
   * trước lúc trình xử lý chạy. Không bọc lại thì cả thao tác bị huỷ giữa
   * chừng và khung nhìn kẹt ở trạng thái đang kéo.
   */
  _capturePointer(pointerId, capture) {
    try {
      if (capture) this.canvas.setPointerCapture?.(pointerId);
      else this.canvas.releasePointerCapture?.(pointerId);
    } catch {
      // Không bắt được con trỏ thì thao tác vẫn chạy bình thường.
    }
  }

  _onPointerDown(event) {
    this._capturePointer(event.pointerId, true);
    const point = this._localPoint(event);
    this._pointers.set(event.pointerId, point);

    if (this._pointers.size === 2) {
      const [a, b] = [...this._pointers.values()];
      this._pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      this._drag = null;
      return;
    }

    this._drag = { start: point, last: point, moved: 0, id: event.pointerId };
  }

  _onPointerMove(event) {
    const point = this._localPoint(event);

    if (this._pointers.has(event.pointerId)) this._pointers.set(event.pointerId, point);

    // Hai ngón: phóng to theo khoảng cách giữa hai điểm chạm.
    if (this._pointers.size === 2) {
      const [a, b] = [...this._pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (this._pinchDistance > 0 && distance > 0) {
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        this.view.zoomAt(midX, midY, distance / this._pinchDistance);
        this.handlers.onViewChange?.();
        this.requestDraw();
      }
      this._pinchDistance = distance;
      return;
    }

    if (this._drag && this._drag.id === event.pointerId) {
      const dx = point.x - this._drag.last.x;
      const dy = point.y - this._drag.last.y;
      this._drag.moved += Math.hypot(dx, dy);
      this._drag.last = point;

      if (this._drag.moved > CLICK_TOLERANCE_PX) {
        this.view.panByPixels(dx, dy);
        this.canvas.classList.add('is-panning');
        this.handlers.onViewChange?.();
        this.requestDraw();
      }
      return;
    }

    this.cursor = { x: this.view.worldX(point.x), y: this.view.worldY(point.y) };
    this._updateHover(point);
    this.requestDraw();
  }

  _onPointerUp(event) {
    this._capturePointer(event.pointerId, false);
    this._pointers.delete(event.pointerId);
    if (this._pointers.size < 2) this._pinchDistance = 0;
    this.canvas.classList.remove('is-panning');

    const drag = this._drag;
    this._drag = null;
    if (!drag || drag.id !== event.pointerId) return;

    // Di chuyển ít hơn ngưỡng thì coi như một cú bấm, không phải kéo.
    if (drag.moved <= CLICK_TOLERANCE_PX && this.selectMode) {
      this._handleClick(drag.start);
    }
  }

  _onWheel(event) {
    event.preventDefault();
    const point = this._localPoint(event);
    const intensity = event.deltaMode === 1 ? 0.05 : 0.0016;
    const factor = Math.exp(-event.deltaY * intensity);
    this.view.zoomAt(point.x, point.y, factor);
    this.handlers.onViewChange?.();
    this.requestDraw();
  }

  _onDoubleClick(event) {
    event.preventDefault();
    const point = this._localPoint(event);
    this.view.zoomAt(point.x, point.y, event.shiftKey ? 1 / 1.8 : 1.8);
    this.handlers.onViewChange?.();
    this.requestDraw();
  }

  /* ---------------------------------------------------------------- */
  /* Chọn điểm                                                         */
  /* ---------------------------------------------------------------- */

  _updateHover(point) {
    if (!this.selectMode) { this.hover = null; return; }
    const index = this._nodeAt(point);
    const next = index === null ? null : { index };
    const changed = (this.hover?.index ?? null) !== (next?.index ?? null);
    this.hover = next;
    this.canvas.classList.toggle('is-over-node', next !== null);
    if (changed) this.requestDraw();
  }

  _nodeAt(point) {
    let best = null;
    let bestDistance = NODE_HIT_RADIUS_PX;
    this.nodes.forEach((node, index) => {
      const distance = Math.hypot(
        this.view.screenX(node.x) - point.x,
        this.view.screenY(node.y) - point.y
      );
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    });
    return best;
  }

  _handleClick(point) {
    const index = this._nodeAt(point);
    if (index !== null) {
      this.handlers.onToggleNode?.(index);
      return;
    }
    // Bấm lên một đường cong (không trúng điểm nào) sẽ tạo thêm điểm mới tại
    // đó, cho phép lấy cận tích phân tuỳ ý chứ không chỉ ở các giao điểm.
    this.handlers.onPickCurvePoint?.({
      x: this.view.worldX(point.x),
      y: this.view.worldY(point.y),
      radius: CURVE_HIT_RADIUS_PX * this.view.pixelSize,
    });
  }

  /* ---------------------------------------------------------------- */
  /* Khung nhìn                                                        */
  /* ---------------------------------------------------------------- */

  zoomBy(factor) {
    this.view.zoomAt(this.view.width / 2, this.view.height / 2, factor);
    this.handlers.onViewChange?.();
    this.requestDraw();
  }

  resetView() {
    this.view.reset();
    this.handlers.onViewChange?.();
    this.requestDraw();
  }

  /** Đưa khung nhìn về ôm trọn các điểm đang chọn. */
  fitTo(points) {
    if (!points.length) { this.resetView(); return; }
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    const padX = Math.max(spanX * 0.3, 1);
    const padY = Math.max(spanY * 0.3, 1);
    this.view.fit(
      Math.min(...xs) - padX, Math.max(...xs) + padX,
      Math.min(...ys) - padY, Math.max(...ys) + padY
    );
    this.handlers.onViewChange?.();
    this.requestDraw();
  }

  exportPNG() {
    return this.renderer.toDataURL();
  }
}
