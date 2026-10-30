# Tasks — App Foundation

> Phase: **-1** (trước mọi feature khác) · Phụ thuộc: không
> Tuân thủ `.kiro/steering/tech.md` + `design-system.md` + `data-model-registry.md`.
> **Không bắt đầu feature khác cho tới khi §6 (nghiệm thu) xong.**

## 0. Khởi tạo repo

- [ ] 1. Khởi tạo package
  - [ ] 1.1 Tạo `package.json` với đúng scripts ở `design.md` §3.11
  - [ ] 1.2 `npm install` — xác nhận cài đủ, không có peer-dependency conflict
  - [ ] 1.3 Tạo `tsconfig.json`: `strict: true`, `paths: { "@/*": ["./src/*"] }`, `moduleResolution: "bundler"`, `target: "ES2022"`, `jsx: "preserve"`, `plugins: [{ name: "next" }]`
  - [ ] 1.4 Tạo `next.config.ts` — không tắt Strict Mode, `experimental: { serverActions: true }`
  - [ ] 1.5 Tạo `postcss.config.mjs` dùng `@tailwindcss/postcss` (Tailwind v4)
  - [ ] 1.6 Tạo `eslint.config.mjs` (flat config) theo Next 15
  - [ ] 1.7 Tạo `.prettierrc` + `.editorconfig`
  - [ ] 1.8 Tạo `.env.example` — `DATABASE_URL="file:./dev.db"` + `ANTHROPIC_API_KEY=` (trống, có comment)
  - [ ] 1.9 Copy `.env.example` → `.env.local`; xác nhận `git check-ignore .env.local` trả true
- [ ] 2. Script dev gốc
  - [ ] 2.1 `npm run dev` → Next khởi động, trang `http://localhost:3000` trả 200
  - [ ] 2.2 `npm run typecheck` → exit 0
  - [ ] 2.3 `npm run lint` → exit 0

## 1. Design token & font

- [ ] 3. `src/app/globals.css` — token Tailwind v4
  - [ ] 3.1 `@import "tailwindcss";` + khối `@theme` với **toàn bộ** màu từ `design-system.md` §2 (đủ 40+ token, kể cả `*-fixed`, `*-fixed-dim`, `on-*-fixed-variant`)
  - [ ] 3.2 Khai báo 11 token typography: `--font-*` × 11 + `--text-*` × 11 (size + line-height + letter-spacing + font-weight)
  - [ ] 3.3 Khai báo spacing (`space-xs`…`space-xl`, `gutter*`, `margin*`) — bội số 0.25rem
  - [ ] 3.4 Khai báo radius (`sm` 0.125rem · DEFAULT 0.25rem · md 0.375rem · lg 0.5rem · xl 0.75rem · full) + shadow (`sm`, `md` — **không** `xl`)
  - [ ] 3.5 `@layer base`: `color-scheme: dark`, `body` background `var(--color-surface)`, color `on-surface`, font `be-vietnam-pro`, size `body-md`
  - [ ] 3.6 Utility `.tabular` (JetBrains Mono + `font-variant-numeric: tabular-nums`) và `.pb-safe` (`env(safe-area-inset-bottom)`)
  - [ ] 3.7 **KHÔNG** tạo `tailwind.config.js` — v4 dùng CSS-first
- [ ] 4. Font qua `next/font`
  - [ ] 4.1 `Space_Grotesk` — `subsets: ["latin", "vietnamese"]`, weight `["500","600","700"]`, `variable: "--font-space-grotesk"`
  - [ ] 4.2 `Be_Vietnam_Pro` — `subsets: ["latin","vietnamese"]`, weight `["400","500","600","700"]`, `variable: "--font-be-vietnam-pro"`
  - [ ] 4.3 `JetBrains_Mono` — `subsets: ["latin","vietnamese"]`, weight `["400","500","600"]`, `variable: "--font-jetbrains-mono"`
  - [ ] 4.4 Tất cả có `display: "swap"`
  - [ ] 4.5 Test: render chuỗi "Tiếng Việt có đủ dấu: ễ ộ ằ ữ" → không có glyph rỗng (dùng `document.fonts.check`)
- [ ] 5. `src/app/layout.tsx`
  - [ ] 5.1 `<html lang="vi">` + 3 biến font qua `className`
  - [ ] 5.2 `metadata` (title template `%s · Daily Loop OS`) + `viewport` (`themeColor: "#0f131c"`)
  - [ ] 5.3 Import `./globals.css`
  - [ ] 5.4 Render `<AppShell>{children}</AppShell>`

