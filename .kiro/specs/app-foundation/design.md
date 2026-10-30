# Design — App Foundation

## 1. Tổng quan kiến trúc

Feature này dựng **khung chạy được** — không có tính năng nghiệp vụ nào. Đầu ra là một Next.js app
chạy được với design token đúng, Prisma đã migrate, layout shell đúng, và script để dev/test/CI.

```
┌─────────────────────────────────────────────────────────────────┐
│                         package.json                            │
│  scripts: dev · build · lint · typecheck · db:* · test · e2e   │
│  deps: next@15 · react@19 · prisma · @anthropic-ai/sdk · zod    │
│       ts-fsrs · tailwindcss@4 · vitest · playwright            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
     ┌──────────────────────┼──────────────────────┐
     ▼                      ▼                      ▼
┌─────────┐          ┌────────────┐         ┌──────────────┐
│ tailwind │          │  prisma/   │         │  src/app/    │
│ globals  │          │ schema +   │         │ layout.tsx   │
│  .css    │          │  seed.ts   │         │ page.tsx     │
│ @theme  │          │            │         │ api/health   │
└─────────┘          └────────────┘         └──────┬───────┘
  11 token color                                     │
  11 token type                          ┌───────────┴──────────┐
  spacing + radius + shadow              ▼                      ▼
                                   ┌────────────┐        ┌──────────────┐
                                   │ components/ │        │    lib/      │
                                   │   shell/    │        │ db · dates   │
                                   │ app-shell   │        │ types · config│
                                   │ bottom-nav  │        │ env · api-   │
                                   │ overflow-   │        │ response     │
                                   │ menu        │        └──────────────┘
                                   └────────────┘
```

---

## 2. Kiến trúc

### 2.1 Quyết định thiết kế

| # | Quyết định | Lý do | Hệ quả |
|---|---|---|---|
| D1 | **Tailwind v4 dùng CSS-first `@theme`**, không dùng `tailwind.config.js` | v4 chuyển cấu hình vào CSS; `tailwind.config.js` kiểu cũ không được hỗ trợ đầy đủ | Token nằm trong `globals.css`; file `tailwind.config.js` **không tồn tại** |
| D2 | **Font qua `next/font/google`**, không CDN `<link>` | Tự host, không FOUT, không CSP, không rò request ra ngoài (P6 local-first) | `next/font` tải file font lúc build → cần mạng **lúc build**, không phải lúc runtime |
| D3 | `next/font` với `display: "swap"` + `adjustFontFallback` | Tránh CLS khi font tải chậm | Cần test flash text |
| D4 | Prisma client là **singleton** có `globalThis` cache | Next dev reload module nhiều lần → nhiều connection pool → hết connection SQLite | Pattern `globalThis.__prisma` |
| D5 | `normalizeDate()` dùng **thành phần ngày giờ cục bộ**, tuyệt đối không `toISOString()` | `toISOString()` chuyển UTC → lệch ngày ở UTC+7 lúc 00:30 (rủi ro T8) | So sánh ngày bằng chuỗi `yyyy-MM-dd` |
| D6 | Seed **không** dùng `Date.now()` / `random` | `db:reset` phải cho DB giống hệt nhau (NFR-AF-07) | ID cố định theo slug, không cuid ngẫu nhiên |
| D7 | Layout shell là **Client Component** (`bottom-nav` cần `usePathname`) | Đánh dấu active nav | `layout.tsx` vẫn Server Component, chỉ nhúng `<ShellNav>` client |
| D8 | Icon: `Material Symbols Outlined` qua **CDN** (chấp nhận) | Font icon biến thiên, cân nhắc self-host tốn công | Ghi rõ trong README; không ảnh hưởng P6 (chỉ icon, không dữ liệu) |
| D9 | `src/lib/api-response.ts` là **helper duy nhất** cho mọi route | Chuẩn hoá `{ok, data}` / `{ok, error}` | Route mới phải dùng helper, không tự phát minh format |
| D10 | Không dùng `create-next-app` | Nhiều prompt tương tác, sinh file thừa | Tạo file tay theo danh sách §3.1 |

### 2.2 Sơ đồ luồng khởi động app

