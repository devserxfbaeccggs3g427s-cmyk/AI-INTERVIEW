# Design — Cài đặt & Quản lý chi phí AI (S15)

> Feature: `settings-cost` · Màn hình: S15 · Route: `/settings` · Phase: 0
> Nguồn: `.kiro/specs/settings-cost/spec.md`, `system-design/SPEC.md` §2.5/§2.7/§4/§5/§6, `.kiro/steering/tech.md`

## 1. Tổng quan kiến trúc

S15 là **màn hình server-rendered + 1 Client Component điều khiển tab**. Toàn bộ số liệu (hồ sơ, tổng hợp `AiCall`, dung lượng DB) được đọc ở server bằng Prisma và truyền xuống client dưới dạng props đã serialize; phần tương tác (lưu hồ sơ, lưu/xoá/ping key, phân trang bảng log, xoá dữ liệu 2 bước, export) đi qua các API route riêng. Ba quyết định cốt lõi:

1. **Key chỉ tồn tại ở server.** API `GET /api/settings/key` chỉ trả về chuỗi mask; `.env.local` chỉ được đọc/ghi bằng module `src/lib/env-file.ts` với `chmod 600` và ghi atomically.
2. **Chi phí là số đo, không phải số ước lượng tay.** `estimatedCost` được tính **một lần** tại thời điểm gọi API, trong wrapper `src/lib/anthropic.ts`, và lưu vào `AiCall.estimatedCost`. S15 chỉ **tổng hợp** — không tính lại ở UI, để tổng trên UI luôn khớp với bảng log.
3. **Tổng hợp bằng SQL, không kéo bảng về JS.** `AiCall` có thể vượt 100k dòng; mọi số liệu tổng hợp đều `GROUP BY` ngay trong SQLite.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Browser                                                                    │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  SettingsPage (Server Component, src/app/settings/page.tsx)          │  │
│  │   ├─ <ProfileSection/>   props: profile                             │  │
│  │   ├─ <ApiKeySection/>    props: keyStatus                            │  │
│  │   ├─ <CostSection/>      props: costs, calls, budget                 │  │
│  │   ├─ <DataGovernance/>   props: dbStats, privacyLog                  │  │
│  │   └─ <SettingsTabs/> (Client) — chỉ giữ state tab đang mở           │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
             │ fetch()  (JSON)                    ▲ props
             ▼                                   │
┌─────────────────────────────────────────────────────────────────────────────┐
│  Next.js Route Handlers (src/app/api/...)                                  │
│  settings/profile · settings/key · settings/key/test                        │
│  ai/costs · ai/calls · data/export · data · data/privacy-log · data/stats   │
└─────────────────────────────────────────────────────────────────────────────┘
        │                          │                            │
        ▼                          ▼                            ▼
┌───────────────┐   ┌─────────────────────────┐   ┌──────────────────────────┐
│ src/lib/db.ts │   │ src/lib/env-file.ts     │   │ src/lib/costs.ts         │
│ Prisma client │   │ đọc/ghi .env.local     │   │ MODEL_PRICING +          │
│ (singleton)   │   │ chmod 600, atomic write │   │ estimateCost()           │
└───────────────┘   └─────────────────────────┘   └──────────────────────────┘
        │
        ▼
   SQLite (prisma/dev.db)   ← AiCall, UserProfile, Activity, …
```

## 2. Kiến trúc

### 2.1 Sơ đồ luồng

**Luồng A — đọc hồ sơ & chi phí (render, không mutation):**

```
GET /settings
   │
   ├─ getProfile()            ──────────► UserProfile (upsert "default" nếu chưa có)
   ├─ getKeyStatus()          ──────────► env-file.readEnvLocal()  → chỉ trả masked
   ├─ getCostSummary({from,to})────────► AiCall groupBy feature + raw SQL groupBy day
   ├─ listAiCalls({page,size})─────────► AiCall findMany (25 dòng)
   ├─ getDbStats()            ──────────► fs.stat(dev.db) + count() từng bảng
   └─ listPrivacyLog({page})  ──────────► AiCall where dataKinds != "[]"
   │
   └─► Server Component render (1 lần) ─► Client Component nhận props
```

**Luồng B — lưu khóa API (mutation nhạy cảm):**

```
Client: input[type=password] ──POST──► PUT /api/settings/key
                                        │
                    ┌───────────────────┴───────────────────┐
                    │ 1. validate Zod (sk-ant-…, ≥ 10 ký tự)│
                    │ 2. envFile.upsertEnvVar("ANTHROPIC_API_KEY", key)│
                    │      └─ đọc file → thay dòng → ghi file.tmp → rename → chmod 600
                    │ 3. process.env.ANTHROPIC_API_KEY = key  (hiệu lực ngay trong process)
                    │ 4. KHÔNG log giá trị key; chỉ log mask
                    └───────────────────┬───────────────────┘
                                        ▼
                              { ok, masked, requiresRestart: true }
                                        │
                    Client hiện banner "khởi động lại dev server"
```

**Luồng C — ping kết nối (1 call AI thật):**

```
Client: bấm "Chạy kiểm tra Ping"
   └─POST──► POST /api/settings/key/test
                │
                ├─ đọc key từ process.env (KHÔNG đọc client)
                ├─ nếu thiếu → KEY_NOT_CONFIGURED
                ├─ anthropic.messages.create({ model: haiku, max_tokens: 1, ... })
                ├─ wrapper log 1 AiCall { feature: "key_test" }
                └─ map lỗi: 401→KEY_INVALID · 429→RATE_LIMITED · network→API_UNREACHABLE
```

**Luồng D — xoá trắng dữ liệu (2 bước):**

```
Bước 1: bấm "Xóa trắng dữ liệu" ─► mở hộp thoại (chưa gọi API)
Bước 2: gõ "XOA" ─► DELETE /api/data { confirm: "XOA" }
                ├─ zod: confirm phải === "XOA"  → nếu không: CONFIRMATION_REQUIRED
                └─ prisma.$transaction(async tx => { deleteMany từng bảng })
                     ├─ lỗi → rollback → DELETE_FAILED (dữ liệu nguyên vẹn)
                     └─ ok → trả số bản ghi đã xoá + size trước/sau
```

### 2.2 Phân tầng

| Tầng | Module | Trách nhiệm |
|---|---|---|
| Route / page | `src/app/settings/page.tsx` | Server Component: đọc dữ liệu, render 4 section, truyền props. Không chứa logic nghiệp vụ. |
| Client UI | `src/components/settings/*.tsx` | State tab, form, bảng, phân trang, hộp thoại xoá. Gọi API qua `fetch`. |
| API | `src/app/api/settings/*/route.ts`, `src/app/api/ai/*/route.ts`, `src/app/api/data/*/route.ts` | Validate Zod → gọi service → map lỗi → `{ ok, data }` / `{ ok:false, error }`. |
| Service | `src/lib/costs.ts`, `src/lib/env-file.ts`, `src/lib/profile.ts`, `src/lib/data-admin.ts` | Logic thuần, **không** phụ thuộc React. Test được bằng Vitest không cần DOM. |
| Data | `src/lib/db.ts` (Prisma singleton), `prisma/schema.prisma` | Truy vấn, transaction, aggregate. |
| Vendor | `src/lib/anthropic.ts` | Client SDK + wrapper ghi `AiCall` (đã có từ feature AI-01; S15 chỉ thêm `feature: "key_test"`). |

### 2.3 Quyết định thiết kế

| # | Quyết định | Lý do | Hệ quả |
|---|---|---|---|
| 1 | `estimatedCost` tính lúc gọi API, lưu vào `AiCall.estimatedCost`; UI **chỉ tổng hợp** | Tổng trên UI luôn khớp bảng log; giá đổi sau này không làm lịch sử bị "viết lại" | Cần đóng băng giá trong `MODEL_PRICING`; muốn giá mới → migration tính lại hoặc để lịch sử mang giá cũ |
| 2 | Key lưu bằng **plain text trong `.env.local`** (không mã hoá) | Next.js đọc `.env.local` tự động; mã hoá tự thân sẽ phải tự giải mã ở mọi nơi → thêm bề mặt lỗi | Phải bù bằng `chmod 600`, `.gitignore`, không log, không trả key về client |
| 3 | Ghi file **atomically** (file tạm → `rename`) thay vì ghi đè | Tránh `.env.local` hỏng giữa chừng nếu server crash khi đang ghi | Cần 1 `randomUUID()` cho tên file tạm; phải dọn file tạm khi throw |
| 4 | Ghi cả `process.env` trong tiến trình sau khi sửa file | `process.env` đã nạp lúc boot → sửa file không tự có hiệu lực; nếu chỉ dựa vào file thì request kế tiếp vẫn dùng key cũ | Vẫn phải báo "khởi động lại server" vì `next dev` có thể spawn worker khác không kế thừa env đã sửa |
| 5 | Tổng hợp `AiCall` bằng `GROUP BY` ở SQLite, không kéo bảng về JS | Bảng có thể > 100k dòng; kéo về JS sẽ làm S15 nặng | Dùng `$queryRaw` cho bucket theo ngày (`strftime`), `groupBy` cho bucket theo feature |
| 6 | Phân trang server-side (25 dòng/trang) | Bảng log không giới hạn | Cần state `page` ở client + `?page=` trong query string |
| 7 | Xoá dữ liệu = **1 transaction `deleteMany` theo thứ tự** | Tránh trạng thái nửa vời (đã xoá `Activity` nhưng còn `Evidence`) | Phải xoá theo thứ tự phụ thuộc: con trước, cha sau |
| 8 | Export JSON **stream** bằng `ReadableStream`, không `JSON.stringify` toàn bộ | File có thể vài chục MB; `stringify` toàn bộ giữ 2 bản trong RAM | Body phải là `ReadableStream`, `Content-Disposition` set thủ công |
| 9 | Log privacy dùng **cùng bảng `AiCall`** với 2 field mới (`dataKinds`, `dataPreview`) | Không thêm bảng thứ 2 ở Phase 0; `AiCall` là nhật ký AI duy nhất | Cần migration thêm 2 cột nullable — không phá dữ liệu cũ |
| 10 | `dataKinds`/`dataPreview` ghi **cùng lúc** gọi API trong wrapper | Nếu ghi sau, có thể quên → log sai → mất niềm tin vào tính minh bạch | Wrapper `anthropic.ts` nhận `dataKinds`/`dataPreview` qua options bắt buộc |
| 11 | Ping key dùng `claude-haiku-4-5`, `max_tokens: 1`, **không** kỳ vọng cache | Ping là kiểm tra *xác thực*, không phải kiểm tra cache; system prompt ngắn (< ngưỡng cache) → `cache_read = 0` là **bình thường**, không phải lỗi | Tài liệu phải nói rõ để kỹ sưng không tưởng cache hỏng |
| 12 | 4 tab dùng **client state**, không phải route con | SPEC §3.1 chỉ có 1 route S15; tránh nhân bản layout header | Mất trạng thái tab khi F5 → chấp nhận được ở Phase 0; có thể nâng lên `?tab=` sau |

## 3. Thành phần

### 3.1 `SettingsPage` (Server Component)

**Route/đường dẫn:** `src/app/settings/page.tsx`

**Responsibilities:**
- Đọc song song 6 nguồn dữ liệu (`getProfile`, `getKeyStatus`, `getCostSummary`, `listAiCalls`, `getDbStats`, `listPrivacyLog`).
- Chọn section hiển thị theo `searchParams.tab` (mặc định `"profile"`).
- Không chứa state, không `useEffect`.

```ts
// src/app/settings/page.tsx
import type { Metadata } from "next";
import { getProfile } from "@/lib/profile";
import { getKeyStatus } from "@/lib/env-file";
import { getCostSummary, listAiCalls } from "@/lib/costs";
import { getDbStats } from "@/lib/data-admin";
import { listPrivacyLog } from "@/lib/privacy";

