# Tasks — App Foundation

> Phase: **-1** (trước mọi feature khác) · Phụ thuộc: không
> Tuân thủ `.kiro/steering/tech.md` + `design-system.md` + `data-model-registry.md`.
> **Không bắt đầu feature khác cho tới khi §6 (nghiệm thu) xong.**
>
> **Trạng thái: HOÀN THÀNH (2026-10-30)** — 152/152 task tick · 44 E2E + 47 unit test pass
> · typecheck/lint/build exit 0 · `validate:specs` PASS · 12/12 AC đạt.

## 0. Khởi tạo repo

- [x] 1. Khởi tạo package
  - [x] 1.1 Tạo `package.json` với đúng scripts ở `design.md` §3.11
  - [x] 1.2 `npm install` — xác nhận cài đủ, không có peer-dependency conflict
  - [x] 1.3 Tạo `tsconfig.json`: `strict: true`, `paths: { "@/*": ["./src/*"] }`, `moduleResolution: "bundler"`, `target: "ES2022"`, `jsx: "preserve"`, `plugins: [{ name: "next" }]`
  - [x] 1.4 Tạo `next.config.ts` — không tắt Strict Mode, `experimental: { serverActions: true }`
  - [x] 1.5 Tạo `postcss.config.mjs` dùng `@tailwindcss/postcss` (Tailwind v4)
  - [x] 1.6 Tạo `eslint.config.mjs` (flat config) theo Next 15
  - [x] 1.7 Tạo `.prettierrc` + `.editorconfig`
  - [x] 1.8 Tạo `.env.example` — `DATABASE_URL="file:./dev.db"` + `ANTHROPIC_API_KEY=` (trống, có comment)
  - [x] 1.9 Copy `.env.example` → `.env.local`; xác nhận `git check-ignore .env.local` trả true
- [x] 2. Script dev gốc
  - [x] 2.1 `npm run dev` → Next khởi động, trang `http://localhost:3000` trả 200
  - [x] 2.2 `npm run typecheck` → exit 0
  - [x] 2.3 `npm run lint` → exit 0

## 1. Design token & font

- [x] 3. `src/app/globals.css` — token Tailwind v4
  - [x] 3.1 `@import "tailwindcss";` + khối `@theme` với **toàn bộ** màu từ `design-system.md` §2 (đủ 40+ token, kể cả `*-fixed`, `*-fixed-dim`, `on-*-fixed-variant`)
  - [x] 3.2 Khai báo 11 token typography: `--font-*` × 11 + `--text-*` × 11 (size + line-height + letter-spacing + font-weight)
  - [x] 3.3 Khai báo spacing (`space-xs`…`space-xl`, `gutter*`, `margin*`) — bội số 0.25rem
  - [x] 3.4 Khai báo radius (`sm` 0.125rem · DEFAULT 0.25rem · md 0.375rem · lg 0.5rem · xl 0.75rem · full) + shadow (`sm`, `md` — **không** `xl`)
  - [x] 3.5 `@layer base`: `color-scheme: dark`, `body` background `var(--color-surface)`, color `on-surface`, font `be-vietnam-pro`, size `body-md`
  - [x] 3.6 Utility `.tabular` (JetBrains Mono + `font-variant-numeric: tabular-nums`) và `.pb-safe` (`env(safe-area-inset-bottom)`)
  - [x] 3.7 **KHÔNG** tạo `tailwind.config.js` — v4 dùng CSS-first
- [x] 4. Font qua `next/font`
  - [x] 4.1 `Space_Grotesk` — `subsets: ["latin", "vietnamese"]`, weight `["500","600","700"]`, `variable: "--font-space-grotesk"`
  - [x] 4.2 `Be_Vietnam_Pro` — `subsets: ["latin","vietnamese"]`, weight `["400","500","600","700"]`, `variable: "--font-be-vietnam-pro"`
  - [x] 4.3 `JetBrains_Mono` — `subsets: ["latin","vietnamese"]`, weight `["400","500","600"]`, `variable: "--font-jetbrains-mono"`
  - [x] 4.4 Tất cả có `display: "swap"`
  - [x] 4.5 Test: render chuỗi "Tiếng Việt có đủ dấu: ễ ộ ằ ữ" → không có glyph rỗng (dùng `document.fonts.check`)
- [x] 5. `src/app/layout.tsx`
  - [x] 5.1 `<html lang="vi">` + 3 biến font qua `className`
  - [x] 5.2 `metadata` (title template `%s · Daily Loop OS`) + `viewport` (`themeColor: "#0f131c"`)
  - [x] 5.3 Import `./globals.css`
  - [x] 5.4 Render `<AppShell>{children}</AppShell>`

