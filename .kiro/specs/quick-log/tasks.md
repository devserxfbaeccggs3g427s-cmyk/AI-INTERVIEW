# Tasks — Quick-log (Ghi nhận 10 giây)

> Phase: 0 · Phụ thuộc: `ai-foundation` (wrapper AI-02), `daily-loop-core` (S01), `skill-tree-evidence` (tính lại `Skill.level`)
> Lưu ý: tuân thủ `.kiro/steering/tech.md` (AI layer, prompt caching, structured output) và `design-system.md` (token, shape, a11y).
> Đặc tả chi tiết: `.kiro/specs/quick-log/spec.md` · `.kiro/specs/quick-log/design.md`

## 0. Nền tảng dữ liệu

- [ ] 1. Migration Prisma cho quick-log
  - [ ] 1.1 Xác nhận model `Activity` có đủ field: `domain`, `type`, `minutes`, `title`, `content`, `quality`, `skillId`, `createdAt` — không thêm model mới
  - [ ] 1.2 Xác nhận model `Evidence` có `rating Int` (1–4), `activityId`, `skillId`, `onDelete: Cascade`
  - [ ] 1.3 Thêm field `planItemId String? @unique` + relation `PlanItem?` (`onDelete: SetNull`) cho model `Activity`
  - [ ] 1.4 Thêm field `clientRequestId String? @unique` cho model `Activity` (khoá idempotency tuyệt đối — B8)
  - [ ] 1.5 Thêm field `activity Activity?` cho model `PlanItem` (quan hệ ngược)
  - [ ] 1.6 Thêm `@@index([createdAt])` cho model `Activity` (truy vấn lịch sử theo ngày)
  - [ ] 1.7 Thêm `@@index([activityId])` cho model `Evidence` (tra 1 bằng chứng / activity)
  - [ ] 1.8 Chạy `npx prisma migrate dev` và xác nhận seed vẫn chạy được
  - [ ] 1.9 Seed cây kỹ năng có đủ node lá cho cả 4 domain (professional / communication / language / personal) để autofill có `skillId` hợp lệ
- [ ] 2. Hằng số cấu hình
  - [ ] 2.1 Thêm `QUICK_LOG_MAX_SECONDS = 10` vào `src/lib/config.ts`
  - [ ] 2.2 Xác nhận có sẵn `EVIDENCE_RATING_MIN = 3`, `EVIDENCE_THRESHOLD = 3`, `SKILL_LEVEL_MAX = 5`
  - [ ] 2.3 Thêm `MIN_DESCRIPTION_LENGTH = 3`, `AUTOFILL_DEBOUNCE_MS = 450`, `DEDUPE_WINDOW_MS = 30_000`
  - [ ] 2.4 Unit test: `clampMinutes(0) === 1`, `clampMinutes(999) === 240`, `clampDifficulty(0) === 1`, `clampDifficulty(9) === 4`
- [ ] 3. Kiểu dùng chung trong `src/lib/types.ts`
  - [ ] 3.1 Khai báo `DOMAIN_KEYS` + `DomainKey` + `DomainKeySchema` (Zod enum 4 domain — P5)
  - [ ] 3.2 Khai báo `ACTIVITY_TYPES` + `ActivityType` + `ActivityTypeSchema` đúng 8 giá trị của SPEC §4: `study|write|speak|roleplay|srs|journal|health|custom`
  - [ ] 3.3 Khai báo `LogEntryInput`, `LogEntryResult`, `AutofillData` dùng chung giữa lib, route và component
  - [ ] 3.4 Viết `clampMinutes(raw)` → `[1, 240]` và `clampDifficulty(raw)` → `[1, 4]` trong `src/lib/types.ts` (dùng chung bởi `log.ts` và route autofill)

## 1. Lớp nghiệp vụ ghi