export const metadata: Metadata = { title: "Cài đặt & Chi phí AI" };
export const dynamic = "force-dynamic"; // dữ liệu chi phí thay đổi theo phút

export type SettingsTab = "profile" | "key" | "cost" | "data";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const active: SettingsTab = isSettingsTab(tab) ? tab : "profile";

  const [profile, keyStatus, calls, dbStats, privacy] = await Promise.all([
    getProfile(),
    getKeyStatus(),
    listAiCalls({ page: 1, pageSize: 25 }),
    getDbStats(),
    listPrivacyLog({ page: 1, pageSize: 20 }),
  ]);
  const costs = await getCostSummary(
    { from: daysAgo(30), to: today() },
    profile.monthlyBudgetUsd
  );

  return (
    <main className="w-full max-w-[1520px] mx-auto px-margin-lg py-gutter-lg space-y-gutter-lg">
      <SettingsHeader dbStats={dbStats} hasKey={keyStatus.configured} />
      <OfflineBanner hasKey={keyStatus.configured} />
      <SettingsTabs active={active} />
      {active === "profile" && <ProfileSection profile={profile} />}
      {active === "key" && <ApiKeySection keyStatus={keyStatus} />}
      {active === "cost" && (
        <CostSection
          totals={costs.totals}
          byFeature={costs.byFeature}
          byDay={costs.byDay}
          budget={costs.totals.budget}
          initialCalls={calls}
        />
      )}
      {active === "data" && (
        <DataGovernance dbStats={dbStats} privacy={privacy} />
      )}
    </main>
  );
}
```

**Dependencies:** `src/lib/profile.ts`, `src/lib/env-file.ts`, `src/lib/costs.ts`, `src/lib/data-admin.ts`, `src/lib/privacy.ts`, `src/lib/dates.ts`.
**Edge cases:** DB rỗng (mọi query trả mảng rỗng, `totals` = 0); `.env.local` không tồn tại (trả `configured:false`); `AiCall` có dòng `dataKinds = "[]"` (privacy log bỏ qua).

---

### 3.2 `SettingsTabs` (Client Component)

**Route/đường dẫn:** `src/components/settings/settings-tabs.tsx`

**Responsibilities:**
- Giữ state tab hiện tại; đổi tab bằng `router.push('?tab=…')` (giữ URL share được, tương thích §2.3 #12).
- Render 4 nút + badge "TỐI ƯU" trên tab Chi phí.

```ts
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { SettingsTab } from "@/app/settings/page";

export type SettingsTabsProps = {
  active: SettingsTab;
  counts: { aiCalls: number; privacyEntries: number };
};

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: "profile", label: "Hồ sơ & Mục tiêu", icon: "badge" },
  { id: "key", label: "Khóa API Anthropic & Kết nối", icon: "key" },
  { id: "cost", label: "Chi Phí AI & Prompt Caching", icon: "insights" },
  { id: "data", label: "Quản trị dữ liệu (Backup / Export JSON)", icon: "database" },
];

