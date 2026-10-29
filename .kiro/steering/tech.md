---
inclusion: always
---

# Tech — Daily Loop OS

## Stack

| Lớp | Công nghệ |
|---|---|
| Framework | Next.js 15 (App Router) · React 19 · TypeScript (strict) |
| Styling | Tailwind CSS v4 · token tự khai báo theo `stitch_daily_loop_os/focus_flow/DESIGN.md` |
| Database | SQLite + Prisma ORM (file cục bộ, không server) |
| AI cloud | Anthropic SDK — `claude-opus-5` (chấm điểm/sinh nội dung), `claude-haiku-4-5` (phân loại) |
| AI local | Ollama HTTP API — `qwen2.5:7b`, `llama3.3`, `qwen2.5-coder:7b-instruct` |
| SRS | `ts-fsrs` (FSRS v4.5) |
| Speech | Web Speech API (`speechSynthesis` + `SpeechRecognition`) — không dùng dịch vụ trả phí |
| Charts | Recharts hoặc thư viện SVG tự viết (không thêm dependency nếu tránh được) |

## Quy tắc bất di bất dịch

1. **Local-first.** SQLite là nguồn sự thật. Không có API server-side nào giữ trạng thái.
2. **Không phụ thuộc dịch vụ ngoài để hoạt động cốt lõi.** Mất mạng → ghi vẫn được.
3. **Rubric là hằng số trong code**, không phải prompt sinh động. Xem `src/lib/rubrics.ts`.
4. **Prompt caching bắt buộc.** System prompt cố định là prefix có `cache_control`. Nội dung biến động (ngày, dữ liệu hôm nay) nằm **sau** breakpoint cuối, trong `messages`.
5. **Không nhét `Date.now()` / UUID vào system prompt** — sẽ phá cache mỗi lượt.
6. **API key lưu `.env.local`**, không commit, không hiển thị đầy đủ trong UI.
7. **Cấu trúc `Activity` là domain-agnostic** — điều kiện để phân tích tương quan chỉ số cá nhân ↔ hiệu suất học bằng 1 truy vấn SQL.

## AI Router (bắt buộc theo thiết kế)

Mọi tính năng AI đi qua **một router duy nhất** (`src/lib/ai/router.ts`), không gọi SDK trực tiếp từ route handler.

```
route handler → router.route(task) → { provider: "local" | "anthropic", model, effort }
                                 ├─ local     → Ollama HTTP (0 token, offline-safe)
                                 └─ anthropic → Anthropic SDK (streaming + prompt cache)
```

**Bảng routing — 17 task gọi AI (10 cloud · 7 local) + 1 task không gọi AI.** Mã `AI-xx` trỏ tới bảng routing đầy đủ trong `SPEC.md` §5.2.

| Task (router) | Provider | Model | Effort | Mã AI-xx |
|---|---|---|---|---|
| `autofill` | local | `qwen2.5:7b` | thấp | AI-02 |
| `classify` | local | `qwen2.5:7b` | thấp | AI-06 |
| `language_correct` | local | `qwen2.5-coder:7b-instruct` | thấp | AI-09 |
| `language_level` | local | `qwen2.5-coder:7b-instruct` | thấp | AI-16 |
| `test_from_content` | local | `qwen2.5:7b` | medium | AI-17 |
| `biometric_correlate` | local | `llama3.3` | thấp | AI-18 |
| `mock_next_question` | local | `llama3.3` | thấp | AI-19 |
| `daily_plan` | anthropic | `claude-opus-5` | medium | AI-01 |
| `grading` | anthropic | `claude-opus-5` | medium | AI-03 (viết) · AI-04 (nói) |
| `journal_feedback` | anthropic | `claude-opus-5` | thấp | AI-05 |
| `weekly_review` | anthropic | `claude-opus-5` | high | AI-07 |
| `roleplay` | anthropic | `claude-opus-5` | medium | AI-08 |
| `language_cards` | anthropic | `claude-haiku-4-5` | thấp | AI-10 |
| `mock_interview` | anthropic | `claude-opus-5` | medium | AI-11 |
| `mock_interview_turn` | anthropic | `claude-opus-5` | medium | AI-12 |
| `mock_interview_report` | anthropic | `claude-opus-5` | high | AI-13 |
| `language_test_grade` | anthropic | `claude-opus-5` | medium | AI-15 |
| `test_blueprint` | **không AI** | — | — | AI-14 |

