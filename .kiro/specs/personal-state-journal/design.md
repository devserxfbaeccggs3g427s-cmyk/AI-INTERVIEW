# Design — Nhật ký & Đánh giá chính (Personal State Journal)

> Feature: S06 `/journal` + S12 `/state` · Phase 0
> Nguồn: `.kiro/specs/personal-state-journal/spec.md`, `system-design/SPEC.md` §2.5/§3.2/§4/§5, `.kiro/steering/*`

## 1. Tổng quan kiến trúc

Cặp màn hình S06 + S12 là **hai đầu vào ghi dữ liệu** của vòng lặp Daily Loop, và là **hai màn hình duy nhất** trong app có dữ liệu sinh trắc nhạy cảm. Kiến trúc vì vậy xoay quanh một ràng buộc duy nhất: **mọi ghi/đọc dữ liệu cá nhân đi qua SQLite trên máy; chỉ một route API được phép đẩy nội dung nhật ký ra ngoài, và route đó chỉ chạy khi người dùng đã bấm nút AI với cờ `consent: true`.**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Next.js 15 App Router (Server Components mặc định)                          │
│                                                                              │
│  /journal  (S06)                       /state  (S12)                        │
│  ┌────────────────────────┐             ┌──────────────────────────────┐     │
│  │ JournalComposer        │             │ StateQuickForm              │     │
│  │ (Client · useState,    │             │ (Client · sliders, prefill) │     │
│  │  autosave, streaming)  │             └──────────┬───────────────────┘     │
│  │ JournalPromptChips     │                        │ PUT /api/state         │
│  │ AiFeedbackPanel        │                        ▼                         │
│  │ DisclosureLog          │             ┌──────────────────────────────┐     │
│  └────────┬───────────────┘             │ src/lib/state.ts            │     │
│           │                             │  getState / upsertState     │     │
│           │ POST /api/journal           │  getStateSeries             │     │
│           │ POST /api/journal/feedback  │  computeCorrelations ★      │     │
│           │ POST /api/journal/classify  │ (thuần JS · không AI)       │     │
│           ▼                             └──────────┬───────────────────┘     │
│  ┌────────────────────────────────────────────┐                              │
│  │ src/lib/journal.ts                        │                              │
│  │  createJournal / updateJournal            │                              │
│  │  classifyLocally (rule, offline)          │                              │
│  │  buildJournalContext (dữ liệu hành vi)    │                              │
│  └────────────┬───────────────────────────────┘                              │
│               │                                                              │
│               ▼                                                              │
│  ┌────────────────────────────────────────────┐   ┌──────────────────────┐   │
│  │ src/lib/anthropic.ts (wrapper ghi AiCall) │   │ src/lib/prompts.ts   │   │
│  │  AI-05 claude-opus-5 · streaming          │──▶│  JOURNAL_FEEDBACK_   │   │
│  │  AI-06 claude-haiku-4-5 · non-streaming  │   │  SYSTEM (hằng số)    │   │
│  └────────────┬───────────────────────────────┘   │  JOURNAL_CLASSIFY_   │   │
│               │                                   │  SYSTEM               │   │
│               ▼                                   └──────────────────────┘   │
│  ┌────────────────────────────────────────────┐                              │
│  │ Prisma + SQLite (dev.db) — bảng trung tâm Activity                       │
│  │  Reflection · Activity · Evidence · DailyState · PlanItem · Skill · AiCall│
│  └────────────────────────────────────────────┘                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Điểm mấu chốt:** `computeCorrelations` (FR-PS-05) là **hàm JS thuần** đọc dữ liệu từ SQLite — không AI, không request ra ngoài. Đây là điều kiện để giữ P6 trong khi vẫn có "Tương quan sinh học AI" trên UI (UI gọi nó là "Engine suy diễn cục bộ" — trung thực với prototype).

## 2. Kiến trúc

### 2.1 Sơ đồ luồng

#### 2.1.1 Luồng ghi nhật ký + AI (S06)

```
Người dùng                    Client (S06)                        Server                    Anthropic
     │                            │                                  │                          │
     │  gõ nhật ký                │                                  │                          │
     ├───────────────────────────▶│                                  │                          │
     │                            │ ── debounce 800ms ──▶           │                          │
     │                            │   PUT /api/journal/draft         │                          │
     │                            │   {answer, prompt}               │                          │
     │                            ├─────────────────────────────────▶│                          │
     │                            │                    createDraft() → Reflection{status:"draft"}
     │                            │◀─────────────────────────────────┤                          │
     │                            │   {ok:true, data:{draft}}        │                          │
     │                            │                                  │                          │
     │  bấm "Gửi AI phản hồi"    │  ← ĐÂY LÀ ĐIỂM DUY NHẤT        │                          │
     ├───────────────────────────▶│  ĐƯỢC PHÉP GỬI DỮ LIỆU RA NGOÀI │                          │
     │                            │                                  │                          │
     │                            │  ① POST /api/journal/classify   │                          │
     │                            │     {reflectionId, consent:true} │                          │
     │                            ├─────────────────────────────────▶│ AI-06 claude-haiku-4-5  │
     │                            │                                  ├─────────────────────────▶│
     │                            │                                  │◀─────────────────────────┤
     │                            │                                  │ {domain, skillId, conf} │
     │                            │◀─────────────────────────────────┤  (fallback: rule local) │
     │                            │                                  │                          │
     │                            │  ② POST /api/journal/feedback    │                          │
     │                            │     {reflectionId, consent:true} │                          │
     │                            ├─────────────────────────────────▶│ AI-05 claude-opus-5     │
     │                            │                                  │  system: [STABLE, RUBRIC]│
     │                            │                                  │  messages: [user ctx]   │
     │                            │                                  ├─────────────────────────▶│
     │                            │  ◀── SSE event: start            │                          │
     │                            │  ◀── SSE event: delta   (text)   │◀── stream ───────────────┤
     │                            │  ◀── SSE event: question         │                          │
     │                            │  ◀── SSE event: done             │◀─────────────────────────┤
     │                            │◀─────────────────────────────────┤ {summary, sharpQuestion}│
     │                            │                                  │                          │
     │                            │                                  │ ghi AiCall{ok:true,      │
     │                            │                                  │   dataPreview, sourceId}     │
     │                            │  ③ PATCH /api/journal/:id        │                          │
     │                            │     {aiFeedback:{...}}           │                          │
     │                            ├─────────────────────────────────▶│ update aiFeedback        │
     │                            │◀─────────────────────────────────┤                          │
```

#### 2.1.2 Luồng đánh giá chính + tương quan (S12)

```
Người dùng              Client (S12)              Server                  SQLite
     │                       │                        │                      │
     │ mở /state             │                        │                      │
     ├──────────────────────▶│ GET /api/state?window=7                      │
     │                       ├───────────────────────▶│ getStateSeries()     │
     │                       │                        ├─────────────────────▶│
     │                       │                        │◀─────────────────────┤
     │◀── prefill + history ─┤                        │                      │
     │                       │                        │                      │
     │ kéo slider + bấm Lưu  │                        │                      │
     ├──────────────────────▶│ PUT /api/state                                │
     │                       ├───────────────────────▶│ upsertState()        │
     │                       │                        ├─────────────────────▶│ DailyState (upsert)
     │◀── toast "Đã lưu" ───┤                        │                      │
     │                       │                        │                      │
     │ (panel tương quan)    │ GET /api/state/correlations?window=30         │
     ├──────────────────────▶├───────────────────────▶│ computeCorrelations()│
     │                       │                        │  ← đọc DailyState +  │
     │                       │                        │    Activity +        │
     │                       │                        │    PlanItem (JOIN)    │
     │                       │                        ├─────────────────────▶│
     │                       │                        │◀─────────────────────┤
     │◀── findings + r=0.88 ─┤                        │  KHÔNG gọi AI       │
```

### 2.2 Phân tầng

| Tầng | Module | Trách nhiệm |
|---|---|---|
| Route (UI) | `src/app/journal/page.tsx` | Server Component: fetch nhật ký đã commit + ngữ cảnh hành vi, render shell + `<JournalComposer>` (Client). |
| Route (UI) | `src/app/state/page.tsx` | Server Component: fetch `state` + `correlations`, render `<StateQuickForm>` (Client) + `<StateCharts>` (Client, toggle 7/30). |
| Component | `src/components/journal/journal-composer.tsx` | Textarea, autosave nháp, 3 chip gợi ý, nút lưu nháp, nút gửi AI, điều khiển stream SSE. |
| Component | `src/components/journal/ai-feedback-panel.tsx` | Render `{summary, sharpQuestion}`, khối phân loại, nút "Ghi câu trả lời", nút "Chấp nhận" (Evidence). |
| Component | `src/components/journal/disclosure-log.tsx` | Panel "Dữ liệu đã gửi lên" — đọc `/api/journal/disclosures`. |
| Component | `src/components/state/state-quick-form.tsx` | 3 slider, ô giờ ngủ, ghi chú, prefill, submit `PUT /api/state`. |
| Component | `src/components/state/state-charts.tsx` | SVG chart mood/energy/sleep + overlay slots, toggle 7/30, ma trận 7 ngày bấm để sửa. |
| Component | `src/components/state/correlation-panel.tsx` | Render findings + hệ số tương quan + trạng thái "chưa đủ dữ liệu". |
| API | `src/app/api/journal/route.ts` (+ `draft/`, `[id]/`, `feedback/`, `classify/`, `disclosures/`) | Validate Zod, gọi lib, trả `{ok,data}` / `{ok:false,error}`. |
| API | `src/app/api/state/route.ts` (+ `correlations/`) | Validate Zod, gọi lib, trả `{ok,data}`. |
| Lib (domain) | `src/lib/journal.ts` | CRUD nhật ký, `classifyLocally`, `buildJournalContext`. |
| Lib (domain) | `src/lib/state.ts` | CRUD `DailyState`, `getStateSeries`, `computeCorrelations` (thuần JS). |
| Lib (AI) | `src/lib/prompts.ts` | `JOURNAL_FEEDBACK_SYSTEM`, `JOURNAL_CLASSIFY_SYSTEM`, `JournalFeedbackSchema`, `JournalClassifySchema`. |
| Lib (AI) | `src/lib/anthropic.ts` | Wrapper gọi SDK + tự ghi `AiCall` (tokens, cache, cost). |
| Lib (hạ tầng) | `src/lib/db.ts`, `src/lib/dates.ts`, `src/lib/config.ts` | Prisma singleton; chuẩn hoá ngày; hằng số (`DAILY_STATE_MAX_SECONDS`… ). |