## 2. Layout shell

- [ ] 6. `src/components/shell/app-shell.tsx` (Client)
  - [ ] 6.1 `min-h-dvh bg-surface text-on-surface`
  - [ ] 6.2 Header sticky: `bg-surface/90 backdrop-blur-md border-b border-outline-variant/40`, logo `font-headline-sm`
  - [ ] 6.3 `<main>`: `max-w-[1520px] mx-auto p-margin-lg space-y-gutter-lg pb-24` (chừa chỗ bottom nav)
  - [ ] 6.4 Nhúng `<BottomNav>` + `<OverflowMenu>`
- [ ] 7. `src/components/shell/bottom-nav.tsx` (Client)
  - [ ] 7.1 Đúng **4** mục: Hôm nay `/` · Kỹ năng `/skills` · Ôn tập `/language` · Nhật ký `/journal`
  - [ ] 7.2 `usePathname()` đánh dấu active → `text-primary` + `aria-current="page"`; inactive `text-outline`
  - [ ] 7.3 `fixed bottom-0 inset-x-0` + `bg-surface-container/95 backdrop-blur-md` + `pb-safe`
  - [ ] 7.4 Icon Material Symbols 22px + `aria-hidden="true"`, nhãn hiển thị bằng `font-label-sm`
  - [ ] 7.5 `focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none` trên mỗi link
  - [ ] 7.6 `min-h-14` mỗi mục (vùng ngón cái — NFR-01)
- [ ] 8. `src/components/shell/overflow-menu.tsx` (Client)
  - [ ] 8.1 Đúng **5** mục theo thứ tự SPEC §3.1: Báo cáo tuần · Báo cáo tiến bộ · Mock Interview · Bài kiểm tra · Cài đặt
  - [ ] 8.2 Trigger `aria-label="Mở menu"` + `aria-expanded` + `aria-haspopup="menu"`
  - [ ] 8.3 Đóng khi click ra ngoài · `Escape` đóng · focus quay về trigger
  - [ ] 8.4 Panel `bg-surface-container-high rounded-lg shadow-md border border-outline-variant/40`, item `font-label-md`
- [ ] 9. `src/app/page.tsx` — placeholder Phase -1
  - [ ] 9.1 Card "Phase -1 placeholder" dùng `bg-surface-container rounded-xl p-space-lg shadow-md`
  - [ ] 9.2 Banner khi thiếu API key: "Đang chạy offline mode"
  - [ ] 9.3 Banner khi DB chưa migrate: hướng dẫn `npm run db:migrate && npm run db:seed` — **không** crash
  - [ ] 9.4 **Không** implement logic S01 ở đây

## 3. Hạ tầng dữ liệu

- [ ] 10. `prisma/schema.prisma`
  - [ ] 10.1 Sao chép **đúng 19 model** của SPEC §4 (thiên về `design.md` §3.10 — đã đầy đủ)
  - [ ] 10.2 Giữ nguyên index: `Evidence @@index([skillId])` · `PlanItem @@index([date])` · `Card @@index([lang, due])` · `AiCall @@index([createdAt])`
  - [ ] 10.3 Giữ nguyên `onDelete: Cascade` của `Evidence` (2 chiều) và `Reflection`
  - [ ] 10.4 **KHÔNG** thêm field C1–C34 hay model M1–M11 ở feature này — feature khác tự migration
  - [ ] 10.5 `npx prisma validate` → exit 0
- [ ] 11. `src/lib/db.ts`
  - [ ] 11.1 Singleton Prisma client với cache `globalThis` khi `NODE_ENV !== "production"`
  - [ ] 11.2 `log: ["warn","error"]` ở dev, `["error"]` ở prod
- [ ] 12. `src/lib/dates.ts`
  - [ ] 12.1 `normalizeDate(d)` → `new Date(y, m, d)` — **không** `toISOString()`
  - [ ] 12.2 `toDateKey(d)` → `"yyyy-MM-dd"` (so sánh ngày bằng chuỗi)
  - [ ] 12.3 `todayKey()` · `addDays(d, n)` · `daysBetween(a, b)`
  - [ ] 12.4 Unit test: 23:59 và 00:01 cùng ngày → cùng `toDateKey`
