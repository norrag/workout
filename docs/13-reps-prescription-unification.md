# 13 — Reps / Prescription Unification (plan)

Status: **plan, finalized for build as one vertical slice (2026-06-19).** It
changes no behavior by itself — it is the artifact to build against. Authoritative
intent lives in [04-feedback-engine.md](04-feedback-engine.md) (engine logic),
[10-metrics-spec.md](10-metrics-spec.md) (metric definitions + honesty
guardrails), and [11-workout-engine-explainer.md](11-workout-engine-explainer.md)
(the live reps ⇄ weight ⇄ RIR predictor as shipped). **This plan supersedes the
increment-on-actuals weight rule in 04 §3 and the rep-count grading there**; fold
those amendments into 04 when it lands. Update [PROGRESS.md](PROGRESS.md) too.

## 1. Problem

The logging screen shows **two different rep numbers for the same set**, and they
never reconcile:

- **`prescribed_reps`** — written by `prescribe()`, stored on the
  `workout_exercises` row. It is **not derived from the e1RM model**: the engine
  sets `reps = inputs.previous.reps`, carrying the prior week's prescribed reps
  forward unchanged (ultimately the plan's `initial_reps`), changing only via the
  rarely-taken `reps_first` "+1" branch. So it is effectively a frozen constant
  with no relationship to weight, strength, or target RIR. It is what the
  rationale quotes ("…×11 prescribed…") and what the engine grades against.
- **predicted reps** — what the logging field actually displays. `DayView.SetRow`
  renders `predictRepsAtWeight(e1rm_anchor, weight, target_rir, params)`
  (doc 11 §8), falling back to `prescribed_reps` only when there is no anchor.

### Worked example (real data — Dumbbell Curl 2-Arm, "Garron June '25 - Bulk")

| coordinate | stored `prescribed_reps` | displayed (predictor) | logged |
|---|---|---|---|
| W3·D3 (25 lb, 1 RIR) | 11 | **15** | 25 × 15 ×3 |
| W4·D3 (30 lb, 0 RIR) | 11 | **10** | — |

The displayed values are the e1RM predictor at the live **recency-weighted best**
anchor (≈ 40.6 lb), reproducing 15 and 10 exactly; the recency-weighted *mean*
anchor in the current source (≈ 37.3 lb) would predict 13 and 8. The user was
cued 15 and did 15 — the predictor was accurate; the prescribed `11` was the wrong
number. Persistence, the `engine_decisions` record, and the simulation were all
internally correct; the defect is the **divergence**, not a data-flow bug
(verified against the live DB; a user screenshot with no sets logged confirmed the
displayed 15).

### Why this matters

1. **The displayed target is right; the prescription is stale.** 11 reps at 25 lb
   is ~5 RIR for this user, not the prescribed 1 RIR. Defaulting the display to
   `prescribed_reps` would under-cue training.
2. **The rationale references a number the user never saw** ("did 25×15 vs 25×11
   prescribed").
3. **Grading runs against the frozen count.** Following the predictor the user
   "beats" 11 most weeks → +load every week; on a 0-RIR peak week the predictor
   cues few reps and logging them reads as a `big_miss` vs 11 → −10% load. Load
   moves for reasons that are an artifact of the two numbers disagreeing.

## 2. The model: two surfaces, two roles

The fix turns on separating what were tangled together:

- **The live logging field is an uncapped calculator.** You type a weight, it
  shows the reps to hit the week's target RIR at your current strength —
  faithfully, **no clamp**. A true 0-RIR single shows **1**; a light burnout shows
  **20+**. The only bound is the degenerate case already handled in code
  (`predictRepsAtWeight` floors at 1 when the weight ≥ e1RM; the curve caps the
  high end). It is a tool that respects exactly what you load.
- **The prescription targets a rep _window_ by choosing the weight.** The engine
  does **not** clamp the rep number at a fixed weight; it selects the **weight**
  that lands reps inside a productive window (**target 8–12, bounds 5–15**) at the
  target RIR, derived from the strength anchor. After an outlier set (e.g. a heavy
  1-rep test) the live field still honestly shows 1 at that weight, but the *next
  prescription* uses that same anchor to compute the load that yields ~8 reps and
  prescribes that — reeling you back to the window with your own data.

## 3. Decisions (locked)

1. **Live predictor = uncapped calculator.** No sanity-band clamp; it shows the
   model's honest reps for whatever weight is entered (floored at 1 by existing
   code). This replaces the earlier "fixed band clamp" idea.
2. **Prescription = rep-window targeting via weight selection.** Prescribe the
   weight that puts reps in `[rep_min, rep_max]` (5–15) centered on
   `rep_target_low..high` (8–12) at the week's target RIR, from the anchor. This
   **supersedes the increment-on-actuals rule** (04 §3): the anchor — not a fixed
   +5 lb step — drives the load.
3. **Reps unified.** `prescribed_reps` = the predicted reps at the prescribed
   weight + target RIR. By construction, at the prescribed weight **prescribed =
   predicted = displayed**; edit the weight and reps re-derive from the same model.
4. **Anchor = recency-weighted _best_ e1RM** (param `e1rm.anchor_method`, default
   `'best'`; switchable to `'mean'` if best proves too aggressive). One definition
   shared by the live field and the prescription.
5. **Grading moves from rep-count to RIR.** Infer achieved RIR from logged
   weight×reps (`impliedRirAtReps`) and compare to the week target. Overshooting
   intensity (going harder than asked) is at worst a **hold**, never a regress.
6. **Low-confidence anchor leans on the plan.** Below
   `reps_predict.min_confidence`, don't reprice the weight off a shaky anchor —
   hold the plan's weight/reps. (A clean 1-rep test is *high* confidence, so it
   still reels you back to the window; the floor only catches genuinely noisy
   anchors.)
