# Phase 6 — Results UI and Interactive Costing

**Status:** Planned. **Deferred to Release 2 (ADR-022).** Release 1 has only a status banner, the chat panel and a
download button on the analysis page.

## Objective
A results workspace in the existing Menu Profit visual style, where the client reads the analysis and edits
costing inputs with immediate, consistent recalculation.

## Scope
The route `/analysis/[jobId]` (client components inside `<Suspense>`, as Cache Components require), with tabs:
1. **Status / Review**: from Phases 3–4.
2. **Summary**: KPI cards (net revenue, units, theoretical vs realised GP, GP %, costed coverage), the top 5
   recommendations, and data-quality callouts.
3. **Sales**: the item table (TanStack Table **v9** API; see `node_modules/@tanstack/table-core/skills/`) with
   sort, filter by category and confidence, sales and revenue mix, and rankings; the category performance table;
   the time-series chart when available.
4. **Menu matrix**: a recharts scatter (popularity × GP/portion) with Star, Plowhorse, Puzzle and Dog quadrants.
5. **Costing**:
   - a per-item drawer (`sheet` primitive) with recipe lines, ingredient prices and their invoice evidence;
   - editable selling price, ingredient qty, unit, ingredient price, and assumptions (VAT, price basis, wastage);
   - each edit opens an **impact preview**, and Apply creates an approved revision.
6. **Data quality**: issues grouped by severity, each with its fix action.
7. **Revision history**: a list with diffs.

Also in scope:
- Confidence badges: `Verified` (emerald), `Partially verified` (blue), `Estimated` (amber), `Incomplete` (gray,
  with the reason). Colors come from **new CSS tokens** in `globals.css`, not hardcoded colors (CLAUDE.md).
- A "Copy secure link" control with an expiry countdown and a "Delete analysis now" button.
- A "Start another analysis" link back to `/`.
- Retire the old frontend integration once the new flow works. **After approval:** `app/api/audits/**`,
  `lib/audit/store.ts`, `lib/audit/env.ts`, `.data/`, `proxy.ts` gate, and `(auth)/login`.
- Set `app/layout.tsx` metadata.

**Exclusions:** chat (Phase 7) and download buttons (Phase 8; placeholders hidden).

## Dependencies
Phase 5.

## Frontend tasks
As in Scope. Reuse `card`, `table`, `chart`, `skeleton`, `sheet`, `tooltip` and `button`. Motion stays subtle
(`tw-animate-css`) and respects reduced motion. Mobile is usable: tables scroll horizontally, and the drawer
becomes full-screen.

## Backend tasks
Small endpoint adjustments found during the UI build. Pagination and filtering on items if needed.

## Database changes
None.

## n8n workflows
None.

## API endpoints
Consumes the Phase 5 endpoints.

## Testing requirements
- Component tests (Vitest + Testing Library; the dependency needs approval) for confidence rendering and the
  edit-preview-apply flow.
- A manual run through DS-1 and DS-7.
- Lighthouse on `/` and the analysis route, kept clean per the CLAUDE.md performance conventions.

## Acceptance criteria
- An edit to a price or recipe line updates the item, the category, the summary and the matrix after apply, with
  the numbers equal to the API snapshot.
- Estimated and incomplete data is visibly distinct.
- The existing upload page looks unchanged.

## Risks
UI scope creep (mitigated: the prototype ships Summary, Sales, Costing drawer and Data quality only); table
performance (200 rows is fine).

## Deliverables
The analysis workspace UI and the retired legacy frontend integration.
