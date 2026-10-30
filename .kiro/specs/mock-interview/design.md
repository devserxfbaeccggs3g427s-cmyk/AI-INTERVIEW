# Design — Mock Interview

> Feature: `mock-interview` · Màn hình: S16 `/interview/setup`, S17 `/interview/session`, S18 `/interview/[id]`
> Nguồn: `.kiro/specs/mock-interview/spec.md` · `system-design/SPEC.md` §2.8, §3.2, §4, §5

## 1. Tổng quan kiến trúc

Mock Interview là một **state machine** điều khiển bằng cơ sở dữ liệu, không phải state trong React. Toàn bộ tiến trình phiên nằm trong `InterviewSession` + `InterviewTurn`; UI chỉ là một hình chiếu (projection) của DB. Nhờ vậy một phiên có thể bị đóng tab, refresh, hoặc dừng giữa chừng và vẫn resume được (FR-MI-13) mà không cần bất kỳ cơ chế khôi phục client-side nào ngoài `localStorage` cho nội dung textarea.

```
        ┌────────────────────────────────────────────────────────────────┐
        │                        SERVER (Next.js 15)                     │
        │                                                                │
        │  S16 /interview/setup ──► GET/POST /api/interview/profiles   │
        │        │                  GET  /api/interview/weak-skills      │
        │        │                  POST /api/interview/start ──► AI-11  │
        │        ▼                                                     │
        │  S17 /interview/session ──► POST /api/interview/turn ──► AI-12│
        │        │  (state machine: session.status)                     │
        │        ▼                                                     │
        │  S18 /interview/[id] ────► POST /api/interview/report ─► AI-13│
        │                                │                               │
        │                                ▼                               │
        │                        Activity + Evidence                    │
        │                                                                │
        │  src/lib/interview/  (domain logic, thuần TS, test được)      │
        │    ├─ weak-skills.ts   thuật toán chọn kỹ năng yếu             │
        │    ├─ rubric.ts        hằng số rubric + tính tổng              │
        │    ├─ turn-machine.ts  validate lượt, adaptive rules           │
        │    ├─ report.ts        chuẩn hoá report, verify trích dẫn      │
        │    ├─ delta.ts         so sánh 2 phiên                        │
        │    └─ prompts.ts       prompt AI-11/12/13 + Zod schemas        │
        └────────────────────────────────────────────────────────────────┘
                        │                    │
                        ▼                    ▼
                 SQLite (Prisma)      Anthropic API (claude-opus-5)
```

---

## 2. Kiến trúc

### 2.1 Sơ đồ luồng

```
                 ┌──────────────────────┐
                   │  S16 · /interview/setup
                   └──────────┬───────────┘
                              │ 1. GET /api/interview/profiles
                              │ 2. GET /api/interview/weak-skills?profileId
                              │ 3. POST /api/interview/profiles  (nếu tạo mới)
                              ▼
              ┌───────────────────────────────────┐
              │  weak-skills.ts                    │
              │  đếm Evidence → sort tăng dần       │
              │  → pin 2 node yếu nhất             │
              └────────────┬──────────────────────┘
                              │ 4. POST /api/interview/start
                              │    { profileId, plannedCount, questionKinds,
                              │      focusSkills, answerMode, adaptive }
                              ▼
              ┌───────────────────────────────────┐
              │  TẠO InterviewSession (status=     │
              │  active, plannedCount, skillsFocused)│
              │  → gọi AI-11 sinh câu 1            │
              │  → tạo InterviewTurn #1 (answer=   │
              │    null, kind, skillId)             │
              └────────────┬──────────────────────┘
                              │ 5. router.push(/interview/session?session=id)
                              ▼
       ┌──────────────────────────────────────────────────────────┐
       │                    S17 · /interview/session              │
       │                                                          │
       │   ┌────────────┐   trả lời    ┌──────────────────────┐  │
       │   │ Turn #k    │ ───────────► │ POST /api/interview/turn│  │
       │   │ (câu hỏi) │              │  (sessionId, turnIndex, │  │
       │   └────────────┘              │   answer)              │  │
       │                              └───────────┬──────────┘  │
       │                                          │             │
       │                                          ▼             │
       │                        ┌──────────────────────────────┐ │
       │                        │ AI-12 (1 call)               │ │
       │                        │  vào: câu + câu trả lời +    │ │
       │                        │      rubric đầy đủ + lịch sử│ │
       │                        │ ra: { scores, nextQuestion, │ │
       │                        │      isFollowUp, reason }    │ │
       │                        └──────────────┬───────────────┘ │
       │                                       │                 │
       │                     ┌─────────────────┼─────────────────┐
       │                     ▼                 ▼                 ▼
       │              cập nhật Turn #k   tạo Turn #k+1     session.askedCount++
       │              (scores, total,    (question, kind,    session.status
       │               feedback)          skillId)           = active|done
       │                     │                 │
       │                     └────────┬────────┘
       │                              ▼
       │              render: điểm câu trước (thu gọn) + câu mới
       └──────────────────────────────┬───────────────────────────┘
                                      │ askedCount >= plannedCount
                                      ▼
                 ┌────────────────────────────────────┐
                   │  POST /api/interview/report       │
                   │  → AI-13 (effort high)             │
                   │  → chuẩn hoá + verify trích dẫn    │
                   │  → tạo Activity + Evidence (1 lần)  │
                   └──────────────────┬─────────────────┘
                                      ▼
                 ┌────────────────────────────────────┐
                   │  S18 · /interview/[id]              │
                   │  điểm tổng + delta + rubric 5 TC     │
                   │  + 3 mạnh / 3 yếu + đề xuất luyện   │
                   └────────────────────────────────────┘
```

### 2.2 Phân tầng

| Tầng | Module | Trách nhiệm |
|---|---|---|
| **Route (UI)** | `src/app/interview/setup/page.tsx` (Server) → `components/interview/interview-setup.tsx` (Client) | Đọc hồ sơ + kỹ năng yếu server-side; render form; submit |
| | `src/app/interview/session/page.tsx` (Server) → `components/interview/interview-session.tsx` (Client) | Đọc session + turns; quản lý textarea, timer, STT/TTS; submit lượt |
| | `src/app/interview/[id]/page.tsx` (Server) → `components/interview/interview-report-view.tsx` (Server-ish) | Đọc báo cáo + delta; render tĩnh; nút hành động → route khác |
| **API** | `src/app/api/interview/{profiles,start,turn,report,flag}/route.ts` | Validate Zod, gọi domain layer, trả `{ ok, data }` |
| | `src/app/api/interview/[id]/route.ts`, `sessions/route.ts`, `weak-skills/route.ts`, `[id]/export/route.ts` | Đọc dữ liệu, tổng hợp delta |
| **Domain (thuần TS)** | `src/lib/interview/weak-skills.ts` | Chọn kỹ năng yếu — không đụng Prisma, dễ unit test |
| | `src/lib/interview/rubric.ts` | Hằng số rubric, `computeTurnTotal`, `computeSessionTotal` |
| | `src/lib/interview/turn-machine.ts` | Quy tắc adaptive, kiểm tra lượt, chống trùng index |
| | `src/lib/interview/report.ts` | Chuẩn hoá report AI-13, verify trích dẫn, cắt còn 3 |
| | `src/lib/interview/delta.ts` | Tính delta từng tiêu chí giữa 2 phiên |
| | `src/lib/interview/session-state.ts` | State machine phiên + xác định câu đang dở để resume |
| | `src/lib/interview/activity.ts` | Tạo 1 Activity + 1 Evidence khi phiên `done` |
| **AI** | `src/lib/interview/prompts.ts` | System prompt, rubric block, Zod schema cho AI-11/12/13 |
| | `src/lib/anthropic.ts` | Wrapper ghi `AiCall` (tokens, cache read/write, cost) |
| **Data** | `src/lib/db.ts` | Prisma singleton |

### 2.3 Quyết định thiết kế

| # | Quyết định | Lý do | Hệ quả |
|---|---|---|---|
| 1 | **State machine lưu trong DB**, không lưu trong React state | Phiên phải survive refresh/đóng tab (FR-MI-13, Edge case "refresh trang") | Mọi UI đều derive từ server state; cần polling hoặc refetch sau mỗi lượt |
| 2 | **AI-12 gộp chấm + sinh câu trong 1 call** | FR-MI-06 nêu rõ "2 việc trong 1 call"; 1 phiên 8 câu = 9 call (chi phí $0.15–0.30) | Output phải là structured output chứa cả `scores` lẫn `nextQuestion` — dùng 1 Zod schema hợp nhất |
| 3 | **Câu kế tiếp được tạo sẵn ngay trong lượt trước** (`nextQuestion` lưu trên turn) | UI không phải gọi thêm round-trip; resume sau refresh không cần gọi AI lại | Câu kế tiếp tồn tại 2 nơi: `Turn_k.nextQuestion` và `Turn_{k+1}.question`. `Turn_{k+1}` là nguồn chân lý; `nextQuestion` chỉ là cache để hiển thị |
| 4 | **Rubric là hằng số TS, nhúng vào system prompt dưới `cache_control`** | P4 + AC-5 + R11 (chi phí) | Không được AI tự định nghĩa tiêu chí; đổi rubric = đổi cache prefix = mất cache 1 lần |
| 5 | **`turnIndex` duy nhất trong session** thay vì server tự sinh | Chống double-submit từ client (race) | Lỗi `409` khi trùng index |
| 6 | **Báo cáo AI-13 lưu vào `InterviewSession.report` (JSON)** | Báo cáo là 1 blob đọc nhiều lần; tách bảng con sẽ tốn query mà không dùng | Đổi cấu trúc report → cần migrate JSON (chấp nhận được Phase 1) |
| 7 | **Verify trích dẫn bằng `answer.includes(quote)`** trước khi lưu | Chống AI bịa trích dẫn (R-MI-4) | Trích dẫn sai → bỏ trích dẫn, giữ nhận xét |
| 8 | **Skill yếu chọn bằng SQL + 4 khoá sắp xếp, có khoá ổn định `name`** | AC-10 yêu cầu ưu tiên ít bằng chứng nhất; khoá ổn định giúp điểm lặp lại được (R9) | Cùng dữ liệu → cùng thứ tự → cùng câu hỏi |
| 9 | **Tách `weak-skills.ts` khỏi Prisma** | Thuật toán cần test bằng dữ liệu giả để kiểm AC-10 | Hàm nhận mảng `{ id, name, evidenceCount, avgRating, level }` thuần |
| 10 | **Không dùng AI-13 nếu phiên chưa đủ câu** | Báo cáo trên 2 câu là ảo tưởng | Endpoint trả `409`; UI hiện "kết quả tạm thời" chỉ khi người dùng chủ động bấm |
| 11 | **Component Client chỉ ở S16 và S17** | S18 là báo cáo tĩnh → Server Component render trực tiếp | S18 tải nhanh, index được cho crawler/print |
| 12 | **Không dùng ảnh avatar từ mạng** (prototype dùng URL Google) | P6 local-first + NFR-03 offline | Thay bằng icon `neurology` trong `bg-surface-container-high rounded-xl` |