```
Browser → Next.js server
   │
   ├─► layout.tsx (Server Component)
   │     ├─ đọc 3 font qua next/font
   │     ├─ <html lang="vi" class="dark">
   │     └─ <AppShell>  ← Client (nav cần pathname)
   │           ├─ <TopStrip>  (placeholder)
   │           ├─ <main>{children}</main>
   │           ├─ <BottomNav>  (4 mục)
   │           └─ <OverflowMenu> (5 mục)
   │
   ├─► page.tsx (Server Component) — placeholder Phase -1
   │     └─ getHealth() → { db, ai } → hiện banner offline nếu thiếu key
   │
   └─► (khi cần) API routes → src/lib/api-response.ts
```

---

## 3. Thành phần

### 3.1 `src/app/globals.css` — token Tailwind v4

**Đường dẫn:** `src/app/globals.css`

```css
@import "tailwindcss";

/* ── Màu: 11 nhóm token từ design-system.md §2 ─────────────────────────── */
@theme {
  --color-surface:              #0f131c;   /* canvas + body */
  --color-surface-dim:          #0f131c;
  --color-surface-container-lowest: #0a0e17;  /* ô nhập recessed */
  --color-surface-container-low:    #181b25;
  --color-surface-container:        #1c1f29;  /* card/module chính */
  --color-surface-container-high:   #262a34;  /* nút ghost, chip, hover */
  --color-surface-container-highest:#31353f;  /* track progress bar */
  --color-surface-variant:      #31353f;
  --color-surface-bright:       #353943;

  --color-on-surface:           #dfe2ef;
  --color-on-surface-variant:   #bbcabf;
  --color-outline:              #86948a;   /* CHỈ dùng cho label */
  --color-outline-variant:      #3c4a42;

  --color-primary:              #4edea3;   /* tiến bộ, streak, hoàn thành */
  --color-primary-container:    #10b981;   /* nền nút primary */
  --color-on-primary:           #003824;
  --color-secondary:            #c0c1ff;   /* MỌI thao tác AI */
  --color-secondary-container:  #3131c0;
  --color-on-secondary:         #1000a9;
  --color-tertiary:             #ffb95f;   /* ma sát đang chờ */
  --color-tertiary-container:   #e29100;
  --color-on-tertiary:          #472a00;
  --color-error:                #ffb4ab;
  --color-error-container:      #93000a;
  --color-on-error:             #690005;

  --color-background:           #0f131c;
  --color-on-background:        #dfe2ef;
  --color-inverse-surface:      #dfe2ef;
  --color-inverse-on-surface:   #2c303a;
  --color-surface-tint:         #4edea3;
  --color-primary-fixed:        #6ffbbe;
  --color-primary-fixed-dim:    #4edea3;
  --color-on-primary-fixed:     #002113;
  --color-on-primary-fixed-variant: #005236;
  --color-secondary-fixed:      #e1e0ff;
  --color-secondary-fixed-dim:  #c0c1ff;
  --color-on-secondary-fixed:   #07006c;
  --color-on-secondary-fixed-variant: #2f2ebe;
  --color-tertiary-fixed:       #ffddb8;
  --color-tertiary-fixed-dim:   #ffb95f;
  --color-on-tertiary-fixed:    #2a1700;
  --color-on-tertiary-fixed-variant: #653e00;
  --color-inverse-primary:      #006c49;

  /* ── Typography: 11 token từ design-system.md §3 ─────────────────────── */
  --font-display:      var(--font-space-grotesk);
  --font-headline-lg:  var(--font-space-grotesk);
  --font-headline-lg-mobile: var(--font-space-grotesk);
  --font-headline-md:  var(--font-space-grotesk);
  --font-headline-sm:  var(--font-space-grotesk);
  --font-body-lg:      var(--font-be-vietnam-pro);
  --font-body-md:      var(--font-be-vietnam-pro);
  --font-body-sm:      var(--font-be-vietnam-pro);
  --font-label-md:     var(--font-jetbrains-mono);
  --font-label-sm:     var(--font-jetbrains-mono);
  --font-code-md:      var(--font-jetbrains-mono);

  --text-display:      3.5rem;    --text-display--line-height: 4rem;
  --text-display--letter-spacing: -0.03em;   --text-display--font-weight: 700;
  --text-headline-lg:  2.25rem;   --text-headline-lg--line-height: 2.75rem;
  --text-headline-lg--letter-spacing: -0.025em; --text-headline-lg--font-weight: 600;
  --text-headline-lg-mobile: 1.75rem; --text-headline-lg-mobile--line-height: 2.25rem;
  --text-headline-lg-mobile--letter-spacing: -0.02em; --text-headline-lg-mobile--font-weight: 600;
  --text-headline-md:  1.5rem;    --text-headline-md--line-height: 2rem;
  --text-headline-md--letter-spacing: -0.02em;  --text-headline-md--font-weight: 600;
  --text-headline-sm:  1.25rem;   --text-headline-sm--line-height: 1.75rem;
  --text-headline-sm--letter-spacing: -0.015em; --text-headline-sm--font-weight: 500;
  --text-body-lg:      1.125rem;  --text-body-lg--line-height: 1.875rem;
  --text-body-lg--letter-spacing: 0em;        --text-body-lg--font-weight: 400;
  --text-body-md:      0.9375rem; --text-body-md--line-height: 1.625rem;
  --text-body-md--letter-spacing: 0em;        --text-body-md--font-weight: 400;
  --text-body-sm:      0.8125rem; --text-body-sm--line-height: 1.375rem;
  --text-body-sm--letter-spacing: 0.005em;    --text-body-sm--font-weight: 400;
  --text-label-md:     0.75rem;   --text-label-md--line-height: 1rem;
  --text-label-md--letter-spacing: 0.04em;    --text-label-md--font-weight: 500;
  --text-label-sm:     0.6875rem; --text-label-sm--line-height: 0.875rem;
  --text-label-sm--letter-spacing: 0.06em;    --text-label-sm--font-weight: 600;
  --text-code-md:      0.875rem;  --text-code-md--line-height: 1.5rem;
  --text-code-md--letter-spacing: -0.01em;    --text-code-md--font-weight: 500;

  /* ── Spacing (bội số 0.25rem) ───────────────────────────────────────── */
  --spacing-space-xs: 0.25rem;  --spacing-space-sm: 0.5rem;
  --spacing-space-md: 0.75rem;  --spacing-space-lg: 1.25rem;
  --spacing-space-xl: 2rem;
  --spacing-gutter:    1rem;     --spacing-gutter-md: 1.25rem;
  --spacing-gutter-lg: 1.5rem;
  --spacing-margin:    1rem;     --spacing-margin-md: 1.5rem;
  --spacing-margin-lg: 2.5rem;

  /* ── Shapes ─────────────────────────────────────────────────────────── */
  --radius-sm: 0.125rem;  --radius-DEFAULT: 0.25rem;
  --radius-md: 0.375rem;  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;   --radius-full: 9999px;

  /* ── Shadow: KHÔNG dùng shadow-xl ──────────────────────────────────── */
  --shadow-md: 0 4px 12px -2px rgba(0, 0, 0, 0.4);
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.25);
}

/* ── Base ──────────────────────────────────────────────────────────────── */
@layer base {
  :root {
    color-scheme: dark;               /* app không có light mode */
  }

  html, body {
    margin: 0;
    padding: 0;
  }

  body {
    background-color: var(--color-surface);
    color: var(--color-on-surface);
    font-family: var(--font-be-vietnam-pro);
    font-size: var(--text-body-md);
    line-height: var(--text-body-md--line-height);
    /* tiếng Việt: không cắt dấu câu */
    overflow-wrap: break-word;
    -webkit-font-smoothing: antialiased;
  }

  /* Số liệu tabular: FSRS S/D, streak, token count */
  .tabular {
    font-family: var(--font-jetbrains-mono);
    font-variant-numeric: tabular-nums;
  }

  /* Ẩn thanh scroll ngang (prototype) */
  ::-webkit-scrollbar { display: none; }
}

@layer utilities {
  /* Safe area cho bottom nav trên iOS */
  .pb-safe { padding-bottom: env(safe-area-inset-bottom, 0px); }
}
```

