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

## Follow-up pass (2026-06-17) — deferred backlog addressed

The staged items above were implemented as a sequence of vertical slices on
`claude/youthful-franklin-1r3qfn`. Migrations were applied to the live project
(`juqvbiymmdcggctdqoiq`); the earlier `metric_truth_view_fixes` migration was
applied at the same time (it had not yet reached the live DB), and a latent
`create or replace view` type-widening bug in it — `sum()` promoted
`planned_sets`/`logged_sets` to `numeric` — was fixed with explicit `::bigint`
casts.

### P0-3 — Engine-params reproducibility (DONE)
`20260617000004` adds `schema_version` / `params_hash` / `code_sha` /
`is_replayable` to `engine_params` and backfills v1–v6 (only v6, the active
complete snapshot, is replayable; v1–v5 were stored partial and are flagged
non-replayable; v1 predates the schema → `schema_version = 1`).
`src/lib/queries/params-provenance.ts` adds canonical (sorted-key) hashing and
`resolveProvenance` (replayable only when the stored bytes deep-equal the
parsed-with-defaults result). `getEngineParamsVersion` no longer re-parses with
defaults and hands that back as "the version" — it returns the stored bytes, a
separately-`resolved` full set, provenance, and a hash-verified flag.
`propose_engine_params` now stores a fully-materialized snapshot with hash +
schema version + build id; `get_engine_params` diffs the stored bytes so legacy
versions show their real deltas.

### P0-4 (full) — Decision-event integrity (DONE)
`20260617000005` persists `exercise_id`, `source_workout_exercise_id`,
`workout_id`, `microcycle_id`, `mesocycle_id`, `params_hash`, and a
`provenance` jsonb on `engine_decisions` (legacy rows backfilled for the
join-resolvable coordinates). Each engine input set now carries an immutable
`loggedSetId` + stable `sequenceIndex` (fixes the 1,1,2 set-number collision);
`prescribe()` emits a structured `DecisionTraceStep[]` from which the human
rationale is *derived* (prose and trace can't drift; rationale strings
unchanged); the recording path records the RIR-fallback rule + count and the
engine build. `get_engine_decisions` reads linkage from the persisted columns.

### P1-2 — `get_mesocycle` chainable (DONE)
`formatMesoPlan` now exposes `day_id` / `group_id` / `muscle_group_id` /
`slot_id` / `exercise_id` at each level plus planned-set totals per slot, group,
day, and a meso `planned_sets_per_week`.

### P1-3 — `replay_decisions` diagnostics (DONE)
Outcome breakdown (`unchanged` / `changed` / `invalid_source` /
`execution_error`), rule-coverage counts, candidate + source build identity
(version/hash/sha), an optional bounded unchanged-sample, and a new
`simulate_prescriptions` tool for hypothetical inputs.

### P1-4 / P2 — Common envelope & consistency (DONE)
`src/lib/mcp/envelope.ts` wraps every tool response in
`{ schema_version, generated_at, units, data_quality, data }`; `units` is
populated where the handler has the profile; `get_mesocycle_summary` carries
feedback sample counts + coverage (new count columns on `v_meso_summary`,
`20260617000006`) and documented scale ranges; `get_engine_decisions` gained
keyset (cursor) pagination via `next_cursor`.

---

# Second Review — Test Report (2026-06-18)

A fresh full-suite test run raised findings §5.1–§5.12. The original report is
archived verbatim at `reviews/2026-06-18-connector-test-report.md`. This pass
addresses the three **"Now" blockers** (the critical defects); the
scientific-credibility and polish tiers are staged for a later session.

## Status tracker

