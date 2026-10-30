# Tasks — Mock Interview

> Phase: 1 · Phụ thuộc: `daily-loop-core`, `skill-tree-evidence`, `ai-foundation`
> Lưu ý: tuân thủ `.kiro/steering/tech.md` + `design-system.md`.
> Đặc tả: `.kiro/specs/mock-interview/spec.md` · thiết kế: `.kiro/specs/mock-interview/design.md`

---

## 0. Nền tảng dữ liệu

- [ ] 1. Mô hình Prisma — `InterviewProfile`, `InterviewSession`, `InterviewTurn`
  - [ ] 1.1 Thêm `answerMode String @default("text")` và `englishClarity Boolean @default(false)` vào `model InterviewProfile` trong `prisma/schema.prisma`
  - [ ] 1.2 Thêm `report Json?` và `activityId String? @unique` vào `model InterviewSession`; thêm quan hệ `activity Activity? @relation(fields: [activityId], references: [id])`
  - [ ] 1.3 Thêm `status` giá trị mới `paused` — ghi chú trong schema, giá trị hiện tại là String tự do (không cần enum)
  - [ ] 1.4 Thêm các cột mới vào `model InterviewTurn`: `skillId String?`, `behavioralScores Json?`, `clarityScore Float?`, `nextKind String?`, `nextSkillId String?`, `isFollowUp Boolean @default(false)`, `adaptiveReason String?`, `flagged Boolean @default(false)`, `flagReason String?`
  - [ ] 1.5 Thêm index `@@index([sessionId, index])` trên `InterviewTurn` và `@@index([profileId, status, startedAt])` trên `InterviewSession`
  - [ ] 1.6 Chạy `npx prisma migrate dev --name add_mock_interview_columns` (migration **additive** — không dùng `reset`)
  - [ ] 1.7 Xác minh `npx prisma migrate status` báo không có migration pending
  - [ ] 1.8 Seed: thêm 3 `InterviewProfile` mẫu ("Backend Engineer", "System Architect", "Engineering Manager") trong `prisma/seed.ts`, `focusSkills` trỏ tới node `professional` có sẵn

- [ ] 2. Kiểu dùng chung & rubric
  - [ ] 2.1 Tạo `src/lib/interview/types.ts` khai báo **một lần duy nhất**: `QuestionKind`, `Seniority`, `AnswerMode`, `SessionStatus`, `RubricKey`, `BehavioralRubricKey`, `CriterionScore`, `ScoresJson`, `BehavioralScoresJson`
  - [ ] 2.2 Tạo `src/lib/interview/rubric.ts` — khai báo `RUBRIC_TECHNICAL` (5 tiêu chí), `RUBRIC_BEHAVIORAL` (4 tiêu chí), `RUBRIC_BY_KIND`, `RUBRIC_SCORE_MIN/MAX`
  - [ ] 2.3 Implement `sanitizeScores(raw, kind)` — clamp về [0,5], lọc key ngoài rubric theo `kind`, loại bỏ `scores` khi kind = `behavioral`
  - [ ] 2.4 Implement `computeTurnTotal(scores, kind)` — trung bình tiêu chí đã chấm, làm tròn 2 chữ số
  - [ ] 2.5 Implement `computeSessionTotal(turnTotals)` — trả `null` khi danh sách rỗng
  - [ ] 2.6 Export `RUBRIC_BLOCK` — chuỗi text rubric 2 bảng + quy tắc chấm, **không** chứa timestamp/UUID
  - [ ] 2.7 Unit test `rubric.ts` — clamp, lọc key lạ, đúng rubric theo kind, tổng đúng trung bình

- [ ] 3. Lớp nghiệp vụ — thuật toán chọn kỹ năng yếu
  - [ ] 3.1 Tạo `src/lib/interview/weak-skills.ts` với interface `SkillEvidenceStat`, `WeakSkillView`, `WeaknessBand`
  - [ ] 3.2 Implement `rankWeakSkills(stats, options)` — sort theo 4 khoá: `evidenceCount ASC` → `avgRating ASC` (null = Infinity) → `level ASC` → `name ASC`
  - [ ] 3.3 Implement `pickWeakSkills(stats, count)` và `bandOf(evidenceCount, level)` — P0 = 0 bằng chứng, P1 = 1–2, P2 = ≥3
  - [ ] 3.4 Implement `getSkillEvidenceStats(skillIds)` — query Prisma raw theo SQL ở `design.md` §3.2
  - [ ] 3.5 Unit test: fixture "Lựa chọn giải pháp" (0 bằng chứng) phải đứng trước "Phân tích yêu cầu" (2 bằng chứng) → **AC-10**
  - [ ] 3.6 Unit test: khoá ổn định — gọi 2 lần cùng dữ liệu cho kết quả giống hệt
  - [ ] 3.7 Unit test: `avgRating = null` không bị ưu tiên sai; `focusSkills` rỗng trả `[]`

