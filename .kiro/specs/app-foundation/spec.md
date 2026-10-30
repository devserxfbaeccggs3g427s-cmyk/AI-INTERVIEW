# App Foundation — Khung dự án & nền tảng hệ thống

> **Loại:** cross-cutting foundation (không có màn hình riêng) · **Phase:** **-1 (phải xong trước mọi feature khác)**
> **Nguồn:** `system-design/SPEC.md` §1 (stack), §4 (data model), §6 (NFR) · `.kiro/steering/tech.md`, `design-system.md`, `project.md`
> **Phụ thuộc:** không — đây là feature gốc
> **Được phụ thuộc bởi:** tất cả 10 feature còn lại

## 1. Tổng quan

`app-foundation` là **khung dự án** — những thứ phải tồn tại trước khi viết bất kỳ feature
nghiệp vụ nào. Không có feature nào khác giả định "app đã chạy, Prisma đã có, design token đã set".

Hiện tại bộ spec đi thẳng từ roadmap "Phase 0 — Hạt nhân" vào các feature như `daily-loop-core`,
`quick-log`, `srs-language-review` — **mà không có bước nào dựng nền**. Đây là lỗ hổng thực sự:
lập trình viên mở repo, chạy `npm install && npm run dev` sẽ không có gì để chạy.

Feature này đóng lỗ hổng đó:

```
                    ┌─────────────────────────────────────┐
                    │      app-foundation (Phase -1)       │
                    │  khung Next.js + token + Prisma +    │
                    │  layout shell + nav + scripts        │
                    └──────────────────┬──────────────────┘
                                       │ mọi feature khác dựa vào
       ┌───────────┬───────────┬────────┴────────┬───────────┐
       ▼           ▼           ▼                 ▼           ▼
  ai-found.   daily-loop  skill-tree       quick-log    srs-lang
  (Phase 0)   (Phase 0)  (Phase 0)        (Phase 0)    (Phase 1)
```

### 1.1 Định nghĩa "xong" (Definition of Done)

Phase -1 **chỉ** hoàn thành khi tất cả mục sau đúng:

| # | Điều kiện | Kiểm chứng |
|---|---|---|
| D1 | `npm install && npm run dev` → mở `http://localhost:3000` thấy trang chủ render | Lệnh chạy thật |
| D2 | `npm run build` → **0 lỗi** TypeScript (strict) | Lệnh chạy thật |
| D3 | `npx prisma migrate dev` → tạo `prisma/dev.db` với **15 model** của SPEC §4 | Lệnh chạy thật |
| D4 | `npm run db:seed` → seed cây kỹ năng + 140 thẻ + user profile, **không gọi AI** | Lệnh chạy thật |
| D5 | Trang chủ hiển thị đúng design token: màu `surface`/`primary`/`secondary`/`tertiary`, font Space Grotesk / Be Vietnam Pro / JetBrains Mono | Kiểm tra bằng mắt + computed style |
| D6 | Bottom nav 4 nút (Hôm nay · Kỹ năng · Ôn tập · Nhật ký) + menu góc phải 5 mục, đúng SPEC §3.1 | Kiểm tra bằng mắt |
| D7 | Layout đúng ở **390px** (mobile-first) và ≥1280px (12 cột) | Playwright screenshot |
| D8 | Tương phản WCAG AA cho label `text-outline` trên `bg-surface-container` | axe + đo contrast |
| D9 | `npm run validate:specs` chạy được (validator hiện có trong `.kiro/scripts/`) | Lệnh chạy thật |
| D10 | `npm run lint` → 0 lỗi | Lệnh chạy thật |

> **Không** để feature nào khác bắt đầu trước khi D1–D10 xong.

---

## 2. Bối cảnh & vấn đề

