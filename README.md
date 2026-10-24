# AI Mock Interview Studio

A self-hosted web app for software engineers to practice technical interviews with AI.
Bring your own API key (Anthropic, OpenAI, Google Gemini, or any OpenAI-compatible endpoint).
Everything — sessions, transcripts, raw provider blocks, CV extracts, evaluation reports, learning lessons and self-check attempts — is persisted in
a single server-side SQLite file via the built-in `node:sqlite` driver (Node 22+).

> **Design reference:** see `stitch-screens/` for the design tokens and screen captures.
> **Requirements:** see `stitch-screens/screens/00-requirements.md` for the full FR / NFR list.

---

## Architecture at a glance

| Layer        | Tech                                                    |
| ------------ | ------------------------------------------------------- |
| Framework    | Next.js 14 App Router · `runtime = "nodejs"` (NFR-12)   |
| Language     | TypeScript strict                                       |
| Styling      | Tailwind CSS configured from the Stitch design tokens  |
| Validation   | Zod (request bodies, evaluation schema)                 |
| DB           | `node:sqlite` (singleton, WAL, FK cascade)              |
| AI providers | Direct REST calls (Anthropic · OpenAI · Gemini · Custom)|
| Streaming    | ReadableStream SSE from provider → route → browser      |
| PDF          | `pdf-parse` (server-only, max 20 k chars after sanitize) |

```
app/
├─ layout.tsx            — root layout · fonts · ByokProvider
├─ globals.css           — design tokens · base styles
├─ page.tsx              — 1. Cấu hình AI (BYOK)
├─ new/page.tsx          — 2. Bắt đầu phỏng vấn
├─ session/[id]/page.tsx — 3. Phiên đang diễn ra (SSE)
├─ report/[id]/page.tsx  — 4. Báo cáo đánh giá chi tiết
├─ report/page.tsx       — redirect to latest completed
├─ history/page.tsx      — 5. Lịch sử & Dữ liệu SQLite
└─ api/                  — 8 route handlers (see below)

lib/
├─ db.ts                 — node:sqlite singleton + schema
├─ types.ts              — shared types (server + client safe)
├─ zod-schemas.ts        — evaluation report schema + auto-repair
├─ evaluation.ts         — final-report runner (budget, truncation retry, audit log)
├─ evaluation-constants.ts — eval timeouts + output budgets (client-safe)
├─ validate.ts           — input validation + SSRF guard
├─ pdf.ts                — PDF text extraction (server-only)
├─ prompts.ts            — system prompts (strict / coaching)
├─ env.ts                — typed env reader (server-only)
├─ markdown.ts           — tiny md → html (client-side)
├─ useStreamingChat.ts   — SSE consumer hook
├─ types-shared.ts       — client-safe re-exports
└─ providers/            — 4 AI providers + shared parser
   ├─ types.ts           — Provider interface + safeRawBlocks + parseSseStream
   ├─ anthropic.ts
   ├─ openai.ts
   ├─ gemini.ts
   └─ custom.ts
```

## Quick start

```bash
# 1. Node >= 22.5 (uses node:sqlite)
node -v

# 2. Install
npm install

# 3. Dev (set the exact origin used by your browser)
PUBLIC_ORIGIN=http://localhost:3000 npm run dev
# → http://localhost:3000
```

`.env.example` covers all env vars; copy it to `.env.local` if you want to override. Set `PUBLIC_ORIGIN` to the exact origin in the address bar (for example `http://localhost:3000` during local development); missing or mismatched Origin rejects POST/DELETE, even locally. To enable Custom, set `NEXT_PUBLIC_PROVIDER_ENABLE=anthropic,openai,gemini,custom` and restart `next dev` (rebuild for production: `NEXT_PUBLIC_*` is baked into the client bundle). Custom accepts `https://api.groq.com/openai/v1` or `http://localhost:11434` (adds `/v1` automatically); for local/private hosts set `ALLOW_PRIVATE_BASE_URL=1` on the server. Public endpoints must use HTTPS; HTTP is only for local/private hosts when explicitly opted in.

## BYOK security model (NFR-2 / NFR-10 / NFR-11)

| What                     | Where it lives                                              |
| ------------------------ | ----------------------------------------------------------- |
| API key (in memory)      | React state + per-request fetch body only. **Never persisted.**|
| `localStorage` / session | Client only. UI toggle (default: sessionStorage).            |
| SQLite (`data/...db`)    | Sessions, turns, CV, evaluations, learning lessons/quiz answers/checks, model configs. **No key.** |
| Server logs              | `safeRawBlocks()` regex-redacts `sk-…`, `sk-ant-…`, `AIza…` before write. |
| Custom endpoint URL      | Persisted with the session; outbound requests check the URL and actual DNS/socket address, disallow redirects and metadata/link-local hosts. |

## 5 screens

1. **`/`** — BYOK config (provider, key, model, sliders)
2. **`/new`** — 5 core setup options (FR-1): role, language, mode, length, CV
3. **`/session/[id]`** — Streaming conversation + per-turn coaching rubric drawer
4. **`/report/[id]`** — Overall score, 4 pillars, strengths / improvements, next steps
5. **`/history`** — SQLite-backed session list, filters, admin actions (wipe / vacuum / backup)

