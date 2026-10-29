# Design Document — Daily Loop OS

> Tài liệu thiết kế kỹ thuật. Nguồn: `SPEC.md` (v1.2) + 21 màn hình Stitch (`stitch_daily_loop_os/sXX_*/code.html` + `screen.png`) + `stitch_daily_loop_os/focus_flow/DESIGN.md`.

---

## 1. Overview

### 1.1 Mục tiêu thiết kế

Daily Loop OS là ứng dụng **single-user, local-first** chạy trên máy người dùng. Kiến trúc tối giản: một Next.js app, một file SQLite, một thư mục `.env.local`. Không server phụ, không queue, không worker, không dịch vụ bên thứ ba ngoài Anthropic API.

**Ba đặc tính kiến trúc bắt buộc:**

1. **Local-first** (P6) — mọi đọc/ghi diễn ra qua Prisma → SQLite. Không có API nội bộ nào là nguồn sự thật.
2. **AI là lớp phụ trợ, không phải lớp dữ liệu** — AI sinh nội dung và chấm điểm; **không** AI lưu trữ trạng thái. Mọi kết quả AI được ghi xuống bảng thường để offline vẫn xem lại được.
3. **Evidence-driven** (P3) — `Skill.level` chỉ được tăng bởi `Evidence`, không bởi checkbox hay bởi AI tự khai.

### 1.2 Stack & phiên bản

| Lớp | Công nghệ | Ghi chú |
|---|---|---|
| Framework | Next.js **15**, App Router, RSC | `output: 'standalone'` cho chạy local ổn định |
| Ngôn ngữ | TypeScript **5.6+**, `strict: true` | |
| Styling | Tailwind CSS **v4** + `@theme` | Token dùng chung 1 nguồn (NFR-10) |
| ORM | Prisma **6** | `provider = "sqlite"`, `file:./dev.db` |
| DB | SQLite | 1 file, WAL mode |
| AI cloud | `@anthropic-ai/sdk` | `claude-opus-5`, `claude-haiku-4-5` (dự phòng: `Claude 3.5 Sonnet` / Opus) |
| AI local | Ollama HTTP API | `qwen2.5:7b`, `llama3.3`, `qwen2.5-coder:7b-instruct` — 0 token |
| SRS | `ts-fsrs` | state lưu JSON trong `Card.cardState` |
| Charts | `recharts` (React) | Radar, line, heatmap tự dựng |
| Speech | Web Speech API + MediaRecorder | Không thư viện ngoài (NFR-07) |
| Validation | `zod` | Cho structured output + form |

### 1.3 Ranh giới hệ thống

```
┌────────────────────────────────────────────────────────────┐
│  Browser                                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Next.js App Router (RSC + Client Components)        │  │
│  └──────────────────────────────────────────────────────┘  │
│       │ server actions / route handlers                    │
│       ▼                                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  src/lib/*  (server-only)                            │  │
│  │  db.ts · ai/router.ts · ai/anthropic.ts ·           │  │
│  │  ai/ollama.ts · ai/streaming.ts · prompts.ts ·       │  │
│  │  rubrics.ts · fsrs.ts · plan.ts · skills.ts ·         │  │
│  │  nav.ts · dates.ts · types.ts                        │  │
│  └──────────────────────────────────────────────────────┘  │
│       │                          │                         │
│       ▼                          ▼                         │
│  ┌─────────────┐      ┌────────────────────┐              │
│  │ SQLite      │      │ AI Router          │              │
│  │ prisma/dev.db│      │ ├─ local → Ollama  │              │
│  └─────────────┘      │ └─ anthropic → API │              │
│                        └────────────────────┘              │
└────────────────────────────────────────────────────────────┘
```

**Luồng ghi (duy nhất) — `lib/` là nơi quyết định:**

```
UI event → server action / API route → lib/xxx.ts → Prisma → SQLite
                                   ↘ lib/ai/router.ts → local | anthropic → ghi AiCall → SQLite
```

Quy tắc bất di bất dịch: **không route/API nào ghi trực tiếp vào DB ngoài qua `lib/`** — để log `AiCall`, tính `level`, và kiểm tra idempotency chỉ có 1 nơi xử lý.

Quy tắc bất di bất dịch (P6): **không route/API nào gọi SDK AI trực tiếp** — tất cả đi qua `lib/ai/router.ts`.

---

## 2. Kiến trúc ứng dụng

### 2.1 Cấu trúc thư mục

```
prisma/
  schema.prisma              # 15 model
  seed.ts                    # cây kỹ năng + 120 thẻ + user profile
src/
  app/
    layout.tsx               # <html> + font + shell wrapper
    globals.css              # @theme tokens + base layer
    page.tsx                 # S01
    plan/page.tsx            # S02
    skills/page.tsx          # S03
    skills/[id]/page.tsx     # S04
    log/page.tsx             # S05 (sheet overlay + history)
    log/history/page.tsx
    journal/page.tsx         # S06
    speak/write/page.tsx     # S07
    speak/talk/page.tsx      # S08
    language/page.tsx        # S09
    language/session/page.tsx# S10
    language/practice/page.tsx # S11
    state/page.tsx           # S12
    review/page.tsx          # S13
    progress/page.tsx        # S14
    settings/page.tsx        # S15
    interview/setup/page.tsx # S16
    interview/session/page.tsx # S17
    interview/[id]/page.tsx  # S18
    test/page.tsx            # S19
    test/session/page.tsx    # S20
    test/[id]/page.tsx       # S21
    api/
      plan/generate/route.ts        # AI-01  anthropic
      log/route.ts                  # Quick-log
      log/autofill/route.ts         # AI-02  local
      grade/route.ts                # AI-03/04 anthropic
      journal/feedback/route.ts     # AI-05  anthropic
      journal/classify/route.ts     # AI-06  local
      review/weekly/route.ts        # AI-07  anthropic
      roleplay/route.ts             # AI-08  anthropic
      language/correct/route.ts     # AI-09  local
      language/cards/route.ts       # AI-10  anthropic (haiku-4-5)
      interview/start/route.ts      # AI-11  anthropic
      interview/turn/route.ts       # AI-12 anthropic (chấm) + AI-19 local (sinh câu tiếp theo)
      interview/report/route.ts     # AI-13  anthropic
      test/blueprint/route.ts       # AI-14  KHÔNG gọi AI (chọn lọc tất định)
      test/from-content/route.ts    # AI-17  local
      test/grade-open/route.ts      # AI-15  anthropic
      test/level/route.ts           # AI-16  local
      state/correlate/route.ts      # AI-18  local
      srs/next/route.ts
      srs/grade/route.ts
      settings/key/route.ts
      export/route.ts
      import/route.ts
  components/
    shell/        AppShell · Sidebar · Topbar · NavLink · DbStatus
    ui/           Button · Card · Chip · Badge · Input · Select · Modal · Toast · Tabs · Tooltip
    daily-loop/   PlanCard · FocusBanner · CheckinPanel · FsrsWidget
    quick-log/    Step1Picker · Step2AiParse
    skills/       SkillTree · SkillNode · EvidenceTable · LevelBadge
    journal/      JournalEditor · AiPromptCard · CharacterCounter
    speak/        WriteEditor · RubricGrid · TalkRecorder · Waveform
    language/     Srshub · ReviewCard · AiFeedback · CardFront · CardBack
    interview/    ProfileCard · QuestionCard · RubricScore · ScorecardMatrix
    test/         TestTypeCard · ItemRenderer · TimerMatrix · ResultRadar · WrongList
    review/       WeeklySummary · InsightList · PlanProposal
    progress/     KpiGrid · TrajectoryChart · EvidenceHeatmap · SelfCompareTable
    settings/     ProfileTab · ApiKeyTab · CostTab · DataTab
    charts/       RadarChart · BarChart · Heatmap · RetentionCurve
    rubric/       RubricScore · RubricBar · DeltaBadge
    speech/       SpeechButton · SpeechRecognitionHook
  lib/
    db.ts             # PrismaClient singleton
    ai/
      router.ts       # provider routing (local | anthropic) — nguồn duy nhất
      anthropic.ts    # SDK wrapper + AiCall logging
      ollama.ts       # Ollama HTTP client
      streaming.ts    # SSE helper
    prompts.ts        # system prompt + task prompts (KHÔNG chứa rubric)
    rubrics.ts        # 4 rubric hằng số (communication/technical/behavioral/language-errors)
    fsrs.ts           # wrapper ts-fsrs
    plan.ts           # bộ sinh rule cục bộ (fallback offline)
    skills.ts         # chọn kỹ năng yếu nhất
    nav.ts            # NAV_ITEMS dùng chung (single source of truth cho sidebar)
    levels.ts         # rubric → skill level (điểm trung bình → level)
    dates.ts          # chuẩn hoá ngày local, tuần ISO
    types.ts          # DTO chung
prisma/dev.db
```

**Quy tắc bất di bất dịch về cấu trúc (từ `structure.md`):**

| Quy tắc | Nội dung |
|---|---|
| Route = màn hình | Mỗi `s<NN>` trong 21 màn hình Stitch ↔ đúng 1 route ở trên |
| Server Component mặc định | Chỉ mark `"use client"` cho phần tương tác (nút bấm, sheet, form, chart động) |
| Component theo domain | `components/language/` dùng chung cho S09, S10, S11 |
| `lib/rubrics.ts` là nguồn duy nhất | Mọi rubric — UI đọc từ đây, **không hardcode** tên tiêu chí ở component |
| `lib/nav.ts` là nguồn duy nhất cho sidebar | **Không copy-paste nav** giữa 21 màn hình (bài học từ lỗi #4 của mockup) |
| Route handler mỏng | Chỉ nhận request → gọi `lib/ai/router.ts` → ghi log `AiCall` → trả response. **Không chứa logic nghiệp vụ.** |
| `lib/prompts.ts` chỉ chứa prompt | System prompt + task prompt. Rubric nằm ở `lib/rubrics.ts`, không nhân bản. |

### 2.2 Layout gốc (`src/app/layout.tsx`)

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="dark">
      <body className="bg-background text-on-surface font-body-md antialiased">
        <AppShell>
          {children}
        </AppShell>
        <QuickLogSheet />      {/* global, mount 1 lần, mở qua context */}
        <Toaster />
      </body>
    </html>
  );
}
```

`AppShell` (`components/shell/AppShell.tsx`) là **client component** duy nhất bọc toàn bộ layout vì nó cần `usePathname()` để highlight nav và `useState` cho Quick-log:

```tsx
<div className="min-h-screen bg-background">
  <Sidebar />                              {/* fixed w-72 (288px) */}
  <div className="pl-72">                  {/* khớp sidebar */}
    <Topbar />                             {/* fixed h-16 (64px) */}
    <main className="pt-16 px-gutter-lg py-gutter-lg">{children}</main>
  </div>