| # | Vấn đề | Hậu quả nếu bỏ qua |
|---|---|---|
| P1 | Không có `package.json` / `next.config` / `tsconfig` | Không ai build được app. Mọi task bắt đầu từ "setup lại" |
| P2 | Tailwind v4 chưa có token từ `DESIGN.md` | Feature tự chế màu → 21 màn hình lệch nhau, vi phạm design system |
| P3 | `globals.css` chưa khai báo font & biến CSS | Tiếng Việt hiển thị sai dấu (thiếu Be Vietnam Pro + line-height rộng) |
| P4 | `layout.tsx` chưa có shell + bottom nav + menu góc phải | Mỗi feature tự viết layout → nhân bản, không nhất quán |
| P5 | `prisma/schema.prisma` chưa có | Mọi feature chỉ có mô tả, không có nơi để viết query |
| P6 | Chưa có script seed | Cây kỹ năng + 140 thẻ phải nhập tay mỗi lần dev |
| P7 | Chưa có `.env.local` mẫu / kiểm tra key | App crash khi thiếu `ANTHROPIC_API_KEY` thay vì chạy offline (FR-AI-06) |
| P8 | Chưa có `src/lib/dates.ts` chuẩn hoá ngày | So sánh ngày lệch 1 ngày do timezone (rủi ro T8 của `weekly-progress-report`) |
| P9 | Chưa có test harness | "Definition of Done" không kiểm chứng được → task tự tick |
| P10 | Chưa có CI | Chất lượng chỉ phụ thuộc kỷ luật cá nhân |

---

## 3. Yêu cầu chức năng

### 3.1 Khởi tạo dự án (FR-AF-01..06)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-AF-01 | Khởi tạo Next.js 15 (App Router) + TypeScript `strict: true` + Tailwind CSS v4 + ESLint + Prettier. Không dùng `create-next-app` (nhiều prompt tương tác) — tạo file tay. | P0 | SPEC §1 |
| FR-AF-02 | `package.json` với script: `dev` · `build` · `start` · `lint` · `typecheck` · `db:migrate` · `db:seed` · `db:reset` · `test` · `test:e2e` · `validate:specs` | P0 | SPEC §7 |
| FR-AF-03 | `tsconfig.json` với `strict: true`, `paths: { "@/*": ["./src/*"] }`, `moduleResolution: "bundler"`, `target: "ES2022"` | P0 | NFR |
| FR-AF-04 | `next.config.ts` — không tắt Strict Mode, không bật `output: export` (cần server routes), `experimental: { serverActions: true }` | P0 | — |
| FR-AF-05 | Dependency đúng phiên bản: `next@15`, `react@19`, `typescript@5`, `tailwindcss@4` + `@tailwindcss/postcss`, `prisma` + `@prisma/client`, `@anthropic-ai/sdk`, `zod`, `ts-fsrs`, `vitest`, `@playwright/test`, `eslint` + `eslint-config-next` | P0 | SPEC §1 |
| FR-AF-06 | `postcss.config.mjs` dùng `@tailwindcss/postcss` — Tailwind v4 **không** dùng `tailwind.config.js` kiểu cũ | P0 | DESIGN.md |

### 3.2 Design token (FR-AF-07..11)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-AF-07 | `src/app/globals.css` khai báo **toàn bộ** token màu từ `.kiro/steering/design-system.md` §2 dưới dạng CSS custom properties trong `@theme` (Tailwind v4): `--color-surface`, `--color-surface-container`, `--color-primary`, `--color-secondary`, `--color-tertiary`, `--color-on-surface`, `--color-outline`… | P0 | design-system §2 |
| FR-AF-08 | Khai báo **3 font** + đủ token typography: `--font-display`, `--font-headline-*`, `--font-body-*`, `--font-label-*`, `--font-code-md` (11 token size/line-height/letter-spacing) | P0 | design-system §3 |
| FR-AF-09 | Khai báo token spacing (`space-xs`…`space-xl`, `gutter*`, `margin*`), radius (`sm`…`full`), và shadow (`shadow-md` cho card, **không** `shadow-xl`) | P0 | design-system §4, §5, §6 |
| FR-AF-10 | Tải 3 font qua `next/font/google` (`Space_Grotesk`, `Be_Vietnam_Pro`, `JetBrains_Mono`) — **không** dùng CDN link (nhanh hơn, không FOUT, không CSP issue) | P0 | design-system §3 |
| FR-AF-11 | Cấu hình `Material Symbols Outlined` (icon duy nhất) — cân nhắc `@fontsource` hoặc `next/font` local; nếu dùng Google Fonts CDN thì ghi rõ vào README | P1 | design-system §8 |

