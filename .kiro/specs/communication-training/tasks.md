# Tasks — Luyện Giao Tiếp & Luyện Ngoại Ngữ Chủ Động

> Phase: 1 (S07, S08) + Phase 2 (S11) · Phụ thuộc: `ai-foundation`, `skill-tree-evidence`, `srs-language-review`
> Lưu ý: tuân thủ `.kiro/steering/tech.md` (AI layer, prompt caching, structured output) + `.kiro/steering/design-system.md` (token, shape).
> Thứ tự: làm **Phase 1 (S07 → S08)** trước; **Phase 2 (S11)** chỉ bắt đầu sau khi Phase 1 nghiệm thu xong.

## 0. Nền tảng dữ liệu

- [ ] 1. Model Prisma cho kho bài luyện & lịch sử chấm
  - [ ] 1.1 Thêm model `SpeakPrompt` vào `prisma/schema.prisma` (`code` unique, `title`, `prompt`, `level`, `lang`, `mode`, `tags` JSON string, `isUserMade` Boolean default false)
  - [ ] 1.2 Thêm `@@index([level, lang, mode])` cho `SpeakPrompt`
  - [ ] 1.3 Thêm model `SpeakAttempt` (`activityId` **@unique**, `promptId` nullable + `onDelete: SetNull`, `mode`, `content`, `rubric` Json, `totalScore` Float, `delta` Json?, `speechMeta` Json?)
  - [ ] 1.4 Thêm `@@index([mode, createdAt])` cho `SpeakAttempt`
  - [ ] 1.5 Thêm 3 quan hệ 1–1 ngược trên `Activity`: `speakAttempt SpeakAttempt?`, `roleplaySession RoleplaySession?`, `languagePractice LanguagePractice?` (đều `onDelete: Cascade`)
  - [ ] 1.6 Chạy `npx prisma migrate dev --name feat_communication_training` và xác nhận seed cũ không hỏng
- [ ] 2. Model Prisma cho role-play (FR-CM-05, FR-CM-06)
  - [ ] 2.1 Thêm model `RoleplayScenario` (`code` unique, `title`, `brief`, `hiddenGoal` String?, `lang`, `level`, `durationSec` Int default 60, `tags` JSON string)
  - [ ] 2.2 Thêm model `RoleplaySession` (`scenarioId`, `status` default "active", `goalScore` Int?, `goalNote` String?, `transcript` Json default "[]", `activityId` String? @unique)
  - [ ] 2.3 Thêm model `RoleplayTurn` (`sessionId`, `index`, `speaker`, `text`) + `@@index([sessionId, index])`
  - [ ] 2.4 Thêm `@@index([status, startedAt])` cho `RoleplaySession`
- [ ] 3. Model Prisma cho luyện ngoại ngữ chủ động (S11)
  - [ ] 3.1 Thêm model `LanguagePractice` (`activityId` @unique, `lang`, `level`, `prompt`, `input`, `corrected` String?, `errorGroups` Json, `keywords` Json default "[]", `score` Float?)
  - [ ] 3.2 Thêm model `PracticeCard` (`practiceId`, `cardId` String?, `front`, `back`, `note` String?, `example` String?) + `@@index([practiceId])`
- [ ] 4. Seed kho bài luyện & tình huống
  - [x] 4.1 Tạo `prisma/seed-data/speak-prompts.ts` — **12 bài mẫu** `EX-01`..`EX-12` đúng bảng §6.8 của `spec.md` (8 en + 4 vi; level A1–C1; `isUserMade=false`)
  - [x] 4.2 Tạo `prisma/seed-data/roleplay-scenarios.ts` — **6 tình huống** `SP-01`, `SP-03`, `SP-05`, `SP-09`, `SP-12`, `SP-15` đúng bảng §6.9, **có** `hiddenGoal` cho từng tình huống
  - [ ] 4.3 Tạo `prisma/seed-data/language-prompts.ts` — ít nhất 12 đề luyện viết ngoại ngữ (zh/en) kèm `keywords` bắt buộc và `grammarTip`
  - [x] 4.4 Nối 3 bộ seed vào `prisma/seed.ts` (dùng `upsert` theo `code` để seed idempotent)
  - [ ] 4.5 Seed kỹ năng cây: 3 node `communication` — "Viết", "Nói", "Hội thoại" (nếu chưa có) + 2 node `language` "Tiếng Trung", "Tiếng Anh"
  - [ ] 4.6 Chạy `npx prisma db seed` và xác nhận có đúng 12 `SpeakPrompt` + 6 `RoleplayScenario`
- [ ] 5. Module chấm điểm dùng chung (`src/lib/grading.ts`)
  - [x] 5.1 Khai báo type `RubricKey`, `RubricCriterion`, `RubricResult`, `RubricDelta`
  - [x] 5.2 `computeTotal(criteria)` — trung bình, làm tròn 1 chữ số; `[]` → `0` (không `NaN`)
  - [x] 5.3 `computeDelta(current, previous, opts)` — chưa có lần trước → `total: null`; thiêu tiêu chí → `null`; total tính trên tập giao; `levelMismatch`
  - [ ] 5.4 `ratingFromScore(total)` — `≥4→4`, `≥3→3`, `≥2→2`, còn lại `1`
  - [ ] 5.5 `validateGradingInput(input)` — `too_short` (< 20 từ viết / < 15 từ nói), `empty_transcript`, `invalid_level`, `invalid_lang`
  - [ ] 5.6 `buildGradeUserMessage(input)` — đưa bài viết / transcript / speechMeta / level / lang vào **messages**; **không** có `Date.now()`/UUID
  - [ ] 5.7 `buildSpeechMeta({transcript, durationSec})` — `wordsPerMinute`, `fillerWords[]`, `pauses[]`; transcript < 15 từ → `wordsPerMinute = 0`
  - [ ] 5.8 `findPreviousAttempt({mode, promptId})` — lấy attempt gần nhất, include `activity.skillId`
  - [ ] 5.9 `listSpeakPrompts(filters)` + `listSpeakAttempts(filters)`
  - [ ] 5.10 Unit test cho 5.2–5.7 (biên điểm, thiếu tiêu chí, wpm = 0, không có `Date.now()`)