**Quy tắc dùng class (Tailwind v4 tự sinh từ `@theme`):**
`bg-surface-container` · `text-on-surface-variant` · `text-outline` · `bg-primary-container`
`text-on-primary` · `bg-secondary/10` · `text-secondary` · `bg-tertiary` · `rounded-lg`
`p-space-lg` · `gap-gutter-md` · `mb-space-md` · `p-margin-lg` · `font-headline-md`
`text-body-md` · `font-label-sm` · `tracking-wider` · `shadow-md`

> ⚠️ Vì dùng `@theme` (CSS-first), các tên class như `font-headline-md` được sinh tự động từ
> `--font-headline-md` + `--text-headline-md`. **Không** tạo `tailwind.config.js` — sẽ gây xung đột.

### 3.2 `src/app/layout.tsx`

**Đường dẫn:** `src/app/layout.tsx`

```tsx
import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Be_Vietnam_Pro, JetBrains_Mono } from "next/font/google";
import { AppShell } from "@/components/shell/app-shell";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-be-vietnam-pro",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Daily Loop OS", template: "%s · Daily Loop OS" },
  description: "Hệ thống phát triển bản thân: chuyên môn · giao tiếp · ngoại ngữ · cá nhân",
};

export const viewport: Viewport = {
  themeColor: "#0f131c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="vi"
      className={`${spaceGrotesk.variable} ${beVietnamPro.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
```

> **`subsets: ["vietnamese"]` là bắt buộc** — thiếu nó thì dấu tiếng Việt có thể bị thiếu glyph.

### 3.3 `src/components/shell/app-shell.tsx`

**Đường dẫn:** `src/components/shell/app-shell.tsx`

```tsx
"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "./bottom-nav";
import { OverflowMenu } from "./overflow-menu";
import { cn } from "@/lib/cn";

export interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-surface text-on-surface">
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-outline-variant/40">
        <div className="max-w-[1520px] mx-auto px-margin flex items-center justify-between h-14">
          <span className="font-headline-sm text-headline-sm text-on-surface">
            Daily Loop OS
          </span>
          <OverflowMenu />
        </div>
      </header>

      <main className="max-w-[1520px] mx-auto p-margin-lg space-y-gutter-lg pb-24">
        {children}
      </main>

      <BottomNav pathname={pathname} />
    </div>
  );
}
```

### 3.4 `src/components/shell/bottom-nav.tsx`

**Đường dẫn:** `src/components/shell/bottom-nav.tsx`

```tsx
"use client";

