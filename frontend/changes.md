# changes.md

A running log of every significant change to this codebase: what changed, why, which approach was chosen, and the reasoning. Newest entries at the bottom. Update this file whenever a meaningful change is made — see `AGENTS.md`/`CLAUDE.md` for the working agreement that requires it.

---

## 1. Project scaffold (pre-existing)

Started from `create-next-app` on **Next.js 16.4.2** (App Router, TypeScript, Tailwind v4). This version has real breaking changes vs. older Next.js (Cache Components, `proxy.ts` replacing `middleware.ts`, async-only `params`/`cookies()`/`headers()`, Turbopack by default). See `CLAUDE.md` for the full list — it matters for every change below.

## 2. Package selection (Stage 2 of initial setup)

**What**: Chose a package set for a dashboard-style app with auth, forms, tables, charts, and a REST API backend.

**Why**: The brief asked for a tool with those features; packages were picked per-feature rather than pulling in a generic "kitchen sink" starter.

**Chosen**:
- `@tanstack/react-query` — data fetching/caching against the REST API.
- `@tanstack/react-table` — headless table logic (later turned out to be v9, see entry 6).
- `react-hook-form` + `zod` + `@hookform/resolvers` — form state and schema validation.
- `recharts` — charts (via shadcn's chart building block).
- `sonner` — toast notifications.
- `lucide-react` — icons.
- `prettier` + `eslint-config-prettier` — formatting, wired into the existing ESLint flat config.

**Explicitly skipped** (and why): `next-themes` (no dark-mode toggle requested — though it ended up installed anyway, see entry 3), `date-fns` (native `Intl.DateTimeFormat` is enough for simple date display), `zustand` (no cross-page client state existed yet; React Context is cheaper until it's actually needed).

## 3. shadcn/ui initialization

**What**: Ran `shadcn init` (style `radix-nova`, neutral base color, CSS variables for theming) and added initial primitives.

**Surprises worth knowing**:
- shadcn's own `cn` npm package (a compiled, zero-dependency drop-in for `clsx` + `tailwind-merge`) was used in the generated `lib/utils.ts` instead of hand-rolling it. The `clsx`/`tailwind-merge` packages installed in entry 2 became dead weight and were removed to avoid two libraries doing the same job.
- `sonner`'s shadcn wrapper (`components/ui/sonner.tsx`) hard-imports `useTheme` from `next-themes`, even with no theme toggle in the UI. This pulled `next-themes` in as a real dependency, not an optional one — it's small (~1KB) so it was kept rather than rewriting the wrapper.
- shadcn's `form` component resolved to an **empty registry stub** in the `radix-nova` style (no files to install). Decision: don't try to force it in — wire forms with `react-hook-form` + `zod` directly against the `Input`/`Label` primitives instead, which is simpler than shadcn's old wrapper anyway.

**Bug fixed**: `shadcn init` generated `--font-sans: var(--font-sans)` in `app/globals.css` (self-referential, broken). Fixed to point at `--font-geist-sans`, matching the font actually loaded in `app/layout.tsx`.

## 4. TanStack Table v9 — API surprise

**What**: `@tanstack/react-table` installed as **v9.3.1**, which has a different API than the well-known v8 one (`useReactTable`, `getCoreRowModel`, `flexRender`).

**Discovery**: the package ships its own `skills/` folder (`node_modules/@tanstack/table-core/skills/`) documenting the v9 API and a v8→v9 migration checklist. v9 replaces `useReactTable` with `useTable`, drops the explicit `getCoreRowModel()` call (core row model is automatic now), and renders via `table.FlexRender` instead of a standalone `flexRender()` function.

**Approach**: Table code was rewritten against the real v9 API (`createColumnHelper`, `tableFeatures({})`, `useTable`), verified against a production `pnpm build` rather than assumed from memory.

## 5. `hooks/use-mobile.ts` lint fix

**What**: shadcn's generated `use-mobile.ts` hook called `setIsMobile(...)` synchronously inside a `useEffect`, which Next 16's stricter `react-hooks` ESLint rule flags (`react-hooks/set-state-in-effect` — cascading renders).

**Fix**: compute the initial value lazily via `useState(getIsMobile)` (checking `typeof window` for SSR safety) and leave the effect to only *subscribe* to media-query changes, not also set the initial value. This matches the rule's actual intent: effects should synchronize with external systems, not duplicate work React can already do on first render.

## 6. First real feature: the Menu Profit Audit UI

**What**: Built against a reference design (`Phase One Menu Profit Workflow.png`) showing a 6-step pipeline: upload files → n8n processing → data extraction → report generation → save to Google Drive → download. Steps 2–5 are backend/n8n work, not UI screens. Built the two real UI screens: **Step 1 (New Audit upload form)** and **Step 6 (Audit Completed / download)**.

**Initial approach**: built these inside a generic admin-dashboard shell (sidebar + header), matching a typical SaaS layout.

**Reasoning for the initial generic dashboard mockup now obsolete**: at the time these two screens were requested, the project had no confirmed structure yet, and a sidebar+header shell is the default "admin tool" pattern. It also meant deleting two earlier placeholder components (a mock revenue chart and a mock orders table) that were built in Stage 4 before the real screens existed — they were pure scaffolding to prove the chart/table libraries were wired up, not real product.

## 7. Removing the dashboard shell, "premium" redesign of the Completed screen

**What changed, and why**: the reference design never shows an admin-dashboard chrome — the brief literally describes "a simple and easy-to-use file upload interface." On explicit direction, the sidebar/header shell was removed entirely.

- Deleted `components/dashboard/` (`app-sidebar.tsx`, `site-header.tsx`) and the `(dashboard)` route group.
- Moved both screens into a new `app/(app)/` route group with a plain centered layout (same pattern as `(auth)`, no navigation chrome).
- `/` now serves the New Audit form directly; `/audit/completed` serves the completed screen. Both still sit behind the `proxy.ts` auth gate.

**Completed screen redesign** (`components/audit/audit-completed-card.tsx`): on request, made visually "premium" rather than a plain checklist:
- A glow-ring icon badge (`ring-8 ring-emerald-500/10` around a filled circle) instead of a bare icon.
- A larger, more elevated card (`shadow-xl`, wider `--card-spacing`).
- A styled file chip with a colored icon tile instead of a plain row.
- The status list became a connected vertical stepper (icons joined by a line) instead of a flat checklist — a more common "premium" pattern for multi-step completion states.
- A subtle fade/zoom entrance animation using `tw-animate-css` (already a dependency, driving shadcn's dialog/sheet transitions) — consistent with the project's "subtle motion only, no JS animation library" rule.

**Known side effect, not yet cleaned up**: `components/ui/avatar.tsx`, `chart.tsx`, `dropdown-menu.tsx`, `sidebar.tsx` (+ its internal deps `sheet.tsx`, `skeleton.tsx`), and `table.tsx` are now unused now that the dashboard shell is gone. They weren't deleted automatically since whether tables/charts are needed again later (e.g. to preview report data in-app) is an open question — see `flow.md` "Open questions" for this.

## 8. Dev server hygiene note

A background `next dev` process survived across a session boundary and kept serving stale compiled output even after source files changed on disk (confirmed via `curl` showing old CSS classes in the server-rendered HTML after an edit that should have changed them). Fixed by killing the orphaned process (`taskkill` on the PID bound to port 3003) and starting a fresh one. Worth remembering: if a change "isn't showing up" in the browser despite the file being correct, check whether the dev server is actually the current one before debugging the code.

## 9. Final-fidelity redesign against the real brand mockup

**What**: A second, much more detailed reference image (`Menu Profit Restaurant Audit Upload Dashboard.png`) arrived — real branding, numbered step badges, color-tinted dropzones, a styled "Start Audit" button, a security note, and a green "report ready" banner shown directly below the upload card on the same page.

**Ambiguity surfaced and resolved**: the reference showed the success banner positioned right under the upload card, in the same page composition — but the app at that point had it as a separate route (`/audit/completed`). Asked the user directly rather than guessing; answer was **inline on the same page** — so `/audit/completed` was removed entirely rather than kept and restyled.

**What changed**:
- New `components/audit/brand-header.tsx` — logo mark (lucide `BarChart3` in emerald) + "Menu Profit" wordmark + "RESTAURANT AUDITS" small-caps subtitle. Lives above the card on `app/(app)/page.tsx`, not inside the card itself.
- `components/audit/new-audit-card.tsx` rewritten:
  - Removed the old `CardHeader` ("New Audit" title + X button) — the page-level `<h1>` now serves that role, matching the reference (no redundant in-card title).
  - Each upload slot now has a numbered circle badge (1/2/3) in a color matching that slot (rose/amber/blue) instead of a single neutral style for all three.
  - Dropzones are now color-tinted per slot (`bg-rose-50/60 border-rose-200` etc.) instead of plain white-with-dashed-border, and show a file-type/size hint line, matching the reference exactly.
  - "Start Audit" button got `Sparkles` + `ArrowRight` icons and a genuine (simulated) processing state: clicking it disables the button, shows a spinning `Loader2` + "Processing...", then after ~1.2s flips to `completed` and reveals the banner below. This is a **frontend-only simulation** — there's still no real n8n call (tracked as Open question #3 in `flow.md`, unchanged).
  - Added the security note (`Lock` icon + "Your files are securely uploaded...") below the button.
- New `components/audit/audit-completed-banner.tsx` — a compact green-tinted inline banner (checkmark, "Your report is ready!", Download button), replacing the old full-page `audit-completed-card.tsx`, which was deleted along with the `/audit/completed` route.
- `app/(app)/layout.tsx` got a subtle two-tone gradient background (`from-rose-50/60 via-background to-amber-50/60`, dark-mode equivalents at low opacity) to match the reference's soft colorful backdrop — applied at the layout level so it covers the full page, not just the card.

**Explicitly not implemented**: the hand-drawn arrows and italic annotation captions in the reference image ("Upload your files and get a detailed profitability report", etc.). Those read as designer-to-stakeholder explanatory notes for a pitch/spec document, not real application UI — flagged to the user rather than built silently.

**Found along the way, not changed**: `proxy.ts` had been hand-edited outside of any change I made — the redirect-to-`/login` line is commented out, so the auth gate is currently fully open. Left as-is per the "don't revert what looks deliberate" convention, but flagged to the user since it changes `flow.md`'s description of the request lifecycle (see `flow.md` update in this same entry) and ties directly into the still-unresolved "how should login actually work" open question.

## 10. Missing pointer cursors on buttons

**What**: browsers only give `cursor: pointer` to `<a>` elements by default — a native `<button>` gets `cursor: default` (the plain arrow) unless styled otherwise. Every button in the app was showing the default cursor, which reads as unfinished/unprofessional.

**Fix**:
- `components/ui/button.tsx` — added `cursor-pointer` to the shared base class, plus `disabled:cursor-not-allowed` next to the existing `disabled:opacity-50`. This fixes every button built on the shared `Button` component in one place (Log in, Start Audit/Processing, Download Report) rather than patching each usage.
- `components/audit/new-audit-card.tsx` — the three upload dropzones are native `<button>` elements (not the shared `Button` component, since they needed custom per-slot tint colors), so `cursor-pointer` was added to them directly.

**Verified**: via `getComputedStyle(button).cursor` in the browser console (not just visually, since screenshots don't reliably show OS cursor glyph changes) — all 5 interactive buttons on the page report `"pointer"`.

**Also noticed, not touched**: `components/ui/button.tsx`'s size variants were hand-edited outside of any change I made — heights went up across the board (`h-8`→`h-10` default, `h-9`→`h-12` for `lg`) and a new `xl` (`h-14`) size was added. Reads as a deliberate "make touch targets bigger" change, left as-is.

**Not touched**: `components/ui/sidebar.tsx` and `components/ui/dropdown-menu.tsx` also have cursor issues (`cursor-default` on menu items, resize cursors on the sidebar rail), but neither file is actually rendered anywhere right now (see Open question #2 in `flow.md`) — fixing dead code wasn't worth doing.

**Known debt, not part of this change**: this file (`changes.md`) and `flow.md` are missing documentation for the entire Phase 1 backend build that happened earlier in this project's history — `lib/audit/*` (calculations, store, validation, env config), the 4 `/api/audits*` route handlers, the Vitest setup, the n8n workflow JSON/README, the rewiring of `NewAuditCard` from a fake `setTimeout` simulation to the real API, and a Turbopack disk-cache crash/fix. That backlog still needs writing up.

## 11. Performance audit: render-blocking resources, legacy JavaScript, network dependency tree

**What**: researched these 3 Lighthouse/Chrome DevTools Performance Insights audits against official sources ([render-blocking-resources](https://developer.chrome.com/docs/lighthouse/performance/render-blocking-resources), [legacy-javascript](https://www.debugbear.com/blog/avoid-legacy-js), [network-dependency-tree](https://developer.chrome.com/docs/performance/insights/network-dependency-tree), [Next.js supported-browsers](https://nextjs.org/docs/architecture/supported-browsers)) and checked this project against each.

**Findings — already clean, nothing to fix today**:
- No raw `<script>` or `<link rel="stylesheet">` tags exist anywhere in the app (grepped `app/` and `components/`) — fonts load via `next/font/google` (self-hosted, no external network request at all), and Tailwind's CSS is bundled at build time, not fetched at runtime. These are exactly the two resource types the render-blocking-resources audit flags.
- No images are rendered yet (`brand-header.tsx` uses an inline Lucide icon, not an `<img>`/`next/image`), so there's no LCP image chain to optimize.
- `package.json` had no `browserslist` override, so Next.js 16's own modern-only default (`chrome 111, edge 111, firefox 111, safari 16.4`) was already in effect — this is what keeps legacy transpilation/polyfills out of the bundle.
- `cacheComponents`/`partialPrefetching` were already on in `next.config.ts`, which already shortens the network dependency tree at the routing level.

**What changed**:
- `package.json` — added an explicit `browserslist` field, set to the exact same value Next.js already defaults to. This is a zero-behavior-change pin, not a new restriction: its only purpose is to stop a future Next.js major version from silently widening the default (and reintroducing legacy JS) without it being a visible, reviewable diff in this repo.
- `CLAUDE.md` — added a "Performance conventions" section documenting the patterns that keep these 3 audits green going forward (fonts only via `next/font`, images only via `next/image`, scripts only via `next/script` with an explicit strategy, never raw tags) and noting that `eslint-config-next/core-web-vitals` (already wired into `eslint.config.mjs`) already enforces the image/script rules via `@next/next/no-img-element` and `@next/next/no-sync-scripts`.

**Why this approach, not more**: no new dependency was added (would violate CLAUDE.md's "never add a dependency without asking" rule, and nothing here needed one — Lighthouse CI/`unlighthouse` tooling would be a reasonable next step but is a separate ask). No code was restructured, since there was no actual violation present to restructure around; the value here is a guardrail (explicit browserslist + documented conventions) against regressions as the app grows past its current single-page shape.

**Verified**: `pnpm build` and `pnpm lint` both clean after the `package.json` change (confirms the explicit `browserslist` didn't alter the build output, as expected since it matches the prior implicit default exactly).

## 12. Moved into `frontend/`; Menu Profit re-plan

**What**: the whole Next.js app moved from the repo root into `frontend/` (a sibling `backend/` NestJS project now exists). `node_modules`/`.next` were regenerated, and `pnpm build` + `pnpm test` (24/24) were verified after the move. Nothing inside the app changed.

**Planning**: the product is being re-architected around the NestJS backend (no login, job-token access, Postgres/Prisma, thin n8n). The plan lives in the root `docs/` folder (`docs/MASTER_PLAN.md`). Per that plan, the `/api/audits` route handlers, `lib/audit/store.ts`/`env.ts`, the `proxy.ts` session gate, the `/login` stub and the old `n8n/` workflow are **obsolete but untouched**. Their removal waits for approval (see `docs/KNOWN_ISSUES.md` and ADR-020). The "Phase 1 backend" documentation backlog noted in entry 10 is superseded by `docs/REPOSITORY_AUDIT.md`.
