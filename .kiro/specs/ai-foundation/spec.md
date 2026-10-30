# AI Foundation — Lớp nền tảng AI dùng chung

> **Màn hình:** không có màn hình riêng (cross-cutting foundation) · **Route:** không có route công khai · **Phase:** 0
> **Nguồn:** system-design/SPEC.md §2.7 (FR-AI-01..08), §4 (`AiCall`), §5.1–§5.7, §8 (AC-5, AC-7, AC-8) · `.kiro/steering/tech.md` §4
> **Phụ thuộc:** `app-foundation` (phải xong trước)

## 1. Tổng quan

`ai-foundation` là lớp hạ tầng AI được **mọi feature khác dùng chung**: một client Anthropic duy nhất, một bộ prompt/rubric hằng số, một cơ chế prompt caching, một cơ chế structured output (Zod), một chuỗi exception typed, một chế độ offline, và một bảng ghi log chi phí (`AiCall`). Feature này **không có UI riêng** — nó là cross-cutting foundation, mọi màn hình có AI đều đi qua nó.

Feature này hiện thực hoá 4 nguyên tắc bất di bất dịch:

- **P4 — AI chấm theo rubric cố định.** Rubric khai báo dưới dạng **hằng số** trong `src/lib/prompts.ts` (`RUBRIC_COMMUNICATION`, `RUBRIC_TECHNICAL`, `RUBRIC_BEHAVIORAL`, `RUBRIC_LANGUAGE_ERRORS`); AI không bao giờ tự định nghĩa tiêu chí. Tổng điểm luôn = trung bình các tiêu chí.
- **P6 — Local-first.** Không có `ANTHROPIC_API_KEY` thì app không crash: `AI-01` chạy bằng bộ sinh rule cục bộ (`src/lib/plan.ts`), các tính năng AI khác ẩn nút + hướng dẫn thêm key. **Không giả lập phản hồi AI.**
- **R3 — AI chấm không đáng tin.** Structured output bắt buộc cho mọi payload có cấu trúc; lỗi schema được typed, không parse text tự do.
- **R4 — Chi phí API vượt dự kiến.** Mọi lời gọi đều ghi `AiCall` (input/output/cache read/cache write/estimated cost) để S15 hiển thị chi phí thật.

Thuộc nguyên tắc P1/P2/P3/P5/P7: feature này **không** thêm domain, **không** thêm màn hình, **không** tạo metric mới — nó chỉ làm cho các lời gọi AI của các feature khác nhanh hơn, rẻ hơn, đo được và không bao giờ làm sập trang.

## 2. Bối cảnh & vấn đề

- **16 hàm AI (AI-01..AI-16) sẽ được implement ở 16 API route khác nhau** (SPEC §5.1). Nếu mỗi route tự khởi tạo client, tự viết prompt, tự xử lý lỗi → 16 bản sao logic, 16 chỗ để quên log chi phí, 16 chỗ để làm hỏng cache.
- **Chi phí là rủi ro R4.** SPEC §5.7 ước tính 4–22 USD/tháng tùy kịch bản; con số này chỉ đúng nếu prompt caching thực sự hoạt động. Không có lớp log `AiCall` thì không có cách biết mình đang trả bao nhiêu.
- **Prompt caching rất dễ hỏng âm thầm.** SPEC §5.2 điều kiện 4–5: nếu `usage.cache_read_input_tokens = 0` ở call thứ 2 ⇒ có *silent invalidator*; nếu system prompt ngắn hơn ngưỡng cache của model ⇒ API **không báo lỗi**, chỉ im lặng không cache. Hai lỗi này không thể phát hiện bằng mắt.
- **Rubric không cố định là nguồn hallucination tiêu chí (R3).** Mỗi feature tự viết tiêu chí trong prompt sẽ tạo ra các thang điểm khác nhau → điểm không so sánh được giữa các phiên, vi phạm P4 và AC-6/AC-9/AC-12.
- **AI là nguồn lỗi runtime.** `stop_reason: "refusal"`, 429, 401, timeout, mạng rớt, structured output malformed — nếu không có chuỗi exception typed thì lỗi sẽ nổi lên dưới dạng stack trace và làm sập trang (AC-8).
- **Người dùng có thể chạy app không có API key** (đây là điều kiện hợp lệ, không phải lỗi). `AI-01` vẫn phải ra được 6 hành động (AC-7).

## 3. Yêu cầu chức năng

### 3.1 Lõi AI layer (client, log, lỗi)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-AI-01 | Mọi lời gọi AI dùng **prompt caching** với system prompt cố định làm prefix. | P0 | FR-AI-01 |
| FR-AI-02 | Mọi lời gọi trả về nội dung dài dùng **streaming**. | P0 | FR-AI-02 |
| FR-AI-03 | Phân tuyến model: `claude-opus-5` cho chấm điểm/sinh kế hoạch/role-play; `claude-haiku-4-5` cho phân loại & trích xuất. | P0 | FR-AI-03 |
| FR-AI-04 | Output có cấu trúc (rubric, plan) dùng **structured outputs** (`output_config.format`), không parse text tự do. | P0 | FR-AI-04 |
| FR-AI-05 | Xử lý `stop_reason: "refusal"` và lỗi API theo chuỗi exception typed của SDK; hiển thị thông báo thân thiện, không crash. | P0 | FR-AI-05 |
| FR-AI-06 | Nếu không có `ANTHROPIC_API_KEY` → app chạy ở **chế độ offline**: kế hoạch ngày sinh bằng rule cục bộ, mọi tính năng AI khác hiển thị "cần API key". | P0 | FR-AI-06 |
| FR-AI-07 | Ghi log usage (input/output/cache tokens) vào bảng `AiCall` để theo dõi chi phí. | P1 | FR-AI-07 |
| FR-AI-08 | Prompt caching phải kiểm chứng được: hiển thị `cache_read_input_tokens` ở màn hình Cài đặt → Chi phí. | P2 | FR-AI-08 |

