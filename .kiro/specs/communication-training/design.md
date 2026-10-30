# Design — Luyện Giao Tiếp & Luyện Ngoại Ngữ Chủ Động

> Bổ sung cho `spec.md` cùng feature. Tuân thủ `.kiro/steering/tech.md` (AI layer, prompt caching, structured output) và `.kiro/steering/design-system.md` (token, shape).

## 1. Tổng quan kiến trúc

Ba màn hình dùng **một pipeline chấm điểm duy nhất** với hai rubric khác nhau, cộng một pipeline hội thoại AI và một pipeline sửa lỗi ngôn ngữ.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  UI (Client Components)                                                        │
│  ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────────────┐ │
│  │ S07 WriteConsole   │ │ S08 TalkConsole    │ │ S11 PracticeConsole       │ │
│  │  · editor + toolbar │ │  · MediaRecorder   │ │  · Tab 1: IME editor      │ │
│  │  · rubric panel     │ │  · SpeechRecognition│ │  · Tab 2: Role-play chat │ │
│  │  · evidence commit  │ │  · live transcript │ │  · 4-nhóm lỗi + flashcards │ │
│  └─────────┬──────────┘ └─────────┬──────────┘ └─────────────┬──────────────┘ │
└────────────┼──────────────────────┼──────────────────────────┼─────────────────┘
             │ POST /api/grade     │ POST /api/grade        │ POST /api/language/correct
             │ (AI-03 write)       │ (AI-04 speak)          │ (AI-09)  · POST /api/language/cards (AI-10)
             │                     │                        │ POST /api/roleplay (AI-08)
             ▼                     ▼                        ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  src/lib/grading.ts   — pipeline chấm dùng chung (thuần, không gọi AI)           │
│   computeTotal() · buildGradeUserMessage() · computeDelta() · ratingFromScore() │
│   findPreviousAttempt() · validateGradingInput()                                │
│  src/lib/prompts.ts   — RUBRIC_COMMUNICATION · RUBRIC_LANGUAGE_ERRORS           │
│                         GRADING_SYSTEM · ROLEPLAY_SYSTEM · LANGUAGE_CORRECT_SYSTEM│
│  src/lib/anthropic.ts — callAIStream() / callAI() → tự ghi AiCall               │
└───────────────┬──────────────────────────────────────────────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Anthropic SDK                                                                │
│   AI-03/04 claude-opus-5  streaming  effort medium  structured rubric (5 tiêu chí)│
│   AI-08    claude-opus-5  streaming  effort medium  text (role-play)            │
│   AI-09    claude-opus-5  streaming  effort medium  structured 4 nhóm lỗi        │
│   AI-10    claude-haiku-4-5 không streaming effort low structured mảng thẻ       │
└──────────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Prisma (SQLite)  →  Activity + Evidence (P3) · Card (FSRS) · SpeakAttempt       │
│                       SpeakPrompt · RoleplaySession/Turn · LanguagePractice      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Nguyên tắc tách lớp:** phần **tính toán** (tổng điểm, delta, mapping `rating`, ngưỡng độ dài tối thiểu) nằm hoàn toàn trong `src/lib/grading.ts` — thuần, không gọi AI, không đụng DB. Nhờ vậy:
- Tổng điểm luôn = trung bình tiêu chí (AC-CM-2) **không** phụ thuộc AI có làm đúng hay không.
- Delta tính được cả khi lần trước thiếu tiêu chí (NFR-CM-07).
- Unit test được 100% mà không cần mock mạng.

## 2. Kiến trúc

### 2.1 Sơ đồ luồng — S07 (Viết, AI-03)

```
User mở /speak/write
   │
   ├─► getSpeakPrompts({level, lang, mode})      ──► 12 bài mẫu + bài tự tạo
   ├─► getLatestAttempt({mode:"write"})          ──► attempt trước (để tính delta)
   │
   └─► <WriteConsole> (Client)
          │  state: content, level, promptId, criteria{}, total, delta
          │  auto-save nháp (debounce 800ms) → POST /api/speak/prompts?no…
          │
          └─► bấm "Chấm bằng AI" (Ctrl+Enter)
                 │
                 ├─ validateGradingInput()  ──► quá ngắn → chặn, không gọi AI
                 │
                 └─► POST /api/grade  { mode:"write", prompt, level, lang, content }
                        │
                        ├─ (server) callAIStream({
                        │      feature:"grading",
                        │      model:"claude-opus-5",
                        │      effort:"medium",
                        │      system:[GRADING_SYSTEM, RUBRIC_COMMUNICATION+cache],
                        │      messages:[buildGradeUserMessage(...)],   // biến động
                        │      parse: GradeSchema,
                        │   })
                        │
                        ├─ stream NDJSON về client:
                        │     {type:"meta"}            → bật skeleton
                        │     {type:"criterion",×5}     → lần lượt hiện tiêu chí
                        │     {type:"delta"}            → hiện ▲/▼
                        │     {type:"done"}             → tổng + activityId + evidence
                        │
                        └─ (server) trong 1 transaction:
                             create Activity(domain="communication", type="write", aiScore)
                             create Evidence(skillId=skillViết, rating=ratingFromScore(total))
                             create SpeakAttempt(rubric, totalScore, delta)
```

### 2.2 Sơ đồ luồng — S08 (Nói, AI-04)

```
User mở /speak/talk
   │
   ├─► getSpeakPrompts({mode:"speak"}) + getSpeakScenarios()
   │
   └─► <TalkConsole> (Client)
          │
          ├─► useRecorder()                     ──► MediaRecorder (audio/webm;codecs=opus)
          │      states: idle | recording | paused | stopped | error(permission)
          │      emits: {durationSec, sampleRate, peaks[]}
          │
          ├─► useSpeechRecognition()            ──► webkitSpeechRecognition
          │      lang = "en-US" | "vi-VN"        continuous=true, interimResults=true
          │      emits: {interim, final[], wordCount}
          │
          ├─► buildSpeechMeta(transcript, recorderState)  ──► {durationSec, wordsPerMinute,
          │                                                            fillerWords[], pauses[]}
          │      (purity: ưu tiên final; interim chỉ hiển thị)
          │
          └─► bấm "Gửi AI Chấm & Phân tích âm vị" (Ctrl+Enter)
                 │
                 ├─ transcript rỗng → chặn, không gọi AI
                 ├─ không có SpeechRecognition → mở ô nhập transcript tay
                 │
                 └─► POST /api/grade { mode:"speak", transcript, speechMeta, level, lang }
                        │
                        ├─ callAIStream(AI-04, system=[GRADING_SYSTEM, RUBRIC_COMMUNICATION
                        │     + SPEECH_NOTE_BLOCK]  →  5 tiêu chí + speechNotes)
                        │
                        └─ Activity(domain="communication", type="speak", minutes=ceil(sec/60))
                           + Evidence(skillNói) + SpeakAttempt(speechMeta, rubric)
```

> **Điểm mấu chốt:** S08 dùng **cùng `RUBRIC_COMMUNICATION`** với S07 → điểm viết và điểm nói so sánh được. Phần khác biệt (từ điệu/độ rõ) là **block bổ sung** `SPEECH_NOTE_BLOCK` trong system prompt, không phải tiêu chí thứ 6.

### 2.3 Sơ đồ luồng — S11 Tab 1 (AI-09 + AI-10)

```
User mở /language/practice?tab=write
   │
   ├─► getLanguagePrompts({lang})  ──► đề + từ khoá bắt buộc
   │
   └─► <PracticeConsole> (Client)
          │  textarea (IME-friendly), đếm ký tự Hanzi + số câu
          │
          └─► bấm "Chấm & Phân tích 4 nhóm lỗi" (Ctrl+Enter)
                 │
                 ├─ input < 5 ký tự Hanzi → chặn
                 │
                 └─► POST /api/language/correct { lang, level, prompt, input, keywords }
                        │
                        ├─ callAIStream(AI-09, system=[LANGUAGE_CORRECT_SYSTEM,
                        │     RUBRIC_LANGUAGE_ERRORS+cache], parse: LanguageCorrectSchema)
                        │
                        └─ stream NDJSON:
                             {type:"group", data:{key:"grammar", items:[…]}}  ×4 nhóm
                             {type:"corrected", data:{text, pinyin?}}
                             {type:"done", data:{score, practiceId}}
                             │
                             └─► server: create Activity(domain="language", type="write",
                                     aiScore=score) + LanguagePractice(errorGroups, corrected)
                                     ⚠ Evidence **chưa** tạo — chỉ tạo khi người dùng bấm
                                       "Ghi nhận 1 Evidence" (nút award_star)

          ── sau khi có kết quả ──
          ├─► bấm "style Tạo 2 thẻ Flashcard mới"
          │     └─► POST /api/language/cards { practiceId, lang, sourceText, maxCards:2 }
          │           ├─ callAI(AI-10, claude-haiku-4-5, KHÔNG streaming, effort low)
          │           ├─ check trùng front+lang → bỏ qua thẻ trùng
          │           └─ create Card(mode="produce", due=hôm nay+12h) × N
          │     └─► toast "Đã thêm N thẻ — Lịch ôn kế tiếp: Sau 12 giờ"
          │
          ├─► bấm "+ Thêm vào ôn" trên 1 từ khoá (FR-LG-14)
          │     └─► create Card trực tiếp (không qua AI) — 1 từ = 1 thẻ
          │
          └─► bấm "award_star Ghi nhận 1 Evidence"
                └─► create Evidence(skillId=skillNgônNgữ, rating) — idempotent theo activityId
```

### 2.4 Sơ đồ luồng — S11 Tab 2 (Hội thoại AI, AI-08)