### 2.3 Quyết định thiết kế

| # | Quyết định | Lý do | Hệ quả |
|---|---|---|---|
| DEC-01 | **Tách bản nháp khỏi mục đã commit** bằng cột `Reflection.status` (`draft`/`published`) + `activityId` nullable. | Nhật ký phải lưu được offline khi đang viết (NFR-03), nhưng `Activity` là bảng trung tâm tính vào thống kê — bản nháp không được làm nhiễu số liệu và P3 (tiến độ = bằng chứng) không cho phép "hoạt động" chưa commit. | Thêm 1 migration; mọi truy vấn thống kê phải lọc `status = 'published'`. |
| DEC-02 | **`consent: true` là bắt buộc ở body** của `POST /api/journal/feedback` và `/classify`, và route kiểm tra nó **trước** khi đọc `Reflection.answer`. | P6 là ràng buộc pháp lý/đạo đức dữ liệu, không phải quy ước UI. UI có thể bị lỗi hoặc bị script gọi trực tiếp — server phải tự bảo vệ. | Route trả `401 {ok:false,error:"consent_required"}` nếu thiếu. Test tự động gọi route không consent → phải bị chặn. |
| DEC-03 | **Phân loại chạy SAU khi người dùng bấm nút AI**, không tự động khi lưu nhật ký. | FR-PS-04 nói "AI tự gán domain/kỹ năng", nhưng P6 nói chỉ nội dung người dùng **chủ động nhờ AI** mới được gửi. Tự phân loại lúc lưu = gửi nội dung không được hỏi. | Nhật ký vẫn được lưu và phân loại bằng **rule cục bộ** ngay (offline-safe); khi bấm nút AI, phân loại được nâng cấp bằng Haiku 4.5. |
| DEC-04 | **`computeCorrelations` là hàm JS thuần** (Pearson r + nhóm ngưỡng), không gọi model. | FR-PS-05 là P2; gọi AI để tìm tương quan sẽ (a) vi phạm P6 vì `DailyState` là dữ liệu sinh trắc, (b) tốn tiền vô ích, (c) cho kết quả không tái lập. | Panel gọi là "Engine suy diễn cục bộ" (đúng như prototype). Không có mục AI nào trong `AiCall` cho FR-PS-05. |
| DEC-05 | **AI-05 dùng streaming SSE** với `event: start/delta/question/done/error`. | FR-AI-02 bắt buộc streaming cho output dài; phản hồi AI-05 ngắn nhưng hiệu ứng "đang phân tích" giúp người dùng không tưởng treo. | Client đọc `ReadableStream`; nếu stream lỗi giữa chừng → `event: error`, UI giữ phần text đã nhận và cho nút "Thử lại". |
| DEC-06 | **Nút AI dùng style AI của design-system** (`bg-surface-container-high text-secondary` + viền `secondary/40`), **không** dùng emerald như prototype. | design-system §7.1 quy định secondary (indigo) = **mọi thao tác AI**; emerald = tiến độ/bằng chứng. Ưu tiên: `spec feature > steering > SPEC.md > prototype HTML` (project.md §1). | Screenshot sẽ khác prototype ở 1 nút; ghi nhận tại spec.md §9 PS-R7. |
| DEC-07 | **Biểu đồ vẽ bằng SVG thuần**, không dùng thư viện chart. | Design-system §10: "Chart: dùng màu token, không dùng palette mặc định của thư viện". Thêm 1 dependency (recharts) là rủi ro bundle cho 1 chart 4 series. | Toàn bộ màu lấy từ token `primary`/`secondary`/`tertiary`; không có palette mặc định. |
| DEC-08 | **Ngày dùng chuỗi `yyyy-MM-dd` local**, lưu `DateTime` chuẩn hoá 00:00 local. | tech.md §5 + rủi ro lệch ngày UTC (spec.md PS-R8). | `src/lib/dates.ts` cung cấp `toDayKey()`, `fromDayKey()`, `addDays()`; SQL dùng `strftime('%Y-%m-%d', date)` cho cột ngày đã chuẩn hoá. |
| DEC-09 | **Log gửi lên lưu ở `AiCall.dataPreview` (≤160 ký tự) + `sourceId`**, không lưu full nội dung trong log. | FR-PS-07 cần màn hình "dữ liệu nào đã gửi lên" nhưng log không được trở thành bản sao thứ hai của nhật ký (tăng bề mặt rò rỉ). | Panel hiển thị preview đủ để người dùng nhận ra nội dung; full nội dung vẫn nằm ở `Reflection.answer` (local). |
| DEC-10 | **AI-06 (`claude-haiku-4-5`) non-streaming, effort `low`**; **AI-05 (`claude-opus-5`) streaming, effort `low`**. | Bám SPEC §5.1. AI-06 là trích xuất ngắn → không cần stream, Haiku rẻ hơn. AI-05 cần chất lượng câu hỏi sắc → Opus 5. | Chi phí thấp: 1 lượt AI-05 ≈ $0.01 (xem §7.4). |
| DEC-11 | **`DailyState` không có trường chi tiết giấc ngủ (REM/Deep/Light)** dù prototype hiển thị vậy. | SPEC §4 định nghĩa `DailyState.sleep: Float?` = tổng giờ ngủ. Mô phỏng dữ liệu ngủ giả là vi phạm "không giả lập số liệu" (AC-11). | UI hiển thị 1 thanh tổng 0–10h; ghi rõ tại spec.md §6.2.2. |
| DEC-12 | **Tương quan dùng ngưỡng cố định** khai báo trong `src/lib/config.ts` (không để AI/heuristic tự chọn). | P4 — tiêu chí chấm phải cố định, không tự bịa. | `CORRELATION_RULES` là hằng số; thêm rule mới = sửa hằng số + test. |

## 3. Thành phần

### 3.1 `JournalComposer` (Client Component)

**Route/đường dẫn:** `src/components/journal/journal-composer.tsx`
**Responsibilities:**
- Quản lý nội dung textarea, bộ đếm ký tự, đồng hồ đang viết.
- Autosave bản nháp (debounce 800ms) qua `PUT /api/journal/draft`.
- Chèn câu hỏi gợi ý theo ngữ cảnh vào cuối textarea.
- Kích hoạt luồng AI: phân loại → stream phản hồi → lưu `aiFeedback`.
- Quản lý trạng thái nút (idle / classifying / streaming / error) để chặn double-submit.

**Interfaces:**
```ts
"use client";

export type JournalPromptContext = "after_study" | "end_of_day" | "weekend";

export interface JournalPromptChip {
  readonly id: JournalPromptContext;
  readonly icon: "lightbulb" | "track_changes" | "balance";
  readonly label: string;          // "Sau buổi học"
  readonly question: string;       // nguyên văn chèn vào textarea
  readonly active: boolean;        // chip theo ngữ cảnh hiện tại
}

export interface JournalComposerProps {
  readonly draft: JournalItemDto | null;              // bản nháp đã load từ server
  readonly initialReflectionId?: string;              // mục đang sửa (nếu có)
  readonly hasApiKey: boolean;
  readonly prompts: readonly JournalPromptChip[];
  readonly todayContext: JournalContextDto;           // 6 slot, kỹ năng, streak
  readonly onSaved?: (item: JournalItemDto) => void;
  readonly onFeedback?: (feedback: JournalFeedbackDto) => void;
}

export interface JournalComposerHandle {
  insertPrompt(question: string): void;
  focus(): void;
}

export function JournalComposer(props: JournalComposerProps): JSX.Element;
```

**Hàm phụ trong component:**
```ts
function pickPromptContext(now: Date): JournalPromptContext {
  const day = now.getDay();                       // 0 = Chủ nhật
  const hour = now.getHours();
  if (day === 0 || day === 6) return "weekend";
  if (hour >= 19 && hour <= 23) return "end_of_day";
  if (hour >= 8 && hour <= 13) return "after_study";
  return "end_of_day";
}
```

**Dependencies:** `useJournalDraft` (hook, §3.6), `useJournalFeedback` (hook, §3.7), `fetch`, `src/lib/types.ts`.