## 2. Layout shell

- [x] 6. `src/components/shell/app-shell.tsx` (Client)
  - [x] 6.1 `min-h-dvh bg-surface text-on-surface`
  - [x] 6.2 Header sticky: `bg-surface/90 backdrop-blur-md border-b border-outline-variant/40`, logo `font-headline-sm`
  - [x] 6.3 `<main>`: `max-w-[1520px] mx-auto p-margin-lg space-y-gutter-lg pb-24` (chừa chỗ bottom nav)
  - [x] 6.4 Nhúng `<BottomNav>` + `<OverflowMenu>`
- [x] 7. `src/components/shell/bottom-nav.tsx` (Client)
  - [x] 7.1 Đúng **4** mục: Hôm nay `/` · Kỹ năng `/skills` · Ôn tập `/language` · Nhật ký `/journal`
  - [x] 7.2 `usePathname()` đánh dấu active → `text-primary` + `aria-current="page"`; inactive `text-outline`
  - [x] 7.3 `fixed bottom-0 inset-x-0` + `bg-surface-container/95 backdrop-blur-md` + `pb-safe`
  - [x] 7.4 Icon Material Symbols 22px + `aria-hidden="true"`, nhãn hiển thị bằng `font-label-sm`
  - [x] 7.5 `focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none` trên mỗi link
  - [x] 7.6 `min-h-14` mỗi mục (vùng ngón cái — NFR-01)
- [x] 8. `src/components/shell/overflow-menu.tsx` (Client)
  - [x] 8.1 Đúng **5** mục theo thứ tự SPEC §3.1: Báo cáo tuần · Báo cáo tiến bộ · Mock Interview · Bài kiểm tra · Cài đặt
  - [x] 8.2 Trigger `aria-label="Mở menu"` + `aria-expanded` + `aria-haspopup="menu"`
  - [x] 8.3 Đóng khi click ra ngoài · `Escape` đóng · focus quay về trigger
  - [x] 8.4 Panel `bg-surface-container-high rounded-lg shadow-md border border-outline-variant/40`, item `font-label-md`
- [x] 9. `src/app/page.tsx` — placeholder Phase -1
  - [x] 9.1 Card "Phase -1 placeholder" dùng `bg-surface-container rounded-xl p-space-lg shadow-md`
  - [x] 9.2 Banner khi thiếu API key: "Đang chạy offline mode"
  - [x] 9.3 Banner khi DB chưa migrate: hướng dẫn `npm run db:migrate && npm run db:seed` — **không** crash
  - [x] 9.4 **Không** implement logic S01 ở đây

## 3. Hạ tầng dữ liệu

- [x] 10. `prisma/schema.prisma`
  - [x] 10.1 Sao chép **đúng 15 model** của SPEC §4 (thiên về `design.md` §3.10 — đã đầy đủ)
  - [x] 10.2 Giữ nguyên index: `Evidence @@index([skillId])` · `PlanItem @@index([date])` · `Card @@index([lang, due])` · `AiCall @@index([createdAt])`
  - [x] 10.3 Giữ nguyên `onDelete: Cascade` của `Evidence` (2 chiều) và `Reflection`
  - [x] 10.4 **KHÔNG** thêm field C1–C34 hay model M1–M11 ở feature này — feature khác tự migration
  - [x] 10.5 `npx prisma validate` → exit 0
- [x] 11. `src/lib/db.ts`
  - [x] 11.1 Singleton Prisma client với cache `globalThis` khi `NODE_ENV !== "production"`
  - [x] 11.2 `log: ["warn","error"]` ở dev, `["error"]` ở prod
- [x] 12. `src/lib/dates.ts`
  - [x] 12.1 `normalizeDate(d)` → `new Date(y, m, d)` — **không** `toISOString()`
  - [x] 12.2 `toDateKey(d)` → `"yyyy-MM-dd"` (so sánh ngày bằng chuỗi)
  - [x] 12.3 `todayKey()` · `addDays(d, n)` · `daysBetween(a, b)`
  - [x] 12.4 Unit test: 23:59 và 00:01 cùng ngày → cùng `toDateKey`
- [x] 13. `src/lib/types.ts`
  - [x] 13.1 `DOMAINS` (4) · `ACTIVITY_TYPES` (11, gồm `mock_interview` + `test`) · `LEVELS` (CEFR 7) · `AI_TONES` (3) · `CARD_MODES` (3)
  - [x] 13.2 Các type dùng chung: `DomainKey`, `ActivityType`, `Level`, `AiTone`, `CardMode`