export function SettingsTabs({ active }: SettingsTabsProps): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <nav
      role="tablist"
      aria-label="Nhóm cài đặt"
      className="mt-gutter-md pt-space-md flex flex-wrap items-center gap-space-xs font-label-md text-label-md"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("tab", tab.id);
              router.push(`?${params.toString()}`);
            }}
            className={
              isActive
                ? "px-4 py-2 rounded bg-primary/10 text-primary font-semibold flex items-center gap-2 shadow-inner"
                : "px-4 py-2 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors flex items-center gap-1.5"
            }
          >
            <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
            {tab.label}
            {tab.id === "cost" && (
              <span className="px-1.5 py-0.2 rounded bg-primary text-on-primary font-label-sm text-[10px]">
                TỐI ƯU
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
```

**Dependencies:** `next/navigation`.
**Edge cases:** `searchParams` rỗng → mặc định `profile`; tab không hợp lệ trong URL → server fallback về `profile`.

---

### 3.3 `ProfileSection` (Client Component)

**Route/đường dẫn:** `src/components/settings/profile-section.tsx`

**Responsibilities:**
- Form hồ sơ: tên, mục tiêu dài hạn, giọng văn AI, ngôn ngữ đang học + mức, ngôn ngữ phỏng vấn, ngân sách tháng, chế độ tiết kiệm.
- Validate phía client (nhẹ) + server (Zod, quyết định).
- Không mất dữ liệu đang gõ khi chuyển tab (giữ state ở component cha hoặc `useState` cục bộ không unmount — dùng `keepMounted` cho 4 section).

```ts
"use client";

import { useState } from "react";

export type ProfileDto = {
  name: string | null;
  goals: string | null;
  aiTone: "direct" | "coach" | "gentle";
  learningLangs: ("en" | "zh" | "vi")[];
  zhLevel: LanguageLevel;
  enLevel: LanguageLevel;
  viLevel: LanguageLevel;                    // C29 — bản ngữ, mặc định "B2"
  languageStandard: LanguageStandard;        // C32 — Q7
  interviewLang: "en" | "vi" | "zh";        // Q2 — chọn theo chế độ
  monthlyBudgetUsd: number;
  saverMode: boolean;
  upcomingGoals: UpcomingGoalDto[];         // M11 — Q8
};

export type UpcomingGoalDto = {
  id: string;
  kind: "exam" | "cert" | "role" | "skill";
  title: string;
  lang: "en" | "zh" | "vi" | null;
  standard: "cefr" | "hsk" | "vendor" | null;
  targetLevel: LanguageLevel | null;
  targetDate: string | null;                // ISO date, null = chưa chốt
  status: "active" | "achieved" | "paused";
  priority: number;                         // 1 = cao nhất
  notes: string | null;
};

// Thang CEFR đầy đủ — nguồn chân lý: .kiro/steering/user-profile-decisions.md §4.1
export type LanguageLevel = "zero" | "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export const LANGUAGE_LEVELS: {
  value: LanguageLevel; label: string; cefr: string; hsk: string | null;
}[] = [
  { value: "zero", label: "Chưa biết",           cefr: "—",  hsk: "HSK 0" },
  { value: "A1",   label: "Sơ cấp",              cefr: "A1", hsk: "HSK 1" },
  { value: "A2",   label: "Cơ bản",              cefr: "A2", hsk: "HSK 2" },
  { value: "B1",   label: "Trung cấp",           cefr: "B1", hsk: "HSK 3" },
  { value: "B2",   label: "Trung cấp cao",       cefr: "B2", hsk: "HSK 4" },
  { value: "C1",   label: "Cao cấp",             cefr: "C1", hsk: "HSK 5" },
  { value: "C2",   label: "Cao cấp (thành thạo)", cefr: "C2", hsk: "HSK 6" },
];

/** Chuẩn hiển thị ưu tiên — Q7 · C32 */
export type LanguageStandard = "cefr" | "hsk" | "both";

export type ProfileSectionProps = {
  profile: ProfileDto;
  onSaved?: (p: ProfileDto) => void;
};

export function ProfileSection({ profile }: ProfileSectionProps): React.ReactElement {
  const [form, setForm] = useState<ProfileDto>(profile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const atLeastOneLang = form.learningLangs.length > 0;

  async function handleSave(): Promise<void> {
    if (!atLeastOneLang) {
      setError("Phải bật ít nhất một ngôn ngữ đang học.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/settings/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = (await res.json()) as
      | { ok: true; data: { profile: ProfileDto } }
      | { ok: false; error: { code: string; message: string } };
    setSaving(false);
    if (!json.ok) setError(json.error.message);
  }

  return (
    <section aria-label="Hồ sơ và mục tiêu" className="rounded-xl bg-surface-container-low p-gutter-lg shadow-sm">
      {/* ... các field theo bảng thành phần trong spec.md §6.2 ... */}
    </section>
  );
}
```

**Dependencies:** `/api/settings/profile`.
**Edge cases:** `learningLangs` rỗng → chặn ở client **và** server; mức không hợp lệ từ DB → API map về `zero`; `goals` > 2000 ký tự → server trả `INVALID_INPUT`, hiển thị lỗi dưới textarea.

---

### 3.4 `ApiKeySection` (Client Component)

**Route/đường dẫn:** `src/components/settings/api-key-section.tsx`

**Responsibilities:**
- Hiển thị key dạng che; nút mắt chỉ bật/tắt 4 ký tự cuối (client chỉ có mask — không bao giờ có key đầy đủ).
- Nhập key mới (chỉ khi bấm "Đổi khóa API"), lưu, hiện cảnh báo restart.
- Ping: `POST /api/settings/key/test`, hiện 6 trạng thái (§6.3 của spec).

```ts
"use client";

import { useState } from "react";

export type KeyStatus = {
  configured: boolean;
  masked: string | null;          // "sk-ant-…abcd" — KHÔNG bao giờ chứa key đầy đủ
  source: ".env.local" | "process.env" | null;
  lastCheckedAt: string | null;
  lastLatencyMs: number | null;
  requiresRestart: boolean;
};

export type PingState =
  | { kind: "idle" }
  | { kind: "pinging" }
  | { kind: "ok"; latencyMs: number; checkedAt: string }
  | { kind: "invalid" }
  | { kind: "rate_limited"; retryAfterSec: number }
  | { kind: "unreachable" }
  | { kind: "not_configured" }
  | { kind: "error"; message: string };

export type ApiKeySectionProps = {
  keyStatus: KeyStatus;
  saverMode: boolean;
  onSaverModeChange: (next: boolean) => void;
};

export function ApiKeySection({
  keyStatus,
  saverMode,
  onSaverModeChange,
}: ApiKeySectionProps): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [revealTail, setRevealTail] = useState(false);
  const [ping, setPing] = useState<PingState>({ kind: "idle" });

  async function handleSaveKey(): Promise<void> {
    const res = await fetch("/api/settings/key", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: draft }),
    });
    const json = (await res.json()) as
      | { ok: true; data: { masked: string; requiresRestart: boolean } }
      | { ok: false; error: { code: string; message: string } };
    if (json.ok) {
      setEditing(false);
      setDraft("");
      setPing({ kind: "idle" });
    }
  }

  async function handlePing(): Promise<void> {
    setPing({ kind: "pinging" });
    const res = await fetch("/api/settings/key/test", { method: "POST" });
    const json = (await res.json()) as
      | { ok: true; data: { status: "ok"; latencyMs: number; checkedAt: string } }
      | { ok: false; error: { code: string; message: string; retryAfterSec?: number } };

    if (json.ok) {
      setPing({ kind: "ok", latencyMs: json.data.latencyMs, checkedAt: json.data.checkedAt });
      return;
    }
    switch (json.error.code) {
      case "KEY_NOT_CONFIGURED":
        setPing({ kind: "not_configured" }); break;
      case "KEY_INVALID":
        setPing({ kind: "invalid" }); break;
      case "RATE_LIMITED":
        setPing({ kind: "rate_limited", retryAfterSec: json.error.retryAfterSec ?? 30 }); break;
      case "API_UNREACHABLE":
        setPing({ kind: "unreachable" }); break;
      default:
        setPing({ kind: "error", message: json.error.message });
    }
  }

  return (
    <section aria-label="Cấu hình khóa API" className="rounded-xl bg-surface-container-low p-gutter-lg shadow-sm">
      {/* input readonly dạng che / input nhập khi editing */}
      {/* nút Ping: disabled={ping.kind === "pinging" || !keyStatus.configured} */}
      {/* toggle saver mode */}
    </section>
  );
}
```

**Dependencies:** `/api/settings/key`, `/api/settings/key/test`.
**Edge cases:** Ping khi chưa có key → nút disabled; double-click → disabled trong lúc `pinging`; 429 → hiện countdown; lỗi mạng → phân biệt rõ với 401.

---

### 3.5 `CostSection` (Client Component)

**Route/đường dẫn:** `src/components/settings/cost-section.tsx`

**Responsibilities:**
- Bento 3 ô (ngân sách · cache hit rate · tổng lượt gọi).
- Thanh phân bổ chi phí theo tính năng + danh sách chi tiết.
- Bảng nhật ký `AiCall` + phân trang + nút xuất CSV.
- Bộ lọc khoảng thời gian (7/30/90 ngày / tùy chọn) → gọi lại `/api/ai/costs`.

```ts
"use client";

import { useCallback, useState } from "react";

export type CostTotals = {
  calls: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  cacheHitRate: number;          // 0..1
};

export type CostByFeature = {
  feature: string;
  label: string;
  model: string;
  runs: number;
  cost: number;
  share: number;                 // 0..1
};

export type CostByDay = {
  day: string;                   // "yyyy-MM-dd" (giờ local)
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
};

