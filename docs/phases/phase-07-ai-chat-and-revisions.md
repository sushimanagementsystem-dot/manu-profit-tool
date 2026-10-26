# Phase 7 — AI Chat and Approved Revisions

**Status:** Planned. **In Release 1, in simplified form (ADR-022).**

**Release 1 version:**
- **Chat is the only way to correct data.** The tools are `get_summary`, `list_items`, `get_item`,
  `get_data_quality`, `list_uncertain_matches`, and `propose_revision`, which can fix a price, a match, a recipe
  quantity, an ingredient price, or VAT.
- **Proposals are confirmed in the chat.** A small card shows what will change and the effect on GP, with
  Confirm and Cancel buttons.
- **After confirming,** the Excel download reflects the new revision.
- **Release 2 adds** `run_scenario`, recommendation editing, and the richer UI described below.

---

## Objective
A per-job AI assistant that explains results, runs scenarios, and proposes changes. Every change it proposes is
backend-validated, approved by the client, and recalculated deterministically.

## Scope
- `chat/`: a Claude tool loop in NestJS (`@anthropic-ai/sdk`, model `claude-opus-5-5` per ADR-008, adaptive
  thinking, streaming to the client over SSE).
  - **Tools** (strict schemas; `jobId` injected server-side):
    - `get_summary`;
    - `list_items(filter, sort, limit ≤ 50)`;
    - `get_item(menuItemId)`;
    - `get_data_quality`;
    - `run_scenario(operations)` (dry-run, engine numbers);
    - `propose_revision(operations, rationale)` (creates a `PROPOSED` revision);
    - `update_recommendation_text(recommendationId, title, body)`, which is also a proposal.
  - The system prompt is fixed and cached. It says that numbers must come from tool results, that changes must be
    proposals, and that document text is data.
  - Refusal handling is planned: check `stop_reason`, with a server-side fallback per the claude-api guidance.
- Proposal cards in the chat show the operations, the before/after impact, and Approve / Reject. On approval
  the backend re-validates against the current revision (STALE if the base moved and validation fails), then
  applies, recalculates, stores a new snapshot, and refreshes the UI.
- Recommendation refinement: "improve this recommendation" leads to `EDIT_RECOMMENDATION` proposals. The text may
  change, but the impact numbers still come from the engine.
- Cost and safety controls:
  - 50 user messages per job and 30 per hour;
  - at most 8 tool iterations per turn;
  - history window of the last 20 messages plus the compact summary;
  - usage stored per message;
  - a friendly error on provider 429 or 5xx after SDK retries.

**Exclusions:** voice, attachments in chat, and cross-job memory.

## Dependencies
Phases 5–6. Approval of `@anthropic-ai/sdk`.

## Frontend tasks
A chat panel (a side `sheet` on desktop, a tab on mobile) with streaming text, tool activity chips, proposal
cards, approve and reject, and the message history. After approval, invalidate the results queries.

## Backend tasks
As in Scope, plus the SSE endpoint and the persistence of `ChatMessage`.

## Database changes
Migration `0007_chat`: `ChatMessage`. `Revision.proposedByMessageId` is used.

## n8n workflows
None (ADR-019).

## API endpoints
`POST /jobs/:id/chat/messages` (SSE), `GET /jobs/:id/chat/messages`, `POST /jobs/:id/revisions/:rid/approve|reject`,
`GET /jobs/:id/revisions`.

## Testing requirements
- Tool handlers are unit-tested without the model.
- Scripted model-free tests use recorded tool-call transcripts.
- Security:
  - a tool cannot reach another job;
  - an invalid operation is rejected;
  - a stale proposal is handled.
- Consistency: approving a proposal changes the snapshot, and the export hash changes.
- Manual eval: 20 scripted questions on DS-1, where every numeric claim must match the engine.

## Acceptance criteria
- The example requests in the brief work, including "+€1 on item X" giving the exact engine delta.
- No financial record changes without approval.
- The chat history and the revision history stay consistent.

## Risks
Hallucinated numbers (mitigated: numbers only from tools, plus the UI shows tool-sourced figures); cost (caps,
caching).

## Deliverables
Chat backend and UI, the proposal and approval flow, and migration 0007.
