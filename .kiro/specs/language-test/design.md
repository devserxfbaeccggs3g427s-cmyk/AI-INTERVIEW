# Design — Bài kiểm tra ngoại ngữ

## 1. Tổng quan kiến trúc

Feature gồm 3 màn hình và 6 API route, chia làm **3 tầng rõ rệt**: tầng nghiệp vụ thuần (`src/lib/test.ts`) xử lý chọn item / chấm objective / áp FSRS; tầng AI (`AI-14/15/16` qua `src/lib/anthropic.ts`) chỉ lo phần AI sinh và chấm tự luận; tầng UI (`src/components/test/*`) render + tương tác.

**Điểm mấu chốt kiến trúc:** vòng đóng SRS. `POST /api/test/submit` là nơi duy nhất được ghi `Card.due/stability/lapses` — nó gom các câu sai, dedupe theo `cardId`, áp FSRS `Rating.Again` một lần mỗi thẻ, rồi ghi `Activity` + `Evidence`. Mọi thao tác trong lúc làm bài chỉ ghi `TestItem` — **không** đụng tới `Card`.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  UI (Client)                                                            │
│  S19 test-hub            S20 test-session           S21 test-result      │
│  /test                   /test/session              /test/[id]           │
└───────┬────────────────────────┬──────────────────────────┬──────────────┘
        │ GET /api/test          │ POST /api/test/generate  │ GET /api/test/[id]
        │ POST /api/test/*       │ POST /api/test/answer    │ POST /api/test/submit
        ▼                        ▼ POST /api/test/grade-open  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  src/lib/test.ts  (nghiệp vụ thuần — KHÔNG import AI)                   │
│  ├── buildBlueprint()        → chọn item từ thẻ yếu + ngân hàng seed     │
│  ├── parallelFormSignature() → hash(itemTypes + bands) (FR-LT-12)        │
│  ├── scoreObjective()        → chấm mc_*/cloze/listening ngay           │
│  ├── gradeOpenItem()         → áp rubric 4 nhóm lỗi (AI-15)             │
│  ├── estimateLevelLocal()    → band điểm theo itemType (fallback offline)│
│  ├── applyFsrsAgain()        → đẩy thẻ về ôn hôm nay (FR-LT-06)         │
│  └── summarizeSession()      → tổng điểm + byItemType + pushedCards      │
└───────────┬───────────────────────────────┬──────────────────────────────┘
            │                               │
            ▼                               ▼
┌───────────────────────────┐   ┌────────────────────────────────────────┐
│  src/lib/fsrs.ts          │   │  src/lib/anthropic.ts (AI-14/15/16)    │
│  wrapper ts-fsrs          │   │  system: [STABLE, RUBRIC|SPEC (cache)] │
│  scheduler.next(Rating.   │   │  messages: [nội dung biến động]        │
│  Again) → due=today,     │   │  → ghi AiCall { feature:"language_test"│
│  stability↓, lapses↑      │   │       model, tokens, cache, cost }     │
└───────────────────────────┘   └────────────────────────────────────────┘
```

**Nguyên tắc tách lớp:** mọi thứ có thể tính bằng code (chấm objective, tổng điểm, phân tách theo dạng, đẩy thẻ về ôn, band level) **không** được gọi AI. AI chỉ dùng cho 3 việc: (1) sinh câu hỏi từ blueprint, (2) chấm câu tự luận, (3) chọn level trong enum. Nhờ vậy S19/S21 dùng được offline, và `POST /api/test/submit` không bao giờ fail vì lý do AI.

## 2. Kiến trúc

### 2.1 Sơ đồ luồng — S19 → S20 (sinh đề)

```
User mở /test?lang=zh
   │
   ├─► GET /api/test?lang=zh
   │     ├─ getProfileLevel(lang)          → UserProfile.zhLevel
   │     ├─ listRecentSessions(lang)       → placement[] · benchmarks[] · topics[]
   │     ├─ getBenchmarkTrend(lang)        → [{label:"T41", rate:0.58, level:"A1"}]
   │     ├─ getAccuracyByItemType(lang)    → [{itemType, correct, total, rate}]
   │     ├─ getTopWrongWords(lang, 5)      → Card theo lapses desc
   │     └─ getPushedCardCount(lang, today)→ số thẻ do bài kiểm tra đẩy về ôn
   │
   └─► render S19 (Server Component) + <TestHubActions> (Client)

User bấm "Bắt đầu Đề Chuẩn Tuần 44"
   │
   ├─► POST /api/test/generate
   │     { lang:"zh", testType:"benchmark", count:40, itemTypes:[...], level:"A1" }
   │
   │     ① buildBlueprint()
   │        ├─ pickWeakCards(lang, n)      → thẻ user: lapses DESC, difficulty DESC
   │        ├─ pickSeedCards(lang, level, m)→ ngân hàng seed cho level đó
   │        ├─ excludeRecentlyUsed(lang, 3) → loại cardId đã dùng 3 phiên gần nhất
   │        ├─ assignBands(itemTypes)       → band 1..3 theo level + độ yếu thẻ
   │        └─ parallelFormSignature(...)   → sha256(itemTypes + bands)[:8]
   │
   │     ② AI-14 (claude-opus-5, streaming, effort medium)
   │        input : danh sách cardId + front/back + band + itemType yêu cầu
   │        output: [{ index, itemType, prompt, audioText, options, answer, cardId }]
   │        → validate: đúng count & đúng phân bố dạng
   │          · thiếu → bù bằng item "no-card" (mc_grammar tổng quát) sinh bởi AI
   │          · thừa  → cắt, giữ đúng phân bố
   │
   │     ③ ghi TestSession (status="active") + TestItem[] trong 1 transaction
   │
   └─► redirect → /test/session?testId={id}
```

### 2.2 Sơ đồ luồng — S20 (làm bài)

```
User mở /test/session?testId=...
   │
   ├─► loadSession(testId) → items[] (kèm userAnswer đã lưu)
   │
   └─► <TestSessionRunner> (Client)
         ├─ state: currentIndex, answers{}, remainingSec, paused
         ├─ timer: setInterval 1s (chỉ khi có timer & !paused)
         │    remainingSec <= 0 → autoSubmit("timeout")
         │
         ├─ chọn đáp án / gõ / textarea
         │     └─► POST /api/test/answer { testId, index, userAnswer, seconds }
         │            ├─ objective → scoreObjective() → isCorrect + correctAnswer
         │            └─ writing/translation → isCorrect=null, scored=false
         │               └─► (fire-and-forget) POST /api/test/grade-open { testId, index }
         │
         ├─ điều hướng: ← Câu trước [P] · ⚑ Cờ [F] · Câu tiếp theo [Ctrl+Enter]
         │     phím 1-4 chọn option · Space nghe
         │
         └─ bấm "Nộp bài sớm" → POST /api/test/submit { testId, reason:"manual" }
                                    └─► router.push(`/test/${testId}`)
```

### 2.3 Sơ đồ luồng — S21 (kết quả + đẩy thẻ về ôn)

```
POST /api/test/submit { testId, reason }
   │
   ├─ ① summarizeSession(testId)
   │      score        = Σ điểm từng item (objective: 1/0 · tự luận: rubric/10)
   │      byItemType  = group theo itemType → { correct, total, rate }
   │      wrongItems  = items có isCorrect === false
   │
   ├─ ② estimateLevelLocal(byItemType, score, maxScore)
   │      → band code (zero|A1|A2|B1|B2|C1) + bottleneck = itemType có rate thấp nhất
   │      → LUÔN có kết quả, không phụ thuộc AI
   │
   ├─ ③ AI-16 (claude-opus-5, KHÔNG streaming, effort low)
   │      input : byItemType + tổng điểm + mốc band code
   │      output: { level, cefr, hsk, confidence, bottleneck, reason }
   │      → clamp: |levelAI - levelCode| > 1 ⇒ dùng levelCode (LT-R6)
   │      → lỗi/no key ⇒ giữ levelCode, source:"local"
   │
   ├─ ④ applyFsrsAgain(wrongItems)      ← FR-LT-06
   │      ├─ dedupe theo cardId (1 thẻ chỉ bị đẩy 1 lần/phiên)
   │      ├─ scheduler.next(card, today, Rating.Again)
   │      ├─ ghi Card: due = today 00:00, stability ↓, difficulty ↑, lapses +1,
   │      │             reps +1, cardState = state mới
   │      ├─ ghi Review { cardId, rating: 1, state, source:"test" }
   │      └─ trả pushedCards[] để S21 hiển thị
   │
   ├─ ⑤ ghi Activity { domain:"language", type:"test", minutes, aiScore, skillId }
   │      + Evidence { skillId, rating } (P3)
   │
   ├─ ⑥ placement? → UserProfile.zhLevel/enLevel = level (FR-LT-07)
   │
   └─ ⑦ UPDATE TestSession { status:"done", score, maxScore, durationSec, level, endedAt }
        (toàn bộ ②–⑦ trong 1 transaction)
