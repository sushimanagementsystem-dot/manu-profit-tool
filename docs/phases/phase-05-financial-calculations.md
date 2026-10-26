# Phase 5 — Financial Calculations and Costing

**Status:** Planned.

## Objective
A deterministic, fully tested calculation engine that produces a `ResultSnapshot` per revision, with confidence
labels and data-quality findings.

## Scope
- `costing/engine/`: pure functions over `Decimal`, covering every formula in ARCHITECTURE.md §10, including
  confidence propagation (4 levels with reasons). It is ported from `frontend/lib/audit/calculations.ts` and its
  13 tests, which are extended.
- Price-basis selection (LATEST / WEIGHTED_AVG / MAX), VAT handling, wastage, and unit conversion per recipe line.
- The menu-engineering matrix, category rollups, and the time series (when POS has periods).
- Data-quality checks:
  - menu stability (50 % rule, ADR-016);
  - costed revenue coverage;
  - invoice arithmetic failures;
  - stale prices (the invoice is older than the period);
  - outliers (GP% < 0 or > 95 %).
- Scenarios (dry-run): price and cost deltas at constant volume.
- Rule-based recommendation candidates (facts): low-GP high-volume items (Plowhorses), Puzzles to promote, Dogs to
  review, top ingredient cost drivers, and price-rounding opportunities. The impact comes from the engine.
- `ResultSnapshot` persistence + `payloadHash`; the `CALCULATING → READY` transition.
- `calcVersion` semver, stored on every snapshot.

**Exclusions:** AI wording of recommendations (Phase 7/9 via MP-02 `RECOMMENDATIONS`), and attach-rate analyses
(only if ticket-level data exists, MVP+).

## Dependencies
Phase 4 (matched and normalized data).

## Frontend tasks
None beyond the status. The results UI is Phase 6.

## Backend tasks
As in Scope. Documented formulas are copied into the code as JSDoc next to each function.

## Database changes
Migration `0005_results`: `ResultSnapshot`, `Recommendation`.

## n8n workflows
None (MP-02 `RECOMMENDATIONS` is optional, in Phase 9).

## API endpoints
`GET /jobs/:id/results`, `GET /jobs/:id/costing/items/:itemId`, `GET /jobs/:id/ingredients`,
`POST /jobs/:id/revisions/preview`, `POST /jobs/:id/revisions` (autoApprove for UI edits).

## Testing requirements
- Hand-computed `expected/results.json` for DS-1, DS-3, DS-5 and DS-7, with exact equality.
- Edge cases: zero price, zero units, missing VAT, a missing conversion, and negative GP.
- Property tests (MVP).
- Performance: recalculation for 200 items in under 1 s.

## Acceptance criteria
- Every displayed number traces to its inputs.
- `incomplete` is never shown as 0.
- Snapshots are reproducible: recomputing gives the same hash.

## Risks
Ambiguous business rules (VAT, price basis), so they must be confirmed with the client (ADR-015).

## Deliverables
The engine, snapshots, preview and revision application, rule-based recommendations, and migration 0005.
