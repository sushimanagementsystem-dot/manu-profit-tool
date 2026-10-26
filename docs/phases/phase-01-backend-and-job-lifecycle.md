# Phase 1 — Backend Architecture and Analysis-Job Lifecycle

**Status:** Planned. This is the **first implementation milestone (M1)**.

## Objective
A running NestJS API with config, Prisma/Postgres, error format, throttling, and a secure job lifecycle (create,
read status, submit stub, delete) that the frontend can call.

## Scope
- `config/`: env validated with zod (`DATABASE_URL`, `PORT=4000`, `FRONTEND_ORIGIN`, secrets). The app fails on
  boot if any is missing.
- `prisma/`: Prisma 7 setup and the first migration with `AnalysisJob` and `JobEvent`.
- `common/`: the problem+json exception filter, request IDs, the JSON logger (Nest 11 `ConsoleLogger` json mode),
  `JobAccessGuard`, throttler, CORS allowlist, and security headers.
- `jobs/`: `POST /jobs` (token generation + hash), `GET /jobs/:id`, `DELETE /jobs/:id`, and a state-machine
  service with allowed-transition checks. `POST /jobs/:id/submit` only moves the job to QUEUED in this phase.
- `health/`.

**Exclusions:** files, parsing, n8n, calculations.

## Dependencies
Phase 0. Approval of `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`, `zod`, `@nestjs/throttler`,
`@nestjs/schedule`, `helmet`.

## Frontend tasks
- Extend `lib/api.ts` into a typed client: base URL from `NEXT_PUBLIC_API_URL`, bearer token, and problem+json
  parsing into a typed `ApiError`.
- Add a `lib/job-session.ts` helper to store and read job tokens from localStorage (expiry-aware) and parse the
  `#k=` fragment.
- No visual changes.

## Backend tasks
As in Scope. Also: remove the scaffold `AppController`/`AppService` hello-world (it is the backend's own
scaffold, not user work).

## Database changes
Migration `0001_jobs`: `AnalysisJob`, `JobEvent`, and the enums `JobStatus` and `JobEventType`.

## n8n workflows
None.

## API endpoints
`POST /api/v1/jobs`, `GET /api/v1/jobs/:id`, `POST /api/v1/jobs/:id/submit` (state only), `DELETE /api/v1/jobs/:id`,
`GET /api/v1/health`.

## Testing requirements
- **Unit:**
  - token generation and hashing;
  - the guard (valid token, wrong token, missing job, expired job);
  - the state-machine transition table.
- **Integration (real Postgres):**
  - create, then get, then delete;
  - a wrong token returns 404;
  - after deletion the job is a tombstone and returns 410;
  - an idempotent create with the same `Idempotency-Key`.

## Acceptance criteria
- `pnpm start:dev` serves on :4000.
- Calling the API from the frontend dev server works (CORS).
- The token is never logged or returned except by the create call.
- Every error is problem+json.
- All tests pass.

## Risks
Prisma 7 setup differences (mitigated: follow the installed docs); clock and timezone handling (use timestamptz,
UTC everywhere).

## Deliverables
A running API skeleton, migration 0001, the typed frontend API client, and tests.
