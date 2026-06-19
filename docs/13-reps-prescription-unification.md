# 13 — Reps / Prescription Unification (plan)

Status: **plan, for review then build as one vertical slice.** It changes no
behavior by itself — it is the artifact to build against. Authoritative intent
lives in [04-feedback-engine.md](04-feedback-engine.md) (engine logic),
[10-metrics-spec.md](10-metrics-spec.md) (metric definitions + honesty
guardrails), and [11-workout-engine-explainer.md](11-workout-engine-explainer.md)
(the live reps ⇄ weight ⇄ RIR predictor as shipped). Where this doc disagrees
with those, **those win**. Update [PROGRESS.md](PROGRESS.md) when it lands.

## 1. Problem

The logging screen shows **two different rep numbers for the same set**, and
they never reconcile:

- **`prescribed_reps`** — written by `prescribe()` and stored on the
  `workout_exercises` row. It is **not derived from the e1RM model**: the engine
  sets `reps = inputs.previous.reps`, i.e. it carries the prior week's prescribed
  reps forward unchanged (ultimately the plan's `initial_reps`), and only ever
  changes via the rarely-taken `reps_first` "+1" branch. So it is effectively a
  frozen constant with no relationship to weight, strength, or target RIR. It is
  what the rationale note quotes ("…×11 prescribed…") and what the engine grades
  performance against.
- **predicted reps** — what the logging field actually displays.
  `DayView.SetRow` renders `predictRepsAtWeight(e1rm_anchor, weight, target_rir,
  params)` (doc 11 §8), falling back to `prescribed_reps` only when there is no
  anchor.

### Worked example (real data — Dumbbell Curl 2-Arm, "Garron June '25 - Bulk")

| coordinate | stored `prescribed_reps` | displayed (predictor) | logged |
|---|---|---|---|
| W3·D3 (25 lb, 1 RIR) | 11 | **15** | 25 × 15 ×3 |
| W4·D3 (30 lb, 0 RIR) | 11 | **10** | — |

The displayed values are the e1RM predictor at the live **recency-weighted best**
anchor (≈ 40.6 lb), which reproduces 15 and 10 exactly; the recency-weighted
*mean* anchor in the current source (≈ 37.3 lb) would predict 13 and 8. The user
was cued 15 and did 15 — the predictor was accurate; the prescribed `11` was the
wrong number. Persistence, the `engine_decisions` record, and the simulation were
all internally correct; the defect is the **divergence**, not a data-flow bug.

### Why this matters

1. **The displayed target is right; the prescription is stale.** 11 reps at 25 lb
   is ~5 RIR for this user, not the prescribed 1 RIR. Defaulting the display to
   `prescribed_reps` would under-cue training.
2. **The rationale references a number the user never saw** ("did 25×15 vs 25×11
   prescribed").
3. **Grading runs against the frozen count.** Following the predictor, the user
   "beats" 11 most weeks → +load every week; on a 0-RIR peak week the predictor
   cues few reps and logging them reads as a `big_miss` vs 11 → −10% load. Load
   moves for reasons that are an artifact of the two rep numbers disagreeing.

## 2. Decisions (locked)

1. **Reps are unified onto the predictor.** `prescribe()` derives reps from the
   same inverted-e1RM relationship it uses to display them, at the prescribed
   weight + week target RIR. By construction: at the prescribed weight,
   **prescribed reps = predicted reps = displayed reps**; edit the weight and
   reps re-derive from the same model.
2. **Anchor method = recency-weighted _best_ e1RM** (the live behavior), not the
   recency-weighted mean currently in `recencyWeightedE1rm`. Revisit to the mean
   if it proves too aggressive over time. This is a tuning choice; it ships as an
   `engine_params` value, not a hardcode (hard rule #3).
3. **Grading moves from rep-count to RIR** (the app's premise: prescribe a target
   RIR, trust the user). Infer achieved RIR from logged weight×reps via the
   anchor (`impliedRirAtReps`) and compare to the week target. Overshooting
   intensity (going harder than target) is at worst a **hold**, never a regress;
   regress only on a genuine strength drop. This removes the frozen-count
   regressions and the "aggressive predicted target becomes a pass/fail bar"
   trap.
4. **New exercise-menu item: "Reset to prescription"** — returns an edited
   exercise's sets to the engine's prescribed weight (and therefore predicted
   reps), so a user who edits, forgets the original, and changes their mind can
   get back.

## 3. Changes

### 3.1 Engine — reps source (`src/lib/engine/`)

- In `prescribe()` (`index.ts`), stop using `inputs.previous.reps` as the rep
  output. Instead compute reps from `predictRepsAtWeight(anchor, finalWeight,
  inputs.week.targetRir, params)` once the final weight is decided, where
  `anchor` is supplied on `EngineInputs` (the engine stays pure — the caller in
  `progression.ts` passes the recency-weighted-best anchor, computed exactly like
  `getExerciseE1rmAnchors`).
  - Add `inputs.strengthAnchor: number | null` to `EngineInputs`
    (`types.ts`, zod). When null (cold start / no history) fall back to the
    existing carried-forward / `initial.reps` behavior so week 1 still equals the
    plan.
  - Clamp predicted reps to a sane band (e.g. `params.reps_predict.{min,max}` or
    the meso's intended rep range) so a low-confidence anchor cannot cue wild
    numbers.
- `recencyWeightedE1rm` (`reps.ts`): expose the **best** (recency-weighted max)
  alongside the mean, selected by a param `params.e1rm.anchor_method:
  'best' | 'mean'` (default `'best'`). `getExerciseE1rmAnchors`
  (`queries/logging.ts`) and the new progression call both read it, so display
  and prescription use one definition.

### 3.2 Engine — grading on RIR (`src/lib/engine/rules/performance.ts`)

- Replace the rep-delta classification with an RIR-delta classification:
  - `achievedRir = impliedRirAtReps(anchor, best.weight, best.reps, params)`.
  - `met`/`on_track`: `|achievedRir − targetRir| ≤ params.rir_tolerance`.
  - easier than asked (`achievedRir − targetRir > tolerance`): hold or damped
    bump.
  - harder than asked (`targetRir − achievedRir > tolerance`): **hold** (a hard
    set is not a miss).
  - regress only when `achievedRir` sits well above target at the same load
    across the session/week (true strength drop), gated by
    `params.rir_regress_gap`.
- Keep the pain gate, workload→sets, pump, and session dampener
  (`rules/feedback.ts`) exactly as-is; they already compose downstream.
- Update the rationale wording so it never cites a hidden "×N prescribed" rep
  figure; phrase it around weight delta + RIR ("+5 lb: hit target at ~1 RIR;
  target RIR steps 1→0").

### 3.3 UI — Day View (`src/app/(app)/log/[workoutId]/DayView.tsx`)

- No change to the predictor display path — it is already correct. Once the
  engine unifies reps, `prescribed_reps` and the predictor agree at the
  prescribed weight, so the existing fallback chain becomes self-consistent.
- **Reset to prescription** menu item (the `⋮` exercise menu, alongside
  "Add set" / "Skip remaining sets"): clears the exercise's `set_weights`
  overrides and any client-side manual-reps flag, restoring each unlogged set to
  `prescribed_weight` (→ predicted reps). Never touches logged sets (hard rule
  #5 / append-only). Server action mirrors the existing `updateSetWeightAction`
  surface; a single delete of the `set_weights` map for that
  `workout_exercise_id`.

### 3.4 Params + schema

- `engine_params` new version (v9) adding: `e1rm.anchor_method` (`'best'`),
  `rir_tolerance`, `rir_regress_gap`, and `reps_predict` band. Mirror in
  `src/lib/engine/params.ts` `DEFAULT_ENGINE_PARAMS` and the seed. Schema test so
  a bad row cannot activate (hard rule #3). Append-only migration; no edits to
  applied migrations (hard rule #2).
- No table schema change required for reset-to-prescription (`set_weights` jsonb
  already exists, migration `20260616000003`).

## 4. Tests (hard rule #3 — every behavior change covered)

- `reps.ts`: anchor_method `best` vs `mean` selection; predicted-reps band clamp;
  forward∘inverse round-trips already covered, extend for the band.
- `performance.ts`: table-driven RIR-delta branches (on-track / easier / harder /
  strength-drop), tolerance edges, null-anchor cold-start fallback.
- `index.ts`: golden meso re-run asserting reps now track the anchor and that
  overshooting RIR never regresses load; cold-start week 1 still equals the plan.
- `progression.test.ts`: the recorded `engine_decisions.output.reps` equals the
  displayed predicted reps for the same (anchor, weight, target RIR).
- Property: prescribed reps within the band; load never regresses on a hard
  (low-RIR) set; pain gate still blocks increases; deload still < peak.

## 5. Rollout

Single vertical-slice PR on `claude/dazzling-wozniak-86smpp`: engine + params
migration + seed + reset-to-prescription action/menu + tests, `main` kept
deployable. Activate v9 via the admin MCP `propose_engine_params` →
`activate_engine_params` flow (manual step, not auto). Replay a sample of the
user's recent decisions against v9 before activating (`replay_decisions`) to
confirm the new reps/grading look sane.

## 6. Open decisions (confirm on review)

1. **Grading basis** — adopt the RIR-inference grading (§3.2) now, or ship reps
   unification alone first and keep rep-count grading with a widened tolerance?
   Recommendation: do both together; the RIR basis is what makes overshoot safe.
2. **Predicted-reps band** — clamp to a fixed `{min,max}` or to the meso's
   intended rep range per slot? Latter needs a rep-range source on the plan.
3. **Anchor confidence floor** — should a low-confidence anchor (this user's
   history spans 5–35 lb) suppress the predictor in favor of the plan until
   enough comparable sets exist?
