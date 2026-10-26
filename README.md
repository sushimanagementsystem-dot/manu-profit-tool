# Menu Profit — Hospitality Audits

A no-account web tool that analyses a restaurant's **menu**, **supplier invoices** and **POS sales reports** to
produce a sales and gross-profit analysis with data-quality flags and prioritized recommendations. Clients review
uncertain matches, edit costing, chat with an AI assistant to explore and approve changes, and download **Excel**
and **PDF** reports. Data is temporary: by default it is deleted 48 h after submission.

> **Implementation status (2026-10-23):** planning stage.
>
> | Area | Exists today | Planned |
> |---|---|---|
> | Frontend | Upload UI (brand design), wired to a legacy prototype flow | Everything else in this README |
> | Backend | NestJS scaffold | Everything else in this README |
>
> See [docs/PROGRESS.md](docs/PROGRESS.md).

## Architecture (planned)
- **frontend/**: Next.js 16 (App Router), Tailwind v4, shadcn/ui, TanStack Query and Table, recharts.
- **backend/**: NestJS 11 REST API. It is the source of truth for job state, validation, calculations, revisions,
  chat and exports.
- **PostgreSQL 17 + Prisma 7**: job-scoped data with cascade deletion.
- **n8n** (self-hosted): three thin workflows that call Claude for document extraction and AI assistance and
  report back through signed callbacks.
- **Anthropic Claude**: extraction (structured outputs), suggestions, and chat. It never does the financial
  arithmetic.

Details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The full plan is [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md).

## Repository layout
```
frontend/   Next.js app (see frontend/CLAUDE.md for its conventions)
backend/    NestJS API
docs/       specs, decisions, phase plans
```

## Local development
Current (verified):
```bash
cd frontend && pnpm install && pnpm dev     # http://localhost:3000
cd backend  && pnpm install && pnpm start:dev   # currently also defaults to :3000 (KI-02) — set PORT=4000
```
Target setup after milestone M1: see [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md).

## Environment variables (planned)
| App | Variable | Purpose |
|---|---|---|
| frontend | `NEXT_PUBLIC_API_URL` | Backend base URL, e.g. `http://localhost:4000/api/v1` |
| backend | `DATABASE_URL`, `PORT`, `FRONTEND_ORIGIN`, `STORAGE_ROOT` | Core |
| backend | `ANTHROPIC_API_KEY` | Chat |
| backend | `N8N_BASE_URL`, `N8N_EXTRACT_PATH`, `N8N_ASSIST_PATH`, `N8N_INBOUND_KEY`, `N8N_REQUEST_SECRET`, `N8N_CALLBACK_SECRET`, `N8N_FILE_URL_SECRET`, `PUBLIC_API_BASE_URL` | n8n integration |
| backend | `DOWNLOAD_TOKEN_SECRET` | Export download links |

The frontend's current `N8N_*` variables belong to the legacy flow and will be removed (KI-04, Phase 9).

## n8n setup
See [docs/N8N_WORKFLOWS.md](docs/N8N_WORKFLOWS.md). The workflow JSON will live in `n8n/workflows/` (Phase 3/9).
The legacy `frontend/n8n/` workflow is obsolete and is not reused.

## Testing
- Frontend: `cd frontend && pnpm test` (Vitest).
- Backend: `cd backend && pnpm test` / `pnpm test:e2e` (Jest).
- Strategy and datasets: [docs/TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md).

## Deployment (planned)
Docker Compose on a single VPS (backend + Postgres, alongside the existing n8n), with TLS through a reverse proxy.
See [Phase 10](docs/phases/phase-10-security-cleanup-deploy-ops.md).
