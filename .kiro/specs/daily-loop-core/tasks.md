# Tasks — Daily Loop & Sinh Kế Hoạch AI

> Phase: 0 · Phụ thuộc: `ai-foundation` (lớp AI: `src/lib/anthropic.ts`, `src/lib/prompts.ts`), `skill-tree-evidence` (cây kỹ năng + `Evidence`), `quick-log` (sheet + AI-02 autofill)
> Lưu ý: tuân thủ `.kiro/steering/tech.md` (AI layer, prompt caching, structured output) và `.kiro/steering/design-system.md` (token, shape, a11y).
> Feature này **sở hữu**: `PlanItem`, `src/lib/db.ts`, `src/lib/dates.ts`, `src/lib/config.ts`, `src/lib/plan.ts`, `src/lib/daily-loop.ts`, route `/api/plan/**`, UI S01 + S02.
>
> **Trace FR → task:**

| FR | Task phục vụ |
|---|---|
| FR-DL-01 | 4.2, 19.1–19.3, 25.4, 26.4 |
| FR-DL-02 | 6.1, 19.2, 26.4 |
| FR-DL-03 | 8.1–8.5, 16.2, 19.5 |
| FR-DL-04 | 22.1–22.4 (phần trigger + AI-02; sheet đầy đủ thuộc `quick-log`) |
| FR-DL-05 | 5.1–5.9, 21.1–21.3 |
| FR-DL-06 | 7.1, 12.8, 23.4–23.5 |
| FR-DL-07 | 12.2, 24.1–24.3, 13.2 |
| FR-DL-08 | 6.4, 14.1, 24.4 |
| FR-DL-SLOT-01..05 | 2.2, 4.2, 10.7–10.8, 13.2 |
| FR-DL-AI-01..07 | 10.2–10.14, 11.1–11.6, 12.1–12.14 |
| FR-DL-02a..02f | 19.1–19.4, 25.3–25.4, 26.1–26.18, 27.1–27.4 |

## 0. Nền tảng dữ liệu

- [ ] 1. Model `PlanItem`
  - [ ] 1.1 Xác nhận model `PlanItem` trong `prisma/schema.prisma` khớp SPEC §4 (`date`, `slot` 0..5, `domain`, `action`, `detail`, `minutes`, `skillId`, `done`, `source`, `createdAt`, `@@index([date])`)
  - [ ] 1.2 Xác nhận model `Activity` có `skillId`, `domain`, `type`, `minutes`, `title`, `content`, `quality`, `createdAt` (không tách theo domain)
  - [ ] 1.3 Xác nhận model `Evidence` có `activityId`, `skillId`, `rating` 1..4, `onDelete: Cascade`, `@@index([skillId])`
  - [ ] 1.4 Xác nhận `src/lib/db.ts` export singleton `prisma`
  - [ ] 1.5 Chạy `npx prisma migrate dev` nếu schema chưa khớp SPEC §4
- [ ] 2. Hằng số cấu hình (`src/lib/config.ts`)
  - [ ] 2.1 Khai báo `SLOT_COUNT = 6`
  - [ ] 2.2 Khai báo `SLOT_DOMAINS = ["professional","communication","language","language","personal","personal"]` (SPEC §2.1)
  - [ ] 2.3 Khai báo `PLAN_FALLBACK_SOURCE = "fallback"` và `PLAN_SOURCES = ["ai","manual","fallback"]`
  - [ ] 2.4 Khai báo `PLAN_MINUTES_MIN = 90`, `PLAN_MINUTES_MAX = 150` (tổng cam kết trong ngày)
  - [ ] 2.5 Unit test: `SLOT_DOMAINS.length === SLOT_COUNT` và domain từng slot khớp SPEC §2.1
- [ ] 3. Module ngày (`src/lib/dates.ts`)
  - [ ] 3.1 Viết `startOfDay(date)`, `endOfDay(date)` trả `Date` theo giờ local
  - [ ] 3.2 Viết `toDateKey(date)` trả chuỗi `yyyy-MM-dd` theo giờ local
  - [ ] 3.3 Viết `parseDateKey(key)` trả `Date` local 00:00 (không dùng `new Date("yyyy-mm-dd")` — parse theo UTC)
  - [ ] 3.4 Viết `addDays(date, n)`
  - [ ] 3.5 Unit test: timezone biên nửa đêm (`23:59:59` và `00:00:01` cùng ngày vẫn ra cùng `dateKey`)
- [ ] 4. Hợp đồng slot (`src/lib/daily-loop.ts` — phần thuần)
  - [ ] 4.1 Khai báo type `Domain`, `PlanSource`, `SlotKind`, `PlanSlotDTO`, `PlanForDate`, `WeeklyEnergy`, `FocusSkill`, `PlanContext`
  - [ ] 4.2 Viết `slotContract(slot)` trả `{ slot, domain, kind, minMinutes, maxMinutes, content }` theo bảng SPEC §2.1
  - [ ] 4.3 Unit test: `slotContract` đúng domain/kind/khoảng phút cho slot 0..5
  - [ ] 4.4 Unit test: `slotContract(6)` ném lỗi (ngoài phạm vi 0..5)
