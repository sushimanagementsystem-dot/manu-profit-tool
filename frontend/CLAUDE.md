# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack and versions

- Next.js 16.4.2 (App Router, Turbopack, Cache Components + Partial Prefetching on), React 19.3.0, TypeScript.
- Tailwind CSS v4 (CSS-first, no `tailwind.config.js`) + shadcn/ui (`radix-nova` style; `components/ui/`).
- Data: `@tanstack/react-query` (REST API), `@tanstack/react-table` **v9** — a different API from the
  classic `useReactTable`/`flexRender` v8 one. See `node_modules/@tanstack/table-core/skills/` before touching tables.
- Forms: `react-hook-form` + `zod`. shadcn's `Form` wrapper is an empty stub in this style — don't try to add it.
- Charts: `recharts` via `components/ui/chart.tsx`. Toasts: `sonner`. Icons: `lucide-react`.
- Package manager: pnpm (pinned via `packageManager` in `package.json`).

## This is not the Next.js you trained on

Next.js 16 has real breaking changes. Before touching routing, caching, data-fetching, images, or proxy code,
read the matching guide in `node_modules/next/dist/docs/01-app/`.

- **Cache Components are on** (`cacheComponents: true`): every route must produce a static shell. Uncached
  async work needs `'use cache'` or a `<Suspense>` boundary — otherwise the build fails; it does not silently
  fall back to full SSR.
- **`proxy.ts`, not `middleware.ts`** — the root `proxy.ts` is the Next 16 convention; the exported function
  is named `proxy`, and its runtime is always `nodejs`.
- Turbopack is the default bundler; its config lives at the top-level `turbopack` key, not `experimental`.
- `params`/`searchParams`/`cookies()`/`headers()` are async-only; use the generated `PageProps`/`LayoutProps` helpers.
- `next lint` is removed — linting is plain ESLint (`eslint.config.mjs`), run via `pnpm lint`.

## Commands

`pnpm dev` / `pnpm build` / `pnpm start` / `pnpm lint`. No test runner is configured yet.

## Folder conventions

- `app/(auth)/` — unauthenticated routes, centered shell, no sidebar. `app/(dashboard)/` — authenticated
  shell (sidebar + header via `components/ui/sidebar`). Route groups don't add URL segments, so
  `(dashboard)/page.tsx` is `/`.
- `components/ui/` — shadcn primitives, added with `pnpm dlx shadcn@latest add <name>`. Don't hand-edit them
  for styling — change the CSS tokens instead.
- `components/<feature>/` — one folder per feature area (`dashboard/`, `auth/`), not per route.
- `lib/` — `utils.ts` (`cn()`), `query-client.ts`, `api.ts` (fetch wrapper reading `API_BASE_URL` /
  `NEXT_PUBLIC_API_URL`).
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