### 3.2 Prompt & rubric (P4)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-AI-09 | `STABLE_SYSTEM` là **hằng số**, không chứa ngày tháng, UUID, `Date.now()`, tên người dùng, `aiTone` hay bất kỳ dữ liệu biến động nào. | P0 | FR-AI-01, §5.2 |
| FR-AI-10 | 4 bộ rubric hằng số: `RUBRIC_COMMUNICATION` (5 tiêu chí), `RUBRIC_TECHNICAL` (5 tiêu chí), `RUBRIC_BEHAVIORAL` (4 tiêu chí), `RUBRIC_LANGUAGE_ERRORS` (4 nhóm). Định nghĩa tiêu chí **không** nằm trong prompt của feature khác. | P0 | FR-AI-04, P4 |
| FR-AI-11 | `getRubricBlock(rubricId)` trả về **system block** có `cache_control: { type: "ephemeral" }`; block cuối cùng của mảng `system` luôn mang breakpoint. | P0 | FR-AI-01, §5.2 |
| FR-AI-12 | Zod schema cho **mọi** structured output: kế hoạch 6 slot, rubric chấm điểm, tóm tắt + 1 câu hỏi nhật ký, 4 nhóm lỗi ngôn ngữ, ước lượng level, điểm mock interview, blueprint bài kiểm tra. | P0 | FR-AI-04 |
| FR-AI-13 | Tổng điểm rubric **luôn** = trung bình các tiêu chí, do code tính (không để AI tự khai tổng). | P0 | P4, AC-6 |
| FR-AI-14 | `buildPlanSchema()` sinh schema kế hoạch ràng buộc **đúng 6 slot**, mỗi slot gắn đúng domain theo bảng slot cố định (SPEC §2.1). AI không đổi được cấu trúc. | P0 | FR-DL-01, §2.1 |

### 3.2b Ngữ cảnh người dùng trong prompt (Q1·Q2·Q3·Q4·Q8)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-AI-25 | Mọi lời gọi AI nhận **ngữ cảnh người dùng** trong `messages` (phần biến động, **không** đặt trong `system`): nghề (`Java Backend Developer`) · cây kỹ năng đang luyện · trình độ từng ngôn ngữ (`en=A1`, `zh=zero`, `vi=B2`) · chuẩn CEFR/HSK đang dùng · giai đoạn lộ trình hiện tại · `UpcomingGoal` đang `active` (nếu có). | P0 | Q1–Q4, Q8 |
| FR-AI-26 | Prompt phải biết **tiếng Việt là bản ngữ** ⇒ không chấm ngữ pháp vi, không gợi ý học từ vựng vi. | P0 | Q3 |
| FR-AI-27 | Prompt **không** chứa trường deadline; thay bằng `currentStage` + `stageCriteria` + `recentVelocity` (evidence/ngày). | P0 | Q4 |

> **Nguồn chân lý:** `.kiro/steering/user-profile-decisions.md`

### 3.3 Routing & model (FR-AI-03)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-AI-15 | Bảng routing 16 mã AI-01..AI-16 khai báo **một lần** trong `src/lib/anthropic.ts` (mã → feature slug, model, streaming, effort, structured). Mọi call site tra bảng này, không hardcode model. | P0 | FR-AI-03, §5.1 |
| FR-AI-16 | `effort` theo bảng routing: `low` cho phân loại/trích xuất/level, `medium` cho chấm/sinh, `high` cho báo cáo tuần & báo cáo cuối phiên. `effort` **cố định theo mã AI** trong suốt vòng đời tính năng — không đổi giữa các lượt (đổi giữa lượt sẽ phá cached prefix). | P0 | §5.1, R11 |
| FR-AI-17 | Feature **không** dùng streaming (`AI-02`, `AI-06`, `AI-10`, `AI-16`) dùng `callAIJson`; feature còn lại dùng `streamAI`. | P0 | FR-AI-02, §5.1 |

### 3.4 Offline & fallback (FR-AI-06)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-AI-18 | `isAiAvailable()` trả về `false` khi thiếu `ANTHROPIC_API_KEY`; mọi hàm gọi AI trong lớp này **ném** `AiOfflineError` thay vì gọi SDK. | P0 | FR-AI-06 |
| FR-AI-19 | `generateFallbackPlan()` (trong `src/lib/plan.ts`) sinh **đúng 6 slot**, gắn slot cố định theo domain, xoay vòng kỹ năng theo mức thấp nhất, tiêu đề lấy từ tên kỹ năng. Kết quả ghi với `PlanItem.source = "fallback"`. | P0 | FR-AI-06, §5.6 |
| FR-AI-20 | Các tính năng AI khác (ngoài `AI-01`) khi offline: **ẩn nút** AI + hiển thị hướng dẫn thêm key. Không hiển thị nội dung AI giả lập, không hiển thị điểm giả. | P0 | FR-AI-06, §5.6 |

### 3.5 Ghi log & chi phí (FR-AI-07, FR-AI-08)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-AI-21 | **Mọi** lời gọi AI (thành công lẫn thất bại) ghi đúng 1 dòng `AiCall`: `feature`, `model`, `inputTokens`, `outputTokens`, `cacheRead`, `cacheWrite`, `estimatedCost`, `ok`, `error`. | P1 | FR-AI-07 |
| FR-AI-22 | `estimatedCost` tính bằng bảng giá model × token thực tế (input/output/cache write/cache read), làm tròn 6 chữ số thập phân, lưu dạng USD. | P1 | §5.7 |
| FR-AI-23 | Call **streaming** cũng phải ghi `AiCall` — dùng `usage` của message cuối cùng trong stream; nếu stream bị ngắt giữa chừng thì ghi `ok = false` kèm lỗi. | P1 | FR-AI-07 |
| FR-AI-24 | `AiCall` lưu `cacheRead` và `cacheWrite` để S15 hiển thị tỉ lệ cache hit — đây là cơ sở kiểm chứng FR-AI-08/AC-5 ngoài môi trường production. | P2 | FR-AI-08 |