**Edge cases:**
- Nội dung rỗng → chặn gửi AI, hiện toast "Viết ít nhất một dòng trước khi gửi AI."
- `hasApiKey === false` → **không render** nút AI; render dải hướng dẫn "Bật phản hồi AI bằng cách thêm API key trong Cài đặt" + `<Link href="/settings">`.
- Offline → `fetch` throw → giữ nội dung trong state, hiện "Đang lưu nháp cục bộ…"; không hiện lỗi đỏ.
- Người dùng sửa mục đã commit → `initialReflectionId` có mặt → lưu qua `PATCH /api/journal/:id`, và nếu mục đó có `aiFeedback` → hiện badge "Phản hồi đã cũ — nội dung đã thay đổi" + nút "Gửi lại AI".

### 3.2 `AiFeedbackPanel` (Client Component)

**Route/đường dẫn:** `src/components/journal/ai-feedback-panel.tsx`
**Responsibilities:**
- Render tóm tắt + câu hỏi sắc; hiển thị trạng thái streaming (text dần, skeleton).
- Render khối phân loại (domain/skill/confidence, nguồn `ai` | `local`).
- Nút "Ghi câu trả lời" → mở ô trả lời, lưu vào `Reflection` (không tạo `Activity` mới).
- Nút "Chấp nhận" → `POST /api/journal/accept-evidence` tạo `Evidence` rating 3.

**Interfaces:**
```ts
export interface JournalFeedbackDto {
  readonly summary: string;
  readonly sharpQuestion: string;
}

export interface JournalClassificationDto {
  readonly domain: Domain;                 // "professional" | "communication" | "language" | "personal"
  readonly skillId: string | null;
  readonly skillName: string | null;
  readonly confidence: number;             // 0..1
  readonly source: "ai" | "local";
}

export interface AiFeedbackPanelProps {
  readonly state: "empty" | "streaming" | "ready" | "stale" | "error";
  readonly feedback: JournalFeedbackDto | null;
  readonly classification: JournalClassificationDto | null;
  readonly answerToQuestion: string | null;
  readonly onAnswerQuestion: (answer: string) => Promise<void>;
  readonly onAcceptEvidence: () => Promise<void>;
  readonly onRetry: () => void;
  readonly errorMessage?: string;
}

export function AiFeedbackPanel(props: AiFeedbackPanelProps): JSX.Element;
```

**Edge cases:**
- `state="empty"` → hiện dòng "Chưa có phản hồi. Viết vài dòng rồi bấm *Gửi AI phản hồi*."
- `state="stale"` → panel `opacity-60` + badge tertiary "Phản hồi đã cũ — nội dung đã thay đổi" + nút "Gửi lại AI"; tuyệt đối không tự gọi.
- `state="error"` → thông báo ngắn + nút "Thử lại"; không crash.
- Vùng phản hồi có `aria-live="polite"` (NFR-06).

### 3.3 `DisclosureLog` (Server Component)

**Route/đường dẫn:** `src/components/journal/disclosure-log.tsx`
**Responsibilities:** hiển thị danh sách lần gửi lên từ `AiCall` (FR-PS-07).

**Interfaces:**
```ts
export interface DisclosureDto {
  readonly id: string;
  readonly feature: string;            // "journal_feedback" | "journal_classify"
  readonly model: string;
  readonly dataPreview: string | null;     // ≤160 ký tự, null = không có nội dung người dùng
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheRead: number;
  readonly estimatedCost: number;
  readonly createdAt: string;          // ISO
}

export interface DisclosureLogProps {
  readonly items: readonly DisclosureDto[];
  readonly limit?: number;              // mặc định 10
}

export function DisclosureLog(props: DisclosureLogProps): JSX.Element;
```

**Edge cases:** danh sách rỗng → "Chưa có dữ liệu nào được gửi lên."; `dataPreview === null` (AI-06 với text rút gọn) → hiện "— (chỉ gửi metadata)" thay vì để trống.

### 3.4 `StateQuickForm` (Client Component)

**Route/đường dẫn:** `src/components/state/state-quick-form.tsx`
**Responsibilities:** 3 slider + ô giờ ngủ + ghi chú; prefill; submit ≤15s.

**Interfaces:**
```ts
export interface DailyStateDto {
  readonly date: string;               // "yyyy-MM-dd"
  readonly mood: number | null;        // 1..5
  readonly energy: number | null;      // 1..5
  readonly focus: number | null;       // 1..5
  readonly sleep: number | null;       // 0..14
  readonly note: string | null;
  readonly updatedAt: string | null;
}

export interface StateQuickFormProps {
  readonly today: DailyStateDto | null;      // bản ghi hôm nay (null nếu chưa ghi)
  readonly prefill: DailyStateDto | null;     // bản ghi gần nhất trước hôm nay
  readonly todayIso: string;                 // "yyyy-MM-dd"
}

export function StateQuickForm(props: StateQuickFormProps): JSX.Element;
```

**Hằng số mô tả (dùng chung với biểu đồ):**
```ts
export const METRIC_SCALE = {
  mood:   { label: "Tâm trạng (Mood)",    icon: "sentiment_very_satisfied", values: ["Kiệt sức", "Chùng chình", "Ổn định", "Tích cực", "Thăng hoa"] },
  energy: { label: "Năng lượng (Energy)", icon: "bolt",                     values: ["Uể oải", "Hơi mỏi", "Vừa đủ", "Tràn đầy", "Cực đỉnh"] },
  focus:  { label: "Tập trung (Focus)",   icon: "center_focus_strong",      values: ["Phân tán", "Gián đoạn", "Kiểm soát", "Rất sâu", "Flow State"] },
} as const;
```

**Dependencies:** `src/lib/metric-scale.ts` (hằng số trên), `fetch`, `useTransition`.

**Edge cases:**
- Chưa có hôm nay → nhãn nút "Lưu trạng thái (≤15s)"; đã có → "Cập nhật trạng thái (≤15s)".
- Chưa có dữ liệu hôm qua → "Prefill hôm qua" **không** hiện; slider về 3/3/3, ngủ 0.
- Ngủ ngoài `[0,14]` hoặc bước 0.5 sai → chặn ở client, hiện lỗi cạnh ô, không gọi API.
- Bấm "Mặc định" → reset 3/3/3, ngủ 0, ghi chú rỗng (không đụng bản ghi đã lưu cho tới khi bấm Lưu).

### 3.5 `StateCharts` (Client Component)

**Route/đường dẫn:** `src/components/state/state-charts.tsx`
**Responsibilities:** biểu đồ 4 series + toggle 7/30 + ma trận 7 ngày bấm để sửa.

**Interfaces:**
```ts
export interface SeriesPoint {
  readonly day: string;              // "yyyy-MM-dd"
  readonly mood: number | null;
  readonly energy: number | null;
  readonly sleep: number | null;      // giờ
  readonly focus: number | null;
  readonly doneSlots: number;        // 0..6
}

export interface StateChartsProps {
  readonly initialWindow: 7 | 30;
  readonly series7: readonly SeriesPoint[];
  readonly series30: readonly SeriesPoint[];
  readonly onEditDay: (day: string) => void;
}

export function StateCharts(props: StateChartsProps): JSX.Element;
```

**Quy tắc vẽ (SVG thuần, không thư viện):**
```ts
const CHART = {
  width: 380, height: 140,
  padX: 15, padTop: 10, padBottom: 10,
  gridStroke: "var(--color-surface-container-highest)",
  gridDash: "2,3",
} as const;

/** Trục trái: chỉ số 1–5 (mood/energy/focus) và giờ ngủ quy đổi 0–10h → 0–5. */
function toChartY(value: number, axisMax: 5): number {
  return CHART.padTop + (1 - value / axisMax) * (CHART.height - CHART.padTop - CHART.padBottom);
}

/** Ngày thiếu dữ liệu → null (khoảng trống trên đường), KHÔNG coi là 0. */
function pointsFor(series: readonly SeriesPoint[], pick: (p: SeriesPoint) => number | null): string {
  return series
    .map((p, i) => { const v = pick(p); return v === null ? null : `${x(i)},${toChartY(v)}`; })
    .filter(Boolean)
    .join(" ");
}
```
- Series & màu: mood `var(--color-primary)` · energy `var(--color-primary)` (marker nhạt hơn) · sleep `var(--color-tertiary)` (quy đổi 0–10h → 0–5) · slots hoàn thành `var(--color-secondary)` (trục phụ 0–6).
- Overlay slots là **đường**, không phải cột, để không nhân đôi số liệu trục.

**Edge cases:**
- <7 ngày dữ liệu → hiện lưới trống + dòng "Chưa có dữ liệu. Ghi chỉ số hôm nay để bắt đầu."
- Ngày trống giữa chuỗi → đường line bị ngắt (không nội suy), chấm chỉ vẽ ở ngày có dữ liệu.
- Toggle 30 ngày → đổi state client, **không** refetch (dữ liệu 30 ngày đã trả sẵn).

### 3.6 `useJournalDraft` (hook)

```ts
export interface UseJournalDraftResult {
  readonly answer: string;
  readonly setAnswer: (v: string) => void;
  readonly status: "idle" | "saving" | "saved" | "offline";
  readonly charCount: number;
  readonly savedAt: Date | null;
}

export function useJournalDraft(options: {
  initialAnswer: string;
  reflectionId?: string;
  debounceMs?: number;   // mặc định 800
}): UseJournalDraftResult;
```
- Dùng `useRef` cho timer debounce; cleanup trong `useEffect` return.
- `status = "offline"` khi `fetch` reject → **không** coi là lỗi, chỉ hiện "Đang lưu nháp cục bộ…".

