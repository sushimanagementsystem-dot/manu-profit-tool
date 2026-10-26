# Database Schema — Menu Profit (PostgreSQL 17 + Prisma 7)

Status: **PLANNED.** No schema or migration exists yet; the audit found no Prisma setup. The schema is created in
Phase 1 (job and file tables) and grows phase by phase. Every migration is additive until the schema is in
production.

> Prisma 7 changed setup: generator `prisma-client` with an explicit `output`, `prisma.config.ts`, and a
> driver adapter (`@prisma/adapter-pg`). Verify against the installed version's docs when implementing.

## Conventions
- **Primary keys:** `uuid` (`@default(uuid(7))` for internal tables so indexes stay time-ordered).
  `AnalysisJob.id` uses **v4** because it appears in links and must not reveal its creation time.
- **Job scoping:** every job-scoped table carries a `jobId` FK with `onDelete: Cascade` and an index that leads
  with `jobId`. Queries in services always filter by `jobId`, which comes from the guard and never from the
  request body.
- **Money:**
  - Stored amounts are `Decimal(14,4)`.
  - Per-base-unit costs are `Decimal(18,8)`. 1 g of saffron, for example, needs the precision.
  - Quantities are `Decimal(14,4)`.
  - Rates and percentages are `Decimal(7,4)` as fractions (0.135 = 13.5 %).
  - `Float` is never used for money.
- **Timestamps:** `createdAt @default(now())` and `updatedAt @updatedAt`, all `timestamptz`.
- **Provenance:** every extracted row keeps `sourceFileId` plus `sourceRef` (page, row, or line index) so the UI can
  say where a number came from.
- **Confidence enum:** `VERIFIED | PARTIALLY_VERIFIED | ESTIMATED | INCOMPLETE`.

## Entities (and why each exists)

### AnalysisJob — the unit of isolation, access, and retention
| Field | Type | Notes |
|---|---|---|
| id | uuid v4 PK | appears in the link |
| accessTokenHash | char(64) | SHA-256 of the token; the token itself is never stored |
| status | enum JobStatus | DRAFT, QUEUED, EXTRACTING, NORMALIZING, MATCHING, NEEDS_REVIEW, CALCULATING, READY, FAILED, EXPIRED |
| progress | jsonb | `{stage, completedTasks, totalTasks, percent, messages[]}` |
| idempotencyKey | text unique nullable | from the `Idempotency-Key` header on create/submit |
| currency | char(3) | default `EUR` |
| reportingPeriodStart/End | date nullable | detected from POS or entered by the user |
| currentRevision | int default 0 | 0 = the initial computed state |
| failureCode / failureMessage | text nullable | user-safe message |
| submittedAt | timestamptz nullable | |
| rawFilesExpireAt | timestamptz | submittedAt + 24 h |
| expiresAt | timestamptz | createdAt + 2 h while DRAFT; submittedAt + 48 h after submit |
| purgedAt | timestamptz nullable | data deleted; the row stays as a tombstone for 7 days |
| cleanupAttempts / lastCleanupError | int / text | cleanup retries |
| aiUsage | jsonb | running token and cost totals (no content) |

Indexes: `(status, expiresAt)` for the cleanup scan; `(expiresAt)`.

### UploadedFile — metadata and storage reference
`id, jobId FK, category (MENU|INVOICE|POS), originalName (sanitized, display only), mimeType (sniffed),
sizeBytes, sha256, storageKey, pageCount?, status (UPLOADED|PARSING|EXTRACTING|EXTRACTED|FAILED|DELETED),
extractionMethod (DETERMINISTIC|AI|MANUAL), menuValidFrom?, menuValidTo?, deletedAt?, createdAt`.
Unique `(jobId, sha256)` blocks duplicate uploads. Index `(jobId, category)`.

