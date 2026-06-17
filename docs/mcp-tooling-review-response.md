# MCP Tooling Review — Response & Triage (2026-06-17)

Assessment of the external *Workout MCP Tooling Review* (June 17, 2026) against
the actual implementation, what was fixed in this pass, and the staged backlog
for the rest. Each finding was verified against the code **and** reproduced
against the live database (read-only) using the reviewer's own account before
any change.

## What was confirmed and fixed in this pass

### P0-1 — `working_sets` / `total_volume` inflation (FIXED)

**Confirmed, with a corrected root cause.** `v_meso_summary` joined
`logged_sets` together with `workout_exercises`, `exercise_feedback`, and
`workout_feedback` on the workout grain in a single `GROUP BY`. Every logged set
was multiplied by `(#workout_exercises × #workout_feedback rows)` for its
workout — a cartesian fan-out. This inflated **both** `working_sets` *and*
`total_volume` (and skewed the feedback averages, which were weighted by logged
set count).

The review interpreted the symptom as "`working_sets` is summing repetitions."
That is not quite right — both additive metrics were inflated by a *per-workout*
factor, which is why the reviewer's `+7 sets / +875 volume` deltas had no clean
common ratio. Reproduced on the active June block:

| metric         | before (fanned) | after (fixed) |
| -------------- | --------------- | ------------- |
| `working_sets` | 1104            | **153**       |
| `total_volume` | 859,242.5       | **137,773.0** |
| `working_reps` | —               | **1673** (new)|

153 working sets across ~10 four-day sessions (~15/session) is the correct
order of magnitude.

**Fix:** `supabase/migrations/20260617000003_metric_truth_view_fixes.sql`
rewrites `v_meso_summary` to pre-aggregate set facts, exercise feedback, and
workout feedback in **separate CTEs** before joining, so each row is counted
once. Adds `working_reps` (true repetition sum) so set count and rep count are
distinct. `formatMesoSummary` surfaces `working_reps`; `VMesoSummaryRow` gained
the column.

> Note: `v_macro_summary` joins only `logged_sets` (a clean
> microcycle→workout→set chain, no fan-out), so its `working_sets`/`total_volume`
> were already correct and were left unchanged.

### P0-2 — Muscle-group planned vs logged mismatch (FIXED)

**Confirmed, root cause corrected.** The review attributed the "45 planned vs 15
logged shoulder sets" to planned/logged using *different muscle-attribution
models* (secondary vs direct credit). In fact **both sides already attribute to
the same `workout_exercises.muscle_group_id`** — there is no credit-model
difference. The divergence was the *same class of fan-out* as P0-1:
`v_meso_week_sets` summed `workout_exercises.prescribed_sets` while joined to
`logged_sets`, so each exercise's planned-set count was multiplied by the number
of sets logged against it. (Tell: future/unlogged weeks, which have zero logged
sets, reported the correct planned total all along.)

Reproduced (June block, week 1, fully completed):

| group     | planned (before) | planned (fixed) | logged |
| --------- | ---------------- | --------------- | ------ |
| shoulders | 45               | **15**          | 15     |
| biceps    | 27               | **9**           | 9      |
| quads     | 16               | **8**           | 8      |
| back      | 12               | **6**           | 6      |

After the fix, planned equals logged for a fully-completed week, as expected.

**Fix:** same migration rewrites `v_meso_week_sets` to collapse each
`workout_exercise` to its own planned + logged counts in a CTE first, then sum
once per muscle group. No API/type change — the corrected numbers flow straight
through `get_muscle_group_volume`.

### P1-1 — Adherence denominators (FIXED, formatter-only)

`get_mesocycle_summary` reported `adherence_pct = 100` (attended/due over working
weeks) alongside `workouts_completed = 10 / workouts_total = 13` with no
explanation of the differing denominators. The summary view already exposes
`sessions_attended`, `sessions_due`, `workouts_completed`, `workouts_total`.
`formatMesoSummary` now returns an explicit `adherence` object with both
numerators/denominators and a `block_completion_pct`, so callers no longer infer
the distinction. The legacy top-level `adherence_pct` is retained.

### P0-5 — Mesocycle comparison is not comparable (PARTIALLY FIXED, formatter-only)

`compare_mesocycles` returned raw totals only. `formatCompareMesos` now adds:
- `comparison_basis: "completed_workouts"`,
- per-block `sets_per_workout` / `volume_per_workout` normalized rates,
- `workouts_completed`, `working_reps`, `includes_deload` on each row,
- a `warnings[]` array flagging active/incomplete blocks, unequal durations, and
  deload-structure mismatch.

