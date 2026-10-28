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
| KI-12 | ~~The AI assistant has never run against the real model~~ | — | **Resolved 2026-10-27**: the key is set, `/health` reports `assistant: true`, and the chat was driven end to end through the UI — a question, a recipe + VAT correction, Apply, and a multi-turn follow-up. Figures hand-checked (see PROGRESS.md). | ✅ |
| KI-13 | ~~PDF and photo uploads fail during extraction~~ | — | **Resolved 2026-10-27**: MP-01 is deployed and published on the n8n host. A real PDF invoice and a photographed menu both went upload → dispatch → Claude → callback → ingest → READY, each on the first attempt. Rebuild either document from `n8n/fixtures/samples/`. | ✅ |
| KI-14 | No integration tests against `menu_profit_test`, and only one mock dataset. | Regressions in routing, guards and cascade deletes would not be caught. | Phase 10; datasets DS-2…DS-10 in TESTING_STRATEGY.md. | ⬜ |
| KI-15 | `AnalysisJob.idempotencyKey` exists in the schema but nothing sets it. | Dead column; a retried `POST /jobs` creates a second job. | Either wire up the `Idempotency-Key` header or drop the column in the next migration. | ⬜ |

## Opened 2026-10-27
| ID | Issue | Impact | Status / fix | Done |
|---|---|---|---|---|
| KI-16 | ~~Every upload slot read "Loading…" until the first file was picked~~ | — | **Resolved 2026-10-27**: the limits rode on the draft-job response, and the draft job is deliberately created only on the first file, so nothing was ever loading. Added `GET /upload-limits` and the upload screen now fetches it on mount. Found by driving the UI with Playwright. | ✅ |
| KI-17 | If `GET /upload-limits` fails, the slots keep the "Loading…" label indefinitely. | Cosmetic, and only when the API is unreachable — in which case uploads fail anyway. The server still enforces every rule. | Give the upload screen a visible "cannot reach the server" state instead of a per-slot label. | ⬜ |
| KI-18 | `GET /jobs/:id` reports `progress.stage: CALCULATING, percent: 99` after `status` has become `READY`. | API-only cosmetic inconsistency; the UI switches on `status`, so nothing is shown wrong. | Clear or complete the progress record when the pipeline finishes. | ⬜ |
| KI-19 | The analysis treats menu prices as VAT-inclusive but POS "Net Sales" as VAT-exclusive, so per-portion GP (€11.79) and realised GP per unit (€10.51) differ for the same dish. | Defensible — "net sales" normally means net of VAT — but a client may ask why the two figures disagree. | Confirm with the first real client which basis their POS export uses, and state the assumption in the Summary sheet. | ⬜ |
| KI-20 | `AnalysisJob.aiUsage` is only written by the n8n callback (`N8nCallbackController.recordUsage`), which never fires while MP-01 does not exist, and the chat path does not write it at all. | Per-job AI spend cannot be reported, so the budget in BUDGET_AND_SCOPE.md stays an estimate. Chat token counts are logged per call (2026-10-27) but not stored. | Accumulate the chat usage into `aiUsage` in `ChatService.send`, reusing `recordUsage`'s shape. | ⬜ |
| KI-21 | On the upload screen the slots read "Loading…" for 5–20 s before they accept a file, even against a local backend whose `/upload-limits` answers in under a second. | A client sees disabled-looking slots on their first visit. Reproduced locally, so it is the frontend (when the request starts or how it is awaited), not the network. Not investigated yet. | Find why the fetch resolves late; add a retry and a visible "cannot reach the server" state (see KI-17). | ⬜ |
| KI-22 | A change asked for in the chat still needs the client to press Apply; only edits made directly in the results table apply at once. | Deliberate: the assistant is an AI and nothing it proposes may change the figures unconfirmed. The "update as soon as I ask" experience therefore has one extra click. | Offer auto-apply for low-risk, single-value changes if clients ask for it. | ⬜ |
| KI-23 | During hand-testing of the editable table one extra revision appeared (cost set to 5.20) that none of the scripted steps made. | Never reproduced in later runs; the browser event log shows a save only ever follows Enter or the Save button. Probably the test harness, but it was not proved. | Add an integration test that drives the editor with real key events, and watch the revision log in the next manual run. | ⬜ |
