# Investigation — runaway prescribed reps & suspect e1RM on standalone mesos

**Date:** 2026-06-23
**Reporter context:** Madeline's recent standalone-mesocycle workouts show
prescribed reps in the upper teens to upper 20s, and e1RM values that look
inflated. Hypothesis raised: standalone (no-macrocycle) usage may be involved.
**Status:** investigated, root-caused against live data; solutions assessed below.
**Built 2026-06-24** — S1/S2/S3/S5 implemented param-gated and shipped in
engine_params **v11 (INACTIVE)**; S4 deferred. Activation is the documented manual
step after a replay diff (see `docs/deployment/manual-operations.md` and the
checklist at the end of this file). This confirms and extends the previously-filed
gap **T-A6 / PR22 / PR23** (`docs/triage/A-engine-metrics.md`).

---

## 1. Summary

The symptom is real and reproduces directly in the database. It is **not** one
bug but **four** compounding defects across the *seeding*, *e1RM*, and
*progression* paths. (The first pass said the week-to-week `prescribe()` path was
"working correctly"; the editor review correctly pushed back — defect #4 below
shows it is not, see §2.4.) In order of impact:

1. **Week-1 meso seed copies the PR rep count verbatim** (`seedMeso`). It backs
   the *weight* off 7.5% but carries `prescribed_reps = priorPeak.reps`
   unchanged. It never applies the rep-window weight selection that the rest of
   the engine uses, so week 1 escapes the 6–15 hypertrophy window entirely.
2. **`v_exercise_prs` reports per-column maxes**, so `best_weight` and
   `best_reps` come from *different sets*. The `priorPeak` handed to `seedMeso`
   is a set the user never performed (heaviest weight × most reps).
3. **e1RM blows up on high-rep sets.** The Epley/Brzycki estimate is fed raw
   20–30-rep sets; Brzycki's denominator (`37 − effReps`) goes near-zero, so a
   single 30-rep set produces an e1RM 2–4× reality. That inflated anchor drives
   the *uncapped* live reps predictor (and pins the rep-window at its 15 ceiling)
   for the rest of the meso.

4. **The progression "hold" path emits internally-inconsistent prescriptions**
   (added after editor review — see §2.4). When a load increase is blocked
   (session dampener or pain gate), `prescribe()` resets the weight to the
   last-handled load and then derives reps by **clamping the predictor to the
   window ceiling**. The result is a `weight × reps @ targetRir` triple whose
   *implied* RIR is nowhere near the target — e.g. W2D1 produced `100 × 15 @ 2
   RIR` (implied e1RM ≈168) while the anchor said 386. It never re-prices the
   load to land reps in 8–12 at the target RIR, which is the whole point of the
   rep-window model.

The **standalone connection** is real but indirect: standalone mesos are started
back-to-back via `startMeso → seedMeso`, so every new meso re-seeds week 1 from
all-time PRs and re-injects defects #1/#2. There is no separate code path for
"with a macrocycle" — but a standalone-only workflow maximizes how often the
broken seed runs, and Madeline's genuinely high-rep machine style maximizes both
`best_reps` and the Brzycki blowup.

---

## 2. Evidence (Madeline, live DB)

Profile `0af27789-…`, intermediate. **17 mesocycles, all `macrocycle_id = null`,
zero macrocycles.** Active meso: "Madeline total body -June 2026" (`7662bef4`),
week 2. RIR ramps are normal (3→2→1→0, deload 4). Active engine_params **v10**
(`weight_selection=rep_window`, `grading=rir`, `anchor_method=session_best`,
hypertrophy window `target 8–12 / bounds 6–15`, `seed_backoff=0.925`,
`reps_predict.min_confidence=low`).

### 2.1 Week-1 prescriptions = PR `best_reps`, exactly

| Exercise | Week-1 Rx (lb × reps @ RIR) | `v_exercise_prs.best_reps` |
|---|---|---|
| Seated Leg Curl | 110 × **30** @ 3 | **30** |
| Leg Press | 210 × **27** @ 3 | **27** |
| Calf Machine | 130 × **22** @ 3 | **22** |
| Barbell Squat (Narrow) | 155 × **16** @ 3 | **16** (best_reps) |
| Machine Flye | 55 × **17** @ 3 | **17** |
| Machine Pulldown | 45 × **17** @ 3 | **18** |
| Leg Extension | 95 × **17** @ 3 | **17** |