- [ ] 5. Tính streak & năng lượng tuần
  - [ ] 5.1 Viết `computeStreak(activeDates, today)` — hôm nay chưa có hoạt động thì bắt đầu từ hôm qua
  - [ ] 5.2 Viết `computeWeeklyEnergy(days)` — `pct = round(100 * doneSlots / totalSlots)`, `hasData = totalSlots > 0`
  - [ ] 5.3 Viết `getActiveDates(today)` — query `Activity.createdAt` trong 365 ngày
  - [ ] 5.4 Viết `getWeeklyPlanStats(today)` — 1 query `groupBy` theo `date` × `done` trong 7 ngày
  - [ ] 5.5 Unit test: streak = 0 khi không có ngày nào có hoạt động
  - [ ] 5.6 Unit test: streak không reset giữa ngày (hôm nay chưa làm, 3 ngày trước có ⇒ 3)
  - [ ] 5.7 Unit test: chuỗi bị đứt ở giữa ⇒ dừng đúng tại chỗ đứt
  - [ ] 5.8 Unit test: năng lượng tuần 33/42 ⇒ `79`; ngày không có kế hoạch **không** vào mẫu số
  - [ ] 5.9 Unit test: tuần chưa có ngày nào có kế hoạch ⇒ `hasData = false`, `pct = 0`
  - [ ] 5.10 Integration test: tạo `PlanItem` 42 dòng (33 done) trong SQLite test ⇒ `getWeeklyPlanStats` trả `pct = 79`

## 1. Lớp nghiệp vụ

- [ ] 6. Đọc kế hoạch & dữ liệu trọng tâm
  - [ ] 6.1 Viết `getPlanItems(date)` — `findMany` theo ngày, `orderBy slot asc`, map sang `PlanSlotDTO`
  - [ ] 6.2 Viết `getPlanForDate(date)` — gom `items`, `doneCount`, `totalCount`, `source` (`ai|manual|fallback|mixed`), `weeklyEnergy`, `streak`
  - [ ] 6.3 Viết `getFocusSkill(date)` — skill có nhiều `Evidence` nhất trong 7 ngày; tính `evidenceCount`, `strongEvidenceCount` (rating ≥ 3), `minutesAccumulated` (chỉ `Activity` có `skillId`), `criteriaProgressPct`
  - [ ] 6.4 Viết `listPlanDates(limit)` — lịch sử theo ngày (FR-DL-08b), sắp giảm dần
  - [ ] 6.5 Unit test: `getPlanForDate` trả `doneCount`/`totalCount` khớp `COUNT(*)`/`COUNT(done)`
  - [ ] 6.6 Integration test: `minutesAccumulated` **chỉ** tính `Activity` có `skillId` (P7 — không tính hoạt động không gắn kỹ năng)
- [ ] 7. Merge kế hoạch & giữ slot đã done
  - [ ] 7.1 Viết `mergeRegeneratedPlan(existing, incoming)` — slot `done = true` giữ nguyên 100%; slot chưa done lấy nội dung mới; slot thiếu thì giữ cũ; không mutate input
  - [ ] 7.2 Viết `validateDomainMix(items)` — đếm theo domain, so với `{professional:1, communication:1, language:2, personal:2}`
  - [ ] 7.3 Unit test: merge giữ nguyên `action`/`detail`/`minutes`/`skillId`/`done` của slot đã xong
  - [ ] 7.4 Unit test: merge trả `keptDone` đúng số slot đã xong
  - [ ] 7.5 Unit test: merge không mutate mảng input
  - [ ] 7.6 Unit test: `validateDomainMix` fail khi thiếu 1 slot language hoặc thừa 1 slot personal
  - [ ] 7.7 Unit test: `validateDomainMix` ok với 6 slot đúng tập domain
- [ ] 8. Đánh dấu hoàn thành (FR-DL-03)
  - [ ] 8.1 Viết `completePlanItem({ date, slot, quality?, minutes?, note? })` trong `prisma.$transaction`
  - [ ] 8.2 Guard idempotent: slot đã `done` ⇒ trả `{ alreadyDone: true }`, **không** tạo `Activity`/`Evidence` lần 2
  - [ ] 8.3 Tạo `Activity` với `type = slotContract(slot).kind`, `minutes` mặc định = `PlanItem.minutes`, `title = action`, `content = detail`
  - [ ] 8.4 Tạo `Evidence` khi `skillId ≠ null`, `rating = quality ?? 3` (mặc định đạt ngưỡng `EVIDENCE_RATING_MIN`)
  - [ ] 8.5 Update `PlanItem.done = true` trong cùng transaction
  - [ ] 8.6 Khai báo lỗi typed `PlanItemNotFoundError`, `InvalidSlotError`, `InvalidDomainMixError`
  - [ ] 8.7 Integration test: 1 lần bấm "Xong" ⇒ tạo đúng 1 `Activity` + 1 `Evidence` + `PlanItem.done = true`
  - [ ] 8.8 Integration test: slot không có `skillId` ⇒ tạo `Activity` nhưng **không** tạo `Evidence`
  - [ ] 8.9 Integration test: bấm 2 lần liên tiếp ⇒ chỉ 1 `Activity`, response lần 2 có `alreadyDone: true`
  - [ ] 8.10 Integration test: 2 request song song ⇒ chỉ 1 `Activity` (race condition)
  - [ ] 8.11 Unit test: `Skill.level` **không** đổi sau 1 bằng chứng (P3 — level chỉ tăng qua ngưỡng)