export type CostSectionProps = {
  totals: CostTotals;
  byFeature: CostByFeature[];
  byDay: CostByDay[];
  budget: { limitUsd: number; usedUsd: number; ratio: number; level: "ok" | "warn" | "over" };
  /** Trang 1 của nhật ký AiCall — component tự tải trang tiếp theo qua /api/ai/calls. */
  initialCalls: {
    rows: AiCallRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
};
```

**Dependencies:** `/api/ai/costs`, `/api/ai/calls?format=csv`.
**Edge cases:** `totals.calls === 0` → empty state có CTA; `cacheHitRate === 0` ở ≥ 2 feature → cảnh báo cache; `share` làm tròn có thể không cộng đúng 100% → hiển thị từ giá trị gốc, chỉ làm tròn khi render.

---

### 3.6 `AiCallTable` (Client Component)

**Route/đường dẫn:** `src/components/settings/ai-call-table.tsx`

```ts
"use client";

export type AiCallRow = {
  id: string;
  createdAt: string;            // ISO
  feature: string;
  model: string;
  inputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  outputTokens: number;
  estimatedCost: number;
  ok: boolean;
  error: string | null;
};

export type AiCallTableProps = {
  rows: AiCallRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export function AiCallTable({
  rows, total, page, pageSize, totalPages, onPageChange,
}: AiCallTableProps): React.ReactElement {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="rounded-xl bg-surface-container-low p-gutter-lg shadow-sm space-y-gutter">
      <div className="overflow-x-auto rounded-lg bg-surface-container-lowest">
        <table className="w-full text-left font-body-sm text-body-sm">
          <thead className="bg-surface-container text-outline font-label-sm text-label-sm uppercase tracking-wider">
            <tr>
              <th className="py-3 px-space-md">Thời gian</th>
              <th className="py-3 px-space-md">Tính năng</th>
              <th className="py-3 px-space-md">Mô hình</th>
              <th className="py-3 px-space-md text-right">Input Token</th>
              <th className="py-3 px-space-md text-right">Cache Read</th>
              <th className="py-3 px-space-md text-right">Output Token</th>
              <th className="py-3 px-space-md text-right">Chi phí (USD)</th>
              <th className="py-3 px-space-md text-center">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10 text-on-surface font-code-md text-code-md tabular-nums">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-surface-container/60 transition-colors">
                <td className="py-3.5 px-space-md text-on-surface-variant">{formatTime(r.createdAt)}</td>
                <td className="py-3.5 px-space-md"><FeatureChip feature={r.feature} /></td>
                <td className="py-3.5 px-space-md">{r.model}</td>
                <td className="py-3.5 px-space-md text-right">{r.inputTokens.toLocaleString("vi-VN")}</td>
                <td className="py-3.5 px-space-md text-right text-primary font-semibold">
                  {r.cacheRead.toLocaleString("vi-VN")}{r.cacheRead > 0 ? " (Hit)" : ""}
                </td>
                <td className="py-3.5 px-space-md text-right">{r.outputTokens.toLocaleString("vi-VN")}</td>
                <td className="py-3.5 px-space-md text-right font-semibold">
                  ${r.estimatedCost.toFixed(4)}
                </td>
                <td className="py-3.5 px-space-md text-center">
                  <StatusChip ok={r.ok} error={r.error} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant pt-space-xs">
        <span>Hiển thị {from}–{to} trong tổng số {total} bản ghi</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="px-2.5 py-1 rounded bg-surface-container text-outline hover:text-on-surface disabled:opacity-40"
          >
            Trang trước
          </button>
          <span className="px-2.5 py-1 rounded bg-surface-container-high text-on-surface">
            Trang {page}/{Math.max(totalPages, 1)}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="px-2.5 py-1 rounded bg-surface-container text-outline hover:text-on-surface disabled:opacity-40"
          >
            Trang kế
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Dependencies:** `/api/ai/calls` (phân trang), `/api/ai/calls?format=csv` (tải).
**Edge cases:** `rows = []` → empty state có CTA về S01; `totalPages = 0` → hiện "Trang 1/1" và disable cả 2 nút; `ok = false` → chip lỗi + `title={error}`.

---

### 3.7 `DataGovernance` (Client Component)

**Route/đường dẫn:** `src/components/settings/data-governance.tsx`

**Responsibilities:**
- Nút export JSON (tải file trực tiếp từ `GET /api/data/export`).
- Hộp thoại xoá 2 bước (bước 1 mở hộp thoại; bước 2 gõ `XOA`).
- Danh sách "dữ liệu đã gửi lên API" (FR-PS-07).

```ts
"use client";

import { useState } from "react";

export type DbStats = {
  dbSizeBytes: number;
  dbPath: string;
  recordCounts: Record<string, number>;
};

export type PrivacyRow = {
  id: string;
  createdAt: string;
  feature: string;
  model: string;
  dataKinds: string[];
  dataPreview: string | null;
  inputTokens: number;
};

export type DataGovernanceProps = {
  dbStats: DbStats;
  privacy: { rows: PrivacyRow[]; total: number; page: number; pageSize: number; totalPages: number };
};

export function DataGovernance({ dbStats, privacy }: DataGovernanceProps): React.ReactElement {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canDelete = confirmText.trim() === "XOA";

  async function handleDelete(): Promise<void> {
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch("/api/data", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "XOA" }),
    });
    const json = (await res.json()) as
      | { ok: true; data: { deleted: Record<string, number> } }
      | { ok: false; error: { code: string; message: string } };
    setDeleting(false);
    if (!json.ok) {
      setDeleteError(json.error.message);
      return;
    }
    setConfirmOpen(false);
    setConfirmText("");
    window.location.reload();
  }

  return (
    <section aria-label="Quản trị dữ liệu" className="grid grid-cols-1 xl:grid-cols-2 gap-gutter-lg">
      {/* Card: Backup & Sao Lưu Hệ Thống — nút export + danger zone */}
      {/* Card: Minh bạch dữ liệu đã gửi lên API */}
      {/* ConfirmDialog: confirmText, canDelete, onConfirm={handleDelete} */}
    </section>
  );
}
```

**Dependencies:** `/api/data/export`, `DELETE /api/data`, `/api/data/privacy-log`.
**Edge cases:** export lỗi → toast lỗi, không tải file rỗng; xoá lỗi → giữ hộp thoại mở, hiện lỗi, dữ liệu nguyên vẹn; bấm Esc → huỷ bước 1, focus trả về nút mở.

---

### 3.8 `src/lib/env-file.ts` — đọc/ghi `.env.local` an toàn

**Route/đường dẫn:** `src/lib/env-file.ts`

**Responsibilities:**
- Đọc/ghi `.env.local` (không ghi đè `.env`).
- `chmod 600` sau mỗi lần ghi.
- Ghi **atomically**: file tạm → `rename`.
- Không bao giờ log giá trị key; chỉ log dạng mask.

```ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ENV_LOCAL = ".env.local";
const KEY_VAR = "ANTHROPIC_API_KEY";

export type KeyStatus = {
  configured: boolean;
  masked: string | null;
  source: ".env.local" | "process.env" | null;
  lastCheckedAt: string | null;
  lastLatencyMs: number | null;
  requiresRestart: boolean;
};

export function maskKey(key: string | undefined | null): string | null {
  if (!key) return null;
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 7)}••••••••••••${key.slice(-4)}`;
}

function envLocalPath(root = process.cwd()): string {
  return path.join(root, ENV_LOCAL);
}

/** Đọc file .env.local → mảng cặp [key, value] giữ nguyên thứ tự và comment. */
export async function readEnvLocal(
  root = process.cwd()
): Promise<{ path: string; lines: string[] }> {
  const filePath = envLocalPath(root);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { path: filePath, lines: [] };
    }
    throw err;
  }
  return { path: filePath, lines: raw.split(/\r?\n/) };
}

/** Ghi file .env.local: thay/append đúng 1 biến, giữ nguyên các dòng khác. */
export async function upsertEnvVar(
  name: string,
  value: string,
  root = process.cwd()
): Promise<{ path: string; created: boolean }> {
  const filePath = envLocalPath(root);
  const { lines } = await readEnvLocal(root);
  const prefix = `${name}=`;
  const idx = lines.findIndex((l) => l.trimStart().startsWith(prefix));

  const next = [...lines];
  if (idx >= 0) next[idx] = `${prefix}${value}`;
  else next.push(`${prefix}${value}`);

  const created = lines.length === 0;
  await writeEnvFile(filePath, next.join("\n"));
  return { path: filePath, created };
}

/** Xoá 1 biến khỏi .env.local (dùng cho DELETE /api/settings/key). */
export async function removeEnvVar(
  name: string,
  root = process.cwd()
): Promise<{ path: string; removed: boolean }> {
  const filePath = envLocalPath(root);
  const { lines } = await readEnvLocal(root);
  const prefix = `${name}=`;
  const next = lines.filter((l) => !l.trimStart().startsWith(prefix));
  const removed = next.length !== lines.length;
  await writeEnvFile(filePath, next.join("\n"));
  return { path: filePath, removed };
}

/** Ghi atomically + chmod 600. */
async function writeEnvFile(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, content, { encoding: "utf8", mode: 0o600 });
  await fs.chmod(tmpPath, 0o600);
  try {
    await fs.rename(tmpPath, filePath);       // thay thế nguyên tử trên cùng filesystem
    await fs.chmod(filePath, 0o600);         // đảm bảo quyền kể cả khi file đã tồn tại
  } catch (err) {
    await fs.rm(tmpPath, { force: true });   // dọn file tạm, không để lại rác
    throw err;
  }
}

/** Trạng thái key cho UI — KHÔNG bao giờ trả key đầy đủ. */
export async function getKeyStatus(): Promise<KeyStatus> {
  const { lines } = await readEnvLocal();
  const fromFile = lines
    .map((l) => l.trim())
    .find((l) => l.startsWith(`${KEY_VAR}=`))
    ?.slice(KEY_VAR.length + 1)
    .trim();

  const key = fromFile || process.env[KEY_VAR];
  return {
    configured: Boolean(key),
    masked: maskKey(key),
    source: fromFile ? ".env.local" : process.env[KEY_VAR] ? "process.env" : null,
    lastCheckedAt: null,
    lastLatencyMs: null,
    requiresRestart: false,
  };
}
```

**Quy tắc bắt buộc:**
- **Không** `console.log`/`console.error` giá trị key. Nếu cần log → chỉ `maskKey(key)`.
- File `.env.local` phải nằm trong `.gitignore` (kiểm tra ở task khởi tạo repo).
- Không đụng `.env` (biến `DATABASE_URL` nằm ở đó).
- `maskKey` giữ 4 ký tự cuối → đủ để người dùng nhận ra key nào mà không lộ.
- Nếu `fs.rename` lỗi `EXDEV` (khác filesystem) → fallback `fs.copyFile` + `fs.rm(tmp)`.

---

### 3.9 `src/lib/costs.ts` — bảng giá & công thức `estimatedCost`

**Route/đường dẫn:** `src/lib/costs.ts`

```ts
export type ModelPricing = {
  /** USD cho 1M input token (không tính cache) */
  inputPerMillion: number;
  /** USD cho 1M output token */
  outputPerMillion: number;
  /** USD cho 1M cache_read_input_token */
  cacheReadPerMillion: number;
  /** USD cho 1M cache_creation_input_token */
  cacheWritePerMillion: number;
};