### 3.3 Layout shell (FR-AF-12..17)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-AF-12 | `src/app/layout.tsx` — Server Component: `<html lang="vi" className="dark">`, metadata tiếng Việt, 3 font qua `next/font`, `<Providers>` (client) | P0 | design-system |
| FR-AF-13 | `src/app/globals.css` khai báo `color-scheme: dark` và `:root` mặc định **dark-mode** (app không có light mode — DESIGN.md nói rõ "dark-mode default") | P0 | DESIGN.md |
| FR-AF-14 | **Shell component** `src/components/shell/app-shell.tsx`: khung `max-w-[1520px] mx-auto p-margin-lg space-y-gutter-lg`, responsive 12→8→4 cột | P0 | design-system §4 |
| FR-AF-15 | **Bottom nav** `src/components/shell/bottom-nav.tsx`: đúng **4 nút** — Hôm nay (`/`) · Kỹ năng (`/skills`) · Ôn tập (`/language`) · Nhật ký (`/journal`). Cố định đáy màn hình, vùng ngón cái, `bg-surface-container` + `backdrop-blur`. | P0 | SPEC §3.1 |
| FR-AF-16 | **Menu góc phải** `src/components/shell/overflow-menu.tsx`: Báo cáo tuần (`/review`) · Báo cáo tiến bộ (`/progress`) · Mock Interview (`/interview/setup`) · Bài kiểm tra (`/test`) · Cài đặt (`/settings`) | P0 | SPEC §3.1 |
| FR-AF-17 | Trang chủ placeholder hiển thị đúng shell + token (dùng để kiểm chứng D5/D6/D7) — **không** implement S01, chỉ là khung | P0 | — |

### 3.4 Hạ tầng dữ liệu (FR-AF-18..23)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-AF-18 | `prisma/schema.prisma` — **15 model** của SPEC §4, **không thiếu, không thừa** (chưa áp dụng C1–C34 của registry — feature khác thêm sau bằng migration riêng) | P0 | SPEC §4 |
| FR-AF-19 | `src/lib/db.ts` — Prisma client **singleton** (tránh tạo nhiều connection khi hot-reload) + `globalThis` cache trong dev | P0 | steering/tech §5 |
| FR-AF-20 | `src/lib/dates.ts` — chuẩn hoá ngày 00:00 **local**, so sánh ngày bằng chuỗi `yyyy-MM-dd`, **không** dùng `toISOString()` (chuyển UTC) | P0 | steering/tech §5 |
| FR-AF-21 | `src/lib/types.ts` — type chung: `DomainKey`, `Level` (CEFR), `ActivityType`, `CardMode`, `AiTone`… kéo từ registry | P0 | steering |
| FR-AF-22 | `src/lib/config.ts` — hằng số: `SLOT_COUNT=6`, `SKILL_LEVEL_MAX=5`, `EVIDENCE_THRESHOLD=3`, `QUICK_LOG_MAX_SECONDS=10`, `SRS_SESSION_MAX_CARDS=20`, `TEST_COUNTS`… | P0 | steering/project §5 |
| FR-AF-23 | `prisma/seed.ts` — chạy được bằng `npm run db:seed`: user profile mặc định + cây kỹ năng **Java** (53 node, từ `user-profile-decisions.md` §2) + 140 thẻ zh/en. **Không gọi AI** (R6). | P0 | user-profile-decisions §2, §4 |

### 3.5 Môi trường & an toàn (FR-AF-24..27)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-AF-24 | `.env.example` liệt kê `DATABASE_URL` + `ANTHROPIC_API_KEY` (giá trị trống, có comment). `.env.local` **không** commit (đã có trong `.gitignore`) | P0 | NFR-09 |
| FR-AF-25 | Kiểm tra env lúc khởi động: thiếu `ANTHROPIC_API_KEY` → **không crash**, chỉ log cảnh báo "đang chạy offline mode". Thiếu `DATABASE_URL` → lỗi rõ ràng (không phải lỗi DB mơ hồ) | P0 | FR-AI-06 |
| FR-AF-26 | `src/lib/env.ts` — đọc env qua 1 chỗ duy nhất, có type, không log giá trị key (chỉ mask `sk-ant-…abcd`) | P0 | NFR-09 |
| FR-AF-27 | `src/lib/api-response.ts` — helper chuẩn `{ ok: true, data }` / `{ ok: false, error }` + error code chuẩn, dùng cho **mọi** route | P0 | steering/tech §5 |

