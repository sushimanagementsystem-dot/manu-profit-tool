# n8n Workflow Architecture — Menu Profit

Status: **PLANNED. No workflows have been created or deployed.** The old `frontend/n8n/menu-profit-workflow.json`
(Google Sheets based, with financial math in Code nodes) is **not reused**. It stays in the repo until MP-01 has
replaced it end to end, and is then archived with approval (see Phase 9).

## Design rules
1. **NestJS owns state.** Every n8n execution handles **one task** (one file, or one assist request). It gets
   all of its inputs in the trigger payload, fetches at most one file over a signed URL, and reports through one
   signed callback.
2. **n8n stores nothing.** It has no Google Sheets and no Data Tables. Its execution-data saving is turned off for
   successful runs, and failed runs are pruned after 48 h (see the host settings below).
3. **No financial arithmetic in n8n.** It may check shapes, but the backend validates and calculates.
4. **The backend owns retries and idempotency.** n8n node-level retries handle provider blips only. The backend
   re-dispatches with `attempt+1` and ignores late callbacks for older attempts.

### Why not a coordinator workflow in n8n?
The brief suggests evaluating a coordinator. It is rejected: a coordinator would duplicate the job state machine
that NestJS must own anyway, and it would create two sources of truth for progress and retries. NestJS already
schedules the per-file tasks (ARCHITECTURE.md §5). Cleanup is also excluded from n8n, because the system that
owns the data deletes it.

## Workflow inventory (3)

| ID | Name | Trigger | Purpose |
|---|---|---|---|
| MP-01 | Menu Profit — Document Extraction | Webhook `POST /webhook/mp-extract` | Extract structured data from one menu/invoice/POS file (PDF or image) with Claude |
| MP-02 | Menu Profit — AI Assist | Webhook `POST /webhook/mp-assist` | Column mapping, match suggestions, recipe estimates, recommendation wording |
| MP-99 | Menu Profit — Error Handler | Error Trigger (set as error workflow of MP-01/02) | Report crashed executions to the backend at once, without waiting for the timeout |

---

## MP-01 Document Extraction

**Invocation.** NestJS `ExtractionDispatcher` sends one call per file task. Concurrency is limited by the backend.

**Inbound auth.**
- The Webhook node uses a *Header Auth* credential (`X-MP-Key`).
- A Code node then verifies `X-MP-Signature` (HMAC-SHA256 over `timestamp.rawBody`, ±300 s). This needs
  `NODE_FUNCTION_ALLOW_BUILTIN=crypto` on the host.
- Raw body access must be enabled on the Webhook node.

**Input JSON schema**
```json
{ "schemaVersion": "1", "jobId": "uuid", "taskId": "uuid", "attempt": 1,
  "file": { "id": "uuid", "category": "INVOICE|MENU|POS", "mimeType": "application/pdf|image/jpeg|image/png",
            "downloadUrl": "https://api…/api/v1/internal/files/{id}?task=…&exp=…&sig=…", "pageCount": 2 },
  "hints": { "currency": "EUR", "language": "en", "menuValidFrom": null },
  "model": "claude-opus-5-5", "callbackUrl": "https://api…/api/v1/internal/n8n/callbacks" }
```

**Nodes**
1. `Webhook`: responds immediately with 202 (Respond: *Immediately*), so the backend is not held open.
2. `Verify Signature` (Code): throws on a bad signature or a stale timestamp. That routes to MP-99, which
   reports `auth_failed`.
3. `Download File` (HTTP Request GET `downloadUrl`, response = file, timeout 30 s, retry 2 × 5 s).
4. `Route by Category` (Switch): selects the prompt and schema for the category.
5. `Build Claude Request` (Code): base64 document block (PDF) or image block, a fixed system prompt, and
   `output_config.format` = the JSON schema for the category. Structured outputs guarantee parseable JSON.
6. `Call Claude` (HTTP Request POST `https://api.anthropic.com/v1/messages`, credential = Anthropic header auth,
   timeout 180 s). Retry on fail: 3 tries with a 15 s wait, covering 429/529/5xx only.
7. `Check Stop Reason` (IF): `refusal` or `max_tokens` → failure path with code `ai_refused` / `ai_truncated`.
8. `Shape Result` (Code): pulls the JSON out and attaches `usage` (input/output tokens, model). No arithmetic.
9. `Sign & Send Callback` (Code builds the signature → HTTP Request POST `callbackUrl`, retry 5 × 10 s).
10. On any node error → the error output → `Send Failed Callback` with `{status: "FAILED", error: {code, message}}`.

**Output schemas** (`result` in the callback). They are summarized here; the zod definitions live in
`backend/src/extraction/schemas/`.
- `InvoiceExtraction`:
  `{ supplierName, invoiceNumber|null, invoiceDate|null, currency|null,
  totals: {net|null, vat|null, gross|null},
  lines: [{ description, quantity|null, packCount|null, packSize|null, packUnit|null, unitPrice|null, lineNet|null, vatRate|null, sourcePage, modelConfidence: "high|medium|low" }],
  warnings: [string] }`
- `MenuExtraction`:
  `{ items: [{ name, category|null, description|null, price|null, priceVariants: [{label, price}], sourcePage }], validFromHint|null, warnings }`
- `PosExtraction`:
  `{ periodStart|null, periodEnd|null, rows: [{ itemName, category|null, quantity|null, netRevenue|null, grossRevenue|null, date|null }], warnings }`
- Numbers are returned as strings exactly as printed, without inventing values (`null` when unreadable).

**Validation responsibility.** n8n checks only that the JSON parses and the top-level keys exist. The backend
then runs:
- zod validation;
- arithmetic cross-checks;
- unit parsing;
- duplicate detection;
- the system confidence computation.

