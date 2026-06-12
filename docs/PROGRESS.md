# Build progress

Running log of implementation state against [07-implementation-plan.md](07-implementation-plan.md). Update this file in any PR that moves a phase forward.

## 2026-06-12 — Phase R: light-ledger retheme, canon tab bar

### Done

**Phase R — design-system retheme** (code-complete)

- Token set replaced in `src/styles/globals.css` per 08 §1: cream `#F4F0E6` base, paper `#FCFAF4` surfaces, ink `#17140F`, accent `#C14B2A`; opacity steps of ink (`ink/55`, `ink/45`, `ink/15`…) carry the secondary/faint/hairline roles; square corners everywhere (all radius tokens removed); the old dark palette, pressed-orange, and green/yellow status colors are gone. `--shadow-menu` (5px 5px 0 hard offset) is the single permitted shadow
- Typography: Archivo variable (latin, 100–900) committed at `src/app/fonts/` and self-hosted via `next/font/local`; helpers `.title-display` (800 lowercase tight), `.logotype` (0.22em lowercase), `.label-caps` retracked to 0.12em, `.numeral` unchanged
- Primitives reworked to the ledger: `Button` (filled-ink primary / 1.5px ink-frame secondary), `Card` → ruled section (caps header over 1.5px rule, no box), `Input` (paper bg, ink focus), `FeedbackScale` (accent-fill selection per fig 1.4), `NumberStepper`, `RirBadge` (accent frame at peak, dashed deload)
- New primitives from the mockups: `SegmentedControl` (filled-ink active), `Chip` (filled-ink selected + dashed planned variant), `SnapSlider` (snap-to-stop 0–10, tick stops, rectangular accent thumb, keyboard support), `BottomSheet` (ink scrim, 2px-rule sheet), `MenuCard`/`MenuItem` (offset hard shadow, accent destructive row), `WeekTrack` (filled/current+dot/faint/dashed-deload states)
- **Canon tab bar** `WORKOUT · CYCLES · TEMPLATES · EXERCISES · MORE`: routes renamed `today`→`workout`, `settings`→`more`, `insights` removed, `templates` placeholder added; sign-in lands on `/workout`, onboarding completion lands on `/cycles` (08 §4); active tab is bold ink with ■ marker
- All existing screens (landing, auth, onboarding, cycles, exercises, workout, more) re-dressed in the system: ruled headers with lowercase display titles, hairline row dividers, filled-ink radio/checkbox chips, no rounded corners anywhere
- PWA: manifest + theme color → `#F4F0E6`, `start_url` → `/workout`, status bar `default`; icons regenerated for the light system (`scripts/generate-icons.mjs` recolored). Service worker already shell-precache-only — no offline-logging assumptions to remove

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (29/29), `npm run build` all green. Token/spacing values transcribed from the v2 mockup HTML (figs 1.1–4.5); pixel QA in a real browser still worth a pass when deploys exist.

### Not done yet / next

1. Phase 1 delta — onboarding rebuilt as the 08 §4 four-step sequence, Profile screen (fig 4.5), real More tab rows, queries for the pivot tables; provision hosted Supabase + Vercel
2. Phase 2 — cycles & groups-first planning (the new primitives — Chip, BottomSheet, WeekTrack, SegmentedControl — are ready for the planner screens)
3. Engine feedback re-alignment (pump/workload 0–10) needs new golden fixtures before wiring (Phase 4)

## 2026-06-12 — Design pivot ingested; plan rewritten; schema delta

### Done

**Design handoff ingested** (Claude Design mockup round)

- [08-design-decisions.md](08-design-decisions.md) added as the authoritative design source; mockup HTML + screenshots in `docs/design/`
- Specs updated for the pivot: light ledger system supersedes the dark system in 06 (banner added); canon tab bar `WORKOUT · CYCLES · TEMPLATES · EXERCISES · MORE`; **offline sync cut** (01/02/07 — app is online-only); **admin UI cut** — engine inspection/tuning/replay ship as admin-gated MCP tools (01/02/04/05/07); CLAUDE.md hard rules updated
- [07-implementation-plan.md](07-implementation-plan.md) rewritten: new Phase R (design-system retheme), groups-first planning in Phase 2, redesigned feedback + workout-complete flow in Phase 3, engine re-alignment in Phase 4, meso stats/library/templates in Phase 5, MCP incl. admin tooling in Phase 6, hardening in Phase 7

**Schema delta** — migration `20260612000001_design_pivot.sql` (RLS + tests in the same PR; `database.ts` updated)

- `profiles`: height/bodyweight (+`bodyweight_updated_at`), `training_since`, `week_starts_on`
- New tables: `excluded_exercises`, `exercise_notes` (pinned), `macro_slots` (goal arc), `meso_days` + `meso_day_groups` (groups-first planner), `template_day_groups`, `mcp_write_audit`
- `mesocycles`: nullable `macrocycle_id` (standalone mesos), `macro_slot_id`, weeks 3–8
- `workout_exercises`: `muscle_group_id` (day-view grouping + feedback scope), `status` (skip states)
- `logged_sets`: `set_type` (straight/drop), `unit` (lb/kg); nullable `macrocycle_id`
- `exercise_feedback` redesigned: joint pain 0–3 per exercise; pump/workload 0–10 sliders per muscle group (strain/fatigue dropped)
- Equipment vocabulary + bands/kettlebell; `exercises.description`
- New views `v_meso_week_sets` (stats volume/balance) and `v_exercise_prs` (performance/PRs)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (29/29) green; both migrations applied in order against a clean Postgres (`check_function_bodies=off`, as on Supabase)

### Not done yet / next

1. Phase R — retheme tokens/primitives to the light ledger system (blocks all screen work)
2. Phase 1 delta — onboarding sequence, Profile/More screens, queries for the new tables; provision hosted Supabase + Vercel
3. Phase 2 onward per the rewritten plan; engine feedback re-alignment (pump/workload 0–10) needs new golden fixtures before wiring

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
