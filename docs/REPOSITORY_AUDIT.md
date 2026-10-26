# Repository Audit — Menu Profit

Audit date: 2026-10-23. Everything below was checked against the files themselves. Nothing here is inferred from
older docs without verification.

## 1. Repository layout (current)

```
AI-power-manu-profit-tool/
├── .git/                 single repo for both apps (branch: master; 1 commit: create-next-app scaffold)
├── frontend/             Next.js 16.4.2 app (moved here from the repo root on 2026-10-23)
├── backend/              NestJS 11 scaffold (created 2026-10-23, untouched)
├── docs/                 this planning set (new)
├── README.md             root README (new)
└── CHANGELOG.md          root changelog (new)
```

**Git state.** The move into `frontend/` is not committed. `git status` shows the original root files as
deleted (`D`) and `frontend/` + `backend/` as untracked. Almost all frontend work was never committed either:
the only commit is the create-next-app scaffold. **Commit the current state soon**, before any cleanup, so
there is a restore point. See KNOWN_ISSUES.md (KI-01).

## 2. Frontend audit (`frontend/`)

### Stack (verified in `package.json`)
Next.js 16.4.2 (App Router, Turbopack, `cacheComponents` + `partialPrefetching` on), React 19.3.0, Tailwind v4,
shadcn/ui (`radix-nova`), TanStack Query 5, TanStack Table **v9**, react-hook-form + zod 4, recharts 3, sonner,
lucide-react, Vitest 5. pnpm 10.33.0. `browserslist` is pinned to modern browsers.

### Routes and screens
| Path | File | State |
|---|---|---|
| `/` | `app/(app)/page.tsx` → `BrandHeader` + `NewAuditCard` | **Real UI, keep.** Matches the brand mockup. |
| `/login` | `app/(auth)/login/page.tsx` → `components/auth/login-form.tsx` | Stub: `onSubmit` only shows a toast. **Conflicts with the no-login requirement.** |
| `POST /api/audits` | `app/api/audits/route.ts` | Old integration: validates the files, writes a JSON record, forwards multipart to an n8n webhook. |
| `GET /api/audits/[id]/status` | route handler | Reads the JSON store. |
| `POST /api/audits/[id]/callback` | route handler | n8n posts the result plus a report file here. Shared-secret header, compared with `!==`. |
| `GET /api/audits/[id]/report` | route handler | Serves the stored report. Access is "knows the UUID". |

`proxy.ts` checks for a `session` cookie, but the redirect is commented out, so every route is open.

### Components
- `components/audit/brand-header.tsx`: logo and wordmark. **Keep.**
- `components/audit/new-audit-card.tsx`: three upload slots with colored badges and dropzones, drag-and-drop,
  file list with remove, client-side validation, a submit state, and status polling through React Query (every
  2 s until a terminal status). **Keep the UI.** Replace its data layer: it calls `/api/audits` (Next route
  handlers), the menu and POS slots accept only one file, and it has no per-file upload progress.
- `components/audit/audit-status-banner.tsx`: status banner for 5 statuses with a download button. **Keep and
  extend** to cover the new statuses.
- `components/providers.tsx`: React Query, Tooltip, and Toaster. **Keep.**
- `components/ui/*`: vendored shadcn primitives. `button`, `card`, `input`, `label`, `separator`, `sonner`, and
  `tooltip` are used. `table`, `chart`, `skeleton`, and `sheet` are unused today but are needed for the results UI,
  so keep them. `avatar`, `dropdown-menu`, and `sidebar` are unused; delete them only after approval.

### Libraries / logic
- `lib/api.ts`: `apiFetch<T>()` with a base URL taken from `API_BASE_URL` / `NEXT_PUBLIC_API_URL`. Unused.
  **Keep and grow** it into the typed API client.
- `lib/query-client.ts`, `lib/utils.ts`, `hooks/use-mobile.ts`: keep.
- `lib/audit/types.ts`: `AuditStatus`, `SLOT_CONFIG` (MIME allow-lists, 10 MB), `isValidAuditId`. Keep the slot
  config idea and replace the status types with the backend's contract.
- `lib/audit/validate-upload.ts`: keep as a client-side pre-check. The backend becomes authoritative.
- `lib/audit/calculations.ts` + `.test.ts`: deterministic GP formulas with a confidence flag (`verified` /
  `estimated` / `incomplete`). The test file has 13 cases. **Port the formulas and tests to the backend
  calculation engine**, then remove them from the frontend.
- `lib/audit/store.ts`: JSON-file store under `.data/`. **Obsolete:** not safe across processes.
- `lib/audit/env.ts`: reads the `N8N_*` env vars. **Obsolete:** the browser app must not talk to n8n.

### Tests
`pnpm test` (Vitest): **2 files, 24 tests, all passing** (verified 2026-10-23). They are `calculations.test.ts`
and `app/api/audits/audit-flow.test.ts`, which is an end-to-end test of the old route handlers. The second one
goes when those routes are retired.