7. **New exercise-menu item "Reset to prescription"** — returns an edited
   exercise's unlogged sets to the engine's prescribed weight (→ predicted reps).
8. **Behavior is param-gated for reversibility.** New weight-selection and grading
   ship behind mode flags (`weight_selection: 'rep_window' | 'increment'`,
   `grading: 'rir' | 'reps'`) so both old and new paths live in code and switching
   is an `engine_params` activation — no redeploy to roll back. Default the new
   modes in v9.

## 4. Changes

### 4.1 Engine — strength anchor (`src/lib/engine/reps.ts`, `queries/logging.ts`)

- `recencyWeightedE1rm` exposes the **best** (recency-weighted max) alongside the
  mean, selected by `params.e1rm.anchor_method`. `getExerciseE1rmAnchors` and the
  new progression call both read it — display and prescription share one anchor.
- New pure helper `weightForRepsAtRir(anchor, reps, targetRir, params)`: the
  converse of `predictRepsAtWeight`. Because both Epley and Brzycki are linear in
  weight, `e1RM = weight × k(effReps)` with `k = avg(1+eff/30, 36/(37−eff))` and
  `eff = reps + targetRir × rir_offset` — so `weight = anchor / k(eff)`,
  closed-form, no bisection. Used to pick the prescribed load for a target rep.

### 4.2 Engine — prescription (`src/lib/engine/index.ts`)

- Add `inputs.strengthAnchor: number | null` to `EngineInputs` (`types.ts`, zod);
  the caller (`progression.ts`) supplies the recency-weighted-best anchor (engine
  stays pure — no I/O, no clock).
- New weight selection (mode `rep_window`):
  1. Pick the **target reps** for the week inside the window. v1: double
     progression — carry the prior achieved reps; if the lifter topped the window,
     step toward `rep_target_low` and let the weight rise; otherwise progress reps
     toward `rep_target_high`. The RIR ramp (3→0 across the meso) biases the target
     toward the low end as weeks intensify. (Exact within-window schedule is a
     tuning detail — see §8.)
  2. `weight = roundToStep(weightForRepsAtRir(anchor, targetReps,
     week.targetRir), equipment, units)`.
  3. **Bound:** recompute predicted reps at the rounded weight; if rounding pushed
     them outside `[rep_min, rep_max]`, step the weight one increment toward
     center.
  4. `prescribed_reps = predictRepsAtWeight(anchor, weight, week.targetRir)` — in
     the window by construction.
