# Design — Daily Loop & Sinh Kế Hoạch AI

> Feature: `daily-loop-core` · Phase 0 · Màn hình S01 (`/`), S02 (`/plan`)
> Nguồn: `system-design/SPEC.md` §2.1, §3.2, §4, §5.1–§5.6, §8 · `.kiro/specs/ai-foundation/` (lớp AI) · prototype S01/S02.

## 1. Tổng quan kiến trúc

Hai màn hình, một mô hình dữ liệu, một lớp AI dùng chung. Kiến trúc đặt **toàn bộ logic nghiệp vụ** ở `src/lib/daily-loop.ts` (thuần, không phụ thuộc React), để Server Component và Client Component cùng gọi được và để test được bằng Vitest không cần DOM.

```
                       ┌──────────────────────────────────────────────┐
   Browser            │  Next.js 15 App Router                       │
  ┌──────────┐        │                                              │
  │ S01  /   │◀──────▶│  app/page.tsx            (Server Component)  │
  │ S02  /plan│◀─────▶│  app/plan/page.tsx       (Server Component)  │
  └──────────┘        │        │                                     │
                       │        ▼                                     │
                       │  components/daily-loop/*.tsx   (Client)      │
                       │   • daily-loop-header.tsx                  │
                       │   • focus-banner.tsx        (mục tiêu + nút)│
                       │   • metrics-row.tsx         (4 metric tile) │
                       │   • bio-panel.tsx           (sinh trắc)     │
                       │   • daily-slot-list.tsx      (6 slot card)   │
                       │   • daily-slot-card.tsx                      │
                       │   • quick-log-trigger.tsx   (mở sheet)      │
                       │   • replan-modal.tsx        (Cân chỉnh lại)  │
                       │   • week-streak-widget.tsx                   │
                       │        │                                     │
                       │        ▼                                     │
                       │  app/api/plan/**  (route handlers)           │
                       └────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼──────────────────────────┐
        ▼                       ▼                          ▼
┌───────────────┐   ┌────────────────────────┐   ┌──────────────────────┐
│ lib/plan-db  │   │ lib/daily-loop.ts      │   │ lib/anthropic.ts     │
│ (Prisma)     │   │ (nghiệp vụ thuần)     │   │ (ai-foundation)      │
│ PlanItem     │   │ • mergeRegeneratedPlan │   │ streamAI("AI-01")   │
│ Activity     │   │ • computeStreak        │   │ buildSystemBlocks() │
│ Evidence     │   │ • computeWeeklyEnergy  │   └──────────┬───────────┘
│ Skill        │   │ • completePlanItem     │              │
└───────────────┘   └────────────────────────┘              ▼
        ▲                                    ┌──────────────────────────┐
        │                                    │ lib/plan.ts (offline)    │
        └────────────────────────────────────│ generateFallbackPlan()  │
                                             └──────────────────────────┘
```

**Nguyên tắc thiết kế cốt lõi:**

1. **`src/lib/daily-loop.ts` là nguồn sự thật nghiệp vụ.** Cả S01 (Server), S02 (Client) và API routes đều gọi cùng một bộ hàm → không có logic trùng, không có "UI tự tính streak".
2. **AI chỉ điền nội dung.** Cấu trúc 6 slot do `SLOT_DOMAINS` + Zod schema quyết định; server kiểm bất biến trước khi ghi.
3. **Slot `done` là bất biến.** Mọi đường ghi (AI, fallback, duyệt tay) đều đi qua một hàm duy nhất `mergeRegeneratedPlan()` / `applyPlan()` để không đường nào vô tình ghi đè tiến độ trong ngày.

## 2. Kiến trúc

### 2.1 Sơ đồ luồng — đọc S01 (render server)

```
Browser GET /
   │
   ▼
app/page.tsx  (Server Component)
   │  date = todayLocal()  ──► src/lib/dates.ts  (yyyy-MM-dd, 00:00 local)
   ├── getPlanForDate(date)          ──► PlanItem[] cho ngày
   ├── computeStreak(date)           ──► number
   ├── computeWeeklyEnergy(date)     ──► { pct, doneSlots, totalSlots }
   ├── getFocusSkill(date)           ──► Skill trọng tâm + level + evidenceCount
   ├── getDailyState(date)           ──► DailyState | null
   ├── getSrsQueueSize(date)         ──► số thẻ đến hạn (feature SRS, có thể null)
   │
   ▼
render: FocusBanner · MetricsRow · BioPanel · DailySlotList · WeekStreakWidget
   │
   └─► Client islands: DailySlotCard (nút hành động) · QuickLogTrigger · ReplanModal
```

### 2.2 Sơ đồ luồng — sinh kế hoạch AI (S02, streaming)

```
User: bấm [Sinh lại toàn bộ (AI)] hoặc CTA S01
   │
   ▼
POST /api/plan/generate  { date, mode: "generate" | "regenerate" }
   │
   ├── isAiAvailable() === false ──► generateFallbackPlan(skills)  ──► SSE event "done" {source:"fallback"}
   │
   ▼ (có key)
buildPlanContext(date)
   ├── skills: { id, name, domain, level, targetLevel, evidenceCount }[]
   ├── dailyState: { mood, energy, sleep, focus } | null
   ├── last7Days: { date, doneSlots, totalSlots, minutes }[]
   ├── lockedSlots: PlanSlotDTO[]   ← slot done = true (ràng buộc)
   └── slotContract: SLOT_DOMAINS + khoảng minutes
   │
   ▼  (toàn bộ nằm trong `messages`, KHÔNG trong `system`)
streamAI("AI-01", { system: buildPlanSystemBlocks(), messages: [userCtx] })   // model: claude-opus-5 · effort: medium
   │
   ├── event "slot"  → JSON từng slot (client điền dần card)
   ├── event "usage" → token + cacheRead + estimatedCost
   ├── event "done"  → payload 6 slot đã validate + source
   └── event "error" → { code, message }
   │
   ▼
Client: bản nháp trong state + localStorage["daily-loop:draft:<date>"]
   │
   ▼
User: bấm [Duyệt & Áp dụng Kế hoạch] (Ctrl+Enter)
   │
   ▼
PATCH /api/plan/items { date, items, apply: true }
   │
   └── prisma.$transaction:
         deleteMany({ date, done: false })
         updateMany / createMany cho 6 slot (giữ row done = true)
   │
   ▼
router.push("/") + router.refresh()   → S01 đọc kế hoạch mới
```

### 2.3 Sơ đồ luồng — đánh dấu "Xong" (FR-DL-03)

```
User: bấm [Hoàn thành] / [Xong] trên card slot
   │
   ├──► (tuỳ chọn) mở Quick-log để chọn domain + mô tả + chấm chất lượng
   │        feature `quick-log` → POST /api/log  → Activity + Evidence
   │        sau đó gọi tiếp completePlanItem() để đánh dấu slot
   │
   ▼
POST /api/plan/[date]/complete { slot, quality?, minutes?, note? }
   │
   ├── existing = findPlanItem(date, slot)
   ├── existing.done === true ──► { ok:true, data:{ alreadyDone:true } }  (không tạo Activity lần 2)
   │
   ▼
prisma.$transaction:
   ├── create Activity { skillId, domain, type, minutes, title, content, quality }
   ├── nếu skillId ≠ null → create Evidence { activityId, skillId, rating: quality ?? 3 }
   └── update PlanItem { done: true }
   │
   ▼
revalidatePath("/") + trả { activityId, evidenceId, planItem }
   │
   └──► S01 re-render: card chuyển trạng thái done, chip "Bằng chứng +1", streak tăng
```

### 2.4 Phân tầng