## 4. Yêu cầu phi chức năng

| ID | Yêu cầu | Tiêu chí kiểm tra |
|---|---|---|
| NFR-AI-01 | Client singleton | `createAnthropicClient()` chỉ khởi tạo 1 instance cho toàn app (cache theo module, tránh nhân bản khi hot-reload). |
| NFR-AI-02 | Type safety | `strict: true`, không `any` trong `src/lib`. Mọi payload vào/ra có kiểu cụ thể; lỗi là typed error, không phải `string`. |
| NFR-AI-03 | Không rò rỉ dữ liệu | Chỉ nội dung người dùng **chủ động** nhờ AI mới được gửi lên API (P6). System prompt không chứa dữ liệu người dùng. |
| NFR-AI-04 | An toàn key | API key chỉ đọc từ `process.env.ANTHROPIC_API_KEY`, không log, không ghi vào DB, không trả về cho client. UI chỉ hiện dạng `sk-…abcd`. |
| NFR-AI-05 | Không crash | Mọi nhánh lỗi đều kết thúc bằng `{ ok: false, error }` hoặc message thân thiện + nút thử lại. Không stack trace lộ ra UI. |
| NFR-AI-06 | Tương thích SDK | Dùng `@anthropic-ai/sdk` + helper `@anthropic-ai/sdk/helpers/zod` (`zodOutputFormat`), `client.messages.parse()` cho structured output. |
| NFR-AI-07 | Chi phí đo được | Bảng `AiCall` là nguồn sự thật cho S15 → Chi phí; không dùng số liệu ước tính cứng. |
| NFR-AI-08 | Preflight cache | Có test tự động phát hiện *silent invalidator*: gọi 2 lần cùng system prompt, assert `cacheRead > 0` ở call thứ 2. |
| NFR-AI-09 | Offline-safe | Không có network cũng phải mở được app và tạo được kế hoạch 6 slot. |
| NFR-AI-10 | Deterministic | Cùng đầu vào → cùng kết quả cho phần không-AI (fallback plan, estimated cost). Không dùng `Math.random()` trong `src/lib/plan.ts`. |

> **Ngữ cảnh người dùng:** mọi call AI phải kèm profile (Java Backend, 3 ngôn ngữ, CEFR, giai đoạn lộ trình,
> `UpcomingGoal`) trong `messages` — xem FR-AI-25..27 và `.kiro/steering/user-profile-decisions.md`.

## 5. Mô hình dữ liệu

Feature này **không tạo model Prisma mới** — nó dùng model `AiCall` đã có trong SPEC §4 và ghi vào đó.

### 5.1 `AiCall` (SPEC §4)

| Model | Field | Kiểu | Ghi chú |
|---|---|---|---|
| `AiCall` | `id` | `String @id @default(cuid())` | Khóa chính. |
| | `feature` | `String` | Slug tính năng, lấy từ `AI_ROUTES[code].feature` (xem §6.3). |
| | `model` | `String` | `claude-opus-5` \| `claude-haiku-4-5`. |
| | `inputTokens` | `Int @default(0)` | `usage.input_tokens` (không tính phần đã cache). |
| | `outputTokens` | `Int @default(0)` | `usage.output_tokens`. |
| | `cacheRead` | `Int @default(0)` | `usage.cache_read_input_tokens` — cơ sở kiểm chứng AC-5. |
| | `cacheWrite` | `Int @default(0)` | `usage.cache_creation_input_tokens`. |
| | `estimatedCost` | `Float @default(0)` | USD, 6 chữ số thập phân. |
| | `ok` | `Boolean @default(true)` | `false` khi lỗi/refusal/offline. |
| | `error` | `String?` | Mã lỗi + thông điệp ngắn (không chứa key, không chứa nội dung người dùng). |
| | `createdAt` | `DateTime @default(now())` | `@@index([createdAt])`. |

### 5.2 Hằng số cấu hình dùng bởi lớp AI

| Hằng | Giá trị | Nguồn | Ghi chú |
|---|---|---|---|
| `SLOT_COUNT` | `6` | `.kiro/steering/project.md` §5 | AI không được sinh khác. |
| `SLOT_DOMAINS` | `["professional","communication","language","language","personal","personal"]` | SPEC §2.1 | Domain cố định theo slot 0..5. |
| `PLAN_FALLBACK_SOURCE` | `"fallback"` | project.md §5 | Ghi vào `PlanItem.source`. |
| `AI_MODELS` | `claude-opus-5`, `claude-haiku-4-5` | steering/tech.md §1 | |
| `PRICING` | opus `$5/$25`, haiku `$1/$5` mỗi 1M token | SPEC §5.7 | Cache write = 1.25× input, cache read = 0.1× input. |

### 5.3 Quan hệ & ràng buộc

- `AiCall.feature` **không** dùng mã `AI-01..AI-16` mà dùng slug ổn định để S15 gom nhóm theo tính năng; mã AI nằm trong `src/lib/anthropic.ts`.
- `PlanItem.source = "fallback"` là bằng chứng duy nhất cho biết kế hoạch đến từ rule cục bộ (không phải AI) — UI **không được** gắn nhãn "AI" cho plan item này.
- `AiCall` không có quan hệ FK với feature khác: một call AI có thể sinh ra nhiều row nghiệp vụ (`Activity`, `Evidence`, `PlanItem`).