- [ ] 4. Tạo `src/lib/log.ts` — lớp nghiệp vụ trung tâm
  - [ ] 4.1 `mapTypeFromDomain(domain)` — ánh xạ domain → `type` deterministic
  - [ ] 4.2 `normalizeTitle(raw)` — trim + cắt 200 ký tự
  - [ ] 4.3 `clampMinutes(raw)` và `clampDifficulty(raw)`
  - [ ] 4.4 `recomputeSkillLevel(skillId)` — tính **tuyệt đối** `level = min(floor(count(rating ≥ 3) / EVIDENCE_THRESHOLD), SKILL_LEVEL_MAX)`
  - [ ] 4.5 `createLogEntry(input)` — transaction: tạo `Activity` → tạo `Evidence` (nếu `skillId`) → `PlanItem.done = true` (nếu `planItemId`)
  - [ ] 4.6 Dedupe 3 tầng trong `createLogEntry`: (1) `clientRequestId` khớp → trả bản ghi cũ; (2) `planItemId` khớp → trả bản ghi cũ; (3) `title`+`domain`+`minutes` trùng trong `DEDUPE_WINDOW_MS` → trả bản ghi cũ; tất cả kèm `deduped: true`
  - [ ] 4.7 `updateLogEntry(id, patch)` — sửa `Activity`, xoá + tạo lại `Evidence`, tính lại level của kỹ năng cũ **và** mới
  - [ ] 4.8 `deleteLogEntry(id)` — xoá `Activity` (cascade `Evidence`), tính lại level
  - [ ] 4.9 `listLogHistory({ date, domain, limit, offset })` — lịch sử theo ngày local + lọc domain, kèm `skillName`/`skillLevel`/`evidenceId`
  - [ ] 4.10 Trả `serverMs` trong mọi kết quả để đo AC-2
  - [ ] 4.11 Unit test `recomputeSkillLevel`: 2 bằng chứng rating 3 + 1 rating 4 → level +1; rating 2 không tính; không vượt `SKILL_LEVEL_MAX`
  - [ ] 4.12 Unit test `normalizeTitle`, `mapTypeFromDomain`, clamp functions
  - [ ] 4.13 Integration test: `createLogEntry` tạo đúng 1 `Activity` + 1 `Evidence` và `Activity.quality === Evidence.rating`
  - [ ] 4.14 Integration test: `createLogEntry` với `planItemId` → `PlanItem.done = true`; nếu bước Evidence lỗi thì `done` vẫn `false` (rollback)
  - [ ] 4.15 Integration test: gọi `createLogEntry` 2 lần trong 30 s cùng title/domain/minutes → chỉ 1 `Activity`, `deduped: true`
  - [ ] 4.16 Integration test: `updateLogEntry` đổi difficulty → `Evidence.rating` đổi + level tính lại; đổi skillId → Evidence cũ bị xoá
  - [ ] 4.17 Integration test: `deleteLogEntry` → Activity + Evidence mất, `Skill.level` giảm đúng
- [ ] 5. Tạo `src/lib/log-classify.ts` — rule cục bộ (fallback offline)
  - [ ] 5.1 `normalizeText(raw)` — lowercase, bỏ dấu tiếng Việt, gộp khoảng trắng
  - [ ] 5.2 `DOMAIN_KEYWORDS` — bảng keyword cho 4 domain (ít nhất 8 keyword/domain)
  - [ ] 5.3 `MINUTES_BY_DOMAIN` — thời lượng mặc định theo domain
  - [ ] 5.4 `matchSkill(text, skills, domain)` — khớp `name`/`nameZh` dài nhất trong domain đã lọc
  - [ ] 5.5 `inferMinutes(text, domain)` — nhận diện "45 phút"/"45'"/"45p", không có → mặc định theo domain
  - [ ] 5.6 `inferDifficulty(text)` — keyword nâng/giảm → 1..4, mặc định 2
  - [ ] 5.7 `classifyLocally(text, skills)` — hàm thuần, trả `{ domain, skillId, skillName, minutes, difficulty, type, source:"rule", reason }`
  - [ ] 5.8 Đảm bảo file **không** import Prisma và **không** import Anthropic (dùng được offline)
  - [ ] 5.9 Đảm bảo deterministic — không dùng `Math.random()`/`Date.now()` (NFR-QL-09)
  - [ ] 5.10 Unit test: snapshot 20 mẫu mô tả (tiếng Việt, tiếng Trung, tiếng Anh, kỹ thuật, cá nhân)
  - [ ] 5.11 Unit test: hòa keyword 2 domain → theo thứ tự ưu tiên cố định; danh sách `skills` rỗng → `skillId = null`, không throw

## 2. API