| # | Finding | Sev | Status |
|---|---|---|---|
| §5.1 | `get_exercise_affinity` broken (no-arg / equipment) | 🔴 | ✅ Done |
| §5.2 | analytics tools disagree (`times_trained` vs `session_count`; `change_pct`) | 🔴 | ✅ Done |
| §5.1b | affinity feedback rollup path-dependent (row-cap truncation) | 🔴 | ✅ Done (follow-up) |
| §5.6 | opaque `[object Object]` errors | 🟡 | ✅ Done |
| §5.3 | `data_quality` + scales legend missing on most tools | 🟠 | ✅ Done |
| §5.4 | no volume landmarks (MEV/MAV/MRV) | 🟠 | ✅ Done |
| §5.5 | `explain_prescription` empty on common case | 🟠 | ✅ Done |
| §5.7 | unrounded float noise | 🟡 | ✅ Done |
| §5.8 | no delete/undo for create/propose | 🟡 | ✅ Done (respects no-delete-logged rule) |
| §5.9 | `search_templates` dead-ends | 🟡 | ✅ Done |
| §5.10 | incomplete planned-volume across weeks | 🟢 | ⏳ Staged |
| §5.11 | rationale / validation polish | 🟢 | ⏳ Staged |
| §5.12 | data-hygiene advisory | 🟢 | ⏳ Staged |

## Critical / "Now" — fixed in this pass

### §5.1 — `get_exercise_affinity` broken in 2 of its 3 modes (FIXED)

**Confirmed, root cause identified.** The no-arg and `equipment`-only calls
errored while the `muscle_group_id` call worked. The difference was set size:
`getExerciseAffinity` fetched **all** of the user's `workout_exercises`, then ran
`exercise_feedback.in("workout_exercise_id", [...])` with that full id list.
PostgREST renders `.in()` into the **request URL**, so a user with a long
training history overflowed the URL-length limit and the request failed. The
`muscle_group_id` path happened to narrow the candidate set enough to stay under
the limit — which is why it alone succeeded.

**Fix (`src/lib/queries/coaching.ts`):**
- All filters (exclusions, muscle group, **equipment**) are now applied to the
  candidate set *before* the per-set fan-out, and the equipment filter is matched
  against `exercises.equipment_type` up front rather than post-hoc.
- The candidate set is capped to the most-trained `AFFINITY_LIMIT` (60) *before*
  the heavy queries, since that is all the tool returns anyway.
- A new `selectInChunks` helper splits every `.in(col, ids)` over ≥1 bounded
  request (`ID_CHUNK = 150`), so no id list can overflow the URL. Unit-tested in
  `coaching-affinity.test.ts`.

### §5.1b — affinity feedback rollup path-dependent (FIXED, follow-up)

A residual flagged after the first fix: the same exercise (Dumbbell Curl) showed
`feedback.sessions: 0` on the no-arg call but `sessions: 4` (populated averages)
on the `equipment: "dumbbell"` call — same exercise, same window.

**Root cause:** PostgREST also caps every response at `db.max_rows`
(**1000**, `supabase/config.toml`). The feedback rollup scanned **all**
`workout_exercises` for the candidate set via `.in("exercise_id", [...])`; in the
no-arg path that result exceeded 1000 rows and was silently truncated, so a
popular exercise whose rows landed past the cap lost its `workout_exercise →
exercise` mapping and read as zero feedback. The equipment filter shrank the set
under the cap, so the same exercise resolved.

**Fix (`src/lib/queries/coaching.ts`):** drive the rollup off the (sparse,
unique-per-`workout_exercise`) `exercise_feedback` table instead — fetched with a
new `fetchAllRows` `.range()` paginator so the row cap can't drop rows — and
resolve `exercise_id` only for the workout-exercises that actually have feedback
(a primary-key `.in("id", ...)` lookup, chunked well under the cap). The result
is now identical across every call path. `fetchAllRows` is unit-tested for
multi-window pagination in `coaching-affinity.test.ts`.

### §5.2 — Analytics tools disagree on the same numbers (FIXED)

Confirmed and split into two distinct causes:

1. **`times_trained: 144` vs `session_count: 43`.** `get_exercise_history`
   truncates to the 120 most-recent *sets* (a UI cap), which deduped to ~43
   sessions, and reported that as `session_count` — undercounting the lifetime
   total. `formatExerciseHistory` now reports `session_count` as the **lifetime
   total** (from `v_exercise_overview.times_trained`, the same definition
   `analyze_exercise_progress.times_trained` uses), plus `sessions_shown` and a
   `truncated` flag for the returned window. The two numbers now agree.
