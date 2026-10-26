# Phase 10 — Security, Automatic Cleanup, Testing, Deployment, and Operations

**Status:** Planned. The basic cleanup cron and the token guard ship earlier (prototype). This phase completes and
verifies them.

## Objective
A deployable, secure, self-cleaning service with monitoring and a runbook.

## Scope
- **Cleanup** (SECURITY_AND_RETENTION.md §5):
  - the 15-min expiry cron;
  - the raw-file pass;
  - the daily orphan sweep;
  - failure retries and alerts;
  - the tombstone purge after 7 days;
  - the optional "extend 24 h".
- **Security hardening:**
  - a route-table-driven authorization test suite;
  - rate-limit tuning;
  - security headers and CSP on the frontend;
  - a dependency audit (`pnpm audit`);
  - secret rotation;
  - privacy and retention notice copy in the UI.
- **Deployment:**
  - Dockerfiles for the backend (and the frontend if self-hosted);
  - `docker-compose.prod.yml` (backend, postgres, optionally the frontend);
  - reverse proxy with TLS;
  - `prisma migrate deploy` on release;
  - health checks;
  - a Postgres backup job (7-day rotation, encrypted).
- **CI:** GitHub Actions running lint, typecheck, unit and integration tests with Postgres, and builds.
- **Operations:**
  - structured logs with 14-day rotation;
  - uptime check on `/health`;
  - an Anthropic spend alert;
  - weekly cost review;
  - a runbook (stuck jobs, failed cleanup, n8n down, key rotation, restore from backup).

**Exclusions:** multi-region, autoscaling, SOC2-style processes.

## Dependencies
All previous phases.

## Frontend tasks
Privacy and retention notice, the expiry countdown, the delete confirmation, and the CSP/headers config in
`next.config.ts` (check the Next 16 docs first).

## Backend tasks
As in Scope.

## Database changes
Indexes reviewed with `EXPLAIN` on the cleanup and status queries. No schema changes are expected.

## n8n workflows
Final host settings verified (execution pruning, production URLs).

## API endpoints
None new.

## Testing requirements
- The full TESTING_STRATEGY.md suite.
- Time-travel cleanup tests.
- A restore-from-backup drill.
- A load test on DS-9 × 3 concurrent jobs.

## Acceptance criteria
- An expired job leaves no rows and no files (verified).
- Every endpoint passes the cross-job and expired-access tests.
- A deploy from a clean checkout works by following the README.
- Backups restore.

## Risks
A single-instance assumption (documented, with the pg-boss and S3 upgrade path).

## Deliverables
A production deployment, CI, the runbook, and a verified retention policy.