### 3.7 `useJournalFeedback` (hook) — streaming AI-05

```ts
export type FeedbackPhase = "idle" | "classifying" | "streaming" | "saving" | "done" | "error";

export interface UseJournalFeedbackResult {
  readonly phase: FeedbackPhase;
  readonly partialSummary: string;
  readonly feedback: JournalFeedbackDto | null;
  readonly classification: JournalClassificationDto | null;
  readonly error: string | null;
  readonly send: (reflectionId: string) => Promise<void>;
  readonly reset: () => void;
}

export function useJournalFeedback(): UseJournalFeedbackResult;
```
- Đọc SSE: `const res = await fetch("/api/journal/feedback", {method:"POST", body: JSON.stringify({reflectionId, consent:true})})` → `res.body!.getReader()`, parse theo khung `\n\n`, dispatch theo `event:`.
- Lỗi mạng giữa stream → `phase="error"`, giữ `partialSummary` đã nhận để không mất nội dung.

### 3.8 `src/lib/journal.ts` — lớp nghiệp vụ

```ts
export type Domain = "professional" | "communication" | "language" | "personal";

export interface JournalItemDto {
  readonly id: string;
  readonly activityId: string | null;
  readonly prompt: string;
  readonly answer: string;
  readonly status: "draft" | "published";
  readonly aiFeedback: JournalFeedbackDto | null;
  readonly classification: JournalClassificationDto | null;
  readonly domain: Domain | null;
  readonly skillId: string | null;
  readonly skillName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly isStale: boolean;     // answer đã đổi sau lần AI cuối
}

export async function listJournal(params: {
  limit: number; cursor?: string; status: "draft" | "published";
}): Promise<{ items: JournalItemDto[]; nextCursor: string | null }>;

export async function createJournal(input: {
  answer: string; prompt?: string; domain?: Domain; skillId?: string | null;
}): Promise<JournalItemDto>;

export async function createDraft(input: { answer: string; prompt?: string }): Promise<JournalItemDto>;

export async function getDraft(): Promise<JournalItemDto | null>;

export async function updateJournal(id: string, input: { answer: string; prompt?: string }): Promise<JournalItemDto>;

export async function deleteJournal(id: string): Promise<void>;

export async function saveFeedback(id: string, feedback: JournalFeedbackDto): Promise<JournalItemDto>;

export async function saveClassification(
  id: string, classification: JournalClassificationDto,
): Promise<JournalItemDto>;

export async function acceptEvidence(id: string): Promise<{ evidenceId: string; skillLevel: number }>;

/** Phân loại bằng rule cục bộ — không gọi API, chạy offline (DEC-03). */
export function classifyLocally(text: string): JournalClassificationDto;

/** Ngữ cảnh hành vi đưa vào prompt AI-05 (để AI không nói chung chung). */
export function buildJournalContext(date: string): JournalContextDto;
```

**`classifyLocally` — bảng từ khoá (rule, không AI):**
```ts
const DOMAIN_KEYWORDS: Record<Domain, readonly string[]> = {
  professional:  ["hệ thống", "system", "api", "database", "cơ sở dữ liệu", "deploy", "kiến trúc", "design", "code", "bug", "refactor", "kafka", "sql"],
  communication:  ["nói", "họp", "meeting", "email", "thuyết trình", "trình bày", "khách hàng", "team", "thương lượng", "giao tiếp"],
  language:       ["tiếng trung", "tiếng anh", "từ vựng", "thẻ", "srs", "fsrs", "ngữ pháp", "hàn", "học tiếng"],
  personal:       ["ngủ", "tâm trạng", "mệt", "y tế", "gia đình", "sức khỏe", "chăm sóc bản thân", "xao nhãng", "lo lắng"],
};

const SKILL_KEYWORDS: ReadonlyArray<{ skillName: string; keywords: readonly string[] }> = [
  { skillName: "System Design",        keywords: ["system design", "kiến trúc", "architecture", "kafka", "cqrs", "microservice"] },
  { skillName: "Quản lý dữ liệu",      keywords: ["database", "sql", "cơ sở dữ liệu", "index", "query", "migration"] },
  { skillName: "Giao tiếp",             keywords: ["email", "thuyết trình", "họp", "nói trước", "giao tiếp"] },
  { skillName: "Tiếng Trung",           keywords: ["tiếng trung", "hanzi", "pinyin", "thẻ trung"] },
  { skillName: "Tiếng Anh",             keywords: ["tiếng anh", "english", "thẻ anh"] },
  { skillName: "Nhật ký",               keywords: ["nhật ký", "suy ngẫm", "ghi chú"] },
  { skillName: "Thể chất",              keywords: ["đi bộ", "tập", "gym", "chạy", "thể chất"] },
];

export function classifyLocally(text: string): JournalClassificationDto {
  const lower = text.toLowerCase();
  const score = (words: readonly string[]) => words.reduce((n, w) => n + (lower.includes(w) ? 1 : 0), 0);

  let bestDomain: Domain = "personal";
  let bestScore = -1;
  for (const [domain, words] of Object.entries(DOMAIN_KEYWORDS) as [Domain, readonly string[]][]) {
    const s = score(words);
    if (s > bestScore) { bestScore = s; bestDomain = domain; }
  }

  const skill = SKILL_KEYWORDS
    .map((s) => ({ ...s, s: score(s.keywords) }))
    .sort((a, b) => b.s - a.s)[0];

  return {
    domain: bestDomain,
    skillId: null,                                   // rule cục bộ không tra DB → server sẽ map tên → id
    skillName: skill && skill.s > 0 ? skill.skillName : null,
    confidence: bestScore === 0 ? 0.3 : Math.min(0.75, 0.4 + 0.1 * bestScore),
    source: "local",
  };
}
```
> `skillId` được **server** map từ `skillName` sang `Skill` đang tồn tại (RB-4); rule cục bộ không tự tạo `Skill` mới (P5).

**`buildJournalContext`** — ngữ cảnh đưa vào prompt AI-05 (đặt **sau** breakpoint cache, trong `messages`):
```ts
export interface JournalContextDto {
  readonly date: string;
  readonly weekday: string;              // "Thứ Năm"
  readonly doneSlots: number;            // 0..6
  readonly totalSlots: number;           // 6
  readonly slotTitles: readonly string[];
  readonly topSkills: readonly { name: string; level: number }[];
  readonly streak: number;
  readonly lastJournalDays: number;      // số ngày có nhật ký trong 7 ngày
}
```

### 3.9 `src/lib/state.ts` — lớp nghiệp vụ chỉ số cá nhân

```ts
export interface DailyStateInput {
  readonly date: string;                  // "yyyy-MM-dd"
  readonly mood?: number | null;
  readonly energy?: number | null;
  readonly focus?: number | null;
  readonly sleep?: number | null;
  readonly note?: string | null;
}

export interface StateSeriesPoint {
  readonly day: string;
  readonly mood: number | null;
  readonly energy: number | null;
  readonly sleep: number | null;
  readonly focus: number | null;
  readonly doneSlots: number;
}

export async function getStateWindow(windowDays: 7 | 30): Promise<{
  today: DailyStateDto | null;
  prefill: DailyStateDto | null;
  history: DailyStateDto[];
  series: StateSeriesPoint[];
}>;

export async function upsertState(input: DailyStateInput): Promise<DailyStateDto>;

/** Số liệu tổng quan cho header S12 (điểm phục hồi / ngủ TB / độ ổn định). */
export async function getStateSummary(windowDays: 7 | 30): Promise<{
  nDays: number;
  nComplete: number;
  avgSleep: number | null;
  avgMood: number | null;
  avgEnergy: number | null;
  avgFocus: number | null;
}>;

/** FR-PS-05 — thuần JS, không AI, không network. */
export async function computeCorrelations(windowDays: 7 | 30 | 90): Promise<CorrelationResult>;
```

**`computeCorrelations` — thuật toán cụ thể (DEC-04, DEC-12):**
```ts
export interface CorrelationFinding {
  readonly id: string;
  readonly title: string;                 // "Quy luật ngủ • Hiệu suất sáng"
  readonly metric: "sleep" | "energy" | "mood" | "focus";
  readonly threshold: number;            // ví dụ 7.0 giờ
  readonly comparedTo: "focus" | "doneSlots" | "quality";
  readonly deltaPct: number;             // ví dụ 42
  readonly n: number;                    // số ngày mẫu
  readonly confidence: number;            // 0..1
}

export interface CorrelationResult {
  readonly n: number;
  readonly sufficiency: "insufficient" | "ok";
  readonly findings: readonly CorrelationFinding[];
  readonly pearson: {
    readonly sleepVsFocus: number | null;
    readonly energyVsDoneSlots: number | null;
    readonly moodVsQuality: number | null;
  };
}

/** Hằng số ngưỡng — P4: không để AI/heuristic tự chọn tiêu chí. */
export const CORRELATION_RULES = [
  { id: "sleep_focus",  metric: "sleep",  threshold: 7.0, comparedTo: "focus",      minN: 7 },
  { id: "energy_slots", metric: "energy", threshold: 3.0, comparedTo: "doneSlots",  minN: 7 },
  { id: "mood_quality", metric: "mood",   threshold: 3.0, comparedTo: "quality",    minN: 7 },
] as const;

export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? null : num / den;      // null = mẫu không có biến thiên
}
```
**Cách tính `deltaPct`:** chia nhóm theo ngưỡng (≥ threshold vs < threshold), so sánh trung bình chỉ số đích, `deltaPct = (meanHigh - meanLow) / meanLow * 100` (null nếu `meanLow === 0`).
**`confidence`:** `Math.min(1, n / 30) * Math.min(1, Math.abs(r) )` — hiển thị cạnh phát hiện để người dùng tự đánh giá (P3 tinh thần).