## API surface

| Method | Path                                | Purpose |
| ------ | ----------------------------------- | ------- |
| POST   | `/api/test-key`                     | Validate BYOK without persisting |
| POST   | `/api/models`                       | List provider models (falls back to local catalogue) |
| GET    | `/api/sessions`                     | List + filter + sort |
| POST   | `/api/sessions`                     | Create session + persist CV (atomic; optional `previewDigest`) |
| POST   | `/api/sessions/preview`             | Extract a CV PDF and return the exact text that would be stored — nothing is persisted |
| GET    | `/api/sessions/[id]`                | Session + turns + CV |
| DELETE | `/api/sessions/[id]`                | Hard delete (cascade) |
| POST   | `/api/sessions/[id]/messages`       | **SSE** — submit answer, stream next question (+ coaching rubric) |
| POST   | `/api/sessions/[id]/evaluate`       | Force evaluation (same runner that fires when `plannedRounds` reached) |
| GET    | `/api/sessions/[id]/report`         | Parsed evaluation report |
| GET    | `/api/sessions/[id]/attempts`       | Scoring audit trail (`?raw=1` includes the model's body) |
| GET    | `/api/admin/db`                     | Path + counters |
| POST   | `/api/admin/db`                     | `wipe-sessions` / `wipe-all` / `vacuum` / JSON `backup` |
| POST   | `/api/admin/db/validate-restore`    | Validate JSON backup and preview replacement counts |
| POST   | `/api/admin/db/commit-restore`      | Confirm exact validated JSON bytes with short-lived token |
| GET    | `/api/admin/schema`                 | Table list + DDL |

## CV input limits

- A pasted CV is capped at **20,000 characters**. The cap is explicit, not silent: an over-length paste is rejected with HTTP 400 and the `/new` textarea shows a counter plus a warning and disables submit. Text is never truncated behind the user's back. Of the stored text, only the first **6,000 characters** enter the prompt; the `/new` screen says so.
- An uploaded PDF is capped at **10 MiB decoded** (the base64 body is longer — budget roughly 14 MiB of request body). The server validates, in order: exact `data:application/pdf;base64,` prefix, base64 alphabet, decoded byte ceiling (**413** when over), then the literal `%PDF-` signature at offset 0 (**400** otherwise — a byte-order mark or leading whitespace is not a PDF header). Parsing then runs through pdf-parse; a PDF that will not parse or yields no text is a **400**, and the error never echoes payload bytes.
- `POST /api/sessions/preview` runs the identical extraction and returns `{ text, charCount, truncated, promptCharCount, promptTruncated, digest }`. It is authenticated by the same Origin guard, holds an operation lease so a concurrent restore cannot swap the database underneath it, and **writes nothing** — the PDF bytes are not stored in SQLite and never enter a backup.
- The returned `digest` (SHA-256 of the stored text) is what ties preview to create. `/new` shows the text it will send and lets you edit or re-pick before confirming; the client sends `previewDigest` on create and the server recomputes it. If the text the user confirmed is not the text that would be stored, creation is refused with **409** rather than quietly storing something else. Editing the text invalidates the digest until the server is asked again, so a stale preview always re-prompts.
- Session creation is **atomic**: the session row, its `cv_extracts` row and the `model_configs` upsert commit inside a single `BEGIN IMMEDIATE` transaction. PDF extraction runs *before* that transaction, so an async parser never holds a write lock; if any insert or the upsert fails, all three roll back and no orphan session or stale preference is left behind.

## Security & operations

- The app is **single-tenant and has no application login**. For a VPS, configure `PUBLIC_ORIGIN` and place **every** page, asset and API route behind HTTPS + owner authentication at the reverse proxy; never expose app port 12213. Origin checks on mutations mitigate CSRF but are not authentication. See [the VPS sample](deploy/README.md). Keep the instance private until the [T-07 release gate](specs/interview-studio-improvements/tasks.md) (especially T-02 backup/restore and T-07) is complete.
- `ALLOW_PRIVATE_BASE_URL=1` permits custom endpoints on local/private networks (e.g. Ollama at `http://localhost:11434`) and can expose internal services to anyone able to call this unauthenticated app. Leave it unset in public deployments. Link-local and metadata addresses remain blocked even with opt-in.
- A custom API key is sent directly to the user-selected endpoint; only enter endpoints you trust. The key is not persisted in SQLite, and custom requests never fall back to OpenAI.
- Whatever the CV source — pasted text or a server-extracted PDF — **the CV text is sent to the AI provider as part of each prompt**, and the operator's chosen endpoint sees it. A PDF is parsed server-side; only the extracted text leaves the app, never the file. `/new` states this per mode rather than claiming nothing is uploaded. The raw PDF bytes are never persisted, logged, or included in a backup.
- `VACUUM` periodically if you do a lot of wipes. The browser backup exports a versioned JSON snapshot (`schemaVersion=4`) of all eight application tables, including evaluation attempts, learning lessons, self-check attempts and each session's optional originating lesson. The file contains sensitive CV text, transcripts, raw model responses, custom endpoint URLs, lesson content and quiz answers: store it encrypted with restricted permissions, never in the repository or a public download folder. It does not contain provider keys or PDF bytes. Strict v1/v2 JSON imports restore their six historical tables and initialize learning tables empty; strict v3 imports preserve lessons and checks. All v1–v3 sessions have no originating lesson after import. Restore replaces, never merges.
- Restore **replaces all application data** in a single transaction. The history page validates the selected JSON file, shows counts for the current and incoming data, and requires a separate confirmation. The server binds a short-lived token to the exact file bytes and to a content fingerprint of the database as reviewed. If anything changed in between — including an edit that leaves the row counts identical — the commit re-checks that fingerprint inside the restore transaction and aborts with 409 rather than overwriting newer data. A changed file, unsupported schema or legacy `.sql` upload is also rejected. A validated file is not a substitute for ingress authentication. Keep a copy of the current data before replacing it.
- Browser backup and restore are limited to 50 MiB of UTF-8 JSON. An oversized export fails instead of downloading a partial file. For larger databases, use an offline SQLite-aware backup (SQLite backup API or `VACUUM INTO`) against a stopped/quiescent app, and restore into a **separate** volume for verification before swapping. Do not copy only the open `.db` file: WAL files (`*.db-wal`, `*.db-shm`) live beside it. See [the VPS runbook](deploy/README.md) for retention and recovery. Legacy SQL files must be converted offline on an isolated copy; the API never executes uploaded SQL.
- Before deploying schema v4, stop the app and take an offline SQLite-aware backup with its WAL data, verify a copy, and retain the pre-upgrade v3 file. To roll back the app, stop it and restore that old DB on a **copy of the volume** before switching volumes; do not down-migrate a live DB. Originating-lesson links written after migration cannot be read by the v3 app and will not survive a v3 rollback.

## Deploy

Anywhere Node 22+ runs with persistent disk: Docker volume, Railway / Fly volume, VPS.
The app does **not** work on Vercel / Netlify / Cloudflare Pages because of the `node:sqlite` requirement (NFR-5).

The checked-in [Dockerfile](Dockerfile) builds a Node 22 **standalone** Next.js image. Its non-root runner executes `node server.js` on internal port **12213**, with SQLite at `/data/interview_sessions.db` on a persistent volume (including WAL/SHM sidecars). The [Compose/Caddy sample and operator runbook](deploy/README.md) put the app on an isolated Docker network with no published app port; only Caddy serves HTTPS with owner authentication. Do not use `docker run -p 12213:12213` on a public VPS. With a host-installed proxy instead, publish only `127.0.0.1:12213:12213` and restrict access with a firewall.

Set `PUBLIC_ORIGIN` to the exact external HTTPS origin at **runtime**. `NEXT_PUBLIC_PROVIDER_ENABLE` and other `NEXT_PUBLIC_*` settings are embedded at **build time**; rebuild to change them. Keep `ALLOW_PRIVATE_BASE_URL=0` on a VPS. The Caddy password hash and any other operator secrets must not be committed, baked into the image, or put in `NEXT_PUBLIC_*`. Docker's internal healthcheck talks directly to the container loopback, not through the authenticated public proxy. See the runbook for TLS setup, firewall checks, secret rotation/recovery, and SQLite-safe backups; **do not publish a real-data VPS yet** until the T-01 proxy smoke checks, T-02 restore drill, T-03 and T-07 release gates are complete.

## Requirements coverage

| ID      | Where                                     |
| ------- | ----------------------------------------- |
| FR-1    | `app/new/page.tsx` (5 core inputs)        |
| FR-2/3  | `lib/pdf.ts`, `app/new/page.tsx`          |
| FR-4    | `lib/prompts.ts` system prompt            |
| FR-5/6  | `app/api/sessions/[id]/messages/route.ts` (SSE) |
| FR-7/8  | `app/session/[id]/page.tsx` (counter + early stop) |
| FR-9    | `app/report/[id]/page.tsx` (4 pillars)    |
| FR-10   | `MAX_ANSWER_CHARS=4000` in `lib/validate.ts` |
| FR-11   | SQLite-backed hydration in `app/session/[id]` |
| FR-12/13| `app/page.tsx` (BYOK)                     |
| FR-14/16| `app/page.tsx` (model mgmt)               |
| FR-15   | `lib/validate.ts::validateCustomBaseUrl`  |
| FR-17   | `lib/zod-schemas.ts::parseEvaluation`     |
| FR-18/19| `lib/db.ts`, `app/history/page.tsx`       |
| FR-20   | `app/api/sessions/[id]/route.ts` (server-driven) |
| NFR-1   | SSE + `streaming-cursor` CSS              |
| NFR-2/10| BYOK security model above                 |
| NFR-3   | `error.message` propagates from `/api/.../messages` |
| NFR-5   | `runtime = "nodejs"` everywhere; Docker |
| NFR-8   | `validateCustomBaseUrl`                   |
| NFR-11  | "single-tenant" callouts in footer + history |
| NFR-12  | `lib/db.ts` (node:sqlite sync)            |
