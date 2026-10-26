# Phase 4 — Matching and Human Review

**Status:** Planned. **Release 1 change (ADR-022):** there is no review screen. Automatic matching runs as
described. Uncertain matches are never auto-approved. They are listed for the chat (`list_uncertain_matches`) and
in the Excel "Needs review" sheet, and the client fixes them through chat. The job goes to READY with warnings
instead of NEEDS_REVIEW.

## Objective
Link POS lines to menu items, and invoice products and recipe ingredients to normalized ingredients. Uncertain
cases go to the client, and AI may only *suggest*.

## Scope
- `matching/`: the tiers exact → job alias → fuzzy (token-set + Jaro–Winkler, written in-house, no dependency)
  with configurable thresholds (0.92 / 0.75), `MatchSuggestion` rows, and the blocking-issue rules (an unmatched
  POS item with ≥ 2 % of revenue, missing price, missing VAT).
- Ingredient creation by clustering normalized invoice products.
- Recipe estimation through MP-02 `RECIPE_ESTIMATE` (RecipeLine `source=AI_ESTIMATE`, `estimated`).
- Review decisions, applied as one Revision (`DECIDE_MATCH` operations).
- Job stages `MATCHING → NEEDS_REVIEW | CALCULATING`.
- **MVP add-ons:** MP-02 `MATCH_SUGGESTIONS` for scores below 0.75; MP-02 `COLUMN_MAPPING` with a user-confirmed
  mapping; historical menu versions (`validFrom/To`).

**Exclusions:** global reusable mappings (ADR-012).

## Dependencies
Phase 3. Revision groundwork, meaning the operation schema and the apply service (shared with Phase 5/7).

## Frontend tasks
A **Review** tab in the analysis workspace:
- grouped lists (POS→menu, products→ingredients, duplicates);
- source and candidate shown side by side with score, method and rationale;
- approve, reject, reassign (combobox), and bulk-approve for high-score items;
- blocking items pinned at the top;
- an "AI suggested" badge.

It is built with the existing `card`, `table`, `button` and `tooltip` primitives.

## Backend tasks
As in Scope.

## Database changes
Migration `0004_matching`: `Ingredient`, `IngredientPrice`, `RecipeLine`, `MatchSuggestion`, `Revision`,
`Assumption`.

## n8n workflows
MP-02 AI Assist with `RECIPE_ESTIMATE` in the prototype and `MATCH_SUGGESTIONS` + `COLUMN_MAPPING` in the MVP.

## API endpoints
`GET /jobs/:id/matches`, `POST /jobs/:id/matches/decisions`, `GET /jobs/:id/issues`.

## Testing requirements
- DS-2: no false auto-accepts, ≥ 80 % correct top-1.
- DS-8: ambiguous pairs stay PENDING.
- AI suggestions are never auto-approved (test it explicitly).
- A decision creates a revision and moves the job forward when no blocking items remain.

## Acceptance criteria
The client can resolve every blocking item in the UI and the job reaches CALCULATING. All decisions are visible
in the revision history.

## Risks
Threshold tuning (evaluated on datasets); one POS name mapping to several menu items (the UI allows only one
target per source; variants are handled as separate menu items).

## Deliverables
A matching engine, the review UI, MP-02 (recipe estimate), and migration 0004.
