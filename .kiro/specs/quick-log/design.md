# Design — Quick-log (Ghi nhận 10 giây)

## 1. Tổng quan kiến trúc

Quick-log là **đường ghi duy nhất** của ứng dụng: cả ghi tay trong sheet `/log`, cả lịch sử `/log/history`, cả nút "Xong" ở S01 đều kết thúc ở một hàm nghiệp vụ duy nhất — `createLogEntry()` trong `src/lib/log.ts`. Hàm này chạy trong **một `prisma.$transaction`** nên không tồn tại trạng thái nửa vời "đã tick Xong nhưng chưa có bằng chứng".

Kiến trúc chia làm 3 tầng rõ rệt:

1. **Tầng ghi (không AI, luôn hoạt động):** `POST /api/log` → `src/lib/log.ts` → Prisma. Đây là đường chính của AC-2.
2. **Tầng phân loại (AI, chạy nền, luôn có fallback):** `POST /api/log/autofill` → AI-02 (`claude-haiku-4-5`) **hoặc** `src/lib/log-classify.ts` (rule cục bộ). Không tầng nào phụ thuộc kết quả của tầng này để ghi.
3. **Tầng đọc & sửa:** `GET /api/log/history`, `PATCH|DELETE /api/log/[id]` → `src/lib/log.ts` (query + `recomputeSkillLevel()`).

```
┌────────────────────────────────────────────────────────────────────────────┐
│ S01 Daily Loop (Server Component)                                           │
│   ├─ nút "+ Ghi nhanh (≤10s)" ──► mở sheet (client state, KHÔNG fetch)    │
│   └─ nút "Xong" trên PlanItem ──► POST /api/log { planItemId } ──┐          │
│                                                              │          │
│ S05 /log  (Client Component — sheet)                         │          │
│   ├─ preset chips  [1..6]                                    │          │
│   ├─ input mô tả tự do ──debounce 450ms──► POST /api/log/autofill ─┐     │
│   └─ nút "⚡ Ghi nhanh ngay (Enter)" ──► POST /api/log ─────────┐  │     │
│                                                               │  │     │
│ S05 /log/history (Server Component + Client filter)           │  │     │
│   └─ GET /api/log/history ?date&domain ─► PATCH/DELETE /api/log/[id]       │
│                                                               │  │     │
└───────────────────────────────────────────────────────────────┼──┼─────┘
                                                                │  │
                    ┌───────────────────────────────────────────┘  │
                    ▼                                              ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ TẦNG GHI (không AI)          src/lib/log.ts                                │
│   createLogEntry(input)  ──► prisma.$transaction:                          │
│     1. create Activity { domain, type, minutes, title, content, quality }  │
│     2. nếu skillId hợp lệ → create Evidence { rating = quality }           │
│     3. nếu planItemId → update PlanItem { done: true }                    │
│     4. recomputeSkillLevel(skillId) → levelUp { from, to }                │
│   updateLogEntry(id, patch) / deleteLogEntry(id)  ──► cùng transaction    │
├────────────────────────────────────────────────────────────────────────────┤
│ TẦNG PHÂN LOẠI (nền, có fallback)  src/lib/log-classify.ts                 │
│   classifyLocally(text, skills) → { domain, skillId, minutes, difficulty }  │
│   AI-02 claude-haiku-4-5 (callAIJson, structured) ──► nếu hợp lệ thì dùng   │
│   nếu lỗi / domain sai / skill sai / offline ──► classifyLocally()         │
└────────────────────────────────────────────────────────────────────────────┘
```

**Bất biến kiến trúc (bất định hành kỹ thuật):**

- `POST /api/log` **không** gọi AI. Không có nhánh nào trong đường ghi chạm tới Anthropic API.
- `POST /api/log/autofill` **không** ghi vào DB. Nó là hàm thuần (read-only) trả về gợi ý.
- Không có state server-side cho sheet: sheet là Client Component với `useReducer`.

## 2. Kiến trúc

### 2.1 Sơ đồ luồng — mở sheet & ghi nhanh (đường chính của AC-2)

```
Người dùng bấm "+ Ghi nhanh (≤10s)" ở S01
   │
   │  ── KHÔNG fetch, KHÔNG chờ AI ──►  setSheetState({ open: true, step: 1 })
   │                                     sheet render ngay ở frame sau
   ▼
┌─────────────────────────────────────────────────────────────┐
│ SHEET /log — state: { open, step, description, preset,      │
│            autofill: {status, source, data}, saving }       │
└─────────────────────────────────────────────────────────────┘
   │
   │ người dùng gõ (≥3 ký tự)
   ├─► useEffect debounce 450 ms
   │      └─► AbortController huỷ request cũ
   │          └─► POST /api/log/autofill { text }
   │                ├─ AI-02 OK & hợp lệ ──► source="ai"
   │                └─ lỗi/offline/sai domain ──► classifyLocally() ──► source="rule"
   │                     (kết quả chỉ điền vào panel Bước 2 — KHÔNG chặn nút ghi)
   ▼
người dùng bấm "⚡ Ghi nhanh ngay (Enter)"
   │
   ├─ guard: description.trim().length < 3 ──► hiện lỗi nhẹ, dừng
   ├─ guard: state.saving === true ──► return (chống Enter lặp)
   ├─ setSaving(true) ; disable nút ; input readOnly
   │
   ├─► POST /api/log { title, domain, type, minutes, difficulty, skillId, note }
   │      │
   │      ├─► createLogEntry() — transaction:
   │      │      Activity ──► Evidence (nếu skillId) ──► PlanItem.done (nếu planItemId)
   │      │      └─► recomputeSkillLevel() ──► levelUp { from, to }
   │      │
   │      └─► response { activityId, evidenceId, levelUp, deduped, serverMs }
   │
   ├─ server lỗi ──► toast lỗi + giữ form + setSaving(false)
   └─ server OK ──► toast "Đã ghi" (3,2 s) → đóng sheet → router.refresh() lịch sử
```

### 2.2 Sơ đồ luồng — FR-DL-03 ("Xong" trên PlanItem ở S01)

```
S01: bấm "Xong" trên slot i (PlanItem.id, action, minutes, skillId)
   │
   ├─ guard: PlanItem.done === true ──► return (nút đã ở trạng thái done)
   │
   └─► POST /api/log {
         title: planItem.action,
         domain: planItem.domain,
         type: mapTypeFromDomain(planItem.domain),   // deterministic, không gọi AI
         minutes: planItem.minutes,
         difficulty: DEFAULT_DIFFICULTY,              // 3 — người dùng chưa kịp chọn
         skillId: planItem.skillId ?? null,
         planItemId: planItem.id,
         clientRequestId: `${planItem.id}:done`
       }
          │
          └─► prisma.$transaction([
                 create Activity { skillId, domain, type, minutes, title, quality: 3 },
                 create Evidence { skillId, rating: 3 }   (nếu skillId ≠ null),
                 update PlanItem { id, done: true },
             ])
          └─► recomputeSkillLevel(skillId)
          └─► response { activityId, evidenceId, levelUp }
                 │
                 └─► S01 re-render slot ở trạng thái "đã xong" + badge "Bằng chứng +1"
```

> `clientRequestId` cố định theo `planItem.id` ⇒ bấm "Xong" 2 lần (hoặc double-click) chỉ tạo 1 `Activity` (AC-QL-6 + AC-QL-4).

### 2.3 Sơ đồ luồng — sửa / xoá lịch sử

```
/log/history: bấm "Sửa" trên item
   │
   ├─► mở modal sửa (Client) — nạp giá trị hiện tại của Activity + Evidence
   ├─► PATCH /api/log/[id] { title?, domain?, type?, minutes?, difficulty?, skillId?, note? }
   │      └─► transaction:
   │            update Activity
   │            nếu skillId đổi  → delete Evidence cũ + create Evidence mới (rating mới)
   │            nếu skillId giữ nguyên → update Evidence.rating + Activity.quality
   │            recomputeSkillLevel(cũ) ; recomputeSkillLevel(mới)
   └─► refresh danh sách

/log/history: bấm "Xoá" trên item
   │
   ├─► hộp xác nhận ("Xoá hoạt động này? Bằng chứng cũng sẽ bị xoá.")
   └─► DELETE /api/log/[id]
          └─► transaction:
                lấy skillId của Activity (trước khi xoá)
                delete Activity        ──► onDelete: Cascade xoá Evidence
                recomputeSkillLevel(skillId)
```

### 2.4 Phân tầng