- [ ] 6. `POST /api/log` — đường ghi chính (AC-2)
  - [ ] 6.1 Validate body bằng `LogEntrySchema` (Zod): `title` 3–200, `domain` enum, `minutes` 1–240, `difficulty` 1–4
  - [ ] 6.2 Handler gọi `createLogEntry()` → `{ ok: true, data: { activityId, evidenceId, deduped, levelUp, serverMs } }`
  - [ ] 6.3 Error mapping: `P2025` → 404 `skill_not_found`; `P2003` → 409 `skill_domain_mismatch`; lỗi khác → 500 `internal_error`
  - [ ] 6.4 Xác nhận route **không** import Anthropic hay gọi AI (D1)
  - [ ] 6.5 Test: body sai → 400 `validation_failed`; gọi 2 lần trong 30 s → `deduped: true`
- [ ] 7. `POST /api/log/autofill` — AI-02 + fallback rule
  - [ ] 7.1 Validate body bằng `AutofillRequestSchema`: `text` 3–500 ký tự
  - [ ] 7.2 Đọc `Skill` lá (`parentId ≠ null`) từ DB → danh sách ứng viên
  - [ ] 7.3 Gọi `classifyLocally()` **luôn** để có sẵn kết quả fallback
  - [ ] 7.4 Nếu không có `ANTHROPIC_API_KEY` → trả `{ ok:true, data: fallback }` với `source: "rule"`
  - [ ] 7.5 Nếu có key → `callAIJson("AI-02", QuickLogAutofillSchema, { system: [QUICK_LOG_SYSTEM, QUICK_LOG_RUBRIC], messages, maxTokens: 512 })`
  - [ ] 7.6 Guard domain (chỉ 4 domain) → sai thì ghi `AiCall{ok:false, error:"invalid_autofill"}` và trả fallback
  - [ ] 7.7 Guard `skillId`: phải tồn tại trong DB và cùng `domain` → nếu không thì `skillId = null`
  - [ ] 7.8 Catch mọi lỗi SDK (429/401/refusal/schema) → trả fallback `source: "rule"`, **không** trả 500
  - [ ] 7.9 Test (mock AI): AI trả `domain="health"` → 200 + `source:"rule"` + `AiCall{ok:false}`
  - [ ] 7.10 Test (mock AI): AI ném `RateLimitError` → 200 + `source:"rule"`, không 500
- [ ] 8. `GET /api/log/history?date=&domain=&limit=&offset=`
  - [ ] 8.1 Validate query bằng `HistoryQuerySchema` — `date` theo regex `yyyy-MM-dd`, `domain` ∈ {all, 4 domain}, `limit` 1–200
  - [ ] 8.2 Handler gọi `listLogHistory()` → `{ ok:true, data: { date, count, items } }`
  - [ ] 8.3 Mặc định `date` = hôm nay local, `domain` = `all`, `limit` = 50
  - [ ] 8.4 Test: `domain=language` chỉ trả hoạt động language; `date` sai định dạng → 400
- [ ] 9. `PATCH /api/log/[id]` — sửa 1 mục
  - [ ] 9.1 Validate body bằng `UpdateLogSchema` (mọi field optional)
  - [ ] 9.2 Handler gọi `updateLogEntry()` → trả `{ activityId, evidenceId, levelUp, skillChanged }`
  - [ ] 9.3 Error mapping: `P2025` → 404 `not_found`
  - [ ] 9.4 Test: đổi `difficulty` → `Evidence.rating` đổi; đổi `skillId` → Evidence cũ bị xoá, level cả 2 kỹ năng tính lại
- [ ] 10. `DELETE /api/log/[id]` — xoá 1 mục
  - [ ] 10.1 Handler gọi `deleteLogEntry()` → trả `{ deleted, skillId, levelBefore, levelAfter }`
  - [ ] 10.2 Error mapping: `P2025` → 404 `not_found`
  - [ ] 10.3 Test: xoá → Activity + Evidence mất khỏi DB, `Skill.level` giảm đúng

## 3. AI (AI-02)

