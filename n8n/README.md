# n8n workflows

`MP-01` is the only workflow Release 1 needs. It reads one PDF or photo and returns the data
printed on it; everything else — job state, retries, validation and all financial arithmetic —
stays in the NestJS backend (`docs/N8N_WORKFLOWS.md` §Design rules).

MP-02 (AI assist) is **not** part of Release 1: the backend already does column detection,
matching and recommendations itself, and nothing calls `N8N_ASSIST_PATH`. MP-99 (error
handler) is not built yet; until it is, a crashed execution surfaces through the backend's
five-minute task timeout rather than immediately.

| File | What it is |
|---|---|
| `workflows/MP-01.json` | Import this into n8n |
| `fixtures/mp-01-*-result.json` | What a correct run returns, per category |
| `check-mp-01.mjs` | Runs the workflow's Code nodes outside n8n and checks them against the backend's contract |

## What MP-01 does

```
Webhook → Verify Signature → Respond Accepted → Download File
        → Build Claude Request → Call Claude → Build Callback → Send Callback
```

It answers the webhook before calling Claude, because the backend's dispatch gives up after
15 s while an extraction can take minutes. The result comes back on the signed callback.

## Setting it up

### 1. Host environment

The Code nodes compute HMACs, and a Code node cannot read an n8n credential — so these three
must be environment variables on the n8n host, and env access must be open to Code nodes:

| Variable | Set it to |
|---|---|
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | `false` |
| `MP_INBOUND_KEY` | the backend's `N8N_INBOUND_KEY` |
| `MP_REQUEST_SECRET` | the backend's `N8N_REQUEST_SECRET` |
| `MP_CALLBACK_SECRET` | the backend's `N8N_CALLBACK_SECRET` |

This is a deliberate departure from `docs/N8N_WORKFLOWS.md`, which said secrets would live in
credentials. They cannot: credentials are readable by HTTP nodes, not by Code nodes, and the
signature has to be computed per request body.

Retention settings, which matter because a successful run holds a client's invoice data:

| Variable | Value |
|---|---|
| `EXECUTIONS_DATA_SAVE_ON_SUCCESS` | `none` |
| `EXECUTIONS_DATA_SAVE_ON_ERROR` | `all` |
| `EXECUTIONS_DATA_PRUNE` | `true` |
| `EXECUTIONS_DATA_MAX_AGE` | `48` |
| `NODE_FUNCTION_ALLOW_BUILTIN` | include `crypto` |

### 2. Credential

Create an HTTP Header Auth credential named **MP Anthropic**: header `x-api-key`, value an
Anthropic API key created for n8n alone, so its spend is separate from the chat assistant's.
After importing, open the **Call Claude** node and select it.

### 3. Import and activate

Import `workflows/MP-01.json`, pick the credential, then activate it. Take the **production**
webhook URL (`/webhook/mp-extract`, not `/webhook-test/...`).

### 4. Point the backend at it

In `backend/.env`:

```
N8N_BASE_URL=https://your-n8n-host
N8N_EXTRACT_PATH=/webhook/mp-extract
N8N_INBOUND_KEY=<same value as MP_INBOUND_KEY>
PUBLIC_API_BASE_URL=<a URL n8n can actually reach>
```

`PUBLIC_API_BASE_URL` is the catch. The backend builds both the file download URL and the
callback URL from it, and n8n has to reach both — so `http://localhost:4000` only works if n8n
runs on the same machine. Otherwise expose the backend with a tunnel and put that URL here.

Restart the backend afterwards: `.env` is read once at startup, and a rebuild alone does not
re-read it.

### 5. Check it

```
node n8n/check-mp-01.mjs     # the Code nodes, without n8n
cd backend && pnpm test      # the contract the fixtures describe
```

Then upload a real PDF invoice through the app. `/health` still reports
`aiExtraction: false` until `N8N_BASE_URL` and `N8N_INBOUND_KEY` are both set.

## The contract

Backend → n8n, signed `sha256=HMAC(MP_REQUEST_SECRET, "<timestamp>.<raw body>")` in
`x-mp-signature`, with `x-mp-key` and `x-mp-timestamp` (±5 minutes):

```json
{ "schemaVersion": "1", "jobId": "...", "taskId": "...", "attempt": 1,
  "file": { "id": "...", "category": "MENU|INVOICE|POS", "mimeType": "...",
            "pageCount": 2, "downloadUrl": "..." },
  "hints": { "currency": "EUR" }, "model": "claude-opus-5-5", "callbackUrl": "..." }
```

n8n → backend, signed the same way with `MP_CALLBACK_SECRET`:

```json
{ "schemaVersion": "1", "taskId": "...", "attempt": 1,
  "status": "SUCCEEDED|FAILED", "executionId": "...",
  "result": { ... }, "error": { "code": "...", "message": "..." },
  "usage": { "model": "...", "inputTokens": 0, "outputTokens": 0 } }
```

`result` must match the category's schema in `backend/src/extraction/extraction.schemas.ts` —
the fixtures here are valid examples. The workflow enforces it by asking Claude for that exact
JSON schema through `output_config.format`, and the backend validates it again on arrival.

Two rules the prompt leans on hard, because a wrong number here becomes a wrong food cost for
a real restaurant:

- **Every number is a string, exactly as printed**, dot decimal. No arithmetic anywhere in n8n.
- **Anything unreadable is `null`**, never a guess and never a zero.

A duplicate or late callback is a harmless no-op: the backend only accepts one whose task is
still `DISPATCHED` on the same `attempt`.