| Tầng | Module | Trách nhiệm |
|---|---|---|
| **Route (UI)** | `src/app/page.tsx`, `src/app/plan/page.tsx` | Server Component: đọc dữ liệu, truyền props xuống Client Component. Không chứa logic nghiệp vụ. |
| **Client components** | `src/components/daily-loop/*.tsx` | Tương tác: đánh dấu xong, mở sheet, kéo đổi, sửa inline, đọc SSE, duyệt kế hoạch. |
| **API routes** | `src/app/api/plan/**/route.ts` | Validate Zod, gọi lớp nghiệp vụ, gói SSE, map lỗi typed → HTTP. |
| **Nghiệp vụ (thuần)** | `src/lib/daily-loop.ts` | `getPlanForDate`, `completePlanItem`, `applyPlan`, `mergeRegeneratedPlan`, `computeStreak`, `computeWeeklyEnergy`, `getFocusSkill`, `buildPlanContext`, `validatePlanSlots`. **Không** import React. |
| **AI layer** | `src/lib/anthropic.ts`, `src/lib/prompts.ts` | Của `ai-foundation`: `streamAI("AI-01")`, `buildSystemBlocks`, `PlanSchema`, `AiCall` logging. |
| **Offline** | `src/lib/plan.ts` | `generateFallbackPlan()` — bộ sinh rule cục bộ, `source: "fallback"`. |
| **Truy vấn** | `src/lib/db.ts` (Prisma singleton), `src/lib/dates.ts`, `src/lib/config.ts` | Truy vấn DB, chuẩn hoá ngày, hằng số `SLOT_COUNT`/`SLOT_DOMAINS`. |

### 2.5 Quyết định thiết kế

| # | Quyết định | Lý do | Hệ quả |
|---|---|---|---|
| D-1 | **`slot` = thứ tự ưu tiên, `domain` = thuộc tính của item** (không phải domain theo vị trí sau khi kéo đổi). | Cho phép kéo đổi trong cùng trục mà vẫn giữ được 4 trục P1/P5. | Bất biến được kiểm = **tập domain trong ngày** (1 professional · 1 communication · 2 language · 2 personal), không kiểm domain theo `slot`. Schema AI kiểm domain theo `slot` (vì AI không được kéo). |
| D-2 | **Bản nháp S02 nằm ở client (`useState` + `localStorage`), không có bảng `PlanDraft` trong DB.** | Không thêm model mới; tránh phải dọn dẹp bản nháp; tránh ghi DB dở dang khi stream bị ngắt. | Reload mất bản nháp nếu `localStorage` bị xoá → có "Khôi phục Offline Fallback" để dựng lại nhanh. |
| D-3 | **Duyệt kế hoạch xoá có chọn lọc**: `deleteMany({ date, done: false })` rồi tạo lại; row `done = true` **giữ nguyên**. | Đảm bảo "giữ slot đã xong" (FR-DL-06) ở **cả** đường AI lẫn đường duyệt tay. | `PlanItem.id` của slot đã xong không đổi → mọi tham chiếu khác giữ được. |
| D-4 | **Streak = ngày có `Activity`, không phải ngày có `PlanItem.done`.** | "Xong" là kế hoạch; "làm" là hoạt động thật (P3). Streak đếm hành vi, không đếm checkbox. | Đánh dấu xong slot không gắn skill vẫn tạo `Activity` ⇒ vẫn tính streak. |
| D-5 | **Năng lượng tuần = Σdone / Σcó-kế-hoạch** trong 7 ngày, mẫu số **loại trừ** ngày không có kế hoạch. | Ngày không có kế hoạch (ngày mới dùng app, ngày nghỉ) không nên bị tính là 0/6 → kéo tỉ lệ tuần xuống giả. | Tuần mới bắt đầu hiện "—" thay vì 0% khi chưa có ngày nào có kế hoạch. |
| D-6 | **AI-01 dùng streaming + structured output cùng lúc**: `streamAI("AI-01")` với `output_config.format = zodOutputFormat(PlanSchema)`, `model = claude-opus-5`, `effort = medium` theo bảng routing (§4.1 của `ai-foundation`), và phát event `slot` theo từng phần tử đã validate. | SPEC §5.1 yêu cầu streaming + structured; S02 cần "hiển thị từng slot khi text về". | Schema sai ⇒ **không** phát event `slot` nào cho phần sai; server chỉ ghi DB sau event `done`. |
| D-7 | **Prompt caching: `system` = `[PLAN_SYSTEM_V1, PLAN_SLOT_CONTRACT_V1(cache)]`, toàn bộ dữ liệu biến động trong `messages`.** | FR-AI-01 + SPEC §5.2: dữ liệu biến động lọt vào `system` là *silent invalidator*. | `cache_read_input_tokens > 0` ở lần gọi thứ 2 = AC-5 kiểm chứng được. |
| D-8 | **Fallback offline dùng chung `src/lib/plan.ts` với `ai-foundation`**, không viết bộ sinh thứ hai. | Một nguồn fallback; `ai-foundation` đã định nghĩa `generateFallbackPlan()`. | Feature này sở hữu file đó (ai-foundation chỉ dùng). Phải giữ `source: "fallback"` và tính deterministic. |
| D-9 | **`completePlanItem` là idempotent** (đã `done` ⇒ trả `alreadyDone`, không tạo Activity lần 2). | Người dùng bấm nút hai lần là hành vi thường; tạo bằng chứng trùng sẽ làm sai `Skill.level`. | Cần unique/guard ở tầng nghiệp vụ, không phụ thuộc UI disable. |
| D-10 | **Không giới hạn số lần sinh lại trong ngày, nhưng mỗi lần đều tường minh từ người dùng** (không auto-regenerate). | R-DL-7: chi phí AI-01. | `AiCall` ghi từng lần → S15 hiển thị chi phí thật. |

## 3. Thành phần

### 3.1 `src/lib/daily-loop.ts` — lớp nghiệp vụ (thuần)

**Route/đường dẫn:** `src/lib/daily-loop.ts`

**Responsibilities:**
- Đọc/ghi `PlanItem`, `Activity`, `Evidence` cho một ngày.
- Tính streak, năng lượng tuần, skill trọng tâm.
- Áp dụng kế hoạch (duyệt) và đánh dấu hoàn thành.
- Merge kế hoạch AI mới với kế hoạch đang có, **giữ slot đã done**.
- Dựng `PlanContext` (biến động) để đưa vào `messages` của AI-01.
- **Không** import React, **không** import `@anthropic-ai/sdk`.

**Interfaces:**

