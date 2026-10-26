# Testing Strategy — Menu Profit

Status: **PLANNED.** What exists today is the frontend's Vitest suite (24 passing tests), the old
`audit-flow.test.ts` (retired along with the old routes), and the default Jest scaffold in the backend.

**Principle:** a fluent AI answer proves nothing. Extraction is checked against hand-labelled ground truth, and
calculations against hand-computed expected values.

## 1. Test layers
| Layer | Tool | Scope |
|---|---|---|
| Unit | Jest (backend), Vitest (frontend) | calculation engine, unit parsing and conversion, name normalization, fuzzy scoring, revision op validation, HMAC signing, token guard, upload sniffing |
| Property-based (MVP) | `fast-check` (dependency to be approved) | engine invariants: GP = price − cost; mixes sum to 100 %; a revision followed by its inverse returns the original snapshot |
| Integration | Jest + Supertest + a real Postgres (Docker, throwaway DB per run) | every endpoint, state transitions, cascade deletes, cross-job access attempts |
| Contract | fixtures in `n8n/fixtures/` | callback payloads validated against the zod schemas. A recorded MP-01/02 output for each dataset is replayed without calling n8n. |
| Extraction evals | script `backend/scripts/eval-extraction.ts` (calls the real model, so it costs money and runs on demand) | field-level precision and recall per dataset and model |
| End-to-end | Playwright (dependency to be approved, MVP) or a manual checklist (prototype) | upload → review → results → edit → export, with n8n stubbed by a fake that replays fixtures |
| Export verification | Jest | re-open the XLSX with exceljs: sheet names, cached formula results equal the snapshot, the revision stamp. PDF: text extraction contains the totals and the revision stamp. |

## 2. Mock restaurant datasets (to create in `test-data/`, synthetic, no real client data)
| ID | Scenario | Exercises |
|---|---|---|
| DS-1 Clean Bistro | 25 items, a clean XLSX menu, 8 text PDFs, POS CSV with net and gross | the happy path; exact matches; verified numbers |
| DS-2 Messy Names | POS abbreviations ("CHK BRGR DBL"), supplier codes, typos | fuzzy matching, review queue, AI suggestions (MVP) |
| DS-3 Packs & Units | "6x2.5kg", "Case 12 x 1L", lb/oz, "bunch", "each" | pack parsing, conversions, missing-conversion flags |
| DS-4 Scanned Photos | 22 invoice JPGs and scanned PDFs (skewed, low light, a crumpled one) | vision extraction accuracy, low-confidence flags, 20+ invoices, timeouts |
| DS-5 Menu Change | 2 menu versions, a mid-period price rise on 30 % of items, then a variant with 60 % changed | historical prices, the 50 % stability warning |
| DS-6 Duplicates | the same invoice uploaded twice (identical file plus a re-scan), a duplicated POS export period | file SHA rejection, invoice duplicate detection |
| DS-7 Gaps | no recipes, missing prices for 3 items, an invoice line with no quantity, VAT unknown | `incomplete`/`estimated` propagation, blocking issues, NEEDS_REVIEW |
| DS-8 Ambiguous | "Chicken Wings" vs "Chicken Wings (Large)", two suppliers' "Cream" (single vs double) | ambiguous matching must stay pending |
| DS-9 Large | 40 invoices, 15 MB files, a 5 k-row POS | limits, concurrency, cost and performance ceilings |
| DS-10 Hostile | a PDF with injected text ("ignore previous instructions…"), a polyglot file, a zip-bomb XLSX, an `.exe` renamed `.pdf` | upload sniffing, prompt-injection containment |

Each dataset has `expected/` files:
- `extraction.json` (ground truth per field);
- `matches.json`;
- `results.json` (hand-calculated in a spreadsheet and reviewed by a second person).

## 3. Acceptance thresholds (proposed)
- **Extraction (DS-1, text PDFs):** ≥ 98 % line recall; ≥ 99 % numeric field accuracy on lines that are extracted.
- **Extraction (DS-4, photos):** ≥ 90 % line recall; every wrong or missing numeric field is either flagged
  low-confidence or fails an arithmetic check. **Silent wrong numbers ≤ 1 %.**
- **Matching:**
  - DS-2: no false auto-accepts;
  - DS-2: ≥ 80 % correct top-1 suggestions;
  - DS-8: ambiguous pairs are never auto-accepted.
- **Calculations:** exact equality with `expected/results.json` at 4 dp internally and 2 dp displayed.
- **Exports:** XLSX and PDF totals equal the API snapshot for the same revision (hash match).
- **Performance:** DS-9 completes in ≤ 10 min. Interactive revision recalculation takes ≤ 1 s for 200 items.
- **Cost:** DS-9 AI spend at or below the estimate × 1.5 (tracked from `usage`).

## 4. Required test cases by area
- **Security:**
  - a wrong token returns 404 on every route (table-driven over the route list);
  - an expired job returns 410;
  - a job-A token can never read job-B data, including through chat tools and download links;
  - a replayed callback (same attempt) is a no-op;
  - a bad HMAC returns 401;
  - a file URL is rejected after expiry and after the task completes;
  - download tokens are single-use.
- **Lifecycle:**
  - submit is idempotent;
  - a double submit returns 409 or the stored response;
  - a stuck task is retried up to 3 times and then FAILED;
  - the job continues when 1 of 20 invoices fails, and the issue is reported.
- **Cleanup:**
  - after a time-travelled run, there are 0 rows for the job and 0 blobs under its prefix;
  - a partial failure is retried;
  - the orphan sweep removes stray blobs.
- **AI schema validation:** malformed, truncated, or refused outputs, and extra fields, are rejected, and the task
  is retried with a reason code.
- **Chat:**
  - a `propose_revision` with an invalid op is rejected;
  - an approved proposal changes the snapshot and the export;
  - a stale proposal (base revision moved) is rejected or rebased;
  - chat caps are enforced;
  - tool arguments can't change the jobId.
- **Exports:** a workbook opens in Excel or LibreOffice (manual check per release), formulas recalculate to the
  same values, and missing values show as blank with a reason (never 0).

## 5. CI (planned)
GitHub Actions: lint, typecheck, unit, and integration (Postgres service) on each PR. Extraction evals run manually,
or nightly with a budget cap. The frontend `pnpm build` must pass, because Cache Components fail the build on
uncached async.