### 2.4 Hợp đồng API chi tiết (payload thật)

```ts
// ── POST /api/interview/profiles ─────────────────────────
export const ProfileUpsertSchema = z.object({
  label: z.string().min(1).max(60),
  jobTitle: z.string().min(1).max(80),
  seniority: z.enum(["junior", "mid", "senior", "lead"]),
  language: z.enum(["en", "vi"]),
  questionKinds: z.array(z.enum(["concept","design","debug","tradeoff","behavioral"])).min(1),
  focusSkills: z.array(z.string().min(1)).max(12),
  answerMode: z.enum(["text", "voice"]).default("text"),
  englishClarity: z.boolean().default(false),
});

// ── POST /api/interview/start ────────────────────────────
export const StartRequestSchema = z.object({
  profileId: z.string().min(1),
  plannedCount: z.union([z.literal(5), z.literal(8), z.literal(12)]),
  questionKinds: z.array(z.enum(["concept","design","debug","tradeoff","behavioral"])).min(1),
  focusSkills: z.array(z.string().min(1)).max(12).optional(),  // user ghim tay
  answerMode: z.enum(["text", "voice"]),
  englishClarity: z.boolean(),
  adaptive: z.boolean().default(true),
});

// ── POST /api/interview/turn ─────────────────────────────
export const TurnRequestSchema = z.object({
  sessionId: z.string().min(1),
  turnIndex: z.number().int().min(1),
  answer: z.string().min(1).max(20000),   // server cắt còn 2000+500 khi gửi AI
});

// ── POST /api/interview/report ───────────────────────────
export const ReportRequestSchema = z.object({ sessionId: z.string().min(1) });

// ── POST /api/interview/flag ─────────────────────────────
export const FlagRequestSchema = z.object({
  turnId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

// ── PATCH /api/interview/sessions/[id] ───────────────────
export const SessionStatusSchema = z.object({
  status: z.enum(["paused", "active", "abandoned"]),
});
```

**Shape response chuẩn (dùng cho mọi route):**

```ts
export type ApiOk<T>  = { ok: true;  data: T };
export type ApiErr    = { ok: false; error: { code: string; message: string; details?: unknown } };
export type ApiResult<T> = ApiOk<T> | ApiErr;
```

**Mã lỗi chuẩn:**

| `error.code` | HTTP | Nguồn |
|---|---|---|
| `INVALID_BODY` | 400 | Zod parse fail |
| `NOT_FOUND` | 404 | profile / session / turn không tồn tại |
| `CONFLICT` | 409 | trùng `turnIndex`, phiên đã `done`, đã có phiên `active` |
| `AUTH` | 401 | `AuthenticationError` |
| `RATE_LIMIT` | 429 | `RateLimitError` |
| `REFUSAL` | 422 | `stop_reason === 'refusal'` |
| `UPSTREAM` | 502 | `APIStatusError` 5xx |
| `TIMEOUT` | 504 | `APIConnectionError` |
| `NO_API_KEY` | 503 | thiếu `ANTHROPIC_API_KEY` |
| `AI_SCHEMA_ERROR` | 502 | AI trả sai shape (đã log, không ghi turn) |

---

## 3. Thành phần

### 3.1 `src/lib/interview/rubric.ts` — hằng số rubric & tính điểm

**Route/đường dẫn:** `src/lib/interview/rubric.ts`

**Responsibilities:**
- Khai báo rubric kỹ thuật 5 tiêu chí và rubric hành vi 4 tiêu chí (P4 — không để AI tự định nghĩa).
- Tính điểm tổng của một lượt và của cả phiên.
- Cung cấp `RUBRIC_BLOCK` (chuỗi text) để nhúng vào system prompt dưới `cache_control`.

**Interfaces:**

```ts
// src/lib/interview/rubric.ts

export type RubricKey = "accuracy" | "depth" | "reasoning" | "communication" | "tradeoff";
export type BehavioralRubricKey = "specific" | "star" | "selfaware" | "outcome";
export type QuestionKind = "concept" | "design" | "debug" | "tradeoff" | "behavioral";

export interface RubricCriterion {
  readonly key: RubricKey;
  readonly name: string;
  readonly desc: string;
}

export interface BehavioralCriterion {
  readonly key: BehavioralRubricKey;
  readonly name: string;
  readonly desc: string;
}

/** Câu hỏi dạng nào dùng rubric nào. behavioral → rubric hành vi, còn lại → rubric kỹ thuật. */
export const RUBRIC_BY_KIND: Record<QuestionKind, "technical" | "behavioral"> = {
  concept: "technical",
  design: "technical",
  debug: "technical",
  tradeoff: "technical",
  behavioral: "behavioral",
};

export const RUBRIC_TECHNICAL: readonly RubricCriterion[] = [
  { key: "accuracy",      name: "Chính xác",           desc: "Nội dung kỹ thuật đúng, không sai lệch kiến thức nền" },
  { key: "depth",         name: "Chiều sâu",           desc: "Đi sâu vào bản chất vấn đề, không dừng ở mặt ngoài" },
  { key: "reasoning",     name: "Lập luận",            desc: "Có chuỗi suy luận rõ ràng từ giả định đến kết luận" },
  { key: "communication", name: "Giao tiếp",           desc: "Diễn đạt rõ ràng, có cấu trúc, người nghe theo kịp" },
  { key: "tradeoff",      name: "Nhận biết đánh đổi", desc: "Nói được cái giá của lựa chọn và khi nào không dùng" },
] as const;

export const RUBRIC_BEHAVIORAL: readonly BehavioralCriterion[] = [
  { key: "specific",  name: "Cụ thể",      desc: "Có ví dụ cụ thể từ trải nghiệm thật, không nói chung chung" },
  { key: "star",      name: "Đầy đủ STAR", desc: "Rõ tình huống → nhiệm vụ → hành động → kết quả" },
  { key: "selfaware", name: "Tự nhận thức", desc: "Nhận ra điều mình làm chưa tốt và vì sao" },
  { key: "outcome",   name: "Kết quả",     desc: "Kết quả có thể đo được, không chỉ là cảm nhận" },
] as const;

export const RUBRIC_SCORE_MIN = 0;
export const RUBRIC_SCORE_MAX = 5;

export interface CriterionScore {
  score: number;   // 0..5
  note: string;    // bắt buộc, 1–2 câu (NFR-MI-08)
}

export type ScoresJson = Record<RubricKey, CriterionScore>;
export type BehavioralScoresJson = Record<BehavioralRubricKey, CriterionScore>;

/** Điểm tổng 1 lượt = trung bình các tiêu chí của rubric áp dụng. Làm tròn 2 chữ số. */
export function computeTurnTotal(
  scores: Partial<ScoresJson> | Partial<BehavioralScoresJson> | null | undefined,
  kind: QuestionKind,
): number;

/** Điểm tổng phiên = trung bình điểm tổng của các lượt ĐÃ trả lời. */
export function computeSessionTotal(turnTotals: number[]): number | null;

/** Clamp về [0,5], làm tròn 1 chữ số, loại bỏ key không thuộc rubric. */
export function sanitizeScores(raw: unknown, kind: QuestionKind): ScoresJson | BehavioralScoresJson;

/** Chuỗi rubric để nhúng vào system prompt (cache prefix). Phải ỔN ĐỊNH — không có timestamp/UUID. */
export const RUBRIC_BLOCK: string;
```

**Ghi chú:** `computeTurnTotal` trả `0` nếu không có tiêu chí nào hợp lệ (để UI không hiện `NaN`), nhưng `computeSessionTotal` trả `null` khi danh sách rỗng (phiên chưa có câu nào).

**Edge cases:**
- AI trả thêm key lạ (vd `clarity` trong `scores`) → `sanitizeScores` loại bỏ.
- AI trả điểm 5.7 hoặc -1 → clamp về [0,5].
- Câu `behavioral` có cả `scores` lẫn `behavioralScores` → lấy `behavioralScores`, bỏ `scores`.

---

### 3.2 `src/lib/interview/weak-skills.ts` — thuật toán chọn kỹ năng yếu

**Route/đường dẫn:** `src/lib/interview/weak-skills.ts`

**Responsibilities:**
- Chọn N node có **ít bằng chứng nhất** trong `focusSkills` (FR-MI-02, AC-10).
- Không phụ thuộc Prisma → nhận mảng dữ liệu thuần, trả về thứ tự đã sắp xếp.

**Interfaces:**

```ts
// src/lib/interview/weak-skills.ts

export interface SkillEvidenceStat {
  readonly skillId: string;
  readonly name: string;
  readonly level: number;             // 0..5
  readonly evidenceCount: number;     // tổng số Evidence
  readonly avgRating: number | null;  // null khi evidenceCount === 0
  readonly path: string;              // "Backend / Architecture / Core"
}

export type WeaknessBand = "P0" | "P1" | "P2";

export interface WeakSkillView extends SkillEvidenceStat {
  readonly band: WeaknessBand;
  /** score = evidenceCount*2 + (5 - level); dùng để hiển thị "Score: 0.0" trên S16 */
  readonly score: number;
}

export interface WeakSkillsOptions {
  readonly pinCount?: number;          // mặc định 2
  readonly includeAncestors?: boolean; // mặc định false
}

/**
 * Sắp xếp tăng dần theo 4 khoá:
 *   1. evidenceCount ASC  — ưu tiên mục ít bằng chứng nhất  (AC-10)
 *   2. avgRating ASC      — bằng chứng có nhưng yếu
 *   3. level ASC          — node level thấp
 *   4. name ASC           — khoá ổn định (R9: cùng dữ liệu → cùng kết quả)
 */
export function rankWeakSkills(
  stats: readonly SkillEvidenceStat[],
  options?: WeakSkillsOptions,
): WeakSkillView[];

/** Lấy đúng N node đầu sau khi rank. */
export function pickWeakSkills(
  stats: readonly SkillEvidenceStat[],
  count: number,
): WeakSkillView[];

/** Phân loại mức ưu tiên hiển thị trên S16. */
export function bandOf(evidenceCount: number, level: number): WeaknessBand;

/**
 * Truy vấn thống kê bằng chứng cho một danh sách skillId.
 * Đây là hàm DB — giữ ở đây để thuật toán và truy vấn nằm cùng file.
 */
export async function getSkillEvidenceStats(skillIds: string[]): Promise<SkillEvidenceStat[]>;
```