Prescribed reps track `best_reps` one-for-one. Contrast **week 2** of the same
meso (the rep_window progression path): squat 135×15, leg curl 100×15, hip
thrust 70×8, leg press 140×10, leg ext 95×8 — i.e. back inside 6–15. **Only the
seeded week is broken.**

### 2.2 `priorPeak` is a set she never did

`v_exercise_prs` definition:

```sql
max(weight)                         AS best_weight,
max(reps)                           AS best_reps,
max(weight * (1 + reps/30.0))       AS best_e1rm   -- Epley, no RIR, no cap
GROUP BY user_id, exercise_id
```

These are **independent per-column maxes**. Seated Leg Curl returns
`best_weight=140, best_reps=30`, but her actual sets are 140×12 (heavy day) and
100×30 (a burnout) — never 140×30. `seedMeso` receives `{weight:140, reps:30}`
and prescribes `140×0.925 ≈ 130 × 30`. A fabricated set drives the seed.

### 2.3 e1RM blowup feeds the uncapped predictor

`best_e1rm` for Seated Leg Curl is **205** (a leg-curl "1RM"). The engine anchor
is worse, because it adds the RIR offset and averages in Brzycki. Her 2026-06-16
leg-curl session logged `100 × 30 @ 3 RIR`:

```
effReps = 30 + 3×rir_offset(1) = 33
Epley   = 100 × (1 + 33/30)      = 210
Brzycki = 100 × 36 / (37 − 33)   = 900     ← denominator = 4
estimate = (210 + 900)/2         ≈ 555 lb
```

`session_best` anchoring picks that session (it has the max recency-weighted
e1RM) and averages its sets, landing the leg-curl anchor near **~380 lb e1RM**.
`predictRepsAtWeight` is intentionally **uncapped** (doc 13 §2/§3.1), so at a
working load of ~120 lb it returns ~34 predicted reps — the "upper 20s" the user
sees. Even the bounded rep_window path then pins prescriptions at the **15
ceiling** (week-2 day-1 squat/curl/calf/flye/pulldown are all exactly 15),
because the inflated anchor wants far more than 15.

Confidence on these high-rep sets is correctly `low`, but `min_confidence=low`
lets them through, and the live predictor ignores confidence entirely.

**On the Brzycki cutoff (responding to editor note 1):** agreed. Brzycki tracks
Epley to ~10 reps, then inflates increasingly above it; the `≥36` fallback in
`e1rm.ts` is far too high to matter. The accepted rule (S3) is **Brzycki only
≤10 reps, Epley only >10 reps** — i.e. drop the average entirely outside the band
where they agree. This alone would have cut the leg-curl set's contribution from
≈555 toward ≈210 (Epley at eff 33), and with the high-rep sets also down-weighted
(below), the anchor stops being 386.

### 2.4 What actually happened at W2·D1 (the recorded decision)

This answers editor notes 2 and 3 directly, from the `engine_decisions` row that
produced the W2·D1 Seated Leg Curl prescription:

| field | value |
|---|---|
| `previous` | 110 × 30 @ 3 RIR (the bad W1 seed) |
| `actualSets` (logged) | 100 × 20, 100 × 30 |
| `strengthAnchor` | **386 (confidence: low)** |
| `workoutFeedback` | fatigue **3**, effort 3, performance 3 |
| `output` | **100 × 15 @ 2 RIR** |
| `trace` | `hold 100 lb, reps to 15 of 8–12 (anchor e1RM 386 lb)` · `rough session reported: increases dampened` · `harder than asked (~1 vs 3 RIR) — held, not a miss` · `target RIR steps 3 to 2` |

Step by step (`engine/index.ts` rep_window path):

1. The rep-window logic **did** compute a repriced load — anchor 386 for the
   window bottom (8 reps) at 2 RIR is `386 / k(eff 10) ≈ 289 lb`.
2. **The session dampener fired and reset it.** `sessionDampened` is true when
   `overallFatigue ≥ session_fatigue_dampen_threshold (=3)` **OR**
   `performanceRating ≤ session_performance_dampen_threshold (=1)`. Her fatigue
   was exactly 3, so it tripped — even though performance (3/4) was good. The code
   then does `if ((painGated || sessionDampened) && w > baseWeight) w = baseWeight`
   → weight snaps back to the last-handled load, **100 lb**.
