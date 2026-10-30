# Design — Báo cáo Tuần & Tiến Bộ

## 1. Tổng quan kiến trúc

Cả hai màn hình là **read-mostly**: đọc từ `Activity` / `Evidence` / `DailyState` / `Review` / `PlanItem` qua các hàm tổng hợp trong `src/lib/analytics.ts`, render bằng Server Component; chỉ phần tương tác (bộ lọc domain, chỉnh sửa inline kế hoạch) là Client Component.

```
┌──────────────────────────────────────────────────────────────────┐
│  Server Component (page.tsx)                                     │
│  ├── fetchParallel(): getWeeklySummary(week) ─┐                  │
│  └── fetchParallel(): getProgress(days)     ─┤                  │
│                                            │  (không N+1)       │
│                                            ▼                  │
│  src/lib/analytics.ts  (aggregate thuần, không gọi AI)          │
│  ├── getWeeklySummary()  → FR-WR-02                             │
│  ├── getTopSkills()      → FR-WR-02, FR-PR-01                   │
│  ├── getHeatmap()        → FR-PR-02                             │
│  └── getPracticeTime()   → FR-PR-04 (lọc skillId IS NOT NULL)  │
│                                                                 │
│  <WeeklyReviewReport data={summary} />   ← Client (kế hoạch)   │
│  <ProgressReport data={progress} />       ← Client (filter)    │
└──────────────────────────────────────────────────────────────────┘
              │
              │  POST /api/review/weekly  (AI-07, streaming)
              ▼
┌──────────────────────────────────────────────────────────────────┐
│  src/lib/anthropic.ts → callAIStream({ feature: "weekly_review" })│
│  system: [STABLE_SYSTEM, RUBRIC_WEEKLY + cache_control]         │
│  messages: [week data (biến động — nằm sau cache)]              │
│  → ghi AiCall { feature: "weekly_review", cacheRead, ... }      │
└──────────────────────────────────────────────────────────────────┘
```

**Nguyên tắc tách lớp quan trọng:** phần **số liệu** (FR-WR-02) không bao giờ phụ thuộc AI.
Chỉ 2 khối phụ thuộc AI: "Nhận định 3 điểm" và "Kế hoạch tuần tới". Nhờ vậy S13 vẫn dùng được offline (AC-RP-3).

## 2. Kiến trúc

### 2.1 Sơ đồ luồng — S13 (Weekly Review)

```
User mở /review
   │
   ├─► getWeeklySummary(week)  ──► Prisma aggregate queries (5 query, parallel)
   │      │
   │      ├─ completion: {done, total, rate}
   │      ├─ byDomain:  [{domain, done, total, label, status}]
   │      ├─ energy:    [{date, slotsDone, slotsTotal, energyPct}]
   │      ├─ topSkills: [{skillId, name, evidenceDelta, levelFrom, levelTo}]
   │      ├─ bio:       {moodAvg, focusAvg, sleepAvg}
   │      ├─ retention: {rate, reviews, target}
   │      └─ priorWeek: {done, total, rate}
   │
   ├─► render số liệu (Server Component) ──► HTML đã có nội dung ngay
   │
   └─► <WeeklyReviewReport> (Client)
          │
          └─► useEffect: nếu chưa có insights (và có API key)
                 └─► POST /api/review/weekly  (stream NDJSON)
                        ├─ { type:"insight", data:{strength, weakness, experiment} }
                        ├─ { type:"plan", data:{ slots:[6], reducedLoad:boolean, reason } }
                        └─ { type:"done" }
```

### 2.2 Sơ đồ luồng — S14 (Progress)

```
User mở /progress?domain=all&days=180
   │
   ├─► getProgress({domain, days})
   │      ├─ levelAvg:  trung bình Skill.level theo domain lọc
   │      ├─ delta30:  levelAvg(hôm nay) − levelAvg(30 ngày trước)
   │      ├─ evidenceByMonth: [{month, count}]
   │      ├─ heatmap:  [{date, count}]  ← đếm Evidence
   │      ├─ t30:      {prdMinutes, grammarErrorRate, hskCoreWords}
   │      └─ practiceTime: [{domain, minutes}]  ← skillId IS NOT NULL
   │
   └─► <ProgressReport> (Client)
          └─► useState(domainFilter)  → lọc client-side, KHÔNG refetch
```

### 2.3 Phân tầng