import Link from "next/link";

const NAV_ITEMS = [
  { href: "/",        label: "Hôm nay", icon: "today" },
  { href: "/skills",  label: "Kỹ năng", icon: "account_tree" },
  { href: "/language",label: "Ôn tập",  icon: "style" },
  { href: "/journal", label: "Nhật ký", icon: "edit_note" },
] as const;

export interface BottomNavProps {
  pathname: string;
}

export function BottomNav({ pathname }: BottomNavProps) {
  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed bottom-0 inset-x-0 z-40 bg-surface-container/95 backdrop-blur-md border-t border-outline-variant/40 pb-safe"
    >
      <ul className="max-w-[1520px] mx-auto grid grid-cols-4">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex flex-col items-center justify-center gap-0.5 py-2 min-h-14",
                  "font-label-sm text-label-sm tracking-wide transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                  active ? "text-primary" : "text-outline hover:text-on-surface",
                ].join(" ")}
              >
                <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

### 3.5 `src/components/shell/overflow-menu.tsx`

**Đường dẫn:** `src/components/shell/overflow-menu.tsx`

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const MENU_ITEMS = [
  { href: "/review",           label: "Báo cáo tuần" },
  { href: "/progress",         label: "Báo cáo tiến bộ" },
  { href: "/interview/setup",  label: "Mock Interview" },
  { href: "/test",             label: "Bài kiểm tra" },
  { href: "/settings",         label: "Cài đặt" },
] as const;

export function OverflowMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Mở menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container-high focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
          more_vert
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 bg-surface-container-high rounded-lg shadow-md border border-outline-variant/40 overflow-hidden"
        >
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-space-md py-space-sm font-label-md text-label-md text-on-surface hover:bg-surface-container-highest focus-visible:bg-surface-container-highest focus-visible:outline-none"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 3.6 `src/lib/db.ts`

