# Architecture — Menu Profit

Status: **PLANNED** (nothing below is implemented yet unless marked "exists").

## 1. System overview

```
 Browser (Next.js 16 app, frontend/)
   │  HTTPS, JSON + multipart, Authorization: Bearer <job access token>
   ▼
 NestJS API (backend/)  ── source of truth: job state, business rules, calculations, revisions, exports
   │        │  Prisma
   │        ▼
   │     PostgreSQL 17 (job-scoped tables, cascade delete)
   │
   │  local private volume (uploads/, exports/) behind StorageService
   │
   ├──► n8n (self-hosted)  ── thin AI/OCR workflow layer (extraction, AI-assist)
   │        │  signed GET of the file from NestJS (short-lived URL)
   │        │  Anthropic API (Claude)
   │        └──► HMAC-signed callback to NestJS /internal/n8n/callbacks
   │
   └──► Anthropic API directly (chat only, low-latency tool loop)
```

## 2. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Job creation, access token, lifecycle, progress | **NestJS** | State machine in Postgres |
| Upload validation (type sniffing, size, counts), storage | **NestJS** | Files never public |
| Deterministic parsing of CSV/XLSX (menu, POS, invoices) | **NestJS** | Testable, free, fast |
| AI extraction of PDFs/images (menu, invoices, PDF POS) | **n8n → Claude** | One task per file; NestJS dispatches and retries |
| AI assistance (column mapping, match suggestions, recipe estimates, recommendation wording) | **n8n → Claude** | Returns suggestions only |
| Validation of every AI output | **NestJS** | zod schemas + arithmetic cross-checks |
| Normalization, unit conversion, duplicate detection, deterministic matching | **NestJS** | |
| Human review of matches and recipes | **Frontend + NestJS** | |
| Financial calculations | **NestJS calculation engine** | Pure functions, Decimal arithmetic |
| Chat (tool loop) | **NestJS → Claude** | Not via n8n: latency, and tools must run inside the backend |
| Revisions (proposal → validation → approval → recalculation) | **NestJS** | |
| Excel/PDF generation and secure download | **NestJS** | From the same result snapshot |
| Cleanup and expiry | **NestJS scheduler** | Not n8n: the data owner deletes its own data |
| UI | **Next.js** | Existing design preserved |

**Why n8n stays thin (ADR-004).** With n8n we can swap providers, change prompts, and see retries without a
redeploy, and the client expects it. But business state in two places causes drift (the old workflow had
duplicated GP formulas). So n8n receives one self-contained task, returns one result, and keeps no data.

## 3. Backend module map (NestJS)

```
src/
  main.ts                      bootstrap: helmet-style headers, CORS allowlist, JSON logger, port 4000
  config/                      zod-validated env (fails fast on boot)
  prisma/                      PrismaService (Prisma 7 client + pg adapter)
  common/                      problem+json exception filter, JobAccessGuard, throttling, request ids
  jobs/                        create/submit/status/delete, state machine, progress
  files/                       upload, magic-byte sniffing, StorageService (local | S3 driver), signed internal URLs
  parsing/                     CSV/XLSX parsers, header-synonym column detection
  extraction/                  task dispatch to n8n, callback ingestion, AI-output validation
  normalization/               name normalization, unit parsing/conversion, duplicate detection
  matching/                    POS→menu, invoice line→ingredient, scoring, review decisions
  costing/                     calculation engine (pure), snapshots, scenarios, data-quality checks
  revisions/                   operation schema, validation, apply, history
  recommendations/             rule-based candidates + AI wording, impact computed by engine
  chat/                        Claude tool loop, tool handlers (read-only + propose_revision), usage caps
  exports/                     xlsx (exceljs), pdf (pdfmake), download tokens
  integrations/n8n/            outbound signed webhook client, inbound HMAC callback controller
  cleanup/                     scheduled expiry, orphan sweep
  health/
```

## 4. Job lifecycle (state machine)

```
DRAFT ──submit──► QUEUED ──► EXTRACTING ──► NORMALIZING ──► MATCHING ──┬──► CALCULATING ──► READY
  │                  │            │               │               │      └──► NEEDS_REVIEW ──(resolve)──► CALCULATING
  │                  └────────────┴───────────────┴───────────────┴──► FAILED (retryable: POST /retry)
  └──(2 h unsubmitted)──► EXPIRED          READY/NEEDS_REVIEW/FAILED ──(expiresAt)──► EXPIRED (data purged, tombstone)
```