</div>
```

### 2.3 Shell dùng chung cho 21 màn hình

Đây là **bắt buộc tuyệt đối** (FR-SH-01, AC-15). Mọi màn hình Stitch đều có cùng sidebar + header, và sẽ được dựng lại từ 1 component.

**Sidebar** (`w-72` = 288px, `bg-surface-container-lowest`, `border-r border-outline-variant/30`, `shadow-[0_1px_8px_rgba(0,0,0,0.25)]`, `z-50`)

> Đã đối chiếu: **21/21 màn hình** dùng `bg-surface-container-lowest` cho `<aside>`. (Riêng dải logo bên trong dùng `bg-surface-container-low/60`; dải footer dùng `bg-surface-container-low/50`.)

```
┌─ logo mark (h-8) ─ "Daily Loop OS"  ─┐
│              badge "Local-First v1.1"  │
├────────────────────────────────────────┤
│ PHÂN HỆ TÁC VỤ            (label-sm,  │
│                            mono,      │
│                            uppercase) │
│  ▸ Hôm nay (Daily Loop)                │
│  ▸ Cây kỹ năng                         │
│  ▸ Ôn tập ngoại ngữ (SRS)              │
│  ▸ Luyện giao tiếp                     │
│  ▸ Nhật ký & AI                        │
│  ▸ Mock Interview                      │
│  ▸ Bài kiểm tra                        │
│  ▸ Báo cáo tuần & tiến độ             │
│  ▸ Cài đặt                             │
├────────────────────────────────────────┤
│  ● SQLite / Vector   Local DB Active  │
└────────────────────────────────────────┘
```

- Nhãn nhóm: `label-sm` (JetBrains Mono, 0.6875rem, weight 600), `uppercase`, `tracking-wider`, màu `outline`.
- Nav item: `flex items-center gap-space-md px-space-md py-2.5 rounded-lg font-body-md text-on-surface-variant`.
- Nav item hover: `hover:bg-surface-container hover:text-on-surface transition-colors`.
- Nav item **active** (suy ra từ `data-active-classes`): `bg-surface-container-high text-primary font-semibold shadow-inner border border-outline-variant/40`.
- Icon Material Symbols Outlined 20px — **một** `<link>` duy nhất trong `layout.tsx` (không nhân bản như mockup).

> ⚠️ **Trạng thái active phải do `lib/nav.ts` điều khiển** — xem §9.4 mục 4.

**Topbar** (`h-16` = 64px, `bg-surface-container-lowest/80 backdrop-blur-xl border-b border-outline-variant/30`, `z-40`, `fixed top-0 left-72 right-0`)

> Đã đối chiếu: **21/21 màn hình** dùng đúng chuỗi class trên cho `<header>`.

| Vị trí | Nội dung | Token |
|---|---|---|
| Trái | chip ngày `Thứ Tư 29/10` (`calendar_today` 16px) | `bg-surface-container-low border border-outline-variant/20 text-on-surface rounded-lg` |
| Trái | `Streak 12 ngày` (`local_fire_department` 16px) | `text-tertiary font-semibold` |
| Trái | `Năng lượng tuần 78%` (`bolt` 16px) | `text-primary font-semibold` |
| Phải | chip `AI Offline / Local (Ollama)` (`memory` 15px) | `bg-secondary-container/40 border border-secondary/20 text-secondary rounded` |
| Phải | CTA `+ Ghi nhanh (≤10s)` (`add_circle` 18px) | `bg-primary-container text-on-primary rounded-lg shadow-[0_0_12px_rgba(16,185,129,0.2)]` |
| Phải | avatar `person` 32px (`w-8 h-8 rounded-full`) | `bg-primary text-on-primary` |

**Content wrapper**

```
<div className="pl-72">
  <Topbar />
  <main className="w-full pt-16 bg-surface min-h-screen">
    <div className="p-margin-lg space-y-gutter-lg max-w-[1600px] mx-auto w-full">
```

- `pl-72` khớp sidebar; `pt-16` khớp header.
- `max-w` **biến thiên theo màn hình** — đã đối chiếu:
  - `max-w-[1600px]`: S02, S03, S04, S06, S07, S09, S11, S14
  - `max-w-[1520px]`: S01, S05, S08, S15, S16, S20
  - `max-w-[1540px]`: S13
  - `max-w-[1440px]`: S21
  - **không khai báo `max-w`**: S10, S12, S17, S18, S19 → co giãn full
- → Chọn **một** giá trị chuẩn khi dựng lại: `max-w-[1600px] mx-auto`; chấp nhận sai lệch ±80px so với mockup (không ảnh hưởng layout 12 cột).

---

## 3. Design system — Focus Flow

### 3.1 Nguồn sự thật

**Nguồn sự thật duy nhất: `stitch_daily_loop_os/focus_flow/DESIGN.md` (YAML frontmatter)** → được chuyển thành `src/app/globals.css` (`@theme` của Tailwind v4).

`DESIGN.md` có 5 khối: `colors` · `typography` · `rounded` · `spacing` · `name`.

> ⚠️ **Mâu thuẫn phải xử lý:** `DESIGN.md` và `tailwind.config` nhúng trong 21 file `code.html` **lệch nhau ở `borderRadius`**. Bảng dưới là quyết định chốt (xem thêm §9.1-2).

**Bảng đối chiếu `borderRadius` — đã verify trên 21/21 màn hình:**

| Token | `DESIGN.md` (`rounded:`) | HTML config (21/21 giống hệt) | Quyết định |
|---|---|---|---|
| `rounded-sm` | `0.125rem` | *(không định nghĩa)* | ✅ `sm` = 0.125rem |
| `rounded` (DEFAULT) | `0.25rem` | `0.125rem` | ✅ **dùng HTML: 0.125rem** |
| `rounded-md` | `0.375rem` | *(không có)* | ✅ dùng `rounded-lg` |
| `rounded-lg` | `0.5rem` | `0.25rem` | ✅ **dùng HTML: 0.25rem** |
| `rounded-xl` | `0.75rem` | `0.5rem` | ✅ **dùng HTML: 0.5rem** |
| `rounded-full` | `9999px` | **`0.75rem`** | ⚠️ **dùng HTML: 0.75rem** — xem bên dưới |

**Về `rounded-full` — đã kiểm chứng bằng pixel, không phải suy đoán:**

Tailwind v3 CDN đọc `theme.extend.borderRadius` — `extend` **ghi đè** key gốc của Tailwind. Vì `full` có trong `extend` với giá trị `0.75rem`, nên class `rounded-full` sinh ra là `border-radius: 0.75rem`, **không phải** `9999px`.

Bằng chứng: trong `s01/screen.png`, avatar header là `w-8 h-8 rounded-full bg-primary` (32px). Zoom 8× cho thấy **góc bị vát phẳng (squircle), không phải hình tròn** — nếu là `9999px` thì 4 góc phải là cung tròn hoàn toàn.

→ Vì vậy **không được** dùng `rounded-full` cho avatar/tròn trong code production. Nếu cần hình tròn thật, dùng `rounded-[9999px]` (giá trị tường minh) hoặc class riêng `rounded-pill`.

→ **Ngoài ra:** không dùng `rounded-full` cho mục tiêu toàn hệ thống — sửa `DESIGN.md` để `full` = `0.75rem`, khớp với hành vi thực tế của 21 màn hình đã duyệt.

Tailwind v4 dùng `@theme` để sinh utility từ token:

```css
@import "tailwindcss";

@theme {
  /* --- colors: lấy nguyên văn từ DESIGN.md colors: --- */
  --color-surface-container-lowest: #0a0e17;
  --color-surface-container-low:      #181b25;
  --color-surface-container:           #1c1f29;
  --color-surface-container-high:      #262a34;
  --color-surface-container-highest:   #31353f;
  --color-surface-dim:                 #0f131c;
  --color-surface:                     #0f131c;
  --color-surface-bright:               #353943;
  --color-background:                  #0f131c;
  --color-primary:                     #4edea3;
  --color-primary-container:           #10b981;
  --color-on-primary-container:        #00422b;
  --color-on-primary:                  #003824;
  --color-primary-fixed:               #6ffbbe;
  --color-secondary:                   #c0c1ff;
  --color-secondary-container:         #3131c0;
  --color-tertiary:                    #ffb95f;
  --color-tertiary-container:          #e29100;
  --color-error:                       #ffb4ab;
  --color-outline:                     #86948a;
  --color-outline-variant:             #3c4a42;
  --color-on-surface:                  #dfe2ef;
  --color-on-surface-variant:          #bbcabf;

  /* --- rounded: theo quyết định bảng trên --- */
  --radius-DEFAULT: 0.125rem;
  --radius-sm:      0.125rem;
  --radius-lg:      0.25rem;
  --radius-xl:      0.5rem;
  --radius-full:    0.75rem;   /* KHÔNG phải 9999px — xem giải thích trên */

  /* --- spacing --- */
  --spacing-gutter:    1rem;
  --spacing-gutter-md: 1.25rem;
  --spacing-gutter-lg: 1.5rem;
  --spacing-margin:    1rem;
  --spacing-margin-md: 1.5rem;
  --spacing-margin-lg: 2.5rem;
  --spacing-space-xs:  0.25rem;
  --spacing-space-sm:  0.5rem;
  --spacing-space-md:  0.75rem;
  --spacing-space-lg:  1.25rem;
  --spacing-space-xl:  2rem;

  /* --- typography --- */
  --font-body-md:   "Be Vietnam Pro", sans-serif;
  --font-headline-md:"Space Grotesk", sans-serif;
  --font-label-md:  "JetBrains Mono", monospace;

  --text-body-md: 0.9375rem;   /* 15px, line-height 1.5 */
  --text-label-md: 0.75rem;    /* 12px */
}
```

> Trong Tailwind v4, `spacing` là **1 scale động** (`--spacing: 0.25rem` là gốc, mọi giá trị là bội số). Vì vậy `space-xs`/`space-sm`/`gutter`… là **token tên riêng** phải khai báo tường minh như trên — không dùng được cú pháp `space-2` mặc định nếu muốn khớp mockup.
> Tương tự `fontSize` trong `DESIGN.md` là **tên riêng** (`body-md`, `label-sm`…) → khai báo `--text-body-md`, `--text-label-md`…

### 3.2 Bảng màu — ánh xạ vai trò → token

| Vai trò trong UI | Token | Hex |
|---|---|---|
| Nền trang | `bg-background` | `#0f131c` |
| Card nền | `bg-surface-container` | `#1c1f29` |
| Card nền thấp hơn | `bg-surface-container-low` | `#181b25` |
| Card nổi bật | `bg-surface-container-high` | `#262a34` |
| Viền | `border-outline-variant` | `#3c4a42` |
| Chữ chính | `text-on-surface` | `#dfe2ef` |
| Chữ phụ | `text-on-surface-variant` | `#bbcabf` |
| Nhãn mono | `text-outline` | `#86948a` |
| Hành động chính (nền) | `bg-primary` | `#4edea3` |
| Hành động chính (chữ) | `text-on-primary` | `#003824` |
| CTA container | `bg-primary-container` | `#10b981` |
| Nhấn mạnh nhịp (streak) | `text-tertiary` | `#ffb95f` |
| Nhấn mạnh phụ | `text-secondary` | `#c0c1ff` |
| Lỗi | `text-error` / `bg-error-container` | `#ffb4ab` / `#93000a` |
| Thành công / rating cao | `text-primary` | `#4edea3` |
| Cảnh báo | `bg-tertiary-container` | `#e29100` |

**Quy tắc dùng màu:** chỉ **1 màu nhấn** (`primary`) cho hành động chính của màn hình; `tertiary` và `secondary` chỉ dùng để nhấn mạnh dữ liệu, không dùng làm nền nút. Mỗi màn hình không được dùng quá 3 màu nhấn.

### 3.3 Typography

| Token | Font | Size | Weight | Dùng cho |
|---|---|---|---|---|
| `display` | Space Grotesk | 3.5rem / 56px | 700 | Tiêu đề hero (S01) |
| `headline-lg` | Space Grotesk | 2.25rem / 36px | 600 | Tiêu đề trang |
| `headline-lg-mobile` | Space Grotesk | 1.75rem / 28px | 600 | Tiêu đề mobile |
| `headline-md` | Space Grotesk | 1.5rem / 24px | 600 | Tiêu đề section |
| `headline-sm` | Space Grotesk | **1.25rem / 20px** | 500 | Tiêu đề nhỏ — **chốt theo `DESIGN.md`** ⚠️ *xem §9.1-3* |
| `body-lg` | Be Vietnam Pro | 1.125rem / 18px | 400 | Nội dung nổi bật |
| `body-md` | Be Vietnam Pro | 0.9375rem / 15px | 400 | Nội dung chính |
| `body-sm` | Be Vietnam Pro | 0.8125rem / 13px | 400 | Nội dung phụ |
| `label-sm` | JetBrains Mono | 0.6875rem / 11px | 600 | Micro-label uppercase |
| `label-md` | JetBrains Mono | 0.75rem / 12px | 500 | Chip, badge |
| `code-md` | JetBrains Mono | 0.875rem / 14px | 500 | Hash, ID, số |

