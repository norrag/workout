# 04 — Feedback & Progression Engine

The engine is the core of the app: it converts user performance and feedback into next prescriptions (weight, reps, sets) for each exercise at each point in the mesocycle, progressing intensity week to week along the meso's RIR ramp, and progressing across mesos toward the macrocycle goal.

## Design principles

1. **Pure and deterministic.** `prescribe(inputs, params) → { weight, reps, sets, targetRir, rationale }`. No I/O, no randomness. Same inputs + same params ⇒ same output, forever replayable.
2. **Tunable without deploys.** All coefficients/thresholds live in `engine_params` (versioned jsonb). The active version is loaded at call time.
3. **Auditable.** Every decision is persisted to `engine_decisions` with full inputs, output, rationale, and params version.
4. **Explainable.** The output includes a short clinical rationale ("+5 lb: hit all reps at 2 RIR") surfaced in the set/exercise menus (figs 1.2/1.3), the workout-complete autoregulation summary (fig 1.5), and to MCP.

## Inputs (signal inventory)

In priority order (most → least weight in v1):

| Signal | Source | Use |
|---|---|---|
| **Recent performance of the exercise** | last `workout_exercises` + `logged_sets` for this exercise | baseline: what weight/reps/sets were actually done vs prescribed |
| Exercise feedback after most recent sets | `exercise_feedback` (joint pain 0–3 per exercise; pump 0–10 and workload 0–10 per muscle group — fig 1.4) | pain gates progression; workload anchors set-count changes (5 = "just right"); pump corroborates |
| Workout feedback | `workout_feedback` (overall fatigue, effort, performance) | session-level dampening |
| This week's target RIR | `microcycles.target_rir` | the intensity anchor |
| Macrocycle goal | `macrocycles.goal_type` (**hypertrophy / strength / cut / maintain**) | progression aggressiveness & volume bias |
| Mesocycle phase | `mesocycles.phase` (accumulation / intensification / peak) | volume vs intensity emphasis within the meso |
| Historical exercise performance | `logged_sets` longer window (volume, e1RM trend, averages) | trend correction, meso-to-meso seeding |
| Historical muscle-group volume | `v_muscle_group_volume` | volume ceilings/floors per muscle group |
| User profile | age, gender, experience level | conservative defaults, increment sizing |
| User preferences | preferred equipment, stated strengths/weaknesses | exercise suggestion (MCP planning), not week-to-week load |

## v1 algorithm sketch (rule-based, parameterized)

> **Amended by [13-reps-prescription-unification.md](13-reps-prescription-unification.md) (active in engine_params v9).**
> The default engine now uses **rep-window weight selection + RIR grading** rather
> than the increment-on-actuals + rep-count rule below. Step 3's fixed `+increment`
> / `regression_pct` and the §5 "hypertrophy → add load" bias are **superseded**:
> the prescribed weight is chosen so reps land in a per-goal window (strength 3–5,
> hypertrophy 8–12) at the target RIR from the recency-weighted strength anchor;
> reps climb the window with the RIR ramp (load held within the meso), and the
> anchor — not a fixed step — carries overload and regression. The rule below is
> retained as the param-gated `weight_selection=increment` / `grading=reps` path
> (rollback parity). See doc 13 §§2–4 and §9 for the authoritative model.

Per exercise, when generating week *N+1* from week *N*:

1. **Anchor on actuals.** Start from last week's best working sets (weight × reps achieved), not the prescription.
2. **RIR step.** The meso defines the ramp (default 3 → 0 over the working weeks). Moving the target RIR down by 1 with the same weight/reps is itself a progression; load increases must account for that.
3. **Performance delta.**
   - Met or beat prescribed reps at/under target RIR → increase load by an increment (`params.increment.{equipment_type}`, scaled by experience) **or** add a rep, per `params.progression_style` and goal type.
   - Missed reps by a small margin → hold weight, repeat or adjust reps.
   - Missed badly → decrease load (`params.regression_pct`).
4. **Feedback modulation.**
   - `joint_pain ≥ params.pain_gate` → block load increases on this exercise; suggest hold or reduce, flag in rationale.
   - `workload` above `params.workload_high` (toward "too much") → reduce the muscle group's volume (sets −1, floor at `params.min_sets`).
   - `workload` below `params.workload_low` (toward "too easy") + adequate pump + goal = gain → consider set addition up to muscle-group weekly ceiling (`params.mg_set_ceiling`).
   - Low pump with on-target workload → flag exercise selection in rationale rather than adjust load.
   - Poor `overall_fatigue`/performance on the session → dampen all increases that session fed into.
5. **Goal bias.** cut → prioritize maintaining load, resist volume increases; hypertrophy →
   prioritize adding load/sets (volume-biased); strength → prioritize adding load at lower rep
   targets (intensity-biased); maintain → hold prescriptions stable, progress only on clear
   overperformance. (`gain` is renamed `hypertrophy`; `strength` is the new intensity-biased
   goal — both read from `params.goal_bias.<goal>`.)
   - **Phase modulation.** `mesocycles.phase` shifts the bias within the meso: `accumulation`
     favors volume (set additions), `intensification` favors load, `peak` holds volume and
     pushes load toward the 0-RIR top set. Coefficients in `params.phase_bias`.
