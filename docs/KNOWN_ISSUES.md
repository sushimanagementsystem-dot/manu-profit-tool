# Known Issues

| ID | Issue | Impact | Status / fix | Done |
|---|---|---|---|---|
| KI-01 | ~~Work uncommitted~~ | — | **Resolved 2026-10-26**: baseline commit + cleanup commit on `master`. | ✅ |
| KI-02 | ~~NestJS defaulted to port 3000, clashing with `next dev`~~ | — | **Resolved 2026-10-26**: the validated config defaults `PORT` to 4000. | ✅ |
| KI-03 | ~~`pnpm lint` fails on a missing `eslint-config-prettier`~~ | — | **Resolved 2026-10-26**: added `eslint-config-prettier` + `prettier`; lint is clean. | ✅ |
| KI-04 | ~~`frontend/.env.example` held a real n8n host URL and a placeholder secret~~ | — | **Resolved 2026-10-26**: scrubbed; the frontend now needs only `NEXT_PUBLIC_API_URL`. The old n8n secrets still need rotating when the new workflows go live. | ✅ |
| KI-05 | ~~`proxy.ts` gate and `/login` stub contradict the no-login product~~ | — | **Resolved 2026-10-26**: both removed. | ✅ |
| KI-06 | `@nestjs/cli@latest` crashes on Node 22.14 (`ERR_REQUIRE_CYCLE_MODULE`); CLI v11 was used | Tooling | Pin the Node version (`.nvmrc` / `engines`, e.g. Node 24 LTS) and the CLI version in the backend | Phase 0 |
| KI-07 | ~~`flow.md` / `CLAUDE.md` stale~~ | — | **Resolved 2026-10-26**: both rewritten for the current structure. | ✅ |
| KI-08 | ~~The old callback route compared secrets with `!==`; report access was UUID-only~~ | — | **Resolved 2026-10-26**: those routes are deleted. The new API uses HMAC with a timestamp and a timing-safe compare, and per-job bearer tokens. | ✅ |
| KI-09 | ~~`app/layout.tsx` metadata still "Create Next App"~~ | — | **Resolved 2026-10-26**. | ✅ |
| KI-10 | ~~Single file per category, no upload progress~~ | — | **Resolved 2026-10-26**: multi-file per category with per-file progress and retry. | ✅ |
| KI-11 | ~~Old n8n workflow does its own financial math and writes to Google Sheets~~ | — | **Partly resolved 2026-10-26**: archived to `docs/archive/legacy-n8n/` and no longer referenced. Still to do: deactivate it on the n8n host, delete the Google Sheet data, and rotate its secrets. | 🟡 |

## Opened 2026-10-26
| ID | Issue | Impact | Status / fix | Done |
|---|---|---|---|---|
| KI-12 | The AI assistant has never run against the real model: `ANTHROPIC_API_KEY` is not set. | Chat and chat-driven corrections — the only correction channel in Release 1 — are unverified. `/health` reports `assistant: false`. | Set the key in `backend/.env`, then run the scripted questions in TESTING_STRATEGY.md §4. | ⬜ |
| KI-13 | PDF and photo uploads are accepted at the upload step but fail during extraction, because the n8n workflows do not exist. | Clients who only have PDF invoices cannot complete an analysis. The message tells them to upload CSV/Excel instead. | Build MP-01/02/99 per docs/N8N_WORKFLOWS.md, or reject those types at upload until then. | ⬜ |
| KI-14 | No integration tests against `menu_profit_test`, and only one mock dataset. | Regressions in routing, guards and cascade deletes would not be caught. | Phase 10; datasets DS-2…DS-10 in TESTING_STRATEGY.md. | ⬜ |
| KI-15 | `AnalysisJob.idempotencyKey` exists in the schema but nothing sets it. | Dead column; a retried `POST /jobs` creates a second job. | Either wire up the `Idempotency-Key` header or drop the column in the next migration. | ⬜ |