```ts
// src/lib/daily-loop.ts
import type { Domain } from "@/lib/prompts";
import { SLOT_COUNT, SLOT_DOMAINS } from "@/lib/config";

export type PlanSource = "ai" | "manual" | "fallback";
export type SlotKind =
  | "study"        // slot 0 — học chuyên môn
  | "speak_write"  // slot 1 — luyện giao tiếp
  | "srs"          // slot 2 — ôn ngoại ngữ
  | "language"     // slot 3 — luyện ngoại ngữ chủ động
  | "journal"      // slot 4 — nhật ký
  | "health";      // slot 5 — thể chất & hồi phục

export interface PlanSlotDTO {
  slot: number;              // 0..5 — thứ tự ưu tiên trong ngày
  domain: Domain;            // thuộc tính của item (P5)
  kind: SlotKind;            // suy ra từ domain + vị trí slot gốc
  action: string;            // tiêu đề
  detail: string;            // mô tả ≤120 ký tự
  minutes: number;           // phút, trong khoảng của slot
  skillId: string | null;
  skillName: string | null;
  done: boolean;
  source: PlanSource;
}

export interface PlanForDate {
  date: string;              // "yyyy-MM-dd"
  items: PlanSlotDTO[];
  doneCount: number;
  totalCount: number;
  source: PlanSource | "mixed";
  weeklyEnergy: WeeklyEnergy;
  streak: number;
}

export interface WeeklyEnergy {
  pct: number;               // 0..100 — làm tròn nguyên
  doneSlots: number;
  totalSlots: number;        // chỉ tính ngày CÓ kế hoạch
  daysWithPlan: number;
  daysInWindow: number;      // luôn 7
}

export interface FocusSkill {
  skill: { id: string; name: string; domain: Domain; level: number; targetLevel: number };
  evidenceCount: number;     // số Evidence (mọi rating) của skill
  strongEvidenceCount: number; // số Evidence rating >= 3
  minutesAccumulated: number;  // tổng Activity.minutes có skillId = skill.id
  criteriaProgressPct: number; // 0..100 — (strongEvidence / EVIDENCE_THRESHOLD) * 100, clamp
}

export interface PlanContext {
  date: string;                          // "yyyy-MM-dd"
  weekday: string;                       // "Thứ Tư"
  skills: Array<{
    id: string; name: string; domain: Domain;
    level: number; targetLevel: number;
    evidenceCount: number; strongEvidenceCount: number;
    parentName: string | null;
  }>;
  dailyState: { mood: number | null; energy: number | null; sleep: number | null; focus: number | null } | null;
  last7Days: Array<{ date: string; doneSlots: number; totalSlots: number; minutes: number }>;
  lockedSlots: PlanSlotDTO[];            // slot done = true → bất biến
  slotContract: {
    slot: number; domain: Domain; kind: SlotKind;
    minMinutes: number; maxMinutes: number; content: string;
  }[];
}

// ── Truy vấn ─────────────────────────────────────────────────────────────────

export async function getPlanForDate(date: Date): Promise<PlanForDate>;
export async function getPlanItems(date: Date): Promise<PlanSlotDTO[]>;
export async function getFocusSkill(date: Date): Promise<FocusSkill | null>;
export async function getPlanContext(date: Date): Promise<PlanContext>;
export async function listPlanDates(limit?: number): Promise<string[]>; // lịch sử theo ngày

// ── Tính toán (thuần, không I/O) ───────────────────────────────────────────

/**
 * Streak = số ngày liên tiếp ( tính tới `today`) có ít nhất 1 Activity.
 * Hôm nay chưa có Activity ⇒ streak đếm từ hôm trước (không reset giữa ngày).
 */
export function computeStreak(activeDates: ReadonlySet<string>, today: string): number;

/**
 * Năng lượng tuần 0..100% = round(100 * doneSlots / totalSlots)
 * totalSlots CHỈ tính ngày có kế hoạch (totalSlots > 0).
 * daysWithPlan = 0 ⇒ pct = 0 nhưng `hasData = false` để UI hiện "—".
 */
export function computeWeeklyEnergy(days: ReadonlyArray<{
  date: string; doneSlots: number; totalSlots: number;
}>): WeeklyEnergy & { hasData: boolean };

/**
 * Merge kế hoạch AI mới vào kế hoạch hiện có.
 * - Slot nào `done = true`  ⇒ GIỮ NGUYEN toàn bộ (action/detail/minutes/skillId/domain/done).
 * - Slot nào `done = false` ⇒ lấy nội dung mới từ `incoming`.
 * - `incoming` thiếu slot ⇒ giữ slot cũ (không xoá).
 * - Không mutate input.
 */
export function mergeRegeneratedPlan(
  existing: ReadonlyArray<PlanSlotDTO>,
  incoming: ReadonlyArray<PlanSlotDTO>,
): { merged: PlanSlotDTO[]; keptDone: number; changedSlots: number };

/** Kiểm bất biến 4 trục: {professional:1, communication:1, language:2, personal:2}. */
export function validateDomainMix(items: ReadonlyArray<{ domain: Domain }>): {
  ok: boolean; counts: Record<Domain, number>; message?: string;
};

/** Suy ra `kind` + khoảng thời lượng hợp lệ từ vị trí slot gốc (0..5). */
export function slotContract(slot: number): {
  slot: number; domain: Domain; kind: SlotKind;
  minMinutes: number; maxMinutes: number; content: string;
};

// ── Ghi dữ liệu ─────────────────────────────────────────────────────────────

/**
 * Đánh dấu 1 slot hoàn thành (FR-DL-03).
 * Idempotent: slot đã done ⇒ trả `alreadyDone: true`, KHÔNG tạo Activity/Evidence lần 2.
 * Tạo Activity + (Evidence nếu có skillId) + update PlanItem.done trong 1 transaction.
 */
export async function completePlanItem(input: {
  date: Date;
  slot: number;
  quality?: number;          // 1..5 → rating của Evidence (mặc định 3)
  minutes?: number;          // mặc định = PlanItem.minutes
  note?: string;
}): Promise<{
  activityId: string | null;
  evidenceId: string | null;
  planItem: PlanSlotDTO | null;
  alreadyDone: boolean;
}>;

/**
 * Duyệt & áp dụng kế hoạch (S02).
 * Trong 1 transaction:
 *   deleteMany({ date, done: false })  → giữ nguyên row done = true
 *   update row done = true nếu nội dung khớp (bất biến)
 *   createMany 6 slot còn lại
 */
export async function applyPlan(input: {
  date: Date;
  items: ReadonlyArray<{
    slot: number; domain: Domain; action: string; detail: string;
    minutes: number; skillId: string | null;
  }>;
  source?: PlanSource;
}): Promise<{ applied: number; keptDone: number; totalMinutes: number }>;
```

**Edge cases:**
- `getPlanForDate` với ngày không có `PlanItem` ⇒ `items: []`, `totalCount: 0`, `weeklyEnergy.hasData = false`.
- `completePlanItem` với slot không tồn tại ⇒ ném `PlanItemNotFoundError` (mapped sang `404`).
- `applyPlan` với `items` thiếu slot ⇒ các slot cũ `done = false` của slot đó **không** bị xoá lại (chỉ xoá rồi tạo đúng số slot trong payload) → validate payload bắt buộc đủ 6.
- `mergeRegeneratedPlan` với `incoming` rỗng ⇒ trả về `existing` nguyên trạng.

---

### 3.2 `src/lib/plan.ts` — bộ sinh offline (AI-01 fallback)

**Route/đường dẫn:** `src/lib/plan.ts` (dùng chung với `ai-foundation`)

**Responsibilities:**
- Sinh **đúng 6 slot** khi không có API key hoặc khi người dùng bấm "Khôi phục Offline Fallback".
- Xoay vòng kỹ năng theo mức thấp nhất (level thấp, ít bằng chứng), ưu tiên domain của slot.
- Tiêu đề lấy từ **tên kỹ năng**; `source = "fallback"`; deterministic theo ngày (không `Math.random()`).

**Interfaces:**

```ts
// src/lib/plan.ts
export interface SkillForPlan {
  id: string;
  name: string;
  domain: Domain;
  level: number;         // 0..5 — thấp = ưu tiên
  evidenceCount: number; // số Evidence rating >= 3
}

export interface FallbackPlanItem {
  slot: number;          // 0..5
  domain: Domain;
  kind: SlotKind;
  action: string;        // tên kỹ năng (hoặc action mặc định)
  detail: string;
  minutes: number;
  skillId: string | null;
  skillName: string | null;
  source: "fallback";
}

/** Danh sách kỹ năng + số bằng chứng, đã lọc domain hợp lệ. */
export async function listSkillsForPlan(): Promise<SkillForPlan[]>;

/**
 * Sinh 6 slot fallback. Cùng đầu vào + cùng ngày ⇒ kết quả giống hệt.
 * offset xoay vòng theo ngày để mỗi ngày không lặp lại y hệt (R-A7 của ai-foundation).
 */
export function generateFallbackPlan(
  skills: SkillForPlan[],
  opts?: { date?: Date },
): FallbackPlanItem[];
```

**Edge cases:**
- Không có kỹ năng nào ⇒ vẫn ra đúng 6 slot dùng action mặc định theo domain.
- Domain `language` chiếm 2 slot (2, 3) ⇒ slot 3 lấy kỹ năng khác slot 2 nhờ offset.
- `source` luôn `"fallback"` ⇒ UI **không** gắn nhãn "AI" cho các item này.

---

### 3.3 `src/app/api/plan/generate/route.ts` — AI-01 (streaming)

**Route/đường dẫn:** `src/app/api/plan/generate/route.ts`

**Responsibilities:**
- Validate body (`date`, `mode`).
- Nếu offline ⇒ phát SSE event `done` với kế hoạch fallback.
- Nếu có key ⇒ gọi `streamAI("AI-01", …)`, phát event `slot` / `usage` / `done` / `error`.
- **Không** ghi `PlanItem` ở route này (duyệt là hành động riêng của người dùng).

> **Hợp đồng với `ai-foundation`:** AI-01 là trường hợp **duy nhất** dùng streaming **kèm** structured output (`AI_ROUTES["AI-01"].structured === true`). Vì vậy `streamAI()` của `ai-foundation` phải nhận thêm field tùy chọn `schema?: z.ZodType<T>` trong `AIRequestOptions` và truyền `output_config.format = zodOutputFormat(schema)` xuống SDK; khi `schema` có mặt thì event `{ type: "json" }` mang **JSON đã parse và validate**, không phải text thô. Nếu `ai-foundation` chưa hỗ trợ, feature này **không** tự gọi SDK (vi phạm FR-AI-02 / R-A5) — phải mở task bổ sung ở `ai-foundation` trước.