```ts
import { PrismaClient } from "@prisma/client";

// Singleton: Next dev reload module → tạo nhiều pool → hết connection SQLite
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

### 3.7 `src/lib/dates.ts`

```ts
/**
 * Chuẩn hoá ngày theo múi giờ LOCAL.
 * TUYỆT ĐỐI không dùng toISOString() — chuyển sang UTC làm lệch ngày ở UTC+7.
 */
export function normalizeDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;          // yyyy-MM-dd — so sánh bằng chuỗi
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return normalizeDate(r);
}

export function daysBetween(a: Date, b: Date): number {
  const ms = normalizeDate(b).getTime() - normalizeDate(a).getTime();
  return Math.round(ms / 86_400_000);
}
```

### 3.8 `src/lib/env.ts`

```ts
const MASK = (k: string) => (k ? `sk-ant-…${k.slice(-4)}` : "");

function requireDbUrl(): string {
  const v = process.env.DATABASE_URL;
  if (!v) {
    throw new Error(
      "Thiếu DATABASE_URL. Copy .env.example → .env.local rồi chạy `npm run db:migrate`."
    );
  }
  return v;
}

export const env = {
  databaseUrl: requireDbUrl(),
  /** null = chạy offline mode (FR-AI-06) — không phải lỗi */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? null,
  nodeEnv: process.env.NODE_ENV ?? "development",
  get isOffline() { return !this.anthropicApiKey; },
  get maskedKey() { return MASK(this.anthropicApiKey ?? ""); },
};

if (env.isOffline && env.nodeEnv === "development") {
  console.warn(
    "[daily-loop] Không có ANTHROPIC_API_KEY — đang chạy OFFLINE MODE. " +
    "Tính năng AI sẽ hiện 'cần API key'."
  );
}
```

### 3.9 `src/lib/api-response.ts`

```ts
export type ApiErrorCode =
  | "invalid_input" | "not_found" | "conflict"
  | "no_api_key" | "ai_error" | "db_error" | "unknown";

export interface ApiSuccess<T> { ok: true; data: T; }
export interface ApiFailure { ok: false; error: ApiErrorCode; message?: string; }
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

export function fail(error: ApiErrorCode, message?: string): ApiFailure {
  return { ok: false, error, message };
}

const STATUS: Record<ApiErrorCode, number> = {
  invalid_input: 400,
  not_found: 404,
  conflict: 409,
  no_api_key: 503,
  ai_error: 502,
  db_error: 500,
  unknown: 500,
};

