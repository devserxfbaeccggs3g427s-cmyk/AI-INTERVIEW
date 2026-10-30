# Tasks — AI Foundation

> Phase: 0 · Phụ thuộc: `daily-loop-core` (cho `AiCall` model + `src/lib/db.ts`), `skill-tree` (cho cây kỹ năng dùng bởi fallback plan)
> Lưu ý: tuân thủ `.kiro/steering/tech.md` + `design-system.md`. Feature này **không có UI riêng** — không tạo route hay component.

## 0. Nền tảng dữ liệu

- [ ] 1. Model `AiCall`
  - [ ] 1.1 Xác nhận model `AiCall` trong `prisma/schema.prisma` khớp SPEC §4 (`feature`, `model`, `inputTokens`, `outputTokens`, `cacheRead`, `cacheWrite`, `estimatedCost`, `ok`, `error`, `createdAt`, `@@index([createdAt])`)
  - [ ] 1.2 Thêm `@@index([feature])` nếu chưa có (cho S15 gom nhóm theo tính năng)
  - [ ] 1.3 Chạy `npx prisma migrate dev --name add_aicall_feature_index`
  - [ ] 1.4 Xác nhận `src/lib/db.ts` export singleton `prisma` (dùng cho `logAiCall`)
- [ ] 2. Hằng số cấu hình
  - [ ] 2.1 Thêm `SLOT_COUNT = 6` và `SLOT_DOMAINS` (professional, communication, language, language, personal, personal) vào `src/lib/config.ts`
  - [ ] 2.2 Xác nhận `PLAN_FALLBACK_SOURCE = "fallback"` trong `src/lib/config.ts`
  - [ ] 2.3 Unit test: `SLOT_DOMAINS.length === SLOT_COUNT` và domain của từng slot khớp SPEC §2.1

## 1. Prompt & schema (`src/lib/prompts.ts`)

- [ ] 3. Tạo `src/lib/prompts.ts` — phần system prompt
  - [ ] 3.1 Khai báo type `Domain` và `RubricId`
  - [ ] 3.2 Khai báo hằng `STABLE_SYSTEM` — chỉ chứa luật lệ, **không** chứa ngày/UUID/`Date.now()`/`aiTone`/tên người dùng
  - [ ] 3.3 Khai báo `RUBRIC_COMMUNICATION` (5 tiêu chí) — copy nguyên văn SPEC §5.4
  - [ ] 3.4 Khai báo `RUBRIC_TECHNICAL` (5 tiêu chí) — copy nguyên văn SPEC §5.4
  - [ ] 3.5 Khai báo `RUBRIC_BEHAVIORAL` (4 tiêu chí) — copy nguyên văn SPEC §5.4
  - [ ] 3.6 Khai báo `RUBRIC_LANGUAGE_ERRORS` (4 nhóm) — copy nguyên văn SPEC §5.4
  - [ ] 3.7 Khai báo `RUBRICS: Record<RubricId, readonly RubricCriterion[]>` gom 4 bộ
- [ ] 4. Hàm dựng system blocks + cache_control
  - [ ] 4.1 Viết `getRubricBlock(rubric: RubricId): Anthropic.TextBlockParam` — block có `cache_control: { type: "ephemeral" }`
  - [ ] 4.2 Viết `buildSystemBlocks(rubric?: RubricId): Anthropic.TextBlockParam[]` — `[STABLE_SYSTEM, RUBRIC(cache)]`; khi không có rubric thì breakpoint nằm trên block cuối
  - [ ] 4.3 Thêm comment cảnh báo: không thêm block nào sau breakpoint, không chèn dữ liệu biến động vào system
  - [ ] 4.4 Unit test: block cuối của `buildSystemBlocks()` luôn có `cache_control.type === "ephemeral"`
  - [ ] 4.5 Unit test: `getRubricBlock("communication")` chứa đủ 5 key tiêu chí