### Build / lint
`pnpm build` passes. `pnpm lint` **fails**: `eslint.config.mjs` imports `eslint-config-prettier`, which is not in
`package.json`. This was there before the move (KI-03).

### Environment
`.env.example` holds `API_BASE_URL`, `NEXT_PUBLIC_API_URL`, `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, and
`N8N_CALLBACK_SECRET`. Issues:
- `.env.example` contains a **real n8n host URL** (an IP-based `sslip.io` host, pointing at `/webhook-test/`) and
  the placeholder secret value `x-webhook-secret`. The file is untracked today. Scrub it before it is ever
  committed (KI-04).
- The real `.env` has long, distinct secrets (checked by length and equality only; values were not printed).
- After the redesign, the frontend needs only `NEXT_PUBLIC_API_URL`. All `N8N_*` variables move to the backend.

### Docs inside `frontend/`
`CLAUDE.md` (stack conventions; it still mentions a `(dashboard)` group and "no test runner", both stale),
`AGENTS.md` (Next.js agent rules), `changes.md` (change log, entries 1–11, plus a self-declared backlog of
undocumented "Phase 1 backend" work), `flow.md` (request flow; **stale**: it describes the deleted
`audit-completed-banner` and the setTimeout simulation), `README.md` (create-next-app default), and
`n8n/README.md` (setup for the old workflow). Keep all of them. Their Menu Profit planning content now lives in
`docs/`.

## 3. Backend audit (`backend/`)

A fresh `nest new` scaffold: NestJS **11**, Express platform, Jest, ESLint and Prettier. It contains only
`AppController`/`AppService` ("Hello World") and listens on `PORT ?? 3000`, **which clashes with Next.js on 3000**
(KI-02). There is **no Prisma, no schema, no database, no config module, and no Docker setup**. `pnpm build` passes.

Note: `@nestjs/cli@latest` crashed on Node 22.14 (`ERR_REQUIRE_CYCLE_MODULE`), so CLI v11 was used (KI-06).

## 4. Prisma / database

There is **no Prisma schema anywhere in the repo** and no `DATABASE_URL`. The brief describes PostgreSQL +
Prisma as the intended stack, but nothing exists yet. The schema in `DATABASE_SCHEMA.md` is therefore new. No
migrations exist, so none can be destructive.

## 5. n8n integration audit

- `frontend/n8n/menu-profit-workflow.json` is named "Menu Profit Audit" and has 24 nodes: Webhook → Validate
  Secret → Respond Accepted → Parse Spreadsheet Files (Code, `require('xlsx')`) → IF needs AI → HTTP Request to
  Claude → parse → **Match Ingredients & Sales (substring matching)** → **Calculate Profitability (Code node,
  which duplicates `calculations.ts`)** → 6 × **Google Sheets** writes → Generate Excel (Code, `exceljs`) →
  callback to Next.js.
- Why this design is obsolete:
  - Financial math runs inside n8n, which conflicts with the rule that the backend is the source of truth.
  - Google Sheets is used as a data store. Restaurant data ends up outside our retention control, and rows
    collide across audits.
  - It needs `NODE_FUNCTION_ALLOW_EXTERNAL` (self-hosted only).
  - It has no idempotency and no per-job isolation.
- **Nothing in it is reused as product logic**, as the brief instructs. The only lessons carried forward are that
  the Claude extraction prompt shape is a starting point and that the callback pattern should be HMAC-signed.

## 6. Reuse summary

| Keep as-is | Keep, but rewire / extend | Port to backend, then remove | Retire after approval |
|---|---|---|---|
| `globals.css` tokens, `(app)/layout.tsx`, `(app)/page.tsx`, `brand-header`, `providers`, `query-client`, `utils`, `use-mobile`, shadcn primitives | `new-audit-card` (multi-file per category, progress, backend client), `audit-status-banner` (new statuses), `lib/api.ts` (typed client + token), `validate-upload`/`SLOT_CONFIG` (limits from backend), `app/layout.tsx` metadata | `lib/audit/calculations.ts` + its tests | `app/api/audits/**` + `audit-flow.test.ts`, `lib/audit/store.ts`, `lib/audit/env.ts`, `.data/`, `N8N_*` frontend env, `proxy.ts` session gate, `(auth)/login` + `login-form`, old `n8n/` workflow + README, unused `avatar`/`dropdown-menu`/`sidebar` |

## 7. What must be built

Everything on the backend: the job lifecycle, storage, parsers, the extraction orchestration, normalization,
matching, the calculation engine, revisions, chat, exports, cleanup, and security. On the frontend: the
analysis workspace route (status and review, results, costing editor, chat, downloads). On n8n: three new
workflows (see N8N_WORKFLOWS.md).