```

### 2.4 Phân tầng

| Tầng | Module | Trách nhiệm |
|---|---|---|
| Route | `src/app/test/page.tsx` | S19 Server Component — đọc `?lang=`, gọi `getTestHubData`, render. |
| Route | `src/app/test/session/page.tsx` | S20 Server Component — đọc `?testId=`, load session, render runner. |
| Route | `src/app/test/[id]/page.tsx` | S21 Server Component — đọc kết quả + render. |
| UI | `src/components/test/test-hub.tsx` | Client: toggle ngôn ngữ, chọn loại đề, tạo đề từ sheet `from_content`. |
| UI | `src/components/test/test-session-runner.tsx` | Client: timer, điều hướng câu, gọi API trả lời, ma trận câu hỏi. |
| UI | `src/components/test/question-card.tsx` | Render 1 câu theo `itemType` (radio / input / textarea) + nút nghe TTS. |
| UI | `src/components/test/test-result-view.tsx` | Client: bộ lọc câu sai, panel rubric, đẩy thẻ về ôn. |
| UI | `src/components/test/item-type-breakdown.tsx` | 4–6 ô theo dạng câu + ngưỡng Tốt/Đạt/Cần cải thiện. |
| UI | `src/components/test/ability-radar.tsx` | SVG radar 5–6 trục từ `byItemType`. |
| Nghiệp vụ | `src/lib/test.ts` | Toàn bộ logic thuần: blueprint, chấm, tổng hợp, band level. |
| Nghiệp vụ | `src/lib/test-fsrs.ts` | Áp `Rating.Again` cho thẻ bị đẩy về ôn + dedupe. |
| AI | `src/lib/test-ai.ts` | `generateTestItems()` (AI-14) · `gradeOpenItem()` (AI-15) · `estimateLevelWithAi()` (AI-16) + `reconcileGeneratedItems()`. |
| AI | `src/lib/prompts.ts` | `TEST_BLUEPRINT_SYSTEM`, `TEST_GRADE_SYSTEM`, `TEST_LEVEL_SYSTEM`, `RUBRIC_LANGUAGE_ERRORS`. |
| AI | `src/lib/anthropic.ts` | `callAIStream` (AI-14, AI-15) + `callAIJson` (AI-16), ghi `AiCall`. |
| API | `src/app/api/test/route.ts` | `GET` — dữ liệu hub S19. |
| API | `src/app/api/test/generate/route.ts` | `POST` — AI-14, tạo `TestSession` + `TestItem`. |
| API | `src/app/api/test/answer/route.ts` | `POST` — lưu 1 câu + chấm objective. |
| API | `src/app/api/test/grade-open/route.ts` | `POST` — AI-15 chấm 1 câu tự luận. |
| API | `src/app/api/test/level/route.ts` | `POST` — AI-16 ước lượng level. |
| API | `src/app/api/test/submit/route.ts` | `POST` — tổng kết + đẩy thẻ về ôn + Activity/Evidence. |
| API | `src/app/api/test/[id]/route.ts` | `GET` — dữ liệu S21. |

### 2.5 Quyết định thiết kế

| # | Quyết định | Lý do | Hệ quả |
|---|---|---|---|
| D1 | `src/lib/test.ts` **không import** `src/lib/anthropic.ts` | Logic thuần phải test được không cần network và chạy offline | AI gọi từ tầng API route, không từ tầng nghiệp vụ |
| D2 | Chỉ `POST /api/test/submit` được ghi `Card.due/stability/lapses` | Trả lời sai rồi đổi ý không được phép làm hỏng lịch ôn | Sửa câu trong phiên hoàn toàn an toàn với SRS |
| D3 | Mỗi thẻ chỉ bị áp `Again` **một lần** mỗi phiên | 1 thẻ sai ở 3 câu không được tăng `lapses` 3 lần (LT-R4) | Dedupe theo `cardId` trước khi ghi |
| D4 | `due = hôm nay 00:00 local` (không phải `now`) | AC-11 nói rõ "due = hôm nay"; so sánh ngày bằng chuỗi `yyyy-MM-dd` | Dùng `startOfToday()` từ `src/lib/dates.ts` |
| D5 | Band điểm theo `itemType` do **code** tính, AI-16 chỉ chọn trong enum + clamp | AI bịa số → mất niềm tin (LT-R6) | Luôn có level khi offline; AI lệch >1 bậc bị kéo về band code |
| D6 | Parallel form = hash `(itemTypes + difficultyBands)` + loại `cardId` đã dùng 3 phiên gần nhất | R10 (lộ đề) | Lưu `formSignature` trong `TestSession`; UI so sánh được |
| D7 | Tín hiệu "AI trả sai số câu" xử lý bằng **bù + cắt**, không nhân bản | FR-LT-01 đòi đúng số câu nhưng AI không đảm bảo | Không bao giờ lặp lại item để đủ số |
| D8 | Câu tự luận chấm **nền** (fire-and-forget) sau khi lưu | Người dùng không phải chờ AI để làm tiếp câu | S21 chờ đủ chấm mới hiện điểm tổng cuối |
| D9 | `POST /api/test/answer` là **upsert** theo `(testId, index)` | Double-click / retry mạng không tạo bản ghi trùng | Cần unique index `(testId, index)` |
| D10 | `from_content` lưu `sourceText` vào `TestSession` | Cần xem lại văn bản gốc ở S21 | Nội dung dán là dữ liệu người dùng chủ động đưa cho AI → được phép gửi (P6) |

## 3. Thành phần

### 3.1 `src/lib/test.ts` — lớp nghiệp vụ thuần

**Route/đường dẫn:** `src/lib/test.ts`

**Responsibilities:**
- Dựng blueprint (chọn item từ thẻ yếu + ngân hàng seed, gán band, hash parallel form).
- Chấm objective (`mc_vocab`/`mc_grammar`/`cloze`/`listening`).
- Tổng hợp kết quả phiên (tổng điểm, `byItemType`, danh sách câu sai).
- Tính band level cục bộ (fallback offline của AI-16).

**Interfaces:**

```ts
// ── Kiểu dữ liệu dùng chung ────────────────────────────────────────────────
export type Lang = "zh" | "en";
export type TestType = "placement" | "topic" | "benchmark" | "from_content";
export type ItemType =
  | "mc_vocab" | "mc_grammar" | "cloze"
  | "listening" | "writing" | "translation";
export type LevelCode = "zero" | "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type DifficultyBand = 1 | 2 | 3;

export interface Blueprint {
  lang: Lang;
  testType: TestType;
  topic: string | null;
  level: LevelCode;
  itemTypes: ItemType[];                 // phân bố dạng, ví dụ ["mc_vocab"×8, ...]
  count: number;
  difficultyBands: Partial<Record<ItemType, DifficultyBand>>;
  formSignature: string;                 // sha256(itemTypes+bands)[:8]
  cardIds: string[];                     // thẻ dùng cho đề
  seedBankUsed: number;
  userCardUsed: number;
  reused: boolean;                       // true = phải dùng lại thẻ đã dùng gần đây
  sourceText: string | null;             // chỉ from_content
  excludeSessionIds: string[];
}

export interface ScoredItem {
  index: number;
  itemType: ItemType;
  prompt: string;
  audioText: string | null;
  options: string[] | null;
  answer: string | null;
  userAnswer: string | null;
  isCorrect: boolean | null;
  cardId: string | null;
  skillName: string | null;
  errorGroups: Record<ErrorGroupKey, string[]> | null;
  rubric: RubricScores | null;
  notes: string | null;
  seconds: number | null;
  flagged: boolean;
  scored: boolean;
}

export type ErrorGroupKey = "grammar" | "vocab" | "expression" | "context";

export interface RubricScores {
  grammar: number;   // 0..10
  vocab: number;     // 0..10
  expression: number;// 0..10
  context: number;   // 0..10
}

export interface ItemTypeStat {
  itemType: ItemType;
  correct: number;
  total: number;
  rate: number;        // 0..1
  status: "good" | "ok" | "weak";   // ≥0.75 · ≥0.60 · <0.60
  avgSeconds: number | null;
}

export interface SessionSummary {
  testId: string;
  lang: Lang;
  testType: TestType;
  score: number;         // 0..maxScore
  maxScore: number;
  correct: number;
  total: number;
  durationSec: number;
  byItemType: ItemTypeStat[];
  wrongItems: ScoredItem[];
  levelLocal: LevelCode;
  bottleneck: ItemType | null;
  avgSecondsPerItem: number | null;
}
```

**Chấm objective:**

```ts
export const OBJECTIVE_TYPES: ItemType[] = ["mc_vocab", "mc_grammar", "cloze", "listening"];
export const OPEN_TYPES: ItemType[] = ["writing", "translation"];

/** Chuẩn hoá chuỗi để so khớp: bỏ khoảng trắng, hạ chữ thường, bỏ dấu câu cuối, bỏ dấu nháy. */
export function normalizeAnswer(raw: string): string;

/**
 * Chấm 1 câu objective.
 * - mc_* / listening: so khớp đúng 1 option (theo index hoặc chuỗi).
 * - cloze: so khớp chuẩn hoá, chấp nhận biến thể pinyin nếu thẻ có frontAlt.
 */
export function scoreObjective(
  item: Pick<ScoredItem, "itemType" | "answer" | "options">,
  userAnswer: string,
  altAnswers: string[] = [],   // ví dụ pinyin của thẻ
): { isCorrect: boolean; normalized: string };

/** Điểm 1 câu: objective = 1/0; tự luận = trung bình 4 nhóm rubric / 10. */
export function itemScore(item: ScoredItem): number;
```

**Tổng hợp:**

```ts
export function summarizeSession(
  items: ScoredItem[],
  meta: { testId: string; lang: Lang; testType: TestType; durationSec: number },
): SessionSummary;
```

**Ước lượng level cục bộ (fallback của AI-16):**

```ts
/**
 * Ngưỡng điểm theo từng dạng câu → band level.
 * Bảng ngưỡng cố định (KHÔNG do AI quyết định):
 *   zero : không dạng nào ≥ 0.60
 *   A1   : tỷ lệ đúng chung ≥ 0.60 và dạng "nghe" < 0.60  (nghe yếu là đặc trưng A1)
 *   A2   : tỷ lệ đúng chung ≥ 0.75
 *   B1   : tỷ lệ đúng chung ≥ 0.85
 *   B2   : tỷ lệ đúng chung ≥ 0.92
 *   C1   : tỷ lệ đúng chung ≥ 0.97
 * Mỗi bậc cộng thêm điều kiện: không dạng nào < 0.40 (nếu có dạng < 0.40 → trừ 1 bậc).
 */
export function estimateLevelLocal(
  byItemType: ItemTypeStat[],
  score: number,
  maxScore: number,
): { level: LevelCode; bottleneck: ItemType | null };

// Thang CEFR đầy đủ — nguồn chân lý: .kiro/steering/user-profile-decisions.md §4.1
export const LEVEL_ORDER: LevelCode[] = ["zero", "A1", "A2", "B1", "B2", "C1", "C2"];
export function clampLevel(level: LevelCode, target: LevelCode): LevelCode;
export function levelLabel(lang: Lang, level: LevelCode): string;  // "A1 Foundation" / "HSK 1"
```

**Blueprint & parallel form:**

```ts
export const TEST_COUNTS: Record<TestType, number> = {
  placement: 25, topic: 20, benchmark: 40, from_content: 10,
};

export const TEST_TIMERS_SEC: Partial<Record<TestType, number>> = {
  benchmark: 30 * 60, from_content: 15 * 60,
};