- [ ] 11. Prompt & schema cho AI-02 trong `src/lib/prompts.ts`
  - [ ] 11.1 Thêm hằng số `QUICK_LOG_SYSTEM` — mô tả nhiệm vụ + 4 quy tắc bắt buộc (chỉ 4 trường, domain đóng băng, `skillId` phải có trong danh sách, không suy diễn)
  - [ ] 11.2 Thêm hằng số `QUICK_LOG_RUBRIC` — bảng ánh xạ domain + thang difficulty 1–4
  - [ ] 11.3 Thêm Zod schema `QuickLogAutofillSchema` = `{ domain: enum 4, skillId: string|null, minutes: int 1–240, difficulty: int 1–4 }`
  - [ ] 11.4 Thêm `buildAutofillMessage(text, skills)` — dựng nội dung biến động đặt trong `messages`
  - [ ] 11.5 Unit test: `buildAutofillMessage` **không** chứa `Date.now()`, UUID hay ngày tháng (bảo toàn cache prefix)
- [ ] 12. Kết nối AI-02 với wrapper AI
  - [ ] 12.1 Xác nhận `AI_ROUTES["AI-02"]` trong `src/lib/anthropic.ts` có `model: "claude-haiku-4-5"`, `streaming: false`, `effort: "low"`, `feature: "quick_log_autofill"`
  - [ ] 12.2 Đặt `cache_control: { type: "ephemeral" }` trên block `QUICK_LOG_RUBRIC` (block cuối của `system`)
  - [ ] 12.3 Xác nhận mọi nội dung biến động (mô tả người dùng, danh sách kỹ năng) nằm trong `messages`, không nằm trong `system`
  - [ ] 12.4 Xác nhận `AiCall` được ghi với `feature: "quick_log_autofill"` + tokens + cacheRead/cacheWrite + `estimatedCost`
  - [ ] 12.5 Test: 2 call liên tiếp → `usage.cache_read_input_tokens > 0` ở call thứ 2
  - [ ] 12.6 Test: `stop_reason === "refusal"` → `AiCall{ok:false, error:"refusal"}`, route trả fallback rule, không 500

## 4. UI — Sheet S05 (`/log`)

- [ ] 13. Route `src/app/log/page.tsx`
  - [ ] 13.1 Render `<QuickLogSheet open aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)} />` (deep-link vào sheet)
  - [ ] 13.2 Không gọi AI ở server component (sheet phải hiện tức thì)