## 6. Kiến trúc & hành vi

> Feature này **không có màn hình riêng** → không có ASCII wireframe UI. Thay vào đó: sơ đồ kiến trúc lớp AI, sơ đồ luồng xử lý lỗi, bảng thành phần, bảng trạng thái/edge case và bảng mapping lỗi → thông báo người dùng.

### 6.1 Sơ đồ kiến trúc lớp AI

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  CALL SITE (mỗi feature gọi 1 trong 2 hàm)                                  │
│  src/app/api/plan/generate/route.ts   (AI-01, streaming)                     │
│  src/app/api/grade/route.ts           (AI-03/04, streaming)                  │
│  src/app/api/journal/feedback/route.ts(AI-05, streaming)                     │
│  src/app/api/log/autofill/route.ts    (AI-02, json)                          │
│  …16 route…  →  gọi qua AI_ROUTES["AI-0x"] để lấy model/effort/streaming     │
└───────────────────────────────┬───────────────────────────────────────────────┘
                                │  { feature: "AI-01", system, messages, schema? }
                                ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  WRAPPER  src/lib/anthropic.ts                                               │
│                                                                               │
│   callAIJson(code, schema, opts)  ──► structured output (Zod)                │
│   streamAI(code, opts)           ──► streaming text                          │
│          │                                                                │
│          ├── guard: isAiAvailable()?  ──► không ─► AiOfflineError           │
│          ├── buildSystemBlocks(rubric) ──► [STABLE_SYSTEM, RUBRIC(cache)]     │
│          ├── client.messages.parse / .stream                                │
│          ├── refusal guard: stop_reason === "refusal" ? (TRƯỚC khi đọc content)
│          └── wrapWithLogging(...) ──► ghi AiCall { tokens, cost, ok, error }  │
└───────────────────────────────┬───────────────────────────────────────────────┘
                                │ Anthropic SDK (@anthropic-ai/sdk)
                                ▼
                     ┌──────────────────────┐
                     │  Anthropic API      │  →  Claude
                     └──────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────┐
│  PROMPT/KHẢ NĂNG  src/lib/prompts.ts                                         │
│   STABLE_SYSTEM (hằng số, không ngày/UUID/aiTone)                            │
│   RUBRIC_COMMUNICATION | RUBRIC_TECHNICAL | RUBRIC_BEHAVIORAL                │
│   RUBRIC_LANGUAGE_ERRORS                                                     │
│   getRubricBlock() · buildPlanSchema() · PlanSchema · RubricSchema ·         │
│   JournalFeedbackSchema · LanguageErrorSchema · LevelSchema ·                │
│   MockInterviewScoreSchema · TestBlueprintSchema                            │
└───────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────┐
│  OFFLINE  src/lib/plan.ts          AI-01: generateFallbackPlan()             │
│  xoay vòng kỹ năng mức thấp nhất · slot cố định · tiêu đề = tên kỹ năng    │
│  → PlanItem.source = "fallback"                                              │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Sơ đồ luồng xử lý lỗi

```
callAIJson()/streamAI()
   │
   ├─ isAiAvailable() === false ─────────────────► AiOfflineError
   │                                                 (UI: ẩn nút AI + hướng dẫn thêm key)
   │
   ▼
SDK call ──► bắt exception theo chuỗi typed:
   AuthenticationError ──► AiAuthError        (401/403 · key sai hoặc hết hạn)
   RateLimitError      ──► AiRateLimitError   (429 · có retryAfterMs)
   APIStatusError      ──► AiApiStatusError   (4xx/5xx khác)
   APIConnectionError  ──► AiConnectionError  (mạng rớt / timeout)
   APIError            ──► AiApiError         (lỗi SDK chung)
   │
   │  Mỗi nhánh: ghi AiCall { ok:false, error } ─► ném typed error lên call site
   ▼
response trả về
   │
   ├─ stop_reason === "refusal" ? ──► YES ──► AiRefusalError
   │                                  (KHÔNG đọc content — kiểm tra TRƯỚC)
   │                                  ghi AiCall { ok:false, error:"refusal" }
   ▼ NO
parse structured output
   │
   ├─ JSON hỏng / không khớp Zod ──► AiSchemaError
   │                                   ghi AiCall { ok:false, error:"schema_invalid" }
   ▼ OK
ghi AiCall { ok:true, input/output/cacheRead/cacheWrite/estimatedCost }
   │
   ▼
trả dữ liệu cho call site
```

### 6.3 Bảng thành phần (module)

| Module | Đường dẫn | Trách nhiệm | Phụ thuộc |
|---|---|---|---|
| AI client & wrapper | `src/lib/anthropic.ts` | Singleton client; bảng routing 16 mã; `callAIJson` (structured), `streamAI` (streaming), `wrapWithLogging` (ghi `AiCall`), `estimateCost`, chuỗi exception typed, guard offline, refusal guard. | `@anthropic-ai/sdk`, `src/lib/db.ts`, `src/lib/prompts.ts` |
| Prompt & schema | `src/lib/prompts.ts` | `STABLE_SYSTEM`; 4 bộ rubric hằng số; `getRubricBlock`; `buildPlanSchema`; các Zod schema cho mọi structured output. | `zod` |
| Offline plan | `src/lib/plan.ts` | `generateFallbackPlan()` — bộ sinh rule cục bộ cho `AI-01`; `SLOT_TEMPLATES`; xoay vòng kỹ năng theo mức thấp nhất. | `src/lib/db.ts` (`Skill`) |
| DB singleton | `src/lib/db.ts` | Prisma client singleton (đã có ở feature nền tảng dữ liệu) — dùng để ghi `AiCall`. | `prisma/schema.prisma` |
| Cost view | `src/app/settings/...` (S15, feature khác) | Hiển thị `cache_read_input_tokens` từ `AiCall` (FR-AI-08) — **ngoài phạm vi feature này**, chỉ cung cấp dữ liệu. | `AiCall` |