- [ ] 4. Lớp nghiệp vụ — turn machine & adaptive
  - [ ] 4.1 Tạo `src/lib/interview/turn-machine.ts` với `TurnContext` và `TurnValidation`
  - [ ] 4.2 Implement `validateTurn(ctx, rawAnswer)` — trả lỗi `EMPTY_ANSWER` / `SESSION_PAUSED` / `INDEX_MISMATCH` / `SESSION_DONE`
  - [ ] 4.3 Implement `shouldFollowUp(scores)` theo đúng ngưỡng ở `design.md` §3.5 (thiếu depth/tradeoff/STAR → follow-up; đạt → câu mới)
  - [ ] 4.4 Implement `normalizeTurnResult(result, ctx, focusedSkillIds, fallbackSkillId)` — ép câu mới khi AI sinh follow-up thừa; gắn lại `skillId` hợp lệ; `nextQuestion = null` khi đủ câu
  - [ ] 4.5 Implement `buildTurnPromptInput(answer, maxChars)` — cắt còn 2000 ký tự đầu + 500 ký tự cuối, chèn `[...bị cắt...]`, trả `truncated`
  - [ ] 4.6 Implement `computeClarityScore(answer, result)` — chỉ chạy khi `englishClarity && language==='en' && answerMode==='voice'`, ngược lại trả `null`
  - [ ] 4.7 Unit test `validateTurn` — rỗng / paused / index lệch
  - [ ] 4.8 Unit test `shouldFollowUp` — 5 nhánh ngưỡng, gồm câu behavioral thiếu STAR
  - [ ] 4.9 Unit test `normalizeTurnResult` — follow-up thừa bị ép, `skillId` ngoài danh sách bị thay
  - [ ] 4.10 Unit test `buildTurnPromptInput` — giữ nguyên 3000 ký tự dưới ngưỡng; cắt đúng khi vượt

- [ ] 5. Lớp nghiệp vụ — báo cáo, delta, Activity/Evidence
  - [ ] 5.1 Tạo `src/lib/interview/report.ts` với `TurnTranscript` và `NormalizedReport`
  - [ ] 5.2 Implement `isVerbatimQuote(quote, answer)` — chuẩn hoá whitespace rồi `includes`; `answer === null` → `false`
  - [ ] 5.3 Implement `normalizeReport(raw, transcript)` — cắt/điền **đúng 3** mạnh + **3** yếu, gắn `autoGenerated` cho mục tự sinh
  - [ ] 5.4 Implement `normalizeReport` — verify `turnIndex` trong khoảng hợp lệ, không hợp lệ thì gán câu có điểm thấp nhất
  - [ ] 5.5 Implement `buildFallbackPractices(focused)` — dùng node yếu nhất, `action` theo mẫu câu chuẩn
  - [ ] 5.6 Implement `normalizeReport` — validate `nextPractices.skillId` thuộc `skillsFocused`, sai thì thay bằng fallback
  - [ ] 5.7 Tạo `src/lib/interview/delta.ts` — `computeSessionRubric(turns)`, `findPreviousSession(profileId, startedAt)`, `diffRubric(current, previous)`
  - [ ] 5.8 Implement `diffRubric` — `direction`: `up` nếu `delta > 0.05`, `down` nếu `< -0.05`, còn lại `flat`
  - [ ] 5.9 Tạo `src/lib/interview/activity.ts` — `pickPrimarySkill(skillsFocused, turnSkillIds)` và `toEvidenceRating(totalScore)` (4/3/2/1)
  - [ ] 5.10 Implement `persistSessionOutcome(outcome)` — 1 transaction tạo **đúng 1** `Activity` + **đúng 1** `Evidence`, idempotent theo `session.activityId`
  - [ ] 5.11 Unit test `normalizeReport` — AI trả 5 mạnh / 1 yếu → còn 3/3; quote sai → bị bỏ, giữ comment
  - [ ] 5.12 Unit test `diffRubric` — delta đúng, `flat` khi chênh ≤ 0.05
  - [ ] 5.13 Unit test `toEvidenceRating` — 4.5→4, 3.5→3, 2.5→2, 1.0→1

- [ ] 6. Lớp nghiệp vụ — state machine & resume
  - [ ] 6.1 Tạo `src/lib/interview/session-state.ts` với `SessionStatus` và `SessionSnapshot`
  - [ ] 6.2 Implement `currentTurnIndex(session)` — trả index của turn chưa có `answer`; `null` khi hết câu
  - [ ] 6.3 Implement `lastAnsweredTurnIndex(session)` — index của turn cuối đã trả lời (panel "Đánh giá Câu N-1")
  - [ ] 6.4 Implement `canTransition(from, to)` — `done`/`abandoned` không hồi sinh được
  - [ ] 6.5 Implement `statusAfterTurn(askedCount, plannedCount)` — `'done'` khi `askedCount >= plannedCount`, ngược lại `'active'`
  - [ ] 6.6 Implement `computeSessionMinutes(session, now)` — bội số 5, tối thiểu 5
  - [ ] 6.7 Unit test `currentTurnIndex` — phiên có câu chưa trả lời → trả index đúng; phiên hết câu → `null`
  - [ ] 6.8 Unit test `canTransition` — `done → active` = false, `paused → active` = true
  - [ ] 6.9 Unit test `computeSessionMinutes` — 23 phút → 25; dưới 3 phút → 5

---

## 1. AI layer

