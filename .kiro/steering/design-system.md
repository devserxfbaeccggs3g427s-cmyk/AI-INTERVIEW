---
inclusion: always
---

# Steering — Design System (Focus Flow)

> Nguồn chân lý: `system-design/focus_flow/DESIGN.md` + prototype `system-design/s*/code.html`.
> Bảng màu Tailwind đã dùng thực tế trong prototype được lấy nguyên vẹn từ `tailwind.config` trong `code.html`.

## 1. Triết lý thị giác

High-density, distraction-free. Swiss-inspired functionalism + tactile cues của dev-tools.
Người dùng: chuyên gia, kỹ sư phần mềm, nghiên cứu viên, người học suốt đời — tại Việt Nam.
Giao diện phải **không gây quá tải giác quan** nhưng vẫn **chính xác như máy đo**.

**Ba trục cấu trúc trong mọi màn hình:**

1. **Top Analytical Status Strip** — lưới 12 cột: bento 8 cột (mục tiêu hạt nhân + số liệu) + bento 4 cột (sinh trắc & nhịp độ).
2. **Main Content Module** — khối công việc chính.
3. **Persistent Action Rail** — thanh hành động dính (quick-log luôn ở đáy vùng ngón cái).

## 2. Bảng màu (token chuẩn — dùng tên class, không hex)

### Màu nhấn (accent)

| Token Tailwind | Hex | Vai trò |
|---|---|---|
| `primary` | `#4edea3` | Tiến bộ, hoàn thành, streak, mốc kỹ năng. Nền chip: `primary/10`. |
| `primary-container` | `#10b981` | Nền nút primary (chữ `on-primary` = `#003824`). |
| `secondary` | `#c0c1ff` | Mọi thao tác **AI**: chấm điểm, sinh nội dung, insight. |
| `secondary-container` | `#3131c0` | Nền mạnh cho AI. |
| `tertiary` | `#ffb95f` | **Ma sát đang chờ**: thẻ đến hạn, deadline, drill cần chú ý. |
| `tertiary-container` | `#e29100` | Nền tertiary. |
| `error` | `#ffb4ab` | Lỗi. Nền: `error-container` = `#93000a`. |

### Mặt phẳng (surface) — tạo chiều sâu bằng tông, không bằng đổ bóng

| Token | Hex | Dùng cho |
|---|---|---|
| `surface` / `background` | `#0f131c` | Nền canvas + `body`. |
| `surface-container-lowest` | `#0a0e17` | Ô nhập liệu recessed. |
| `surface-container-low` | `#181b25` | Card phụ, panel nhỏ. |
| `surface-container` | `#1c1f29` | **Card/module chính** (mặt phẳng 1). |
| `surface-container-high` | `#262a34` | Nút ghost, chip, hover. |
| `surface-container-highest` | `#31353f` | Track progress bar, ô metric. |
| `surface-variant` / `surface-bright` | `#31353f` / `#353943` | Phân đoạn chưa hoàn thành trong segmented bar. |
| `surface-dim` | `#0f131c` | Header phụ. |

### Chữ

| Token | Hex | Dùng cho |
|---|---|---|
| `on-surface` | `#dfe2ef` | Tiêu đề, nội dung chính. |
| `on-surface-variant` | `#bbcabf` | Nội dung phụ. |
| `outline` | `#86948a` | Nhãn uppercase nhỏ, metadata. |
| `outline-variant` | `#3c4a42` | Viền mảnh. |
| `on-primary` | `#003824` | Chữ trên nền primary-container. |
| `on-secondary` | `#1000a9` | Chữ trên nền secondary-container. |
| `on-tertiary` | `#472a00` | Chữ trên nền tertiary-container. |

> **Lưu ý tương phản:** `outline` `#86948a` trên `surface-container` `#1c1f29` ≈ 4.9:1 — đạt WCAG AA cho text nhỏ.
> Dùng `outline` cho **label**, không dùng cho body text.