**Hợp đồng nội bộ giữa các module**

| Hàm | Module | Input | Output | Ghi chú |
|---|---|---|---|---|
| `isAiAvailable()` | `anthropic.ts` | — | `boolean` | `true` khi có `ANTHROPIC_API_KEY`. |
| `callAIJson(code, schema, opts)` | `anthropic.ts` | mã AI + Zod schema + `{ system, messages, maxTokens?, effort? }` | `{ data, usage }` | Structured output, không streaming. |
| `streamAI(code, opts)` | `anthropic.ts` | mã AI + `{ system, messages, maxTokens?, effort? }` | `AsyncGenerator<AiStreamEvent>` | Event `{ type:"text" }` / `{ type:"usage" }`. |
| `wrapWithLogging(meta, run)` | `anthropic.ts` | meta call + hàm thực thi | `{ data, usage }` | Bọc try/catch, ghi `AiCall`, ném typed error. |
| `getRubricBlock(rubricId)` | `prompts.ts` | `RubricId` | `Anthropic.TextBlockParam` | Có `cache_control: { type:"ephemeral" }`. |
| `buildPlanSchema(opts?)` | `prompts.ts` | `{ slotDomains? }` | `z.ZodType<PlanPayload>` | Ràng buộc đúng 6 slot. |
| `generateFallbackPlan(skills, opts?)` | `plan.ts` | `SkillForPlan[]` | `FallbackPlanItem[]` | 6 slot, `source:"fallback"`. |

### 6.4 Trạng thái & edge case

| # | Tình huống | Trạng thái | Phát hiện | Xử lý |
|---|---|---|---|---|
| E1 | **Thiếu `ANTHROPIC_API_KEY`** | Offline | `!process.env.ANTHROPIC_API_KEY` | `AI-01` → `generateFallbackPlan()` → `PlanItem.source="fallback"`. Tính năng AI khác → `AiOfflineError`; UI ẩn nút + hướng dẫn thêm key. Không giả lập nội dung AI. |
| E2 | **Key sai / hết hạn** | Lỗi 401 | `Anthropic.AuthenticationError` | `AiAuthError` → ghi `AiCall{ok:false}` → thông báo "API key không hợp lệ", CTA mở S15. |
| E3 | **429 rate limit** | Lỗi 429 | `Anthropic.RateLimitError` | `AiRateLimitError` (có `retryAfterMs`) → thông báo "đang bị giới hạn, thử lại sau Ns" + nút thử lại. Không retry vô hạn. |
| E4 | **`stop_reason: "refusal"`** | Refusal | `response.stop_reason` | Kiểm tra **trước khi đọc `content`** → `AiRefusalError`; ghi `AiCall{ok:false, error:"refusal"}`; UI hiện thông báo thân thiện, **trang không crash** (AC-8). |
| E5 | **Structured output malformed** | Lỗi schema | `zodOutputFormat` parse fail | `AiSchemaError` (kèm 5 issue đầu của Zod) → ghi `AiCall{ok:false, error:"schema_invalid"}` → thông báo "AI trả về dữ liệu không đúng cấu trúc, đã ghi nhận lỗi" + nút thử lại. Không parse text tự do. |
| E6 | **Timeout** | Lỗi timeout | `Anthropic.APIConnectionError` kèm `code:"timeout"` | `AiTimeoutError` → thông báo "AI phản hồi quá lâu" + nút thử lại. Ghi `AiCall{ok:false}`. |
| E7 | **Mạng rớt** | Lỗi mạng | `Anthropic.APIConnectionError` | `AiConnectionError` → thông báo "Không kết nối được tới máy chủ AI"; nếu là `AI-01` → đề nghị dùng kế hoạch offline. |
| E8 | **Streaming bị ngắt giữa chừng** | Stream lỗi | exception trong `for await` | Giữ phần text đã nhận (client hiển thị dở dang kèm nút "Thử lại"); ghi `AiCall{ok:false, error:"stream_interrupted"}`; **không** ghi dữ liệu nghiệp vụ dở dang. |
| E9 | **Cache hit = 0 ở call thứ 2 (silent invalidator)** | Caching hỏng | `usage.cache_read_input_tokens === 0` | Dấu hiệu *silent invalidator*: nội dung biến động lọt vào system prompt, hoặc system prompt ngắn hơn ngưỡng cache của model. Phải sửa, không phải "chấp nhận". Test tự động bắt (NFR-AI-08). |
| E10 | **System prompt ngắn hơn ngưỡng cache** | Im lặng không cache | `cache_creation_input_tokens === 0` **và** `cache_read_input_tokens === 0` | API **không** báo lỗi. Ngưỡng: `claude-opus-5` = 512 token, `claude-haiku-4-5` = 4.096 token → `STABLE_SYSTEM` phải đủ dài cho model rẻ nhất. |
| E11 | **`AiCall` ghi lỗi (DB hỏng)** | Lỗi hệ thống | exception Prisma khi insert | Log ở server, **không** ném lên để làm hỏng response của feature đang gọi. |
| E12 | **`max_tokens` bị cắt** | `stop_reason: "max_tokens"` | `response.stop_reason` | Ghi `AiCall{ok:false, error:"max_tokens"}` + thông báo "phản hồi bị cắt cụt, hãy thử lại" (áp dụng cho payload dài). |