**Fallback chain**: anthropic lỗi → local → rule cục bộ. Không bao giờ trả lỗi trần cho UI.

**3 điểm drift nhãn trong mockup — đã chốt:**
1. S06 ghi `Claude Haiku 4.5` cho classify trong khi S05 ghi `Local AI Haiku 4.5` cho tác vụ cùng loại — hai màn hình mâu thuẫn. `Haiku 4.5` là model **cloud**. Quyết định: **mặc định local** (`qwen2.5:7b`, 0 token, offline-safe, khớp badge `AI Offline / Local (Ollama)` toàn hệ thống + P6); đường cloud Haiku 4.5 là **tuỳ chọn** bật được trong S15.
2. S19 ghi `Ollama Qwen-2.5 7B` cho `from_content` → AI-17 chạy **local**, không cloud.
3. AI-14 (blueprint bài kiểm tra) **không gọi AI** — chọn lọc tất định từ thẻ đến hạn + ngân hàng seed (đúng FR-LT-12 "đề song song về độ khó").

Badge trên header phải hiển thị **provider thật đã trả lời** (đọc từ `AiCall.provider`), không hardcode.

## Design system — token bắt buộc

Nguồn chuẩn: `stitch_daily_loop_os/focus_flow/DESIGN.md` (YAML frontmatter).

**Lưu ý quan trọng**: file DESIGN.md và `tailwind.config` nhúng trong HTML **lệch nhau ở `borderRadius`**.

| Token | DESIGN.md | HTML config (thực tế đã dùng) | Quyết định |
|---|---|---|---|
| `rounded.sm` | 0.125rem | *(không định nghĩa)* | ✅ dùng `0.125rem` |
| `rounded` (DEFAULT) | 0.25rem | 0.125rem | ❌ lệch → **dùng HTML: 0.125rem** |
| `rounded.md` | 0.375rem | *(không có)* | dùng `rounded-lg` |
| `rounded.lg` | 0.5rem | **0.25rem** | ❌ lệch → **dùng HTML: 0.25rem** |
| `rounded.xl` | 0.75rem | **0.5rem** | ❌ lệch → **dùng HTML: 0.5rem** |
| `rounded.full` | 9999px | **0.75rem** | ❌ lệch → **dùng HTML: 0.75rem** |

→ **Dùng giá trị HTML thực tế** làm chuẩn (vì 21 màn hình đã được duyệt bằng bản đó), và ghi rõ trong `design.md`.

> ⚠️ **Đính chính quan trọng về `rounded-full`.** HTML dùng `rounded-full` 373 lần, nhưng `tailwind.config` đặt `full` trong `theme.extend.borderRadius` — `extend` **ghi đè** key gốc của Tailwind (mặc định `9999px`). Vì vậy `rounded-full` thực tế = **`0.75rem` (12px)**, KHÔNG phải `9999px`.
>
> **Đã kiểm chứng bằng pixel:** avatar header S01 là `w-8 h-8 rounded-full bg-primary` (32px); zoom 8× trên `s01/screen.png` cho thấy **góc bị vát phẳng (squircle), không phải hình tròn**.
>
> → **Không dùng `rounded-full` để làm hình tròn** trong code production. Cần tròn thật thì dùng `rounded-[9999px]` (tường minh) hoặc class riêng `rounded-pill`. Cập nhật `DESIGN.md`: `full` = `0.75rem`, `DEFAULT` = `0.125rem`.