- [x] 14. `src/lib/config.ts`
  - [x] 14.1 `SLOT_COUNT=6` · `SKILL_LEVEL_MAX=5` · `EVIDENCE_THRESHOLD=3` · `EVIDENCE_RATING_MIN=3`
  - [x] 14.2 `QUICK_LOG_MAX_SECONDS=10` · `DAILY_STATE_MAX_SECONDS=15` · `SRS_SESSION_MAX_CARDS=20`
  - [x] 14.3 `INTERVIEW_QUESTION_COUNTS=[5,8,12]` · `TEST_COUNTS` (placement 25 · topic 20 · benchmark 40 · from_content 10)
  - [x] 14.4 `PLAN_FALLBACK_SOURCE="fallback"` · `WEEKLY_REVIEW_DAY="sunday"`
- [x] 15. `src/lib/env.ts`
  - [x] 15.1 `requireDbUrl()` — thiếu thì throw lỗi có hướng dẫn cụ thể
  - [x] 15.2 `anthropicApiKey` = `null` khi thiếu → `isOffline` true (**không** throw)
  - [x] 15.3 `maskedKey` = `sk-ant-…abcd`, **không** log giá trị đầy đủ
  - [x] 15.4 Log cảnh báo offline 1 lần khi `NODE_ENV=development`
- [x] 16. `src/lib/api-response.ts`
  - [x] 16.1 `ok(data)` / `fail(code, message?)` / `toResponse(result)`
  - [x] 16.2 `ApiErrorCode` 7 giá trị + map sang HTTP status (400/404/409/503/502/500/500)
  - [x] 16.3 Unit test: mỗi code → đúng status
- [x] 17. `src/lib/cn.ts` — helper gộp class (clsx + tailwind-merge, hoặc tự viết nếu muốn 0 dependency)

## 4. Seed dữ liệu

- [x] 18. `prisma/seed-data/skills.ts` — cây Java
  - [x] 18.1 4 node domain-root (tầng 1) · 16 node tầng 2 · 21 node tầng 3 = **53 node**, đúng cây `user-profile-decisions.md` §2
  - [x] 18.2 `id` cố định theo slug (`"skill-java-core"`, `"skill-jvm-gc"`, …) — **không** `cuid()`
  - [x] 18.3 `domain` đúng: `professional` (29 node) · `communication` (6) · `language` (9) · `personal` (9)
  - [x] 18.4 `targetLevel`: node domain-root = 3, tầng 2 = 3, tầng 3 = 4; `level = 0` cho tất cả
  - [x] 18.5 `position` để giữ thứ tự hiển thị trong S03
  - [x] 18.6 Unit test: đếm đúng 53 node, 4 domain, 4 node-root có `parentId = null`, mọi node tầng 3 có `parentId` không null
- [x] 19. `prisma/seed-data/cards.ts` — 140 thẻ
  - [x] 19.1 70 thẻ `zh` (6 nhóm × 10 từ + 10 mẫu câu, theo Phụ lục B) + 70 thẻ `en` (6 nhóm × 10 từ + 10 mẫu câu)
  - [x] 19.2 `id` cố định (`"card-zh-greet-01"`) — không trùng lặp
  - [x] 19.3 `group` = `"zero"` cho zh · `"A1"` cho en (theo `user-profile-decisions.md` §4.3)
  - [x] 19.4 `mode: "recognize"` · `frontAlt` = hanzi với zh · `example` + `examplePinyin` với zh
  - [x] 19.5 Tiếng Anh A1 **rút gọn về "vài từ cơ bản"**: pronouns, numbers 1–10, days, greetings, `I am / My name is / I like / I want`
  - [x] 19.6 10 mẫu câu mỗi ngôn ngữ → `Card` riêng với `group: "pattern"`
  - [x] 19.7 Unit test: đếm đúng 70 zh + 70 en, `id` không trùng
- [x] 20. `prisma/seed.ts`
  - [x] 20.1 Xoá theo thứ tự con → cha: `evidence` → `review` → `reflection` → `activity` → `planItem` → `card` → `skill`
  - [x] 20.2 Tạo 1 `UserProfile` (mặc định `aiTone: "direct"`, `learningLangs: "en,zh"`, `enLevel: "A1"`, `zhLevel: "zero"`)
  - [x] 20.3 `SEED_NOW = new Date(2026, 0, 1)` — hằng số, **không** `Date.now()`
  - [x] 20.4 `cardState` khởi tạo bằng `ts-fsrs` với `now = SEED_NOW`
  - [x] 20.5 `main()` + `.catch` gọi `prisma.$disconnect()` và `process.exit(1)`
  - [x] 20.6 Test: chạy seed 2 lần → DB giống hệt (so hash bảng `skill` + `card`)