/**
 * Giả định (SPEC.md §5.7): Opus 5 $5/$25, Haiku 4.5 $1/$5 mỗi 1M token.
 * Cache read rẻ hơn ~10× input; cache write đắt hơn ~1.25× input.
 * PHẢI đối chiếu bảng giá niêm yết của Anthropic trước khi code và khi họ đổi giá.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus-5": {
    inputPerMillion: 5.0,
    outputPerMillion: 25.0,
    cacheReadPerMillion: 0.5,
    cacheWritePerMillion: 6.25,
  },
  "claude-haiku-4-5": {
    inputPerMillion: 1.0,
    outputPerMillion: 5.0,
    cacheReadPerMillion: 0.1,
    cacheWritePerMillion: 1.25,
  },
};

/** Model lạ → dùng bảng đắt nhất để không ước tính thấp hơn thực tế. */
export const FALLBACK_PRICING: ModelPricing = MODEL_PRICING["claude-opus-5"];

export type UsageForCost = {
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
};

export function pricingFor(model: string): ModelPricing {
  return MODEL_PRICING[model] ?? FALLBACK_PRICING;
}

/** Công thức duy nhất của estimatedCost (USD). */
export function estimateCost(model: string, usage: UsageForCost): number {
  const p = pricingFor(model);
  const cost =
    (usage.inputTokens * p.inputPerMillion +
      usage.outputTokens * p.outputPerMillion +
      usage.cacheRead * p.cacheReadPerMillion +
      usage.cacheWrite * p.cacheWritePerMillion) /
    1_000_000;
  // làm tròn 8 chữ số để tổng cộng dồn không bị trôi số
  return Math.round(cost * 1e8) / 1e8;
}

/** Cache hit rate = cacheRead / (input + cacheRead + cacheWrite). */
export function cacheHitRate(t: {
  inputTokens: number;
  cacheRead: number;
  cacheWrite: number;
}): number {
  const denom = t.inputTokens + t.cacheRead + t.cacheWrite;
  if (denom <= 0) return 0;
  return t.cacheRead / denom;
}

/** Nhãn tiếng Việt + màu chip cho từng feature trong AiCall. */
export const FEATURE_LABELS: Record<string, { label: string; tone: "primary" | "secondary" | "tertiary" | "neutral" }> = {
  daily_plan:      { label: "daily_plan", tone: "tertiary" },
  log_autofill:    { label: "log_autofill", tone: "neutral" },
  grading:         { label: "grading", tone: "tertiary" },
  journal_feedback:{ label: "journal_feedback", tone: "primary" },
  classify:        { label: "classify", tone: "neutral" },
  weekly_review:   { label: "weekly_review", tone: "primary" },
  roleplay:        { label: "roleplay", tone: "secondary" },
  mock_interview:  { label: "mock_interview", tone: "primary" },
  language_test:   { label: "language_test", tone: "secondary" },
  key_test:        { label: "key_test", tone: "neutral" },
};
```

**Ví dụ kiểm chứng (test bắt buộc):**
`estimateCost("claude-opus-5", { inputTokens: 3420, outputTokens: 420, cacheRead: 3100, cacheWrite: 0 })`
= `(3420×5 + 420×25 + 3100×0.5 + 0×6.25) / 1e6` = `(17100 + 10500 + 1550) / 1e6` = **`0.02915`** → UI hiển thị `$0.0292`.

---

### 3.10a `src/lib/dates.ts` — helper ngày (dùng cho bộ lọc & bucket theo ngày)

**Route/đường dẫn:** `src/lib/dates.ts`

```ts
/** Ngày hôm nay chuẩn hoá 00:00 local — dùng làm mốc so sánh chuỗi "yyyy-MM-dd". */
export function today(now: Date = new Date()): Date;

/** Ngày cách `now` đúng n ngày, chuẩn hoá 00:00 local. */
export function daysAgo(n: number, now: Date = new Date()): Date;

/** Ngày local dạng "yyyy-MM-dd" (khớp output của strftime trong SQLite). */
export function toLocalDayString(d: Date): string;

/** Khoảng thời gian dùng chung cho mọi truy vấn tổng hợp AiCall. */
export type DateRange = { from: Date; to: Date };
```

**Ghi chú:** `toLocalDayString()` phải cho ra **cùng định dạng** với `strftime('%Y-%m-%d', datetime(createdAt,'localtime'))` trong `getCostByDay` — nếu lệch 1 ngày quanh mốc nửa đêm thì biểu đồ và bộ lọc sẽ không khớp nhau.

### 3.10 Truy vấn tổng hợp `AiCall` (theo ngày / theo tính năng)

**Route/đường dẫn:** `src/lib/costs.ts`

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cacheHitRate, type CostByDay, type CostByFeature, type CostTotals } from "@/lib/costs";

export type CostRange = { from: Date; to: Date };

/** Tổng theo tính năng — groupBy native của Prisma. */
export async function getCostByFeature(range: CostRange): Promise<CostByFeature[]> {
  const rows = await prisma.aiCall.groupBy({
    by: ["feature", "model"],
    where: { createdAt: { gte: range.from, lte: range.to } },
    _count: { _all: true },
    _sum: {
      inputTokens: true,
      outputTokens: true,
      cacheRead: true,
      cacheWrite: true,
      estimatedCost: true,
    },
  });

  const totalCost = rows.reduce((s, r) => s + (r._sum.estimatedCost ?? 0), 0);

  return rows
    .map((r) => ({
      feature: r.feature,
      label: FEATURE_LABELS[r.feature]?.label ?? r.feature,
      model: r.model,
      runs: r._count._all,
      inputTokens: r._sum.inputTokens ?? 0,
      outputTokens: r._sum.outputTokens ?? 0,
      cacheRead: r._sum.cacheRead ?? 0,
      cacheWrite: r._sum.cacheWrite ?? 0,
      cost: r._sum.estimatedCost ?? 0,
      share: totalCost > 0 ? (r._sum.estimatedCost ?? 0) / totalCost : 0,
    }))
    .sort((a, b) => b.cost - a.cost);
}

/**
 * Tổng theo ngày — cần cắt ngày (theo giờ local) nên dùng raw SQL với strftime.
 * SQLite lưu DateTime của Prisma dạng ISO-8601 UTC → cắt theo giờ local bằng
 * datetime(createdAt, 'localtime').
 */
export async function getCostByDay(range: CostRange): Promise<CostByDay[]> {
  const rows = await prisma.$queryRaw<
    { day: string; calls: bigint; inputTokens: bigint; outputTokens: bigint;
      cacheRead: bigint; cacheWrite: bigint; cost: number }[]
  >(Prisma.sql`
    SELECT
      strftime('%Y-%m-%d', datetime(createdAt, 'localtime')) AS day,
      COUNT(*)                                   AS calls,
      COALESCE(SUM(inputTokens), 0)              AS inputTokens,
      COALESCE(SUM(outputTokens), 0)             AS outputTokens,
      COALESCE(SUM(cacheRead), 0)                AS cacheRead,
      COALESCE(SUM(cacheWrite), 0)               AS cacheWrite,
      COALESCE(SUM(estimatedCost), 0)            AS cost
    FROM AiCall
    WHERE createdAt >= ${range.from} AND createdAt <= ${range.to}
    GROUP BY day
    ORDER BY day ASC
  `);

  return rows.map((r) => ({
    day: r.day,
    calls: Number(r.calls),
    inputTokens: Number(r.inputTokens),
    outputTokens: Number(r.outputTokens),
    cacheRead: Number(r.cacheRead),
    cacheWrite: Number(r.cacheWrite),
    cost: Number(r.cost),
  }));
}

/** Tổng toàn khoảng + tỷ lệ cache hit + trạng thái ngân sách. */
export async function getCostTotals(
  range: CostRange,
  limitUsd: number
): Promise<CostTotals & { budget: { limitUsd: number; usedUsd: number; ratio: number; level: "ok" | "warn" | "over" } }> {
  const agg = await prisma.aiCall.aggregate({
    where: { createdAt: { gte: range.from, lte: range.to } },
    _count: { _all: true },
    _sum: {
      inputTokens: true, outputTokens: true,
      cacheRead: true, cacheWrite: true, estimatedCost: true,
    },
  });
  const errors = await prisma.aiCall.count({
    where: { createdAt: { gte: range.from, lte: range.to }, ok: false },
  });

  const inputTokens = agg._sum.inputTokens ?? 0;
  const outputTokens = agg._sum.outputTokens ?? 0;
  const cacheRead = agg._sum.cacheRead ?? 0;
  const cacheWrite = agg._sum.cacheWrite ?? 0;
  const cost = agg._sum.estimatedCost ?? 0;

  const ratio = limitUsd > 0 ? cost / limitUsd : 0;

  return {
    calls: agg._count._all,
    errors,
    inputTokens, outputTokens, cacheRead, cacheWrite, cost,
    cacheHitRate: cacheHitRate({ inputTokens, cacheRead, cacheWrite }),
    budget: {
      limitUsd,
      usedUsd: cost,
      ratio,
      level: ratio >= 1 ? "over" : ratio >= 0.8 ? "warn" : "ok",
    },
  };
}

/** Hợp nhất 3 truy vấn tổng hợp thành 1 payload cho trang /settings. */
export async function getCostSummary(
  range: CostRange,
  limitUsd: number
): Promise<{
  totals: Awaited<ReturnType<typeof getCostTotals>>;
  byFeature: CostByFeature[];
  byDay: CostByDay[];
}> {
  const [totals, byFeature, byDay] = await Promise.all([
    getCostTotals(range, limitUsd),
    getCostByFeature(range),
    getCostByDay(range),
  ]);
  return { totals, byFeature, byDay };
}
```