**Quy tắc:** JetBrains Mono **chỉ** dùng cho micro-label, badge, hash, ID, số kỹ thuật — không dùng cho nội dung đọc dài (NFR-10).

### 3.4 Spacing & radius

- Spacing chuẩn: `space-xs .25 · space-sm .5 · space-md .75 · space-lg 1.25 · gutter 1 · gutter-md 1.25 · gutter-lg 1.5 · margin 1 · margin-md 1.5 · margin-lg 2.5 · space-xl 2` (rem). Baseline 4px — mọi spacing là bội số của `0.25rem`.
- Grid: `grid-cols-12` với `gap-gutter-lg`.
- Radius (theo quyết định §3.1): `DEFAULT .125 · sm .125 · lg .25 · xl .5 · full .75` (rem).
  ⚠️ `full` = **12px, KHÔNG phải bo tròn tròn** — đã verify bằng pixel trên `s01/screen.png`. Dùng `rounded-[9999px]` khi cần hình tròn thật.
- Shadow: `shadow-inner` cho nav active; `shadow-lg` cho modal/sheet; glow CTA `shadow-[0_0_12px_rgba(16,185,129,0.2)]`.
- Breakpoint: mobile `<768px` · tablet `768–1279px` · desktop `≥1280px` (`xl:grid-cols-12`).

---

## 4. Thành phần & giao diện theo từng màn hình

Dưới đây là inventory component + hành vi cho **đủ 21 màn hình**, lấy trực tiếp từ mockup Stitch.

### 4.1 S01 — Daily Loop `/`

**Layout:** grid 12 cột — cột trái `col-span-8`, cột phải `col-span-4`.

**Cột trái:**
- `FocusNodeCard` — mục tiêu hạt nhân hôm nay: tên skill node, level hiện tại / mục tiêu, thanh tiến trình level kế tiếp, số bằng chứng xác thực, thời gian tích lũy.
- `WeekStreak` — lịch nhịp tuần: 7 cột (T2–CN), mỗi cột là 1 hình tròn/ô trạng thái (đã xong / bỏ lỡ / hôm nay / tương lai) + streak đếm ngày liên tiếp.
- `SlotCard[]` — **6 slot** theo thứ tự thời gian, mỗi slot: nhãn domain (chip màu theo domain), tiêu đề hành động, mô tả ≤120 ký tự, thời lượng dự kiến, skill liên quan, nút "Xong" + nút "Hoàn thành nhanh". Slot đang là ưu tiên có rail màu bên trái + badge CTA khác.
- CTA phụ: "Lập lại kế hoạch hôm nay (AI)" → modal xem trước.

**Cột phải:**
- `SinhTracNhipDo` — mood / energy / focus / giấc ngủ (4 chỉ số, đọc từ `DailyState`).
- Hàng đợi FSRS — số thẻ đến hạn hôm nay (`Card.due <= now`).
- `FsrsRetrievabilityCard` — retention %, stability TB, difficulty TB, đường cong suy giảm 7 ngày (sparkline).
- `CacheHitCard` — prompt cache hit rate (%).
- `WeekEnergyCard` — năng lượng tuần 0–100%.

**Hành vi:**
- Click "Xong" → `POST /api/log` với `source: 'plan_item'` → tạo `Activity` (+`Evidence` nếu có `skillId`) → set `PlanItem.done = true` → cập nhật streak nếu là hoạt động đầu tiên trong ngày → re-render slot gạch ngang + badge "Đã xong".
- Click "Hoàn thành nhanh" → mở Quick-log đã prefill domain + skill của slot.
- Không có kế hoạch → `EmptyState` với CTA "Lập kế hoạch hôm nay".

**Bug mockup cần sửa khi dựng lại:** selector `closest('.bg-surface-container, .bg-surface-container-high')` là selector không hợp lệ (dấu phẩy trong `closest()` nội suy → `DOMException`) → checkbox hoàn thành hỏng. Khi dựng lại bằng React, dùng state thay vì truy vấn DOM.

### 4.2 S02 — Sinh kế hoạch AI `/plan`

**Layout:** 12 cột — trái 8 (danh sách slot), phải 4 (panel AI).

**Trái:** 6 `SlotCard` xếp dọc, mỗi slot có:
- Select domain (không đổi được cấu trúc slot — chỉ nội dung thay đổi)
- Input tiêu đề hành động
- Input mô tả
- Input thời lượng (phút) — có preset gợi ý theo domain
- Select skill node liên quan
- Nút "Xoá"

**Phải:**
- Panel "AI Đề xuất" — nút "Sinh lại với AI", hiển thị **provider + model đã dùng** (`Anthropic · claude-opus-5` hoặc `Local · qwen2.5:7b`), effort (`medium`), token đã dùng, thời gian sinh.
- Diff view: slot cũ vs slot mới (thêm/xoá/sửa) trước khi áp dụng.
- Nút "Áp dụng" → ghi đè `PlanItem` cho hôm nay (giữ slot đã `done = true`).
- Fallback badge "Offline — dùng rule cục bộ" khi không có API key và Ollama cũng không chạy.

**Bug mockup:** `button:has(:contains(...))` là selector CSS không hợp lệ → `querySelector` ném lỗi → nút "Áp dụng" không bao giờ được tìm thấy. Dựng lại bằng React state.

### 4.3 S03 — Cây kỹ năng `/skills`

**Layout:** 3 cột — trái cây (4), giữa chi tiết node đang chọn (5), phải feed bằng chứng (3).

**Cây (3 tầng):**
- Tầng 1: 4 domain card — `professional` · `communication` · `language` · `personal`.
- Tầng 2: skill thuộc domain (ví dụ "System Design", "Luyện giao tiếp", "Tiếng Trung", "Nhật ký").
- Tầng 3: mục kỹ năng con (ví dụ "Lựa chọn giải pháp", "Phân tích yêu cầu").
- Mỗi node: tên, `LevelBadge` 0–5, số bằng chứng, thanh tiến trình dạng segment (mỗi segment = 1 level), trạng thái focus (vòng sáng `ring-primary`).

**Giữa — panel node đang chọn:** tên, mô tả, level hiện tại/target, ngày tích lũy, nút "Đặt làm trọng tâm hôm nay" (chỉ 1 node), nút "Luyện tập đo lường ngay" (tạo Activity + Evidence), nút "Tạo mục kỹ năng con".

**Phải — "Bằng Chứng Gần Đây":** timeline dọc, mỗi dòng: thời gian tương đối ("2 giờ trước"), tiêu đề, `RatingBadge` 1–4 (màu: 4 = primary, 3 = tertiary, 2 = secondary, 1 = outline), tên hoạt động liên kết, nút chọn.

**KPI trên đầu:** Tổng bằng chứng · Trọng tâm hôm nay (rating TB) · Mục kỹ năng chờ luyện · Tổng số domain.

**Bug mockup:** `button:has(.text-tertiary)` bind nhầm phần tử (matches cả phần tử cha) → phải dùng `data-skill-id` + `ref`.

### 4.4 S04 — Chi tiết kỹ năng `/skills/[id]`

**Layout:** 12 cột — trái 8 (biểu đồ + bảng), phải 4 (đề xuất).

**Trái:**
- Header: breadcrumb 4 cấp `Trang chủ › Cây kỹ năng › <domain> › <skill>`.
- 4 số liệu: Cấp độ hiện tại / Mục tiêu · Số bằng chứng · Thời gian tích lũy (giờ) · Điểm trung bình.
- `LineChart` — tiến trình xác thựnh theo tuần, có đường ngưỡng level.
- `BarChart` — phân bổ hoạt động theo danh mục (Học / Luyện tập / Viết / Nói / Ôn / Nhật ký).
- `EvidenceTable` — bảng "Nhật ký bằng chứng": cột Ngày · Loại hoạt động · Nội dung chứng minh · Rating · Hash SQLite (`HASH#…`, mono) · nút mở.

**Phải:**
- `LevelChecklist` — tiêu chuẩn thăng cấp dạng checklist, mỗi mục có tick đạt/chưa đạt + ngưỡng.
- `AiSuggestionCard` — đề xuất bài tập thực chiến do AI sinh từ lỗ hổng phân tích được.
- Nút "Tạo slot luyện tập ngày mai".

### 4.5 S05 — Quick-log `/log`

**Kiểu:** sheet trượt lên từ dưới (overlay), mở bằng CTA header + phím `Cmd/Ctrl+K`.

**Sheet — 2 bước:**
- **Bước 1 — Ghi nhanh:** 6 preset chip đánh số `1`–`6` (Học 25′ · Luyện tập · Viết · Luyện nói · Nhật ký · Chăm sóc bản thân) + textarea tự do + nút "Ghi nhanh ngay" (CTA primary) + link "Xem lịch sử".
- **Bước 2 — AI tự phân tích:** card hiển thị confidence %, domain gợi ý, skill node gợi ý, thời lượng, mức độ nỗ lực/độ sâu (3 mức) — mỗi trường có nút "Sửa"; checkbox "Tự động tạo 1 Evidence".

**Lịch sử (tab / `/log/history`):**
- Bộ lọc domain (chip row).
- Thanh phân bổ nỗ lực theo 4 domain (stacked bar) + badge tổng phút.
- Danh sách dòng: thời gian · tiêu đề · domain chip · phút · rating; dòng mới nhất ở trên cùng.

**Bug mockup:** `recordActivity()` nội suy input người dùng thẳng vào `innerHTML` → **XSS**. Khi dựng lại: React escape mặc định, không dùng `dangerouslySetInnerHTML` cho input người dùng.

### 4.6 S06 — Nhật ký & phản hồi AI `/journal`

**Layout:** trái 8 (editor + phản hồi), phải 4 (gợi ý + lịch sử).

**Trái:**
- `JournalEditor` — textarea, placeholder "Hôm nay mình học được gì? Điều gì làm mình khựng lại?"
- `CharacterCounter` — đếm ký tự; bản nháp tự lưu `localStorage` (AC-14).
- Nút "Gửi AI phản hồi" → `AiResponseCard`: tóm tắt 1 câu + **1 câu hỏi sắc** (đóng khung `border-primary`), nút "Chấp nhận → tạo Evidence", nút "Bỏ qua".

**Phải:**
- 3 gợi ý câu hỏi mở theo ngữ cảnh — bấm để chèn vào editor.
- Card "Phân loại tự động" — domain + skill + confidence, badge model `Local · qwen2.5:7b` (provider `local`, 0 token).
- Lịch sử entry gần đây kèm ghi chú AI.

**Privacy:** nội dung nhật ký **chỉ** gửi lên API khi người dùng bấm "Gửi AI phản hồi" (FR-PS-07).

### 4.7 S07 — Luyện giao tiếp — Viết `/speak/write`

**Layout:** trái 8 (đề bài + editor), phải 4 (rubric).

- `PromptCard` — đề bài hiện tại + badge CEFR + nút "Đề khác" + nút "Tạo đề theo chủ đề".
- `WriteEditor` — textarea lớn, bộ đếm từ, nút "Chấm bài" (CTA primary).
- `RubricGrid` — 5 tiêu chí (Rõ ràng / Cấu trúc / Giọng văn / Tự nhiên / Ngữ pháp), mỗi tiêu chí: tên · điểm 0–5 (thanh hoặc số) · 1 câu nhận xét · 1 đề xuất sửa cụ thể. Tổng điểm = trung bình 5.
- `DeltaBadge` — so với lần ghi trước: `↑ +0.4` primary / `↓ −0.2` error.
- Kho bài tập (bank) — danh sách prompt đã lưu, bấm để nạp lại.