### 6.5 Mapping lỗi → thông báo người dùng

| Lỗi typed | Mã lưu `AiCall.error` | Thông báo người dùng (tiếng Việt) | Hành động UI | Nút |
|---|---|---|---|---|
| `AiOfflineError` | `offline_no_key` | "Chưa có API key — tính năng AI đang tắt." | Ẩn nút AI (trừ AI-01), hiện hướng dẫn thêm key | "Thêm API key" → S15 |
| `AiAuthError` | `auth_failed` | "API key không hợp lệ hoặc đã hết hạn." | Hiện cảnh báo ở S15 | "Kiểm tra lại" → S15 |
| `AiRateLimitError` | `rate_limited` | "Đang bị giới hạn tốc độ, thử lại sau {n}s." | Giữ nội dung người dùng, cho phép thử lại | "Thử lại" |
| `AiRefusalError` | `refusal` | "AI không thể xử lý nội dung này. Bạn có thể diễn đạt lại." | Không hiện kết quả rỗng | "Thử lại" |
| `AiSchemaError` | `schema_invalid` | "AI trả về dữ liệu không đúng cấu trúc. Đã ghi nhận lỗi." | Không ghi dữ liệu nghiệp vụ | "Thử lại" |
| `AiTimeoutError` | `timeout` | "AI phản hồi quá lâu. Vui lòng thử lại." | Giữ nội dung người dùng | "Thử lại" |
| `AiConnectionError` | `connection_failed` | "Không kết nối được máy chủ AI." | `AI-01`: đề nghị dùng kế hoạch offline | "Thử lại" / "Dùng kế hoạch offline" |
| `AiStreamInterruptedError` | `stream_interrupted` | "Kết nối bị ngắt giữa chừng." | Giữ phần đã nhận, đánh dấu dở dang | "Thử lại" |
| `AiMaxTokensError` | `max_tokens` | "Phản hồi bị cắt cụt, hãy thử lại." | Không ghi dữ liệu nghiệp vụ | "Thử lại" |
| `AiApiError` | `api_error` | "Lỗi máy chủ AI. Vui lòng thử lại sau." | Giữ nội dung người dùng | "Thử lại" |

### 6.6 Bảng routing AI-01..AI-16 (copy từ SPEC §5.1)

| Mã | Tính năng | Màn hình | Model | Streaming | Effort | Cấu trúc output | `AiCall.feature` |
|---|---|---|---|---|---|---|---|
| AI-01 | Sinh kế hoạch ngày | S01, S02 | `claude-opus-5` | Có | `medium` | Structured: 6 slot | `daily_plan` |
| AI-02 | Hoàn thành nhanh (điền form) | S05 | `claude-haiku-4-5` | Không | `low` | Structured: domain/skill/minutes/difficulty | `quick_log_autofill` |
| AI-03 | Chấm giao tiếp (viết) | S07 | `claude-opus-5` | Có | `medium` | Structured: rubric 5 tiêu chí | `grading` |
| AI-04 | Chấm giao tiếp (nói) | S08 | `claude-opus-5` | Có | `medium` | Structured | `grading` |
| AI-05 | Phản hồi nhật ký | S06 | `claude-opus-5` | Có | `low` | Structured: tóm tắt + 1 câu hỏi | `journal_feedback` |
| AI-06 | Phân loại nhật ký → domain/skill | S06 | `claude-haiku-4-5` | Không | `low` | Structured | `classify` |
| AI-07 | Báo cáo tuần | S13 | `claude-opus-5` | Có | `high` | Structured: 3 nhận định + 6 slot | `weekly_review` |
| AI-08 | Role-play ngoại ngữ | S11 | `claude-opus-5` | Có | `medium` | Text (hội thoại) | `roleplay` |
| AI-09 | Sửa lỗi bài viết ngoại ngữ | S11 | `claude-opus-5` | Có | `medium` | Structured: 4 nhóm lỗi | `language_practice` |
| AI-10 | Sinh flashcard từ bài viết | S11 | `claude-haiku-4-5` | Không | `low` | Structured: mảng thẻ | `language_practice` |
| AI-11 | **Sinh câu hỏi mock interview** (lượt đầu) | S17 | `claude-opus-5` | Có | `medium` | Structured: câu hỏi + kind + skill | `mock_interview` |
| AI-12 | **Chấm + sinh câu tiếp theo** (mỗi lượt sau) | S17 | `claude-opus-5` | Có | `medium` | Structured: điểm 5 tiêu chí + câu kế tiếp | `mock_interview` |
| AI-13 | **Báo cáo cuối phiên** (3 mạnh / 3 yếu / gợi ý) | S18 | `claude-opus-5` | Có | `high` | Structured | `mock_interview` |
| AI-14 | **Sinh blueprint bài kiểm tra** (chọn item từ thẻ + ngân hàng seed) | S20 | `claude-opus-5` | Có | `medium` | Structured: mảng item | `language_test` |
| AI-15 | **Chấm câu tự luận** (writing/translation) theo 4 nhóm lỗi | S20 | `claude-opus-5` | Có | `medium` | Structured: 4 nhóm lỗi | `language_test` |
| AI-16 | **Ước lượng level** từ kết quả bài kiểm tra | S21 | `claude-opus-5` | Không | `low` | Structured: level + lý do | `language_test` |

> 8 slug `daily_plan`, `grading`, `journal_feedback`, `classify`, `weekly_review`, `roleplay`, `mock_interview`, `language_test` khớp đúng với comment trong SPEC §4; 3 slug mở rộng (`quick_log_autofill`, `language_practice`) được đặt tên để không lẫn với nhóm cũ.

### 6.7 Bảng rubric cố định (copy từ SPEC §5.4)

