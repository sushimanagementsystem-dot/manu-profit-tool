# Phase 0 — Repository Audit and Foundations

**Status:** Audit done (2026-10-23). The foundation tasks wait for approval.

## Objective
Get the repo into a safe, buildable, documented baseline before any feature work.

## Scope
- Audit (done: `docs/REPOSITORY_AUDIT.md`) and the planning docs (done: `docs/`).
- Commit the current state (KI-01) on a feature branch, with no `.env`.
- Scrub `frontend/.env.example` (KI-04).
- Fix `pnpm lint` in the frontend (KI-03, after the dependency is approved).
- Pin the Node version and the package-manager versions for both apps (KI-06).
- Add a root `docker-compose.dev.yml` with Postgres 17 only (no app containers yet).

**Exclusions:** no feature code, no deletion of old integrations, no n8n changes.

## Dependencies
Approval of this plan and of the dependency list in ADR-013.

## Frontend tasks
- Add `eslint-config-prettier` + `prettier` (approval needed).
- Replace the n8n URL and secrets in `.env.example` with placeholders.

## Backend tasks
- Pin `engines.node`.
- Add `.env.example` with placeholders.

## Database changes
None. The compose file only provides an empty Postgres for Phase 1.

## n8n workflows
None.

## API endpoints
None.

## Testing requirements
`pnpm build` + `pnpm test` (frontend: 24 tests) and `pnpm build` + `pnpm test` (backend scaffold) are green.
`pnpm lint` is green in both apps.

## Acceptance criteria
- A clean `git status` after the commit.
- Lint, build and test pass in both apps.
- No secrets or real hostnames in tracked files.
- `docker compose -f docker-compose.dev.yml up` starts Postgres.

## Risks
Accidentally committing `.env` (mitigated: `.env*` is gitignored; verify with `git check-ignore`).

## Deliverables
A baseline commit, a fixed lint, pinned versions, a dev compose file, and the docs set.