- [ ] 13. `src/lib/types.ts`
  - [ ] 13.1 `DOMAINS` (4) · `ACTIVITY_TYPES` (11, gồm `mock_interview` + `test`) · `LEVELS` (CEFR 7) · `AI_TONES` (3) · `CARD_MODES` (3)
  - [ ] 13.2 Các type dùng chung: `DomainKey`, `ActivityType`, `Level`, `AiTone`, `CardMode`
- [ ] 14. `src/lib/config.ts`
  - [ ] 14.1 `SLOT_COUNT=6` · `SKILL_LEVEL_MAX=5` · `EVIDENCE_THRESHOLD=3` · `EVIDENCE_RATING_MIN=3`
  - [ ] 14.2 `QUICK_LOG_MAX_SECONDS=10` · `DAILY_STATE_MAX_SECONDS=15` · `SRS_SESSION_MAX_CARDS=20`
  - [ ] 14.3 `INTERVIEW_QUESTION_COUNTS=[5,8,12]` · `TEST_COUNTS` (placement 25 · topic 20 · benchmark 40 · from_content 10)
  - [ ] 14.4 `PLAN_FALLBACK_SOURCE="fallback"` · `WEEKLY_REVIEW_DAY="sunday"`
- [ ] 15. `src/lib/env.ts`
  - [ ] 15.1 `requireDbUrl()` — thiếu thì throw lỗi có hướng dẫn cụ thể
  - [ ] 15.2 `anthropicApiKey` = `null` khi thiếu → `isOffline` true (**không** throw)
  - [ ] 15.3 `maskedKey` = `sk-ant-…abcd`, **không** log giá trị đầy đủ
  - [ ] 15.4 Log cảnh báo offline 1 lần khi `NODE_ENV=development`
- [ ] 16. `src/lib/api-response.ts`
  - [ ] 16.1 `ok(data)` / `fail(code, message?)` / `toResponse(result)`
  - [ ] 16.2 `ApiErrorCode` 7 giá trị + map sang HTTP status (400/404/409/503/502/500/500)
  - [ ] 16.3 Unit test: mỗi code → đúng status
- [ ] 17. `src/lib/cn.ts` — helper gộp class (clsx + tailwind-merge, hoặc tự viết nếu muốn 0 dependency)

## 4. Seed dữ liệu

- [ ] 18. `prisma/seed-data/skills.ts` — cây Java
  - [ ] 18.1 7 node tầng 1 · 16 node tầng 2 · 26 node tầng 3 = **52 node**, đúng cây `user-profile-decisions.md` §2
  - [ ] 18.2 `id` cố định theo slug (`"skill-java-core"`, `"skill-jvm-gc"`, …) — **không** `cuid()`
  - [ ] 18.3 `domain` đúng: `professional` (8 nhánh) · `communication` (3) · `language` (3) · `personal` (3)
  - [ ] 18.4 `targetLevel`: tầng 2 = 3, tầng 3 = 4, tầng 1 = 3; `level = 0` cho tất cả
  - [ ] 18.5 `position` để giữ thứ tự hiển thị trong S03
  - [ ] 18.6 Unit test: đếm đúng 52 node, 4 domain, mọi node tầng 3 có `parentId` không null
- [ ] 19. `prisma/seed-data/cards.ts` — 120 thẻ
  - [ ] 19.1 60 thẻ `zh` (6 nhóm × 10, theo Phụ lục B) + 60 thẻ `en` (6 nhóm × 10)
  - [ ] 19.2 `id` cố định (`"card-zh-greet-01"`) — không trùng lặp
  - [ ] 19.3 `group` = `"zero"` cho zh · `"A1"` cho en (theo `user-profile-decisions.md` §4.3)
  - [ ] 19.4 `mode: "recognize"` · `frontAlt` = hanzi với zh · `example` + `examplePinyin` với zh
  - [ ] 19.5 Tiếng Anh A1 **rút gọn về "vài từ cơ bản"**: pronouns, numbers 1–10, days, greetings, `I am / My name is / I like / I want`
  - [ ] 19.6 10 mẫu câu mỗi ngôn ngữ → `Card` riêng với `group: "pattern"`
  - [ ] 19.7 Unit test: đếm đúng 60 zh + 60 en, `id` không trùng