- **The anchor subsumes increment + regression.** A better set raises the
  recency-weighted-best anchor → next weight rises; a bad week lowers it → next
  weight falls. So the explicit `+increment` (met/beat) and `regression_pct`
  (big_miss → −10%) rules retire under `rep_window` mode; the increment value
  survives only as the rounding/min-move step.
- **Cold start / null anchor:** fall back to the existing carried-forward /
  `initial.*` plan values so week 1 still equals the plan. Deload, pain gate,
  workload→sets, pump, and session dampener (`rules/feedback.ts`) are unchanged and
  still compose downstream.
- `increment` mode keeps today's exact behavior for rollback parity.

### 4.3 Engine — grading on RIR (`src/lib/engine/rules/performance.ts`)

- Under `grading: 'rir'`, classify on RIR delta instead of rep delta:
  - `achievedRir = impliedRirAtReps(anchor, best.weight, best.reps, params)`.
  - `on_track`: `|achievedRir − targetRir| ≤ params.rir_tolerance`.
  - easier (`achievedRir − targetRir > tolerance`): hold / damped.
  - harder (`targetRir − achievedRir > tolerance`): **hold** — a hard set is not a
    miss.
  - genuine under-performance is expressed through the falling anchor (4.2), so no
    separate −10% rule; `rir_regress_gap` only flags it in the rationale.
- Rationale reworded to never cite a hidden "×N prescribed" figure — phrase around
  weight delta + RIR (e.g. "+5 lb: on target at ~1 RIR; RIR steps 1→0").
- `reps` mode keeps today's classification for rollback parity.

### 4.4 UI — Day View (`src/app/(app)/log/[workoutId]/DayView.tsx`)

- No change to the predictor display path — it is already correct and stays
  uncapped. Once the engine unifies reps, `prescribed_reps` and the predictor
  agree at the prescribed weight, so the existing fallback chain is self-consistent.