### 3.10 `src/lib/prompts.ts` — prompt & schema AI-05 / AI-06

```ts
import { z } from "zod";

/** AI-05 — PHẢI là hằng số, không chứa ngày/UUID (SPEC §5.2 quy tắc 3). */
export const JOURNAL_FEEDBACK_SYSTEM = `
Bạn là người phản hồi nhật ký của một người dùng duy nhất. Mục tiêu của bạn là giúp họ
nhìn lại đúng một sự thật trong ngày hôm và đẩy họ đi tiếp — KHÔNG phải trở thành chatbot.

QUY TẮC BẮT BUỘC (vi phạm là sai):
1. "summary" = ĐÚNG 1 câu, tối đa 200 ký tự. Chỉ nêu điều duy nhất đáng chú ý trong nhật ký.
2. "sharpQuestion" = ĐÚNG 1 câu hỏi, tối đa 240 ký tự, kết thúc bằng dấu "?".
   Câu hỏi phải "sắc": buộc người dùng đối mặt với một giả định, một hệ quả hoặc một cái giá
   cụ thể. Tuyệt đối KHÔNG hỏi lại nội dung họ đã viết ra.
3. TUYỆT ĐỐI KHÔNG: lời khuyên dài, danh sách bullet, kế hoạch nhiều bước, gợi ý công cụ,
   giáo dục, động viên, an ủi, khen ngợi chung chung, câu "Bạn đã làm tốt".
4. Nếu nhật ký quá ngắn để rút ra điều gì: "summary" nói đúng điều duy nhất có trong nhật ký,
   "sharpQuestion" hỏi một câu làm rõ điều đó. KHÔNG bịa chi tiết không có trong nhật ký.
5. Chỉ dùng thông tin trong phần "Ngữ cảnh" được cung cấp. Không suy đoán hoàn cảnh ngoài dữ liệu.
6. Trả lời bằng tiếng Việt, giọng thẳng và thân thiện, không xưng "tôi", dùng "bạn".

Định dạng đầu ra: JSON đúng 2 trường "summary" và "sharpQuestion".
`.trim();

export const JournalFeedbackSchema = z.object({
  summary: z.string().min(1).max(200),
  sharpQuestion: z.string().min(1).max(240),
});
export type JournalFeedbackDto = z.infer<typeof JournalFeedbackSchema>;

/** AI-06 — hằng số, không streaming, effort low. */
export const JOURNAL_CLASSIFY_SYSTEM = `
Bạn phân loại nội dung nhật ký của một người dùng vào đúng MỘT domain và TỐI ĐA MỘT kỹ năng.
Domain hợp lệ (đóng băng, không có domain thứ 5): professional | communication | language | personal.
Kỹ năng chỉ được chọn trong danh sách được cung cấp ở phần "Ngữ cảnh"; nếu không khớp kỹ năng nào
thì trả skillName = null và skillId = null.
Trả lời bằng JSON đúng 4 trường: domain, skillName, confidence (0..1).
`.trim();

export const JournalClassifySchema = z.object({
  domain: z.enum(["professional", "communication", "language", "personal"]),
  skillName: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});
```
> `skillId` **không** do AI trả — server map `skillName` → `Skill.id` trong DB (RB-4). Tránh AI bịa id.

### 3.11 `src/lib/anthropic.ts` — wrapper AI-05 / AI-06

```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export const AI_MODEL = {
  feedback: "claude-opus-5",     // AI-05: streaming, effort low
  classify: "claude-haiku-4-5", // AI-06: không streaming, effort low
} as const;

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/** Ghi log AiCall — wrapper bắt buộc cho MỌI lời gọi AI (FR-AI-07). */
export async function logAiCall(input: {
  feature: "journal_feedback" | "journal_classify";
  model: string;
  inputTokens: number; outputTokens: number;
  cacheRead: number; cacheWrite: number;
  estimatedCost: number;
  ok: boolean; error?: string;
  dataPreview?: string | null;
  sourceId?: string | null;
}): Promise<string>;

/** AI-06 — không streaming, structured output, effort low. */
export async function classifyJournal(input: {
  text: string;
  skillNames: readonly string[];
}): Promise<{ domain: Domain; skillName: string | null; confidence: number }>;

/** AI-05 — streaming, structured output 2 trường, effort low. */
export async function streamJournalFeedback(input: {
  answer: string;
  context: JournalContextDto;
  onDelta: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<JournalFeedbackDto>;
```

**Gọi AI-05 (streaming + structured output):**
```ts
const client = new Anthropic();
const stream = client.messages.stream({
  model: AI_MODEL.feedback,
  max_tokens: 600,
  output_config: { format: zodOutputFormat(JournalFeedbackSchema) },
  system: [
    { type: "text", text: JOURNAL_FEEDBACK_SYSTEM },                      // luôn giống nhau
    { type: "text", text: JOURNAL_RUBRIC_BLOCK, cache_control: { type: "ephemeral" } },
  ],
  messages: [
    { role: "user", content: buildJournalPrompt({ answer: input.answer, context: input.context }) },
  ],
});
// effort low
stream.finalMessage() // hoặc for await (const chunk of stream)
// usage: finalMessage.usage → cache_read_input_tokens, cache_creation_input_tokens
```
> **Mọi nội dung biến động** (ngày, số slot, tên kỹ năng) nằm trong `messages`, **không** trong `system` (SPEC §5.2 quy tắc 2). `JOURNAL_FEEDBACK_SYSTEM` không chứa ngày/UUID (quy tắc 3).

**Prompt caching cho AI-05/AI-06:** `system` gồm 2 block — block 1 hằng số, block 2 có `cache_control: { type: "ephemeral" }`. Kiểm chứng bằng `usage.cache_read_input_tokens > 0` từ call thứ 2 (AC-5 của SPEC).

**Xử lý lỗi (typed exception chain, SPEC §5.5):**
```ts
try {
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    await logAiCall({ ...input, ok: false, error: "refusal" });
    throw new Error("AI không phản hồi được nội dung này. Bạn có thể thử lại với cách diễn đạt khác.");
  }
  await logAiCall({ ...input, ok: true, dataPreview: buildPreview(answer), sourceId: reflectionId });
} catch (err) {
  if (err instanceof Anthropic.AuthenticationError) { /* 401 → hướng dẫn kiểm tra API key */ }
  else if (err instanceof Anthropic.RateLimitError) { /* 429 → "AI đang bận, thử lại sau" */ }
  else if (err instanceof Anthropic.APIStatusError) { /* 5xx → "Dịch vụ AI đang lỗi" */ }
  else if (err instanceof Anthropic.APIConnectionError) { /* mạng → "Không có kết nối" */ }
  await logAiCall({ ...input, ok: false, error: err.message });
  throw err;
}
```
> Kiểm tra `stop_reason === "refusal"` **trước** khi đọc `content` (SPEC §5.5).

**Fallback offline (SPEC §5.6):** `hasApiKey() === false` → route `POST /api/journal/feedback` trả `503 { ok:false, error:"missing_api_key" }`; route `POST /api/journal/classify` trả `503` và **client** gọi fallback `classifyLocally` (source `"local"`). **Không giả lập phản hồi AI.**

### 3.12 API routes

#### `POST /api/journal/feedback` (AI-05, streaming)

```ts
// src/app/api/journal/feedback/route.ts
import { z } from "zod";

const BodySchema = z.object({
  reflectionId: z.string().min(1),
  consent: z.literal(true),          // bắt buộc — DEC-02
});

export async function POST(req: Request): Promise<Response> {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ ok: false, error: "consent_required" }, { status: 401 });
  }
  if (!hasApiKey()) {
    return Response.json({ ok: false, error: "missing_api_key" }, { status: 503 });
  }
  const item = await getJournalItem(parsed.data.reflectionId);   // đọc answer SAU khi đã xác thực consent
  if (!item) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        send("start", { reflectionId: item.id });
        const feedback = await streamJournalFeedback({
          answer: item.answer,
          context: buildJournalContext(dayKeyOf(item.createdAt)),
          onDelta: (chunk) => send("delta", { text: chunk }),
        });
        send("question", { sharpQuestion: feedback.sharpQuestion });
        await saveFeedback(item.id, feedback);
        send("done", { ...feedback, aiCallId: lastAiCallId });
      } catch (err) {
        send("error", { code: classifyAiError(err), message: aiErrorMessage(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
```

#### `POST /api/journal/classify` (AI-06)

```ts
const BodySchema = z.object({
  reflectionId: z.string().min(1),
  consent: z.literal(true),
  text: z.string().min(1).max(4000),
});

export async function POST(req: Request): Promise<Response> {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ ok: false, error: "consent_required" }, { status: 401 });
  if (!hasApiKey()) return Response.json({ ok: false, error: "missing_api_key" }, { status: 503 });

  const skillNames = await listSkillNames();          // tên kỹ năng đang có trong DB
  const raw = await classifyJournal({ text: parsed.data.text, skillNames });
  const skill = raw.skillName ? await findSkillByName(raw.skillName) : null;   // null nếu không tồn tại
  const result = { ...raw, skillId: skill?.id ?? null, skillName: skill?.name ?? null, source: "ai" as const };
  return Response.json({ ok: true, data: result });
}
```