- [ ] 7. Prompt & schema
  - [ ] 7.1 Tạo `src/lib/interview/prompts.ts` — export `SYSTEM_INTERVIEW` (đóng vai interviewer + quy tắc chấm, **cố định**)
  - [ ] 7.2 Export `SYSTEM_INTERVIEW_REPORT` cho AI-13 (cố định)
  - [ ] 7.3 Import `RUBRIC_BLOCK` từ `rubric.ts` vào `prompts.ts` — **1 nguồn duy nhất**, không copy-paste
  - [ ] 7.4 Viết `StartQuestionSchema` (AI-11): `question`, `kind`, `skillId`, `skillName`, `intro`
  - [ ] 7.5 Viết `TurnResultSchema` (AI-12): `scores` (5 key), `behavioralScores` (4 key, nullable), `total`, `feedback`, `nextQuestion` (nullable) kèm `isFollowUp` + `reason`
  - [ ] 7.6 Viết `ReportSchema` (AI-13): `overallNote`, `strengths` **length(3)**, `weaknesses` **length(3)**, `nextPractices` (1–3)
  - [ ] 7.7 Implement `buildInterviewSystemBlocks()` — trả `[{type:'text',text:SYSTEM_INTERVIEW}, {type:'text',text:RUBRIC_BLOCK,cache_control:{type:'ephemeral'}}]`
  - [ ] 7.8 Implement `buildTurnMessages(session, turn, answer)` — `PROFILE_BLOCK` + `SKILL_BLOCK` + lịch sử **append-only** + `TURN_BLOCK` + `INSTRUCTION_BLOCK`, **tất cả trong `messages`**
  - [ ] 7.9 Implement `buildReportMessages(session, transcript)` — `PROFILE_BLOCK` + `TRANSCRIPT_BLOCK` + `REPORT_INSTRUCTION_BLOCK`
  - [ ] 7.10 Implement `buildStartMessages(profile, focusSkills, kinds)` — hồ sơ + node yếu + dạng câu, không đưa timestamp vào system

- [ ] 8. Wrapper Anthropic & prompt caching
  - [ ] 8.1 Thêm `feature: 'mock_interview'` vào union `feature` của `src/lib/anthropic.ts`
  - [ ] 8.2 Implement `callStructured<T>(opts)` — gọi `client.messages.parse` với `output_config.format = zodOutputFormat(schema)`
  - [ ] 8.3 Bảo đảm wrapper tự ghi `AiCall` cho mọi lời gọi: `inputTokens`, `outputTokens`, `cacheRead`, `cacheWrite`, `estimatedCost`, `ok`, `error`
  - [ ] 8.4 Implement `assertCacheHit(feature)` — đọc `AiCall.cacheRead` của call gần nhất
  - [ ] 8.5 Thiết lập `max_tokens: 8000` cho AI-11/12 và `max_tokens: 12000` cho AI-13
  - [ ] 8.6 Thiết lập `effort`: `medium` cho AI-11/12, `high` cho AI-13 — **không** đặt `temperature` cao (R9)
  - [ ] 8.7 Áp dụng typed exception chain: `AuthenticationError` → `RateLimitError` → `APIStatusError` → `APIConnectionError`
  - [ ] 8.8 Kiểm tra `stop_reason === 'refusal'` **trước khi** đọc `content`; ghi `AiCall{ok:false}`
  - [ ] 8.9 Xác minh cache: chạy 1 phiên 8 câu → `cache_read_input_tokens` của lượt 2 > 0 (AC-5); nếu = 0 → tìm silent invalidator

- [ ] 9. AI-11 — sinh câu hỏi lượt 1
  - [ ] 9.1 Implement `generateFirstQuestion(profile, focusSkills, kinds)` — gọi `callStructured<StartQuestion>`
  - [ ] 9.2 Bắt buộc truyền `focusSkills` + `jobTitle` + `seniority` + `language` vào `messages` (R8)
  - [ ] 9.3 Gán `skillId` cho câu hỏi từ `focusSkills`; nếu AI trả `skillId` không hợp lệ → gán node yếu nhất
  - [ ] 9.4 Fallback khi AI lỗi: trả `503` + thông báo có nút "Thử lại" — **không** sinh câu hỏi giả

- [ ] 10. AI-12 — chấm + sinh câu tiếp (1 call)
  - [ ] 10.1 Implement `gradeAndGenerateNext(session, turn, answer)` — **1** lời gọi `callStructured<TurnResult>`
  - [ ] 10.2 Chấm câu vừa trả lời theo `RUBRIC_BY_KIND` (behavioral → rubric hành vi, còn lại → rubric kỹ thuật)
  - [ ] 10.3 Sinh câu tiếp theo: follow-up nếu `shouldFollowUp`, ngược lại chuyển node yếu kế tiếp
  - [ ] 10.4 Áp dụng `normalizeTurnResult` trước khi ghi DB
  - [ ] 10.5 Tính `clarityScore` khi `englishClarity && language==='en' && answerMode==='voice'`
  - [ ] 10.6 Tính `total` bằng `computeTurnTotal`, không tin giá trị `total` do AI trả
  - [ ] 10.7 Unit test với fixture `TurnResult` hợp lệ / thiếu key / điểm ngoài thang / `nextQuestion=null`