```
User mở /language/practice?tab=roleplay
   │
   ├─► getRoleplayScenarios({lang, level})   ──► 6 tình huống (SP-01..SP-15)
   │
   └─► <RoleplayConsole> (Client)
          │
          ├─► bấm "Bắt đầu" → POST /api/roleplay { scenarioId, lang, level, turnIndex:0 }
          │      │
          │      ├─ (server) tạo RoleplaySession(status="active")
          │      │   ⚠ KHÔNG gửi hiddenGoal cho AI ở bước này
          │      │
          │      └─ callAIStream(AI-08, system=[ROLEPLAY_SYSTEM],
          │            messages=[buildRoleplayUserMessage(scenario, history)])
          │              → {type:"turn", data:{index:0, role:"ai", text:"…"}}
          │
          ├─► user trả lời (text hoặc STT) → POST /api/roleplay {sessionId, turnIndex, transcript}
          │      └─ AI trả lượt tiếp theo (streaming)
          │
          └─► bấm "Kết thúc & Chấm"
                 └─► POST /api/roleplay {sessionId, transcript, action:"finish"}
                        ├─ (server) callAIStream(AI-08) với task=goal_evaluation
                        │     → {type:"goalScore", data:{score, note, evidence[]}}
                        ├─ create Activity(domain="communication"|"language", type="roleplay")
                        ├─ create Evidence(skillHoiThoai, ratingFromScore(goalScore))
                        └─ session.status = "done"
```

### 2.5 Phân tầng

| Tầng | Module | Trách nhiệm |
|---|---|---|
| Route | `src/app/speak/write/page.tsx` | Server Component: đọc `searchParams.level/lang/prompt`, gọi `getSpeakPrompts` + `getLatestAttempt`, render `<WriteConsole>` |
| Route | `src/app/speak/talk/page.tsx` | Server Component: `getSpeakPrompts({mode:"speak"})` + `getSpeakScenarios`, render `<TalkConsole>` |
| Route | `src/app/language/practice/page.tsx` | Server Component: đọc `?tab=`, render `<PracticeConsole>` (Tab 1) hoặc `<RoleplayConsole>` (Tab 2) |
| UI | `src/components/speak/write-console.tsx` | Client: editor, toolbar, kho đề, gọi `/api/grade`, hiện rubric + delta + evidence commit |
| UI | `src/components/speak/talk-console.tsx` | Client: recorder + STT + waveform + rubric + filler words |
| UI | `src/components/speak/rubric-panel.tsx` | Dùng chung S07/S08: vòng tròn tổng, 5 tiêu chí, delta |
| UI | `src/components/speak/suggestion-card.tsx` | 1 đề xuất sửa: bản gốc (gạch) → bản đề xuất + lý do |
| UI | `src/components/speak/prompt-library.tsx` | Kho 12 bài mẫu + bài tự tạo, bộ lọc level/lang/mode |
| UI | `src/components/speak/evidence-commit.tsx` | Nút "Chấp nhận & Cập nhật Cây kỹ năng" |
| UI | `src/components/speech/use-recorder.ts` | Hook `MediaRecorder` → state, duration, peaks, error |
| UI | `src/components/speech/use-speech-recognition.ts` | Hook `SpeechRecognition` → interim/final, wordCount, `supported` |
| UI | `src/components/speech/use-audio-level.ts` | Hook `AnalyserNode` → mức peak cho waveform (peak dBFS) |
| UI | `src/components/language/practice-console.tsx` | Client: IME editor, 4 nhóm lỗi, đối chiếu bản chuẩn hoá, nút AI-10 + Evidence |
| UI | `src/components/language/error-group-grid.tsx` | Lưới 2×2 bốn nhóm lỗi |
| UI | `src/components/language/standardized-diff.tsx` | Bản gốc vs bản chuẩn hoá + pinyin + giải thích + TTS |
| UI | `src/components/language/keyword-chips.tsx` | Từ khoá bắt buộc + nút "Thêm vào ôn" |
| UI | `src/components/language/roleplay-console.tsx` | Client: vòng lượt AI/user, streaming, kết thúc & chấm mục tiêu ẩn |
| Nghiệp vụ | `src/lib/grading.ts` | `computeTotal` · `computeDelta` · `ratingFromScore` · `validateGradingInput` · `buildGradeUserMessage` · `findPreviousAttempt` · `buildSpeechMeta` |
| Nghiệp vụ | `src/lib/language.ts` | `buildLanguageCorrectMessage` · `buildCardsMessage` · `extractKeywords` · `cardExists` |
| Nghiệp vụ | `src/lib/prompts.ts` | `GRADING_SYSTEM` · `SPEECH_NOTE_BLOCK` · `ROLEPLAY_SYSTEM` · `LANGUAGE_CORRECT_SYSTEM` · `RUBRIC_COMMUNICATION` · `RUBRIC_LANGUAGE_ERRORS` |
| AI | `src/lib/anthropic.ts` | `callAIStream()` · `callAI()` → ghi `AiCall` (tokens, cacheRead, cost, ok, error) |
| DB | `src/lib/db.ts` | Prisma singleton |
| API | `src/app/api/grade/route.ts` | POST — AI-03/04 streaming NDJSON |
| API | `src/app/api/roleplay/route.ts` | POST — AI-08 streaming NDJSON (2 task: `next_turn` \| `goal_evaluation`) |
| API | `src/app/api/language/correct/route.ts` | POST — AI-09 streaming NDJSON |
| API | `src/app/api/language/cards/route.ts` | POST — AI-10 không streaming |
| API | `src/app/api/speak/prompts/route.ts` | GET (list) + POST (tạo bài tự tạo) |
| API | `src/app/api/speak/history/route.ts` | GET — lịch sử attempt + rubric (cho delta & màn hình lịch sử) |

### 2.6 Quyết định thiết kế

| # | Quyết định | Lý do | Hệ quả |
|---|---|---|---|
| D1 | S07 và S08 dùng **cùng** `RUBRIC_COMMUNICATION` + `computeTotal` | Điểm viết và điểm nói phải so sánh được với nhau (FR-CM-04); suy ra cùng 1 hàm | Thêm tiêu chí mới cho giao tiếp = thêm cho cả 2 màn hình |
| D2 | `computeTotal`/`computeDelta` nằm ở `src/lib/grading.ts` (thuần) | Tổng điểm phải luôn = trung bình kể cả khi AI trả sai (AC-CM-2) | Không bao giờ tin AI về tổng điểm; unit test không cần mock |
| D3 | `hiddenGoal` **không** nằm trong payload gửi AI-08 ở bước sinh lượt | Mục tiêu ẩn mất ý nghĩa nếu AI biết (FR-CM-06) | Server phải tách 2 task: `next_turn` (không goal) và `goal_evaluation` (có goal) |
| D4 | Chấm viết/nói **streaming NDJSON**, không phải SSE | Đã có tiền lệ trong `weekly-progress-report`; client đọc bằng `ReadableStream` | Thêm 1 helper `readNdjson()` dùng lại cho 3 endpoint |
| D5 | AI-10 (`/api/language/cards`) **không streaming**, model Haiku | Sinh 2 thẻ là tác vụ ngắn, không cần streaming; Haiku rẻ hơn 5× | Response JSON thuần, đơn giản |
| D6 | Evidence cho S11 **không tạo tự động** — người dùng bấm `award_star` | S07/S08 có nút commit rõ ràng; S11 prototype cũng có nút riêng | Tạo `Activity` ngay khi chấm, `Evidence` khi bấm nút → cần cờ `evidenceCommitted` |
| D7 | Không gửi file audio lên server — chỉ gửi `transcript` + `speechMeta` | P6 (local-first) + NFR-07 (không phụ thuộc ngoài) + giảm chi phí | AI-04 chấm được từ điệu qua `speechMeta` (wpm, filler, pauses), không qua waveform |
| D8 | Lưu `SpeakAttempt.rubric` + `delta` dạng JSON trong SQLite | Cho phép mở lại lịch sử mà không gọi lại AI (tiết kiệm, reproducible) | `GET /api/speak/history` trả kèm rubric đã lưu |
| D9 | 1 `Activity` = 1 `SpeakAttempt` (unique) | FR-CM-07 + idempotency commit Evidence | Bấm commit 2 lần không tạo 2 bằng chứng |
| D10 | `rating` suy ra từ tổng điểm, **không** cho người dùng tự đặt | P3 + tránh tự tăng level | Ngưỡng: ≥4.0→4, ≥3.0→3, ≥2.0→2, còn lại→1 |
| D11 | Thẻ sinh từ S11 có `mode="produce"`, `due = now + 12h` | Thẻ nhớ sai lỗi phải được ôn lại sớm, không phải 1 tháng sau | Dùng đúng hành vi "Lịch ôn kế tiếp: Sau 12 giờ" ở prototype |
| D12 | `/api/speak/prompts` GET+POST cùng route | Kho bài mẫu (GET) và bài tự tạo (POST) cùng nguồn dữ liệu | `SpeakPrompt.isUserMade` phân biệt |

## 3. Thành phần

### 3.1 `src/lib/grading.ts` — pipeline chấm dùng chung

**Responsibilities:**
- Tính tổng điểm, delta, mapping `Evidence.rating` (thuần).
- Validate input trước khi gọi AI (độ dài tối thiểu).
- Dựng user message chứa toàn bộ nội dung biến động (bài viết, transcript, `speechMeta`, level, lang) — **không** đưa vào `system` để không phá cache.
- Tìm attempt trước để tính delta.

**Interfaces:**

