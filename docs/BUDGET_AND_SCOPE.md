# Budget, Scope and Cost Estimates — Menu Profit

All figures are **estimates with stated assumptions** unless they are marked "verified".
- Model prices come from Anthropic's published per-token list as cached in our tooling on 2026-10-06. Re-check
  them on the live pricing page before quoting the client.
- Hosting prices are typical market ranges and have **not** been verified.

## 1. The honest budget picture
The initial client budget is **under $100**. That does not fund the full MVP below (roughly 40–55 developer-days).
It realistically funds one of these:
- **Option A, "Proof-of-workflow demo" (recommended for $100):**
  - one fixed demo dataset;
  - the existing upload UI wired to the new backend;
  - invoice extraction through MP-01;
  - a deterministic POS/menu parse;
  - the core GP table;
  - an Excel download.
  
  There is no chat, no PDF, and a minimal review UI. This shows the end-to-end idea on real files in about 4–6
  dev-days. It is only possible within $100 if it is treated as a discounted pilot.
- **Option B, the prototype in §2:** about 10–14 dev-days. That needs a larger budget or a phased payment plan.

The client should choose the option explicitly before Phase 1 starts. This document does not promise
production-grade functionality within $100.

## 1a. Release 1 (client-confirmed scope, 2026-10-23): upload → process → chat corrections → Excel
This supersedes Options A and B as the first build.

**Screens:**
- the existing upload page;
- one analysis page with a status/progress banner, a chat panel, and a "Download Excel" button.

There is no dashboard and no costing editor.

**Effort estimate (dev-days):**

| Phase | Days |
|---|---|
| 0 Foundations | 0.5 |
| 1 Job lifecycle | 1.5 |
| 2 Upload | 1.5 |
| 3 Extraction + MP-01 | 2.5 |
| 4 Auto-matching (no UI) | 1 |
| 5 Engine | 1.5 |
| 7 Simplified chat + corrections | 3 |
| 8 Excel | 1 |
| 9 n8n wiring | 0.5 |
| 10 Token, limits, cleanup | 1 |
| **Total** | **≈ 14 dev-days** |

That still exceeds a $100 budget at normal rates, so agree the commercial terms with the client before starting.

**AI cost per audit** is unchanged: about $3 on Opus 5.5, $1.5 on Sonnet 5.5, and $0.1 on Haiku 5.5 (§5).

## 2. Smallest viable working prototype (Option B — superseded by Release 1)
Included:
- **Upload, job and status.** The existing UI, rewired, with multiple files per category and per-file progress.
  The token link and polling status are included.
- **Extraction.**
  - Deterministic CSV/XLSX parsing for POS and menu, with header-synonym detection.
  - MP-01 for invoice PDFs and images and for menu PDFs and images.
  - No PDF POS.
- **Normalization:** names, pack sizes, and units (base g/ml/each); duplicate invoice detection.
- **Matching:**
  - deterministic exact and fuzzy matching;
  - a review list with approve, reject, and reassign;
  - no AI match suggestions;
  - unmatched items are simply flagged.
- **Recipes:** AI-estimated recipes (MP-02 `RECIPE_ESTIMATE`) labelled *estimated*, editable in the costing view.
- **Calculations:** the full core engine (§10 of ARCHITECTURE.md), the confidence labels, and the menu-engineering
  matrix.
- **Results UI:** summary, item table (TanStack Table), matrix chart, data-quality list, and an editable costing
  drawer (price, recipe qty, ingredient price), all through revisions.
- **Exports:** Excel only.
- **Security and cleanup:** the token guard, upload validation, HMAC n8n, the 48 h cleanup cron, and the delete
  button.

Deferred to the MVP:
- AI chat and chat-proposed revisions;
- the PDF report;
- AI match suggestions and AI column mapping;
- historical menu versions and the stability metric UI;
- time series;
- PDF POS;
- SSE;
- retention extension;
- the S3 driver;
- the full test-dataset suite (the prototype ships with 2 datasets);
- rule-based recommendations beyond the top 5.