2. **`change_pct` disagreeing across tools and with its own payload.**
   `analyze_exercise_progress` reported `−15.9%` while showing first e1RM 33 →
   latest 27 (which is `−18.2%`): `detectStall` computed the percent from the raw
   e1RM floats but displayed the rounded values. It now computes `change_pct`
   from the same rounded e1RM it reports, so the payload reconciles with itself.
   The cross-tool difference is a **legitimate window difference** (lifetime vs
   meso-scoped), so each tool now carries a `metric_definitions` block naming the
   window + formula: `analyze_exercise_progress` = lifetime,
   `get_mesocycle_summary.progress_scores` = within the mesocycle.

### §5.6 — Opaque error serialization (`[object Object]`) (FIXED)

Tool handlers `throw` raw Supabase error objects; the SDK stringifies a thrown
value with `String()`, so a plain object surfaced as `[object Object]`.
`envelope.ts` adds `toStructuredError` / `toolError`, and `registerTools` wraps
every handler at the composition root so any thrown value becomes a structured
`{ error: { code, message, detail } }` result flagged `isError`. The pure
`register*` functions stay unwrapped for unit testing.

## High tier ("Next" — scientific credibility) — fixed in this pass (2026-06-18)

All three 🟠 High findings were reproduced live against the connector
(account: Garron) before any change, then fixed and unit-tested.

### §5.3 — `data_quality` + scales legend on every feedback/estimate tool (FIXED)

Only `get_mesocycle_summary` populated `data_quality`; everywhere else
`get_recent_sessions` / `get_exercise_affinity` returned raw `fatigue: 2`,
`pump: 5`, `jointPain: 0` with no scale, so a 2-on-0–4 read like a 2-on-0–10.

`envelope.ts` adds `scaleLegend(...keys)` (emits *only* the scales a tool
actually reports, so a fatigue-only tool doesn't ship the pump/joint-pain
legend) plus two standing caveats — `E1RM_ESTIMATE_NOTE` and
`FEEDBACK_HISTORY_NOTE` (feedback was only captured from 2026-06-15; earlier
history was migrated without it, so sparse early means are expected, not lost —
the report's editor's note). Each feedback/estimate tool now attaches a
`data_quality` block (scales, sample sizes, estimate caveats) and `units`:
`get_training_overview`, `get_recent_sessions`, `analyze_exercise_progress`,
`compare_mesocycles` (per-block feedback sample counts), `get_muscle_balance`,
`get_exercise_affinity`, and `get_exercise_history`. Query/formatter-level only.

### §5.4 — MEV/MAV/MRV volume landmarks parameterized + asserted (FIXED)

`get_muscle_balance` could flag *relative* imbalance but said outright that
"MEV/MAV/MRV landmarks are not yet parameterized," so it couldn't tell whether a
muscle was below maintenance volume (it flagged hamstrings on relative ranking
while chest sat at ~4 sets/wk, likely under MEV).

The engine-params schema gains a `volume` block (`landmarks` per muscle =
`[MEV, MAV_high, MRV]` weekly direct-equivalent sets for an intermediate, plus
`experience_scale`) seeded from 10 §2/§8. A **pure** engine helper
(`src/lib/engine/volume.ts`: `muscleVolumeLandmark` / `classifyVolume` /
`assessMuscleVolume`) scales the band by experience and classifies a muscle's
weekly sets into `below_mev` / `optimal` / `high` / `above_mrv`.
`get_muscle_balance` now attaches a `landmark` assessment per muscle, lists
muscles below MEV / above MRV in the advisory, and carries a `landmarks_legend`.
Landmarks are honestly framed as heuristic, tunable, advisory (10 §9).

Landmarks do **not** change `prescribe()` (the progression engine doesn't
consume them yet) — only the advisory reads them, so live generation is
unaffected. Because adding a defaulted field changes the schema *shape*, the
params `schema_version` bumped to 3; migration `20260618000001` seeds **v8** —
the active v6 params materialized + the resolved volume block — as a complete,
hash-verified schema-v3 snapshot (preserving P0-3 immutable-snapshot
reproducibility; v6/v7 predate the field and are flagged non-replayable under
v3). The materialized JSON + `params_hash` were generated by the app's own
`engineParamsSchema.parse()` + `hashParams()` so they match what the reader
recomputes. **Applied to the live project** (`juqvbiymmdcggctdqoiq`): v8 is now
the single active version (`is_active`, `is_replayable`, `schema_version = 3`).