| Tầng | Module | Trách nhiệm |
|---|---|---|
| Route (ghi) | `src/app/api/log/route.ts` | `POST` — validate Zod, chống trùng, gọi `createLogEntry()` |
| Route (AI) | `src/app/api/log/autofill/route.ts` | `POST` — AI-02 hoặc rule cục bộ; **luôn trả 200** khi có kết quả |
| Route (đọc) | `src/app/api/log/history/route.ts` | `GET` — lịch sử theo ngày + bộ lọc domain |
| Route (sửa/xoá) | `src/app/api/log/[id]/route.ts` | `PATCH` / `DELETE` — sửa 1 mục, xoá 1 mục, tính lại level |
| UI (sheet) | `src/app/log/page.tsx` + `src/components/quick-log/quick-log-sheet.tsx` | Client Component: state machine của sheet, preset, input, panel Bước 2 |
| UI (lịch sử) | `src/app/log/history/page.tsx` + `src/components/quick-log/log-history.tsx` | Server Component render danh sách + Client filter/modal sửa |
| UI (nhúng S01) | `src/components/quick-log/quick-log-launcher.tsx` | Nút mở sheet từ S01 + nút "Xong" gọi `POST /api/log` |
| Nghiệp vụ | `src/lib/log.ts` | `createLogEntry`, `updateLogEntry`, `deleteLogEntry`, `listLogHistory`, `recomputeSkillLevel`, `mapTypeFromDomain` |
| Nghiệp vụ (offline) | `src/lib/log-classify.ts` | `classifyLocally(text, skills)` — rule cục bộ deterministic |
| AI | `src/lib/prompts.ts` | `QUICK_LOG_SYSTEM`, `QUICK_LOG_RUBRIC`, `QuickLogAutofillSchema` (Zod) |
| AI | `src/lib/anthropic.ts` | `callAIJson("AI-02", QuickLogAutofillSchema, …)` — không streaming, effort `low` |
| Dữ liệu | `src/lib/dates.ts` | Chuẩn hoá ngày 00:00 local, so sánh ngày bằng chuỗi `yyyy-MM-dd` |
| Config | `src/lib/config.ts` | `QUICK_LOG_MAX_SECONDS = 10`, `EVIDENCE_RATING_MIN = 3`, `EVIDENCE_THRESHOLD = 3`, `SKILL_LEVEL_MAX = 5` |

### 2.5 Quyết định thiết kế

| # | Quyết định | Lý do | Hệ quả |
|---|---|---|---|
| D1 | `POST /api/log` **không bao giờ** gọi AI | P2 + AC-2: đường ghi không được có điểm chờ | API ghi có độ trễ ổn định ~50–300 ms; AI chỉ là gợi ý trước đó |
| D2 | Sheet là **Client Component có state machine**, không phải route điều hướng | Mở sheet phải tức thì; điều hướng `/log` sẽ mất ~100–300 ms và mất focus | `/log` vẫn tồn tại như route độc lập (deep-link) nhưng S01 mở sheet **in-place** |
| D3 | Lưu `difficulty` vào **`Activity.quality`** (1–4) và dùng luôn giá trị đó làm `Evidence.rating` | Schema `Activity.quality` là 1–5 nhưng `Evidence.rating` là 1–4; cần 1 nguồn sự thật | Giá trị 1–4 lưu được nguyên trong cả 2 bảng; server clamp `quality ∈ [1,4]` |
| D4 | Rule cục bộ nằm ở **`src/lib/log-classify.ts`** (file riêng), không nhét vào `src/lib/plan.ts` | `plan.ts` là fallback của AI-01 (sinh kế hoạch); quick-log là AI-02, khác miền | Không đụng `plan.ts` đang được feature khác dùng; test tách biệt |
| D5 | Dedupe 3 tầng: `clientRequestId` (@@unique) → `planItemId` (@@unique) → `(title, domain, minutes)` trong cửa sổ **30 giây** | Hàng rào cuối chống Enter lặp (AC-QL-4); client khoá nút là hàng rào đầu | 2 cột unique trên `Activity` (không cần bảng idempotency riêng); khoá mềm bắt trường hợp client gửi `clientRequestId` khác nhau |
| D6 | `POST /api/log/autofill` **luôn trả 200** có `source:"ai"\|"rule"` | Người dùng không cần biết AI lỗi; UI chỉ hiện badge nguồn | Không có nhánh lỗi trong UI ghi; đơn giản hoá luồng P2 |
| D7 | Autofill **debounce 450 ms** + `AbortController` | Gõ liên tục sẽ gọi AI nhiều lần vô ích (tiền + `AiCall` rác) | ≤1 request/450 ms; request cũ bị huỷ |
| D8 | Panel Bước 2 **luôn hiện** (kể cả chưa có kết quả AI) với skeleton | Người dùng thấy "bước 2 là gì" ngay, không phải đợi AI rồi mới hiện khung | Không có layout shift khi AI trả về |
| D9 | Mức độ khó = 1 ngôi sao…4 ngôi sao, **không** phải 1–5 | `Evidence.rating` là 1–4; thang 5 sẽ vượt schema | Chọn được 4 mức, hiển thị "Mức 3/4" |
| D10 | "AI Tóm tắt & Rút kinh nghiệm" (tạo `Reflection`) **không implement ở Phase 0** | `Reflection` + AI-05 thuộc feature `personal-state-journal` (Phase 0 nhưng khác scope) | Nút bị ẩn ở Phase 0 thay vì hiện rồi báo lỗi; đã ghi chú trong FR-QL-15 |
| D11 | `POST /api/log` nhận `planItemId` để hợp nhất đường ghi | FR-DL-03 nằm trong scope quick-log theo yêu cầu; 2 đường ghi riêng dễ lệch | `PlanItem.done` + `Activity` + `Evidence` cùng transaction |
| D12 | `type` do **preset / rule cục bộ / domain** quyết định, **không** do AI trả | AI-02 chỉ trả 4 trường theo SPEC §5.1; `type` phải deterministic | Schema AI đúng `{domain, skillId, minutes, difficulty}` — không thừa field |
| D13 | Sửa/xoá lịch sử dùng `PATCH|DELETE /api/log/[id]` (RESTful) khớp yêu cầu đề bài | Ràng buộc hợp đồng API | `api/log/route.ts` (POST) và `api/log/[id]/route.ts` (PATCH/DELETE) là 2 file khác nhau |

## 3. Thành phần

### 3.1 `src/lib/log.ts` — lớp nghiệp vụ ghi (trung tâm)

**Responsibilities:**
- Tạo / sửa / xoá `Activity` + `Evidence` trong **một transaction**.
- Tính lại `Skill.level` theo ngưỡng `EVIDENCE_THRESHOLD` / `EVIDENCE_RATING_MIN`.
- Chống ghi trùng theo cửa sổ 30 giây.
- Ánh xạ domain → `Activity.type` một cách deterministic.

**Interfaces:**

```ts
// src/lib/types.ts — kiểu + helper dùng chung giữa lib, route và component
import { z } from "zod";

export const DOMAIN_KEYS = ["professional", "communication", "language", "personal"] as const;
export type DomainKey = (typeof DOMAIN_KEYS)[number];
export const DomainKeySchema = z.enum(DOMAIN_KEYS);

export const ACTIVITY_TYPES = [
  "study", "write", "speak", "roleplay", "srs", "journal", "health", "custom",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export const ActivityTypeSchema = z.enum(ACTIVITY_TYPES);

export function clampMinutes(raw: number): number;      // [1, 240]
export function clampDifficulty(raw: number): number;  // [1, 4]
```

```ts
// src/lib/log.ts
import type { DomainKey, ActivityType, LogEntryInput, LogEntryResult } from "./types";
import { clampMinutes, clampDifficulty } from "./types";

export interface LogEntryInput {
  title: string;
  domain: DomainKey;
  type?: ActivityType;              // mặc định mapTypeFromDomain(domain)
  minutes: number;
  difficulty: number;               // 1..4
  skillId?: string | null;
  note?: string | null;
  planItemId?: string | null;
  clientRequestId?: string | null;  // khoá idempotency tuyệt đối (lưu vào Activity.clientRequestId)
}

export interface LogEntryResult {
  activityId: string;
  evidenceId: string | null;
  deduped: boolean;                 // true = trả về bản ghi đã có, không tạo mới
  levelUp: { skillId: string; from: number; to: number } | null;
  serverMs: number;
}

export interface LevelChange {
  skillId: string;
  from: number;
  to: number;
}

export const DEDUPE_WINDOW_MS = 30_000;
export const DEFAULT_DIFFICULTY = 3;

/** Lỗi typed: hoạt động không tồn tại → route trả 404. */
export class LogNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Activity not found: ${id}`);
    this.name = "LogNotFoundError";
  }
}

/** Kiểm tra mã lỗi Prisma để map sang HTTP status. */
export function isPrismaError(err: unknown, code: string): boolean;
export function isPrismaError(err: unknown, code?: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  const candidate = err as { code?: unknown };
  if (typeof candidate.code !== "string") return false;
  return code === undefined ? true : candidate.code === code;
}

export function mapTypeFromDomain(domain: DomainKey): ActivityType;
export function normalizeTitle(raw: string): string;          // trim + cắt 200 ký tự

