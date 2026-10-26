# Progress

Legend: ✅ done · 🟡 in progress · ⏸ waiting for approval · ⬜ not started

**Current target: Release 1** (upload → process → chat corrections → Excel). See MASTER_PLAN.md.

| Phase | Status | Notes |
|---|---|---|
| Repo restructure (`frontend/` + `backend/`) | ✅ 2026-10-23 | Uncommitted (KI-01) |
| 0 Audit & foundations | 🟡 | Audit + docs ✅. Lint fix ⏸ (KI-03), baseline commit ⏸ (KI-01) |
| 1 Backend & job lifecycle | ✅ 2026-10-26 | Config, Prisma 7 + migration, problem+json, throttling, job token guard, lifecycle, cleanup cron |
| 2 Upload, storage, validation | ✅ 2026-10-26 | Multi-file per category, magic-byte sniffing, limits, duplicate rejection, private storage |
| 3 Extraction & normalization | 🟡 | Deterministic CSV/XLSX path ✅. AI path (PDF/photo) is wired but needs the n8n workflow (deferred) |
| 4 Matching | ✅ 2026-10-26 | Auto-match ≥ 0.92; uncertain ones stay pending for the chat. No review screen (ADR-022) |
| 5 Financial calculations | ✅ 2026-10-26 | Engine + snapshots; 46 backend tests pass |
| 6 Results UI | ✅ (Release 1 scope) | Summary + issues only; dashboard deferred to Release 2 |
| 7 AI chat & corrections | 🟡 | Backend + UI complete; **untested end to end — needs `ANTHROPIC_API_KEY`** |
| 8 Excel export | ✅ 2026-10-26 | 9 sheets, live formulas, single-use download links |
| 9 n8n workflows | ⬜ | Deferred by the user until frontend + backend are done |
| 10 Security, cleanup, deploy, ops | 🟡 | Token guard, HMAC, limits, retention cron ✅. Deployment, CI, load tests ⬜ |

## Verified working (2026-10-26, local run)
End to end on a CSV dataset: create job → upload 3 files → submit → extraction → normalization →
matching → calculation → READY → results → Excel download.

- Backend: `pnpm build` ✅, `pnpm test` ✅ 46/46, API runs on :4000.
- Frontend: `pnpm build` ✅, `pnpm test` ✅ 24/24, dev server on :3000. Browser-tested upload → analysis → download.
- Numbers checked by hand: VAT per category (13.5% food / 23% drinks), pack-size costing
  (6 × 2.5 kg case → €0.003/g), fuzzy POS matching (`CLASSIC BURGER` → `Classic Burger`),
  GP and impact previews.
- `pnpm lint` in `frontend/` still fails on the pre-existing missing `eslint-config-prettier` (KI-03).

## Not yet done
- n8n workflows (MP-01/02/99), so PDFs and photos are rejected with a clear message.
- Chat tested against the real model.
- Deployment, CI, the mock dataset suite (DS-2…DS-10), integration tests against a test database.
- Legacy frontend code (`app/api/audits/**`, `lib/audit/store.ts`, `lib/audit/env.ts`, `/login`,
  `proxy.ts` gate, old `n8n/`) is still in place, awaiting approval to remove (ADR-020).