### 4.8 S08 — Luyện giao tiếp — Nói `/speak/talk`

- 3 chế độ: **Viết · Nói · Hội thoại AI** (tab switch).
- `TalkRecorder` — nút ghi lớn (48px, `bg-primary-container`), timer đếm, waveform (canvas), nút dừng.
- Sau khi dừng → transcript hiển thị (Web Speech API STT) → `RubricGrid` giống S07 + ghi chú từ điệu & độ rõ.
- Tình huống (cho hội thoại): phỏng vấn xin việc · đàm phán giá · hội thoại với đồng nghiệp nước ngoài · trình bày dự án.

### 4.9 S09 — Ôn ngoại ngữ (SRS hub) `/language`

- 2 cột: trái = chọn ngôn ngữ + trạng thái, phải = danh sách nhóm/chủ đề.
- Với mỗi ngôn ngữ: số thẻ **đang học / đã thuộc / đến hạn** + chuỗi ngày ôn riêng.
- Nút "Ôn ngay (N thẻ)" → `/language/session`.
- `VocabProgress` — tiến trình theo 6 nhóm từ vống level 0.
- Nút "Xuất Deck JSON" và "Thêm thẻ thủ công" (trong mockup chưa có handler → phải cài).

### 4.10 S10 — Phiên ôn (1 thẻ) `/language/session`

- `SessionProgress` — thanh tiến trình + "Thẻ 3 / 12".
- `CardFront` — tiếng Trung: **pinyin** lớn (`headline-lg`) + hanzi (tuỳ chọn) + nút nghe (`volume_up`, `speechSynthesis` với `lang=zh-CN`); tiếng Anh: từ + gợi ý phiên âm kiểu Việt (2 tuần đầu).
- Nút "Hiện đáp án" (Space).
- `CardBack` — hanzi + nghĩa + ví dụ câu + nút nghe.
- `GradeButtons` — 4 nút: **Again · Hard · Good · Easy**, mỗi nút hiển thị khoảng cách tới lượt ôn kế tiếp đọc từ FSRS (vd: "10 phút", "1 ngày", "3 ngày", "7 ngày").
- Nút "Bỏ qua" / "Không nhớ → Again".

### 4.11 S11 — Luyện ngoại ngữ chủ động `/language/practice`

- Tab: **Viết** · **Hội thoại AI** · **Sửa lỗi** · **Thẻ mới**.
- **Viết:** prompt theo chủ đề + textarea → AI trả về `RUBRIC_LANGUAGE_ERRORS` (4 nhóm: Ngữ pháp / Từ vựng / Cách diễn đạt / Ngữ cảnh).
- **Hội thoại:** AI đóng vai ở level người dùng, `lang` theo `zh`/`en`.
- **Sửa lỗi:** bài đã viết → 4 nhóm lỗi + đề xuất sửa.
- **Thẻ mới:** AI sinh mảng thẻ từ nội dung → nút "Thêm vào ôn".
- Mockup có nút "Xoá nhập lại", "Phát âm mẫu", tab switching chưa có handler → phải cài.

### 4.12 S12 — Đánh giá chính `/state`

- 4 thẻ chỉ số: **Mood** · **Energy** · **Focus** (thanh trượt 1–5) · **Giấc ngủ** (ô nhập giờ, bước 0.5).
- Prefill giá trị hôm qua.
- Nút "Lưu" → `DailyState` upsert theo `date`.
- `StateDots` — 7 ngày gần nhất dạng chấm nhỏ, bấm được để sửa.
- `CorrelationChart` — overlay mood/energy/sleep + số hành động hoàn thành.
- Card "Dữ liệu đã gửi lên" — liệt kê nội dung nào đã đi lên API.
- Mockup có toggle "7 Ngày / 30 Ngày" chưa có handler → phải cài.

### 4.13 S13 — Báo cáo tuần `/review`

- Header: tuần `W43 · 21–27/10/2026`, tổng hành động `38 / 42` (completion ring), "So với tuần trước".
- 4 KPI card: Hành động hoàn thành · Phân bổ domain (4 thanh) · Điểm AI TB · Mood/giấc ngủ TB.
- `InsightList` — 3 nhận định AI: 1 tốt (primary) · 1 cần sửa (tertiary) · 1 nên thử (secondary).
- `PlanProposal` — 6 slot tuần sau, mỗi slot có nút sửa inline + nút "Duyệt & Áp dụng".
- Nút "Xuất JSON" (trong mockup chỉ hiện toast, không tạo file → phải tải file thật).
- Điều hướng trong mockup: link "Mock Interview" → `s17`, "Bài kiểm tra" → `s21` — phải chuẩn hoá về `/interview/setup` và `/test`.

### 4.14 S14 — Báo cáo tiến bộ `/progress`

- 4 KPI: Cấp độ kỹ năng bình quân · Bằng chứng tích lũy tháng · Tỷ lệ giữ FSRS · Điểm phản xạ giao tiếp.
- `TrajectoryChart` — quỹ đạo 6 tháng, 4 đường theo domain, trục Y = level 0–5.
- `EvidenceHeatmap` — lưới GitHub 90 ngày, 5 mức độ; **chỉ** tô ô có sản phẩm thực tế.
- `SelfCompareTable` — "Hiện tại vs chính mình 30 ngày trước", giá trị cũ gạch ngang.
- `DomainFilter` — chip 4 domain + "Tất cả" (trong mockup chưa có handler → phải cài).
- `TimeAllocationChart` — 4 nhóm deliberate practice.
- Nút "Xuất JSON tiến độ" → tải file JSON.
- ⚠️ *Mockup dùng chu kỳ `01/08/2024 → 29/10/2024` — phải đổi sang ngày thật (2026).*

### 4.15 S15 — Cài đặt `/settings`

Tiêu đề trang: **"Cài Đặt Hệ Thống & Quản Lý Chi Phí AI"**. Bên dưới là dải trạng thái hệ thống (3 chip): `SQLite v3.45 Connected · 1,429 records · Không đồng bộ đám mây (P6 Strict Sandboxing)` · `Prompt Cache Engine: ACTIVE` · `Local Vault: Sealed`.

4 tab (label đúng theo mockup):

**Tab 1 — Hồ sơ & Mục tiêu:** tên, mục tiêu 6 tháng, giọng AI (`direct|coach|gentle`), ngôn ngữ học (`zh,en`), level `zhLevel`/`enLevel`.

**Tab 2 — Khóa API Anthropic & Kết nối** (badge `ANTHROPIC CLOUD BRIDGE` · `ENV V1.1`):
- Ô nhập `ANTHROPIC_API_KEY` (type=password, hiển thị dạng `sk-ant-••••••••••••`).
- Nút "Lưu khóa" → ghi `.env.local` qua `POST /api/settings/key` (chỉ server-side, file nằm ngoài `public/`).
- Nút "Chạy kiểm tra Ping Anthropic Endpoint" → 1 request tối thiểu; 3 trạng thái UI: `Đang kiểm tra kết nối...` → `Hoàn tất: 38ms (200 OK)` → badge `Đã kiểm tra: OK (42ms)`.
- Card "NGUYÊN TẮC BẢO MẬT P6 STRICT" — liệt kê: key lưu local, không commit, không hiển thị đầy đủ, nhật ký không rời máy.
- Toggle "Chế độ khẩn cấp tiết kiệm" (bật → chỉ dùng Haiku + rule cục bộ).

**Tab 3 — Chi Phí AI & Prompt Caching (FR-AI-07, FR-AI-08):**
- Ngân sách tháng: `NGÂN SÁCH THÁNG 10/2026` → `$4.82` / `$15.00 limit` → `32.1%` (thanh), badge `Tiết kiệm 68% nhờ Prompt Cache`, cảnh báo khi ≥80%.
- Card cache: `CACHE HIT RATE (PREFIX)` → `91.4%` · `OPTIMAL` · `128,450 tokens tái sử dụng qua system cache prompt.`
- Card tổng lượt gọi: `TỔNG SỐ LƯỢT GỌI (AiCall)` → `142` lượt chạy · `139 thành công` · `3 offline fallback` · `Độ trễ trung bình: 418ms`.
- `CostBar` — `Phân Bổ Chi Phí Theo Tính Năng` (nhóm theo **tính năng**, mỗi nhóm gom nhiều `AiCall.feature` của cùng router task): Mock Interview `$1.85` (38%, `claude-opus-5 · 48 runs`) · Daily Plan Generation `$1.10` (23%, `claude-opus-5 · 31 runs`) · Communication & Writing `$0.95` (20%, `claude-opus-5 · 26 runs`) · Language Test & Grading `$0.72` (15%, `claude-opus-5 · 18 runs`) · Quick-log autofill `$0.20` (4%, `claude-haiku-4-5 (Flash) · 19 runs`).
- Bảng `Nhật Ký Gọi API Gần Nhất` (schema `AiCall`, lưu trong SQLite để đối soát token theo thời gian thực): Thời gian · Tính năng · Mô hình · Input Token · Cache Read · Output Token · Chi phí (USD) · Trạng thái. Nút "Xuất AiCall CSV".
- Phân trang: hiện 4 dòng / 142 bản ghi → `Trang 1/36` + `Trang trước` / `Trang kế`.

> ⚠️ Các con số trên là **giá trị mockup** để dựng giao diện. Code production **không hardcode** — mọi số đều tính từ bảng `AiCall` (xem AC-19, task 17.11). Riêng `91.4%` phải tính từ `cacheRead / (cacheRead + inputTokens)`.

**Tab 4 — Quản trị dữ liệu (Backup / Export JSON):**
- Nút "Xuất toàn bộ cơ sở dữ liệu (JSON)" → tải file.
- Nút "Nhập từ JSON" → parse + validate bằng zod.
- `VÙNG NGUY HIỂM (DANGER ZONE)` → "Xóa trắng dữ liệu (2-Step Confirm)".
- Thống kê bảng (số bản ghi mỗi bảng).

> **Bảo mật (AC-16):** mockup chứa literal `sk-ant-api03-abcdef9876543210masterkeyxyzA` trong `<input type="password">`. Đây là **placeholder phải xóa** — không được đưa vào code production. Production đọc key từ `.env.local`, route `GET` chỉ trả masked key (`sk-ant-••••••••••••`), không bao giờ gửi qua server trung gian hay cloud storage.

### 4.16 S16 — Mock Interview — cấu hình `/interview/setup`

- `ProfileCard[]` — hồ sơ vai trò: `label`, `jobTitle`, `seniority`, `language`, `questionKinds`. Ví dụ seed: `backend-sr` (Backend Engineer, EN, Senior, IC-5, điểm 4.1/5.0) · `architect-lead` (Staff/Lead, 3.8/5.0) · `eng-manager` (VI, Management, M1).
- **"Lựa chọn giải pháp"** — 0 bằng chứng, Score 0.0 → badge đỏ "Cần luyện tập".
- **"Phân tích yêu cầu"** — 2 bằng chứng, Score 1.2 → badge tertiary.
- Chọn hồ sơ → chọn 5 dạng câu (checkbox) → chọn số câu (5 / 8 / 12) → phương thức trả lời (văn bản / giọng nói) → tuỳ chọn nâng cao (adaptive loop, đo song song tiếng Anh).
- Ước lượng chi phí: `~$0.18 / phiên`.
- Nút "Bắt đầu Phiên Phỏng Vấn".

**Bug mockup:** class `.role-selected-badge` không tồn tại → badge "Đang chọn" không bao giờ được xoá.

### 4.17 S17 — Mock Interview — phiên `/interview/session`

**Layout:** trái 8 (câu hỏi + ô trả lời), phải 4 (điểm câu trước + tiến trình).

