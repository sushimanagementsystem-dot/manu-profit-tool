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

### 1. Credentials — three values you paste, nothing on the host

Everything secret lives in n8n's own encrypted credential store. No host environment
variables, and nothing secret in the workflow or in Git.

| Credential | Type | Header name | Value — copy from |
|---|---|---|---|
| `MP Inbound Key` | Header Auth | `x-mp-key` | `backend/.env` → `N8N_INBOUND_KEY` |
| `MP Anthropic` | Header Auth | `x-api-key` | your Anthropic API key, created for n8n alone |
| `MP Callback Key` | Header Auth | `x-mp-callback-key` | `backend/.env` → `N8N_CALLBACK_KEY` |

Set **Allowed HTTP Request Domains** on each to the one host it may talk to —
`api.anthropic.com` for the Anthropic one, your backend's host for the callback one. That way
a misconfigured node cannot leak a key somewhere else.

**What this trades away.** An earlier design had the Code nodes compute an HMAC over each
body, which also proves the body was not altered in flight. A Code node cannot read an n8n
credential, so that needed the secrets as host environment variables with
`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` — and on a host without that access the only alternative
was writing them into the workflow, where they would reach Git. A shared key in the credential
store is the better trade: the transport is HTTPS, the backend re-validates every result
against its schema, and a callback is only acted on while its task is `DISPATCHED` on the same
attempt, so a replayed one does nothing. The backend still accepts signed callbacks, so a host
that *can* set env vars can go back to HMAC by dropping `N8N_CALLBACK_KEY` and restoring the
signing nodes.

### 1b. Retention settings on the host

Optional, but a successful run holds a client's invoice data:

| Variable | Value |
|---|---|
| `EXECUTIONS_DATA_SAVE_ON_SUCCESS` | `none` |
| `EXECUTIONS_DATA_SAVE_ON_ERROR` | `all` |
| `EXECUTIONS_DATA_PRUNE` | `true` |
| `EXECUTIONS_DATA_MAX_AGE` | `48` |

Without host access, set the same thing per workflow in *… → Settings* (see step 3) — that
covers this workflow, which is what matters here.

### 2. Wire the credentials up

After importing, open the **Webhook** node (Authentication → Header Auth → `MP Inbound Key`),
the **Call Claude** node (→ `MP Anthropic`) and the **Send Callback** node (→ `MP Callback Key`).

### 3. Import and activate

Import `workflows/MP-01.json`, pick the credential, then activate it. Take the **production**
webhook URL (`/webhook/mp-extract`, not `/webhook-test/...`).

Three things the import does **not** do, each of which has bitten this workflow once:

- **It appends rather than replaces.** Importing into a workflow that already has nodes leaves
  both copies, and the new ones come in renamed (`Download File1`), which silently breaks the
  Code nodes — they look each other up by name. Clear the canvas (Ctrl+A, Delete, save) before
  re-importing, or import into a new workflow.
- **It drops workflow settings.** Open *… → Settings* and set **Save successful production
  executions** to *Do not save* by hand; a successful run holds a client's invoice data. Leave
  failed executions saved — that is where debugging happens. These settings do survive a later
  re-import, because they live on the workflow rather than on the nodes.
- **It auto-selects whatever credential it finds first**, including an unrelated one from
  another workflow. Check all three nodes after importing.

This was deployed and published on the project's own n8n host on 2026-10-27, and a real PDF
invoice and a photographed menu both ran through it. The host and workflow id are deployment
details and are deliberately not written down here — take the production URL from the Webhook
node and put it in `backend/.env` as described below.

That host has no `$vars` — Variables are an Enterprise feature there — which is why the
secrets live in credentials rather than in expressions.

### 4. Point the backend at it

In `backend/.env`:

```
N8N_BASE_URL=https://your-n8n-host
N8N_EXTRACT_PATH=/webhook/mp-extract
N8N_INBOUND_KEY=<the value in the MP Inbound Key credential>
N8N_CALLBACK_KEY=<the value in the MP Callback Key credential>
PUBLIC_API_BASE_URL=<a URL n8n can actually reach>
```

`PUBLIC_API_BASE_URL` is the catch. The backend builds both the file download URL and the
callback URL from it, and n8n has to reach both — so `http://localhost:4000` only works if n8n
runs on the same machine. Otherwise expose the backend with a tunnel and put that URL here:

```
cloudflared tunnel --url http://localhost:4000
```

A quick tunnel needs no Cloudflare account, but **its hostname changes every time it starts**.
Each restart means a new `PUBLIC_API_BASE_URL` and another backend restart — and any analysis
still mid-extraction when the old tunnel died will fail, because n8n can no longer reach the
file URL it was given. For anything beyond testing, deploy the backend instead.

While a tunnel is up the whole API is reachable from the internet. What protects it: each
analysis needs its own bearer token, the file URLs are signed, short-lived and only valid
while their task is dispatched, and callbacks need the shared key.

Restart the backend afterwards: `.env` is read once at startup, and a rebuild alone does not
re-read it.

### 5. Check it

```
node n8n/check-mp-01.mjs            # the Code nodes, without n8n
node n8n/check-mp-01.mjs --live     # also asks the API to validate the JSON schemas
cd backend && pnpm test             # the contract the fixtures describe
```

Run `--live` after touching the schemas (it needs `ANTHROPIC_API_KEY` and costs a token or
two). The offline checks compare the schema with the backend's Zod, which cannot see what the
API's own validator will reject — a nullable type carrying an enum passes every offline check
and 400s at request time, which is exactly how MP-01 failed on its first real document.

Then upload a real PDF invoice through the app. `/health` still reports
`aiExtraction: false` until `N8N_BASE_URL` and `N8N_INBOUND_KEY` are both set.

## The contract

Backend → n8n, authenticated by the `x-mp-key` header that the Webhook node's credential
checks. The backend also sends `x-mp-timestamp` and an `x-mp-signature` HMAC, which this
workflow does not verify — a Code node cannot read the secret it would need:

```json
{ "schemaVersion": "1", "jobId": "...", "taskId": "...", "attempt": 1,
  "file": { "id": "...", "category": "MENU|INVOICE|POS", "mimeType": "...",
            "pageCount": 2, "downloadUrl": "..." },
  "hints": { "currency": "EUR" }, "model": "claude-opus-5-5", "callbackUrl": "..." }
```

n8n → backend, carrying `x-mp-callback-key` from its credential (or, on a host that can sign,
`x-mp-signature` over `"<timestamp>.<raw body>"` with `N8N_CALLBACK_SECRET`):

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