- [ ] 5. Zod schema — kế hoạch 6 slot
  - [ ] 5.1 Khai báo `PlanSlotSchema` (slot 0..5, domain enum, action, detail ≤120, minutes 5..90, skillName nullable)
  - [ ] 5.2 Khai báo `PlanSchema` với `slots` đúng `.length(6)`
  - [ ] 5.3 Viết `buildPlanSchema(opts?: { slotDomains?: readonly Domain[] })` — refine domain của từng slot khớp `SLOT_DOMAINS`
  - [ ] 5.4 Unit test: payload đủ 6 slot đúng domain → parse thành công
  - [ ] 5.5 Unit test: payload đổi domain của slot 1 → parse thất bại
- [ ] 6. Zod schema — rubric & điểm
  - [ ] 6.1 Viết `buildRubricSchema(rubric: RubricId)` — `z.enum` trên `key` để chặn tiêu chí ngoài rubric
  - [ ] 6.2 Khai báo `RubricSchema` (communication), `TechnicalRubricSchema`, `BehavioralRubricSchema`
  - [ ] 6.3 Viết `averageRubric(criteria)` — trung bình, làm tròn 2 chữ số; không có `totalScore` trong schema
  - [ ] 6.4 Unit test: schema communication đúng 5 tiêu chí, score 0..5, key lạ bị từ chối
  - [ ] 6.5 Unit test: `averageRubric` đúng trung bình (vd [4,4,4,4,4] → 4; [5,4,3,2,1] → 3)
- [ ] 7. Zod schema — các structured output còn lại
  - [ ] 7.1 Khai báo `JournalFeedbackSchema` (summary + đúng 1 question)
  - [ ] 7.2 Khai báo `LanguageErrorSchema` (4 nhóm grammar/vocab/expression/context + correctedText)
  - [ ] 7.3 Khai báo `LevelSchema` (level, cefr, confidence, reasoning, weakItems, nextDrill)
  - [ ] 7.4 Khai báo `MockInterviewScoreSchema` (5 tiêu chí + đúng 3 strengths + đúng 3 weaknesses)
  - [ ] 7.5 Khai báo `TestBlueprintSchema` + `TEST_ITEM_TYPES` (6 dạng item)
  - [ ] 7.6 Unit test: mỗi schema parse đúng payload mẫu; thiếu field bắt buộc → fail
- [ ] 8. Guard nội dung biến động
  - [ ] 8.1 Viết test quét `STABLE_SYSTEM` không chứa pattern ISO date, UUID, `Date.now()`, `new Date`, `aiTone`
  - [ ] 8.2 Viết test quét cả 4 khối rubric không chứa các pattern trên
  - [ ] 8.3 Viết test snapshot hash của `STABLE_SYSTEM` để phát hiện thay đổi ngoài ý muốn (phá cache)

## 2. AI layer (`src/lib/anthropic.ts`)

- [ ] 9. Client singleton & bảng routing
  - [ ] 9.1 Cài `@anthropic-ai/sdk` (bản có `helpers/zod`) + `zod` nếu chưa có
  - [ ] 9.2 Khai báo type `AIFeatureCode` (16 mã `AI-01`..`AI-16`) và `AIModel`, `Effort`
  - [ ] 9.3 Khai báo `AI_ROUTES: Record<AIFeatureCode, AIRoute>` — copy đủ 16 dòng từ bảng routing SPEC §5.1 (model, streaming, effort, feature slug, structured)
  - [ ] 9.4 Khai báo `PRICING` cho 2 model (opus $5/$25, haiku $1/$5) + `cacheWriteMultiplier: 1.25`, `cacheReadMultiplier: 0.1`
  - [ ] 9.5 Khai báo `CACHE_MIN_TOKENS` (opus-5: 512, haiku-4-5: 4096)
  - [ ] 9.6 Viết `getApiKey()`, `isAiAvailable()`, `createAnthropicClient(apiKey?)` (maxRetries 0), `getAnthropicClient()` cache singleton
  - [ ] 9.7 Unit test: `AI_ROUTES` có đủ 16 mã; `AI_ROUTES["AI-01"].model === "claude-opus-5"`; `AI_ROUTES["AI-02"].streaming === false`
  - [ ] 9.8 Unit test: `isAiAvailable()` trả false khi `ANTHROPIC_API_KEY` rỗng