- [ ] 6. Module ngôn ngữ (`src/lib/language.ts`)
  - [ ] 6.1 `buildLanguageCorrectMessage(input)` — đề, bài viết, từ khoá, `lang`, `level` vào messages
  - [ ] 6.2 `buildCardsMessage(input)` — danh sách lỗi đã phân loại + `maxCards` vào messages
  - [ ] 6.3 `extractKeywords(text, lang)` — lọc stopword, giữ nguyên hanzi, giữ thứ tự xuất hiện
  - [ ] 6.4 `cardExists(lang, front)` — check trùng
  - [ ] 6.5 `addKeywordToDeck({keyword, lang, meaning})` — tạo `Card` mode "produce", `due = now + 12h`, idempotent (trùng → `duplicated: true`)
  - [ ] 6.6 `createCardsFromPractice({cards, lang, practiceId, maxCards})` — bỏ qua thẻ trùng, tạo `Card` + `PracticeCard`, giới hạn `maxCards`
  - [ ] 6.7 Unit test: trùng thẻ, `maxCards=2` với 3 thẻ → chỉ tạo 2, `due` ≈ +12h

## 1. AI layer — prompt & schema

- [ ] 7. Rubric & system prompt (`src/lib/prompts.ts`)
  - [ ] 7.1 Thêm `RUBRIC_COMMUNICATION` — 5 tiêu chí `clarity`/`structure`/`tone`/`natural`/`grammar` với `key`/`name`/`desc` đúng SPEC §5.4
  - [ ] 7.2 Thêm `RUBRIC_LANGUAGE_ERRORS` — 4 nhóm `grammar`/`vocab`/`expression`/`context`
  - [ ] 7.3 Thêm `RUBRIC_COMMUNICATION_BLOCK` + `RUBRIC_LANGUAGE_ERRORS_BLOCK` (hằng số, **không** chứa nội dung biến động)
  - [ ] 7.4 Thêm `GRADING_SYSTEM` (P4: cấm tự thêm tiêu chí, mỗi tiêu chí 1 nhận xét + 1 đề xuất sửa, thang 0–5)
  - [ ] 7.5 Thêm `SPEECH_NOTE_BLOCK` (wpm, filler, pauses, clarityNote — **không** tạo tiêu chí thứ 6)
  - [ ] 7.6 Thêm `ROLEPLAY_SYSTEM` (đúng ngôn ngữ đề, theo level, không lộ mục tiêu ẩn)
  - [ ] 7.7 Thêm `GOAL_EVALUATION_SYSTEM` (chấm mục tiêu ẩn 0–5 + trích dẫn bằng chứng)
  - [ ] 7.8 Thêm `LANGUAGE_CORRECT_SYSTEM` (4 nhóm, không nhóm thứ 5) + `FLASHCARD_SYSTEM` (≤ 2 thẻ)
  - [ ] 7.9 Unit test: `buildGradeUserMessage` / `buildLanguageCorrectMessage` không chứa `Date.now()` hay UUID (bảo toàn cache)
- [ ] 8. Zod schema (`src/lib/prompts.ts`)
  - [ ] 8.1 `GradeSchema` — `criteria` `.length(5)` + `key: z.enum([...5])` + `score` int 0–5 + `comment` + `fix`; `speechNotes` nullable
  - [ ] 8.2 `LanguageCorrectSchema` — `groups` `.length(4)` + `key: z.enum([...4])`; item có `original`/`corrected`/`reason`/`severity`; `correctedText`/`pinyin`/`explanation`
  - [ ] 8.3 `RoleplayTurnSchema`, `GoalEvaluationSchema` (score 0–5 + `evidence` min 1), `FlashcardsSchema` (max 2)
  - [ ] 8.4 `GradeBodySchema`, `RoleplayBodySchema`, `LanguageCorrectBodySchema`, `LanguageCardsBodySchema`, `CreatePromptSchema`
  - [ ] 8.5 Unit test: `GradeSchema.safeParse` reject khi AI trả 6 tiêu chí hoặc tiêu chí ngoài enum

## 2. API

- [ ] 9. `POST /api/grade` (AI-03 viết / AI-04 nói — streaming NDJSON)
  - [x] 9.1 Validate body bằng `GradeBodySchema` → 400 `{ ok:false, error:"invalid_body" }`
  - [x] 9.2 Thiếu `ANTHROPIC_API_KEY` → 503 `{ ok:false, error:"no_api_key" }`
  - [ ] 9.3 `validateGradingInput` → 422 `too_short` / `empty_transcript`; 400 `invalid_level`/`invalid_lang`
  - [ ] 9.4 Gọi `findPreviousAttempt` để tính delta
  - [ ] 9.5 `callAIStream` với `model:"claude-opus-5"`, `effort:"medium"`, `system:[GRADING_SYSTEM, RUBRIC_COMMUNICATION_BLOCK + cache_control]` (+ `SPEECH_NOTE_BLOCK` khi mode=speak)
  - [ ] 9.6 `messages` chỉ chứa `buildGradeUserMessage(...)` (biến động nằm sau breakpoint cache)
  - [x] 9.7 Parse `GradeSchema` → `criteria`; **server tự tính** `total = computeTotal(criteria)` (không tin `total` của AI)
  - [ ] 9.8 `computeDelta` với attempt trước → `delta`
  - [ ] 9.9 Trong `prisma.$transaction`: tạo `Activity {domain:"communication", type: mode==="write"?"write":"speak", skillId, minutes, content, aiScore: total}` + `Evidence {rating: ratingFromScore(total)}` + `SpeakAttempt {rubric, totalScore, delta, speechMeta}`
  - [ ] 9.10 Stream NDJSON: `meta` → `criterion`×5 → `delta` → `done {total, activityId, attemptId}`
  - [ ] 9.11 Chỉ ghi `Activity` khi nhận **đủ 5** tiêu chí; thiếu → 502 `{ok:false,error:"invalid_rubric"}` + `AiCall{ok:false}`
  - [ ] 9.12 Kiểm tra `usage.cache_read_input_tokens > 0` ở lần gọi thứ 2 (AC-5 liên quan)
  - [ ] 9.13 Test: 400 · 422 quá ngắn · 422 transcript rỗng · 503 no key · 409 already_grading · 502 rubric sai · 200 happy path