### 3.6 Kiểm thử & CI (FR-AF-28..31)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-AF-28 | `vitest.config.ts` + test setup; `npm test` chạy unit test; `npm run test:e2e` chạy Playwright | P0 | — |
| FR-AF-29 | `playwright.config.ts` — viewport 390×844 (mobile-first) **và** 1280×900; `baseURL: http://localhost:3000` | P0 | NFR-01 |
| FR-AF-30 | `.github/workflows/ci.yml` — job `lint` + `typecheck` + `test` + `build`; chạy `npm run validate:specs` (validator trong `.kiro/scripts/`) | P1 | — |
| FR-AF-31 | `README.md` — cách chạy, cấu trúc thư mục, liên kết `.kiro/README.md`, ghi chú "không có API key vẫn chạy" | P0 | — |

---

## 4. Yêu cầu phi chức năng

| ID | Yêu cầu | Tiêu chí kiểm tra |
|---|---|---|
| NFR-AF-01 | Cold start | `npm run dev` → trang chủ render < 2s (sau khi build xong) |
| NFR-AF-02 | Bundle | Không có warning "Module not found"; build output không chứa `@anthropic-ai/sdk` ở client bundle (server-only) |
| NFR-AF-03 | Type safety | `npm run typecheck` → 0 lỗi với `strict: true`; không có `any` trong `src/lib` |
| NFR-AF-04 | A11y nền | `html` có `lang="vi"`; focus ring `focus-visible:ring-2 focus-visible:ring-primary`; icon-only có `aria-label` |
| NFR-AF-05 | Responsive | Shell dùng được ở 390px (1 cột) và ≥1280px (12 cột), không tràn ngang |
| NFR-AF-06 | Không phụ thuộc ngoài | Không CDN font runtime (dùng `next/font`); TTS/STT dùng Web Speech API của trình duyệt |
| NFR-AF-07 | Determinism | `npm run db:reset` cho ra DB giống hệt nhau (seed idempotent, không `Date.now()` trong seed) |
| NFR-AF-08 | Offline | Không mạng + không API key → app vẫn render, vẫn ghi được vào SQLite |
| NFR-AF-09 | Secret safety | `.env.local` không bao giờ vào git; `git check-ignore .env.local` → true |

---

## 5. Mô hình dữ liệu

Feature này **không thêm model nào** — chỉ khởi tạo đúng 15 model của SPEC §4.

| Model | Ghi chú khởi tạo |
|---|---|
| `Skill` | Self-relation `"SkillTree"` (`parentId` / `children` / `parent`) |
| `Activity` | Bảng trung tâm, `domain` + `type` + `minutes` + `quality` + `aiScore` |
| `Evidence` | `rating` 1–4, `onDelete: Cascade` cả 2 chiều, `@@index([skillId])` |
| `Reflection` | `activityId` unique |
| `PlanItem` | `date` chuẩn hoá 00:00 local, `slot` 0–5, `source` ∈ `ai\|manual\|fallback`, `@@index([date])` |
| `Card` | `cardState` Json (FSRS), `@@index([lang, due])` |
| `Review` | `rating` 1–4, `state` Json |
| `DailyState` | `date` unique |
| `UserProfile` | `learningLangs` = `"en,zh"`, `aiTone` default `direct` |
| `AiCall` | `feature` · `model` · tokens · `estimatedCost` · `ok` · `error`, `@@index([createdAt])` |
| `InterviewProfile` | `focusSkills` Json dạng string, `questionKinds` CSV |
| `InterviewSession` | `status` ∈ `active\|done\|abandoned` |
| `InterviewTurn` | `scores` Json, `kind` ∈ 5 dạng câu |
| `TestSession` | `testType` ∈ 4 loại, `blueprint` Json |
| `TestItem` | `itemType` ∈ 6 dạng câu, `options`/`errorGroups` Json |