3. **Reps are then clamped to the window, masking the inconsistency.**
   `predictRepsAtWeight(386, 100, 2) ≈ 34`, clamped to `max = 15`. So the
   prescription is `100 × 15 @ 2 RIR`, whose *own* implied e1RM (same averaged
   formula) is ≈168 — neither the anchor (386) nor a 2-RIR set (100 lb is ~19 RIR
   for a 386 athlete). The "@ 2 RIR" label is false.

**This resolves editor note 3's contradiction.** The earlier text ("re-prices
load … subject to the inflated anchor pinning at the ceiling") was self-conflicting
because the engine did **not** actually re-price — the dampener held the weight and
the reps were clamped. The §3 description below is corrected accordingly.

**This validates editor note 2.** Even with a *correct* anchor, this path would
still have held the weight and re-derived reps by clamping, rather than answering
"what load lands 8–12 reps at the target RIR?" The right behavior when a real
increase is warranted but the session is fatigued is a *deliberate* hold of the
**prior consistent prescription**, not a stale weight with ceiling-clamped reps.
Two distinct bugs are tangled here:

- **The dampener is too blunt.** A single fatigue=3 rating (with good
  performance) fully blocks the re-price. Worth a tuning pass: require *both*
  poor signals, or dampen the *size* of the increase rather than zeroing it.