**SQL thực thi (Prisma raw, SQLite):**

```sql
SELECT s.id                AS skillId,
       s.name              AS name,
       s.level             AS level,
       COUNT(e.id)         AS evidenceCount,
       AVG(e.rating)       AS avgRating
FROM Skill s
LEFT JOIN Evidence e ON e.skillId = s.id
WHERE s.id IN (?, ?, ?)          -- focusSkills của hồ sơ
  AND s.domain = 'professional'
GROUP BY s.id, s.name, s.level
ORDER BY evidenceCount ASC, avgRating ASC, s.level ASC, s.name ASC
LIMIT ?;                        -- pinCount
```

**Quy tắc `bandOf`:**

| Band | Điều kiện | Nhãn UI ở S16 |
|---|---|---|
| `P0` | `evidenceCount === 0` | "Ưu tiên P0 · Cần kiểm thử" + badge `bg-error-container` "0 bằng chứng" |
| `P1` | `1 ≤ evidenceCount ≤ 2` | "Ưu tiên P1 · Khảo sát lại" + badge `bg-tertiary-container` "{n} bằng chứng (Level {L}/5)" |
| `P2` | `evidenceCount ≥ 3` | "Ưu tiên P2 · Đã có nền tảng" + badge `bg-surface-container-highest` "{n} bằng chứng" |

**Edge cases:**
- `focusSkills` rỗng → `getSkillEvidenceStats([])` trả `[]` → API trả `{ skills: [] }`, S16 hiện empty state "Cây kỹ năng chuyên môn đang trống".
- Một node bị xoá giữa lúc → `LEFT JOIN` trả `evidenceCount=0`, `avgRating=null`; `avgRating` null được xếp **sau** mọi giá trị số (coi như `Infinity`) để không bị ưu tiên sai.
- Tất cả node có 0 bằng chứng → xếp theo `level` rồi `name`; UI hiện badge "0 bằng chứng" + chú thích "Đây là các kỹ năng chưa có bằng chứng nào — bài kiểm tra đầu tiên của bạn".

---

### 3.3 `src/lib/interview/prompts.ts` — prompt & schema cho AI-11/12/13

**Route/đường dẫn:** `src/lib/interview/prompts.ts`

**Responsibilities:**
- 3 system prompt: `SYSTEM_INTERVIEW` (dùng chung cho AI-11 và AI-12), `SYSTEM_INTERVIEW_REPORT` (AI-13).
- 3 Zod schema: `StartQuestionSchema`, `TurnResultSchema`, `ReportSchema`.
- Khung `cache_control` đúng chuẩn (tech.md §4.2).

**Interfaces:**

```ts
// src/lib/interview/prompts.ts
import { z } from "zod";

export const QUESTION_KINDS = ["concept", "design", "debug", "tradeoff", "behavioral"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const SENIORITIES = ["junior", "mid", "senior", "lead"] as const;
export type Seniority = (typeof SENIORITIES)[number];

/* ────────── AI-11: sinh câu hỏi lượt 1 ────────── */

export const StartQuestionSchema = z.object({
  question: z.string().min(20).max(2000),
  kind: z.enum(QUESTION_KINDS),
  skillId: z.string().nullable(),
  skillName: z.string().nullable(),
  /** ≤ 60 từ, chỉ để interviewer mở đầu, không lộ đáp án */
  intro: z.string().max(400).nullable(),
});
export type StartQuestion = z.infer<typeof StartQuestionSchema>;

/* ────────── AI-12: chấm + sinh câu tiếp (1 call) ────────── */

const CriterionSchema = z.object({
  score: z.number().min(0).max(5),
  note: z.string().min(5).max(400),
});

export const TurnResultSchema = z.object({
  scores: z.record(z.enum(["accuracy","depth","reasoning","communication","tradeoff"]), CriterionSchema),
  behavioralScores: z
    .record(z.enum(["specific","star","selfaware","outcome"]), CriterionSchema)
    .nullable(),
  total: z.number().min(0).max(5),
  feedback: z.string().min(5).max(600),
  nextQuestion: z.object({
    question: z.string().min(20).max(2000),
    kind: z.enum(QUESTION_KINDS),
    skillId: z.string().nullable(),
    skillName: z.string().nullable(),
    isFollowUp: z.boolean(),
    reason: z.string().max(300),
  }).nullable(),
});
export type TurnResult = z.infer<typeof TurnResultSchema>;

/* ────────── AI-13: báo cáo cuối phiên ────────── */

export const ReportSchema = z.object({
  overallNote: z.string().min(10).max(1200),
  strengths: z.array(z.object({
    title: z.string().min(3).max(120),
    quote: z.string().min(10).max(400),
    turnIndex: z.number().int().min(1),
    comment: z.string().min(5).max(400),
  })).length(3),
  weaknesses: z.array(z.object({
    title: z.string().min(3).max(120),
    turnIndex: z.number().int().min(1),
    comment: z.string().min(5).max(400),
    suggestion: z.string().min(5).max(300),
  })).length(3),
  nextPractices: z.array(z.object({
    skillId: z.string(),
    skillName: z.string(),
    evidenceCount: z.number().int().min(0),
    action: z.string().min(5).max(200),
  })).min(1).max(3),
});
export type Report = z.infer<typeof ReportSchema>;

/* ────────── System prompt ────────── */

export const SYSTEM_INTERVIEW: string;
export const SYSTEM_INTERVIEW_REPORT: string;
export const RUBRIC_BLOCK: string;   // nhúng cả 2 rubric, dùng chung cache prefix

/** Ghép system blocks theo đúng thứ tự tools → system → messages (tech.md §4.2). */
export function buildInterviewSystemBlocks(): AnthropicTextBlockParam[];
```

**Cấu trúc `system` blocks (AI-11 / AI-12 — dùng chung prefix để ăn cache):**

```ts
system: [
  {
    type: "text",
    text: SYSTEM_INTERVIEW,          // đóng vai interviewer + quy tắc chấm (CỐ ĐỊNH, không timestamp)
  },
  {
    type: "text",
    text: RUBRIC_BLOCK,              // rubric 5 TC + 4 HC + hướng dẫn chấm (CỐ ĐỊNH)
    cache_control: { type: "ephemeral" },
  },
]
```

> **Quy tắc cache bất di bất dịch:** `SYSTEM_INTERVIEW` và `RUBRIC_BLOCK` phải **giống hệt nhau** giữa AI-11 và AI-12. `jobTitle`, `seniority`, `language`, `focusSkills`, `questionKinds` — **tất cả nằm trong `messages`**, không nằm trong `system`. Nếu đưa hồ sơ vào system, mỗi hồ sơ sẽ phá cache.

**Nội dung `RUBRIC_BLOCK` (ngắn gọn, phải đủ ngưỡng cache):**

```
RUBRIC KỸ THUẬT (áp dụng cho concept/design/debug/tradeoff) — thang 0..5, chấm đúng 5 tiêu chí:
1. accuracy — Chính xác: nội dung kỹ thuật đúng, không sai lệch kiến thức nền.
2. depth — Chiều sâu: đi sâu vào bản chất vấn đề, không dừng ở mặt ngoài.
3. reasoning — Lập luận: có chuỗi suy luận rõ ràng từ giả định đến kết luận.
4. communication — Giao tiếp: diễn đạt rõ ràng, có cấu trúc, người nghe theo kịp.
5. tradeoff — Nhận biết đánh đổi: nói được cái giá của lựa chọn và khi nào không dùng.

RUBRIC HÀNH VI (áp dụng cho behavioral) — thang 0..5, chấm đúng 4 tiêu chí:
1. specific — Cụ thể: có ví dụ cụ thể từ trải nghiệm thật.
2. star — Đầy đủ STAR: tình huống → nhiệm vụ → hành động → kết quả.
3. selfaware — Tự nhận thức: nhận ra điều mình làm chưa tốt và vì sao.
4. outcome — Kết quả: kết quả có thể đo được, không chỉ là cảm nhận.

QUY TẮC CHẤM:
- Chỉ chấm theo các tiêu chí liệt kê trên. Không thêm, không đổi, không gộp tiêu chí.
- Mỗi tiêu chí trả {score: 0..5, note: 1..2 câu giải thích cụ thể dựa trên câu trả lời}.
- note phải trích dẫn/điểm danh cụ thể trong câu trả lời, không được chung chung.
- total = trung bình các tiêu chí đã chấm (làm tròn 2 chữ số).
- Câu trả lời rỗng hoặc không liên quan → điểm 0 và note nói rõ vì sao.
- Không chấm thêm tiêu chí nào ngoài danh sách. Không bỏ tiêu chí nào.
```

---

### 3.4 `src/lib/anthropic.ts` — wrapper & prompt caching

**Route/đường dẫn:** `src/lib/anthropic.ts`

**Responsibilities:**
- Một entry point duy nhất cho mọi lời gọi AI → tự ghi `AiCall` (tokens, cache read/write, cost).
- Quản lý `cache_control` đúng chuẩn và phát hiện silent invalidator.

**Interfaces:**

```ts
// src/lib/anthropic.ts

export interface CallOptions<T> {
  readonly feature: "mock_interview";
  readonly system: AnthropicTextBlockParam[];
  readonly messages: AnthropicMessageParam[];
  readonly schema: z.ZodType<T>;
  readonly maxTokens?: number;      // default 8000
  readonly effort?: "low" | "medium" | "high";  // default "medium"
  readonly temperature?: number;    // default: KHÔNG đặt cao (R9) — dùng mặc định model
}

export interface CallResult<T> {
  readonly data: T;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheRead: number;
    readonly cacheWrite: number;
    readonly estimatedCost: number;
  };
}

export async function callStructured<T>(opts: CallOptions<T>): Promise<CallResult<T>>;

/** Đọc cache_read_input_tokens của call gần nhất — dùng cho assert AC-5. */
export async function assertCacheHit(feature: string): Promise<boolean>;
```

**Cách giữ prompt cache (chi tiết):**

```
tools:     (không dùng)
system:   [ SYSTEM_INTERVIEW (cố định), RUBRIC_BLOCK (cố định, cache_control: ephemeral) ]
messages: [ user: <profile + skill context + lịch sử hội thoại> ]
```

