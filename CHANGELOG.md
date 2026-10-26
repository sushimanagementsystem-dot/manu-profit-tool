# Changelog

All notable changes to this repository. Frontend-internal history before 2026-10-23 is in
`frontend/changes.md`.

## [Unreleased]

### 2026-10-26 — Release 1 implementation (frontend + backend)
- **Added (backend):** the Menu Profit API on NestJS 11 + Prisma 7 + PostgreSQL. Modules: config,
  prisma, storage, files, parsing, extraction, normalization, matching, costing (the deterministic
  calculation engine), revisions, chat (Claude tool loop), exports (Excel), processing (task runner,
  pipeline, n8n callbacks), cleanup, health. 46 unit tests.
- **Added (frontend):** typed API client and job-token session helper; the upload card now talks to
  the backend with multiple files per category and per-file progress; new `/analysis/[jobId]`
  workspace with progress, summary, assistant chat with confirmable corrections, Excel download and
  retention controls.
- **Changed:** `app/layout.tsx` metadata; `NEXT_PUBLIC_API_URL` now points at the backend.
- **Fixed:** token-set similarity scored a name as identical to a longer name containing it, which
  would have auto-accepted "Chicken Wings" as "Chicken Wings Large".
- **Not changed:** the legacy `/api/audits` routes, the JSON store, the login stub and the old n8n
  workflow are all still present, pending approval to remove (ADR-020). n8n workflows are deferred
  by agreement, so PDF and photo uploads are rejected with an explanation.

### 2026-10-23 — Release 1 scope narrowed
- **Changed (docs only):** Release 1 is now upload → backend/n8n processing → chat corrections → Excel download.
  The results dashboard, costing editor, match-review screen and PDF move to Release 2. See ADR-022 and the
  "Release 1 scope" section of MASTER_PLAN.md.

### 2026-10-23 — Restructure and Menu Profit planning
- **Changed:** moved the Next.js app from the repo root into `frontend/`, reinstalled its dependencies, and
  verified `pnpm build` and `pnpm test` (24/24). `node_modules` and `.next` were regenerated rather than moved.
- **Added:** `backend/`, a fresh NestJS 11 scaffold (`@nestjs/cli@11`; `@latest` crashed on Node 22.14).
- **Added:** the planning set in `docs/` (audit, vision, architecture, database schema, API spec, n8n workflows,
  security and retention, testing, budget and scope, decisions, known issues, progress, development workflow,
  and phase docs 00–10), plus the root `README.md`.
- **Not changed:** no application code, no n8n workflows, no deletions of the legacy integration. Those wait for
  plan approval.