### ProcessingTask — workflow state and the idempotency anchor
`id, jobId FK, fileId FK?, type (PARSE_FILE|EXTRACT_FILE|COLUMN_MAPPING|MATCH_SUGGESTIONS|RECIPE_ESTIMATE|RECOMMENDATIONS),
status (PENDING|DISPATCHED|SUCCEEDED|FAILED|CANCELLED), attempt int, maxAttempts int default 3,
deadlineAt, nextAttemptAt, n8nExecutionId?, errorCode?, errorMessage?, resultReceivedAt?, usage jsonb, createdAt, updatedAt`.
A callback is accepted only when `status = DISPATCHED` and `attempt` matches, which makes duplicate callbacks a
no-op. Index `(status, nextAttemptAt)` and `(jobId, type)`.
*A separate callback-receipt table was considered and rejected:* the task row already provides idempotency.

### MenuItem — what is sold, and at what listed price
`id, jobId, sourceFileId?, sourceRef, name, normalizedName, category?, description?, grossPrice Decimal?,
vatRateOverride?, validFrom?, validTo?, isActiveInPeriod bool, confidence, origin (EXTRACTED|USER)`.
Index `(jobId, normalizedName)`. Categories stay a text column because a separate table adds nothing at this scale.
One row per (item × price version) supports historical menus.

### PosSalesLine — what actually sold
`id, jobId, sourceFileId, sourceRef, rawItemName, normalizedName, rawCategory?, periodStart?, periodEnd?,
quantity Decimal, netRevenue Decimal?, grossRevenue Decimal?, menuItemId FK? (set when the match is approved/auto),
isDuplicate bool, confidence`.
Index `(jobId, menuItemId)`, `(jobId, normalizedName)`.

### SupplierInvoice / InvoiceLine — the cost evidence
- **Invoice:** `id, jobId, sourceFileId, supplierName, supplierNormalized, invoiceNumber?, invoiceDate?, currency,
  netTotal?, vatTotal?, grossTotal?, duplicateOfId? (self FK), checks jsonb (arithmetic results), confidence`.
- **InvoiceLine:** `id, jobId, invoiceId FK cascade, sourceRef, rawDescription, normalizedName, quantity,
  packCount?, packSize?, packUnit?, baseUnit (G|ML|EACH)?, baseQuantity Decimal?, unitPrice?, lineNet?, vatRate?,
  costPerBaseUnit Decimal(18,8)?, ingredientId FK?, confidence, modelConfidence?`.
- Unique: `(jobId, supplierNormalized, invoiceNumber)`. It is **partial** (where invoiceNumber is not null) and
  created in raw SQL in the migration.

### Ingredient — the normalized costing unit within a job
`id, jobId, name, normalizedName, baseUnit, origin (FROM_INVOICE|FROM_RECIPE|USER)`. Unique `(jobId, normalizedName)`.

### IngredientPrice — the price actually used, with provenance
`id, jobId, ingredientId FK, source (INVOICE|USER|ESTIMATE), invoiceLineId FK?, pricePerBaseUnit Decimal(18,8),
effectiveDate?, revisionNumber, confidence`.
This is separate from InvoiceLine because user overrides and estimates must coexist with invoice evidence and stay
auditable. The engine picks prices per the `priceBasis` assumption.

### RecipeLine — portion composition (recipes are 1:1 with a MenuItem, so there is no Recipe table)
`id, jobId, menuItemId FK cascade, ingredientId FK, quantity Decimal, unit, baseQuantity Decimal, wastagePct?,
source (PROVIDED|USER|AI_ESTIMATE), approved bool, confidence`. Index `(menuItemId)`.

### UnitConversion — global seed plus job-specific
`id, jobId? (null = global), ingredientId?, fromUnit, toUnit, factor Decimal(18,8), source (SEED|USER|AI_ESTIMATE)`.
Global rows hold generic facts only (kg→g). Job rows are deleted with the job.

