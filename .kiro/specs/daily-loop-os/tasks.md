# Tasks — Daily Loop OS

> Checklist triển khai theo chuẩn Kiro: `- [ ] 1.` (nhóm) → `- [ ] 1.1` (task con). Mỗi task có **đường dẫn file đích** và **điều kiện hoàn thành**.
> Ưu tiên cứng: **không bắt đầu Phase 1 trước khi Phase 0 dùng được hằng ngày 7 ngày liên tiếp.** Nếu không dùng hằng ngày → vấn đề là friction, không phải thiếu tính năng.

---

## Phase 0 — Hạt nhân (Ghi + Kế hoạch + Cây kỹ năng)

**Definition of Done:** Mở app thấy 6 hành động; đánh dấu xong tạo bằng chứng; cây kỹ năng cập nhật tiến độ; chạy được khi không có API key.

### 1. Nền tảng dự án

- [x] 1.1 Khởi tạo Next.js 15 App Router + TypeScript strict
  - **File:** `package.json`, `tsconfig.json`, `next.config.ts`
  - **Done:** `npm run dev` chạy được; `tsc --noEmit` không lỗi; `next.config.ts` có `output: 'standalone'`
- [x] 1.2 Cài dependencies
  - **File:** `package.json`
  - **Done:** có `next@15`, `react@19`, `prisma@6`, `@prisma/client@6`, `@anthropic-ai/sdk`, `ts-fsrs`, `zod`, `recharts`, `tailwindcss@4`, `vitest`, `@playwright/test`
- [x] 1.3 Thiết lập Tailwind v4 + `@theme` token từ `focus_flow/DESIGN.md` (YAML frontmatter) — theo bảng quyết định §3.1 design.md
  - **File:** `src/app/globals.css`, `src/styles/tokens.ts`
  - **Done:** palette lấy nguyên văn từ `DESIGN.md` `colors:`; radius theo **giá trị HTML thực tế** (`DEFAULT .125 · lg .25 · xl .5 · full .75` — `full` **KHÔNG** phải 9999px); `headline-sm` = `1.25rem`; class `bg-surface-container-high`, `text-primary`, `font-label-md`, `rounded-xl` sinh ra đúng giá trị §3.1 design.md; **không** có màu hex hardcode ngoài `@theme`
- [x] 1.4 Nạp font Be Vietnam Pro · Space Grotesk · JetBrains Mono + Material Symbols (1 `<link>` duy nhất)
  - **File:** `src/app/layout.tsx`
  - **Done:** không có `<link>` Material Symbols trùng lặp ở page con
- [x] 1.5 Thiết lập Prisma + SQLite
  - **File:** `prisma/schema.prisma`, `.env`, `.env.example`, `.gitignore`
  - **Done:** `npx prisma migrate dev` chạy; `.gitignore` chứa `.env`, `.env.local`, `prisma/dev.db`
- [x] 1.6 Viết 15 model Prisma (khung đã có trong design.md §5)
  - **File:** `prisma/schema.prisma`
  - **Done:** đủ 15 model — Skill, Activity, Evidence, Reflection, PlanItem, Card, Review, DailyState, UserProfile, AiCall, InterviewProfile, InterviewSession, InterviewTurn, TestSession, TestItem — khớp `SPEC.md` §4 và `design.md` §5.1–§5.7; **`AiCall` có thêm `provider` (local|anthropic) + `fallbackFrom` + `latencyMs`** (FR-AI-13, FR-AI-14)
- [x] 1.7 Singleton Prisma client + `PRAGMA WAL`
  - **File:** `src/lib/db.ts`
  - **Done:** không tạo nhiều instance khi hot-reload; `journal_mode=wal`, `busy_timeout=5000`
- [x] 1.8 Script seed: cây kỹ năng 4 domain + 120 thẻ zh/en + UserProfile
  - **File:** `prisma/seed.ts`
  - **Done:** `npx prisma db seed` tạo ≥4 domain, ≥20 skill node, 60 thẻ zh + 60 thẻ en, 10 mẫu câu mỗi ngôn ngữ
- [x] 1.9 Script seed từ `SPEC.md` Phụ lục B
  - **File:** `prisma/seed.ts` (khối `SEED_CARDS_ZH`, `SEED_CARDS_EN`)
  - **Done:** đúng 6 nhóm × 10 từ mỗi ngôn ngữ; `hint` (phiên âm Việt) set cho thẻ en trong 2 tuần đầu
- [x] 1.10 Utility ngày giờ (chuẩn hoá local midnight, tuần ISO, nhãn "Thứ Tư 29/10")
  - **File:** `src/lib/dates.ts`
  - **Done:** `todayKey()`, `startOfWeek()`, `formatVnDate()` test qua
- [x] 1.11 Thiết lập Vitest + Playwright
  - **File:** `vitest.config.ts`, `playwright.config.ts`, `tests/`
  - **Done:** `npm test` và `npm run test:e2e` chạy được (e2e 1 test mẫu)

### 2. Lớp AI — AI Router hybrid & prompt

> Theo `tech.md` §"AI Router (bắt buộc theo thiết kế)": **mọi** lời gọi AI đi qua `src/lib/ai/router.ts`. Route handler **không** gọi SDK trực tiếp.

- [x] 2.1 Định nghĩa 4 rubric hằng số (P4) — **tách khỏi `prompts.ts`**
  - **File:** `src/lib/rubrics.ts`
  - **Done:** `RUBRIC_COMMUNICATION` (5), `RUBRIC_TECHNICAL` (5), `RUBRIC_BEHAVIORAL` (4), `RUBRIC_LANGUAGE_ERRORS` (4) — nội dung đúng design.md §"Rubric cố định"; export `SCREAMING_SNAKE_CASE`; **UI đọc từ đây, không hardcode tên tiêu chí**
- [x] 2.2 System prompt cố định (prefix cache) — KHÔNG chứa `Date.now()`/UUID
  - **File:** `src/lib/prompts.ts`
  - **Done:** `SYSTEM_PROMPT_V1` là hằng module-level; test tĩnh assert không có template literal động; file này **chỉ** chứa system prompt + task prompt, **không** chứa rubric
- [x] 2.3 Lớp exception typed
  - **File:** `src/lib/errors.ts`
  - **Done:** `AiRefusalError`, `AiRateLimitError`, `AiNetworkError`, `AiUnavailableError`, `AiTimeoutError`, `ValidationError`
- [x] 2.4 **AI Router** — nguồn duy nhất chọn provider (FR-AI-09)
  - **File:** `src/lib/ai/router.ts`
  - **Done:** `route(task)` trả `{provider:"local"|"anthropic", model, effort}` theo bảng design.md §6.1. **Nhóm local (7):** `autofill` · `classify` · `language_correct` · `language_level` · `test_from_content` · `biometric_correlate` · `mock_next_question`. **Không AI (1):** `test_blueprint`. **Còn lại → `anthropic`.**
- [x] 2.5 **Fallback chain** `anthropic → local → rule cục bộ` (FR-AI-10)
  - **File:** `src/lib/ai/router.ts`
  - **Done:** anthropic lỗi → thử local → thử rule cục bộ; **không** trả lỗi trần cho UI; ghi `AiCall.fallbackFrom` = provider gốc
- [x] 2.6 Client Anthropic — model routing, streaming, structured output, ghi `AiCall`
  - **File:** `src/lib/ai/anthropic.ts`
  - **Done:** chèn `cache_control: {type:'ephemeral'}` vào system; dùng `output_config.format`; ghi đủ 5 trường token + `estimatedCost` + `provider`; thiếu key → `AiUnavailableError`
- [x] 2.7 Client Ollama — HTTP client cho provider local (FR-AI-02, FR-AI-13)
  - **File:** `src/lib/ai/ollama.ts`
  - **Done:** `POST http://localhost:11434/api/chat` với `format` = JSON schema; timeout 30s → `AiTimeoutError`; `ECONNREFUSED` → `AiUnavailableError`; ghi `AiCall{provider:"local", estimatedCost:0}`
- [x] 2.8 Helper streaming SSE
  - **File:** `src/lib/ai/streaming.ts`
  - **Done:** đọc `ReadableStream` → phát event `token` / `done`; chỉ dùng cho provider `anthropic`
- [x] 2.9 Bảng giá & hàm tính chi phí
  - **File:** `src/lib/ai/anthropic.ts`
  - **Done:** `estimateCost(model, in, out, cacheRead, cacheWrite)` theo bảng §6.8; provider `local` luôn = 0
