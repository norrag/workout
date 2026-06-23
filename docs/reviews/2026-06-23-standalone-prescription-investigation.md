# Investigation — runaway prescribed reps & suspect e1RM on standalone mesos

**Date:** 2026-06-23
**Reporter context:** Madeline's recent standalone-mesocycle workouts show
prescribed reps in the upper teens to upper 20s, and e1RM values that look
inflated. Hypothesis raised: standalone (no-macrocycle) usage may be involved.
**Status:** investigated, root-caused against live data; solutions assessed below.
This confirms and extends the previously-filed gap **T-A6 / PR22 / PR23**
(`docs/triage/A-engine-metrics.md`).

---

## 1. Summary

The symptom is real and reproduces directly in the database. It is **not** one
bug but three compounding defects, all in the *seeding* and *e1RM* paths — the
week-to-week progression engine (`prescribe()` in rep_window mode) is working
correctly. In order of impact:

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
- **Week N→N+1:** `prescribe()` in rep_window mode, correct — re-prices load off
  the recency anchor and keeps reps in-window (subject to the inflated anchor in
  §2.3 pinning at the ceiling).
- **Swap-in / cold start mid-meso:** `prescribe()`'s `seed_anchor` branch
  (`index.ts:103-151`) *does* use rep_window + anchor → window-low reps. So the
  correct seeding logic already exists — it is simply **not used by the meso-start
  seed** (`seedMeso`).

Net: there is no "standalone bug" in goal handling. The defects live in the
**meso-start seed** (`seedMeso` + `v_exercise_prs`) and the **e1RM estimator's
high-rep behavior**, both of which a standalone-only cadence exercises constantly.

---

## 4. Solutions (assessed)

### S1 — Seed week 1 the same way swap-in already does (rep_window from anchor). **Primary.**
Make `startMeso`/`seedMeso` derive the seed exactly like `prescribe()`'s
`seed_anchor` branch: compute the recency-weighted anchor for each exercise
(`getExerciseE1rmAnchors`, already used elsewhere), pick the weight for the
window's `target_low` reps at week-1 RIR, and set `prescribed_reps =
predictRepsAtWeight(...)` bounded to the window. Fall back to `initial.*` plan
values when there's no confident anchor (today's null-`priorPeak` behavior).
- **Effect:** week 1 lands at ~8 reps in-window instead of 16–30. Directly kills
  the headline symptom; this *is* T-A6, finished properly (reps as well as
  weight).
- **Scope:** `generation.ts` (thread anchors into `SeedCtx`/`seedExerciseRow`),
  `engine/index.ts` `seedMeso` signature, `fingerprint.ts buildSeedInputs`.
  Engine stays pure (caller supplies anchors). Golden + seed tests per hard
  rule #3. Append-only — no migration needed if anchors are passed in.
- **Risk:** low–medium. Changes seed numbers; covered by goldens. Behavior can
  be param-gated alongside the existing `weight_selection` flag for rollback.

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

### S3 — Tame the e1RM estimator on high-rep sets. **Recommended.**
The Brzycki blowup is the "suspect e1RM" generator. Options (combine):
- Lower the Brzycki cutoff far below 36 (it is only valid to ~10–12 reps); above
  it, use Epley alone or a flattened curve. A param (`e1rm.brzycki_max_eff_reps`)
  keeps it tunable per hard rule #3.
- Optionally cap effective reps contributing to the anchor, or exclude/
  down-weight `low`-confidence sets in `session_best` *value* selection (today
  confidence gates the label but not the averaged value).
- Consider raising `reps_predict.min_confidence` above `low` so genuinely noisy
  anchors fall back to plan values.
- **Effect:** anchors stop inflating; the live predictor and the rep_window stop
  pinning at 15 / showing 30. **Behavior change to the live calculator and
  grading — needs replay before activating** (admin MCP `replay_decisions` /
  `simulate_prescriptions` on a sample, per doc 13 §6).
- **Risk:** medium. Touches a core metric used app-wide; param-gated + replayed.

### S4 — Per-slot / per-meso rep ranges (product). **Optional follow-up.**
Madeline genuinely trains high-rep machine work (leg curl 100×30, calf ×22, leg
press ×27). The global hypertrophy window 6–15 may simply be tighter than her
intended style. doc 13 §8 already defers "center the window on the slot's
intended range" (needs a rep-range column on `meso_exercises`). Not required to
fix the bug, but it is the right home for "this lift should be 15–25 reps."

### Recommended sequence
**S1 + S2** fix the headline runaway reps and the fabricated PR with low risk and
no behavior change to the live calculator. **S3** then removes the residual
inflation (predictor showing 30, window pinned at 15); ship it param-gated and
replay first. **S4** is a separate product decision.

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
- `src/lib/engine/reps.ts:162-231` `recencyWeightedE1rm` / `session_best`.
- `docs/triage/A-engine-metrics.md` PR22/PR23 → **T-A6** (this report closes the
  analysis for it and adds the reps + view + e1RM dimensions).
</content>
