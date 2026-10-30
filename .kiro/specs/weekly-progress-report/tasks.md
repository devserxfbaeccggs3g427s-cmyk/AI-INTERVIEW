# Tasks — Báo cáo Tuần & Tiến Bộ

> Phase: 1 · Phụ thuộc: `daily-loop-core`, `skill-tree-evidence`, `personal-state-journal`, `srs-language-review`, `ai-foundation`
> Tuân thủ `.kiro/steering/tech.md` (AI layer, prompt caching, structured output) và `.kiro/steering/design-system.md` (token, shape).

## 0. Nền tảng dữ liệu

- [ ] 1. Index hỗ trợ truy vấn báo cáo
  - [ ] 1.1 Thêm `@@index([createdAt])` cho model `Activity`
  - [ ] 1.2 Thêm `@@index([createdAt])` cho model `Evidence`
  - [ ] 1.3 Thêm `@@index([date, done])` cho model `PlanItem`
  - [ ] 1.4 Chạy `npx prisma migrate dev` và xác nhận migration không phá dữ liệu seed
- [ ] 2. Module tuần (ISO week)
  - [ ] 2.1 Tạo `src/lib/week.ts` với `parseIsoWeek`, `currentIsoWeek`, `previousIsoWeek`, `weekDays`, `isValidIsoWeek`
  - [ ] 2.2 Viết `isWeeklyReviewDue` — Chủ nhật từ 20:00 local
  - [ ] 2.3 Viết `lastCompletedWeek` — tuần gần nhất đã chốt
  - [ ] 2.4 Unit test: tuần chéo năm (`2026-W01` chứa 28/12/2025), `2026-W99` invalid, timezone biên nửa đêm
- [ ] 3. Module analytics (thuần, không gọi AI)
  - [ ] 3.1 Tạo `src/lib/analytics.ts` — khai báo type `WeeklySummary`, `ProgressReport`, `DomainKey`
  - [ ] 3.2 `getWeeklySummary(week)` — query song song: completion, priorWeek, byDomain, topSkills, bio, retention, streak, energy[]
  - [ ] 3.3 Tính `energy[]` cho 7 ngày: `slotsDone/slotsTotal` + `energyPct` từ `DailyState.energy`
  - [ ] 3.4 Chuẩn hoá `status` theo ngưỡng 0.9 / 0.75 và `deltaRate` làm tròn 1 chữ số
  - [ ] 3.5 `getProgress({ domain, days })` — levelAvg (chỉ node lá), delta30, evidenceByMonth, heatmap, t30, practiceTime
  - [ ] 3.6 `getPracticeTime` **bắt buộc** lọc `skillId: { not: null }` (AC-RP-6)
  - [ ] 3.7 `getHeatmap` chỉ đếm `Evidence`, không đếm `Activity` (AC-RP-7)
  - [ ] 3.8 Unit test: threshold status, deltaRate rounding, levelAvg bỏ qua node gốc
  - [ ] 3.9 Integration test với SQLite test DB: 42 PlanItem → `done/total` đúng; 20 Activity không `skillId` → practiceTime = 0

## 1. API

- [ ] 4. `GET /api/review/weekly?week=2026-W43`
  - [ ] 4.1 Validate `week` bằng `isValidIsoWeek` → 400 `{ ok: false, error: "invalid_week" }` nếu sai
  - [ ] 4.2 Handler gọi `getWeeklySummary` → `{ ok: true, data }`
  - [ ] 4.3 Mặc định `week` = `currentIsoWeek()`
  - [ ] 4.4 Test: week hợp lệ, week sai, thiếu param
- [ ] 5. `POST /api/review/weekly` (streaming NDJSON — AI-07)
  - [ ] 5.1 Kiểm tra `ANTHROPIC_API_KEY` → 503 `{ error: "no_api_key" }` nếu thiếu
  - [ ] 5.2 Gọi `getWeeklySummary` rồi dựng user message từ dữ liệu tuần (biến động → `messages`, **không** đặt trong `system`)
  - [ ] 5.3 Gọi `callAIStream` với `model: "claude-opus-5"`, `effort: "high"`, `system: [WEEKLY_REVIEW_SYSTEM, RUBRIC_WEEKLY]`
  - [ ] 5.4 Đặt `cache_control: { type: "ephemeral" }` trên `RUBRIC_WEEKLY`
  - [ ] 5.5 Stream từng chunk ra `Content-Type: application/x-ndjson`
  - [ ] 5.6 `schema.safeParse` — fail → trả `insights: null` + `warning`, **không** 500
  - [ ] 5.7 Verify `cache_read_input_tokens > 0` ở lần gọi thứ 2 (AC-5 liên quan)
