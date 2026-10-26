# Development Workflow

## Repo layout
`frontend/` (Next.js 16, pnpm, Vitest), `backend/` (NestJS 11, pnpm, Jest), `docs/`, and later `n8n/workflows/`,
`test-data/`, `docker-compose.*.yml` at the root. Each app has its own `package.json` and lockfile. A pnpm
workspace may come later if shared packages are needed, and that needs approval.

## Local setup (target state after M1; not all of this exists yet)
```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres 17 on :5432  (planned)
cd backend  && pnpm install && cp .env.example .env && pnpm prisma migrate dev && pnpm start:dev   # :4000
cd frontend && pnpm install && cp .env.example .env && pnpm dev                                    # :3000
```
`NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`. Without n8n, run the backend with `N8N_MODE=fake` (Phase 9),
which replays the fixtures.

## Branching and commits
- `main` is the release branch. Work happens on `feat/<phase>-<topic>` and merges by PR, with CI green.
- One phase is delivered as several PRs. Each PR updates PROGRESS.md and CHANGELOG.md, plus the relevant spec doc
  if the behavior changed.
- Destructive changes (deleting legacy code, data migrations that drop columns) need an explicit approval note in
  the PR description.

## Conventions
- **Frontend:** follow `frontend/CLAUDE.md`:
  - read the Next 16 docs in `node_modules/next/dist/docs/` before touching routing or caching;
  - use design tokens, never hardcoded colors;
  - TanStack Table v9 API;
  - no new dependency without approval.
- **Backend:**
  - one Nest module per domain (ARCHITECTURE.md §3);
  - DTOs validated with zod;
  - every job-scoped query filters by the guard-provided `jobId`;
  - money is always `Decimal`;
  - no logging of document content.
- **Docs:** specs in `docs/` are the contract. Change the spec in the same PR as the behavior.
- **AI prompts and schemas** are versioned in code (`backend/src/extraction/prompts/`, `schemas/`) and mirrored in
  the n8n workflow JSON. Bump `schemaVersion` on any change.

## Definition of done (per task)
Lint, typecheck and tests are green. The acceptance criteria in the phase doc are met. Docs and the changelog are
updated. Logs contain no sensitive data.