/** Phân bố dạng câu chuẩn (tổng khớp TEST_COUNTS). */
export const TEST_ITEM_DISTRIBUTION: Record<TestType, ItemType[]> = {
  placement:   ["mc_vocab","mc_vocab","mc_vocab","mc_vocab","mc_vocab","mc_vocab","mc_vocab","mc_vocab",
                "mc_grammar","mc_grammar","mc_grammar","mc_grammar","mc_grammar","mc_grammar","mc_grammar",
                "cloze","cloze","cloze","cloze","cloze",
                "listening","listening","listening","listening","listening"],
  topic:       ["mc_vocab","mc_vocab","mc_vocab","mc_vocab","mc_vocab","mc_vocab",
                "mc_grammar","mc_grammar","mc_grammar","mc_grammar","mc_grammar","mc_grammar",
                "cloze","cloze","cloze","cloze",
                "translation","translation","writing","writing"],
  benchmark:   ["mc_vocab","mc_vocab","mc_vocab","mc_vocab","mc_vocab","mc_vocab","mc_vocab","mc_vocab","mc_vocab","mc_vocab",
                "mc_grammar","mc_grammar","mc_grammar","mc_grammar","mc_grammar","mc_grammar","mc_grammar","mc_grammar",
                "cloze","cloze","cloze","cloze","cloze","cloze",
                "listening","listening","listening","listening","listening","listening","listening","listening",
                "translation","translation","translation","translation",
                "writing","writing","writing","writing"],
  from_content:["mc_vocab","mc_vocab","mc_vocab",
                "mc_grammar","mc_grammar",
                "cloze","cloze",
                "listening","listening",
                "writing"],
};

/**
 * Chọn item theo ưu tiên thẻ yếu.
 * Thứ tự ưu tiên (FR-LT-10):
 *   1. thẻ của chính người dùng, sắp theo lapses DESC, difficulty DESC, stability ASC
 *   2. thẻ chưa từng dùng trong 3 phiên gần nhất
 *   3. ngân hàng seed cho level (cardState.seed = true hoặc card.seedBank = true) để bù
 */
export async function pickWeakCards(
  opts: { lang: Lang; topic: string | null; limit: number; excludeCardIds: string[] },
): Promise<Array<{ cardId: string; front: string; back: string; frontAlt: string | null; band: DifficultyBand }>>;

/** Gán band độ khó: band = 3 nếu thẻ yếu (lapses>=2 hoặc difficulty>=7), 2 nếu trung bình, 1 nếu mạnh. */
export function assignBand(card: { lapses: number; difficulty: number; stability: number }): DifficultyBand;

/**
 * Parallel form: hash chuẩn hoá (itemTypes đã sort + bands) → 8 ký tự hex.
 * Hai đề cùng topic/level/type có cùng signature ⇒ cùng độ khó ⇒ điểm so sánh được.
 */
export function parallelFormSignature(itemTypes: ItemType[], bands: Record<string, DifficultyBand>): string;

/**
 * Dựng blueprint đầy đủ cho 1 loại đề.
 * Nguồn item theo thứ tự ưu tiên (FR-LT-10):
 *   1. thẻ của người dùng, yếu trước (lapses DESC, difficulty DESC, stability ASC)
 *   2. thẻ chưa dùng trong 3 phiên gần nhất (R10)
 *   3. ngân hàng seed cho level đó (bù phần thiếu)
 *   4. item không cần thẻ (mc_grammar tổng quát) — chỉ khi cả 3 nguồn trên không đủ
 */
export async function buildBlueprint(opts: {
  lang: Lang;
  testType: TestType;
  topic: string | null;
  level: LevelCode;
  count: number;
  itemTypes: ItemType[];
  sourceText?: string | null;
}): Promise<Blueprint>;

/** Tạo Activity (domain "language", type "test") + Evidence cho skill ngôn ngữ (FR-LT-11). */
export async function createTestEvidence(
  input: {
    lang: Lang; testType: TestType; topic: string | null;
    minutes: number; aiScore: number; pushedCount: number;
  },
  tx?: Prisma.TransactionClient,
): Promise<{ activity: Activity; evidence: Evidence }>;

/** Ghi UserProfile.zhLevel / enLevel — chỉ gọi cho placement (FR-LT-07). */
export async function setProfileLevel(
  lang: Lang, level: LevelCode, tx?: Prisma.TransactionClient,
): Promise<void>;

/** Gợi ý nhóm từ nên bắt đầu + bài tập đầu tiên sau placement (FR-LT-07). */
export function suggestedGroupForLevel(lang: Lang, level: LevelCode): {
  group: string;
  firstTask: { title: string; minutes: number; href: string };
};
```

**Edge cases:**
- `pickWeakCards` trả về ít hơn `limit` → caller bù bằng ngân hàng seed, sau đó bù bằng item không cần thẻ; tuyệt đối **không** để AI sinh từ mới.
- `normalizeAnswer("苹果 ")` → `"苹果"`; `normalizeAnswer(" Ớ.")` → `"ớ"`.
- `scoreObjective` với `answer = null` → trả `{ isCorrect: false }` và `normalized` rỗng (không ném lỗi).
- `estimateLevelLocal` với `byItemType` rỗng → `{ level: "zero", bottleneck: null }`.
- `clampLevel("C1", "A1")` → `"A1"` (AI lệch >1 bậc bị kéo về band code).

### 3.2 `src/lib/test-fsrs.ts` — đẩy thẻ về ôn (FR-LT-06)

**Route/đường dẫn:** `src/lib/test-fsrs.ts`

**Responsibilities:**
- Dedupe `cardId` từ danh sách câu sai.
- Áp FSRS `Rating.Again` **một lần mỗi thẻ**: `due = hôm nay`, `stability` giảm, `difficulty` tăng, `lapses` +1.
- Ghi `Review` với `source = "test"` để truy vết.

**Interfaces:**

```ts
import { Rating, type Card as FsrsCard } from "ts-fsrs";

export interface PushedCard {
  cardId: string;
  front: string;
  frontAlt: string | null;
  back: string;
  due: string;          // "yyyy-MM-dd"
  lapses: number;
  stability: number;
  difficulty: number;
  retrievability: number; // 0..1 — dùng cho UI "Retrievability: 28%"
  reason: string;       // "Câu 04 — mc_vocab"
}

/**
 * Áp FSRS rating Again cho các thẻ bị sai trong bài kiểm tra.
 * - Dedupe theo cardId (giữ lần xuất hiện đầu tiên để làm lý do).
 * - Bỏ qua câu bỏ trống (userAnswer rỗng) và câu chỉ bị gắn cờ.
 * - Không đụng thẻ không tồn tại (cardId null hoặc thẻ đã bị xoá).
 * - `tx` cho phép chạy trong cùng transaction với `Activity`/`Evidence` (submit).
 */
export async function applyFsrsAgain(
  wrongItems: Array<Pick<ScoredItem, "index" | "cardId" | "userAnswer" | "isCorrect" | "flagged">>,
  tx?: Prisma.TransactionClient,
  opts?: { now?: Date },
): Promise<PushedCard[]>;

/**
 * Ước lượng retrievability (xác suất nhớ) để hiển thị "Retrievability: 28%".
 * Dùng forgetting curve FSRS với desired retention 0.9.
 */
export function estimateRetrievability(card: {
  stability: number; due: Date; lastReview?: Date | null;
}): number;

/** Bọc 1 lần apply của ts-fsrs, trả về state mới để ghi vào Card.cardState. */
export function applyAgain(
  card: { cardState: unknown; due: Date; stability: number; difficulty: number; reps: number; lapses: number },
  now: Date,
): { cardState: FsrsCard; due: Date; stability: number; difficulty: number; reps: number; lapses: number };
```

**Cách áp FSRS `Again` (chi tiết):**

```ts
import { fsrs, Rating, type Card as FsrsCard } from "ts-fsrs";

const scheduler = fsrs();                        // tham số mặc định, cố định suốt vòng đời
const today = startOfToday(now);                // 00:00 local — AC-11 "due = hôm nay"

export function applyAgain(card, now) {
  // 1) Khôi phục state FSRS từ Card.cardState (JSON) — nếu hỏng thì tạo card mới
  const prev: FsrsCard = safeParseCardState(card.cardState) ?? createEmptyCard(today);

  // 2) Áp rating Again 1 lần — ts-fsrs tự tính stability/difficulty/interval
  const { card: next, log } = scheduler.next(prev, now, Rating.Again);

  // 3) Ép due = hôm nay 00:00 local (AC-11 yêu cầu "due = hôm nay",
  //    không phải interval của FSRS)
  const due = today;

  return {
    cardState: next,                 // JSON.stringify khi ghi DB
    due,
    stability: next.stability,       // ↓ so với prev (Again luôn hạ stability)
    difficulty: next.difficulty,     // ↑
    reps: card.reps + 1,
    lapses: card.lapses + 1,         // ← AC-11: "lapses tăng 1"
  };
}
```

> Vì `scheduler.next(..., Rating.Again)` đã tính sẵn `stability`/`difficulty` theo FSRS-6/7, ta **không** tự hạ stability bằng phép trừ thủ công — làm vậy sẽ phá vỡ mô hình. `lapses` tăng đúng 1 vì `next` chỉ xử lý 1 lượt.

**Edge cases:**
- `cardState` JSON hỏng → `safeParseCardState` trả `null` → dùng `createEmptyCard(today)`; vẫn ghi `lapses + 1` và `due = today` (an toàn cho người dùng).
- `cardId` không tồn tại trong `Card` → bỏ qua, **không** ném lỗi, không tính vào `pushedCards`.
- Câu sai nhưng `userAnswer` rỗng (bỏ trống) → **không** đẩy thẻ (LT-R9).
- 1 thẻ sai ở 3 câu → chỉ đẩy 1 lần, `lapses +1` (D3).
- `now` không có timezone local → dùng `src/lib/dates.ts` `startOfToday()`; **không** dùng `toISOString()`.

### 3.3 `src/lib/test-ai.ts` — lớp gọi AI (AI-14, AI-15, AI-16)

**Route/đường dẫn:** `src/lib/test-ai.ts`

**Responsibilities:**
- Đóng gói 3 lời gọi AI (AI-14 sinh câu, AI-15 chấm tự luận, AI-16 ước lượng level).
- Xây message theo đúng thứ tự `tools → system → messages`; nội dung biến động nằm trong `messages`.
- Kiểm tra output (số câu, phân bố dạng, nhóm lỗi hợp lệ) trước khi trả về.

**Interfaces:**

```ts
export async function generateTestItems(bp: Blueprint): Promise<GenerateTestResult>;
export async function gradeOpenItem(input: {
  lang: Lang; itemType: ItemType; prompt: string;
  reference: string | null; userAnswer: string;
}): Promise<{
  rubric: RubricScores;
  errors: Record<ErrorGroupKey, string[]>;
  score: number;              // trung bình 4 nhóm (code tính)
  feedback: string;
  correctedAnswer: string | null;
}>;
export async function estimateLevelWithAi(input: {
  lang: Lang; summary: SessionSummary; localLevel: LevelCode;
}): Promise<{ level: LevelCode; cefr: string; hsk: number; confidence: number; bottleneck: ItemType | null; reason: string }>;
```

**Edge cases:**
- AI-14 trả thiếu/thừa item → `reconcileGeneratedItems()` cắt/bù, **không** nhân bản; trả `warnings` để S20 hiện cảnh báo.
- AI-15 trả nhóm lỗi ngoài 4 nhóm → `TestGradeSchema.strict()` fail → ném `AiSchemaError` → route trả `502`, **không** ghi `errorGroups`.
- AI-16 trả level lệch >1 bậc so với band code → `clampLevel()` kéo về band code.
- Thiếu `ANTHROPIC_API_KEY` → `AiOfflineError` (từ `ai-foundation`), không gọi SDK.

### 3.4 `src/components/test/test-session-runner.tsx`

**Route:** `src/app/test/session/page.tsx` (render)

**Responsibilities:**
- Giữ state phiên làm bài, timer đếm ngược, điều hướng câu, phím tắt.
- Gọi `POST /api/test/answer` cho từng câu; gọi `POST /api/test/grade-open` nền cho câu tự luận.
- Render ma trận câu hỏi (nhảy nhanh) và điều hướng trước/sau.

**Interfaces:**

```tsx
export interface TestSessionRunnerProps {
  test: {
    id: string;
    lang: Lang;
    testType: TestType;
    topic: string | null;
    level: LevelCode;
    totalCount: number;
    timerSec: number | null;      // null = không timer
  };
  initialItems: ScoredItem[];
}