## 3. Typography

3 font, mỗi font 1 vai trò. Không trộn.

| Token | Font | Size / line-height / tracking | Weight | Dùng cho |
|---|---|---|---|---|
| `display` | Space Grotesk | 3.5rem / 4rem / -0.03em | 700 | Hero duy nhất (trang kết quả). |
| `headline-lg` | Space Grotesk | 2.25rem / 2.75rem / -0.025em | 600 | Tiêu đề trang desktop. |
| `headline-lg-mobile` | Space Grotesk | 1.75rem / 2.25rem / -0.02em | 600 | Tiêu đề trang mobile. |
| `headline-md` | Space Grotesk | 1.5rem / 2rem / -0.02em | 600 | Tiêu đề khối. |
| `headline-sm` | Space Grotesk | 1.25rem / 1.75rem / -0.015em | 500 | Tiêu đề card/section nhỏ. |
| `body-lg` | Be Vietnam Pro | 1.125rem / 1.875rem | 400 | Đoạn nhật ký, bài viết. |
| `body-md` | Be Vietnam Pro | 0.9375rem / 1.625rem | 400 | **Body mặc định.** |
| `body-sm` | Be Vietnam Pro | 0.8125rem / 1.375rem / 0.005em | 400 | Caption, mô tả phụ. |
| `label-md` | JetBrains Mono | 0.75rem / 1rem / 0.04em | 500 | Nhãn nút, chip. |
| `label-sm` | JetBrains Mono | 0.6875rem / 0.875rem / 0.06em | 600 | Label uppercase nhỏ, hotkey. |
| `code-md` | JetBrains Mono | 0.875rem / 1.5rem / -0.01em | 500 | Số liệu tabular, FSRS params. |

**Quy tắc bắt buộc:**
- **Tiếng Việt phải dùng Be Vietnam Pro** — line-height mở rộng (`1.625rem` trên `body-md`) để dấu câu (hỏi/ngã/nặng/sắc) không chồng lên ascender.
- **Mọi label uppercase phải JetBrains Mono** với tracking `0.04em`–`0.06em` để scan ngoại vi.
- Số liệu tabular (FSRS `S`/`D`, streak, token count) dùng `code-md` + `font-variant-numeric: tabular-nums`.

## 4. Layout & Spacing

### Breakpoint

| Kích thước | Cấu trúc |
|---|---|
| **≥1280px (xl)** | Lưới 12 cột. Container tối đa **1520px** (dashboard) / **896px** (`max-w-4xl`, chế độ 1 nhiệm vụ: flashcard drill, transcript đánh giá). Margin ngoài `margin-lg` (2.5rem), gutter `gutter-lg` (1.5rem). |
| **768–1279px (md→lg)** | Lưới 8 cột. Sidebar → icon-only hoặc drawer. Margin `margin-md` (1.5rem), gutter `gutter-md` (1.25rem). |
| **<768px** | Lưới 4 cột, 1 cột dọc. Quick-log dock cố định đáy màn hình, margin `margin` (1rem), gutter `gutter` (1rem). |

### Spacing scale (bội số của 0.25rem / 4px)

`space-xs` 0.25 · `space-sm` 0.5 · `space-md` 0.75 · `space-lg` 1.25 · `space-xl` 2rem
`gutter` 1rem · `gutter-md` 1.25rem · `gutter-lg` 1.5rem
`margin` 1rem · `margin-md` 1.5rem · `margin-lg` 2.5rem

Dùng tên class: `p-space-lg`, `gap-gutter-md`, `mb-space-md`, `p-margin-lg`.

### Pattern lặp lại (từ prototype)

