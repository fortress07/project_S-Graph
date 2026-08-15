/**
 * main.js — Ghép các phần lại thành ứng dụng.
 *
 * Luồng dữ liệu một chiều:
 *   người dùng gõ → phân tích biểu thức → dựng đường cong → vẽ lại
 *   chọn điểm     → suy luận vùng       → tính diện tích  → cập nhật bảng kết quả
 */

import { analyze } from './core/analyze.js';
import { ExplicitCurve, InverseCurve } from './core/curve.js';
import { findFeaturePoints, nearestCurvePoint } from './core/features.js';
import { analyzeRegion } from './core/region.js';

import { GraphCanvas } from './ui/graph.js';
import { Sidebar, CURVE_COLORS } from './ui/sidebar.js';
import { MathKeyboard } from './ui/keyboard.js';
import { ResultPanel } from './ui/result.js';
import { isMathQuillReady } from './ui/mathfield.js';
import { initTheme, toggleTheme, onThemeChange } from './ui/theme.js';
import { loadSession, saveSession, buildShareLink } from './ui/store.js';
import { toast } from './ui/toast.js';

const DEBOUNCE_ANALYZE = 120;
const DEBOUNCE_FEATURES = 200;

class App {
  constructor() {
    this.items = [];
    this.nextId = 1;
    this.selectMode = false;
    this.nodes = [];
    this.selected = [];
    this.customPoints = [];

    this.elements = {
      canvas: document.getElementById('graph-canvas'),
      list: document.getElementById('function-list'),
      addButton: document.getElementById('add-function'),
      keyboard: document.getElementById('keyboard'),
      keyboardToggle: document.getElementById('toggle-keyboard'),
      result: document.getElementById('result-panel'),
      selectToggle: document.getElementById('toggle-select'),
      clearSelection: document.getElementById('clear-selection'),
      hint: document.getElementById('select-hint'),
      sidebar: document.getElementById('sidebar'),
      sidebarToggle: document.getElementById('toggle-sidebar'),
      loader: document.getElementById('app-loader'),
    };

    // Trục Ox và Oy tham gia như hai đường cong bình thường, nhờ vậy nghiệm,
    // giao với trục tung và các vùng chặn bởi trục đều xử lý cùng một cơ chế.
    const axisStyle = { exprLatex: '0', isAxis: true, color: '#8b94a7' };
    this.axes = [
      new ExplicitCurve({ ...axisStyle, f: () => 0, latex: 'y=0', label: 'Trục Ox' }),
      new InverseCurve({ ...axisStyle, g: () => 0, latex: 'x=0', label: 'Trục Oy' }),
    ];

    this._init();
  }