**Timeouts.** The backend task deadline is 5 min per file. A PDF over 20 pages is rejected at upload. A long PDF
(over 10 pages) is split by page range into several tasks (MVP).

**Idempotency.** The callback carries `taskId` + `attempt`. The backend accepts it only if the task is
`DISPATCHED` with that attempt. A duplicate returns `{accepted:false}` with 200, so n8n does not loop.

**Logging and monitoring.**
- n8n stores error executions only (pruned at 48 h). Successful-execution data is not saved, because it
  contains invoice content.
- The backend logs task id, duration, tokens, and outcome, never content.
- The backend reports failure-rate and latency figures in `/health` details (internal only).

**Cost** (estimate; see BUDGET_AND_SCOPE.md): for 20 invoices of about 2 pages each, roughly 140 k input and
50–60 k output tokens. That is about **$1.7 per audit on Claude Opus 5.5**. Cheaper models are possible after
evals, and the choice is the client's.

---

## MP-02 AI Assist

The trigger, auth, callback, and idempotency are the same as in MP-01.

**Input**
```json
{ "schemaVersion": "1", "jobId", "taskId", "attempt", "taskType": "COLUMN_MAPPING|MATCH_SUGGESTIONS|RECIPE_ESTIMATE|RECOMMENDATIONS",
  "payload": { … minimal data for the task … }, "model": "claude-opus-5-5", "callbackUrl": "…" }
```
Payloads are kept minimal. They send names and numbers only, never whole documents:
- `COLUMN_MAPPING`: `{ fileKind: "POS"|"MENU"|"INVOICE", headers: [..], sampleRows: [[..] × 5] }` →
  `{ mapping: { itemName: "colIdx", quantity: …, netRevenue: …, grossRevenue: …, date: …, category: … }, notes }`
- `MATCH_SUGGESTIONS`: `{ kind, sources: [{id, label}], candidates: [{id, label}] }` (≤ 200 × 400 per call) →
  `{ suggestions: [{ sourceId, candidateId|null, rationale, modelConfidence }] }`
- `RECIPE_ESTIMATE`: `{ menuItems: [{id, name, description, category, netPrice}], ingredients: [{id, name, baseUnit}] }` →
  `{ recipes: [{ menuItemId, lines: [{ ingredientId, quantity, unit, rationale }] }] }`. Only ingredients from the
  list may be used, which is validated server-side.
- `RECOMMENDATIONS`: `{ facts: [{ factId, type, menuItem, metrics… }] }`. The facts are computed by the
  engine. Output: `{ recommendations: [{ factIds: [..], title, body, priority }] }`. The backend attaches the
  impact numbers from the engine. Numbers in the model's text are checked against the facts, and a mismatch drops
  the recommendation.

**Nodes:** Webhook → Verify Signature → Switch(taskType) → Build Request (Code, one per type) → Call Claude →
Check Stop Reason → Shape Result → Sign & Send Callback, plus the error path. This is one workflow with a Switch
rather than four workflows, because auth, error handling, and callback logic are identical. (Consolidated as the
brief allows.)

**Cost:** about $0.3–0.6 per audit on Opus 5.5 (estimate).

---

## MP-99 Error Handler

- **Trigger:** n8n *Error Trigger*. It is configured in the workflow settings of MP-01 and MP-02.
- **Function:** it extracts `execution.id`, `workflow.name`, `lastNodeExecuted`, and `error.message` (truncated
  to 300 chars, without payload data). It parses `taskId`/`attempt` from the trigger data where available, and
  POSTs a signed `FAILED` callback with code `n8n_execution_error`.
- **Why it matters:** without it, a crashed execution is only detected by the 5-min backend timeout.

---

## n8n host configuration (self-hosted, existing instance)
| Setting | Value | Why |
|---|---|---|
| `EXECUTIONS_DATA_SAVE_ON_SUCCESS` | `none` | Successful runs contain invoice data |
| `EXECUTIONS_DATA_SAVE_ON_ERROR` | `all` | Debugging |
| `EXECUTIONS_DATA_PRUNE` / `EXECUTIONS_DATA_MAX_AGE` | `true` / `48` (hours) | Matches the retention policy |
| `NODE_FUNCTION_ALLOW_BUILTIN` | `crypto` | HMAC in Code nodes |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | keep the default; secrets live in credentials | |
| Credentials | `MP Anthropic` (header `x-api-key` + `anthropic-version`), `MP Inbound Key` (header auth), `MP Callback Secret` (used by Code node) | A separate Anthropic key for n8n, for spend tracking |
| Webhook URLs | Production URLs only (`/webhook/…`, not `/webhook-test/…`) | `.env.example` currently points at a test URL |

Verify the env-var names against the installed n8n version before applying them.

## Backend env vars for n8n (planned)
`N8N_BASE_URL`, `N8N_EXTRACT_PATH`, `N8N_ASSIST_PATH`, `N8N_INBOUND_KEY`, `N8N_REQUEST_SECRET` (signs
backend→n8n), `N8N_CALLBACK_SECRET` (signs n8n→backend), `N8N_FILE_URL_SECRET` (signs file URLs),
`PUBLIC_API_BASE_URL` (used to build the callback and file URLs). These are four distinct random secrets of 32+
bytes each.

## Delivery and versioning
- The workflows are exported as JSON to `n8n/workflows/MP-01.json`, `MP-02.json`, and `MP-99.json` (repo root). They
  contain **no credentials**, only credential names.
- Changes go through a PR. The schema version bumps on any input or output change, and the backend rejects
  callbacks with an unknown version.
- Test fixtures in `n8n/fixtures/` hold sample payloads and expected outputs, used by the backend contract tests.
