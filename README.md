# Daily Loop OS

Hệ thống phát triển bản thân: **chuyên môn · giao tiếp · ngoại ngữ · cá nhân**.

Local-first — dữ liệu nằm trong SQLite trên máy, AI chỉ được gọi khi cần.

---

## Yêu cầu

- **Node.js 20+** (khuyến nghị 22+)
- npm 10+

> Không cần Docker, không cần database server, không cần API key để chạy.

## Chạy lần đầu

```bash
npm install
cp .env.example .env.local      # tuỳ chọn — dùng để thêm ANTHROPIC_API_KEY
npm run db:migrate              # tạo prisma/dev.db + 15 bảng
npm run db:seed                 # 53 node kỹ năng + 140 thẻ ngoại ngữ
npm run dev                     # → http://localhost:3000
```

## Không có API key vẫn chạy

Bỏ trống `ANTHROPIC_API_KEY` trong `.env.local` ⇒ app chạy **offline mode**:
mọi tính năng AI hiện "cần API key" thay vì gọi API. Phần còn lại hoạt động bình thường.

Thêm key tại <https://console.anthropic.com/>, rồi khởi động lại `npm run dev`.

## Scripts

| Script | Việc |
|---|---|
| `npm run dev` | Dev server (port 3000) |
| `npm run build` | Prisma generate + production build |
| `npm run start` | Chạy production build |
| `npm run lint` | ESLint (flat config) |
| `npm run typecheck` | `tsc --noEmit` — strict mode |
| `npm run db:migrate` | Áp dụng migration (`prisma migrate dev`) |
| `npm run db:seed` | Nạp dữ liệu mẫu (idempotent) |
| `npm run db:reset` | Xoá DB + migrate + seed lại từ đầu |
| `npm run db:studio` | Prisma Studio — xem DB trực quan |
| `npm test` | Unit test (Vitest) |
| `npm run test:e2e` | E2E test (Playwright, 2 viewport) |
| `npm run validate:specs` | Kiểm tra bộ spec Kiro trong `.kiro/` |

## Cấu trúc thư mục

```
prisma/
  schema.prisma           15 model — nguồn chân lý: system-design/SPEC.md §4
  seed.ts                 Seed tĩnh (không gọi AI)
  seed-data/
    skills.ts             Cây kỹ năng Java Backend — 53 node
    cards.ts              140 thẻ ngoại ngữ (70 zh + 70 en)
  migrations/             Migration đã apply

src/
  app/
    layout.tsx            Root layout — 3 font qua next/font
    page.tsx              Trang chủ placeholder (Phase -1)
    globals.css           Design token Tailwind v4 (@theme)
    api/health/route.ts   Smoke test + healthcheck
  components/shell/
    app-shell.tsx         Khung: header + main + bottom nav
    bottom-nav.tsx        4 mục điều hướng dưới
    overflow-menu.tsx     Menu góc phải — 5 mục
  lib/
    db.ts                 Prisma client singleton
    dates.ts              Chuẩn hoá ngày 00:00 LOCAL (không dùng toISOString)
    env.ts                Đọc env 1 chỗ · mask key · offline mode
    api-response.ts       Helper {ok,data} / {ok,error} cho mọi route
    config.ts             Hằng số cấu hình
    types.ts              Type dùng chung (domain · level CEFR · activity type)
    cn.ts                 Gộp class

tests/                    Unit test (Vitest)
e2e/                      E2E test (Playwright)

.kiro/                     Bộ spec Kiro — xem .kiro/README.md
system-design/            Tài liệu gốc (SPEC.md + 21 prototype)
```

## Biến môi trường

| Biến | Bắt buộc | Mặc định | Ghi chú |
|---|---|---|---|
| `DATABASE_URL` | ✅ | `file:./dev.db` | SQLite local. Trong `.env` (Prisma CLI đọc `.env`) |
| `ANTHROPIC_API_KEY` | ❌ | — | Trong `.env.local`. Thiếu ⇒ offline mode |

> `.env.local` **không** được commit (đã có trong `.gitignore`).

## Design system

Toàn bộ token nằm trong `src/app/globals.css` dưới dạng `@theme` (Tailwind v4 CSS-first —
**không** có `tailwind.config.js`).

- **Màu:** `surface` `#0f131c` · `primary` `#4edea3` · `secondary` `#c0c1ff` (AI) · `tertiary` `#ffb95f` (ma sát)
- **Font:** Space Grotesk (tiêu đề) · Be Vietnam Pro (nội dung, hỗ trợ đầy đủ dấu tiếng Việt) · JetBrains Mono (label, số liệu)
- **App chỉ có dark mode** — `color-scheme: dark`

Dùng class token, **không** hardcode hex:
`bg-surface-container` · `text-outline` · `font-headline-md` · `p-space-lg` · `rounded-lg`

Nguồn: `.kiro/steering/design-system.md`.

## Tài liệu

| Tài liệu | Nội dung |
|---|---|
| [`.kiro/README.md`](.kiro/README.md) | Index 12 feature + roadmap triển khai |
| [`system-design/SPEC.md`](system-design/SPEC.md) | Yêu cầu gốc: 21 màn hình, data model, AI layer, NFR |
| [`.kiro/steering/`](.kiro/steering/) | Product · Tech · Design system · Project · Registry · Hồ sơ người dùng |
| [`.kiro/specs/app-foundation/`](.kiro/specs/app-foundation/) | Feature Phase -1 hiện tại (khung dự án) |

## Trạng thái

Phase **-1 (Khung dự án)** — hoàn tất.

Tiếp theo: `ai-foundation` (lớp AI dùng chung) → `daily-loop-core` (S01–S02).
Xem roadmap trong `.kiro/README.md`.