export async function createLogEntry(input: LogEntryInput): Promise<LogEntryResult>;
export async function updateLogEntry(
  id: string,
  patch: Partial<LogEntryInput>,
): Promise<LogEntryResult & { skillChanged: boolean }>;
export async function deleteLogEntry(
  id: string,
): Promise<{ deleted: true; skillId: string | null; levelBefore: number; levelAfter: number }>;

export async function listLogHistory(params: {
  date: string;                     // "yyyy-MM-dd" local
  domain: DomainKey | "all";
  limit?: number;                   // mặc định 50
  offset?: number;                  // mặc định 0
}): Promise<{
  date: string;
  count: number;
  items: Array<{
    id: string;
    title: string;
    domain: DomainKey;
    type: ActivityType;
    minutes: number;
    difficulty: number | null;      // = Evidence.rating nếu có
    note: string | null;
    skillId: string | null;
    skillName: string | null;
    skillLevel: number | null;
    evidenceId: string | null;
    createdAt: string;              // ISO
  }>;
}>;

export async function recomputeSkillLevel(skillId: string): Promise<LevelChange | null>;
```

**`recomputeSkillLevel` — nguồn sự thật duy nhất cho `Skill.level`:**

```ts
export async function recomputeSkillLevel(skillId: string): Promise<LevelChange | null> {
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    select: { id: true, level: true },
  });
  if (!skill) return null;

  const goodEvidence = await prisma.evidence.count({
    where: { skillId, rating: { gte: EVIDENCE_RATING_MIN } },  // 3
  });

  const target = Math.min(
    Math.floor(goodEvidence / EVIDENCE_THRESHOLD),             // 3
    SKILL_LEVEL_MAX,                                           // 5
  );

  if (target === skill.level) return null;

  const updated = await prisma.skill.update({
    where: { id: skillId },
    data: { level: target },
    select: { level: true },
  });

  return { skillId, from: skill.level, to: updated.level };
}
```

> `recomputeSkillLevel` **tính lại tuyệt đối** (absolute), không cộng/trừ. Nhờ vậy sửa hoặc xoá bằng chứng không làm `level` trôi lệch (AC-QL-7).

**`createLogEntry` — transaction:**

```ts
export async function createLogEntry(input: LogEntryInput): Promise<LogEntryResult> {
  const startedAt = Date.now();
  const title = normalizeTitle(input.title);
  const minutes = clampMinutes(input.minutes);
  const difficulty = clampDifficulty(input.difficulty);

  // ── Hàng rào server: dedupe (D5) ──
  // 1) Khoá tuyệt đối: clientRequestId (@@unique) — chống Enter lặp tuyệt đối.
  // 2) Khoá theo PlanItem: planItemId (@@unique) — chống bấm "Xong" 2 lần.
  // 3) Khoá mềm: (title, domain, minutes) trong cửa sổ 30 s — chống ghi trùng nội dung.
  const windowStart = new Date(Date.now() - DEDUPE_WINDOW_MS);
  const existing = await prisma.activity.findFirst({
    where: {
      OR: [
        ...(input.clientRequestId ? [{ clientRequestId: input.clientRequestId }] : []),
        ...(input.planItemId ? [{ planItemId: input.planItemId }] : []),
        {
          title,
          domain: input.domain,
          minutes,
          createdAt: { gte: windowStart },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, skillId: true },
  });
  if (existing) {
    const evidence = await prisma.evidence.findFirst({ where: { activityId: existing.id } });
    return {
      activityId: existing.id,
      evidenceId: evidence?.id ?? null,
      deduped: true,
      levelUp: null,
      serverMs: Date.now() - startedAt,
    };
  }

  return prisma.$transaction(async (tx) => {
    // ── 1. Tạo Activity ──
    const activity = await tx.activity.create({
      data: {
        title,
        domain: input.domain,
        type: input.type ?? mapTypeFromDomain(input.domain),
        minutes,
        quality: difficulty,
        content: input.note ?? null,
        skillId: input.skillId ?? null,
        planItemId: input.planItemId ?? null,        // @@unique ⇒ 1 PlanItem tối đa 1 Activity
        clientRequestId: input.clientRequestId ?? null, // @@unique ⇒ idempotency tuyệt đối
      },
      select: { id: true, skillId: true },
    });

    // ── 2. Tạo Evidence (P3) ──
    let evidenceId: string | null = null;
    if (activity.skillId) {
      const evidence = await tx.evidence.create({
        data: { activityId: activity.id, skillId: activity.skillId, rating: difficulty },
        select: { id: true },
      });
      evidenceId = evidence.id;
    }

    // ── 3. Đánh dấu PlanItem done (FR-DL-03) ──
    if (input.planItemId) {
      await tx.planItem.update({
        where: { id: input.planItemId },
        data: { done: true },
      });
    }

    return { activity, evidenceId };
  }).then(async ({ activity, evidenceId }) => {
    // ── 4. Tính lại level (ngoài transaction để tránh giữ write lock lâu) ──
    const levelUp = activity.skillId ? await recomputeSkillLevel(activity.skillId) : null;
    return {
      activityId: activity.id,
      evidenceId,
      deduped: false,
      levelUp,
      serverMs: Date.now() - startedAt,
    };
  });
}
```

**Dependencies:** `@prisma/client`, `src/lib/db.ts`, `src/lib/dates.ts`, `src/lib/config.ts`, `src/lib/types.ts`.

**Edge cases:**
- `skillId` không tồn tại trong DB → Prisma ném `P2025` → route bắt → trả `404 skill_not_found`; client thử lại không kèm `skillId` (giữ `Activity`, không tạo Evidence).
- `skillId` tồn tại nhưng khác `domain` → `409 skill_domain_mismatch`.
- `planItemId` không tồn tại → `404 plan_item_not_found` (rollback toàn bộ).
- `title` rỗng sau trim → `400` (route validate trước).
- `minutes` = 0 hoặc âm → clamp về `1`; `> 240` → clamp `240`.
- `difficulty` ngoài 1–4 → clamp (không throw) để ghi không bị chặn bởi dữ liệu AI lạ.

### 3.2 `src/lib/log-classify.ts` — rule cục bộ (fallback offline)

**Responsibilities:**
- Phân loại mô tả tự do → `{ domain, skillId, minutes, difficulty, type }` **không cần mạng, không cần AI**.
- Hoàn toàn deterministic: cùng đầu vào → cùng kết quả (NFR-QL-09).
- Là fallback **duy nhất** khi AI lỗi / offline / trả dữ liệu không hợp lệ.

**Interfaces:**

```ts
// src/lib/log-classify.ts
import type { DomainKey, ActivityType } from "./types";

export interface ClassifyCandidate {
  id: string;
  name: string;
  nameZh?: string | null;
  domain: DomainKey;
  level: number;
}

export interface LocalClassification {
  domain: DomainKey;
  skillId: string | null;
  skillName: string | null;
  minutes: number;
  difficulty: number;
  type: ActivityType;
  source: "rule";
  reason: string;                    // giải thích ngắn để debug, không hiện lên UI
}

export const DOMAIN_KEYWORDS: Record<DomainKey, readonly string[]> = {
  professional: ["hoc", "luyen tap", "giai thuat", "leetcode", "system design", "design", "code", "refactor", "tinh toan", "deploy", "arch", "tuan", "cuong sach", "doc", "hsk", "ky thuat"],
  communication: ["noi", "viet", "email", "thuyet trinh", "trinh bay", "phong van", "giao tiep", "presentation", "speaking", "writing", "shadowing"],
  language: ["tieng trung", "tieng anh", "tieng viet", "tu vung", "flashcard", "srs", "ngu phap", "hsk", "ielts", "toeic", "ton", "grammar"],
  personal: ["di bo", "chay", "the duc", "cham soc", "thien", "nhat ky", "nghi ngam", "an uong", "ngu", "meditation", "gym", "the chat"],
};

export const MINUTES_BY_DOMAIN: Record<DomainKey, readonly number[]> = {
  professional: [25, 45, 60],
  communication: [15, 25, 45],
  language: [15, 25, 45],
  personal: [15, 30, 60],
};

export function normalizeText(raw: string): string;   // lowercase, bỏ dấu, gộp khoảng trắng
export function classifyLocally(
  text: string,
  skills: ClassifyCandidate[],
): LocalClassification;
export function inferMinutes(text: string, domain: DomainKey): number;
export function inferDifficulty(text: string): number;    // 1..4
export function matchSkill(
  text: string,
  skills: ClassifyCandidate[],
  domain: DomainKey,
): ClassifyCandidate | null;
```

**Quy tắc suy luận (thứ tự cố định):**

1. **Domain** — đếm số keyword trúng theo `DOMAIN_KEYWORDS`; nhiều nhất thắng; hòa → ưu tiên theo thứ tự `professional > communication > language > personal`; không trúng keyword nào → `personal` (an toàn nhất, không gán kỹ năng).
2. **Skill** — lọc `skills` theo `domain` vừa suy ra, so khớp `name`/`nameZh` đã chuẩn hoá; khớp dài nhất thắng; không khớp → `skillId = null` (vẫn ghi được `Activity`, chỉ không có Evidence).
3. **Minutes** — tìm số trong mô tả (`"45 phút"`, `"45'"`, `"45p"`) → dùng số đó (clamp 1–240); không có → giá trị đầu tiên của `MINUTES_BY_DOMAIN[domain]`.
4. **Difficulty** — keyword nâng/giảm: `"khó"/"hard"/"chuyên sâu"` → 4; `"nâng cao"/"advanced"` → 3; `"cơ bản"/"co ban"/"dễ"/"dich"` → 1; mặc định 2.
5. **Type** — `mapTypeFromDomain(domain)` + override: có "viet" → `write`; có "noi" → `speak`; có "tu vung"/"flashcard"/"srs" → `srs`; có "nhat ky" → `journal`; có "di bo"/"chay"/"the duc" → `health`; mặc định `study`.

**Dependencies:** không có dependency ngoài — **thuần hàm, không import Prisma, không import Anthropic**. Đây là điều kiện để dùng được khi offline.

**Edge cases:**
- `text` < 3 ký tự → `classifyLocally` vẫn trả về kết quả mặc định (`personal`, `skillId=null`, `minutes=15`, `difficulty=2`) — route chặn trước bằng Zod.
- Có keyword của 2 domain bằng nhau → theo thứ tự ưu tiên cố định ở trên (không phụ thuộc thứ tự key trong object).
- Danh sách `skills` rỗng → `skillId = null`, không throw.
- Skill trùng tên ở 2 domain → đã lọc theo domain trước khi so khớp.

### 3.3 `src/components/quick-log/quick-log-sheet.tsx` — sheet 2 bước

**Route/đường dẫn:** `src/app/log/page.tsx` (render) + nhúng tại S01 qua `src/components/quick-log/quick-log-launcher.tsx`.

**Responsibilities:**
- Quản lý state machine của sheet (`closed → open.step1 → open.step2 → saving → closed`).
- Render 6 preset chip, input mô tả, panel Bước 2 (domain/kỹ năng/thời lượng/độ khó/ghi chú/toggle Evidence).
- Debounce 450 ms gọi `POST /api/log/autofill`, huỷ request cũ bằng `AbortController`.
- Gửi `POST /api/log` khi bấm "Ghi nhanh ngay" hoặc "Lưu chi tiết & Đóng".
- Đếm thời gian mở sheet (badge đồng hồ), hiện toast kết quả.

**Interfaces:**

```tsx
// src/components/quick-log/quick-log-sheet.tsx
"use client";

import type { DomainKey, ActivityType } from "@/lib/types";

export type SheetStatus = "closed" | "open" | "saving";
export type AutofillStatus = "idle" | "pending" | "done" | "error";

export interface AutofillData {
  domain: DomainKey;
  skillId: string | null;
  skillName: string | null;
  minutes: number;
  difficulty: number;
  type: ActivityType;
  source: "ai" | "rule";
}

export interface QuickLogSheetProps {
  open: boolean;
  onClose: () => void;                          // trả focus về nút mở
  onSaved?: (result: { activityId: string; levelUp: { from: number; to: number } | null }) => void;
  initial?: {
    domain?: DomainKey;
    title?: string;
    planItemId?: string;
    minutes?: number;
    skillId?: string | null;
  };
  aiEnabled: boolean;                           // = isAiAvailable() từ server
}

export interface QuickLogSheetHandle {
  open: (initial?: QuickLogSheetProps["initial"]) => void;
  close: () => void;
}

export const QUICK_LOG_PRESETS: ReadonlyArray<{
  key: string;                    // "1".."6"
  label: string;                  // "⚡ Học 25'"
  emoji: string;
  title: string;                  // mô tả điền vào input
  domain: DomainKey;
  type: ActivityType;
  minutes: number;
  difficulty: number;
}>;

export const AUTOFILL_DEBOUNCE_MS = 450;
export const MIN_DESCRIPTION_LENGTH = 3;

export default function QuickLogSheet(props: QuickLogSheetProps): JSX.Element;
```

**State machine của sheet:**

```
                    ┌──────────────────────────────┐
                    │  closed                      │
                    │  (focus trả về nút mở)      │
                    └───────────┬──────────────────┘
                                │ open() / preset / "Xong" ở S01
                                ▼
        ┌───────────────────────────────────────────────┐
        │  open (step = 1)                              │
        │  ├ description = ""                           │
        │  ├ autofill = idle                            │
        │  └ preset = null                              │
        └───────┬───────────────────┬───────────────────┘
                │ description ≥ 3    │ bấm preset
                │ (debounce 450ms)   │ (điền title + domain/type/minutes)
                ▼                   │
        ┌───────────────────────────────────────────────┐
        │  open (step = 1) + autofill = pending        │
        │  → POST /api/log/autofill (AbortController)   │
        └───────┬───────────────────┬───────────────────┘
                │ 200 source=ai      │ 200 source=rule / lỗi / abort
                ▼                   ▼
        ┌────────────────┐  ┌─────────────────────────────┐
        │ autofill=done  │  │ autofill=error → dùng rule   │
        │ source="ai"    │  │ hiện "Rule cục bộ"           │
        └───────┬────────┘  └───────────┬─────────────────┘
                └───────────┬───────────┘
                            │ người dùng mở Bước 2 / sửa trường
                            ▼
        ┌───────────────────────────────────────────────┐
        │  open (step = 2)                              │
        │  panel chi tiết hiện đầy đủ, có thể sửa tay  │
        └───────┬───────────────────────────────┬───────┘
                │ bấm "⚡ Ghi nhanh ngay (Enter)"│ bấm "Lưu chi tiết & Đóng (⌘⏎)"
                └───────────────┬───────────────┘
                                ▼
        ┌───────────────────────────────────────────────┐
        │  saving                                       │
        │  nút disabled · input readOnly · spinner      │
        └───────┬───────────────────┬───────────────────┘
                │ 200 OK            │ lỗi
                ▼                   ▼
        ┌────────────────┐  ┌─────────────────────────────┐
        │ closed         │  │ open (step giữ nguyên)       │
        │ + toast "Đã ghi"│ │ + toast lỗi + nút "Thử lại" │
        └────────────────┘  └─────────────────────────────┘
```

**Cách mở sheet từ S01 (không chờ AI):**

```tsx
// src/components/quick-log/quick-log-launcher.tsx
"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import QuickLogSheet from "./quick-log-sheet";
import type { QuickLogSheetProps } from "./quick-log-sheet";
import type { DomainKey } from "@/lib/types";

export interface QuickLogLauncherProps {
  aiEnabled: boolean;
  /** slot đang được đánh dấu "Xong" — dùng cho FR-DL-03 */
  planItem?: {
    id: string;
    action: string;
    domain: DomainKey;
    minutes: number;
    skillId: string | null;
  };
}

export default function QuickLogLauncher(props: QuickLogLauncherProps): JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<QuickLogSheetProps["initial"]>(undefined);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function handleOpen(): void {
    setInitial(props.planItem
      ? {
          domain: props.planItem.domain,
          title: props.planItem.action,
          minutes: props.planItem.minutes,
          skillId: props.planItem.skillId,
          planItemId: props.planItem.id,
        }
      : undefined);
    setOpen(true);                 // ← không fetch, không chờ AI
  }

  async function handleMarkDone(): Promise<void> {
    if (!props.planItem) return;
    const res = await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: props.planItem.action,
        domain: props.planItem.domain,
        minutes: props.planItem.minutes,
        difficulty: 3,
        skillId: props.planItem.skillId,
        planItemId: props.planItem.id,
        clientRequestId: `${props.planItem.id}:done`,
      }),
    });
    if (res.ok) router.refresh();  // S01 re-render slot ở trạng thái done
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className="px-3.5 py-1.5 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md font-semibold hover:brightness-105 active:scale-[0.98] shadow-sm"
      >
        <span className="material-symbols-outlined text-[17px]">bolt</span>
        + Ghi nhanh (≤10s)
      </button>

      <QuickLogSheet
        open={open}
        onClose={() => {
          setOpen(false);
          triggerRef.current?.focus();   // trả focus về nút mở (NFR-QL-06)
        }}
        onSaved={() => router.refresh()}
        initial={initial}
        aiEnabled={props.aiEnabled}
      />
    </>
  );
}
```

> `open` là **state cục bộ** → sheet render ở frame kế tiếp, không có request nào được gửi trước khi người dùng tương tác. Đây là cách duy nhất để đạt NFR-QL-03.

**Debounce autofill (trong component):**

```tsx
const [description, setDescription] = useState("");
const [autofillStatus, setAutofillStatus] = useState<AutofillStatus>("idle");
const [autofill, setAutofill] = useState<AutofillData | null>(null);
const abortRef = useRef<AbortController | null>(null);

