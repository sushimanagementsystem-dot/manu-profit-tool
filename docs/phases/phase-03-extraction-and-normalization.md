# Phase 3 — Extraction and Normalization

**Status:** Planned. Includes the first build of n8n **MP-01** (moved earlier than Phase 9 because extraction
depends on it; Phase 9 hardens it).

## Objective
Turn the uploaded files into validated, normalized, job-scoped records (menu items, POS lines, invoices and lines),
with provenance and system confidence.

## Scope
- `ProcessingTask` + the in-process worker + the sweeper (timeouts, retries with backoff, `FAILED` after 3 attempts).
- `parsing/`: CSV (`csv-parse`) and XLSX (`exceljs`) readers, header-synonym detection for POS/menu/invoice
  spreadsheets, and number and date parsing (locale-aware: `1.234,56` vs `1,234.56`, decided per file).
- `extraction/`: dispatch to MP-01 (signed payload, signed file URL), callback ingestion
  (`/internal/n8n/callbacks`), zod schemas, arithmetic cross-checks, system confidence.
- `normalization/`: the name normalizer, pack/unit parser, global conversion seed, base-quantity and
  cost-per-base-unit computation, and duplicate invoice detection.
- Job stages `EXTRACTING → NORMALIZING` with progress messages per file (unreadable, partial, duplicate).
- An extraction eval script plus ground truth for DS-1, DS-3, DS-4 and DS-6.

**Exclusions:** AI column mapping (MVP), PDF POS (MVP), long-PDF splitting (MVP), matching.

## Dependencies
Phase 2. Approval of `csv-parse`, `exceljs`, `@anthropic-ai/sdk` (eval script). Access to the n8n host and
Anthropic keys.

## Frontend tasks
- The analysis route `/analysis/[jobId]`, with a status view reusing `audit-status-banner` (new statuses + a
  progress bar + a per-file message list).
- Poll `GET /jobs/:id`.

## Backend tasks
As in Scope.

## Database changes
Migration `0003_extraction`: `ProcessingTask`, `MenuItem`, `PosSalesLine`, `SupplierInvoice`, `InvoiceLine`, and
`UnitConversion` (+ the global seed).

## n8n workflows
MP-01 Document Extraction, first version, and MP-99 Error Handler (see N8N_WORKFLOWS.md). Exported to `n8n/workflows/`.

## API endpoints
`GET /internal/files/:fileId`, `POST /internal/n8n/callbacks`, `POST /jobs/:id/retry`. `GET /jobs/:id` gains
progress messages.

## Testing requirements
- **Unit:**
  - parsers on fixtures (comma and dot decimals, header variants);
  - the pack parser (DS-3 table of 40 strings);
  - HMAC sign and verify;
  - callback idempotency.
- **Contract:** replay recorded MP-01 outputs.
- **Eval:** DS-1 and DS-4 against the thresholds in TESTING_STRATEGY.md. Report precision and recall.

## Acceptance criteria
- DS-1 is fully extracted, with verified totals.
- DS-4 meets the photo thresholds, with no unflagged wrong numbers above 1 %.
- A killed n8n execution is detected by MP-99 or the sweeper and retried.
- A duplicate callback has no effect.

## Risks
- Scan quality (ADR-009 fallback).
- Spreadsheet format variety (synonym table, plus manual mapping in the MVP).
- Model cost overrun (usage tracked per task).

## Deliverables
An extraction pipeline, MP-01 and MP-99, migration 0003, and the eval report.