### MatchSuggestion — suggestions and decisions (an approved suggestion is the mapping)
`id, jobId, kind (POS_TO_MENU|LINE_TO_INGREDIENT|RECIPE_TO_INGREDIENT|DUPLICATE_INVOICE), sourceId uuid,
candidateId uuid?, score Decimal(5,4), method (EXACT|ALIAS|FUZZY|AI), rationale?, status
(AUTO_ACCEPTED|PENDING|APPROVED|REJECTED|SUPERSEDED), blocking bool, decidedAt?, decidedInRevision?`.
Index `(jobId, kind, status)`. Polymorphic `sourceId`/`candidateId` is intentional, because the alternative is
four near-identical tables. Integrity is enforced in the service layer and covered by tests.

### Assumption — costing assumptions, versioned by revision
`id, jobId, key (VAT_RATE_FOOD|VAT_RATE_DRINK|MENU_PRICES_INCLUDE_VAT|PRICE_BASIS|DEFAULT_WASTAGE_PCT|STABILITY_THRESHOLD_PCT|…),
value jsonb, source (DEFAULT|USER|AI_SUGGESTED), revisionNumber`. Unique `(jobId, key)`. The history lives in Revision.

### Revision — proposed and approved changes
`id, jobId, number int (unique per job, assigned on approval), status (PROPOSED|APPROVED|REJECTED|STALE),
source (USER_EDIT|CHAT|SYSTEM), baseRevision int, operations jsonb (validated list), appliedDiff jsonb (before/after),
rationale?, proposedByMessageId?, impactPreview jsonb, createdAt, decidedAt`.
Unique `(jobId, number)`. A proposal becomes `STALE` if `baseRevision` < current at approval and re-validation fails.

### ResultSnapshot — derived results per revision
`id, jobId, revisionNumber, calcVersion (engine semver), payload jsonb (items, categories, matrix, totals,
data-quality issues), payloadHash char(64), createdAt`. Unique `(jobId, revisionNumber)`.
This is derived data: it can be recomputed, and it is stored so that exports and history are reproducible.

### Recommendation
`id, jobId, revisionNumber, priority int, kind (PRICE|COST|MENU_MIX|DATA_QUALITY|UPSELL), title, body,
targetMenuItemId?, impact jsonb (computed by the engine), source (RULE|AI|USER_EDITED), status (ACTIVE|DISMISSED)`.

### ChatMessage
`id, jobId, role (USER|ASSISTANT|TOOL), content text, toolCalls jsonb?, revisionAtTime int, proposedRevisionId?,
usage jsonb (tokens, model), createdAt`. Index `(jobId, createdAt)`.

### ReportExport
`id, jobId, revisionNumber, format (XLSX|PDF), status (PENDING|READY|FAILED), storageKey?, sizeBytes?, sha256?,
snapshotHash, createdAt`. Unique `(jobId, revisionNumber, format)`.

### JobEvent — minimal audit log (no document content)
`id, jobId FK cascade, type (CREATED|FILE_UPLOADED|SUBMITTED|STAGE_CHANGED|TASK_FAILED|REVISION_APPROVED|EXPORT_DOWNLOADED|DELETED…),
meta jsonb (ids, counts, codes — never names, prices or text), createdAt`.
Events cascade with the job. Long-lived operational metrics go to stdout logs without content.

## Deliberately not created
`Restaurant`/`User`/`Session` (there are no accounts), `MenuCategory` table (text column is enough), `Recipe`
header table (1:1 with MenuItem), `CallbackReceipt` (ProcessingTask covers it), a global `IngredientAlias`
(MVP+, admin-curated, ADR-012).

## Deletion and lifecycle
- Deleting an `AnalysisJob` cascades to every job-scoped table. File blobs are deleted by the cleanup service
  **before** the DB delete, and the order is recorded so it can be retried.
- Tombstone: at `expiresAt` the data rows and files are purged and the job row is kept with `status=EXPIRED` and
  `purgedAt` set, so the link can say "expired". The row is hard-deleted 7 days later.
- Migrations: `prisma migrate dev` locally and `prisma migrate deploy` in CI/deploy. A destructive change needs
  an explicit approval note in the PR.
