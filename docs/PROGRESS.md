# Build progress

Running log of implementation state against [07-implementation-plan.md](07-implementation-plan.md). Update this file in any PR that moves a phase forward.

## 2026-06-11 (later) — Hosted deploy verified; Phase 2 cycle management

### Done

**Deploys** — hosted Supabase + Vercel are live; smoke test passed end to end (sign-up, login, macrocycle creation, all pages render). Phase 0 and Phase 1 acceptance criteria are now met in production.

**Phase 2 — Cycle management** (code-complete)

- Mesocycle builder (`/cycles/[macroId]/new-meso`): name, weeks 3–6, days/week, deload toggle, RIR start/end with live ramp preview (uses `rirRamp` with the active `engine_params`), per-day exercise slots from the library with initial sets/reps/weight; payload zod-validated server-side (ramp validity, day coverage, slot bounds)
- Mesocycle detail (`/cycles/meso/[mesoId]`): week-by-week RIR plan (microcycles once started, ramp preview while planned), per-day exercise plan, and the start action
- Activation: `src/lib/plan/activation.ts` — a pure planner (engine-style: no I/O, params injected, unit-tested) that computes all microcycle rows (week 1 active, weekly start dates) and week-1 workouts with prescriptions seeded via `seedMeso` from plan initials; `applyActivationPlan` persists microcycles → workouts → workout_exercises and flips the meso to active. Starting is guarded: planned status only, one active meso per macro
- Cycles screen: macros now list their mesocycles with status/structure, link to detail, and a "Plan mesocycle" entry point; Today already surfaces the next planned workout and week position
- Exercise library v1 complete: custom exercise creation (name, equipment, primary/secondary muscle, notes) alongside existing browse/search
- New queries: `engine.ts` (active `engine_params`, schema-gated), meso plan create/detail/list, activation persistence
- 7 new unit tests on the activation planner (ramp mapping, week-1 statuses/dates, slot ordering, seeded prescriptions, missing-equipment guard); suite now 36 tests

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (36/36), `npm run build` all green locally.

### Not done yet / next

1. **Phase 3 — logging flow**: `/log/[workoutId]` route (Today already links to it), set logging with steppers, feedback sheets, offline outbox + sync, Playwright e2e
2. **Phase 2 leftovers**: macrocycle edit/archive; richer exercise picker (search inside the builder) if the native select proves clumsy on phones
3. **Phase 4 remainder**: week N→N+1 generation job wiring `prescribe()` to logged data + `engine_decisions` audit writes (service role)
4. Regenerate `src/lib/types/database.ts` from the live schema (`npm run db:types`) now that a hosted stack exists
5. Phases 5–8 per the plan

## 2026-06-11 — Foundation, data model, engine core

### Done

**Phase 0 — Foundation & scaffolding** (code-complete; deploys pending)

- Next.js 15 (App Router) + TypeScript + Tailwind v4, structured per [02-architecture.md](02-architecture.md)
- PWA baseline: `manifest.webmanifest`, generated icons (`scripts/generate-icons.mjs`), Serwist service worker (`src/app/sw.ts`, disabled in dev)
- Design tokens from [06-design-system.md](06-design-system.md) as Tailwind theme variables in `src/styles/globals.css`
- UI primitives: `Button`, `Card`, `Input`, `BottomNav`, `RirBadge`, `NumberStepper`, `FeedbackScale`
- ESLint (flat config) + Prettier + Vitest; CI workflow (`.github/workflows/ci.yml`): typecheck, lint, unit tests, build, plus an RLS job against a local Supabase stack

**Phase 1 — Auth, profiles & data model** (code-complete; hosted project pending)

- Full schema migration `supabase/migrations/20260611000001_initial_schema.sql`: all 19 tables from [03-data-model.md](03-data-model.md), RLS enabled everywhere with default deny, denormalized cycle stamps on `logged_sets`, hot-path indexes, `security_invoker` views `v_exercise_history`, `v_muscle_group_volume`, `v_meso_summary`, signup trigger creating `profiles`
- Notable policy decisions: no client `delete` policy on `logged_sets` (append-only history); `profiles` update policy prevents self role-escalation; `engine_decisions` written only via service role; single-active-row constraint on `engine_params`
- Seed (`supabase/seed.sql`): 12 muscle groups, ~80 stock exercises with muscle-group mappings, 4 stock templates (Upper/Lower 4-day, PPL 6-day, Full Body 3-day, Glute Emphasis 4-day), `engine_params` v1 mirroring `src/lib/engine/params.ts`
- RLS test suite (`tests/rls/`, `npm run test:rls`): cross-user reads/writes blocked, stock visibility, append-only sets, role escalation, engine table gating
- Supabase clients (`src/lib/supabase/`): browser, SSR server, middleware session refresh, and `service.ts` (the only module allowed to touch the service-role key)
- Email/password auth (server actions, zod-validated), onboarding flow writing profile + `onboarded_at`
- Hand-authored `Database` types (`src/lib/types/database.ts` — regenerate with `npm run db:types` once a stack is running) and `src/lib/queries/` for profiles, exercises, cycles

**Phase 4 — engine core** (pulled forward; it is pure code with no infra dependency)

- `src/lib/engine/`: `prescribe()`, `seedMeso()`, `rirRamp()`, `scoreProgress()`; rule modules for performance delta, feedback modulation, deload, RIR ramp, rounding/increments
- All tunables flow from `engine_params` (zod schema gate — a malformed row cannot be parsed, so it can never be activated)
- 29 tests: table-driven rule-branch units, a golden 5-week + deload meso simulation (100 → 102.5 → 105 → 107.5 → 60 kg deload), and seeded-PRNG property tests on hard bounds (pain gate blocks increases, deload < peak, set floor/ceiling)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (29/29), `npm run build` all green locally. RLS tests are written and wired into CI but need a running Supabase stack to execute.

### Not done yet / next

1. **Provision hosted Supabase project + Vercel project** (needs account decisions): apply migration + seed, set env vars, enable an OAuth provider, then regenerate `database.ts` from the live schema
2. **Phase 2 — cycle management**: meso builder UI, microcycle generation (`rirRamp` is ready), week-1 workout generation, exercise library v2 (create custom), cycle timeline screen
3. **Phase 3 — logging flow**: logging UI (primitives exist), feedback sheets, offline outbox + sync, Playwright e2e
4. **Phase 4 remainder**: week N→N+1 generation job wiring `prescribe()` to data + `engine_decisions` audit writes
5. Phases 5–8 per the plan
