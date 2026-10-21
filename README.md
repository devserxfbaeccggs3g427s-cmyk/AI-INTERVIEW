# AI Mock Interview Studio

A self-hosted web app for software engineers to practice technical interviews with AI.
Bring your own API key (Anthropic, OpenAI, Google Gemini, or any OpenAI-compatible endpoint).
Everything — sessions, transcripts, raw provider blocks, CV extracts, evaluation reports — is persisted in
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
| SQLite (`data/...db`)    | Sessions, turns, CV, evaluations, model configs. **No key.** |
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
| POST   | `/api/sessions`                     | Create session + persist CV |
| GET    | `/api/sessions/[id]`                | Session + turns + CV |
| DELETE | `/api/sessions/[id]`                | Hard delete (cascade) |
| POST   | `/api/sessions/[id]/messages`       | **SSE** — submit answer, stream next question (+ coaching rubric) |
| POST   | `/api/sessions/[id]/evaluate`       | Force evaluation (same runner that fires when `plannedRounds` reached) |
| GET    | `/api/sessions/[id]/report`         | Parsed evaluation report |
| GET    | `/api/sessions/[id]/attempts`       | Scoring audit trail (`?raw=1` includes the model's body) |
| GET    | `/api/admin/db`                     | Path + counters |
| POST   | `/api/admin/db`                     | `wipe-sessions` / `wipe-all` / `vacuum` / `backup` / `import` |
| GET    | `/api/admin/schema`                 | Table list + DDL |

## Security & operations

- The app is **single-tenant and has no application login**. For a VPS, configure `PUBLIC_ORIGIN` and place **every** page, asset and API route behind HTTPS + owner authentication at the reverse proxy; never expose app port 12213. Origin checks on mutations mitigate CSRF but are not authentication. See [the VPS sample](deploy/README.md). Keep the instance private until the [T-07 release gate](specs/interview-studio-improvements/tasks.md) (especially T-02 backup/restore and T-07) is complete.
- `ALLOW_PRIVATE_BASE_URL=1` permits custom endpoints on local/private networks (e.g. Ollama at `http://localhost:11434`) and can expose internal services to anyone able to call this unauthenticated app. Leave it unset in public deployments. Link-local and metadata addresses remain blocked even with opt-in.
- A custom API key is sent directly to the user-selected endpoint; only enter endpoints you trust. The key is not persisted in SQLite, and custom requests never fall back to OpenAI.
- `VACUUM` periodically if you do a lot of wipes. `backup` exports a portable SQL script.
- `import` re-executes the SQL. It does **not** validate the schema — only feed it files you created via `backup`.
- WAL files (`*.db-wal`, `*.db-shm`) live next to the DB; ship all three for crash-safety.

## Deploy

Anywhere Node 22+ runs with persistent disk: Docker volume, Railway / Fly volume, VPS.
The app does **not** work on Vercel / Netlify / Cloudflare Pages because of the `node:sqlite` requirement (NFR-5).

The checked-in [Dockerfile](Dockerfile) builds a Node 22 **standalone** Next.js image. Its non-root runner executes `node server.js` on internal port **12213**, with SQLite at `/data/interview_sessions.db` on a persistent volume (including WAL/SHM sidecars). The [Compose/Caddy sample and operator runbook](deploy/README.md) put the app on an isolated Docker network with no published app port; only Caddy serves HTTPS with owner authentication. Do not use `docker run -p 12213:12213` on a public VPS. With a host-installed proxy instead, publish only `127.0.0.1:12213:12213` and restrict access with a firewall.

Set `PUBLIC_ORIGIN` to the exact external HTTPS origin at **runtime**. `NEXT_PUBLIC_PROVIDER_ENABLE` and other `NEXT_PUBLIC_*` settings are embedded at **build time**; rebuild to change them. Keep `ALLOW_PRIVATE_BASE_URL=0` on a VPS. The Caddy password hash and any other operator secrets must not be committed, baked into the image, or put in `NEXT_PUBLIC_*`. Docker's internal healthcheck talks directly to the container loopback, not through the authenticated public proxy. See the runbook for TLS setup, firewall checks, secret rotation/recovery, and SQLite-safe backups; **do not publish a real-data VPS yet** while the T-02/T-07 release gates remain open.

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