**Quy tắc:** schema ở Phase -1 đúng 15 model. Mọi field bổ sung (C1–C34) và model mới (M1–M11)
do feature tương ứng thêm bằng **migration riêng**, theo `.kiro/steering/data-model-registry.md`.

**Enum cần định nghĩa sớm** (dùng bởi nhiều feature):

```ts
export const DOMAINS = ["professional", "communication", "language", "personal"] as const;
export const ACTIVITY_TYPES = [
  "study", "write", "speak", "roleplay", "srs", "journal", "health", "custom",
  "mock_interview", "test",          // ← 2 giá trị cuối: feature mock-interview / language-test
] as const;
export const LEVELS = ["zero", "A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const AI_TONES = ["direct", "coach", "gentle"] as const;
```

---

## 6. Giao diện & hành vi

### 6.1 Bố cục — trang chủ placeholder (Phase -1)

> Đây **không phải** S01. Đó là placeholder để kiểm chứng khung + token + nav.

```
┌────────────────────────────────────────────────────────────────┐
│ [Logo] Daily Loop OS                    🔥 12  ⚡ 78%   ⋮    │  ← top strip
│                                          (placeholder data)  │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│            ┌──────────────────────────────┐                    │
│            │   Phase -1 placeholder       │                    │
│            │   Token + shell đã đúng,     │                    │
│            │   nội dung S01 sẽ thay sau.  │                    │
│            └──────────────────────────────┘                    │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  ● Hôm nay    ○ Kỹ năng    ○ Ôn tập    ○ Nhật ký            │  ← bottom nav (4)
└────────────────────────────────────────────────────────────────┘
```

### 6.2 Menu góc phải — `⋮`

```
┌────────────────────────┐
│ Báo cáo tuần       →   │
│ Báo cáo tiến bộ    →   │
│ Mock Interview     →   │
│ Bài kiểm tra       →   │
│ Cài đặt            →   │
└────────────────────────┘
```

### 6.3 Bảng thành phần

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| `<html>` | `lang="vi"` · `className="dark"` | — | Không có light mode |
| Top strip | Logo + streak + energy + menu | `bg-surface` · `text-outline` | Placeholder cho đến khi có S01 |
| Menu `⋮` | 5 mục | `bg-surface-container-high` · `rounded-lg` · `font-label-md` | Đóng khi click ra ngoài · `Escape` đóng · `aria-expanded` |
| Bottom nav | 4 nút | `bg-surface-container` · `backdrop-blur` · `rounded-lg` | Active = `text-primary` · inactive = `text-outline` · `aria-current="page"` |
| Container | Khung nội dung | `max-w-[1520px] mx-auto p-margin-lg space-y-gutter-lg` | 1 cột <768px · 12 cột ≥1280px |

### 6.4 Trạng thái

| Trạng thái | Điều kiện | Hiển thị |
|---|---|---|
| Bình thường | App chạy | Shell + placeholder |
| Chưa có DB | `DATABASE_URL` trỏ file chưa migrate | Banner "Chạy `npm run db:migrate && npm run db:seed`" — **không** crash |
| Thiếu API key | Không có `ANTHROPIC_API_KEY` | Banner nhỏ "Đang chạy offline mode — thêm API key trong Cài đặt" |
| Chưa seed | DB rỗng | Placeholder hiện "Chưa có dữ liệu — chạy `npm run db:seed`" |

### 6.5 Edge case

| Case | Xử lý |
|---|---|
| Mở app lần đầu, DB chưa tồn tại | Banner hướng dẫn, không crash (không query DB lúc render layout) |
| `DATABASE_URL` sai đường dẫn | Lỗi rõ ràng ở console + banner, không phải stack trace Prisma |
| Thiếu `ANTHROPIC_API_KEY` | Offline mode, banner nhỏ, **không** chặn render |
| Mở menu bằng bàn phím | `Enter`/`Space` mở · `Escape` đóng · focus quay về nút trigger |
| Click vùng ngoài menu | Menu đóng |
| Màn hình 320px (nhỏ hơn 390px) | Bottom nav không tràn, icon + nhãn co lại |
| Màn hình rất rộng ≥1600px | Container vẫn max 1520px, không giãn |
| Tải trang khi mất mạng | Vẫn render shell từ server cache; ghi DB cần mạng nếu chưa có DB local |
| Safe area iOS | Bottom nav thêm `padding-bottom: env(safe-area-inset-bottom)` |