Màu (đã xác minh giống nhau trên cả 21 màn hình):
- `primary` `#4edea3` (tint trên nền tối) · `primary-container` `#10b981` (nút chính, glow emerald `rgba(16,185,129,0.15–0.2)`)
- `secondary` `#c0c1ff` · `secondary-container` `#3131c0` — dành riêng cho **AI / tổng hợp**
- `tertiary` `#ffb95f` · `tertiary-container` `#e29100` — dành riêng cho **friction / cần ôn / đến hạn**
- `error` `#ffb4ab` · `error-container` `#93000a`
- Surface ladder: `#0a0e17` → `#181b25` → `#1c1f29` → `#262a34` → `#31353f`

Typography:
- `Space Grotesk` — headline (display / headline-lg / headline-md / headline-sm)
- `Be Vietnam Pro` — body (body-lg/md/sm) — chọn vì render dấu tiếng Việt không va chạm
- `JetBrains Mono` — code-md / label-md / label-sm — nhãn uppercase tracking `0.04em–0.06em`, dữ liệu bảng, phím tắt

**Convention phân vai màu bắt buộc**: emerald = tiến bộ/habit/đạt · indigo = AI/đánh giá tự động · amber = đến hạn/cần ôn/động.

## Layout

- Sidebar cố định `w-72` (288px), `bg-surface-container-lowest`, `border-r border-outline-variant/30`
- Header cố định `h-16`, `backdrop-blur-xl`, `bg-surface-container-lowest/80`
- Content wrapper `pl-72` + `max-w-[1600px] mx-auto` (một số màn hình dùng 1520px / 1540px / 1440px)
- Breakpoint: mobile `<768px` · tablet `768–1279px` · desktop `≥1280px` (`xl:grid-cols-12`)
- Baseline 4px — mọi spacing là bội số của `0.25rem`

## Lỗi đã biết trong bản HTML tham chiếu (KHÔNG được tái tạo)

1. `headline-sm` bị định nghĩa sai (`0.8125rem` thay vì `1.25rem`) ở **s01, s03, s10, s18** → cấu hình token chuẩn phải dùng `1.25rem`. (Đã verify: 17 màn hình còn lại đã đúng `1.25rem`.)
2. `borderRadius` lệch như bảng trên.
3. `data-path` không nhất quán giữa các màn hình (`cay-ky-nang` vs `s03-cay-ky-nang-bang-chung`).
4. Sidebar thiếu trạng thái active ở hầu hết màn hình → phải dùng **một** cơ chế `NAV_ITEMS` dùng chung.
5. `playAudio` dùng global `event` ngầm (s21) → phải truyền `event` qua tham số.
6. s15 có literal API key hardcode trong `<input type="password">` → phải đọc từ `.env.local`.
7. s16 JS tìm class `.role-selected-badge` không tồn tại trong markup.
8. s20 quảng bá phím `[P]`, `[F]`, `[Ctrl+Enter]` nhưng `keydown` chỉ xử lý `Space` và `1–4`.
9. `grid-cols-8` cố định ở s17/s20 → không co được trên mobile.
10. Chú thích tooltip/legend ở s15, s19, s21 lệch nhau (ví dụ "Writing Rubric" vs "Communication").

## Quy tắc khi sinh code từ thiết kế

- 21 màn hình nằm ở `stitch_daily_loop_os/s<NN>_<slug>/{code.html,screen.png}` — đây là **bản tham chiếu trực quan**, không phải code production.
- Mọi màn hình dùng chung: sidebar 9 mục + header 4 chip + footer DB status.
  Nav 9 mục: Hôm nay (Daily Loop) · Cây kỹ năng · Ôn tập ngoại ngữ (SRS) · Luyện giao tiếp · Nhật ký & AI · Mock Interview · Bài kiểm tra · Báo cáo tuần & tiến độ · Cài đặt.
  Header chip: ngày (`Thứ Tư 29/10`) · `Streak 12 ngày` (tertiary) · `Năng lượng tuần 78%` (primary) · `AI Offline / Local (Ollama)` (secondary) + CTA `+ Ghi nhanh (≤10s)`.
- Icon: Material Symbols Outlined (Google Fonts), dùng tên semantic (`today`, `account_tree`, `style`, `edit_note`, `mic`, `quiz`, `analytics`, `settings`).