- [ ] 10. `POST /api/roleplay` (AI-08 — streaming NDJSON, 2 task)
  - [x] 10.1 Validate body bằng `RoleplayBodySchema`; `scenarioId` không tồn tại → 404 `scenario_not_found`
  - [x] 10.2 Thiếu API key → 503 `no_api_key`
  - [ ] 10.3 Task `next_turn`: `buildRoleplayUserMessage` **KHÔNG** chứa `hiddenGoal` — unit test assert
  - [ ] 10.4 Task `next_turn`: `callAIStream` `claude-opus-5`, `effort:"medium"`, `system:[ROLEPLAY_SYSTEM + cache_control]`, parse `RoleplayTurnSchema`
  - [x] 10.5 Task `goal_evaluation`: `buildGoalEvaluationMessage` **CÓ** `hiddenGoal`; parse `GoalEvaluationSchema`
  - [ ] 10.6 Lưu `RoleplayTurn` vào DB sau mỗi lượt; cập nhật `RoleplaySession.transcript`
  - [ ] 10.7 Khi `action=goal_evaluation`: tạo `Activity {domain:"communication", type:"roleplay"}` + `Evidence {rating: ratingFromScore(goalScore)}` + `session.status="done"`
  - [ ] 10.8 Phiên chưa đóng → 409 `session_closed` khi gọi lại sau khi `done`
  - [ ] 10.9 Test: task `next_turn` không chứa goal · `goal_evaluation` có goal · 404 · 503 · 409
- [ ] 11. `POST /api/language/correct` (AI-09 — streaming NDJSON)
  - [ ] 11.1 Validate body bằng `LanguageCorrectBodySchema`; input < 5 ký tự Hanzi (zh) hoặc < 3 từ (en) → 422 `too_short`
  - [ ] 11.2 Thiếu API key → 503 `no_api_key`
  - [ ] 11.3 `callAIStream` `claude-opus-5`, `effort:"medium"`, `system:[LANGUAGE_CORRECT_SYSTEM, RUBRIC_LANGUAGE_ERRORS_BLOCK + cache_control]`
  - [ ] 11.4 Parse `LanguageCorrectSchema` → `groups` đúng 4 nhóm; thiếu/thêm nhóm → 502 `invalid_error_groups`
  - [x] 11.5 Tạo `Activity {domain:"language", type:"write", aiScore}` + `LanguagePractice {input, corrected, errorGroups, keywords}` — **chưa** tạo `Evidence`
  - [ ] 11.6 Stream NDJSON: `group`×4 → `corrected` → `done {score, practiceId}`
  - [ ] 11.7 Test: 422 · 503 · 502 nhóm lỗi sai · 200 (4 nhóm đúng)
- [ ] 12. `POST /api/language/cards` (AI-10 — KHÔNG streaming)
  - [ ] 12.1 Validate body bằng `LanguageCardsBodySchema`; `practiceId` không tồn tại → 404 `practice_not_found`
  - [ ] 12.2 Thiếu API key → 503 `no_api_key`
  - [ ] 12.3 `callAI` (không stream) với `model:"claude-haiku-4-5"`, `effort:"low"`, `system:[FLASHCARD_SYSTEM + cache_control]`, parse `FlashcardsSchema`
  - [ ] 12.4 `createCardsFromPractice` — bỏ qua thẻ trùng `front`+`lang`, giới hạn `maxCards=2`
  - [ ] 12.5 Thẻ mới: `mode="produce"`, `group="ai-from-practice"`, `due = now + 12h`, `cardState = initialFsrsState()`
  - [ ] 12.6 Tạo `PracticeCard` liên kết → `Card`
  - [ ] 12.7 Response `{ok:true, data:{cards, cardIds}}` + `dueAt` để UI hiện "Lịch ôn kế tiếp: Sau 12 giờ"
  - [ ] 12.8 Test: 404 · 503 · AI trả 0 thẻ → `cards: []` không 500 · thẻ trùng bị bỏ qua
- [ ] 13. `GET /api/speak/prompts`
  - [x] 13.1 Query params: `level`, `lang`, `mode`, `q` — validate, giá trị lạ → 400
  - [x] 13.2 `mode` lọc cả `mode=both`; `q` tìm trong `title` + `prompt`
  - [ ] 13.3 Sắp xếp `isUserMade asc`, `code asc` → 12 bài mẫu trước, bài tự tạo sau
  - [ ] 13.4 Test: không filter → đủ 12 bài mẫu; filter `level=B2` → đúng số; `q` trả kết quả khớp
