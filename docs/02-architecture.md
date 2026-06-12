# 02 — System Architecture

## Overview

```
┌────────────────────────────────────────────────────────────┐
│  Vercel                                                    │
│  ┌──────────────────────────┐  ┌────────────────────────┐  │
│  │ Next.js App (App Router) │  │ MCP Server             │  │
│  │ - PWA shell + UI         │  │ /api/mcp (streamable   │  │
│  │ - Server Components      │  │  HTTP transport)       │  │
│  │ - Route handlers         │  │ - tools & resources    │  │
│  └────────────┬─────────────┘  └───────────┬────────────┘  │
└───────────────┼────────────────────────────┼───────────────┘
                │ supabase-js (RLS-scoped)   │ service role +
                │                            │ explicit user scoping
┌───────────────▼────────────────────────────▼───────────────┐
│  Supabase                                                  │
│  - Postgres (schema in supabase/migrations)                │
│  - Auth (email + OAuth, JWT)                               │
│  - Row Level Security on every table                       │
│  - Edge Functions (only where DB-adjacent jobs need them)  │
└────────────────────────────────────────────────────────────┘
```

## Key decisions

### A1 — Next.js App Router on Vercel
Single deployable serves the PWA UI, API route handlers, and the MCP endpoint. Server Components fetch via the user's RLS-scoped Supabase client; mutations go through server actions or route handlers.

### A2 — Supabase as the only backend
Postgres is the source of truth. **All authorization is RLS** — the browser client uses the anon key with the user's JWT; there is no trusted middle tier for normal app traffic. The service-role key is used only server-side (MCP server, engine batch jobs) and always paired with explicit `user_id` scoping.

### A3 — Progression engine as a pure TypeScript package
The feedback/progression engine lives in `src/lib/engine/` as **pure, deterministic functions**: `(inputs, params) → prescription`. No I/O inside the engine. This makes it unit-testable, replayable against historical data, and callable from app routes and MCP tools alike. Tunable parameters live in the database (`engine_params`); admins adjust them through the MCP tuning tools without deploys (see [04-feedback-engine.md](04-feedback-engine.md) and 08 §3).

### A4 — MCP server inside the Next.js app
The MCP server is a route handler (`/api/mcp`) using `@modelcontextprotocol/sdk` over the streamable HTTP transport, with OAuth-style auth bridged to Supabase Auth. It shares the engine package and typed query layer with the app. See [05-mcp-connector.md](05-mcp-connector.md).

### A5 — PWA, online-only (revised June 2026)
Service worker (Serwist) precaches the shell for installability and fast loads. **There is no offline logging or outbox** — the app requires connectivity and shows a clean "no connection" state otherwise. Reads use stale-while-revalidate for snappiness only; writes go straight to Supabase with optimistic UI.

### A6 — Generated types end-to-end
`supabase gen types typescript` produces DB types; domain types wrap them in `src/lib/types/`. Zod schemas validate all boundary inputs (forms, route handlers, MCP tool args).

## Repository structure (target)

```
workout/
├── README.md
├── CLAUDE.md                    # build conventions for AI-assisted development
├── docs/                        # specs (this directory)
├── public/                      # icons, manifest.webmanifest
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── (auth)/              # sign-in / sign-up / onboarding
│   │   ├── (app)/               # authenticated app shell — tabs per 08 §2
│   │   │   ├── workout/         # latest uncompleted workout (default landing)
│   │   │   ├── cycles/          # macros, mesos, planner board, meso stats
│   │   │   ├── templates/
│   │   │   ├── exercises/       # library, custom exercises, history
│   │   │   └── more/            # profile, settings, AI connector, export
│   │   └── api/
│   │       └── mcp/             # MCP server endpoint
│   ├── components/              # design-system + feature components
│   │   └── ui/                  # primitives (Button, Card, Input, …)
│   ├── lib/
│   │   ├── engine/              # progression/feedback engine (pure)
│   │   ├── supabase/            # client factories (browser/server/service)
│   │   ├── queries/             # typed data-access layer
│   │   ├── mcp/                 # MCP tool/resource definitions (incl. admin tuning tools)
│   │   └── types/
│   └── styles/
├── supabase/
│   ├── migrations/              # SQL migrations (source of truth for schema)
│   ├── seed.sql                 # stock exercises, default engine params
│   └── config.toml
├── tests/                       # vitest unit + playwright e2e
└── .github/workflows/ci.yml
```

## Environments & config

| Env | Supabase | Vercel |
|---|---|---|
| Local | `supabase start` (CLI, Docker) | `npm run dev` |
| Preview | Supabase branch per PR (optional) or shared staging project | Vercel preview deploys |
| Production | Production project | Production deploy from `main` |

`.env.example` documents: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `MCP_AUTH_*`.

## CI/CD

GitHub Actions on every PR: typecheck, lint, unit tests, build; Playwright smoke on `main`. Migrations are applied via `supabase db push` from CI or MCP `apply_migration` — never hand-edited in the dashboard. Vercel auto-deploys previews per PR and production from `main`.

## Security model

- RLS on **every** table; default deny. Policies tested in CI with `pgTAP` or scripted role-swap tests.
- Stock/shared content readable via explicit policies, never by disabling RLS.
- Service-role usage confined to `src/lib/supabase/service.ts`; code review gate on any new import.
- MCP tokens are scoped to a single user; tools never accept a `user_id` argument from the model — identity always comes from the auth session.