```
RUBRIC_COMMUNICATION = [
  { key: "clarity",   name: "Rõ ràng",    desc: "Người đọc hiểu ngay điều cần biết trong 1 câu đầu" },
  { key: "structure", name: "Cấu trúc",   desc: "Có mở–thân–kết rõ ràng, điều quan trọng nhất đứng đầu" },
  { key: "tone",      name: "Giọng văn",  desc: "Phù hợp với vai trò và mối quan hệ với người nhận" },
  { key: "natural",   name: "Tự nhiên",   desc: "Cách diễn đạt tự nhiên, không dịch từng chữ" },
  { key: "grammar",   name: "Ngữ pháp",   desc: "Cấu trúc câu và dấu câu đúng" },
]

RUBRIC_TECHNICAL = [
  { key: "accuracy",    name: "Chính xác",           desc: "Nội dung kỹ thuật đúng, không sai lệch kiến thức nền" },
  { key: "depth",       name: "Chiều sâu",           desc: "Đi sâu vào bản chất vấn đề, không dừng ở mặt ngoài" },
  { key: "reasoning",   name: "Lập luận",            desc: "Có chuỗi suy luận rõ ràng từ giả định đến kết luận" },
  { key: "communication", name: "Giao tiếp",         desc: "Diễn đạt rõ ràng, có cấu trúc, người nghe theo kịp" },
  { key: "tradeoff",    name: "Nhận biết đánh đổi", desc: "Nói được cái giá của lựa chọn và khi nào không dùng" },
]

RUBRIC_BEHAVIORAL = [
  { key: "specific",   name: "Cụ thể",      desc: "Có ví dụ cụ thể từ trải nghiệm thật, không nói chung chung" },
  { key: "star",       name: "Đầy đủ STAR", desc: "Rõ tình huống → nhiệm vụ → hành động → kết quả" },
  { key: "selfaware",  name: "Tự nhận thức", desc: "Nhận ra điều mình làm chưa tốt và vì sao" },
  { key: "outcome",    name: "Kết quả",     desc: "Kết quả có thể đo được, không chỉ là cảm nhận" },
]

RUBRIC_LANGUAGE_ERRORS = [
  { key: "grammar",    name: "Ngữ pháp" },
  { key: "vocab",      name: "Từ vựng" },
  { key: "expression", name: "Cách diễn đạt" },
  { key: "context",    name: "Ngữ cảnh" },
]
```

**Ràng buộc dùng rubric**

| Quy tắc | Giá trị |
|---|---|
| Thang điểm mỗi tiêu chí | `0..5` (số nguyên) |
| Tổng điểm | **luôn** = trung bình các tiêu chí, do code tính (`averageRubric()`), làm tròn 2 chữ số |
| Số tiêu chí | Communication 5 · Technical 5 · Behavioral 4 · Language errors 4 nhóm (không có điểm, chỉ phân loại) |
| Tiêu chí ngoài rubric | Không được phép sinh — schema dùng `z.enum` trên `key` nên tự động từ chối |
| Nơi khai báo | Chỉ `src/lib/prompts.ts`. Feature khác **import**, không copy. |

## 7. Hợp đồng API (nội bộ — không có route công khai)

> Feature này **không** tạo route HTTP. Các call site gọi trực tiếp hàm trong `src/lib/anthropic.ts`. Chi tiết implementation ở `design.md` §3.

| Hàm | File | Signature | Trả về | Ném lỗi |
|---|---|---|---|---|
| `isAiAvailable` | `src/lib/anthropic.ts` | `() => boolean` | có/không có key | — |
| `createAnthropicClient` | `src/lib/anthropic.ts` | `(apiKey?: string) => Anthropic` | client SDK | — |
| `callAIJson` | `src/lib/anthropic.ts` | `<T>(code: AIFeatureCode, schema: z.ZodType<T>, opts: AIRequestOptions) => Promise<AiResult<T>>` | `{ data, usage }` | `AiOfflineError`, `AiAuthError`, `AiRateLimitError`, `AiApiStatusError`, `AiConnectionError`, `AiTimeoutError`, `AiRefusalError`, `AiSchemaError`, `AiMaxTokensError` |
| `streamAI` | `src/lib/anthropic.ts` | `(code: AIFeatureCode, opts: AIRequestOptions) => AsyncGenerator<AiStreamEvent>` | event `{ type:"text" \| "usage" }` | như trên + `AiStreamInterruptedError` |
| `wrapWithLogging` | `src/lib/anthropic.ts` | `<T>(meta: AiCallMeta, run: () => Promise<AiResult<T>>) => Promise<AiResult<T>>` | `{ data, usage }` | giữ nguyên lỗi của `run`, sau khi ghi `AiCall` |
| `logAiCall` | `src/lib/anthropic.ts` | `(meta: AiCallMeta, usage: TokenUsage \| null, ok: boolean, error: string \| null) => Promise<void>` | `void` | không ném (lỗi DB chỉ log server) |
| `toAiError` | `src/lib/anthropic.ts` | `(err: unknown) => AiError` | typed error | — |
| `getAnthropicClient` | `src/lib/anthropic.ts` | `() => Anthropic` | client singleton | — |
| `estimateCost` | `src/lib/anthropic.ts` | `(model: AIModel, usage: TokenUsage) => number` | USD | — |
| `getRubricBlock` | `src/lib/prompts.ts` | `(rubric: RubricId) => Anthropic.TextBlockParam` | system block có `cache_control` | — |
| `buildSystemBlocks` | `src/lib/prompts.ts` | `(rubric?: RubricId) => Anthropic.TextBlockParam[]` | mảng system, block cuối có breakpoint | — |
| `buildPlanSchema` | `src/lib/prompts.ts` | `(opts?: { slotDomains?: readonly Domain[] }) => z.ZodType<PlanPayload>` | schema 6 slot | — |
| `generateFallbackPlan` | `src/lib/plan.ts` | `(skills: SkillForPlan[], opts?: { date?: Date }) => FallbackPlanItem[]` | 6 phần tử `source:"fallback"` | — |
| `listSkillsForPlan` | `src/lib/plan.ts` | `() => Promise<SkillForPlan[]>` | cây kỹ năng + số bằng chứng `rating ≥ 3` | — |