- [ ] 10. Exception chain typed
  - [ ] 10.1 Khai báo lớp gốc `AiError` (code, userMessage tiếng Việt, retryable, cause)
  - [ ] 10.2 Khai báo `AiOfflineError`, `AiAuthError`, `AiRateLimitError` (kèm `retryAfterMs`)
  - [ ] 10.3 Khai báo `AiApiStatusError`, `AiConnectionError`, `AiTimeoutError`
  - [ ] 10.4 Khai báo `AiRefusalError`, `AiSchemaError` (kèm `issues`), `AiMaxTokensError`, `AiStreamInterruptedError`
  - [ ] 10.5 Viết `toAiError(err)` map theo đúng thứ tự: `AuthenticationError → RateLimitError → APIStatusError → APIConnectionError → APIError`
  - [ ] 10.6 Unit test: mock từng loại exception SDK → assert ra đúng class typed tương ứng
  - [ ] 10.7 Unit test: `AiConnectionError` có `cause` chứa "timeout" → `AiTimeoutError`
- [ ] 11. Ghi log `AiCall` & tính chi phí
  - [ ] 11.1 Viết `estimateCost(model, usage)` — công thức theo `PRICING`, làm tròn 6 chữ số thập phân
  - [ ] 11.2 Viết `logAiCall(meta, usage, ok, error)` — insert vào bảng `AiCall`
  - [ ] 11.3 Bọc `logAiCall` trong try/catch riêng — lỗi DB chỉ log server, không ném lên
  - [ ] 11.4 Viết `wrapWithLogging(meta, run)` — thành công ghi `ok:true` + usage; lỗi ghi `ok:false` + mã lỗi rồi ném typed error
  - [ ] 11.5 Unit test `estimateCost`: input 1M token opus-5 → 5.0 USD; output 1M → 25.0 USD
  - [ ] 11.6 Unit test `estimateCost`: cacheRead 1M token opus-5 → 0.5 USD; cacheWrite 1M → 6.25 USD
  - [ ] 11.7 Integration test: `wrapWithLogging` ghi đúng 1 dòng `AiCall` với `ok:true` khi run thành công
  - [ ] 11.8 Integration test: `wrapWithLogging` ghi đúng 1 dòng `AiCall` với `ok:false` + `error` khác rỗng khi run ném lỗi
- [ ] 12. Structured output — `callAIJson`
  - [ ] 12.1 Viết `callAIJson<T>(code, schema, opts)` — guard offline **trước** khi gọi network
  - [ ] 12.2 Truyền `output_config: { effort: route.effort, format: zodOutputFormat(schema) }`
  - [ ] 12.3 Kiểm `stop_reason === "refusal"` **trước khi đọc `content`** → ném `AiRefusalError`
  - [ ] 12.4 Kiểm `stop_reason === "max_tokens"` → ném `AiMaxTokensError`
  - [ ] 12.5 Parse `parsed_output`; thiếu → ném `AiSchemaError`
  - [ ] 12.6 Bọc toàn bộ trong `wrapWithLogging`
  - [ ] 12.7 Unit test (mock SDK): refusal → `AiRefusalError` + `AiCall.ok=false`
  - [ ] 12.8 Unit test (mock SDK): `parsed_output` undefined → `AiSchemaError`
- [ ] 13. Streaming — `streamAI`
  - [ ] 13.1 Viết `streamAI(code, opts)` là `AsyncGenerator<AiStreamEvent>` trên `client.messages.stream()`
  - [ ] 13.2 Yield event `{ type:"text" }`, `{ type:"json" }`, `{ type:"usage" }`
  - [ ] 13.3 Lấy `stop_reason` + `usage` từ `finalMessage()`
  - [ ] 13.4 Ghi `AiCall` trong `finally` — `ok:false, error:"stream_interrupted"` nếu stream ngắt giữa chừng
  - [ ] 13.5 Kiểm `refusal` / `max_tokens` sau khi stream kết thúc
  - [ ] 13.6 Unit test (mock SDK): stream ngắt giữa chừng → `AiCall.ok=false`, không ghi dữ liệu nghiệp vụ
  - [ ] 13.7 Unit test (mock SDK): stream thành công → `AiCall.ok=true` + đủ `cacheRead`/`cacheWrite`

