# flow.md

How this application actually works: entry points, execution order, and how files call into each other. Read `CLAUDE.md` first for the Next.js 16 specifics this depends on (Cache Components, `proxy.ts`, async request APIs). Update this file whenever the request flow or file wiring changes.

---

## The request lifecycle, in order

Every request to this app passes through these layers, in this order:

```
1. proxy.ts            (runs before rendering — the auth gate)
2. app/layout.tsx       (root HTML shell, fonts, Providers)
3. app/(auth)/layout.tsx   OR   app/(app)/layout.tsx   (route-group shell)
4. the matched page.tsx    (the actual screen)
```

### 1. `proxy.ts` — the auth gate

This is Next.js 16's replacement for `middleware.ts` (same mechanism, renamed). It runs on the server **before** any React rendering happens, for every request except what its `matcher` excludes (`/login`, `_next/static`, `_next/image`, `favicon.ico`).

```ts
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("session");

  // if (!hasSession) {
  //   return NextResponse.redirect(new URL("/login", request.url));
  // }

  return NextResponse.next();
}
```

**Current state: the redirect is commented out.** This was a hand-edit made outside of any documented change (not by Claude) — the auth gate is currently fully open, every route is reachable with no session cookie at all. It's left as-is per the "don't silently revert what looks deliberate" convention, but it's flagged as unresolved: see "Open questions" below. When re-enabled, it only checks whether a `session` cookie **exists**, not whether it's valid — an *optimistic* check meant to avoid flashing protected UI to logged-out users. Real session validation still has to happen server-side wherever data is actually read (not built yet — there's no real backend/session issuance either).

### 2. `app/layout.tsx` — root shell

The one layout every single route passes through. Responsibilities:
- Loads Geist Sans/Mono via `next/font/google`, exposing them as CSS variables (`--font-geist-sans`, `--font-geist-mono`) on the `<html>` element.
- Sets static `metadata` (title/description — still the create-next-app defaults, not yet updated for this product).
- Wraps `{children}` in `<Providers>` (see below) inside `<body>`.

This file is a **Server Component** (no `"use client"`), which is why the client-only setup (React Query, toasts, tooltips) is pushed down into `Providers` rather than living here directly.

### 3. `components/providers.tsx` — client-side app context

```tsx
"use client";
export function Providers({ children }) {
  const [queryClient] = useState(createQueryClient); // lib/query-client.ts
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {children}
        <Toaster />   {/* components/ui/sonner.tsx */}
      </TooltipProvider>
    </QueryClientProvider>
  );
}
```