## 3. Full MVP
This is all 11 phases in MASTER_PLAN.md.

## 4. Effort by phase (developer-days, one experienced full-stack dev)
| Phase | Prototype | Full MVP |
|---|---|---|
| 0 Audit and foundations | 0.5 | 1 |
| 1 Backend architecture and job lifecycle | 1.5 | 3 |
| 2 Upload, storage, validation | 1.5 | 2.5 |
| 3 Extraction and normalization (incl. MP-01) | 2.5 | 6 |
| 4 Matching and human review | 1.5 | 4 |
| 5 Financial calculations and costing | 1.5 | 4 |
| 6 Results UI and interactive costing | 2 | 6 |
| 7 AI chat and approved revisions | — | 5 |
| 8 Excel and PDF exports | 1 (Excel) | 4 |
| 9 n8n hardening and end-to-end integration | 0.5 | 3 |
| 10 Security, cleanup, testing, deployment, ops | 1 | 5 |
| **Total** | **≈ 13** | **≈ 43** (+20 % contingency → ~52) |

## 5. AI cost per audit (estimate)
Assumptions:
- 20 invoices × 2 pages;
- 1 menu PDF;
- POS as CSV;
- 40 menu items and 120 invoice lines;
- 1 chat session of 20 messages;
- adaptive thinking at default effort.

Token estimates:

| Step | Input tokens | Output tokens |
|---|---|---|
| Invoice extraction (~2.5 k tokens/page + prompt/schema) | ~140 k | ~55 k |
| Menu extraction | ~10 k | ~4 k |
| MP-02 recipe estimate + recommendations | ~50 k | ~15 k |
| Chat (prompt-cached system + summary, 20 turns) | ~300 k, mostly cache reads | ~20 k |

Per-token list prices (cached 2026-10-06, re-verify):

| Model | Input $/MTok | Output $/MTok | Cache read $/MTok |
|---|---|---|---|
| Claude Opus 5.5 (`claude-opus-5-5`) | 4.00 | 20.00 | 0.20 |
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | 2.00 | 10.00 | 0.20 |
| Claude Haiku 5.5 (`claude-haiku-5-5`) | 0.10 | 0.50 | — |

Resulting cost per audit:

| Model (all steps) | Extraction + assist | Chat session | **Per audit** |
|---|---|---|---|
| Opus 5.5 (default in this plan) | ≈ $2.2 | ≈ $0.5–1.0 | **≈ $3** |
| Sonnet 5.5 | ≈ $1.1 | ≈ $0.3–0.5 | **≈ $1.5** |
| Haiku 5.5 | ≈ $0.06 | ≈ $0.02 | **≈ $0.1** |

The plan defaults to Opus 5.5 for extraction accuracy on messy scans. Moving extraction to a cheaper model is a
**client cost decision to make after the Phase 3 extraction evals** (DECISIONS.md ADR-008). The 50 % Batch API
discount does not fit, because users wait on the result.

## 6. Hosting and operations (unverified market estimates)
| Item | Estimate | Note |
|---|---|---|
| VPS for backend + Postgres (2 vCPU / 4 GB) | ~$5–15 / month | n8n appears to already run on an existing host. Co-locating could make the marginal cost about $0. |
| Frontend | $0 (Vercel hobby, if allowed for commercial use; check the terms) or the same VPS | |
| Storage | negligible (local volume, deleted within 48 h) | |
| Backups | ~$1–3 / month | |
| n8n | $0 licence (self-hosted community edition) | n8n Cloud pricing not verified |
| Domain + TLS | ~$10–15 / year; TLS free | |

## 7. Known limitations and risks
- Recipes are usually missing, so most per-portion costs will be **estimated** until the client edits them. The
  product must make that obvious.
- Photo quality limits invoice accuracy. A dedicated OCR fallback is not planned unless the evals show a need.
- POS exports vary a lot by vendor. Each new vendor format may need a synonym or mapping update.
- Ticket-level analyses (attach rates for sides and drinks) need ticket data, which most summary reports lack.
- In-process throttling and the worker loop assume a single backend instance.
