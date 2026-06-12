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
| Macrocycle goal | `macrocycles.goal_type` (cut/gain/maintain) | progression aggressiveness & volume bias |
| Historical exercise performance | `logged_sets` longer window (volume, e1RM trend, averages) | trend correction, meso-to-meso seeding |
| Historical muscle-group volume | `v_muscle_group_volume` | volume ceilings/floors per muscle group |
| User profile | age, gender, experience level | conservative defaults, increment sizing |
| User preferences | preferred equipment, stated strengths/weaknesses | exercise suggestion (MCP planning), not week-to-week load |

## v1 algorithm sketch (rule-based, parameterized)

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
5. **Goal bias.** cut → prioritize maintaining load, resist volume increases; gain → prioritize adding load/sets; maintain → hold prescriptions stable, progress only on clear overperformance.
6. **Deload week.** If `is_deload`: prescribe `params.deload.load_pct` (≈ 50–60%) of week-peak load and `params.deload.set_pct` of sets, target RIR 4+.
7. **Meso seeding.** First week of a new meso starts from prior meso peak adjusted down to the new 3 RIR start (`params.meso_seed_backoff_pct`), or from `initial_*` values / template defaults when no history exists.

All numbered behaviors read from `engine_params.params` — nothing hardcoded.

### Progress scoring
A per-exercise and per-muscle-group score computed from e1RM trend, volume trend, and feedback quality, rolled up to meso and macro level. Stored/queried via the shared views so the UI and MCP report identical numbers.

## Module layout (`src/lib/engine/`)

```
engine/
├── index.ts          # prescribe(), scoreProgress(), seedMeso()
├── types.ts          # EngineInputs, Prescription, EngineParams (zod-validated)
├── rules/            # one module per rule family (rir, performance, feedback, goal, deload)
├── params.ts         # param schema + defaults (mirrors seed)
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