**Interfaces:**

```ts
// src/app/api/plan/generate/route.ts
import { z } from "zod";

export const GeneratePlanBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),  // mặc định hôm nay
  mode: z.enum(["generate", "regenerate", "fallback"]).default("generate"),
  /** true = giữ slot đã done; false = sinh mới toàn bộ (vẫn không ghi đè slot done ở tầng server) */
  keepDone: z.boolean().default(true),
});

export type GeneratePlanBody = z.infer<typeof GeneratePlanBodySchema>;

// ── Event SSE ───────────────────────────────────────────────────────────────
export type PlanStreamEvent =
  | { type: "slot"; slot: PlanSlotDTO }
  | { type: "usage"; usage: { inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number; estimatedCost: number; latencyMs: number } }
  | { type: "done"; source: PlanSource; items: PlanSlotDTO[]; keptDone: number }
  | { type: "error"; code: string; message: string };

export async function POST(req: Request): Promise<Response>;
// Response: Content-Type: text/event-stream; charset=utf-8
//   data: {"type":"slot","slot":{...}}\n\n  (mỗi event 1 dòng `data:` + blank line)
```

**Ghi chú streaming:** `streamAI` của `ai-foundation` yield event `{type:"text"|"json"|"usage"}`. Với structured output, phần JSON đến dần; route parse JSON khi đủ → `PlanSchema.safeParse` → nếu hợp lệ thì tách `slots[i]` và phát event `slot` tương ứng. Nếu parse **fail** ⇒ phát event `error` với `code = "schema_invalid"` và **không** ghi DB.

---

### 3.4 `src/app/api/plan/items/route.ts` — sửa & duyệt kế hoạch

**Route/đường dẫn:** `src/app/api/plan/items/route.ts`

**Interfaces:**

```ts
export const PlanItemInputSchema = z.object({
  slot: z.number().int().min(0).max(5),
  domain: z.enum(["professional", "communication", "language", "personal"]),
  action: z.string().min(1).max(160),
  detail: z.string().max(120),
  minutes: z.number().int().min(5).max(90),
  skillId: z.string().nullable(),
});

export const UpdatePlanSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(PlanItemInputSchema).length(6),
  apply: z.boolean().default(false),   // true = ghi vào DB (duyệt)
});

export async function PATCH(req: Request): Promise<Response>;
// → { ok: true, data: { updated, keptDone, totalMinutes } }
// Lỗi: 400 { code: "invalid_slot" | "invalid_domain_mix" | "minutes_out_of_range" | "invalid_date" }
```

---

### 3.5 `src/app/api/plan/[date]/complete/route.ts` — đánh dấu xong

**Route/đường dẫn:** `src/app/api/plan/[date]/complete/route.ts`

**Interfaces:**

```ts
export const CompletePlanSchema = z.object({
  slot: z.number().int().min(0).max(5),
  quality: z.number().int().min(1).max(5).optional(),   // → Evidence.rating (mặc định 3)
  minutes: z.number().int().min(1).max(180).optional(),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ date: string }> }): Promise<Response>;
// → { ok: true, data: { activityId, evidenceId, planItem, alreadyDone } }
// Lỗi: 400 invalid_date | invalid_slot · 404 plan_item_not_found
```

---

### 3.6 `src/components/daily-loop/daily-slot-card.tsx` — card 1 slot (S01)

**Route/đường dẫn:** `src/components/daily-loop/daily-slot-card.tsx`

**Responsibilities:**
- Render 1 slot theo 3 trạng thái: `done` / `priority` (có việc quá hạn) / `default`.
- Nút hành động theo `kind`: "Bắt đầu ôn" / "Luyện tập" / "Viết nhật ký" / "Hoàn thành".
- Gọi `POST /api/plan/[date]/complete` hoặc mở màn hình đích / mở Quick-log.

**Interfaces:**

```tsx
// src/components/daily-loop/daily-slot-card.tsx
"use client";

import type { PlanSlotDTO, SlotKind } from "@/lib/daily-loop";

export type SlotActionKind =
  | { type: "complete" }                        // đánh dấu xong tại chỗ
  | { type: "quicklog" }                        // mở sheet Quick-log
  | { type: "navigate"; href: string };         // mở màn hình đích của slot

export interface DailySlotCardProps {
  item: PlanSlotDTO;
  date: string;                 // "yyyy-MM-dd"
  isToday: boolean;             // false = chế độ xem lại (read-only)
  priority?: boolean;           // slot nổi bật (ví dụ SRS quá hạn)
  badge?: { label: string; kind: "evidence" | "rubric" | "fsrs" | "due"; value?: string };
  /** Điều hướng tới màn hình đích tương ứng với kind của slot */
  resolveTarget: (kind: SlotKind) => SlotActionKind;
  onCompleted?: (item: PlanSlotDTO) => void;
}

export function DailySlotCard(props: DailySlotCardProps): JSX.Element;
```

**Token design (khớp prototype):**

| Phần | Class |
|---|---|
| Nền card | `bg-surface-container rounded-xl p-space-md shadow-sm` (ưu tiên: `bg-surface-container-high shadow-md`) |
| Gạch trái | `absolute left-0 top-0 bottom-0 w-1 bg-primary` (done) · `w-1.5 bg-tertiary` (ưu tiên) · `w-1 bg-outline-variant` (thường) |
| Badge số | `w-7 h-7 rounded-full bg-primary/20 text-primary` (done) · `bg-tertiary/20 text-tertiary` · `bg-surface-container-highest text-on-surface-variant` |
| Chip domain | `bg-surface-container-highest` + màu domain theo bảng §6.3 của spec |
| Tiêu đề done | `font-headline-sm text-on-surface line-through decoration-outline/60 text-outline` |
| Mô tả | `font-body-sm text-body-sm text-on-surface-variant` |
| Nút chính | `bg-tertiary text-on-tertiary font-label-md font-bold` (SRS) · `bg-surface-container-highest text-on-surface hover:bg-surface-variant` (ghost) |
| Nút phụ | `bg-surface-container-low text-on-surface-variant hover:text-on-surface` |

**Edge cases:**
- `isToday === false` ⇒ mọi nút hành động bị disable, hiện "Chỉ đánh dấu được cho hôm nay".
- Bấm "Hoàn thành" 2 lần liên tiếp ⇒ nút bị disable trong lúc request đang chạy; server vẫn idempotent (D-9).
- `item.skillId` không còn tồn tại ⇒ không render chip kỹ năng, không crash.

---

### 3.7 `src/components/daily-loop/quick-log-trigger.tsx` — mở Quick-log (FR-DL-04)

**Route/đường dẫn:** `src/components/daily-loop/quick-log-trigger.tsx`

**Responsibilities:**
- Mở sheet Quick-log **ngay lập tức** (không chờ AI) — P2.
- Truyền context `{ date, slot, domain }` để Quick-log điền sẵn domain và gắn slot.
- Hỗ trợ hotkey `Ctrl/Cmd + K`.

**Interfaces:**

```tsx
// src/components/daily-loop/quick-log-trigger.tsx
"use client";

import type { Domain } from "@/lib/prompts";

export interface QuickLogContext {
  date: string;          // "yyyy-MM-dd"
  slot?: number;         // 0..5 — slot cần đánh dấu xong sau khi ghi
  domain?: Domain;       // domain gợi ý
  minutes?: number;      // thời lượng gợi ý
  skillId?: string | null;
}

/** Được feature `quick-log` export — S01 chỉ gọi, không implement sheet. */
export interface QuickLogBridge {
  open: (ctx: QuickLogContext) => void;
  isAvailable: boolean;
}

export interface QuickLogTriggerProps {
  ctx: QuickLogContext;
  bridge: QuickLogBridge;
  variant?: "primary" | "ghost";
  label?: string;          // mặc định "+ Ghi nhanh (≤10s)"
  children?: React.ReactNode;
}

export function QuickLogTrigger(props: QuickLogTriggerProps): JSX.Element;
```