- [ ] 14. `POST /api/speak/prompts` (tạo bài tự tạo — FR-CM-08)
  - [ ] 14.1 Validate body bằng `CreatePromptSchema`
  - [ ] 14.2 `title` trùng → 409 `duplicate_title`
  - [ ] 14.3 Tạo `SpeakPrompt` với `code = "CUS-" + random 4 ký tự`, `isUserMade = true`
  - [ ] 14.4 **Không** gọi AI sinh nội dung (R6) — chỉ lưu nguyên văn người dùng gõ
  - [ ] 14.5 Test: 201 tạo ok · 400 thiếu title · 409 trùng title
- [ ] 15. `GET /api/speak/history`
  - [x] 15.1 Query params `limit` (mặc định 20, tối đa 100), `mode`, `promptId` — `limit` sai → 400
  - [ ] 15.2 Trả `attempts[]` kèm `prompt.code`, `prompt.title`, `activity.aiScore`, `activity.skillId`, `rubric`, `delta`
  - [ ] 15.3 Test: giới hạn limit · lọc mode · lọc promptId
- [ ] 16. Endpoint commit Evidence
  - [ ] 16.1 `POST /api/speak/commit` nhận `{ attemptId, skillId }` → `commitEvidence` (idempotent theo `activityId`)
  - [x] 16.2 Bấm 2 lần → vẫn **1** `Evidence` (AC-CM-5)
  - [ ] 16.3 `rating` lấy từ `ratingFromScore(totalScore)`, không nhận từ client

## 3. UI — S07 Luyện giao tiếp (Viết)

- [x] 17. Route `src/app/speak/write/page.tsx` (Server Component)
  - [ ] 17.1 Đọc `searchParams.level` (mặc định `B2`), `searchParams.lang` (mặc định `en`), `searchParams.prompt`
  - [ ] 17.2 Gọi song song `listSpeakPrompts(...)` + `findPreviousAttempt({mode:"write"})`
  - [ ] 17.3 Render `<WriteConsole>` với `hasApiKey={!!process.env.ANTHROPIC_API_KEY}` và `skillId` của node "Giao tiếp → Viết"
- [ ] 18. Component `src/components/speak/write-console.tsx` (Client)
  - [x] 18.1 Mode switcher 3 chế độ: Viết / Nói / Hội thoại AI → link `/speak/write` · `/speak/talk` · `/language/practice?tab=roleplay`
  - [ ] 18.2 Card đề bài: tiêu đề + chip ngôn ngữ + 5 chip CEFR (active `bg-primary-container text-on-primary`)
  - [ ] 18.3 Editor toolbar 4 nút `format_bold` / `format_italic` / `format_quote` / `format_list_bulleted`; `Ctrl+B` / `Ctrl+I`
  - [ ] 18.4 Đếm từ realtime bằng `font-code-md text-primary`; < 20 từ → màu `text-tertiary`
  - [ ] 18.5 Auto-save nháp (debounce 800ms) + nút `save Lưu bản nháp` + dòng "Đã tự động lưu nháp lúc HH:MM"
  - [ ] 18.6 Nút `bolt Chấm bằng AI (Claude Opus 5)` + chip `Ctrl + Enter`; disable khi đang stream
  - [ ] 18.7 Đọc NDJSON bằng `readNdjson` → cập nhật `criteria` / `total` / `delta` theo từng event
  - [ ] 18.8 Tiêu chí chưa về hiện **skeleton**, không hiện 0 điểm
  - [ ] 18.9 `aria-live="polite"` trên vùng rubric khi có tiêu chí mới
  - [ ] 18.10 Lỗi API → banner `bg-error/10 text-error` + nút "Thử lại"; **không** mất nội dung đã gõ
  - [ ] 18.11 Không API key → ẩn nút chấm, hiện "Bật chấm AI bằng cách thêm API key trong Cài đặt"
  - [ ] 18.12 Input < 20 từ → chặn, hiện "Bài quá ngắn (cần ≥ 20 từ) để chấm có nghĩa", không gọi API
- [ ] 19. Component `src/components/speak/rubric-panel.tsx` (dùng chung S07/S08)
  - [ ] 19.1 Vòng tròn radial điểm tổng (`text-primary`, `stroke-dasharray` theo `total/5`) + số `font-headline-lg`
  - [ ] 19.2 Badge level (vd "B2 Ready") + chip "Đạt chuẩn giao tiếp"
  - [x] 19.3 Delta tổng: `▲ +0.4` `text-primary` / `▼ -0.3` `text-error`; **luôn** kèm text thay thế (không chỉ màu)
  - [x] 19.4 `delta.total === null` → hiện "Chưa có lần trước để so sánh" (không `▲ 0.0`)
  - [ ] 19.5 `delta.levelMismatch` → cảnh báo "So sánh giữa 2 level khác nhau"
  - [x] 19.6 5 card tiêu chí: điểm `font-code-md`, nhãn mức (Xuất sắc/Tốt/Khá/Yếu/Rất yếu/Chưa có), 1 câu nhận xét, 1 đề xuất sửa
  - [x] 19.7 Màu điểm: ≥4 `text-primary`, =3 `text-tertiary`, ≤2 `text-error`
  - [ ] 19.8 Icon theo mức: `check_circle` / `info` / `tune` / `close`
  - [ ] 19.9 Khối `speechNotes` (chỉ S08): wpm, filler words, pauses, `clarityNote`
- [ ] 20. Component `src/components/speak/suggestion-card.tsx`
  - [ ] 20.1 Bản gốc: `text-error/90 line-through font-code-md`; bản đề xuất: `text-primary font-semibold font-code-md`
  - [ ] 20.2 Dòng lý do `body-sm text-on-surface-variant` + icon `auto_fix_high`
  - [ ] 20.3 Nút "Xem tất cả đề xuất" mở modal danh sách (5 tiêu chí × 1 đề xuất)