- `QuestionCard` — nhãn dạng câu (`concept|design|debug|tradeoff|behavioral`) + skill node liên quan + nội dung câu + ô "Câu hỏi này có vấn đề" (icon `flag`).
- `ResponsePanel` — textarea trả lời + nút "Gửi" (Enter để gửi).
- `RubricScore` thu gọn — 5 tiêu chí dạng thanh, **không** diễn giải chi tiết (AC-9 / FR-MI-08 dạng rút gọn).
- Tiến trình: "Câu 3 / 8" + timer đếm ngược.
- Adaptive note: "Câu trả lời trước chưa đủ sâu → câu tiếp theo là follow-up".

### 4.18 S18 — Mock Interview — kết quả `/interview/[id]`

- Scorecard lớn: `4.1 / 5.0` + delta `+0.6` so với phiên trước cùng hồ sơ.
- `RubricMatrix` — 5 tiêu chí: Chính xác 4.5 · Chiều sâu 3.8 · Lập luận 4.3 · Giao tiếp 4.4 · Nhận biết đánh đổi 3.6.
- **3 điểm mạnh** — mỗi điểm kèm **trích dẫn nguyên văn** câu trả lời (trích trong `border-l-2 border-primary`).
- **3 điểm yếu** — mỗi điểm kèm **số câu hỏi** liên quan.
- `SkillTreeBridge` — đề xuất luyện tiếp trỏ tới `Skill` cụ thể + nút "Tạo bằng chứng kỹ năng".
- Biểu đồ tiến bộ theo thời gian (nếu có ≥2 phiên).

### 4.19 S19 — Bài kiểm tra ngoại ngữ `/test`

- 4 `TestTypeCard`: **Định vị (placement)** · **Theo chủ đề (topic)** · **Chuẩn (benchmark)** · **Từ nội dung (from_content)** — mỗi card có số câu và có/không timer.
- Đổi ngôn ngữ → hiển thị level ước lượng hiện tại (HSK cho zh, CEFR cho en).
- `BenchmarkChart` — tiến bình benchmark nhiều kỳ: `52% → 58% → 62% → 67.5%` (W40–W43).
- 6 dạng câu với độ chính xác: mc_vocab · mc_grammar · cloze · listening · writing · translation.
- "5 từ sai nhiều nhất" list.

### 4.20 S20 — Làm bài kiểm tra `/test/session`

- Timer đếm ngược `22:15 / 30:00`.
- `ItemRenderer` theo 6 dạng: mc (radio 4 đáp án) · cloze (input) · listening (nút nghe, phát `audioText` qua TTS) · writing (textarea) · translation (textarea).
- `QuestionMatrix` — lưới 40 ô (8 hàng × 5 cột), trạng thái: đã trả lời / chưa trả lời / đánh dấu.
- Luôn nhắc luật FSRS: "Câu sai → thẻ về ôn ngay".
- Phím tắt: `1-4` chọn đáp án · `Space` tiếp · `Enter` xác nhận.

### 4.21 S21 — Kết quả bài kiểm tra `/test/[id]`

- Tổng điểm: `27 / 40` = `67.5%`, ước lượng level `A1`.
- `RadarChart` ngũ giác — 6 trục theo `itemType`.
- `LapseCards` — 3 thẻ bị đẩy về ôn (badge "Ôn ngay" → mở S10 đúng các thẻ đó).
- Phân tách theo dạng: mc_vocab 15 · mc_grammar 10 · cloze 8 · listening 7 (= 40).
- Chấm writing: 4 mục `4/6/7/8 out of 10`.
- `WrongAnswerList` — câu sai + giải thích sư phạm + "Ôn lại".
- Nút "Làm bài tương tự" (sinh đề song song về độ khó — FR-LT-12).

---

## 5. Mô hình dữ liệu

15 model Prisma. `provider = "sqlite"`, `DATABASE_URL="file:./dev.db"`.

### 5.1 Cây kỹ năng & bằng chứng

```prisma
model Skill {
  id          String   @id @default(cuid())
  name        String
  nameZh      String?
  domain      String   // professional | communication | language | personal
  parentId    String?
  parent      Skill?   @relation("SkillTree", fields: [parentId], references: [id])
  children    Skill[]  @relation("SkillTree")
  level       Int      @default(0)     // 0..5 — CHỈ tăng qua Evidence
  targetLevel Int      @default(3)
  position    Int      @default(0)
  createdAt   DateTime @default(now())
  activities  Activity[]
  evidences   Evidence[]
}

model Activity {
  id         String   @id @default(cuid())
  skillId    String?
  skill      Skill?   @relation(fields: [skillId], references: [id])
  domain     String
  type       String   // study|write|speak|roleplay|srs|journal|health|custom|mock_interview|test
  minutes    Int      @default(0)
  title      String
  content    String?
  quality    Int?     // 1..5 tự đánh giá
  aiScore    Float?   // điểm AI = trung bình rubric
  createdAt  DateTime @default(now())
  evidences  Evidence[]
  reflection Reflection?
}

model Evidence {
  id         String   @id @default(cuid())
  activityId String
  activity   Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  skillId    String
  skill      Skill    @relation(fields: [skillId], references: [id], onDelete: Cascade)
  rating     Int      // 1..4
  createdAt  DateTime @default(now())
  @@index([skillId])
}
```

**Quy tắc tăng level (FR-SK-03/04)** — xác định trong `lib/levels.ts`:

```ts
export const LEVEL_THRESHOLDS = [0, 2, 5, 9, 14, 20] as const;
// level N cần tối thiểu LEVEL_THRESHOLDS[N] evidence có rating >= 3

export function recomputeSkillLevel(skillId: string): number { /* đọc Evidence → tính lại */ }
```

Level **không bao giờ** tăng do tick checkbox hay do AI — chỉ `Evidence` (P3).

### 5.2 Hoạt động, phản hồi, kế hoạch

```prisma
model Reflection {
  id         String   @id @default(cuid())
  activityId String   @unique
  activity   Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  prompt     String
  answer     String
  aiFeedback String?
  createdAt  DateTime @default(now())
}

model PlanItem {
  id        String   @id @default(cuid())
  date      DateTime @default(now())  // chuẩn hoá 00:00 local
  slot      Int      // 0..5
  domain    String
  action    String
  detail    String?
  minutes   Int      @default(15)
  skillId   String?
  done      Boolean  @default(false)
  source    String   @default("ai")   // ai | manual | fallback
  createdAt DateTime @default(now())
  @@index([date])
}
```

### 5.3 Flashcard & SRS

```prisma
model Card {
  id            String   @id @default(cuid())
  lang          String   // zh | en
  front         String   // zh: pinyin · en: word
  frontAlt      String?  // zh: hanzi
  back          String
  note          String?
  example       String?
  examplePinyin String?
  hint          String?  // phiên âm kiểu Việt (2 tuần đầu)
  group         String?
  mode          String   @default("recognize") // recognize|recall|produce
  cardState     Json     // state FSRS
  due           DateTime
  stability     Float    @default(0)
  difficulty    Float    @default(0)
  reps          Int      @default(0)
  lapses        Int      @default(0)
  createdAt     DateTime @default(now())
  reviews       Review[]
  @@index([lang, due])
}

model Review {
  id     String   @id @default(cuid())
  cardId String
  card   Card     @relation(fields: [cardId], references: [id], onDelete: Cascade)
  rating Int      // 1=Again 2=Hard 3=Good 4=Easy
  state  Json
  at     DateTime @default(now())
}
```

### 5.4 Chỉ số cá nhân & hồ sơ

```prisma
model DailyState {
  id        String   @id @default(cuid())
  date      DateTime @unique
  mood      Int?
  energy    Int?
  sleep     Float?
  focus     Int?
  note      String?
  updatedAt DateTime @updatedAt
}

model UserProfile {
  id            String   @id @default(cuid())
  name          String?
  goals         String?
  aiTone        String   @default("direct") // direct|coach|gentle
  learningLangs String   @default("zh,en")
  zhLevel       String   @default("zero")
  enLevel       String   @default("zero")
  createdAt     DateTime @default(now())
}
```

### 5.5 Nhật ký AI

```prisma
model AiCall {
  id            String   @id @default(cuid())
  feature       String   // task id của AI Router — 17 task gọi AI (xem §6.1): autofill|classify|language_correct|language_level|test_from_content|biometric_correlate|mock_next_question|daily_plan|grading|journal_feedback|weekly_review|roleplay|language_cards|mock_interview|mock_interview_turn|mock_interview_report|language_test_grade (+ test_blueprint = không gọi AI)
  provider      String   @default("anthropic") // local|anthropic — provider thực sự đã trả lời
  model         String
  inputTokens   Int      @default(0)
  outputTokens  Int      @default(0)
  cacheRead     Int      @default(0)
  cacheWrite    Int      @default(0)
  estimatedCost Float    @default(0)   // luôn 0 cho provider "local"
  ok            Boolean  @default(true)
  error         String?
  fallbackFrom  String?  // provider gốc bị lỗi, ví dụ "anthropic" khi đã fallback sang "local"
  createdAt     DateTime @default(now())
  @@index([createdAt])
  @@index([provider])
}
```

### 5.6 Mock Interview

```prisma
model InterviewProfile {
  id            String   @id @default(cuid())
  label         String   // "Backend Engineer"
  jobTitle      String
  seniority     String   @default("mid") // junior|mid|senior|lead
  language      String   @default("en")  // en|vi
  questionKinds String   @default("concept,design") // concept|design|debug|tradeoff|behavioral
  focusSkills   String   @default("[]")   // JSON [skillId]
  createdAt     DateTime @default(now())
  sessions      InterviewSession[]
}

model InterviewSession {
  id            String   @id @default(cuid())
  profileId     String
  profile       InterviewProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  plannedCount  Int      @default(8)
  askedCount    Int      @default(0)
  status        String   @default("active") // active|done|abandoned
  totalScore    Float?
  skillsFocused String   @default("[]")
  startedAt     DateTime @default(now())
  endedAt       DateTime?
  turns         InterviewTurn[]
  activity      Activity?
}

model InterviewTurn {
  id           String   @id @default(cuid())
  sessionId    String
  session      InterviewSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  index        Int
  question     String
  kind         String
  skillName    String?
  answer       String?
  scores       Json?    // {clarity:[score,note], depth:[...], ...}
  total        Float?
  feedback     String?
  nextQuestion String?
  createdAt    DateTime @default(now())
}
```

### 5.7 Bài kiểm tra ngoại ngữ

```prisma
model TestSession {
  id          String   @id @default(cuid())
  lang        String   // zh|en
  testType    String   // placement|topic|benchmark|from_content
  topic       String?
  level       String?
  score       Float?
  maxScore    Float?
  durationSec Int?
  blueprint   Json?    // {itemTypes:[...], count:n}
  createdAt   DateTime @default(now())
  items       TestItem[]
  activity    Activity?
}

model TestItem {
  id          String   @id @default(cuid())
  testId      String
  test        TestSession @relation(fields: [testId], references: [id], onDelete: Cascade)
  index       Int
  itemType    String   // mc_vocab|mc_grammar|cloze|listening|writing|translation
  prompt      String
  audioText   String?  // cho item listening
  options     Json?    // ["a","b","c","d"]
  answer      String?
  userAnswer  String?
  isCorrect   Boolean?
  cardId      String?  // nếu sai → đẩy thẻ về ôn
  skillName   String?
  errorGroups Json?    // {grammar:[],vocab:[],expression:[],context:[]}
  notes       String?
  seconds     Int?
}
```

### 5.8 Quan hệ tổng thể

```
UserProfile ──┐
Skill ────────┼──< Activity ──< Evidence
  └──< Skill (children)   └──< Reflection
PlanItem ── skillId? (không FK cứng, giữ linh hoạt seed)
Card ──< Review          Card ◄── cardId ── TestItem
InterviewProfile ──< InterviewSession ──< InterviewTurn
TestSession ──< TestItem
AiCall (độc lập, ghi log)
DailyState (độc lập, unique theo date)
```