| Tầng | Module | Trách nhiệm |
|---|---|---|
| Route | `src/app/review/page.tsx` | Đọc query `?week=`, gọi analytics, render |
| Route | `src/app/progress/page.tsx` | Đọc query `?domain=&days=`, gọi analytics, render |
| UI | `src/components/review/weekly-review-report.tsx` | Client: state kế hoạch nháp, stream insights, nút duyệt |
| UI | `src/components/review/insight-block.tsx` | Render 3 nhận định (✓/✗/💡) |
| UI | `src/components/review/next-week-plan.tsx` | 6 slot card + sửa inline + kéo đổi |
| UI | `src/components/progress/progress-report.tsx` | Client: filter domain |
| UI | `src/components/progress/skill-trajectory-chart.tsx` | Line chart 6 tháng |
| UI | `src/components/progress/evidence-heatmap.tsx` | Lưới 90 ngày |
| UI | `src/components/progress/t30-benchmark.tsx` | 3 cặp delta |
| UI | `src/components/progress/practice-time-bar.tsx` | Bar deliberate practice |
| Nghiệp vụ | `src/lib/analytics.ts` | Aggregate thuần, không import AI |
| Nghiệp vụ | `src/lib/week.ts` | Tính tuần ISO, tuần trước, ngày trong tuần |
| AI | `src/lib/prompts.ts` | `WEEKLY_REVIEW_SYSTEM`, `RUBRIC_WEEKLY` |
| AI | `src/lib/anthropic.ts` | `callAIStream` + ghi `AiCall` |
| API | `src/app/api/review/weekly/route.ts` | GET summary · POST stream AI |
| API | `src/app/api/review/weekly/apply/route.ts` | Ghi 42 `PlanItem` (transaction) |
| API | `src/app/api/progress/route.ts` | GET progress |

### 2.4 Quyết định thiết kế

| # | Quyết định | Lý do | Hệ quả |
|---|---|---|---|
| D1 | Số liệu thống kê tách khỏi AI hoàn toàn | FR-WR-02 là dữ liệu, không phải nhận định | S13 dùng được offline; AI chỉ là lớp trang trí/đề xuất |
| D2 | Dùng Prisma `$transaction` khi ghi 42 PlanItem | Duyệt 2 lần phải idempotent (AC-RP-5) | Xoá `source=ai` của tuần đích rồi insert, trong 1 transaction |
| D3 | Heatmap đếm `Evidence` chứ không phải `Activity` | P3 — ô trống ≠ hoạt động ảo (AC-RP-7) | Query đơn giản, đúng ngữ nghĩa |
| D4 | Deliberate practice lọc `skillId IS NOT NULL` | P7 — không vanity metric (AC-RP-6) | Hoạt động không gắn kỹ năng không được đếm |
| D5 | Filter domain ở S14 xử lý client-side | 180 ngày × 4 domain đã nạp sẵn; refetch là thừa | UI phản hồi tức thì, không loading spinner |
| D6 | Xuất JSON stream ra file thay vì buffer | DB có thể > 50MB | Dùng `ReadableStream` trong route handler |
| D7 | `week` là ISO string (`2026-W43`) trong query param | Dễ bookmark & chia sẻ | Phải validate bằng Zod, week không hợp lệ → 400 |
| D8 | Nhận định AI trả về JSON theo schema, không phải markdown tự do | P4 + FR-AI-04 | Structured output bắt buộc |

## 3. Thành phần

### 3.1 `src/lib/analytics.ts`

**Responsibilities:**
- Aggregate số liệu tuần & tiến bộ bằng Prisma queries (không gọi AI).
- Chuẩn hoá đầu ra về shape ổn định để UI không phải tự tính.

**Interfaces:**