```ts
export type RubricKey = "clarity" | "structure" | "tone" | "natural" | "grammar";

export interface RubricCriterion {
  key: RubricKey;
  name: string;          // "Rõ ràng"
  score: number;         // 0..5
  comment: string;       // 1 câu nhận xét
  fix: string;           // 1 đề xuất sửa cụ thể (kèm trích đoạn gốc nếu có)
}

export interface RubricResult {
  criteria: RubricCriterion[];       // luôn đúng 5 phần tử, đúng thứ tự RUBRIC_COMMUNICATION
  total: number;                     // trung bình, làm tròn 1 chữ số
  speechNotes?: {                    // chỉ có ở mode="speak"
    wordsPerMinute: number;
    fillerWords: { word: string; count: number }[];
    pauses: { atSecond: number; durationSec: number }[];
    clarityNote: string;
  };
}

export interface RubricDelta {
  total: number | null;              // null = chưa có lần trước
  criteria: Partial<Record<RubricKey, number | null>>;  // null = lần trước thiếu tiêu chí
  comparedAttemptId: string | null;
  comparedAt: string | null;         // ISO date
  levelMismatch: boolean;            // so sánh giữa 2 level khác nhau
}

/** Tổng điểm = trung bình các tiêu chí, làm tròn 1 chữ số. Không nhận total từ AI. */
export function computeTotal(criteria: Array<{ score: number }>): number;

/** Delta từng tiêu chí + tổng; bỏ qua tiêu chí thiếu ở một trong hai lần. */
export function computeDelta(
  current: Array<{ key: RubricKey; score: number }>,
  previous: Array<{ key: RubricKey; score: number }> | null,
  opts?: { currentLevel?: string; previousLevel?: string }
): RubricDelta;

/** Ánh xạ tổng điểm → Evidence.rating (1..4). */
export function ratingFromScore(total: number): 1 | 2 | 3 | 4;

/** Validate trước khi gọi AI. Trả lỗi có mã để API map sang HTTP status. */
export function validateGradingInput(input: {
  mode: "write" | "speak";
  content: string;
  transcript?: string | null;
  level: string;
  lang: string;
}): { ok: true } | { ok: false; error: "too_short" | "empty_transcript" | "invalid_level" | "invalid_lang" };

/** Dựng nội dung biến động (nằm trong `messages`, sau breakpoint cache). */
export function buildGradeUserMessage(input: {
  mode: "write" | "speak";
  prompt: string;
  level: string;
  lang: string;
  content: string;
  transcript?: string | null;
  speechMeta?: unknown;
}): string;

/** Tìm attempt gần nhất cùng `mode` (để tính delta). */
export async function findPreviousAttempt(args: {
  mode: "write" | "speak";
  promptId?: string | null;
}): Promise<{ id: string; totalScore: number; rubric: unknown; level: string; createdAt: Date } | null>;

/** Rút gọn `speechMeta` từ transcript + thời lượng ghi âm. */
export function buildSpeechMeta(args: {
  transcript: string;
  durationSec: number;
  fillerWords?: string[];
}): {
  durationSec: number;
  wordsPerMinute: number;
  fillerWords: { word: string; count: number }[];
  pauses: { atSecond: number; durationSec: number }[];
};
```

**Edge cases:**
- `computeTotal([])` → `0` (không `NaN`).
- `computeDelta(current, null)` → `total: null`, mọi criteria `null` (UI hiện "Chưa có lần trước để so sánh").
- `computeDelta` với tiêu chí chỉ có ở 1 lần → `null` cho tiêu chí đó; `total` tính trên **tập giao** của 2 lần.
- `validateGradingInput` mode `speak` mà `transcript` rỗng → `empty_transcript` (422) — dù `content` có chữ.
- `buildSpeechMeta` transcript < 15 từ → `wordsPerMinute = 0` (không chia cho 0).

### 3.2 `src/lib/prompts.ts` — prompt & rubric (P4)

```ts
export const RUBRIC_COMMUNICATION = [
  { key: "clarity",   name: "Rõ ràng",  desc: "Người đọc hiểu ngay điều cần biết trong 1 câu đầu" },
  { key: "structure", name: "Cấu trúc", desc: "Có mở–thân–kết rõ ràng, điều quan trọng nhất đứng đầu" },
  { key: "tone",      name: "Giọng văn", desc: "Phù hợp với vai trò và mối quan hệ với người nhận" },
  { key: "natural",   name: "Tự nhiên",  desc: "Cách diễn đạt tự nhiên, không dịch từng chữ" },
  { key: "grammar",   name: "Ngữ pháp",  desc: "Cấu trúc câu và dấu câu đúng" },
] as const;

export const RUBRIC_LANGUAGE_ERRORS = [
  { key: "grammar",    name: "Ngữ pháp",       desc: "Sai trật tự từ, thiếu mạo từ, chia động từ sai" },
  { key: "vocab",      name: "Từ vựng",        desc: "Dùng từ không tự nhiên, lặp từ, từ quá hàn lâm" },
  { key: "expression", name: "Cách diễn đạt", desc: "Cấu trúc đúng ngữ pháp nhưng nghe không tự nhiên" },
  { key: "context",    name: "Ngữ cảnh",       desc: "Đúng ngữ pháp nhưng sai tình huống" },
] as const;

export const GRADING_SYSTEM = `
Bạn là chấm viên giao tiếp. Chấm đúng theo rubric định nghĩa sẵn, KHÔNG tự thêm tiêu chí.
Với mỗi tiêu chí:
- score: số nguyên 0–5 theo thang dưới đây.
- comment: đúng 1 câu nhận xét, chỉ ra cụ thể trong bài (trích dẫn trích đoạn nếu có).
- fix: đúng 1 đề xuất sửa cụ thể, viết lại phần cần sửa sao cho dùng được ngay.
Thang điểm: 5 xuất sắc · 4 tốt · 3 khá · 2 yếu · 1 rất yếu · 0 chưa có nội dung.
Tổng điểm do hệ thống tự tính — không trả về trường tổng.
`.trim();

export const SPEECH_NOTE_BLOCK = `
Ngoài 5 tiêu chí, thêm ghi chú về cách nói:
- wordsPerMinute: tốc độ nói (từ/phút).
- fillerWords: các từ đệm ("uhm", "err", "à") kèm số lần.
- pauses: các khoảng ngắt ≥ 0.5s, ghi vị trí (giây) và độ dài.
- clarityNote: 1 câu về độ rõ của phát âm từ transcript.
Không biến các ghi chú này thành tiêu chí mới.
`.trim();

export const ROLEPLAY_SYSTEM = `
Bạn đóng vai đối tác trong một tình huống giao tiếp.
- Trả lời bằng ĐÚNG ngôn ngữ của đề (lang), không trộn 2 ngôn ngữ.
- Dùng từ vựng và độ dài câu phù hợp level người học (A1–C1).
- Mỗi lượt dài 1–3 câu, luôn để lại chỗ cho người học trả lời.
- Không bao giờ nói ra mục tiêu ẩn của tình huống.
`.trim();

export const LANGUAGE_CORRECT_SYSTEM = `
Bạn là giáo viên sửa lỗi ngôn ngữ. Phân loại MỖI lỗi vào đúng 1 trong 4 nhóm:
grammar · vocab · expression · context. Không tạo nhóm thứ 5.
Với mỗi lỗi: original (trích nguyên văn từ bài) · corrected · reason (tiếng Việt) · severity (minor|major).
Sau đó trả bản viết lại bản ngữ + phiên âm pinyin (nếu lang=zh) + giải thích tiếng Việt cho các thay đổi quan trọng.
`.trim();

export const GOAL_EVALUATION_SYSTEM = `
Bạn đánh giá một cuộc hội thoại theo MỤC TIÊU ẨN được giao.
Cho điểm 0–5 mức độ đạt mục tiêu, 1 câu nhận xét, và trích dẫn ít nhất 1 câu nói thật của
người học làm bằng chứng. Không chấm các tiêu chí khác ngoài mục tiêu đã giao.
`.trim();

export const FLASHCARD_SYSTEM = `
Sinh tối đa 2 thẻ ghi nhớ từ lỗi người học vừa mắc.
Mỗi thẻ: front (mặt trước — 1 từ/cụm cần nhớ) · back (mặt sau — nghĩa + ghi chú dùng) ·
example (1 ví dụ câu tự nhiên trong ngôn ngữ đích).
Không sinh thẻ cho lỗi không có trong danh sách lỗi. Ưu tiên lỗi người học lặp lại.
`.trim();

// Block cacheable (đặt cache_control tại đây, KHÔNG đặt ở nơi gọi)
export const RUBRIC_COMMUNICATION_BLOCK = RUBRIC_COMMUNICATION
  .map(c => `- ${c.name} (${c.key}): ${c.desc} — thang 0–5`)
  .join("\n");

export const RUBRIC_LANGUAGE_ERRORS_BLOCK = RUBRIC_LANGUAGE_ERRORS
  .map(c => `- ${c.name} (${c.key}): ${c.desc}`)
  .join("\n");
```

**Zod schema request (validate ở API route) — đặt cùng file `src/lib/prompts.ts`:**

```ts
export const GradeBodySchema = z.object({
  mode: z.enum(["write", "speak"]),
  promptId: z.string().nullable().optional(),
  prompt: z.string().min(1).max(8000),
  level: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  lang: z.enum(["en", "vi", "zh"]),
  content: z.string().max(20000).default(""),
  transcript: z.string().max(20000).nullable().optional(),
  speechMeta: z.unknown().optional(),
});

export const RoleplayBodySchema = z.object({
  sessionId: z.string().nullable().optional(),
  scenarioId: z.string().nullable().optional(),
  lang: z.enum(["zh", "en"]),
  level: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  transcript: z.array(z.object({
    index: z.number().int(),
    role: z.enum(["ai", "user"]),
    text: z.string(),
  })).optional(),
  turnIndex: z.number().int().optional(),
  action: z.enum(["next_turn", "goal_evaluation"]).optional(),
});

export const LanguageCorrectBodySchema = z.object({
  lang: z.enum(["zh", "en"]),
  level: z.string().min(1).max(20),
  prompt: z.string().min(1).max(4000),
  input: z.string().min(1).max(8000),
  keywords: z.array(z.string()).max(30).optional(),
});

export const LanguageCardsBodySchema = z.object({
  practiceId: z.string().min(1),
  lang: z.enum(["zh", "en"]),
  sourceText: z.string().min(1).max(8000),
  maxCards: z.number().int().min(1).max(2).optional(),
});

export const CreatePromptSchema = z.object({
  title: z.string().min(1).max(120),
  prompt: z.string().min(1).max(2000),
  level: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  lang: z.enum(["en", "vi", "zh"]),
  mode: z.enum(["write", "speak", "both"]).optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
});
```

**Zod schema output (structured output — FR-AI-04):**