- [ ] 6. `POST /api/review/weekly/apply`
  - [ ] 6.1 Validate body bằng `ApplyPlanSchema` (Zod): `slots` đúng 6 phần tử, `slot` 0..5 không trùng
  - [ ] 6.2 Trong `prisma.$transaction`: `deleteMany` `PlanItem` của tuần đích có `source: "ai"` → `createMany` 42 dòng (6 slot × 7 ngày)
  - [ ] 6.3 Trả `{ ok: true, data: { applied } }`
  - [ ] 6.4 Test: gọi 2 lần → vẫn đúng 42 dòng (AC-RP-5)
- [ ] 7. `GET /api/progress?domain=all&days=180`
  - [ ] 7.1 Validate `domain` ∈ {all, professional, communication, language, personal} và `days` ∈ [30, 365]
  - [ ] 7.2 Handler gọi `getProgress` → `{ ok: true, data }`
  - [ ] 7.3 Test: domain lạ → 400; days ngoài khoảng → 400
- [ ] 8. `GET /api/progress/export`
  - [ ] 8.1 Trả JSON self-contained: `evidenceByMonth`, `heatmap`, `t30`, `practiceTime`
  - [ ] 8.2 **Loại trừ** `ANTHROPIC_API_KEY` và nội dung nhật ký cá nhân chưa được AI xử lý (AC-RP-9)
  - [ ] 8.3 Stream file ra response thay vì buffer toàn bộ (DB > 50MB)
  - [ ] 8.4 Test: file tải xong parse được, không có field nhạy cảm

## 2. UI — S13 Báo cáo tuần

- [ ] 9. Route `src/app/review/page.tsx`
  - [ ] 9.1 Đọc `searchParams.week`, validate, mặc định `lastCompletedWeek` nếu chưa tới Chủ nhật 20:00
  - [ ] 9.2 Gọi `getWeeklySummary` + `getStoredInsights` song song
  - [ ] 9.3 Render server-side số liệu (không chờ AI)
  - [ ] 9.4 Banner "Báo cáo sẽ chốt vào Chủ nhật 20:00" khi tuần đang chạy
- [ ] 10. Component `src/components/review/weekly-review-report.tsx` (Client)
  - [ ] 10.1 Khối metric row: tỷ lệ hoàn thành, chuỗi, năng lượng TB, FSRS retention — delta ▲/▼ bằng `text-primary`/`text-error`
  - [ ] 10.2 Khối "Phân bổ 4 Trục Thực Thi" — 4 dòng domain + bar + nhãn Elite/Ổn/Cần can thiệp
  - [ ] 10.3 Khối "Nhịp Độ Năng Lượng & Điểm Slot Trong Tuần" — 7 cột ngày, ≥90% `bg-primary`, 60–89% `bg-tertiary`
  - [ ] 10.4 Khối "Top 3 Kỹ Năng Bứt Phá" — click mở `/skills/[id]`
  - [ ] 10.5 Khối "Chỉ Số Sinh Trắc Học Tuần" — mood/focus/sleep TB bằng `font-code-md` tabular-nums
  - [ ] 10.6 Khối "Nhận Định 3 Điểm" — 3 mục ✓ / ✗ / 💡 với màu `text-primary` / `text-error` / `text-tertiary`
  - [ ] 10.7 Khối "Kế Hoạch Đề Xuất Tuần 44" — 6 slot card
  - [ ] 10.8 Nút "ios_share Xuất JSON" + "verified Duyệt Tuần 44"
  - [ ] 10.9 Nút "done_all Duyệt & Áp dụng" → gọi `POST /api/review/weekly/apply`, disable khi đang ghi
  - [ ] 10.10 Empty state: tuần 0 hoạt động → "Chưa có hoạt động trong tuần này" + CTA về Daily Loop
- [ ] 11. Component `src/components/review/insight-block.tsx`
  - [ ] 11.1 Render 3 nhận định với icon `check_circle` / `error` / `lightbulb`
  - [ ] 11.2 Hiện trường `evidence` / `impact` / `rationale` dạng `body-sm text-on-surface-variant`
  - [ ] 11.3 `aria-live="polite"` khi nội dung stream tới
- [ ] 12. Component `src/components/review/next-week-plan.tsx`
  - [ ] 12.1 6 slot card: nhãn domain, khung giờ, action, detail, minutes, skill, focusHint
  - [ ] 12.2 Sửa inline: action, detail, minutes, startTime/endTime
  - [ ] 12.3 Kéo đổi thứ tự slot (drag indicator) — không được làm mất index 0..5
  - [ ] 12.4 Hiện ghi chú giảm tải khi `reducedLoad` (FR-WR-05)
  - [ ] 12.5 Cảnh báo khi AI trả `slots.length !== 6`: "Kế hoạch AI trả về {n}/6 slot — bổ sung slot trống để tự điền"