export interface TestSessionRunnerHandle {
  goTo: (index: number) => void;
}

export default function TestSessionRunner(props: TestSessionRunnerProps): JSX.Element;
```

**State nội bộ:**

```ts
const [currentIndex, setCurrentIndex] = useState<number>(() => firstUnansweredIndex(initialItems));
const [items, setItems]       = useState<ScoredItem[]>(initialItems);
const [remainingSec, setRemainingSec] = useState<number>(props.test.timerSec ?? 0);
const [paused, setPaused]     = useState(false);
const [submitting, setSubmitting] = useState(false);
const [savedAt, setSavedAt]   = useState<string | null>(null);
```

**Interfaces (tiếp):**

```ts
export interface AnswerRequest {
  testId: string;
  index: number;
  userAnswer: string;
  seconds?: number;
  flagged?: boolean;
}

export interface AnswerResponse {
  saved: true;
  index: number;
  isCorrect: boolean | null;      // null = câu tự luận (chờ AI)
  correctAnswer?: string;
  explanation?: string;
  elapsedTotal: number;
}
```

**Dependencies:** `question-card.tsx`, `fetch`, `useRouter`, `src/lib/dates.ts` (định dạng HH:mm:ss).

**Edge cases:**
- `timerSec === null` → không render đồng hồ, không chạy interval.
- `remainingSec <= 0` → gọi `submit("timeout")` **đúng 1 lần** (guard bằng ref `submittedRef`).
- Người dùng bấm "Câu tiếp theo" khi câu hiện tại chưa trả lời → cho phép (không chặn), nhưng ma trận đánh dấu câu đó là "trống".
- Người dùng quay lại sửa câu đã trả lời → `POST /api/test/answer` ghi đè; UI cập nhật `isCorrect` mới.
- Double-click "Câu tiếp theo" → `currentIndex` không nhảy 2 lần (dùng `setCurrentIndex(i => i+1)` dạng functional).
- Đóng tab giữa chừng → mọi đáp án đã lưu; mở lại `/test/session` load `items` từ DB với `userAnswer` đã có → khôi phục `currentIndex` = câu đầu tiên chưa trả lời.

### 3.5 `src/components/test/question-card.tsx`

```tsx
export interface QuestionCardProps {
  item: ScoredItem;
  index: number;                 // 0-based
  lang: Lang;
  value: string | null;
  flagged: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onToggleFlag: () => void;
  onSpeak: () => void;
  speakUnavailable: boolean;     // true = không có giọng zh-CN
}

export default function QuestionCard(props: QuestionCardProps): JSX.Element;
```

**Render theo `itemType`:**

| `itemType` | Điều khiển | Ghi chú a11y |
|---|---|---|
| `mc_vocab` / `mc_grammar` / `listening` | 4 option `role="radio"` trong `role="radiogroup"` | `aria-checked`, `tabindex=0`, phím `1`–`4` |
| `cloze` | `<input type="text">` + nút nghe | `aria-label` = nội dung câu |
| `writing` / `translation` | `<textarea>` | `aria-label` = đề bài; `aria-live` cho trạng thái "AI đang chấm…" |

**TTS (NFR-LT-07, R5):**

```ts
export function speak(text: string, lang: Lang): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === "zh" ? "zh-CN" : "en-US";
  utterance.rate = 0.85;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}
```

- Nếu `speak()` trả `false` (không hỗ trợ) → hiện "Giọng {lang} không khả dụng — dùng pinyin + hán tự" (LT-R10).
- Nút nghe luôn có `aria-label="Nghe phát âm"`.

### 3.6 `src/components/test/test-result-view.tsx`

```tsx
export interface TestResultViewProps {
  session: {
    id: string; lang: Lang; testType: TestType; topic: string | null;
    status: "done" | "expired" | "abandoned";
    score: number; maxScore: number; durationSec: number;
    level: LevelCode; levelSource: "ai" | "local";
    levelConfidence: number | null;
    levelReason: string | null;
    bottleneck: ItemType | null;
    createdAt: string;
  };
  items: ScoredItem[];
  byItemType: ItemTypeStat[];
  pushedCards: PushedCard[];
  comparison: { prevScore: number; prevMaxScore: number; deltaCorrect: number; prevDate: string } | null;
  activityId: string | null;
  evidenceId: string | null;
  suggestedGroup: string | null;      // placement → gợi ý nhóm từ (FR-LT-07)
  hasApiKey: boolean;
}

export default function TestResultView(props: TestResultViewProps): JSX.Element;
```

**Bộ lọc câu sai:** `useState<"all" | ItemType>("all")` → lọc client-side (dữ liệu đã nạp, không refetch).

**Edge cases:**
- `pushedCards.length === 0` → hiện đúng chuỗi **"0 thẻ bị đẩy về ôn sớm"** — không render danh sách rỗng, không giả lập số liệu (AC-11).
- `comparison === null` → ẩn dòng delta, hiện "Chưa có kỳ thi trước để so sánh".
- `levelSource === "local"` → chip "Ước lượng cục bộ" cạnh level.
- `status === "expired"` → banner "Hết thời gian — đã nộp tự động".
- Câu tự luận `rubric === null` → hiển thị "Chưa chấm được — thử lại" + nút gọi lại `POST /api/test/grade-open`.

### 3.7 `src/components/test/item-type-breakdown.tsx`

```tsx
export interface ItemTypeBreakdownProps {
  stats: ItemTypeStat[];
  onFilter?: (itemType: ItemType) => void;
}

export default function ItemTypeBreakdown(props: ItemTypeBreakdownProps): JSX.Element;
```

- Ngưỡng trạng thái: `rate >= 0.75` → `good` (nền `bg-primary/10`, text `text-primary`); `>= 0.60` → `ok` (`bg-tertiary/10`, `text-tertiary`); còn lại → `weak` (`bg-error/15`, `text-error`).
- Bar fill màu theo trạng thái; track `bg-surface-container-highest`.
- Tổng `correct + total` phải khớp `items.length` — có assert trong unit test (AC-LT-4).

### 3.8 `src/components/test/ability-radar.tsx`

```tsx
export interface AbilityRadarProps {
  stats: ItemTypeStat[];   // lấy theo thứ tự cố định
  size?: number;           // default 240
}

export default function AbilityRadar(props: AbilityRadarProps): JSX.Element;
```

- 6 trục cố định: `mc_vocab` (Từ vựng) · `mc_grammar` (Ngữ pháp) · `cloze` (Điền từ) · `listening` (Nghe hiểu) · `translation` (Dịch) · `writing` (Viết).
- Vùng đạt: `fill rgba(78,222,163,0.2)` + `stroke #4edea3`; node theo trạng thái `text-primary` / `text-tertiary` / `text-error`.
- Nếu chỉ có 4 dạng có dữ liệu → bỏ trục không có dữ liệu, không vẽ 0 (tránh báo động giả).
- SVG có `role="img"` + `aria-label` mô tả tỷ lệ đúng theo từng dạng (NFR-06).

### 3.9 API routes

#### `GET /api/test?lang=zh`

```ts
export interface TestHubData {
  profile: { lang: Lang; level: LevelCode; levelLabel: string; seedAvailable: boolean };
  placements: Array<{ id: string; createdAt: string; score: number; maxScore: number; level: LevelCode }>;
  topics: Array<{ group: string; rate: number | null; count: number; total: number }>;
  benchmarks: Array<{ id: string; label: string; score: number; maxScore: number; date: string; level: LevelCode; reused: boolean }>;
  benchmarkTrend: Array<{ label: string; rate: number; level: LevelCode; date: string }>;
  byItemType: ItemTypeStat[];
  topWrongWords: Array<{ cardId: string; front: string; frontAlt: string | null; back: string; wrongCount: number }>;
  pushedCards: { count: number; ids: string[] };
  hasApiKey: boolean;
}

export async function GET(req: NextRequest): Promise<Response>;
```

- `lang` không hợp lệ → `400 { ok:false, error:"invalid_lang" }`.
- Tất cả query chạy song song (`Promise.all`) — không N+1.

#### `POST /api/test/generate` (AI-14)

```ts
export interface GenerateTestBody {
  lang: Lang;
  testType: TestType;
  topic?: string;
  level?: LevelCode;
  itemTypes?: ItemType[];
  count?: number;
  sourceText?: string;
}

export interface GeneratedItem {
  index: number;
  itemType: ItemType;
  prompt: string;
  audioText: string | null;
  options: string[] | null;
  answer: string | null;
  cardId: string | null;
  skillName: string | null;
}

export async function POST(req: NextRequest): Promise<Response>;
```