```ts
export const GradeSchema = z.object({
  criteria: z.array(
    z.object({
      key: z.enum(["clarity", "structure", "tone", "natural", "grammar"]),
      score: z.number().int().min(0).max(5),
      comment: z.string().min(1),
      fix: z.string().min(1),
    })
  ).length(5),
  speechNotes: z.object({
    wordsPerMinute: z.number().int().min(0),
    fillerWords: z.array(z.object({ word: z.string(), count: z.number().int().min(1) })),
    pauses: z.array(z.object({ atSecond: z.number(), durationSec: z.number() })),
    clarityNote: z.string(),
  }).nullable(),
});

export const LanguageCorrectSchema = z.object({
  groups: z.array(
    z.object({
      key: z.enum(["grammar", "vocab", "expression", "context"]),
      items: z.array(
        z.object({
          original: z.string(),
          corrected: z.string(),
          reason: z.string(),
          severity: z.enum(["minor", "major"]),
        })
      ),
    })
  ).length(4),
  correctedText: z.string(),
  pinyin: z.string().nullable(),
  explanation: z.string(),
});

export const RoleplayTurnSchema = z.object({
  index: z.number().int(),
  role: z.enum(["ai", "user"]),
  text: z.string(),
});

export const GoalEvaluationSchema = z.object({
  score: z.number().int().min(0).max(5),
  note: z.string(),
  evidence: z.array(z.string()).min(1),   // trích dẫn lượt nói của người dùng
});

export const FlashcardsSchema = z.object({
  cards: z.array(
    z.object({
      front: z.string().min(1),
      back: z.string().min(1),
      note: z.string().nullable(),
      example: z.string().nullable(),
    })
  ).min(1).max(2),
});
```

> `GradeSchema.criteria` dùng `.length(5)` + `key: z.enum(...)` → AI trả 6 tiêu chí hoặc tiêu chí ngoài rubric đều bị `safeParse` reject (AC-CM-1).

### 3.3 `src/components/speech/use-recorder.ts`

**Responsibilities:**
- Bọc `MediaRecorder` thành hook React: start / pause / resume / stop / reset.
- Cấp `MediaStream` cho `useSpeechRecognition`.
- Phát hiện lỗi quyền mic và lỗi thiết bị.

**Interfaces:**

```ts
export type RecorderState = "idle" | "recording" | "paused" | "stopped" | "denied" | "unsupported";

export interface RecorderResult {
  state: RecorderState;
  durationSec: number;
  peaks: number[];              // mức 0..1 theo frame để dựng waveform
  error: "permission_denied" | "no_device" | "unsupported" | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
}

export function useRecorder(opts?: {
  maxDurationSec?: number;      // S08 drill 60/90/120 → tự dừng
  onAutoStop?: () => void;
}): RecorderResult;
```

**Cách capture audio (MediaRecorder):**

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
});

const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
  .find((t) => MediaRecorder.isTypeSupported(t));

const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
const chunks: Blob[] = [];
recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
recorder.onstop = () => { blobRef.current = new Blob(chunks, { type: mimeType ?? "audio/webm" }); };
```

**Edge cases:**
- `getUserMedia` reject `NotAllowedError` → `state = "denied"`, `error = "permission_denied"`; UI hiện hướng dẫn cấp quyền; **không** gọi AI.
- `getUserMedia` reject `NotFoundError` → `error = "no_device"`.
- `navigator.mediaDevices` undefined (HTTP cục bộ không secure context) → `state = "unsupported"`, hiện "Mở app qua `https` hoặc `localhost` để dùng mic".
- `maxDurationSec` đạt → `recorder.stop()` + `onAutoStop()`.
- Component unmount → `stream.getTracks().forEach(t => t.stop())` (không rò rỉ mic).

### 3.4 `src/components/speech/use-speech-recognition.ts`

**Responsibilities:**
- Bọc `SpeechRecognition` (prefix `webkit` cho Safari) thành hook.
- Tách `interim` (đang nói) khỏi `final` (đã chốt).
- Báo `supported` để UI chuyển sang nhập transcript tay.

**Interfaces:**

```ts
export type SttStatus = "idle" | "listening" | "unsupported" | "denied" | "error";

export interface SttResult {
  status: SttStatus;
  interim: string;
  finalText: string;
  wordCount: number;
  error: "not-allowed" | "network" | "aborted" | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useSpeechRecognition(opts: {
  lang: "en-US" | "vi-VN" | "zh-CN";
  continuous?: boolean;
}): SttResult;
```

**Cách transcribe (Web Speech API):**

```ts
const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
if (!SR) { setStatus("unsupported"); return; }

const rec = new SR();
rec.lang = lang;                 // en-US | vi-VN | zh-CN
rec.continuous = true;
rec.interimResults = true;

rec.onresult = (event) => {
  let interim = "";
  let final = "";
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const chunk = event.results[i];
    if (chunk.isFinal) final += chunk[0].transcript;
    else interim += chunk[0].transcript;
  }
  setFinalText(prev => prev + final);
  setInterim(interim);
};

rec.onerror = (event) => {
  if (event.error === "not-allowed") setStatus("denied");
  else if (event.error === "network") setError("network");
};
rec.onend = () => { if (status === "listening") rec.start(); };  // Chrome tự dừng sau ~60s
```

**Edge cases:**
- `SR` undefined → `status = "unsupported"` → UI hiện ô nhập transcript tay (AC-CM-12).
- `event.error === "not-allowed"` → `status = "denied"`, dừng recorder.
- `event.error === "network"` → hiện "STT mất mạng — nhập transcript tay hoặc thử lại"; giữ `finalText` đã có.
- `onend` tự kích hoạt lại → tránh mất transcript giữa chừng (Chrome dừng sau ~60s).

### 3.5 `src/components/speak/write-console.tsx` (S07)

```tsx
export interface WriteConsoleProps {
  prompts: SpeakPromptItem[];
  initialPromptId: string | null;
  level: string;
  lang: string;
  previousAttempt: PreviousAttempt | null;   // để tính delta server-side hoặc client-side
  hasApiKey: boolean;
  skillId: string;                            // Skill "Giao tiếp → Viết"
}

export interface SpeakPromptItem {
  id: string;
  code: string;          // "EX-01" | "CUS-a1b2"
  title: string;
  prompt: string;
  level: string;
  lang: string;
  mode: "write" | "speak" | "both";
  tags: string[];
  isUserMade: boolean;
}

export interface PreviousAttempt {
  id: string;
  totalScore: number;
  criteria: RubricCriterion[];
  level: string;
  createdAt: string;
}

export default function WriteConsole(props: WriteConsoleProps): JSX.Element;
```

**Responsibilities:**
- Editor có toolbar (4 nút định dạng) + đếm từ.
- Auto-save nháp (debounce 800ms) + nút "Lưu bản nháp".
- Kho đề 12 bài mẫu + bài tự tạo, bộ lọc level/lang.
- Gọi `POST /api/grade`, đọc NDJSON, dựng rubric panel + delta.
- Nút commit Evidence.

**Edge cases:**
- `hasApiKey === false` → ẩn nút chấm, hiện hướng dẫn thêm key.
- Streaming lỗi giữa chừng → giữ tiêu chí đã nhận, hiện banner + "Thử lại".
- Người dùng gõ thêm trong lúc đang stream → nội dung không bị mất (state tách `content` và `result`).

### 3.6 `src/components/speak/rubric-panel.tsx` (dùng chung S07/S08)

```tsx
export interface RubricPanelProps {
  criteria: RubricCriterion[];        // đúng 5, đã sort theo RUBRIC_COMMUNICATION
  total: number;                      // do computeTotal tính, KHÔNG do AI trả
  delta: RubricDelta | null;
  speechNotes?: RubricResult["speechNotes"];
  streaming: boolean;                 // đang chờ tiêu chí chưa về
  onCommitEvidence?: () => void;
  evidenceCommitted?: boolean;
}

export default function RubricPanel(props: RubricPanelProps): JSX.Element;
```

**Edge cases:**
- `streaming = true` → tiêu chí chưa về hiện skeleton (không hiện 0 điểm — tránh hiểu nhầm là AI chấm 0).
- `delta.total === null` → hiện "Chưa có lần trước để so sánh".
- `delta.levelMismatch === true` → hiện cảnh báo "So sánh giữa 2 level khác nhau".
- Điểm ≥ 4 `text-primary`, = 3 `text-tertiary`, ≤ 2 `text-error`; luôn có **text thay thế** (không chỉ màu — NFR-CM-03).

### 3.7 `src/components/speak/talk-console.tsx` (S08)

```tsx
export interface TalkConsoleProps {
  prompt: SpeakPromptItem;
  scenario: SpeakScenario | null;
  lang: "en-US" | "vi-VN" | "zh-CN";
  hasApiKey: boolean;
  skillId: string;                    // Skill "Giao tiếp → Nói"
  previousAttempt: PreviousAttempt | null;
}

export interface SpeakScenario {
  id: string;
  code: string;        // "SP-01"
  title: string;
  brief: string;
  durationSec: number; // 60 | 90 | 120
  level: string;
  lang: string;
  tags: string[];
  hiddenGoal: string | null;   // ⚠ server KHÔNG gửi field này xuống client trước khi kết thúc
}
```

**Cách chấm nói (luồng trong component):**

```ts
// 1. Ghi âm + STT song song
const recorder = useRecorder({ maxDurationSec: scenario.durationSec, onAutoStop: handleStop });
const stt = useSpeechRecognition({ lang });

// 2. Chấm
async function handleGrade() {
  const transcript = stt.finalText.trim();
  if (!transcript) { setError("Chưa nhận được giọng nói — hãy thử ghi lại"); return; }

  const speechMeta = buildSpeechMeta({ transcript, durationSec: recorder.durationSec });
  const res = await fetch("/api/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "speak", prompt: prompt.prompt, level, lang, transcript, speechMeta }),
  });
  for await (const evt of readNdjson(res)) { /* type:"criterion" | "delta" | "done" */ }
}
```

**Edge cases:**
- `recorder.state === "denied"` → ẩn nút ghi + nút chấm, hiện card hướng dẫn.
- `stt.status === "unsupported"` → hiện `textarea` "Nhập transcript thủ công", nút chấm dùng giá trị textarea.
- `stt.finalText` rỗng nhưng `stt.interim` có → vẫn chặn (chỉ chấm final).
- `recorder.durationSec` vượt `scenario.durationSec` → đã tự dừng.

### 3.8 `src/components/language/practice-console.tsx` (S11 Tab 1)

```tsx
export interface PracticeConsoleProps {
  lang: "zh" | "en";
  level: string;
  prompt: LanguagePromptItem;
  keywords: string[];
  hasApiKey: boolean;
  skillId: string;                 // Skill "Tiếng Trung" | "Tiếng Anh"
}

