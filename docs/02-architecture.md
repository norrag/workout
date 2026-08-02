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

### A5 — PWA: online reads, queued set-logging writes (revised 2026-07-31, N68)

Service worker (Serwist) precaches the shell for installability and fast loads.

**Reads are online-only.** Nothing beyond immutable build assets is runtime-cached
(R7): a stale prescription served from cache with nothing marking it stale is worse
than no page at all, so an offline navigation gets the precached `/~offline`
interstitial. That decision stands.

**Set-logging writes go through a durable client-side queue** (`src/lib/logging/queue.ts`
+ `components/logging/SetLogQueueProvider.tsx`). This reverses the original
"no outbox" call, for a reason the original decision didn't anticipate: awaiting the
write *inline* did not just make logging slow on a bad connection, it could strand the
session — the checkbox filled on the server's ack but the active set only advanced when
the RSC revalidation committed, so a stalled revalidation left the lifter unable to log
the next set without relaunching the app. Taking the write off the interaction path is
what removes that failure mode; surviving a dropped connection is the by-product.

The shape:

- **Enqueue, don't await.** A tap appends an op and returns. The day view derives which
  set is active from server rows **plus** the queue's outstanding ops, so the UI advances
  off the tap, never off the network.
- **One serial processor**, oldest op first, so sets land in the order they were
  performed. It retries with capped exponential backoff and parks an op as `failed`
  after 8 attempts — a logged set is never silently discarded.
- **Idempotent ops only.** `logSet` upserts on `(workout_exercise_id, set_number)` (R3),
  `amendSet` addresses one immutable set id, the planned-weight write is an overwrite.
  Blind retry is therefore safe. Deletes and unlogs stay foreground writes for exactly
  this reason.
- **Persisted** to `localStorage`, validated on read, so a quit/relaunch — or logging a
  whole session with no signal — resumes and drains rather than losing sets. The queue
  lives in the `(app)` layout, so it keeps draining as the lifter navigates.
- **Completion still waits for the truth.** Completing locks the session in the DB, so
  `COMPLETE WORKOUT` is gated on server-confirmed sets; a fully-logged day with writes
  still in flight shows `SAVING THE LAST SETS…` instead.
- **Quiet by default.** The status strip appears only when sets are held offline or an op
  has parked.

Known limit: this makes the *write* path offline-tolerant, not the app. A cold start with
no connection still can't render the day view (the read decision above). Logging through a
dropout works when the session is already open.

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