- [ ] 9. Duyệt & áp dụng kế hoạch
  - [ ] 9.1 Viết `applyPlan({ date, items, source? })` — kiểm `validateDomainMix` **trước** transaction
  - [ ] 9.2 Trong transaction: `deleteMany({ date, done: false })` ⇒ **không** xoá row `done = true`
  - [ ] 9.3 `createMany` các slot chưa done với `source` truyền vào (`ai` | `manual` | `fallback`)
  - [ ] 9.4 Trả `{ applied, keptDone, totalMinutes }`
  - [ ] 9.5 Integration test: duyệt 2 lần ⇒ vẫn đúng 6 row, không nhân bản
  - [ ] 9.6 Integration test: có 2 row `done = true` rồi duyệt ⇒ 2 row đó giữ nguyên `action`/`minutes`/`done`
  - [ ] 9.7 Integration test: payload vi phạm bất biến 4 trục ⇒ ném `InvalidDomainMixError`, **không** ghi DB

## 2. AI layer — AI-01

- [ ] 10. Prompt & schema (dùng hằng số của `ai-foundation`, không nhân bản)
  - [ ] 10.1 Xác nhận `src/lib/prompts.ts` đã có `STABLE_SYSTEM` + `buildSystemBlocks()`
  - [ ] 10.2 Khai báo `PLAN_SYSTEM_V1` — luật lệ sinh kế hoạch 6 slot, **không** chứa ngày/tên skill/số liệu sinh trắc/`aiTone`
  - [ ] 10.3 Khai báo `PLAN_SLOT_CONTRACT_V1` — bảng 6 slot (domain + kind + khoảng phút + nội dung) dạng hằng số
  - [ ] 10.4 Viết `buildPlanSystemBlocks()` — `[PLAN_SYSTEM_V1, PLAN_SLOT_CONTRACT_V1(cache_control: ephemeral)]`
  - [ ] 10.5 Unit test: block cuối của `buildPlanSystemBlocks()` luôn có `cache_control.type === "ephemeral"`
  - [ ] 10.6 Unit test: quét `PLAN_SYSTEM_V1` + `PLAN_SLOT_CONTRACT_V1` không chứa pattern ISO date, UUID, `Date.now()`, `new Date`, `aiTone`
  - [ ] 10.7 Viết `PlanSchema` — `slots` đúng `.length(6)`, `slot` 0..5, `domain` enum, `action` ≤160, `detail` ≤120, `minutes` 5..90, `skillName` nullable
  - [ ] 10.8 Thêm `superRefine`: mỗi slot 0..5 đúng một lần; `domain` khớp `SLOT_DOMAINS[slot]`; `minutes` trong khoảng `slotContract(slot)`
  - [ ] 10.9 Unit test: payload đủ 6 slot đúng domain + đúng khoảng phút ⇒ parse thành công
  - [ ] 10.10 Unit test: payload 5 slot ⇒ parse fail
  - [ ] 10.11 Unit test: payload trùng `slot` ⇒ parse fail
  - [ ] 10.12 Unit test: payload đổi `domain` của slot 2 ⇒ parse fail
  - [ ] 10.13 Unit test: payload `minutes` ngoài khoảng slot ⇒ parse fail
  - [ ] 10.14 Test preflight: độ dài prefix (`tools + system`) ≥ `CACHE_MIN_TOKENS["claude-opus-5"]`
- [ ] 11. Dựng context biến động cho AI-01
  - [ ] 11.1 Viết `getPlanContext(date)` — skills (id, name, domain, level, targetLevel, evidenceCount, strongEvidenceCount, parentName), dailyState, last7Days, lockedSlots (slot done), slotContract
  - [ ] 11.2 Giới hạn tối đa 40 kỹ năng, sắp xếp theo ưu tiên (level thấp → ít bằng chứng) để phần bị cắt là phần ít quan trọng
  - [ ] 11.3 Viết `buildPlanUserMessage(ctx)` — **toàn bộ** nằm trong `messages`, không đặt trong `system`
  - [ ] 11.4 Nêu rõ slot đã xong là **ràng buộc không được đề xuất lại** trong message
  - [ ] 11.5 Unit test: `buildPlanUserMessage` chứa mọi slot đã xong và câu ràng buộc tương ứng
  - [ ] 11.6 Unit test: `buildPlanUserMessage` **không** chứa `ANTHROPIC_API_KEY` hay nội dung nhật ký cá nhân