export interface LanguagePromptItem {
  id: string;
  code: string;                    // "ZH-042"
  title: string;
  prompt: string;
  level: string;                   // "HSK 3+"
  lang: "zh" | "en";
  keywords: string[];              // từ khoá bắt buộc
  grammarTip: string | null;       // "Quy tắc trật tự thời gian (Chủ ngữ + Thời gian + …)"
}

export default function PracticeConsole(props: PracticeConsoleProps): JSX.Element;
```

**Responsibilities:**
- Editor IME-friendly (không chặn `compositionstart`/`compositionend`), đếm ký tự Hanzi + số câu.
- Nút "Chấm & Phân tích 4 nhóm lỗi (Claude Opus 5 streaming)" — `Ctrl+Enter`.
- Lưới 4 nhóm lỗi, đối chiếu bản chuẩn hoá (TTS `volume_up`), giải thích tiếng Việt.
- Nút "Tạo 2 thẻ Flashcard mới" (AI-10) và "Ghi nhận 1 Evidence".
- Từ khoá chips kèm nút "Thêm vào ôn" (FR-LG-14).

**Edge cases:**
- IME đang composing → `Ctrl+Enter` bị bỏ qua (tránh chấm nửa chừng).
- Input < 5 ký tự Hanzi (zh) / < 3 từ (en) → chặn, hiện ngưỡng.
- Nhóm lỗi rỗng → hiện chip "Đạt chuẩn" thay vì card trống.
- AI-10 trả thẻ trùng `front`+`lang` đã có → bỏ qua, toast "1 thẻ trùng đã có, không tạo lại".

### 3.9 `src/components/language/roleplay-console.tsx` (S11 Tab 2)

```tsx
export interface RoleplayConsoleProps {
  scenarios: SpeakScenario[];
  lang: "zh" | "en";
  level: string;
  hasApiKey: boolean;
  skillId: string;
}

export interface RoleplayTurnView {
  index: number;
  role: "ai" | "user";
  text: string;
}

export interface GoalResult {
  score: number;         // 0..5
  note: string;
  evidence: string[];    // trích dẫn lượt nói
}

export default function RoleplayConsole(props: RoleplayConsoleProps): JSX.Element;
```

**Edge cases:**
- AI trả lời **sai ngôn ngữ** 2 lượt liên tiếp → hiện cảnh báo "AI đang trả lời sai ngôn ngữ" + nút "Báo lỗi" (ghi log cải thiện).
- Phiên đang active, người dùng đóng tab → session giữ `status="active"`, có thể resume.
- Bấm "Kết thúc & Chấm" khi chỉ có 1 lượt AI → vẫn chấm được nhưng `evidence` có thể rỗng → server trả `score` 0 kèm note "Chưa đủ lượt để đánh giá mục tiêu".
- `hiddenGoal` **không** được render trước khi `goalScore` về.

### 3.10 API routes

#### `POST /api/grade` (AI-03/04 — streaming NDJSON)

```ts
export interface GradeBody {
  mode: "write" | "speak";
  promptId?: string | null;
  prompt: string;
  level: string;
  lang: string;
  content: string;              // bài viết (mode=write)
  transcript?: string | null;   // transcript (mode=speak)
  speechMeta?: unknown;
}

export async function POST(req: NextRequest): Promise<Response> {
  const parsed = GradeBodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const body = parsed.data;

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, error: "no_api_key" }, { status: 503 });
  }

  const check = validateGradingInput(body);
  if (!check.ok) {
    const status = check.error === "too_short" || check.error === "empty_transcript" ? 422 : 400;
    return Response.json({ ok: false, error: check.error }, { status });
  }

  const previous = await findPreviousAttempt({ mode: body.mode, promptId: body.promptId ?? null });

  const stream = await callAIStream({
    feature: "grading",
    model: "claude-opus-5",
    effort: "medium",
    system: [
      { type: "text", text: GRADING_SYSTEM },
      { type: "text", text: RUBRIC_COMMUNICATION_BLOCK, cache_control: { type: "ephemeral" } },
      ...(body.mode === "speak"
        ? [{ type: "text", text: SPEECH_NOTE_BLOCK, cache_control: { type: "ephemeral" } }]
        : []),
    ],
    messages: [{ role: "user", content: buildGradeUserMessage(body) }],
    parse: GradeSchema,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
```

> `system` **cố định** (cache được). Toàn bộ bài viết / transcript / `speechMeta` nằm trong `messages` — sau breakpoint cache (SPEC §5.2).

#### `POST /api/roleplay` (AI-08 — streaming NDJSON)

```ts
export interface RoleplayBody {
  sessionId?: string | null;
  scenarioId?: string | null;
  lang: "zh" | "en";
  level: string;
  transcript?: RoleplayTurnView[];   // lịch sử lượt nói
  turnIndex?: number;
  action?: "next_turn" | "goal_evaluation";
}

export async function POST(req: NextRequest): Promise<Response> {
  const body = RoleplayBodySchema.parse(await req.json());

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, error: "no_api_key" }, { status: 503 });
  }

  const scenario = await prisma.roleplayScenario.findUnique({ where: { code: body.scenarioId ?? "" } });
  if (!scenario) {
    return Response.json({ ok: false, error: "scenario_not_found" }, { status: 404 });
  }

  // ── Task 1: sinh lượt tiếp theo (KHÔNG gửi hiddenGoal) ──
  if ((body.action ?? "next_turn") === "next_turn") {
    const stream = await callAIStream({
      feature: "roleplay",
      model: "claude-opus-5",
      effort: "medium",
      system: [{ type: "text", text: ROLEPLAY_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: buildRoleplayUserMessage({
          title: scenario.title,
          brief: scenario.brief,
          lang: body.lang,
          level: body.level,
          transcript: body.transcript ?? [],   // ⚠ KHÔNG có hiddenGoal
        }),
      }],
      parse: RoleplayTurnSchema,
    });
    return new Response(stream, { headers: NDJSON_HEADERS });
  }

  // ── Task 2: chấm mục tiêu ẩn (CÓ hiddenGoal) ──
  const goalStream = await callAIStream({
    feature: "roleplay",
    model: "claude-opus-5",
    effort: "medium",
    system: [{ type: "text", text: GOAL_EVALUATION_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: buildGoalEvaluationMessage({
        hiddenGoal: scenario.hiddenGoal ?? "",     // ⚠ chỉ ở task này
        transcript: body.transcript ?? [],
      }),
    }],
    parse: GoalEvaluationSchema,
  });
  return new Response(goalStream, { headers: NDJSON_HEADERS });
}
```

#### `POST /api/language/correct` (AI-09 — streaming NDJSON)

```ts
export interface LanguageCorrectBody {
  lang: "zh" | "en";
  level: string;
  prompt: string;
  input: string;
  keywords?: string[];
}

export async function POST(req: NextRequest): Promise<Response> {
  const body = LanguageCorrectBodySchema.parse(await req.json());
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, error: "no_api_key" }, { status: 503 });
  }
  const stream = await callAIStream({
    feature: "language_correct",
    model: "claude-opus-5",
    effort: "medium",
    system: [
      { type: "text", text: LANGUAGE_CORRECT_SYSTEM },
      { type: "text", text: RUBRIC_LANGUAGE_ERRORS_BLOCK, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: buildLanguageCorrectMessage(body) }],
    parse: LanguageCorrectSchema,
  });
  return new Response(stream, { headers: NDJSON_HEADERS });
}
```

#### `POST /api/language/cards` (AI-10 — KHÔNG streaming)

```ts
export interface LanguageCardsBody {
  practiceId: string;
  lang: "zh" | "en";
  sourceText: string;
  maxCards?: number;      // mặc định 2
}

export async function POST(req: NextRequest): Promise<Response> {
  const body = LanguageCardsBodySchema.parse(await req.json());
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, error: "no_api_key" }, { status: 503 });
  }

  const practice = await prisma.languagePractice.findUnique({ where: { id: body.practiceId } });
  if (!practice) {
    return Response.json({ ok: false, error: "practice_not_found" }, { status: 404 });
  }

  const response = await callAI({
    feature: "language_cards",
    model: "claude-haiku-4-5",
    effort: "low",
    system: [{ type: "text", text: FLASHCARD_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildCardsMessage(body) }],
    parse: FlashcardsSchema,
  });

  const created = await createCardsFromPractice({
    cards: response.cards,
    lang: body.lang,
    practiceId: body.practiceId,
    maxCards: body.maxCards ?? 2,
  });

  return Response.json({ ok: true, data: { cards: created, cardIds: created.map(c => c.id) } });
}
```

#### `GET /api/speak/prompts` · `POST /api/speak/prompts`

```ts
export async function GET(req: NextRequest): Promise<Response> {
  const sp = req.nextUrl.searchParams;
  const level = sp.get("level") ?? undefined;
  const lang = sp.get("lang") ?? undefined;
  const mode = sp.get("mode") ?? undefined;
  const q = sp.get("q") ?? undefined;

  const prompts = await listSpeakPrompts({ level, lang, mode, q });
  return Response.json({ ok: true, data: { prompts } });
}

export interface CreatePromptBody {
  title: string;    // 1..120 ký tự
  prompt: string;   // 1..2000 ký tự
  level: string;    // A1|A2|B1|B2|C1
  lang: string;     // en|vi|zh
  mode?: "write" | "speak" | "both";
  tags?: string[];
}

