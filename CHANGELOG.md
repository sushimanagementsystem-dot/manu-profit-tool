# Changelog

All notable changes to this repository. Frontend-internal history before 2026-10-23 is in
`frontend/changes.md`.

## [Unreleased]

### 2026-10-28 — Show a client what the AI cost (testing aid, switchable)
- **Added:** a card under the chat saying what the AI cost for that analysis: reading the files, the assistant, and the
  total, in US dollars, with an "estimate" caveat. For a client who is testing the product and wants to see what
  Claude costs per analysis. Every extraction and chat call is now counted per job and per model (`aiUsage.ledger`),
  priced at list prices including prompt-cache writes (×1.25) and reads (×0.1), and a model with no price in
  `usage/ai-pricing.ts` is reported as "not priced" rather than guessed. Closes KI-20.
- **Switch:** `SHOW_AI_COST=true` on the backend turns it on; left `false` (the default) the endpoint returns
  `{ enabled: false }` and the card renders nothing. **To remove it before the product is public:** set the flag to
  `false`, or delete `frontend/components/analysis/ai-cost-card.tsx` and its one line in `analysis-workspace.tsx`.
- **Checked:** the card's figure after a real question ($0.0400 for two calls) matches a hand calculation from the
  logged token counts; extraction (7,374 in + 2,167 out on Opus 5.5) prices to the $0.0728 measured earlier. Backend
  71 → 97 tests, frontend 43 → 46.
- **Not shown:** the cost of jobs created before this change, and anything in euros (Anthropic bills in dollars).

### 2026-10-28 — The results table is editable
- **Added:** click a dish's name, units sold, menu price or cost in the results table to edit it in place, with Save
  and Cancel (Enter / Escape), validation, a saving state and the server's own wording when it refuses a value.
  An edit goes through the same revision pipeline as a change confirmed in the chat (`POST /revisions/apply`, source
  `MANUAL`), so the headline figures, GP, recommendations, the assistant and the Excel workbook all follow, and the
  workbook's Revision Log lists it. The rows an edit (or a chat change) moved are highlighted for a moment.
- **Added (backend):** operations `RENAME_MENU_ITEM`, `SET_UNITS_SOLD` and `SET_ITEM_COST`, available to the chat too.
  Units sold spreads the new total over the item's POS lines and moves their revenue with it, so the price charged at
  the till survives. A hand-entered cost replaces the recipe cost (no wastage added) until it is cleared.
- **Changed:** the assistant is told when the analysis changed since its last reply (by the table or a confirmed chat
  change) and to look figures up again, so it does not keep quoting numbers from earlier in the conversation.
- **Migration (additive):** `MenuItem.costOverride` (nullable) and the `RevisionSource` value `MANUAL`.
- **Tests:** backend 71 → 87, frontend 24 → 43. Checked by hand in the browser: figures after each edit against a
  hand calculation, an invalid value, a refused one, Escape, a phone-width screen, the Excel workbook, and the
  assistant answering the same question before and after a table edit.
- **Opened:** KI-22 (chat changes still need Apply) and KI-23 (one unexplained extra revision while testing). KI-21
  (slow "Loading…") was opened and withdrawn the same day: the delay was the test tool, not the app.

### 2026-10-28 — Live deployment; a spreadsheet we cannot read now says why
- **Deployed:** backend and frontend run on the project's Coolify host, and a PDF invoice goes upload →
  n8n → Claude → callback → `READY` there (about 25 s). Found on the way: `crypto.randomUUID` does not exist
  over plain HTTP, so the upload card silently dropped every file (fixed), and a stale
  `PUBLIC_API_BASE_URL` still pointing at a dead tunnel made n8n unable to download anything.
- **Changed:** when a CSV/Excel file has no recognisable header, the message now names what is needed
  ("item name and quantity sold") and lists the columns the file does have, instead of an internal field name.
- **Added:** more header synonyms (VAT-basis wording such as "excl. tax", "takings", "turnover", "RRP",
  "Item Description", "Inv No", "Qty Delivered"…). They are generic guesses; none was checked against a real
  POS vendor's export, which is still the open risk for the first client.
- **Fixed:** in a spreadsheet invoice with no pack column, "Unit Price" was taken by the pack-size field
  (through the word "unit") and the price came out empty.
- **Added (frontend):** a red banner above the figures when a file could not be read, naming the file, the reason
  and what the numbers lose because of it, and the download card says "incomplete". Found live: a POS file
  with unreadable columns still gave a "ready" analysis showing revenue 0 and items sold 0, with the reason only
  as a line in the issue list. Frontend tests 20 → 24.
- **Tests:** `table-parsers.spec.ts` (10), the first tests the column matching has had. Backend 61 → 71.

### 2026-10-27 — MP-01 deployed; PDF extraction works end to end
- **Deployed:** MP-01 is published on the n8n host, authenticated entirely through n8n's own
  credential store. A real PDF supplier invoice now goes upload → dispatch → signed file URL →
  Claude → signed callback → ingest → READY, with the backend reachable through a Cloudflare
  quick tunnel. A photographed menu does too — tilted, soft and unevenly lit, read first time, with
  section headings kept as categories and a priceless dish left priceless. Closes KI-13.
- **Fixed:** three things that only a real host could show — a JSON schema the API rejects
  (a nullable type carrying an enum), a pack stated in its own column being ignored (buns would
  have costed 12× too high), and binary read from the wrong place on a host that stores it on
  disk, which sent every PDF as empty base64.
- **Changed:** the backend logs n8n's side of a failed extraction. The restaurant still sees
  "The AI extraction service could not read this file"; whoever runs it now sees why.