export function toResponse<T>(result: ApiResult<T>): Response {
  if (result.ok) return Response.json(result);
  return Response.json(result, { status: STATUS[result.error] ?? 500 });
}
```

### 3.10 `prisma/schema.prisma`

> Đầy đủ 15 model — xem `system-design/SPEC.md` §4 (nguồn chân lý). Feature này chỉ khởi tạo, **không** sửa.

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "sqlite"; url = env("DATABASE_URL") }

model Skill {
  id          String   @id @default(cuid())
  name        String
  nameZh      String?
  domain      String
  parentId    String?
  parent      Skill?   @relation("SkillTree", fields: [parentId], references: [id])
  children    Skill[]  @relation("SkillTree")
  level       Int      @default(0)
  targetLevel Int      @default(3)
  position    Int      @default(0)
  createdAt   DateTime @default(now())
  activities  Activity[]
  evidences   Evidence[]
}

model Activity {
  id         String   @id @default(cuid())
  skillId    String?
  skill      Skill?   @relation(fields: [skillId], references: [id])
  domain     String
  type       String
  minutes    Int      @default(0)
  title      String
  content    String?
  quality    Int?
  aiScore    Float?
  createdAt  DateTime @default(now())
  evidences  Evidence[]
  reflection Reflection?
}

model Evidence {
  id         String   @id @default(cuid())
  activityId String
  activity   Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  skillId    String
  skill      Skill    @relation(fields: [skillId], references: [id], onDelete: Cascade)
  rating     Int
  createdAt  DateTime @default(now())
  @@index([skillId])
}

model Reflection {
  id         String   @id @default(cuid())
  activityId String   @unique
  activity   Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  prompt     String
  answer     String
  aiFeedback String?
  createdAt  DateTime @default(now())
}

model PlanItem {
  id        String   @id @default(cuid())
  date      DateTime @default(now())
  slot      Int
  domain    String
  action    String
  detail    String?
  minutes   Int      @default(15)
  skillId   String?
  done      Boolean  @default(false)
  source    String   @default("ai")
  createdAt DateTime @default(now())
  @@index([date])
}

model Card {
  id             String   @id @default(cuid())
  lang           String
  front          String
  frontAlt       String?
  back           String
  note           String?
  example        String?
  examplePinyin String?
  hint           String?
  group          String?
  mode           String   @default("recognize")
  cardState      Json
  due            DateTime
  stability      Float    @default(0)
  difficulty     Float    @default(0)
  reps           Int      @default(0)
  lapses         Int      @default(0)
  createdAt      DateTime @default(now())
  reviews        Review[]
  @@index([lang, due])
}

model Review {
  id     String   @id @default(cuid())
  cardId String
  card   Card     @relation(fields: [cardId], references: [id], onDelete: Cascade)
  rating Int
  state  Json
  at     DateTime @default(now())
}

model DailyState {
  id        String   @id @default(cuid())
  date      DateTime @unique
  mood      Int?
  energy    Int?
  sleep     Float?
  focus     Int?
  note      String?
  updatedAt DateTime @updatedAt
}

model UserProfile {
  id            String   @id @default(cuid())
  name          String?
  goals         String?
  aiTone        String   @default("direct")
  learningLangs String   @default("zh,en")
  zhLevel       String   @default("zero")
  enLevel       String   @default("zero")
  createdAt     DateTime @default(now())
}

model AiCall {
  id            String   @id @default(cuid())
  feature       String
  model         String
  inputTokens   Int      @default(0)
  outputTokens  Int      @default(0)
  cacheRead     Int      @default(0)
  cacheWrite    Int      @default(0)
  estimatedCost Float    @default(0)
  ok            Boolean  @default(true)
  error         String?
  createdAt     DateTime @default(now())
  @@index([createdAt])
}

model InterviewProfile {
  id            String   @id @default(cuid())
  label         String
  jobTitle      String
  seniority     String   @default("mid")
  language      String   @default("en")
  questionKinds String   @default("concept,design")
  focusSkills   String   @default("[]")
  createdAt     DateTime @default(now())
  sessions      InterviewSession[]
}

model InterviewSession {
  id           String   @id @default(cuid())
  profileId    String
  profile      InterviewProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  plannedCount Int      @default(8)
  askedCount   Int      @default(0)
  status       String   @default("active")
  totalScore   Float?
  skillsFocused String  @default("[]")
  startedAt    DateTime @default(now())
  endedAt      DateTime?
  turns        InterviewTurn[]
  activity     Activity?
}

model InterviewTurn {
  id           String   @id @default(cuid())
  sessionId    String
  session      InterviewSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  index        Int
  question     String
  kind         String
  skillName    String?
  answer       String?
  scores       Json?
  total        Float?
  feedback     String?
  nextQuestion String?
  createdAt    DateTime @default(now())
}

model TestSession {
  id          String   @id @default(cuid())
  lang        String
  testType    String
  topic       String?
  level       String?
  score       Float?
  maxScore    Float?
  durationSec Int?
  blueprint   Json?
  createdAt   DateTime @default(now())
  items       TestItem[]
  activity    Activity?
}

model TestItem {
  id          String   @id @default(cuid())
  testId      String
  test        TestSession @relation(fields: [testId], references: [id], onDelete: Cascade)
  index       Int
  itemType    String
  prompt      String
  audioText   String?
  options     Json?
  answer      String?
  userAnswer  String?
  isCorrect   Boolean?
  cardId      String?
  skillName   String?
  errorGroups Json?
  notes       String?
  seconds     Int?
}
```

### 3.11 `package.json` — scripts