| # | Quy tắc | Lý do |
|---|---|---|
| 1 | System prompt **chỉ** chứa nội dung không đổi giữa các lượt | Mọi thứ biến động phải nằm sau breakpoint cuối cùng |
| 2 | `jobTitle`, `seniority`, `language`, `focusSkills`, `questionKinds`, lịch sử hội thoại → **trong `messages`** | Đặt vào system sẽ phá cache mỗi hồ sơ / mỗi lượt |
| 3 | Không chèn `Date.now()`, UUID, sessionId vào system | Phá cache mỗi lượt |
| 4 | Lịch sử hội thoại **chỉ append** — không sửa, không xoá lượt cũ | Prefix giống nhau giữa lượt → cache đọc |
| 5 | Kiểm chứng: `usage.cache_read_input_tokens` của lượt 2 phải > 0 | = 0 ⇒ có silent invalidator → phải sửa (AC-5) |
| 6 | System prompt phải đủ dài (ngưỡng cache 512–4096 token tuỳ model) | Nếu quá ngắn sẽ **im lặng không cache** |

**Cấu trúc `messages` cho AI-12 (1 call = chấm + sinh câu tiếp):**

```ts
messages: [
  {
    role: "user",
    content: [
      { type: "text", text: PROFILE_BLOCK },   // hồ sơ vai trò (biến động, nằm ở messages)
      { type: "text", text: SKILL_BLOCK },     // node kỹ năng được ghim + mức bằng chứng
    ],
  },
  ...historyMessages,   // append-only: [{role:"user", content: câu hỏi}, {role:"assistant", content: câu trả lời}, ...]
  {
    role: "user",
    content: [
      { type: "text", text: TURN_BLOCK },      // câu hỏi hiện tại + câu trả lời của ứng viên
      { type: "text", text: INSTRUCTION_BLOCK } // yêu cầu: chấm + sinh câu tiếp (adaptive)
    ],
  },
]
```

**Cấu trúc `messages` cho AI-13:**

```ts
messages: [
  { role: "user", content: [{ type: "text", text: PROFILE_BLOCK }, { type: "text", text: TRANSCRIPT_BLOCK }] },
  { role: "user", content: [{ type: "text", text: REPORT_INSTRUCTION_BLOCK }] },
]
```

> `TRANSCRIPT_BLOCK` chứa toàn bộ transcript + điểm từng lượt. Vì AI-13 chỉ gọi **1 lần** cuối phiên, không cần cache prefix hơn — dùng `effort: "high"`.

**Ước tính chi phí (SPEC §2.8.3):**

| Hạng mục | Ghi chú |
|---|---|
| 1 phiên 8 câu | 1 call AI-11 + 8 call AI-12 = **9 call** |
| Token | Hệ thống ~2.5K token (cache) · lịch sử tăng dần ~400 token/lượt |
| Chi phí | **~$0.15–0.30 / phiên** → 2 phiên/tuần ≈ **$1–2.5/tháng** |
| Ghi log | Mỗi call → 1 dòng `AiCall{feature:'mock_interview'}`; S15 tổng hợp |

---

### 3.5 `src/lib/interview/turn-machine.ts` — quy tắc lượt & adaptive

**Route/đường dẫn:** `src/lib/interview/turn-machine.ts`

**Responsibilities:**
- Kiểm tra tính hợp lệ của một lượt trước khi gọi AI.
- Áp dụng **quy tắc adaptive** sau khi AI trả kết quả (sửa follow-up thừa, gắn lại `skillId`).
- Xác định khi nào phiên `done`.

**Interfaces:**

```ts
// src/lib/interview/turn-machine.ts

export interface TurnContext {
  readonly sessionId: string;
  readonly turnIndex: number;              // 1-based
  readonly plannedCount: number;
  readonly askedCount: number;
  readonly status: "active" | "paused" | "done" | "abandoned";
  readonly answerMode: "text" | "voice";
  readonly language: "en" | "vi";
  readonly adaptive: boolean;             // bật Adaptive Loop (FR-MI-06)
  readonly englishClarity: boolean;       // FR-MI-14
}

export type TurnValidation =
  | { readonly ok: true; readonly answer: string }
  | {
      readonly ok: false;
      readonly code: "EMPTY_ANSWER" | "SESSION_PAUSED" | "INDEX_MISMATCH" | "SESSION_DONE";
      readonly message: string;
    };

export function validateTurn(ctx: TurnContext, rawAnswer: string): TurnValidation;

/** Điều kiện follow-up: câu vừa trả lời "đủ" → chuyển câu mới; "hời hợt" → follow-up. */
export function shouldFollowUp(scores: ScoresJson | BehavioralScoresJson): boolean;

/**
 * Hậu xử lý kết quả AI-12:
 *  - nếu AI sinh follow-up nhưng câu vừa rồi đã đạt (mọi TC >= 3.5 và total >= 4.2) → ép câu mới
 *  - nếu nextSkillId không thuộc skillsFocused → gắn lại node yếu kế tiếp
 *  - nếu phiên đã đủ câu → nextQuestion = null
 */
export function normalizeTurnResult(
  result: TurnResult,
  ctx: TurnContext,
  focusedSkillIds: readonly string[],
  fallbackSkillId: string | null,
): TurnResult;

/** Chuẩn bị payload cho AI-12 (1 call) — cắt bớt câu trả lời quá dài. */
export function buildTurnPromptInput(answer: string, maxChars?: number): { answer: string; truncated: boolean };

/** Tính điểm "clarity of expression" cho phiên tiếng Anh (FR-MI-14, P2). */
export function computeClarityScore(
  answer: string,
  result: TurnResult,
): number | null;
```

**Quy tắc `shouldFollowUp` (thuật toán adaptive, FR-MI-06):**

```
minScore = min(trả về điểm của các tiêu chí đã chấm)
avgScore = total của lượt

FOLLOW_UP nếu  minScore < 3.0                      (hời hợt rõ ràng)
FOLLOW_UP nếu  avgScore < 3.5                      (chưa đạt)
FOLLOW_UP nếu  tiêu chí "depth" < 2.5              (thiếu chiều sâu — case chính)
FOLLOW_UP nếu  tiêu chí "tradeoff" < 2.5            (thiếu nhận biết đánh đổi)
FOLLOW_UP nếu  câu là "behavioral" và "star" < 2.5  (thiếu cấu trúc STAR)
KHÔNG follow-up nếu minScore >= 3.5 và avgScore >= 4.2 (đã đủ) → chuyển câu mới

Nếu adaptive = false → luôn chuyển câu mới.
```

**Edge cases:**
- Câu trả lời rỗng → `validateTurn` trả `EMPTY_ANSWER`, **không gọi AI**. UI đã disable nút nhưng server vẫn phải chặn.
- Câu trả lời > 3000 ký tự → `buildTurnPromptInput` cắt còn 2000 ký tự đầu + 500 ký tự cuối, chèn `[...bị cắt...]`. **DB vẫn lưu nguyên văn.**
- Phiên `paused` → `SESSION_PAUSED` (409). Phải resume trước.
- `turnIndex` không khớp lượt đang chờ → `INDEX_MISMATCH` (409).
- AI trả `nextQuestion = null` khi phiên chưa đủ câu → `normalizeTurnResult` **sinh lại** bằng cách gọi lại? **Không** — thay vào đó đánh dấu lượt cần sinh câu và UI hiện "AI chưa sinh được câu tiếp — [Sinh câu mới]". Endpoint `POST /api/interview/turn` với `answer=null` sinh câu mới (không chấm).
- `computeClarityScore` chỉ chạy khi `englishClarity=true` **và** `language='en'` **và** `answerMode='voice'`; trả `null` ở các trường hợp khác → cột `clarityScore` null.

---

### 3.6 `src/lib/interview/report.ts` — chuẩn hoá báo cáo & verify trích dẫn

**Route/đường dẫn:** `src/lib/interview/report.ts`

**Responsibilities:**
- Chuẩn hoá output AI-13 về đúng shape của spec (đúng 3 mạnh / 3 yếu).
- Verify trích dẫn có thật trong transcript.
- Sinh `nextPractices` từ `skillsFocused` + số bằng chứng thật.

**Interfaces:**

```ts
// src/lib/interview/report.ts

export interface TurnTranscript {
  readonly index: number;        // 1-based
  readonly question: string;
  readonly kind: QuestionKind;
  readonly answer: string | null;
  readonly skillName: string | null;
  readonly total: number | null;
  readonly rubric: Record<string, number>;   // key → điểm trung bình của phiên theo tiêu chí
}

export interface NormalizedReport {
  readonly overallNote: string;
  readonly strengths: Array<{
    title: string; quote: string | null; turnIndex: number; comment: string; autoGenerated: boolean;
  }>;
  readonly weaknesses: Array<{
    title: string; turnIndex: number; comment: string; suggestion: string; autoGenerated: boolean;
  }>;
  readonly nextPractices: Array<{
    skillId: string; skillName: string; evidenceCount: number; action: string;
  }>;
  readonly rubric: Record<string, number>;
  readonly totalScore: number;
}

export function normalizeReport(raw: Report, transcript: TurnTranscript[]): NormalizedReport;

/** true nếu quote là nguyên văn (sau khi chuẩn hoá whitespace) trong answer của turn. */
export function isVerbatimQuote(quote: string, answer: string | null): boolean;

/** Sinh đề xuất luyện tiếp khi AI trả nextPractices rỗng hoặc skillId không hợp lệ. */
export function buildFallbackPractices(
  focused: Array<{ skillId: string; skillName: string; evidenceCount: number }>,
): NormalizedReport["nextPractices"];
```

**Quy tắc chuẩn hoá (thứ tự áp dụng):**

1. **Cắt còn đúng 3** `strengths` và 3 `weaknesses` (AI trả nhiều hơn → lấy 3 cái đầu; AI trả ít hơn → điền bằng mục suy ra từ rubric thấp nhất, gắn `autoGenerated: true`).
2. **Verify trích dẫn:** `isVerbatimQuote(quote, turn.answer)` — chuẩn hoá whitespace (`\s+ → " "`, trim) rồi `answer.includes(quote)`. Không khớp → `quote = null` (giữ `comment`), **không** hiển thị trích dẫn sai.
3. **Validate `turnIndex`:** phải nằm trong `[1, số câu đã trả lời]`. Không hợp lệ → gán câu có điểm thấp nhất.
4. **Validate `nextPractices`:** `skillId` phải tồn tại trong `skillsFocused` của phiên. Không hợp lệ → thay bằng `buildFallbackPractices`.
5. **Fallback practices:** lấy node yếu nhất trong `skillsFocused` (theo cùng thứ tự 4 khoá của §3.2), `action` = mẫu câu `"Tạo 3 bài tập về {skillName}"` hoặc `"Thực hành {skillName}"`.
6. **Tính `rubric`:** trung bình điểm của từng tiêu chí rubric trên toàn bộ lượt đã trả lời (không dùng giá trị AI trả — tính lại để đảm bảo nhất quán với AC-9).

