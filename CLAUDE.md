# CLAUDE.md — Build conventions for WORKOUT

WORKOUT is a PWA-first workout tracker built on periodized training cycles (macro/meso/micro) with an RIR-based dynamic progression engine. **Read `docs/` before implementing anything** — the build is spec-driven:

- `docs/01-product-spec.md` — what we're building and why; out-of-scope list is binding
- `docs/02-architecture.md` — stack decisions and target repo structure
- `docs/03-data-model.md` — schema, RLS strategy, naming conventions
- `docs/04-feedback-engine.md` — the progression algorithm; engine must stay pure & parameterized
- `docs/05-mcp-connector.md` — MCP tool surface and auth rules
- `docs/06-design-system.md` — tokens, accent discipline, copy voice
- `docs/07-implementation-plan.md` — phase order; implement phases in sequence
- `docs/08-ui-design-corpus.md` — binding interaction rules; check every screen against it

## Stack

Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres/Auth/RLS), Vercel, MCP server at `/api/mcp`.

## Hard rules

1. **RLS on every table, default deny.** Schema changes ship with policies and RLS tests in the same migration/PR.
2. **Migrations are append-only** in `supabase/migrations/`; never edit applied migrations or change schema via dashboard.
3. **The engine (`src/lib/engine/`) is pure.** No I/O, no dates-from-now, no randomness inside; all tunables come from `engine_params`. Every behavior change needs a unit/golden test.
4. **Service-role key only in `src/lib/supabase/service.ts`** call sites, always with explicit user scoping. Never in client bundles.
5. **MCP tools never take a `user_id` argument** — identity comes from the auth session only. Write tools create drafts; no deletes of logged history.
6. **Validate every boundary with zod** (forms, route handlers, MCP tool args, engine params).
7. **Design discipline:** orange accent only for active states/primary actions/progress marks; all-caps only for logo and key labels; no hype copy, no exclamation marks.
8. **UI discipline (`docs/08-ui-design-corpus.md`):** no dropdowns/selects ever; one job per screen — split flows into steps/tabs/sheets; plan at the right cycle altitude (meso = days × muscles × exercises; sets/reps/weights belong to the week and the engine); the 3→0 RIR ramp is built in, never a user option; categorical muscle-group color is separate from the accent.

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
- Insights and MCP must share the same views (`v_exercise_history`, `v_meso_summary`) — one definition of progress.
- Keep `main` deployable; vertical-slice PRs.
