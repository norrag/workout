# Build progress

Running log of implementation state against [07-implementation-plan.md](07-implementation-plan.md). Update this file in any PR that moves a phase forward.

## 2026-06-15 (latest) — Planner workflow fixes: combined day sheet, live-data bugs, delete mesocycle (Phase 2 on-device feedback)

On-device review of the planner board surfaced several broken interactions and workflow friction.
This slice fixes them. No schema change; `main` deployable. **The larger "draft model" reorder
(create-mesocycle as the *final* stage, one draft at a time) is teed up as the next slice — see
"Not done yet" below.**

### Done

- **Stale-sheet bug fixed — the root cause of three reported "doesn't work" bugs.** The day-setup
  sheet captured a **snapshot** of the day when it opened, so the per-group **± set steppers**, the
  group **✕ remove**, and the **add-muscle-group** picker all wrote to the DB but the sheet (and its
  derived `taken`/`available` lists) never reflected the change. The sheet now reads the **live**
  `day` from the board's `days` prop (looked up by id, re-passed on every revalidation), so all three
  update immediately. The board already re-derived `activeDay` from live data; only the sheet was stale.
- **Add-day and day-setup combined into one view (`Day N`).** Previously you added a day (label +
  weekday) in one tray, then reopened a near-identical "day setup" tray to add muscle groups. Now
  tapping **`+`** creates the day (auto weekday) and **opens the single combined sheet** titled
  `Day 1` / `Day 2` … with weekday + label + muscle groups + per-group set counts all in one place.
  `addDayAction` returns the new day so the client can open it directly; the old `"new"` sheet mode
  is gone. Empty state shows a full-width **`+ ADD TRAINING DAY`** button.
- **Weekday auto-fills (Monday-first).** Adding a day assigns the next unused weekday starting Monday
  (`nextWeekday`), so days are never null/unordered on creation; the user can still change it in the
  sheet. Days sort Monday-first (already the case in `getMesoPlan`).
- **"Week starts on this day" removed.** Weeks are assumed to start Monday; the checkbox and the
  `profiles.week_starts_on` write are gone (`updateDayAction` no longer takes `week_starts_here`).
  The column remains (defaults to 1) — nothing reads it for ordering.
- **Delete a mesocycle (with warnings).** New `DELETE MESOCYCLE` on the meso detail page opens a
  confirm sheet. `getMesoDeletionImpact` counts the meso's `logged_sets`; when there's history the
  copy is stronger (`… N logged sets, every workout, and the week structure …`) **and an
  acknowledgement checkbox gates the delete**. `deleteMesocycle` is user-scoped; FK cascades remove
  microcycles/workouts/logged_sets/planner rows (RLS `mesocycles_all_own` is `for all`; the child
  cascade bypasses RLS by design — verified against the schema).

### Recorded deviations

- **Combined day sheet + removed week-starts** deviate from fig 2.5 (which shows separate add/setup
  and a week-start toggle) — done per direct user request (2026-06-15 on-device review). Square-corner
  ledger styling preserved.
- **Delete button isn't in the stock mockup** — built in the house style (accent destructive row +
  confirm sheet), consistent with other unmocked controls (share/redeem).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (106/106), `npm run build` green. No schema change.
The fixes are interaction logic in `PlannerBoard.tsx` (live-data derivation) + a delete query/action
covered by the existing RLS model; in-browser pixel/interaction QA of the combined sheet and delete
flow still pending (as for other screens).

### Not done yet / next — draft model (the headline workflow ask)

- **`create mesocycle` becomes the *final* stage, not the first.** From-scratch/template/copy should
  drop you straight onto the planner **as a draft**, with the name/weeks/RIR form as the last step.
  Needs a `draft` status (`DATA` migration extending the `mesocycles_status_check`), draft creation
  on each entry path, the create-form moved to a board "finish" action (draft → planned), and a
  cycles-list **`DRAFT — CONTINUE EDITING ›`** entry.
- **One draft at a time.** Starting a new draft when one exists prompts **keep editing** vs **replace**
  (replace deletes the existing draft). Query-layer enforced (no draft-management UI).

## 2026-06-15 — Plan-a-meso: copy-a-mesocycle path (fig 2.4 option 01, Phase 2 / Design v2 backlog)

Lands the **copy-a-mesocycle** path — the most-cited remaining Phase 2 gap (option 01 of the
plan-a-meso flow, previously a dashed "soon" stub). No schema change: copy clones the planner
structure and lets `startMeso` reseed loads from the user's all-time bests, so it literally
"starts from where you left off." Vertical slice; `main` deployable.

### Done