**Edge cases:**
- AI trả `turnIndex` vượt quá số câu → gán lại câu có điểm thấp nhất, `autoGenerated=true`.
- AI trả 5 mạnh / 1 yếu → cắt mạnh còn 3, yếu điền bằng 2 mục suy ra.
- Câu hỏi mà không có câu trả lời (dừng giữa chừng) → không được AI trích dẫn; verify sẽ loại quote vì `answer === null`.
- `nextPractices` rỗng → `buildFallbackPractices` đảm bảo S18 luôn có ≥1 đề xuất.

---

### 3.7 `src/lib/interview/delta.ts` — so sánh 2 phiên

**Route/đường dẫn:** `src/lib/interview/delta.ts`

**Responsibilities:**
- Tìm phiên trước cùng hồ sơ và tính delta từng tiêu chí (FR-MI-09, AC-13).

**Interfaces:**

```ts
// src/lib/interview/delta.ts

export interface SessionRubricScores {
  readonly accuracy: number;
  readonly depth: number;
  readonly reasoning: number;
  readonly communication: number;
  readonly tradeoff: number;
}

export interface RubricDelta {
  readonly key: keyof SessionRubricScores;
  readonly current: number;
  readonly previous: number;
  readonly delta: number;         // current - previous, làm tròn 2 chữ số
  readonly direction: "up" | "down" | "flat";
}

export interface SessionComparison {
  readonly previousSessionId: string | null;
  readonly previousStartedAt: Date | null;
  readonly previousTotal: number | null;
  readonly totalDelta: number | null;
  readonly rubricDeltas: RubricDelta[];
  readonly hasPrevious: boolean;
}

/** Tính điểm rubric của 1 phiên từ các lượt đã trả lời. */
export function computeSessionRubric(turns: Array<{ kind: QuestionKind; scores: unknown }>): SessionRubricScores;

/** Tìm phiên `done` gần nhất trước phiên hiện tại, CÙNG profileId. */
export async function findPreviousSession(profileId: string, startedAt: Date): Promise<SessionComparison | null>;

/** Tính delta giữa 2 bảng điểm rubric. */
export function diffRubric(current: SessionRubricScores, previous: SessionRubricScores): RubricDelta[];
```

**Quy tắc:**
- "Phiên trước" = phiên có `status='done'`, `profileId` **giống hệt**, `startedAt < current.startedAt`, sắp xếp `startedAt DESC`, lấy 1. **Không** so sánh chéo hồ sơ (AC-13).
- Không có phiên trước → `hasPrevious = false`; UI hiện "Phiên đầu tiên với hồ sơ này — chưa có dữ liệu so sánh" (không hiện `+0.0`).
- `direction`: `delta > 0.05` → "up"; `delta < -0.05` → "down"; còn lại → "flat" (chống nhiễu số thập phân).
- Điểm làm tròn 1 chữ số khi hiển thị; delta 2 chữ số.

**SQL tìm phiên trước:**

```sql
SELECT id, startedAt, totalScore FROM InterviewSession
WHERE profileId = ?
  AND status = 'done'
  AND startedAt < ?
ORDER BY startedAt DESC
LIMIT 1;
```

---

### 3.8 `src/lib/interview/activity.ts` — tạo Activity + Evidence
**Route/đường dẫn:** `src/lib/interview/activity.ts`

**Responsibilities:**
- Tạo **đúng 1** `Activity` + **đúng 1** `Evidence` khi phiên chuyển `done` (FR-MI-10, AC-MI-15).
- Idempotent — gọi lại không tạo bản ghi thứ hai.

**Interfaces:**

```ts
// src/lib/interview/activity.ts

export interface SessionOutcome {
  readonly sessionId: string;
  readonly profileId: string;
  readonly label: string;              // "Backend Engineer"
  readonly jobTitle: string;
  readonly totalScore: number;        // điểm tổng phiên
  readonly answeredCount: number;
  readonly minutes: number;           // thời lượng thực tế
  readonly primarySkillId: string | null;
  readonly primarySkillName: string | null;
  readonly report: NormalizedReport | null;
}

/** Tạo Activity + Evidence trong 1 transaction. Idempotent theo sessionId. */
export async function persistSessionOutcome(outcome: SessionOutcome): Promise<{
  activityId: string;
  evidenceId: string | null;
  created: boolean;          // false nếu đã tồn tại (idempotent)
}>;

/** Chọn skill trọng tâm: node trong skillsFocused có nhiều lượt hỏi nhất; tie → node yếu nhất. */
export function pickPrimarySkill(
  skillsFocused: string[],
  turnSkillIds: Array<string | null>,
): string | null;

/** Điểm Evidence (1..4) từ điểm tổng phiên (0..5). */
export function toEvidenceRating(totalScore: number): 1 | 2 | 3 | 4;
```

**Quy tắc:**

```ts
// toEvidenceRating — ngưỡng nội bộ
totalScore >= 4.5 → 4
totalScore >= 3.5 → 3
totalScore >= 2.5 → 2
totalScore       → 1
```

**Ghi `Activity`:**

| Field | Value |
|---|---|
| `skillId` | `primarySkillId` (skill trọng tâm) |
| `domain` | `"professional"` |
| `type` | `"mock_interview"` |
| `minutes` | `outcome.minutes` (bội số 5, tối thiểu 5) |
| `title` | `Phỏng vấn ${label}` |
| `content` | tóm tắt: `${answeredCount} câu · ${jobTitle} · ${lang}` |
| `quality` | `null` (không tự chấm) |
| `aiScore` | `outcome.totalScore` |

**Ghi `Evidence`:**

| Field | Value |
|---|---|
| `activityId` | `activity.id` |
| `skillId` | `primarySkillId` |
| `rating` | `toEvidenceRating(totalScore)` (1–4) |

**Idempotency:** `InterviewSession.activity` là quan hệ 1–1 (`activityId` unique ở phía `Activity`). Trước khi tạo, query `Activity` theo `title` + `createdAt` không ổn định → dùng cách chắc chắn: tạo `Activity` trong transaction với `create` chỉ khi `session.activity == null`; `InterviewSession` có quan hệ `activity Activity?` — Prisma không có `activityId` trên `InterviewSession` trong schema SPEC §4, nên dùng `updateMany` có điều kiện:

```ts
await prisma.$transaction(async (tx) => {
  const created = await tx.activity.create({ data: { /* ... */ } });
  await tx.evidence.create({ data: { activityId: created.id, skillId, rating } });
  // đánh dấu đã ghi bằng chính Activity.title chứa sessionId
  await tx.activity.update({
    where: { id: created.id },
    data: { content: `${content} · session:${sessionId}` },
  });
});
```

> Ghi chú: schema SPEC §4 để `InterviewSession.activity Activity?` nhưng **không có `activityId`** → quan hệ đọc 1-nhiều ngược. Trong implement Phase 1, thêm cột `activityId String? @unique` vào `InterviewSession` (migration nhỏ, không đổi ý nghĩa model) để có quan hệ 1–1 thật sự và idempotency chắc chắn. Nếu không muốn đổi schema, dùng `sessionId` trong `Activity.content` và query `WHERE content LIKE '%session:<id>%'` — kém đẹp hơn nhưng không cần migration. **Khuyến nghị: thêm `activityId`.**

---

### 3.9 `src/lib/interview/session-state.ts` — state machine & resume

**Route/đường dẫn:** `src/lib/interview/session-state.ts`

**Responsibilities:**
- Nguồn chân lý về trạng thái phiên (`active` / `paused` / `done` / `abandoned`).
- Xác định **câu đang dở** để resume — đây là mấu chốt của FR-MI-13.
- Tính `minutes` (thời lượng thực tế) để ghi vào `Activity`.

**Interfaces:**

```ts
// src/lib/interview/session-state.ts

export type SessionStatus = "active" | "paused" | "done" | "abandoned";

export interface SessionSnapshot {
  readonly id: string;
  readonly status: SessionStatus;
  readonly plannedCount: number;
  readonly askedCount: number;
  readonly turns: ReadonlyArray<{
    readonly id: string;
    readonly index: number;
    readonly answer: string | null;
    readonly total: number | null;
  }>;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
}

/**
 * Câu đang dở = turn có index = askedCount (đã sinh nhưng chưa trả lời).
 * Nếu không có turn nào chờ → phiên đã hết câu → currentTurnIndex = null.
 */
export function currentTurnIndex(session: SessionSnapshot): number | null;

/** Câu cuối cùng đã trả lời (để hiển thị panel "Đánh giá Câu N-1"). */
export function lastAnsweredTurnIndex(session: SessionSnapshot): number | null;

/** Các chuyển trạng thái hợp lệ. */
export function canTransition(from: SessionStatus, to: SessionStatus): boolean;

/** Thời lượng thực tế (phút, bội số 5, tối thiểu 5). */
export function computeSessionMinutes(session: SessionSnapshot, now?: Date): number;

/** Trạng thái phiên mới tính từ `askedCount` sau khi gửi 1 lượt. */
export function statusAfterTurn(askedCount: number, plannedCount: number): SessionStatus;
```

**Quy tắc chuyển trạng thái:**

```
active   → paused      (người dùng bấm "Tạm dừng & Lưu")
active   → done        (đủ câu)
active   → abandoned   (người dùng bấm "Bỏ phiên")
paused   → active      (người dùng bấm "Tiếp tục")
paused   → abandoned
done     → (không)     — phiên đã kết thúc, không hồi sinh
abandoned→ (không)     — phiên bị bỏ, không hồi sinh
```

**Cơ chế resume (FR-MI-13) — chi tiết:**

| Bước | Thực hiện | Nguồn dữ liệu |
|---|---|---|
| 1 | Người dùng bấm "Tạm dừng & Lưu" | `PATCH /api/interview/sessions/[id]` `{status:'paused'}` → set `status`, giữ `askedCount`, `endedAt` vẫn `null` |
| 2 | Người dùng đóng tab / refresh | Mọi lượt đã chấm **đã nằm trong DB** → không mất gì |
| 3 | Người dùng mở lại S16 | Query `InterviewSession` có `status IN ('paused','abandoned')` và `profileId` đang chọn → hiện banner resume |
| 4 | Người dùng mở lại S17 | Server load session + turns → `currentTurnIndex(session)` trả về index của câu chưa có `answer` |
| 5 | Render | Các lượt **đã trả lời** hiển thị ở chế độ đọc (câu + điểm thu gọn); câu đang dở hiển thị ở chế độ nhập |
| 6 | Khôi phục nội dung textarea | `localStorage["mi:draft:{sessionId}:{turnIndex}"]` (autosave 800ms). Nếu không có → để trống, không mất turn nào đã chấm |
| 7 | Đồng hồ | Reset về 0 cho câu hiện tại (đo thời gian **trả lời**, không phải thời gian phiên) |
| 8 | Tiếp tục | `PATCH` `{status:'active'}` → `POST /api/interview/turn` với `turnIndex` = câu đang dở |