- `progress` is `{stage, completedTasks, totalTasks, percent, messages[]}`, stored on the job.
- `READY` is not final. An approved revision bumps `currentRevision` and recalculates synchronously. It is fast,
  because it is pure math over at most a few thousand rows.
- `NEEDS_REVIEW` is entered only when **blocking** issues exist: unmatched POS items above a revenue threshold,
  missing selling prices, or missing VAT assumptions. Non-blocking issues are shown as warnings in `READY`.

## 5. Background processing (ADR-005)

There is no Redis or queue service for the prototype or the MVP.

- **Dispatch.** On submit, NestJS writes `ProcessingTask` rows and processes them with an in-process worker
  loop. It claims tasks with `SELECT … FOR UPDATE SKIP LOCKED` and limits concurrency (3 per job, 6 global).
  Deterministic parsing runs in-process. AI tasks are POSTed to n8n, which replies 202 at once.
- **Completion.** n8n POSTs a signed callback. NestJS validates it, persists the result, and advances the job when
  all of the stage's tasks are terminal.
- **Timeouts and retries.** A sweeper runs every minute (`@nestjs/schedule`) and re-dispatches tasks stuck in
  `DISPATCHED` past their deadline (5 min). Up to 3 attempts, with backoff of 30 s, 2 min, and 5 min. After that,
  the task is `FAILED` and the file is flagged. The job continues with partial data if it can, and otherwise
  goes to `FAILED`.
- **Upgrade path.** If we need several backend instances, move to **pg-boss**. It runs on the same Postgres and
  adds no new infrastructure.

## 6. Progress notifications (ADR-006)

The frontend **polls** `GET /jobs/:id` every 2 s while the job is active and stops at a stable status. The
existing UI already does this with React Query. Server-sent events would add a small latency gain at the cost
of proxy and connection handling, so SSE is deferred to the MVP hardening phase, and only if polling load
becomes a problem.

## 7. Storage (ADR-007)

- **Prototype and single-server MVP:** a private local volume, `STORAGE_ROOT/{jobId}/{uploads|exports}/{randomId}`.
  The original filename is kept only in the DB, never as a path. Files are not inside any web-served directory.
- **n8n access:** NestJS issues `GET /internal/files/{fileId}?exp=…&sig=…` (HMAC-SHA256, 10 min, bound to file
  and task). n8n downloads the file over HTTPS. Shared volumes and public buckets are never used.
- **Multi-instance later:** an S3-compatible driver (for example Cloudflare R2) behind the same interface, private
  bucket, server-side encryption, with a lifecycle rule as a backstop deletion.

## 8. Extraction strategy

| Input | Method | Fallback |
|---|---|---|
| POS CSV/XLSX | Deterministic parser + header-synonym detection (item, qty, net/gross sales, date, category) | AI `COLUMN_MAPPING` on header + 5 sample rows; the user confirms the mapping |
| Menu CSV/XLSX | Deterministic | Same as above |
| Menu PDF/image | Claude (PDF document block / vision) → `MenuExtraction` schema | Manual edit in the UI |
| Invoice PDF (text or scanned) / JPG / PNG | Claude → `InvoiceExtraction` schema. Claude reads both text-layer and scanned PDFs natively. | Lines below the confidence threshold are flagged. A dedicated OCR provider is considered only if evals show poor scan accuracy (ADR-009). |
| POS PDF | Claude → `PosExtraction` schema (MVP, not prototype) | — |
| `.xls` (legacy binary) | **Not accepted.** The user is asked to re-save as `.xlsx`/`.csv`. (ADR-010) | — |
| HEIC photos | Not accepted in the prototype. MVP: convert server-side or ask the user for JPG. | — |

**System confidence** for an extracted line is computed by the backend, not taken from the model:

- required fields present;
- `qty × unitPrice ≈ lineTotal` (±2 %);
- Σ lines ≈ invoice net total (±1 %);
- the pack/unit string parses;
- the value lies within plausible ranges.

The model's own confidence is stored but only used as a tiebreaker.