---

### 3.8 `src/components/daily-loop/replan-modal.tsx` — "Cân chỉnh lại hôm nay" (FR-DL-06)

**Route/đường dẫn:** `src/components/daily-loop/replan-modal.tsx`

**Responsibilities:**
- Hiển thị tóm tắt AI sẽ dùng để sắp xếp lại (năng lượng, số nhiệm vụ đã chốt, số thẻ quá hạn).
- Hiển thị "gợi ý phân bổ lại" (slot + giờ gợi ý) nếu AI trả về.
- 2 hành động: **Giữ nguyên** (đóng) và **Áp dụng lịch trình mới** (gọi AI-01 `mode: "regenerate"`).

**Interfaces:**

```tsx
// src/components/daily-loop/replan-modal.tsx
"use client";

export interface ReplanPreview {
  /** Câu giải thích context dùng cho AI (hiển thị trong modal) */
  rationale: string;
  /** Gợi ý phân bổ lại — không bắt buộc, do AI trả về hoặc do server suy ra */
  suggestions: Array<{ slot: number; time?: string; text: string }>;
  /** Số slot đã done sẽ được giữ nguyên */
  keptDone: number;
}

export interface ReplanModalProps {
  open: boolean;
  date: string;
  preview: ReplanPreview | null;
  busy: boolean;
  onClose: () => void;
  onApply: () => void;      // gọi regenerate
}

export function ReplanModal(props: ReplanModalProps): JSX.Element;
```

---

### 3.9 `src/components/plan/plan-workspace.tsx` — S02 (Client)

**Route/đường dẫn:** `src/components/plan/plan-workspace.tsx`

**Responsibilities:**
- Giữ **bản nháp** 6 slot (state + `localStorage`).
- Đọc SSE `POST /api/plan/generate` và điền dần card.
- Sửa inline (tiêu đề/mô tả/thời lượng/kỹ năng), kéo đổi thứ tự ưu tiên.
- Duyệt kế hoạch (`Ctrl/Cmd + Enter`) ⇒ `PATCH /api/plan/items { apply: true }` ⇒ `router.push("/")`.
- Render 3 khối sidebar: Ràng Buộc Sinh Học · Trọng Tâm Bứt Phá · Chi Phí Phiên Sinh.

**Interfaces:**

```tsx
// src/components/plan/plan-workspace.tsx
"use client";

import type { PlanSlotDTO, WeeklyEnergy, FocusSkill } from "@/lib/daily-loop";

export interface PlanWorkspaceProps {
  date: string;                     // "yyyy-MM-dd"
  initialItems: PlanSlotDTO[];      // kế hoạch đã lưu (có thể rỗng)
  lockedSlots: PlanSlotDTO[];       // slot done = true (bất biến)
  weeklyEnergy: WeeklyEnergy;
  focusSkill: FocusSkill | null;
  bio: { mood: number | null; energy: number | null; sleep: number | null; focus: number | null } | null;
  aiAvailable: boolean;
  lastAiCall: {
    inputTokens: number; outputTokens: number; cacheRead: number;
    estimatedCost: number; latencyMs: number | null;
  } | null;
}

export function PlanWorkspace(props: PlanWorkspaceProps): JSX.Element;
```

**Luồng streaming phía client:**

```ts
// src/components/plan/use-plan-stream.ts
export type PlanStreamStatus =
  | "idle"
  | "streaming"
  | "done"
  | "error";

export interface UsePlanStreamResult {
  status: PlanStreamStatus;
  items: PlanSlotDTO[];              // bản nháp hiện tại (AI đang điền dần)
  usage: { inputTokens: number; outputTokens: number; cacheRead: number; estimatedCost: number; latencyMs: number } | null;
  error: { code: string; message: string } | null;
  generate: (mode: "generate" | "regenerate" | "fallback") => Promise<void>;
  reset: () => void;
}

export function usePlanStream(opts: {
  date: string;
  initialItems: PlanSlotDTO[];
  onDone: (items: PlanSlotDTO[]) => void;
}): UsePlanStreamResult;
```

**Edge cases:**
- Stream lỗi giữa chừng ⇒ giữ các slot đã nhận trong bản nháp, `status = "error"`, hiện nút "Thử lại".
- Khi AI trả về slot `done` không nằm trong `lockedSlots` ⇒ server đã lọc sẵn; client vẫn gọi `mergeRegeneratedPlan` như lớp bảo vệ thứ 2.
- Kéo đổi chỉ trong cùng domain; thả chéo domain ⇒ `onDrop` bị chặn + toast "Chỉ đổi thứ tự được trong cùng trục".
- `Ctrl/Cmd + Enter` khi đang streaming ⇒ bị disable (không duyệt kế hoạch chưa sinh xong).

---

### 3.10 `src/app/page.tsx` — S01 (Server Component)

**Route/đường dẫn:** `src/app/page.tsx`

**Interfaces:**

```tsx
// src/app/page.tsx  (Server Component)
import { getPlanForDate, getFocusSkill } from "@/lib/daily-loop";
import { getDailyState } from "@/lib/personal-state";   // feature personal-state-journal
import { listSrsDueCount } from "@/lib/srs";             // feature srs-language-review

export default async function DailyLoopPage(props: {
  searchParams: Promise<{ date?: string }>;
}): Promise<JSX.Element>;
```

**Responsibilities:**
- Đọc `?date=` (mặc định hôm nay) ⇒ chế độ "xem lại" khi khác hôm nay.
- Đọc song song 5 nguồn dữ liệu (plan, streak/energy, focus skill, daily state, srs queue).
- Render bento 8 + 4, danh sách 6 slot, sidebar.
- Không chứa `onClick` (Server Component không có event handler).

---

### 3.11 `src/app/plan/page.tsx` — S02 (Server Component)

```tsx
// src/app/plan/page.tsx  (Server Component)
export default async function PlanPage(props: {
  searchParams: Promise<{ date?: string }>;
}): Promise<JSX.Element>;
```

- Đọc `?date=`, `getPlanItems`, `getPlanContext` (cho phần context AI), `getLastAiCall("daily_plan")`.
- Render `<PlanWorkspace … />` với `initialItems`, `lockedSlots`, `bio`, `focusSkill`, `weeklyEnergy`, `aiAvailable`.
- Nếu `aiAvailable === false` ⇒ `initialItems` được dựng sẵn từ `generateFallbackPlan()` để S02 **không** trống khi mở offline.

---

## 4. Luồng dữ liệu

### 4.1 Luồng chính — tính streak & năng lượng tuần (FR-DL-05)

```ts
// src/lib/daily-loop.ts
import { prisma } from "@/lib/db";
import { startOfDay, endOfDay, toDateKey, addDays } from "@/lib/dates";

/**
 * Streak = số ngày liên tiếp có ít nhất 1 Activity.
 * Dùng Activity.createdAt (không dùng PlanItem.done) — hành vi thật, không phải checkbox.
 */
export async function getActiveDates(today: Date, lookbackDays = 365): Promise<Set<string>> {
  const from = startOfDay(addDays(today, -lookbackDays));
  const to = endOfDay(today);
  const rows = await prisma.activity.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { createdAt: true },
  });
  return new Set(rows.map((r) => toDateKey(r.createdAt)));
}

export function computeStreak(activeDates: ReadonlySet<string>, today: string): number {
  const cursor = new Date(today + "T00:00:00");      // parse local, không dùng new Date(today) (UTC)
  let streak = 0;
  // Nếu hôm nay chưa có hoạt động → bắt đầu từ hôm qua (không reset giữa ngày).
  if (!activeDates.has(today)) cursor.setDate(cursor.getDate() - 1);
  while (activeDates.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * Năng lượng tuần 0..100% = round(100 * doneSlots / totalSlots) trong 7 ngày gần nhất.
 * totalSlots CHỈ tính ngày CÓ kế hoạch (totalSlots > 0) — ngày trống không kéo tỉ lệ xuống.
 */
export async function computeWeeklyEnergy(today: Date): Promise<WeeklyEnergy & { hasData: boolean }> {
  const from = startOfDay(addDays(today, -6));
  const to = endOfDay(today);
  const rows = await prisma.planItem.groupBy({
    by: ["date"],
    where: { date: { gte: from, lte: to } },
    _count: { _all: true },
    _sum: { done: true },   // Prisma: đếm done = true bằng filter count
  });
  // Prisma không có _sum cho Boolean → dùng 2 query:
  const [total, done] = await Promise.all([
    prisma.planItem.count({ where: { date: { gte: from, lte: to } } }),
    prisma.planItem.count({ where: { date: { gte: from, lte: to }, done: true } }),
  ]);
  const daysWithPlan = rows.length;
  const totalSlots = total;
  const doneSlots = done;
  return {
    pct: totalSlots === 0 ? 0 : Math.round((100 * doneSlots) / totalSlots),
    doneSlots, totalSlots, daysWithPlan, daysInWindow: 7,
    hasData: totalSlots > 0,
  };
}
```