**Quy tắc bất di bất dịch:** `askedCount` tăng **ngay khi sinh câu hỏi** (không phải khi trả lời). Nhờ vậy "câu đang dở" luôn xác định được mà không cần cột riêng, và câu đã hỏi nhưng chưa trả lời không bị mất khi refresh.

---

### 3.10 `components/interview/interview-setup.tsx` (Client)

**Route/đường dẫn:** `src/components/interview/interview-setup.tsx`
**Route màn hình:** `/interview/setup`

**Responsibilities:**
- Render 3 section cột trái + 3 card cột phải.
- Quản lý chọn hồ sơ, tạo/sửa hồ sơ (modal), chọn node thủ công, toggle dạng câu, chọn số câu, chọn phương thức trả lời.
- Gọi `POST /api/interview/start` và điều hướng sang S17.

**Interfaces:**

```ts
// src/components/interview/interview-setup.tsx
"use client";

export interface InterviewSetupProps {
  readonly profiles: ProfileView[];
  readonly weakSkills: WeakSkillView[];
  readonly skills: SkillOption[];         // node professional để chọn tay
  readonly resumedSessionId: string | null;
  readonly hasApiKey: boolean;
}

export interface ProfileView {
  readonly id: string;
  readonly label: string;
  readonly jobTitle: string;
  readonly seniority: "junior" | "mid" | "senior" | "lead";
  readonly language: "en" | "vi";
  readonly questionKinds: QuestionKind[];
  readonly focusSkills: string[];
  readonly answerMode: "text" | "voice";
  readonly englishClarity: boolean;
  readonly sessionCount: number;
  readonly averageScore: number | null;
}

export interface SkillOption {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly evidenceCount: number;
}

export default function InterviewSetup(props: InterviewSetupProps): JSX.Element;
```

**State cục bộ:**

```ts
const [selectedProfileId, setSelectedProfileId] = useState<string>(profiles[0]?.id ?? "");
const [plannedCount, setPlannedCount] = useState<5 | 8 | 12>(8);
const [questionKinds, setQuestionKinds] = useState<QuestionKind[]>(["concept", "design"]);
const [answerMode, setAnswerMode] = useState<"text" | "voice">("text");
const [adaptive, setAdaptive] = useState(true);
const [englishClarity, setEnglishClarity] = useState(false);
const [manualSkillIds, setManualSkillIds] = useState<string[]>([]);
const [isStarting, setIsStarting] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**Hành vi chính:**

```ts
async function handleStart(): Promise<void> {
  if (questionKinds.length === 0) { setError("Chọn ít nhất 1 dạng câu hỏi."); return; }
  setIsStarting(true);
  try {
    const res = await fetch("/api/interview/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: selectedProfileId,
        plannedCount,
        questionKinds,
        focusSkills: manualSkillIds.length > 0 ? manualSkillIds : undefined,
        answerMode,
        englishClarity: englishClarity && selectedProfile.language === "en",
        adaptive,
      }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error?.message ?? "Không khởi chạy được phiên.");
    router.push(`/interview/session?session=${json.data.sessionId}`);
  } catch (e) {
    setError(e instanceof Error ? e.message : "Lỗi không xác định");
  } finally {
    setIsStarting(false);
  }
}
```

**Dependencies:** `next/navigation` (`useRouter`), `src/lib/interview/rubric.ts` (nhãn rubric), `src/lib/interview/types.ts`.

**Edge cases:**
- `profiles.length === 0` → render empty state trong section Hồ sơ, disable mọi control khác, CTA duy nhất là "+ Tạo hồ sơ vai trò mới".
- `hasApiKey === false` → ẩn nút "Bắt đầu", hiện card "Thêm API key trong Cài đặt" + link `/settings`.
- `questionKinds.length === 0` → nút "Bắt đầu" disable, hiện nhắc.
- `answerMode === 'voice'` nhưng `window.SpeechRecognition` không tồn tại → option bị disable với lý do cụ thể.
- `resumedSessionId` khác null → render banner ở đầu trang: "Bạn có 1 phiên đang dở — Câu {k}/{n}" + nút "Tiếp tục".
- Bấm "Bắt đầu" 2 lần → `isStarting` disable nút ngay lập tức.

---

### 3.11 `components/interview/interview-session.tsx` (Client)

**Route/đường dẫn:** `src/components/interview/interview-session.tsx`
**Route màn hình:** `/interview/session`

**Responsibilities:**
- Render header, track 8 ô, card interviewer, card trả lời, panel điểm câu trước, panel phát âm.
- Timer, autosave, TTS đọc câu hỏi, STT nhận giọng nói.
- Submit lượt, render kết quả chấm + câu mới.

**Interfaces:**

```ts
// src/components/interview/interview-session.tsx
"use client";

export interface InterviewSessionProps {
  readonly sessionId: string;
  readonly profile: ProfileView;
  readonly turns: TurnView[];
  readonly currentTurnIndex: number;   // turn chưa có answer
  readonly status: "active" | "paused" | "done" | "abandoned";
}

export interface TurnView {
  readonly id: string;
  readonly index: number;
  readonly question: string;
  readonly kind: QuestionKind;
  readonly skillName: string | null;
  readonly skillId: string | null;
  readonly answer: string | null;
  readonly total: number | null;
  readonly scores: ScoresJson | null;
  readonly behavioralScores: BehavioralScoresJson | null;
  readonly feedback: string | null;
  readonly isFollowUp: boolean;
  readonly adaptiveReason: string | null;
  readonly flagged: boolean;
}

export default function InterviewSession(props: InterviewSessionProps): JSX.Element;
```

**State & hành vi chính:**

```ts
const [answer, setAnswer] = useState<string>(draft ?? "");
const [elapsedSec, setElapsedSec] = useState(0);
const [isSubmitting, setIsSubmitting] = useState(false);
const [isPaused, setIsPaused] = useState(props.status === "paused");
const [isRecording, setIsRecording] = useState(false);
const inFlightRef = useRef(false);      // chặn double-submit (Edge case)

const DRAFT_KEY = `mi:draft:${sessionId}:${turnIndex}`;

useEffect(() => {
  const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
  return () => clearInterval(t);
}, []);

useEffect(() => {                                  // autosave 800ms
  const id = setTimeout(() => localStorage.setItem(DRAFT_KEY, answer), 800);
  return () => clearTimeout(id);
}, [answer, DRAFT_KEY]);

async function handleSubmit(): Promise<void> {
  if (inFlightRef.current) return;
  if (answer.trim().length === 0) { setError("Câu trả lời trống — hãy trả lời ít nhất một câu."); return; }
  inFlightRef.current = true;
  setIsSubmitting(true);
  try {
    const res = await fetch("/api/interview/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, turnIndex, answer }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error?.message ?? "AI chưa phản hồi được.");
    localStorage.removeItem(DRAFT_KEY);
    router.refresh();                              // server state là nguồn chân lý
  } catch (e) {
    setError(e instanceof Error ? e.message : "Lỗi không xác định");
    // câu trả lời VẪN CÒN trong textarea + localStorage
  } finally {
    inFlightRef.current = false;
    setIsSubmitting(false);
  }
}
```

**TTS (đọc câu hỏi):**

```ts
function speakQuestion(text: string): void {
  const synth = window.speechSynthesis;
  if (!synth) { setError("Trình duyệt này không hỗ trợ đọc câu hỏi."); return; }
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = profile.language === "vi" ? "vi-VN" : "en-US";
  u.rate = 0.95;
  synth.speak(u);
}
```

**STT (nhận giọng nói):**

```ts
function startStt(): void {
  const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!SR) { setError("Trình duyệt này không hỗ trợ nhận giọng nói — dùng văn bản."); return; }
  const rec = new SR();
  rec.lang = profile.language === "vi" ? "vi-VN" : "en-US";
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (e: SpeechRecognitionEvent) => {
    let text = "";
    for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
    setAnswer((prev) => prev + " " + text);   // nối vào nội dung đang có
  };
  rec.onend = () => setIsRecording(false);
  rec.start();
  setIsRecording(true);
}
```

**Edge cases:**
- Refresh giữa chừng → `router.refresh()` lấy lại turn từ server; draft khôi phục từ `localStorage[DRAFT_KEY]`.
- `status === 'paused'` → hiện modal "Tiếp tục phiên?" với 2 lựa chọn: "Tiếp tục" (PATCH status → active) hoặc "Bỏ phiên" (PATCH status → abandoned).
- Lỗi AI → toast "AI chưa phản hồi được. Câu trả lời của bạn **đã được lưu**." + nút "Thử lại"; textarea giữ nguyên nội dung.
- Đủ câu → nút gửi đổi thành "Xem kết quả →" → `router.push(`/interview/${sessionId}`)`.
- Câu `behavioral` → hiện nút "Xem lại gợi ý cấu trúc (STAR)"; các câu khác → ẩn nút này.

---

### 3.12 `src/app/api/interview/*/route.ts` — hợp đồng handler

**Route/đường dẫn:** `src/app/api/interview/`

**Interfaces (tóm tắt — chi tiết ở `spec.md` §7):**

```ts
// src/app/api/interview/*/route.ts

// ── Hồ sơ vai trò ────────────────────────────────────────
export const GET_profiles  = (req: Request) => Promise<Response>;   // /api/interview/profiles
export const POST_profiles = (req: Request) => Promise<Response>;   // /api/interview/profiles
export const PATCH_profile = (req: Request, ctx: { params: { id: string } }) => Promise<Response>;
export const DELETE_profile = (req: Request, ctx: { params: { id: string } }) => Promise<Response>;

// ── Chọn kỹ năng yếu ─────────────────────────────────────
export const GET_weakSkills = (req: Request) => Promise<Response>;  // /api/interview/weak-skills?profileId=&count=