```html
<div class="p-margin-lg space-y-gutter-lg max-w-[1520px] mx-auto w-full">
  <div class="grid grid-cols-1 xl:grid-cols-12 gap-gutter-md">
    <div class="xl:col-span-8 bg-surface-container rounded-xl p-space-lg shadow-md relative overflow-hidden flex flex-col justify-between">
    <div class="xl:col-span-4 bg-surface-container-low rounded-xl p-space-lg shadow-md flex flex-col justify-between">
```

## 5. Elevation & Depth (không đổ bóng nặng)

| Mức | Nền | Viền | Hiệu ứng |
|---|---|---|---|
| **0 — Canvas** | `surface` `#0f131c` | — | Nền, không tương tác. |
| **1 — Card/Module** | `surface-container` `#1c1f29` | `1px solid rgba(148,163,184,0.08)` | `shadow-md` là đủ. |
| **2 — Hover / Active node** | `surface-container-high` `#262a34` | — | `inset 0 1px 0 0 rgba(255,255,255,0.05)` + `0 4px 12px -2px rgba(0,0,0,0.4)` |
| **3 — Modal / Sheet / Command palette** | `surface-container` + `backdrop-blur-md` | `1px solid rgba(148,163,184,0.16)` | Overlay `rgba(9,13,22,0.8)` |
| **Active glow** | — | — | Emerald `rgba(16,185,129,0.15)` (habit/mastery) · Indigo `rgba(99,102,241,0.2)` (AI evaluation) |

## 6. Shapes

- `rounded-sm` = 0.125rem (2px) → chip, progress segment, node kỹ năng (rigid, mang tính cấu trúc).
- `rounded` = 0.25rem (4px) → micro-component (badge, hotkey chip).
- `rounded-lg` = 0.375rem (6px) → **button, input, selector**.
- `rounded-xl` = 0.5rem (8px) → **card, panel, flashcard, dialog**.
- `rounded-full` = 0.75rem+ → **chỉ** avatar & radial completion ring.

> `borderRadius` trong `tailwind.config` của prototype: `DEFAULT 0.125`, `lg 0.25`, `xl 0.5`, `full 0.75`.
> Tailwind v4 dùng tên `rounded-sm|md|lg|xl|full` — map theo bảng trên, không dùng `rounded-2xl` trừ khi cần.

## 7. Component patterns (chép từ prototype)

### 7.1 Nút

| Loại | Nền | Chữ | Hiệu ứng |
|---|---|---|---|
| **Primary** | `bg-primary-container text-on-primary` | `font-label-md font-semibold` | `hover:brightness-105 active:scale-[0.98]` |
| **AI Action** | `bg-surface-container-high text-secondary` + viền `rgba(99,102,241,0.4)` | `font-label-md` | + icon `neurology`/`auto_awesome` |
| **Ghost** | nền trong suốt + `1px solid rgba(148,163,184,0.12)` | `text-outline` | `hover:bg-white/[0.04] hover:text-on-surface` |
| **Icon** | trong suốt | `material-symbols-outlined` 16–24px | `rounded-lg p-2` |

Icon là **Material Symbols Outlined** (Google Fonts), class `material-symbols-outlined`, size 16/18/20/24px.

### 7.2 Label uppercase

```html
<span class="font-label-sm text-label-sm text-outline uppercase tracking-wider">BẰng chứng xác thực</span>
```

### 7.3 Metric tile (bento)

```html
<div class="bg-surface-container p-space-sm rounded-lg flex items-center justify-between">
  <div>
    <div class="font-label-sm text-label-sm text-outline uppercase tracking-wider">Tâm trạng (Mood)</div>
    <div class="font-headline-sm text-headline-sm text-on-surface font-semibold">4 / 5</div>
  </div>
  <span class="material-symbols-outlined text-primary text-[24px]">electric_bolt</span>
</div>
```

### 7.4 Progress bar (2 loại)

**Segmented (thang level 0–5):** track `bg-surface-container-highest` + phân đoạn `bg-primary` / `bg-surface-variant`.

