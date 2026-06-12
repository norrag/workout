# Build progress

Running log of implementation state against [07-implementation-plan.md](07-implementation-plan.md). Update this file in any PR that moves a phase forward.

## 2026-06-12 (latest) — Design-fidelity pass: every screen transcribed from the v2 mockup HTML

The first builds of the 1.x–4.x screens improvised layouts from the spec prose; this pass re-reads `docs/design/mockups/workout - App Screens v2.dc.html` figure by figure and rebuilds each screen to its exact structure, copy, sizes, and colors. **New CLAUDE.md hard rule #8:** pixel fidelity to the mockup HTML is mandatory before building or changing any screen.

### Reworked to match

- **Day view (1.1)** is now the Workout tab itself (no header/back-link page): brand row (`workout` logotype + meso name), meso week track with the `MESO X OF Y · MACRO` / `● WEEK N — TARGET R RIR` caption, 46px `W2·D1` coordinate with date + `N OF M SETS LOGGED`, and per-exercise blocks — group caps label with 28px history/menu buttons, 20px exercise name + equipment, `PINNED —` note bar, and the **LB / REPS / LOG set grid**: editable cells (logged = tinted ink-framed; next = paper with 1.5px ink frame; future = faint), 26px LOG checkbox (filled ✓ / 2px frame / faint), ⋮ handle per row. `/log/[id]` stays as a deep link with a `‹ WORKOUT` crumb
- **Exercise menu (1.2)** and **set menu (1.3)** are anchored menu cards (offset hard shadow, scrim) — not bottom sheets — with the mockup's row sets: History › / New note / Replace exercise / Move down / Add set / Skip remaining sets / Remove exercise; Add set below / Set type (STRAIGHT⇄DROP) / Skip set / Delete set. History opens the 3.2 sheet (real `logged_sets` data grouped by meso)
- **Feedback (1.4):** title "Feedback", `MG — AFTER EXERCISE · FEEDS W# TARGETS` subtitle, sentence-case None/Low/Moderate/High pain options, ⓘ explainers, pump endpoints NO PUMP / BEST EVER, workload TOO EASY / JUST RIGHT / TOO MUCH with the explainer callout, Cancel + SAVE footer
- **Complete (1.5):** "W2·D1 complete." sheet with Exercises completed / Sets logged / Skipped rows, bordered AUTOREGULATION callout (placeholder copy until Phase 4), framed WORKOUT NOTES field, underlined "View meso stats", `NEXT — W#·D#` primary
- **Cycles (2.1):** `+ NEW` header button, expandable macro blocks (▼/▶) with `GOAL ARC: … · ● NOW IN SLOT N`, ink-rule-indented slot rows (✓ box / accent CURRENT badge / faint "Slot N" + dashed `+ PLAN`), `STANDALONE — NO MACRO` section
- **Meso detail (2.2):** WK/RIR/day-column ramp matrix (✓ cells, accent-framed next day, dashed deload/unbuilt), `RAMP 3 → 0 RIR` / `DELOAD W# — # RIR` caption, EDIT WEEKS + GO TO W#·D# button pair, MESO STATS row
- **Plan a meso (2.3):** numbered 01–04 rows (copy / template / builder / scratch) with chevrons
- **Planner board (2.4):** framed day-tab bar with `+` cell, `N OF M PICKED · S SETS` caption + `✎ DAY SETUP`, group headers with two-letter badges and sets counts, ⋮⋮ exercise rows with `EQUIPMENT · START N SETS`, dashed `Slot n — pick exercise` rows, macro-context strip with mini slot bars
- **Day setup (2.5):** label + weekday side-by-side, week-starts checkbox + accent Remove day, per-group −/n/+ steppers with ✕, in-sheet + ADD MUSCLE GROUP, helper copy, Cancel/DONE
- **Picker (2.6):** search + filled group chip, select-then-add model with the accent-framed SELECTED card (equipment, last performed, best set), `ADD TO {DAY}` primary
- **Create meso (2.7):** macro-placement timeline (filled/✓, accent-framed selected, dashed open slots with the JAN '26 … caption), framed 4–8 weeks segmented row, `RIR RAMP: 3 → 0 · W# DELOAD` caption, Cancel/CREATE; deload is always included per the mockup (toggle removed)
- **Exercises (3.1):** search frame, FILTERS chip row (muscle-group filter), `NAME / GROUP · EQUIPMENT · LAST date` rows; **Templates (3.3)** frame
- **More (4.4):** logotype, framed profile card (name, `34 · INTERMEDIATE · 198 LB · 5′11″` meta, TRAINING SINCE / N WORKOUTS LOGGED footer), SETTINGS rule with inline LB/KG mini-toggle, AI connector + CSV rows, version line
- **Profile (4.5):** read-only data rows (tap to edit in a sheet; height displayed ft/in for lb users), framed experience segmented control + helper, filled/bordered equipment chips, `NAME / REASON · ✕` exclusion rows + dashed + ADD EXCLUSION + helper

### Recorded deviations (hard-rule or phase-driven)

- **No "Delete set" on logged sets** — logged history is append-only (hard rule 5); the set menu offers amend-in-place instead. Delete/skip exist for unlogged sets only
- **Flow order:** the meso row is created at 2.7 before the board (the planner persists to `meso_days`/`meso_day_groups`, which need the meso id); the screens themselves match the mockups
- **Picker card** shows ALL-TIME BEST instead of the last-session set line (last-session line + FULL HISTORY land with the 3.2 integration in Phase 5)
- `+ NEW` on Exercises/Templates is dimmed until create-custom (Phase 5); plan-entry options 01–03 dimmed with "(soon)" until their phases
- Profile height edits in cm (display converts to ft/in); sign-out button added to More (needed, not mocked)

### Verified

`typecheck` / `lint` / `test` (30/30) / `build` green; hosted-DB smoke re-run for the extended day-view detail (context label, sibling workouts, microcycles) with cleanup.

## 2026-06-12 (later) — Phase 3 workout logging (core loop)

### Done

**Phase 3 — workout logging** (core loop; e2e + engine-derived summary pending)

- Day view `/log/[workoutId]` (fig 1.1): meso week track + RIR/deload badge in the header, day coordinate + day label, exercises grouped under `01 — QUADS` rules with pinned notes, set rows in three states — logged (filled ink, tap to amend), the live set (accent frame with weight/reps steppers, RIR chips, drop-set toggle, LOG SET), unstarted (faint prescription row)
- Logging data layer (`src/lib/queries/logging.ts`): `getWorkoutDetail` (one shape for the whole day), `logSet` with denormalized cycle stamps + auto `in_progress` flip, `amendSet` (corrections are updates — logged history stays append-only), prescribed-set add/skip, exercise skip/remove (remove blocked once sets exist, since the FK would cascade logged history), pinned-note save (one pinned per exercise)
- Exercise menu (fig 1.2): prescription rationale line, new/replace pinned note, add set, skip last set, skip remaining, remove (destructive accent row)
- Per-exercise feedback prompt (fig 1.4): auto-opens after the last planned set; joint pain (NONE/LOW/MODERATE/HIGH) per exercise; pump + workload 0–10 snap-sliders scoped to the muscle group when the exercise is the group's last to finish ("just right" centered), with explainer copy; writes the redesigned `exercise_feedback` rows
- Workout complete sheet (fig 1.5): per-exercise summary rows (set count + top set), workout notes, completion marks logged exercises completed / untouched ones skipped, closes the microcycle when the whole week is done (next-week activation is the Phase 4 job); autoregulation summary placeholder until Phase 4
- Workout tab resting state (08 §2): with no active meso, shows the latest completed meso's summary (`v_meso_summary`) above the setup prompt

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (30/30), `npm run build` green. Hosted-DB integration smoke for the full loop: standalone meso → plan → start → pinned note → 2 logged sets (workout flips `in_progress`) → group-scoped feedback (pump 7 / workload 5) → complete (status, notes, exercise statuses, microcycle closed) — then cleaned up.

### Not done yet / next

1. Phase 4 — week N→N+1 generation job (prescribe() wired to the new feedback signals, `engine_decisions` writes, autoregulation summary copy), engine input re-alignment to pump/workload 0–10 with new golden fixtures, per-equipment lb increments
2. Playwright e2e for the logging loop (no browser runtime in this environment)
3. Exercise menu leftovers: history sheet (3.2, Phase 5), replace exercise, move

## 2026-06-12 — Phase 1 delta complete; Phase 2 cycles & groups-first planning

### Done

**Phase 1 delta** (complete)

- Queries for the pivot tables in `src/lib/queries/`: exclusions (list/add/remove), pinned exercise notes, picker query (`listPickerExercises` — muscle-group pre-filter, search, last-performed + best-set from `v_exercise_prs`, exclusions removed), wider profile patch, `getActiveEngineParams`
- Onboarding rebuilt as the 08 §4 four-step sequence (about you → experience → equipment access → units, lb default) with a step rail; submits once at the end, lands on Cycles
- Profile screen `/more/profile` (fig 4.5): data rows (name/age/height/bodyweight + updated-at/training-since), experience segmented control (instant save), equipment chips, excluded-exercise management with reason labels and a search sheet
- More tab (fig 4.4): profile card → Profile, working LB/KG toggle, AI connector + CSV export placeholder rows, version line
- Hosted Supabase confirmed live (both migrations + seed applied); `.env.example` unchanged — anon key + URL wired locally via `.env.local` for verification

**Phase 2 — cycles & groups-first planning** (core flow complete)

- Cycles tab (fig 2.1): macro sections with ordered goal-arc slots — filled slots show their meso (orange marker = active), empty slots show dashed `+ PLAN`; legacy/unslotted mesos still listed under their macro; standalone section; empty state per 08 §4
- Macro creation `/cycles/new`: name, date range, goal-arc slot builder (tap to cycle cut/gain/maintain/peak, add/remove up to 12)
- Plan-a-meso entry `/cycles/plan` (fig 2.3): from-scratch live; template/copy/builder as dashed "soon" cards
- Create mesocycle `/cycles/plan/new` (fig 2.7): name, placement (standalone or any open macro slot), weeks 4–8, deload toggle, live RIR-ramp preview on `WeekTrack`
- Planner board `/cycles/meso/[id]/plan` (figs 2.4–2.6): weekday-sorted day tabs, muscle-group blocks with numbered slots (filled rows + dashed `+ EXERCISE`), add-group sheet, day-setup sheet (label, weekday, week-starts-here → `profiles.week_starts_on`, per-group slot steppers, remove day), exercise picker pre-filtered to the slot's muscle group with search, start-sets stepper, last-performed/best-set data
- Meso detail `/cycles/meso/[id]` (fig 2.2): RIR ramp matrix (weeks × days; filled = complete, accent frame = in progress, dashed = unbuilt/planned), `GO TO W#·D#`, edit plan, `MESO STATS` stub
- **Meso start generation** (`src/lib/queries/generation.ts`): on start, builds all microcycles from `rirRamp` (week 1 active) and week-1 workouts/`workout_exercises` from the planner board via `seedMeso` — prescriptions carry muscle-group context, target RIR, and the engine rationale string; bands/kettlebell map to `other` increments until Phase 4
- Engine: `rirRamp` widened from 3–6 to 3–8 weeks (matches the 2.7 week range + pivot schema), with a new 8-week golden test
- Workout tab updated for standalone mesos (`getCurrentState` now anchors on the active meso, macro optional); read-only day view at `/log/[workoutId]` shows generated prescriptions grouped by muscle group with rationale lines (logging itself is Phase 3)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (30/30), `npm run build` all green. End-to-end integration smoke against the **hosted** Supabase project (signup → onboarding writes → macro + slots → meso into slot → 2 planner days → group + slot fill → start meso): 5 microcycles created with the 3→0 ramp + deload, week-1 workouts generated with correct sets/target RIR/muscle group/rationale, `getCurrentState` surfaces the next workout; test data cleaned up after. Route auth gating spot-checked on a local dev server.

### Not done yet / next

1. Phase 3 — workout logging (day view 1.1 one-thumb logging, exercise/set menus, per-exercise feedback prompt, workout-complete sheet, Playwright e2e). The `/log/[workoutId]` read-only view is the starting skeleton
2. Phase 4 — engine feedback re-alignment (pump/workload 0–10 inputs, new golden fixtures), week N→N+1 generation job, per-equipment lb increments incl. bands/kettlebell
3. Phase 2 leftovers tracked in 07: template-prefilled planner (Phase 5), copy-a-meso, meso builder
4. A throwaway auth user (`smoke-test-claude@example.com`) remains on the hosted project from the integration smoke; safe to delete from the Supabase dashboard

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