- [ ] 14. Component `src/components/quick-log/quick-log-sheet.tsx` (Client)
  - [ ] 14.1 State machine: `closed → open → saving → closed`, dùng `useReducer`
  - [ ] 14.2 Header: icon ⚡ trong `bg-primary-container rounded-lg`, tiêu đề `font-headline-sm text-on-surface`, badge đồng hồ `bg-primary/10 text-primary rounded-full font-code-md`
  - [ ] 14.3 Badge đồng hồ đổi `bg-tertiary/10 text-tertiary` khi vượt `QUICK_LOG_MAX_SECONDS`
  - [ ] 14.4 Render 6 preset chip đúng nhãn prototype: `1 ⚡ Học 25'` · `2 🎯 Luyện tập` · `3 ✍️ Viết` · `4 🎙️ Luyện nói` · `5 📓 Nhật ký` · `6 🌱 Chăm sóc bản thân`
  - [ ] 14.5 Preset chip style `bg-surface-container-high rounded-lg font-label-md text-label-md`, số thứ tự theo màu domain; click → điền mô tả + focus input
  - [ ] 14.6 Bắt phím `1`–`6` khi focus **không** nằm trong ô nhập
  - [ ] 14.7 Input `bg-surface-container rounded-lg font-body-md text-body-md placeholder:text-outline`, nút `⌫` (xoá) và `🎙` (STT) với `aria-label`
  - [ ] 14.8 Ẩn nút `🎙` nếu trình duyệt không hỗ trợ `SpeechRecognition`
  - [ ] 14.9 Nút "⚡ Ghi nhanh ngay (Enter)" style `bg-primary-container text-on-primary rounded-lg font-code-md font-semibold` + `hover:brightness-105 active:scale-[0.98]`
  - [ ] 14.10 Bắt `Enter` (không `Shift`) trong input để ghi nhanh; `⌘/Ctrl+Enter` để lưu chi tiết
  - [ ] 14.11 Panel Bước 2 luôn render (skeleton khi chưa có kết quả) — không layout shift khi AI trả về
  - [ ] 14.12 Ô domain: chấm màu domain + nhãn + nút "Sửa" mở chọn 4 domain
  - [ ] 14.13 Ô kỹ năng: icon `account_tree text-primary`, tên `text-primary font-semibold`, chip `bg-primary/10 text-primary`; không có → "Chưa gắn kỹ năng"
  - [ ] 14.14 Chip thời lượng 15′/25′/45′/60′ — chọn: `bg-tertiary text-on-tertiary font-semibold`, chưa chọn: `bg-surface-container-high`
  - [ ] 14.15 4 ngôi sao mức độ khó — đã chọn `text-tertiary` + `FILL 1`, chưa chọn `text-outline-variant`
  - [ ] 14.16 Toggle "Tự động tạo 1 Evidence" — mặc định bật, dùng `accent-primary`
  - [ ] 14.17 Ô ghi chú (tuỳ chọn, ≤500 ký tự)
  - [ ] 14.18 Footer: "Bỏ qua & Đóng" (ghost `text-outline`), "Lưu chi tiết & Đóng (⌘⏎)" (`bg-primary-container text-on-primary`)
  - [ ] 14.19 **Ẩn** nút "AI Tóm tắt & Rút kinh nghiệm" ở Phase 0 (FR-QL-15)
  - [ ] 14.20 Debounce 450 ms gọi `POST /api/log/autofill` + `AbortController` huỷ request cũ
  - [ ] 14.21 Không ghi đè field người dùng đã sửa tay (flag `touched` theo từng field)
  - [ ] 14.22 Guard `saving === true` chặn Enter lặp; disable nút + `readOnly` cho input trong lúc ghi
  - [ ] 14.23 `Esc` đóng sheet (bỏ qua khi `saving`); đóng thì trả focus về nút mở
  - [ ] 14.24 Toast thành công: `bg-surface-container-highest border border-primary/30 rounded-xl`, `aria-live="polite"`, tự tắt sau 3.2 s
  - [ ] 14.25 Toast lỗi: nền `bg-error-container`, nút "Thử lại", **giữ nguyên** nội dung form
  - [ ] 14.26 Hiển thị dòng nhỏ "AI không phân loại được — đã dùng rule cục bộ" (`text-outline`) khi rơi về fallback
  - [ ] 14.27 Đổi nhãn "Haiku 4.5 tự parsing…" thành "Rule cục bộ tự phân loại…" khi `aiEnabled === false`
  - [ ] 14.28 Kiểm tra không có hex hardcode trong file
- [ ] 15. Component `src/components/quick-log/quick-log-launcher.tsx` (Client)
  - [ ] 15.1 Nút "+ Ghi nhanh (≤10s)" style `bg-primary-container text-on-primary` + icon `bolt` — mở sheet bằng state cục bộ, **không** fetch, **không** chờ AI
  - [ ] 15.2 Nhận prop `planItem` (id, action, domain, minutes, skillId) cho đường FR-DL-03
  - [ ] 15.3 Nút "Xong" gửi `POST /api/log` với `planItemId` + `clientRequestId: ${planItem.id}:done`
  - [ ] 15.4 `router.refresh()` sau khi ghi thành công để S01 re-render slot ở trạng thái done
  - [ ] 15.5 Trả focus về nút mở sau khi sheet đóng
- [ ] 16. Component `src/components/quick-log/log-edit-dialog.tsx`
  - [ ] 16.1 Modal sửa: title, domain, type, thời lượng, mức độ khó, kỹ năng, ghi chú — nạp sẵn giá trị hiện tại
  - [ ] 16.2 Nút lưu → `PATCH /api/log/[id]`; báo lỗi nếu 409/404
  - [ ] 16.3 Đóng bằng `Esc` hoặc nút ✕; focus trap trong modal
- [ ] 17. Component `src/components/quick-log/log-delete-dialog.tsx`
  - [ ] 17.1 Hộp xác nhận: "Xoá hoạt động này? Bằng chứng cũng sẽ bị xoá."
  - [ ] 17.2 Nút xoá → `DELETE /api/log/[id]` → refresh danh sách
  - [ ] 17.3 Nút huỷ không gọi API

## 5. UI — Lịch sử S05 (`/log/history`)

- [ ] 18. Route `src/app/log/history/page.tsx` (Server Component)
  - [ ] 18.1 Đọc `searchParams.date` / `searchParams.domain`, validate bằng `HistoryQuerySchema`
  - [ ] 18.2 Gọi `listLogHistory()` và render `<LogHistory items={…} total={…} initialDomain={…} />`
  - [ ] 18.3 Mặc định `date` = hôm nay local
