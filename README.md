<div align="center">

<img src="assets/banner.svg" alt="S-Graph" width="100%">

# S-Graph

**Vẽ đồ thị hàm số và tính diện tích hình phẳng bằng cách bấm chọn điểm ngay trên đồ thị.**

[![CI](https://github.com/fortress07/project_S-Graph/actions/workflows/ci.yml/badge.svg)](https://github.com/fortress07/project_S-Graph/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2563eb.svg)](LICENSE)
[![Không phụ thuộc](https://img.shields.io/badge/build-kh%C3%B4ng%20c%E1%BA%A7n%20d%E1%BB%B1ng-22c58b.svg)](#chạy-thử)

[Dùng thử](#chạy-thử) · [Tính năng](#tính-năng) · [Cú pháp](#cú-pháp-toán-học) · [Cách hoạt động](#cách-hoạt-động) · [Kiến trúc](#kiến-trúc)

</div>

---

## Ý tưởng

Bài toán "tính diện tích hình phẳng giới hạn bởi các đường…" xuất hiện dày đặc trong chương trình giải tích phổ thông. S-Graph biến nó thành thao tác trực quan:

> **Nhập các đường biên → bấm chọn những điểm bao quanh vùng → nhận diện tích chính xác kèm công thức tích phân.**

Điểm cốt lõi nằm ở chữ *suy luận*: người dùng chỉ đánh dấu vài **đỉnh**, còn việc tìm ra **cạnh nào của vùng nằm trên đường cong nào** là do chương trình tự phân tích.

---

## Tính năng

### Vẽ đồ thị

| Loại | Ví dụ | Ghi chú |
|---|---|---|
| Hàm số | `y = x^2 - 2x` | Tự ngắt nét tại tiệm cận đứng |
| Hàm theo y | `x = y^2`, `x = 2` | Kể cả đường thẳng đứng |
| Đường cong ẩn | `x^2 + y^2 = 25`, `x^2/9 + y^2/4 = 1` | Tròn, elip, hypebol, mọi phương trình bậc bất kỳ |
| Toạ độ cực | `r = 3cos(2θ)` | Hoa hồng, đường xoắn ốc… |
| Đường tham số | `(cos t, sin t)` | Mặc định `t ∈ [0, 2π]` |
| Điểm | `(2, 3)` | |
| Miền nghiệm | `y < x^2`, `x^2 + y^2 ≤ 9` | Tô miền, biên nét đứt khi bất đẳng thức nghiêm ngặt |
| Giới hạn miền | `y = x^2 {0 < x < 3}` | Chỉ vẽ trong khoảng chỉ định |

### Tính diện tích

- **Nhận diện vùng tự động** — chọn các đỉnh, chương trình tìm ra chu trình khép kín đi theo đúng các đường cong.
- **Đúng với cả vùng lõm** và vùng có nhiều đường biên khác nhau.
- **Trục Ox, Oy luôn là đường biên hợp lệ**, không cần nhập thêm `y = 0`.
- **Bấm thẳng lên đường cong** để thêm đỉnh ở vị trí tuỳ ý, lấy cận tích phân bất kỳ.
- **Nhận dạng kết quả đẹp** — hiện `1/6`, `9π`, `16/3` bên cạnh giá trị thập phân.
- **Giải thích kết quả** — liệt kê các đường tạo nên biên và dựng công thức `S = ∫ₐᵇ |f − g| dx` khi vùng đủ đơn giản.

### Giao diện

Giao diện sáng/tối · bàn phím toán học ảo · lưu phiên tự động · liên kết chia sẻ · xuất ảnh PNG · phím tắt · dùng được trên điện thoại (kéo, chụm để phóng to).

---

## Chạy thử

Dự án là trang tĩnh thuần, **không cần bước dựng, không cần cài gói nào**.

```bash
git clone https://github.com/fortress07/project_S-Graph.git
cd project_S-Graph
npm start           # mở http://localhost:8080
```

> [!NOTE]
> Mã nguồn dùng ES module nên trình duyệt chặn khi mở trực tiếp bằng `file://`.
> Hãy chạy qua máy chủ cục bộ như trên (hoặc `npx serve`, `python -m http.server`).
> Khi triển khai lên GitHub Pages thì mở thẳng được.

Chạy kiểm thử:

```bash
npm test            # 42 phép thử cho lõi tính toán, không cần phụ thuộc ngoài
```

Kiểm thử giao diện chạy trong trình duyệt: mở `tests/ui-check.html`.

---

## Cú pháp toán học

Ô nhập dùng [MathQuill](http://mathquill.com/), gõ được như viết tay. Bàn phím ảo có sẵn mọi ký hiệu.

```
Phép toán      + − × ÷ ^ !   (x+1)(x−2)   2x   3π
Căn thức       √x   ∛x   ⁿ√x
Phân số        a/b (lồng nhau bao nhiêu tầng cũng được)
Lượng giác     sin cos tan cot sec csc + hàm ngược (sin⁻¹) + hyperbolic
Logarit        ln x   log x (cơ số 10)   log₂ x
Khác           |x|   ⌊x⌋   ⌈x⌉   n!   30°   π   e   ∞
So sánh        = < > ≤ ≥
```

**Quy ước cần biết**

- `log` là logarit cơ số **10**, `ln` là logarit tự nhiên (theo chương trình phổ thông Việt Nam).
- Hàm không ngoặc gom đối số theo lối viết tay: `sin 2x` → `sin(2x)`, nhưng `sin x cos x` → `sin(x)·cos(x)`.
- Ngoài tập xác định trả về "không xác định" chứ không trả số phức: `√(−1)` làm nét vẽ đứt đúng chỗ.
- Căn bậc lẻ của số âm vẫn tính được: `(−8)^(1/3) = −2`.

---

## Cách hoạt động

### 1. Từ chuỗi LaTeX đến hàm số

```
LaTeX → cây cú pháp → closure JavaScript
```

Không dùng `eval` hay `new Function`, cũng không dùng chuỗi biểu thức chính quy thay thế. Bộ phân tích cú pháp kiểu Pratt xử lý đúng phép nhân ngầm, hàm không ngoặc, luỹ thừa kết hợp phải và so sánh nối chuỗi. Nhờ đọc nhóm `{…}` theo đúng độ sâu, các biểu thức lồng nhau như `\frac{x^{2}}{3}` hay `\sqrt{x^{2}}` đều chính xác.

### 2. Một giao diện chung cho mọi đường cong

Mỗi đường cong — dù là hàm số, đường ẩn, đường cực hay đường tham số — đều cung cấp:

| Phương thức | Ý nghĩa |
|---|---|
| `branches(view)` | Các nhánh liên tục, dạng đường gấp khúc kèm tham số |
| `residual(x, y)` | Hàm `F(x, y)` triệt tiêu trên đường cong |
| `pointAt(nhánh, t)` | Toạ độ ứng với tham số `t` |
| `arcIntegral(nhánh, t₀, t₁)` | Đóng góp `∮ −y dx` của cung |

Nhờ vậy bộ tìm giao điểm và bộ tính diện tích chỉ cần viết **một lần** cho tất cả các loại.

### 3. Tìm giao điểm

Cắt đoạn trên đường gấp khúc (có lưới băm không gian để khỏi so sánh mọi cặp) cho vị trí gần đúng, rồi **lặp Newton hai chiều** trên cặp hàm dư `F, G` để đưa về độ chính xác cỡ sai số máy. Giao điểm của một parabol với một đường tròn cũng chính xác như giao của hai đường thẳng.

### 4. Suy luận vùng cần tính

Đây là phần cốt lõi:

1. Với mỗi đường cong, xác định tham số của từng đỉnh nằm trên nó, **sắp xếp theo tham số** rồi nối các đỉnh *liền kề* thành cung — cung như vậy chắc chắn liên tục và không nhảy qua đỉnh nào khác.
2. Bổ sung cung thẳng nối mọi cặp đỉnh, đánh dấu là *cung phụ*.
3. Tìm **chu trình đi qua đúng một lần mỗi đỉnh**, ưu tiên: ít cung phụ nhất → không tự cắt → chu vi nhỏ nhất. Đó chính là vùng "khít" nhất quanh các điểm đã chọn.
4. Tính diện tích bằng **định lý Green**: `S = |∮ −y dx|`.

Mỗi loại đường cong dùng công thức tích phân riêng để giữ độ chính xác:

| Loại | Công thức đóng góp |
|---|---|
| `y = f(x)` | `−∫ f dx` — cầu phương Gauss–Kronrod thích nghi |
| `x = g(y)` | `∫ g dy − [x·y]` — tích phân từng phần, khử được đạo hàm |
| Đường ẩn | Tích phân chính xác trên cung parabol qua 3 điểm đã chiếu Newton |
| Cực, tham số | `−∫ y·x′ dt` với đạo hàm số bậc 4 |

Sai số thực đo được: **1e-12** với hàm số, **1e-10** với đường ẩn, cực và tham số.

---

## Kiến trúc

```
src/
├── core/            ← toán học thuần, không đụng DOM, chạy được trên Node
│   ├── mathlib.js     hằng số và hàm số, ngoài tập xác định trả NaN
│   ├── latex.js       LaTeX → chuỗi trung tố (đọc nhóm {…} theo độ sâu)
│   ├── parser.js      tách token + phân tích cú pháp Pratt → AST
│   ├── compile.js     AST → closure (không eval)
│   ├── analyze.js     nhận diện loại đối tượng từ cấu trúc AST
│   ├── curve.js       mô hình đường cong thống nhất + marching squares
│   ├── numeric.js     Gauss–Kronrod, Newton, chia đôi, nhận dạng số đẹp
│   ├── features.js    giao điểm, cực trị, đầu mút
│   └── region.js      dựng cung, tìm chu trình, định lý Green
├── ui/              ← lớp giao diện
│   ├── view.js        đổi toạ độ toán học ↔ màn hình
│   ├── renderer.js    vẽ canvas (lưới, trục, đường, vùng tô, điểm)
│   ├── graph.js       kéo, phóng to, chạm, chọn điểm
│   ├── mathfield.js   bọc MathQuill, có phương án dự phòng
│   ├── keyboard.js    bàn phím toán học ảo
│   ├── sidebar.js     danh sách hàm số
│   ├── result.js      bảng kết quả và diễn giải
│   ├── store.js       lưu phiên và liên kết chia sẻ
│   ├── theme.js       giao diện sáng/tối
│   └── toast.js       thông báo ngắn
├── styles/          ← biến thiết kế + bố cục + bàn phím
└── main.js          ← ghép mọi thứ lại
```

Toàn bộ `src/core/` là ES module thuần không phụ thuộc DOM, nên kiểm thử chạy thẳng trên Node mà không cần công cụ dựng nào.

**Phụ thuộc ngoài:** chỉ MathQuill (ô nhập công thức) và jQuery (MathQuill cần). Cả hai nạp từ CDN kèm mã băm SRI. Mất mạng thì ứng dụng tự chuyển sang ô nhập văn bản và vẫn dùng được đầy đủ.

---

## Phím tắt

| Phím | Tác dụng |
|---|---|
| `S` | Bật/tắt chế độ chọn vùng |
| `Enter` | Thêm hàm số mới |
| `Esc` | Bỏ chọn / thoát chế độ chọn |
| `0` | Về khung nhìn mặc định |
| `+` `−` | Phóng to / thu nhỏ |
| Lăn chuột | Phóng to quanh con trỏ |
| Bấm đúp | Phóng to (giữ `Shift` để thu nhỏ) |

---

## Hướng phát triển

- [ ] Thanh trượt cho tham số (`y = ax² + bx + c`)
- [ ] Thể tích khối tròn xoay quanh Ox / Oy
- [ ] Xuất lời giải từng bước ra PDF
- [ ] Bảng giá trị và điểm đặc biệt của hàm số

---

## Giấy phép

[MIT](LICENSE)
