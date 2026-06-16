# 11 — Workout Engine: Current State & Reps↔Weight↔RIR Linkage (review doc)

Status: **explainer + gap analysis, for review.** This document describes, in
detail, exactly how the workout engine currently decides weights / reps / sets,
*when* those decisions run, and what the live logging screen actually shows. It
then does a gap analysis against three requested behaviors and proposes a
concrete, spec-compliant design for each. It does **not** itself change engine
behavior — it is the artifact to review before we build.

It is descriptive of code as of this branch; the authoritative *intent* lives in
[04-feedback-engine.md](04-feedback-engine.md) (logic) and
[10-metrics-spec.md](10-metrics-spec.md) (numbers). Where this doc and those
disagree, those win and this doc is stale.

---

## 0. TL;DR

- There are **two pure engines**: the **per-set progression engine**
  (`prescribe()`) that writes next week's targets, and the **macro planner**
  (`planMacrocycle()`) that sets long-term goal ranges. This doc is about the
  first one.
- **The progression engine runs once per workout, *after* you finish it** — in
  `advanceWeekAfterWorkout()` — to generate **next week's** prescriptions. It
  does **not** run while you are logging.
- **While you log, the screen is static.** Each set row seeds its weight/reps
  from the stored prescription (or the last logged set) and **never
  recalculates**. If you change the weight on a set, the reps suggestion does
  **not** move, and nothing estimates what RIR that new weight implies.
- So requested behavior #1 (weight↔reps linked to hit target RIR from history)
  **does not exist today**. The math to do it (e1RM with effective reps) exists
  but is only used for stats, not for live prescription.
- Requested behavior #3 (auto-match weight across an exercise's unlogged sets)
  also does not exist; there is no such setting and no propagation.

---

## 1. The two engines and where they live

```
src/lib/engine/
├── index.ts            # prescribe(), seedMeso(), scoreProgress(), re-exports
├── e1rm.ts             # estimateE1rm() — effective-reps Epley/Brzycki average + confidence
├── macro.ts            # planMacrocycle() — long-term target range / meso count / phases
├── params.ts           # engineParamsSchema + DEFAULT_ENGINE_PARAMS (zod-validated tunables)
├── types.ts            # EngineInputs / Prescription (zod) + LoggedSetInput
├── summary.ts          # human-readable autoregulation / meso-complete copy
└── rules/
    ├── rir.ts          # rirRamp() — the meso's per-week target-RIR schedule
    ├── performance.ts  # assessPerformance() — "anchor on actuals", outcome classification
    ├── feedback.ts     # modulateFromFeedback() — pain gate / workload→sets / pump / session dampen
    ├── deload.ts       # prescribeDeload() — deload week sizing
    └── rounding.ts     # roundToStep() / incrementFor() — per-equipment plate math
```