## 9. Normalization and matching

- **Names:** NFKD fold, lowercase, strip punctuation and size tokens (`6x2.5kg`), collapse whitespace, remove
  stopwords (`the`, `fresh`, `portion`, …), and singularize simple plurals.
- **Units:** canonical base units `g`, `ml`, `each`. A global seeded conversion table (kg, lb, oz, l, cl, fl oz,
  dozen, …) plus job-scoped ingredient-specific conversions (for example "1 bunch parsley = 50 g"), which are
  always `estimated` unless the user enters them.
- **Pack parsing:** `"Tomatoes 6 x 2.5kg"` → `packCount 6, packSize 2.5, packUnit kg` → `15 000 g`.
- **Matching tiers:**
  1. exact normalized;
  2. job alias (previously approved in this job);
  3. fuzzy (token-set ratio + Jaro–Winkler).
  - score ≥ 0.92 → `AUTO_ACCEPTED`. Visible and reversible, and counts as verified.
  - 0.75–0.92 → `PENDING` suggestion.
  - < 0.75 → batched AI suggestion (`MATCH_SUGGESTIONS`) → `PENDING`.
  - Thresholds are tuned on the test datasets.
- **AI never approves.** AI suggestions are always `PENDING` until a human approves them.
- **Duplicates:**
  - files: same SHA-256 within a job → rejected at upload;
  - invoices: same supplier + invoice number, or same supplier + date + total → flagged, and only one is used;
  - POS: identical rows for the same item and period → flagged.
- **Historical menus:** several menu files may carry `validFrom/validTo` (entered by the user or extracted).
  POS realised price (`revenue / qty`) per period detects price changes. The 50 % stability metric is computed in
  `costing` and reported as a data-quality warning.
- **Reusable mappings (ADR-012):** approved mappings are job-scoped and deleted with the job. Promoting generic,
  non-identifying aliases and conversions to a global curated table is an MVP+ admin feature, off by default.

## 10. Calculation engine

These are pure functions over Prisma `Decimal` (decimal.js). Nothing is rounded in between. Display rounding is
ROUND_HALF_UP to 2 dp for money and 1 dp for percentages.

| Metric | Formula |
|---|---|
| Net selling price | `gross / (1 + vatRate)` if menu prices include VAT, else `gross` |
| Ingredient cost per base unit (per invoice line) | `lineNet / (quantity × packCount × packSize→base)` |
| Ingredient unit cost used | per `priceBasis` assumption: `LATEST` (default) \| `WEIGHTED_AVG` \| `MAX` over the period |
| Recipe line cost | `qtyBase × (1 + wastagePct) × unitCost` |
| Cost per portion | Σ recipe line costs |
| GP per portion | `netPrice − costPerPortion` |
| GP % / food cost % | `GP / netPrice × 100` / `cost / netPrice × 100` (undefined when netPrice = 0) |
| Units sold, net revenue | from POS. If revenue is missing: `units × netPrice`, marked `estimated` |
| Realised GP contribution | `netRevenue − units × costPerPortion` |
| Theoretical GP contribution | `units × GP per portion` |
| Sales mix % / revenue mix % | `units_i / Σunits`, `rev_i / Σrev` (overall and within category) |
| Menu-engineering class | popularity high if `mix% ≥ 0.7 / N` within category; profit high if `GP/portion ≥ Σ(GP×units)/Σunits`. Star / Plowhorse / Puzzle / Dog |
| Price scenario | `Δrevenue = units × ΔnetPrice` (constant volume; elasticity parameter defaults to 0 and is stated) |
| Cost scenario | `ΔGP = −units × ΔcostPerPortion` |
| Time series | only if POS rows carry dates or periods |
| Attach rates (sides/drinks/add-ons) | only if POS has ticket-level data. Otherwise reported as "not supported by the uploaded data" |

**Confidence propagation:**

- `incomplete`: any required input is missing, so the value is `null` and a reason is given;
- `estimated`: any input is AI- or default-estimated;
- `partially_verified`: any input was user-entered or confirmed by a fuzzy match;
- `verified`: every input comes from documents with exact or approved matches.

The existing `frontend/lib/audit/calculations.ts` and its tests are the seed of this engine.

## 11. Revisions and chat

