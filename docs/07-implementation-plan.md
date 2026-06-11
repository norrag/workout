# 07 — Implementation Plan

Phased plan to build WORKOUT to production quality. Each phase ends in a deployable, demoable state with acceptance criteria. Phases are sequenced so the data model and engine — the riskiest parts — are validated early.

## Phase 0 — Foundation & scaffolding

**Goal:** a deployed empty shell with CI, types, and design tokens in place.

- [x] Scaffold Next.js (App Router, TypeScript, Tailwind) per the structure in [02-architecture.md](02-architecture.md)
- [x] PWA baseline: manifest, icons, Serwist service worker, installability
- [x] Design tokens + `ui/` primitives (Button, Card, Input, BottomNav) from [06-design-system.md](06-design-system.md)
- [x] Local CLI workflow (`supabase/config.toml`, migration scripts in package.json) — hosted Supabase project still to be provisioned
- [x] `.env.example`, ESLint, Prettier, Vitest wiring — Playwright wiring pending (Phase 3 e2e)
- [x] GitHub Actions CI: typecheck, lint, unit tests, build
- [ ] Vercel project connected: preview deploys per PR, prod from `main`

**Accept:** PR previews deploy; CI green; app installs as a PWA showing the dark shell.

## Phase 1 — Auth, profiles & data model

**Goal:** users exist; the full schema exists.

- [x] Migrations for the entire schema in [03-data-model.md](03-data-model.md), with RLS policies on every table
- [x] RLS test suite (policy tests run in CI against local Supabase)
- [x] Seed data: muscle groups, ~80 stock exercises, 3–4 stock templates, default `engine_params`
- [x] Supabase Auth: email/password with SSR-safe session handling — OAuth provider still to be enabled in the hosted project
- [x] Onboarding flow: profile capture (age, gender, experience, equipment prefs, units)
- [x] DB types (hand-authored, `npm run db:types` to regenerate) + `src/lib/queries/` data-access layer

**Accept:** new user can sign up, onboard, and see an empty Today screen; cross-user data access provably blocked by RLS tests.

## Phase 2 — Cycle management

**Goal:** users can build the macro → meso → micro structure.

- [ ] Macrocycle CRUD (goal type, metrics, timeline, status)
- [ ] Mesocycle builder: weeks (3–6), days/week, deload toggle, RIR ramp preview; add exercises per day (from library) with initial sets/reps/weight
- [ ] Microcycle generation with per-week target RIR
- [ ] Workout generation for week 1 from the meso plan
- [ ] Cycles screen: timeline of position in macro/meso/micro
- [ ] Exercise library v1: browse/search stock exercises, create custom exercises

**Accept:** user creates a macro, builds a 4-week meso from scratch, and sees week 1 workouts scheduled.

## Phase 3 — Workout logging

**Goal:** the core daily loop, excellent on a phone in a gym.

- [ ] Today screen with current workout and cycle position
- [ ] Logging flow: per-exercise set logging (steppers), add/remove/swap sets & exercises, notes
- [ ] Exercise feedback sheet (joint pain, strain, pump, fatigue) after final set
- [ ] Workout feedback on completion (overall fatigue, effort, performance)
- [ ] Full cycle-context stamping on `logged_sets`
- [ ] Offline outbox: log without connectivity, sync on reconnect, conflict-safe
- [ ] Playwright e2e: complete a full workout offline → sync

**Accept:** a full workout can be logged one-thumbed, offline, in under the time between sets.

## Phase 4 — Progression engine v1

**Goal:** next week's numbers are computed, explainable, and tunable.

- [x] `src/lib/engine/` pure package per [04-feedback-engine.md](04-feedback-engine.md): types, param schema, rule modules (built early — pure code, no infra needed)
- [ ] Week N → N+1 generation job (on micro completion or first open of new week)
- [ ] Deload prescription; meso-seeding from prior meso peak
- [ ] `engine_decisions` audit writes with rationale; rationale surfaced in logging UI
- [x] Unit tests (rule branches), golden meso simulations, property tests on hard bounds
- [ ] Progress scoring v1 + `v_exercise_history` / `v_meso_summary` views