  _init() {
    initTheme();

    this.graph = new GraphCanvas(this.elements.canvas, {
      onViewChange: () => this._onViewChange(),
      onToggleNode: (index) => this._toggleNode(index),
      onPickCurvePoint: (spec) => this._pickCurvePoint(spec),
    });

    this.sidebar = new Sidebar(this.elements.list, {
      onEdit: (id, latex) => this._onEdit(id, latex),
      onRemove: (id) => this._removeItem(id),
      onToggleHidden: (id) => this._toggleHidden(id),
      onCycleColor: (id) => this._cycleColor(id),
      onEnter: () => this._addItem(),
      onDeleteOut: (id) => this._removeIfEmpty(id),
    });

    this.keyboard = new MathKeyboard(this.elements.keyboard, {
      getTarget: () => this.sidebar.activeField(),
      onAction: (name) => { if (name === 'hide') this._setKeyboardVisible(false); },
    });

    this.resultPanel = new ResultPanel(this.elements.result);

    this._bindChrome();
    this._restoreSession();
    this._observeResize();

    onThemeChange(() => this.graph.refreshTheme());
    this.elements.loader?.remove();

    if (!isMathQuillReady()) {
      toast('Không tải được thư viện công thức — đang dùng ô nhập văn bản.', {
        tone: 'warning', duration: 6000,
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Khởi tạo giao diện chung                                          */
  /* ---------------------------------------------------------------- */

  _bindChrome() {
    this.elements.addButton.addEventListener('click', () => this._addItem());

    this.elements.selectToggle.addEventListener('click', () => {
      this._setSelectMode(!this.selectMode);
    });

    this.elements.clearSelection.addEventListener('click', () => {
      this._clearSelection();
    });

    this.elements.keyboardToggle.addEventListener('click', () => {
      this._setKeyboardVisible(!document.body.classList.contains('keyboard-open'));
    });

    this.elements.sidebarToggle?.addEventListener('click', () => {
      this.elements.sidebar.classList.toggle('is-open');
    });

    document.getElementById('toggle-theme')?.addEventListener('click', () => {
      toggleTheme();
    });

    document.getElementById('reset-view')?.addEventListener('click', () => {
      this.graph.resetView();
    });

    document.getElementById('zoom-in')?.addEventListener('click', () => this.graph.zoomBy(1.35));
    document.getElementById('zoom-out')?.addEventListener('click', () => this.graph.zoomBy(1 / 1.35));

    document.getElementById('share')?.addEventListener('click', () => this._share());
    document.getElementById('export-png')?.addEventListener('click', () => this._exportPNG());

    const help = document.getElementById('help-dialog');
    document.getElementById('open-help')?.addEventListener('click', () => help?.showModal());
    help?.querySelector('[data-close]')?.addEventListener('click', () => help.close());

    document.addEventListener('keydown', (event) => this._onKeyDown(event));
  }

  _onKeyDown(event) {
    const typing = event.target.closest('.function-field, input, textarea, [contenteditable]');

    if (event.key === 'Escape') {
      if (this.selected.length) this._clearSelection();
      else if (this.selectMode) this._setSelectMode(false);
      return;
    }
    if (typing) return;

    if (event.key === 'Enter') { this._addItem(); event.preventDefault(); }
    else if (event.key === 's' || event.key === 'S') this._setSelectMode(!this.selectMode);
    else if (event.key === '0') this.graph.resetView();
    else if (event.key === '+' || event.key === '=') this.graph.zoomBy(1.35);
    else if (event.key === '-') this.graph.zoomBy(1 / 1.35);
  }

  _observeResize() {
    const observer = new ResizeObserver(() => this.graph.resize());
    observer.observe(this.elements.canvas.parentElement);
    window.addEventListener('orientationchange', () => setTimeout(() => this.graph.resize(), 120));
  }

  _setKeyboardVisible(visible) {
    document.body.classList.toggle('keyboard-open', visible);
    this.elements.keyboardToggle.setAttribute('aria-pressed', String(visible));
    requestAnimationFrame(() => this.graph.resize());
  }

  /* ---------------------------------------------------------------- */
  /* Danh sách hàm số                                                  */
  /* ---------------------------------------------------------------- */

  _addItem(latex = '', options = {}) {
    const id = `f${this.nextId++}`;
    const color = options.color ?? CURVE_COLORS[(this.items.length) % CURVE_COLORS.length];
    this.items.push({ id, latex, color, hidden: Boolean(options.hidden), analysis: null, error: null, kindLabel: '' });

    this._analyzeItem(this.items[this.items.length - 1]);
    this.sidebar.render(this.items);
    if (!options.silent) this.sidebar.focusField(id);
    this._refreshScene();
    return id;
  }

  _removeItem(id) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) return;
    this.items.splice(index, 1);
    if (this.items.length === 0) this._addItem('', { silent: true });
    this.sidebar.render(this.items);
    this._clearSelection();
    this._refreshScene();
  }

  /** Xoá lùi ở ô rỗng thì bỏ luôn dòng đó và nhảy lên dòng trên. */
  _removeIfEmpty(id) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index <= 0 || this.items[index].latex !== '') return;
    const previous = this.items[index - 1].id;
    this.items.splice(index, 1);
    this.sidebar.render(this.items);
    this.sidebar.focusField(previous);
    this._refreshScene();
  }