- [ ] 12. `POST /api/plan/generate` (streaming SSE)
  - [ ] 12.1 Validate body bằng `GeneratePlanBodySchema` (Zod): `date` regex `yyyy-MM-dd`, `mode` enum, `keepDone` boolean
  - [ ] 12.2 Handler: `!isAiAvailable()` ⇒ `generateFallbackPlan(listSkillsForPlan(), { date })` ⇒ phát event `done` với `source: "fallback"`, **không** gọi network
  - [ ] 12.3 `mode === "fallback"` ⇒ luôn dùng bộ sinh rule cục bộ, bỏ qua AI
  - [ ] 12.4 Gọi `streamAI("AI-01", { system: buildPlanSystemBlocks(), messages })` — `effort: medium`, `model: claude-opus-5` theo bảng routing
  - [ ] 12.4b Xác nhận `ai-foundation` đã hỗ trợ `streamAI(code, { schema })` (streaming **kèm** structured output); nếu chưa có ⇒ mở task bổ sung ở `ai-foundation` (không tự import SDK trong feature này)
  - [ ] 12.5 Đóng gói response: `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`
  - [ ] 12.6 Phát event `slot` cho từng slot đã validate (parse JSON khi đủ → `PlanSchema.safeParse`)
  - [ ] 12.7 Phát event `usage` khi có usage (input/output/cacheRead/cacheWrite/estimatedCost/latencyMs)
  - [ ] 12.8 Phát event `done` với 6 slot đã merge `mergeRegeneratedPlan` (giữ slot done) + `keptDone`
  - [ ] 12.9 Phát event `error` `{ code, message }` khi lỗi typed; **không** ghi `PlanItem` ở route này
  - [ ] 12.10 Handler `catch` typed error → map sang event `error`, không để lỗi làm sập route
  - [ ] 12.11 Test: offline trả `done` với `source:"fallback"` và đúng 6 slot
  - [ ] 12.12 Test: schema fail ⇒ **không** phát event `slot` cho phần sai, phát `error` với `code:"schema_invalid"`
  - [ ] 12.13 Test: stream ngắt giữa chừng ⇒ `AiCall{ok:false, error:"stream_interrupted"}`, không ghi DB
  - [ ] 12.14 Test: `usage.cache_read_input_tokens > 0` ở lần gọi thứ 2 (AC-DL-10 / AC-5)
- [ ] 13. Bộ sinh offline (`src/lib/plan.ts`)
  - [ ] 13.1 Viết `listSkillsForPlan()` — query `Skill` + đếm `Evidence` rating ≥ 3
  - [ ] 13.2 Viết `generateFallbackPlan(skills, { date })` — đúng 6 slot, domain theo `SLOT_DOMAINS`, tiêu đề = tên kỹ năng, `source: "fallback"`
  - [ ] 13.3 Viết `prioritizeSkills(skills)` — level thấp nhất → ít bằng chứng nhất → id (không mutate input)
  - [ ] 13.4 Viết `dayOffset(date)` — deterministic theo ngày local, **không** dùng `Math.random()`
  - [ ] 13.5 Unit test: không có kỹ năng nào ⇒ vẫn ra 6 slot dùng action mặc định theo domain
  - [ ] 13.6 Unit test: 2 ngày liên tiếp ra kỹ năng khác nhau (offset xoay vòng)
  - [ ] 13.7 Unit test: cùng ngày + cùng input ⇒ kết quả giống hệt
  - [ ] 13.8 Unit test: `plan.ts` không import `@anthropic-ai/sdk`
  - [ ] 13.9 Unit test: slot 3 (language thứ 2) lấy kỹ năng khác slot 2

## 3. API — ghi dữ liệu

- [ ] 14. `GET /api/plan?date=` và `GET /api/plan/[date]`
  - [ ] 14.1 Validate `date` bằng `parseDateKey` ⇒ 400 `{ ok:false, error:"invalid_date" }` nếu sai
  - [ ] 14.2 Handler gọi `getPlanForDate` ⇒ `{ ok:true, data:{ date, items, doneCount, totalCount, source, weeklyEnergy, streak } }`
  - [ ] 14.3 Mặc định `date` = hôm nay
  - [ ] 14.4 Test: ngày hợp lệ, ngày sai định dạng, ngày không tồn tại (trả mảng rỗng, **không** 404)
- [ ] 15. `PATCH /api/plan/items`
  - [ ] 15.1 Validate body bằng `UpdatePlanSchema` — `items` đúng 6 phần tử, `slot` 0..5 không trùng, `minutes` 5..90, `detail` ≤120
  - [ ] 15.2 Kiểm `validateDomainMix` ⇒ 400 `{ code:"invalid_domain_mix" }` nếu vi phạm bất biến 4 trục
  - [ ] 15.3 Kiểm `minutes` trong khoảng `slotContract(slot)` ⇒ 400 `{ code:"minutes_out_of_range" }`
  - [ ] 15.4 `apply: false` ⇒ chỉ trả `{ updated, keptDone, totalMinutes }` (kiểm tra, không ghi)
  - [ ] 15.5 `apply: true` ⇒ gọi `applyPlan` ⇒ `{ ok:true, data:{ applied, keptDone, totalMinutes } }`
  - [ ] 15.6 Test: thiếu slot ⇒ 400; slot trùng ⇒ 400; sai tập domain ⇒ 400
  - [ ] 15.7 Test: `apply: true` 2 lần ⇒ vẫn 6 row
