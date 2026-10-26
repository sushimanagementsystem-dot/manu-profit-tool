# Menu Profit — frontend

The Next.js app for [Menu Profit](../README.md). It renders two screens — the upload form and the
analysis workspace — and holds no business logic and no secrets: every figure comes from the
NestJS API in [`../backend`](../backend).

## Running it

```bash
pnpm install
cp .env.example .env     # NEXT_PUBLIC_API_URL → the backend
pnpm dev                 # http://localhost:3000
```

The backend must be running (`cd ../backend && pnpm start:dev`, port 4000) or every screen will
report that the server cannot be reached.

## Commands

`pnpm dev` · `pnpm build` · `pnpm start` · `pnpm lint` · `pnpm test`

## Conventions

See [`CLAUDE.md`](CLAUDE.md) for the stack and the Next.js 16 specifics (Cache Components, async
request APIs, TanStack Table v9), and [`flow.md`](flow.md) for how the screens are wired.