```ts
export type DomainKey = "professional" | "communication" | "language" | "personal";

export interface WeeklySummary {
  week: string;                 // "2026-W43"
  range: { start: string; end: string };   // ISO date
  completion: { done: number; total: number; rate: number };
  priorWeek: { done: number; total: number; rate: number; deltaRate: number };
  byDomain: Array<{
    domain: DomainKey;
    label: string;              // "Chuyên môn (Software & System Architecture)"
    done: number; total: number; rate: number;
    status: "elite" | "ok" | "needs_attention";
    note?: string;
  }>;
  energy: Array<{
    date: string;               // "2026-10-26"
    slotsDone: number; slotsTotal: number; energyPct: number;
  }>;
  topSkills: Array<{
    skillId: string; name: string;
    evidenceDelta: number; levelFrom: number; levelTo: number;
    avgRating: number;
  }>;
  bio: { moodAvg: number | null; focusAvg: number | null; sleepAvg: number | null };
  retention: { rate: number; reviews: number; target: number };
  streak: number;
}

export interface ProgressReport {
  domain: DomainKey | "all";
  days: number;
  levelAvg: number;
  delta30: number;
  evidenceByMonth: Array<{ month: string; count: number }>;
  heatmap: Array<{ date: string; count: number }>;
  t30: {
    available: boolean;
    daysMissing: number;
    prdMinutes: { current: number; previous: number } | null;
    grammarErrorRate: { current: number; previous: number } | null;
    hskCoreWords: { current: number; previous: number } | null;
  };
  practiceTime: Array<{ domain: DomainKey; minutes: number; pct: number }>;
}

export async function getWeeklySummary(week: string): Promise<WeeklySummary>;
export async function getProgress(
  opts: { domain: DomainKey | "all"; days: number }
): Promise<ProgressReport>;
```

**Dependencies:** `@prisma/client`, `src/lib/week.ts`.

### 3.2 `src/lib/week.ts`

```ts
export function parseIsoWeek(week: string): { start: Date; end: Date };
export function currentIsoWeek(now?: Date): string;          // "2026-W43"
export function previousIsoWeek(week: string): string;
export function weekDays(start: Date): Date[];               // 7 ngày, Thứ Hai → Chủ Nhật
export function isWeeklyReviewDue(now?: Date): boolean;     // Chủ nhật >= 20:00
export function lastCompletedWeek(now?: Date): string;
```

**Edge cases:**
- `parseIsoWeek("2026-W99")` → throw `InvalidWeekError` → route trả 400.
- Tuần chéo năm (`2026-W01` chứa 28/12/2025) → dùng `ISOWeekToDate` chuẩn, không tự tính tay.

### 3.3 `src/components/review/weekly-review-report.tsx`

**Route:** `src/app/review/page.tsx` (render)

**Responsibilities:**
- Hiển thị 7 khối của S13.
- Quản lý state kế hoạch nháp (chỉnh sửa inline, kéo đổi slot).
- Stream insights + plan từ `POST /api/review/weekly`.
- Nút "Duyệt & Áp dụng" → `POST /api/review/weekly/apply`.

**Interfaces:**

```tsx
export interface WeeklyReviewReportProps {
  summary: WeeklySummary;
  priorInsights: WeeklyInsights | null;   // đã lưu từ lần trước → không gọi lại AI
  hasApiKey: boolean;
  isDue: boolean;
}

export interface WeeklyInsights {
  strength: { title: string; body: string; evidence: string };
  weakness: { title: string; body: string; impact: string };
  experiment: { title: string; body: string; rationale: string };
}

export interface NextWeekPlan {
  slots: Array<{
    slot: number;                    // 0..5
    domain: DomainKey;
    action: string;
    detail: string;
    minutes: number;
    startTime?: string;               // "07:30"
    endTime?: string;                 // "09:00"
    skillName: string | null;
    focusHint?: string;
  }>;
  reducedLoad: boolean;               // FR-WR-05
  reduceReason?: string;
}

export default function WeeklyReviewReport(props: WeeklyReviewReportProps): JSX.Element;
```

**Dependencies:** `insight-block`, `next-week-plan`, `useState`, `fetch` (stream reader).

**Edge cases:**
- Không có API key → không gọi endpoint; hiện hướng dẫn.
- Streaming lỗi giữa chừng → giữ phần đã nhận, hiện banner lỗi + "Thử lại".
- `slots.length !== 6` → hiện cảnh báo "Kế hoạch AI trả về {n}/6 slot — bổ sung slot trống để người dùng tự điền", không crash.

### 3.4 `src/components/review/next-week-plan.tsx`

**Responsibilities:** render 6 slot dạng card; inline edit action/detail/minutes/startTime; drag để đổi thứ tự slot; nút duyệt.

```tsx
export interface NextWeekPlanProps {
  plan: NextWeekPlan;
  editable: boolean;
  onChange: (plan: NextWeekPlan) => void;
  onApprove: () => Promise<void>;
}

export default function NextWeekPlan(props: NextWeekPlanProps): JSX.Element;
```

**Edge cases:** kéo đổi slot không được làm mất `slot` index khỏi 0..5; validate trước khi gửi (server cũng validate).