- [ ] 16. `POST /api/plan/[date]/complete`
  - [ ] 16.1 Validate body bằng `CompletePlanSchema` — `slot` 0..5, `quality` 1..5, `minutes` 1..180, `note` ≤500
  - [ ] 16.2 Handler gọi `completePlanItem` ⇒ `{ ok:true, data:{ activityId, evidenceId, planItem, alreadyDone } }`
  - [ ] 16.3 Map lỗi: `PlanItemNotFoundError` ⇒ 404 `{ code:"plan_item_not_found" }`; `InvalidSlotError` ⇒ 400
  - [ ] 16.4 Gọi `revalidatePath("/")` sau khi ghi
  - [ ] 16.5 Test: slot hợp lệ ⇒ tạo Activity + Evidence; slot không tồn tại ⇒ 404; bấm 2 lần ⇒ `alreadyDone: true`
- [ ] 17. `POST /api/plan/[date]/apply` (duyệt từ S02)
  - [ ] 17.1 Validate body: `items` đúng 6 phần tử, cùng schema với `PATCH /api/plan/items`
  - [ ] 17.2 Handler gọi `applyPlan` trong transaction ⇒ `{ ok:true, data:{ applied, keptDone } }`
  - [ ] 17.3 Test: duyệt lần 2 không nhân bản; 2 slot `done` được giữ nguyên

## 4. UI — S01 Daily Loop (`/`)

- [ ] 18. `src/app/page.tsx` (Server Component)
  - [ ] 18.1 Đọc `searchParams.date` (mặc định hôm nay) qua `parseDateKey`
  - [ ] 18.2 Gọi song song `getPlanForDate`, `getFocusSkill`, `getDailyState`, `listSrsDueCount` (feature SRS; null ⇒ ẩn khối)
  - [ ] 18.3 Render bento 8 cột (mục tiêu hạt nhân + 4 metric tile + segmented progress) và bento 4 cột (sinh trắc + FSRS queue pill)
  - [ ] 18.4 Render danh sách 6 slot (`DailySlotList`) và sidebar (`WeekStreakWidget`, khối FSRS, khối "Hệ thống trợ lý")
  - [ ] 18.5 Không có `onClick`/`useState` trong file (Server Component) — tương tác nằm ở Client islands
  - [ ] 18.6 Test render: không có kế hoạch ⇒ empty state + CTA, không lỗi
- [ ] 19. `src/components/daily-loop/daily-slot-list.tsx` + `daily-slot-card.tsx` (Client)
  - [ ] 19.1 Render 3 trạng thái card: `done` (gạch trái `bg-primary`, icon ✓ tròn, tiêu đề gạch ngang) · `priority` (nền `bg-surface-container-high`, gạch `bg-tertiary`) · `default` (gạch `bg-outline-variant`)
  - [ ] 19.2 Chip domain dùng màu theo domain: professional `text-secondary`, communication `text-tertiary`, language `text-primary`, personal `text-tertiary-fixed-dim`
  - [ ] 19.3 Nút hành động theo `kind`: SRS ⇒ "Bắt đầu ôn" (`bg-tertiary text-on-tertiary`), luyện nói ⇒ "Luyện tập", nhật ký ⇒ "Viết nhật ký", còn lại ⇒ "Hoàn thành" / checkbox
  - [ ] 19.4 Nút phụ của slot đã xong: "Xem lại" (`bg-surface-container-low text-on-surface-variant`)
  - [ ] 19.5 Bấm "Hoàn thành" ⇒ `POST /api/plan/[date]/complete`; cập nhật optimistic sang trạng thái done, rollback + toast nếu lỗi
  - [ ] 19.6 Disable toàn bộ nút hành động khi `isToday === false`, hiện "Chỉ đánh dấu được cho hôm nay"
  - [ ] 19.7 `skillId` không còn tồn tại ⇒ không render chip kỹ năng, không crash
  - [ ] 19.8 Test component: slot done không hiện nút hành động chính
- [ ] 20. `src/components/daily-loop/metrics-row.tsx` + `focus-banner.tsx` + `bio-panel.tsx`
  - [ ] 20.1 4 metric tile: "Cột mốc hiện tại" · "Bằng chứng xác thực" · "Thời gian tích lũy" · "Trạng thái AI Engine"
  - [ ] 20.2 "Thời gian tích lũy" chỉ tính `Activity` có `skillId` (P7 — không vanity metric)
  - [ ] 20.3 "Trạng thái AI Engine": offline ⇒ icon `offline_bolt` + "Cached local" (`text-secondary`); có key ⇒ "Cached prefix" + tỉ lệ cache hit thật từ `AiCall`
  - [ ] 20.4 Label dùng `font-label-sm text-label-sm text-outline uppercase tracking-wider`; số dùng `font-headline-sm` / `font-code-md` với `tabular-nums`
  - [ ] 20.5 Segmented progress: track `bg-surface-container-highest`, đoạn đạt `bg-primary rounded-sm`, đoạn chưa `bg-surface-variant`
  - [ ] 20.6 `BioPanel`: mood/energy/focus/sleep; thiếu dữ liệu ⇒ hiện "—", **không** hiện 0
  - [ ] 20.7 Link tên skill trọng tâm → `/skills/[id]`