## 8. Tiêu chí nghiệm thu (Acceptance Criteria)

**AC-5 — Prompt caching hoạt động**
- *Given* 2 call liên tiếp cùng system prompt (cùng mã AI, cùng rubric), *When* đọc `usage.cache_read_input_tokens` của call thứ 2, *Then* > 0. Nếu = 0 → có silent invalidator phải sửa.
- *Given* một call dùng `claude-haiku-4-5`, *When* đo độ dài prefix (`tools + system`), *Then* ≥ 4.096 token, vì model này im lặng không cache khi prefix ngắn hơn ngưỡng.
- *Given* system prompt được build, *When* quét nội dung, *Then* **không** chứa ngày tháng, UUID, `aiTone`, tên người dùng hay bất kỳ token biến động nào.

**AC-7 — Offline**
- *Given* không có `ANTHROPIC_API_KEY`, *When* mở app và bấm "Lập kế hoạch hôm nay", *Then* vẫn sinh được 6 hành động từ rule cục bộ và ghi được vào DB.
- *Given* không có `ANTHROPIC_API_KEY`, *When* mở một tính năng AI khác (chấm điểm, phản hồi nhật ký…), *Then* nút AI bị ẩn, hiện hướng dẫn thêm key, **không** hiển thị nội dung/điểm AI giả lập.
- *Given* không có `ANTHROPIC_API_KEY`, *When* bất kỳ route nào gọi `callAIJson`/`streamAI`, *Then* ném `AiOfflineError` (không gọi ra network) và trang không crash.

**AC-8 — Refusal không crash**
- *Given* API trả `stop_reason: "refusal"`, *When* app gọi AI, *Then* hiện thông báo lỗi thân thiện, ghi log `AiCall{ok:false}`, trang không crash.
- *Given* API trả `stop_reason: "refusal"`, *When* wrapper xử lý, *Then* `content` **chưa** được đọc — kiểm tra refusal diễn ra trước bước đọc nội dung.
- *Given* một call thất bại bất kỳ, *When* kết thúc, *Then* có đúng 1 dòng `AiCall` với `ok=false` và `error` khác rỗng.

## 9. Rủi ro riêng của feature

| # | Rủi ro | Giảm thiểu |
|---|---|---|
| R-A1 | **Silent cache invalidator** — dữ liệu biến động lọt vào system prompt (ngày, `aiTone`, tên skill, lịch sử) → cache luôn = 0, chi phí tăng gấp đôi mà không có lỗi nào báo ra. | Mọi nội dung biến động nằm sau breakpoint trong `messages`; test tự động quét system prompt + assert `cacheRead > 0` ở call thứ 2 (AC-5). |
| R-A2 | **System prompt ngắn hơn ngưỡng cache** → API im lặng không cache (không lỗi, không cảnh báo). `claude-haiku-4-5` cần 4.096 token. | `STABLE_SYSTEM` + danh mục rubric đủ dài cho model rẻ nhất; preflight test dùng `messages.countTokens` để assert ngưỡng. |
| R-A3 | **Đổi `effort` giữa các lượt** → thay đổi prefix đã render → mất cache của mọi lượt trước. | `effort` gắn cứng theo mã AI trong bảng routing; không cho phép ghi đè ở call site. |
| R-A4 | **Rubric nhân bản/trôi** — feature khác copy tiêu chí vào prompt riêng → thang điểm không so sánh được. | Rubric chỉ tồn tại ở `src/lib/prompts.ts`; schema dùng `z.enum` trên `key` → tiêu chí lạ bị từ chối ở tầng parse. |
| R-A5 | **16 bản sao logic lỗi** khi feature khác tự gọi SDK thay vì qua wrapper → mất log chi phí, mất refusal guard. | Chỉ `src/lib/anthropic.ts` được import `@anthropic-ai/sdk`; lint rule chặn import trực tiếp ở `src/app/api/**`. |
| R-A6 | **`AiCall` ghi lỗi làm hỏng response** của feature đang gọi (DB lock/busy SQLite). | Bọc `logAiCall()` trong try/catch riêng, lỗi chỉ log server. |
| R-A7 | **Fallback plan trùng lặp mỗi ngày** → người dùng thấy cùng 6 việc → mất ý nghĩa. | Offset xoay vòng tính theo ngày (deterministic, không random) → mỗi ngày khác kỹ năng nhưng vẫn ưu tiên mức thấp nhất. |
| R-A8 | **Chi phí ước tính lệch thực tế** vì giá model thay đổi → số liệu S15 sai. | `PRICING` nằm trong một hằng duy nhất, có comment nguồn; rà soát lại sau 1 tuần chạy thật (SPEC §5.7). |
| R-A9 | **Zod schema quá chặt** → AI trả thiếu field → user thấy lỗi schema thay vì kết quả. | Schema dùng `.nullable()`/`.default()` cho field không bắt buộc; `callAIJson` hỗ trợ `strict: false` cho payload dài. |
| R-A10 | **Streaming bị ngắt giữa chừng** tạo dữ liệu nghiệp vụ dở dang trong DB. | Chỉ ghi dữ liệu nghiệp vụ sau khi stream hoàn tất; khi ngắt → `ok=false`, không ghi. |