### 3.5 `src/components/progress/progress-report.tsx`

```tsx
export interface ProgressReportProps {
  data: ProgressReport;
  skillTrajectories: Array<{
    domain: DomainKey;
    label: string;
    points: Array<{ month: string; level: number }>;
  }>;
}

export default function ProgressReport(props: ProgressReportProps): JSX.Element;
```

**Edge cases:** domain không có dữ liệu → "Chưa có bằng chứng cho domain này"; chart < 2 điểm → hiện dạng list thay vì line chart rỗng.

### 3.6 `src/components/progress/evidence-heatmap.tsx`

```tsx
export interface EvidenceHeatmapProps {
  cells: Array<{ date: string; count: number }>;
  weeks: number;               // 90 ngày / 7
  startDate: string;
}

export default function EvidenceHeatmap(props: EvidenceHeatmapProps): JSX.Element;
```

**Edge cases:** ngày không có evidence → render ô nền `bg-surface-container-highest` (không tính vào tổng); tooltip "0 bằng chứng".

### 3.7 API routes

#### `GET /api/review/weekly?week=2026-W43`

```ts
export async function GET(req: NextRequest): Promise<Response> {
  const week = req.nextUrl.searchParams.get("week") ?? currentIsoWeek();
  if (!isValidIsoWeek(week)) {
    return Response.json({ ok: false, error: "invalid_week" }, { status: 400 });
  }
  const summary = await getWeeklySummary(week);
  return Response.json({ ok: true, data: summary });
}
```

#### `POST /api/review/weekly` (streaming NDJSON)

```ts
export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const week = body.week ?? currentIsoWeek();

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, error: "no_api_key" }, { status: 503 });
  }

  const summary = await getWeeklySummary(week);       // nội dung biến động → messages
  const stream = await callAIStream({
    feature: "weekly_review",
    model: "claude-opus-5",
    effort: "high",
    system: [WEEKLY_REVIEW_SYSTEM, RUBRIC_WEEKLY],
    messages: [buildWeeklyUserMessage(summary, week)],
    parse: WeeklyReviewSchema,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
```

> `system` **cố định** (cache được). Toàn bộ dữ liệu tuần nằm trong `messages` — nằm sau breakpoint cache (SPEC §5.2).

#### `POST /api/review/weekly/apply`

```ts
export interface ApplyPlanBody {
  week: string;
  slots: NextWeekPlan["slots"];
  reducedLoad: boolean;
  reduceReason?: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  const body = ApplyPlanSchema.parse(await req.json());

  const start = parseIsoWeek(body.week).start;   // Thứ Hai của tuần đích

  const applied = await prisma.$transaction(async (tx) => {
    await tx.planItem.deleteMany({
      where: {
        date: { gte: start, lt: addDays(start, 7) },
        source: "ai",
      },
    });

    const rows = [];
    for (let day = 0; day < 7; day++) {
      const date = addDays(start, day);
      for (const slot of body.slots) {
        rows.push({
          date,
          slot: slot.slot,
          domain: slot.domain,
          action: slot.action,
          detail: slot.detail,
          minutes: slot.minutes,
          skillId: slot.skillId ?? null,
          done: false,
          source: "ai",
        });
      }
    }
    const res = await tx.planItem.createMany({ data: rows });
    return res.count;
  });

  return Response.json({ ok: true, data: { applied } });
}
```

**Edge cases:**
- `slots` không phải 6 phần tử → 400.
- `slot` trùng nhau → 400.
- `week` không hợp lệ → 400.

### 3.8 Prompt & schema

```ts
// src/lib/prompts.ts
export const WEEKLY_REVIEW_SYSTEM = `
Bạn là coach phát triển bản thân. Nhiệm vụ duy nhất: tổng hợp một tuần hoạt động
của người dùng thành 3 nhận định hành động được + kế hoạch 6 slot cho tuần sau.
Nguyên tắc:
- Chỉ dùng số liệu được cung cấp. Không bịa số liệu, tên kỹ năng hay hoạt động.
- Nhận định phải truy được về hành động cụ thể trong tuần.
- Nếu người dùng trượt >= 2 ngày liên tiếp: giảm tải (ít slot hơn hoặc thời lượng
  ngắn hơn) và nêu rõ lý do trong reduceReason.
