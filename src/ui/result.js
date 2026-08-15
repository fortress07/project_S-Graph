/**
 * result.js — Bảng kết quả diện tích.
 *
 * Không chỉ hiện một con số: bảng này cho biết hệ thống đã *hiểu* vùng của
 * người dùng ra sao — những đường nào tạo nên biên, công thức tích phân tương
 * ứng, và cảnh báo nếu có cạnh phải nối thẳng. Nhờ vậy người học kiểm tra được
 * kết quả thay vì phải tin vào một con số không rõ nguồn gốc.
 */

import { renderStaticMath } from './mathfield.js';
import { toast } from './toast.js';

export class ResultPanel {
  constructor(root) {
    this.root = root;
    this.result = null;
    this._build();
  }

  _build() {
    this.root.innerHTML = `
      <div class="result-empty">
        <div class="result-empty-icon">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
               stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 17c4 0 5-11 9-11s5 8 9 8"/><path d="M3 21h18"/>
          </svg>
        </div>
        <p class="result-empty-title">Chưa chọn vùng nào</p>
        <p class="result-empty-hint">Bật <b>Chọn vùng</b> rồi bấm lần lượt các điểm bao quanh phần hình phẳng cần tính.</p>
      </div>
    `;
  }

  showEmpty() {
    this.result = null;
    this._build();
  }

  showHint(count) {
    this.result = null;
    this.root.innerHTML = `
      <div class="result-empty">
        <div class="result-progress"><span>${count}</span></div>
        <p class="result-empty-title">Đã chọn ${count} điểm</p>
        <p class="result-empty-hint">Cần ít nhất 2 điểm để khép kín một vùng.</p>
      </div>
    `;
  }

  /** @param {object} result Kết quả từ `analyzeRegion` */
  show(result) {
    this.result = result;
    this.root.replaceChildren();

    this.root.append(this._buildValue(result));
    if (result.formula) this.root.append(this._buildFormula(result.formula));
    if (result.boundary?.length) this.root.append(this._buildBoundary(result.boundary));
    if (result.warnings?.length) this.root.append(this._buildWarnings(result.warnings));
  }

  _buildValue(result) {
    const box = document.createElement('div');
    box.className = 'result-value';

    const label = document.createElement('div');
    label.className = 'result-label';
    label.textContent = result.approximate ? 'Diện tích (xấp xỉ)' : 'Diện tích';

    const number = document.createElement('div');
    number.className = 'result-number';
    number.innerHTML = `<span class="result-symbol">S</span><span class="result-equals">=</span>${result.display}`;

    box.append(label, number);

    if (result.exact) {
      const exact = document.createElement('div');
      exact.className = 'result-exact';
      exact.textContent = `= ${result.exact}`;
      box.append(exact);
    }

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'result-copy';
    copy.textContent = 'Sao chép';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(String(result.area));
        toast('Đã sao chép giá trị diện tích', { tone: 'success' });
      } catch {
        toast('Trình duyệt không cho phép sao chép', { tone: 'warning' });
      }
    });
    box.append(copy);

    return box;
  }

  _buildFormula(formula) {
    const box = document.createElement('div');
    box.className = 'result-section';
    box.innerHTML = '<div class="result-section-title">Công thức</div>';
    const math = document.createElement('div');
    math.className = 'result-formula';
    renderStaticMath(math, formula);
    box.append(math);
    return box;
  }

  _buildBoundary(boundary) {
    const box = document.createElement('div');
    box.className = 'result-section';
    box.innerHTML = '<div class="result-section-title">Đường biên</div>';

    const list = document.createElement('ul');
    list.className = 'boundary-list';
    for (const item of boundary) {
      const entry = document.createElement('li');
      entry.className = 'boundary-item';
      if (item.synthetic) entry.classList.add('is-synthetic');

      const dot = document.createElement('span');
      dot.className = 'boundary-dot';
      dot.style.background = item.color ?? 'currentColor';

      const name = document.createElement('span');
      name.className = 'boundary-name';
      // Hai trục hiển thị bằng tên quen thuộc ("Trục Ox") thay vì "y = 0".
      if (item.latex && !item.synthetic && !item.isAxis) renderStaticMath(name, item.latex);
      else name.textContent = item.label;

      entry.append(dot, name);
      list.append(entry);
    }
    box.append(list);
    return box;
  }

  _buildWarnings(warnings) {
    const box = document.createElement('div');
    box.className = 'result-section';
    for (const text of warnings) {
      const note = document.createElement('div');
      note.className = 'result-warning';
      note.textContent = text;
      box.append(note);
    }
    return box;
  }
}