**Ghi chú SQLite:** cột `createdAt` lưu dạng ISO-8601 UTC (`2026-10-30T08:15:00.000Z`), nên `datetime(createdAt, 'localtime')` cho ra ngày theo múi giờ máy. `strftime('%Y-%m-%d', …)` khớp định dạng `yyyy-MM-dd` mà `src/lib/dates.ts` dùng.

---

### 3.11 `src/lib/data-admin.ts` — thống kê DB, xoá trắng (transaction), export JSON

**Route/đường dẫn:** `src/lib/data-admin.ts`

```ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";

export const EXPORTABLE_TABLES = [
  "skills", "activities", "evidences", "reflections", "planItems",
  "cards", "reviews", "dailyStates", "aiCalls",
  "interviewProfiles", "interviewSessions", "interviewTurns",
  "testSessions", "testItems",
] as const;

/** Kích thước file SQLite + số bản ghi từng bảng. */
export async function getDbStats(): Promise<DbStats> {
  const dbPath = path.resolve(process.cwd(), "prisma", "dev.db");
  let dbSizeBytes = 0;
  try {
    const st = await fs.stat(dbPath);
    dbSizeBytes = st.size;
  } catch {
    dbSizeBytes = 0; // DB chưa tạo → 0, không crash
  }

  const recordCounts: Record<string, number> = {};
  for (const t of EXPORTABLE_TABLES) {
    recordCounts[t] = await (prisma as unknown as Record<string, { count(): Promise<number> }>)[t].count();
  }
  return { dbSizeBytes, dbPath, recordCounts };
}

/**
 * Xoá trắng trong 1 transaction — thứ tự: con trước, cha sau.
 * Bất kỳ lỗi nào → rollback toàn bộ.
 */
export async function wipeAllData(): Promise<{
  deleted: Record<string, number>;
  dbSizeBytesBefore: number;
  dbSizeBytesAfter: number;
}> {
  const before = (await getDbStats()).dbSizeBytes;

  const deleted = await prisma.$transaction(async (tx) => {
    const out: Record<string, number> = {};
    // con trước
    out.testItems = await tx.testItem.deleteMany({}).then((r) => r.count);
    out.testSessions = await tx.testSession.deleteMany({}).then((r) => r.count);
    out.interviewTurns = await tx.interviewTurn.deleteMany({}).then((r) => r.count);
    out.interviewSessions = await tx.interviewSession.deleteMany({}).then((r) => r.count);
    out.interviewProfiles = await tx.interviewProfile.deleteMany({}).then((r) => r.count);
    out.reviews = await tx.review.deleteMany({}).then((r) => r.count);
    out.evidences = await tx.evidence.deleteMany({}).then((r) => r.count);
    out.reflections = await tx.reflection.deleteMany({}).then((r) => r.count);
    out.planItems = await tx.planItem.deleteMany({}).then((r) => r.count);
    out.dailyStates = await tx.dailyState.deleteMany({}).then((r) => r.count);
    out.aiCalls = await tx.aiCall.deleteMany({}).then((r) => r.count);
    // cha sau
    out.cards = await tx.card.deleteMany({}).then((r) => r.count);
    out.activities = await tx.activity.deleteMany({}).then((r) => r.count);
    out.skills = await tx.skill.deleteMany({}).then((r) => r.count);
    // hồ sơ: reset về mặc định thay vì xoá (app cần 1 dòng profile)
    await tx.userProfile.updateMany({
      data: {
        name: null, goals: null, aiTone: "direct",
        learningLangs: "zh,en", zhLevel: "zero", enLevel: "zero",
        interviewLang: "en", monthlyBudgetUsd: 15, saverMode: false,
      },
    });
    return out;
  });

  const after = (await getDbStats()).dbSizeBytes;
  return { deleted, dbSizeBytesBefore: before, dbSizeBytesAfter: after };
}

/** Xuất toàn bộ DB ra JSON — stream để không gom hết vào RAM. */
export async function exportAllData(): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();
  const snapshot = await prisma.$transaction(async (tx) => ({
    profile: await tx.userProfile.findFirst(),
    tables: Object.fromEntries(
      await Promise.all(
        EXPORTABLE_TABLES.map(async (t) => {
          const rows = await (tx as unknown as Record<string, { findMany(): Promise<unknown[]> }>)[t].findMany();
          return [t, rows];
        })
      )
    ),
  }));

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const header = {
        schemaVersion: "1.0.0",
        exportedAt: new Date().toISOString(),
        app: "daily-loop-os",
        profile: snapshot.profile ?? null,
      };
      controller.enqueue(encoder.encode(JSON.stringify(header) + "\n"));
      controller.enqueue(encoder.encode('"tables":{'));
      let first = true;
      for (const [name, rows] of Object.entries(snapshot.tables)) {
        if (!first) controller.enqueue(encoder.encode(","));
        first = false;
        controller.enqueue(encoder.encode(`${JSON.stringify(name)}:${JSON.stringify(rows)}`));
      }
      controller.enqueue(encoder.encode("}}\n"));
      controller.close();
    },
  });
}
```

**Ghi chú:**
- `prisma.$transaction` (interactive) mặc định timeout 5s; với DB Phase 0 (vài nghìn dòng) là đủ. Nếu cần nâng: `{ timeout: 20000 }`.
- Export dùng **snapshot transaction** để dữ liệu nhất quán khi app đang ghi.
- Sau khi xoá, `UserProfile` được **reset về mặc định** chứ không xoá — app cần đúng 1 dòng hồ sơ (singleton).

---

### 3.12 API routes — chữ ký handler

**Route/đường dẫn:** `src/app/api/settings/profile/route.ts`

```ts
import { z } from "zod";
import { NextResponse } from "next/server";
import { getProfile, updateProfile } from "@/lib/profile";

const ProfileSchema = z.object({
  name: z.string().max(80).nullable().optional(),
  goals: z.string().max(2000).nullable().optional(),
  aiTone: z.enum(["direct", "coach", "gentle"]).optional(),
  learningLangs: z.array(z.enum(["zh", "en"])).min(1).optional(),
  zhLevel: z.enum(["zero", "A1", "A2", "B1", "B2", "C1", "C2"]).optional(),   // C29/Q3
  enLevel: z.enum(["zero", "A1", "A2", "B1", "B2", "C1", "C2"]).optional(),   // C29/Q3
  viLevel: z.enum(["zero", "A1", "A2", "B1", "B2", "C1", "C2"]).optional(),   // C29 — bản ngữ, mặc định "B2"
  languageStandard: z.enum(["cefr", "hsk", "both"]).optional(),           // C32/Q7
  interviewLang: z.enum(["en", "vi"]).optional(),
  monthlyBudgetUsd: z.number().min(0).max(1000).optional(),
  saverMode: z.boolean().optional(),
});

export async function GET(): Promise<NextResponse> {
  const profile = await getProfile();
  return NextResponse.json({ ok: true, data: { profile } });
}

export async function PUT(req: Request): Promise<NextResponse> {
  const parsed = ProfileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_INPUT", message: "Dữ liệu hồ sơ không hợp lệ." } },
      { status: 400 }
    );
  }
  const profile = await updateProfile(parsed.data);
  return NextResponse.json({ ok: true, data: { profile } });
}
```

**Route/đường dẫn:** `src/app/api/settings/key/route.ts`

```ts
import { z } from "zod";
import { NextResponse } from "next/server";
import { upsertEnvVar, removeEnvVar, getKeyStatus, maskKey } from "@/lib/env-file";

const KeySchema = z.object({
  apiKey: z.string().regex(/^sk-ant-[A-Za-z0-9_-]{10,}$/, "Định dạng khóa không hợp lệ."),
});

export async function GET(): Promise<NextResponse> {
  const status = await getKeyStatus();
  return NextResponse.json({ ok: true, data: status });
}

export async function PUT(req: Request): Promise<NextResponse> {
  const parsed = KeySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_KEY_FORMAT", message: "Định dạng khóa API không hợp lệ." } },
      { status: 400 }
    );
  }
  try {
    const { path } = await upsertEnvVar("ANTHROPIC_API_KEY", parsed.data.apiKey);
    // hiệu lực ngay trong tiến trình hiện tại (file thì cần restart)
    process.env.ANTHROPIC_API_KEY = parsed.data.apiKey;
    return NextResponse.json({
      ok: true,
      data: { masked: maskKey(parsed.data.apiKey), requiresRestart: true, writtenTo: ".env.local", path },
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "ENV_WRITE_FAILED",
          message: "Không ghi được .env.local. Kiểm tra quyền ghi của file hoặc đặt biến môi trường ở máy chủ.",
        },
      },
      { status: 500 }
    );
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
    await removeEnvVar("ANTHROPIC_API_KEY");
    delete process.env.ANTHROPIC_API_KEY;
    return NextResponse.json({ ok: true, data: { ok: true } });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "ENV_WRITE_FAILED", message: "Không xoá được khóa khỏi .env.local." } },
      { status: 500 }
    );
  }
}
```