- `createQueryClient()` (`lib/query-client.ts`) builds one `QueryClient` per browser session (held in `useState` so it survives re-renders but isn't shared across users/requests — standard Next.js App Router pattern for React Query).
- `TooltipProvider` wraps everything because shadcn's primitives (and previously, the sidebar) expect one ancestor provider rather than wrapping every tooltip individually.
- `<Toaster />` is the sonner toast host — mounted once, globally, so any client component can call `toast.success(...)` from anywhere in the tree.

### 4a. `app/(auth)/` — unauthenticated routes

- `layout.tsx`: a bare centered flex container, no navigation chrome.
- `login/page.tsx` → renders `components/auth/login-form.tsx`.

**`login-form.tsx`** (`"use client"`):
- `useForm` (react-hook-form) + `zodResolver(loginSchema)` for validation — `loginSchema` requires a valid email and an 8+ character password.
- `onSubmit` is currently a **stub**: it just calls `toast.success("Logged in")`. It does not call any API, does not set the `session` cookie, and does not redirect. This means the login form does not yet actually unlock the `(app)` routes — see "Open questions."

### 4b. `app/(app)/` — the actual product screens

- `layout.tsx`: centered layout with a subtle two-tone gradient background (`from-rose-50/60 via-background to-amber-50/60`, dark-mode equivalent) — no sidebar, no header (removed in `changes.md` entry 7).
- `page.tsx` (→ `/`, the **only** route in this group now) renders, top to bottom: `BrandHeader`, a page `<h1>` + description, then `NewAuditCard`. There is no separate "completed" route anymore — see below.

**`components/audit/brand-header.tsx`** (Server Component): the logo mark (lucide `BarChart3`, emerald) + "Menu Profit" wordmark + "RESTAURANT AUDITS" subtitle. Purely presentational, no state, no props.

**`new-audit-card.tsx`** (`"use client"`, covers Step 1 **and** Step 6 of the reference workflow on one screen):
- Defines a `slots` array (menu / invoices / POS report), each with its own icon, numbered badge color, dropzone tint, and whether multiple files are allowed.
- For each slot: a hidden `<input type="file">`, triggered by a styled dropzone `<button>` via a `ref`. Selected filenames are stored in local `useState` and displayed in place of the "Click to upload" prompt.
- Owns a `status` state machine: `"idle" | "processing" | "completed"`. Clicking "Start Audit" (`handleStartAudit`) sets `status` to `"processing"` (button disables, shows a spinning `Loader2` + "Processing..."), then after a **hardcoded 1200ms `setTimeout`** flips it to `"completed"`.
- When `status === "completed"`, renders `<AuditCompletedBanner />` as a sibling below the `Card`, inside the same component's return value — no lifting state to the page, no routing involved.
- **Still no real upload/processing logic** — the file inputs only store filenames locally, and the "processing" delay is a pure frontend simulation with no network call. This is tracked as Open question #3 below, unchanged in substance from before this redesign (the simulated delay is new, but it still doesn't talk to anything real).

**`audit-completed-banner.tsx`** (Server Component, the reference's Step 6, now inline rather than a separate screen): a compact green-tinted banner — checkmark icon, "Your report is ready!" + description, a "Download Report" button. Fully static, no props, no data fetching — same caveat as before: it isn't wired to a real audit result, it just renders unconditionally once `new-audit-card.tsx` flips its local `status` to `"completed"`.

**Removed in this redesign**: `app/(app)/audit/completed/page.tsx` and `components/audit/audit-completed-card.tsx` (the old full-page version of the completed screen) — deleted outright rather than kept, per the user's explicit choice to make the success state inline instead of a separate route (see `changes.md` entry 9).

## Supporting files (not in the request path, but used by the above)

- **`lib/utils.ts`** — exports `cn` from the `cn` npm package (shadcn's own clsx+tailwind-merge replacement). Used by almost every component for conditional Tailwind classes.
- **`lib/query-client.ts`** — `createQueryClient()`, used only by `Providers`. No queries are actually defined anywhere yet (no `useQuery` calls in the codebase) — React Query is wired up but unused until a real API exists.
- **`lib/api.ts`** — `apiFetch<T>(path, init)`, a thin `fetch` wrapper that picks `API_BASE_URL` (server) or `NEXT_PUBLIC_API_URL` (browser) as the base URL and throws on non-OK responses. **Not called anywhere yet** — written ahead of the real backend integration, per the env var setup in `.env.example`.
- **`app/globals.css`** — Tailwind v4 entry point. Defines every color/radius/sidebar/chart token as a CSS variable (`:root` = light, `.dark` = dark), per `CLAUDE.md`'s design-token rule. Also imports `tw-animate-css` for the `animate-in`/`fade-in`/`slide-in-from-*` utility classes used in `audit-completed-banner.tsx`'s entrance animation.
- **`components/ui/*`** — shadcn primitives, vendored (not hand-written). `avatar.tsx`, `chart.tsx`, `dropdown-menu.tsx`, `sidebar.tsx`, `sheet.tsx`, `skeleton.tsx`, `table.tsx` are currently **unused** (leftovers from the removed dashboard shell — see `changes.md` entry 7 and "Open questions" below).

## Open questions (things that are unclear or not yet decided)

These are flagged rather than silently assumed, per the project's working agreement:

1. **Login still doesn't actually log in, and the gate is currently wide open.** `login-form.tsx`'s `onSubmit` never sets the `session` cookie `proxy.ts` checks for, and there's no backend to authenticate against yet. On top of that, `proxy.ts`'s redirect is now commented out (a hand-edit, not a documented change — see entry above), so `/` is reachable right now with no login at all. **This needs a decision**: re-enable the redirect and build a real auth backend, re-enable it with a stub "any email/password sets the cookie" flow so the UI is at least self-consistent while the backend is built, or leave it open intentionally for now while the rest of the product gets built out? Whatever is decided, the commented-out line shouldn't stay as a silent trap for later.
2. **The unused shadcn components** (`avatar`, `chart`, `dropdown-menu`, `sidebar`, `sheet`, `skeleton`, `table`) — still unused, now joined by the deleted `audit-completed-card.tsx`'s old approach. Delete them now, or keep `chart`/`table` since a future "preview the report in-app" screen would likely want them?
3. **"Start Audit" still doesn't call anything real.** The redesign added a believable *simulated* processing state (disabled button, spinner, 1200ms delay), but it's still a `setTimeout`, not a network call. The next real step is deciding how the upload actually reaches n8n: direct to n8n's webhook from the browser, through a Next.js Route Handler that proxies to n8n, or something else — this determines a fair amount of code (`lib/api.ts` usage, real loading/error states instead of the simulated one, polling for completion) and hasn't been decided yet.