- [ ] 19. Component `src/components/quick-log/log-history.tsx` (Client)
  - [ ] 19.1 Chip lọc: "Tất cả (n)" + 4 domain; active `bg-surface-container-high text-on-surface font-semibold`, inactive `text-outline`
  - [ ] 19.2 Số đếm trên chip "Tất cả" = `total` thật từ server
  - [ ] 19.3 Lọc domain **client-side** trên tập đã nạp (không reload) và cập nhật URL bằng `router.replace`
  - [ ] 19.4 Item: giờ `font-code-md text-label-sm` màu theo domain, chip domain `bg-<domain>/10 text-<domain>`, phút `font-code-md text-outline`
  - [ ] 19.5 Badge "✓ Evidence" (`bg-primary/10 text-primary` + icon `verified`) chỉ hiện khi có `evidenceId`
  - [ ] 19.6 Dòng node: icon `account_tree` + tên kỹ năng; dòng "Độ khó: n/4 ★" theo màu domain
  - [ ] 19.7 Nút "Sửa" mở `LogEditDialog`, nút "Xoá" mở `LogDeleteDialog`
  - [ ] 19.8 Empty state "Chưa có hoạt động nào hôm nay" + CTA `bg-primary-container text-on-primary` quay lại `/`
  - [ ] 19.9 Empty state theo domain "Chưa có hoạt động cho domain này"
  - [ ] 19.10 Render "SQLite: {n} logs cached" + link "Xem toàn bộ dòng thời gian →"
- [ ] 20. Tích hợp từ S01
  - [ ] 20.1 Chèn `<QuickLogLauncher aiEnabled={…} />` vào thanh hành động của S01 (đúng vị trí nút "+ Ghi nhanh" trong prototype)
  - [ ] 20.2 Chèn nút "Xong" theo từng slot `PlanItem`, truyền `planItem` vào `QuickLogLauncher`
  - [ ] 20.3 Xác nhận bấm "Xong" tạo `Activity` + `Evidence` + `PlanItem.done = true` (AC-QL-6)
  - [ ] 20.4 Slot đã `done` không hiện nút "Xong" (chỉ hiện "Xem lại")

## 6. Kiểm thử & nghiệm thu

- [ ] 21. Unit test
  - [ ] 21.1 `classifyLocally` — snapshot 20 mẫu mô tả
  - [ ] 21.2 `recomputeSkillLevel` — ngưỡng rating 3, ngưỡng 3 bằng chứng, trần level 5
  - [ ] 21.3 `normalizeTitle` / `normalizeText` / `clampMinutes` / `clampDifficulty` / `mapTypeFromDomain`
  - [ ] 21.4 `buildAutofillMessage` không chứa `Date.now()`/UUID
- [ ] 22. Integration test (Vitest + SQLite test DB)
  - [ ] 22.1 `POST /api/log` tạo 1 `Activity` + 1 `Evidence`, `quality === rating`
  - [ ] 22.2 `POST /api/log` 2 lần trong 30 s → 1 bản ghi, `deduped: true`
  - [ ] 22.3 `POST /api/log` với `planItemId` → `PlanItem.done = true` + rollback khi Evidence lỗi
  - [ ] 22.4 `POST /api/log/autofill` mock AI trả domain sai → 200 + `source:"rule"` + `AiCall{ok:false}`
  - [ ] 22.5 `POST /api/log/autofill` mock AI lỗi 429 → 200 + `source:"rule"`, không 500
  - [ ] 22.6 `GET /api/log/history` lọc theo ngày + domain đúng
  - [ ] 22.7 `PATCH /api/log/[id]` đổi difficulty/skillId → Evidence + level cập nhật đúng
  - [ ] 22.8 `DELETE /api/log/[id]` → Activity + Evidence mất, level giảm đúng