#### `PATCH/DELETE /api/journal/:id` + `POST /api/journal/accept-evidence`

```ts
// src/app/api/journal/[id]/route.ts  (Next.js 15: params là Promise)
const PatchBodySchema = z.object({
  answer: z.string().min(1).max(10000),
  prompt: z.string().max(500).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const parsed = PatchBodySchema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  const reflection = await updateJournal(id, parsed.data);   // tự đánh dấu isStale nếu có aiFeedback
  if (!reflection) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  return Response.json({ ok: true, data: { reflection } });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  await deleteJournal(id);                                   // cascade xoá Activity + Evidence
  return Response.json({ ok: true, data: { deleted: true } });
}
```

```ts
// src/app/api/journal/accept-evidence/route.ts
const BodySchema = z.object({ reflectionId: z.string().min(1) });

export async function POST(req: Request): Promise<Response> {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  try {
    const result = await acceptEvidence(parsed.data.reflectionId);   // Evidence rating 3 → Skill.level
    return Response.json({ ok: true, data: result });
  } catch (err) {
    if (err instanceof EvidenceAlreadyExistsError) {
      return Response.json({ ok: false, error: "evidence_exists" }, { status: 409 });
    }
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
}
```

#### `GET/PUT /api/state`

```ts
const PutBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mood: z.number().int().min(1).max(5).nullish(),
  energy: z.number().int().min(1).max(5).nullish(),
  focus: z.number().int().min(1).max(5).nullish(),
  sleep: z.number().min(0).max(14).multipleOf(0.5).nullish(),
  note: z.string().max(160).nullish(),
});

export async function PUT(req: Request): Promise<Response> {
  const parsed = PutBodySchema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ ok: false, error: "invalid_range" }, { status: 400 });
  const state = await upsertState({ date: parsed.data.date ?? todayKey(), ...parsed.data });
  return Response.json({ ok: true, data: state });
}
```

#### `GET /api/state/correlations`

```ts
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const windowDays = Number(url.searchParams.get("window") ?? "30");
  if (![7, 30, 90].includes(windowDays)) {
    return Response.json({ ok: false, error: "invalid_window" }, { status: 400 });
  }
  const result = await computeCorrelations(windowDays as 7 | 30 | 90);   // thuần JS, không AI
  return Response.json({ ok: true, data: result });
}
```

## 4. Luồng dữ liệu

### 4.1 Luồng chính — ghi nhật ký (S06)

1. Người dùng mở `/journal`. Server Component đọc `listJournal({status:"published", limit:20})` + `getDraft()` + `buildJournalContext(todayKey())`, render shell.
2. Người dùng gõ → `useJournalDraft` debounce 800ms → `PUT /api/journal/draft` → server upsert `Reflection{status:"draft", activityId:null, draftUpdatedAt: now}`.
3. Người dùng bấm chip gợi ý → `insertPrompt()` chèn `\n\n` + câu hỏi vào cuối textarea → autosave lại.
4. Người dùng bấm **"Gửi AI phản hồi"** → kiểm tra `answer.trim() !== ""` → nếu rỗng: toast, dừng.
5. Client `POST /api/journal/classify` (AI-06). Nếu lỗi/`missing_api_key` → fallback `classifyLocally` (source `"local"`).
6. Client `POST /api/journal/feedback` (AI-05) → đọc SSE → render dần `summary`, nhận `sharpQuestion`, nhận `done`.
7. Server lưu `Reflection.aiFeedback = JSON.stringify({summary, sharpQuestion})` + `Reflection.classifiedDomain/classifiedSkillId/classificationConfidence` + `Activity.domain/skillId`.
8. Server ghi `AiCall{feature:"journal_feedback", model:"claude-opus-5", ok:true, dataPreview, sourceId}` — panel "Dữ liệu đã gửi lên" đọc từ đây.
9. Người dùng bấm **"Chấp nhận"** (gợi ý phân loại) → `POST /api/journal/accept-evidence` → tạo `Evidence{rating:3}` → cập nhật `Skill.level` nếu đủ ngưỡng (P3).

### 4.2 Luồng chính — commit nhật ký (chuyển nháp → published)

Khi người dùng bấm "Lưu" (hoặc sau khi có phản hồi AI):
```
POST /api/journal {answer, prompt}
  → Reflection.create({answer, prompt, status:"published", activityId:null})
  → Activity.create({type:"journal", domain, skillId, title:"Nhật ký — <ngày>", content:answer, minutes:0})
  → Reflection.update({activityId: activity.id})
  → (nếu có skill) Evidence.create({activityId, skillId, rating:3})
  → xoá bản nháp
```

### 4.3 Lưu trữ & truy vấn

#### 4.3.1 Schema delta (Prisma)

```prisma
model Reflection {
  id                     String    @id @default(cuid())
  activityId             String?   @unique          // đổi từ bắt buộc → nullable (DEC-01)
  activity               Activity? @relation(fields: [activityId], references: [id], onDelete: Cascade)
  prompt                 String
  answer                 String
  aiFeedback             String?
  status                 String    @default("published")   // draft | published
  classifiedDomain       String?
  classifiedSkillId      String?
  classificationConfidence Float?
  draftUpdatedAt         DateTime?
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt
  @@index([status, createdAt])
  @@index([classifiedDomain])
}

model AiCall {
  // … các field có sẵn …
  dataPreview           String?   // ≤160 ký tự (DEC-09)
  sourceId               String?   // reflectionId
  @@index([createdAt])
}
```

#### 4.3.2 Truy vấn tương quan FR-PS-05 — SQL thật

> `DailyState` và `Activity` **cùng nằm trong cơ sở dữ liệu**; `Activity` là bảng trung tâm (SPEC §4) nên tương quan chỉ số ↔ hiệu suất học là **1 truy vấn JOIN**.

```sql
-- 4.3.2.1 Lấy chuỗi (DailyState ⋈ Activity ⋈ PlanItem) trong N ngày gần nhất
-- `date` đã chuẩn hoá 00:00 local nên so sánh chuỗi yyyy-MM-dd là an toàn.
SELECT
  ds.date                                   AS day,
  ds.mood, ds.energy, ds.sleep, ds.focus,
  COALESCE(act.done_count, 0)               AS done_slots,
  COALESCE(act.quality_avg, 0)              AS quality_avg,
  COALESCE(act.minutes_total, 0)            AS minutes_total
FROM DailyState ds
LEFT JOIN (
  SELECT
    date(createdAt) AS day,
    COUNT(*)                                        AS done_count,
    AVG(quality)                                    AS quality_avg,
    SUM(minutes)                                    AS minutes_total
  FROM Activity
  WHERE type != 'journal'          -- hoạt động học/luyện, KHÔNG tính nhật ký
    AND quality IS NOT NULL
  GROUP BY date(createdAt)
) act ON act.day = strftime('%Y-%m-%d', ds.date)
WHERE ds.date >= date('now', 'localtime', ?)
ORDER BY ds.date ASC;
-- bind: `-${windowDays - 1} days`
```

```sql
-- 4.3.2.2 Chuỗi hành động hoàn thành theo ngày (overlay FR-PS-06) — PlanItem.done
SELECT
  date(date) AS day,
  COUNT(*)   AS done_slots
FROM PlanItem
WHERE done = 1
  AND date >= date('now', 'localtime', ?)
GROUP BY date(date)
ORDER BY day ASC;
-- bind: `-${windowDays - 1} days`
```

```sql
-- 4.3.2.3 Chất lượng học theo ngày (đầu ra của FR-PS-05 "hiệu suất học")
SELECT
  date(createdAt) AS day,
  AVG(quality)   AS quality_avg,
  AVG(aiScore)   AS ai_score_avg,
  COUNT(*)       AS n_activities
FROM Activity
WHERE createdAt >= datetime('now', 'localtime', ?)
  AND type IN ('study','write','speak','roleplay','srs','custom')
GROUP BY date(createdAt)
ORDER BY day ASC;
-- bind: `-${windowDays - 1} days`
```

```sql
-- 4.3.2.4 Tìm nhật ký cũ cần đánh dấu "phản hồi lỗi thời" (FR-PSJ-06)
-- Chạy khi người dùng PATCH answer: so timestamp sửa vs timestamp lần AI gần nhất.
SELECT r.id, r.answer, r.updatedAt, a.updatedAt AS activity_updated_at
FROM Reflection r
LEFT JOIN Activity a ON a.id = r.activityId
WHERE r.status = 'published'
  AND r.aiFeedback IS NOT NULL
ORDER BY r.updatedAt DESC
LIMIT 20;
```

```sql
-- 4.3.2.5 Panel "Dữ liệu đã gửi lên" (FR-PS-07) — đọc từ AiCall
SELECT
  id, feature, model, dataPreview,
  inputTokens, outputTokens, cacheRead, cacheWrite, estimatedCost, ok, error, createdAt
FROM AiCall
WHERE dataPreview IS NOT NULL
  AND feature IN ('journal_feedback','journal_classify')
ORDER BY createdAt DESC
LIMIT ?;
```

#### 4.3.3 Truy vấn nhật ký