// ── Phiên ────────────────────────────────────────────────
export const POST_start   = (req: Request) => Promise<Response>;     // /api/interview/start   (AI-11)
export const POST_turn    = (req: Request) => Promise<Response>;     // /api/interview/turn    (AI-12)
export const POST_report  = (req: Request) => Promise<Response>;     // /api/interview/report  (AI-13)
export const GET_session  = (req: Request, ctx: { params: { id: string } }) => Promise<Response>;
export const GET_sessions = (req: Request) => Promise<Response>;     // /api/interview/sessions
export const PATCH_session = (req: Request, ctx: { params: { id: string } }) => Promise<Response>;
export const POST_flag    = (req: Request) => Promise<Response>;     // /api/interview/flag
export const GET_export   = (req: Request, ctx: { params: { id: string } }) => Promise<Response>;
```

**Bản đồ route → handler → lớp nghiệp vụ:**

| Route | Handler | Gọi lớp nghiệp vụ | Ghi DB |
|---|---|---|---|
| `GET /api/interview/profiles` | `GET_profiles` | — | đọc |
| `POST /api/interview/profiles` | `POST_profiles` | zod validate `focusSkills` tồn tại + domain `professional` | ghi |
| `PATCH /api/interview/profiles/[id]` | `PATCH_profile` | zod validate | ghi |
| `DELETE /api/interview/profiles/[id]` | `DELETE_profile` | cascade xoá session | ghi |
| `GET /api/interview/weak-skills` | `GET_weakSkills` | `getSkillEvidenceStats` → `rankWeakSkills` → `pickWeakSkills` | đọc |
| `POST /api/interview/start` | `POST_start` | `generateFirstQuestion` (AI-11) | tạo session + turn #1 |
| `POST /api/interview/turn` | `POST_turn` | `validateTurn` → AI-12 → `normalizeTurnResult` | update turn + create turn kế tiếp + update session |
| `POST /api/interview/report` | `POST_report` | AI-13 → `normalizeReport` → `persistSessionOutcome` | lưu `session.report` + Activity + Evidence |
| `GET /api/interview/[id]` | `GET_session` | `findPreviousSession` → `diffRubric` → `normalizeReport` (phòng thủ) | đọc |
| `GET /api/interview/sessions` | `GET_sessions` | — | đọc |
| `PATCH /api/interview/sessions/[id]` | `PATCH_session` | `canTransition` | update `status` |
| `POST /api/interview/flag` | `POST_flag` | — | update `flagged` + `flagReason` + ghi log `AiCall` |
| `GET /api/interview/[id]/export` | `GET_export` | — | đọc, trả file JSON |

```ts
// src/app/api/interview/turn/route.ts
export async function POST(req: Request): Promise<Response> {
  const parsed = TurnRequestSchema.safeParse(await req.json());
  if (!parsed.success) return fail(400, "INVALID_BODY", parsed.error.flatten());
  const { sessionId, turnIndex, answer } = parsed.data;

  const session = await prisma.interviewSession.findUnique({
    where: { id: sessionId },
    include: { profile: true, turns: { orderBy: { index: "asc" } } },
  });
  if (!session) return fail(404, "SESSION_NOT_FOUND");

  const ctx: TurnContext = { /* build từ session + profile */ };
  const validation = validateTurn(ctx, answer);
  if (!validation.ok) return fail(409, validation.code, validation.message);

  // 1 call AI-12: chấm + sinh câu tiếp
  const raw = await callStructured<TurnResult>({
    feature: "mock_interview",
    system: buildInterviewSystemBlocks(),
    messages: buildTurnMessages(session, currentTurn, validation.answer),
    schema: TurnResultSchema,
    effort: "medium",
    maxTokens: 8000,
  });

  const normalized = normalizeTurnResult(raw.data, ctx, session.skillsFocused, fallbackSkillId);

  // 1 transaction: cập nhật turn hiện tại + tạo turn kế tiếp + tăng askedCount
  const nextTurn = await prisma.$transaction(async (tx) => {
    await tx.interviewTurn.update({
      where: { id: currentTurn.id },
      data: {
        answer: validation.answer,
        scores: normalized.scores,
        behavioralScores: normalized.behavioralScores,
        total: normalized.total,
        feedback: normalized.feedback,
      },
    });
    if (normalized.nextQuestion) {
      return tx.interviewTurn.create({
        data: {
          sessionId, index: turnIndex + 1,
          question: normalized.nextQuestion.question,
          kind: normalized.nextQuestion.kind,
          skillId: normalized.nextQuestion.skillId,
          skillName: normalized.nextQuestion.skillName,
          isFollowUp: normalized.nextQuestion.isFollowUp,
          adaptiveReason: normalized.nextQuestion.reason,
        },
      });
    }
    return null;
  });

  const status = askedCountAfter >= plannedCount ? "done" : "active";
  await prisma.interviewSession.update({ where: { id: sessionId }, data: { askedCount: askedCountAfter, status } });

  return ok({ turn: updatedTurn, nextTurn, session: { askedCount: askedCountAfter, status } });
}
```

**Error mapping (chung cho mọi route):**

| Lỗi Anthropic | HTTP | `error.code` | Thông báo UI |
|---|---|---|---|
| `AuthenticationError` | 401 | `AUTH` | "API key không hợp lệ — kiểm tra lại trong Cài đặt." |
| `RateLimitError` | 429 | `RATE_LIMIT` | "AI đang bận. Thử lại sau vài giây." |
| `stop_reason === 'refusal'` | 422 | `REFUSAL` | "AI không thể xử lý nội dung này. Câu trả lời của bạn vẫn được lưu." |
| `APIStatusError` 5xx | 502 | `UPSTREAM` | "Dịch vụ AI lỗi. Bấm Thử lại." |
| `APIConnectionError` / timeout | 504 | `TIMEOUT` | "Không kết nối được AI. Câu trả lời của bạn vẫn được lưu." |
| Không có `ANTHROPIC_API_KEY` | 503 | `NO_API_KEY` | "Thêm API key trong Cài đặt để chạy phỏng vấn." |

---

## 4. Luồng dữ liệu

### 4.1 Luồng chính

**Bước 1 — Khởi tạo phiên (S16 → S17):**

1. Server component S16 load `InterviewProfile` (kèm số phiên + điểm TB) và gọi `getSkillEvidenceStats(focusSkills)` → `rankWeakSkills` → `pickWeakSkills(2)`.
2. Người dùng bấm "Bắt đầu" → `POST /api/interview/start`.
3. Server: tạo `InterviewSession` (`status='active'`, `plannedCount`, `skillsFocused` = node yếu đã ghim hoặc node user chọn tay), rồi gọi **AI-11** với `focusSkills` + `jobTitle` + `seniority` + `questionKinds` → tạo `InterviewTurn` #1 (`answer=null`).
4. Trả `{ sessionId, firstTurn }` → client `router.push('/interview/session?session=...')`.

**Bước 2 — Mỗi lượt (S17):**

1. Người dùng trả lời → `POST /api/interview/turn` với `{ sessionId, turnIndex, answer }`.
2. Server validate (rỗng / paused / index).
3. **1 call AI-12**: chấm câu vừa rồi + sinh câu tiếp theo.
4. `normalizeTurnResult` áp quy tắc adaptive.
5. Transaction: update turn hiện tại + create turn kế tiếp.
6. Update session: `askedCount++`, `status = askedCount >= plannedCount ? 'done' : 'active'`.
7. Client `router.refresh()` → render điểm câu trước (thu gọn) + câu mới + "Ghi chú thích ứng".

**Bước 3 — Báo cáo (S18):**

1. Người dùng bấm "Xem kết quả" → `POST /api/interview/report` (nếu chưa có `report`).
2. Server: build `TRANSCRIPT_BLOCK` từ toàn bộ turn đã trả lời → gọi **AI-13** (`effort: 'high'`).
3. `normalizeReport` → verify trích dẫn → cắt 3/3 → fallback practices.
4. Lưu `session.report`.
5. `persistSessionOutcome` → tạo 1 `Activity` + 1 `Evidence` (idempotent).
6. `findPreviousSession` → tính delta.
7. `GET /api/interview/[id]` trả toàn bộ → render S18 (Server Component).

### 4.2 Lưu trữ & truy vấn

**Tạo phiên:**

```sql
INSERT INTO InterviewSession (id, profileId, plannedCount, askedCount, status, skillsFocused, startedAt)
VALUES (?, ?, ?, 0, 'active', ?, ?);
```

**Lưu lượt + sinh lượt kế tiếp (1 transaction):**

```sql
UPDATE InterviewTurn
SET answer = ?, scores = ?, behavioralScores = ?, total = ?, feedback = ?
WHERE id = ? AND sessionId = ?;

INSERT INTO InterviewTurn (sessionId, index, question, kind, skillId, skillName, isFollowUp, adaptiveReason)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);
```

**Đọc transcript + điểm (S18):**

```sql
SELECT t.id, t.index, t.question, t.kind, t.skillName, t.answer, t.total, t.scores,
       t.behavioralScores, t.feedback, t.isFollowUp, t.flagged
FROM InterviewTurn t
WHERE t.sessionId = ?
ORDER BY t.index ASC;
```

**Điểm rubric của phiên (tính ở app, không SQL — vì `scores` là JSON):**

```ts
const rubric = computeSessionRubric(
  turns.filter((t) => t.answer !== null).map((t) => ({ kind: t.kind, scores: t.scores })),
);
```

**Đếm bằng chứng theo skill (cho weak-skills):**

```sql
SELECT s.id, s.name, s.level,
       COUNT(e.id) AS evidenceCount,
       AVG(e.rating) AS avgRating