> Ghi chú Prisma: `groupBy._sum` không hỗ trợ `Boolean` ⇒ dùng 2 lệnh `count` (đã chú thích ngay tại chỗ). Query này phục vụ **cả** S01 (năng lượng tuần) và S13 (báo cáo tuần của feature `weekly-progress-report`).

### 4.2 Lưu trữ & truy vấn — đọc kế hoạch ngày

```ts
// src/lib/daily-loop.ts — getPlanItems
export async function getPlanItems(date: Date): Promise<PlanSlotDTO[]> {
  const from = startOfDay(date);
  const to = endOfDay(date);
  const rows = await prisma.planItem.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: { slot: "asc" },
    include: { skill: { select: { id: true, name: true, domain: true } } },
  });
  return rows.map((r) => ({
    slot: r.slot,
    domain: r.domain as Domain,
    kind: slotContract(r.slot).kind,
    action: r.action,
    detail: r.detail ?? "",
    minutes: r.minutes,
    skillId: r.skillId,
    skillName: r.skill?.name ?? null,
    done: r.done,
    source: r.source as PlanSource,
  }));
}
```

```sql
-- Index cần có cho truy vấn theo ngày (SPEC §4 đã có @@index([date]))
SELECT * FROM PlanItem
WHERE date >= '2026-10-29 00:00:00' AND date <= '2026-10-29 23:59:59'
ORDER BY slot ASC;

-- Kiểm bất biến 4 trục trước khi ghi (chạy trong transaction)
SELECT domain, COUNT(*) AS n
FROM PlanItem
WHERE date = '2026-10-29 00:00:00'
GROUP BY domain;
-- kỳ vọng: professional 1 · communication 1 · language 2 · personal 2
```

### 4.3 Lưu trữ & truy vấn — đánh dấu xong (transaction)

```ts
// src/lib/daily-loop.ts — completePlanItem
export async function completePlanItem(input: {
  date: Date; slot: number; quality?: number; minutes?: number; note?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.planItem.findFirst({
      where: { date: { gte: startOfDay(input.date), lte: endOfDay(input.date) }, slot: input.slot },
    });
    if (!item) throw new PlanItemNotFoundError(input.slot);
    if (item.done) {
      // Idempotent — không tạo Activity/Evidence lần 2 (D-9)
      return { activityId: null, evidenceId: null, planItem: toDTO(item), alreadyDone: true };
    }

    const activity = await tx.activity.create({
      data: {
        skillId: item.skillId,
        domain: item.domain,
        type: slotContract(item.slot).kind,   // study | speak_write | srs | language | journal | health
        minutes: input.minutes ?? item.minutes,
        title: item.action,
        content: item.detail,
        quality: input.quality ?? null,
      },
    });

    let evidenceId: string | null = null;
    if (item.skillId) {
      const evidence = await tx.evidence.create({
        data: {
          activityId: activity.id,
          skillId: item.skillId,
          rating: input.quality ?? 3,          // mặc định 3 — ngưỡng EVIDENCE_RATING_MIN
        },
      });
      evidenceId = evidence.id;
    }

    const updated = await tx.planItem.update({
      where: { id: item.id },
      data: { done: true },
    });

    return { activityId: activity.id, evidenceId, planItem: toDTO(updated), alreadyDone: false };
  });
}
```

### 4.4 Lưu trữ & truy vấn — duyệt kế hoạch (giữ slot đã done)

```ts
// src/lib/daily-loop.ts — applyPlan
export async function applyPlan(input: {
  date: Date;
  items: ReadonlyArray<{ slot: number; domain: Domain; action: string; detail: string; minutes: number; skillId: string | null }>;
  source?: PlanSource;
}) {
  // 1) Kiểm bất biến 4 trục TRƯỚC transaction (fail sớm → 400 invalid_domain_mix)
  const mix = validateDomainMix(input.items);
  if (!mix.ok) throw new InvalidDomainMixError(mix.message);

  return prisma.$transaction(async (tx) => {
    const from = startOfDay(input.date);
    const to = endOfDay(input.date);

    // 2) Giữ nguyên các slot đã done — xoá CHỈ row done = false
    const kept = await tx.planItem.findMany({ where: { date: { gte: from, lte: to }, done: true } });
    await tx.planItem.deleteMany({ where: { date: { gte: from, lte: to }, done: false } });

    // 3) Tạo lại 6 slot từ payload, BỎ QUA slot đã done (nội dung bất biến)
    const doneSlots = new Set(kept.map((k) => k.slot));
    const toCreate = input.items
      .filter((i) => !doneSlots.has(i.slot))
      .map((i) => ({
        date: from, slot: i.slot, domain: i.domain, action: i.action,
        detail: i.detail, minutes: i.minutes, skillId: i.skillId,
        done: false, source: input.source ?? "manual",
      }));
    if (toCreate.length > 0) await tx.planItem.createMany({ data: toCreate });

    return {
      applied: toCreate.length,
      keptDone: kept.length,
      totalMinutes: input.items.reduce((s, i) => s + i.minutes, 0),
    };
  });
}
```

### 4.5 Luồng AI-01 — prompt caching shape

**Routing (theo SPEC §5.1, bảng trong `ai-foundation`):**

| Mã | Tính năng | Model | Streaming | Effort | Output | `AiCall.feature` |
|---|---|---|---|---|---|---|
| AI-01 | Sinh kế hoạch ngày (S01, S02) | `claude-opus-5` | Có | `medium` | Structured: 6 slot | `daily_plan` |

**System (cố định, không bao giờ thay đổi):**

```ts
// src/lib/prompts.ts  (feature ai-foundation — sử dụng, không nhân bản)
export const PLAN_SYSTEM_V1 = /* hằng số */;

export const PLAN_SLOT_CONTRACT_V1 = /* hằng số: bảng 6 slot + domain + khoảng thời lượng + luật giữ slot done */;

/** Block cuối của system luôn mang breakpoint cache. */
export function buildPlanSystemBlocks(): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: PLAN_SYSTEM_V1 },
    { type: "text", text: PLAN_SLOT_CONTRACT_V1, cache_control: { type: "ephemeral" } },
  ];
}
```

**Messages (toàn bộ dữ liệu biến động — nằm SAU breakpoint):**

```ts
// src/app/api/plan/generate/route.ts
const ctx = await getPlanContext(date);

const messages: Anthropic.MessageParam[] = [
  {
    role: "user",
    content: [
      `Hôm nay: ${ctx.date} (${ctx.weekday}).`,
      `Sinh trắc: mood=${ctx.dailyState?.mood ?? "?"} energy=${ctx.dailyState?.energy ?? "?"} sleep=${ctx.dailyState?.sleep ?? "?"} focus=${ctx.dailyState?.focus ?? "?"}.`,
      `Cây kỹ năng (mức hiện tại / bằng chứng mạnh):`,
      ...ctx.skills.map((s) => ` - [${s.domain}] ${s.name} (level ${s.level}/${s.targetLevel}, ${s.strongEvidenceCount} bằng chứng mạnh)`),
      `7 ngày gần nhất: ${ctx.last7Days.map((d) => `${d.date} ${d.doneSlots}/${d.totalSlots} slot, ${d.minutes} phút`).join("; ")}`,
      ctx.lockedSlots.length > 0
        ? `CÁC SLOT ĐÃ HOÀN THÀNH — KHÔNG ĐƯỢC ĐỀ XUẤT LẠI, GIỮ NGUYÊN: ${ctx.lockedSlots.map((s) => `slot ${s.slot} [${s.domain}] "${s.action}" (${s.minutes}′)`).join(" | ")}`
        : `Hôm nay chưa có slot nào hoàn thành.`,
      `Sinh đúng 6 slot theo hợp đồng cố định trong system prompt.`,
    ].join("\n"),
  },
];
```

