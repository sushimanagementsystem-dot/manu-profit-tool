# n8n setup — Menu Profit Audit workflow

`menu-profit-workflow.json` is the importable Phase 1 workflow. It cannot be created
for you through the connected n8n MCP integration — that connection only exposes
`search_workflows` / `get_workflow_details` / `execute_workflow` (no create/import
tool) — so this file has to be imported by hand, once.

## 1. Import the workflow

In n8n: **Workflows → Import from File** (or paste the JSON directly onto an empty
canvas with Ctrl+V) → select `n8n/menu-profit-workflow.json`.

## 2. Required because this is self-hosted n8n

Two Code nodes (`Parse Spreadsheet Files`, `Generate Excel Report`) `require()` npm
packages that aren't bundled with n8n by default. This **only works on self-hosted
n8n** — Code nodes on n8n Cloud are sandboxed and can't load external packages (if
you're actually on Cloud, see "n8n Cloud alternative" below).

1. Install the packages where n8n's Code nodes can see them:
   ```bash
   # if running n8n via Docker, from inside the container (or extend the image):
   npm install xlsx exceljs
   ```
2. Allow n8n to `require()` them — set this environment variable on the n8n host
   before starting it:
   ```
   NODE_FUNCTION_ALLOW_EXTERNAL=xlsx,exceljs
   ```
3. Restart n8n.

**n8n Cloud alternative** (if you're not actually self-hosted): remove the
`Generate Excel Report` Code node and instead add a Google Sheets node that exports
the "Costing & Profit" sheet as `.xlsx` directly (Sheets' own export), or call an
external file-conversion HTTP API from an HTTP Request node. The rest of the
workflow (webhook, extraction, calculations, Sheets writes) works unchanged on
Cloud since none of those nodes need external packages.

## 3. Credentials to create in n8n

| Credential | Type | Used by | What to put in it |
|---|---|---|---|
| Anthropic API Key | Generic → Header Auth | `Claude: Extract Document Data` | Header name `x-api-key`, value = your Anthropic API key |
| Google Sheets (Menu Profit) | Google Sheets OAuth2 | the 6 `Sheets: *` nodes | Connect your Google account via n8n's OAuth flow |

After creating them, open each node listed above and select the credential from the
dropdown (the JSON ships with a placeholder credential ID that won't resolve to
anything real on your instance).

## 4. Environment variables to set on the n8n host

| Variable | Used by | Must match |
|---|---|---|
| `MENU_PROFIT_WEBHOOK_SECRET` | `Validate Secret` node | Next.js's `N8N_WEBHOOK_SECRET` (`.env.example`) |
| `MENU_PROFIT_CALLBACK_SECRET` | `Send Completed/Failed Callback` nodes | Next.js's `N8N_CALLBACK_SECRET` |
| `MENU_PROFIT_CALLBACK_BASE_URL` | same two nodes | Your Next.js app's public base URL, e.g. `https://your-app.example.com` (no trailing slash) — **not** `localhost` unless n8n and Next.js are on the same machine/network |

## 5. Google Sheet setup

Create one spreadsheet with six tabs, named **exactly**:

- `Menu Items`
- `Supplier Ingredients`
- `POS Sales`
- `Costing & Profit`
- `Review Required`
- `Audit Summary`

The workflow's `appendOrUpdate` operations auto-map columns from whatever fields
each Code node outputs (see the field names in `menu-profit-workflow.json`'s Code
nodes — e.g. `Costing & Profit` gets `name`, `category`, `sellingPrice`,
`ingredientCost`, `grossProfitPerPortion`, `gpPercent`, `unitsSold`,
`totalGpContribution`, `salesMixPercent`, `confidence`). You don't need to
pre-create the header row — `autoMapInputData` creates it from the first write, but
if you want to control column order, add the header row yourself first using
the same field names.

Copy the spreadsheet's ID (from its URL) into `PLACEHOLDER_GOOGLE_SHEET_ID` in each
of the 6 `Sheets: *` nodes' `documentId` parameter (find-and-replace works fine
directly in the imported workflow's JSON, or set it per-node in the n8n UI).

## 6. Get the production webhook URL

Open the `Webhook` node → copy its **Production URL** (not the Test URL — the test
URL only works while you have the node's test panel open). Put that URL into
Next.js's `N8N_WEBHOOK_URL` env var.

## 7. Activate the workflow

The workflow must be **Active** (toggle in the top-right of the n8n editor) for its
production webhook URL to accept real requests — the test URL works while inactive
but only for manual test runs from the editor.

## Known limitations of this workflow (Phase 1, by design)

- **Ingredient matching is name-based only** (`Match Ingredients & Sales` node) — it
  does substring/exact matching between menu item names and ingredient/invoice
  names. There's no real recipe/bill-of-materials model (one menu item = many
  ingredients in different quantities) — that's explicitly Phase 2 scope.
- **PDF/image extraction depends entirely on Claude's reading of the document** —
  there's no dedicated OCR step or a human-in-the-loop correction UI yet. Anything
  Claude can't read confidently should come back as `null` fields, which the
  calculation functions then correctly mark `incomplete` rather than guess — but
  there's no way for a user to fix a wrong-but-present value from the UI yet.
- **The calculation formulas are duplicated**, not shared, between this workflow's
  `Calculate Profitability` Code node and `lib/audit/calculations.ts` in the
  Next.js app (different runtimes, can't share TS modules across them in Phase 1).
  If you change one, change the other — see `changes.md` entry for this workflow.
- **No retry/idempotency on the webhook** — if Next.js's forward times out but n8n
  actually received it, re-submitting the form creates a second, independent audit
  rather than detecting the duplicate.
- **Google Sheets `appendOrUpdate` matching** on `name` means two menu items with
  the exact same name will collide (the second overwrites the first's row) across
  separate audits — there's no per-audit namespacing in the sheet rows yet, only in
  `Audit Summary` (matched on `auditId`).