```sql
-- Danh sách nhật ký đã commit (phân trang bằng cursor = createdAt|id)
SELECT
  r.id, r.activityId, r.prompt, r.answer, r.status,
  r.aiFeedback, r.classifiedDomain, r.classifiedSkillId, r.classificationConfidence,
  r.createdAt, r.updatedAt,
  a.domain AS activity_domain, a.skillId AS activity_skill_id,
  s.name   AS skill_name
FROM Reflection r
LEFT JOIN Activity a ON a.id = r.activityId
LEFT JOIN Skill    s ON s.id = COALESCE(r.classifiedSkillId, a.skillId)
WHERE r.status = 'published'
  AND (r.createdAt, r.id) < (?, ?)     -- cursor pagination
ORDER BY r.createdAt DESC, r.id DESC
LIMIT ?;
```

```sql
-- Bản nháp (đúng 1 bản nháp đang mở)
SELECT id, prompt, answer, createdAt, updatedAt
FROM Reflection
WHERE status = 'draft'
ORDER BY draftUpdatedAt DESC
LIMIT 1;
```

#### 4.3.4 Truy vấn chỉ số cá nhân

```sql
-- 4.3.4.1 Bản ghi hôm nay + bản ghi gần nhất trước đó (prefill FR-PSJ-07)
SELECT date, mood, energy, sleep, focus, note, updatedAt
FROM DailyState
WHERE date <= ?
ORDER BY date DESC
LIMIT 2;
-- bind: `${todayKey()}`
```

```sql
-- 4.3.4.2 Lịch sử 7/30 ngày + số slot hoàn thành
SELECT
  ds.date, ds.mood, ds.energy, ds.sleep, ds.focus, ds.note, ds.updatedAt,
  COALESCE(p.done_slots, 0) AS done_slots
FROM DailyState ds
LEFT JOIN (
  SELECT date(date) AS day, COUNT(*) AS done_slots
  FROM PlanItem WHERE done = 1 GROUP BY date(date)
) p ON p.day = strftime('%Y-%m-%d', ds.date)
WHERE ds.date >= date('now', 'localtime', ?)
ORDER BY ds.date ASC;
-- bind: `-${windowDays - 1} days`
```

```sql
-- 4.3.4.3 Thống kê tổng quan cho header S12 (điểm phục hồi / ngủ TB / độ ổn định)
-- → getStateSummary(7)
SELECT
  COUNT(*)                AS n_days,
  AVG(sleep)              AS avg_sleep,
  AVG(mood)               AS avg_mood,
  AVG(energy)             AS avg_energy,
  AVG(focus)              AS avg_focus,
  SUM(mood IS NOT NULL AND energy IS NOT NULL AND focus IS NOT NULL AND sleep IS NOT NULL) AS n_complete
FROM DailyState
WHERE date >= date('now', 'localtime', '-6 days');
```

> **Lưu ý ngày:** cột `DailyState.date` và `PlanItem.date` đã chuẩn hoá 00:00 local từ đầu (tech.md §5) → dùng `strftime('%Y-%m-%d', date)`. Cột `Activity.createdAt` là timestamp thực → dùng `date(createdAt, 'localtime')` để lấy ngày local. Sai khác 1 ngày ở đây làm hỏng toàn bộ overlay (spec.md PS-R8).

### 4.4 Cơ chế "chỉ gửi khi chủ động nhờ" — tổng hợp

| Lớp | Cơ chế chặn |
|---|---|
| UI | Nút "Gửi AI phản hồi" là control duy nhất gọi `POST /api/journal/feedback` và `/classify`. Không có `useEffect` nào tự gọi AI khi lưu nhật ký. |
| API | Body bắt buộc `consent: z.literal(true)`; server kiểm tra **trước** khi đọc `Reflection.answer`. Thiếu → `401 consent_required`. |
| API | `GET /api/journal` **không** bao giờ trả `answer` cho bất kỳ client nào khác ngoài trang nhật ký — nhưng endpoint này vẫn là local-only (Next.js server), không đi ra mạng. |
| Hạ tầng | `DailyState` **không có** route nào gửi đi. `computeCorrelations` là JS thuần. |
| Hạ tầng | Không có cron/background job/telemetry đọc nội dung nhật ký. `AiCall` chỉ được ghi bởi wrapper `src/lib/anthropic.ts`. |
| Minh bạch | Mọi lần gửi đều để lại 1 dòng `AiCall` có `dataPreview` + `sourceId` + token + chi phí → hiển thị ở panel "Dữ liệu đã gửi lên" (FR-PS-07) và ở S15 (NFR-04). |
| Kiểm thử | Test tự động: mock `fetch`/SDK, gọi mọi route của feature khi chưa có thao tác người dùng → không route nào chạm `api.anthropic.com`. |

### 4.5 Lưu nháp offline — cơ chế

1. `useJournalDraft` giữ `answer` trong React state (nguồn sự thật tạm thời khi offline).
2. Debounce 800ms → `PUT /api/journal/draft`. Gọi này là **ghi vào SQLite qua Next.js server** — không phải gọi ra internet; khi máy offline nhưng server local vẫn chạy thì vẫn lưu được.
3. Nếu server không chạy / request fail → `status="offline"`, nội dung vẫn nằm trong state + `localStorage` mirror (`localStorage.setItem("journal:draft", answer)`) để không mất khi reload.
4. Khi trang load lại: `GET /api/journal/draft` → nếu có, dùng; nếu không có nhưng `localStorage` có → khôi phục từ `localStorage` và ghi lại server ở lần autosave kế tiếp.
5. `localStorage` chỉ chứa nháp **chưa commit**; khi commit (`status="published"`) → `localStorage.removeItem("journal:draft")`.
6. Nháp **không** được tính vào thống kê, lịch sử hay biểu đồ (DEC-01).

## 5. Xử lý lỗi

| Tình huống | Phát hiện | Xử lý | Thông báo người dùng |
|---|---|---|---|
| Thiếu `ANTHROPIC_API_KEY` | `!hasApiKey()` trước khi gọi SDK | Route trả `503 {ok:false,error:"missing_api_key"}`; client ẩn nút AI, hiện dải hướng dẫn + link `/settings` | "Bật phản hồi AI bằng cách thêm API key trong Cài đặt" |
| `stop_reason === "refusal"` | Kiểm tra **trước** khi đọc `content` | Ghi `AiCall{ok:false,error:"refusal"}`; UI giữ nội dung nhật ký | "AI không phản hồi được nội dung này. Bạn có thể thử lại với cách diễn đạt khác." + nút "Thử lại" |
| `AuthenticationError` (401) | Typed exception của SDK | `AiCall{ok:false,error:"auth"}` | "API key không hợp lệ. Kiểm tra lại trong Cài đặt." |
| `RateLimitError` (429) | Typed exception | `AiCall{ok:false,error:"rate_limit"}` | "AI đang bận. Thử lại sau ít phút." |
| `APIStatusError` (5xx) | Typed exception | `AiCall{ok:false,error:"api_status"}` | "Dịch vụ AI đang lỗi. Thử lại sau." |
| `APIConnectionError` / mất mạng | Typed exception hoặc `fetch` reject | Không xoá nhật ký; giữ `partialSummary` đã stream | "Không có kết nối. Nhật ký đã được lưu cục bộ, thử lại khi có mạng." |
| AI trả `summary`/`sharpQuestion` sai định dạng | `JournalFeedbackSchema.safeParse` fail | Không lưu phản hồi; ghi `AiCall{ok:false,error:"schema"}`; thử lại tối đa 1 lần, sau đó báo lỗi | "AI trả về phản hồi không đúng định dạng. Bạn có thể thử lại." |
| `summary` dài > 200 ký tự / nhiều câu | Zod `max()` + kiểm tra số câu ở unit test | Cắt bớt phần thừa trước khi lưu (server) | (không hiện — tự sửa) |
| `journal/classify` trả `skillName` không có trong DB | `findSkillByName` → null | `skillId=null`, giữ `domain`; panel hiện "không khớp kỹ năng" | (hiện trong panel phân loại) |
| `journal/classify` lỗi (AI-06) | Bắt lỗi trong route | Fallback `classifyLocally` với `source="local"` | Không hiện lỗi — vẫn có gợi ý phân loại |
| Nhật ký rỗng khi bấm "Gửi AI" | `answer.trim() === ""` ở client | Chặn, không gọi API | "Viết ít nhất một dòng trước khi gửi AI." |
| `consent` thiếu/không phải `true` | `z.literal(true)` | `401 {ok:false,error:"consent_required"}` | (client không gọi theo cách này) |
| Ghi `DailyState` sai khoảng (sleep < 0 hoặc > 14) | Zod `min/max/multipleOf(0.5)` | `400 {ok:false,error:"invalid_range"}`; client chặn trước | "Giờ ngủ phải từ 0 đến 14, bước 0.5." |
| Ngày sai định dạng | Regex `^\d{4}-\d{2}-\d{2}$` | `400 {ok:false,error:"invalid_date"}` | "Ngày không hợp lệ." |
| Chưa đủ dữ liệu tương quan (`n < 7`) | `computeCorrelations` → `sufficiency="insufficient"` | Trả `findings: []`, UI hiện "Cần ít nhất 7 ngày dữ liệu (hiện có n/7)." | "Cần ít nhất 7 ngày dữ liệu để tìm tương quan." |
| `pearson` = null (mẫu không biến thiên) | Hàm trả `null` | Không hiện phát hiện cho cặp đó | "Chưa đủ dữ liệu biến thiên để so sánh." |
| Sửa nhật ký đã có phản hồi AI | So `updatedAt` với mốc AI | Đánh dấu lỗi thời, không gọi lại AI | Badge "Phản hồi đã cũ — nội dung đã thay đổi" + nút "Gửi lại AI" |
| Sửa `DailyState` ngày cũ | `PUT /api/state` với `date` | Upsert đúng ngày đó, ma trận 7 ngày cập nhật ngay | Toast "Đã cập nhật ngày DD/MM." |
| Lỗi DB (SQLite locked) | Bắt exception Prisma | Trả `500 {ok:false,error:"db_error"}`, log server | "Không lưu được lúc này. Thử lại." |
| Stream bị ngắt giữa chừng | `reader` throw / `done` không về | `phase="error"`, giữ `partialSummary` | "Phản hồi bị ngắt. Bấm Thử lại để nhận câu hỏi mới." |