- [ ] 21. Component `src/components/speak/prompt-library.tsx`
  - [ ] 21.1 Lưới thẻ bài: `bg-surface-container hover:bg-surface-container-high rounded-lg`; chip level theo màu domain
  - [ ] 21.2 Bộ lọc level + ngôn ngữ + mode (client-side trên data đã tải)
  - [ ] 21.3 Chip "12 đề mẫu" + badge "Theo lộ trình Tech Lead / Senior"
  - [ ] 21.4 Bài tự tạo: nút `add_circle Tạo bài tự tạo` → form (title, prompt, level, lang) → `POST /api/speak/prompts`; validate client và hiện lỗi 409 `duplicate_title` bằng thông báo tiếng Việt
  - [ ] 21.5 Click thẻ bài → nạp `prompt` + `level` + `lang` vào editor
- [ ] 22. Component `src/components/speak/evidence-commit.tsx`
  - [ ] 22.1 Panel: tên node kỹ năng + `Rating: N / 4` + mã định danh phiên + số từ + thời gian chấm
  - [ ] 22.2 Nút `verified Chấp nhận & Cập nhật Cây kỹ năng` → `POST /api/speak/commit`
  - [ ] 22.3 Sau khi commit: nút đổi `done_all Đã nạp vào Cây kỹ năng` + `bg-primary`; bấm lại không tạo bằng chứng thứ 2
  - [ ] 22.4 Nút "Chỉnh sửa thêm" → mở lại editor, giữ nguyên kết quả chấm

## 4. UI — S08 Luyện giao tiếp (Nói)

- [x] 23. Route `src/app/speak/talk/page.tsx` (Server Component)
  - [ ] 23.1 Gọi `listSpeakPrompts({mode:"speak"})` + tải 6 `RoleplayScenario` cho kho drill
  - [ ] 23.2 Render `<TalkConsole>` với `hasApiKey` + `skillId` node "Giao tiếp → Nói"
- [ ] 24. Hook `src/components/speech/use-recorder.ts`
  - [x] 24.1 `start()` → `getUserMedia({audio:{channelCount:1, echoCancellation:true, noiseSuppression:true}})` → `new MediaRecorder(stream, {mimeType})` với mimeType fallback `audio/webm;codecs=opus` → `audio/webm` → `audio/mp4`
  - [ ] 24.2 `rec.start(250)` để có chunk cho waveform
  - [ ] 24.3 `pause()` / `resume()` / `stop()` / `reset()` (reset xoá blob + transcript)
  - [ ] 24.4 `maxDurationSec` → tự `stop()` + `onAutoStop()`
  - [ ] 24.5 `NotAllowedError` → `state="denied"`, `error="permission_denied"`; `NotFoundError` → `error="no_device"`
  - [ ] 24.6 `navigator.mediaDevices` undefined → `state="unsupported"`
  - [ ] 24.7 Cleanup khi unmount: `stream.getTracks().forEach(t => t.stop())`
- [ ] 25. Hook `src/components/speech/use-speech-recognition.ts`
  - [ ] 25.1 `window.SpeechRecognition ?? window.webkitSpeechRecognition`; undefined → `status="unsupported"`
  - [ ] 25.2 `lang` theo `en-US` / `vi-VN` / `zh-CN`; `continuous=true`, `interimResults=true`
  - [ ] 25.3 Tách `interim` (hiển thị mờ `text-outline`) và `finalText` (đã chốt `text-on-surface`)
  - [ ] 25.4 `onend` tự `start()` lại khi đang `listening` (Chrome dừng sau ~60s)
  - [ ] 25.5 `onerror`: `not-allowed` → `status="denied"`; `network` → `error="network"`, giữ `finalText`
  - [ ] 25.6 `wordCount` tính từ `finalText`
- [ ] 26. Hook `src/components/speech/use-audio-level.ts`
  - [ ] 26.1 `AudioContext` + `AnalyserNode` (`fftSize=2048`) gắn vào `MediaStream`
  - [ ] 26.2 `peakDb()` → `20 * log10(max|v|)`; hiển thị "Peak: -2.8 dBFS"
  - [ ] 26.3 `close()` khi dừng ghi / unmount
- [ ] 27. Component `src/components/speak/talk-console.tsx` (Client)
  - [ ] 27.1 Challenge brief: chip "Thực chiến …", chip target level, `font-headline-md` tiêu đề, mô tả mục tiêu, "Giới hạn: N Giây"
  - [ ] 27.2 Cockpit ghi âm: nhãn LIVE RECORDING + sample rate, timer `font-headline-lg font-code-md` dạng `00:48 / 01:00`, waveform SVG, dòng INPUT + peak
  - [ ] 27.3 Nút `pause Tạm dừng` / `play_arrow Tiếp tục` / `refresh Thu lại từ đầu`
  - [ ] 27.4 Nút `neurology Gửi AI Chấm & Phân tích âm vị` + chip `Ctrl + ↵`; disable khi chưa có transcript
  - [ ] 27.5 `Ctrl+Enter` kích hoạt chấm
  - [x] 27.6 `stt.status === "unsupported"` → hiện `textarea` "Nhập transcript thủ công" + ghi chú, nút chấm dùng giá trị textarea
  - [ ] 27.7 `recorder.state === "denied"` → ẩn nút ghi + nút chấm, hiện card hướng dẫn cấp quyền
  - [ ] 27.8 Transcript rỗng → chặn, hiện "Chưa nhận được giọng nói — hãy thử ghi lại", không gọi API
  - [ ] 27.9 Gọi `POST /api/grade` với `mode:"speak"`, `transcript`, `speechMeta` (dùng `buildSpeechMeta`)
  - [ ] 27.10 Dùng `<RubricPanel>` + khối filler words & điểm ngắt nhịp + khuyến nghị huấn luyện viên (`tips_and_updates`)
  - [ ] 27.11 Khối evidence: node kỹ năng + `Rating lưu: 4.2 / 5.0` + nút commit