## 3. Offline fallback (`src/lib/plan.ts`)

- [ ] 14. Bộ sinh rule cục bộ
  - [ ] 14.1 Khai báo type `SkillForPlan` (id, name, domain, level, evidenceCount)
  - [ ] 14.2 Khai báo `SLOT_MINUTES` theo khung SPEC §2.1 (30/20/15/20/10/20)
  - [ ] 14.3 Khai báo `DEFAULT_ACTION` cho 4 domain (slot 3 dùng action riêng "Luyện ngoại ngữ chủ động")
  - [ ] 14.4 Viết `prioritizeSkills(skills)` — sort level thấp nhất → evidenceCount ít nhất → id (không mutate input)
  - [ ] 14.5 Viết `dayOffset(date)` — deterministic theo ngày local, không dùng `Math.random()`
  - [ ] 14.6 Viết `generateFallbackPlan(skills, opts?)` — trả **đúng 6** item, domain theo `SLOT_DOMAINS`, tiêu đề = tên kỹ năng, `source:"fallback"`
  - [ ] 14.7 Viết `listSkillsForPlan()` — query `Skill` lấy `level` + đếm `Evidence` rating ≥ 3
  - [ ] 14.8 Unit test: không có kỹ năng nào → vẫn ra 6 slot với `DEFAULT_ACTION`
  - [ ] 14.9 Unit test: 2 ngày liên tiếp ra kỹ năng khác nhau (offset xoay vòng)
  - [ ] 14.10 Unit test: cùng ngày, cùng input → kết quả giống hệt (deterministic)
  - [ ] 14.11 Unit test: `plan.ts` không import `@anthropic-ai/sdk` (chạy được khi không có key)
- [ ] 15. Hợp đồng offline
  - [ ] 15.1 Viết `POST /api/plan/generate` — khi `!isAiAvailable()` trả kế hoạch fallback với `source:"fallback"`
  - [ ] 15.2 Khi gọi AI lỗi `AiOfflineError` → fallback về bộ sinh rule cục bộ
  - [ ] 15.3 Các tính năng AI khác: khi offline trả `{ ok:false, error:{ code:"offline_no_key" } }` — **không** trả nội dung AI giả lập
  - [ ] 15.4 UI (feature khác): ẩn nút AI + hiện hướng dẫn thêm key khi `offline_no_key`

## 4. Kiểm thử & nghiệm thu

- [ ] 16. Unit test tổng hợp
  - [ ] 16.1 Tạo `src/lib/__tests__/logic.test.ts` — routing 16 mã · `estimateCost` · `averageRubric` · `buildPlanSchema` refine · `buildRubricSchema` chặn tiêu chí lạ · `toAiError` · `generateFallbackPlan`
  - [ ] 16.2 Tạo `src/lib/__tests__/anthropic.logging.test.ts` — `wrapWithLogging` ghi đúng 1 dòng `AiCall` (ok / ok=false)
  - [ ] 16.3 Tạo `src/lib/__tests__/prompts.test.ts` — `buildSystemBlocks` block cuối có `cache_control` + guard nội dung biến động
  - [ ] 16.4 Tạo `src/lib/__tests__/plan.test.ts` — fallback plan: 6 slot, đúng domain, deterministic, xoay vòng theo ngày
  - [ ] 16.5 Chạy `npx vitest run` — toàn bộ test xanh
