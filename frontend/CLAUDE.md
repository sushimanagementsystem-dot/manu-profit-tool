# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack and versions

- Next.js 16.4.2 (App Router, Turbopack, Cache Components + Partial Prefetching on), React 19.3.0, TypeScript.
- Tailwind CSS v4 (CSS-first, no `tailwind.config.js`) + shadcn/ui (`radix-nova` style; `components/ui/`).
- Data: `@tanstack/react-query` (REST API), `@tanstack/react-table` **v9** — a different API from the
  classic `useReactTable`/`flexRender` v8 one. See `node_modules/@tanstack/table-core/skills/` before touching tables.
- Forms: `react-hook-form` + `zod`. shadcn's `Form` wrapper is an empty stub in this style — don't try to add it.
- Charts: `recharts` via `components/ui/chart.tsx` (unused until the Release 2 dashboard).
  Toasts: `sonner`. Icons: `lucide-react`. Tests: Vitest (`*.test.ts`).
- Package manager: pnpm (pinned via `packageManager` in `package.json`).

## This is not the Next.js you trained on

Next.js 16 has real breaking changes. Before touching routing, caching, data-fetching, images, or proxy code,
read the matching guide in `node_modules/next/dist/docs/01-app/`.

- **Cache Components are on** (`cacheComponents: true`): every route must produce a static shell. Uncached
  async work needs `'use cache'` or a `<Suspense>` boundary — otherwise the build fails; it does not silently
  fall back to full SSR.
- **`proxy.ts`, not `middleware.ts`** — if this app ever needs request-level middleware, the root
  `proxy.ts` is the Next 16 convention (exported function named `proxy`, always the nodejs runtime).
  There is none today: with no accounts there is nothing to gate.
- Turbopack is the default bundler; its config lives at the top-level `turbopack` key, not `experimental`.
- `params`/`searchParams`/`cookies()`/`headers()` are async-only; use the generated `PageProps`/`LayoutProps` helpers.
- `next lint` is removed — linting is plain ESLint (`eslint.config.mjs`), run via `pnpm lint`.

## Commands

`pnpm dev` / `pnpm build` / `pnpm start` / `pnpm lint` / `pnpm test` (Vitest).

This app is the **frontend only**: it holds no business logic and no secrets. The NestJS API in
`../backend` owns job state, validation, financial calculations and exports; this app talks to it
through `lib/api/client.ts` and nothing else. `NEXT_PUBLIC_API_URL` is its only environment variable.

## Folder conventions

- `app/(app)/` — every screen, in a plain centered shell. Route groups don't add URL segments, so
  `(app)/page.tsx` is `/` (upload) and `(app)/analysis/[jobId]` is the analysis workspace.
  There are no auth routes: the product has no accounts, and a job's access token travels in the
  link fragment (see `lib/api/job-session.ts`).
- `components/ui/` — shadcn primitives, added with `pnpm dlx shadcn@latest add <name>`. Don't hand-edit them
  for styling — change the CSS tokens instead.
- `components/<feature>/` — one folder per feature area (`audit/` for upload, `analysis/` for the
  analysis workspace), not per route.
- `lib/api/` — `client.ts` (the only module that talks to the backend), `types.ts` (API shapes),
  `job-session.ts` (access token in the link fragment + localStorage). `lib/` also has `utils.ts`
  (`cn()`), `query-client.ts`, `format.ts` (display formatting) and `audit/slots.ts` (upload slots).
- No `src/` directory — everything lives at the repo root to match `components.json`'s aliases.

## Design tokens

- All color/radius/sidebar/chart tokens are CSS variables in `app/globals.css` (`:root` = light, `.dark` =
  dark). Never hardcode a hex/oklch color in a component — use the Tailwind utility mapped to a token
  (`bg-background`, `text-muted-foreground`, …), or add a new token if one is genuinely missing.
- Fonts are Geist Sans/Mono, loaded once in `app/layout.tsx` via `next/font/google` and mapped to
  `--font-sans`/`--font-mono` in the `@theme inline` block. Don't load fonts anywhere else.

## Motion

- Subtle only: CSS transitions/transforms/opacity via Tailwind + `tailwindcss-animate` (already driving
  shadcn's dialog/dropdown/sheet/sidebar). No JS animation library — this app doesn't need one at this scale.
- Respect `prefers-reduced-motion`. shadcn's primitives already handle this; don't override their transition
  classNames in a way that adds motion back for reduced-motion users.

## Dependencies

**Never add a dependency without asking first** — including a shadcn component that silently pulls one in
(e.g. `sonner`'s wrapper requiring `next-themes`). Flag it, don't just install it.

## Performance conventions

Keep this app clean on Lighthouse's render-blocking-resources, legacy-javascript, and network-dependency-tree
audits by construction, not by after-the-fact fixing:

- **Fonts**: only via `next/font/google` in `app/layout.tsx` (already self-hosted, no external request). Never
  add a `<link>` to a font CDN or an `@import` of a remote stylesheet.
- **Images**: only via `next/image`, never a raw `<img>` — `eslint-config-next/core-web-vitals`
  (`@next/next/no-img-element`) already blocks this. Mark the largest above-the-fold image `priority`.
- **Scripts**: only via `next/script` with an explicit `strategy` (`afterInteractive`/`lazyOnload` for
  anything non-critical), never a raw `<script>` tag — `@next/next/no-sync-scripts` already blocks a
  synchronous one in `<head>`.
- **Browser targets**: `package.json`'s `browserslist` is pinned to Next.js 16's own modern-only default
  (`chrome 111, edge 111, firefox 111, safari 16.4`) so legacy transpilation/polyfills never get shipped
  silently. Don't widen it to add older-browser support without discussing the bundle-size tradeoff first.