  _toggleHidden(id) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) return;
    item.hidden = !item.hidden;
    this.sidebar.render(this.items);
    this._refreshScene();
  }

  _cycleColor(id) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) return;
    const index = CURVE_COLORS.indexOf(item.color);
    item.color = CURVE_COLORS[(index + 1) % CURVE_COLORS.length];
    this._analyzeItem(item);
    this.sidebar.render(this.items);
    this._refreshScene();
  }

  _onEdit(id, latex) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item || item.latex === latex) return;
    item.latex = latex;

    clearTimeout(this._analyzeTimer);
    this._analyzeTimer = setTimeout(() => {
      this._analyzeItem(item);
      this.sidebar.render(this.items);
      this._clearSelection();
      this._refreshScene();
      this._persist();
    }, DEBOUNCE_ANALYZE);
  }

  _analyzeItem(item) {
    const result = analyze(item.latex, { color: item.color });
    item.analysis = result;
    item.error = result.error;
    item.kindLabel = result.kindLabel;
  }

  /* ---------------------------------------------------------------- */
  /* Cảnh đồ thị                                                       */
  /* ---------------------------------------------------------------- */

  /** Danh sách đường cong đang hiển thị (không gồm hai trục). */
  visibleCurves() {
    return this.items
      .filter((item) => !item.hidden && item.analysis?.curve)
      .map((item) => {
        item.analysis.curve.color = item.color;
        return item.analysis.curve;
      });
  }

  /** Đường cong dùng khi suy luận vùng — có thêm hai trục toạ độ. */
  geometryCurves() {
    return [...this.visibleCurves(), ...this.axes];
  }

  _refreshScene() {
    this.graph.setCurves(this.visibleCurves());
    this.graph.setInequalities(
      this.items
        .filter((item) => !item.hidden && item.analysis?.inequality)
        .map((item) => ({ ...item.analysis.inequality, color: item.color }))
    );
    if (this.selectMode) this._scheduleFeatures();
  }

  _onViewChange() {
    if (this.selectMode) this._scheduleFeatures();
    clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => this._persist(), 500);
  }

  /* ---------------------------------------------------------------- */
  /* Chế độ chọn vùng                                                  */
  /* ---------------------------------------------------------------- */

  _setSelectMode(enabled) {
    this.selectMode = enabled;
    this.graph.setSelectMode(enabled);
    document.body.classList.toggle('select-mode', enabled);
    this.elements.selectToggle.classList.toggle('is-active', enabled);
    this.elements.selectToggle.setAttribute('aria-pressed', String(enabled));
    this._showHint(enabled);

    if (enabled) {
      this._setKeyboardVisible(false);
      this._computeFeatures();
      this.resultPanel.showEmpty();
    } else {
      this._clearSelection();
      this.graph.setNodes([]);
      this.resultPanel.showEmpty();
    }
  }

  /** Hiện gợi ý rồi tự mờ dần, tránh che đồ thị suốt phiên làm việc. */
  _showHint(visible) {
    const hint = this.elements.hint;
    clearTimeout(this._hintTimer);
    hint.classList.remove('is-fading');
    hint.hidden = !visible;
    if (!visible) return;
    this._hintTimer = setTimeout(() => {
      hint.classList.add('is-fading');
      this._hintTimer = setTimeout(() => { hint.hidden = true; }, 600);
    }, 5000);
  }

  _scheduleFeatures() {
    clearTimeout(this._featureTimer);
    this._featureTimer = setTimeout(() => this._computeFeatures(), DEBOUNCE_FEATURES);
  }

  _computeFeatures() {
    if (!this.selectMode) return;
    const bounds = this.graph.view.bounds();

    let points;
    try {
      points = findFeaturePoints(this.geometryCurves(), bounds);
    } catch (error) {
      console.error('Không dựng được điểm đặc biệt:', error);
      toast('Không phân tích được đồ thị hiện tại.', { tone: 'error' });
      points = [];
    }

    // Giữ lại những điểm người dùng tự thêm và những điểm đang được chọn.
    const previouslySelected = this.selected.map((index) => this.nodes[index]).filter(Boolean);
    const extras = [...this.customPoints, ...previouslySelected];
    for (const extra of extras) {
      const exists = points.some(
        (p) => Math.hypot(p.x - extra.x, p.y - extra.y) < bounds.pixelSize * 6
      );
      if (!exists) points.push({ ...extra });
    }

    this.nodes = points;
    this.selected = previouslySelected
      .map((point) => points.findIndex(
        (p) => Math.hypot(p.x - point.x, p.y - point.y) < bounds.pixelSize * 6
      ))
      .filter((index) => index >= 0);

    this.graph.setNodes(points);
    this.graph.setSelected(this.selected);
    this._recomputeRegion();
  }

  _toggleNode(index) {
    const position = this.selected.indexOf(index);
    if (position >= 0) this.selected.splice(position, 1);
    else this.selected.push(index);

    this.graph.setSelected(this.selected);
    this._recomputeRegion();
  }

  /** Bấm lên đường cong ở vị trí bất kỳ để thêm một đỉnh mới. */
  _pickCurvePoint({ x, y, radius }) {
    const bounds = this.graph.view.bounds();
    const hit = nearestCurvePoint(this.geometryCurves(), x, y, bounds, radius);
    if (!hit) return;

    const point = { x: hit.x, y: hit.y, kind: 'custom', curves: [hit.curve.id] };
    this.customPoints.push(point);
    this.nodes.push(point);
    this.selected.push(this.nodes.length - 1);

    this.graph.setNodes(this.nodes);
    this.graph.setSelected(this.selected);
    this._recomputeRegion();
  }

  _clearSelection() {
    this.selected = [];
    this.customPoints = [];
    this.graph.setSelected([]);
    this.graph.setRegion(null);
    this.resultPanel.showEmpty();
  }

  _recomputeRegion() {
    const vertices = this.selected.map((index) => this.nodes[index]).filter(Boolean);

    if (vertices.length < 2) {
      this.graph.setRegion(null);
      if (vertices.length === 0) this.resultPanel.showEmpty();
      else this.resultPanel.showHint(vertices.length);
      return;
    }

    let result;
    try {
      result = analyzeRegion(vertices, this.geometryCurves(), this.graph.view.bounds());
    } catch (error) {
      console.error('Không tính được diện tích:', error);
      toast('Không tính được diện tích cho vùng này.', { tone: 'error' });
      this.graph.setRegion(null);
      return;
    }

    if (!result.ok) {
      this.graph.setRegion(null);
      if (result.reason === 'too-many-points') {
        toast('Vùng có quá nhiều đỉnh — hãy bớt lại dưới 14 điểm.', { tone: 'warning' });
      }
      this.resultPanel.showHint(vertices.length);
      return;
    }

    this.graph.setRegion(result.polygon);
    this.resultPanel.show(result);
  }

  /* ---------------------------------------------------------------- */
  /* Lưu và chia sẻ                                                    */
  /* ---------------------------------------------------------------- */

  _sessionData() {
    return {
      functions: this.items
        .filter((item) => item.latex.trim())
        .map((item) => ({ latex: item.latex, color: item.color, hidden: item.hidden })),
      view: this.graph.view.serialize(),
    };
  }

  _persist() {
    saveSession(this._sessionData());
  }

  _restoreSession() {
    const session = loadSession();
    const entries = session?.functions ?? [];

    if (entries.length) {
      for (const entry of entries) {
        this._addItem(entry.latex, { color: entry.color, hidden: entry.hidden, silent: true });
      }
      if (session.view) {
        const { cx, cy, s } = session.view;
        if (Number.isFinite(cx)) this.graph.view.centerX = cx;
        if (Number.isFinite(cy)) this.graph.view.centerY = cy;
        if (Number.isFinite(s) && s > 0) this.graph.view.scale = s;
      }
    } else {
      // Ví dụ mở đầu: diện tích giữa parabol và đường thẳng.
      this._addItem('y=x^2', { silent: true });
      this._addItem('y=x', { silent: true });
    }

    this.sidebar.render(this.items);
    this._refreshScene();
    this.graph.requestDraw();
  }

  async _share() {
    const link = buildShareLink(this._sessionData());
    window.history.replaceState(null, '', link);
    try {
      await navigator.clipboard.writeText(link);
      toast('Đã sao chép liên kết chia sẻ', { tone: 'success' });
    } catch {
      toast('Liên kết đã nằm trên thanh địa chỉ', { tone: 'info' });
    }
  }

  _exportPNG() {
    try {
      const link = document.createElement('a');
      link.download = `s-graph-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = this.graph.exportPNG();
      link.click();
      toast('Đã xuất ảnh đồ thị', { tone: 'success' });
    } catch {
      toast('Không xuất được ảnh trên trình duyệt này', { tone: 'error' });
    }
  }
}

/* Khởi động sau khi DOM sẵn sàng và MathQuill đã có cơ hội tải xong. */
function start() {
  window.__S_GRAPH_READY__ = true;
  // Giữ tham chiếu ra ngoài để tiện gỡ lỗi từ bảng điều khiển trình duyệt
  // và để bộ kiểm thử giao diện điều khiển được ứng dụng.
  window.sGraph = new App();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