- [ ] 28. Component `src/components/speak/drill-library.tsx`
  - [ ] 28.1 Bento grid 6 thẻ tình huống (`SP-01`, `SP-03`, `SP-05`, `SP-09`, `SP-12`, `SP-15`)
  - [ ] 28.2 Thẻ active `bg-surface-container-high` + badge "Đang luyện"; thẻ khác `bg-surface-container-low`
  - [ ] 28.3 Mỗi thẻ: mã, thời lượng, tên, mô tả, level, nút `play_arrow Bắt đầu`
  - [ ] 28.4 Nút `tune Bộ lọc tình huống` → filter theo level / thời lượng / chủ đề
  - [ ] 28.5 Click thẻ → nạp challenge brief và đặt `maxDurationSec` của recorder
- [ ] 29. Khối bảng điểm S08
  - [ ] 29.1 Banner tổng điểm `4.2 / 5.0` + delta `+0.3` (dùng chung `RubricPanel`)
  - [x] 29.2 5 tiêu chí **cùng key** với S07, hiển thị nhãn tiếng Việt (Rõ ràng & Tốc độ nói · Cấu trúc & Logic · Giọng văn & Sự tự tin · Tự nhiên & Ngữ điệu · Phát âm kỹ thuật) nhưng `key` nội bộ vẫn là 5 key rubric chuẩn
  - [ ] 29.3 Khối `equalizer` đếm filler words + `info` điểm ngắt nhịp + `tips_and_updates` khuyến nghị

## 5. UI — S11 Luyện ngoại ngữ chủ động

- [ ] 30. Route `src/app/language/practice/page.tsx` (Server Component)
  - [ ] 30.1 Đọc `searchParams.tab` (`write` | `roleplay`, mặc định `write`) và `searchParams.lang`
  - [ ] 30.2 Render tab switcher + `<PracticeConsole>` hoặc `<RoleplayConsole>` tương ứng
  - [ ] 30.3 Render server-side: đề bài + từ khoá + thống kê "Mục tiêu ngày 2/3 Bài viết" và "Tỷ lệ chính xác FSRS 91.4%" lấy từ DB thật
- [ ] 31. Tab switcher S11
  - [ ] 31.1 Tab 1 `edit_note Luyện Viết & Sửa Lỗi 4 Nhóm` (active) + badge "DANG MỞ"
  - [ ] 31.2 Tab 2 `forum Hội Thoại AI Role-Play` + badge "LOCAL VOX"
  - [ ] 31.3 Active `bg-surface-container-high text-primary`; container `bg-surface-container-lowest p-1 rounded-xl`
- [ ] 32. Component `src/components/language/practice-console.tsx` (Client)
  - [ ] 32.1 Card đề: mã chủ đề (`#ZH-042`), chip level (HSK 3+ / CEFR), tiêu đề, hướng dẫn, khối từ khoá bắt buộc
  - [ ] 32.2 Editor IME-friendly — không re-render `value` khi `isComposing` (giữ dấu tiếng Việt/Trung)
  - [ ] 32.3 Bộ đếm "48 ký tự Hanzi · 3 câu"
  - [ ] 32.4 Nút `restart_alt Xoá nhập lại`
  - [ ] 32.5 Nút `progress_activity Chấm & Phân tích 4 nhóm lỗi (Claude Opus 5 streaming)` + chip `Ctrl + Enter`
  - [ ] 32.6 `Ctrl+Enter` kích hoạt chấm; bỏ qua khi IME đang composing
  - [ ] 32.7 Input < 5 ký tự Hanzi (zh) / < 3 từ (en) → chặn, hiện ngưỡng, không gọi API
  - [ ] 32.8 Đọc NDJSON → `groups` (4 nhóm) + `correctedText` + `pinyin` + `explanation`
  - [ ] 32.9 Khối "Đánh Giá Sư Phạm Chuẩn Hoá" + badge điểm + latency/token hiển thị từ header `AiCall`
  - [ ] 32.10 Khối AI-10: nút `style Tạo 2 thẻ Flashcard mới Vào Deck FSRS Ngoại Ngữ` → `POST /api/language/cards`
  - [ ] 32.11 Khối Evidence: nút `award_star Ghi nhận 1 Evidence +15 XP Skill Tree (Ngoại ngữ)` → tạo `Evidence` (idempotent)
  - [ ] 32.12 Toast `bg-primary/10 text-primary` "Đã thêm 2 thẻ vào Deck FSRS thành công! Lịch ôn tập kế tiếp: Sau 12 giờ."
  - [ ] 32.13 Không API key → ẩn nút chấm, hiện hướng dẫn thêm key
- [ ] 33. Component `src/components/language/error-group-grid.tsx`
  - [ ] 33.1 Lưới `grid-cols-1 md:grid-cols-2`, 4 card theo thứ tự `grammar` · `vocab` · `expression` · `context`
  - [ ] 33.2 Mỗi card: tên nhóm + badge (Cần sửa N vị trí / Nâng cấp Collocation / Khử Việt-hóa / Đạt chuẩn N%)
  - [ ] 33.3 Mỗi lỗi: `original` (gạch, `text-error`) → `corrected` (`text-primary`) + `reason` (`body-sm text-on-surface-variant`)
  - [ ] 33.4 Nhóm rỗng → hiện chip "Đạt chuẩn" thay vì card trống
  - [ ] 33.5 Không nhóm nào ngoài 4 được render (filter theo `RUBRIC_LANGUAGE_ERRORS`)