- [ ] 11. AI-13 — báo cáo cuối phiên
  - [ ] 11.1 Implement `generateReport(session, transcript)` — gọi `callStructured<Report>` với `effort:'high'`
  - [ ] 11.2 Build `TRANSCRIPT_BLOCK` gồm câu hỏi + câu trả lời + điểm từng lượt (cắt câu trả lời > 2000 ký tự)
  - [ ] 11.3 Chạy `normalizeReport` — cắt/điền 3 mạnh + 3 yếu, verify trích dẫn, fallback `nextPractices`
  - [ ] 11.4 Lưu `session.report` (JSON) — chỉ ghi sau khi đã normalize
  - [ ] 11.5 Gọi `persistSessionOutcome` — tạo 1 Activity + 1 Evidence
  - [ ] 11.6 Chặn gọi lại khi `session.report` đã có → trả report đã lưu (idempotent)

---

## 2. API

- [ ] 12. `GET /api/interview/profiles`
  - [ ] 12.1 Query `InterviewProfile` kèm `sessions` để tính `sessionCount` và `averageScore` (chỉ tính session `status='done'`)
  - [ ] 12.2 Trả `{ ok: true, data: { profiles, total } }`
- [ ] 13. `POST /api/interview/profiles`
  - [ ] 13.1 Validate body bằng Zod — `label`, `jobTitle`, `seniority`, `language`, `questionKinds[]` ⊆ 5 dạng, `focusSkills[]`, `answerMode`, `englishClarity`
  - [ ] 13.2 Kiểm tra `focusSkills` tồn tại và thuộc domain `professional` → `400` nếu không
  - [ ] 13.3 Kiểm tra `questionKinds` không rỗng → `400`
  - [ ] 13.4 Trả `409` nếu trùng `label`
  - [ ] 13.5 Tạo bản ghi, trả `{ ok: true, data: { profile } }`
- [ ] 14. `PATCH /api/interview/profiles/[id]`
  - [ ] 14.1 Validate partial body bằng Zod
  - [ ] 14.2 Cập nhật, trả `404` nếu hồ sơ không tồn tại
- [ ] 15. `DELETE /api/interview/profiles/[id]`
  - [ ] 15.1 Xoá hồ sơ → cascade xoá phiên (cascade xác nhận trong schema)
  - [ ] 15.2 Trả `{ ok: true, data: { deleted: true } }`
- [ ] 16. `GET /api/interview/weak-skills?profileId=&count=2`
  - [ ] 16.1 Lấy `focusSkills` của hồ sơ → `getSkillEvidenceStats` → `rankWeakSkills` → `pickWeakSkills(count)`
  - [ ] 16.2 Trả `{ skills: WeakSkillView[] }` gồm `skillId`, `name`, `evidenceCount`, `avgRating`, `level`, `path`, `band`, `score`
- [ ] 17. `POST /api/interview/start` (AI-11)
  - [ ] 17.1 Validate body: `profileId`, `plannedCount` ∈ {5,8,12}, `questionKinds[]` không rỗng, `focusSkills?`, `answerMode`, `englishClarity`, `adaptive`
  - [ ] 17.2 Kiểm tra hồ sơ tồn tại → `404`
  - [ ] 17.3 Kiểm tra đã có phiên `status='active'` cùng hồ sơ → `409` (kèm `sessionId` để resume)
  - [ ] 17.4 Xác định `skillsFocused`: node yếu đã ghim (AI chọn) hoặc `focusSkills` người dùng chọn tay; nếu rỗng → fallback 2 node yếu nhất toàn cây `professional`
  - [ ] 17.5 Tạo `InterviewSession` (`status='active'`, `askedCount=0`, `skillsFocused`)
  - [ ] 17.6 Gọi AI-11 → tạo `InterviewTurn` #1 (`answer=null`, `kind`, `skillId`, `skillName`)
  - [ ] 17.7 Trả `{ ok: true, data: { sessionId, firstTurn } }`
  - [ ] 17.8 Trả `503 NO_API_KEY` nếu thiếu key — **không** tạo phiên giả
- [ ] 18. `POST /api/interview/turn` (AI-12)
  - [ ] 18.1 Validate body: `sessionId`, `turnIndex` ≥ 1, `answer` string
  - [ ] 18.2 Load session + profile + turns; `404` nếu không có session
  - [ ] 18.3 Chạy `validateTurn` → `409` cho `EMPTY_ANSWER` / `SESSION_PAUSED` / `INDEX_MISMATCH`
  - [ ] 18.4 Gọi AI-12 (1 call) — không tách thành 2 call
  - [ ] 18.5 Áp `normalizeTurnResult` + `sanitizeScores` + tính `total` bằng `computeTurnTotal`
  - [ ] 18.6 Transaction: update turn hiện tại (`answer`, `scores`, `behavioralScores`, `total`, `feedback`, `clarityScore`) + create turn kế tiếp (`index+1`, `question`, `kind`, `skillId`, `skillName`, `isFollowUp`, `adaptiveReason`)
  - [ ] 18.7 Update session: `askedCount++`; `status = 'done'` khi `askedCount >= plannedCount`, ngược lại `'active'`
  - [ ] 18.8 Trả `{ ok: true, data: { turn, nextTurn, session: { askedCount, status } } }`
  - [ ] 18.9 Error mapping theo bảng ở `design.md` §3.12 (401/429/422/502/504/503)
