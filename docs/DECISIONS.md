# Architecture Decision Records — Menu Profit

Format: each ADR has a status (Proposed / Accepted / Superseded), its context, the decision, and the alternatives.
Everything below is **Proposed** and waits for client and owner approval of the plan.

| ADR | Decision | Status |
|---|---|---|
| 001 | Monorepo: `frontend/` (Next.js) + `backend/` (NestJS) in one git repo, with no workspace tooling yet. Each app keeps its own `pnpm-lock.yaml`. | Accepted (done 2026-10-23) |
| 002 | No accounts. Each analysis job is the security boundary: UUIDv4 id + 256-bit bearer token (hash stored), with the token carried in the URL fragment. | Proposed |
| 003 | NestJS is the single source of truth for job state, business rules, calculations, revisions and exports. | Proposed |
| 004 | n8n is a **thin** AI/OCR task layer: 3 workflows (MP-01 extraction, MP-02 assist, MP-99 errors). There is no coordinator, no cleanup and no data storage in n8n. *Alt:* a coordinator in n8n, rejected because it duplicates state. *Alt:* drop n8n and call Claude directly, viable but the client wants n8n. | Proposed |
| 005 | No Redis or queue. Postgres-backed `ProcessingTask` + an in-process worker + a sweeper cron. Upgrade path: pg-boss. *Alt:* BullMQ, rejected because it adds infrastructure. | Proposed |
| 006 | Progress via 2 s polling (the existing UI pattern). SSE only for the chat stream. *Alt:* SSE for status, deferred. | Proposed |
| 007 | Storage on a private local volume behind `StorageService`, with an S3/R2 driver later. n8n fetches files over HMAC-signed short-lived URLs. *Alt:* a public bucket or base64 in the webhook, rejected. | Proposed |
| 008 | AI provider is Anthropic Claude. The default model for extraction, assist and chat is `claude-opus-5-5`. Structured outputs (`output_config.format`) are used for extraction, and strict tools for chat. A cheaper model (Sonnet 5.5 / Haiku 5.5) is a client cost decision after the Phase 3 evals. | Proposed |
| 009 | No separate OCR service. Claude reads text and scanned PDFs and images natively. Add an OCR fallback only if DS-4 evals miss the thresholds. | Proposed |
| 010 | Accept CSV, XLSX, PDF, JPG and PNG. Reject `.xls` and HEIC (with a re-save prompt) to avoid a vulnerable or extra parser dependency. | Proposed |
| 011 | XLSX via exceljs with live formulas + cached values. PDF via pdfmake (pure JS). *Alt:* Playwright/Chromium HTML→PDF, better looking but heavy for a small VPS. Revisit in the MVP. | Proposed |
| 012 | Approved mappings and conversions are job-scoped and deleted with the job. A global, admin-curated alias and conversion table holding non-identifying data only is MVP+ and off by default. | Proposed |
| 013 | New backend dependencies (need approval per CLAUDE.md): `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`, `zod`, `@nestjs/schedule`, `@nestjs/throttler`, `exceljs`, `csv-parse`, `pdfmake`, `@anthropic-ai/sdk`, `helmet`. Test-only (MVP): `fast-check`, `@playwright/test`. Frontend: none new, plus fixing the missing `eslint-config-prettier`/`prettier`. | Proposed |
| 014 | Money is handled as `Decimal` end to end and serialized as strings. There is no intermediate rounding, and display uses half-up (2 dp money, 1 dp %). | Proposed |
| 015 | Financial formulas are those in ARCHITECTURE.md §10. Menu prices are VAT-inclusive by default. GP uses the net price. The ingredient price basis defaults to LATEST. | Proposed — confirm with client |
| 016 | The "≥ 50 % menu unchanged" rule is a data-quality **warning**, not a blocker. "Materially unchanged" means present all period with a price move ≤ 5 %. | Proposed — confirm with client |
| 017 | Retention: drafts 2 h; raw files 24 h; everything else 48 h after submission; tombstone 7 d; backups 7 d (disclosed). | Proposed — confirm with client |
| 018 | Missing recipes: the AI estimates recipe lines only from ingredients found on invoices. They are labelled `estimated` until a user edits or approves them. | Proposed — confirm with client |
| 019 | The chat runs in NestJS (not n8n) with job-bound tools. Every financial change goes through a validated Revision that the user approves. | Proposed |
| 020 | The old Next.js `/api/audits` routes, the JSON store, the login page and the proxy session gate are retired once the new flow works end to end (Phase 6/9). Nothing is deleted before then, and nothing without approval. | Proposed |
| 022 | **Release 1 = upload → backend/n8n processing → chat corrections → Excel download.** Chat is the only correction channel in Release 1. Its proposals are confirmed in the chat, then backend-validated and recalculated. Results dashboard, costing editor, match-review screen and PDF move to Release 2. | Accepted (client, 2026-10-23) |
| 021 | Docs live in `docs/` (plus a root README and CHANGELOG). `frontend/changes.md` and `frontend/flow.md` stay as frontend-local logs. | Accepted |
| 023 | **Chat assistant request size.** Measured with the model's own tokenizer and real chat turns: the tool definitions were 7,687 tokens of every call; they are now 4,675 (the model sees a compact form of the schema, the server still validates with the full zod one). The conversation carries a prompt-cache breakpoint (on a copy, never stored), and the replayed history window moves in steps of four messages so its start, and so the cached prefix, is stable between turns. Tool results given to the model are trimmed (fewer fields, a firm figure is just its value, at most eight changed items in an impact), while the confirmation card still gets the full impact. `max_tokens` is 8192 and a cut-off answer is reported instead of stored as empty. The next message carries a system note about changes applied and proposals the owner discarded. Unchanged on purpose: history is replayed verbatim (append-only, no editing of old tool results), the confirm-before-apply rule, and the model/effort settings, which stay env-driven. | Accepted |

## Open decisions (need input; defaults in bold)
1. Budget option: **A (demo)** or B (prototype). See BUDGET_AND_SCOPE.md.
2. Default VAT rates and the country, so the UI can suggest values: **EUR, the user enters the rates**.
3. Hosting: **co-locate on the existing n8n host** vs a new VPS; frontend on **the same host** vs Vercel.
4. Retention window: **48 h** (24–72 h acceptable).
5. Whether to offer an optional 4th upload "Recipes/costing sheet" (XLSX template): **MVP, not prototype**.
6. Extraction model after the evals: **Opus 5.5** vs a cheaper model.
7. Whether Hospitality Audits staff need any cross-job view: **no** (it would require accounts, which are out of scope).