**Luồng handler (rút gọn):**

```ts
export async function POST(req: NextRequest): Promise<Response> {
  const body = GenerateTestSchema.parse(await req.json());   // Zod

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, error: "no_api_key" }, { status: 503 });
  }

  // 1) Chặn 2 phiên active cùng lang (tránh lỡ tay mở 2 đề)
  const active = await prisma.testSession.findFirst({
    where: { lang: body.lang, status: "active" },
    orderBy: { createdAt: "desc" },
  });
  if (active) {
    return Response.json(
      { ok: false, error: "session_in_progress", data: { testId: active.id } },
      { status: 409 },
    );
  }

  // 2) Dựng blueprint (chọn item từ thẻ yếu + seed bank + loại 3 phiên gần nhất)
  const blueprint = await buildBlueprint({
    lang: body.lang,
    testType: body.testType,
    topic: body.topic ?? null,
    level: body.level ?? (await getProfileLevel(body.lang)),
    count: body.count ?? TEST_COUNTS[body.testType],
    itemTypes: body.itemTypes ?? TEST_ITEM_DISTRIBUTION[body.testType],
  });

  // 3) AI-14 sinh câu
  const items = await generateTestItems(blueprint);   // src/lib/test-ai.ts

  // 4) Ghi phiên + item trong 1 transaction
  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.testSession.create({
      data: {
        lang: blueprint.lang, testType: blueprint.testType, topic: blueprint.topic,
        level: blueprint.level, blueprint: blueprint as unknown as Prisma.InputJsonValue,
        formSignature: blueprint.formSignature, sourceText: blueprint.sourceText,
        status: "active",
      },
    });
    await tx.testItem.createMany({
      data: items.map((it, i) => ({
        testId: created.id, index: i, itemType: it.itemType, prompt: it.prompt,
        audioText: it.audioText, options: it.options, answer: it.answer,
        cardId: it.cardId, skillName: it.skillName,
      })),
    });
    return created;
  });

  return Response.json({ ok: true, data: { testId: session.id, count: items.length, blueprint, items } });
}
```

**AI-14 (`src/lib/test-ai.ts`):**

```ts
export interface GenerateTestResult {
  items: GeneratedItem[];
  warnings: string[];    // vd "Đề có 23/25 câu do AI không sinh đủ"
}

export async function generateTestItems(bp: Blueprint): Promise<GenerateTestResult> {
  const stream = await callAIStream({
    feature: "language_test",
    model: "claude-opus-5",
    effort: "medium",
    system: [TEST_BLUEPRINT_SYSTEM, TEST_BLUEPRINT_SPEC],   // block cuối có cache_control
    messages: [buildBlueprintUserMessage(bp)],              // nội dung biến động
    parse: TestBlueprintSchema,
  });
  // ...
}
```

**Prompt shape (AI-14):**

```ts
// src/lib/prompts.ts
export const TEST_BLUEPRINT_SYSTEM = `
Bạn là chuyên gia biên soạn đề kiểm tra ngoại ngữ level 0 (người học Việt Nam).
Nhiệm vụ: sinh câu hỏi theo blueprint được cung cấp.

Quy tắc bất diễn vi phạm:
1. TUYỆT ĐỐI không sinh từ vựng mới. Mọi từ vựng phải lấy từ danh sách thẻ được cung cấp
   (kèm mặt trước / mặt sau / phiên âm). Nếu một câu cần từ không có trong danh sách → bỏ câu đó.
2. Chỉ sinh CÁCH HỎI: câu nghe, câu điền chỗ trống, câu chọn, câu dịch, câu tự luận.
3. Đúng số câu và đúng phân bố dạng theo blueprint. Trả về đúng `count` phần tử.
4. Với dạng nghe (listening) và nghe-từ (mc_vocab): `audioText` là câu tiếng đích đầy đủ,
   viết bằng chữ Hán (zh) hoặc Latin (en), không dùng pinyin trong audioText.
5. Với cloze: chỗ trống luôn viết bằng ___ (3 gạch dưới).
6. Với mc_*: đúng 4 lựa chọn, 1 đúng, 3 nhiễu cùng trình độ; `answer` = chuỗi lựa chọn đúng.
7. Với writing/translation: `prompt` = đề bài bằng tiếng Việt; `answer` = bài mẫu tham chiếu.
8. Không thêm tiêu chí chấm điểm — tiêu chí do hệ thống quy định.
`.trim();

export const TEST_BLUEPRINT_SPEC = `
Định dạng đầu ra cho từng câu:
- itemType: mc_vocab | mc_grammar | cloze | listening | writing | translation
- prompt: nội dung câu hỏi (với cloze chứa ___)
- audioText: câu để đọc bằng TTS (null nếu không nghe)
- options: mảng 4 lựa chọn (null với cloze/writing/translation)
- answer: đáp án đúng (hoặc bài mẫu với writing/translation)
- cardId: id thẻ được dùng (null nếu câu không gắn thẻ)
`.trim();
```

```ts
export const TestBlueprintSchema = z.object({
  items: z.array(z.object({
    index: z.number().int().min(0),
    itemType: z.enum(["mc_vocab","mc_grammar","cloze","listening","writing","translation"]),
    prompt: z.string().min(1),
    audioText: z.string().nullable(),
    options: z.array(z.string().min(1)).length(4).nullable(),
    answer: z.string().nullable(),
    cardId: z.string().nullable(),
    skillName: z.string().nullable(),
  })),
});
```

**Kiểm tra "AI trả số câu sai" (D7):**

```ts
export function reconcileGeneratedItems(
  generated: GeneratedItem[],
  bp: Blueprint,
): { items: GeneratedItem[]; warnings: string[] } {
  const warnings: string[] = [];
  const wanted = new Map<ItemType, number>();
  for (const t of bp.itemTypes) wanted.set(t, (wanted.get(t) ?? 0) + 1);

  // 1) Bỏ item dạng vượt số lượng yêu cầu
  const seen = new Map<ItemType, number>();
  const kept: GeneratedItem[] = [];
  for (const it of generated) {
    const used = seen.get(it.itemType) ?? 0;
    const max = wanted.get(it.itemType) ?? 0;
    if (used >= max) continue;
    if (it.options && it.options.length !== 4) continue;       // loại option sai số lượng
    if (!it.answer) continue;                                    // loại thiếu đáp án
    seen.set(it.itemType, used + 1);
    kept.push(it);
  }

  // 2) Bù thiếu bằng item không cần thẻ (mc_grammar tổng quát) — KHÔNG nhân bản
  const missing = bp.count - kept.length;
  if (missing > 0) {
    warnings.push(`AI sinh thiếu ${missing} câu — phần còn thiếu đã bỏ qua`);
  }
  if (kept.length < bp.count) {
    // cho phép đề ngắn hơn; tuyệt đối không lặp lại item để đủ số
    warnings.push(`Đề có ${kept.length}/${bp.count} câu`);
  }
  return { items: kept.map((it, i) => ({ ...it, index: i })), warnings };
}
```

#### `POST /api/test/answer`

```ts
export async function POST(req: NextRequest): Promise<Response> {
  const body = AnswerSchema.parse(await req.json());   // { testId, index, userAnswer, seconds?, flagged? }

  const session = await prisma.testSession.findUnique({
    where: { id: body.testId },
    include: { items: { orderBy: { index: "asc" } } },
  });
  if (!session) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  if (session.status !== "active") {
    return Response.json({ ok: false, error: "already_submitted" }, { status: 409 });
  }
  const item = session.items.find((i) => i.index === body.index);
  if (!item) return Response.json({ ok: false, error: "item_not_found" }, { status: 404 });

  // Chấm objective ngay; câu tự luận để isCorrect = null, chờ AI-15
  let isCorrect: boolean | null = null;
  let explanation: string | undefined;
  if (OBJECTIVE_TYPES.includes(item.itemType as ItemType)) {
    const alt = item.cardId ? await getCardAltAnswers(item.cardId) : [];
    const res = scoreObjective(item as ScoredItem, body.userAnswer, alt);
    isCorrect = res.isCorrect;
    explanation = res.isCorrect ? null : buildObjectiveExplanation(item, res.normalized);
  }

  // Upsert theo (testId, index) — không nhân bản khi double-click (D9)
  await prisma.testItem.upsert({
    where: { testId_index: { testId: body.testId, index: body.index } },
    create: {
      testId: body.testId, index: body.index, itemType: item.itemType,
      prompt: item.prompt, audioText: item.audioText, options: item.options,
      answer: item.answer, cardId: item.cardId, skillName: item.skillName,
      userAnswer: body.userAnswer, isCorrect, seconds: body.seconds ?? null,
      flagged: body.flagged ?? false, scored: isCorrect !== null,
      notes: explanation ?? null,
    },
    update: {
      userAnswer: body.userAnswer, isCorrect, seconds: body.seconds ?? undefined,
      flagged: body.flagged ?? undefined, scored: isCorrect !== null,
      notes: explanation ?? null,
    },
  });

  return Response.json({ ok: true, data: { saved: true, index: body.index, isCorrect, explanation } });
}
```

> **Không** đụng `Card` ở route này (D2).

#### `POST /api/test/grade-open` (AI-15)

```ts
export interface GradeOpenBody { testId: string; index: number; }

export async function POST(req: NextRequest): Promise<Response> {
  const body = GradeOpenSchema.parse(await req.json());

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, error: "no_api_key" }, { status: 503 });
  }

  const item = await prisma.testItem.findUnique({
    where: { testId_index: { testId: body.testId, index: body.index } },
    include: { test: true },
  });
  if (!item) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  if (item.scored && item.rubric) {
    return Response.json({ ok: false, error: "already_graded" }, { status: 409 });
  }
  if (!item.userAnswer) {
    return Response.json({ ok: false, error: "empty_answer" }, { status: 400 });
  }

  const result = await gradeOpenItem({
    lang: item.test.lang,
    itemType: item.itemType,
    prompt: item.prompt,
    reference: item.answer,
    userAnswer: item.userAnswer,
  });

  await prisma.testItem.update({
    where: { id: item.id },
    data: {
      rubric: result.rubric as unknown as Prisma.InputJsonValue,
      errorGroups: result.errors as unknown as Prisma.InputJsonValue,
      notes: result.feedback,
      isCorrect: result.score >= 6,     // ngưỡng đạt: trung bình 4 nhóm ≥ 6/10
      scored: true,
    },
  });

  return Response.json({ ok: true, data: { index: body.index, ...result } });
}
```