- **Reset to prescription** menu item (`⋮` exercise menu, near "Add set" / "Skip
  remaining sets"): clears the exercise's `set_weights` overrides and any
  client-side manual-reps flag, restoring each unlogged set to `prescribed_weight`
  (→ predicted reps). Never touches logged sets (hard rule #5). Server action
  mirrors `updateSetWeightAction`; a single delete of the `set_weights` map for the
  `workout_exercise_id`.

### 4.5 Params + schema

- `engine_params` v9 adds: `weight_selection` (`'rep_window'`), `grading`
  (`'rir'`), `e1rm.anchor_method` (`'best'`), `rep_window` (`{rep_min: 5,
  rep_max: 15, rep_target_low: 8, rep_target_high: 12}`), `rir_tolerance`,
  `rir_regress_gap`, and `reps_predict.min_confidence`. Mirror in
  `DEFAULT_ENGINE_PARAMS` (`params.ts`) and the seed. Schema test so a bad row
  cannot activate (hard rule #3). Append-only migration; no edits to applied
  migrations (hard rule #2).
- No table change for reset-to-prescription (`set_weights` jsonb already exists,
  migration `20260616000003`).
- **v11 amendment (2026-06-24, standalone-prescription investigation).** Four
  gated, `.optional()` params (absent ⇒ legacy, so older rows are byte-identical):
  - `seed_from_anchor` — `seedMeso` mirrors the `seed_anchor` branch (§S1): seed
    week 1 from the recency anchor for the window's `target_low` at the start RIR,
    not the prior peak's rep count. The seed's `strengthAnchor` is carried as a
    *derived* input (excluded from the freshness fingerprint) so replay reproduces it.
  - `hold_rep_consistent` — when a pain gate / session dampener blocks an increase,
    hold the load AND keep reps on the Option-A schedule (the held *effective
    workload*), instead of clamping the anchor predictor to the window ceiling and
    emitting a `weight × reps @ RIR` triple whose implied RIR contradicts the target.
  - `session_dampen_require_both` — dampen only when BOTH high fatigue AND poor
    performance are reported (the legacy OR over-blocks a fatigued-but-strong session).
  - `e1rm.brzycki_max_eff_reps` + `e1rm.session_value_confidence_weights` (§S3, see
    doc 10 §1): Brzycki ≤ cutoff / Epley above, and low-confidence down-weighting in
    the `session_best` anchor value.
  Shipped in engine_params **v11 (inactive)**; activate after a replay diff
  (manual-operations.md). Mirrored in `params.ts` (schema `.optional()` fields) but
  **not** in `DEFAULT_ENGINE_PARAMS`, which stays = the active v10 row.

## 5. Tests (hard rule #3 — every behavior change covered)

- `reps.ts`: `best` vs `mean` selection; `weightForRepsAtRir` ∘
  `predictRepsAtWeight` round-trips (pick weight for N reps → predict N back);
  monotonicity (heavier ⇒ fewer reps).
- `index.ts`: golden meso under `rep_window`+`rir` — prescribed reps stay inside
  5–15; a heavy 1-rep test reprices to ~8 reps rather than 1; overshooting RIR
  never regresses load; cold-start week 1 = plan; deload still < peak; pain gate
  still blocks increases. Plus a parity golden proving `increment`+`reps` modes
  reproduce today's outputs exactly.
- `performance.ts`: table-driven RIR-delta branches (on-track / easier / harder /
  strength-drop), tolerance edges, null-anchor fallback.
- `progression.test.ts`: recorded `engine_decisions.output.reps` equals the
  displayed predicted reps for the same (anchor, weight, target RIR).

## 6. Rollout

Single vertical-slice PR on `claude/dazzling-wozniak-86smpp`: engine + v9 params
migration + seed + reset-to-prescription action/menu + tests; `main` stays
deployable. Activate v9 via the admin MCP `propose_engine_params` →
`activate_engine_params` (manual, not auto). Before activating, `replay_decisions`
/ `simulate_prescriptions` a sample of recent decisions against v9 and diff, to
confirm reps/weights/grading look sane on real data.

## 7. Reversibility (for reference)

Behaviorally this is a core change (weight selection + grading), shipped as code.
But it is low-risk to back out: it only affects **future** prescriptions (logged
history is never rewritten, hard rule #5); every decision is recorded with its
params version + hash and is replayable; and because both behaviors sit behind the
§3.8 mode flags, switching back to the v8-equivalent (`increment` + `reps`) is a
single `engine_params` activation, not a redeploy.

## 8. Open tuning details (resolve in build, not blockers)

- **Within-window rep schedule.** Exact double-progression rule (how `targetReps`
  moves with the RIR ramp and when the weight steps up). Start simple
  (center on `rep_target` with the RIR ramp biasing low), tune via replay.
- **Per-slot rep range (deferred refinement).** Center the window on the slot's
  intended range instead of the global 8–12. Needs schema plumbing: add a
  rep-range column to `meso_exercises` and copy `template_exercises.default_rep_range`
  onto it at meso-build time. Follow-up once this slice lands.

## 9. Amendments locked for build (2026-06-19)

Three improvements were reviewed and locked before implementing §4. They amend
decisions 2 and 4 and resolve the §8 within-window schedule. **Where §9 differs
from earlier sections, §9 wins.**

### 9.1 Rep window is **per-goal**, not global (amends decision 2)

The global `8–12 / 5–15` window is hypertrophy-shaped and wrong for strength work.
The window becomes a per-goal map `rep_window.<goal>` resolved inside `prescribe()`
from the macrocycle goal:

| goal | target_low–high | min–max |
|---|---|---|
| `hypertrophy` (and legacy `gain`) | 8–12 | 6–15 |
| `strength` | 3–5 | 2–6 |
| `cut` | 8–12 | 6–15 |
| `maintain` | 8–12 | 6–15 |

This requires **un-collapsing the engine goal**: today `engineGoal()`
(`progression.ts:75`) folds `strength` and `hypertrophy` both into `gain`, so
`prescribe()` cannot pick a window by goal. Extend the per-set `goalTypes` to
`cut | strength | hypertrophy | maintain`, keep `gain` as a parse-time **alias of
`hypertrophy`** for back-compat with stored decisions/params, and have
`engineGoal()` return the real goal. `progression_style` / window lookups key on
the widened goal. Per-slot windows (§8) remain the later refinement; per-goal is
the v1 baseline. The same unified mechanism (anchor → weight selection) serves
**both** strength and hypertrophy — there is no separate `load_first` path; the
goal only selects the window (and, later, the within-window schedule emphasis).

### 9.2 Within-window schedule = **Option A** double progression (resolves §8)

§4.2 step 1 left the schedule open and hinted "the RIR ramp biases the target
toward the **low** end as weeks intensify." Implemented literally that reproduces
the **load-creeps-every-week-at-fixed-reps** behavior the rep-window model exists
to remove. Resolve it the other way (Option A):

```
prevReps = best working-set reps logged vs last week's prescription
if prevReps >= window.target_high:        // topped the window
    targetReps = window.target_low        // reset to the bottom …
                                          // … weight rises (fewer eff-reps / higher anchor)
else:
    targetReps = clamp(prevReps + 1, window.target_low, window.target_high)
weight = roundToStep(weightForRepsAtRir(anchor, targetReps, week.targetRir))
```

Because `targetReps` climbs +1/week while the RIR ramp drops `targetRir` −1/week,
effective reps (`targetReps + targetRir·offset`) stay ~constant, so **the weight is
held within the meso** — the lifter works *up the rep range* at a steady load and
the load only moves when (a) they top the window (reset low, load steps) or (b) the
**anchor** changes (real strength change, incl. caught overperformance). This is
the behavior the whole thread asked for, now expressed inside doc 13's
anchor→weight framework rather than as a separate `rep_ramp` engine.

### 9.3 Anchor = **`session_best`** (amends decision 4)

`best` (recency-weighted single max set) is the right *direction* — we'd rather
catch a sandbagger than coddle over-trainers — but a lone blow-out set (e.g. a
20-rep burnout that leaves the following sets gutted) over-prices it. Compromise,
locked as the **default** `e1rm.anchor_method`:

1. Compute each recent working set's e1RM + recency weight (existing `estimateE1rm`
   + `0.5^(age/halflife)`).
2. Find the **recency-weighted best set** (`argmax` of `e1RM × recencyWeight`).
3. Anchor value = **mean of every working set's e1RM in that set's session**, where
   *session* = the set's `workout_exercise_id` (one exercise, one day).
4. Anchor confidence = the best confidence present in that session (lenient floor,
   matching the "lean aggressive" call).

So the best recent session sets the anchor, but a single fluke within it is
averaged against the diminished sets that followed it. `best` and `mean` stay
selectable via `e1rm.anchor_method` for replay/rollback. Pure: the caller supplies
each sample's `sessionKey` + `ageDays` (engine stays clock-free).

### 9.4 Surface rep deltas on Workout Complete (1.5)

`SummaryDelta` (`summary.ts`) carries only weight + sets today, so a rep-only
progression (the common Option-A week) renders as "all targets hold." Add
`previousReps`/`nextReps` and a clause ("Hack Squat reps 8 → 9") used when the
weight is unchanged.

### 9.5 Net effect on the build (§4)

Unchanged from §4 except: `rep_window` is a per-goal map; `anchor_method` default
is `session_best` and `E1rmSample` gains `sessionKey`; `engineGoal()` stops
collapsing; the §4.2 weight-selection uses the 9.2 schedule; `SummaryDelta` gains
reps. All still one vertical slice, param-gated (decision 8), append-only migration,
tests per hard rule #3.