- [x] 2.10 Phát hiện Ollama + danh sách model local (FR-AI-12)
  - **File:** `src/app/api/ai/models/route.ts`, `src/lib/ai/ollama.ts`
  - **Done:** `GET /api/tags` timeout 3s; trả danh sách model khả dụng; lỗi → `{available:false}`; S15 hiển thị trạng thái Offline + hướng dẫn cài đặt
- [x] 2.11 Test prompt caching (AC-5)
  - **File:** `tests/integration/cache.test.ts`
  - **Done:** 2 call cùng system → call 2 `cache_read_input_tokens > 0` (skip nếu không có key)
- [x] 2.12 Test router + fallback (AC-7b)
  - **File:** `tests/unit/router.test.ts`
  - **Done:** `route("classify")` → `{provider:"local"}`; `route("grading")` → `{provider:"anthropic"}`; anthropic lỗi → fallback sang local → `AiCall{provider:"local", fallbackFrom:"anthropic"}`

### 3. Shell dùng chung (FR-SH-01..05)

- [x] 3.1 `AppShell` — layout `pl-72` + `pt-16`
  - **File:** `src/components/shell/AppShell.tsx`, `src/app/layout.tsx`
  - **Done:** mọi route render trong shell
- [x] 3.2 `NAV_ITEMS` — nguồn duy nhất cho sidebar (sửa lỗi mockup #3, #4)
  - **File:** `src/lib/nav.ts`
  - **Done:** đúng **9 mục** với `href` thật + `icon` + `label`; nhãn mục 8 = "Báo cáo tuần & tiến độ"; **không** copy-paste nav giữa 21 màn hình
- [x] 3.3 `Sidebar` 288px — logo, tên, badge phiên bản, 9 mục nav, card trạng thái SQLite/Vector
  - **File:** `src/components/shell/Sidebar.tsx`
  - **Done:** `w-72 bg-surface-container-lowest border-r border-outline-variant/30`; map từ `NAV_ITEMS`; active state `bg-surface-container-high text-primary font-semibold shadow-inner`
- [x] 3.4 `Topbar` 64px — chip ngày, streak, năng lượng tuần, chip AI, CTA "+ Ghi nhanh", avatar
  - **File:** `src/components/shell/Topbar.tsx`
  - **Done:** `h-16 bg-surface-container-lowest/80 backdrop-blur-xl border-b border-outline-variant/30`; CTA mở Quick-log; dữ liệu bind thật từ DB; chip AI hiển thị provider đang hoạt động thật (`AI Offline / Local (Ollama)` ↔ `AI Online / Cloud (Claude Opus 5)`)
- [x] 3.5 `NavLink` dùng `usePathname()` để highlight
  - **File:** `src/components/shell/NavLink.tsx`
  - **Done:** highlight đúng 1 mục trên mọi route (20/21 màn hình mockup thiếu active state → phải sửa); so khớp `pathname` prefix, **không** dùng `data-path` để định tuyến
- [x] 3.6 UI primitives: Button, Card, Chip, Badge, Input, Select, Modal, Sheet, Toast, Tabs, Tooltip, Slider
  - **File:** `src/components/ui/*.tsx`
  - **Done:** dùng token, không có màu hex hardcode
- [x] 3.7 `Toaster` + `aria-live`
  - **File:** `src/components/ui/Toaster.tsx`
  - **Done:** toast lỗi AI hiển thị đúng message trong bảng §7.2
- [x] 3.8 Drawer sidebar cho <1024px
  - **File:** `src/components/shell/Sidebar.tsx`
  - **Done:** dưới 1024px sidebar thu gọn, grid 12 cột chuyển 1 cột
- [x] 3.9 Test shell đồng nhất (AC-15)
  - **File:** `tests/e2e/shell.spec.ts`
  - **Done:** quét 21 route, mỗi route có 9 nav item + 6 chip header + **1 nav item active**

### 4. S01 — Daily Loop `/`

- [x] 4.1 Query kế hoạch hôm nay + trạng thái slot
  - **File:** `src/app/page.tsx`, `src/lib/plan.ts`
  - **Done:** tối đa 6 slot, đúng thứ tự `slot` 0..5, `date` = local midnight
- [x] 4.2 `FocusNodeCard` — skill trọng tâm, level/target, % tiến trình, số bằng chứng, giờ tích lũy
  - **File:** `src/components/daily-loop/FocusNodeCard.tsx`
  - **Done:** bind dữ liệu thật từ `Skill` + `Evidence`
- [x] 4.3 `WeekStreak` — 7 cột trạng thái + streak
  - **File:** `src/components/daily-loop/WeekStreak.tsx`
  - **Done:** tính từ `PlanItem.done` 7 ngày gần nhất
- [x] 4.4 `SlotCard` — nhãn domain, tiêu đề, mô tả, phút, skill, nút Xong / Hoàn thành nhanh
  - **File:** `src/components/daily-loop/SlotCard.tsx`
  - **Done:** màu chip domain theo domain; slot ưu tiên có rail màu + badge CTA
- [x] 4.5 Server action "đánh dấu xong" → Activity + Evidence + PlanItem.done + streak
  - **File:** `src/app/api/log/route.ts`, `src/lib/levels.ts`
  - **Done:** tạo `Activity`; tạo `Evidence` nếu slot có `skillId`; set `done=true`; streak +1 nếu là hoạt động đầu tiên trong ngày
- [x] 4.6 `recomputeSkillLevel` — chỉ Evidence tăng level
  - **File:** `src/lib/levels.ts`
  - **Done:** `LEVEL_THRESHOLDS = [0,2,5,9,14,20]`; test AC-3
- [x] 4.7 `FsrsRetrievabilityCard` — retention %, stability TB, difficulty TB, đường cong 7 ngày
  - **File:** `src/components/daily-loop/FsrsRetrievabilityCard.tsx`
  - **Done:** tính từ `Card` bằng `ts-fsrs`
- [x] 4.8 `CacheHitCard` — cache hit rate
  - **File:** `src/components/daily-loop/CacheHitCard.tsx`
  - **Done:** `sum(cacheRead) / sum(inputTokens + cacheRead)`
- [x] 4.9 Panel "Sinh trắc & Nhịp độ" + hàng đợi FSRS
  - **File:** `src/components/daily-loop/*`
  - **Done:** mood/energy/focus/sleep từ `DailyState`; số thẻ đến hạn từ `Card.due`
- [x] 4.10 Empty state + CTA "Lập kế hoạch hôm nay" + fallback offline
  - **File:** `src/app/page.tsx`, `src/lib/plan.ts`
  - **Done:** không có key → vẫn sinh 6 slot từ `generateLocalPlan` (AC-7)
- [x] 4.11 Modal xem trước "Lập lại kế hoạch hôm nay (AI)"
  - **File:** `src/components/daily-loop/PlanPreviewModal.tsx`
  - **Done:** giữ slot đã `done`; hiển thị diff trước khi áp dụng
- [x] 4.12 Test Daily Loop (AC-1)
  - **File:** `tests/e2e/daily-loop.spec.ts`
  - **Done:** kế hoạch trống → CTA; bấm Xong → slot gạch ngang + Activity + Evidence trong DB

### 5. S05 — Quick-log `/log`

- [x] 5.1 `QuickLogSheet` — sheet trượt lên, mở bằng CTA + Cmd/Ctrl+K, Escape đóng
  - **File:** `src/components/quick-log/QuickLogSheet.tsx`
  - **Done:** focus vào ô nhập khi mở
- [x] 5.2 Bước 1 — 6 preset chip đánh số 1–6 + textarea
  - **File:** `src/components/quick-log/PresetChips.tsx`
  - **Done:** nhấn 1–6 điền nội dung mẫu + focus ô nhập
- [x] 5.3 Server action ghi nhanh (≤10s, không chờ AI)
  - **File:** `src/app/api/log/route.ts`
  - **Done:** ghi `Activity` tức thì, trả về nhanh; toast xong
- [x] 5.4 Bước 2 — AI tự phân tích (confidence, domain, skill, phút, độ sâu) + nút "Sửa"
  - **File:** `src/components/quick-log/AiPrefill.tsx`, `src/app/api/log/autofill/route.ts`
  - **Done:** provider **local** (`qwen2.5:7b`, 0 token) qua `lib/ai/router.ts`; lỗi → giữ form, không chặn bước 1
- [x] 5.5 Checkbox "Tự động tạo 1 Evidence"
  - **File:** `src/app/api/log/route.ts`
  - **Done:** tạo `Evidence` cho skill đã chọn khi tick
- [x] 5.6 Lịch sử — filter domain, thanh phân bổ nỗ lực, badge tổng phút, dòng mới ở đầu
  - **File:** `src/app/log/history/page.tsx`, `src/components/quick-log/HistoryList.tsx`
  - **Done:** dòng mới chèn đầu sau khi ghi
- [x] 5.7 Bản nháp `localStorage` (AC-14)
  - **File:** `src/components/quick-log/QuickLogSheet.tsx`
  - **Done:** đóng tab rồi mở lại vẫn còn nội dung
- [x] 5.8 Test Quick-log (AC-2, AC-14)
  - **File:** `tests/e2e/quick-log.spec.ts`
  - **Done:** ghi ≤10s; dòng mới ở đầu; draft giữ lại

### 6. S02 — Sinh kế hoạch AI `/plan`

- [x] 6.1 Trang 6 slot editable (domain, tiêu đề, mô tả, phút, skill, xoá)
  - **File:** `src/app/plan/page.tsx`, `src/components/daily-loop/SlotEditor.tsx`
  - **Done:** cấu trúc 6 slot cố định, chỉ sửa nội dung
- [x] 6.2 API AI-01 sinh 6 slot + diff view
  - **File:** `src/app/api/plan/generate/route.ts`
  - **Done:** trả 6 slot đúng domain/thời lượng theo bảng §2.1 requirements
- [x] 6.3 Panel thông tin AI (model, effort, token, thời gian) + badge "Offline — rule cục bộ"
  - **File:** `src/app/plan/page.tsx`
  - **Done:** hiển thị `AiCall` gần nhất
- [x] 6.4 Apply — ghi đè `PlanItem` hôm nay, giữ slot `done`
  - **File:** `src/app/plan/page.tsx`
  - **Done:** toast số slot đã ghi
- [x] 6.5 Test áp dụng kế hoạch
  - **File:** `tests/e2e/plan.spec.ts`
  - **Done:** apply xong S01 hiện 6 slot mới, slot đã xong vẫn `done`

### 7. S03 + S04 — Cây kỹ năng & chi tiết kỹ năng

- [x] 7.1 `SkillTree` 3 tầng, 4 domain cố định
  - **File:** `src/components/skills/SkillTree.tsx`, `src/app/skills/page.tsx`
  - **Done:** mỗi node có level, số bằng chứng, thanh segment, trạng thái focus
- [x] 7.2 Panel node đang chọn + "Đặt làm trọng tâm hôm nay" (chỉ 1 node)
  - **File:** `src/components/skills/SkillDetailPanel.tsx`
  - **Done:** đồng bộ sang S01 (trọng tâm duy nhất)
- [x] 7.3 Nút "Luyện tập đo lường ngay" → Activity + Evidence
  - **File:** `src/app/api/log/route.ts`
  - **Done:** tạo đúng 1 Activity + 1 Evidence gắn node
- [x] 7.4 Nút "Tạo mục kỹ năng con"
  - **File:** `src/app/skills/page.tsx`
  - **Done:** lưu tên, domain, mục cha, mức mục tiêu
- [x] 7.5 Feed "Bằng Chứng Gần Đây" (timeline + rating badge)
  - **File:** `src/components/skills/EvidenceFeed.tsx`
  - **Done:** sắp xếp theo thời gian giảm dần
- [x] 7.6 KPI đầu trang (tổng bằng chứng, trọng tâm, chờ luyện, số domain)
  - **File:** `src/app/skills/page.tsx`
  - **Done:** số liệu thật
- [x] 7.7 S04 header + breadcrumb 4 cấp + 4 số liệu
  - **File:** `src/app/skills/[id]/page.tsx`
  - **Done:** cấp độ, target, số bằng chứng, giờ tích lũy, điểm TB
- [x] 7.8 `LineChart` tiến trình xác thựnh theo tuần + ngưỡng level
  - **File:** `src/components/charts/LineChart.tsx`
  - **Done:** recharts, cùng token màu
- [x] 7.9 `BarChart` phân bổ hoạt động theo danh mục
  - **File:** `src/components/charts/BarChart.tsx`
  - **Done:** 6 danh mục
- [x] 7.10 `EvidenceTable` — ngày, loại, nội dung, rating, hash SQLite, nút mở
  - **File:** `src/components/skills/EvidenceTable.tsx`
  - **Done:** hash hiển thị mono (`font-code-md`), dữ liệu thật
- [x] 7.11 `LevelChecklist` tiêu chuẩn thăng cấp
  - **File:** `src/components/skills/LevelChecklist.tsx`
  - **Done:** tick đạt/chưa đạt theo ngưỡng `LEVEL_THRESHOLDS`
- [x] 7.12 `AiSuggestionCard` — đề xuất bài tập từ lỗ hổng bằng chứng + nút "Tạo slot ngày mai"
  - **File:** `src/components/skills/AiSuggestionCard.tsx`
  - **Done:** tạo `PlanItem` cho ngày mai
- [x] 7.13 Test cây kỹ năng
  - **File:** `tests/e2e/skills.spec.ts`
  - **Done:** đặt trọng tâm → S01 đổi trọng tâm; "Luyện tập đo lường" → +1 Evidence

### 8. S12 — Đánh giá chính `/state`

- [x] 8.1 Form mood/energy/focus (slider 1–5) + giấc ngủ (giờ, bước 0.5)
  - **File:** `src/app/state/page.tsx`
  - **Done:** prefill giá trị hôm qua
- [x] 8.2 Lưu `DailyState` upsert theo `date`
  - **File:** `src/app/state/page.tsx`
  - **Done:** không tạo bản ghi trùng cùng ngày
- [x] 8.3 `StateDots` 7 ngày gần nhất, bấm để sửa
  - **File:** `src/components/daily-loop/StateDots.tsx`
  - **Done:** bind `DailyState`
- [x] 8.4 `CorrelationChart` overlay mood/energy/sleep + số hành động hoàn thành
  - **File:** `src/components/charts/CorrelationChart.tsx`
  - **Done:** 2 trục Y
- [x] 8.5 Toggle "7 Ngày / 30 Ngày" (mockup chưa có handler)
  - **File:** `src/app/state/page.tsx`
  - **Done:** đổi khoảng thời gian biểu đồ
- [x] 8.6 Card "Dữ liệu đã gửi lên" (FR-PS-07)
  - **File:** `src/components/daily-loop/DataSentCard.tsx`
  - **Done:** liệt kê nội dung đã đi lên API; mặc định `DailyState` **không** gửi

### 9. S15 — Cài đặt `/settings` (Phase 0: tab 1 + tab 2 cơ bản)

- [x] 9.1 Layout 4 tab
  - **File:** `src/app/settings/page.tsx`, `src/components/settings/SettingsTabs.tsx`
  - **Done:** chuyển tab hoạt động
- [x] 9.2 Tab 1 — Hồ sơ & Mục tiêu (`UserProfile`)
  - **File:** `src/components/settings/ProfileTab.tsx`
  - **Done:** lưu name, goals, aiTone, learningLangs, zhLevel, enLevel
- [x] 9.3 Tab 2 — API key: ghi `.env.local` server-side, không commit, không hiển thị đầy đủ
  - **File:** `src/app/api/settings/key/route.ts`, `src/components/settings/ApiKeyTab.tsx`
  - **Done:** response không trả key đầy đủ; UI hiện `sk-ant-••••••••`
- [x] 9.4 Nút "Chạy kiểm tra Ping Anthropic Endpoint"
  - **File:** `src/app/api/settings/key/route.ts` (action `ping`)
  - **Done:** 1 request tối thiểu, hiện kết quả + độ trễ ms
- [x] 9.5 Card "NGUYÊN TẮC BẢO MẬT P6 STRICT"
  - **File:** `src/components/settings/ApiKeyTab.tsx`
  - **Done:** liệt kê 4 điều khoá
- [x] 9.6 Test bảo mật key
  - **File:** `tests/e2e/settings-key.spec.ts`
  - **Done:** `.env.local` có key sau khi lưu; `.gitignore` chứa `.env.local`; response không chứa key đầy đủ

---

## Phase 1 — Luyện tập cốt lõi (Đo được năng lực)

**Definition of Done:** Ôn được 2 ngôn ngữ; viết bài và nhận điểm rubric có delta; mock interview trả về điểm 5 tiêu chí + 3 mạnh/3 yếu; bài kiểm tra đẩy thẻ sai về ôn.

### 10. S09 + S10 — Ôn ngoại ngữ SRS

- [x] 10.1 Wrapper FSRS (`ts-fsrs`)
  - **File:** `src/lib/fsrs.ts`
  - **Done:** `scheduleCard(state, rating, now)` → `{state, due, stability, difficulty}`; state lưu JSON
- [x] 10.2 `POST /api/srs/next` — lấy thẻ đến hạn, hết thì lấy thẻ mới, tối đa 20 thẻ
  - **File:** `src/app/api/srs/next/route.ts`
  - **Done:** `due <= now` trước; group chưa học sau
- [x] 10.3 `POST /api/srs/grade` — ghi `Review` + cập nhật `Card`
  - **File:** `src/app/api/srs/grade/route.ts`
  - **Done:** `reps`, `lapses`, `stability`, `difficulty`, `due` cập nhật; rating 1 → tăng `lapses`
- [x] 10.4 S09 hub — số thẻ đang học/đã thuộc/đến hạn + chuỗi ngày ôn + `VocabProgress`
  - **File:** `src/app/language/page.tsx`, `src/components/language/VocabProgress.tsx`
  - **Done:** số liệu thật theo `lang`
- [x] 10.5 Nút "Ôn ngay (N thẻ)" → `/language/session`
  - **File:** `src/app/language/page.tsx`
  - **Done:** đếm đúng số thẻ đến hạn
- [x] 10.6 Nút "Xuất Deck JSON" + "Thêm thẻ thủ công" (mockup chưa có handler)
  - **File:** `src/app/language/page.tsx`
  - **Done:** tải file JSON; form thêm thẻ có đủ field
- [x] 10.7 S10 `CardFront` — pinyin + hanzi tuỳ chọn + nút nghe (`zh-CN`)
  - **File:** `src/app/language/session/page.tsx`, `src/components/language/CardFront.tsx`
  - **Done:** `speechSynthesis` với `lang='zh-CN'`; bật/tắt hanzi
- [x] 10.8 `CardBack` — hanzi + nghĩa + ví dụ + nút nghe
  - **File:** `src/components/language/CardBack.tsx`
  - **Done:** ví dụ có pinyin nếu có
- [x] 10.9 `GradeButtons` — 4 nút + khoảng cách lượt ôn kế tiếp từ FSRS
  - **File:** `src/components/language/GradeButtons.tsx`
  - **Done:** nhãn thời gian đọc từ state FSRS thật
- [x] 10.10 `SessionProgress` — thanh tiến trình + "Thẻ 3 / 12" (bind thật)
  - **File:** `src/components/language/SessionProgress.tsx`
  - **Done:** không dùng số tĩnh
- [x] 10.11 Gợi ý phiên âm kiểu Việt cho thẻ en (2 tuần đầu)
  - **File:** `src/components/language/CardFront.tsx`
  - **Done:** dùng `Card.hint`; tự ẩn sau 14 ngày tạo
- [x] 10.12 Chế độ `produce` (gõ / nói, chấm fuzzy) — Phase 3 nhưng code path có sẵn
  - **File:** `src/lib/fuzzy.ts`
  - **Done:** hàm so khớp chuỗi, dùng được ngay
- [x] 10.13 Test SRS (AC-4)
  - **File:** `tests/unit/fsrs.test.ts`, `tests/e2e/srs.spec.ts`
  - **Done:** Good → due khớp ts-fsrs; Again → due hôm nay + lapses +1

### 11. S07 — Luyện giao tiếp Viết

- [x] 11.1 `PromptCard` — đề bài + badge CEFR + "Đề khác" + "Tạo đề theo chủ đề"
  - **File:** `src/app/speak/write/page.tsx`, `src/components/speak/SpeakingPractice.tsx`
  - **Done:** nạp đề từ ngân hàng
- [x] 11.2 `WriteEditor` — textarea + bộ đếm từ + nút "Chấm bài"
  - **File:** `src/components/speak/SpeakingPractice.tsx`
  - **Done:** disable khi đang chấm
- [x] 11.3 API AI-03 chấm theo rubric 5 tiêu chí (structured output)
  - **File:** `src/app/api/grade/route.ts`
  - **Done:** schema đúng 5 tiêu chí, score 0–5, tổng = trung bình
- [x] 11.4 `RubricGrid` — 5 tiêu chí: điểm + nhận xét + đề xuất sửa
  - **File:** `src/components/rubric/RubricGrid.tsx`
  - **Done:** dùng chung cho S07/S08
- [x] 11.5 `DeltaBadge` so với lần ghi trước
  - **File:** `src/components/rubric/DeltaBadge.tsx`
  - **Done:** ↑ primary / ↓ error
- [x] 11.6 Lưu bài → Activity (domain `communication`) + Evidence
  - **File:** `src/app/api/grade/route.ts`
  - **Done:** 1 Activity (domain communication, type=write/talk, aiScore=total) + 1 Evidence (rating 1–4 từ total, recomputeSkillLevel)
- [x] 11.7 Kho bài tập (prompt bank)
  - **File:** `src/components/speak/PromptBank.tsx`
  - **Done:** lưu/nạp prompt
- [x] 11.8 Test chấm điểm (AC-6)
  - **File:** `tests/integration/grading.test.ts`
  - **Done:** đúng 5 tiêu chí, tổng = trung bình, không tiêu chí ngoài rubric

### 12. S06 — Nhật ký & phản hồi AI

- [x] 12.1 `JournalEditor` + `CharacterCounter` + bản nháp `localStorage`
  - **File:** `src/app/journal/page.tsx`, `src/components/journal/JournalEditor.tsx`
  - **Done:** đếm ký tự; draft giữ lại
- [x] 12.2 3 gợi ý câu hỏi mở theo ngữ cảnh (sau buổi học / cuối ngày / cuối tuần) — bấm để chèn
  - **File:** `src/components/journal/PromptSuggestions.tsx`
  - **Done:** chèn vào cuối nội dung
- [x] 12.3 API AI-05 — 1 tóm tắt + 1 câu hỏi sắc
  - **File:** `src/app/api/journal/feedback/route.ts`
  - **Done:** structured output; tuyệt đối không trả lời dài
- [x] 12.4 `AiResponseCard` — khung câu hỏi sắc `border-primary` + nút "Chấp nhận → tạo Evidence"
  - **File:** `src/components/journal/AiResponseCard.tsx`
  - **Done:** nút tạo Evidence cho skill đề xuất
- [x] 12.5 API AI-06 phân loại domain/skill + confidence — provider **local** (`qwen2.5:7b`, 0 token)
  - **File:** `src/app/api/journal/classify/route.ts`
  - **Done:** gọi qua `lib/ai/router.ts`; badge hiển thị `Local · qwen2.5:7b`
- [x] 12.6 Lịch sử entry + ghi chú AI
  - **File:** `src/components/journal/JournalHistory.tsx`
  - **Done:** bind `Reflection`
- [x] 12.7 Privacy — chỉ gửi khi bấm "Gửi AI phản hồi"
  - **File:** `src/app/journal/page.tsx`
  - **Done:** không có request nào tự động khi gõ

### 13. S16–S18 — Mock Interview (S16 cấu hình · S17 phiên · S18 kết quả)

- [x] 13.1 `InterviewProfile` CRUD — label, jobTitle, seniority, language, questionKinds, focusSkills
  - **File:** `src/app/interview/setup/page.tsx`, `src/components/interview/ProfileCard.tsx`
  - **Done:** lưu nhiều hồ sơ; seed 3 hồ sơ mẫu (`backend-sr`, `architect-lead`, `eng-manager`)
- [x] 13.2 Quét cây kỹ năng → ghim node yếu nhất
  - **File:** `src/lib/skills.ts`, `src/components/interview/PinnedWeakNodes.tsx`
  - **Done:** ưu tiên node 0 bằng chứng (Score 0.0) trước node 2 bằng chứng (Score 1.2)
- [x] 13.3 Chọn 5 dạng câu + số câu (5/8/12) + phương thức trả lời + tuỳ chọn nâng cao
  - **File:** `src/app/interview/setup/page.tsx`
  - **Done:** estimate `~$0.18/phiên` hiển thị
- [x] 13.4 `POST /api/interview/start` — tạo `InterviewSession` trước khi hiện câu hỏi
  - **File:** `src/app/api/interview/start/route.ts`
  - **Done:** `status='active'`, `plannedCount` theo lựa chọn
- [x] 13.5 API AI-11 sinh câu hỏi đầu (kèm kind + skill)
  - **File:** `src/app/api/interview/start/route.ts`
  - **Done:** truyền `focusSkills` + `jobTitle` + `seniority` vào prompt
- [x] 13.6 `QuestionCard` — nhãn dạng câu + skill + nút "Câu hỏi này có vấn đề"
  - **File:** `src/components/interview/QuestionCard.tsx`
  - **Done:** nút flag ghi log
- [x] 13.7 `ResponsePanel` — textarea + nút Gửi (Enter)
  - **File:** `src/components/interview/ResponsePanel.tsx`
  - **Done:** Enter gửi, Shift+Enter xuống dòng
- [x] 13.8 API AI-12 — 1 call chấm + trả lời + sinh câu tiếp theo
  - **File:** `src/app/api/interview/turn/route.ts`
  - **Done:** ghi `InterviewTurn` (scores JSON, total, feedback, nextQuestion)
- [x] 13.9 Adaptive — câu hời hợt → follow-up; đã đạt → câu mới
  - **File:** `src/lib/prompts.ts`, `src/app/api/interview/turn/route.ts`
  - **Done:** prompt yêu cầu rõ tiêu chí follow-up
- [x] 13.9a API AI-19 — sinh câu hỏi tiếp theo (adaptive) — **provider local** (`llama3.3`) (FR-AI-19)
  - **File:** `src/app/api/interview/next-question/route.ts`
  - **Done:** `AiCall{provider:"local", estimatedCost:0}`; nhãn S17 `Mô hình đánh giá: Local Llama-3.3 + Opus` khớp; **phần chấm điểm vẫn là cloud** (`claude-opus-5`) — tách 2 provider trong 1 lượt
- [x] 13.10 `RubricScore` thu gọn trong phiên (chỉ 5 tiêu chí, không diễn giải)
  - **File:** `src/components/rubric/RubricScoreCompact.tsx`
  - **Done:** không hiện comment dài
- [x] 13.11 Tiến trình "Câu 3 / 8" + timer thật
  - **File:** `src/components/interview/SessionProgress.tsx`
  - **Done:** không dùng số tĩnh
- [x] 13.12 API AI-13 — báo cáo cuối phiên
  - **File:** `src/app/api/interview/report/route.ts`
  - **Done:** 3 mạnh (kèm trích dẫn nguyên văn) + 3 yếu (kèm số câu)
- [x] 13.13 Tạo `Activity` khi kết thúc phiên (`Evidence` **chỉ** tạo khi người dùng bấm — FR-MI-10d)
  - **File:** `src/app/api/interview/report/route.ts`
  - **Done:** `type='mock_interview'`, `aiScore` = tổng; **không** tự tạo `Evidence` — `Evidence` do task 13.16 tạo khi người dùng bấm "Tạo bằng chứng kỹ năng" (P3)
- [x] 13.14 S18 scorecard — điểm tổng + delta + ma trận 5 tiêu chí
  - **File:** `src/app/interview/demo-session/[sessionId]/page.tsx`, `src/components/interview/ScorecardMatrix.tsx`
  - **Done:** delta so với phiên trước cùng hồ sơ
- [x] 13.15 3 điểm mạnh (trích dẫn `border-l-2 border-primary`) + 3 điểm yếu (số câu)
  - **File:** `src/app/interview/demo-session/[sessionId]/page.tsx`
  - **Done:** trích dẫn là nguyên văn trong `InterviewTurn.answer`
- [x] 13.16 `SkillTreeBridge` — đề xuất luyện tiếp + nút "Tạo bằng chứng kỹ năng" (vòng đóng FR-MI-10)
  - **File:** `src/app/interview/demo-session/[sessionId]/page.tsx`
  - **Done:** bấm → tạo 1 `Evidence` cho node trọng tâm (`activityId` trỏ về `Activity` phiên mock) → `recomputeSkillLevel` cập nhật level → S03 cây kỹ năng hiển thị level mới + S01 đưa vào kế hoạch ngày mai
- [x] 13.17 Biểu đồ tiến bộ theo thời gian (≥2 phiên)
  - **File:** `src/app/interview/demo-session/[sessionId]/page.tsx`
  - **Done:** chỉ hiện khi đủ 2 phiên
- [x] 13.18 Nút "Làm lại với hồ sơ này"
  - **File:** `src/app/interview/demo-session/[sessionId]/page.tsx`
  - **Done:** tạo session mới cùng `profileId`
- [x] 13.19 Resume phiên đã dừng
  - **File:** `src/app/interview/session/page.tsx`
  - **Done:** load `InterviewTurn` đã lưu
- [x] 13.20 Test mock interview (AC-9, AC-10, AC-13)
  - **File:** `tests/integration/interview.test.ts`, `tests/e2e/interview.spec.ts`
  - **Done:** 8 câu → 5 tiêu chí mỗi câu; 3 mạnh + 3 yếu; node yếu được hỏi trước; delta hiện đúng

### 14. S19–S21 — Bài kiểm tra ngoại ngữ (S19 danh sách · S20 làm bài · S21 kết quả)

- [x] 14.1 4 `TestTypeCard` — placement / topic / benchmark / from_content
  - **File:** `src/app/test/page.tsx`, `src/components/test/TestTypeCard.tsx`
  - **Done:** mỗi card có số câu + có/không timer
- [x] 14.2 Đổi ngôn ngữ → hiện level ước lượng (HSK / CEFR)
  - **File:** `src/app/test/page.tsx`
  - **Done:** đọc `UserProfile.zhLevel`/`enLevel`
- [x] 14.3 `BenchmarkChart` tiến bộ nhiều kỳ + 6 dạng câu + 5 từ sai nhiều nhất
  - **File:** `src/components/test/BenchmarkChart.tsx`
  - **Done:** bind `TestSession.score`
- [x] 14.4 API AI-14 blueprint bài kiểm tra — **chọn lọc tất định, KHÔNG gọi AI** (FR-AI-17)
  - **File:** `src/app/api/test/blueprint/route.ts`
  - **Done:** nhận `{lang, level, topic, itemTypes[], count}` → trả đúng số câu, đúng phân bố dạng; **không** ghi `AiCall`
- [x] 14.5 Sinh item từ thẻ yếu + seed (AI không sinh từ vựng mới)
  - **File:** `src/lib/test-gen.ts`
  - **Done:** ưu tiên `lapses` cao, `difficulty` cao
- [x] 14.6 `ItemRenderer` cho 6 dạng câu
  - **File:** `src/components/test/ItemRenderer.tsx`
  - **Done:** mc (radio 4), cloze (input), listening (nút nghe TTS `audioText`), writing/translation (textarea)
- [x] 14.7 `QuestionMatrix` 40 ô trạng thái + phím tắt
  - **File:** `src/components/test/QuestionMatrix.tsx`
  - **Done:** 1-4 chọn đáp án, Space tiếp, Enter xác nhận
- [x] 14.8 Timer đếm ngược cho benchmark/from_content + lưu thời gian từng câu
  - **File:** `src/app/test/session/page.tsx`
  - **Done:** bind thật, `durationSec` + `TestItem.seconds`
- [x] 14.9 Lưu từng câu ngay khi trả lời (không mất khi đóng tab) + quay lại câu đã trả lời
  - **File:** `src/app/test/session/page.tsx`
  - **Done:** mỗi lần chọn đáp án → ghi DB
- [x] 14.10 Chấm tự động mc/cloze/listening
  - **File:** `src/lib/test-gen.ts` hoặc `src/app/api/test/grade-open/route.ts`
  - **Done:** so khớp chuỗi, chấm `isCorrect`
- [x] 14.11 API AI-15 chấm writing/translation theo `RUBRIC_LANGUAGE_ERRORS` (4 nhóm)
  - **File:** `src/app/api/test/grade-open/route.ts`
  - **Done:** lỗi chỉ thuộc 1 trong 4 nhóm
- [x] 14.12 Đẩy thẻ về ôn khi sai (due=hôm nay, lapses+1)
  - **File:** `src/app/api/test/grade-open/route.ts`
  - **Done:** chỉ thẻ có `cardId`; hiện "N thẻ bị đẩy về ôn"
- [x] 14.13 API AI-16 ước lượng level — **provider local** (`qwen2.5-coder:7b-instruct`)
  - **File:** `src/app/api/test/level/route.ts`
  - **Done:** kèm ghi chú giới hạn; `AiCall{provider:"local", estimatedCost:0}`
- [x] 14.14 Placement → set `UserProfile.zhLevel`/`enLevel` + gợi ý nhóm từ
  - **File:** `src/app/api/test/level/route.ts`
  - **Done:** cập nhật profile
- [x] 14.15 S21 — tổng điểm, `RadarChart` 6 trục, phân tách theo dạng, câu sai + giải thích
  - **File:** `src/app/test/[id]/page.tsx`, `src/components/test/ResultRadar.tsx`
  - **Done:** radar ngũ giác/6 trục; tổng đúng (vd 15+10+8+7=40)
- [x] 14.16 `LapseCards` — 3 thẻ bị đẩy về ôn + nút "Ôn ngay" → S10 đúng các thẻ đó
  - **File:** `src/components/test/LapseCards.tsx`
  - **Done:** truyền danh sách `cardId` sang S10
- [x] 14.17 Nút "Làm bài tương tự" — sinh đề song song về độ khó (FR-LT-12)
  - **File:** `src/app/test/[id]/page.tsx`, `src/lib/test-gen.ts`
  - **Done:** 2 lần thi cùng topic → độ khó ngang nhau
- [x] 14.18 Chấm writing 4 mục out of 10
  - **File:** `src/components/test/WritingEval.tsx`
  - **Done:** hiển thị 4 mục + điểm
- [x] 14.19 Tạo Activity + Evidence khi bài kết thúc
  - **File:** `src/app/api/test/blueprint/route.ts` hoặc action riêng
  - **Done:** `domain='language'`, `type='test'`
- [x] 14.20 API AI-17 sinh đề từ nguồn văn bản (`from_content`) — **provider local** (`qwen2.5:7b`)
  - **File:** `src/app/api/test/from-content/route.ts`
  - **Done:** nhận text UTF-8 không giới hạn → trả blueprint item; `AiCall{provider:"local", estimatedCost:0}`; nhãn S19 `CẤU TRÚC ĐỀ TỰ TẠO: Ollama Qwen-2.5 7B` khớp
- [x] 14.21 Test bài kiểm tra (AC-11, AC-12)
  - **File:** `tests/e2e/test.spec.ts`
  - **Done:** 5 câu sai → 5 thẻ `due=hôm nay`; 0 câu sai → "0 thẻ bị đẩy về ôn", không crash

### 15. S13 — Báo cáo tuần

- [x] 15.1 Query tổng hợp tuần + so sánh tuần trước
  - **File:** `src/app/review/page.tsx`, `src/lib/weekly.ts`
  - **Done:** số hành động, phân bổ domain, top 3 kỹ năng, mood/sleep TB
- [x] 15.2 Tự chạy Weekly Review (Chủ nhật 20:00 hoặc lần mở đầu tuần)
  - **File:** `src/app/review/page.tsx` hoặc middleware
  - **Done:** flag trong DB để không chạy 2 lần
- [x] 15.3 API AI-07 — 3 nhận định + 6 slot tuần sau
  - **File:** `src/app/api/review/weekly/route.ts`
  - **Done:** effort `high`
- [x] 15.4 `InsightList` — 1 tốt / 1 cần sửa / 1 nên thử
  - **File:** `src/components/review/InsightList.tsx`
  - **Done:** 3 màu primary/tertiary/secondary
- [x] 15.5 `PlanProposal` — 6 slot sửa inline + "Duyệt & Áp dụng"
  - **File:** `src/components/review/PlanProposal.tsx`
  - **Done:** ghi `PlanItem` `source='ai'`; toast số lượng
- [x] 15.6 Giảm tải kế hoạch khi trượt ≥2 ngày (FR-WR-05)
  - **File:** `src/lib/weekly.ts`, `src/lib/prompts.ts`
  - **Done:** ít slot hơn + ghi chú lý do
- [x] 15.7 Nút "Xuất JSON" — tải file thật (mockup chỉ toast)
  - **File:** `src/app/review/page.tsx`
  - **Done:** file JSON tải xuống được
- [x] 15.8 Sửa link điều hướng trong S13 (mockup trỏ `s17`/`s21`)
  - **File:** `src/app/review/page.tsx`
  - **Done:** trỏ `/interview/setup` và `/test` đúng chuẩn

### 16. S14 — Báo cáo tiến bộ

- [x] 16.1 4 KPI — level TB, bằng chứng tháng, tỷ lệ giữ FSRS, điểm phản xạ giao tiếp
  - **File:** `src/app/progress/page.tsx`
  - **Done:** dữ liệu thật; không "tổng giờ học" trần trụi (P7)
- [x] 16.2 `TrajectoryChart` — quỹ đạo 6 tháng, 4 đường domain, trục Y level 0–5
  - **File:** `src/components/charts/TrajectoryChart.tsx`
  - **Done:** bind `Skill.level` theo tháng
- [x] 16.3 `EvidenceHeatmap` — lưỗi 90 ngày, chỉ tô ô có sản phẩm thực tế
  - **File:** `src/components/charts/EvidenceHeatmap.tsx`
  - **Done:** nguồn = `Evidence` + `Activity.type` lọc; dùng ngày thật (2026), không dùng chu kỳ 2024 của mockup
- [x] 16.4 `SelfCompareTable` — hiện tại vs 30 ngày trước, giá trị cũ gạch ngang
  - **File:** `src/components/progress/SelfCompareTable.tsx`
  - **Done:** tính từ DB
- [x] 16.5 `TimeAllocationChart` — 4 nhóm deliberate practice (chỉ tính thời gian có sản phẩm)
  - **File:** `src/components/charts/TimeAllocationChart.tsx`
  - **Done:** dựa `Activity.minutes` có `Evidence`
- [x] 16.6 `DomainFilter` — chip 4 domain + "Tất cả" (mockup chưa có handler)
  - **File:** `src/components/progress/DomainFilter.tsx`
  - **Done:** lọc cả biểu đồ lẫn heatmap
- [x] 16.7 Nút "Xuất JSON tiến độ" — tải file JSON
  - **File:** `src/components/progress/ProgressView.tsx`
  - **Done:** JSON gồm kpi, domains, self_comparison

### 17. S15 — Hoàn thiện tab chi phí & dữ liệu

- [x] 17.1 Tab 3 — ngân sách tháng + cảnh báo ≥80%
  - **File:** `src/components/settings/CostTab.tsx`
  - **Done:** từ `AiCall`; ngân sách lưu trong `UserProfile` hoặc setting riêng
- [x] 17.2 Card cache — `cacheRead` tổng, hit rate, số lượt gọi (ok/fallback), độ trễ TB
  - **File:** `src/components/settings/CostTab.tsx`
  - **Done:** độ trễ TB tính từ `createdAt` kế tiếp − trước
- [x] 17.3 `CostBar` — phân bổ chi phí theo 8 feature
  - **File:** `src/components/settings/CostBar.tsx`
  - **Done:** từ `AiCall.feature`; **tách riêng** provider `local` (0 token) khỏi provider `anthropic`
- [x] 17.4 Bảng chi tiết (provider, model, số lượt, chi phí, %) + bảng nhật ký gọi API gần nhất
  - **File:** `src/components/settings/CostTable.tsx`, `src/components/settings/CallLogTable.tsx`
  - **Done:** 20 dòng gần nhất; cột `provider` + cột `fallbackFrom`
- [x] 17.5 Nút "Xuất CSV" / "Xuất JSON" / toggle / phân trang / eye (mockup chưa có handler)
  - **File:** `src/components/settings/CostTab.tsx`
  - **Done:** mọi nút có hành vi thật
- [x] 17.6 Toggle "Chế độ khẩn cấp tiết kiệm"
  - **File:** `src/components/settings/CostTab.tsx`, `src/lib/ai/router.ts`
  - **Done:** bật → router chỉ trả provider `local` cho task local + `claude-haiku-4-5` cho task cloud; ghi trạng thái vào DB
- [x] 17.7 Tab 4 — Xuất toàn bộ DB JSON / Nhập JSON (zod) / Xóa trắng 2 bước
  - **File:** `src/app/api/export/route.ts`, `src/app/api/import/route.ts`
  - **Done:** xác nhận 2 bước trước khi xoá; import validate bằng zod
- [x] 17.8 Thống kê số bản ghi mỗi bảng
  - **File:** `src/components/settings/DataTab.tsx`
  - **Done:** số thật
- [x] 17.9 **Bảo mật API key** (P6 STRICT — sửa lỗi mockup #6)
  - **File:** `src/app/api/settings/key/route.ts`, `src/components/settings/ApiKeyTab.tsx`, `.env.local`, `.gitignore`
  - **Done:** key đọc từ `.env.local`, **không** hardcode literal trong code/HTML, **không** commit, **không** hiển thị đầy đủ trong UI (chỉ `sk-…xyzA`); route `GET` chỉ trả masked key + 4 ký tự cuối; route `POST` ghi vào `.env.local` (không ghi vào DB, không gửi qua dịch vụ trung gian)
  - **Verify (2026-10-30):** `tests/unit/api-key-security.test.ts` (21 test) + `tests/e2e/settings-key.spec.ts`.
  - **Ghi chú định dạng masked:** `MASKED_KEY = "sk-ant-••••••••"` — **cố ý không** kèm 4 ký tự cuối. Lý do: `maskApiKey()` không được phụ thuộc vào độ dài/giá trị key thật (tránh rò rỉ thông tin qua chuỗi che), và đây là dạng mà `design.md §4.15` chốt (`sk-ant-••••••••••••`) + `tests/e2e/settings-key.spec.ts` assert bằng `toBe(MASKED)`. Cụm "4 ký tự cuối" trong mô tả task là chi tiết của bản mockup, không áp dụng cho production.
  - **Sửa thêm:** key giờ có **hiệu lực lúc runtime** — `src/lib/ai/router.ts`, `src/lib/ai/anthropic.ts`, `src/lib/shell.ts`, `src/lib/daily-loop-data.ts` đọc `.env.local` qua `readEnvLocalKeyCached()` (cache theo `mtimeMs`) nên key lưu từ UI có hiệu lực ngay, không cần restart app.
- [x] 17.10 **Panel model local** — trạng thái Ollama + danh sách model khả dụng (FR-AI-12)
  - **File:** `src/components/settings/LocalModelPanel.tsx`, `src/app/api/ai/models/route.ts`
  - **Done:** hiển thị `Ollama: Connected/Offline` + danh sách model (`qwen2.5:7b`, `llama3.3`, `qwen2.5-coder:7b-instruct`); offline → hướng dẫn cài đặt; nút "Dùng model này" cập nhật bảng routing
- [x] 17.11 Badge "Prompt Cache Engine: ACTIVE" + `Cache Hit Rate %` (FR-AI-08)
  - **File:** `src/components/settings/CostTab.tsx`
  - **Done:** hit rate tính từ `AiCall.cacheRead / (cacheRead + inputTokens)`; hiển thị số thật, **không** hardcode `91.4%`

> **⚠️ Ghi chú hạ tầng — DB test phải cô lập khỏi DB dev.**
>
> Vitest **không** load `.env` (Next.js thì có) → `process.env.DATABASE_URL` bị
> undefined → Prisma fallback sang `.env` → `file:./dev.db` → **DB thật của
> người dùng**. Test `POST /api/wipe` (17.7) xoá sạch toàn bộ bảng → đã xoá
> mất dữ liệu dev 1 lần.
>
> Cách khắc phục (giữ nguyên, không revert):
>   - `vitest.config.ts` → `test.env.DATABASE_URL = "file:./test.db"` (tương đối
>     so với thư mục schema `prisma/` → `prisma/test.db`) + `globalSetup`.
>   - `tests/helpers/test-db.ts` → `pushSchema()` / `seedTestDb()` / `resetTestDb()`.
>   - `tests/global-setup.ts` → `db push` + `db seed` trước mỗi lần chạy suite.
>
> `prisma/test.db` bị gitignore (`*.db`) → không bao giờ commit.

---

## Phase 2 — Luyện chủ động

**Definition of Done:** Hội thoại AI có mục tiêu ẩn; bài viết sai được sửa đúng nhóm lỗi; app báo "khi ngủ <6h thì…".

### 18. S08 — Luyện giao tiếp Nói

- [ ] 18.1 `TalkRecorder` — MediaRecorder + timer + waveform canvas
  - **File:** `src/app/speak/talk/page.tsx`, `src/components/speak/TalkRecorder.tsx`
  - **Done:** nút ghi 48px; timer thật
- [ ] 18.2 Web Speech API STT (`zh-CN`/`en-US`/`vi-VN`) → transcript
  - **File:** `src/components/speech/SpeechRecognitionHook.ts`
  - **Done:** fallback nếu trình duyệt không hỗ trợ
- [ ] 18.3 Chấm theo cùng rubric 5 tiêu chí + ghi chú từ điệu/độ rõ (AI-04)
  - **File:** `src/app/api/grade/route.ts`
  - **Done:** dùng chung `RUBRIC_COMMUNICATION`
- [ ] 18.4 3 chế độ Viết · Nói · Hội thoại (tab switch)
  - **File:** `src/app/speak/talk/page.tsx`
  - **Done:** chuyển tab hoạt động
- [ ] 18.5 Nút pause / redo / filter (mockup chưa có handler)
  - **File:** `src/components/speak/TalkRecorder.tsx`
  - **Done:** có hành vi thật
- [ ] 18.6 Resume phiên bỏ dở
  - **File:** `src/app/speak/talk/page.tsx`
  - **Done:** giữ phiên qua `localStorage` + DB

### 19. S11 — Luyện ngoại ngữ chủ động

- [ ] 19.1 Layout 4 tab: Viết · Hội thoại AI · Sửa lỗi · Thẻ mới
  - **File:** `src/app/language/practice/page.tsx`
  - **Done:** chuyển tab hoạt động
- [ ] 19.2 AI-08 role-play theo `lang` + level người dùng
  - **File:** `src/app/api/roleplay/route.ts`
  - **Done:** AI đóng vai, trả lời đúng ngôn ngữ
- [ ] 19.3 AI-09 sửa lỗi 4 nhóm — provider **local** (`qwen2.5-coder:7b-instruct`, 0 token)
  - **File:** `src/app/api/language/correct/route.ts`
  - **Done:** gọi qua `lib/ai/router.ts`; `RUBRIC_LANGUAGE_ERRORS` từ `src/lib/rubrics.ts`
- [ ] 19.4 AI-10 sinh flashcard từ bài viết → nút "Thêm vào ôn" — provider **anthropic** (`claude-haiku-4-5`)
  - **File:** `src/app/api/language/cards/route.ts`
  - **Done:** gọi qua `lib/ai/router.ts`; tạo `Card` thật với `cardState` FSRS khởi tạo; nhãn S06 `Phân loại (Claude Haiku 4.5)` khớp
- [ ] 19.5 Nút "Xoá nhập lại" + "Phát âm mẫu" (mockup chưa có handler)
  - **File:** `src/app/language/practice/page.tsx`
  - **Done:** có hành vi thật
- [ ] 19.6 Bài kiểm tra `from_content` (FR-LT-09)
  - **File:** `src/app/test/page.tsx`, `src/lib/test-gen.ts`
  - **Done:** dán văn bản → sinh câu đọc hiểu + chấm tóm tắt bằng tiếng đích

### 20. Phân tích tương quan & giảm tải

- [ ] 20.1 FR-PS-05 — phân tích tương quan chỉ số ↔ hiệu suất
  - **File:** `src/lib/correlation.ts`, `src/app/state/page.tsx`
  - **Done:** hiện câu kiểu "khi ngủ < 6h, điểm tập trung hôm sau giảm 30%"
- [ ] 20.2 API AI-18 — suy diễn tương quan sinh trắc — **provider local** (`llama3.3`) (FR-AI-18)
  - **File:** `src/lib/correlation.ts`, `src/app/api/state/correlate/route.ts`
  - **Done:** `AiCall{provider:"local", estimatedCost:0}`; nhãn S12 `Engine suy diễn cục bộ (Local Vector Engine)` khớp; **không** gửi dữ liệu sinh trắc ra ngoài máy (P6 STRICT)
- [ ] 20.3 FR-WR-05 — AI tự giảm tải kế hoạch khi trượt ≥2 ngày
  - **File:** `src/lib/prompts.ts`, `src/lib/weekly.ts`
  - **Done:** ghi chú lý do hiển thị trong S13
- [ ] 20.4 FR-LG-07 — sinh thẻ biến thể khi thẻ sai
  - **File:** `src/lib/card-variants.ts`
  - **Done:** ví dụ câu khác hoặc thẻ điền chỗ trống

---

## Phase 3 — Bổ sung

**Definition of Done:** Cài lên màn hình chính; đi bộ offline vẫn ghi được; trả lời phỏng vấn bằng giọng nói.

### 21. PWA & offline

- [ ] 21.1 Service worker + manifest
  - **File:** `public/manifest.webmanifest`, `public/sw.js`
  - **Done:** cài lên màn hình chính; cache shell
- [ ] 21.2 Offline ghi được hoạt động
  - **File:** `src/lib/db.ts`, `src/app/api/log/route.ts`
  - **Done:** đi bộ offline vẫn tạo `Activity`
- [ ] 21.3 Sync queue khi có mạng lại
  - **File:** `src/lib/sync.ts`
  - **Done:** không mất dữ liệu

### 22. Speech nâng cao

- [ ] 22.1 Chế độ `produce` với STT (FR-LG-06)
  - **File:** `src/app/language/session/page.tsx`, `src/lib/fuzzy.ts`
  - **Done:** gõ hoặc nói; chấm fuzzy
- [ ] 22.2 Mock interview bằng giọng nói (FR-MI-07 P1)
  - **File:** `src/app/interview/session/page.tsx`
  - **Done:** STT theo `InterviewProfile.language`
- [ ] 22.3 Đo "clarity of expression" khi trả lời tiếng Anh (FR-MI-14)
  - **File:** `src/lib/prompts.ts`
  - **Done:** điểm riêng cho tiêu chí này
- [ ] 22.4 `speechSynthesis` fallback danh sách giọng
  - **File:** `src/components/speech/SpeechButton.tsx`
  - **Done:** nếu không có `zh-CN` → chỉ dùng pinyin + hanzi

### 23. Xuất/nhập & mở rộng

- [ ] 23.1 Xuất toàn bộ DB JSON (đã làm ở 17.7) — hoàn thiện schema version
  - **File:** `src/app/api/export/route.ts`
  - **Done:** có `schemaVersion`
- [ ] 23.2 Nhập JSON có validate + báo cáo dòng lỗi
  - **File:** `src/app/api/import/route.ts`
  - **Done:** báo rõ record nào lỗi
- [ ] 23.3 Nhiều ngôn ngữ ngoài zh/en
  - **File:** `prisma/seed.ts`, `src/lib/prompts.ts`
  - **Done:** `lang` mở rộng không cần đổi schema

---

## Phase 4 — Chất lượng & đồng bộ thiết kế

### 24. Đồng bộ 21 màn hình với design system

- [ ] 24.1 Chạy visual regression 21 màn hình
  - **File:** `tests/visual/screens.spec.ts`, `tests/visual/__screenshots__/`
  - **Done:** khác biệt pixel ≤ 2% mỗi màn hình so với `stitch_daily_loop_os/sXX_*/screen.png`
- [ ] 24.2 Test token nhất quán (NFR-10)
  - **File:** `tests/unit/tokens.test.ts`
  - **Done:** không có hex ngoài palette; `borderRadius` chỉ 4 giá trị; `fontSize` chỉ token khai báo
- [ ] 24.3 Test "không có nút chết" (NFR-11)
  - **File:** `tests/e2e/no-dead-buttons.spec.ts`
  - **Done:** mọi `<button>` trong 21 màn hình đều có handler hoặc `disabled` hợp lý
- [ ] 24.4 Chuẩn hoá các sai lệch đã phát hiện (§9 design.md)
  - **File:** `stitch_daily_loop_os/focus_flow/DESIGN.md`, `src/styles/tokens.ts`, `SPEC.md`
  - **Done:** màu/radius/`headline-sm`/nhãn nav/ngày 2024 → đã chốt 1 giá trị
- [ ] 24.5 Test không crash khi thiếu dữ liệu (empty state thay vì số giả)
  - **File:** `tests/e2e/empty-state.spec.ts`
  - **Done:** DB rỗng → 21 màn hình render được, không NaN/undefined

### 25. A11y & hiệu năng

- [ ] 25.1 Kiểm tra tương phản WCAG AA cho cặp token chính
  - **File:** `tests/unit/contrast.test.ts`
  - **Done:** `on-surface`/`background` ≥ 4.5:1; `primary`/`on-primary` ≥ 4.5:1
- [ ] 25.2 Kiểm tra điều hướng bàn phím
  - **File:** `tests/e2e/keyboard.spec.ts`
  - **Done:** Tab order hợp lý; focus ring rõ; Escape đóng modal
- [ ] 25.3 `aria-live` cho phản hồi AI
  - **File:** `src/components/rubric/RubricGrid.tsx`, `src/components/journal/AiResponseCard.tsx`
  - **Done:** vùng `role="status" aria-live="polite"`
- [ ] 25.4 Đo hiệu năng: trang chủ SSR < 500ms
  - **File:** `tests/e2e/perf.spec.ts`
  - **Done:** đạt ngưỡng trên máy dev
- [ ] 25.5 Kiểm tra quick-log đóng modal tức thì (không chờ AI)
  - **File:** `tests/e2e/quick-log.spec.ts`
  - **Done:** modal mở < 100ms

### 26. Tài liệu

- [ ] 26.1 `README.md` — cài đặt, chạy, seed, cấu hình API key
  - **File:** `README.md`
  - **Done:** lệnh copy-paste chạy được từ số 0
- [ ] 26.2 `docs/architecture.md` — sơ đồ luồng dữ liệu + AI routing
  - **File:** `docs/architecture.md`
  - **Done:** khớp `design.md` §1.3 và §6
- [ ] 26.3 `docs/rubrics.md` — 4 rubric + cách chỉnh
  - **File:** `docs/rubrics.md`
  - **Done:** giải thích vì sao rubric cố định (P4)
- [ ] 26.4 Cập nhật `SPEC.md` + `DESIGN.md` sau khi chốt Q1–Q8
  - **File:** `SPEC.md`, `stitch_daily_loop_os/focus_flow/DESIGN.md`
  - **Done:** tên seed, level thật, mục tiêu thời gian đã điền

---

## Checklist nghiệm thu cuối

- [ ] AC-1 Daily Loop: kế hoạch trống → CTA, không lỗi
- [ ] AC-2 Quick-log: lưu ≤10s, không chờ AI
- [ ] AC-3 Tiến độ = bằng chứng: level chỉ tăng qua Evidence
- [ ] AC-4 SRS: `due` khớp FSRS, Again tăng `lapses`
- [ ] AC-5 Prompt caching: call 2 có `cache_read_input_tokens > 0`
- [ ] AC-6 Chấm điểm: đúng 5 tiêu chí, tổng = trung bình
- [ ] AC-7 Offline: không có key vẫn sinh 6 hành động (qua Ollama hoặc rule cục bộ)
- [ ] AC-7b AI Router: `route(task)` trả đúng provider; anthropic lỗi → fallback local → `AiCall{provider:"local", fallbackFrom:"anthropic"}`
- [ ] AC-8 Refusal: không crash, ghi `AiCall{ok:false}`
- [ ] AC-9 Mock Interview: 5 tiêu chí + 3 mạnh + 3 yếu
- [ ] AC-10 Hỏi đúng chỗ yếu: node 0 bằng chứng được hỏi trước
- [ ] AC-11 Bài kiểm tra: đúng số thẻ đẩy về ôn, nút "Ôn ngay" đúng thẻ
- [ ] AC-12 Câu tự luận: lỗi thuộc đúng 1 trong 4 nhóm
- [ ] AC-13 So sánh được: delta từng tiêu chí giữa 2 phiên
- [ ] AC-14 Quick-log không mất dữ liệu: draft giữ lại
- [ ] AC-15 Shell đồng nhất: 21 màn hình cùng 9 nav + chip header + **1 nav active**
- [x] AC-16 Bảo mật key (P6 STRICT): không còn literal `sk-ant-...` trong code/HTML; key đọc từ `.env.local`; UI chỉ hiện key đã mask; `.env.local` không được commit
  - **Verify:** `tests/unit/api-key-security.test.ts` (22 test) — quét `src/` + `stitch_daily_loop_os/` không còn chuỗi dạng `sk-ant-<20+ ký tự>`; `.gitignore` chặn `.env.local` và git không track file nào tên `.env.local`; `maskApiKey()` luôn trả `sk-ant-••••••••` (không phụ thuộc độ dài key thật); `validateApiKey()` chặn key sai định dạng; key ghi vào `.env.local` có **hiệu lực lúc runtime** (cache theo `mtimeMs`) nên không cần restart app.
  - **Sửa thêm (2026-10-30):** `src/lib/ai/router.ts` + `src/lib/ai/anthropic.ts` + `src/lib/shell.ts` + `src/lib/daily-loop-data.ts` giờ đọc key từ `.env.local` **lúc runtime** (`readEnvLocalKeyCached()`), fallback `process.env`. Trước đó Next.js chỉ nạp `.env.local` lúc boot → key người dùng lưu từ UI không có hiệu lực tới khi restart app.
  - Đã xoá literal placeholder trong `stitch_daily_loop_os/s15_c_i_t_qu_n_l_chi_ph_ai/code.html` và `.kiro/specs/daily-loop-os/design.md` (thay bằng chuỗi đã che).
- [ ] AC-17 Vòng đóng #1 (FR-LT-06): câu sai trong bài kiểm tra → thẻ `due = hôm nay` + `lapses +1` → S10 mở đúng các thẻ đó
- [ ] AC-18 Vòng đóng #2 (FR-MI-08/10): bấm "Tạo bằng chứng kỹ năng" → `Evidence` cho skill trọng tâm → level S03 tăng → đề xuất luyện tiếp quay lại S01; **không** bấm thì **không** tạo Evidence
- [ ] AC-19 Token chuẩn: `headline-sm` = 1.25rem; `rounded-full` = 0.75rem (không dùng để làm hình tròn); sidebar `bg-surface-container-lowest`; header `bg-surface-container-lowest/80 backdrop-blur-xl`