Not yet done (needs more than formatter work): shared-exercise e1RM trend,
feedback-coverage rates, and common-date-window mode — see backlog.

### P0-4 (partial) — Decision linkage exposure (FIXED, the cheap half)

`get_engine_decisions` already resolved `exercise_id` and `workout_exercise_id`
in the query layer but dropped them from the response. They're now included so a
decision chains directly into `get_exercise_history` / `explain_prescription`
without a re-lookup. The deeper integrity work (immutable set IDs, sequence
validation, structured trace) remains — see backlog.

### P2 — Macrocycle placeholder names (FIXED)

Confirmed: positions 3/4/5 of the active macro were named "Mesocycle 4",
"Mesocycle 5", "Mesocycle 5" and all unplanned slots reported `days_per_week = 1`.
Root cause: the slot re-sequence only regenerated the name for the bare literal
`"Mesocycle"`, so a pre-existing auto-name (`"Mesocycle 4"`) kept its stale
number when positions shifted. Extracted a pure, tested `placeholderName()`
helper that re-aligns any auto-generated name (`/^Mesocycle( \d+)?$/`) to its
position while leaving user-renamed slots untouched. Existing rows self-correct
on the next macro edit/reconcile.

> `days_per_week = 1` on unplanned placeholders is a storage default. The review
> suggests reporting it as `null` until planned; deferred (it ripples through the
> planner board and macro stats) — tracked in the backlog.

## Confirmed but deferred (need schema / engine work — staged, not done here)

These are real and accepted, but each needs migrations, backfills, or engine
refactors that warrant their own vertical-slice PRs rather than being bundled
with the metric-truth fixes.

### P0-3 — Engine-params historical reproducibility
`getEngineParamsVersion` runs the stored `params` jsonb through
`engineParamsSchema.parse()`, which applies `.default()` for keys added in later
schema versions. So an old version's *missing* blocks are silently filled with
*today's* defaults — which is why v2/v5/v6 resolve to identical objects and
their diffs are empty, while v1 (predating the schema) fails validation. **This
is a genuine reproducibility defect.**
Planned: store fully-materialized immutable snapshots at propose time
(deep-clone after resolving defaults), and add `schema_version`,
`engine_build_id`/`code_sha`, `params_hash`, and `is_replayable` columns; stop
re-parsing-with-defaults on read; mark/​migrate legacy versions instead of
emitting raw validator output. The dot-path `diffParams()` is already a true deep
diff, so only the read/storage path changes.

### P0-4 (full) — Decision-event integrity
`engine_decisions` stores only `workout_exercise_id` (+ `inputs`/`output` jsonb);
`exercise_id`/`workout_id`/`mesocycle_id`/`microcycle_id`/`prescription_id` are
not persisted (resolved by join), and `actualSets` carry a `setNumber` sequence
rather than an immutable `logged_set_id` — hence the observed duplicate set
numbers (1, 1, 2). `rir_reported` nulls fall back to the target RIR with no note
in the record.
Planned: persist source IDs + immutable `logged_set_id` + a validated
`sequence_index`; record the RIR-fallback rule used; derive the human rationale
from a structured `decision_trace`. Requires a schema migration and changes to
the decision-recording path in `generateDay()`.

### P1-2 — Make `get_mesocycle` chainable
Add `muscle_group_id` / `workout_day_id` / `slot_id` / `exercise_id` at each
nested level, plus per-week planned sets and day/weekly totals. Formatter +
query change, no migration; medium size.

### P1-3 — `replay_decisions` diagnostics
Add outcome breakdown (`unchanged` / `skipped` / `invalid_source` /
`invalid_candidate` / `execution_error`), rule-coverage counts, candidate/source
hash + build identity (depends on P0-3), an optional bounded sample of unchanged
decisions, and a `simulate_prescriptions` path for hypothetical cases.

### P1-4 / P2 — Common response envelope & cross-tool consistency
A shared `{ schema_version, generated_at/as_of, units, data_quality, data }`
envelope, consistent rounding, feedback sample counts/coverage beside every
average, documented scale ranges, deterministic ordering, and cursor pagination
for decisions. Broad but mechanical; best done as one consistency pass after the
P0 schema work lands.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run test` — all green (229 tests).
- Both view fixes reproduced read-only against the live project
  (`juqvbiymmdcggctdqoiq`) before and after, confirming the corrected numbers.
- New unit tests: `working_reps` + dual adherence denominators
  (`read-tools.test.ts`), compare normalization + warnings
  (`coaching-tools.test.ts`), and `placeholderName` (`macro.test.ts`).
