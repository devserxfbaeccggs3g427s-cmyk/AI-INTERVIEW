# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Run and verify

Requires Node >=22.5 and persistent local disk (`node:sqlite`). Use `npm ci` to install dependencies. See `.env.example` for optional environment overrides; `npm run dev` serves at http://localhost:3000.

```bash
npm run dev             # development server
npm run build           # production build
npm start               # serve the production build
npm run typecheck       # tsc --noEmit
npm test                # all node:test suites
npm run lint            # next lint; currently prompts for configuration (no ESLint config)
```

Run one test file with `npx tsx --test lib/evaluation.test.ts` (or another `lib/*.test.ts` / `lib/providers/*.test.ts` file). Run a named test with `npx tsx --test --test-name-pattern="<pattern>" lib/providers/custom.test.ts`. Network tests use plain Node: `node --test lib/net/url-policy.test.mjs`, optionally with `--test-name-pattern="<pattern>"`. Keep the `.mjs`/TypeScript test split: the network tests accommodate extensionless imports from the app's bundler-resolved modules, including a test-only resolver hook.

## Architecture

This is a single-tenant, unauthenticated Next.js 14 App Router application. Client pages configure a bring-your-own-key provider (`/`), create an interview (`/new`), stream the conversation (`/session/[id]`), show its report (`/report/[id]`), and manage history (`/history`). `components/ByokConfigContext.tsx` owns browser-side provider settings and the API key; the key is sent with requests, not stored in SQLite. Server-side `app/api/` route handlers validate inputs, call providers, and persist state. Routes and server-only modules require the Node runtime; this app cannot run on edge/serverless hosts without persistent disk.

`lib/db.ts` owns the process-level SQLite connection, schema/migration, WAL, and foreign keys. It stores sessions, turns, CV text, reports, provider configuration snapshots, and evaluation attempts. Session creation accepts pasted CV or server-side PDF extraction (`lib/pdf.ts`); PDF bytes are not retained. The session page hydrates saved turns and uses `lib/useStreamingChat.ts` to consume SSE. `app/api/sessions/[id]/messages/route.ts` builds context from persisted turns, streams the next question, optionally obtains coaching feedback, and saves turns transactionally; persisted turn counts govern progress rather than client counters.

Provider parsing and availability live in `lib/providers/parse.ts`; dispatch is in `lib/providers/index.ts`, with vendor adapters under `lib/providers/`. Session provider/model/custom-destination settings are locked by `lib/providers/session-config.ts`. Hosted providers use fixed endpoints; the custom OpenAI-compatible provider alone uses `lib/net/guarded-transport.ts` and `lib/net/url-policy.ts` for destination/address validation and constrained outbound traffic. `NEXT_PUBLIC_PROVIDER_ENABLE` defaults to the three hosted providers; enabling `custom` requires explicitly adding it and restarting development or rebuilding production. `ALLOW_PRIVATE_BASE_URL=1` allows private/loopback custom endpoints but not link-local/metadata addresses; avoid exposing this unauthenticated instance publicly, particularly its admin database routes.

Interview state is persisted (`active → evaluating → completed/failed`). The final answer or early stop starts evaluation via `lib/evaluation.ts`; a failed/stale evaluation can be retried through the evaluate route. Evaluation claims and attempt IDs guard against overlapping runs. Its report-specific token budgets and stale window are in `lib/evaluation-constants.ts` (not the session generation settings); `lib/zod-schemas.ts` validates the four-pillar report before storage. Raw model blocks are redacted by `safeRawBlocks()` before persistence. `lib/env.ts`, `lib/pdf.ts`, and server provider modules must not be imported into client components.

`stitch-screens/screens/00-requirements.md` is the detailed FR/NFR specification; `stitch-screens/01-design-system.md` and the screen captures are the UI references. `README.md` documents the API surface and deployment/security model. The nested `.claude/worktrees/` checkout, if present, is a separate Git worktree and does not describe this root checkout.