- [ ] 34. Component `src/components/language/standardized-diff.tsx`
  - [ ] 34.1 Panel "Câu gốc của bạn" (`bg-surface-container-lowest`) và "Bản chuẩn hóa tối ưu" (`bg-surface-container-high`)
  - [ ] 34.2 Highlight thay đổi bằng `<mark>` (`bg-primary/20 text-primary`)
  - [ ] 34.3 Dòng pinyin `font-code-md text-on-surface-variant` (zh) / IPA (en)
  - [ ] 34.4 Khối `💡 Giải thích ngữ pháp` bằng tiếng Việt
  - [ ] 34.5 Nút `volume_up Phát âm mẫu` → `speechSynthesis` với `lang = zh-CN` / `en-US`
  - [ ] 34.6 `speechSynthesis` không hỗ trợ ngôn ngữ → ẩn nút, hiện "Trình duyệt này không có giọng đọc"
- [ ] 35. Component `src/components/language/keyword-chips.tsx`
  - [ ] 35.1 Render từ khoá bắt buộc dạng chip (`bg-surface-container-high`)
  - [ ] 35.2 Mỗi chip có nút `add_circle` → "Thêm vào ôn" → `addKeywordToDeck` (không gọi AI)
  - [ ] 35.3 Chip đã thêm → hiện dấu tick + "Trong deck FSRS"; bấm lại hiện "Thẻ đã tồn tại"
- [ ] 36. Component `src/components/language/roleplay-console.tsx` (S11 Tab 2)
  - [ ] 36.1 Danh sách tình huống (dùng `RoleplayScenario`) + mức độ + thời lượng
  - [ ] 36.2 Vòng lượt: lượt AI `bg-surface-container-low`, lượt user `bg-surface-container-high`; AI stream từng đoạn
  - [ ] 36.3 Ô nhập trả lời + nút gửi; có thể dùng STT (tái dùng hook `useSpeechRecognition`)
  - [ ] 36.4 **Không render `hiddenGoal`** trước khi có `goalScore`; hiện badge "Mục tiêu ẩn: đang ẩn"
  - [ ] 36.5 Nút "Kết thúc & Chấm" → `POST /api/roleplay {action:"goal_evaluation"}`
  - [ ] 36.6 Hiện `goalScore` 0–5 + `note` + danh sách `evidence` trích dẫn
  - [ ] 36.7 Phát hiện AI trả lời sai ngôn ngữ 2 lượt liên tiếp → cảnh báo "AI đang trả lời sai ngôn ngữ" + nút "Báo lỗi"
  - [ ] 36.8 Nút commit Evidence cho kỹ năng "Giao tiếp → Hội thoại"
  - [ ] 36.9 Mất kết nối → giữ lượt đã nhận + nút "Tiếp tục"

## 6. Kiểm thử & nghiệm thu

- [ ] 37. Unit test — `src/lib/grading.ts`
  - [ ] 37.1 `computeTotal`: `[]` → 0; 1 phần tử; 5 phần tử; làm tròn 1 chữ số (4+3+5+3+4 → 3.8)
  - [ ] 37.2 `computeDelta`: chưa có lần trước → `total: null`; thiếu 1 tiêu chí → `null` + total trên tập giao; `levelMismatch`
  - [ ] 37.3 `ratingFromScore`: biên 4.0 / 3.0 / 2.0 / 1.99
  - [ ] 37.4 `validateGradingInput`: `too_short` / `empty_transcript` / `invalid_level` / `invalid_lang`
  - [ ] 37.5 `buildSpeechMeta`: wpm đúng; filler đếm đúng; transcript < 15 từ → wpm = 0 (không `NaN`)
  - [ ] 37.6 `buildGradeUserMessage` không chứa `Date.now()` / UUID
- [ ] 38. Unit test — `src/lib/language.ts` & schema
  - [ ] 38.1 `extractKeywords`: lọc stopword, giữ hanzi, giữ thứ tự
  - [ ] 38.2 `GradeSchema.safeParse` reject khi AI trả 6 tiêu chí / tiêu chí ngoài enum / thiếu tiêu chí
  - [ ] 38.3 `LanguageCorrectSchema.safeParse` reject khi group khác `grammar|vocab|expression|context`
- [ ] 39. Integration test (SQLite test DB)
  - [ ] 39.1 Fixture 2 `SpeakAttempt` → `findPreviousAttempt` trả bản ghi mới nhất
  - [ ] 39.2 `commitEvidence` gọi 2 lần → vẫn **1** `Evidence`
  - [ ] 39.3 `Activity` + `Evidence` đúng `domain`/`type`/`skillId`; `rating` = `ratingFromScore(total)` (AC-CM-5)
  - [ ] 39.4 AI trả 6 tiêu chí → 502, **không** ghi `Activity` (AC-CM-1)
  - [ ] 39.5 AI-09 trả sai nhóm lỗi → 502; đúng 4 nhóm → `errorGroups` có đủ 4 key
  - [ ] 39.6 AI-10 trả 2 thẻ → đúng 2 `Card` (`mode="produce"`, `due ≈ +12h`); trùng `front` → bỏ qua
  - [ ] 39.7 `createCardsFromPractice` với `maxCards=2` và 3 thẻ → chỉ tạo 2
  - [ ] 39.8 `addKeywordToDeck` trùng → `duplicated: true`, không tạo thẻ mới (AC-CM-10)
  - [ ] 39.9 Task `next_turn` của `/api/roleplay` — payload gửi AI **không** chứa `hiddenGoal` (AC-CM-7)
  - [ ] 39.10 `RateLimitError` → `AiCall{ok:false}`, response thân thiện, không crash
  - [ ] 39.11 `stop_reason: "refusal"` → `AiCall{ok:false}`, không 500