- Không khuyến khích tăng cường độ khi người dùng đang kiệt sức.
`.trim();

export const RUBRIC_WEEKLY = `
Tiêu chuẩn cho 3 nhận định:
1. strength  — điều đã làm rất tốt: phải có bằng chứng cụ thể (ngày, số liệu, hành vi).
2. weakness  — điểm cần sửa: nêu rõ hậu quả (impact) đo được, không phải mỹ cảm.
3. experiment — nên thử tuần sau: 1 thay đổi duy nhất, có lý do (rationale).
`.trim();
```

```ts
// Zod schema — FR-AI-04 structured output
export const WeeklyReviewSchema = z.object({
  insights: z.object({
    strength: z.object({
      title: z.string(),
      body: z.string(),
      evidence: z.string(),
    }),
    weakness: z.object({
      title: z.string(),
      body: z.string(),
      impact: z.string(),
    }),
    experiment: z.object({
      title: z.string(),
      body: z.string(),
      rationale: z.string(),
    }),
  }),
  plan: z.object({
    slots: z.array(
      z.object({
        slot: z.number().int().min(0).max(5),
        domain: z.enum(["professional", "communication", "language", "personal"]),
        action: z.string(),
        detail: z.string(),
        minutes: z.number().int().min(5).max(120),
        skillName: z.string().nullable(),
        startTime: z.string().nullable(),
        endTime: z.string().nullable(),
        focusHint: z.string().nullable(),
      })
    ).length(6),
    reducedLoad: z.boolean(),
    reduceReason: z.string().nullable(),
  }),
});
```

## 4. Luồng dữ liệu

### 4.1 Luồng chính — tính số liệu tuần

1. `parseIsoWeek(week)` → `{ start, end }` (Thứ Hai 00:00 → Chủ Nhật 23:59:59.999 local).
2. Query song song (`Promise.all`):
   - `planItem.groupBy` trong `[start, end)` → `{ done, total }` tuần này & tuần trước.
   - `activity.groupBy({ by: ["domain"] })` → phân bổ domain.
   - `evidence.groupBy({ by: ["skillId"], _count })` + `skill.findMany` → top 3 kỹ năng.
   - `dailyState.aggregate({ _avg: { mood, focus, sleep } })` → chỉ số sinh trắc.
   - `review.aggregate` + `card.count` → FSRS retention.
3. `energy[]`: với mỗi ngày trong tuần, `planItem.count({ date, done: true })` / `planItem.count({ date })`; `energyPct` = `dailyState.energy` (1–5) → `(energy/5)*100`.
4. Chuẩn hoá `rate`, `deltaRate` (làm tròn 1 chữ số), `status` theo ngưỡng:
   - `rate >= 0.9` → `elite`
   - `rate >= 0.75` → `ok`
   - còn lại → `needs_attention`

### 4.2 Lưu trữ & truy vấn — S14

```ts
// Level trung bình theo domain (chỉ skill node, không tính node gốc)
const skills = await prisma.skill.findMany({
  where: domainFilter,
  select: { id: true, domain: true, level: true, evidences: { select: { createdAt: true } } },
});
```

> Chỉ tính **node lá** (skill không có con) làm "cấp độ kỹ năng bình quân" — node gốc là nhóm, không phải kỹ năng.

```ts
// Heatmap — đếm Evidence (AC-RP-7)
const heatmap = await prisma.evidence.groupBy({
  by: ["createdAt"],
  where: { createdAt: { gte: from, lt: to } },
  _count: { _all: true },
});
// → map sang { date: yyyy-MM-dd, count }
```

```ts
// Deliberate practice — lọc skillId IS NOT NULL (AC-RP-6)
const practiceTime = await prisma.activity.groupBy({
  by: ["domain"],
  where: { skillId: { not: null }, createdAt: { gte: from, lt: to } },
  _sum: { minutes: true },
});
```

## 5. Xử lý lỗi