**Quy tắc bắt buộc (SPEC §5.2):**

| # | Quy tắc | Kiểm chứng |
|---|---|---|
| 1 | Thứ tự `tools → system → messages` giữ nguyên. | Test snapshot request. |
| 2 | Mọi nội dung biến động nằm **sau** breakpoint, trong `messages`. | Test quét `PLAN_SYSTEM_V1` + `PLAN_SLOT_CONTRACT_V1` không chứa ngày/tên skill/số liệu sinh trắc/`aiTone`. |
| 3 | Không `Date.now()`/UUID trong system. | Test regex ISO-date, UUID, `Date.now`, `aiTone`. |
| 4 | `usage.cache_read_input_tokens > 0` ở call thứ 2. | Test cache (AC-5). |
| 5 | System prompt đủ dài ngưỡng cache của `claude-opus-5` (512 token). | Preflight `messages.countTokens`. |

**Shape structured output (từ `ai-foundation`):**

```ts
// src/lib/prompts.ts
export const PlanSchema = z.object({
  slots: z.array(z.object({
    slot: z.number().int().min(0).max(5),
    domain: z.enum(["professional", "communication", "language", "personal"]),
    action: z.string().min(1).max(160),
    detail: z.string().max(120),
    minutes: z.number().int().min(5).max(90),
    skillName: z.string().nullable(),
  })).length(6),
}).superRefine((v, ctx) => {
  // (a) mỗi slot 0..5 đúng một lần
  const seen = new Set<number>();
  v.slots.forEach((s, i) => {
    if (seen.has(s.slot)) ctx.addIssue({ code: "custom", path: ["slots", i, "slot"], message: "slot trùng" });
    seen.add(s.slot);
    // (b) domain khớp vị trí (AI không được kéo đổi)
    if (s.domain !== SLOT_DOMAINS[s.slot]) {
      ctx.addIssue({ code: "custom", path: ["slots", i, "domain"], message: `domain phải là ${SLOT_DOMAINS[s.slot]}` });
    }
    // (c) minutes trong khoảng của slot
    const c = slotContract(s.slot);
    if (s.minutes < c.minMinutes || s.minutes > c.maxMinutes) {
      ctx.addIssue({ code: "custom", path: ["slots", i, "minutes"], message: `minutes phải trong [${c.minMinutes}, ${c.maxMinutes}]` });
    }
  });
  if (seen.size !== SLOT_COUNT) ctx.addIssue({ code: "custom", path: ["slots"], message: "phải có đủ slot 0..5" });
});
```

### 4.6 Luồng AI-01 — cách "giữ slot đã done" khi regenerate

Có **3 lớp bảo vệ** (defence in depth):

```
Lớp 1 — PROMPT (AI-01):
  messages chứa "CÁC SLOT ĐÃ HOÀN THÀNH — KHÔNG ĐƯỢC ĐỀ XUẤT LẠI" + danh sách slot done.

Lớp 2 — SERVER MERGE (mergeRegeneratedPlan):
  incoming: PlanSlotDTO[] (6 slot từ AI)
  existing: PlanSlotDTO[] (kế hoạch đang có trong DB)
  →
    const doneSlots = existing.filter(e => e.done);
    const incomingBySlot = new Map(incoming.map(i => [i.slot, i]));
    const merged = existing.map(e =>
      e.done
        ? e                                            // GIỮ NGUYÊN 100%
        : (incomingBySlot.get(e.slot) ?? e)            // slot chưa done → lấy nội dung mới
    );
    // Slot mới (chưa có trong existing) → thêm vào, sort theo slot
    return { merged, keptDone: doneSlots.length, changedSlots: ... };

Lớp 3 — GHI DB (applyPlan):
  deleteMany({ date, done: false })   ← chỉ xoá row chưa done
  createMany(...)                     ← không chạm row done
```

> Vì `slot` là **thứ tự ưu tiên** (D-1), khi AI sinh lại, slot `done` vẫn giữ **vị trí `slot`** cũ. Người dùng có thể kéo đổi thứ tự ưu tiên ở S02, nhưng các slot `done` sẽ bị khoá (disabled) trong UI nên không thể bị dịch chuyển ngoài ý muốn.

### 4.7 Luồng fallback offline

```
POST /api/plan/generate { mode: "generate" | "regenerate" | "fallback" }
   │
   ├── mode === "fallback"  ──► generateFallbackPlan(listSkillsForPlan(), { date })  ──► event "done" { source: "fallback" }
   │
   ├── !isAiAvailable()     ──► generateFallbackPlan(...)                          ──► event "done" { source: "fallback" }
   │                           (không gọi network; banner "Đang dùng kế hoạch offline")
   │
   └── có key                ──► streamAI("AI-01", …)
                               └─ lỗi AiConnectionError ⇒ KHÔNG tự fallback im lặng:
                                  event "error" { code: "connection_failed" }
                                  + client hiện nút "Dùng kế hoạch offline" (gọi lại mode:"fallback")
```

> Quyết định: **không** tự động thay bằng fallback khi AI lỗi mạng — người dùng phải bấm "Dùng kế hoạch offline" (minh bạch, tránh tưởng AI đã sinh). Tuy nhiên S01 (FR-DL-07c) **có** hiển thị fallback kèm banner để không bao giờ trắng trang; đó là hành vi được SPEC §3.2 S01 yêu cầu.

## 5. Xử lý lỗi

| Tình huống | Phát hiện | Xử lý | Thông báo người dùng |
|---|---|---|---|
| Chưa có kế hoạch hôm nay | `items.length === 0` | Render empty state + CTA | "Chưa có kế hoạch hôm nay" + nút "Lập kế hoạch hôm nay" |
| Thiếu `ANTHROPIC_API_KEY` | `isAiAvailable() === false` | `generateFallbackPlan()`; `source = "fallback"` | Banner "Đang dùng kế hoạch offline — thêm API key để AI tối ưu thời lượng" |
| Key sai / hết hạn (401) | `AiAuthError` | `AiCall{ok:false}`; event `error` | "API key không hợp lệ hoặc đã hết hạn." + CTA mở S15 |
| 429 rate limit | `AiRateLimitError` | event `error`; không retry vô hạn | "Đang bị giới hạn tốc độ, thử lại sau {n}s." + "Thử lại" |
| `stop_reason: "refusal"` | `AiRefusalError` (kiểm **trước** khi đọc `content`) | event `error`; không ghi DB | "AI không thể xử lý nội dung này." + "Thử lại" |
| Schema sai (thiếu slot / sai domain / sai minutes) | `PlanSchema.safeParse` fail | `AiSchemaError`; event `error` `code:"schema_invalid"`; **không** ghi DB | "AI trả về dữ liệu không đúng cấu trúc. Đã ghi nhận lỗi." + "Thử lại" |
| Timeout | `AiTimeoutError` | event `error` | "AI phản hồi quá lâu. Vui lòng thử lại." + "Thử lại" |
| Mất mạng | `AiConnectionError` | event `error`; nút "Dùng kế hoạch offline" | "Không kết nối được máy chủ AI." + "Dùng kế hoạch offline" |
| Stream bị ngắt giữa chừng | exception trong `for await` | `AiCall{ok:false, error:"stream_interrupted"}`; giữ slot đã nhận trong bản nháp; **không** ghi DB | "Kết nối bị ngắt giữa chừng." + "Thử lại" |
| `max_tokens` | `AiMaxTokensError` | event `error` | "Phản hồi bị cắt cụt, hãy thử lại." |
| Vi phạm bất biến 4 trục khi duyệt | `validateDomainMix` | 400, **không** ghi | "Kế hoạch phải giữ đúng 4 trục: 1 Chuyên môn · 1 Giao tiếp · 2 Ngoại ngữ · 2 Cá nhân." |
| Bấm "Xong" 2 lần | `PlanItem.done === true` | Trả `alreadyDone: true`, không tạo Activity lần 2 | Toast "Slot này đã hoàn thành." |
| Slot không tồn tại | `PlanItemNotFoundError` | 404 | "Không tìm thấy hành động này trong kế hoạch." |
| Skill bị xoá giữa ngày | `skillId` không resolve | `skillName = null` | Không render chip kỹ năng; không crash |
| Lỗi ghi `AiCall` (DB bận) | exception Prisma | try/catch riêng trong wrapper ( của `ai-foundation`) | Không ảnh hưởng người dùng |
| `cache_read_input_tokens = 0` ở call thứ 2 | usage | **Silent invalidator** — phải sửa: dữ liệu biến động lọt vào `system`? `effort` đổi? system prompt ngắn hơn ngưỡng? | Không có thông báo UI — phát hiện bằng test tự động |