```json
{
  "name": "daily-loop-os",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts",
    "db:reset": "prisma migrate reset --force --skip-generate && npm run db:seed",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "validate:specs": "python3 .kiro/scripts/validate_specs.py"
  },
  "prisma": { "seed": "tsx prisma/seed.ts" },
  "dependencies": {
    "next": "^15",
    "react": "^19",
    "react-dom": "^19",
    "@prisma/client": "^6",
    "@anthropic-ai/sdk": "^0.32",
    "zod": "^3",
    "ts-fsrs": "^4"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^22",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "tailwindcss": "^4",
    "@tailwindcss/postcss": "^4",
    "prisma": "^6",
    "tsx": "^4",
    "vitest": "^2",
    "@playwright/test": "^1",
    "eslint": "^9",
    "eslint-config-next": "^15"
  }
}
```

---

## 4. Luồng dữ liệu

### 4.1 Luồng seed (deterministic)

1. Xoá dữ liệu cũ theo thứ tự con → cha (`evidence` → `activity` → `reflection` → `planItem` → `card` → `review` → `skill`).
2. Tạo `UserProfile` (mặc định).
3. Tạo cây kỹ năng Java **53 node** theo thứ tự tầng 1 → 2 → 3, với `id` cố định theo slug
   (`"skill-java-core"`, `"skill-jvm-gc"`, …) — **không** dùng `cuid()` ⇒ `db:reset` cho kết quả giống hệt.
4. Tạo 140 thẻ (70 zh + 70 en) với `id` cố định (`"card-zh-greet-01"`…) và `due = ngày cố định`
   — **không** dùng `Date.now()`.
5. `cardState` khởi tạo bằng `fsrs` với `now = 0` cố định.

```ts
// prisma/seed.ts — trích xuất
const SEED_NOW = new Date(2026, 0, 1);   // mốc cố định, KHÔNG dùng new Date()

async function main() {
  // 1. xoá theo thứ tự con trước cha
  await prisma.evidence.deleteMany();
  await prisma.review.deleteMany();
  await prisma.reflection.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.planItem.deleteMany();
  await prisma.card.deleteMany();
  await prisma.skill.deleteMany();

  // 2. profile
  await prisma.userProfile.create({
    data: { name: "DevMode", aiTone: "direct", learningLangs: "en,zh", zhLevel: "zero", enLevel: "A1" },
  });

  // 3. cây kỹ năng Java — id cố định
  for (const node of SKILL_TREE) {
    await prisma.skill.create({
      data: {
        id: node.id,                    // slug cố định
        name: node.name,
        domain: node.domain,
        parentId: node.parentId,        // null ở tầng 1
        level: 0,
        targetLevel: node.targetLevel ?? 3,
        position: node.position,
      },
    });
  }

  // 4. 140 thẻ — due cố định
  for (const card of CARDS) {
    await prisma.card.create({
      data: {
        id: card.id,
        lang: card.lang,
        front: card.front,
        frontAlt: card.frontAlt ?? null,
        back: card.back,
        example: card.example ?? null,
        group: card.group,
        mode: "recognize",
        cardState: newCardState(card.id, SEED_NOW),
        due: SEED_NOW,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
      },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
```

### 4.2 Truy vấn kiểm tra

```ts
// Đếm node cây kỹ năng theo tầng
const counts = await prisma.skill.groupBy({ by: ["parentId"], _count: { _all: true } });
// tầng 1 = parentId === null; tầng 2/3 = theo parentId

// Đếm thẻ theo lang
await prisma.card.groupBy({ by: ["lang"], _count: { _all: true } });
// kỳ vọng: en = 60, zh = 60
```

---

## 5. Xử lý lỗi

| Tình huống | Phát hiện | Xử lý | Thông báo người dùng |
|---|---|---|---|
| Thiếu `DATABASE_URL` | `env.ts` lúc import | Throw lỗi có hướng dẫn cụ thể | "Thiếu DATABASE_URL. Copy .env.example → .env.local rồi chạy `npm run db:migrate`" |
| DB chưa migrate | Prisma error `table does not exist` | Bắt trong `page.tsx`, hiện banner thay vì crash | "Chưa có bảng. Chạy `npm run db:migrate && npm run db:seed`" |
| Thiếu `ANTHROPIC_API_KEY` | `env.anthropicApiKey === null` | Offline mode — **không** throw | Banner nhỏ "Đang chạy offline mode" |
| `DATABASE_URL` sai path | Prisma error code `P1003` | Log lỗi rõ ràng ở server | "Không kết nối được DB — kiểm tra DATABASE_URL" |
| Font tải lỗi lúc build | `next/font` build error | Build fail rõ ràng (tốt hơn là font fallback im lặng) | — |
| `next build` lỗi type | TypeScript | Build fail — không deploy được | — |
| Playwright chưa cài browser | `playwright install` chưa chạy | Script `pretest:e2e` chạy `playwright install --with-deps` | "Chạy `npx playwright install chromium`" |
| Port 3000 đã dùng | Next tự chọn port khác | Next tự xử lý, in ra URL | — |