- [ ] 20. `prisma/seed.ts`
  - [ ] 20.1 Xoá theo thứ tự con → cha: `evidence` → `review` → `reflection` → `activity` → `planItem` → `card` → `skill`
  - [ ] 20.2 Tạo 1 `UserProfile` (mặc định `aiTone: "direct"`, `learningLangs: "en,zh"`, `enLevel: "A1"`, `zhLevel: "zero"`)
  - [ ] 20.3 `SEED_NOW = new Date(2026, 0, 1)` — hằng số, **không** `Date.now()`
  - [ ] 20.4 `cardState` khởi tạo bằng `ts-fsrs` với `now = SEED_NOW`
  - [ ] 20.5 `main()` + `.catch` gọi `prisma.$disconnect()` và `process.exit(1)`
  - [ ] 20.6 Test: chạy seed 2 lần → DB giống hệt (so hash bảng `skill` + `card`)
- [ ] 21. Script `db:reset`
  - [ ] 21.1 `prisma migrate reset --force --skip-generate && npm run db:seed`
  - [ ] 21.2 Test: `npm run db:reset` xong → 52 skill + 120 card + 1 profile

## 5. Kiểm thử & CI

- [ ] 22. `vitest.config.ts` + `tests/setup.ts`
  - [ ] 22.1 `environment: "node"`, `include: ["tests/**/*.test.ts", "src/**/*.test.ts"]`
  - [ ] 22.2 Alias `@/` → `src/`
  - [ ] 22.3 `npm test` chạy được, có ít nhất test cho `dates`, `api-response`, `env`
- [ ] 23. `playwright.config.ts`
  - [ ] 23.1 `projects`: `mobile` 390×844 + `desktop` 1280×900
  - [ ] 23.2 `baseURL: "http://localhost:3000"`, `webServer` tự chạy `npm run dev`
  - [ ] 23.3 `use: { baseURL, trace: "on-first-retry" }`
  - [ ] 23.4 Script `pretest:e2e`: `playwright install chromium`
- [ ] 24. E2E smoke test
  - [ ] 24.1 Trang chủ render, có `<nav aria-label="Điều hướng chính">` với đúng 4 link
  - [ ] 24.2 Bấm nút menu → hiện đúng 5 mục
  - [ ] 24.3 390px: `document.documentElement.scrollWidth <= 390` (không tràn ngang)
  - [ ] 24.4 Thiếu API key → thấy banner "offline mode", không có lỗi console
- [ ] 25. A11y test
  - [ ] 25.1 axe: 0 lỗi critical/serious
  - [ ] 25.2 Assert `<html lang="vi">`
  - [ ] 25.3 Assert mọi `button`/`a` icon-only có `aria-label` hoặc text
- [ ] 26. Token test
  - [ ] 26.1 Đọc `globals.css`, assert **mọi** token màu trong `design-system.md` §2 có mặt
  - [ ] 26.2 Assert 11 token typography có mặt
  - [ ] 26.3 Assert **không** có `tailwind.config.js`
  - [ ] 26.4 Computed style: `body` background = `rgb(15, 19, 28)` (`#0f131c`)
- [ ] 27. `.github/workflows/ci.yml`
  - [ ] 27.1 Job: `npm ci` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`
  - [ ] 27.2 `npm run validate:specs` trong CI (validator ở `.kiro/scripts/`)
  - [ ] 27.3 `npm run test:e2e` với `playwright install --with-deps chromium`
- [ ] 28. `README.md`
  - [ ] 28.1 Yêu cầu: Node 20+, `npm install`, `cp .env.example .env.local`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`
  - [ ] 28.2 Ghi rõ: **không có API key vẫn chạy** (offline mode)
  - [ ] 28.3 Cấu trúc thư mục + liên kết `.kiro/README.md`
  - [ ] 28.4 Liên kết `system-design/SPEC.md`

## 6. Nghiệm thu Phase -1

- [ ] 29. Chạy từ máy sạch
  - [ ] 29.1 `rm -rf node_modules .next prisma/dev.db*` → `npm install` → `npm run db:migrate` → `npm run db:seed` → `npm run dev` → trang chủ mở không lỗi console
  - [ ] 29.2 `npm run build` → exit 0 · `npm run typecheck` → exit 0 · `npm run lint` → exit 0
  - [ ] 29.3 `npm test` → all pass · `npm run test:e2e` → all pass
  - [ ] 29.4 `npm run validate:specs` → "KẾT QUẢ: PASS"
- [ ] 30. Đối chiếu AC-AF-1..AC-AF-12 trong `spec.md` §8 — đánh dấu pass/fail từng mục
- [ ] 31. Xác nhận **không** có tính năng nghiệp vụ nào lọt vào feature này (chỉ khung + token + seed)
- [ ] 32. Ghi changelog vào `README.md`: "Phase -1 hoàn tất — sẵn sàng cho `ai-foundation`"