- [ ] 19. `POST /api/interview/report` (AI-13)
  - [ ] 19.1 Validate `sessionId`; `404` nếu không có session
  - [ ] 19.2 `409` nếu số câu đã trả lời `< 2` (báo cáo trên 1 câu là ảo tưởng)
  - [ ] 19.3 Nếu `session.report` đã có → trả luôn, không gọi AI lại
  - [ ] 19.4 Gọi AI-13 → `normalizeReport` → lưu `session.report`
  - [ ] 19.5 Gọi `persistSessionOutcome` — tạo Activity + Evidence idempotent
  - [ ] 19.6 Trả `{ ok: true, data: { report } }`
- [ ] 20. `GET /api/interview/[id]`
  - [ ] 20.1 Load session + profile + turns (thứ tự `index ASC`)
  - [ ] 20.2 `404` nếu session không tồn tại hoặc `status !== 'done'`
  - [ ] 20.3 Chạy lại `normalizeReport` khi đọc (phòng thủ shape JSON)
  - [ ] 20.4 Gọi `findPreviousSession` + `diffRubric` → trả `deltas`
  - [ ] 20.5 Trả `{ session, profile, turns, report, activity, evidence, previousSession, deltas }`
- [ ] 21. `GET /api/interview/sessions?profileId=&status=&limit=`
  - [ ] 21.1 Filter theo `profileId` / `status`, sắp xếp `startedAt DESC`, `limit` mặc định 20
  - [ ] 21.2 Trả `{ sessions, total }` — chỉ trả field tóm tắt, không kéo toàn bộ turn
  - [ ] 21.3 `PATCH /api/interview/sessions/[id]` — `{ status: "paused" | "active" | "abandoned" }`
    - [ ] 21.3.1 Validate body bằng Zod — chỉ nhận 3 giá trị trên
    - [ ] 21.3.2 `409` nếu phiên đã `status='done'` (không hồi sinh phiên đã kết thúc)
    - [ ] 21.3.3 `active → paused`: giữ nguyên `askedCount`, `endedAt` vẫn `null`
    - [ ] 21.3.4 `paused → active`: giữ nguyên toàn bộ turn, `askedCount` không đổi → câu đang dở resume đúng chỗ
    - [ ] 21.3.5 `→ abandoned`: set `endedAt = now()`, `status='abandoned'` (giữ dữ liệu để xem lại)
    - [ ] 21.3.6 Trả `{ ok: true, data: { session: { id, status, askedCount } } }`
- [ ] 22. `POST /api/interview/flag` (FR-MI-11)
  - [ ] 22.1 Validate `turnId` (+ `reason?` tối đa 500 ký tự)
  - [ ] 22.2 `404` nếu turn không tồn tại
  - [ ] 22.3 Set `InterviewTurn.flagged = true` và lưu lý do vào `InterviewTurn.flagReason` (tối đa 500 ký tự)
  - [ ] 22.4 Ghi thêm 1 dòng `AiCall{feature:'mock_interview', ok:false, error:'flagged_question:<turnId>:<reason>'}` làm log cải thiện sinh câu hỏi (đọc được bằng query `AiCall`)
  - [ ] 22.5 Trả `{ ok: true, data: { flagged: true } }`
- [ ] 23. `GET /api/interview/[id]/export`
  - [ ] 23.1 Trả file JSON self-contained: hồ sơ, phiên, toàn bộ turn + điểm, report, delta
  - [ ] 23.2 **Không** chứa `ANTHROPIC_API_KEY` hay dữ liệu ngoài phạm vi phiên

---

## 3. UI

- [ ] 24. Route S16 — `src/app/interview/setup/page.tsx` (Server Component)
  - [ ] 24.1 Load `profiles`, `weakSkills`, `skills` (node `professional` để chọn tay), `resumedSessionId`, `hasApiKey`
  - [ ] 24.2 Render khung trang + `<InterviewSetup />` (Client)
  - [ ] 24.3 Metadata + breadcrumb chip `FR-MI-01 / MOCK INTERVIEW SYSTEM / CẤU HÌNH THÍCH ỨNG ADAPTIVE`
- [ ] 25. Component `src/components/interview/interview-setup.tsx` (Client)
  - [ ] 25.1 Section "Hồ Sơ Vai Trò Phỏng Vấn" — lưới 3 cột card hồ sơ, card được chọn dùng `bg-surface-container-high ring-1 ring-primary/40`
  - [ ] 25.2 Card hồ sơ hiện: nhãn, chip ngôn ngữ, `seniority`, số dạng câu, số skill, số phiên, điểm TB (`font-code-md text-tertiary`)
  - [ ] 25.3 Empty state khi chưa có hồ sơ — icon `badge`, CTA "+ Tạo hồ sơ vai trò mới" là control duy nhất enable
  - [ ] 25.4 Modal tạo/sửa hồ sơ — form `label`, `jobTitle`, `seniority` (4 option), `language` (en/vi), `questionKinds[]` (5 dạng), `focusSkills[]` (chọn trong cây kỹ năng), `answerMode`
  - [ ] 25.5 Section "Kỹ Năng Trọng Tâm Từ Cây Kỹ Năng" — banner giải thích + 2 card node yếu (badge P0 `bg-error-container`, P1 `bg-tertiary-container`)
  - [ ] 25.6 Nút "Tùy chỉnh chọn node thủ công" — mở modal chọn node, thay thế danh sách AI gợi ý
  - [ ] 25.7 Section "Chi Tiết Cấu Hình Phiên" — chip 5 dạng câu (toggle `check_circle`/`radio_button_unchecked`), option 5/8/12, option văn bản/giọng nói, toggle Adaptive + Đo tiếng Anh
  - [ ] 25.8 Cột phải: card "Rubric Chấm Chuẩn Hóa" (5 tiêu chí read-only), card "Ước Tính Tài Nguyên AI" (chi phí tính động theo `plannedCount`), card CTA
  - [ ] 25.9 Nút "Bắt đầu Phiên Phỏng Vấn" → `POST /api/interview/start` → `router.push('/interview/session?session=...')`
  - [ ] 25.10 Disable nút bắt đầu khi: `questionKinds` rỗng, `profiles` rỗng, `hasApiKey === false`
  - [ ] 25.11 Banner resume khi có phiên `paused`/`abandoned`
  - [ ] 25.12 Khi `hasApiKey === false` → ẩn nút bắt đầu, hiện card "Thêm API key trong Cài đặt" + link `/settings`
  - [ ] 25.13 Xử lý lỗi: hiện thông báo ngắn + nút "Thử lại", không làm sập trang
  - [ ] 25.14 Loading skeleton cho section weak skills và danh sách hồ sơ