**Route/đường dẫn:** `src/app/api/settings/key/test/route.ts`

```ts
import { NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";

export async function POST(): Promise<NextResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: { code: "KEY_NOT_CONFIGURED", message: "Chưa cấu hình ANTHROPIC_API_KEY." } },
      { status: 400 }
    );
  }

  const started = Date.now();
  try {
    await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
      // KHÔNG kỳ vọng cache: system prompt ngắn, dưới ngưỡng cache của model.
    });
    const latencyMs = Date.now() - started;
    return NextResponse.json({
      ok: true,
      data: { status: "ok", latencyMs, model: "claude-haiku-4-5", checkedAt: new Date().toISOString() },
    });
  } catch (err) {
    // map sang mã lỗi nghiệp vụ — xem §5
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { ok: false, error: { code: "KEY_INVALID", message: "Khóa không hợp lệ (401)." } },
        { status: 401 }
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: "Bị giới hạn tần suất (429).",
            retryAfterSec: 30,
          },
        },
        { status: 429 }
      );
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return NextResponse.json(
        { ok: false, error: { code: "API_UNREACHABLE", message: "Không kết nối được tới Anthropic." } },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "PING_FAILED", message: "Kiểm tra kết nối thất bại." } },
      { status: 500 }
    );
  }
}
```

**Route/đường dẫn:** `src/app/api/data/route.ts` (xoá trắng)

```ts
import { z } from "zod";
import { NextResponse } from "next/server";
import { wipeAllData } from "@/lib/data-admin";

const DeleteSchema = z.object({ confirm: z.literal("XOA") });

export async function DELETE(req: Request): Promise<NextResponse> {
  const parsed = DeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "CONFIRMATION_REQUIRED",
          message: "Cần xác nhận bằng cách gõ đúng XOA. Không có dữ liệu nào bị xoá.",
        },
      },
      { status: 400 }
    );
  }
  try {
    const result = await wipeAllData();
    return NextResponse.json({ ok: true, data: result });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "DELETE_FAILED",
          message: "Không xoá được. Toàn bộ dữ liệu vẫn nguyên vẹn.",
        },
      },
      { status: 500 }
    );
  }
}
```

---

## 4. Luồng dữ liệu

### 4.1 Luồng chính

1. `GET /settings` → `Promise.all` gọi 6 service → Server Component render 4 section.
2. Người dùng bấm tab → `router.push("?tab=key")` → server render lại chỉ section tương ứng.
3. Người dùng bấm "Lưu thay đổi" ở Hồ sơ → `PUT /api/settings/profile` → Zod → `updateProfile()` → `upsert` dòng `UserProfile` id `"default"` → trả DTO → toast.
4. Người dùng dán key → `PUT /api/settings/key` → Zod → `upsertEnvVar()` (atomic + chmod 600) → set `process.env` → trả `{ masked, requiresRestart: true }` → UI hiện banner restart.
5. Người dùng bấm Ping → `POST /api/settings/key/test` → 1 call `claude-haiku-4-5`, `max_tokens: 1` → wrapper ghi `AiCall{feature:"key_test"}` → trả latency hoặc mã lỗi.
6. Người dùng mở tab Chi phí → `GET /api/ai/costs` → `getCostTotals` + `getCostByFeature` + `getCostByDay` → render bento + bar + bảng.
7. Người dùng đổi trang → `GET /api/ai/calls?page=n` → `findMany` + `count` → cập nhật bảng.
8. Người dùng bấm "Xuất AiCall CSV" → `GET /api/ai/calls?format=csv` → `text/csv` + `Content-Disposition: attachment`.
9. Người dùng bấm "Xuất toàn bộ CSDL (JSON)" → `GET /api/data/export` → stream JSON → trình duyệt tải file.
10. Người dùng xoá trắng → bước 1 mở hộp thoại → bước 2 gõ `XOA` → `DELETE /api/data` → transaction → reload.

### 4.2 Lưu trữ & truy vấn

**Lưu hồ sơ (singleton, không tạo dòng thứ 2):**

```ts
// src/lib/profile.ts
import { prisma } from "@/lib/db";

const PROFILE_ID = "default";

export async function getProfile(): Promise<ProfileDto> {
  const row =
    (await prisma.userProfile.findUnique({ where: { id: PROFILE_ID } })) ??
    (await prisma.userProfile.create({ data: { id: PROFILE_ID } }));
  return toDto(row);
}

export async function updateProfile(patch: Partial<ProfileDto>): Promise<ProfileDto> {
  const data: Prisma.UserProfileUpdateInput = {
    name: patch.name ?? null,
    goals: patch.goals ?? null,
    aiTone: patch.aiTone ?? "direct",
    learningLangs: (patch.learningLangs ?? ["zh", "en"]).join(","),
    zhLevel: patch.zhLevel ?? "zero",
    enLevel: patch.enLevel ?? "zero",
    interviewLang: patch.interviewLang ?? "en",
    monthlyBudgetUsd: patch.monthlyBudgetUsd ?? 15,
    saverMode: patch.saverMode ?? false,
  };
  const row = await prisma.userProfile.upsert({
    where: { id: PROFILE_ID },
    create: { id: PROFILE_ID, ...data },
    update: data,
  });
  return toDto(row);
}
```

**Truy vấn phân trang nhật ký:**

```ts
// src/lib/costs.ts
export async function listAiCalls(args: {
  page: number; pageSize: number; feature?: string;
}): Promise<{ rows: AiCallRow[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const where = args.feature ? { feature: args.feature } : {};
  const [rows, total] = await Promise.all([
    prisma.aiCall.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
    }),
    prisma.aiCall.count({ where }),
  ]);
  return {
    rows: rows.map(toRow),
    total,
    page: args.page,
    pageSize: args.pageSize,
    totalPages: Math.max(Math.ceil(total / args.pageSize), 1),
  };
}
```

**Truy vấn log minh bạch (FR-PS-07):**

```ts
// src/lib/privacy.ts
export async function listPrivacyLog(args: { page: number; pageSize: number; feature?: string }) {
  const where: Prisma.AiCallWhereInput = {
    ...(args.feature ? { feature: args.feature } : {}),
    // chỉ lấy dòng thực sự có dữ liệu đã gửi
    NOT: [{ dataKinds: "[]" }, { dataKinds: null }],
  };
  const [rows, total] = await Promise.all([
    prisma.aiCall.findMany({
      where, orderBy: { createdAt: "desc" },
      skip: (args.page - 1) * args.pageSize, take: args.pageSize,
    }),
    prisma.aiCall.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      feature: r.feature,
      model: r.model,
      dataKinds: safeParseKinds(r.dataKinds),
      dataPreview: r.dataPreview,
      inputTokens: r.inputTokens,
    })),
    total,
    page: args.page,
    pageSize: args.pageSize,
    totalPages: Math.max(Math.ceil(total / args.pageSize), 1),
  };
}
```

**Ghi `AiCall` từ wrapper Anthropic (điểm duy nhất ghi log):**

```ts
// src/lib/anthropic.ts — phần mở rộng cho S15
export type AiCallOptions = {
  feature:
    | "daily_plan" | "log_autofill" | "grading" | "journal_feedback" | "classify"
    | "weekly_review" | "roleplay" | "mock_interview" | "language_test" | "key_test";
  /** FR-PS-07: các loại dữ liệu sẽ gửi lên API — bắt buộc, không optional. */
  dataKinds: string[];
  /** FR-PS-07: trích ≤ 280 ký tự nội dung đã gửi. */
  dataPreview?: string | null;
};

export async function logAiCall(
  opts: AiCallOptions,
  model: string,
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number },
  ok: boolean,
  error?: string
): Promise<void> {
  await prisma.aiCall.create({
    data: {
      feature: opts.feature,
      model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheRead: usage.cache_read_input_tokens,
      cacheWrite: usage.cache_creation_input_tokens,
      estimatedCost: estimateCost(model, {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheRead: usage.cache_read_input_tokens,
        cacheWrite: usage.cache_creation_input_tokens,
      }),
      ok,
      error: error ?? null,
      dataKinds: JSON.stringify(opts.dataKinds),
      dataPreview: opts.dataPreview ?? null,
    },
  });
}
```

**Cắt xem trước (giữ an toàn):**

```ts
export function buildPreview(text: string, max = 280): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return `${(lastStop > 40 ? cut.slice(0, lastStop + 1) : cut).trim()}…`;
}
```

## 5. Xử lý lỗi