useEffect(() => {
  const text = description.trim();
  if (text.length < MIN_DESCRIPTION_LENGTH) {
    abortRef.current?.abort();
    setAutofillStatus("idle");
    setAutofill(null);
    return;
  }

  setAutofillStatus("pending");
  const timer = setTimeout(async () => {
    abortRef.current?.abort();               // huỷ request cũ (D7)
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/log/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      const payload = await res.json();
      if (controller.signal.aborted) return;
      if (!res.ok || !payload?.ok) {
        setAutofillStatus("error");
        return;                              // UI fallback sang rule cục bộ (server đã trả sẵn rule nếu có)
      }
      setAutofill(payload.data as AutofillData);
      setAutofillStatus("done");
    } catch {
      if (controller.signal.aborted) return;
      setAutofillStatus("error");
    }
  }, AUTOFILL_DEBOUNCE_MS);

  return () => clearTimeout(timer);
}, [description]);
```

**Chống ghi trùng (client) — hàng rào đầu:**

```tsx
const [saving, setSaving] = useState(false);

async function handleSubmit(mode: "quick" | "detail"): Promise<void> {
  if (saving) return;                                   // ← chống Enter lặp
  const title = description.trim();
  if (title.length < MIN_DESCRIPTION_LENGTH) {
    setDescriptionError("Viết ít nhất 3 ký tự");
    return;
  }

  setSaving(true);
  setDescriptionError(null);
  const startedAt = performance.now();

  try {
    const res = await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        domain: form.domain,
        type: form.type,
        minutes: form.minutes,
        difficulty: form.difficulty,
        skillId: form.skillId,
        note: form.note,
        planItemId: initial?.planItemId ?? null,
        clientRequestId: `${initial?.planItemId ?? "manual"}:${title}:${form.minutes}`,
      }),
    });
    const payload = await res.json();
    if (!res.ok || !payload?.ok) throw new Error(payload?.error ?? "unknown");

    onSaved?.({ activityId: payload.data.activityId, levelUp: payload.data.levelUp });
    toast.success(`Đã ghi thành công vào Local DB! · ${(performance.now() - startedAt) / 1000 | 0}s`);
    onClose();
  } catch {
    toast.error("Không gửi được lên máy chủ. Kiểm tra kết nối rồi thử lại.");
  } finally {
    setSaving(false);
  }
}
```

**Dependencies:** `useState`, `useEffect`, `useRef`, `useReducer` (state machine), `next/navigation` (refresh qua parent), `src/lib/types.ts`.

**Edge cases:**
- Người dùng gõ rồi xoá hết → `autofill` reset về `idle`, panel Bước 2 quay về skeleton.
- Autofill trả về sau khi người dùng đã sửa tay ở Bước 2 → **không** ghi đè giá trị người dùng đã chỉnh (`touched` flag trên từng field).
- Người dùng bấm preset rồi gõ thêm → preset vẫn giữ `domain`/`type` làm mặc định, nhưng autofill mới được phép đề xuất lại (người dùng đã chỉnh thì giữ).
- `Esc` trong lúc `saving` → bị bỏ qua.
- Đóng sheet trong lúc autofill đang bay → `abortRef.current?.abort()` trong `useEffect` cleanup.

### 3.4 `src/app/api/log/route.ts` — POST (đường ghi chính)

```ts
// src/app/api/log/route.ts
import { z } from "zod";
import { createLogEntry, isPrismaError } from "@/lib/log";
import { DomainKeySchema, ActivityTypeSchema } from "@/lib/types";

