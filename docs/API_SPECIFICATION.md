# API Specification — Menu Profit (NestJS, REST)

Status: **PLANNED. Not implemented.** Base path: `/api/v1`. JSON unless stated. Money values are serialized as
**decimal strings** (`"12.5000"`) to avoid float loss. Times are ISO-8601 UTC.

## Conventions

**Authorization.** Every `/jobs/{jobId}/**` route requires `Authorization: Bearer <accessToken>`.
`JobAccessGuard` hashes the token, compares it in constant time, and checks `status != EXPIRED`.
- A missing job and a wrong token both return **404** `job_not_found`, so there is no existence oracle.
- An expired job returns **410** `job_expired`, but only once the token has been verified.

**Errors.** Errors use RFC 9457 `application/problem+json`:
```json
{ "type": "https://menuprofit.app/errors/validation_failed", "title": "Validation failed", "status": 422,
  "code": "validation_failed", "detail": "1 file was rejected.", "errors": [{ "path": "files[0]", "code": "unsupported_type", "message": "…" }],
  "requestId": "…" }
```
Codes: `validation_failed` 422, `bad_request` 400, `job_not_found` 404, `job_expired` 410, `invalid_state` 409,
`revision_conflict` 409, `payload_too_large` 413, `unsupported_media_type` 415, `rate_limited` 429 (with
`Retry-After`), `ai_unavailable` 503, `internal` 500.

**Idempotency.** `POST /jobs`, `POST /jobs/{id}/submit`, `POST /jobs/{id}/revisions/{rid}/approve` and
`POST /jobs/{id}/exports` accept an `Idempotency-Key` header (UUID). The same key returns the stored response for
24 h, and the same key with a different body returns 409.

**Rate limits** (per IP unless noted; in-memory `@nestjs/throttler`, single instance):

| Endpoint | Limit |
|---|---|
| create job | 10 / hour |
| upload | 120 / hour per job |
| submit | 5 / hour per job |
| chat | 30 / hour per job, 50 total per job |
| exports | 20 / hour per job |
| reads | 600 / hour per job |

## Public endpoints (browser)

### POST /jobs — create a draft job
Request: `{ "currency"?: "EUR" }`
201:
```json
{ "jobId": "uuid", "accessToken": "base64url-43-chars", "status": "DRAFT", "expiresAt": "…",
  "limits": { "maxFileBytes": 15728640, "maxTotalBytes": 157286400,
    "categories": { "MENU": { "maxFiles": 5, "accept": ["application/pdf","image/jpeg","image/png","text/csv","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"] },
                    "INVOICE": { "maxFiles": 40, "accept": ["application/pdf","image/jpeg","image/png","text/csv","…sheet"] },
                    "POS": { "maxFiles": 5, "accept": ["text/csv","…sheet","application/pdf"] } },
    "maxPdfPages": 20 } }
```
The token is returned **only here**. The frontend builds the link `/analysis/{jobId}#k={accessToken}`.

### POST /jobs/{jobId}/files — upload one file (multipart)
Fields: `category` (MENU|INVOICE|POS), `file`; optional `validFrom`/`validTo` (MENU only).
The UI uploads one file per request with XHR so it can show per-file progress and retry a single failed upload.
- 201: `{ "file": { "id", "category", "originalName", "sizeBytes", "mimeType", "status": "UPLOADED" } }`
- Errors: 415 (sniffed type not allowed), 413 (size), 422 `duplicate_file` (same SHA-256),
  422 `category_limit`, 409 `invalid_state` (not DRAFT).

### DELETE /jobs/{jobId}/files/{fileId} — remove before submission
204. Returns 409 if the job is not DRAFT.

### GET /jobs/{jobId}/readiness
200: `{ "ready": false, "issues": [{ "code": "missing_category", "category": "POS", "message": "Upload at least one POS sales report." }] }`.
Rules: at least one file per category; total size within limits.

### POST /jobs/{jobId}/submit
Request: `{ "assumptions"?: { "vatRateFood"?: "0.135", "vatRateDrink"?: "0.23", "menuPricesIncludeVat"?: true, "reportingPeriod"?: {...} } }`
202: `{ "status": "QUEUED", "expiresAt": "…" }`. Returns 409 if not DRAFT, and 422 with issues if not ready.