---

## 6. Lớp AI — AI Router hybrid

> Theo `tech.md` + `product.md`: **KHÔNG phải Anthropic-only**. Mọi tính năng AI đi qua **một router duy nhất**.

### 6.1 Router (`src/lib/ai/router.ts`)

```
route handler → router.route(task) → { provider: "local" | "anthropic", model, effort }
                                 ├─ local     → Ollama HTTP (0 token, offline-safe)
                                 └─ anthropic → Anthropic SDK (streaming + prompt cache)
```

```ts
export type AiTask =
  // local
  | "autofill"            // AI-02 — S05 quick-log parsing
  | "classify"            // AI-06 — S06 journal classify
  | "language_correct"    // AI-09 — S11 grammar correction
  | "language_level"      // AI-16 — S21 CEFR estimation
  | "test_from_content"   // AI-17 — S19 self-generated test structure
  | "biometric_correlate" // AI-18 — S12 bio ↔ performance correlation
  | "mock_next_question"  // AI-19 — S17 adaptive next question
  // anthropic
  | "daily_plan"              // AI-01 — S01/S02
  | "grading"                 // AI-03/AI-04 — S07/S08
  | "journal_feedback"        // AI-05 — S06
  | "weekly_review"           // AI-07 — S13
  | "roleplay"                // AI-08 — S11
  | "language_cards"          // AI-10 — S11
  | "mock_interview"          // AI-11 — S17
  | "mock_interview_turn"     // AI-12 — S17
  | "mock_interview_report"   // AI-13 — S18
  | "language_test_grade"     // AI-15 — S20/S21
  // không AI
  | "test_blueprint";         // AI-14 — chọn lọc tất định từ seed

export type AiRoute = {
  provider: "local" | "anthropic";
  model: string;
  effort: "low" | "medium" | "high";
};

export function route(task: AiTask): AiRoute;
```

**Bảng routing (bắt buộc — đối chiếu nhãn provider trong 21 màn hình Stitch):**

| Task | Provider | Model | Effort | Chi phí | Nhãn trong mockup |
|---|---|---|---|---|---|
| `autofill` | **local** | `qwen2.5:7b` | thấp | 0 token | S05 `Local AI … tự parsing` · `Zero Cloud Latency Guarantee 0ms delay` |
| `classify` | **local** | `qwen2.5:7b` | thấp | 0 token | S06 `Phân loại tự động (Claude Haiku 4.5)` ⚠️ drift — xem ghi chú 1 |
| `language_correct` | **local** | `qwen2.5-coder:7b-instruct` | thấp | 0 token | S21 `Model: Qwen2.5-Coder-7B-Instruct (Local)` |
| `language_level` | **local** | `qwen2.5-coder:7b-instruct` | thấp | 0 token | S21 `Model: Qwen2.5-Coder-7B-Instruct (Local)` |
| `test_from_content` | **local** | `qwen2.5:7b` | medium | 0 token | S19 `CẤU TRÚC ĐỀ TỰ TẠO: Ollama Qwen-2.5 7B` |
| `biometric_correlate` | **local** | `llama3.3` | thấp | 0 token | S12 `Engine suy diễn cục bộ (Local Vector Engine)` |
| `mock_next_question` | **local** | `llama3.3` | thấp | 0 token | S17 `Mô hình đánh giá: Local Llama-3.3 + Opus` |
| `daily_plan` | anthropic | `claude-opus-5` | medium | có | S02 `Claude Opus 5` |
| `grading` | anthropic | `claude-opus-5` | medium | có | S07 `Chấm bằng AI (Claude Opus 5)` |
| `journal_feedback` | anthropic | `claude-opus-5` | thấp | có | S06 `✨ Gửi AI phản hồi (Claude Opus 5)` |
| `weekly_review` | anthropic | `claude-opus-5` | high | có | S13 `Claude Opus 5` |
| `roleplay` | anthropic | `claude-opus-5` | medium | có | S11 `Claude Opus 5 streaming` |
| `language_cards` | anthropic | `claude-haiku-4-5` | thấp | có | S06 `Claude Haiku 4.5` |
| `mock_interview` | anthropic | `claude-opus-5` | medium | có | S17 `Claude Opus 5 — Adaptive Lead Evaluator` |
| `mock_interview_turn` | anthropic | `claude-opus-5` | medium | có | S17 `Claude Opus 5` + S16 `Claude 3.5 Sonnet / Opus 5` |
| `mock_interview_report` | anthropic | `claude-opus-5` | high | có | S18 `Claude Opus 5 (Evaluator v2.4)` |
| `language_test_grade` | anthropic | `claude-opus-5` | medium | có | S21 `Evaluator Engine: Neural-Grammar-v2` |

> **Hàng dự phòng:** `Claude 3.5 Sonnet` khi `claude-opus-5` lỗi (S16 ghi `Claude 3.5 Sonnet / Opus 5`).
> **Drift nhãn trong mockup — 3 điểm đã chốt:**
> 1. **S06 ghi `Claude Haiku 4.5` cho tác vụ classify** trong khi S05 ghi `Local AI Haiku 4.5` cho tác vụ cùng loại — hai màn hình mâu thuẫn. `Haiku 4.5` là model **cloud**. Quyết định: **mặc định local** (`qwen2.5:7b`, 0 token, offline-safe, khớp badge `AI Offline / Local (Ollama)` toàn hệ thống + P6); đường cloud Haiku 4.5 là **tuỳ chọn** bật được trong S15.
> 2. **S19 ghi `Ollama Qwen-2.5 7B`** cho `from_content` → AI-17 chạy **local**, không cloud.
> 3. **AI-14 (blueprint bài kiểm tra) không gọi AI** — chọn lọc tất định từ thẻ đến hạn + ngân hàng seed (đúng FR-LT-12 "đề song song về độ khó"). Chỉ `from_content` mới thật sự sinh đề.
### 6.2 Fallback chain (bắt buộc)

```
anthropic lỗi → local (Ollama) → rule cục bộ
```

- **Không bao giờ** trả lỗi trần cho UI.
- Bước 2 chỉ dùng được cho task có thể chạy local (xem bảng §6.1) hoặc khi local có model tương đương.
- Bước 3 = `lib/plan.ts` cho `daily_plan`; các task còn lại → `AiUnavailableError` + UI hiển thị "Cần API key — mở Cài đặt".
- Mỗi lần fallback phải ghi `AiCall` với `provider` tương ứng để S15 hiển thị đúng `3 offline fallback`.

### 6.3 Client Anthropic (`src/lib/ai/anthropic.ts`)

```ts
export async function callAnthropic<T>(opts: {
  task: AiTask;
  system: string;                 // PHẢI giống nhau giữa các lần để cache hit
  messages: Anthropic.MessageParam[];
  schema: z.ZodType<T>;           // structured output
  effort?: "low" | "medium" | "high";
  stream?: boolean;
  maxTokens?: number;
}): Promise<T>;
```

**Trách nhiệm (bắt buộc):**
1. Chèn `cache_control: { type: "ephemeral" }` vào block cuối của `system` (system prompt cố định = prefix cache).
2. Ghi 1 dòng `AiCall` (tokens + cacheRead/cacheWrite + estimatedCost + ok/error + provider).
3. Bắt lỗi → ném typed exception (xem §7) → để router quyết định fallback.
4. **Không** chèn `Date.now()`, UUID, hay timestamp nào vào `system` (FR-AI-09).

### 6.4 Client Ollama (`src/lib/ai/ollama.ts`)

```ts
export async function callLocal<T>(opts: {
  task: AiTask;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  model?: string;                 // default theo bảng §6.1
  temperature?: number;
}): Promise<T>;
```

- Gọi `POST http://localhost:11434/api/chat` với `format` là JSON schema (tương đương structured output của Anthropic).
- **Timeout mặc định 30s**; hết giờ → ném `AiTimeoutError` → fallback tiếp.
- Nếu `ollama` không chạy (`ECONNREFUSED`) → ném `AiUnavailableError` → fallback tới rule cục bộ.
- **Không ghi `AiCall` có chi phí** — ghi `provider = "local"`, `cost = 0`.

### 6.5 Prompt caching

```
system: [
  { type: "text", text: SYSTEM_PROMPT_V1, cache_control: { type: "ephemeral" } }
]
```

- `SYSTEM_PROMPT_V1` là hằng số module-level trong `lib/prompts.ts`, **không** chứa biến động.
- Rubric nằm trong system prompt → cùng prefix cho mọi lần chấm → cache hit cao.
- Kiểm chứng: `AC-5` — call thứ 2 phải có `usage.cache_read_input_tokens > 0`.
- Badge `Prompt Cache Engine: ACTIVE` trên S15 là **yêu cầu kiểm chứng được**, không phải tối ưu sau.

### 6.6 Structured output

Dùng `output_config.format` (structured outputs) + zod schema:

```ts
const GradingSchema = z.object({
  criteria: z.array(z.object({
    key: z.enum(["clarity","structure","tone","natural","grammar"]),
    score: z.number().min(0).max(5),
    comment: z.string(),
    suggestion: z.string(),
  })).length(5),
});
```

**Không** parse JSON từ text tự do (FR-AI-04). Local provider dùng `format: <json schema>` của Ollama — cùng 1 zod schema, khác backend.

### 6.7 Streaming (`src/lib/ai/streaming.ts`)

- Helper SSE dùng chung: đọc `ReadableStream` → phát event `token` tới client → `done`.
- Chỉ dùng cho provider `anthropic` (local không streaming).
- Route handler trả `text/event-stream`; client dùng `EventSource` hoặc `fetch` + `ReadableStream`.

### 6.8 Bảng chi phí ước tính (USD / 1M token)

| Model | Input | Output | Cache write | Cache read |
|---|---|---|---|---|
| `claude-opus-5` | 15.00 | 75.00 | 18.75 | 1.50 |
| `claude-haiku-4-5` | 1.00 | 5.00 | 1.25 | 0.10 |
| **local (Ollama)** | **0** | **0** | **0** | **0** |

`estimatedCost = (input*in + output*out + cacheWrite*cw + cacheRead*cr) / 1_000_000`

Ước lượng 1 phiên mock 8 câu: **~$0.18**.

**Số liệu tham chiếu từ S15 (mockup đã duyệt):** ngân sách `$4.82 / $15.00` · cache hit `91.4%` · `128,450 tokens` tái sử dụng · `142 lượt chạy · 139 thành công · 3 offline fallback` · latency TB `418ms` · chia chi phí: Mock Interview `$1.85 (38%)` · Daily Plan `$1.10 (23%)` · Communication `$0.95 (20%)` · Language Test `$0.72 (15%)` · Quick-log autofill `$0.20 (4%)`.

> ⚠️ Con số này **phải được tính từ `AiCall` thật** trong DB, không hardcode.

### 6.9 Chế độ offline (FR-AI-06)

> Nhóm task dưới đây **derive trực tiếp từ bảng định tuyến §6.1** — không hardcode ở nơi khác. `ROUTES` trong `src/lib/ai/router.ts` là nguồn duy nhất.

**Nhóm local** (chạy qua Ollama, **0 token**, hoạt động khi mất mạng) — 7 task:
`autofill` · `classify` · `language_correct` · `language_level` · `test_from_content` · `biometric_correlate` · `mock_next_question`

**Nhóm anthropic** (cần key + mạng) — 10 task:
`daily_plan` · `grading` · `journal_feedback` · `weekly_review` · `roleplay` · `language_cards` · `mock_interview` · `mock_interview_turn` · `mock_interview_report` · `language_test_grade`

**Không gọi AI:** `test_blueprint` (AI-14 — chọn lọc tất định từ thẻ đến hạn + ngân hàng seed)

Router kiểm tra theo thứ tự:

1. Không có `ANTHROPIC_API_KEY` **và** task thuộc nhóm local → gọi Ollama.
2. Không có `ANTHROPIC_API_KEY`, task thuộc nhóm anthropic → thử Ollama (model tương đương) → nếu không được → `AiUnavailableError` → UI hiển thị "Cần API key — mở Cài đặt".
3. Có `ANTHROPIC_API_KEY` → gọi Anthropic; lỗi → fallback chain §6.2.
4. **Không bao giờ** trả phản hồi giả lập.

**Badge header `AI Offline / Local (Ollama)`** phải phản ánh trạng thái thật: đọc từ `DbStatus`/context, đổi sang `AI Cloud (Anthropic)` khi đang dùng provider cloud. Mockup S15 hiện `AI Offline / Local (Ollama)` trên **21/21** màn hình — badge này là trạng thái mặc định khi chưa cấu hình key.

### 6.10 Sinh kế hoạch fallback (`lib/plan.ts`)

```ts
export function generateLocalPlan(ctx: {
  date: Date;
  skills: Skill[];
  dueCards: number;
  streak: number;
  lastWeekCompletion: number;
}): PlanSlot[]
```

Quy tắc cố định theo 6 slot (AI cũng phải tuân thủ):

| Slot | Domain | Nội dung fallback | Thời lượng |
|---|---|---|---|
| 0 | `professional` | Học kỹ năng yếu nhất trong cây | 25–45′ |
| 1 | `communication` | Viết 1 đoạn theo đề bài gợi ý | 15–30′ |
| 2 | `language` | Ôn N thẻ đến hạn (N = min(dueCards, 20)) | 10–20′ |
| 3 | `language` | Luyện viết 5 câu theo chủ đề ngẫu nhiên | 15–25′ |
| 4 | `personal` | Viết nhật ký 5 phút | 5–10′ |
| 5 | `personal` | Đi bộ / tập thể dục / nghe nhạc thư giãn | 15–30′ |

---

## 7. Xử lý lỗi

### 7.1 Lớp exception (`lib/errors.ts`)

```ts
export class AiRefusalError      extends Error { stopReason: string }
export class AiRateLimitError    extends Error { retryAfter?: number }
export class AiNetworkError      extends Error {}
export class AiUnavailableError  extends Error {}   // thiếu API key
export class AiTimeoutError      extends Error {}
export class ValidationError     extends Error { issues: string[] }
```

### 7.2 Ma trận xử lý

| Tình huống | Server | UI | Ghi DB |
|---|---|---|---|
| `stop_reason: "refusal"` | ném `AiRefusalError` → fallback chain | toast "AI không thể xử lý nội dung này. Bạn có thể diễn đạt lại." | `AiCall{ok:false, error:"refusal"}` |
| 429 rate limit | ném `AiRateLimitError` → fallback chain | toast "Quá nhiều yêu cầu, thử lại sau {n}s" + nút "Thử lại" | `AiCall{ok:false}` |
| Network / timeout | ném `AiNetworkError` → fallback chain | toast + giữ nội dung người dùng trong editor | `AiCall{ok:false}` |
| Thiếu `ANTHROPIC_API_KEY` | router tự chuyển sang local (nếu task local) hoặc ném `AiUnavailableError` | banner "Chưa cấu hình API key — đang dùng chế độ offline" | `AiCall{provider:"local", ok:true}` nếu local chạy được |
| Ollama không chạy (`ECONNREFUSED`) | ném `AiUnavailableError` → rule cục bộ | toast "Không kết nối được Ollama — dùng quy tắc cục bộ" | `AiCall{ok:false, error:"ollama_down"}` |
| Response không khớp schema | `ValidationError` | toast + retry 1 lần rồi fallback rule | `AiCall{ok:false, error:"schema"}` |
| Lỗi DB (SQLite locked) | 500 | toast "Không ghi được, thử lại" | không |

**Nguyên tắc:** mọi lỗi AI đều **không** làm trang crash (AC-8). Route handler bọc `try/catch` và trả `{ ok:false, error: { code, message } }` với HTTP status phù hợp.

### 7.3 Xử lý ở tầng UI

- Mọi nút submit: `disabled` + spinner khi đang chạy → chống double-submit.
- Mọi form có `aria-live="polite"` cho trạng thái (NFR-06).
- Ô nhập nội dung **không** bị reset khi AI lỗi.
- Optimistic update chỉ dùng cho toggle "đã xong" slot; rollback khi lỗi.

---

## 8. Chiến lược kiểm thử

### 8.1 Cấp độ

| Cấp | Công cụ | Phạm vi |
|---|---|---|
| Unit | Vitest | `lib/levels.ts`, `lib/fsrs.ts`, `lib/plan.ts`, `lib/dates.ts`, `lib/skills.ts` |
| Integration | Vitest + `prisma` test DB | route handlers, luồng ghi Activity/Evidence/PlanItem |
| Component | Vitest + Testing Library | `RubricGrid`, `GradeButtons`, `SlotCard`, `EvidenceTable` |
| E2E | Playwright | 8 luồng chính (bên dưới) |
| Visual | Playwright screenshot + snapshot | 21 màn hình so với `screen.png` |

### 8.2 Test bắt buộc theo AC

| AC | Test |
|---|---|
| AC-3 | `levels.test.ts` — 2 evidence rating 3 + 1 evidence rating 4 → level +1; tick checkbox không đổi level |
| AC-4 | `fsrs.test.ts` — chấm Good → `due` khớp `ts-fsrs`; Again → `due = hôm nay`, `lapses +1` |
| AC-5 | `cache.test.ts` (integration, bỏ skip khi có key) — 2 call cùng system → call 2 `cache_read_input_tokens > 0` |
| AC-6 | `grading.test.ts` — response có đúng 5 tiêu chí, `score ∈ [0,5]`, tổng = trung bình |
| AC-7 | `offline.test.ts` — bỏ `ANTHROPIC_API_KEY` → `daily_plan` vẫn trả 6 slot (qua Ollama hoặc rule cục bộ) |
| AC-7b | `router.test.ts` — `route("classify")` → `{provider:"local"}`; `route("grading")` → `{provider:"anthropic"}`; anthropic lỗi → fallback sang local → `AiCall{provider:"local", fallbackFrom:"anthropic"}` |
| AC-8 | `refusal.test.ts` — mock API trả `stop_reason:"refusal"` → route trả `{ok:false}`, không 500 |
| AC-9 | `interview.test.ts` — 8 câu → mỗi câu đủ 5 tiêu chí; báo cáo đúng 3 mạnh + 3 yếu |
| AC-10 | `skills.test.ts` — node 0 evidence được chọn trước node 2 evidence |
| AC-11 | `test-session.test.ts` — 5 câu sai → 5 thẻ `due = hôm nay`, `lapses +1`; 0 câu sai → hiện "0 thẻ bị đẩy về ôn" |
| AC-12 | `language-grade.test.ts` — lỗi chỉ thuộc 1 trong 4 nhóm |
| AC-13 | `interview-report.test.ts` — 2 phiên cùng hồ sơ → có delta từng tiêu chí |
| AC-14 | `quick-log-draft.test.ts` — viết → reload → bản nháp còn |
| AC-15 | `shell.test.tsx` — 21 route render cùng sidebar 9 mục + header |

### 8.3 E2E luồng chính

1. **Daily Loop đầy đủ:** mở `/` → kế hoạch trống → "Lập kế hoạch hôm nay" → 6 slot xuất hiện → bấm "Xong" slot 1 → slot gạch ngang → streak +1 → `Activity` + `Evidence` trong DB.
2. **Quick-log ≤10s:** Cmd+K → preset 1 → gõ → "Ghi nhanh ngay" → dòng mới ở đầu lịch sử → thanh phân bổ cập nhật.
3. **SRS vòng lặp:** `/language` → "Ôn ngay" → thẻ → hiện đáp án → Good → thẻ tới hạn +N ngày → lịch sử ghi 1 `Review`.
4. **Chấm giao tiếp:** `/speak/write` → viết → "Chấm bài" → 5 tiêu chí → "Lưu" → tạo Activity + Evidence.
5. **Mock Interview:** `/interview/setup` → chọn hồ sơ → 8 câu → trả lời 8 lần → "Xem kết quả" → S18 có 5 tiêu chí + 3 mạnh + 3 yếu → tạo Evidence.
6. **Bài kiểm tra:** `/test` → chọn topic → 10 câu → nộp → S21 → 3 thẻ bị đẩy về ôn → bấm "Ôn ngay" → S10 mở đúng 3 thẻ.
7. **Weekly Review:** `/review` → "Duyệt & Áp dụng" → 6 `PlanItem` tuần sau với `source=ai`.
8. **Privacy:** `/settings` tab 2 → lưu key → file `.env.local` có key, `.gitignore` chứa `.env.local`, response không trả về key đầy đủ.

### 8.4 Visual regression

Snapshot 21 màn hình ở viewport `1440×900` (desktop) và `390×844` (mobile) so với `stitch_daily_loop_os/sXX_*/screen.png`. Ngưỡng chấp nhận: khác biệt pixel ≤ 2% mỗi màn hình.

### 8.5 Test token nhất quán (NFR-10)

`tokens.test.ts` đọc `src/styles/tokens.ts` và assert:
- Không tồn tại màu hardcode ngoài palette (quét `src/**` cho hex không nằm trong palette).
- `borderRadius` chỉ có 4 giá trị.
- `fontSize` chỉ có token đã khai báo.

---

## 9. Xung đột thiết kế ↔ đặc tả (phải xử lý trước khi code)

Danh sách này được phát hiện khi đối chiếu 21 màn hình Stitch với `SPEC.md` và `DESIGN.md`. **Không được im lặng sửa** — mỗi mục có quyết định cụ thể.

### 9.1 Mâu thuẫn token

| # | Vấn đề | Quyết định |
|---|---|---|
| 1 | `DESIGN.md` mô tả emerald `#10b981` / indigo `#6366f1` / amber `#f59e0b`, surfaces `#090d16`/`#111726`/`#182238`/`#232f4b`. Code dùng `primary-container #10b981`, `secondary #c0c1ff` / `secondary-container #3131c0`, `tertiary #ffb95f` / `tertiary-container #e29100`, surfaces `#0f131c`/`#181b25`/`#1c1f29`/`#262a34`/`#31353f`. `#6366f1` và `#f59e0b` **không xuất hiện** trong code. | **Code là nguồn sự thật.** Cập nhật `DESIGN.md` cho khớp code. `secondary` = tím nhạt `#c0c1ff`, `tertiary` = cam `#ffb95f`. |
| 2 | **Radius:** `DESIGN.md` (`rounded:`) = sm .125 / DEFAULT .25 / md .375 / lg .5 / xl .75 / full 9999px. HTML config (**21/21 giống hệt**) = DEFAULT .125 / lg .25 / xl .5 / full **.75**. | **Dùng giá trị HTML** cho layout (21 màn hình đã được duyệt bằng bản đó). Cập nhật `DESIGN.md`: `full` = `0.75rem`, `DEFAULT` = `0.125rem`. ⚠️ **Không** dùng `rounded-full` để làm hình tròn — nó = 12px (đã verify bằng pixel: avatar S01 là squircle). Dùng `rounded-[9999px]` khi cần tròn thật. |
| 3 | **`headline-sm`:** `DESIGN.md` = `1.25rem`. HTML: `0.8125rem` ở **s01, s03, s10, s18**; `1.25rem` ở 17 màn hình còn lại. | **Chốt `1.25rem`** (khớp `DESIGN.md` và 17/21 màn hình). 4 màn hình lệch là lỗi của mockup → sửa khi dựng lại. |

### 9.2 Mâu thuẫn nội dung & điều hướng