- [ ] 26. Route S17 — `src/app/interview/session/page.tsx` (Server Component)
  - [ ] 26.1 Đọc `session` param; `notFound()` nếu session không tồn tại
  - [ ] 26.2 Load session + profile + turns → truyền xuống `<InterviewSession />`
  - [ ] 26.3 Render `<InterviewSession />` (Client) — phần lớn màn hình là Client vì timer/textarea/STT/streaming
- [ ] 27. Component `src/components/interview/interview-session.tsx` (Client)
  - [ ] 27.1 Header: chip `FR-MI-01 · LIVE SESSION`, vai trò, ngôn ngữ, tiêu đề "Câu N/M", đồng hồ câu + tổng, nút "Tạm dừng & Lưu", nút "Flag"
  - [ ] 27.2 Track 8 ô: ô đã xong (icon `check_circle` + điểm), ô đang thi (`bg-surface-container-highest` + `radio_button_checked`), ô chờ (`hourglass_empty`), ô cuối "Tổng kết" (icon `lock`)
  - [ ] 27.3 Card interviewer: avatar **icon** `neurology` (không dùng ảnh remote), tên model, badge "ADAPTIVE LEAD EVALUATOR", nút "Nghe câu hỏi" (TTS)
  - [ ] 27.4 Card câu hỏi: `font-body-lg` trong `bg-surface-container rounded-xl p-gutter`; chip kỹ năng `bg-secondary-container/30 text-secondary`; cờ "Ưu tiên node yếu nhất" `bg-tertiary-container/30`
  - [ ] 27.5 Card trả lời: toolbar (code / bullets / fx / nút STT), textarea `bg-surface-container-lowest rounded-xl font-code-md`, footer (số từ, thời gian gõ, autosave, kbd Ctrl+Enter)
  - [ ] 27.6 Autosave vào `localStorage` key `mi:draft:{sessionId}:{turnIndex}` mỗi 800ms; khôi phục khi mount
  - [ ] 27.7 Nút "Xem lại gợi ý cấu trúc (STAR)" — chỉ hiện khi `kind === 'behavioral'`
  - [ ] 27.8 Nút "Xóa làm lại" — xoá nội dung textarea, không xoá turn
  - [ ] 27.9 Nút "Gửi câu trả lời & AI chấm tiếp" → `POST /api/interview/turn` → `router.refresh()`; khi đang chấm hiện spinner + disable
  - [ ] 27.10 Panel "Đánh giá Câu N-1" — chip tổng điểm + 4–5 thanh tiêu chí (chỉ hiện điểm, không diễn giải dài)
  - [ ] 27.11 Panel "Ghi chú thích ứng (Adaptive Trigger)" — hiện `adaptiveReason` của câu hiện tại
  - [ ] 27.12 Panel "Trạng thái phát âm" — ẩn hoàn toàn khi `answerMode === 'text'`; hiện waveform + độ trễ khi `voice`
  - [ ] 27.13 Implement TTS: `speechSynthesis` với `lang = vi-VN | en-US`, `rate = 0.95`; disable nếu không hỗ trợ
  - [ ] 27.14 Implement STT: `SpeechRecognition` `continuous` + `interimResults`, chỉ nối kết quả `isFinal`; disable nếu không hỗ trợ
  - [ ] 27.15 Chặn double-submit bằng `inFlightRef` + disable nút ngay khi bấm
  - [ ] 27.16 Modal resume khi `status === 'paused'` — "Tiếp tục" / "Bỏ phiên"
  - [ ] 27.17 Khi đủ câu → nút đổi thành "Xem kết quả →" → `router.push('/interview/{sessionId}')`
  - [ ] 27.18 Toast lỗi: "AI chưa phản hồi được. Câu trả lời của bạn **đã được lưu**." + nút "Thử lại"; **không** xoá nội dung textarea
  - [ ] 27.19 `aria-live="polite"` cho vùng điểm câu trước và trạng thái AI
  - [ ] 27.20 Thêm `aria-label` cho mọi icon-only button; `focus-visible:ring-2 focus-visible:ring-primary`