### GET /jobs/{jobId} — status and progress (polled)
200:
```json
{ "jobId", "status": "EXTRACTING", "progress": { "stage": "EXTRACTING", "completedTasks": 7, "totalTasks": 24, "percent": 29,
  "messages": [{ "level": "warning", "code": "invoice_unreadable", "fileId": "…", "text": "Invoice 'IMG_2231.jpg' could not be read clearly." }] },
  "files": [{ "id", "category", "originalName", "status" }], "currentRevision": 0,
  "counts": { "pendingMatches": 0, "blockingIssues": 0 }, "expiresAt": "…" }
```

### POST /jobs/{jobId}/retry
202. Allowed from FAILED. It re-queues failed tasks only.

### DELETE /jobs/{jobId}
202. The user asks for immediate deletion. Data and files are purged and the job becomes a tombstone.

### GET /jobs/{jobId}/results?revision=n
200: the `ResultSnapshot` payload.
```json
{ "revision": 3, "calcVersion": "1.0.0", "snapshotHash": "…",
  "summary": { "netRevenue": "…", "unitsSold": "…", "theoreticalGp": "…", "realisedGp": "…", "gpPercent": "…", "coverage": { "itemsCosted": 31, "itemsTotal": 40, "revenueCoveredPct": "0.8700" } },
  "items": [{ "menuItemId", "name", "category", "netPrice", "costPerPortion", "gpPerPortion", "gpPercent", "unitsSold",
              "netRevenue", "salesMixPct", "revenueMixPct", "gpContribution", "matrixClass": "STAR", "confidence": "ESTIMATED",
              "reasons": ["2 recipe lines are AI estimates"] }],
  "categories": [ … ], "matrix": { "thresholds": { … }, "points": [ … ] }, "timeSeries": [ … ] | null,
  "dataQuality": [{ "code": "menu_stability_below_threshold", "severity": "warning", "value": "0.4200", "text": "…" }],
  "recommendations": [{ "id", "priority", "kind", "title", "body", "impact": { "deltaGpPerPeriod": "…", "basis": "constant volume" } }] }
```

### GET /jobs/{jobId}/issues
Returns the data-quality issues and missing information (blocking first). Each issue carries a `fixAction` hint
(`review_match`, `enter_price`, `enter_recipe`, `set_assumption`).

### Matching review
- `GET /jobs/{jobId}/matches?kind=&status=PENDING&page=` returns 200 `{ items: [{ id, kind, source: {id,label}, candidate: {id,label}|null, alternatives: [...], score, method, rationale, blocking }], page }`.
- `POST /jobs/{jobId}/matches/decisions` takes `{ "decisions": [{ "matchId", "action": "APPROVE"|"REJECT"|"REASSIGN", "candidateId"? }] }`.
  It creates and approves one Revision (`DECIDE_MATCH` ops) and returns `{ revision, status }`. The job moves
  NEEDS_REVIEW → CALCULATING → READY when no blocking items remain.

### Costing
- `GET /jobs/{jobId}/costing/items/{menuItemId}` returns the item's recipe lines with ingredient prices, the
  price provenance (invoice, line, date), the conversions, and the confidence of each.
- `GET /jobs/{jobId}/ingredients?search=` returns ingredients with their price history (`IngredientPrice`) and
  invoice evidence.

### Revisions
- `POST /jobs/{jobId}/revisions/preview` takes `{ "baseRevision": 3, "operations": [ … ] }`. It is a dry run and
  returns 200 `{ valid, errors[], impact: { items: [{menuItemId, before:{…}, after:{…}}], totals: {before, after} } }`.
- `POST /jobs/{jobId}/revisions` takes `{ "baseRevision", "operations", "autoApprove": true, "rationale"? }`
  (UI edits). It returns 201 `{ revision }` or 409 `revision_conflict`.
- `POST /jobs/{jobId}/revisions/{revisionId}/approve` returns 200 `{ revision, snapshot: { revision, snapshotHash } }`.
  It is idempotent and returns 409 if STALE or REJECTED.