## 6. Chiến lược kiểm thử

| Tầng | Công cụ | Phạm vi |
|---|---|---|
| **Unit** | Vitest | `computeStreak` (hôm nay chưa làm, ngày trống giữa chuỗi, chuỗi 1 ngày) · `computeWeeklyEnergy` (mẫu số loại ngày không có kế hoạch, làm tròn) · `mergeRegeneratedPlan` (giữ slot done, thêm slot mới, không mutate input) · `validateDomainMix` (đủ 4 trục / thiếu / thừa) · `slotContract` (khoảng minutes từng slot) · `PlanSchema` (thiếu slot, trùng slot, sai domain, sai minutes) · `generateFallbackPlan` (6 slot, deterministic, 2 ngày khác nhau) |
| **Integration** | Vitest + SQLite test DB | `completePlanItem` tạo Activity + Evidence + update PlanItem trong 1 transaction; idempotent khi bấm 2 lần; `applyPlan` giữ row `done = true` và không nhân bản khi gọi 2 lần; `getPlanForDate` trả đúng `doneCount`/`totalCount` |
| **API / Contract** | Vitest + supertest | `POST /api/plan/generate` trả SSE đúng thứ tự event (`slot` → `usage` → `done`); offline trả `done` với `source:"fallback"`; lỗi trả event `error` với mã typed; `PATCH /api/plan/items` 400 khi vi phạm bất biến; `POST /api/plan/[date]/complete` 404 khi slot không tồn tại |
| **E2E** | Playwright | AC-1 (CTA khi chưa có plan; bấm Xong tạo bằng chứng, streak tăng) · AC-DL-3 (sinh lại giữ slot done) · AC-DL-5 (offline vẫn sinh 6 slot) · AC-DL-7 (duyệt kế hoạch 2 lần không nhân bản) · điều hướng S01↔S02 |
| **A11y & responsive** | axe-core + Playwright | 390px không tràn ngang; focus ring `focus-visible:ring-primary`; `aria-live="polite"` trên vùng stream; icon-only button có `aria-label`; tương phản ≥ WCAG AA |
| **Tiêu chí nghiệm thu** | Playwright + script kiểm cache | AC-DL-2 (AI sai số slot ⇒ không ghi DB) · AC-DL-4 (79% khớp query) · AC-DL-6 (refusal không crash) · AC-DL-8 (lịch sử theo ngày) · AC-DL-10 (`cache_read_input_tokens > 0` ở call thứ 2) |

## 7. Rủi ro & đánh đổi kỹ thuật

| # | Rủi ro | Tác động | Giảm thiểu |
|---|---|---|---|
| T-1 | **`slot` vừa là vị trí vừa là thứ tự ưu tiên** → dữ liệu mơ hồ khi kéo đổi, dễ sinh bug ở tầng query. | Cao | Quyết định D-1: `slot` = thứ tự ưu tiên, `domain` = thuộc tính item. Bất biến kiểm = **tập domain**. Mọi nơi đọc `slot` đều dùng `slotContract(slot)` cho `kind`. UI khoá slot `done` nên không kéo được. |
| T-2 | **Race condition khi bấm "Xong" 2 lần song song** → 2 `Activity` cho 1 slot → `Skill.level` tăng oan. | Cao | `completePlanItem` chạy trong `prisma.$transaction` với guard `item.done`; thêm ràng buộc ứng dụng "1 `Activity` mỗi slot/ngày" và test concurrency (2 request song song ⇒ 1 Activity). |
| T-3 | **Streaming SSE + Next.js App Router**: route handler phải trả `Response` có `ReadableStream`; không được dùng `NextResponse` helper của Server Actions. | Trung bình | Route dùng `new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } })`; client đọc bằng `response.body.getReader()` + `TextDecoder`; tách event theo `\n\n`. |
| T-4 | **SSE qua reverse proxy/production** có thể bị nén hoặc buffer → client không nhận chunk tới. | Trung bình | Header `X-Accel-Buffering: no`; flush bằng `controller.enqueue` từng event (không gom cả batch); fallback: nếu stream không nhận event nào sau 20s ⇒ hỏi lại bằng `POST` không stream (structured output) để không treo UI. |
| T-5 | **`localStorage` bản nháp có thể lệch với DB** (người dùng duyệt ở tab khác). | Thấp | Khi mở S02, `initialItems` (từ DB) là nguồn chân lý; bản nháp `localStorage` chỉ dùng để **khôi phục chỉnh sửa chưa duyệt** khi DB chưa có kế hoạch hoặc chỉnh sửa sau thời điểm tải trang; có nút bỏ bản nháp. |
| T-6 | **`computeWeeklyEnergy` gọi 2 query `count` mỗi lần S01 render** → chậm. | Trung bình | Gộp vào 1 `groupBy` trên `date` với `where: { date: { gte, lte } }` và đếm `done` bằng `groupBy` theo `date` + `done` (2 nhóm) — 1 query duy nhất. Index `@@index([date])` đã có trong SPEC §4. |
| T-7 | **AI-01 tốn token vì `skills` quá nhiều** (cây kỹ năng lớn). | Trung bình | Chỉ gửi node lá + node có `level > 0` hoặc `evidenceCount > 0`, tối đa 40 kỹ năng; sắp xếp theo ưu tiên (level thấp, ít bằng chứng) để phần bị cắt là phần ít quan trọng nhất. |
| T-8 | **Ràng buộc "6 slot" mâu thuẫn với `khoảng thời lượng`** khi tổng vượt 150′. | Trung bình | `slotContract` giữ khoảng cố định; UI cảnh báo "Tổng cam kết {n} phút — khuyến nghị 90–150′"; **không** tự cắt bừa (người dùng đã chỉnh tay). Server clamp chỉ khi vượt khoảng slot, không tự cân bằng tổng. |
| T-9 | **`revalidatePath("/")` sau mỗi đánh dấu xong** → render lại toàn bộ S01, có thể nháy UI và tốn ~500ms. | Thấp | `revalidatePath("/")` chạy server-side sau ghi DB; client dùng `router.refresh()` kèm `useTransition` để hiện trạng thái đang cập nhật thay vì nháy. Slot card cập nhật optimistic (đổi sang trạng thái done ngay, rollback nếu API lỗi). |
| T-10 | **Offline mode vẫn gọi `POST /api/plan/generate`** (route cần key?) | Trung bình | Route tự kiểm `isAiAvailable()` **trong handler** và trả fallback — client không cần biết trước; nhưng client vẫn dùng `aiAvailable` để ẩn nút AI và hiện nút "Khôi phục Offline Fallback". |
| T-11 | **Thêm `@@index([date, done])` cho `PlanItem`** ngoài SPEC §4 → lệch schema gốc. | Thấp | Index `(date)` đã đủ cho truy vấn theo ngày. Nếu đo thấy query chậm (>50ms) thì đề xuất thêm index trong feature khác, có ghi chú migration. |
| T-12 | **Sinh trắc hôm nay chưa có** (user chưa làm S12) ⇒ AI sinh kế hoạch "mù". | Trung bình | `dailyState = null` ⇒ prompt nói rõ "chưa có dữ liệu sinh trắc, dùng mặc định trung bình"; UI S02 hiện "Chưa có dữ liệu sinh trắc hôm nay" ở khối Ràng Buộc Sinh Học thay vì số 0 giả. |