- [ ] 13. Streaming client hook `src/components/review/use-weekly-insights.ts`
  - [ ] 13.1 Đọc `ReadableStream` NDJSON, parse từng dòng `{ type, data }`
  - [ ] 13.2 Cập nhật state theo type `insight` / `plan` / `done`
  - [ ] 13.3 Lỗi mạng → giữ chunk đã nhận, hiện banner + nút "Thử lại"
  - [ ] 13.4 Không gọi API khi thiếu `ANTHROPIC_API_KEY` (prop `hasApiKey`)

## 3. UI — S14 Báo cáo tiến bộ

- [ ] 14. Route `src/app/progress/page.tsx`
  - [ ] 14.1 Đọc `searchParams.domain` / `searchParams.days`, validate
  - [ ] 14.2 Gọi `getProgress` + `getSkillTrajectories` (6 tháng) song song
  - [ ] 14.3 Render server-side
- [ ] 15. Component `src/components/progress/progress-report.tsx` (Client)
  - [ ] 15.1 5 chip lọc domain (Tất cả / Chuyên môn / Giao tiếp / Ngoại ngữ / Cá nhân) — active `bg-primary-container text-on-primary`
  - [ ] 15.2 Lọc **client-side** bằng `useState`, không refetch
  - [ ] 15.3 4 metric tile: level TB, evidence tháng, FSRS retention, phản xạ giao tiếp — delta `trending_up` `text-primary`
  - [ ] 15.4 Nút "download Xuất JSON tiến độ" → `GET /api/progress/export`
  - [ ] 15.6 Nút "arrow_upward Lên đầu trang"
- [ ] 16. Component `src/components/progress/skill-trajectory-chart.tsx`
  - [ ] 16.1 Line chart 6 tháng, 4 series theo domain — màu `text-primary` / `text-secondary` / `text-tertiary` / `text-on-surface-variant`
  - [ ] 16.2 Trục Y 0→5, trục X là 6 tháng
  - [ ] 16.3 Tooltip hiện level từng domain theo tháng
  - [ ] 16.4 < 2 điểm dữ liệu → render dạng list thay vì chart rỗng
  - [ ] 16.5 `aria-label` mô tả nội dung chart
- [ ] 17. Component `src/components/progress/evidence-heatmap.tsx`
  - [ ] 17.1 Lưới 13 tuần × 7 ngày, CSS grid thuần (không thư viện)
  - [ ] 17.2 Màu cell theo số evidence: nền `bg-surface-container-highest` → `bg-primary`
  - [ ] 17.3 Ngày 0 evidence → ô nền, tooltip "0 bằng chứng" (không tính vào tổng)
  - [ ] 17.4 Legend "Ít ↔ Nhiều (≥ 4 evidence/ngày)"
  - [ ] 17.5 `useMemo` cache cells để không tính lại khi đổi filter
- [ ] 18. Component `src/components/progress/t30-benchmark.tsx`
  - [ ] 18.1 3 cặp delta: tốc độ PRD, lỗi ngữ pháp, vốn từ HSK3
  - [ ] 18.2 `t30.available === false` → ẩn khối, hiện "Cần thêm {daysMissing} ngày dữ liệu" (AC-RP-8)
- [ ] 19. Component `src/components/progress/practice-time-bar.tsx`
  - [ ] 19.1 Bar theo domain + tổng giờ, mỗi bar có `aria-label` domain + giờ
  - [ ] 19.2 Tổng có nhãn "Tổng thực chiến hữu ích: {h} giờ — 100% Focused"
  - [ ] 19.3 **Không** hiển thị "tổng giờ học" trần trụi (FR-PR-07 / P7)

## 4. AI

- [ ] 20. Prompt & schema
  - [ ] 20.1 Thêm `WEEKLY_REVIEW_SYSTEM` vào `src/lib/prompts.ts` (cấm bịa số liệu, yêu cầu giảm tải khi trượt ≥2 ngày)
  - [ ] 20.2 Thêm `RUBRIC_WEEKLY` — tiêu chuẩn cho 3 loại nhận định
  - [ ] 20.3 Thêm `WeeklyReviewSchema` (Zod) — `insights` 3 mục + `plan.slots` đúng 6 phần tử + `reducedLoad` + `reduceReason`
  - [ ] 20.4 Thêm `ApplyPlanSchema` (Zod) cho body `POST /api/review/weekly/apply`
  - [ ] 20.5 `buildWeeklyUserMessage(summary, week)` — toàn bộ dữ liệu tuần nằm trong `messages`
  - [ ] 20.6 Unit test: `buildWeeklyUserMessage` không chứa `Date.now()` / UUID (bảo toàn cache)