- **As built (Release 1):** `POST /jobs/{jobId}/revisions/apply` takes `{ "operations": [ … ] }` (1–20) and is what the
  results table's inline edits call. It validates, applies, recalculates and records one revision in a single
  transaction (source `MANUAL`) and returns `{ revision, impact }`. A failed operation rolls everything back and
  answers 422 with the reason (no `baseRevision` check; operations are validated against the current data).
  Operations added for it, all validated by the same zod schema as the chat's:
  `RENAME_MENU_ITEM { menuItemId, name }`, `SET_UNITS_SOLD { menuItemId, quantity }` (spreads the new total over
  the item's POS lines and moves their revenue with the quantity) and `SET_ITEM_COST { menuItemId, cost | null }`
  (a hand-entered cost per portion that replaces the recipe cost; `null` hands the decision back to the recipe).
- `POST /jobs/{jobId}/revisions/{revisionId}/reject` returns 200.
- `GET /jobs/{jobId}/revisions` returns the history with diffs (`appliedDiff`), source, and timestamps.

Operation schema (discriminated union, validated with zod, all values are decimal strings):
```json
{ "op": "SET_SELLING_PRICE", "menuItemId": "…", "grossPrice": "14.50" }
{ "op": "SET_RECIPE_LINE", "recipeLineId": "…", "quantity": "180", "unit": "g" }
{ "op": "ADD_RECIPE_LINE", "menuItemId": "…", "ingredientId": "…", "quantity": "20", "unit": "ml" }
{ "op": "REMOVE_RECIPE_LINE", "recipeLineId": "…" }
{ "op": "SET_INGREDIENT_PRICE", "ingredientId": "…", "pricePerUnit": "8.40", "unit": "kg" }
{ "op": "SET_ASSUMPTION", "key": "VAT_RATE_FOOD", "value": "0.135" }
{ "op": "DECIDE_MATCH", "matchId": "…", "action": "REASSIGN", "candidateId": "…" }
{ "op": "SET_UNIT_CONVERSION", "ingredientId": "…", "fromUnit": "bunch", "toUnit": "g", "factor": "50" }
{ "op": "EDIT_RECOMMENDATION", "recommendationId": "…", "title"?: "…", "body"?: "…", "status"?: "DISMISSED" }
```
Validation rules:
- every referenced ID belongs to this job;
- quantities > 0 and prices ≥ 0;
- units are convertible to the ingredient's base unit;
- VAT is between 0 and 0.5;
- at most 200 operations per revision.

### Chat
- `POST /jobs/{jobId}/chat/messages` takes `{ "content": "What happens if I raise the burger by €1?" }`. It returns
  **SSE stream** (`text/event-stream`) events: `token`, `tool_activity`, `proposal` (`{revisionId, operations, impactPreview}`),
  `done` (`{messageId, usage}`), and `error`. A non-streaming fallback is available with `?stream=false`.
- `GET /jobs/{jobId}/chat/messages?before=&limit=50` returns the history.

### Exports
- `POST /jobs/{jobId}/exports` takes `{ "format": "XLSX"|"PDF", "revision"?: n }`. It returns 202 `{ exportId, status }`,
  or 200 if already READY for that revision.
- `GET /jobs/{jobId}/exports` lists exports with their status.
- `POST /jobs/{jobId}/exports/{exportId}/link` returns 200 `{ "url": "/api/v1/downloads/{token}", "expiresAt": "+5 min" }`.
- `GET /downloads/{token}` needs no bearer token. The HMAC token is single-use, bound to the export, and expires
  after 5 minutes. It streams the file with `Content-Disposition: attachment`, `Cache-Control: no-store`,
  `X-Content-Type-Options: nosniff`.

## Internal endpoints (n8n only; not reachable from the browser path in production)

### GET /internal/files/{fileId}?task={taskId}&exp={unix}&sig={hex}
`sig = HMAC_SHA256(N8N_FILE_URL_SECRET, fileId|taskId|exp)`. It returns 403 if the signature is invalid or
expired, or if the task is not DISPATCHED. It streams the raw bytes.

### POST /internal/n8n/callbacks
Headers: `X-MP-Timestamp` (unix seconds, ±300 s), `X-MP-Signature: sha256=<hex>` over `timestamp + "." + rawBody`
using `N8N_CALLBACK_SECRET`.
```json
{ "taskId": "…", "attempt": 1, "status": "SUCCEEDED"|"FAILED", "workflow": "MP-01", "executionId": "…",
  "result": { …schema per task type… } | null, "error": { "code": "provider_rate_limited", "message": "…" } | null,
  "usage": { "model": "claude-opus-5-5", "inputTokens": 0, "outputTokens": 0 }, "durationMs": 0 }
```
Responses:
- 200 `{ accepted: true }`;
- 200 `{ accepted: false, reason: "duplicate" }` for a duplicate or stale attempt. This is not an error, so n8n
  stops retrying;
- 401 for a bad signature;
- 422 if the result fails schema validation. The task is then marked FAILED with `invalid_ai_output` and retried
  by the backend.

### GET /health
`{ status, db, storage }`. No secrets and no counts.