export async function POST(req: NextRequest): Promise<Response> {
  const body = CreatePromptSchema.parse(await req.json());
  const existing = await prisma.speakPrompt.findFirst({ where: { title: body.title } });
  if (existing) {
    return Response.json({ ok: false, error: "duplicate_title" }, { status: 409 });
  }
  const created = await createSpeakPrompt({ ...body, isUserMade: true });
  return Response.json({ ok: true, data: { prompt: created } });
}
```

#### `GET /api/speak/history`

```ts
export async function GET(req: NextRequest): Promise<Response> {
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get("limit") ?? 20), 100);
  const mode = sp.get("mode") ?? undefined;
  const promptId = sp.get("promptId") ?? undefined;

  const attempts = await listSpeakAttempts({ limit, mode, promptId });
  return Response.json({ ok: true, data: { attempts } });
}
```

### 3.11 Data model — Prisma (bổ sung)

```prisma
// ── Kho bài luyện ───────────────────────────────────────
model SpeakPrompt {
  id         String   @id @default(cuid())
  code       String   @unique          // EX-01..EX-12 | CUS-xxxx
  title      String
  prompt     String
  level      String                   // A1|A2|B1|B2|C1
  lang       String                   // en|vi|zh
  mode       String   @default("both") // write|speak|both
  tags       String   @default("[]")   // JSON string[]
  isUserMade Boolean  @default(false)
  createdAt  DateTime @default(now())
  attempts   SpeakAttempt[]
  @@index([level, lang, mode])
}

// ── 1 bài luyện = 1 Activity = 1 Evidence ───────────────
model SpeakAttempt {
  id         String   @id @default(cuid())
  activityId String   @unique
  activity   Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  promptId   String?
  prompt     SpeakPrompt? @relation(fields: [promptId], references: [id], onDelete: SetNull)
  mode       String                   // write|speak
  content    String                   // bài viết hoặc transcript
  rubric     Json                     // {clarity:{score,comment,fix}, ...}
  totalScore Float
  delta      Json?                    // {total, criteria:{key:number}}
  speechMeta Json?                    // {durationSec,wordsPerMinute,fillerWords,pauses}
  createdAt  DateTime @default(now())
  @@index([mode, createdAt])
}

// ── Hội thoại AI ─────────────────────────────────────────
model RoleplayScenario {
  id          String   @id @default(cuid())
  code        String   @unique          // SP-01..SP-15
  title       String
  brief       String
  hiddenGoal  String?                  // FR-CM-06 — không gửi cho AI ở task next_turn
  lang        String   @default("en")
  level       String
  durationSec Int      @default(60)
  tags        String   @default("[]")
  createdAt   DateTime @default(now())
  sessions    RoleplaySession[]
}

model RoleplaySession {
  id          String   @id @default(cuid())
  scenarioId  String
  scenario    RoleplayScenario @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
  status      String   @default("active")   // active|done|abandoned
  goalScore   Int?                          // 0..5
  goalNote    String?
  transcript  Json     @default("[]")       // [{index,role,text}]
  activityId  String? @unique
  activity    Activity? @relation(fields: [activityId], references: [id], onDelete: SetNull)
  startedAt   DateTime @default(now())
  endedAt     DateTime?
  turns       RoleplayTurn[]
  @@index([status, startedAt])
}

model RoleplayTurn {
  id        String   @id @default(cuid())
  sessionId String
  session   RoleplaySession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  index     Int
  speaker   String                 // ai|user
  text      String
  createdAt DateTime @default(now())
  @@index([sessionId, index])
}

// ── Luyện ngoại ngữ chủ động (S11 Tab 1) ─────────────────
model LanguagePractice {
  id          String   @id @default(cuid())
  activityId  String   @unique
  activity    Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  lang        String   // zh|en
  level       String
  prompt      String
  input       String
  corrected   String?
  errorGroups Json     // {grammar:[…],vocab:[…],expression:[…],context:[…]}
  keywords    Json     @default("[]")
  score       Float?
  createdAt   DateTime @default(now())
  cards       PracticeCard[]
}

model PracticeCard {
  id         String   @id @default(cuid())
  practiceId String
  practice   LanguagePractice @relation(fields: [practiceId], references: [id], onDelete: Cascade)
  cardId     String?          // null = chưa đẩy vào deck FSRS
  front      String
  back       String
  note       String?
  example    String?
  createdAt  DateTime @default(now())
  @@index([practiceId])
}
```

> `Activity` cần thêm quan hệ ngược: `speakAttempt SpeakAttempt?`, `roleplaySession RoleplaySession?`, `languagePractice LanguagePractice?` (quan hệ 1–1, `onDelete: Cascade`).

## 4. Luồng dữ liệu

### 4.1 Luồng chính — chấm viết (AI-03)

1. Client validate tối thiểu (≥ 20 từ) → chặn sớm, không gọi API.
2. `POST /api/grade` → server validate lại bằng `validateGradingInput` (defense in depth).
3. `findPreviousAttempt({mode, promptId})` → lấy attempt gần nhất cùng mode (và cùng `promptId` nếu có) để tính delta.
4. Dựng `messages` = `buildGradeUserMessage(...)` (chứa bài viết, level, lang — **biến động**, nằm sau breakpoint cache).
5. `callAIStream` với `system = [GRADING_SYSTEM, RUBRIC_COMMUNICATION_BLOCK(+cache_control)]`.
6. Parse `GradeSchema` → `criteria` (đúng 5) + `speechNotes` (nullable).
7. **Server tự tính** `total = computeTotal(criteria)` — không tin `total` của AI (AI không được trả field total).
8. `delta = computeDelta(criteria, previous?.rubric ?? null, {currentLevel, previousLevel})`.
9. Trong 1 `prisma.$transaction`:
   - `create Activity { domain:"communication", type:"write", skillId, minutes, title, content, aiScore: total }`
   - `create Evidence { activityId, skillId, rating: ratingFromScore(total) }`
   - `create SpeakAttempt { activityId, promptId, mode, content, rubric, totalScore: total, delta }`
10. Stream NDJSON: `meta` → `criterion`×5 → `delta` → `done { total, activityId, attemptId }`.

### 4.2 Luồng tính delta rubric

```ts
export function computeDelta(
  current: Array<{ key: RubricKey; score: number }>,
  previous: Array<{ key: RubricKey; score: number }> | null,
  opts?: { currentLevel?: string; previousLevel?: string },
): RubricDelta {
  if (!previous || previous.length === 0) {
    return {
      total: null,
      criteria: Object.fromEntries(RUBRIC_COMMUNICATION.map(c => [c.key, null])) as RubricDelta["criteria"],
      comparedAttemptId: null,
      comparedAt: null,
      levelMismatch: false,
    };
  }

  const prevMap = new Map(previous.map(c => [c.key, c.score]));
  const criteria: RubricDelta["criteria"] = {};
  const common: Array<{ key: RubricKey; score: number }> = [];

  for (const c of current) {
    const prev = prevMap.get(c.key);
    criteria[c.key] = prev === undefined ? null : Number((c.score - prev).toFixed(1));
    if (prev !== undefined) common.push({ key: c.key, score: c.score });
  }

  // Tổng delta chỉ tính trên tập tiêu chí có ở CẢ HAI lần (NFR-CM-07).
  const prevCommon = previous.filter(p => common.some(c => c.key === p.key));
  const total =
    common.length === 0 || prevCommon.length === 0
      ? null
      : Number((computeTotal(common) - computeTotal(prevCommon)).toFixed(1));

  return {
    total,
    criteria,
    comparedAttemptId: null,     // set bởi caller
    comparedAt: null,
    levelMismatch: Boolean(
      opts?.currentLevel && opts?.previousLevel && opts.currentLevel !== opts.previousLevel
    ),
  };
}
```

**Quy tắc:**
- `delta.total` = `null` khi chưa có lần trước (UI: "Chưa có lần trước để so sánh" — **không** hiện `▲ 0.0`).
- Tiêu chí chỉ có ở 1 lần → `null`; **không** tính vào `delta.total`.
- `levelMismatch = true` → UI vẫn hiện delta nhưng kèm cảnh báo "so sánh giữa 2 level khác nhau".

### 4.3 Luồng ghi âm + STT (S08)

```ts
// use-recorder.ts — start()
const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(t => MediaRecorder.isTypeSupported(t));
const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
rec.start(250);                       // chunk 250ms để vẽ waveform
```

```ts
// use-audio-level.ts — peak dBFS cho hiển thị "Peak: -2.8 dBFS"
const ctx = new AudioContext();
const source = ctx.createMediaStreamSource(stream);
const analyser = ctx.createAnalyser();
analyser.fftSize = 2048;
source.connect(analyser);
const buf = new Float32Array(analyser.fftSize);
const peakDb = () => {
  analyser.getFloatTimeDomainData(buf);
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  return max === 0 ? -Infinity : 20 * Math.log10(max);
};
```

**Thứ tự khởi động (quan trọng):**

```
User bấm "Ghi âm"
   │
   ├─► getUserMedia()          → nếu lỗi quyền: dừng, hiện hướng dẫn, KHÔNG bắt đầu STT
   ├─► new MediaRecorder(...)  → rec.start(250)
   ├─► new AudioContext()      → analyser gắn vào stream (mức peak)
   └─► new SpeechRecognition() → rec.start()  (continuous, interimResults)
        │
        ├─ onresult: interim → hiển thị mờ; final → nối vào finalText
        ├─ onend:     tự start() lại (Chrome dừng sau ~60s)
        └─ onerror:   not-allowed → dừng recorder, hiện cảnh báo
```

**Khi bấm "Gửi AI Chấm":**

```
1. dừng MediaRecorder + đóng AudioContext (giải phóng mic)
2. transcript = stt.finalText.trim()
3. nếu transcript rỗng → hiện lỗi, KHÔNG gọi API
4. speechMeta = buildSpeechMeta({ transcript, durationSec })
   ├─ wordsPerMinute = round(wordCount / (durationSec/60))
   ├─ fillerWords = đếm "uhm|uh|err|um|à|ừ" (case-insensitive) → [{word,count}]
   └─ pauses = khoảng trắng ≥ 0.5s trong finalText → [{atSecond, durationSec}]
5. POST /api/grade { mode:"speak", transcript, speechMeta, level, lang, prompt }
6. Activity.type="speak", minutes = ceil(durationSec/60)
```

### 4.4 Luồng stream rubric (client)

```ts
// src/components/speak/read-ndjson.ts
export async function* readNdjson(res: Response): AsyncGenerator<GradeEvent> {
  if (!res.body) throw new Error("no_body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      yield JSON.parse(line) as GradeEvent;
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer) as GradeEvent;
}
```

```tsx
// Sử dụng trong write-console / talk-console
const [criteria, setCriteria] = useState<RubricCriterion[]>([]);
const [total, setTotal] = useState<number | null>(null);
const [delta, setDelta] = useState<RubricDelta | null>(null);