---

## 6. Chiến lược kiểm thử

| Tầng | Công cụ | Phạm vi |
|---|---|---|
| Unit | Vitest | `normalizeDate` (biên nửa đêm UTC+7) · `toDateKey` · `addDays` · `api-response` status mapping · `env.maskKey` |
| Unit | Vitest | `skills.ts` cây Java: đúng 53 node, đúng 4 domain, mọi node tầng 3 có `parentId` |
| Unit | Vitest | `cards.ts`: đúng 70 zh + 70 en, không trùng `id`, `group` đúng band |
| Integration | Vitest + SQLite test | `db:seed` chạy 2 lần → DB giống hệt (NFR-AF-07) |
| Integration | Vitest | `prisma migrate reset` tạo đủ 15 bảng |
| E2E | Playwright | Trang chủ render, có bottom nav 4 mục, menu `⋮` có 5 mục |
| E2E | Playwright | 390px: không scrollbar ngang; 1280px: container 12 cột |
| E2E | Playwright | Thiếu API key → banner offline, không lỗi console |
| A11y | axe | 0 lỗi critical/serious; icon-only có `aria-label`; `lang="vi"` |
| Token | Vitest + computed style | `body` background = `#0f131c`; font family đúng 3 font |
| CI | GitHub Actions | lint + typecheck + test + build + `validate:specs` |

---

## 7. Rủi ro & đánh đổi kỹ thuật

| # | Rủi ro | Tác động | Giảm thiểu |
|---|---|---|---|
| T1 | Tailwind v4: token đặt sai tên → class không sinh ra, CSS im lặng không style | Cao — mất toàn bộ design system | Unit test đọc `globals.css` và assert **mọi** token trong `design-system.md` §2–§6 đều có mặt; test computed style của `body` |
| T2 | `next/font` cần mạng lúc build → CI fail khi offline | Trung bình | CI có bước cache font; hoặc dùng `next/font/local` với file đã tải sẵn trong repo |
| T3 | `subsets` thiếu `vietnamese` → mất dấu tiếng Việt | Cao — phá vỡ toàn bộ UI | Bắt buộc trong code review; test render chuỗi "Tiếng Việt có dấu đủ" và assert glyph không rỗng |
| T4 | `toISOString()` lọt vào code → lệch ngày ở UTC+7 | Cao — sai số liệu tuần/tháng | Unit test `normalizeDate` với 2 mốc cùng ngày khác giờ; lint rule cấm `toISOString` trong `src/lib/dates.ts` |
| T5 | Seed dùng `cuid()` / `Date.now()` → `db:reset` cho DB khác nhau | Trung bình | ID cố định theo slug; `SEED_NOW` hằng số; test chạy seed 2 lần rồi so hash |
| T6 | `next/font` chỉ tải ở build → dev chạy lần đầu chậm | Thấp | Chấp nhận |
| T7 | Bottom nav che nội dung ở màn hình ngắn | Trung bình | `pb-24` trên `<main>`; kiểm tra ở 390×667 (iPhone SE) |
| T8 | Icon từ CDN → app hiển thị thiếu icon khi offline | Thấp | Chấp nhận (icon, không phải dữ liệu); fallback `aria-label` đủ cho a11y |
| T9 | ESLint 9 + `eslint-config-next` cấu hình khác Next 15 | Thấp | Dùng `eslint.config.mjs` (flat config) theo mẫu Next 15 |
| T10 | Playwright tải browser ~150MB | Thấp | `pretest:e2e` script tự cài; cache trong CI |