```html
<div class="w-full h-2 rounded bg-surface-container-highest overflow-hidden flex gap-1 p-0.5">
  <div class="h-full bg-primary rounded-sm" style="width:40%"></div>
  <div class="h-full bg-primary rounded-sm" style="width:28%"></div>
  <div class="h-full bg-surface-variant rounded-sm" style="width:32%"></div>
</div>
```

**Tuyến tính (0–100%):** track `bg-surface-container-highest`, fill `bg-primary`, chiều cao `h-1.5` / `h-2`.

### 7.5 Nhãn domain

Domain dùng **màu riêng**:
- `professional` → `secondary` (indigo) — chuyên môn, hệ thống
- `professional` (AI) → `secondary`
- `communication` → `tertiary` (amber)
- `language` → `primary` (emerald)
- `language` (secondary) → `primary`
- `tertiary` → `tertiary`
- `personal` → `on-surface-variant`

### 7.6 Flashcard (S10)

- Nền `surface-container`, min-height `340px`, viền `1px solid rgba(148,163,184,0.08)`.
- Câu hỏi căn giữa, `font-headline-sm`.
- Thanh chấm 4 nút: baseline màu **Red · Amber · Emerald · Indigo** theo thứ tự Again · Hard · Good · Easy.
- Subtext khoảng cách lượt ôn tới: `font-label-sm`.

### 7.7 Rubric panel (AI)

```html
<div class="bg-surface-container border border-secondary/30 rounded-xl p-space-lg">
  <!-- chip điểm -->
  <span class="font-label-md text-label-md px-2 py-1 rounded bg-secondary/10 text-secondary">Ngữ pháp: 9/10</span>
</div>
```

### 7.8 Tree node (cây kỹ năng)

- Node = card modular, viền `1px`, bo góc **nhọn** (`rounded-sm`).
- Đường nối: `1.5px dashed rgba(148,163,184,0.2)` → đổi sang emerald solid khi prerequisite hoàn tất.
- Node đang active: vòng bo `primary`, glow emerald.

## 8. Iconography

Material Symbols Outlined qua CDN:

```html
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet"/>
```

Icon dùng trong prototype: `neurology` (AI), `bolt` (quick-log), `add_circle`, `edit`, `style`, `psychology_alt`,
`track_changes`, `balance`, `lightbulb`, `volume_up`, `mic`, `flag`, `pause`, `timer`, `analytics`,
`monitor_heart`, `electric_bolt`, `center_focus_strong`, `bedtime`, `layers`, `memory`, `keyboard`,
`graphics_eq`, `fact_check`, `person`, `translate`, `quiz`, `account_tree`, `offline_bolt`, `verified`, `close`, `send`.

## 9. A11y (NFR-06)

- Tương phản ≥ WCAG AA: dùng `on-surface` cho text, `outline` cho **label** (không dùng cho body).
- Mọi icon-only button có `aria-label`.
- Phản hồi AI / toast → `aria-live="polite"`.
- Phím tắt hiển thị bằng chip `font-label-sm` trong nền `surface-container-high`.
- Flashcard: `Space` lật thẻ, `1`–`4` chấm điểm, `R` nghe phát âm — phải có trong `aria-keyshortcuts`.
- Focus ring: dùng `focus-visible:ring-2 focus-visible:ring-primary` — **không** dùng OS ring mặc định trên input.

## 10. Lint rules cho AI khi implement

- Không hardcode hex — dùng class token (`bg-surface-container`, `text-secondary`).
- Không dùng `rounded-2xl` / `rounded-3xl` — bảng Shapes §6.
- Không thêm font mới.
- Mọi nhãn uppercase → `font-label-sm` + `tracking-wider`.
- Icon 16–24px, không dùng icon làm nhãn duy nhất nếu không có `aria-label`.
- Không dùng `shadow-xl`/`2xl` — chỉ `shadow-md` cho card.
- Chart: dùng màu token, không dùng palette mặc định của thư viện.