**AI-15 — chấm theo đúng 4 nhóm lỗi (P4, AC-12):**

```ts
// src/lib/prompts.ts — dùng lại RUBRIC_LANGUAGE_ERRORS từ ai-foundation
export const TEST_GRADE_SYSTEM = `
Bạn là giáo viên chấm bài ngoại ngữ. Chấm theo ĐÚNG 4 nhóm lỗi đã định nghĩa sẵn.
Mỗi nhóm chấm 0-10 (10 = không lỗi). Mỗi lỗi phải gắn vào đúng 1 nhóm.
Không được tạo nhóm lỗi ngoài 4 nhóm. Không chấm các tiêu chí khác.
`.trim();

export const TestGradeSchema = z.object({
  rubric: z.object({
    grammar:    z.number().min(0).max(10),
    vocab:      z.number().min(0).max(10),
    expression: z.number().min(0).max(10),
    context:    z.number().min(0).max(10),
  }).strict(),                                   // strict → nhóm lạ bị reject (AC-12)
  errors: z.object({
    grammar:    z.array(z.string()),
    vocab:      z.array(z.string()),
    expression: z.array(z.string()),
    context:    z.array(z.string()),
  }).strict(),
  feedback: z.string(),
  correctedAnswer: z.string().nullable(),
});
```

```ts
export async function gradeOpenItem(input: {
  lang: Lang; itemType: ItemType; prompt: string;
  reference: string | null; userAnswer: string;
}): Promise<{
  rubric: RubricScores;
  errors: Record<ErrorGroupKey, string[]>;
  score: number;               // trung bình 4 nhóm (code tính, không tin AI)
  feedback: string;
  correctedAnswer: string | null;
}> {
  const res = await callAIStream({
    feature: "language_test",
    model: "claude-opus-5",
    effort: "medium",
    system: [TEST_GRADE_SYSTEM, getRubricBlock("RUBRIC_LANGUAGE_ERRORS")],
    messages: [buildGradeUserMessage(input)],
    parse: TestGradeSchema,
  });

  const rubric = res.rubric;
  const score = (rubric.grammar + rubric.vocab + rubric.expression + rubric.context) / 4; // FR-AI-13
  return { rubric, errors: res.errors, score, feedback: res.feedback, correctedAnswer: res.correctedAnswer };
}
```

> `RUBRIC_LANGUAGE_ERRORS` dùng chung từ `ai-foundation` (`src/lib/prompts.ts`): `grammar` (Ngữ pháp) · `vocab` (Từ vựng) · `expression` (Cách diễn đạt) · `context` (Ngữ cảnh).

#### `POST /api/test/level` (AI-16)

```ts
export async function POST(req: NextRequest): Promise<Response> {
  const body = LevelSchema.parse(await req.json());   // { testId }

  const session = await prisma.testSession.findUnique({ where: { id: body.testId } });
  if (!session) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  const items = await prisma.testItem.findMany({
    where: { testId: body.testId },
    orderBy: { index: "asc" },
  });
  if (items.length === 0) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const lang = session.lang as Lang;
  const summary = summarizeSession(items as ScoredItem[], {
    testId: body.testId, lang, testType: session.testType as TestType, durationSec: 0,
  });
  const local = estimateLevelLocal(summary.byItemType, summary.score, summary.maxScore);

  if (!process.env.ANTHROPIC_API_KEY) {
    // Offline → dùng band code, ghi rõ nguồn để S21 hiện chip "Ước lượng cục bộ"
    await prisma.testSession.update({
      where: { id: body.testId },
      data: { level: local.level, levelSource: "local" },
    });
    return Response.json({
      ok: true,
      data: { ...local, levelLabel: levelLabel(lang, local.level), source: "local" },
    });
  }

  try {
    const ai = await callAIJson({
      feature: "language_test",
      model: "claude-opus-5",
      effort: "low",
      system: [TEST_LEVEL_SYSTEM],
      messages: [buildLevelUserMessage(summary, local.level)],
      parse: TestLevelSchema,
    });
    // Clamp: AI lệch >1 bậc so với band code → dùng band code (LT-R6)
    const level = clampLevel(ai.level, local.level);

    // Lưu level + nguồn level vào phiên (S21 đọc lại, không gọi AI 2 lần)
    await prisma.testSession.update({
      where: { id: body.testId },
      data: { level, levelSource: "ai" },
    });

    return Response.json({
      ok: true,
      data: {
        ...local, ...ai, level,
        levelLabel: levelLabel(lang, level),
        source: "ai",
      },
    });
  } catch (err) {
    await logAiCallFailure(err);
    return Response.json({
      ok: true,
      data: { ...local, levelLabel: levelLabel(lang, local.level), source: "local" },
    });
  }
}
```

```ts
export const TestLevelSchema = z.object({
  level: z.enum(["zero","A1","A2","B1","B2","C1"]),
  cefr: z.enum(["A1","A2","B1","B2","C1"]),
  hsk: z.number().int().min(1).max(6),
  confidence: z.number().min(0).max(1),
  bottleneck: z.enum(["mc_vocab","mc_grammar","cloze","listening","writing","translation"]).nullable(),
  reason: z.string(),
});
```

#### `POST /api/test/submit`

```ts
export interface SubmitBody { testId: string; reason?: "manual" | "timeout"; }

export async function POST(req: NextRequest): Promise<Response> {
  const body = SubmitSchema.parse(await req.json());

  const session = await prisma.testSession.findUnique({
    where: { id: body.testId },
    include: { items: { orderBy: { index: "asc" } } },
  });
  if (!session) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  if (session.status !== "active") {
    return Response.json({ ok: false, error: "already_submitted" }, { status: 409 });
  }

  const items = session.items as unknown as ScoredItem[];
  const durationSec = Math.max(0, Math.floor((Date.now() - session.startedAt.getTime()) / 1000));

  // Câu chưa trả lời (timeout) → đánh dấu bỏ trống, KHÔNG đẩy thẻ về ôn
  const finalized = items.map((it) =>
    it.userAnswer == null || it.userAnswer === ""
      ? { ...it, isCorrect: false, scored: true }
      : it,
  );

  const summary = summarizeSession(finalized, {
    testId: session.id, lang: session.lang as Lang,
    testType: session.testType as TestType, durationSec,
  });

  // Toàn bộ ghi (đẩy thẻ về ôn + Activity/Evidence + level + trạng thái phiên)
  // nằm trong 1 transaction → không để lại trạng thái nửa vời.
  const result = await prisma.$transaction(async (tx) => {
    // FR-LT-06 — đẩy thẻ về ôn (chỉ câu đã trả lời sai)
    const pushed = await applyFsrsAgain(
      finalized.filter((i) => i.isCorrect === false && i.userAnswer && !i.flagged),
      tx,
    );

    // FR-LT-11 — Activity + Evidence
    const { activity, evidence } = await createTestEvidence({
      lang: session.lang as Lang,
      testType: session.testType as TestType,
      topic: session.topic,
      minutes: Math.max(1, Math.round(durationSec / 60)),
      aiScore: summary.maxScore > 0 ? summary.score / summary.maxScore : 0,
      pushedCount: pushed.length,
    }, tx);

    // FR-LT-07 — placement set level hồ sơ
    if (session.testType === "placement") {
      await setProfileLevel(session.lang as Lang, summary.levelLocal, tx);
    }

    await tx.testItem.updateMany({
      where: { testId: session.id, userAnswer: null },
      data: { isCorrect: false, scored: true },
    });
    await tx.testSession.update({
      where: { id: session.id },
      data: {
        status: body.reason === "timeout" ? "expired" : "done",
        score: summary.score, maxScore: summary.maxScore,
        durationSec, level: summary.levelLocal, endedAt: new Date(),
      },
    });

    return { pushed, activity, evidence };
  });

  const { pushed, activity, evidence } = result;

  return Response.json({
    ok: true,
    data: {
      testId: session.id, score: summary.score, maxScore: summary.maxScore,
      correct: summary.correct, total: summary.total, durationSec,
      byItemType: summary.byItemType, pushedCards: pushed,
      activityId: activity.id, evidenceId: evidence.id, level: summary.levelLocal,
    },
  });
}
```

#### `GET /api/test/[id]`

```ts
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  const session = await prisma.testSession.findUnique({
    where: { id },
    include: { items: { orderBy: { index: "asc" } } },
  });
  if (!session) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  const items = session.items as unknown as ScoredItem[];
  const summary = summarizeSession(items, {
    testId: session.id, lang: session.lang as Lang,
    testType: session.testType as TestType, durationSec: session.durationSec ?? 0,
  });

  // So sánh với phiên benchmark gần nhất trước đó (cùng lang)
  const prev = await prisma.testSession.findFirst({
    where: {
      lang: session.lang, testType: "benchmark",
      createdAt: { lt: session.createdAt },
      status: { in: ["done", "expired"] },
    },
    orderBy: { createdAt: "desc" },
  });

  // Chỉ tính delta khi đề SONG SONG về độ khó (FR-LT-12):
  // formSignature khác ⇒ hai đề không cùng độ khó ⇒ điểm không so sánh được.
  const comparable = prev !== null && prev.formSignature === session.formSignature;

  // Thẻ bị đẩy về ôn: lấy từ Review có source="test" + cardId của các câu sai
  const pushedCards = await getPushedCardsForSession(session.id);

  // Placement → gợi ý nhóm từ bắt đầu + bài tập đầu tiên (FR-LT-07)
  const suggested =
    session.testType === "placement"
      ? suggestedGroupForLevel(session.lang as Lang, (session.level as LevelCode) ?? "zero")
      : null;

  // Activity/Evidence đã tạo lúc nộp bài — tra cùng 1 truy vấn
  const activity = await prisma.activity.findFirst({
    where: { domain: "language", type: "test", createdAt: { gte: session.createdAt } },
    orderBy: { createdAt: "desc" },
    select: { id: true, evidences: { select: { id: true }, take: 1 } },
  });

  return Response.json({
    ok: true,
    data: {
      session: { ...session, items: undefined },
      items, byItemType: summary.byItemType,
      pushedCards,
      comparison: comparable && prev
        ? { prevScore: prev.score ?? 0, prevMaxScore: prev.maxScore ?? 0,
            deltaCorrect: summary.correct - Math.round((prev.score ?? 0)),
            prevDate: prev.createdAt.toISOString() }
        : null,
      comparisonUnavailableReason:
        prev === null
          ? "Chưa có kỳ thi trước để so sánh"
          : comparable
            ? null
            : "Đề không cùng độ khó với kỳ trước — không tính delta",
      suggestedGroup: suggested,
      levelSource: session.levelSource ?? "local",
      activityId: activity?.id ?? null,
      evidenceId: activity?.evidences[0]?.id ?? null,
    },
  });
}
```

