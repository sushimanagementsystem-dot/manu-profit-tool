# Master Plan — Menu Profit

Current state: **planning complete; awaiting approval. Nothing beyond the audit and these docs has been
implemented.** See PROGRESS.md for live status.

## Release 1 scope (client-confirmed 2026-10-23) — this is what we build first
The client wants exactly four things in the first release:
1. **Upload** files (menu, invoices, POS), using the existing upload UI.
2. **Process** them with the backend and n8n (extraction, matching, calculations).
3. **Correct through chat.** The client tells the AI what is wrong ("the burger costs €14, not €12", "this item is
   the Chicken Wrap"). The AI proposes the change, the client confirms it in the chat, and the backend validates
   and recalculates.
4. **Download** the result file (Excel).

**Release 1 phases:**

| Phase | Release 1 scope |
|---|---|
| 0, 1, 2, 3 | As written |
| 4 | Automatic matching only. Uncertain matches go to chat and to the Excel "Needs review" sheet. There is no review screen. |
| 5 | As written; the engine is needed so that corrections are correct |
| 7 | Simplified chat: answers plus correction proposals with a Confirm button |
| 8 | Excel only |
| 9 | MP-01, MP-02 and MP-99 |
| 10 | Basic: token, upload checks, 48 h cleanup |

**Deferred to Release 2:**
- Phase 6 (results dashboard, costing editor, matrix chart);
- the match-review screen;
- the PDF report;
- SSE status updates;
- historical menu versions.

See ADR-022.

## Document map
| Doc | Purpose |
|---|---|
| [REPOSITORY_AUDIT.md](REPOSITORY_AUDIT.md) | What exists, what is reused, what is obsolete |
| [PROJECT_VISION.md](PROJECT_VISION.md) | Product, journey, principles, rules to confirm |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, responsibilities, pipeline, formulas |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | Prisma entities, keys, precision, lifecycle |
| [API_SPECIFICATION.md](API_SPECIFICATION.md) | REST endpoints, schemas, errors, idempotency, limits |
| [N8N_WORKFLOWS.md](N8N_WORKFLOWS.md) | MP-01 / MP-02 / MP-99 specs |
| [SECURITY_AND_RETENTION.md](SECURITY_AND_RETENTION.md) | Threat model, token flow, retention, cleanup |
| [TESTING_STRATEGY.md](TESTING_STRATEGY.md) | Layers, datasets DS-1…10, thresholds |
| [BUDGET_AND_SCOPE.md](BUDGET_AND_SCOPE.md) | Prototype vs MVP, effort, AI and hosting costs |
| [DECISIONS.md](DECISIONS.md) | ADR-001…021 + open decisions |
| [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) | Branching, local setup, conventions |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | KI-01…11 |
| [PROGRESS.md](PROGRESS.md) | Phase status tracker |

## Phases
| # | Phase | Prototype? | Doc |
|---|---|---|---|
| 0 | Repository audit and foundations | ✔ | [phase-00](phases/phase-00-audit-and-foundations.md) |
| 1 | Backend architecture and analysis-job lifecycle | ✔ | [phase-01](phases/phase-01-backend-and-job-lifecycle.md) |
| 2 | File upload, storage, and validation | ✔ | [phase-02](phases/phase-02-upload-storage-validation.md) |
| 3 | Extraction and normalization (+ MP-01, MP-99 v1) | ✔ (no AI column mapping or PDF POS) | [phase-03](phases/phase-03-extraction-and-normalization.md) |
| 4 | Matching and human review (+ MP-02 recipe estimate) | ✔ (deterministic matching only) | [phase-04](phases/phase-04-matching-and-review.md) |
| 5 | Financial calculations and costing | ✔ | [phase-05](phases/phase-05-financial-calculations.md) |
| 6 | Results UI and interactive costing | ✔ (Summary, Sales, Costing, Data quality) | [phase-06](phases/phase-06-results-ui-and-costing.md) |
| 7 | AI chat and approved revisions | ✘ MVP | [phase-07](phases/phase-07-ai-chat-and-revisions.md) |
| 8 | Excel and PDF exports | Excel only | [phase-08](phases/phase-08-excel-and-pdf-exports.md) |
| 9 | n8n final workflows and end-to-end integration | minimal | [phase-09](phases/phase-09-n8n-and-e2e-integration.md) |
| 10 | Security, automatic cleanup, testing, deployment, operations | basic cleanup + guard | [phase-10](phases/phase-10-security-cleanup-deploy-ops.md) |
| 11 | Analysis screen redesign (this one screen only; prototype in [screens/](screens/README.md)) | ✔ prototype done, build pending approval | [phase-11](phases/phase-11-analysis-screen-redesign.md) |

**Adjustments from the brief's suggested order (after the audit):**
- The n8n extraction workflow is built in Phase 3, not Phase 9, because extraction cannot be tested without it.
  Phase 9 becomes hardening, final contracts and legacy retirement.
- The revision mechanism is introduced in Phase 4 (match decisions) and Phase 5 (costing edits), before chat, so
  that Phase 7 only adds a new *proposer*.

## Dependency graph
`0 → 1 → 2 → 3 → 4 → 5 → 6 → {7, 8} → 9 → 10` (security and cleanup basics are threaded through 1, 2 and 6).

## First implementation milestone (M1) — after approval
**Phase 0 foundation tasks + Phase 1 (job lifecycle skeleton).** Concretely:
1. Commit the current state on branch `feat/menu-profit-foundation` (KI-01). Scrub `.env.example` (KI-04).
2. Fix the frontend lint (approve `eslint-config-prettier` + `prettier`). Pin the Node version.
3. `docker-compose.dev.yml` with Postgres 17.
4. Backend: zod config, port 4000, Prisma 7 + migration `0001_jobs`, problem+json filter, throttler, CORS, and the
   `JobAccessGuard`.
5. Endpoints: `POST /jobs`, `GET /jobs/:id`, `POST /jobs/:id/submit` (state only), `DELETE /jobs/:id`, `/health`.
6. Frontend: typed `lib/api.ts` client + the `job-session` token helper (no visual change).
7. Tests: unit (token, guard, state machine) + integration on a real Postgres.

**M1 done when:** the frontend dev server can create a job against the local API, read its status with the token,
and a wrong token gets 404. All checks are green.

**Approval needed before M1:**
- the plan itself;
- budget option A or B;
- the backend dependency list (ADR-013);
- whether to commit the current working tree as the baseline.