| Tình huống | Phát hiện | Xử lý | Thông báo người dùng |
|---|---|---|---|
| `week` không hợp lệ | `isValidIsoWeek()` | 400 | "Tuần không hợp lệ — dùng định dạng 2026-W43" |
| Thiếu API key | `!process.env.ANTHROPIC_API_KEY` | 503, UI ẩn khối AI | "Bật nhận định AI bằng cách thêm API key trong Cài đặt" |
| `RateLimitError` | typed exception | log `AiCall{ok:false}` | "AI đang tải cao. Thử lại sau vài phút." + nút Thử lại |
| `stop_reason === "refusal"` | kiểm tra **trước** khi đọc content | log lỗi | "AI không thể tổng hợp nội dung này. Số liệu vẫn hiển thị bên trên." |
| Structured output sai schema | `schema.safeParse` fail | log lỗi, trả `insights` null | "Kế hoạch AI không hợp lệ — bạn có thể tự chỉnh sửa." |
| Streaming ngắt giữa chừng | reader error | giữ chunk đã nhận | "Kết nối bị gián đoạn — nhận định có thể chưa đầy đủ." + Thử lại |
| Query DB lỗi | Prisma exception | 500 + log | "Không tải được báo cáo. Thử tải lại trang." |
| Ghi `PlanItem` lỗi (unique constraint) | transaction throw | rollback | "Không lưu được kế hoạch. Thử lại." |
| Xuất JSON lỗi | stream error | 500 | "Xuất thất bại." |

## 6. Chiến lược kiểm thử

| Tầng | Công cụ | Phạm vi |
|---|---|---|
| Unit | Vitest | `parseIsoWeek`, `previousIsoWeek`, `isWeeklyReviewDue`, `status` threshold, `deltaRate` rounding |
| Unit | Vitest | `buildWeeklyUserMessage` không chứa `Date.now()` (bảo toàn cache) |
| Integration | Vitest + SQLite test DB | `getWeeklySummary` với fixture 42 PlanItem → `done/total` đúng |
| Integration | Vitest | `getPracticeTime` **loại** Activity không có `skillId` (AC-RP-6) |
| Integration | Vitest | `getHeatmap` chỉ trả về ngày có Evidence (AC-RP-7) |
| Integration | Vitest | `POST /api/review/weekly/apply` 2 lần → vẫn 42 dòng, không nhân bản (AC-RP-5) |
| Integration | Vitest (mock AI) | AI trả `slots.length !== 6` → 200 + cảnh báo, không 500 |
| E2E | Playwright | S13: mở → thấy số liệu thật → bấm Duyệt → 42 PlanItem trong DB |
| E2E | Playwright | S13 không API key → số liệu hiện, khối AI hiện hướng dẫn (AC-RP-3) |
| E2E | Playwright | S14 filter domain đổi → chart đổi ngay, không reload |
| A11y | axe | Chart có `aria-label` mô tả; bảng dữ liệu có `<table>` semantic |
| Responsive | Playwright 390px | Heatmap scroll ngang; chart không tràn viewport |

## 7. Rủi ro & đánh đổi kỹ thuật

| # | Rủi ro | Tác động | Giảm thiểu |
|---|---|---|---|
| T1 | Query tổng hợp chậm khi dữ liệu nhiều (90 ngày × nhiều hoạt động) | S14 load > 1.5s | Dùng `groupBy` + index sẵn có (`Evidence.skillId`, `Activity` theo `createdAt` — cần thêm `@@index([createdAt])`); cache phía server theo `days+domain` trong 5 phút |
| T2 | AI trả kế hoạch 7 slot (sai spec 6 slot) | Kế hoạch tuần sai cấu trúc | Schema `.length(6)` → parse fail → UI cho sửa tay; không tự cắt bừa |
| T3 | Áp dụng kế hoạch 2 lần tạo trùng | 84 PlanItem thay vì 42 | Transaction xoá `source=ai` tuần đích rồi insert (AC-RP-5) |
| T4 | Thiếu `@@index([createdAt])` trên `Activity`/`Evidence` | Full scan 90 ngày | Thêm index trong migration |
| T5 | Heatmap 90 ngày render 91×7 ô DOM | Jank khi lọc | Render bằng CSS grid thuần, không thư viện; cache `cells` bằng `useMemo` |
| T6 | Số liệu tuần khác nhau giữa lúc render và lúc export | Báo cáo không tái lập được | `export` dùng **cùng** `getWeeklySummary` với cùng `week` → deterministic |
| T7 | Nhận định AI nói về hoạt động không tồn tại (hallucination) | Mất niềm tin vào báo cáo | System prompt cấm bịa; UI hiển thị `evidence` trích dẫn cụ thể; có thể báo sai nhận định |
| T8 | Timezone: tuần chạm ranh giới nửa đêm | Số liệu lệch 1 ngày | `src/lib/dates.ts` chuẩn hoá 00:00 local; **không** dùng `toISOString()` (chuyển UTC) cho so sánh ngày |