| # | Vấn đề | Quyết định |
|---|---|---|
| 4 | Chu kỳ heatmap S14 là `01/08/2024 → 29/10/2024`; log bằng chứng S04 dùng năm 2024 — trong khi app dùng ngày 2026. | **Dùng ngày thật từ DB.** Mockup chỉ là tham chiếu bố cục. |
| 5 | Nhãn nav mục 8 biến thiên: `Báo cáo tuần & tiến độ` (S01, S02, S03, S10, S13, S17) vs `Báo cáo & tiến độ` (S04, S08, S11, S12, S14) vs `Báo cáo tuần` (S05, S06). | Chốt **`Báo cáo tuần & tiến độ`** cho toàn hệ thống. |
| 6 | Số mục nav: **8 mục** ở S01, S03, S05, S06, S10, S18; **9 mục** ở 15 màn hình còn lại. Thiếu mục chủ yếu là "Luyện giao tiếp". | Đủ **9 mục** trên mọi màn hình (AC-15). |
| 7 | `data-path` không nhất quán: 2 họ giá trị — `hom-nay-daily-loop` / `cay-ky-nang` / `bai-kiem-tra`… (S01, S03, S10, S18) vs `s01-daily-loop-hom-nay` / `s03-cay-ky-nang-bang-chung` / `s21-ket-qua-bai-kiem-tra-ngoai-ngu`… (15 màn hình còn lại). | Chốt **1 họ duy nhất** trong `lib/nav.ts`. Không dùng `data-path` để định tuyến — dùng `href` thật + `usePathname()` so khớp `pathname` prefix. `data-path` chỉ còn là attribute debug. |
| 8 | Nav "Mock Interview" trỏ `s17-mock-interview-phien-phong-van` (S02, S07, S13, S17) hoặc `s16-mock-interview-cau-hinh` (S04, S08, S09, S11, S12, S14, S20); nav "Bài kiểm tra" trỏ `s21-...` hoặc `s19-...`. | Chốt: nav "Mock Interview" → `/interview/setup` (S16); nav "Bài kiểm tra" → `/test` (S19). S13 dùng link nội bộ tới S18/S21 nếu cần. |

### 9.3 Nút "chết" trong mockup

Phải cài handler hoặc bỏ. Danh sách:

| Màn hình | Nút chưa có handler |
|---|---|
| S09 | "Xuất Deck JSON", "Thêm thẻ thủ công" |
| S11 | "Xoá nhập lại", "Phát âm mẫu", chuyển tab |
| S12 | toggle "7 Ngày / 30 Ngày" |
| S13 | "Xuất JSON" (chỉ toast, không tạo file) |
| S14 | filter tab domain |
| S15 | nút mắt (hiện key), CSV/JSON export, xóa trắng, chuyển tab, phân trang, toggle khẩn cấp |
| S08 | pause / redo / filter |
| S06 | `#writing-time` `14m 20s` là số tĩnh |
| S17 | timer `04:12` / `18:30` là số tĩnh |
| S10 | `04:18` và `3/12` là số tĩnh |
| S12 | `2 / 3 Bài viết` là số tĩnh |
| S13 | `38 / 42` là số tĩnh |

→ Mọi số "live" trong mockup phải bind dữ liệu thật. Nếu 1 màn hình không có dữ liệu thật → hiện empty state, **không** hiện số giả.

### 9.4 Lỗi đã biết trong bản HTML tham chiếu (KHÔNG được tái tạo)

**10 lỗi token/navigation (theo `tech.md` — đã verify lại trên mockup):**

| # | Màn hình | Lỗi | Xử lý |
|---|---|---|---|
| 1 | S01, S03, S10, S18 | `headline-sm` bị định nghĩa sai (`0.8125rem` thay vì `1.25rem`) | Token chuẩn dùng `1.25rem` (§9.1-3) |
| 2 | 21/21 | `borderRadius` lệch với `DESIGN.md` | Dùng giá trị HTML; `full` = `0.75rem` (§9.1-2) |
| 3 | 21/21 | `data-path` không nhất quất giữa 2 họ giá trị | `lib/nav.ts` là nguồn duy nhất; dùng `href` thật + `usePathname()` (§9.2-7) |
| 4 | 20/21 | Sidebar thiếu trạng thái active (chỉ **S18** có link active) → user không biết đang ở màn nào | **Một** cơ chế `NAV_ITEMS` dùng chung, tự tính active từ `usePathname()` |
| 5 | S21 | `playAudio(termKey)` dùng **global `event`** ngầm (`const btn = event.currentTarget;`) → `ReferenceError` khi gọi hàm | Truyền `event` qua tham số: `onClick={(e) => playAudio(e, termKey)}` |
| 6 | S15 | `<input type="password" value="sk-ant-api03-abcdef9876543210masterkeyxyzA">` — **literal API key hardcode** trong HTML | Đọc từ `.env.local` qua `/api/settings/key`; **không** commit key; **không** hiển thị đầy đủ trong UI (chỉ `sk-…xyzA`) |
| 7 | S16 | JS `c.querySelector('.role-selected-badge')` tìm class không tồn tại trong markup → badge "Đang chọn" không xoá | React state |
| 8 | S20 | Quảng bá phím `[P]`, `[F]`, `[Ctrl+Enter]` nhưng `keydown` chỉ xử lý `Space` và `1`–`4` | Hoặc implement đủ 3 phím, hoặc sửa label cho khớp — **phải khớp** |
| 9 | S17, S20 | `grid-cols-8` cố định → không co được trên mobile | `grid-cols-1 md:grid-cols-4 xl:grid-cols-8` |
| 10 | S15, S19, S21 | Chú thích tooltip/legend lệch nhau (vd "Writing Rubric" vs "Communication") | Chốt 1 bộ nhãn thống nhất cho toàn hệ thống |

**Lỗi JS/CSS khác phát hiện khi rà 21 màn hình:**

| Màn hình | Lỗi | Xử lý |
|---|---|---|
| S01 | `closest('.bg-surface-container, .bg-surface-container-high')` → selector không hợp lệ → `DOMException`, checkbox hỏng | React state |
| S02 | `button:has(:contains(...))` → `querySelector` ném lỗi, nút "Áp dụng" không tìm thấy | React state |
| S03 | `button:has(.text-tertiary)` match nhầm phần tử cha | `data-skill-id` + ref |
| S05 | `recordActivity()` nội suy input người dùng vào `innerHTML` → **XSS** | React escape, không `dangerouslySetInnerHTML` |
| S19 | reset ZH làm mất `bg-primary-container` | Sửa khi dựng lại |
| S02/S05/S06 | `<link>` Material Symbols bị nhân bản | 1 `<link>` duy nhất trong `layout.tsx` |

### 9.5 Xung đột NFR-01 ↔ thiết kế

`SPEC.md` NFR-01 ghi "Mobile-first, dùng được ở 390px", nhưng **cả 21 mockup đều desktop-first**: sidebar cố định 288px, `pl-72`, grid `xl:grid-cols-12`, không có collapse cho tablet/mobile.

**Quyết định:** chấp nhận desktop-first làm chuẩn hiển thị chính (vì đây là công cụ làm việc cá nhân, dùng 1 màn hình lớn), nhưng **phải** có drawer sidebar dưới 1024px để app không vỡ trên màn hình nhỏ. Sửa lại NFR-01 thành: "Dùng được từ 1280px xuống; dưới 1024px sidebar thu gọn thành drawer, grid 12 cột chuyển 1 cột."

### 9.6 Seed data cho từ vựng

`SPEC.md` Phụ lục B ghi rõ danh sách 120 thẻ là "bản khởi đầu để review, chưa phải bản cuối". Trước khi seed cần chốt Q1 (ngành) và Q3 (mức tiếng Anh thật). Tạm dùng nguyên danh sách hiện có, có cờ `reviewed: false` trong `Card.note` để dễ sửa sau.

---

## 10. Rủi ro thiết kế & giảm thiểu kỹ thuật

| Rủi ro | Giảm thiểu |
|---|---|
| SQLite ghi đồng thời (RSC + route handler) | Prisma singleton + `PRAGMA journal_mode=WAL` + `busy_timeout=5000` |
| Cache miss do system prompt biến động | `SYSTEM_PROMPT_V1` hằng số module-level; test AC-5 chạy trong CI khi có key |
| Structured output schema lệch khi AI trả thiếu field | zod `.safeParse` → retry 1 lần → fallback rule |
| Điểm AI không ổn định giữa các lần | `temperature` cố định (mặc định 1.0 cho Opus, chấm điểm dùng `effort: medium`), rubric chi tiết, lưu từng tiêu chí kèm lý do |
| 21 màn hình lệch token | `focus_flow/DESIGN.md` YAML là nguồn sự thật → `@theme` trong `globals.css`; test `tokens.test.ts` quét hex lạ + assert giá trị radius/typography |
| Ollama không cài / không chạy | Phát hiện qua `GET /api/tags` (timeout 3s); router fallback tiếp sang rule cục bộ; badge header hiện "Offline"; S15 hướng dẫn cài đặt |
| Model local yếu hơn cloud → chấm điểm sai | Task chấm điểm **luôn** dùng provider `anthropic`; provider `local` chỉ dùng cho task trích xuất/phân loại, có thể kiểm tra schema bằng zod |
| Rò rỉ API key | Key chỉ ở `.env.local`; route `GET` chỉ trả masked key; `.gitignore` có `.env.local`; grep `sk-ant-` trong CI (AC-16) |
| Sidebar lệch giữa 21 màn hình | `lib/nav.ts` là nguồn duy nhất; `tests/e2e/shell.spec.ts` assert đủ 9 mục + 1 active trên mọi route |
| SSR + Web Speech API | Mọi component dùng `speechSynthesis` phải là client component, khởi tạo trong `useEffect` |
| `Date.now()` lọt vào prompt → cache miss | Test tĩnh: assert system prompt không chứa template literal động |
| Mất dữ liệu khi đóng tab giữa chừng | Form lưu draft `localStorage`; bài kiểm tra lưu từng câu ngay khi trả lời (FR-LT: lưu ngay) |

---

## 11. Checklist trước khi triển khai

- [ ] Chốt Q1–Q8 trong `requirements.md` §"Câu hỏi cần chốt".
- [ ] Cập nhật `stitch_daily_loop_os/focus_flow/DESIGN.md` cho khớp code (mục 9.1-1, 9.1-2, 9.1-3) — đặc biệt `rounded.full` = `0.75rem`, `rounded.DEFAULT` = `0.125rem`.
- [ ] Sửa `SPEC.md` NFR-01 theo 9.5.
- [ ] Dựng `src/app/globals.css` (`@theme`) từ `focus_flow/DESIGN.md` YAML frontmatter theo bảng quyết định §3.1.
- [ ] Dựng `AppShell` / `Sidebar` / `Topbar` dùng chung cho 21 route; nav lấy từ `lib/nav.ts`.
- [ ] Viết `prisma/schema.prisma` (19 model, `AiCall` có `provider` + `fallbackFrom`) + `prisma/seed.ts`.
- [ ] Viết `lib/errors.ts` + `lib/ai/router.ts` + `lib/ai/anthropic.ts` + `lib/ai/ollama.ts` + `lib/ai/streaming.ts`.
- [ ] Viết `lib/prompts.ts` (system + task prompt) **và** `lib/rubrics.ts` (4 rubric hằng số) — tách bạch 2 file.
- [ ] Viết `lib/levels.ts` + `lib/fsrs.ts` + `lib/plan.ts` + `lib/skills.ts` + `lib/nav.ts`.
- [ ] Thiết lập `.env.local` + `.gitignore` — **không** để lọt literal `sk-ant-...` từ mockup S15 (mục 9.4 #6).
- [ ] Xác nhận Ollama đã cài + `ollama pull qwen2.5:7b qwen2.5-coder:7b-instruct` (provider local).
- [ ] Smoke test 21 route: đủ 9 nav item + 6 chip header + 1 nav active.