- [ ] 21. `src/components/daily-loop/week-streak-widget.tsx`
  - [ ] 21.1 Lưới 7 ngày: đạt 100% ⇒ `bg-primary`; hôm nay ⇒ `bg-tertiary animate-pulse` + số "x/6"; trống ⇒ `bg-surface-container-highest`
  - [ ] 21.2 Hiện streak bằng `font-code-md` + icon `local_fire_department` (`text-tertiary`)
  - [ ] 21.3 Ngày không có kế hoạch không được vẽ như ô "0/6"
- [ ] 22. `src/components/daily-loop/quick-log-trigger.tsx` (FR-DL-04)
  - [ ] 22.1 Nút "+ Ghi nhanh (≤10s)" dùng `bg-primary-container text-on-primary font-label-md font-semibold` + icon `bolt`
  - [ ] 22.2 Mở sheet Quick-log **tức thì** qua `bridge.open(ctx)` — không chờ AI (P2)
  - [ ] 22.3 Truyền `ctx = { date, slot, domain, minutes, skillId }`
  - [ ] 22.4 Hỗ trợ hotkey `Ctrl/Cmd + K` để mở sheet từ bất kỳ đâu trên S01
- [ ] 23. `src/components/daily-loop/replan-modal.tsx` (FR-DL-06)
  - [ ] 23.1 Modal "Cân chỉnh lại hôm nay": nền `bg-surface-container-high rounded-xl`, overlay `bg-surface-container-lowest/80 backdrop-blur-md`
  - [ ] 23.2 Hiện rationale (năng lượng, số nhiệm vụ đã chốt, số thẻ quá hạn) + danh sách gợi ý phân bổ lại trong khối `bg-surface-container-low font-code-md`
  - [ ] 23.3 2 hành động: "Giữ nguyên" (`bg-surface-variant text-on-surface`) và "Áp dụng lịch trình mới" (`bg-secondary-container text-secondary`)
  - [ ] 23.4 Bấm "Áp dụng" ⇒ gọi `POST /api/plan/generate { mode:"regenerate", keepDone:true }`
  - [ ] 23.5 Server giữ slot `done` qua `mergeRegeneratedPlan` — nội dung slot đã xong không đổi
  - [ ] 23.6 Đóng bằng `Escape`; focus kẹp trong modal khi mở
- [ ] 24. Trạng thái rỗng, lỗi & offline trên S01
  - [ ] 24.1 Chưa có plan ⇒ "Chưa có kế hoạch hôm nay" + CTA "Lập kế hoạch hôm nay" (`bg-primary-container text-on-primary`)
  - [ ] 24.2 Không có API key ⇒ banner "Đang dùng kế hoạch offline — thêm API key để AI tối ưu thời lượng" (`bg-tertiary-container/20 text-tertiary`)
  - [ ] 24.3 AI lỗi ⇒ hiện kế hoạch fallback + banner offline + nút "Thử lại"; trang không crash
  - [ ] 24.4 Bộ chọn ngày (7 ngày gần nhất) ⇒ mở `/plan?date=` hoặc chế độ xem lại read-only

## 5. UI — S02 Sinh kế hoạch AI (`/plan`)

- [ ] 25. `src/app/plan/page.tsx` (Server Component)
  - [ ] 25.1 Đọc `searchParams.date` (mặc định hôm nay)
  - [ ] 25.2 Đọc `getPlanItems`, `getPlanContext` (phần context AI), `getFocusSkill`, `getWeeklyPlanStats`, `getLastAiCall("daily_plan")`
  - [ ] 25.3 Không có API key ⇒ `initialItems` dựng từ `generateFallbackPlan` để trang không trống
  - [ ] 25.4 Render header panel + directive banner + `<PlanWorkspace />` + sidebar 3 khối