async function handleGrade() {
  setStreaming(true); setError(null);
  const res = await fetch("/api/grade", { method: "POST", body: JSON.stringify(payload) });
  if (!res.ok) { setError(await res.json()); setStreaming(false); return; }

  for await (const evt of readNdjson(res)) {
    switch (evt.type) {
      case "meta":     break;
      case "criterion":
        setCriteria(prev => [...prev.filter(c => c.key !== evt.data.key), evt.data]
          .sort((a, b) => RUBRIC_ORDER.indexOf(a.key) - RUBRIC_ORDER.indexOf(b.key)));
        break;
      case "delta":    setDelta(evt.data); break;
      case "done":     setTotal(evt.data.total); break;
    }
  }
  setStreaming(false);
}
```

> **Tiêu chí chưa về hiện skeleton, KHÔNG hiện 0 điểm** — tránh hiểu nhầm là AI chấm 0 (NFR-CM-03).

### 4.5 Luồng tạo Evidence (P3)

```ts
export async function commitEvidence(args: {
  attemptId: string;
  skillId: string;
}): Promise<{ activityId: string; evidenceId: string; rating: number }> {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.speakAttempt.findUniqueOrThrow({
      where: { id: args.attemptId },
      include: { activity: true },
    });
    // Idempotent: SpeakAttempt.activityId là @unique → đã có Evidence thì trả về luôn.
    const existing = await tx.evidence.findFirst({ where: { activityId: attempt.activityId } });
    if (existing) {
      return { activityId: attempt.activityId, evidenceId: existing.id, rating: existing.rating };
    }
    const rating = ratingFromScore(attempt.totalScore);
    const evidence = await tx.evidence.create({
      data: { activityId: attempt.activityId, skillId: args.skillId, rating },
    });
    return { activityId: attempt.activityId, evidenceId: evidence.id, rating };
  });
}
```

**Sơ đồ phân rã bằng chứng (P3):**

```
Activity { domain:"communication", type:"write", aiScore:3.8, skillId:<kỹ năng Viết> }
   │
   └─► Evidence { skillId:<kỹ năng Viết>, rating:3 }        // 3.8 → rating 3
          │
          └─► Skill.level tăng khi đủ EVIDENCE_THRESHOLD(=3) bằng chứng rating ≥ EVIDENCE_RATING_MIN(=3)