Everything is **pure** (hard rule #3): no I/O, no `Date.now()`, no randomness.
All tunables come from the active `engine_params` row, validated by
`engineParamsSchema`. Each prescription is persisted to `engine_decisions` with
full inputs/output/rationale/params-version for replay (audit trail).

The two entry points:

| Engine | Function | Purpose | Inputs |
|---|---|---|---|
| Per-set progression | `prescribe(inputs, params)` | week *N* actuals → week *N+1* weight/reps/sets/RIR + rationale | last prescription, what was actually logged, exercise + session feedback, next week's target RIR, goal, profile |
| Macro planner | `planMacrocycle(input, params)` | long-term goal range + recommended duration + meso/phase layout | full profile + goal + duration |

---

## 2. WHEN the progression engine runs (the timing model)

This is the single most important thing to understand, and the crux of request
#1.

The engine is **not** consulted during logging. The flow is:

1. **A week is generated up front, as stored rows.** When you complete a
   workout, `advanceWeekAfterWorkout()`
   (`src/lib/queries/progression.ts`) runs `prescribe()` per exercise and
   **inserts the next week's `workout_exercises`** with `prescribed_weight`,
   `prescribed_reps`, `prescribed_sets`, `target_rir`, and a `notes` rationale.
   Triggered from `completeWorkoutAction()` (`src/app/(app)/log/actions.ts`).
2. **You log against those stored numbers.** The Day View
   (`src/app/(app)/log/[workoutId]/DayView.tsx`) reads the stored
   `workout_exercises` / `logged_sets` and renders the set grid. It calls
   `logSetAction` / `amendSetAction` to write `logged_sets`. **No engine call
   happens here.**
3. **On completion, the cycle repeats** for the following week.

Consequence: the prescription you see for *this* week was computed *last* week
from *last week's* performance. Editing a weight mid-set has no engine in the
loop to respond to it — the reps field is just a controlled input seeded once.

### What the live set row actually does (`SetRow` in `DayView.tsx`)

```
initialWeight = logged?.weight ?? lastLogged?.weight ?? prescribed_weight ?? 0
initialReps   = logged?.reps   ?? prescribed_reps    ?? lastLogged?.reps   ?? 8
```

- `weight` and `reps` are local `useState` strings, re-synced only when the
  *server* row for that set changes (`logged?.id/.weight/.reps`).
- Editing the weight input sets `edited.current = true` and changes only the
  weight string. **The reps string is untouched.** There is no estimator.
- `targetRir` is shown once in the header (`TARGET n RIR`) for the whole day;
  it is never tied to the individual row's weight/reps, and `rir_reported` is
  always written as `null` from this screen (`logSetAction(..., rir_reported:
  null)`), so the user isn't even capturing per-set RIR during logging.

So today the "suggested reps" is a frozen copy of last week's plan — it does not
adapt to the weight you actually load.

---

## 3. `prescribe()` — the full decision flow

Source: `src/lib/engine/index.ts`. Reading order matches the code.

### 3.0 Parse & validate
Inputs and params are re-parsed with zod (`engineInputsSchema`,
`engineParamsSchema`) so a malformed call or a bad params row cannot run.

### 3.1 Deload short-circuit
If `inputs.week.isDeload`, return `prescribeDeload()` immediately and skip
everything else. Deload = `deload.load_pct` (default 0.55) × the meso's **peak**
load, `deload.set_pct` (0.5) × peak sets (floored at `min_sets`), at
`deload.target_rir` (4). Peak comes from `weekPeak` (heaviest prescription in
the meso so far, computed by `peakByExercise()`), falling back to `previous` /
`initial`.

### 3.2 Anchor on actuals (`assessPerformance`, `rules/performance.ts`)
- Filter to working sets (drop warm-ups). If none, or no `previous`
  prescription → outcome `no_data`.
- **Best set** = the working set with the highest weight (ties broken by reps).
  This becomes `bestWeight` / `bestReps`, the anchor for next week — *what you
  actually did*, not what was prescribed.
- **Outcome classification** vs the previous prescription's reps + target RIR:
  - `overTarget` = how far the reported RIR fell *below* target (harder than
    asked); `0` if RIR ≥ target or unreported.
  - `repDelta` = best reps − prescribed reps.
  - `beat`: more reps than prescribed *and* not below target RIR.
  - `met`: hit prescribed reps and not below target RIR.
  - `small_miss`: hit/over reps but under target RIR (harder than asked), **or**
    missed reps by ≤ `small_miss_reps` (default 2).
  - `big_miss`: missed reps by more than `small_miss_reps`.
  - If the previous prescription had no rep target, it's treated as `met`.
  > Note: RIR here is whatever was logged in `rir_reported`. The live logging
  > screen writes `null`, so unless RIR is captured elsewhere, `overTarget` is
  > usually 0 and the classification is driven by reps alone.

### 3.3 Cold start (`no_data`)
Use `previous` if present, else `initial` plan defaults, else `min_sets`. Round
the weight, keep reps, clamp sets, set the week's target RIR, and explain it as
a starting prescription. (This is also the de-facto week-1 path.)

### 3.4 Feedback modulation (`modulateFromFeedback`, `rules/feedback.ts`)
Computed *before* the load decision because the pain gate caps increases.
Produces `{ painGated, setDelta, sessionDampened, notes }`:
- **Pain gate**: `jointPain ≥ pain_gate` (default 2) → `painGated = true`; load
  increases are blocked downstream.
- **Workload → set count** (workload 0–10, 5 = "just right"):
  - `workload ≥ workload_high` (8) → `setDelta = -1` (cut a set).
  - `workload ≤ workload_low` (3) **and** pump ≥ `set_add_pump_min` (6) **and**
    goal = `gain` **and** under the muscle-group weekly ceiling
    (`mg_set_ceiling`, 20) → `setDelta = +1` (add a set).
  - `pump ≤ pump_low` (2) at on-target workload → note only ("consider a
    different exercise"); no load/set change.
- **Session dampener**: `overall_fatigue ≥ session_fatigue_dampen_threshold`
  (3) **or** `performance_rating ≤ session_performance_dampen_threshold` (1) →
  `sessionDampened = true`; suppresses increases.

### 3.5 RIR step
`rirStepped` = next week's target RIR is lower than last week's. Dropping the
target RIR at the same load is *itself* progression; the code notes this and, in
hold cases, frames the RIR drop as the progression.

### 3.6 Performance delta + goal bias → weight/reps/sets
`style = progression_style[goalType]` (defaults: `gain → load_first`,
`cut → hold`, `maintain → hold`). `increment = incrementFor(equipment,
experience, units)` = per-equipment step × experience scale.

- **`met` or `beat`:**
  - If we want load (`style === load_first` **or** `beat`) **and** not
    `painGated` **and** not `sessionDampened` → `weight = bestWeight +
    increment`.
  - Else if `style === reps_first` and not dampened → `reps = bestReps + 1`.
  - Else hold the weight (gated/dampened, or a `hold` goal).
- **`small_miss`:** hold weight (repeat the load).
- **`big_miss`:** `weight = bestWeight × regression_pct` (default 0.9 ⇒ −10%).

### 3.7 Hard bounds & rounding
- If `painGated` and the computed weight exceeds `bestWeight`, clamp to
  `bestWeight` (never prescribe above what was handled under pain).
- `sets = clamp(sets + setDelta, [min_sets, max_sets_per_exercise])`.
- `weight = roundToStep(weight, equipment, units)` — round to the loadable plate
  step. If gated/dampened and rounding pushed it above `bestWeight`, clamp back.
- `targetRir = inputs.week.targetRir`.
- `rationale` = capitalized, joined human-readable notes (this is the `notes`
  string shown in the exercise menu and feeds the 1.5 summary copy).

### 3.8 Meso seeding (`seedMeso`)
First week of a new meso: start from the prior meso's **peak**, backed off by
`meso_seed_backoff_pct` (0.925 ⇒ −7.5%) at the new start RIR; or from `initial`
plan defaults when there's no history.

---

## 4. e1RM model (the math we *have* but don't use for prescribing)

Source: `src/lib/engine/e1rm.ts`, spec [10 §1](10-metrics-spec.md).

```
effectiveReps = reps + rir × e1rm.rir_offset        // rir_offset default 1.0
e1RM          = average( Epley, Brzycki ) over effectiveReps
  Epley:   weight × (1 + effectiveReps/30)
  Brzycki: weight × 36 / (37 − effectiveReps)        // falls back to Epley as effReps→37
confidence    = high | moderate | low                // degrades with effective reps / RIR
```

This is **the key insight for request #1**: e1RM is a model linking
`weight × reps × RIR`. Today it is only consumed by stats views
(`v_exercise_*`, exercise page, PRs). It is **not** used to suggest reps during
logging. Inverting it is exactly what's needed to make weight and reps move
together toward a target RIR (see §6).

---

## 5. The RIR ramp, goal mapping, and macro planner (supporting context)

- **RIR ramp** (`rules/rir.ts`): linear from `rirStart` down to `rirEnd` across
  the working weeks, peak on the last working week, then an optional deload week
  at `deload.target_rir`. This is what fills each microcycle's `target_rir`,
  which becomes the per-week intensity anchor `prescribe()` reads.
- **Goal mapping** (`engineGoal()` in `progression.ts`): the macrocycle goal
  (`hypertrophy | strength | cut | maintain`) is mapped to the per-set engine
  goal (`gain | cut | maintain`) — hypertrophy & strength both → `gain`.
  Standalone mesos default to `gain`.
- **Macro planner** (`macro.ts`, [10 §5](10-metrics-spec.md)): pure function for
  the realistic-target range, recommended duration, meso count, and phase
  spread. Independent of the per-set loop; not central to requests #1/#3.

---

## 6. Gap analysis & design proposal

### Request #1 — Weight ⇄ reps linked to hit target RIR, from history

**Gap.** No live linkage. Reps are a frozen copy of `prescribed_reps`; changing
the weight does nothing. RIR isn't captured per set during logging. The e1RM
model that could power this is unused at log time.

**Proposed behavior.** On the live set row, when the user changes the weight
(or on first render for the "next" set), estimate the reps that hit the row's
target RIR for *this* exercise given *this* user's strength, using the e1RM
relationship inverted:

```
// pure helper, e.g. src/lib/engine/reps.ts
predictRepsAtWeight(e1rm, weight, targetRir, params) -> reps
  // 1. effectiveReps such that e1RM(weight, effectiveReps) == e1rm
  //    invert the averaged Epley/Brzycki (closed-form per-formula, then average,
  //    or a few Newton steps on the averaged curve — both pure & deterministic)
  // 2. reps = round(effectiveReps − targetRir × params.e1rm.rir_offset)
  // 3. clamp to >= 1
```

Where the `e1rm` anchor comes from (in priority order, computed server-side and
passed in — engine stays pure):
1. The exercise's **recent best e1RM** from `logged_sets`, preferring
   high/moderate-confidence sets (reuse `estimateE1rm` / `v_exercise_prs`).
2. If no history: derive the anchor from the **current prescription itself**
   (`prescribed_weight × prescribed_reps` at `target_rir`), so the first
   suggestion equals the plan and only *changes* react.
3. Inverse direction too: if the user instead edits **reps**, we can surface the
   *implied RIR* ("≈1 RIR at this weight") as a read-only hint.

**UX rules.**
- Recompute reps only while the user hasn't manually overridden reps for that
  row (respect an explicit reps edit; an "estimated" affordance can re-enable
  it). Returning the weight to prescribed returns reps to the prescribed value.
- Mark engine-filled reps as an estimate (per [10 §9](10-metrics-spec.md)
  honesty guardrail — e1RM is a trend, not a to-the-pound claim), low confidence
  at high effective reps.

**Where it touches:**
- New pure `src/lib/engine/reps.ts` (`predictRepsAtWeight`,
  `impliedRirAtReps`), exported from `engine/index.ts`, params from
  `engine_params.e1rm` (already present). **Golden + property tests required**
  (hard rule #3): forward∘inverse round-trips, monotonicity (heavier ⇒ fewer
  reps), clamps.
- `getWorkoutDetail()` / a small query to attach a per-exercise e1RM anchor +
  confidence to each `LoggedExercise`.
- `SetRow` in `DayView.tsx` recomputes the reps default from the helper as
  weight changes.

**Open design questions for you:**
- Anchor = all-time best e1RM, or a recency-weighted/last-meso e1RM (the latter
  tracks current form better, the former is more stable)?
- Should we also start **capturing per-set RIR** at log time (a third cell or a
  quick chip)? Without it, week-to-week `assessPerformance` can't see "harder
  than asked," and the live estimate can't be validated against reality.
- Round predicted reps to integer (simplest) vs show a small range
  (e.g. "8–9")?

### Request #2 — "Explain the current engine" (this document)

Delivered: §§1–5 above describe the full current decision flow and the timing
model. The chat reply summarizes it.

### Request #3 — Setting: auto-match weight across an exercise's unlogged sets

**Gap.** No such setting and no propagation. Each set is independent; the "next"
row falls back to the last logged set's weight only as a *default*, and future
rows show `prescribed_weight`.

**Proposed design.**
- **Schema:** append-only migration adding `profiles.auto_match_weights boolean
  not null default false`. RLS on `profiles` already covers it (no new policy
  needed — confirm in the migration's RLS test per hard rule #1). Add to
  `ProfileRow`, `updateProfile`'s allowed patch keys, and regenerate DB types.
- **Setting UI:** a toggle in the More tab settings list
  (`src/app/(app)/more/page.tsx`, mirroring `UnitsToggle`) — copy e.g.
  **"Match weight across sets"**, lowercase/tracked-caps per the design system.
- **Behavior:** when a set's weight is logged or amended and the setting is on,
  propagate that weight to all **unlogged** sets of the same exercise in the
  current workout (future + next slots; never touch logged/skipped history —
  hard rule #5 / append-only). Cleanest implementation: update
  `workout_exercises.prescribed_weight` for that exercise, which already drives
  both the future rows' static display and the next row's `initialWeight`. With
  request #1 in place, each row's reps re-derive from the new weight at its
  target RIR automatically.
- **Interaction with #1:** auto-match sets the *weight*; the reps predictor sets
  the *reps* per row. They compose: match the weight across sets, predict reps
  per set from the shared weight + target RIR.

**Where it touches:** migration + types; `more/page.tsx` + a small toggle
component + an action calling `updateProfile`; `logSetAction`/`amendSetAction`
(or a dedicated propagation step) in `src/app/(app)/log/actions.ts`, gated on the
profile flag; optionally optimistic propagation in `DayView` for snappiness.

---

## 7. Constraints any implementation must respect

- **Engine purity (hard rule #3):** the reps predictor must be a pure function
  in `src/lib/engine/`, all tunables from `engine_params`, with unit/golden
  tests for every behavior change. No I/O, no clock, no randomness.
- **Append-only history (hard rule #5):** auto-match and any reps estimate may
  change *unlogged* prescriptions only; logged sets are never rewritten by the
  engine.
- **Honesty guardrails ([10 §9](10-metrics-spec.md)):** present predicted reps /
  implied RIR as estimates, down-weighted at high effective reps; never a
  precise promise.
- **RLS in the same migration (hard rule #1):** the `auto_match_weights` column
  ships with its RLS test.
- **Design discipline (hard rule #7/#8):** the new toggle and any "estimated"
  affordance follow the light-ledger system and the mockups; record any
  authorized deviation in `docs/PROGRESS.md`.
</content>
</invoke>