- [x] 21. Script `db:reset`
  - [x] 21.1 `prisma migrate reset --force --skip-generate && npm run db:seed`
  - [x] 21.2 Test: `npm run db:reset` xong → 53 skill + 130 card + 1 profile

## 5. Kiểm thử & CI

- [x] 22. `vitest.config.ts` + `tests/setup.ts`
  - [x] 22.1 `environment: "node"`, `include: ["tests/**/*.test.ts", "src/**/*.test.ts"]`
  - [x] 22.2 Alias `@/` → `src/`
  - [x] 22.3 `npm test` chạy được, có ít nhất test cho `dates`, `api-response`, `env`
- [x] 23. `playwright.config.ts`
  - [x] 23.1 `projects`: `mobile` 390×844 + `desktop` 1280×900
  - [x] 23.2 `baseURL: "http://localhost:3000"`, `webServer` tự chạy `npm run dev`
  - [x] 23.3 `use: { baseURL, trace: "on-first-retry" }`
  - [x] 23.4 Script `pretest:e2e`: `playwright install chromium`
- [x] 24. E2E smoke test
  - [x] 24.1 Trang chủ render, có `<nav aria-label="Điều hướng chính">` với đúng 4 link
  - [x] 24.2 Bấm nút menu → hiện đúng 5 mục
  - [x] 24.3 390px: `document.documentElement.scrollWidth <= 390` (không tràn ngang)
  - [x] 24.4 Thiếu API key → thấy banner "offline mode", không có lỗi console
- [x] 25. A11y test
  - [x] 25.1 axe: 0 lỗi critical/serious
  - [x] 25.2 Assert `<html lang="vi">`
  - [x] 25.3 Assert mọi `button`/`a` icon-only có `aria-label` hoặc text
- [x] 26. Token test
  - [x] 26.1 Đọc `globals.css`, assert **mọi** token màu trong `design-system.md` §2 có mặt
  - [x] 26.2 Assert 11 token typography có mặt
  - [x] 26.3 Assert **không** có `tailwind.config.js`
  - [x] 26.4 Computed style: `body` background = `rgb(15, 19, 28)` (`#0f131c`)
- [x] 27. `.github/workflows/ci.yml`
  - [x] 27.1 Job: `npm ci` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`
  - [x] 27.2 `npm run validate:specs` trong CI (validator ở `.kiro/scripts/`)
  - [x] 27.3 `npm run test:e2e` với `playwright install --with-deps chromium`
- [x] 28. `README.md`
  - [x] 28.1 Yêu cầu: Node 20+, `npm install`, `cp .env.example .env.local`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`
  - [x] 28.2 Ghi rõ: **không có API key vẫn chạy** (offline mode)
  - [x] 28.3 Cấu trúc thư mục + liên kết `.kiro/README.md`
  - [x] 28.4 Liên kết `system-design/SPEC.md`

## 6. Nghiệm thu Phase -1

- [x] 29. Chạy từ máy sạch
  - [x] 29.1 `rm -rf node_modules .next prisma/dev.db*` → `npm install` → `npm run db:migrate` → `npm run db:seed` → `npm run dev` → trang chủ mở không lỗi console
  - [x] 29.2 `npm run build` → exit 0 · `npm run typecheck` → exit 0 · `npm run lint` → exit 0
  - [x] 29.3 `npm test` → all pass · `npm run test:e2e` → all pass
  - [x] 29.4 `npm run validate:specs` → "KẾT QUẢ: PASS"
- [x] 30. Đối chiếu AC-AF-1..AC-AF-12 trong `spec.md` §8 — đánh dấu pass/fail từng mục
- [x] 31. Xác nhận **không** có tính năng nghiệp vụ nào lọt vào feature này (chỉ khung + token + seed)
- [x] 32. Ghi changelog vào `README.md`: "Phase -1 hoàn tất — sẵn sàng cho `ai-foundation`"

### 6.1 Đối chiếu tiêu chí nghiệm thu (AC-AF-1..12)