- [ ] 40. E2E (Playwright)
  - [ ] 40.1 S07: viết bài → chấm → đúng 5 tiêu chí + tổng 3.8 + delta `▲ +0.4` (AC-CM-1, AC-CM-2, AC-CM-3)
  - [ ] 40.2 S07 lần đầu → "Chưa có lần trước để so sánh", không `▲ 0.0` (AC-CM-3)
  - [ ] 40.3 S07 bấm commit → DB có đúng 1 `Activity` + 1 `Evidence` (AC-CM-5)
  - [ ] 40.4 S07 kho đề hiện 12 bài `EX-01..EX-12`; lọc `level=B2` → đúng số bài (AC-CM-6)
  - [ ] 40.5 S07 tạo prompt tự do → xuất hiện trong kho với `isUserMade=true`, dùng lại được
  - [ ] 40.6 S08 mock `getUserMedia` + `SpeechRecognition` → ghi → chấm → transcript + rubric 5 tiêu chí + filler words (AC-CM-4)
  - [ ] 40.7 S08 từ chối quyền mic → hiện hướng dẫn, không crash, không gọi API (AC-CM-12)
  - [ ] 40.8 S08 không có `SpeechRecognition` → hiện ô nhập transcript tay, vẫn chấm được
  - [ ] 40.9 S08 transcript rỗng → không gọi API, hiện thông báo
  - [ ] 40.10 S11 Tab 1: viết bài Trung sai → lỗi ở đúng nhóm `grammar`/`vocab` (AC-CM-9)
  - [ ] 40.11 S11 bấm AI-10 → toast "Đã thêm 2 thẻ", DB có 2 `Card` `mode=produce` (AC-CM-9)
  - [ ] 40.12 S11 bấm "Thêm vào ôn" trên 1 từ khoá → 1 `Card` mới, `due` = hôm nay (AC-CM-10)
  - [ ] 40.13 S11 Tab 2: bắt đầu role-play → `hiddenGoal` **không** hiện; kết thúc → `goalScore` về (AC-CM-7)
  - [ ] 40.14 Không API key → cả 3 màn hình ẩn nút chấm, hiện hướng dẫn, **không** có request API (AC-CM-11)
- [ ] 41. A11y & responsive
  - [ ] 41.1 Chạy axe scan trên cả 3 màn hình — không có lỗi critical/serious
  - [ ] 41.2 Rubric panel có `aria-live="polite"`; transcript có `aria-live="polite"`
  - [ ] 41.3 Mọi icon-only button có `aria-label`; delta có text thay thế, không chỉ màu
  - [ ] 41.4 Focus ring `focus-visible:ring-2 focus-visible:ring-primary` trên input/button
  - [ ] 41.5 Kiểm tra 390px: S07 editor + kho đề xếp dọc; S08 transcript cuộn dọc; S11 2 tab xếp dọc; nút chấm trong vùng ngón cái
  - [ ] 41.6 Tương phản WCAG AA cho `text-outline` trên `bg-surface-container` và `text-tertiary` trên `bg-surface-container-low`
- [ ] 42. Nghiệm thu
  - [ ] 42.1 Chạy lại toàn bộ AC-CM-1..AC-CM-12 và đánh dấu pass/fail
  - [ ] 42.2 Xác nhận không có số liệu hardcode trong JSX (điểm, tổng, delta đều từ props)
  - [ ] 42.3 Xác nhận `cache_read_input_tokens > 0` ở call thứ 2 của cả 4 AI call (AI-03/04, AI-08, AI-09, AI-10)
  - [ ] 42.4 Xác nhận mọi lời gọi AI đều ghi `AiCall` với `feature` đúng (`grading` · `roleplay` · `language_correct` · `language_cards`)
  - [ ] 42.5 Xác nhận `Activity`/`Evidence` của 3 màn hình có `domain` đúng (`communication` / `language`) và `skillId` khác null (FR-CM-07)

## 43. Chọn ngôn ngữ theo chế độ (Q2)

- [ ] 43.1 Thêm selector ngôn ngữ `en`/`vi`/`zh` vào S07 (đề bài), S08 (giọng nói + TTS), S11 (2 tab)
- [ ] 43.2 TTS: `en-US` / `vi-VN` / `zh-CN`; fallback hiện phụ đề khi `vi-VN` không có (R5)
- [ ] 43.3 Khi ngôn ngữ = `vi`: AI **không** tính lỗi ngữ pháp — chỉ chấm 4 tiêu chí (rõ ràng · cấu trúc · giọng văn · tự nhiên)
- [ ] 43.4 Hiển thị ghi chú "Ngôn ngữ bản ngữ — bỏ qua chấm ngữ pháp" cạnh tổng điểm
- [ ] 43.5 Đổi ngôn ngữ → nạp lại kho 12 bài mẫu tương ứng
- [ ] 43.6 Flashcard sinh từ bài viết chỉ cho `en`/`zh` — `vi` không có deck (Q2)
- [ ] 43.7 Test: chọn `vi` → AI trả rubric không có tiêu chí `grammar`
- [ ] 43.8 Test: đổi ngôn ngữ giữa lúc đang nhập → không mất nội dung đã gõ

> **Ghi nhận sai lệch (2026-10-31):** Task dùng model `SpeakPrompt`/`SpeakAttempt` riêng
> nhưng registry M3/M4 chốt fallback là **hằng seed + `Activity`**. Triển khai theo
> fallback: `prisma/seed-data/speak-prompts.ts` + `Activity` (`type = "speak"`/`"write"`).
> Vì vậy 3 nhóm task về model Prisma mới (§1, §2, §3) **không tick** — cần task dự phòng
> tương ứng trong registry. Tương tự, task `POST /api/speak/commit` nhận `promptId`
> (không phải `attemptId`) và UI hiển thị điểm bằng thanh tiêu chí (không phải vòng tròn radial).