**Accept:** golden-fixture meso produces the expected 3→0 RIR progression; every prescription shows a sensible rationale; pain gate provably blocks load increases.

## Phase 5 — Admin & tuning tooling

**Goal:** the team can obtain quality engine outputs safely.

- [ ] Role-gated `/admin` area
- [ ] Decision inspector (browse/filter `engine_decisions`)
- [ ] Param editor with versioning, diff, activate-with-confirm
- [ ] Replay harness: re-run historical decisions/mesos against candidate params, diff outcomes
- [ ] Synthetic scenario fixtures shared with the test suite

**Accept:** an admin can change a progression increment, replay a real meso against it, see the diff, and activate — without a deploy.

## Phase 6 — Templates, sharing & insights

**Goal:** reuse, community sharing, and visible progress.

- [ ] Template CRUD + filters (emphasis, gender, days/week, author); start meso from template; save meso as template
- [ ] Sharing: share codes/grants for custom exercises, templates, mesos; copy-on-accept with custom-exercise resolution & dedupe
- [ ] Insights screens: exercise history (weight/volume/e1RM), muscle-group weekly volume, meso summaries, macro progress vs goals
- [ ] Stock template polish pass with seeded content

**Accept:** user A shares a template containing a custom exercise; user B accepts and starts a meso from it; insights match raw logged data.

## Phase 7 — MCP connector

**Goal:** any MCP client can analyze and plan with the user's data.

- [ ] `/api/mcp` server (Streamable HTTP) with OAuth bridge to Supabase Auth; token management UI in Settings
- [ ] Read tools: profile, current state, cycles, exercise history, muscle-group volume, meso summaries, explain_prescription, search
- [ ] Write tools: create_mesocycle (draft), create_template, create_custom_exercise, update_macrocycle_goals, log_note
- [ ] Resources + server instructions; MCP write audit log
- [ ] Tool-handler tests against a seeded fixture user; manual verification from Claude

**Accept:** from Claude, a user can ask "summarize my last meso and draft the next one"; the draft appears in-app as a planned meso with engine-generated numbers.

## Phase 8 — Production hardening & launch

**Goal:** production quality, end to end.

- [ ] Security pass: RLS audit (Supabase advisors), service-role usage audit, rate limiting, headers
- [ ] Performance pass: bundle, query plans on hot paths, Lighthouse PWA ≥ 90
- [ ] Error handling/observability: structured logging, Sentry (or equivalent), Supabase log review
- [ ] Accessibility audit on the logging flow
- [ ] Data lifecycle: account deletion/export
- [ ] Seed-content polish; empty/edge states; final design QA against [06-design-system.md](06-design-system.md)
- [ ] Production deploy, custom domain, smoke checklist

**Accept:** real users can be onboarded; the daily loop, engine, and MCP connector all work in production with monitoring in place.

---

## Working agreements

- **Vertical slices:** every PR keeps `main` deployable; features land behind their phase.
- **Migrations are append-only** and reviewed; schema changes always update generated types and RLS tests in the same PR.
- **Engine changes require fixtures:** no rule change merges without a golden/unit test demonstrating it.
- **Design discipline:** any new screen is checked against the accent-restraint and copy-voice rules before merge.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Engine quality is subjective and hard to get right | params in DB + replay harness (Phase 5) makes tuning cheap; rationale strings expose bad logic early |
| Offline sync conflicts | outbox is append-only set logs keyed by client-generated UUIDs; last-write-wins on notes only |
| Sharing custom exercises creates cross-user coupling | copy-on-accept with provenance IDs, no cross-user FKs |
| MCP auth complexity | standard OAuth bridge; identity from token only; read-mostly tool surface in v1 |
| Scope creep in v1 | out-of-scope list in [01-product-spec.md](01-product-spec.md) is binding until launch |