- Every change to the inputs goes through a **Revision**, which is a list of typed operations:
  `SET_SELLING_PRICE`, `SET_RECIPE_LINE`, `ADD_RECIPE_LINE`, `REMOVE_RECIPE_LINE`, `SET_INGREDIENT_PRICE`,
  `SET_ASSUMPTION`, `DECIDE_MATCH`, `SET_UNIT_CONVERSION`, `EDIT_RECOMMENDATION`.
- **User edits in the costing UI** create and approve a revision in one call. The UI shows the impact preview
  first (`/revisions/preview`).
- **Chat proposals** create `PROPOSED` revisions. The client approves or rejects them in the UI.
- **On approval** the backend:
  1. re-validates against the current state (optimistic concurrency on `baseRevision`);
  2. applies the operations in one transaction, storing before and after values;
  3. bumps `currentRevision`;
  4. recalculates and stores a new `ResultSnapshot`.
- **Chat:** NestJS runs a Claude tool loop with job-bound tools: `get_summary`, `list_items`, `get_item`,
  `get_data_quality`, `run_scenario` (dry-run, numbers from the engine), and `propose_revision`. The `jobId` is
  injected server-side and never taken from model output. There are no free-form queries and no DB access.
- **Prompt injection:** document text is handled only as data fields. Tool results are structured JSON. The
  model cannot widen its scope beyond the job.
- **Cost controls:** a frozen, cached system prompt plus tool definitions; a compact job summary per revision; the
  last 20 messages; at most 50 user messages per job; `max_tokens` capped; per-job token budget recorded in
  `ChatMessage.usage`; 429 and 5xx retried by the SDK, then a friendly error.

## 12. Exports

- **Excel:** exceljs, generated server-side from a `ResultSnapshot`. Sheets: Summary, Sales Analysis, Menu
  Costing, Recipe Lines, Ingredient Costs, Supplier Price Records, Recommendations, Assumptions & Data Quality,
  Revision Log. Costing cells use **live formulas** (INDEX/MATCH, for compatibility with older Excel) with
  cached results from the engine, so the workbook stays editable and shows the same numbers. Confidence is shown
  as a column with conditional formatting.
- **PDF:** pdfmake (pure JS, no headless browser) with SVG charts generated server-side (ADR-011).
- **Consistency:** both files are generated from the same snapshot, keyed `(jobId, revisionNumber, format)`.
  Both carry the revision number and snapshot hash in their footer and metadata.
- **Downloads:** `POST …/exports/:id/link` returns a single-use, 5-minute HMAC URL with
  `Content-Disposition: attachment` and `Cache-Control: no-store`.

## 13. Security model (summary; details in SECURITY_AND_RETENTION.md)

- Job ID: UUIDv4.
- Access token: 32 random bytes, base64url, shown once. Only its SHA-256 is stored, compared in constant time.
- The link format is `/analysis/{jobId}#k={token}`. The token sits in the URL fragment, so it never reaches server
  logs or the Referer header. The frontend stores it in `localStorage` (per job) to support revisits.
- Every `/jobs/:id/**` endpoint goes through `JobAccessGuard`. A missing job and a wrong token both return 404.
- Throttling, CORS allowlist, security headers, magic-byte sniffing, upload limits, zip-bomb guards on XLSX, and
  HMAC-signed n8n traffic in both directions.

## 14. Deployment (planned)

One VPS with Docker Compose (or the existing Coolify-style host that runs n8n): `postgres:17`, `backend`
(NestJS), `n8n` (already exists), and optionally `frontend`. Alternatively, the frontend goes on Vercel and
calls the API cross-origin. TLS goes through the reverse proxy. Postgres and the storage volume are not
publicly exposed. Ports: frontend 3000, backend 4000.

## 15. Proposed new dependencies (require approval; see DECISIONS.md ADR-013)

These are for the backend only: `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`, `zod`,
`@nestjs/schedule`, `@nestjs/throttler`, `exceljs`, `csv-parse`, `pdfmake`, `@anthropic-ai/sdk`, `helmet`.
The frontend needs nothing new. It already has TanStack Table, recharts, and zod. Existing gap:
`eslint-config-prettier` (+ `prettier`) must be added for `pnpm lint` to work.