- [ ] 26. `src/components/plan/plan-workspace.tsx` + `use-plan-stream.ts`
  - [ ] 26.1 Header: breadcrumb "DAILY LOOP OS / KẾ HOẠCH NGÀY", chip "AI-01 STREAMING ENGINE" (`bg-surface-container-high text-secondary font-code-md`), H1 "Thiết Lập Kế Hoạch 6 Slot Hôm Nay (dd/MM/yyyy)"
  - [ ] 26.2 Nhóm nút: "Sinh lại toàn bộ (AI)" (icon `autorenew`, ghost) · "Khôi phục Offline Fallback" (icon `history`, ghost) · "Duyệt & Áp dụng Kế hoạch" (`bg-primary-container text-on-primary` + kbd `Ctrl + Enter`)
  - [ ] 26.3 Directive banner: nguyên tắc P1 + 6 slot cố định + mã `STABLE_SLOTS_V1.1` (`font-code-md text-outline`)
  - [ ] 26.4 Render 6 card slot: nhãn `SLOT 0x` (`bg-surface-container-highest font-code-md`), chip domain (`rounded-full`), phút (`font-code-md`), tiêu đề (`font-headline-sm`), mô tả (`font-body-sm`), chip kỹ năng (`bg-surface-container text-secondary font-code-md`)
  - [ ] 26.5 Handle kéo `drag_indicator` (`text-outline cursor-grab`) + `aria-label="Kéo để đổi thứ tự"`
  - [ ] 26.6 Nút "Sửa inline" + "Đổi kỹ năng" trong card (`bg-surface-container text-on-surface-variant font-label-sm` + icon `edit` / `account_tree`)
  - [ ] 26.7 Slot 2 (SRS) có nút "Mở phiên ôn ngay" (`bg-tertiary-container/80 text-on-tertiary-container`) ⇒ link `/language/session`
  - [ ] 26.8 Slot đã `done` ⇒ card bị khoá (không sửa được) + badge "Đã hoàn thành"
  - [ ] 26.9 Đọc SSE bằng `response.body.getReader()` + `TextDecoder`, tách event theo `\n\n`, parse `data:` JSON
  - [ ] 26.10 Card skeleton (`bg-surface-container-highest animate-pulse`) cho slot chưa tới; vùng stream có `aria-live="polite"`
  - [ ] 26.11 Khi có `slot` event ⇒ cập nhật card tương ứng; khi có `done` ⇒ bật nút duyệt + hiện tổng cam kết
  - [ ] 26.12 Khi có `error` event ⇒ banner lỗi (`bg-error-container/40 text-error`) + nút "Thử lại"; **giữ nguyên** bản nháp cũ
  - [ ] 26.13 Lưu bản nháp vào `localStorage["daily-loop:draft:<date>"]` sau mỗi thay đổi; khôi phục khi DB chưa có kế hoạch
  - [ ] 26.14 Nút "Khôi phục Offline Fallback" ⇒ gọi `POST /api/plan/generate { mode:"fallback" }`
  - [ ] 26.15 Duyệt kế hoạch ⇒ `PATCH /api/plan/items { apply: true }` ⇒ `router.push("/")` + `router.refresh()`
  - [ ] 26.16 `Ctrl/Cmd + Enter` kích hoạt nút duyệt; disable khi đang streaming
  - [ ] 26.17 Kéo đổi chỉ trong cùng domain; thả chéo domain ⇒ chặn + toast "Chỉ đổi thứ tự được trong cùng trục"
  - [ ] 26.18 Hiện tổng thời lượng cam kết; cảnh báo khi ngoài khoảng 90–150 phút
- [ ] 27. Sidebar S02 — 3 khối
  - [ ] 27.1 "Ràng Buộc Sinh Học" (`bg-surface-container-low rounded-xl p-gutter-md`): mood/energy/sleep từ `DailyState`; đường cong năng lượng SVG dùng `text-primary`; thiếu dữ liệu ⇒ "Chưa có dữ liệu sinh trắc hôm nay"
  - [ ] 27.2 "Trọng Tâm Bứt Phá": skill ít bằng chứng nhất + badge `bg-error-container/40 text-error` + progress `bg-primary` — số liệu thật từ `Evidence`
  - [ ] 27.3 "Chi Phí Phiên Sinh": input cached / output / latency / USD từ `AiCall` mới nhất (`feature = "daily_plan"`); toggle "Offline Generator" (`peer-checked:bg-primary-container`)
  - [ ] 27.4 Khối "Local-First Vault Synced" — nội dung tĩnh, dùng `bg-gradient-to-br from-surface-container-low to-surface-container`

## 6. Kiểm thử & nghiệm thu

- [ ] 28. Unit test tổng hợp
  - [ ] 28.1 `src/lib/__tests__/daily-loop.test.ts` — streak, weekly energy, merge, validateDomainMix, slotContract
  - [ ] 28.2 `src/lib/__tests__/plan-schema.test.ts` — `PlanSchema` (thiếu slot, trùng slot, sai domain, sai minutes)
  - [ ] 28.3 `src/lib/__tests__/plan-fallback.test.ts` — `generateFallbackPlan` (6 slot, deterministic, offset theo ngày)
  - [ ] 28.4 `src/lib/__tests__/plan-cache.test.ts` — guard nội dung biến động trong system prompt + preflight độ dài prefix
  - [ ] 28.5 Chạy `npx vitest run` — toàn bộ test xanh
- [ ] 29. Integration test
  - [ ] 29.1 `src/lib/__tests__/daily-loop.db.test.ts` — `completePlanItem` (tạo Activity + Evidence, idempotent, concurrency)
  - [ ] 29.2 `src/lib/__tests__/apply-plan.db.test.ts` — `applyPlan` giữ row `done`, không nhân bản khi gọi 2 lần
  - [ ] 29.3 `src/app/api/plan/__tests__/generate.test.ts` — SSE event order, offline fallback, schema fail, stream interrupted
  - [ ] 29.4 `src/app/api/plan/__tests__/items.test.ts` — validate + apply + 400 cases
  - [ ] 29.5 `src/app/api/plan/__tests__/complete.test.ts` — 200/404/400 + idempotent