- **The hold path is not rep-consistent** (defect #4). Whenever the engine holds
  a weight, the prescribed reps must remain consistent with `(weight, anchor,
  targetRir)` — or it should carry the prior prescription forward intact. Silently
  clamping the uncapped predictor to the window ceiling is what manufactures the
  dishonest triple. (With the bad anchor this is glaring; with a corrected anchor
  it is quieter but the mechanism is still wrong.)

```
Editors note:
1.	The Brzycki becomes unreliable above 10 reps. Brzycki is slightly more conservative than Epley less than 10 reps, it agrees with Epley right around 10 reps, and becomes increasingly inflated relative to Epley above 10 reps. Frankly, there seems very narrow benefit to including Brzycki at all, but the only argument is that its slightly more conservative at heavy loads below 10 reps. If anything, we could use Brzycki <=10 reps, and move to Epley >10 reps. Even at that, the improvement is modest.
2.	So, in this case, I get that the e1RM being fed to the prescription engine was bad – so its not precisely fair or relevant to judge the output of the engine based on bad input data which will be corrected – However, the recorded decision chain which fed W2D1 prescription was:
a.	Input (from W1D1): 100lb x 20 reps set one and 30 reps set two, 3RIR, strength anchor of 386 lbs
b.	Output (for W2D1): 100lb x 15 reps x 2 sets at the target 2RIR (implied e1RM via same Epley/Brzycki average: 168.3 lbs)
3.	My issue with the above point is that the output in this case simply kept the same weight and bounded the reps at the cap of 15, which in itself did not even produce an internally-consistent output of the targeted e1RM. What the progression should have done effectively answer ‘what weight, when performed in a real rep range of 8-12 with 2RIR (next weeks target), would produce the target e1RM of 386 lbs).’ This answer would have led the engine to reprice the high-volume input work into the desired rep range and effectively reason that ‘100 lb is much lighter than the athlete’s current capacity. Let’s increase load materially to match the previous strength anchor, reduce reps back toward the lower end of target range and step up the athlete’s reps until they can complete the increased weight for at least 12 reps on all sets, and then repeat the process’.
Effectively, even if though the strength anchor was incorrect for other reasons, the engine still would not have performed the correct actions even if the strength anchor was corrected.
```

---

## 3. How the engine behaves *without* a macrocycle (locking it down)

- **Goal/window:** `engineGoal(null)` → `hypertrophy` → window `target 8–12 /
  bounds 6–15` (`engine-goal.ts`, `index.ts:repWindowFor`). Standalone mesos are
  *fine* here; they are not a special engine path.
- **Week-1 seed:** `startMeso` → `seedMeso(priorPeak, initial, …)` with
  `priorPeak` from `v_exercise_prs` (all-time, per-column max). `seedMeso`
  **does not take the strength anchor and does not use rep_window** — it returns
  `weight = priorPeak.weight × seed_backoff`, `reps = priorPeak.reps`. This is
  defects #1 and #2.
- **Week N→N+1:** `prescribe()` in rep_window mode. When un-gated it re-prices
  load off the recency anchor to land reps in-window. **But when the pain gate or
  session dampener fires, it does *not* re-price** — it resets the weight to the
  last-handled load and clamps reps to the window ceiling (defect #4, §2.4). The
  earlier draft's "re-prices … pinned at the ceiling" was contradictory: at W2·D1
  the dampener held the weight, so no re-price happened and the reps were clamped
  to 15 — an internally inconsistent `100 × 15 @ 2 RIR`.
- **Swap-in / cold start mid-meso:** `prescribe()`'s `seed_anchor` branch
  (`index.ts:103-151`) *does* use rep_window + anchor → window-low reps. So the
  correct seeding logic already exists — it is simply **not used by the meso-start
  seed** (`seedMeso`).

Net: there is no "standalone bug" in goal handling. The defects live in the
**meso-start seed** (`seedMeso` + `v_exercise_prs`), the **e1RM estimator's
high-rep behavior**, and the **progression hold path** (`prescribe()` under the
dampener/pain gate). A standalone-only cadence exercises the first two constantly;
the third bites any user whose session feedback trips the dampener.

```
Editors note:
You said “in rep_window mode, correct — re-prices load off the recency anchor and keeps reps in-window (subject to the inflated anchor in §2.3 pinning at the ceiling).” This statement seems to be conflicting – if it re-priced the load then it wouldn’t be pinned at the ceiling. We see this played out in the example above. 
```

---

## 4. Solutions (assessed)

### S1 — Seed week 1 the same way swap-in already does (rep_window from anchor). **Primary.**
Make `startMeso`/`seedMeso` derive the seed exactly like `prescribe()`'s
`seed_anchor` branch: compute the recency-weighted anchor for each exercise
(`getExerciseE1rmAnchors`, already used elsewhere), pick the weight for the
window's `target_low` reps at week-1 RIR, and set `prescribed_reps =
predictRepsAtWeight(...)` bounded to the window. Fall back to `initial.*` plan
values when there's no confident anchor (today's null-`priorPeak` behavior).

> **Amendment (2026-06-25) — the `priorPeak × back-off` fallback is retired, not kept.**
> S1 as built layered the anchor seed *in front of* the legacy prior-peak branch but
> left that branch in place as a fallback. Owner ruling: the prior-peak × back-off
> seed is fundamentally broken (carries `priorPeak.reps` verbatim — the live
> "calf machine 175×20 → 180×20" and "leg curl 130×30" seeds — and reads a
> never-performed per-column-max set pre-S2) and **must never be used again.** The
> decided precedence is **confident anchor → user `initial_*` (manual seed) →
> unseeded/prompt**; the engine never fabricates a seed from a peak set. This is
> tracked as `T-I5` in [`docs/triage/I-engine-v9.md`](../triage/I-engine-v9.md)
> (decision + principle) and `docs/triage/backlog.md`. Retire `meso_seed_backoff_pct`
> with the branch.
- **Effect:** week 1 lands at ~8 reps in-window instead of 16–30. Directly kills
  the headline symptom; this *is* T-A6, finished properly (reps as well as
  weight).
- **Scope:** `generation.ts` (thread anchors into `SeedCtx`/`seedExerciseRow`),
  `engine/index.ts` `seedMeso` signature, `fingerprint.ts buildSeedInputs`.
  Engine stays pure (caller supplies anchors). Golden + seed tests per hard
  rule #3. Append-only — no migration needed if anchors are passed in.
- **Risk:** low–medium. Changes seed numbers; covered by goldens. Behavior can
  be param-gated alongside the existing `weight_selection` flag for rollback.

   ```
   Editors note:
   Accepted 
   ```

### S2 — Fix `v_exercise_prs` to report a *coherent* best set. **Strongly recommended.**
Replace the three per-column `max()`es with the single best-e1RM set's
`(weight, reps)` (e.g. `DISTINCT ON (user,exercise) … ORDER BY e1rm DESC`), and
compute `best_e1rm` with the **same capped estimator the engine uses** (§S3), not
raw Epley. Append-only migration replacing the view (security_invoker preserved;
RLS unaffected — it reads `logged_sets`).
- **Effect:** `priorPeak` becomes a real set; PR display elsewhere stops showing
  fabricated weight×rep pairs; `best_e1rm` stops over-reporting. Benefits seed
  (even if S1 weren't done), stats, and MCP — these share the view per CLAUDE.md.
- **Risk:** low. Pure read-model change; verify other consumers
  (`stats.ts`, MCP) expect a coherent set (they should).

     ```
   Editors note:
   Accepted 
   ```

### S3 — Tame the e1RM estimator on high-rep sets. **Accepted (rule locked).**
The Brzycki blowup is the "suspect e1RM" generator. The locked rule (per editor):
- **Brzycki only for effective reps ≤ 10; Epley only for > 10** — drop the
  average entirely. Below 10 they nearly agree (Brzycki slightly more conservative,
  which we keep); above 10 Brzycki inflates, so Epley alone. Param
  `e1rm.brzycki_max_eff_reps = 10` (tunable, hard rule #3). This replaces both the
  `≥36` fallback in `e1rm.ts` *and* the averaging in `reps.ts`
  (`e1rmAtEffectiveReps`, `weightForRepsAtRir`'s `k`) — all three must use the
  one switch so forward/inverse stay consistent.
- Additionally, **down-weight `low`-confidence sets in the `session_best` *value*,
  not just the label.** Today confidence gates whether the anchor is *used* but the
  averaged value treats a 30-rep set the same as a clean 8-rep set. A 20–30-rep
  burnout should contribute little to the strength anchor.
- Consider raising `reps_predict.min_confidence` above `low` so a genuinely noisy
  anchor falls back to **plan values** rather than re-pricing off a shaky number.

  > **"What exactly are plan values?"** (editor) — the planner-board cold-start
  > numbers stored on `meso_exercises.initial_weight / initial_reps / initial_sets`
  > (copied from the template), plus, mid-meso, the prior week's carried-forward
  > prescription (`previous`). Concretely: when there's no usable anchor,
  > `prescribe()`'s cold-start branch returns `previous ?? initial` (see
  > `index.ts:152-177`); `seedMeso` with a null `priorPeak` returns `initial.*`.
  > "Fall back to plan values" = use those configured defaults instead of anything
  > derived from history.
- **Effect:** anchors stop inflating; the live predictor and the rep_window stop
  showing 30 / pinning at 15. **Behavior change to the live calculator and grading
  — needs replay before activating** (admin MCP `replay_decisions` /
  `simulate_prescriptions` on a sample, per doc 13 §6).
- **Risk:** medium. Touches a core metric used app-wide; param-gated + replayed.

### S5 — Make the progression "hold" path rep-consistent (defect #4). **New — recommended.**
Surfaced by editor note 2/§2.4. When `prescribe()` blocks a load increase
(`painGated || sessionDampened`) in rep_window mode, it currently resets weight to
`baseWeight` and then clamps the predictor to the window ceiling, producing a
`weight × reps @ RIR` triple whose implied RIR contradicts the target.
- **Fix:** when holding, keep the prescription **internally consistent** — carry
  the prior prescription's reps forward (a true hold), or derive reps from
  `(heldWeight, anchor, targetRir)` *without* clamping into the window when the
  held weight is far off-target; in that off-target case the rationale should say
  the load is below capacity rather than emit a false "@ N RIR". Never present a
  set as `@ 2 RIR` that the model thinks is ~19 RIR.
  > I'm not sure I agree with this entirely, or at least I am not entirely sure I understand.
  > What should really be happening when holding is that the effective workload is held. i.e.
  > keep the workload the same during the next week. With the RIR ramp progressing the next
  > week by one rep while the workload did not increase, this effectively reduces the prescribed
  > e1RM of the subsiquent week/day. 
- **Tuning (separate, same area):** the session dampener trips on a single
  `fatigue ≥ 3` with no corroborating poor performance. Consider requiring *both*
  signals, or dampening the *magnitude* of the increase (e.g. half-step) instead of
  zeroing it, so a fatigued-but-strong session still progresses sanely.
  > Yeah, probably do both.
- **Scope:** `engine/index.ts` rep_window hold branch + `rules/feedback.ts`
  threshold logic; table-driven tests for every hold/gate branch asserting the
  output's implied RIR stays within `rir_tolerance` of the target (or reps equal
  the carried prescription). Param-gated; replay before activating.
- **Risk:** medium. Core progression behavior; fully covered by goldens + replay.
- **Note:** S5 is partly masked once S3 fixes the anchor (a correct anchor makes
  the held-weight clamp land in-window and look consistent), but the mechanism is
  still wrong and should be fixed independently — it is the engine-logic half of
  what the editor identified, where S3 is the data-quality half.

### S4 — Per-slot / per-meso rep ranges (product). **Optional follow-up.**
Madeline genuinely trains high-rep machine work (leg curl 100×30, calf ×22, leg
press ×27). The global hypertrophy window 6–15 may simply be tighter than her
intended style. doc 13 §8 already defers "center the window on the slot's
intended range" (needs a rep-range column on `meso_exercises`). Not required to
fix the bug, but it is the right home for "this lift should be 15–25 reps."
 
```Deferr S4 for now ```

### Recommended sequence (post-review)
1. **S1 + S2** — fix the headline runaway reps (seed via anchor/rep-window) and the
   fabricated PR view. Low risk, no change to the live calculator. *Accepted.*
2. **S3** — Brzycki ≤10 / Epley >10 + down-weight low-confidence sets + (optional)
   raise `min_confidence`. Removes the inflated anchor. *Accepted.* Param-gated;
   replay Madeline's recent decisions before activating.
3. **S5** — make the hold/gate path rep-consistent and de-blunt the dampener.
   *Recommended.* Param-gated; goldens assert implied RIR ≈ target on every hold.
4. **S4** — per-slot rep ranges. *Deferred.*

S3 and S5 are complementary: S3 fixes the *input* (the anchor), S5 fixes the
*logic* that mishandles a held weight. Do both; neither alone fully fixes §2.4.

### Implementation checklist (for the build session)

**Build status (2026-06-24):** S2, S3, S1, S5 all done and param-gated; v11 shipped
INACTIVE; no data rewrite. Activation pending the replay diff. Per-item notes below.

- [x] **S2 (view):** `20260624000001_v_exercise_prs_coherent_set.sql` — `DISTINCT ON
      (user_id, exercise_id) … ORDER BY <capped e1rm> DESC`; `best_e1rm` via the §S3
      estimator reading `rir_offset` + `brzycki_max_eff_reps` from the active params
      (tracks the engine). `security_invoker` preserved. Validated on live data.
      Consumers display/seed it as "your best" — coherent now, not fabricated.
- [x] **S3 (e1rm):** `e1rm.brzycki_max_eff_reps` (+ `session_value_confidence_weights`)
      added `.optional()` to the schema; the switch lives in the shared `e1rmFactor()`
      used by `e1rm.ts` (`estimateE1rm`) AND `reps.ts` (`e1rmAtEffectiveReps`, the
      inverse `k`) so forward/inverse agree; low-confidence down-weighted in the
      `session_best` value. Round-trip + cutoff-boundary tests added.
- [x] **S1 (seed):** anchors threaded into `startMeso` / `regenerateOpenWorkouts` /
      `addWorkoutExercises` (`getExerciseE1rmAnchors`, moved to a leaf `anchors.ts`);
      `seedMeso` is anchor-aware (mirrors the `seed_anchor` branch), gated by
      `seed_from_anchor`. `strengthAnchor` carried in `buildSeedInputs` /
      `seedEngineInputs` (derived ⇒ fingerprint unaffected) and reproduced by the
      seed recompute (`regeneration.ts recomputeSeed`).
- [x] **S5 (hold path):** `hold_rep_consistent` makes the gated rep_window hold keep
      reps on the Option-A schedule (held effective workload), not the ceiling-clamped
      predictor; `session_dampen_require_both` de-blunts the dampener
      (`rules/feedback.ts`). Table-driven hold/gate/dampener tests added.
- [x] **Gating:** all four behind `.optional()` engine_params flags (absent ⇒ legacy,
      so v10's hash/replayability/fingerprint are untouched — guarded by a
      param-schema test); shipped as v11 INACTIVE
      (`20260624000002_engine_params_v11_standalone_fixes.sql`). **Activate manually
      after a `replay_decisions` diff** (manual-operations.md).
- [x] **No data rewrite:** logged history untouched. Existing open prescriptions
      refresh through the normal freshness/regeneration path once v11 is active (no
      forced reconcile — the read-path reconcile is lazy + idempotent and picks them
      up as the params version moves).
- [ ] **S4 (per-slot rep ranges):** deferred per the assessment above.
- [ ] **Activation:** run the replay diff on Madeline + a couple users, then flip v11
      active (manual-operations.md).

#### Original checklist (reference)

- [ ] **S2 (view):** append-only migration redefining `v_exercise_prs` —
      `DISTINCT ON (user_id, exercise_id) … ORDER BY <capped e1rm> DESC` so
      `best_weight/best_reps` come from one real set; compute `best_e1rm` with the
      S3 rule. Preserve `security_invoker`. Check consumers (`stats.ts`, MCP,
      `generation.ts prById`) still expect one coherent set.
- [ ] **S3 (e1rm):** add `e1rm.brzycki_max_eff_reps` to the params schema +
      defaults + seed; apply the switch in `e1rm.ts` (`estimateE1rm`) **and**
      `reps.ts` (`e1rmAtEffectiveReps`, the `k` in `weightForRepsAtRir`) so
      forward/inverse agree; down-weight `low`-confidence in `session_best` value.
      Round-trip + monotonicity tests.
- [ ] **S1 (seed):** thread per-exercise anchors into `startMeso` /
      `regenerateOpenWorkouts` (`getExerciseE1rmAnchors`, already used in
      `progression.ts`); make `seedMeso` anchor-aware, mirroring the `seed_anchor`
      branch (`index.ts:103-151`) — weight for window `target_low` at start RIR,
      reps = bounded predictor; fall back to `initial.*` when no confident anchor.
      Carry `strengthAnchor` in `buildSeedInputs`/`seedEngineInputs` (it is a
      *derived* key, so the freshness fingerprint is unaffected) and verify the
      seed-decision/replay path (`regeneration.ts`) reproduces it.
- [ ] **S5 (hold path):** in `index.ts` rep_window branch, when
      `painGated || sessionDampened`, keep reps consistent with the held weight
      (or carry `previous` reps); revisit the dampener in `rules/feedback.ts`.
- [ ] **Gating:** new behaviors behind `engine_params` flags (extend the existing
      `weight_selection` / `grading` pattern); ship as a new params version,
      **activate manually after a `replay_decisions` diff** on Madeline + a couple
      other users (doc 13 §6). Append-only migration; param-schema test (hard
      rule #3).
- [ ] **No data rewrite:** logged history is never touched (hard rule #5). Existing
      open prescriptions refresh through the normal freshness/regeneration path
      once the new params version is active — decide at build time whether to force
      a reconcile for in-flight mesos or let them roll forward.

---

## 5. Appendix — key code references

- `src/lib/engine/index.ts:423` `seedMeso` — carries `priorPeak.reps`; no anchor,
  no rep_window. (Defect #1.)
- `src/lib/engine/index.ts:103-151` `seed_anchor` branch — the *correct* seeding
  logic that `seedMeso` should mirror.
- `src/lib/queries/generation.ts:76-143` `seedExerciseRow` / `startMeso` —
  builds `priorPeak` from `v_exercise_prs`; would thread anchors for S1.
- `v_exercise_prs` — per-column maxes. (Defect #2.)
- `src/lib/engine/e1rm.ts:26-29,47-51` Brzycki + the `>=36` cutoff. (Defect #3.)
- `src/lib/engine/reps.ts:22-27,92-93` averaged Epley/Brzycki forward + inverse
  `k` — must adopt the same S3 switch as `e1rm.ts`. (Defect #3.)
- `src/lib/engine/reps.ts:162-231` `recencyWeightedE1rm` / `session_best` — value
  selection ignores confidence (S3 down-weighting). (Defect #3.)
- `src/lib/engine/index.ts:223,311-313,318-337` rep_window hold + reset-to-
  `baseWeight` + clamp-to-window reps. (Defect #4 / S5.)
- `src/lib/engine/rules/feedback.ts:54-59` session dampener (`fatigue ≥ 3` OR
  `performance ≤ 1`) — over-blunt. (Defect #4 / S5 tuning.)
- `docs/triage/A-engine-metrics.md` PR22/PR23 → **T-A6** (this report closes the
  analysis for it and adds the reps + view + e1RM dimensions).
</content>