- **Verified by hand:** beef at €0.003/g from a 6 × 2.5kg case, buns at €0.30 from "dozen", the
  delivery charge excluded, the date read as DD/MM, and every menu price net of the right VAT rate
  (23% on the lagers, 13.5% on the food).
- **Added:** `n8n/fixtures/samples/` — generators for both documents, each shaped around a mistake
  that was actually made, so rerunning them catches it coming back.
- **Measured:** extracting one PDF invoice and one menu photo cost about $0.07 on Opus 5.5
  (7,374 input + 2,167 output tokens), now recorded per job in `AnalysisJob.aiUsage`.

### 2026-10-27 — MP-01 extraction workflow written
- **Added:** `n8n/workflows/MP-01.json` — webhook → verify signature → respond → download file →
  Claude → signed callback. It answers the webhook before calling Claude, because the backend's
  dispatch gives up after 15 s while an extraction takes minutes. Claude is asked for the result
  through `output_config.format` with a JSON schema generated from the backend's own Zod schemas,
  so the shape cannot drift silently.
- **Added:** `n8n/check-mp-01.mjs`, which runs the workflow's three Code nodes outside n8n (22 checks:
  signature accepted, tampered body / wrong key / stale timestamp rejected, request shape, and a
  callback signature the backend's own verification accepts), and `n8n/fixtures/` + a backend contract
  test over them (`extraction.contract.spec.ts`). Backend tests 46 → 51.
- **Corrected (docs):** N8N_WORKFLOWS.md said the shared secrets would live in n8n credentials. A Code
  node cannot read one, and the HMAC is per request body, so they are host env vars instead.
- **Not done:** MP-01 has never run on a real n8n host or against a real document, and MP-99 does not
  exist. MP-02 is not needed for Release 1.

### 2026-10-27 — Assistant verified, results table, UI test pass
- **Verified:** the assistant now runs against the real model (`ANTHROPIC_API_KEY` set, `/health` reports
  `assistant: true`). The whole flow was driven through the browser with Playwright: upload → audit →
  results → a question, a recipe + VAT correction, Apply, a multi-turn follow-up → Excel download.
  Every figure was hand-checked, including the split VAT rates (13.5% food, 23% drinks). Closes KI-12.
- **Added (frontend):** a per-item table in the results card — units sold, net price, cost, GP per portion,
  GP % and menu-engineering class, best sellers first, straight from the analysis rather than the assistant.
  A figure that is not known stays an em dash, never a zero.
- **Added:** `GET /upload-limits`, so the upload screen can state what each slot accepts on page load.
  The slots previously read "Loading…" forever, because the limits only arrived with the draft job and
  the draft job is deliberately not created until the first file. Closes KI-16.
- **Added:** `CHAT_EFFORT` (low | medium | high, default medium) alongside `CHAT_MODEL`, so testing can
  run on a cheaper model and effort without touching the production defaults.
- **Opened:** KI-17 (the slot label if `/upload-limits` fails), KI-18 (`progress` still reads 99% once a
  job is READY), KI-19 (menu prices treated as VAT-inclusive while POS "Net Sales" is treated as
  VAT-exclusive — defensible, but worth confirming with the first real client).

### 2026-10-26 — Release 1 implementation (frontend + backend)
- **Added (backend):** the Menu Profit API on NestJS 11 + Prisma 7 + PostgreSQL. Modules: config,
  prisma, storage, files, parsing, extraction, normalization, matching, costing (the deterministic
  calculation engine), revisions, chat (Claude tool loop), exports (Excel), processing (task runner,
  pipeline, n8n callbacks), cleanup, health. 46 unit tests.
- **Added (frontend):** typed API client and job-token session helper; the upload card now talks to
  the backend with multiple files per category and per-file progress; new `/analysis/[jobId]`
  workspace with progress, summary, assistant chat with confirmable corrections, Excel download and
  retention controls.
- **Changed:** `app/layout.tsx` metadata; `NEXT_PUBLIC_API_URL` now points at the backend.
- **Fixed:** token-set similarity scored a name as identical to a longer name containing it, which
  would have auto-accepted "Chicken Wings" as "Chicken Wings Large".
- **Not changed:** the legacy `/api/audits` routes, the JSON store, the login stub and the old n8n
  workflow are all still present, pending approval to remove (ADR-020). n8n workflows are deferred
  by agreement, so PDF and photo uploads are rejected with an explanation.

### 2026-10-23 — Release 1 scope narrowed
- **Changed (docs only):** Release 1 is now upload → backend/n8n processing → chat corrections → Excel download.
  The results dashboard, costing editor, match-review screen and PDF move to Release 2. See ADR-022 and the
  "Release 1 scope" section of MASTER_PLAN.md.

### 2026-10-23 — Restructure and Menu Profit planning
- **Changed:** moved the Next.js app from the repo root into `frontend/`, reinstalled its dependencies, and
  verified `pnpm build` and `pnpm test` (24/24). `node_modules` and `.next` were regenerated rather than moved.
- **Added:** `backend/`, a fresh NestJS 11 scaffold (`@nestjs/cli@11`; `@latest` crashed on Node 22.14).
- **Added:** the planning set in `docs/` (audit, vision, architecture, database schema, API spec, n8n workflows,
  security and retention, testing, budget and scope, decisions, known issues, progress, development workflow,
  and phase docs 00–10), plus the root `README.md`.
- **Not changed:** no application code, no n8n workflows, no deletions of the legacy integration. Those wait for
  plan approval.