## 6. Chiến lược kiểm thử

| Tầng | Công cụ | Phạm vi |
|---|---|---|
| Unit | Vitest | `classifyLocally` (đúng domain theo từ khoá, `source="local"`); `pearson` (giá trị đúng với mẫu đã biết, `null` khi mẫu không biến thiên); `computeCorrelations` (thiếu dữ liệu → `insufficient`, đủ dữ liệu → đúng 1 phát hiện, `deltaPct` đúng); `pickPromptContext` (đúng theo khung giờ); `toChartY`/`pointsFor` (ngày thiếu → khoảng trống, không nội suy); `buildPreview` (giới hạn 160 ký tự). |
| Unit | Vitest | `JournalFeedbackSchema` từ chối `summary` > 200 ký tự / `sharpQuestion` rỗng; kiểm tra **số câu** của `summary` và `sharpQuestion` (≤1 câu) — chống vi phạm FR-PS-03. |
| Unit | Vitest | `toDayKey`/`fromDayKey`/`addDays` quanh mốc 23:30 và 00:30 (PS-R8). |
| Integration | Vitest + SQLite test DB | `POST /api/journal` tạo đúng 1 `Activity` + 1 `Reflection` liên kết 1–1; `PUT /api/journal/draft` upsert đúng 1 bản nháp; `PATCH /api/journal/:id` đánh dấu phản hồi lỗi thời và **không** tạo `AiCall`; `PUT /api/state` upsert 1 bản ghi/ngày; `GET /api/state/correlations` trả `insufficient` khi `n < 7`. |
| Integration | Vitest + mock SDK | `POST /api/journal/feedback` **không** đọc `answer` khi `consent !== true` → `401`; có consent → trả SSE đúng chuỗi `start/delta/question/done`; `stop_reason:"refusal"` → `event:error` + `AiCall{ok:false}`; `AiCall.preview` ≤ 160 ký tự; `cache_read_input_tokens > 0` từ call thứ 2 (AC-5). |
| Integration | Vitest + mock SDK | `POST /api/journal/classify` với `skillName` không tồn tại → `skillId=null`, `domain` giữ nguyên; thiếu API key → `503 missing_api_key` + client fallback `classifyLocally`. |
| Integration | Vitest | **Privacy test**: gọi mọi route của feature (GET/POST/PUT/PATCH) **không** kèm thao tác AI → xác nhận **0 lần** gọi `api.anthropic.com` (mock SDK đếm số lần gọi). |
| E2E | Playwright | AC-PS-1 (≤15s, đo `performance.now()`), AC-PS-2 (prefill), AC-PS-3 (chip chèn câu hỏi), AC-PS-4 (1 câu tóm tắt + 1 câu hỏi), AC-PS-6 (network log không có request khi chưa bấm AI), AC-PS-8/9 (chart + toggle + tương quan), AC-PS-10 (sửa nhật ký không gọi AI), AC-PS-11 (refusal không crash). |
| E2E | Playwright | Responsive 390px cho `/journal` và `/state`; điều hướng bàn phím qua chip → textarea → nút AI; `aria-live` đọc được phản hồi. |
| Tiêu chí nghiệm thu | Playwright | Toàn bộ AC-PS-1…AC-PS-11 trong `spec.md` §8 được map 1–1 với 1 test. |

## 7. Rủi ro & đánh đổi kỹ thuật

| # | Rủi ro | Tác động | Giảm thiểu |
|---|---|---|---|
| TR-1 | **Double-submit AI** (bấm nhiều lần) → tốn tiền + 2 stream chồng nhau. | Cao (chi phí + UI loạn) | Disable nút trong `phase !== "idle"`; thêm `AbortController` huỷ stream cũ khi bấm lại; server ghi `AiCall` từng lượt nên vẫn minh bạch (FR-PS-07). |
| TR-2 | **`Reflection.activityId` nullable** làm thay đổi quan hệ 1–1 mà nhiều chỗ khác có thể đang dựa vào. | Trung bình | Grep toàn repo trước khi migrate; `relation("Activity")` giữ nguyên; thêm index `[status, createdAt]`; mọi truy vấn thống kê lọc `status='published'`. |
| TR-3 | **Streaming + structured output** của SDK có thể trả `content` không parse được nếu model cắt giữa chừng (`max_tokens` quá thấp). | Trung bình | `max_tokens: 600` (2 câu ngắn) + `stop_reason !== "end_turn"` → coi là lỗi schema, không lưu, cho thử lại. |
| TR-4 | **Sai lệch 1 ngày do UTC/local** làm chart + tương quan lệch. | Cao (số liệu sai) | `src/lib/dates.ts` là nguồn duy nhất; `DailyState.date`/`PlanItem.date` lưu 00:00 local; `Activity.createdAt` dùng `date(createdAt,'localtime')`; test mốc 23:30/00:30. |
| TR-5 | **SQLite ghi đồng thời** (autosave nháp + lưu nhật ký) gây `database is locked`. | Trung bình | Ghi nháp **serialize** bằng 1 hàng đợi (chỉ 1 request pending, cái mới ghi đè cái cũ); `busy_timeout` trong `DATABASE_URL` (`file:./dev.db?connection_limit=1`); bọc `prisma.$transaction` cho commit. |
| TR-6 | **Tương quan cho kết luận sai** trên mẫu nhỏ (P5 quy tắc "không bịa"). | Cao (mất niềm tin) | `minN = 7` bắt buộc; hiển thị `n` + `confidence` cạnh mỗi phát hiện; câu chữ "tương quan quan sát" chứ không phải nhân quả; nếu `abs(r) < 0.3` thì không hiện phát hiện. |
| TR-7 | **Chi phí Opus 5** cho mỗi lượt phản hồi nhật ký. | Trung bình | `effort: low`, `max_tokens: 600`, cache prefix system prompt; `AiCall` ghi lại để S15 theo dõi; giới hạn 3 lượt/phút. Ước tính: ~1.200 input + ~120 output token/lượt ≈ **$0.006/lượt**. |
| TR-8 | **Chi phí Haiku 4.5** cho phân loại (AI-06). | Thấp | ~400 input + ~60 output token/lượt ≈ **$0.0007/lượt**; chạy sau khi người dùng đã bấm nút AI nên tần suất thấp; cache prefix. |
| TR-9 | **`localStorage` mirror có thể lộ nhật ký** trên máy dùng chung. | Trung bình | Chỉ lưu **bản nháp chưa commit**; xoá ngay khi commit; ghi chú rõ trong UI rằng dữ liệu nằm trên máy. Không đồng bộ. |
| TR-10 | **Biểu đồ SVG tự viết** dễ vỡ khi đổi khung 7/30 (số điểm khác nhau). | Thấp | Tách hàm `pointsFor`/`toChartY` thuần, unit test với 7 và 30 điểm; `viewBox` cố định `0 0 380 140` + `preserveAspectRatio="none"`. |
| TR-11 | **Người dùng sửa nhật ký cũ rồi phản hồi AI cũ còn hiện** → hiểu nhầm là phản hồi cho nội dung mới. | Trung bình | `isStale` tính từ `updatedAt`; panel làm mờ + badge "Phản hồi đã cũ"; không tự gọi lại AI (FR-PSJ-06). |
| TR-12 | **Đếm ngày có dữ liệu** khác nhau giữa `n` và số ô trong ma trận (ngày thiếu 1 chỉ số). | Thấp | `n` đếm ngày có **đủ 4 chỉ số**; ngày thiếu chỉ số vẫn hiện ô trong ma trận nhưng không tính vào phép tương quan — ghi rõ trong panel. |

## 8. Ước tính chi phí riêng của feature

| Hành động | Model | Input | Output | USD/lượt | Số lượng/ngày | USD/ngày |
|---|---|---|---|---|---|---|
| Phản hồi nhật ký (AI-05) | `claude-opus-5` | ~1.200 (phần lớn đọc cache) | ~120 | ~$0.006 | 1 | ~$0.006 |
| Phân loại nhật ký (AI-06) | `claude-haiku-4-5` | ~400 | ~60 | ~$0.0007 | 1 | ~$0.0007 |
| **Tổng (1 nhật ký/ngày)** | | | | | | **~$0.007** |

> ~$0.21/tháng nếu ghi nhật ký mỗi ngày. Đây là ước tính — phải đo thật qua bảng `AiCall` sau 1 tuần (SPEC §5.7).
> Phân tích tương quan FR-PS-05 và biểu đồ FR-PS-06 **không tốn token nào** (thuần JS + SQLite).