export const LogEntrySchema = z.object({
  title: z.string().trim().min(3).max(200),
  domain: DomainKeySchema,
  type: ActivityTypeSchema.optional(),
  minutes: z.number().int().min(1).max(240),
  difficulty: z.number().int().min(1).max(4),
  skillId: z.string().min(1).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  planItemId: z.string().min(1).nullable().optional(),
  clientRequestId: z.string().max(120).nullable().optional(),
});

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  const parsed = LogEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validation_failed", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  try {
    const result = await createLogEntry(parsed.data);
    return Response.json({ ok: true, data: result });
  } catch (err) {
    if (isPrismaError(err, "P2025")) {
      return Response.json({ ok: false, error: "skill_not_found" }, { status: 404 });
    }
    if (isPrismaError(err, "P2003")) {
      return Response.json({ ok: false, error: "skill_domain_mismatch" }, { status: 409 });
    }
    console.error("[api/log] createLogEntry failed", err);
    return Response.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
```

### 3.5 `src/app/api/log/autofill/route.ts` — POST (AI-02 + fallback)

```ts
// src/app/api/log/autofill/route.ts
import { z } from "zod";
import { callAIJson } from "@/lib/anthropic";
import { classifyLocally } from "@/lib/log-classify";
import { prisma } from "@/lib/db";
import { DOMAIN_KEYS, clampMinutes, clampDifficulty } from "@/lib/types";
import { QUICK_LOG_SYSTEM, QUICK_LOG_RUBRIC, QuickLogAutofillSchema } from "@/lib/prompts";

export const AutofillRequestSchema = z.object({
  text: z.string().trim().min(3).max(500),
  domain: z.string().optional(),
  preset: z.string().optional(),
});

export async function POST(req: Request): Promise<Response> {
  const parsed = AutofillRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "text_too_short" }, { status: 400 });
  }

  const skills = await prisma.skill.findMany({
    where: { parentId: { not: null } },        // chỉ node kỹ năng lá, không lấy node gốc domain
    select: { id: true, name: true, nameZh: true, domain: true, level: true },
  });

  const fallback = classifyLocally(parsed.data.text, skills);

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: true, data: fallback });     // offline → rule (không giả lập AI)
  }

  try {
    const { data } = await callAIJson("AI-02", QuickLogAutofillSchema, {
      system: [QUICK_LOG_SYSTEM, QUICK_LOG_RUBRIC],
      messages: [
        {
          role: "user",
          content: [
            "Mô tả hoạt động của người dùng:",
            parsed.data.text,
            "",
            "Danh sách kỹ năng hợp lệ (id | tên | domain):",
            ...skills.map((s) => `${s.id} | ${s.name} | ${s.domain}`),
          ].join("\n"),
        },
      ],
      maxTokens: 512,
    });

    // Guard domain (P5) + guard skill khớp domain (FR-QL-22)
    const validSkill = data.skillId
      ? skills.find((s) => s.id === data.skillId && s.domain === data.domain)
      : undefined;

    if (!DOMAIN_KEYS.includes(data.domain)) {
      await logInvalidAutofill();            // AiCall{ok:false, error:"invalid_autofill"}
      return Response.json({ ok: true, data: fallback });
    }

    return Response.json({
      ok: true,
      data: {
        domain: data.domain,
        skillId: validSkill?.id ?? null,
        skillName: validSkill?.name ?? null,
        minutes: clampMinutes(data.minutes),
        difficulty: clampDifficulty(data.difficulty),
        type: fallback.type,
        source: "ai",
      },
    });
  } catch (err) {
    // AI lỗi / refusal / schema sai → fallback rule, KHÔNG trả 500
    return Response.json({ ok: true, data: fallback });
  }
}
```

### 3.6 `src/app/api/log/history/route.ts` — GET

```ts
// src/app/api/log/history/route.ts
export const HistoryQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(() => todayLocal()),
  domain: z.enum(["all", "professional", "communication", "language", "personal"]).default("all"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(req: NextRequest): Promise<Response> {
  const parsed = HistoryQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }
  const data = await listLogHistory(parsed.data);
  return Response.json({ ok: true, data });
}
```

### 3.7 `src/app/api/log/[id]/route.ts` — PATCH / DELETE

```ts
// src/app/api/log/[id]/route.ts
import { z } from "zod";
import { updateLogEntry, deleteLogEntry, LogNotFoundError, isPrismaError } from "@/lib/log";
import { DomainKeySchema, ActivityTypeSchema } from "@/lib/types";