- **`copyMesoStructure` + `planMesoCopy`** (`src/lib/queries/cycles.ts`) — `copyMesoStructure`
  reads the source meso's plan (`getMesoPlan`) and clones its `meso_days → meso_day_groups →
  meso_exercises` onto a freshly created target meso, mirroring `applyTemplateToMeso`. The pure
  **`planMesoCopy`** helper maps source days→groups→fills into insert rows: it **honors the user's
  exclusion list** (an excluded exercise's fill is dropped but its **slot stays open** — slot count
  preserved so the picker can replace it), widens a group's slot count to fit if the source had more
  fills than declared slots, and falls back slot numbers to position when unset. Loads are **not**
  copied — `startMeso` reseeds every slot from `v_exercise_prs`.
- **`listCopyableMesos`** — the user's planned/active/completed mesos (placeholders excluded),
  newest first, for the source picker.
- **Source picker** `/cycles/plan/copy` (house style, bordered rows like the template picker) —
  `STATUS · PHASE`, name, `N WK` / `N D/WK` chips; tapping routes to the create form with `?copy=`.
- **Create-meso form (fig 2.4) reused for copy** — `/cycles/plan/new?copy=<id>` loads the source,
  subtitles `COPIED FROM — NAME`, and prefills name (`<source> II`), weeks, RIR ramp, and deload
  from the source. The form gained `copyMesoId`/`defaultWeeks`/`defaultDeload`/`defaultRir*` props;
  `createMesocycleAction` parses an optional `copy_meso_id` and runs `copyMesoStructure` after create
  (template path unchanged). Plan-a-meso option 01 is now an enabled link.
- Tests: **106 passing** (+4) — `planMesoCopy` (full clone with weekday/label/sets carry, excluded
  exercise dropped + slot preserved, slot-count widening, empty plan).

### Recorded deviations

- **Copy picker UI not in the stock mockup** — built in the established house style (bordered rows),
  same as the template picker and share/redeem rows (a prior recorded deviation). Square-corner
  ledger styling preserved.
- **RIR ramp / deload carry from the source** even though the create form doesn't expose RIR edits;
  the copy intent is "do this meso again," so the source's ramp is the right default.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (106/106), `npm run build` green (`/cycles/plan/copy`
and the updated `/cycles/plan/new` both compile). No schema/RLS change — copy creates rows the user
owns through existing policies; the source is read via RLS (a meso not visible to the user copies as a
no-op). No hosted writes this slice; pure helper unit-tested, the DB walk mirrors the smoke-tested
`applyTemplateToMeso` pattern. In-browser pixel QA of the picker still pending (as for other screens).

## 2026-06-15 — Library & stats reconciliation: Exercise page (3.1a/b) + two-axis filter + Volume tab removed (Design v2 backlog, DATA)

Lands the bulk of the **Library & stats (against Phase 5)** reconciliation block from 09 (2026-06-14
session-3 §1/§2/§4): the net-new Exercise page (Overview/History tabs), the two-axis library filter,
and the Meso Stats Volume-tab removal. This is what the logging "View exercise ›" link (shipped
2026-06-15) was already pointing at. Vertical slice; `main` deployable.

### Done

- **`DATA` migration `20260615000004_exercise_overview.sql`** (append-only; **applied to hosted**,
  schema + values re-checked, security advisors clean):
  - **`v_exercise_overview`** (security_invoker) — per (user, exercise) lifetime aggregates backing
    the 3.1a Overview and MCP read tools (one definition of progress): `times_trained`,
    `total_volume`, `first_logged_at`, `last_performed_at`, `weight_pr` (+ reps at it), `volume_pr`
    (+ the weight×reps that produced it), `best_e1rm`, `best_session_volume`. Argmax columns built
    with `distinct on` CTEs over working sets; cross-checked against raw `logged_sets` on hosted
    (Dumbbell Bench: 155×8 weight PR, 1240 volume PR, e1RM 196.3 = 155·(1+8/30) — exact).
  - **`exercises(equipment_type)` index** for the new EQUIP filter axis (09 §1 `DATA`).
- **Exercise page (3.1a/3.1b)** — rebuilt `/exercises/[exerciseId]` with an **OVERVIEW | HISTORY**
  segmented toggle (`?tab=`). Overview = LAST PERFORMED (date · W·D) + the **ALL-TIME BESTS** 2×2 ink
  grid (weight PR, est 1RM, volume PR, best session vol) + **EST. 1RM ACROSS `<macro>`** M1…Mn bars
  (filled past / accent-framed current / dashed future) + TIMES TRAINED / TOTAL VOLUME / FIRST LOGGED
  footer; description, pinned note, and the custom-exercise SHARE row retained below (deviation —
  functionally needed, not in the stock mockup). History = `ExerciseHistoryList` (sessions grouped by
  meso). `getExerciseOverview` reads the view, derives the last-session coordinate, and computes the
  across-macro bars from `v_exercise_history` (same pattern as the meso-stats macro chart).
- **Exercises tab (3.1) two-axis filter** — `MUSCLE` and `EQUIP` rows (chips scroll, selected = filled
  ink + ✕ to clear, EQUIP has an `ALL` chip); the two combine **AND**; an `n OF N EXERCISES` count +
  `CLEAR ALL` appear whenever a filter is active. Equipment chips are the distinct types present.
- **Meso stats — Volume tab removed** (09 §4): the segmented control is now **Balance · Performance**
  and defaults to **Balance**; the renumbering is 4.1 Balance / 4.2 Performance. `buildVolumeMatrix`
  stays (it still feeds `buildBalance`, and the Workout-tab resting state still renders `VolumeView`
  per 08 §2 — left unchanged, not in this backlog item).
- Types: `VExerciseOverviewRow` + the `v_exercise_overview` view registered in `database.ts`.
- Tests: **102 passing** (+7) — `buildExerciseMacroBars` (label/state/rounding, current-with-no-data,
  no-current, empty) and `groupHistoryByMeso` (consecutive grouping, distinct same-named mesos, empty).

### Recorded deviations

- **Overview keeps description / pinned note / SHARE** below the stat blocks — the 3.1a mockup shows a
  stock exercise without them, but they're functional (custom-exercise description + sharing, the
  pinned note). Square-corner ledger styling preserved.
- **Stats back-nav stays `‹ MESO`** and entry stays the meso-detail `MESO STATS` row — the planner-board
  `PLAN | STATS` toggle + `‹ PLAN` back-nav belongs to the not-yet-built single-surface planner (2.5);
  only the Volume-tab removal is in scope here.
- **`tracking_type` (3.1c / per-set render) deferred** — it changes `logged_sets` (nullable weight/reps
  + `duration_seconds`) and touches the whole logging core, so it's a separate slice (still `[ ]` in 07).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (102/102), `npm run build` green. Migration applied
to hosted; `v_exercise_overview` shape + computed values validated against raw `logged_sets`; equipment
index present; security advisors show no new lints (the view is security_invoker, no SECURITY DEFINER).
Read-only validation against existing account data — nothing written or deleted. In-browser pixel QA of
the new Exercise page / filter rows still pending (as for the other screens).

## 2026-06-15 — Logging-flow review, round 2: animation polish + skip/dot refinements

Follow-up to the on-device review (09 session-5, second batch).

### Done

- **Navigator no longer re-animates on day load.** The reveal transition is now gated to an
  explicit chevron toggle (`animate` flag); hydrating the open state after a day-chip navigation
  snaps instead of replaying the 0fr→1fr animation. Week selection was already smooth (client state).
- **Active-day dot always shown.** The orange dot marks the meso's resume week/day **regardless of
  selection** (dropped the `!viewing`/`!isSel` guards; the current week is derived from the nav
  grid, not the viewed week), so the user can always spot and return to the live day.
- **Bottom sheets slide up/down.** `BottomSheet` gained a reusable `useSheetTransition`
  (mount + `translate-y-full`↔`translate-y-0` + scrim fade, ~280ms ease-out); the per-exercise
  feedback sheet (1.4) now animates in, and the Workout Complete sheet (1.5, a custom container)
  uses the same hook for enter **and** exit.
- **Unskip all.** The exercise menu (1.2) shows **"Unskip all sets"** whenever the exercise has any
  skipped sets (`clearSkippedSets`), alongside per-set unskip.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (95/95), `npm run build` green. No schema change
this batch (reuses `skipped_set_numbers` from `20260615000003`).

## 2026-06-15 — Logging-flow on-device review: interaction fixes + per-set skip (DATA)

First hands-on review of the deployed logging flow (09 session-5). Seven interaction fixes
shipped; two larger features (notes model, workout/meso options menu) specced for next slices.
Vertical slice; `main` deployable.

### Done

- **Navigator stays open** across day selection — open state persisted in `sessionStorage`, so
  picking consecutive days no longer collapses it (supersedes the "defaults closed each entry" note).
- **Denser set rows captured** (09 §5, which the code had never picked up): box `42→32px`, value
  `17→14px`, log box `26→21px`, row padding `7→4px`, grip/log columns `22/50→20/44`; the LOG control
  keeps a ≥44px-wide tap target around the 21px box.
- **Sets are uncheckable** — tapping a logged ✓ on an active workout un-marks it and re-opens the
  slot (`unlogSet`; keeps the prescription, no renumber). Completed workouts stay locked.
- **Row menus flip on-screen** — new `AnchoredMenu` (viewport-`fixed`, measures the trigger and its
  own height) opens below when there's room, otherwise above; replaces the absolutely-positioned
  cards that ran off the bottom edge. Used by both the exercise (1.2) and set (1.3) menus.
- **Per-set skip** (`DATA`, migration `20260615000003_per_set_skip.sql`, **applied to hosted**):
  `workout_exercises.skipped_set_numbers int[]`. "Skip set" greys a set **in place** and is
  reversible ("Unskip set"); "Skip remaining sets" fills every uncompleted slot and **no longer
  flips the whole exercise to skipped** (fixing the bug where the exercise + its reopened menu were
  greyed/backgrounded). Skipped sets are never logged, so the engine and views are unaffected; the
  type's `Defaulted` union gained the column so inserts stay optional.
- **Delete vs skip split** — "Delete set" drops a planned slot (unlogged) or deletes the logged row
  (`deleteSet`, renumber); "Skip set" toggles the greyed state. Both gated to in_progress.
- **Complete-workout gating** — the button now appears only once **every set is logged or skipped**
  (was "after any set is logged"); the helper `exerciseDone`/`plannedSetCount` account for skips.

### Deferred to next slices (specced in 09 session-5 §8/§9, 07 backlog, 03)

- **Notes model** — split the cross-workout **pinned note** (exercise attribute, inline edit icon,
  optional) from a per-session **log note** (saved with the workout's exercise log; note-icon on
  history rows; editable only live). `DATA`.
- **Workout / mesocycle options menu** on the Day View header — Mesocycle (notes · edit → planner ·
  stats · End mesocycle) + Workout (note · edit day · add exercise · End workout). New audited
  `endMesocycle`/`endWorkout` queries + confirm steps. `DATA`.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (95/95), `npm run build` green. Per-set-skip
migration applied to hosted. No new unit tests this slice (the new functions are I/O against
Supabase; pure helpers live in the component); the engine paths are unchanged and remain golden-tested.

## 2026-06-15 — Logging retrofit: Day View header, Workout Complete redesign, completion lock (Design v2 backlog, DATA)

Lands the **Logging (against Phase 3) reconciliation block** from 09 (2026-06-13 §1–2 / 2026-06-14
§1): the Day View header rework (1.1), the redesigned Workout Complete sheet (1.5), the set
delete + completion lock (1.3), and the 1.2 menu relabel. Vertical slice; `main` deployable.

### Done

- **Day View header (1.1)** — rebuilt as a **sticky/locked region** with a **collapsible week/day
  navigator**: `workout` logotype + disclosure chevron, a bordered card with the week selector
  (`W1…DL`, current-week orange dot) and a **nested day-chip drawer** for the selected week
  (completed = tint + ✓, current = orange dot, viewing = filled ink). Day chips **navigate** to that
  day's `/log/[workoutId]`. The coordinate keeps `W·D` + date and moves **Target RIR** beside it (in
  orange; `DELOAD WEEK` on deload); the old `MESO n/N` meta line and the `N OF M SETS LOGGED` text
  are replaced by an **orange progress bar** (`setsLogged ÷ setsPlanned`) over the marked divider.
  `DATA`: `getWorkoutDetail` now returns `navWeeks` (per-week programmed days with completion state +
  workout ids), built from the meso's microcycles/workouts/`meso_days` (future weeks fall back to the
  planner's day list).
- **Workout Complete (1.5) — redesigned.** Removed the boxed `AUTOREGULATION` panel and the
  `View meso stats` link (recalculation runs silently). The sheet is now **counts + the three
  session sliders** (overall fatigue / effort / performance, 0–4, same `SnapSlider` UI as the 1.4
  prompt) **+ notes + a single `NEXT WORKOUT →`** that completes, advances, and navigates in one
  action. `DATA`: `saveWorkoutFeedback` writes `workout_feedback` **before** completion flips the
  status, so the **already-wired** session dampener (10 §3 / `feedback.ts` `sessionDampened`) finally
  has data — previously the engine accepted `workoutFeedback` but the UI never captured it.
- **Set delete + completion lock (1.3)** — `DATA` migration `20260615000002_completion_lock.sql`
  (**applied to hosted**, policies + advisors re-checked): replaces the user-only `logged_sets`
  update policy and adds a delete policy, both gated on the **parent workout being `in_progress`**;
  splits `exercise_feedback`'s blanket `for all` into select/insert (own) + update/delete (own **and**
  parent workout `in_progress`). Inserts stay open (the first set is written while the workout is
  still `planned`); the service-role week-N→N+1 job is unaffected. UI: the set menu's **Delete set**
  now really deletes a logged set while in-progress (`deleteLoggedSet` renumbers survivors + trims a
  prescribed slot); a completed workout shows `Logged — session locked`. Refines hard rule #5
  (append-only **after** completion).
- **Exercise menu (1.2)** — `History ›` → **`View exercise ›`**, repointed to the exercise detail
  page (the full 3.1a Overview tab arrives with the library slice).
- Tests: RLS suite reworked — the old "append-only (no delete policy)" case is now a
  **completion-lock** pair: owner can amend+delete while `in_progress`; a **completed** workout
  rejects both amend and delete (and stays invisible to other users). 95 unit/engine tests
  unchanged (engine dampener already had golden coverage).

### Recorded deviations

- **Single-action complete** (vs the prior two-phase confirm→recalculated sheet): the redesigned
  sheet completes + advances + navigates on the one `NEXT WORKOUT →` tap, matching the mockup. The
  engine summary is no longer surfaced (panel removed by design); it still writes `engine_decisions`.
- **`workout_feedback` not RLS-locked on completion.** The spec calls out gating
  `logged_sets`/`exercise_feedback`; `workout_feedback` stays own-scoped because it is written once,
  transactionally, just before completion (gating its insert on `in_progress` would be order-fragile).
- **"View exercise" lands on the existing exercise detail page**, not the not-yet-built 3.1a/b
  Overview/History tabs (library slice). Functionally equivalent for now (description, bests, history).
- **Sticky header fidelity:** implemented as `position: sticky` within the scrolling page (the app
  isn't a fixed-height device frame); in-browser pixel QA still pending, as for the other screens.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (95/95), `npm run build` green. Migration applied
to the hosted project; policies confirmed present with the `in_progress` gate and security advisors
show no new lints. RLS assertions for the lock are written (need a running stack to execute, as for
the rest of the RLS suite). No hosted integration smoke this slice (avoided polluting the account) —
the new query/IO paths are covered by typecheck + build; the engine dampener path is unit-tested.

## 2026-06-15 — FFMI proximity target model + body-fat input (research-driven, ENGINE/DATA)

Multi-source literature review (deep-research harness, 7 agents) on real muscle/strength/fat-loss
rates exposed the core flaw: the engine keyed hypertrophy off **calendar training age**, which
overstates adaptation for someone who trained for years without growing. Per the research the right
state variable is **proximity to genetic potential**, observable from body composition (FFMI).

### Done

- **FFMI proximity model (primary driver)** in `src/lib/engine/macro.ts`: `rate = floor + (base −
  floor)·(1 − developedFraction)`, where `developedFraction` comes from normalized FFMI vs ceiling
  (`{male 25, female 21.5}`) / untrained baseline (`{18.5, 14.5}`); target capped at 0.6 × remaining
  potential. **Falls back to the v4 training-age decay** when body fat is unknown (existing users
  unaffected). Cut leanness band now uses **body-fat %** when present (BMI proxy fallback). Sex factor
  **0.5 → 0.7** (research: relative gains equal between sexes; 0.5 over-penalized).
- **`body_fat_pct`** added to `profiles` (migration `20260615000001`, **applied to hosted**;
  nullable, 2–70 check) with a **skippable visual band picker** in the Profile editor (6 bands → stored
  midpoint; `clearBodyFatAction`). Onboarding stays 4 steps; absent BF → graceful training-age fallback.
- **`engine_params` v5** (same migration, applied to hosted + re-parsed through the schema): new
  `hypertrophy_floor_pct_bw_month`, `ffmi_ceiling`, `ffmi_untrained`, `proximity_macro_cap_frac`,
  `cut_bf_thresholds`; v4 deactivated. New fields carry `.default()` so older rows still parse.
- **Validated the headline case:** 6′1″ 159 lb ~16% bf "trained since 2013" (FFMI ≈ 17, below
  untrained) now reads **+19–29 lb/12mo** (beginner-class) instead of elite ~2 lb/yr; a jacked FFMI-25
  veteran of the same age correctly reads ~0; leaner-at-equal-weight ⇒ slower (reads muscle, not scale).
- Tests: **95 passing** (+4) — proximity goldens (undermuscled-long-timer, near-ceiling, leanness
  gradient, BF-based cut band); sex-factor test corrected to 0.7. RLS active-version assertion → 5.
- Docs: 10-spec §5 rewritten (proximity primary, training-age fallback, v3→v4→v5 evolution + the Hubal
  individual-variation caveat). `scripts/macro-engine-matrix.ts` retained as the dev review harness.

### Notes / honesty

- The target is explicitly **not the heart of the app** (periodization for results is) — implemented
  proportionately, behind tunable `engine_params`, and always shown as an estimate band.
- FFMI ceiling (25/21.5 normalized) and the band-midpoint body-fat estimate carry real individual
  variation; the model is a planning prior, not a prediction.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (95/95), `npm run build` green. v5 migration applied
to hosted; the exact migration JSON re-parsed through `engineParamsSchema`; user case confirmed
duration-sensitive and beginner-class. RLS suite needs a running stack (unchanged); assertion bumped.

## 2026-06-14 (latest) — Macro-target engine fix: continuous training-age decay + capped cut + auto block-length (ENGINE)

Fixes the realistic-target outputs flagged on-device: for a high-training-age profile the target was
**static across durations** (3-month and 12-month macros both showed ≈+0.6 lb) and implausibly low.
Root cause: the hypertrophy model clamped the per-macro total to a hard **career-cap** (remaining
lifetime potential), which collapses to a fixed tiny number for near-potential lifters regardless of
duration. Reviewed via a matrix harness across 7 profiles × 4 goals × 3 durations and retuned.

### Done

- **Hypertrophy → continuous training-age decay** (`rate(T) = base × e^(−T/tau)`, `base {1.0,1.5}%BW`,
  `tau 5 yr`). The target now scales with duration **and** tapers smoothly with training age; the hard
  career-cap clamp is gone (`career_cap_lb`/`career_tau_years` kept in params only for back-compat).
  Reproduces the Aragon bands at their anchor ages; a 13-yr lifter now reads **+0.4–0.7 / +0.9–1.3 /
  +1.8–2.6 lb** for 3/6/12 mo (was a flat +0.6 lb) — ~2–3 lb lean mass/yr, research-appropriate.
- **Cut → compounding + cap.** Was linearly extrapolating %BW/week (−93 lb over 12 mo). Now compounds
  on the shrinking bodyweight (decelerates) and is capped at `cut_cap_pct_bw` (25% BW). Strength and
  maintain unchanged.
- **`suggestMesoLength(months)`** (pure) — picks the block length (4/5/6 wk) that divides the macro
  most evenly (12 mo → 4 wk = 52/4 exact; 6 mo → 5 wk). The Create-Macrocycle form **auto-selects** it
  and re-suggests as duration changes, until the user overrides (then their pick sticks); a `SUGGESTED`
  hint shows until then.
- **`engine_params` v4** (migration `20260614000003`, **applied to hosted** + re-read/parsed): new
  `hypertrophy_base_pct_bw_month`, `hypertrophy_decay_tau_years`, `cut_cap_pct_bw`; v3 deactivated.
  Schema fields added with `.default()` so older rows still parse; seed + `DEFAULT_ENGINE_PARAMS`
  mirror it; RLS active-version assertion bumped to 4.
- Tests: **91 passing** (+5) — reworked macro goldens to the new model; a **monotonic-in-duration**
  property across training ages 1/4/7/13 (would have caught the static bug), a 13-yr decay-but-positive
  case, a cut-cap bound, and `suggestMesoLength` correctness. `scripts/macro-engine-matrix.ts` is the
  (dev-only) review harness. Docs: 10-spec §5 rewritten (model + superseded note); cut formula updated.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (91/91), `npm run build` green. v4 migration applied
to hosted; the exact migration JSON re-parsed through `engineParamsSchema` and the 13-yr case confirmed
duration-sensitive. Corrected output matrix reviewed across beginner→elite, both sexes, older lifter.

## 2026-06-14 — Macrocycle restructure: goal layer + Create engine + Overview + Cycles retrofit (Design v2 backlog, DATA)

Lands the largest reconciliation block: the **macrocycle becomes the single-goal layer** (09
2026-06-13 §3–5 / 2026-06-14). `macro_slots` retired; the create-macrocycle engine (2.3),
Macrocycle Overview (2.2), `+ NEW` chooser (2.1b), and the Cycles list retrofit (2.1) are live,
all feeding off the already-built-and-tested `planMacrocycle`. Vertical slice; `main` deployable.

### Done

- **`DATA` migration `20260614000002_macrocycle_restructure.sql`** (append-only; **applied to the
  hosted project** via Supabase MCP, schema re-read to confirm):
  - `macrocycles` — goal vocabulary migrated (`gain → hypertrophy`, `strength` added; check swapped
    to `hypertrophy/strength/cut/maintain`); new `duration_months`, `meso_length_weeks`,
    `recommended_duration_months`, and the cached planMacrocycle snapshot (`target_low/high`,
    `target_unit`, `target_direction`, `rate_low/high`).
  - `mesocycles` — `position` + `phase` (accumulation/intensification/peak); `unplanned` added to the
    status check; `macro_slot_id` dropped; `(macrocycle_id, position)` index. Any prior slot ordering
    is carried onto the host meso before the table goes.
  - `macro_slots` **dropped** (policy/index/trigger cascade).
  - New **`v_macro_summary`** (security_invoker) — per-macro rollup (meso count, sessions, total
    volume, working sets, first-week start). Security advisor clean (no new lints; view isn't flagged).
- **Engine wiring (no engine change).** `src/lib/queries/macro.ts`: `profileToMacroProfile`
  (training-age from `training_since`), `planForMacro` (live recompute), `createMacrocycleWithMesos`
  (creates the macro + N **unplanned, phased** placeholders), `planUnplannedMeso` (`+ PLAN` flips to
  planned), `getMacroOverview` (+ `buildMacroStats`: est-strength e1RM trend on key lifts by
  frequency, over the shared `v_exercise_history`). `engineGoal` simplified to map the macro goal →
  progression goal (hypertrophy/strength → gain; cut/maintain pass through); slot lookup removed from
  the week N→N+1 job and the meso-stats macro chart.
- **Screens (pixel pass off the v2 mockup, figs 2.1/2.1b/2.2/2.3):**
  - **Create Macrocycle (2.3)** `/cycles/new` — the engine: name, goal (4), duration (3/6/12/custom),
    block length (4/5/6 wk), with a **live target card** (range + per-month rate + meso strip +
    phase legend) recomputed client-side via the pure `planMacrocycle`. Creates `active` macro +
    unplanned mesos, lands on Cycles.
  - **Macrocycle Overview (2.2)** `/cycles/macro/[macroId]` — realistic-target card (range + orange
    `≈ rate / month` + profile chips), mesocycle timeline (phase + status + `+ PLAN` on placeholders),
    macro-stats 2×2 (est strength / total volume / sessions / adherence). No progress-vs-projection
    bar (09 §3).
  - **`+ NEW` chooser (2.1b)** — bottom-sheet picker (Macrocycle → 2.3 · Standalone meso → 2.4) with
    the in-macro `+ PLAN` note.
  - **Cycles list (2.1) retrofit** — macro rows `GOAL <goal> · N MESOCYCLES` + `OVERVIEW ›`, name →
    Overview, chevron expand; meso rows `MESO n · <PHASE> · …`, unplanned `SUGGESTED <phase> · NOT
    PLANNED` + `+ PLAN`; standalone section unchanged. Slot language gone.
  - Standalone meso create (2.4 from-scratch/template) simplified to standalone-only; planner board
    macro-context strip rebuilt from `position`/`phase`.
- Types (`database.ts`): `MacroGoalType`/`MesoPhase`, macrocycle target columns, meso `position`/
  `phase`/`unplanned`, `MacroSlotRow`/`macro_slots` removed, `VMacroSummaryRow` added.
- Tests: **86 passing** (+6) — `macro.test.ts` (profile→engine mapping incl. training-age math,
  phase labels, plan snapshot/recommended-duration fallback); `engineGoal` test reworked to the new
  goal mapping. RLS test updated (goal vocab; slot block → positioned-unplanned-meso gating).

### Recorded deviations

- **Per-month rate cached** in `macrocycles.rate_low/high` — 03 says the rate is "derived, not
  stored". Cached anyway because strength's compounding band is **not** derivable from the total
  range ÷ duration; the Overview still **recomputes the whole plan live** from the profile, so the
  cache is a snapshot/fallback only.
- **Est. strength** (macro stats) is computed in the **query layer** over `v_exercise_history` (the
  e1RM trend is engine-side), not inside `v_macro_summary` SQL — same pattern as Phase 4 progress
  scoring; still one shared view for the raw history.
- **Timeline progress bar** is status-based (done = filled, active = accent, planned = faint), not
  set-precise — exact `setsLogged ÷ planned` per meso would need extra queries; deferred.
- **Overview `FULL ›`** link and a real **EDIT MACROCYCLE** screen are out of this slice — the stats
  card has no detail page yet, and edit shows `SOON`. (Per-meso STATS is the existing 4.x screen.)
- **`v_exercise_overview`** (Exercise page 3.1a) is **not** built here — it belongs to the
  library/stats slice; the shared-views list in CLAUDE notes it as pending.
- Legacy pre-restructure meso (1 row on hosted) has null `position` — the Overview/list fall back to
  row index so it renders cleanly.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (86/86), `npm run build` green. Migration applied
to the hosted project and the schema re-read (new macro columns, meso `position`/`phase`, `macro_slots`
gone, `v_macro_summary` present, legacy `gain` row migrated to `hypertrophy`); security advisors show
no new lints. RLS suite needs a running stack (unchanged); its assertions were updated to the new
shape. No hosted integration smoke this slice (avoided polluting the existing account) — the create/
overview I/O is exercised only through typecheck + the schema check; pure helpers are unit-tested.

### Not done yet / next

- **Plan a mesocycle (2.4) four paths** — copy / template / **meso builder (group priorities)** /
  scratch (copy + builder still stubs).
- **Planner board (2.5) as the single meso surface** — `PLAN | STATS` toggle, partial-completion
  lock, `SAVE CHANGES`; retire the old meso-detail (2.2-old) page.
- **Logging retrofit (1.1/1.2/1.5/1.3)** — Day View sticky header + orange progress bar, Workout
  Complete redesign (re-add session sliders), set delete + completion lock RLS.
- **Library & stats** — `exercises.tracking_type` + per-type set rows, two-axis filter, **Exercise
  page (3.1a/b)** + `v_exercise_overview`, Meso Stats drop the Volume tab.
- **MCP `create_macrocycle` / `get_macro_summary`** (05) once the connector phase lands.

## 2026-06-14 — Macrocycle planning engine + e1RM metric (Design v2 backlog, ENGINE)

First code landing of the **Design v2 reconciliation backlog**: the pure engine foundation the new
macrocycle goal layer (Create Macrocycle 2.3 / Overview 2.2) sits on, plus the §1 e1RM definition.
Pure, fully tested, no UI yet — the screens consume these in the next slice.

### Done

- **`planMacrocycle()`** (`src/lib/engine/macro.ts`, pure & parameterized per 04 §Macrocycle
  planning, defaults from 10 §5): ingests the full profile (sex, age, bodyweight+unit, height,
  experience level, training years) and a goal (hypertrophy / strength / cut / maintain), returns
  `{ target, perMonthRate, recommendedDurationMonths, durationMonths, mesoCount, phases, estimate }`.
  - **Hypertrophy** — %BW/month rate band × duration × **sex factor** (0.5 female absolute) ×
    **age taper**, capped by a **career-potential** ceiling that decays with training age
    (`1 − e^(−years/τ)` × `career_cap_lb`).
  - **Strength** — monthly-compounding % on key lifts, capped per experience.
  - **Cut** — %BW/week scaled by **leanness via BMI proxy** (high-bf / average / lean bands),
    presented as a loss.
  - **Maintain** — no weight target (recomposition framing).
  - **Recommended timeframe** — months to reach a meaningful target at the profile's rate, clamped;
    backstops an omitted duration. `mesoCount = floor(months × 4.33 / mesoLength)`; **phases** spread
    accumulate → intensify → peak (`spreadPhases`, parameterized by `phase_plan`).
  - Every target carries an `estimate: true` flag + an "(estimate, …)" rationale (10 §9 honesty
    guardrail — no progress bar, conservative end).
- **e1RM** (`src/lib/engine/e1rm.ts`, 10 §1): `estimateE1rm(weight, reps, rir, params)` →
  effective-reps (`reps + rir·offset`), **averaged Epley/Brzycki** (Epley-only fallback past
  Brzycki's valid range), and a **confidence band** (high / moderate / low) that degrades with
  effective reps / RIR and is `low` whenever RIR is unreported.
- **Params v3** (`engine_params`): new `e1rm`, `macro_target`, `phase_plan`, `key_lifts` blocks added
  to `engineParamsSchema` with `.default()` (so the active v2 row still parsed) and seeded as an
  explicit, admin-tunable **version 3** via append-only migration `20260614000001_engine_params_v3.sql`
  (v2 deactivated, kept for replay). Mirrored in `params.ts` defaults + `seed.sql`; **applied to the
  hosted project** (v3 active, parses). RLS test updated to expect active version 3.
- Tests: **80 passing** (+18) — 12 golden/property macro plans (per-goal goldens, monotonic-in-
  duration, ~½ female absolute, experience scaling, perMonthRate×duration≈target, `spreadPhases`) +
  6 e1RM (Epley/Brzycki average, confidence bands, Brzycki fallback, null-RIR, non-working input).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (80/80), `npm run build` green. Migration applied
to the hosted project via the Supabase MCP and re-read (v3 active, `macro_target`/`phase_plan`
present and well-formed). RLS suite needs a running stack (unchanged from prior sessions); the
version assertion was updated to 3.

### Not done yet / next

- The **DATA macrocycle restructure** (retire `macro_slots`; `macrocycles.goal_type` /
  `duration_months` / `meso_length_weeks` / derived targets; `mesocycles.position` / `phase` /
  `unplanned`) — the migration that the Cycles UI net-new screens depend on. `planMacrocycle` is
  ready to feed it.
- **Cycles UI net-new** (2.1 retrofit, 2.1b chooser, 2.2 Overview, 2.3 Create Macrocycle engine):
  wire `planMacrocycle` into the create flow + Overview target card (live recompute on goal/duration).
- **Metric-defaults remainder**: wire e1RM into the stats views/exercise page; seed volume landmarks
  / autoreg bands / adherence with per-metric golden tests.

## 2026-06-14 — Metrics & engine-params research lock-down (no code)

Research + documentation pass turning every mockup metric into a precise, research-backed
definition with default `engine_params`. Ran a multi-source sports-science review (e1RM accuracy,
rate-of-gain models, volume landmarks, subjective-feedback validity, progression/deload, push/pull
balance) with primary citations. **No code changed.**

### Done

- **New [10-metrics-spec.md](10-metrics-spec.md)** — authoritative metric/param doc: e1RM
  (effective-reps = reps+RIR, avg Epley/Brzycki, confidence weighting), fractional volume counting
  (1.0/0.5), MEV/MAV/MRV landmarks, workload/pump/joint-pain → set-count autoregulation, RIR ramp,
  increments/regression/deload, the profile-personalized macrocycle target + recommended-timeframe
  engine, key-lifts-by-frequency, stats rollups (total volume, adherence, progress score, advisory
  push:pull), consolidated default `engine_params`, and §9 honesty guardrails.
- **Decisions locked (user, 2026-06-14):** (1) macrocycle target personalized from the full profile
  + engine recommends timeframe; shown as an estimate, no progress bar; (2) **session feedback
  sliders restored** to a redesigned Workout Complete sheet (mockup dropped them in error); (3)
  fractional 1.0/0.5 volume counting; (4) key lifts = most-logged (by frequency). Defaults: female
  absolute-target ×0.5 (relative %s equal); pump = secondary nudge only.
- Threaded through 01 (F2/F3), 03 (`workout_feedback` kept + redesigned sheet; macro recommended
  duration; fractional counting), 04 (`planMacrocycle` profile inputs + recommend-timeframe; metric
  pointers), 05, 07 (backlog: Complete redesign, profile-driven target, params seeding), 08
  (decisions log), 09 (new 2026-06-14 session-4 entry), CLAUDE.md (10 in read-first list).

### Recorded deviation

- **Workout Complete (1.5) re-adds session sliders** — authorized deviation from the mockup, which
  dropped overall fatigue / effort / performance. Sheet = counts + the three session sliders (1.4
  slider UI) + paragraph notes + `NEXT WORKOUT →`; autoregulation panel stays removed.

### Not done yet / next

- Implement the metrics/params per 10 (engine + migrations + the Complete-sheet redesign), in the
  07 reconciliation backlog. Hard rules in force; engine changes need golden fixtures.

## 2026-06-14 — Design v2 handoff: docs integration (no code)

Documentation-only pass folding the **2026-06-13/14 design sessions** into the spec docs ahead of
implementation. New design assets imported and every doc reconciled; **no schema, engine, or UI
code changed** — the implementation lands in future sessions per the new reconciliation backlog.

### Done

- **Imported design artifacts** into `docs/design/`: updated source-of-truth mockup
  `workout - App Screens v2.dc.html`; new interactive prototype `WorkoutApp.dc.html` +
  `workout - Interactive Prototype.dc.html`; session-3 render screenshots under
  `screenshots/v2-session3/`; and the new **`docs/09-design-changelog.md`** (authoritative for its
  dated deltas).
- **08-design-decisions** — added the 09 amendment pointer; reconciled the §5 figure index
  (Section 02 renumbered, `+ NEW` chooser 2.1b, Macrocycle Overview 2.2, Create Macrocycle 2.3,
  planner board 2.5; Exercise page 3.1a/b/c; Volume stats tab removed → Balance 4.1 / Performance
  4.2); repointed stats to the planner `STATS` toggle; logged new decisions (macrocycle goal layer,
  realistic target, plan-a-meso paths, exercise tracking type, simplified complete sheet).
- **01-product-spec** — macrocycle as a single-goal layer (hypertrophy/strength/cut/maintain) with
  the create engine + realistic target; F2 cycle flow (chooser, 4-path plan, planner lock); F3
  complete sheet simplified; F5 tracking type + two-axis filter + Exercise page; F7 stats restructure.
- **03-data-model** — `DATA` target shape: `macrocycles` goal vocab + `duration_months` /
  `meso_length_weeks` / derived target columns; **retire `macro_slots`** → `mesocycles.position` +
  `phase` + `unplanned` status; `exercises.tracking_type`; `logged_sets` nullable weight/reps +
  `duration_seconds`; new views `v_exercise_overview` / `v_macro_summary`; week→day completion +
  `exercises(equipment_type)` index. Marked as migration deltas (not yet migrated).
- **04-feedback-engine** — goal vocab (gain→hypertrophy, +strength) + phase modulation; new pure
  `planMacrocycle()` (meso count, suggested phases, realistic target + per-month rate from
  goal/duration/block-length/profile); module layout + golden/property test requirements.
- **05-mcp-connector** — `create_macrocycle` (engine-computed) + `get_macro_summary`; goal-update
  tool reworked; new views added to the data-shape contract.
- **06-design-system** — addendum for the SetRow density, locked Day View header + progress bar,
  two-axis filter, `PLAN | STATS` toggle, and the exploratory dark theme (→ 09 §5a).
- **07-implementation-plan** — added the **Design v2 reconciliation backlog** (retrofit/net-new
  mapped to Phases 2/3/5 with `DATA`/`ENGINE` tags) for future execution.
- **CLAUDE.md** — 09 added to the read-first list and pixel-fidelity rule; mockup-over-prototype
  source-of-truth note; shared-views list extended.

### Not done yet / next

- Everything in the **07 reconciliation backlog** — the actual migrations, engine functions, and
  screen retrofits. Execute in future sessions, hard rules in force (append-only migration + RLS +
  tests per PR; engine changes need fixtures; pixel fidelity to the mockup, checking 09 first).
- **Resolved (2026-06-14):** the set menu (1.3) `Delete set` is allowed for **any set while the
  workout is `in_progress`** (not just unlogged). **Completing a workout locks it** — sets/feedback
  become immutable — since completion runs the engine's next-week generation and we don't want to
  recompute the chain. RLS gates `logged_sets`/`exercise_feedback` `update`/`delete` on the parent
  workout being `in_progress`; this refines hard rule #5 (append-only *after* completion). Edit-meso
  already can't touch completed weeks (planner lock). Captured in 03/07/08.
- Note: the interactive prototype is a **functional-testing** artifact and is not pixel-perfect —
  the **mockup is the source of truth** for every detail (already enforced in CLAUDE.md / 09).

## 2026-06-13 — Phase 5: meso stats, library, templates & sharing

### Done

**Phase 5 — meso stats, library & templates** (complete except a from-scratch template editor, which is not planned for v1)

- **Meso stats (figs 4.1–4.3)** at `/cycles/meso/[id]/stats` — one screen, three views via the segmented control, everything off the shared views (one definition of progress):
  - *Volume:* sets-per-group-per-week matrix from `v_meso_week_sets` — closed weeks show logged, the active week shows logged-so-far (orange `● W#` + `N OF M PLANNED SETS` footer), generated future weeks show the autoregulated plan, ungenerated weeks fall back to the planner baseline; TOTAL row; `W#–W# = AUTOREGULATED PLAN` caption
  - *Balance:* PUSH/PULL/LEGS cards (avg planned sets/wk; classification over the seeded vocabulary, abs excluded), per-muscle bars, BALANCE CHECK callout (push:pull ratio + lowest-volume group)
  - *Performance:* top-set-by-week grid for the meso's three biggest lifts (orange cell = in-progress week, `+N LB VS W1` badge), e1RM-across-macro bars for the lead lift (filled past / accent current / dashed future slots), PRS THIS MESO (ALL-TIME = heavier top weight than all pre-meso history; REP PR = better e1RM at or below the old top weight; lifts with no prior history can't PR)
  - Entered from meso detail, the 1.5 complete sheet, and the **Workout-tab resting state**, which now renders the last completed meso's full 4.1 view (08 §2)