FROM Skill s
LEFT JOIN Evidence e ON e.skillId = s.id
WHERE s.id IN (...) AND s.domain = 'professional'
GROUP BY s.id, s.name, s.level
ORDER BY evidenceCount ASC, avgRating ASC, s.level ASC, s.name ASC
LIMIT ?;
```

**Phiên trước (AC-13):**

```sql
SELECT id, startedAt, totalScore FROM InterviewSession
WHERE profileId = ? AND status = 'done' AND startedAt < ?
ORDER BY startedAt DESC LIMIT 1;
```

### 4.3 Bảng dữ liệu bổ sung (Phase 1)

| Model | Cột mới | Lý do |
|---|---|---|
| `InterviewProfile` | `answerMode String @default("text")` | FR-MI-07 |
| `InterviewProfile` | `englishClarity Boolean @default(false)` | FR-MI-14 |
| `InterviewSession` | `status` thêm giá trị `paused` | FR-MI-13 |
| `InterviewSession` | `report Json?` | Lưu output AI-13 |
| `InterviewSession` | `activityId String? @unique` | Quan hệ 1–1 với `Activity` → idempotency chắc chắn |
| `InterviewTurn` | `skillId String?` | FR-MI-10 (skill trọng tâm), AC-10 (đo tỉ lệ trúng node) |
| `InterviewTurn` | `behavioralScores Json?` | FR-MI-05 |
| `InterviewTurn` | `clarityScore Float?` | FR-MI-14 |
| `InterviewTurn` | `nextKind String?`, `nextSkillId String?` | Đồng bộ câu kế tiếp |
| `InterviewTurn` | `isFollowUp Boolean @default(false)` | AC-9 |
| `InterviewTurn` | `adaptiveReason String?` | "Ghi chú thích ứng" ở S17 |
| `InterviewTurn` | `flagged Boolean @default(false)` | FR-MI-11 |

Index cần thêm: `@@index([sessionId, index])` trên `InterviewTurn`, `@@index([profileId, status, startedAt])` trên `InterviewSession`.

---

## 5. Xử lý lỗi

| Tình huống | Phát hiện | Xử lý | Thông báo người dùng |
|---|---|---|---|
| Thiếu `ANTHROPIC_API_KEY` | `!process.env.ANTHROPIC_API_KEY` khi khởi tạo client | Trả `503 NO_API_KEY`, **không** gọi API, **không** giả lập kết quả | "Thêm API key trong Cài đặt để chạy phỏng vấn." |
| API key sai | `AuthenticationError` | Ghi `AiCall{ok:false,error:'auth'}` | "API key không hợp lệ — kiểm tra lại trong Cài đặt." + link `/settings` |
| Bị rate limit | `RateLimitError` / HTTP 429 | Ghi log, trả 429 | "AI đang bận. Thử lại sau vài giây." + nút "Thử lại" |
| Model từ chối trả lời | `stop_reason === 'refusal'` **kiểm tra trước khi đọc `content`** | Ghi log, trả 422 | "AI không thể xử lý nội dung này. Câu trả lời của bạn vẫn được lưu." |
| Timeout / mất mạng | `APIConnectionError` | Ghi log, trả 504 | "Không kết nối được AI. Câu trả lời của bạn vẫn được lưu." + nút "Thử lại" |
| AI trả sai shape | `zod` parse fail | Ghi log `AiCall{ok:false, error:'schema'}`, **không** ghi turn | "AI trả về dữ liệu không đúng định dạng — thử lại lượt này." |
| AI trả điểm ngoài [0,5] | `sanitizeScores` | Clamp + ghi log | Không hiển thị giá trị ngoài thang |
| AI trả `scores` cho câu behavioral | `sanitizeScores` | Bỏ `scores`, dùng `behavioralScores` | — |
| AI sinh follow-up thừa | `normalizeTurnResult` | Ép `isFollowUp=false`, gắn node yếu kế tiếp, ghi log | "Ghi chú thích ứng" hiển thị lý do thực tế |
| AI sinh câu hỏi trùng câu trước | So khớp chuẩn hoá (similarity ≥ 0.9) | Giữ nguyên nhưng gắn `adaptiveReason` "Câu hỏi lặp lại — hãy trả lời sâu hơn" | Cảnh báo nhỏ dưới câu hỏi |
| AI-13 trả ≠3 mạnh/yếu | `normalizeReport` | Cắt/điền, gắn `autoGenerated` | Mục tự sinh ghi nhãn "tự động tóm tắt" |
| AI-13 trích dẫn không khớp transcript | `isVerbatimQuote` | Bỏ quote, giữ comment | Không hiển thị trích dẫn sai |
| Gửi trả lời 2 lần | `turnIndex` trùng → `409` | Không ghi turn thứ hai | "Câu này đã được gửi." |
| Phiên bị pause giữa lúc submit | `status === 'paused'` | `409 SESSION_PAUSED` | "Phiên đang tạm dừng — bấm Tiếp tục trước khi gửi." |
| Refresh giữa lượt | — | Server state là nguồn chân lý; draft phục hồi từ `localStorage` | Không mất lượt nào |
| Hồ sơ bị xoá sau khi tạo phiên | `include: { profile: true }` → null | `404 profile_missing` | "Hồ sơ của phiên này đã bị xoá — báo cáo vẫn xem được." |
| Skill bị xoá giữa phiên | FK cascade | `skillId` null trong turn; `nextPractices` fallback | Báo cáo vẫn render, chỉ mất chip kỹ năng |
| DB lỗi (SQLite locked) | Prisma error | Trả 500, log | "Không lưu được dữ liệu cục bộ — thử lại." |
| STT không được hỗ trợ | `window.SpeechRecognition` undefined | Disable nút, fallback văn bản | "Trình duyệt này không hỗ trợ nhận giọng nói — dùng văn bản." |
| TTS không được hỗ trợ | `window.speechSynthesis` undefined | Disable nút "Nghe câu hỏi" | "Trình duyệt này không hỗ trợ đọc câu hỏi." |

---

## 6. Chiến lược kiểm thử

| Tầng | Công cụ | Phạm vi |
|---|---|---|
| Unit | Vitest | `rankWeakSkills` — thứ tự 4 khoá, AC-10 (0 bằng chứng đứng trước 2 bằng chứng); `sanitizeScores` — clamp, loại key lạ, đúng rubric theo kind; `computeTurnTotal` / `computeSessionTotal`; `shouldFollowUp` — ngưỡng từng nhánh; `normalizeTurnResult` — ép câu mới khi điểm cao, gắn lại `skillId`; `normalizeReport` — cắt 3/3, verify trích dẫn, fallback practices; `diffRubric` — delta & `direction`; `toEvidenceRating`; `pickPrimarySkill`; `validateTurn` — rỗng/paused/index. |
| Unit (AI-12 contract) | Vitest + fixture | Fixture `TurnResult` hợp lệ / thiếu key / điểm ngoài thang / `nextQuestion=null` → đảm bảo `normalizeTurnResult` không throw và luôn trả shape đúng. |
| Integration | Vitest + SQLite test DB | `POST /api/interview/start` tạo session + turn #1 đúng; `POST /api/interview/turn` chấm + tạo turn kế tiếp trong 1 transaction; gửi 2 lần cùng `turnIndex` → `409`; `POST /api/interview/report` tạo **đúng 1** Activity + 1 Evidence, gọi lại **không** tạo thêm (idempotent); `GET /api/interview/[id]` trả `deltas` đúng với 2 phiên cùng hồ sơ, **không** delta khi khác hồ sơ. |
| E2E | Playwright | AC-9 (đủ 5 tiêu chí / 3 mạnh / 3 yếu / câu 2 là follow-up của câu 1), AC-10 (node yếu nhất đúng badge P0), AC-13 (delta hiển thị), AC-MI-14 (pause → resume đúng câu), AC-MI-19 (đếm `AiCall` = 9 cho 1 phiên 8 câu). |
| Chi phí | Script đọc `AiCall` | Chạy 1 phiên 8 câu → `SUM(estimatedCost)` ∈ [$0.15, $0.30]; `cache_read_input_tokens` của lượt 2 > 0 (AC-5). |
| A11y | axe-core + Playwright | Tương phản AA, mọi icon-button có `aria-label`, `aria-live="polite"` cho vùng điểm, điều hướng bàn phím trong S17. |
| Responsive | Playwright viewport 390×844 | S16/S17/S18 không tràn ngang; nút gửi nằm trong vùng ngón cái (fixed bottom ở S17). |
| Offline | Vitest + mock `fetch` | Không có `ANTHROPIC_API_KEY` → S16 vẫn render hồ sơ + weak skills; nút "Bắt đầu" ẩn; **không** có phản hồi AI giả lập. |

---

## 7. Rủi ro & đánh đổi kỹ thuật

| # | Rủi ro | Tác động | Giảm thiểu |
|---|---|---|---|
| T1 | **Prompt cache không ăn** vì system prompt thay đổi giữa các lượt (thêm hồ sơ/ngày giờ vào system) | Chi phí tăng 3–5×, vi phạm R11 | Tách `SYSTEM_INTERVIEW` + `RUBRIC_BLOCK` cố định; mọi thứ biến động nằm trong `messages`. Assert `cache_read_input_tokens > 0` ở lượt 2. |
| T2 | **Structured output 1 schema quá lớn** (AI-12 trả cả scores lẫu nextQuestion) → model hay bỏ sót field | Lượt lỗi, phải gọi lại | Schema dùng `.nullable()` cho phần không áp dụng; `sanitizeScores` + `normalizeTurnResult` luôn có fallback; giữ `max_tokens: 8000`. |
| T3 | **1 transaction ghi 2 turn** tăng thời gian lock SQLite khi gọi song song | `SQLITE_BUSY` | Không gọi AI trong transaction — gọi AI **trước**, transaction chỉ ghi 2 dòng. Thêm `busy_timeout`. |
| T4 | **`report` JSON không có schema ở tầng DB** → lỗi shape lọt xuống UI | Crash ở S18 | `normalizeReport` chạy **trước khi** lưu; `GET /api/interview/[id]` vẫn chạy `normalizeReport` lần 2 khi đọc (phòng thủ). |
| T5 | **Tìm "phiên trước" tốn thời gian** khi bảng `InterviewSession` lớn | S18 chậm | Index `@@index([profileId, status, startedAt])`; query `LIMIT 1`. |
| T6 | **STT của Web Speech API trả kết quả lặp lại / sai dấu tiếng Việt** | Câu trả lời bị nhiễu | `interimResults = true` chỉ để hiển thị; chỉ nối kết quả `isFinal`; luôn cho xem/sửa trước khi gửi; nếu browser không hỗ trợ `vi-VN` → cảnh báo. |
| T7 | **`localStorage` draft xung đột khi mở 2 tab** | Ghi đè draft | Key gồm `sessionId` + `turnIndex`; tab 2 sẽ thấy draft của tab 1 — chấp nhận được, hiển thị "Có bản nháp đã lưu — Khôi phục?". |
| T8 | **Điểm AI chấm không lặp lại** (R9) → so sánh giữa các lần không đáng tin | Nghỉ rơi niềm tin vào delta | `temperature` mặc định; rubric chi tiết; lưu `note` từng tiêu chí; hiển thị ghi chú "sai số ±0.3" ở S18. |
| T9 | **Câu hỏi lặp lại giữa các phiên** → cảm giác "không mới" | Giảm giá trị lặp lại | Truyền `skillsFocused` + `askedCount` vào prompt; đề xuất thêm `avoidTopics` = tiêu đề câu đã hỏi trong 3 phiên gần nhất cùng hồ sơ (Phase 2). |
| T10 | **Thêm cột vào model `Interview*`** cần migration trên DB đang dùng | Mất dữ liệu phiên cũ nếu chạy `prisma migrate reset` | Migration **additive** (`String?`, `Boolean @default(false)`) → không mất dữ liệu. Không dùng `reset`. |
| T11 | **S18 render 1 lần nhưng có nhiều nút hành động tạo `PlanItem`** → ghi trùng | Nhiều PlanItem rác | Mỗi nút tạo `PlanItem` có `source='manual'` + `skillId`; server chặn trùng cùng `skillId` trong cùng ngày (idempotent). |
| T12 | **`QuestionKind` khai báo 2 nơi** (`rubric.ts` và `prompts.ts`) → lệch kiểu | Lỗi TypeScript | Chỉ khai báo 1 lần trong `src/lib/interview/types.ts`; `rubric.ts` và `prompts.ts` cùng import. |