- [ ] 30. E2E theo AC (Playwright)
  - [ ] 30.1 `e2e/daily-loop.spec.ts` — AC-1: chưa có plan ⇒ CTA + không lỗi; bấm "Xong" ⇒ tạo bằng chứng + streak tăng
  - [ ] 30.2 `e2e/daily-loop.spec.ts` — AC-DL-3: sinh lại giữ nguyên slot đã done (kiểm nội dung trước/sau)
  - [ ] 30.3 `e2e/daily-loop.spec.ts` — AC-DL-4: năng lượng tuần 79% khớp dữ liệu seed
  - [ ] 30.4 `e2e/daily-loop.spec.ts` — AC-DL-7: duyệt kế hoạch 2 lần không nhân bản row
  - [ ] 30.5 `e2e/daily-loop.spec.ts` — AC-DL-8: lịch sử theo ngày, xem lại ngày cũ ở chế độ read-only
  - [ ] 30.6 `e2e/daily-loop.spec.ts` — AC-DL-9: điều hướng S01↔S02 mang theo ngày
  - [ ] 30.7 `e2e/offline.spec.ts` — AC-DL-5: bỏ `ANTHROPIC_API_KEY` ⇒ vẫn sinh 6 slot, ghi được vào DB
  - [ ] 30.8 `e2e/ai-error.spec.ts` — AC-DL-6: mock refusal ⇒ thông báo thân thiện, không crash, banner offline trên S01
  - [ ] 30.9 Chạy `npx playwright test` — xanh
- [ ] 31. Kiểm tra bắt buộc
  - [ ] 31.1 Kiểm tra a11y: icon-only button có `aria-label`; vùng stream có `aria-live="polite"`; focus ring `focus-visible:ring-2 focus-visible:ring-primary`
  - [ ] 31.2 Kiểm tra responsive 390px: không tràn ngang; nút hành động full-width trong vùng ngón cái
  - [ ] 31.3 Grep xác nhận không có hex hardcode trong `src/components/daily-loop/**` và `src/components/plan/**`
  - [ ] 31.4 Grep xác nhận không dùng `rounded-2xl`/`rounded-3xl`/`shadow-xl` trong component
  - [ ] 31.5 `npx tsc --noEmit` — không lỗi type, không `any` trong `src/lib/daily-loop.ts` và `src/lib/plan.ts`
  - [ ] 31.6 Xác nhận `ANTHROPIC_API_KEY` không xuất hiện trong request AI-01 và không được log
  - [ ] 31.7 Xác nhận không có logic xoá `PlanItem` theo ngày (grep `deleteMany` chỉ dùng trong `applyPlan` với filter `done: false`)
  - [ ] 31.8 Chạy test cache 1 lần có key thật ⇒ xác nhận `cache_read_input_tokens > 0`, ghi kết quả vào PR description
- [ ] 32. Đối chiếu nghiệm thu
  - [ ] 32.1 Đọc lại AC-1 và AC-DL-2..AC-DL-10 trong `spec.md`, tick từng AC sau khi có test tương ứng
  - [ ] 32.2 Đối chiếu từng FR-DL-01..FR-DL-08 trong `spec.md` với task đã implement, ghi rõ task nào phục vụ FR nào
  - [ ] 32.3 Xác nhận mọi yêu cầu trong spec §3 đã có ít nhất 1 task hoặc 1 test tương ứng
  - [ ] 32.4 Chạy toàn bộ `npx vitest run` + `npx playwright test` lần cuối và dán kết quả vào PR description

## 33. Lộ trình 3 giai đoạn (Q4)

- [ ] 33.1 Tạo `src/lib/stages.ts` — 3 giai đoạn với `criteria` (điều kiện đạt) + `evidenceCriteria` (tiêu chí đo được từ Evidence/Activity)
- [ ] 33.2 Viết `resolveCurrentStage(evidenceCount, interviewScore)` — giai đoạn đầu tiên chưa đạt điều kiện
- [ ] 33.3 Mặc định velocity = 1 Evidence/ngày khi chưa có ≥7 ngày dữ liệu
- [ ] 33.4 Truyền `currentStage` + `stageCriteria` + `recentVelocity` vào prompt AI-01 — **không** truyền deadline
- [ ] 33.5 UI S01: chip "Giai đoạn N — <tên>" + tiêu chí đang theo đuổi trên top strip
- [ ] 33.6 Khi velocity tăng → AI đề xuất giai đoạn tiếp theo; khi trượt ≥2 ngày → giảm tải (FR-WR-05)
- [ ] 33.7 Test: 25 Evidence + chưa có mock interview → giai đoạn 1 đạt, hiện giai đoạn 2
- [ ] 33.8 Test: prompt AI-01 không chứa chuỗi deadline