---

## 7. Hợp đồng API

Feature này **không tạo route nghiệp vụ**. Chỉ có 1 route kỹ thuật:

| Method | Route | Input | Output | Lỗi |
|---|---|---|---|---|
| `GET` | `/api/health` | — | `{ ok: true, data: { db: boolean, ai: "configured" \| "offline", version } }` | `500` nếu DB không kết nối được |

> Route này cho CI + `docker healthcheck` + smoke test. **Không** tiết lộ giá trị key.

---

## 8. Tiêu chí nghiệm thu (Acceptance Criteria)

**AC-AF-1 — Lệnh cơ bản hoạt động**
- *Given* máy sạch chỉ có repo, *When* chạy `npm install && npm run db:migrate && npm run db:seed && npm run dev`, *Then* trang chủ mở ở `localhost:3000` không lỗi console, và `prisma/dev.db` tồn tại với đủ 15 bảng.

**AC-AF-2 — Build sạch**
- *Given* mã nguồn hiện tại, *When* chạy `npm run build`, *Then* exit code 0, không có lỗi TypeScript; `npm run typecheck` cũng exit 0 với `strict: true`.

**AC-AF-3 — Token đúng design system**
- *Given* trang chủ, *When* đo computed style của `body`, *Then* `background-color` = `#0f131c` (`surface`); tiêu đề dùng `Space Grotesk`; body dùng `Be Vietnam Pro`; nhãn uppercase dùng `JetBrains Mono` với `letter-spacing` ≥ `0.04em`.

**AC-AF-4 — Bottom nav đúng 4 nút**
- *Given* bất kỳ màn hình nào, *When* render, *Then* có **đúng 4** mục điều hướng dưới: Hôm nay · Kỹ năng · Ôn tập · Nhật ký; mục đang active có `aria-current="page"`.

**AC-AF-5 — Menu góc phải đúng 5 mục**
- *Given* trang chủ, *When* bấm nút `⋮`, *Then* menu hiện **đúng 5** mục theo thứ tự SPEC §3.1: Báo cáo tuần · Báo cáo tiến bộ · Mock Interview · Bài kiểm tra · Cài đặt.

**AC-AF-6 — Offline mode**
- *Given* không có `ANTHROPIC_API_KEY`, *When* mở app, *Then* vẫn render đầy đủ, hiện banner "Đang chạy offline mode", **không** có lỗi 500, và không có request nào tới Anthropic.

**AC-AF-7 — Seed tĩnh**
- *Given* `npm run db:reset`, *When* kiểm tra DB, *Then* có 53 node kỹ năng (4 domain · 16 tầng 2 · 33 tầng 3 — đúng cây Java), 140 thẻ (70 zh + 70 en), 1 `UserProfile`; chạy lại `db:seed` cho kết quả **giống hệt** (idempotent, không `Date.now()`).

**AC-AF-8 — A11y nền**
- *Given* trang chủ, *When* chạy axe, *Then* **0** lỗi vi phạm (`critical`/`serious`); mọi icon-only button có `aria-label`; `<html lang="vi">`.

**AC-AF-9 — Responsive**
- *Given* viewport 390px, *When* chụp màn hình, *Then* bottom nav không tràn ngang, không có scrollbar ngang; ở 1280px, container dùng lưới 12 cột.

**AC-AF-10 — Secret không lọt vào repo**
- *Given* file `.env.local` có `ANTHROPIC_API_KEY=sk-ant-thật`, *When* chạy `git status`, *Then* file **không** xuất hiện trong untracked/staged (đã `.gitignore`), và `git check-ignore .env.local` trả về true.

**AC-AF-11 — Chuẩn hoá ngày**
- *Given* hai mốc thời gian cùng một ngày nhưng khác giờ (23:59 và 00:01), *When* gọi `normalizeDate()`, *Then* cùng trả về `yyyy-MM-dd` giống nhau; hàm **không** dùng `toISOString()`.

**AC-AF-12 — Validator chạy được**
- *Given* repo đã clone, *When* chạy `npm run validate:specs`, *Then* exit code 0 và in "KẾT QUẢ: PASS".
