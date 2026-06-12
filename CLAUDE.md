# CLAUDE.md — Build conventions for WORKOUT

WORKOUT is a PWA-first workout tracker built on periodized training cycles (macro/meso/micro) with an RIR-based dynamic progression engine. **Read `docs/` before implementing anything** — the build is spec-driven:

- `docs/01-product-spec.md` — what we're building and why; out-of-scope list is binding
- `docs/02-architecture.md` — stack decisions and target repo structure
- `docs/03-data-model.md` — schema, RLS strategy, naming conventions
- `docs/04-feedback-engine.md` — the progression algorithm; engine must stay pure & parameterized
- `docs/05-mcp-connector.md` — MCP tool surface and auth rules
- `docs/06-design-system.md` — attitude, motion, copy voice (color system/nav superseded by 08)
- `docs/07-implementation-plan.md` — phase order; implement phases in sequence
- `docs/08-design-decisions.md` — **authoritative design source** (June 2026 pivot): light ledger system, canon tab bar, decisions log; mockups + screenshots in `docs/design/`

## Stack

Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres/Auth/RLS), Vercel, MCP server at `/api/mcp`.

## Hard rules

1. **RLS on every table, default deny.** Schema changes ship with policies and RLS tests in the same migration/PR.
2. **Migrations are append-only** in `supabase/migrations/`; never edit applied migrations or change schema via dashboard.
3. **The engine (`src/lib/engine/`) is pure.** No I/O, no dates-from-now, no randomness inside; all tunables come from `engine_params`. Every behavior change needs a unit/golden test.
4. **Service-role key only in `src/lib/supabase/service.ts`** call sites, always with explicit user scoping. Never in client bundles.
5. **MCP tools never take a `user_id` argument** — identity comes from the auth session only. Write tools create drafts; no deletes of logged history.
6. **Validate every boundary with zod** (forms, route handlers, MCP tool args, engine params).
7. **Design discipline (per 08):** light ledger system — cream `#F4F0E6` / ink `#17140F`; orange `#C14B2A` marks current position + selection only; square corners everywhere, dashed borders = planned/empty; lowercase logotype + tracked all-caps labels; no hype copy, no exclamation marks.
8. **No offline sync, no admin UI.** The app is online-only; engine inspection/tuning/replay ship exclusively as admin-gated MCP tools.

## Commands (once scaffolded)

```bash
npm run dev            # local dev
supabase start         # local Supabase stack
npm run db:types       # regenerate DB types after migrations
npm run test           # vitest
npm run test:e2e       # playwright
npm run lint && npm run typecheck
```

## Conventions

- snake_case in SQL; camelCase in TS; DB types generated, domain types in `src/lib/types/`.
- Data access goes through `src/lib/queries/` — no inline supabase queries in components.
- Meso stats and MCP must share the same views (`v_exercise_history`, `v_meso_summary`, `v_meso_week_sets`, `v_exercise_prs`) — one definition of progress.
- Keep `main` deployable; vertical-slice PRs.