export const UpdateLogSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  domain: DomainKeySchema.optional(),
  type: ActivityTypeSchema.optional(),
  minutes: z.number().int().min(1).max(240).optional(),
  difficulty: z.number().int().min(1).max(4).optional(),
  skillId: z.string().min(1).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const parsed = UpdateLogSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }
  try {
    const result = await updateLogEntry(id, parsed.data);
    return Response.json({ ok: true, data: result });
  } catch (err) {
    if (err instanceof LogNotFoundError) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (isPrismaError(err, "P2003")) {
      return Response.json({ ok: false, error: "skill_domain_mismatch" }, { status: 409 });
    }
    return Response.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  try {
    const result = await deleteLogEntry(id);
    return Response.json({ ok: true, data: result });
  } catch (err) {
    if (err instanceof LogNotFoundError) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return Response.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
```

### 3.8 `src/components/quick-log/log-history.tsx` — lịch sử + sửa/xoá

```tsx
// src/components/quick-log/log-history.tsx
"use client";

import { useMemo, useState } from "react";
import type { DomainKey, ActivityType } from "@/lib/types";

export interface LogHistoryItem {
  id: string;
  title: string;
  domain: DomainKey;
  type: ActivityType;
  minutes: number;
  difficulty: number | null;
  note: string | null;
  skillId: string | null;
  skillName: string | null;
  skillLevel: number | null;
  evidenceId: string | null;
  createdAt: string;
}

export interface LogHistoryProps {
  items: LogHistoryItem[];
  total: number;
  initialDomain: DomainKey | "all";
}

export default function LogHistory(props: LogHistoryProps): JSX.Element {
  const [domain, setDomain] = useState<DomainKey | "all">(props.initialDomain);
  const [editing, setEditing] = useState<LogHistoryItem | null>(null);
  const [deleting, setDeleting] = useState<LogHistoryItem | null>(null);

  const counts = useMemo(() => countByDomain(props.items), [props.items]);
  const visible = useMemo(
    () => (domain === "all" ? props.items : props.items.filter((i) => i.domain === domain)),
    [props.items, domain],
  );

  return (
    <>
      {/* chips lọc: Tất cả (n) + 4 domain */}
      {/* danh sách item: giờ · chip domain · phút · badge Evidence · title · node · độ khó */}
      {/* nút Sửa → setEditing(item) ; nút Xoá → setDeleting(item) */}
      {editing ? <LogEditDialog item={editing} onClose={() => setEditing(null)} /> : null}
      {deleting ? <LogDeleteDialog item={deleting} onClose={() => setDeleting(null)} /> : null}
    </>
  );
}
```

**Dependencies:** `useState`, `useMemo`, `src/components/quick-log/log-edit-dialog.tsx`, `src/components/quick-log/log-delete-dialog.tsx`.

**Edge cases:**
- Lọc domain không có dữ liệu → "Chưa có hoạt động cho domain này" (không để trống).
- Ngày không có hoạt động → empty state + CTA "Ghi nhanh ngay" quay lại `/`.
- Sửa mức độ khó → `PATCH` kèm `difficulty`; server cập nhật đồng thời `Evidence.rating` và `Activity.quality`.
- Xoá → hộp xác nhận bắt buộc; sau khi xoá, `router.refresh()` để refresh danh sách.

### 3.9 AI layer — prompt & schema (AI-02)

```ts
// src/lib/prompts.ts
export const QUICK_LOG_SYSTEM = `
Bạn phân loại hoạt động tự do của người dùng thành 4 trường có cấu trúc.
Nguyên tắc:
- Chỉ được trả về đúng 4 trường: domain, skillId, minutes, difficulty.
- domain chỉ được là một trong: professional, communication, language, personal.
- skillId chỉ được lấy từ danh sách id được cung cấp; không có id phù hợp thì trả null.
- minutes là số phút thực tế, nằm trong khoảng 5..240.
- difficulty là mức độ khó 1..4 (1 = rất dễ, 4 = rất khó).
- Không suy diễn hoạt động không có trong mô tả.
- Nếu mô tả quá mơ hồ, trả domain gần nhất theo keyword và difficulty 2.
`.trim();

export const QUICK_LOG_RUBRIC = `
Quy tắc ánh xạ domain:
- professional: học chuyên môn, luyện tập kỹ thuật, đọc sách kỹ thuật, thiết kế hệ thống.
- communication: viết, nói, trình bày, email, phỏng vấn, luyện nói.
- language: tiếng Trung, tiếng Anh, từ vựng, ngữ pháp, flashcard, SRS.
- personal: nhật ký, đi bộ, tập thể dục, thiền, chăm sóc bản thân.

Quy tắc difficulty:
- 1 = sơ cấp / quen thuộc
- 2 = luyện tập thường lệ
- 3 = nâng cao / chuyên sâu vừa
- 4 = rất khó / mới / cần tập trung cao
`.trim();
```

```ts
// Zod schema cho structured output (FR-AI-04)
export const QuickLogAutofillSchema = z.object({
  domain: z.enum(["professional", "communication", "language", "personal"]),
  skillId: z.string().nullable(),
  minutes: z.number().int().min(1).max(240),
  difficulty: z.number().int().min(1).max(4),
});
```

**Cấu hình call AI-02:**

| Thuộc tính | Giá trị | Nguồn |
|---|---|---|
| Mã AI | `AI-02` | SPEC §5.1 |
| Model | `claude-haiku-4-5` | SPEC §5.1, steering tech §4.1 |
| Streaming | **Không** (`callAIJson`) | SPEC §5.1, FR-AI-17 |
| Effort | `low` | SPEC §5.1 |
| Output | Structured `{domain, skillId, minutes, difficulty}` | SPEC §5.1, FR-AI-04 |
| `max_tokens` | 512 | đủ cho payload 4 trường |
| System prompt | `[QUICK_LOG_SYSTEM, QUICK_LOG_RUBRIC]` — block cuối có `cache_control: { type: "ephemeral" }` | FR-AI-01, §5.2 |
| Nội dung biến động | mô tả người dùng + danh sách kỹ năng → **`messages`** | §5.2 |
| Logging | `AiCall{ feature: "quick_log_autofill", model, tokens, cacheRead, cacheWrite, estimatedCost, ok, error }` | FR-AI-07 |

> `QUICK_LOG_SYSTEM` và `QUICK_LOG_RUBRIC` là **hằng số không chứa ngày/UUID/`Date.now()`** → cache prefix giữ nguyên giữa các lượt (AC-5 liên quan). Danh sách kỹ năng nằm trong `messages` vì nó thay đổi theo seed.

### 3.10 Định tuyến & dữ liệu lịch sử

```ts
// src/app/log/page.tsx  (Server Component)
import { redirect } from "next/navigation";
import QuickLogSheet from "@/components/quick-log/quick-log-sheet";

export default async function LogPage(): Promise<JSX.Element> {
  const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY);
  return <QuickLogSheet open aiEnabled={aiEnabled} onClose={() => redirect("/")} />;
}

// src/app/log/history/page.tsx  (Server Component)
import LogHistory from "@/components/quick-log/log-history";
import { listLogHistory } from "@/lib/log";
import { todayLocal } from "@/lib/dates";
import type { DomainKey } from "@/lib/types";

export default async function LogHistoryPage(
  props: { searchParams: Promise<{ date?: string; domain?: string }> },
): Promise<JSX.Element> {
  const sp = await props.searchParams;
  const date = sp.date ?? todayLocal();
  const domain = (sp.domain ?? "all") as DomainKey | "all";
  const data = await listLogHistory({ date, domain, limit: 50, offset: 0 });
  return <LogHistory items={data.items} total={data.count} initialDomain={domain} />;
}
```

> `/log/history` là **Server Component**: dữ liệu đã có sẵn khi HTML tới trình duyệt; bộ lọc domain là client-side trên tập đã nạp (≤200 dòng) → bấm chip không reload trang.

## 4. Luồng dữ liệu

### 4.0 Hợp đồng helper dùng chung

Các helper sau **không** định nghĩa lại trong feature này — lấy từ module chung:

| Helper | Module | Signature | Ghi chú |
|---|---|---|---|
| `todayLocal()` | `src/lib/dates.ts` | `() => string` | `yyyy-MM-dd` theo giờ local |
| `startOfLocalDay(date)` | `src/lib/dates.ts` | `(date: string \| Date) => Date` | 00:00 local |
| `addDays(date, n)` | `src/lib/dates.ts` | `(date: Date, n: number) => Date` | Cộng ngày local |
| `EVIDENCE_RATING_MIN` | `src/lib/config.ts` | `number` (= 3) | Ngưỡng rating tối thiểu tính level |
| `EVIDENCE_THRESHOLD` | `src/lib/config.ts` | `number` (= 3) | Số bằng chứng cần để tăng 1 level |
| `SKILL_LEVEL_MAX` | `src/lib/config.ts` | `number` (= 5) | Trần thang level |

Helper **riêng của feature** (định nghĩa trong file nêu dưới):

| Helper | Module | Signature | Ghi chú |
|---|---|---|---|
| `DOMAIN_KEYS` | `src/lib/types.ts` | `readonly DomainKey[]` | `["professional","communication","language","personal"]` — tập đóng băng P5 |
| `isPrismaError(err, code)` | `src/lib/log.ts` | `(err: unknown, code: string) => boolean` | Kiểm tra mã lỗi Prisma (`P2025`, `P2003`, `P2002`) |
| `logInvalidAutofill()` | `src/app/api/log/autofill/route.ts` | `() => Promise<void>` | Ghi `AiCall{ feature:"quick_log_autofill", ok:false, error:"invalid_autofill" }` |

### 4.1 Luồng chính — ghi nhanh (AC-2)

1. `handleSubmit("quick")` → validate `title.length ≥ 3` → `setSaving(true)`.
2. `POST /api/log` với `{ title, domain, type, minutes, difficulty, skillId, note, planItemId?, clientRequestId? }`.
3. Route validate bằng `LogEntrySchema` (Zod) → `400` nếu sai.
4. `createLogEntry()`:
   - Dedup check (nếu có `planItemId`) trong 30 s gần nhất.
   - `prisma.$transaction`: tạo `Activity` → tạo `Evidence` (nếu `skillId`) → `PlanItem.done = true` (nếu `planItemId`).
   - `recomputeSkillLevel(skillId)` sau transaction → `levelUp`.
5. Response `{ ok: true, data: { activityId, evidenceId, deduped, levelUp, serverMs } }`.
6. Client hiện toast "Đã ghi thành công vào Local DB!" + `<skillName> · Ghi nhận trong {n}s`; đóng sheet; `router.refresh()`.

### 4.2 Luồng phân loại (autofill)

1. `useEffect` debounce 450 ms khi `description.trim().length ≥ 3`.
2. `AbortController` huỷ request trước.
3. `POST /api/log/autofill { text }`.
4. Route: đọc `Skill` lá từ DB → `classifyLocally(text, skills)` (luôn có sẵn kết quả fallback).
5. Nếu không có API key → trả `fallback` với `source: "rule"`.
6. Nếu có API key → `callAIJson("AI-02", QuickLogAutofillSchema, …)`:
   - OK + domain hợp lệ → trả kết quả AI (`source: "ai"`), `skillId` được kiểm tra tồn tại + khớp domain.
   - Domain không hợp lệ → ghi `AiCall{ok:false, error:"invalid_autofill"}` → trả `fallback`.
   - Lỗi SDK / refusal / schema sai → trả `fallback` (`source: "rule"`), **không** trả 500.
7. Client điền vào panel Bước 2 — **không** chặn nút "Ghi nhanh ngay".

### 4.3 Lưu trữ & truy vấn

**Migration Prisma duy nhất của feature này** — thêm khoá chống ghi trùng cho FR-DL-03:

```prisma
model Activity {
  // … các field có sẵn ở SPEC §4 …
  planItemId      String?  @unique     // 1 PlanItem tối đa 1 Activity (B5)
  planItem        PlanItem? @relation(fields: [planItemId], references: [id], onDelete: SetNull)
  clientRequestId String?  @unique     // khoá idempotency tuyệt đối từ client (B8)
  @@index([createdAt])                  // truy vấn lịch sử theo ngày
}

model PlanItem {
  // … các field có sẵn ở SPEC §4 …
  activity   Activity?
}
```

> `onDelete: SetNull` ⇒ xoá `PlanItem` **không** xoá `Activity` (lịch sử độc lập với kế hoạch — xem edge case trong `spec.md` §6.6).

```ts
// listLogHistory — lịch sử theo ngày + lọc domain
export async function listLogHistory(params: {
  date: string;
  domain: DomainKey | "all";
  limit?: number;
  offset?: number;
}) {
  const start = startOfLocalDay(params.date);       // 00:00 local
  const end = addDays(start, 1);

  const where = {
    createdAt: { gte: start, lt: end },
    ...(params.domain === "all" ? {} : { domain: params.domain }),
  };

  const [items, count] = await Promise.all([
    prisma.activity.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: params.limit ?? 50,
      skip: params.offset ?? 0,
      include: {
        evidences: { take: 1, include: { skill: { select: { name: true, level: true } } } },
      },
    }),
    prisma.activity.count({ where }),
  ]);

  return {
    date: params.date,
    count,
    items: items.map((a) => {
      const ev = a.evidences[0] ?? null;
      return {
        id: a.id,
        title: a.title,
        domain: a.domain as DomainKey,
        type: a.type as ActivityType,
        minutes: a.minutes,
        difficulty: ev?.rating ?? null,
        note: a.content,
        skillId: a.skillId,
        skillName: ev?.skill.name ?? null,
        skillLevel: ev?.skill.level ?? null,
        evidenceId: ev?.id ?? null,
        createdAt: a.createdAt.toISOString(),
      };
    }),
  };
}
```

```ts
// updateLogEntry — sửa 1 mục, tính lại level cả kỹ năng cũ và mới
export async function updateLogEntry(id: string, patch: Partial<LogEntryInput>) {
  const current = await prisma.activity.findUnique({
    where: { id },
    select: { id: true, skillId: true, quality: true },
  });
  if (!current) throw new LogNotFoundError(id);

  const nextSkillId = patch.skillId === undefined ? current.skillId : patch.skillId;
  const nextDifficulty = patch.difficulty ?? current.quality ?? DEFAULT_DIFFICULTY;

  const { evidenceId } = await prisma.$transaction(async (tx) => {
    await tx.activity.update({
      where: { id },
      data: {
        ...(patch.title !== undefined && { title: normalizeTitle(patch.title) }),
        ...(patch.domain !== undefined && { domain: patch.domain }),
        ...(patch.type !== undefined && { type: patch.type }),
        ...(patch.minutes !== undefined && { minutes: clampMinutes(patch.minutes) }),
        ...(patch.note !== undefined && { content: patch.note }),
        quality: nextDifficulty,
        skillId: nextSkillId ?? null,
      },
    });

    // Xoá Evidence cũ (nếu đổi kỹ năng) rồi tạo lại
    await tx.evidence.deleteMany({ where: { activityId: id } });
    if (!nextSkillId) return { evidenceId: null as string | null };

    const ev = await tx.evidence.create({
      data: { activityId: id, skillId: nextSkillId, rating: nextDifficulty },
      select: { id: true },
    });
    return { evidenceId: ev.id };
  });

  const levelUp = nextSkillId ? await recomputeSkillLevel(nextSkillId) : null;
  const oldLevel = current.skillId && current.skillId !== nextSkillId
    ? await recomputeSkillLevel(current.skillId)
    : null;

  return {
    activityId: id,
    evidenceId,
    deduped: false,
    levelUp: levelUp ?? oldLevel,
    serverMs: 0,
    skillChanged: current.skillId !== nextSkillId,
  };
}
```

```ts
// deleteLogEntry — xoá 1 mục + tính lại level
export async function deleteLogEntry(id: string) {
  const current = await prisma.activity.findUnique({
    where: { id },
    select: { id: true, skillId: true },
  });
  if (!current) throw new LogNotFoundError(id);

  const skillId = current.skillId;
  const levelBefore = skillId ? (await prisma.skill.findUnique({ where: { id: skillId }, select: { level: true } }))?.level ?? 0 : 0;

  await prisma.activity.delete({ where: { id } });   // onDelete: Cascade xoá Evidence

  let levelAfter = levelBefore;
  if (skillId) {
    const changed = await recomputeSkillLevel(skillId);
    levelAfter = changed?.to ?? levelBefore;
  }

  return { deleted: true as const, skillId, levelBefore, levelAfter };
}
```

## 5. Xử lý lỗi

| Tình huống | Phát hiện | Xử lý | Thông báo người dùng |
|---|---|---|---|
| `title` < 3 ký tự hoặc sai schema | `LogEntrySchema.safeParse` | 400, không ghi | "Viết ít nhất 3 ký tự" (dưới input, `aria-invalid`) |
| Thiếu `ANTHROPIC_API_KEY` | `!process.env.ANTHROPIC_API_KEY` | Dùng `classifyLocally` | Badge nguồn "Rule cục bộ"; không hiện nút AI |
| `RateLimitError` (429) | typed exception | `AiCall{ok:false}` → trả fallback rule | "AI đang tải cao — đã dùng rule cục bộ." (dòng nhỏ dưới badge nguồn) |
| `AuthenticationError` (401) | typed exception | `AiCall{ok:false}` → trả fallback rule | "API key không hợp lệ — đã dùng rule cục bộ." + link mở S15 |
| `stop_reason === "refusal"` | kiểm tra **trước** khi đọc content (trong `callAIJson`) | `AiCall{ok:false, error:"refusal"}` → fallback rule | "AI không phân loại được nội dung này — đã dùng rule cục bộ." |
| AI trả `domain` ngoài 4 domain | `DOMAIN_KEYS.includes()` | `AiCall{ok:false, error:"invalid_autofill"}` → fallback rule | "AI phân loại sai lĩnh vực — đã dùng rule cục bộ." |
| AI trả `skillId` không tồn tại / khác domain | tra `skills` | Bỏ `skillId`, giữ domain/minutes/difficulty | Panel Bước 2 hiện "Chưa gắn kỹ năng" + nút chọn |
| `skillId` không tồn tại lúc **ghi** | Prisma `P2025` | 404 `skill_not_found`; client thử lại không kèm `skillId` | "Kỹ năng không còn tồn tại — đã lưu không kèm bằng chứng." |
| `skillId` khác domain | Prisma `P2003` | 409 `skill_domain_mismatch` | "Kỹ năng không thuộc lĩnh vực đã chọn." |
| `planItemId` không tồn tại | Prisma `P2003` | 404 `plan_item_not_found`, rollback | "Không tìm thấy hành động trong kế hoạch." |
| Ghi trùng (Enter lặp) | `saving === true` (client) + dedupe 30 s (server) | Trả `Activity` cũ `deduped: true` | Toast "Đã ghi" (không tạo bản ghi thứ 2) |
| Mất mạng khi ghi | `fetch` reject | Không đóng sheet, giữ nguyên form | "Không gửi được lên máy chủ. Kiểm tra kết nối rồi thử lại." + nút Thử lại |
| Lỗi Prisma chung | exception | 500 + `console.error` | "Không lưu được hoạt động. Thử lại." |
| Xoá `Activity` không tồn tại | Prisma `P2025` | 404 | "Mục này đã bị xoá." + refresh danh sách |
| Sửa `Activity` không tồn tại | Prisma `P2025` | 404 | "Mục này đã bị xoá." + refresh danh sách |
| `date` sai định dạng trong history | `HistoryQuerySchema` | 400 | "Ngày không hợp lệ — dùng định dạng yyyy-MM-dd." |

> Nguyên tắc chung: **không lỗi nào được làm sập trang**; lỗi AI **không bao giờ** chặn đường ghi.

## 6. Chiến lược kiểm thử

| Tầng | Công cụ | Phạm vi |
|---|---|---|
| Unit | Vitest | `normalizeText`, `classifyLocally` (20 mẫu mô tả → snapshot), `inferMinutes`, `inferDifficulty`, `matchSkill` |
| Unit | Vitest | `mapTypeFromDomain`, `clampMinutes` (0 → 1, 999 → 240), `clampDifficulty` (0 → 1, 9 → 4) |
| Unit | Vitest | `recomputeSkillLevel`: 2 bằng chứng rating 3 + 1 rating 4 → level +1; rating 2 không tính; không vượt `SKILL_LEVEL_MAX` |
| Unit | Vitest | `normalizeTitle` cắt 200 ký tự, trim khoảng trắng thừa |
| Integration | Vitest + SQLite test DB | `POST /api/log` tạo đúng 1 `Activity` + 1 `Evidence`; `Activity.quality === Evidence.rating` |
| Integration | Vitest | `POST /api/log` với `planItemId` → `PlanItem.done = true`; nếu Evidence lỗi thì `done` vẫn `false` (rollback) |
| Integration | Vitest | `POST /api/log` gọi 2 lần trong 30 s cùng title/domain/minutes → 1 `Activity`, `deduped: true` |
| Integration | Vitest | `PATCH /api/log/[id]` đổi difficulty → `Evidence.rating` đổi + `Skill.level` tính lại |
| Integration | Vitest | `PATCH` đổi skillId → Evidence cũ bị xoá, Evidence mới tạo, level cả 2 kỹ năng tính lại |
| Integration | Vitest | `DELETE /api/log/[id]` → Activity + Evidence mất, `Skill.level` giảm đúng |
| Integration | Vitest (mock AI) | AI trả `domain="health"` → 200, `source:"rule"`, `AiCall{ok:false, error:"invalid_autofill"}` |
| Integration | Vitest (mock AI) | AI ném `RateLimitError` → 200, `source:"rule"`, không 500 |
| Integration | Vitest | `GET /api/log/history?date=…&domain=language` → chỉ trả activity đúng domain & đúng ngày local |
| Unit | Vitest | `buildAutofillMessage` không chứa `Date.now()`/UUID (bảo toàn cache prefix) |
| E2E | Playwright | **AC-2**: mở sheet → bấm preset → bấm "Ghi nhanh ngay" → toast trong **≤10 000 ms** (đo `performance.now()`), 1 `Activity` trong DB |
| E2E | Playwright | **AC-QL-4**: bấm Enter 5 lần → DB có đúng 1 `Activity` |
| E2E | Playwright | **AC-QL-6**: bấm "Xong" ở S01 → slot chuyển done, `Activity` + `Evidence` tồn tại, `PlanItem.done = true` |
| E2E | Playwright | **AC-QL-3**: bỏ `ANTHROPIC_API_KEY` → ghi vẫn thành công, badge "Rule cục bộ" |
| E2E | Playwright | **AC-QL-7**: sửa mức độ khó → DB đổi; xoá mục → mất khỏi DB và khỏi danh sách |
| E2E | Playwright | **AC-QL-8**: chip "Ngoại ngữ" lọc đúng số mục; URL đổi theo filter |
| E2E | Playwright | **AC-QL-10**: viewport 390×844, tab-order hợp lệ, `Esc` đóng sheet và focus trả về nút mở |
| A11y | axe | Không lỗi nghiêm trọng; icon-only button có `aria-label`; toast `aria-live="polite"` |
| Hiệu năng | Playwright + `performance.now()` | p95 thời gian ghi ≤10 s; `serverMs` trả về < 2000 ms |
| Offline | Playwright (chặn network) | Chặn toàn bộ network → preset + ghi nhanh vẫn tạo `Activity` trong SQLite |

## 7. Rủi ro & đánh đổi kỹ thuật

| # | Rủi ro | Tác động | Giảm thiểu |
|---|---|---|---|
| T1 | AI làm chậm trải nghiệm khi người dùng gõ nhanh | Nhiều request AI-02, tăng chi phí, rác `AiCall` | Debounce 450 ms + `AbortController` huỷ request cũ; cache prefix tĩnh; effort `low` |
| T2 | AI phân loại sai domain/kỹ năng | Bằng chứng gắn nhầm → `Skill.level` sai (vi phạm P3) | Guard domain (P5) + guard skill khớp domain; sai → fallback rule; `AiCall{ok:false}` |
| T3 | Người dùng bấm Enter liên tục tạo nhiều `Activity` trùng | Ô nhiễm dữ liệu, sai streak | Khoá nút ở client + 3 tầng dedupe ở server (`clientRequestId` → `planItemId` → cửa sổ 30 s) |
| T4 | `Activity.quality` (1–5) lệch `Evidence.rating` (1–4) | Giá trị 5 không map được, mất bằng chứng | Chỉ dùng thang 1–4 (D3); server clamp về 1–4 trước khi ghi |
| T5 | Điều chỉnh `level` bằng cộng/trừ dần dễ trôi lệch | `level` không còn khớp số bằng chứng | `recomputeSkillLevel` tính **tuyệt đối** từ `COUNT(rating ≥ 3)` |
| T6 | Xoá/sửa bằng chứng làm `level` của kỹ năng khác bị ảnh hưởng | Cây kỹ năng lệch | Mọi thao tác sửa/xoá đều gọi `recomputeSkillLevel` cho **cả** kỹ năng cũ và mới |
| T7 | Đường ghi bị chặn bởi AI khi mạng chậm | Vỡ AC-2 | `POST /api/log` không import Anthropic; AI chỉ ở route `/autofill` (D1) |
| T8 | Timezone: `createdAt` lưu UTC, ngày hiển thị lệch 1 ngày | Lịch sử "hôm nay" sai | `src/lib/dates.ts` chuẩn hoá 00:00 local; không dùng `toISOString()` để so sánh ngày |
| T9 | `Activity.type` không nằm trong enum của SPEC | Lọc theo type ở S03/S04 hỏng | `mapTypeFromDomain` là hàm duy nhất sinh `type`; `ActivityTypeSchema` là enum đóng |
| T10 | Sheet dùng chung state với S01 gây re-render nặng trang chủ | S01 chậm (NFR-02) | Sheet chỉ mount khi `open === true`; nội dung sheet không phụ thuộc dữ liệu S01 |
| T11 | Lịch sử nhiều năm làm payload lớn | `/log/history` chậm | Mặc định giới hạn **theo ngày** (50 dòng); `limit` tối đa 200; lọc domain client-side |
| T12 | `Recompute level` chạy ngoài transaction ⇒ khoảnh khắc lệch nhất quán | Level lệch 1 lần nếu 2 request song song | `recomputeSkillLevel` là hàm idempotent + tính tuyệt đối → lần gọi sau sẽ đồng bộ; thêm `update` có điều kiện `where: { id, level: from }` nếu cần |
| T13 | Người dùng gõ mô tả chứa dữ liệu nhạy cảm | Rò rỉ ra API | Chỉ gửi lên API khi người dùng **chủ động** gõ mô tả (P6); hiển thị "đã gửi lên" ở S15; không gửi lịch sử cũ |
| T14 | Nút "AI Tóm tắt & Rút kinh nghiệm" trong prototype nhưng chưa implement | Nút chết, gây hiểu nhầm | Ẩn hoàn toàn ở Phase 0 (FR-QL-15); nối vào feature `personal-state-journal` ở phase sau |
