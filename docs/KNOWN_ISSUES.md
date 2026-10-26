# Known Issues

| ID | Issue | Impact | Proposed fix | When |
|---|---|---|---|---|
| KI-01 | The move of the Next.js app into `frontend/` is uncommitted. `git status` shows the root files as deleted and `frontend/` + `backend/` as untracked. Most of the frontend work was never committed (only the scaffold commit exists). | No restore point | Commit the current state on a branch (with `.env` excluded; already gitignored) before Phase 0 cleanup | Phase 0, first step |
| KI-02 | NestJS defaults to `PORT ?? 3000`, which clashes with `next dev` | Local dev conflict | Set the backend default to 4000 through validated config | Phase 1 |
| KI-03 | `frontend/eslint.config.mjs` imports `eslint-config-prettier`, but it is not in `package.json`, so `pnpm lint` fails (this predates the move) | Lint broken | Add `eslint-config-prettier` + `prettier` as devDependencies (needs approval) | Phase 0 |
| KI-04 | `frontend/.env.example` contains a real n8n host URL (an IP-based `sslip.io`, `/webhook-test/` path) and the placeholder secret value `x-webhook-secret` | Infrastructure disclosure if committed | Replace with placeholders before the first commit. Rotate the old n8n secrets when the new workflows go live. | Phase 0 |
| KI-05 | `proxy.ts` session gate (commented out) and the `/login` stub contradict the no-login requirement | Confusing dead code | Remove after approval (ADR-020) | Phase 6 |
| KI-06 | `@nestjs/cli@latest` crashes on Node 22.14 (`ERR_REQUIRE_CYCLE_MODULE`); CLI v11 was used | Tooling | Pin the Node version (`.nvmrc` / `engines`, e.g. Node 24 LTS) and the CLI version in the backend | Phase 0 |
| KI-07 | `frontend/flow.md` is stale (it describes the deleted `audit-completed-banner` and the setTimeout simulation). `frontend/CLAUDE.md` mentions a `(dashboard)` group and "no test runner". `changes.md` has an undocumented "Phase 1 backend" backlog. | Misleading docs | Update when the frontend is rewired (Phase 2/6). The backlog is superseded by the new plan. | Phase 2 |
| KI-08 | The old callback route compares secrets with `!==` (not constant-time). Report access is UUID-only. | Old flow only | Retire the old routes; the new design uses HMAC + timing-safe compare | Phase 9 |
| KI-09 | `app/layout.tsx` metadata is still "Create Next App" | Branding | Set the Menu Profit title and description | Phase 6 |
| KI-10 | The menu and POS upload slots accept a single file; the brief needs multiple per category. There is no per-file upload progress. | Requirement gap | Rewire `new-audit-card` (Phase 2) | Phase 2 |
| KI-11 | Old n8n workflow does its financial math in Code nodes and writes restaurant data to Google Sheets | Data outside our retention control | Replace with MP-01/02/99. Archive the old JSON after approval. Delete any old Google Sheet data. | Phase 9 |