```

`rating` suy ra từ tổng điểm: `≥4.0→4`, `≥3.0→3`, `≥2.0→2`, `<2.0→1`.

### 4.6 Luồng sinh flashcard từ bài viết → đẩy vào FSRS (AI-10)

```ts
export async function createCardsFromPractice(args: {
  cards: Array<{ front: string; back: string; note: string | null; example: string | null }>;
  lang: "zh" | "en";
  practiceId: string;
  maxCards: number;
}): Promise<Array<{ id: string; front: string; dueAt: string }>> {
  const created: Array<{ id: string; front: string; dueAt: string }> = [];

  for (const raw of args.cards.slice(0, args.maxCards)) {
    // 1. Bỏ qua thẻ trùng (front + lang đã tồn tại)
    const dup = await prisma.card.findFirst({ where: { lang: args.lang, front: raw.front } });
    if (dup) continue;

    // 2. Tạo thẻ FSRS: mode="produce", due = now + 12h (thẻ nhớ lỗi phải ôn lại sớm)
    const due = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const card = await prisma.card.create({
      data: {
        lang: args.lang,
        front: raw.front,
        back: raw.back,
        note: raw.note,
        example: raw.example,
        mode: "produce",
        group: "ai-from-practice",
        cardState: initialFsrsState(),      // từ src/lib/fsrs.ts
        due,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
      },
    });

    // 3. Ghi liên kết PracticeCard → Card
    await prisma.practiceCard.create({
      data: {
        practiceId: args.practiceId,
        cardId: card.id,
        front: raw.front,
        back: raw.back,
        note: raw.note,
        example: raw.example,
      },
    });

    created.push({ id: card.id, front: card.front, dueAt: due.toISOString() });
  }
  return created;
}
```

**Nút "Thêm vào ôn" từ từ khoá (FR-LG-14) — không qua AI:**

```ts
export async function addKeywordToDeck(args: {
  keyword: string;
  lang: "zh" | "en";
  meaning?: string | null;
}): Promise<{ cardId: string; dueAt: string; duplicated: boolean }> {
  const dup = await prisma.card.findFirst({ where: { lang: args.lang, front: args.keyword } });
  if (dup) return { cardId: dup.id, dueAt: dup.due.toISOString(), duplicated: true };

  const due = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const card = await prisma.card.create({
    data: {
      lang: args.lang,
      front: args.keyword,
      back: args.meaning ?? "",     // nghĩa để trống → người dùng tự điền khi ôn
      mode: "produce",
      group: "keyword-from-practice",
      cardState: initialFsrsState(),
      due, stability: 0, difficulty: 0, reps: 0, lapses: 0,
    },
  });
  return { cardId: card.id, dueAt: due.toISOString(), duplicated: false };
}
```

**Hai hành vi này khác nhau (FR-LG-16):**

| | "Thêm vào ôn" (từ khoá) | "Tạo 2 thẻ Flashcard" (AI-10) |
|---|---|---|
| Nguồn | 1 từ khoá bắt buộc | Lỗi người dùng vừa mắc |
| Gọi AI | **Không** | Có (`claude-haiku-4-5`) |
| Số thẻ | 1 | ≤ 2 |
| Ý nghĩa | Để trống, người dùng tự nhớ | Có sẵn nghĩa + ví dụ |

### 4.7 Lưu trữ & truy vấn

```ts
// Lấy attempt gần nhất để tính delta (FR-CM-03)
export async function findPreviousAttempt(args: { mode: string; promptId?: string | null }) {
  return prisma.speakAttempt.findFirst({
    where: {
      mode: args.mode,
      ...(args.promptId ? { promptId: args.promptId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { activity: { select: { skillId: true } } },
  });
}

// Danh sách bài luyện (kho 12 bài mẫu + bài tự tạo)
export async function listSpeakPrompts(filters: {
  level?: string; lang?: string; mode?: string; q?: string;
}) {
  return prisma.speakPrompt.findMany({
    where: {
      ...(filters.level ? { level: filters.level } : {}),
      ...(filters.lang ? { lang: filters.lang } : {}),
      ...(filters.mode ? { mode: { in: [filters.mode, "both"] } } : {}),
      ...(filters.q ? { OR: [{ title: { contains: filters.q } }, { prompt: { contains: filters.q } }] } : {}),
    },
    orderBy: [{ isUserMade: "asc" }, { code: "asc" }],
  });
}

// Lịch sử attempt (GET /api/speak/history)
export async function listSpeakAttempts(filters: { limit: number; mode?: string; promptId?: string }) {
  return prisma.speakAttempt.findMany({
    where: { ...(filters.mode ? { mode: filters.mode } : {}), ...(filters.promptId ? { promptId: filters.promptId } : {}) },
    orderBy: { createdAt: "desc" },
    take: filters.limit,
    include: { prompt: { select: { code: true, title: true } }, activity: { select: { aiScore: true, skillId: true } } },
  });
}
```

> **SQLite + Prisma:** `contains` trên SQLite là `LIKE` — không phân biệt hoa thường và **không hỗ trợ index**. Vì kho bài chỉ vài chục dòng, chấp nhận full scan; **không** cần thêm index.

## 5. Xử lý lỗi

| Tình huống | Phát hiện | Xử lý | Thông báo người dùng |
|---|---|---|---|
| Thiếu `ANTHROPIC_API_KEY` | `!process.env.ANTHROPIC_API_KEY` | 503; UI ẩn nút chấm | "Bật chấm AI bằng cách thêm API key trong Cài đặt" |
| Quyền mic bị từ chối | `getUserMedia` → `NotAllowedError` | `state="denied"`, dừng recorder, ẩn nút chấm | "Không được cấp quyền mic — bật trong cài đặt trình duyệt rồi tải lại trang" |
| Không có thiết bị ghi âm | `getUserMedia` → `NotFoundError` | `error="no_device"` | "Không tìm thấy mic. Kết nối mic rồi thử lại." |
| Không secure context | `navigator.mediaDevices` undefined | `state="unsupported"` | "Mở app qua https:// hoặc localhost để dùng mic" |
| Web Speech API không hỗ trợ | `SpeechRecognition` undefined | `stt.status="unsupported"` → mở ô nhập transcript tay | "Trình duyệt này không hỗ trợ STT — nhập transcript thủ công để vẫn được chấm" |
| STT lỗi `not-allowed` | `rec.onerror` | Dừng recorder, giữ `finalText` | "Không được cấp quyền nhận dạng giọng nói." |
| STT lỗi `network` | `rec.onerror` | Giữ `finalText`, cho nhập tay | "STT mất mạng — nhập transcript tay hoặc thử lại." |
| Transcript rỗng | `finalText.trim() === ""` | Chặn request, **không gọi AI** | "Chưa nhận được giọng nói — hãy thử ghi lại." |
| Bài quá ngắn | `validateGradingInput` → `too_short` | 422, **không gọi AI** | "Bài quá ngắn (cần ≥ 20 từ) để chấm có nghĩa." |
| AI trả sai cấu trúc rubric | `GradeSchema.safeParse` fail | Log lỗi, không ghi `Activity`, trả `502` | "AI trả về sai cấu trúc tiêu chí — thử lại." |
| `stop_reason === "refusal"` | Kiểm tra **trước** khi đọc `content` | `AiCall{ok:false}` | "AI không thể chấm nội dung này. Bài của bạn vẫn được giữ nguyên." |
| `RateLimitError` | Typed exception | `AiCall{ok:false, error}` | "AI đang tải cao. Thử lại sau vài phút." + nút Thử lại |
| `APIConnectionError` / timeout | Typed exception | `AiCall{ok:false}` | "Không kết nối được AI. Kiểm tra mạng rồi thử lại." |
| Streaming ngắt giữa chừng | Reader error | Giữ tiêu chí đã nhận | "Kết nối bị gián đoạn — nhận đủ 5 tiêu chí rồi hãy chấm lại." + Thử lại |
| AI-09 trả nhóm lỗi lạ | `LanguageCorrectSchema.safeParse` fail | Log, trả `502` | "AI trả về sai cấu trúc nhóm lỗi — thử lại." |
| AI-10 trả 0 thẻ | `FlashcardsSchema` fail hoặc `cards.length === 0` | Không tạo thẻ, trả `cards: []` | "Chưa tạo được thẻ — thử lại hoặc dùng nút Thêm vào ôn." |
| Thẻ trùng `front`+`lang` | Query trùng | Bỏ qua thẻ trùng | "1 thẻ trùng đã có — không tạo lại." |
| Role-play mất kết nối | Reader error | Giữ lượt đã nhận | "Kết nối bị gián đoạn — bấm Tiếp tục." |
| AI trả lời sai ngôn ngữ | So khớp script ngôn ngữ đích | Cảnh báo + nút "Báo lỗi" | "AI đang trả lời sai ngôn ngữ." |
| Commit Evidence 2 lần | `activityId` unique | Trả evidence cũ (idempotent) | "Bằng chứng đã được ghi nhận." |
| DB lỗi | Prisma exception | 500 + log | "Không lưu được kết quả. Thử lại." |

## 6. Chiến lược kiểm thử

| Tầng | Công cụ | Phạm vi |
|---|---|---|
| Unit | Vitest | `computeTotal` — 0 phần tử, 1 phần tử, 5 phần tử, làm tròn 1 chữ số (AC-CM-2) |
| Unit | Vitest | `computeDelta` — chưa có lần trước → `total: null`; thiếu 1 tiêu chí → `null` + total tính trên tập giao; `levelMismatch` |
| Unit | Vitest | `ratingFromScore` — biên 4.0/3.0/2.0/1.99 |
| Unit | Vitest | `validateGradingInput` — `too_short`, `empty_transcript`, `invalid_level`, `invalid_lang` |
| Unit | Vitest | `buildSpeechMeta` — wpm tính đúng, filler đếm đúng, transcript < 15 từ → wpm = 0 (không NaN) |
| Unit | Vitest | `buildGradeUserMessage` **không** chứa `Date.now()`/UUID (bảo toàn cache) |
| Unit | Vitest | `extractKeywords` — lọc stopword, giữ nguyên hanzi, sắp xếp theo thứ tự xuất hiện |
| Integration | Vitest + SQLite test DB | Fixture 2 `SpeakAttempt` → `findPreviousAttempt` trả đúng bản ghi mới nhất |
| Integration | Vitest | `commitEvidence` gọi 2 lần → vẫn **1** `Evidence` (idempotent) |
| Integration | Vitest | `Activity` + `Evidence` đúng domain/type/skillId; `rating` = `ratingFromScore(total)` (AC-CM-5) |
| Integration | Vitest (mock AI) | AI trả 6 tiêu chí → `502`, **không** ghi `Activity` (AC-CM-1) |
| Integration | Vitest (mock AI) | AI trả 4 tiêu chí → `502` |
| Integration | Vitest (mock AI) | AI-09 trả nhóm lỗi lạ → `502`; trả đúng 4 nhóm → lưu `errorGroups` đủ 4 key |
| Integration | Vitest (mock AI) | AI-10 trả 2 thẻ → tạo đúng 2 `Card` (`mode="produce"`, `due` ≈ +12h); trùng `front` → bỏ qua |
| Integration | Vitest | `createCardsFromPractice` với `maxCards=2` và 3 thẻ → chỉ tạo 2 |
| Integration | Vitest | `addKeywordToDeck` trùng → `duplicated: true`, không tạo thẻ mới (AC-CM-10) |
| Integration | Vitest | `RoleplaySession` task `next_turn` → payload gửi AI **không** chứa `hiddenGoal` (AC-CM-7) |
| Integration | Vitest | `RateLimitError` → `AiCall{ok:false}`, response thân thiện, không crash |
| Integration | Vitest | `stop_reason: "refusal"` → `AiCall{ok:false}`, không 500 |
| E2E | Playwright | S07: viết bài → chấm → hiện đúng 5 tiêu chí + tổng 3.8 + delta `▲ +0.4` (AC-CM-1..3) |
| E2E | Playwright | S07 lần đầu → "Chưa có lần trước để so sánh", không `▲ 0.0` (AC-CM-3) |
| E2E | Playwright | S07 bấm commit → DB có 1 `Activity` + 1 `Evidence` (AC-CM-5) |
| E2E | Playwright | S07 kho đề hiện 12 bài `EX-01..EX-12`; lọc level B2 → đúng số bài (AC-CM-6) |
| E2E | Playwright | S07 tạo prompt tự do → xuất hiện trong kho với `isUserMade=true` |
| E2E | Playwright | S08: mock `getUserMedia` + `SpeechRecognition` → ghi → chấm → transcript + rubric 5 tiêu chí + filler words (AC-CM-4) |
| E2E | Playwright | S08 từ chối quyền mic → hiện hướng dẫn, không crash, không gọi API (AC-CM-12) |
| E2E | Playwright | S11 Tab 1: viết bài Trung văn sai → 4 nhóm lỗi, đúng nhóm `grammar`/`vocab` (AC-CM-9) |
| E2E | Playwright | S11 bấm AI-10 → toast "Đã thêm 2 thẻ", DB có 2 `Card` `mode=produce` (AC-CM-9) |
| E2E | Playwright | S11 Tab 2: bắt đầu role-play → `hiddenGoal` **không** hiện; kết thúc → `goalScore` về (AC-CM-7) |
| E2E | Playwright | Không API key → cả 3 màn hình ẩn nút chấm, hiện hướng dẫn, không có request API (AC-CM-11) |
| A11y | axe | Rubric panel có `aria-live`; icon-only button có `aria-label`; delta có text thay thế |
| Responsive | Playwright 390px | S07 editor + kho đề xếp dọc; S08 transcript cuộn dọc; S11 2 tab xếp dọc; nút chấm trong vùng ngón cái |

## 7. Rủi ro & đánh đổi kỹ thuật

| # | Rủi ro | Tác động | Giảm thiểu |
|---|---|---|---|
| T1 | `SpeechRecognition` dừng đột ngột sau ~60s (Chrome) | Mất đuôi transcript giữa bài nói 90–120s | `onend` tự `start()` lại nếu đang ở trạng thái `listening`; giữ `finalText` đã chốt |
| T2 | Safari/Firefox không có `SpeechRecognition` | S08 không dùng được trên 2 trình duyệt lớn | Chuyển sang chế độ nhập transcript tay; **không** dùng SDK STT trả phí (NFR-07) |
| T3 | `getUserMedia` chỉ hoạt động trên secure context | Mic không dùng được khi mở file `file://` | Hiện hướng dẫn "mở qua https:// hoặc localhost"; dev script dùng `localhost` |
| T4 | AI chấm không ổn định giữa 2 lần | Người dùng mất niềm tin vào delta | `temperature` mặc định không cao; rubric chi tiết; lưu điểm từng tiêu chí kèm lý do; chấp nhận sai số ±0.3; hiển thị delta là *đối chiếu 2 lần chấm* |
| T5 | Gửi cả transcript dài (vài nghìn token) mỗi lần chấm | Chi phí & độ trễ tăng | `speechMeta` rút gọn; không gửi audio; rubric block cache; `effort: medium`; ghi `AiCall` để đo |
| T6 | Stream NDJSON bị ngắt giữa chừng → mất tiêu chí | Người dùng phải chấm lại | Client giữ tiêu chí đã nhận + hiện "Thử lại"; server chỉ ghi `Activity` khi nhận **đủ 5** tiêu chí |
| T7 | Mục tiêu ẩn bị lộ qua prompt hoặc UI | Mất giá trị FR-CM-06 | `hiddenGoal` chỉ nằm trong task `goal_evaluation`; `buildRoleplayUserMessage` không có tham số goal; UI không render trước khi có `goalScore` |
| T8 | Nhiều endpoint AI dùng chung `RUBRIC_*_BLOCK` với nội dung khác nhau | Cache hit = 0 (silent invalidator) | 1 hằng số cho 1 block; `cache_control` đặt đúng 1 breakpoint sau block; kiểm tra `usage.cache_read_input_tokens > 0` ở call thứ 2 (AC-5 liên quan) |
| T9 | `Activity` không có quan hệ ngược → Prisma migrate fail khi thêm model | Deploy lỗi | Thêm đủ 3 trường quan hệ 1–1 (`speakAttempt`, `roleplaySession`, `languagePractice`) trong cùng migration |
| T10 | `SpeakAttempt.rubric` lưu JSON không có schema ở tầng DB | Dữ liệu lịch sử có thể lệch shape sau này | Validate bằng `GradeSchema` trước khi ghi; đọc lại qua `GradeSchema.safeParse` (fail → bỏ qua attempt, không crash) |
| T11 | Người dùng spam "Chấm" tạo nhiều `Activity` | Cây kỹ năng bị nhiễu bằng chứng yếu | Nút disable khi đang stream; server trả `409 already_grading`; `rating` suy ra từ điểm nên bài rác cho rating thấp |
| T12 | `MediaStream` không được giải phóng khi đóng tab | Mic đỏ, privacy | `useEffect` cleanup `tracks.forEach(t => t.stop())` + `AudioContext.close()` |
| T13 | Nhiều thẻ AI-10 làm loãng deck FSRS | Người dùng ngừng ôn | `maxCards=2`; check trùng; thẻ `mode="produce"`; đếm "thẻ đến hạn" hiển thị ở S09 để thấy hậu quả |
| T14 | IME tiếng Việt/Trung trong `textarea` React bị reset khi re-render | Mất ký tự đang gõ | Không re-render textarea theo `value` trong lúc `isComposing`; dùng uncontrolled + `ref` cho bộ đếm |