- [ ] 21. Tích hợp AI-07 vào UI
  - [ ] 21.1 Nút "psychology Tự động tổng hợp" gọi endpoint stream
  - [ ] 21.2 Hiển thị badge nguồn "Claude Opus 5 (Local Context Engine)"
  - [ ] 21.3 Lưu `insights` vào DB để lần mở sau không gọi lại AI (tiết kiệm chi phí)

## 5. Kiểm thử & nghiệm thu

- [ ] 22. Unit test
  - [ ] 22.1 `week.ts`: parse/current/previous/isDue/lastCompleted + edge tuần chéo năm
  - [ ] 22.2 `analytics.ts`: threshold status, deltaRate, levelAvg node lá, t30 daysMissing
- [ ] 23. Integration test
  - [ ] 23.1 Fixture 42 `PlanItem` → `completion` đúng (AC-RP-1)
  - [ ] 23.2 4 domain → `byDomain` đúng 4 dòng (AC-RP-2)
  - [ ] 23.3 Activity không `skillId` → không vào `practiceTime` (AC-RP-6)
  - [ ] 23.4 Ngày có Activity nhưng không Evidence → không tô màu heatmap (AC-RP-7)
  - [ ] 23.5 `apply` 2 lần → 42 dòng (AC-RP-5)
  - [ ] 23.6 AI trả `slots.length = 5` → 200 + cảnh báo, không 500
  - [ ] 23.7 AI `refusal` → `AiCall{ok:false}`, response thân thiện, không crash (AC-8)
- [ ] 24. E2E (Playwright)
  - [ ] 24.1 `/review` hiện số liệu thật từ seed
  - [ ] 24.2 `/review` không API key → số liệu hiện, khối AI hiện hướng dẫn (AC-RP-3)
  - [ ] 24.3 `/review` bấm Duyệt → 42 `PlanItem` trong DB
  - [ ] 24.4 `/progress` đổi filter domain → chart đổi ngay, không reload
  - [ ] 24.5 `/progress` app mới < 30 ngày → khối T-30 ẩn, hiện "Cần thêm 20 ngày dữ liệu" (AC-RP-8)
  - [ ] 24.6 Xuất JSON → file tải xong, không chứa field nhạy cảm (AC-RP-9)
- [ ] 25. A11y & responsive
  - [ ] 25.1 Chart có `aria-label`; bảng dữ liệu dùng `<table>` semantic
  - [ ] 25.2 Delta ▲/▼ có text thay thế, không chỉ màu
  - [ ] 25.3 Kiểm tra ở 390px: heatmap scroll ngang, chart không tràn viewport
  - [ ] 25.4 Kiểm tra tương phản WCAG AA cho label `text-outline` trên `bg-surface-container`
- [ ] 26. Nghiệm thu
  - [ ] 26.1 Chạy lại toàn bộ AC-RP-1..AC-RP-9 và đánh dấu pass/fail
  - [ ] 26.2 Xác nhận không có số liệu hardcode trong JSX (chỉ đọc từ props)

## 27. Tiến độ về mục tiêu sắp tới (Q8)

- [ ] 27.1 Đọc `UpcomingGoal` (Registry `M11`) đang `active`, sắp theo `priority`
- [ ] 27.2 Tính khoảng cách: `LEVEL_ORDER` index của `targetLevel` − index của `{lang}Level` → số bậc còn lại
- [ ] 27.3 UI S13: khối "Tiến độ về mục tiêu" — mức hiện tại → mức đích, số bậc còn lại, hành động tuần này liên quan
- [ ] 27.4 `targetDate = null` → hiện "chưa chốt ngày", **không** tự tính số tuần
- [ ] 27.5 UI S14: vẽ đường ngang đích (target line) trên biểu đồ thang kỹ năng
- [ ] 27.6 Đề xuất kế hoạch tuần: mục tiêu `priority` cao nhất chiếm ≥2/6 slot mỗi ngày
- [ ] 27.7 AI cảnh báo xung đột khi 2 mục tiêu cùng `priority` nhưng khác ngôn ngữ
- [ ] 27.8 Test: `targetLevel=B2`, `enLevel=A1` → hiện "còn 3 bậc"
- [ ] 27.9 Test: không có `UpcomingGoal` → khối ẩn, không hiện số 0 giả