### 3.10 `src/lib/prompts.ts` — prompt AI-16 & các hằng số

```ts
export const TEST_LEVEL_SYSTEM = `
Bạn là chuyên gia đánh giá trình độ ngoại ngữ theo thang nội bộ 5 mức (zero..A1..C1),
có tương đương CEFR và HSK.
Nhiệm vụ: chọn level phù hợp từ dữ liệu kết quả bài kiểm tra.
Quy tắc:
- Chỉ được chọn level trong enum: zero, A1, A2, B1, B2, C1.
- Nếu tỷ lệ đúng theo một dạng câu thấp hơn 40% → hạ 1 bậc so với điểm chung.
- Bottleneck = dạng câu có tỷ lệ đúng thấp nhất.
- `reason` tối đa 2 câu, nêu rõ dạng yếu, không bịa số liệu ngoài dữ liệu được cung cấp.
`.trim();

export const RUBRIC_LANGUAGE_ERRORS = [
  { key: "grammar",    name: "Ngữ pháp" },
  { key: "vocab",      name: "Từ vựng" },
  { key: "expression", name: "Cách diễn đạt" },
  { key: "context",    name: "Ngữ cảnh" },
];   // ← dùng chung với AI-09 (S11), nguồn chân lý SPEC §5.4
```

### 3.11 Hàm truy vấn dữ liệu (Prisma thật)

```ts
// Chọn thẻ yếu: lapses DESC, difficulty DESC, stability ASC (FR-LT-10)
export async function pickWeakCards(
  opts: { lang: Lang; topic: string | null; limit: number; excludeCardIds: string[] },
): Promise<Array<{ cardId: string; front: string; back: string; frontAlt: string | null; band: DifficultyBand }>> {
  const rows = await prisma.card.findMany({
    where: {
      lang: opts.lang,
      id: { notIn: opts.excludeCardIds },
      ...(opts.topic ? { group: opts.topic } : {}),
    },
    select: { id: true, front: true, frontAlt: true, back: true, lapses: true, difficulty: true, stability: true },
    orderBy: [{ lapses: "desc" }, { difficulty: "desc" }, { stability: "asc" }],
    take: opts.limit,
  });
  return rows.map((c) => ({
    cardId: c.id, front: c.front, back: c.back, frontAlt: c.frontAlt,
    band: assignBand(c),
  }));
}

// Loại thẻ đã dùng trong 3 phiên gần nhất (parallel form, R10)
export async function getRecentlyUsedCardIds(lang: Lang, sessions: number = 3): Promise<string[]> {
  const recent = await prisma.testSession.findMany({
    where: { lang, status: { in: ["done", "expired"] } },
    orderBy: { createdAt: "desc" },
    take: sessions,
    select: { id: true },
  });
  if (recent.length === 0) return [];
  const items = await prisma.testItem.findMany({
    where: { testId: { in: recent.map((r) => r.id) }, cardId: { not: null } },
    select: { cardId: true },
  });
  return [...new Set(items.map((i) => i.cardId).filter((c): c is string => c !== null))];
}

// Danh sách thẻ bị đẩy về ôn của 1 phiên (đọc từ Review source="test")
export async function getPushedCardsForSession(testId: string): Promise<PushedCard[]> {
  const items = await prisma.testItem.findMany({
    where: { testId, isCorrect: false, cardId: { not: null } },
    select: { cardId: true, index: true, itemType: true },
    orderBy: { index: "asc" },
  });
  const cardIds = [...new Set(items.map((i) => i.cardId!).filter(Boolean))];
  if (cardIds.length === 0) return [];

  const cards = await prisma.card.findMany({
    where: { id: { in: cardIds } },
    select: { id: true, front: true, frontAlt: true, back: true, due: true, lapses: true, stability: true, difficulty: true },
  });
  const byId = new Map(cards.map((c) => [c.id, c]));
  return cardIds.flatMap((cardId) => {
    const card = byId.get(cardId);
    if (!card) return [];                     // thẻ đã bị xoá → bỏ qua, không crash
    const first = items.find((i) => i.cardId === cardId)!;
    return [{
      cardId, front: card.front, frontAlt: card.frontAlt, back: card.back,
      due: formatDate(card.due), lapses: card.lapses,
      stability: card.stability, difficulty: card.difficulty,
      retrievability: estimateRetrievability(card),   // forgetting_curve(0.9, elapsed, S)
      reason: `Câu ${first.index + 1} — ${first.itemType}`,
    }];
  });
}
```

## 4. Luồng dữ liệu

### 4.1 Luồng chính — sinh đề (AI-14)

1. `POST /api/test/generate` → validate bằng Zod (`GenerateTestSchema`).
2. Kiểm tra phiên `active` cùng `lang` → nếu có, trả `409` kèm `testId` để client điều hướng tới phiên đang chạy.
3. `buildBlueprint()`:
   - `excludeCardIds = getRecentlyUsedCardIds(lang, 3)`.
   - `userCards = pickWeakCards({ lang, topic, limit: ceil(count * 0.6), excludeCardIds })`.
   - `seedCards = pickSeedCards({ lang, level, limit: count - userCards.length })` — ngân hàng seed cho level đó.
   - Nếu tổng < `count` → bù bằng `noCardItems` (dạng `mc_grammar` tổng quát) và gắn cờ `reused = true`.
   - `bands = assignBand(...)` theo độ yếu thẻ.
   - `formSignature = parallelFormSignature(itemTypes, bands)`.
4. `generateTestItems(blueprint)` → gọi AI-14 (streaming) → `reconcileGeneratedItems` (D7).
5. Ghi `TestSession` + `TestItem[]` trong 1 transaction → trả `testId`.

### 4.2 Luồng chính — làm bài & lưu từng câu

1. `POST /api/test/answer` → upsert `TestItem` theo `(testId, index)`:
   - objective → `scoreObjective()` → `isCorrect` + `notes` (giải thích ngắn).
   - tự luận → `isCorrect = null`, `scored = false`; client gọi nền `POST /api/test/grade-open`.
2. `POST /api/test/grade-open` → AI-15 → ghi `rubric`, `errorGroups`, `notes`, `isCorrect = score >= 6`, `scored = true`.
3. Timer đếm 0 → `POST /api/test/submit { reason: "timeout" }`.

### 4.3 Luồng chính — nộp bài & đẩy thẻ về ôn (FR-LT-06)

1. Load `TestSession` + `items`.
2. `finalized` = items có `userAnswer` rỗng → `isCorrect = false`, `scored = true`, **không** đẩy thẻ.
3. `summarizeSession(finalized)` → `score`, `byItemType`, `wrongItems`.
4. `estimateLevelLocal(byItemType, score, maxScore)` → `levelLocal` + `bottleneck` (luôn có).
5. `applyFsrsAgain(wrongItems.filter(i => i.userAnswer))`:
   - Dedupe `cardId` (giữ lần đầu).
   - `scheduler.next(prev, now, Rating.Again)` → `stability` ↓, `difficulty` ↑.
   - Ghi `Card { due: today, stability, difficulty, reps+1, lapses+1, cardState }`.
   - Ghi `Review { cardId, rating: 1, state, source: "test" }`.
6. `createTestEvidence(...)` → `Activity { domain:"language", type:"test", minutes, aiScore, skillId }` + `Evidence { skillId, rating }`.
7. `placement` → `setProfileLevel(lang, levelLocal)` (FR-LT-07) + `suggestedGroupForLevel()` cho gợi ý nhóm từ.
8. `UPDATE TestSession { status, score, maxScore, durationSec, level, endedAt }`.

> Các bước 4–8 nằm trong **1 transaction** (trừ bước 5 ghi `Card`/`Review` cũng trong cùng transaction) → không trạng thái nửa vời.

### 4.4 Lưu trữ & truy vấn — S19

```ts
// Tiến độ benchmark theo thời gian (FR-LT-08)
const trend = await prisma.testSession.findMany({
  where: { lang, testType: "benchmark", status: { in: ["done", "expired"] } },
  orderBy: { createdAt: "asc" },
  select: { id: true, score: true, maxScore: true, level: true, createdAt: true, formSignature: true },
});
// → [{ label: "T41", rate: score/maxScore, level, date, formSignature }]

// Tỷ lệ đúng theo 6 dạng câu (tất cả phiên đã chấm)
const byItemType = await prisma.testItem.groupBy({
  by: ["itemType"],
  where: { isCorrect: { not: null }, test: { lang } },
  _count: { _all: true },
  _sum: { isCorrect: true },     // SQLite: đếm số true bằng filter
});
// → dùng 2 query (count tổng + count đúng) cho chắc ăn, không dựa vào _sum boolean
```

```ts
// 5 từ sai nhiều nhất (S19) — theo lapses của Card
const topWrong = await prisma.card.findMany({
  where: { lang, lapses: { gt: 0 } },
  orderBy: [{ lapses: "desc" }, { difficulty: "desc" }],
  take: 5,
  select: { id: true, front: true, frontAlt: true, back: true, lapses: true },
});
```

```ts
// Số thẻ bị đẩy về ôn hôm nay (SRS pill trên S19)
const pushedToday = await prisma.review.count({
  where: {
    source: "test",
    at: { gte: startOfToday(), lt: endOfToday() },
    card: { lang },
  },
});
```

### 4.5 Lưu trữ & truy vấn — S21

```ts
// So sánh với kỳ trước
const prev = await prisma.testSession.findFirst({
  where: {
    lang, testType: "benchmark",
    createdAt: { lt: session.createdAt },
    status: { in: ["done", "expired"] },
  },
  orderBy: { createdAt: "desc" },
});
// Nếu prev.formSignature !== session.formSignature → không tính delta (đề không song song)
```

