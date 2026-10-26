# Phase 9 — n8n Workflows (Final) and End-to-End Integration

**Status:** Planned. MP-01 and MP-99 are first built in Phase 3 and MP-02 in Phase 4. This phase finalizes and
hardens all three and retires the old workflow.

## Objective
Production-ready n8n workflows with tested contracts, and a complete end-to-end flow on every mock dataset.

## Scope
- Finalize MP-01, MP-02 and MP-99 per N8N_WORKFLOWS.md:
  - signature checks in both directions;
  - stop-reason handling;
  - node retries for provider blips only;
  - execution-data settings;
  - production webhook URLs.
- MP-02 `RECOMMENDATIONS` (AI wording on engine facts), with a numeric consistency check in the backend.
- MVP add-ons: long-PDF page splitting and PDF POS extraction.
- Export the workflow JSON to `n8n/workflows/` (no credentials) and write a setup README for them.
- **Retire the old integration (after approval):**
  - archive `frontend/n8n/menu-profit-workflow.json` + its README to `docs/archive/legacy-n8n/`;
  - deactivate the old workflow in n8n;
  - delete any Google Sheets data it wrote;
  - rotate the old secrets;
  - remove the `N8N_*` vars from the frontend env.
- End-to-end runs over DS-1…DS-10 with the real n8n (staging), plus CI runs against the fixture-replaying n8n fake.

**Exclusions:** new AI features.

## Dependencies
Phases 3–8.

## Frontend tasks
None, except fixes found in the end-to-end runs.

## Backend tasks
Contract version checks, a staging configuration, and the fixture-replay fake (`N8N_MODE=fake`) for CI and local
development without n8n.

## Database changes
None.

## n8n workflows
MP-01, MP-02 and MP-99 (final).

## API endpoints
No new ones.

## Testing requirements
- Contract tests for every task type.
- Failure injection:
  - Anthropic 429/500;
  - the callback endpoint down (n8n retries; the backend dedupes);
  - an execution crash (MP-99);
  - a timeout (sweeper).
- Duplicate-callback protection.
- End-to-end timing and cost against the thresholds.

## Acceptance criteria
- All 10 datasets process end to end, meeting their acceptance thresholds or failing with a correct, user-visible
  reason.
- No business logic or data persistence in n8n.
- The old workflow is deactivated.

## Risks
n8n version differences in env names and node options (verify on the installed version); webhook body-size limits
(`N8N_PAYLOAD_SIZE_MAX`; we pass URLs, not files).

## Deliverables
Final workflows in the repo, the n8n setup README, end-to-end test reports, and the legacy n8n retired.