- [ ] 28. Route S18 — `src/app/interview/[id]/page.tsx` (Server Component)
  - [ ] 28.1 Load session + profile + turns + report + deltas qua `GET /api/interview/[id]` hoặc gọi trực tiếp service layer
  - [ ] 28.2 `notFound()` nếu session không tồn tại hoặc chưa `done`
  - [ ] 28.3 Render header báo cáo + card tổng điểm + card rubric 5 tiêu chí + 2 panel mạnh/yếu + panel đề xuất + footer
- [ ] 29. Component `src/components/interview/interview-report-view.tsx` (Server-safe)
  - [ ] 29.1 Card tổng điểm: `font-display text-display` cho số điểm, chip delta `bg-primary-fixed-dim/15 text-primary`
  - [ ] 29.2 Card rubric 5 tiêu chí: icon + điểm + thanh `bg-surface-container-highest h-2`, fill `bg-primary` nếu ≥ 4.0, `bg-tertiary` nếu < 4.0, kèm ghi chú
  - [ ] 29.3 Panel "3 Điểm mạnh cụ thể": icon tròn `bg-primary/10 text-primary`, trích dẫn `bg-surface-container-lowest font-code-md italic`, nhận xét AI
  - [ ] 29.4 Panel "3 Điểm yếu cần khắc phục ngay": icon tròn `bg-tertiary/10 text-tertiary`, số câu `turnIndex`, nhận xét, đề xuất
  - [ ] 29.5 Panel "Đề xuất luyện tiếp trỏ về Cây Kỹ Năng": badge số bằng chứng (`bg-error-container` nếu 0, `bg-surface-container-highest` nếu > 0), nút hành động tạo `PlanItem`
  - [ ] 29.6 Hiện delta từng tiêu chí khi có `previousSession`; hiện "Phiên đầu tiên với hồ sơ này — chưa có dữ liệu so sánh" khi không có
  - [ ] 29.7 **Không** hiển thị "phân vị ứng viên" hay "độ tin cậy dữ liệu" (P7, NFR-MI-11)
  - [ ] 29.8 Nút "Xuất báo cáo PDF/JSON" — Phase 1 xuất JSON; nút PDF disable kèm ghi chú "Phase 2"
  - [ ] 29.9 Nút "Làm lại với hồ sơ này" → `/interview/setup?profile={id}`
  - [ ] 29.10 Footer: xác nhận "Dữ liệu phiên đã được lưu ngoại tuyến vào SQLite nội bộ" + nút "Luyện tập điểm yếu hôm nay" + nút "Tạo bằng chứng kỹ năng"
  - [ ] 29.11 Nút "Tạo bằng chứng kỹ năng" hiển thị trạng thái đã tạo (Evidence đã tự sinh lúc phiên `done`) — không tạo trùng
- [ ] 30. Tích hợp điều hướng
  - [ ] 30.1 Thêm "Mock Interview" vào menu góc phải S01 (nếu chưa có)
  - [ ] 30.2 Thêm link tới S18 từ S04 (chi tiết kỹ năng) — "Luyện với hồ sơ liên quan"
  - [ ] 30.3 Thêm entry "Mock Interview" vào `PlanItem` khi người dùng chọn đề xuất luyện (slot 0, `source='manual'`)

---

## 4. Kiểm thử & nghiệm thu

- [ ] 31. Unit test
  - [ ] 31.1 `rubric.ts` — clamp, lọc key lạ, đúng rubric theo kind, tổng đúng trung bình
  - [ ] 31.2 `weak-skills.ts` — thứ tự 4 khoá, AC-10, khoá ổn định, `avgRating=null`
  - [ ] 31.3 `turn-machine.ts` — `validateTurn`, `shouldFollowUp` (5 nhánh), `normalizeTurnResult`, `buildTurnPromptInput`
  - [ ] 31.4 `report.ts` — cắt 3/3, verify trích dẫn, fallback practices, validate `turnIndex`
  - [ ] 31.5 `delta.ts` — `computeSessionRubric`, `diffRubric` (delta + `direction`)
  - [ ] 31.6 `activity.ts` — `toEvidenceRating`, `pickPrimarySkill`
- [ ] 32. Integration test
  - [ ] 32.1 `POST /api/interview/start` tạo session + turn #1 đúng cấu trúc
  - [ ] 32.2 `POST /api/interview/turn` chấm + tạo turn kế tiếp trong 1 transaction
  - [ ] 32.3 Gửi 2 lần cùng `turnIndex` → `409`, không tạo turn thứ hai
  - [ ] 32.4 `POST /api/interview/report` tạo **đúng 1** Activity + 1 Evidence; gọi lại **không** tạo thêm (idempotent)
  - [ ] 32.5 `GET /api/interview/[id]` trả `deltas` đúng với 2 phiên cùng hồ sơ; **không** delta khi khác hồ sơ
  - [ ] 32.6 `POST /api/interview/flag` set `flagged=true` + ghi log
  - [ ] 32.7 Thiếu `ANTHROPIC_API_KEY` → `503 NO_API_KEY`, không tạo dữ liệu giả