- **Exercises tab (3.1) build-out:** rows link to an exercise detail page (description, primary/secondary groups + equipment, last performed, all-time best, pinned note, inline 3.2 history); `+ NEW` creates custom exercises (name, equipment, primary + secondary groups, description/notes; zod-validated)
- **Exercise history (3.2) shared everywhere:** query moved to `src/lib/queries/history.ts` with one presentational component; used by the day-view menu, the exercise detail page, and the **picker (2.6)**, whose selected card now shows the last-session line (`115 lb × 13, 12 · MESO — W4·D1`) and the underlined `FULL HISTORY ›` sheet per the mockup
- **Templates (3.3):** live tab (search, emphasis label, `N D/WK` + gender chips) → template detail page → `START A MESO FROM THIS` (2.7 create sheet with `FROM TEMPLATE — NAME` subtitle, then the planner board opens prefilled — days, groups, slot fills; **excluded exercises never carry over**, their slots stay open); `SAVE AS TEMPLATE` on meso detail round-trips the full `template_day_groups` shape; plan-a-meso (2.3) option 02 is live via a slot-aware template picker
- **Sharing (F5/F6):** one-time share codes (8 chars, no 0/O/1/I) for custom exercises, templates, and mesocycles — SHARE row on each detail page, redeem form on the Templates tab. Copy-on-accept with provenance ids (`source_exercise_id`/`source_template_id`) and per-grantee dedupe; custom exercises referenced by shared templates/mesos are copied (and deduped) too; shared mesos copy as **planned standalone structure** — the owner's loads don't carry, the engine seeds the grantee's numbers at start. Acceptance reads run on the service client (grantee can't read the owner's rows) with every write explicitly scoped to the redeeming user
- **Seed polish:** stock templates now seed `template_day_groups` (groups derived from each exercise's primary muscle group, slots linked); idempotent backfill added to the seed and **applied to the hosted project** (64 groups, 89/89 exercises linked)

**Phase 3 leftover — replace exercise (1.2 menu):** live picker pre-filtered to the slot's muscle group; blocked once sets are logged (row shows a LOGGED state); the prescription reseeds from the user's all-time best on the incoming movement with a clinical rationale line

### Recorded deviations

- **Templates `+ NEW` stays dimmed** and the 3.3 `CONTINUE EDITING DRAFT ›` row is omitted: templates come from save-meso-as-template (and Phase 6's MCP `create_template`); a from-scratch template editor + draft model is out of v1 scope
- **Share/redeem UI is not mocked** — built in the house style (bordered rows, redeem input on the Templates tab). Codes are single-redemption: mint again to share again
- **Volume view, ungenerated weeks:** workouts generate week-by-week, so far-future weeks show the planner baseline under the mockup's `AUTOREGULATED PLAN` caption until the engine generates them; ungenerated **deload** weeks show `—` (the engine sizes deload sets at generation)
- The performance macro chart labels itself `ACROSS MACRO — {LIFT} EST. 1RM` (no macro short-code; macros have names, not codes)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (62/62 — 14 new unit tests over the volume matrix, balance copy, key-lift grid, PR detection, emphasis vocabulary, share-code format), `npm run build` green. Hosted-DB smoke through the real modules: signup → stock template detail carries the backfilled groups-first shape → exclusion added → meso created from template (board prefilled, excluded movement's slot left open, slot counts intact) → saved back as a template (groups round-trip) → meso started → 2 sets logged → `getMesoStats` (current-week volume, key-lift cell, balance note), `getExerciseHistory` (W1·D1 entry) → custom exercise share code minted (format + dedupe on re-mint, stock objects refused). Smoke user + data deleted after; `acceptShareCode` itself isn't integration-tested (needs the service key, not available in this environment) — its helpers are unit-tested and all writes are user-scoped

### Not done yet / next

1. Phase 3 leftover: Playwright e2e for the logging loop (still no browser runtime in this environment)
2. Phase 6 — MCP connector at `/api/mcp`: OAuth bridge, read tools over the same views, draft write tools with `mcp_write_audit`, admin param/replay tools (`engine_decisions` + versioned params are flowing)
3. Phase 7 — production hardening (RLS/advisor audit, rate limiting, Sentry, accessibility pass, CSV export + account deletion, final design QA)
4. In-browser pixel QA of the new screens (stats, exercise detail, templates) against `docs/design/screenshots/`

## 2026-06-13 — Phase 4: progression engine alignment & wiring

### Done

**Phase 4 — engine re-alignment + week N→N+1 generation** (complete)

- **Feedback re-alignment:** engine inputs now take the redesigned 1.4 signals — joint pain 0–3 per exercise, pump and workload 0–10 per muscle group. The workload slider anchors set counts ("just right" = 5): `workload ≥ workload_high (8)` pulls a set; `workload ≤ workload_low (3)` with pump ≥ `set_add_pump_min (6)` under the gain goal adds one up to the group ceiling; low pump at the right dose flags exercise selection in the rationale instead of touching load. Strain/fatigue thresholds removed
- **Per-equipment per-unit increments:** `engine_params` v2 expresses increment + rounding per equipment in **both units** (`{ kg, lb }`) — lb users get real plate math (barbell +5 lb, not 2.5 kg × factor) — with first-class **bands (10 lb / 5 kg)** and **kettlebell (9 lb / 4 kg)** steps; the `engineEquipment` shim in generation is gone. Rationale copy now reads "+5 lb" (mockup voice)
- **Params v2** shipped as append-only migration `20260613000001_engine_params_v2.sql` (v1 deactivated and kept for replay; single-active index holds), mirrored in `params.ts` defaults and seed; **applied to the hosted project**; RLS test updated to expect v2 active
- **Week N→N+1 generation job** (`src/lib/queries/progression.ts`): on workout completion, `advanceWeekAfterWorkout` builds the same day of week N+1 from week-N actuals + feedback (group-scoped pump/workload resolved from whichever exercise closed the group, weekly group set totals, meso peak per exercise for deload sizing, goal from macro slot → macro → gain for standalone, peak slots train as gain), inserts the workout + prescriptions with rationale strings, and writes one `engine_decisions` row per exercise (inputs/output/params version) via the **service client** with explicit user scoping. Idempotent per day; on week close it backfills skipped days (prescriptions carry forward) and activates microcycle N+1; the final week closes the meso. `catchUpProgression` re-runs the job on first open of the Workout tab if completion-time generation failed
- **Autoregulation summary composer** (`src/lib/engine/summary.ts`, pure + unit-tested): the 1.5 copy — "Feedback recorded. W3 targets recalculated — Hack Squat +5 lb, Cable Pushdown +1 set. Ramp moves to 1 RIR next week.", deload and meso-close variants, clause cap with "and N more"
- **Complete sheet wired** (fig 1.5): `COMPLETE W2·D1` completes + recalculates in one action and the AUTOREGULATION callout swaps to the real engine summary; the primary becomes `NEXT — W2·D2` (next sibling, or W(N+1)·D1 once the week closes; `DONE` after the meso)
- **Progress scoring v1:** `getMesoProgressScores` (`src/lib/queries/stats.ts`) — per-exercise e1RM trend across a meso from `v_exercise_history` via `scoreProgress`, ready for Phase 5 stats and MCP
- Tests: 48 passing — reworked golden meso/prescribe/bounds fixtures to the new feedback shape, new cases for workload-anchored volume, pump corroboration, selection flag, kettlebell/bands steps, summary composer, and pure progression helpers (`buildEngineInputs`, `weeklySetsByGroup`, `peakByExercise`, `engineGoal`)

### Recorded deviations

- **Complete sheet is two-phase** (confirm → recalculated state): the 1.5 mockup shows the post-completion state; a confirm step is kept so opening the sheet can't silently mark untouched exercises skipped. After confirming, the sheet matches the mockup (real summary + NEXT button)
- Week-1 seeding decisions (from `startMeso`) are not yet audited to `engine_decisions` — the rationale lives on `workout_exercises.notes`; folding seeding into the decisions audit is noted for Phase 6 (replay wants it)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (48/48), `npm run build` green. Migration applied to the hosted project (v2 active, v1 kept inactive). Hosted-DB integration smoke through the real modules: signup → standalone 4-week meso (2 exercises, one group) → start (hosted params v2 parse) → 6 clean sets logged → group feedback (pump 7, workload 2) → complete → **advance**: week-2 workout generated with +5 lb on barbell, +1 set group-wide, RIR 3→2, full rationale strings, microcycle 2 activated, summary exactly in the mockup voice (`engine_decisions` insert shimmed in the smoke — no service key in this environment; covered by RLS tests). Smoke user deleted afterwards (and the leftover `smoke-test-claude@example.com` from the earlier session cleaned up too)

### Not done yet / next

1. Phase 3 leftover: Playwright e2e for the logging loop (still no browser runtime in this environment); exercise-menu replace/move
2. Phase 5 — meso stats screens (figs 4.1–4.3) off the shared views, exercises tab build-out, history sheet integration in picker/menu, templates round-trip, sharing
3. Phase 6 — MCP connector incl. admin param/replay tools (`engine_decisions` + versioned params are now flowing, so the decision inspector and replay harness have real data)

## 2026-06-12 — Design-fidelity pass: every screen transcribed from the v2 mockup HTML

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