### §5.5 — `explain_prescription` projection fallback (FIXED)

Confirmed and root cause **corrected**: the report assumed the historical
decision existed in `get_engine_decisions` and the tool only surfaced the latest
generated week. In fact the live DB holds only 25 decisions (all 2026-06-16…18,
the latest generated week) and **none** for the Dumbbell Curl — the engine only
records a decision when a week is *generated*, and the curl wasn't in the latest
generated (leg) day. There was nothing historical to fall back to.

So instead of surfacing a non-existent record, `projectNextPrescription`
recomputes what the engine *would* prescribe next — read-only, via the same pure
`prescribe()` and the same input assembly as live generation — sourced from the
exercise's most recent **completed** week and targeting the next week's RIR (or
holding the current RIR when the block has no later week). `explain_prescription`
prefers the recorded decision and falls back to this projection, tagged
`source: "recorded" | "projected"` so a committed prescription is never confused
with a what-if. Verified the projection path resolves for the curl (source
W2·D3, 3 working sets, next week W3 target RIR 1). No migration.

## Medium tier (🟡 lifecycle & polish) — fixed in this pass (2026-06-18)

The three 🟡 Medium findings were implemented as one vertical slice. All
query/formatter changes are unit-tested; one additive RLS migration was applied
live.

### §5.7 — Consistent float rounding (FIXED)

The "precise/scientific" surface leaked SQL float noise: `affinity`,
`mesocycle_summary`, and `compare_mesocycles` printed view-sourced floats raw
(`73.33333333333333`, `5.1230769230769235`, `137773.123…`) while
`analyze_exercise_progress` rounded. `envelope.ts` adds a shared, null-safe
`roundTo(n, dp=1)` / `round1(n)` (used everywhere instead of ad-hoc
`Math.round(n*10)/10` helpers). Every e1RM / volume / feedback-mean these three
tools emit is now rounded to **1 dp**:
- `formatAffinity` rounds `best_e1rm_estimate` + `total_volume` (feedback means
  were already 1-dp from `mean()`).
- `formatCompareMesos` rounds `total_volume`, `best_e1rm_estimate`,
  `avg_overall_fatigue`, `avg_performance` (and reuses the shared helper for the
  per-workout rates).
- `formatMesoSummary` rounds `total_volume`, `best_e1rm_estimate`, every
  `feedback.avg_*`, and the `progress_scores` e1RMs — and **recomputes**
  `e1rm_change_pct` from the *rounded* e1RMs (the same self-consistency fix §5.2
  applied to `detectStall`), so the percent reconciles with the numbers shown.

### §5.8 — Delete/undo for the create/propose tools (FIXED)