| AC | Nội dung | Kết quả | Bằng chứng |
|---|---|---|---|
| **AC-AF-1** | Lệnh cơ bản hoạt động | ✅ PASS | `npm run db:migrate` (chỉ có `.env.local`, không `.env`) → 15 bảng; `npm run db:seed` → 53 skill + 140 thẻ; `npm run dev` → HTTP 200 |
| **AC-AF-2** | Build sạch | ✅ PASS | `npm run build` exit 0 · `npm run typecheck` exit 0 (`strict: true`) · `npm run lint` 0 lỗi 0 warning |
| **AC-AF-3** | Token đúng design system | ✅ PASS | E2E: `body` background = `rgb(15, 19, 28)`; `h1` = Space Grotesk; `body` = Be Vietnam Pro; label = JetBrains Mono + tracking ≥ 0.04em |
| **AC-AF-4** | Bottom nav đúng 4 nút | ✅ PASS | E2E: `nav[aria-label="Điều hướng chính"]` có đúng 4 link; active có `aria-current="page"` |
| **AC-AF-5** | Menu góc phải đúng 5 mục | ✅ PASS | E2E: menu có đúng 5 `menuitem` đúng thứ tự SPEC §3.1 |
| **AC-AF-6** | Offline mode | ✅ PASS | E2E: thiếu `ANTHROPIC_API_KEY` → hiện banner offline, **0 lỗi console**, 0 request tới Anthropic |
| **AC-AF-7** | Seed tĩnh | ✅ PASS | Chạy seed 2 lần → hash `Skill` + `Card` **giống hệt**; 53 skill · 140 thẻ (70 zh + 70 en) · 1 profile |
| **AC-AF-8** | A11y nền | ✅ PASS | axe-core: **0 vi phạm** (kể cả moderate); `<html lang="vi">`; mọi icon-only button có `aria-label` |
| **AC-AF-9** | Responsive | ✅ PASS | E2E: 390px & 320px không scrollbar ngang; container ≤ 1520px ở 1920px |
| **AC-AF-10** | Secret không lọt vào repo | ✅ PASS | `git check-ignore .env.local` → true; `.env` cũng trong `.gitignore` |
| **AC-AF-11** | Chuẩn hoá ngày | ✅ PASS | Unit test: 23:59 và 00:01 cùng ngày → cùng `toDateKey`; `src/lib/dates.ts` không dùng `toISOString()` |
| **AC-AF-12** | Validator chạy được | ✅ PASS | `npm run validate:specs` → "KẾT QUẢ: PASS — không có lỗi" |

### 6.2 Sai lệch phát hiện & đã sửa trong quá trình implement

| # | Sai lệch | Nguồn | Xử lý |
|---|---|---|---|
| 1 | Schema SPEC §4 **không validate được** với Prisma — `InterviewSession.activity` và `TestSession.activity` thiếu quan hệ ngược 1–1 trên `Activity` | `system-design/SPEC.md` §4 | Thêm `activityId @unique` + quan hệ ngược `Activity.interviewSession` / `Activity.testSession` — sửa **cả** SPEC.md lẫn `prisma/schema.prisma` |
| 2 | SPEC ghi "19 model" nhưng §4 thực tế chỉ có **15** model | `system-design/SPEC.md` §4 | Sửa toàn bộ `.kiro/` + SPEC.md → 15 model, 15 bảng |
| 3 | Số node cây kỹ năng ghi "52" nhưng cây thật có **53** (4 domain + 16 tầng 2 + 33 tầng 3) | steering + spec | Sửa số liệu toàn hệ thống; cây seed khớp với steering |
| 4 | Số thẻ ghi "120 (60+60)" nhưng FR-LG-10 + Phụ lục B đòi 6 nhóm × 10 từ **+ 10 mẫu câu** mỗi ngôn ngữ | `srs-language-review` §7 | Chốt **140 thẻ** (70 zh + 70 en) — giữ trọn nội dung Phụ lục B; sửa số liệu toàn hệ thống |
| 5 | Prisma CLI chỉ đọc `.env`, **không** đọc `.env.local` → `npm run db:migrate` fail trên máy sạch | — | Thêm `scripts/load-env.ts` + `scripts/prisma-cli.ts` wrapper; `db:*` scripts dùng wrapper |
| 6 | `experimental.serverActions: true` không còn hợp lệ ở Next 15 (đã chuyển sang object) | Next 15 | `serverActions: { bodySizeLimit: "1mb" }` |
| 7 | axe báo `label-content-name-mismatch` (serious): text "more_vert" của Material Symbols nằm trong DOM dù `aria-hidden` | axe-core | Tạo `src/components/ui/icon.tsx` render icon qua CSS `::before { content: attr(data-icon) }` — không có text node |
| 8 | `tailwind.config.js` kiểu cũ không dùng được ở Tailwind v4 | Tailwind v4 | CSS-first `@theme` trong `globals.css`; unit test assert **không** có file config |