- [ ] 33. E2E theo AC (Playwright)
  - [ ] 33.1 **AC-9** — mỗi câu đủ 5 tiêu chí 0–5 kèm `note`, tổng = trung bình, báo cáo đúng 3 mạnh + 3 yếu, không có tiêu chí ngoài rubric
  - [ ] 33.2 **AC-9** — trả lời hời hợt ở câu 1 → câu 2 là follow-up của câu 1 (`isFollowUp=true`, cùng `skillId`)
  - [ ] 33.3 **AC-10** — node "Lựa chọn giải pháp" (0 bằng chứng) ghim trước "Phân tích yêu cầu" (2 bằng chứng), badge P0 đúng
  - [ ] 33.4 **AC-13** — phiên 2 hiện delta từng tiêu chí + delta tổng so với phiên 1 cùng hồ sơ
  - [ ] 33.5 **AC-13** — phiên thuộc hồ sơ khác → không hiện delta, hiện "Phiên đầu tiên với hồ sơ này"
  - [ ] 33.6 **AC-MI-14** — pause giữa chừng → resume đúng câu, lượt đã trả lời còn nguyên
  - [ ] 33.7 **AC-MI-15** — phiên `done` tạo đúng 1 Activity + 1 Evidence; reload không tạo thêm
  - [ ] 33.8 **AC-MI-16** — mọi trích dẫn trong 3 điểm mạnh là nguyên văn trong `answer`
  - [ ] 33.9 **AC-MI-17** — mỗi điểm yếu hiện số câu và bấm vào mở đúng lượt
  - [ ] 33.10 **AC-MI-18** — nút đề xuất luyện tạo `PlanItem` cho ngày mai với `skillId` đúng
  - [ ] 33.11 **AC-MI-19** — đếm `AiCall{feature:'mock_interview'}` = **9** cho 1 phiên 8 câu
  - [ ] 33.12 **AC-MI-20** — bấm "Flag" → `flagged=true` + UI xác nhận
- [ ] 34. Chi phí & caching
  - [ ] 34.1 Chạy 1 phiên 8 câu → `SUM(estimatedCost)` ∈ [$0.15, $0.30]
  - [ ] 34.2 `cache_read_input_tokens` của lượt 2 > 0 (AC-5)
  - [ ] 34.3 Kiểm tra `AiCall` cho thấy `cacheWrite` chỉ xảy ra ở lượt đầu mỗi hồ sơ
- [ ] 35. A11y & responsive
  - [ ] 35.1 Chạy axe-core trên S16/S17/S18 — không có lỗi nghiêm trọng
  - [ ] 35.2 Kiểm tra 390×844: không tràn ngang, nút gửi nằm trong vùng ngón cái
  - [ ] 35.3 Kiểm tra điều hướng bàn phím trong S17: textarea → nút gửi → nút tạm dừng → nút flag
- [ ] 36. Offline mode
  - [ ] 36.1 Không có `ANTHROPIC_API_KEY` → S16 vẫn render hồ sơ + kỹ năng yếu (query SQL, không cần AI)
  - [ ] 36.2 Nút "Bắt đầu" ẩn, hiện hướng dẫn thêm key
  - [ ] 36.3 Xác nhận **không có** phản hồi AI nào được giả lập
- [ ] 37. Checklist lint & design system
  - [ ] 37.1 Chạy ESLint + TypeScript `--strict` — không có lỗi, không có `any` trong `src/lib` và `src/app/api`
  - [ ] 37.2 Kiểm tra không có hex hardcode trong component; không dùng `rounded-2xl`/`rounded-3xl`; không dùng `shadow-xl`
  - [ ] 37.3 Mọi nhãn uppercase dùng `font-label-sm` + `tracking-wider`; số liệu tabular dùng `font-code-md`
  - [ ] 37.4 Kiểm tra icon-only button có `aria-label`; icon 16–24px

## 38. AI Interview Studio — 3 loại phiên & gợi ý cụ thể (Q6)

- [ ] 38.1 Thêm `InterviewSession.sessionType` (mặc định `"interview_loop"`) — Registry `C30`
- [ ] 38.2 Thêm `InterviewSession.focusHint` (String?) — Registry `C31`
- [ ] 38.3 Tạo model `InterviewSuggestion` (Registry `M10`) hoặc hàm tính cục bộ nếu chưa duyệt
- [ ] 38.4 Viết `buildSessionSuggestions(profile, evidenceStats)` — mỗi gợi ý có `title` · `whyNow` · `focusSkillIds[]` · `questionKinds[]` · `plannedCount` · `estMinutes`
- [ ] 38.5 `whyNow` **bắt buộc** chứa số liệu Evidence thật (VD: "2/14 Evidence ở 'Lựa chọn giải pháp & đánh đổi'") — gợi ý không có số liệu thì không hiển thị (R8)
- [ ] 38.6 UI S16: khối "Gợi ý phiên cho bạn" hiển thị ≥3 gợi ý, mỗi thẻ có nút "Bắt đầu phiên này"
- [ ] 38.7 Selector loại phiên trong S16: `skill_drill` (chọn 1 node kỹ năng) · `interview_loop` · `partner_sim` (chọn vai đối tác)
- [ ] 38.8 Lịch sử nhiều phiên: ngày · hồ sơ · loại · điểm tổng · trạng thái — sắp xếp mới nhất trước
- [ ] 38.9 Nút "Gợi ý phiên tiếp theo" — chọn mục kỹ năng yếu nhất chưa có phiên gần đây
- [ ] 38.10 Test: gợi ý sinh ra luôn có `whyNow` chứa số ≥ 1 số liệu Evidence
- [ ] 38.11 Test: `sessionType` lưu đúng và hiển thị đúng trong lịch sử