The create/propose tools had no paired delete, so a mistaken macro / meso /
template / custom exercise / params proposal was permanent (this QA left an
undeletable inactive **v7**). Added five guarded delete tools that **never
destroy logged history** (hard rule #5 / the report's editor note — a movement
or block with logged sets can't be deleted, since that would rewrite the past):

| tool | undoes | refused when |
|---|---|---|
| `delete_mesocycle` | `create_mesocycle` | any logged sets in the meso |
| `delete_macrocycle` | `create_macrocycle` | logged sets under it, or it holds an active/completed meso (else cascades its placeholder mesos) |
| `delete_template` | `create_template` | not the user's own (stock templates) |
| `delete_custom_exercise` | `create_custom_exercise` | stock exercise, any logged sets, or still referenced by a planned slot / generated workout (→ suggests `manage_exclusions`) |
| `discard_engine_params` (admin) | `propose_engine_params` | version is active, or referenced by any recorded `engine_decision` (kept so decisions stay reproducible); requires `confirm_version` echo |

Each tool checks a pure-ish `*DeletionImpact` query
(`getMesoDeletionImpact` [existing], `getMacroDeletionImpact`,
`getExerciseDeletionImpact`, `getParamsDeletionImpact`) before acting and
records an `mcp_write_audit` row. `engine_params` had no RLS delete policy, so
migration `20260618000002_engine_params_delete_policy` adds an admin-only one
(**applied live** to `juqvbiymmdcggctdqoiq`; verified present); all other tables
already had owner/admin delete policies.

### §5.9 — `search_templates` → `create_mesocycle` (FIXED)

`search_templates` advertised "use a template id to start a meso" but no tool
instantiated one. `create_mesocycle` now takes an optional `template_id`
(mutually exclusive with `days` — pass exactly one): it creates the planned meso
and prefills its board via the existing `applyTemplateToMeso` (the same query the
in-app start-from-template flow uses, so exclusions and structure behave
identically). `search_templates`' description + payload `note` now point at that
execution path.

## Confirmed but staged (next pass — 🟢 Low polish)

- **§5.10 / §5.11 / §5.12** planned-volume projection labeling, rationale/​
  validation polish, and a data-hygiene advisory.

## Verification (2026-06-18 — Medium tier pass)

- `npm run typecheck`, `npm run lint`, `npx vitest run` — all green (293 tests).
- New unit tests: `roundTo`/`round1` precision + null/non-finite handling
  (`envelope.test.ts`); §5.7 rounding on `formatAffinity` / `formatCompareMesos`
  / `formatMesoSummary` incl. the self-consistent recomputed change
  (`coaching-tools.test.ts` / `read-tools.test.ts`); the `create_mesocycle`
  template-XOR-days guard (`write-tools.test.ts`); the `search_templates` →
  `create_mesocycle` pointer (`read-tools.test.ts`); delete-tool registration +
  auth gating (`write-tools.test.ts` / `admin-tools.test.ts`); and the deletion
  guards' logged-history / active-meso / reference / active-version invariants
  (`deletion-guards.test.ts`).
- Migration `20260618000002` applied live; the new delete policy is the only
  schema change. The tool/formatter changes deploy with this branch's connector
  (Vercel).

## Verification (2026-06-18 — critical "Now" pass)

- `npm run typecheck`, `npm run lint`, `npm run test` — all green (261 tests).
- New unit tests: affinity id-chunking **and `fetchAllRows` row-cap pagination**
  (`coaching-affinity.test.ts`), structured-error serialization + the registry
  error guard (`envelope.test.ts` / `coaching-tools.test.ts`), `detectStall`
  self-consistent `change_pct` + lifetime `metric_definitions`
  (`coaching-tools.test.ts`), and `get_exercise_history`
  lifetime-count/truncation reporting (`read-tools.test.ts`).
- No schema migration required for this pass (all fixes are query/formatter-level).

## Verification (2026-06-18 — High tier pass)

- `npm run typecheck`, `npm run lint`, `npx vitest run` — all green (274 tests).
- New unit tests: pure volume-landmark assessment (`engine/__tests__/volume.test.ts`),
  `get_muscle_balance` zone assertions + experience scaling + unparameterized
  muscles (`coaching-tools.test.ts`), `scaleLegend` subset behavior
  (`envelope.test.ts`), and `explain_prescription` recorded-vs-projected fallback
  (`read-tools.test.ts`).
- Migration `20260618000001` applied to the live project; v8 active +
  hash-verified. The `get_muscle_balance` / `data_quality` / projection code
  changes deploy with this branch's connector (Vercel) — the DB layer (landmarks)
  is already live.

---

## Verification

- `npm run typecheck`, `npm run lint`, `npm run test` — all green (246 tests).
- Both view fixes reproduced read-only against the live project
  (`juqvbiymmdcggctdqoiq`) before and after, confirming the corrected numbers.
- All four new migrations applied to the live project.
- New unit tests: `working_reps` + dual adherence denominators
  (`read-tools.test.ts`), compare normalization + warnings
  (`coaching-tools.test.ts`), `placeholderName` (`macro.test.ts`), params
  provenance (`params-provenance.test.ts`), the structured trace
  (`prescribe.test.ts`), set-identity threading (`progression.test.ts`), replay
  diagnostics (`admin-tools.test.ts`), chainable plan ids + meso totals
  (`read-tools.test.ts`), and the response envelope (`envelope.test.ts`).
