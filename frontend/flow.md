# flow.md

How this app works: entry points, execution order, and how files call into each other. Read
`CLAUDE.md` first for the Next.js 16 specifics this depends on. Update this file whenever the
request flow or file wiring changes.

---

## What this app is

The frontend of Menu Profit. It has **no business logic and no secrets**: every figure it shows
comes from the NestJS API in `../backend`, which owns job state, validation, financial
calculations and exports. There are no accounts and no login.

## The two screens

```
/                        upload: pick files per category, submit
/analysis/{jobId}#k=…    the analysis: progress → summary, assistant, download
```

## Request flow

1. `app/layout.tsx` — fonts, metadata, `<Providers>` (React Query, Tooltip, Toaster).
2. `app/(app)/layout.tsx` — centered gradient shell.
3. The matched page.

There is no `proxy.ts`: with no accounts there is nothing to gate.

## Upload (`/`)

`app/(app)/page.tsx` → `BrandHeader` + `NewAuditCard`.

`components/audit/new-audit-card.tsx` (client):
- Creates the draft job on the **first file added**, not on page load, so an abandoned page leaves
  no empty job behind. Concurrent first uploads share one `createJob()` promise.
- The job's limits and accepted types come from that response, so the client never hardcodes them
  (`lib/audit/slots.ts` only renders what the server said).
- Each file uploads on its own XHR request (`uploadFile` in `lib/api/client.ts`) so there is a real
  per-file progress bar and one failure doesn't take down the batch.
- Remove calls `DELETE /files/{id}`; the token and job id are kept in a ref, not in state, because
  they never need to re-render anything.
- Submit checks `/readiness` first (to show per-category errors in place), then `POST /submit`, then
  routes to the analysis link.

`components/audit/upload-slot.tsx` renders one category: badge, dropzone, file list, progress.

## Analysis (`/analysis/{jobId}`)

`app/(app)/analysis/[jobId]/page.tsx` is a Server Component that awaits `params` **inside** a
`<Suspense>` boundary — Cache Components require a static shell, so the header and the loading card
prerender while the rest streams.

`components/analysis/analysis-workspace.tsx` (client) is the controller:
- Resolves the access token with `useJobToken` (`lib/api/job-session.ts`): the `#k=…` fragment
  first, then localStorage. Browsers never send a fragment to a server, so the token stays out of
  request logs and Referer headers. It is read through `useSyncExternalStore`, which keeps the
  server render ("still resolving") and the client render consistent.
- Polls `GET /jobs/{id}` every 2s while the job is active, and stops at a stable status.
- Branches: no token → "link is incomplete"; 404/410 → "no longer available"; not ready →
  `AnalysisProgress`; ready → summary + download + chat.

Children:
- `analysis-progress.tsx` — stage label, progress bar, per-file state, warnings, retry on failure.
- `analysis-summary.tsx` — KPI tiles, costing coverage, data-quality issues.
- `download-card.tsx` — creates the export, then a single-use link, then navigates to it.
- `chat-panel.tsx` — the assistant, and in Release 1 **the only way to correct the analysis**.
  A correction comes back as a proposal rendered by `proposal-card.tsx`; nothing changes until the
  client confirms, at which point the results and export queries are invalidated.
- `analysis-footer.tsx` — copy link, expiry countdown, delete now.

## Supporting files

- `lib/api/client.ts` — the only module that talks to the backend. Throws `ApiError` carrying the
  API's problem+json code and message, so the UI shows the server's wording rather than its own.
- `lib/api/types.ts` — API shapes. Money and quantities are **strings** (decimals), parsed only at
  the point of display.
- `lib/format.ts` — display formatting. A null is always "—", never 0.
- `lib/audit/slots.ts` — upload slot presentation and the pre-check mirror of the server's rules.
- `components/ui/*` — shadcn primitives. `chart`, `table`, `sheet` and `skeleton` are unused until
  the Release 2 dashboard.

## Open questions

1. **The assistant has not been run against the real model.** The backend needs `ANTHROPIC_API_KEY`;
   until then the chat panel returns a "not configured" error.
2. **PDFs and photos are rejected** with a message asking for CSV/Excel, because the n8n extraction
   workflows (docs/N8N_WORKFLOWS.md) have not been built yet.