6. **Deload week.** If `is_deload`: prescribe `params.deload.load_pct` (≈ 50–60%) of week-peak load and `params.deload.set_pct` of sets, target RIR 4+.
7. **Meso seeding.** First week of a new meso starts from prior meso peak adjusted down to the new 3 RIR start (`params.meso_seed_backoff_pct`), or from `initial_*` values / template defaults when no history exists.

All numbered behaviors read from `engine_params.params` — nothing hardcoded. **The concrete,
research-backed definitions and default values** for every threshold above — the
`workload`→set-count mapping (step 4), the pump/pain rules, RIR ramp, increments, regression,
deload, volume counting (fractional 1.0/0.5), and e1RM — live in
[10-metrics-spec.md](10-metrics-spec.md). Session-level feedback (overall fatigue / effort /
performance) is **retained** and used as a session dampener (10 §3); it is captured on the
redesigned Workout Complete sheet (1.5).

### Progress scoring
A per-exercise and per-muscle-group score computed from e1RM trend, volume trend, and feedback quality, rolled up to meso and macro level. Stored/queried via the shared views so the UI and MCP report identical numbers.

## Macrocycle planning (the "engine", figs 2.2/2.3)

A second pure function powers the Create-Macrocycle engine and the Overview's target card.
**Concrete rate tables, sex/age/experience scaling, and all defaults live in
[10-metrics-spec.md](10-metrics-spec.md) §5** (research-backed); the shape:

```
planMacrocycle(
  { goal,
    profile: { sex, age, bodyweight, heightCm, experienceLevel, trainingYears },
    durationMonths?,            // optional — engine recommends one if absent
    mesoLengthWeeks },
  params
) → {
  target: { low, high, unit },     // realistic range, personalized to the profile
  perMonthRate: { low, high },     // target ÷ duration (orange), derived
  recommendedDurationMonths,       // engine's suggested timeframe for this goal + profile
  mesoCount,                       // evenly-spaced mesos that fit the (chosen or recommended) duration
  phases: Phase[]                  // accumulate → intensify → peak
}
```

- **Personalized + scientifically sound (decision, 10 §Decisions).** The engine ingests the
  **full profile** — sex, age, bodyweight, experience level, and training age (years since
  `training_since`, a proxy for proximity to genetic potential) — and outputs both a
  realistic target range **and a recommended macrocycle timeframe** for the chosen goal. A
  near-potential advanced lifter gets a modest hypertrophy target; an older or female user a
  lower absolute gain; a heavier user can be guided to a faster (still safe) cut, a lean user a
  slower one. Rate models are heuristics — present the **conservative end**, labeled as estimates
  (10 §9).
- **Pure and parameterized like `prescribe`.** No I/O, no `Date.now()`; all rates/coefficients
  come from `engine_params` (`params.macro_target.*`, `params.phase_plan`). Same inputs + params
  ⇒ same plan, replayable.
- **Meso count + phases:** `mesoCount = floor(durationMonths × ~4.33 / mesoLengthWeeks)`; phases
  spread accumulate → intensify → peak across positions. The engine creates them as `unplanned`
  placeholders (03).
- Recomputes live as the user changes goal / duration / block length on 2.3, and re-renders on
  the Overview (2.2).

## Module layout (`src/lib/engine/`)

```
engine/
├── index.ts          # prescribe(), scoreProgress(), seedMeso(), planMacrocycle()
├── types.ts          # EngineInputs, Prescription, MacroPlan, EngineParams (zod-validated)
├── rules/            # one module per rule family (rir, performance, feedback, goal, phase, deload)
├── macro.ts          # planMacrocycle() — target range, per-month rate, meso count, phases
├── params.ts         # param schema + defaults (mirrors seed): goal_bias, phase_bias, macro_target, phase_plan
└── __tests__/        # table-driven unit tests + golden scenario fixtures
```

## Admin & dev tooling — via MCP (revised June 2026, 08 §3)

**No admin UI is built.** The same capabilities ship as admin-gated MCP tools (`profiles.role = 'admin'`), operated conversationally with Claude as the tuning console (see [05-mcp-connector.md](05-mcp-connector.md) §Admin tools):

- **Decision inspector** — query `engine_decisions`; see inputs, output, rationale, params version for any prescription.
- **Param editing** — propose param sets as new inactive versions; activate with an explicit confirmation step; diff against previous version.
- **Replay harness** — re-run any historical decision (or a whole user's meso) against a candidate param version and diff outcomes before activating. This is the primary tuning loop for obtaining quality outputs.
- **Scenario fixtures** — curated synthetic users/histories used both in unit tests and replay.

The underlying tables, param versioning, and replay functions are unchanged — only the interface moved. A UI can be layered on later once the tuning workflow is understood.

## Testing requirements

- Table-driven unit tests per rule (every branch of §v1 sketch).
- Golden tests: full meso simulation fixtures (e.g., "intermediate, gain, 5 weeks + deload") asserting week-by-week prescriptions.
- Property tests: prescriptions never violate hard bounds (no load increase under pain gate; deload always lighter than peak; sets within floor/ceiling).
- A param-schema test so a bad `engine_params` row can never be activated.
- `planMacrocycle` golden tests: fixed (goal, duration, block length, profile) → expected meso
  count, phase spread, target range, and per-month rate; property test that per-month rate ×
  duration ≈ the target range and that experience/training-age scale the target monotonically.