| Tình huống | Phát hiện | Xử lý | Thông báo người dùng |
|---|---|---|---|
| Chưa có key | `process.env.ANTHROPIC_API_KEY` rỗng | Không gọi API; ping trả `KEY_NOT_CONFIGURED` | Banner offline + chip "Chưa cấu hình" |
| Key sai (401) | `Anthropic.AuthenticationError` | Không ghi `AiCall` (không có token); trả `KEY_INVALID` | "Khóa không hợp lệ (401)" + làm nổi bật nút "Đổi khóa API" |
| Rate limit (429) | `Anthropic.RateLimitError` | Không ghi `AiCall`; trả `RATE_LIMITED` + `retryAfterSec` | "Bị giới hạn tần suất (429) — thử lại sau N giây" + nút Thử lại |
| Không gọi được mạng | `Anthropic.APIConnectionError` | Timeout 10s; trả `API_UNREACHABLE` | "Không kết nối được tới Anthropic — kiểm tra mạng" |
| `stop_reason === "refusal"` | Kiểm tra **trước** khi đọc `content` | Ghi `AiCall{ok:false, error:"refusal"}` | "AI từ chối trả lời. Thử lại với nội dung khác." |
| Không ghi được `.env.local` | `EACCES`/`EROFS`/`EXDEV` | Bắt lỗi, dọn file tạm, trả `ENV_WRITE_FAILED` | "Không ghi được .env.local — kiểm tra quyền ghi hoặc đặt biến môi trường ở máy chủ" |
| `ENOSPC` khi ghi file | `ENOSPC` | Bắt lỗi, dọn file tạm | "Ổ đĩa đầy — không lưu được khóa" |
| Sai định dạng khóa | Zod `regex` | Chặn ở server | "Định dạng khóa không hợp lệ (phải bắt đầu bằng `sk-ant-`)" |
| `learningLangs` rỗng | Zod `.min(1)` | Chặn ở server | "Phải bật ít nhất một ngôn ngữ đang học" |
| `goals` > 2000 ký tự | Zod `.max(2000)` | Chặn ở server | "Mục tiêu dài hạn tối đa 2000 ký tự" |
| Xoá dữ liệu thiếu xác nhận | Zod `literal("XOA")` | Trả `CONFIRMATION_REQUIRED`, **không** xoá gì | "Cần gõ đúng XOA. Không có dữ liệu nào bị xoá." |
| Xoá dữ liệu lỗi giữa chừng | `prisma.$transaction` throw | Rollback toàn bộ | "Không xoá được gì cả, dữ liệu nguyên vẹn." |
| Export lỗi | `fs`/query throw | Trả `EXPORT_FAILED` | "Không xuất được dữ liệu. Thử lại." |
| DB rỗng (chưa seed) | Query trả 0 dòng | Empty state có CTA | "Chưa có dữ liệu. Chạy `npm run db:seed` để nạp dữ liệu mẫu." |
| Mức ngôn ngữ lạ trong DB | Không thuộc enum | Map về `zero` + log cảnh báo | Không hiển thị lỗi; giá trị hiện tại = mặc định |
| `AiCall` cũ thiếu `dataKinds` | `dataKinds = "[]"` | Không hiện trong privacy log | "chưa ghi nhận" (không bịa dữ liệu) |

## 6. Chiến lược kiểm thử

| Tầng | Công cụ | Phạm vi |
|---|---|---|
| Unit | Vitest | `estimateCost()` cho 3 model + model lạ; `cacheHitRate()`; `maskKey()`; `buildPreview()`; `FEATURE_LABELS`; Zod schema profile & key (reject `learningLangs` rỗng, key sai định dạng, `goals` quá dài). |
| Unit | Vitest + `memfs` | `upsertEnvVar` / `removeEnvVar`: giữ nguyên dòng khác, tạo file mới, quyền file = `0o600`, không tạo file rác khi ghi lỗi. |
| Integration | Vitest + SQLite test DB | `getCostByFeature` / `getCostByDay` / `getCostTotals` khớp với dữ liệu seed; `listAiCalls` phân trang đúng; `wipeAllData` rollback khi cố xoá sai thứ tự; `listPrivacyLog` chỉ trả dòng có `dataKinds`. |
| Integration | Vitest | Các API route: `PUT /api/settings/profile` (400 khi invalid), `PUT /api/settings/key` (400 sai format, 500 khi FS chỉ đọc), `DELETE /api/data` (400 khi thiếu `confirm`, 200 khi có `XOA`), `GET /api/ai/calls?format=csv` (header + số dòng). |
| E2E | Playwright | Luồng AC-SC-01 → AC-SC-17: lưu hồ sơ, lưu key (kiểm tra file `.env.local` có `chmod 600` và **không** chứa key trong HTML), ping (mock 200/401/429), xem chi phí, phân trang, export JSON, xoá 2 bước. |
| Bảo mật | Vitest + grep | Không payload/HTML nào chứa `sk-ant-` dạng đầy đủ (trừ mask `sk-ant-…abcd`); file `.env.local` nằm trong `.gitignore`; log server không chứa key. |
| Hiệu năng | k6 / script đơn giản | Seed 100.000 dòng `AiCall` → `GET /api/ai/costs` < 500ms; `GET /api/ai/calls?page=50` < 200ms. |
| Tiêu chí nghiệm thu | Playwright | Chạy đúng 17 AC trong `spec.md` §8 — mỗi AC là 1 test có tên. |
| Responsive/a11y | Playwright + axe | 390px không tràn ngang; axe không có vi phạm `serious`; mọi icon-only có `aria-label`. |

## 7. Rủi ro & đánh đổi kỹ thuật

| # | Rủi ro | Tác động | Giảm thiểu |
|---|---|---|---|
| 1 | **Ghi `.env.local` không có hiệu lực với `next dev`** (tiến trình con thừa kế env cũ) | Người dùng tưởng đã cấu hình nhưng AI vẫn offline | Set `process.env` ngay trong request + banner bắt buộc "khởi động lại `npm run dev`" + nút "Tôi đã khởi động lại — kiểm tra lại" |
| 2 | **Lộ key qua log Next.js dev** (request body được log) | Rò rỉ bí mật | Không bao giờ `console.log` body ở route key; chỉ log `maskKey`; không bật log request ở dev |
| 3 | **Ghi file không atomic** → `.env.local` hỏng khi server crash giữa lúc ghi | App mất key, khó khởi động | Ghi file tạm → `rename` → `chmod 600`; dọn file tạm khi throw |
| 4 | **Ước tính chi phí lệch hoá đơn thật khi Anthropic đổi giá** | Người dùng quyết định sai dựa trên số liệu | Giá nằm trong 1 hằng số `MODEL_PRICING`; ghi rõ "ước tính" trên UI; tooltip liệt kê công thức + giả định; task review giá định kỳ |
| 5 | **`$queryRaw` với `datetime(createdAt,'localtime')` lệch ngày so với `src/lib/dates.ts`** | Biểu đồ theo ngày lệch 1 ngày quanh mốc nửa đêm | Dùng cùng 1 hàm `toLocalDayString()` cho cả `dates.ts` và truy vấn; test biên (23:59 → 00:00) |
| 6 | **`AiCall` phình to → S15 chậm** | Trải nghiệm tệ ở máy đã dùng vài tháng | Aggregate ở DB, phân trang 25, lọc 30 ngày mặc định, index `@@index([createdAt])` |
| 7 | **`BigInt` từ `$queryRaw`** lỗi khi serialize ra JSON | 500 ở `/api/ai/costs` | Ép `Number(...)` cho mọi cột `bigint` (xem `getCostByDay`) |
| 8 | **Export JSON quá lớn → tràn RAM** | Crash tiến trình | Stream bằng `ReadableStream`; cảnh báo kích thước dự kiến > 50MB |
| 9 | **Xoá dữ liệu sai thứ tự → vi phạm FK** | Transaction rollback, xoá không được | Thứ tự con trước cha sau; test tích hợp với đầy đủ quan hệ |
| 10 | **`UserProfile` singleton bị xoá mất → app lỗi** | `/settings` 500 | Reset về mặc định thay vì xoá; `getProfile` tự `create` nếu thiếu |
| 11 | **Thêm 2 field vào `AiCall` làm lệch SPEC §4 (19 model)** | Lệch nguồn chân lý | Ghi rõ deviation ở `spec.md` §5.2 + cập nhật `SPEC.md` §4 ở feature sau (không sửa file trong feature này) |
| 12 | **Ping tạo rác `AiCall`** (mỗi lần bấm 1 dòng) | Bảng log nhiễu | `feature = "key_test"` lọc riêng được; tooltip khuyến nghị ≤ 1 test/ngày |
| 13 | **Ping dùng model đắt** | Tốn tiền vô ích | Cố định `claude-haiku-4-5`, `max_tokens: 1` |
| 14 | **`dataPreview` lộ nội dung nhạy cảm vào log** | Rủi ro riêng tư | Cắt 280 ký tự, cắt giữa câu, không lưu full text; người dùng xoá được toàn bộ ngay |
| 15 | **4 section render cùng lúc làm trang nặng** ở máy yếu | Chậm mở trang | Render theo `searchParams.tab` (chỉ 1 section mỗi lần); `force-dynamic` để dữ liệu luôn mới |