- [ ] 23. E2E (Playwright) theo AC
  - [ ] 23.1 **AC-2**: mở sheet → bấm preset → bấm "Ghi nhanh ngay" → toast trong **≤10 000 ms** (đo `performance.now()`), DB có đúng 1 `Activity`
  - [ ] 23.2 **AC-2 (offline)**: chặn network toàn bộ → ghi nhanh vẫn tạo `Activity` trong SQLite
  - [ ] 23.3 **AC-QL-1**: bấm preset `2 🎯 Luyện tập` → `Activity` có `domain="professional"`, `type="study"`, `minutes` theo preset
  - [ ] 23.4 **AC-QL-4**: bấm Enter 5 lần trong 1 s → DB có đúng 1 `Activity`
  - [ ] 23.5 **AC-QL-5**: ghi với mức độ khó 4 ⭐ → `Skill.level` tăng 1; với 2 ⭐ → level **không** đổi
  - [ ] 23.6 **AC-QL-6**: bấm "Xong" ở S01 → slot done + `Activity` + `Evidence` + `PlanItem.done = true`
  - [ ] 23.7 **AC-QL-3**: bỏ `ANTHROPIC_API_KEY` → ghi thành công + badge "Rule cục bộ"
  - [ ] 23.8 **AC-QL-7**: sửa mức độ khó → DB đổi; xoá mục → mất khỏi DB và khỏi danh sách
  - [ ] 23.9 **AC-QL-8**: chip "Ngoại ngữ" lọc đúng số mục, URL đổi theo filter
  - [ ] 23.10 **AC-QL-9**: mock AI trả domain sai → `Activity.domain` vẫn thuộc 4 domain hợp lệ
  - [ ] 23.11 **AC-QL-10**: viewport 390×844, tab-order hợp lệ, `Esc` đóng sheet và focus trả về nút mở
- [ ] 24. Kiểm tra a11y
  - [ ] 24.1 Chạy axe trên `/log` và `/log/history` — không lỗi nghiêm trọng
  - [ ] 24.2 Mọi icon-only button có `aria-label`
  - [ ] 24.3 Focus ring `focus-visible:ring-2 focus-visible:ring-primary` trên mọi control
  - [ ] 24.4 Toast dùng `aria-live="polite"`
  - [ ] 24.5 `Esc` đóng sheet/modal và trả focus về phần tử mở
- [ ] 25. Kiểm tra responsive 390px
  - [ ] 25.1 Sheet dùng được ở 390×844: 2 preset chip + input + CTA nằm trong 1 màn hình
  - [ ] 25.2 Nút "Ghi nhanh ngay" nằm trong vùng ngón cái, không cần cuộn
  - [ ] 25.3 Lịch sử không tràn ngang, chip lọc cuộn được
- [ ] 26. Kiểm tra hiệu năng AC-2
  - [ ] 26.1 Đo p95 thời gian ghi trên 20 lượt liên tiếp → ≤10 000 ms
  - [ ] 26.2 `serverMs` trả về < 2000 ms
  - [ ] 26.3 Sheet render ở frame đầu tiên khi network bị chặn (không chờ AI)
- [ ] 27. Kiểm tra chế độ offline
  - [ ] 27.1 Không có `ANTHROPIC_API_KEY` → autofill trả `source:"rule"`, ghi vẫn thành công
  - [ ] 27.2 Không có phản hồi nào được giả lập là của AI (badge nguồn luôn phản ánh thật)
  - [ ] 27.3 Mất mạng giữa lúc ghi → thông báo lỗi + giữ nguyên form, không đóng sheet
- [ ] 28. Nghiệm thu tổng
  - [ ] 28.1 Chạy lại toàn bộ AC trong `spec.md` §8 và tick từng AC
  - [ ] 28.2 Đối chiếu từng FR-QL trong `spec.md` §3 với task đã implement
  - [ ] 28.3 Xác nhận không sửa file ngoài `.kiro/specs/quick-log/` và không thêm model Prisma mới

## 29. Ngôn ngữ của hoạt động (Q2)

- [ ] 29.1 Thêm `Activity.language` (String?, Registry `C34`)
- [ ] 29.2 Sheet quick-log: chọn ngôn ngữ khi preset là hoạt động ngoại ngữ (`en`/`zh`/`vi`)
- [ ] 29.3 `vi` là bản ngữ → **không** tạo Evidence SRS, chỉ tạo Evidence kỹ năng giao tiếp nếu có
- [ ] 29.4 Lịch sử hiển thị nhãn ngôn ngữ cạnh domain
- [ ] 29.5 Test: ghi hoạt động `zh` → `Activity.language = "zh"`; `vi` → không có Evidence language
