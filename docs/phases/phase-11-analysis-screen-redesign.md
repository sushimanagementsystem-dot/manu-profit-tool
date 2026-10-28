# Phase 11 — Analysis screen redesign

**Status:** In progress. Step 1 (prototype) done 2026-10-28; waiting for design approval before any code changes.
**Scope:** this one screen only: `/analysis/[jobId]` (`AnalysisWorkspace` and what it renders). No other page,
no new route, no change to the application structure, the API or the data model unless a step below says so and
the change is approved first.

## Objective
Make the analysis screen easier to read and act on: a clearer hierarchy, an editable table that is pleasant to use,
profitability figures that show what is known and what is not, warnings that point at the thing to fix, and a chat
panel that sits beside the table instead of under it. All current behaviour is kept. The Menu Profit identity stays:
the green bar-chart mark, Geist, emerald as the one accent colour, soft warm background, plain language.

## Starting point
- Current screen: `screens/current/analysis-screen-current.png`.
- Reference supplied: `screens/reference/analysis-screen-reference.png`. A reference, not a requirement.
- Proposed design: `screens/prototype/` (see below).

## What must keep working (inventory of the current screen)
| Area | Behaviour to preserve |
|---|---|
| Headline | Net revenue, items sold, gross profit, GP %; the coverage statement ("costs complete for N of M items, X % of revenue"); a missing figure is a dash, never a zero |
| Table | Edit name, units sold, menu price and cost in place (Enter / Esc, validation, server wording on refusal); net price, GP / portion, GP %, class read-only; `est.` and `set` markers with the reason on hover; best sellers first; rows that an edit or a chat change moved are highlighted; "Recalculating…" state |
| Issues | Critical / warning / info lines from the analysis, in the engine's words |
| Unread files | The red banner and the "incomplete" wording on the download |
| Download | Excel export of the current revision; "includes N confirmed changes" |
| Chat | Suggestions, history, a proposed change shown for confirmation (Apply / Discard) with its impact, input; nothing changes figures until confirmed |
| AI cost | The testing-only card, hidden when the server does not send it |
| Footer | Expiry notice, Copy secure link, Delete now (two-step) |
| States | Opening, failed, expired link, incomplete link, loading results, progress screen (unchanged by this phase) |

## Gap between the reference and the product
The reference draws things that do not exist. They are either dropped or listed as new work with a cost.

| In the reference | Decision |
|---|---|
| Food photos beside each dish | **Dropped.** The product has no images of dishes. A category-tinted initial stands in. |
| "Total Cost (COGS)" tile | **Reframed.** Cost is only known for costed items; a COGS total over all items would be false. The tile shows coverage instead. |
| "+12.4 %" / "+8.2 %" trend chips | **Dropped.** There is no previous period to compare with. |
| Tabs: Key insights, Recommendations, Charts | **Not drawn as tabs.** Recommendations exist in the analysis and the workbook but are not shown on the screen today; the prototype adds a short "Recommendations" block (new, needs no API change). Charts are out of scope. |
| "Upload New Data", "Adjustments" buttons | "New analysis" kept as a quiet link to `/` (exists today). "Adjustments" is not built: assumptions (VAT, price basis) are changed through the chat today; the prototype shows them read-only (**needs** the assumptions added to the results payload, small). |
| Status pills Profitable / Low profit / Check data | **Reframed** as the engine's menu-engineering class plus a data-state pill (Needs cost, Not linked). "Low profit" is not an engine concept; the 60 % threshold in the reference is invented. |
| Chat that "updates the table in real time" with no confirmation | **Not adopted.** A change proposed by the assistant still needs Apply (KI-22). Edits made directly in the table are immediate, as built. |
| Search, filter chips, column chooser | Search and filter chips are client-side only (new, no API change). Column chooser dropped. |
| Sortable columns | New, client-side only. |

## Design principles
1. **One accent.** Emerald for the brand, primary action and "good"; amber for caution; rose only for things that are
   wrong. Colour is never the only signal (icon and text accompany it).
2. **Known vs estimated is visible.** `est.`, `set` and dashes keep their meaning and get a legend.
3. **The table is the product.** Most of the first screen is the table; the chat is beside it, not a second page.
4. **Warnings point at the fix.** Each issue names the item and offers the action (open the row, ask the assistant).
5. **Plain language, restaurant owner reading.** No jargon beyond what the Excel file already uses.
6. **Responsive without a second design.** Wide: table + sticky chat. Medium: chat below. Phone: summary cards,
   scrollable table with a frozen first column, chat as a full-width section.

## Steps
| # | Step | Output | Status |
|---|---|---|---|
| 1 | High-fidelity prototype, desktop and phone, from the real dummy dataset | `screens/prototype/*` | Done |
| 2 | Review and approve the design; settle the items in "Questions" below | A go / change decision | **Next** |
| 3 | Design tokens and layout shell: header, two-column grid, sticky chat, responsive breakpoints | `analysis-workspace.tsx`, `globals.css` tokens | Done |
| 4 | Headline cards, coverage meter, attention strip | `analysis-summary.tsx` split into parts | Done |
| 5 | Table: toolbar (search, filters, sort), frozen first column, totals row, status pills, legend | `items-table.tsx` | Done |
| 6 | Issues panel with actions, recommendations block | new `issues-panel.tsx`, `recommendations.tsx` | Done |
| 7 | Chat panel: side layout, proposal card with before → after, composer | `chat-panel.tsx`, `proposal-card.tsx` | Planned |
| 8 | Accessibility, reduced motion, keyboard pass; screenshots vs prototype; deploy | Report | Planned |

Each implementation step ships on its own and keeps the screen working, so the work can stop after any of them.

## Questions for step 2
1. Chat beside the table on wide screens (as drawn), or keep it below as today?
2. Show the assumptions (VAT, price basis) read-only in the header? Needs a small API addition.
3. Show the three top recommendations on this screen? They exist in the analysis today and are only in the Excel.
4. Keep "New analysis" and "Copy secure link" in the header, with "Delete now" moved to the footer?

## Backend / data changes
None required for steps 3–8, except the optional assumptions field (question 2).

## Testing requirements
- The existing frontend tests keep passing; new pure helpers (filtering, sorting, status, totals) get unit tests.
- A manual run through the dummy dataset at 1440, 1024 and 390 px, comparing with the prototype.
- Keyboard-only run through the table editor and the chat.
- No change to Lighthouse performance conventions in `frontend/CLAUDE.md` (fonts via `next/font`, no new
  dependency without asking).

## Acceptance criteria
- Every row of the inventory above still works, checked one by one.
- Nothing is drawn that the product cannot do; anything new is client-side or explicitly approved.
- The figures on the screen equal the API snapshot.
- Usable at 390 px without horizontal page scroll (the table scrolls inside its card).

## Risks
- The reference sets expectations the product cannot meet (photos, trends, instant AI edits). Mitigated by the gap
  table; the design shows the product as it is.
- Denser tables are harder to edit on a phone. Mitigated by a frozen first column and 44 px touch targets for the
  edit controls.