- [ ] 17. Test cache (AC-5) — phát hiện silent cache invalidator
  - [ ] 17.1 Tạo `src/lib/__tests__/cache.test.ts` — gọi 2 lần cùng system prompt, assert `cacheRead > 0` ở call thứ 2 (dùng `Anthropic.Messages.prototype` để spy)
  - [ ] 17.2 Test skip tự động khi không có `ANTHROPIC_API_KEY`
  - [ ] 17.3 Test preflight độ dài prefix bằng `messages.countTokens` ≥ `CACHE_MIN_TOKENS["claude-haiku-4-5"]`
  - [ ] 17.4 Test guard `STABLE_SYSTEM` không chứa dữ liệu biến động
  - [ ] 17.5 Chạy test có key thật 1 lần → xác nhận `cache_read_input_tokens > 0`, ghi lại kết quả vào PR description
- [ ] 18. Test nghiệm thu AC-7 / AC-8
  - [ ] 18.1 Tạo `src/lib/__tests__/acceptance.test.ts` — AC-7 offline sinh đủ 6 slot, `source:"fallback"`
  - [ ] 18.2 Test AC-7: `callAIJson` ném `AiOfflineError` khi thiếu key và **không** gọi network (spy `messages.parse`)
  - [ ] 18.3 Test AC-8: mock `stop_reason:"refusal"` → `AiRefusalError` + `AiCall{ok:false}` + không đọc `content`
  - [ ] 18.4 Test AC-8: mọi nhánh lỗi đều tạo đúng 1 dòng `AiCall` với `ok=false`
- [ ] 19. E2E
  - [ ] 19.1 Viết `e2e/offline.spec.ts` — bỏ `ANTHROPIC_API_KEY`, mở `/`, bấm "Lập kế hoạch hôm nay" → hiện 6 hành động, ghi được vào DB
  - [ ] 19.2 Viết `e2e/ai-error.spec.ts` — mock API trả refusal → hiện thông báo thân thiện, trang không crash
  - [ ] 19.3 Chạy `npx playwright test` — xanh
- [ ] 20. Kiểm tra bắt buộc
  - [ ] 20.1 Grep xác nhận không có import `@anthropic-ai/sdk` ngoài `src/lib/anthropic.ts` (ngoại lệ: file test)
  - [ ] 20.2 Grep xác nhận không có file nào trong `src/` tự ghi bảng `AiCall` (chỉ `logAiCall` được phép)
  - [ ] 20.3 Xác nhận không có `any` trong `src/lib/anthropic.ts`, `src/lib/prompts.ts`, `src/lib/plan.ts` (`npx tsc --noEmit`)
  - [ ] 20.4 Xác nhận `ANTHROPIC_API_KEY` không bị log ra console và không hiển thị đầy đủ ở UI
  - [ ] 20.5 Rà soát `PRICING` với giá model hiện tại và ghi chú nguồn trong comment

## 6. Ngữ cảnh người dùng trong prompt (Q1–Q4, Q8)

- [ ] 6.1 Tạo `src/lib/user-context.ts` — `buildUserContext(profile, skills, evidenceStats, stage, goals)` trả object phẳng, **không** chứa deadline
- [ ] 6.2 Context gồm: nghề `Java Backend Developer` · cây kỹ năng đang luyện · `{en:A1, zh:zero, vi:B2}` · chuẩn `cefr|hsk|both` · `currentStage` + `stageCriteria` · `recentVelocity` · `UpcomingGoal` đang active
- [ ] 6.3 Ghi chú bắt buộc trong context: `"Tiếng Việt là bản ngữ — không chấm ngữ pháp vi"`
- [ ] 6.4 Mọi call AI (AI-01..AI-16) phải chèn context vào `messages`, **không** vào `system`
- [ ] 6.5 `STABLE_SYSTEM` **không** chứa: tên người dùng, nghề, trình độ, ngày tháng, UUID, `Date.now()`
- [ ] 6.6 Unit test: context không chứa chuỗi deadline
- [ ] 6.7 Unit test: `STABLE_SYSTEM` không chứa `Java Backend` / `A1` / `2026-`
- [ ] 6.8 Test: 2 call liên tiếp cùng feature → `cache_read_input_tokens > 0` (AC-5) — context biến động **không** phá cache