## 5. Xử lý lỗi

| Tình huống | Phát hiện | Xử lý | Thông báo người dùng |
|---|---|---|---|
| Thiếu `ANTHROPIC_API_KEY` | `!process.env.ANTHROPIC_API_KEY` | 503, UI ẩn nút AI | "Bật sinh đề AI bằng cách thêm API key trong Cài đặt" |
| `RateLimitError` (429) | typed exception của SDK | ghi `AiCall{ok:false}` | "AI đang tải cao. Thử lại sau vài phút." + nút "Thử lại" |
| `stop_reason === "refusal"` | kiểm tra **trước** khi đọc `content` | log lỗi, trả 502 | "AI không thể soạn đề lúc này. Bạn có thể thử lại." |
| `APIConnectionError` / timeout | typed exception | log lỗi, trả 502 | "Mất kết nối tới AI. Thử lại." |
| Structured output sai schema (AI-15 trả nhóm lạ) | `schema.safeParse` fail (schema `strict`) | trả 502, **không** ghi `errorGroups` | "Câu này chưa chấm được — thử lại." |
| AI-14 trả sai số câu | `reconcileGeneratedItems` | cắt/bù, gắn `warnings` | "Đề có 23/25 câu — phần còn thiếu đã bỏ qua." |
| `TestItem` trùng khi double-click | unique `(testId, index)` | `upsert` | (không hiện lỗi — upsert thành công) |
| Câu index ngoài phạm vi | Zod refine + check DB | 400 | "Câu không hợp lệ." |
| Nộp bài 2 lần | `status !== "active"` | 409 + trả kết quả cũ | (client bỏ qua, điều hướng S21) |
| Không có thẻ nào gắn với câu sai | `cardId = null` | không ghi `Card` nào | "0 thẻ bị đẩy về ôn sớm" |
| `Card.cardState` JSON hỏng | `safeParseCardState` → `null` | dùng `createEmptyCard(today)` | (không hiện — vẫn đẩy thẻ về ôn an toàn) |
| Thẻ đã bị xoá giữa bài | `card.findMany` không trả về | bỏ qua thẻ đó | (không hiện thẻ đó trong danh sách) |
| AI-16 lỗi / offline | catch + `logAiCallFailure` | trả `source:"local"` | chip "Ước lượng cục bộ" |
| Query DB lỗi | Prisma exception | 500 + log | "Không tải được kết quả. Thử tải lại trang." |
| Ghi `Activity`/`Evidence` lỗi | transaction throw | rollback toàn bộ | "Không lưu được kết quả. Thử lại." |

## 6. Chiến lược kiểm thử

| Tầng | Công cụ | Phạm vi |
|---|---|---|
| Unit | Vitest | `normalizeAnswer` — bỏ khoảng trắng/hoa thường/dấu câu; `scoreObjective` cho `mc_*`/`cloze`/`listening`; `itemScore` (objective 1/0, tự luận = trung bình 4 nhóm / 10). |
| Unit | Vitest | `assignBand` — `lapses>=2` hoặc `difficulty>=7` → band 3; `estimateLevelLocal` — ngưỡng + trừ 1 bậc khi có dạng < 40%; `clampLevel` — AI lệch >1 bậc bị kéo về. |
| Unit | Vitest | `parallelFormSignature` — cùng `itemTypes` + `bands` ⇒ cùng chữ ký; khác bands ⇒ khác chữ ký. |
| Unit | Vitest | `reconcileGeneratedItems` — AI trả thừa/thiếu → cắt/bù, **không** nhân bản item, có `warnings`. |
| Unit | Vitest | `summarizeSession` — tổng `correct + total` khớp `items.length` (AC-LT-4). |
| Integration | Vitest + SQLite test DB | `POST /api/test/answer` 2 lần cùng `(testId, index)` → vẫn 1 bản ghi (D9). |
| Integration | Vitest + SQLite test DB | `POST /api/test/submit` với 5 câu sai có `cardId` → 5 thẻ có `due = hôm nay`, `lapses +1`, `stability` giảm (AC-11). |
| Integration | Vitest + SQLite test DB | `POST /api/test/submit` với 5 câu sai **không** có `cardId` → 0 thẻ đổi, response `pushedCards = []`, không lỗi (AC-11 case 2). |
| Integration | Vitest + SQLite test DB | 1 thẻ sai ở 3 câu → `lapses` tăng **1** (D3/LT-R4). |
| Integration | Vitest + SQLite test DB | Câu sai ở đề có timer hết hạn (`userAnswer = null`) → **không** đẩy thẻ (LT-R9). |
| Integration | Vitest + SQLite test DB | `POST /api/test/submit` tạo đúng 1 `Activity` (`domain="language"`, `type="test"`) + ≥1 `Evidence` (AC-LT-8). |
| Integration | Vitest (mock AI) | AI-15 trả rubric có nhóm lạ → 502, `TestItem.errorGroups` **không** đổi (AC-12). |
| Integration | Vitest (mock AI) | AI-14 trả 22/25 câu → phiên có 22 item + `warnings`, không nhân bản. |
| Integration | Vitest (mock AI) | AI-16 trả `C1` trong khi band code = `A1` → level bị clamp về `A1` (LT-R6). |
| Integration | Vitest + SQLite test DB | Đóng tab giữa bài → `GET /api/test/[id]` trả đúng `userAnswer` đã lưu (AC-LT-7). |
| Integration | Vitest + SQLite test DB | 2 đề `benchmark` liên tiếp cùng `lang` → `formSignature` bằng nhau, không trùng `cardId` (AC-LT-6). |
| E2E | Playwright | S19 → bấm "Bắt đầu" → S20 hiện đúng số câu → trả lời → reload → đáp án còn. |
| E2E | Playwright | S20 hết giờ → tự nộp → S21 hiện "Hết thời gian — đã nộp tự động". |
| E2E | Playwright | S21 với bài không có câu sai gắn thẻ → hiện "0 thẻ bị đẩy về ôn", không crash (AC-11). |
| E2E | Playwright | S21 không API key → level hiện "Ước lượng cục bộ", số liệu thật vẫn đủ (NFR-LT-02). |
| A11y | axe | Option có `role="radio"` + `aria-checked`; timer `aria-live`; icon-only button có `aria-label`; radar SVG có `role="img"` + `aria-label`. |
| Responsive | Playwright 390px | Ma trận câu hỏi scroll ngang; nút "Câu tiếp theo" trong vùng ngón cái; không tràn viewport. |
| Offline | Playwright | Không `ANTHROPIC_API_KEY` → 3 màn hình vẫn render, nút AI ẩn, không số liệu giả. |

## 7. Rủi ro & đánh đổi kỹ thuật

| # | Rủi ro | Tác động | Giảm thiểu |
|---|---|---|---|
| T1 | **AI-14 sinh 40 câu** → token lớn, chậm (có thể 30–60s) | Người dùng chờ lâu | Streaming + tiến trình "Đang soạn đề…"; cache system prompt; `effort: medium`; timeout 90s → trả thông báo + nút Thử lại. |
| T2 | **Đề dài (40 câu) + đóng tab** | Mất dữ liệu | Ghi từng câu ngay; banner "Đã lưu vào SQLite lúc HH:mm:ss"; khôi phục phiên `active`. |
| T3 | **Truy vấn `TestItem.groupBy` với `_sum` trên boolean** (SQLite không có boolean thật) | Sai số liệu | Dùng 2 query: `count` tổng + `count` đúng (`isCorrect: true`); không dùng `_sum: { isCorrect: true }`. |
| T4 | **`TestItem` không có unique `(testId, index)`** | Double-click tạo bản ghi trùng, điểm sai | Migration thêm `@@unique([testId, index])`; `upsert` bằng compound key. |
| T5 | **`Card.cardState` JSON hỏng** (do đổi version FSRS) | Crash khi áp `Again` | `safeParseCardState` → fallback `createEmptyCard(today)`; ghi `lapses+1` vẫn an toàn. |
| T6 | **Sửa câu đã trả lời làm thay đổi điểm giữa chừng** | Người dùng nhầm lẫn | Điểm tổng chỉ tính lúc nộp bài; UI hiện badge "Đã sửa" ở câu bị sửa. |
| T7 | **Tính `elapsedSec` sai khi người dùng để tab treo** | Thời gian câu vô lý | `seconds` đo bằng timestamp mở câu → đóng câu phía client, clamp `[1, 600]`; không tin `Date.now()` phía server. |
| T8 | **AI-15 gọi 1 call/câu tự luận** → 4 câu tự luận = 4 call | Chi phí tăng | 1 bài 40 câu có 8 câu tự luận → 8 call; cache system prompt giữ giá rẻ; `AiCall` theo dõi; gọi **nền** nên không chặn người dùng. |
| T9 | **Mất khóa khi 2 tab cùng mở `/test/session`** | Ghi đè đáp án | Chỉ 1 phiên `active` cho mỗi `lang` (`409` + `testId`); tab thứ 2 chuyển hướng về phiên đang chạy. |
| T10 | **`from_content` gửi văn bản dài lên API** | Tốn token / vi phạm P6 nếu gửi nhầm | Chỉ gửi khi người dùng **chủ động** bấm "Tạo đề từ tài liệu"; cắt 8.000 ký tự; ghi log trong S15 (NFR-04). |
| T11 | **Đề `benchmark` không đủ thẻ** (người dùng mới, 0 thẻ) | Không tạo được đề | Bù bằng ngân hàng seed; nếu vẫn thiếu → cân bằng lại sang dạng không cần thẻ + cảnh báo "Ngân hàng thẻ còn thiếu". |
| T12 | **Sai số level do AI** | Mất niềm tin | Band code do code tính là nguồn số; AI chỉ chọn enum + clamp; hiển thị `source` ("Ước lượng cục bộ" khi offline). |
| T13 | **Thêm migration `Review.source` + `TestSession.status`** | Migration lỗi trên DB cũ | Migration additive (field có default); `prisma migrate dev` chạy trên DB dev; seed không cần sửa. |
| T14 | **`from_content` cần câu `writing` nhưng `TEST_ITEM_DISTRIBUTION` chỉ có 1 câu tự luận** | Điểm tự luận không đủ tín hiệu để ước lượng level | `estimateLevelLocal` tính band từ tỷ lệ đúng chung + bottleneck; câu tự luận 1/10 có trọng số nhỏ, không làm méo band. |
