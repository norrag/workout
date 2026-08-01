# Exercise-level RIR assignment — assessment

**Date:** 2026-07-31 · **Status: rationale record — decided.** The owner answered
every question in §9 (A1–A8, 2026-07-31) and the settled design now lives in the
authoritative build spec **[`docs/21-exercise-level-rir.md`](../21-exercise-level-rir.md)**;
**where this doc conflicts with 21, 21 wins.** Read this one for *why*, doc 21
for *what to build*. Backlog **N67** (feature) + **N68** (the prerequisite defect
it exposed, absorbed as doc 21 Phase 1). Replaces
[`2026-07-31-coach-override-prescriptions.md`](./2026-07-31-coach-override-prescriptions.md)
(closed per A8; its one surviving thread is **N69**).

> **Owner corrections folded into doc 21, recorded here so this doc isn't read
> as still-open:** §5's floor-vs-absolute recommendation was **rejected** —
> absolute only (A2); §4's "RIR doesn't move load much" is complemented by an
> explicit **repricing policy** (doc 21 §4.2 — window-centered reps at the target
> RIR, the deload's own mechanic); §3's minimal N68 fix is **widened** into real
> per-set `rir_reported` capture (A1), which absorbs N38; and §9's questions are
> all answered.

The owner's alternative: instead of a coach-authored prescription-override
paradigm, give coaches (and the user, somewhere unobtrusive in the UI) the
ability to assign **target RIR per exercise** — and per week — inside a program.
Effort is then managed per exercise through the framework the app already has;
sets get recorded as genuinely high-RIR so the strength metrics understand them
as intentional rather than as decline; and "take it light for a few weeks" is
expressed by which weeks you set, so no time-window machinery is needed.

---

## 1. Verdict up front

**The instinct is right and the direction is much cheaper.** It is a smaller,
better-shaped change than the override paradigm on almost every axis, and one
of the owner's claims is stronger than stated: `workout_exercises.target_rir`
**already exists as a per-slot column** and the anchor already reads it, so the
data model has been ready for this the whole time.

Three things need to be said plainly before it gets built:

1. **The metric claim does not hold today — and not for a reason anyone would
   guess.** The per-set e1RM stamp that every stats surface reads is computed
   from `rir_reported`, which the app **never writes** (`DayView.tsx:1698` sends
   `rir_reported: null`), so every logged set is stamped as if taken to failure.
   The *anchor* uses the prescribed target RIR; the *stats* do not. Assigning
   RIR 5 to an exercise would fix the engine's view and leave the history chart,
   PRs, `best_e1rm`, and the strength trend reading the lighter work as a
   straight decline — exactly the problem the proposal exists to solve. This is
   a real standing defect (§3), independent of this feature; it is filed as
   **N68** and it is a **P0 prerequisite**.
2. **RIR is a ~2 %-per-step load lever, not a 20 % one.** At 9 prescribed reps,
   moving RIR 1 → 5 (the working-week ceiling) reduces load by **9.1 %** (§4).
   That is an excellent *fatigue* lever and a weak *absolute-load* lever. For
   the motivating case — lumbar nerve symptoms where spinal load is the
   mechanically relevant variable — RIR alone does not get you to "back off the
   deadlift"; it gets you to "back off 9 %".
3. **It expresses one of the three clauses in the owner's own rehab plan.**
   "Stop deadlifts" and "cut the volume" are not RIR statements. Both are
   *mostly* reachable with existing tools (§7), but the gaps are worth naming
   rather than assuming away.

None of that argues against the feature. Exercise-level RIR is worth building
on its own merits — it is a normal, well-understood programming primitive the
app is missing, and it composes with the two other levers. It just should not
be adopted under the belief that it makes the metric problem go away by itself.

---

## 2. What the codebase already gives us

This is the strongest argument for the direction — most of it is already built:

| Piece | State | Where |
|---|---|---|
| Per-slot target RIR **column** | **exists**, `check (target_rir between 0 and 8)` | `workout_exercises.target_rir`; widened by `20260625000002` for the RIR-6 deload |
| Anchor honors the per-slot RIR | **yes** — each sample's assumed RIR is its slot's `target_rir` | `queries/anchors.ts` (fetches `workout_exercises.target_rir` per set) |
| Engine reads the previous slot's RIR | **yes** | `queries/progression.ts:160,273` — `we.target_rir ?? microTargetRir` |
| Per-**week** RIR authoring precedent | **shipped** (N18-B) | `mesocycles.rir_schedule` + `rirRamp()`, incl. the orphan-clearing rule on shape edits |
| A place to author it via MCP | **exists** | `edit_mesocycle` ops (`mcp/tools/edit.ts`) — a new `set_exercise_rir` op, no new tool |
| A per-slot plan row to hang it on | **exists** | `meso_exercises` (day-slot grain, so the same exercise on two days can differ) |
| Freshness invalidation | **mechanical** | doc 14 §7: resolve it in `buildConfigInputs` ⇒ scope falls out of the fingerprint |
| Higher RIR ⇒ lower e1RM confidence ⇒ progression pauses | **automatic** | `high_max_rir: 2`, `mod_max_rir: 3`; earn gate needs `moderate` (doc 16 §3.4) |

And the thing that made the override design ugly simply **does not exist here**:
no windows, no expiry, no clock. The previous review's §4.1 trap
(`mesoStaleSignature` has no clock, so a date-expiring override applies forever)
evaporates — a per-week RIR value is content, and content already busts that
gate once the new column joins the signature. That is a genuine simplification,
exactly as the owner suspected.

The only engine change of substance: `prescribe()` currently always returns
`targetRir: inputs.week.targetRir`, so today's per-slot column is a copy of the
week's value. It has to become a resolved input the engine consumes.

---

## 3. P0 — the app has two different RIR assumptions (filed as N68)

The doc 11 premise is: *the app prescribes a target RIR and trusts the user to
hit it, so a logged `weight × reps` against a target RIR is itself an RIR data
point.* Two code paths implement that premise differently:

| Path | Assumed RIR | Consumers |
|---|---|---|
| **Strength anchor** (`queries/anchors.ts` → `recencyWeightedE1rm`) | the set's **prescribed** `workout_exercises.target_rir` | prescription pricing, the day-view predictor, the earn gate |
| **Stored per-set stamp** (`app/(app)/log/actions.ts:86` → `computeSetE1rm`) | `logged_sets.rir_reported` — **always null in practice** ⇒ `effectiveReps = reps + 0` ⇒ **treated as RIR 0** | `v_exercise_history.e1rm` + `.best_set_e1rm`, `v_exercise_overview.best_e1rm`, `v_meso_summary.best_e1rm`, `v_exercise_prs`, the strength trend, MCP history |

`rir_reported` has no write surface — the column is honored on read everywhere
and never populated (`DayView.tsx:1698` hard-codes `null`; doc 16 §8.4 / N38
records the gap). So **every stats surface in the app currently assumes every
working set was taken to failure.**

Consequences:

- **It is the known 384-vs-367.5 divergence**, in its general form. The
  2026-07-04 investigation (§8.2) diagnosed that instance as a formula-version
  drift between the stored stamp and the live anchor; the deeper cause is that
  the two paths don't even agree on the *input*.
- **It defeats this proposal's headline benefit.** Prescribe RIR 5, the athlete
  complies, the load is 9 % lighter — the anchor understands it, and the history
  chart plots a 9 % drop with no idea the reserve was intentional. The owner's
  sentence "sets would be correctly recorded as high RIR, so they would not
  suggest to the strength metrics that a genuine decline had occurred" is true
  of the engine and **false of the metrics**, today.

**The fix is small and already has machinery**: stamp with
`rir_reported ?? workout_exercises.target_rir` (the premise, applied
consistently), and let `queries/e1rm-restamp.ts` backfill the existing rows —
that hook exists precisely to re-stamp history when the e1RM model changes.

**Blast radius to be honest about:** every historical e1RM moves **up** (a set
prescribed at RIR 2 gains 2 effective reps), so PRs, `best_e1rm`, key-lift
numbers and the strength trend all shift. It is a one-time, explainable
re-levelling that makes stats agree with the engine — but it is a visible change
to numbers the owner looks at, so it wants its own PR, its own note in doc 10,
and probably a heads-up line in the app. It also *raises* the value of N38
(honest-RIR capture): the further prescribed RIR sits from 0, the more the
metric depends on a premise nobody has verified.

---

## 4. How much load does RIR actually move?

`effectiveReps = reps + RIR × rir_offset` (`rir_offset` 1.0) and
`weight = e1RM / k(effectiveReps)`. At 9 prescribed reps under the active v23
params:

| target RIR | effective reps | load ÷ anchor | vs RIR 1 |
|---|---|---|---|
| 0 | 9 | 0.773 | +3.1 % |
| 1 | 10 | 0.750 | — |
| 2 | 11 | 0.732 | −2.4 % |
| 3 | 12 | 0.714 | −4.8 % |
| 4 | 13 | 0.698 | −7.0 % |
| 5 (working ceiling) | 14 | 0.682 | **−9.1 %** |
| 6 (deload value) | 15 | 0.667 | −11.1 % |
| 8 (DB ceiling) | 17 | 0.638 | −14.9 % |

So the whole working range of the lever is about **9 %**, and each step is worth
~2.4 %. Two readings, both true:

- **As a fatigue lever it is excellent.** Going from 1 to 5 reps in reserve is a
  large drop in effort, systemic fatigue, and injury exposure per set, at a load
  the athlete will still recognise. That is what "take it easier on this
  exercise for a few weeks" usually means.
- **As an absolute-load lever it is weak.** For a nerve/disc/tendon issue where
  the tissue cares about peak load, −9 % is not the intervention. Note that the
  app's own recovery primitive agrees: a deload is RIR 6 (−11 % load) **plus
  `set_pct 0.5`** — a modest load cut and a *large volume cut*. The engine's
  designers already concluded RIR alone isn't enough for a recovery week.

**Implication:** exercise-level RIR should ship expecting to be paired with a
per-exercise **set** lever. The two together reproduce the deload's own shape at
exercise grain, and cover the "reduce the workload of related exercises" clause
properly.

---

## 5. Composition — floor, or absolute?

The RIR ramp (`rirRamp`/`rir_schedule`) and the deload both already write
`microcycles.target_rir`. A per-exercise value has to say what happens when they
disagree. Two shapes:

- **Absolute** (`this exercise is at RIR 4 in week 3`). Maximum control; the
  coach must restate it for every week or the ramp silently reasserts itself;
  and it can make an exercise *harder* than the block, which is a real
  programming want but also an unbounded footgun for an LLM.
- **Floor** (`this exercise never goes below RIR 3`), resolved as
  `max(weekRir, floor)`. The ramp keeps working underneath, the deload (RIR 6)
  automatically wins, "for the next two weeks" is expressed by setting the floor
  on those weeks, and — importantly — **a floor can only ever reduce demand**,
  which matches the reduce-only safety principle from the override review §6.

**Recommendation: floor semantics, with an optional absolute mode reserved for
the in-app path.** Coach/MCP writes floors only; a human editing their own
program in-app may set an absolute value if we decide that's wanted (§9 Q2).
Either way the resolution is one pure function, unit-tested, and the resolved
value lands in `workout_exercises.target_rir` where every consumer already reads
it.

Also to settle: the reconcile's `liveWeekRirUpdates` re-derives unstarted weeks'
RIR from the schedule — the per-exercise resolution must run **after** that, at
slot grain, or the reconcile will stomp it on the next read.

---

## 6. Engine coupling — what changes, what doesn't

The previous review's §2 (five couplings that carry "easier" work into engine
state) still applies; this design answers most of them **for free**, which is
its most underrated advantage:

- **The anchor stops cratering.** This is the real fix. Today a pain-limited
  lighter session is stamped and anchored as if it were a failure set, so the
  anchor drops. With the RIR prescribed and honored, the estimate accounts for
  the reserve and the anchor stays roughly where it was. The override paradigm
  could not do this; RIR assignment does it structurally.
- **Progression pauses on its own.** RIR ≥ 4 pushes effective reps past
  `mod_max_eff_reps` (12) ⇒ `low` confidence ⇒ below the earn gate's `moderate`
  floor (doc 16 §3.4). No new gate predicate strictly needed. **But** the gate
  reads the *anchor's* confidence, and the anchor may still be won by an older
  heavy session at `moderate` — in which case a rehab week could earn a step.
  Cheap fix, same shape as the existing "not a deload week" predicate: **no earn
  while the slot's resolved RIR is above the week's RIR**.
- **The rep climb pauses too.** `climb_requires_rir_step` means the +1 rep climb
  only fires when RIR steps down; a floored exercise's RIR stops stepping, so
  the climb holds. Emergent and correct.
- **The exit is a cliff, and that's the design's real ergonomic win.** When a
  floor of 5 lifts back to a week RIR of 1, the load jumps ~9 % in one week. In
  this model the coach ramps the floor back down (5 → 4 → 3 → off) as naturally
  as they set it — which is precisely the "prescribe the return ramp" capability
  the override review had to invent from scratch (§13 Q4 there).
- **The pain clamp still applies.** `finalWeight ≤ perf.bestWeight` when pain is
  reported (`engine/index.ts:434/:498/:513`) is unchanged and still correct — it
  just now clamps to a load the engine *asked for*, instead of to an improvised
  one.
- **The miss throttle stops firing spuriously**, because compliance is now
  measured against what was actually prescribed. That alone removes a whole
  class of the previous design's problems.

---

## 7. What it does not cover (and what already covers it)

Mapping the owner's original six bullets:

| Original want | Exercise-level RIR | Gap / existing tool |
|---|---|---|
| Temporarily modify an exercise/day/week without changing the cycle | **yes**, for effort | volume needs a set lever (§4) |
| Replace an exercise for a defined period | **no** | per-session swap exists (`replaceWorkoutExercise`); plan-wide swap exists (`edit_mesocycle`); **bounded-window swap does not** — and the `LOOKBACK_WEEKS = 2` cliff (override review §4.4) still bites past 2 weeks |
| Populate the complete prescription | **no** — and, per the override review §11, that's the right answer |
| Record reason, duration, return criteria | duration = which weeks; **reason has nowhere structured to live** — recommend a `reason` text column beside the RIR value (mirrors `excluded_exercises.reason`), surfaced in the explanation |
| Distinguish coach-created from engine-generated | partial — the value is authored, the numbers stay the engine's. Still wants a "coach set RIR 4 here" disclosure on the day view + in `explain_prescription` |
| Complete audit trail | **yes, free** — `engine_decisions` records inputs+output per recompute, and the resolved RIR is a config input |

Two residual gaps: **a per-exercise set lever** (§4) and **bounded substitution**
(the only piece of the override paradigm that survives contact). Neither needs
the override machinery — a set floor is the same shape as the RIR floor, and
bounded substitution is a smaller, separable feature.

---

## 8. Metrics — what improves and what needs disclosure

Assuming N68 lands first:

- **Strength trend / e1RM series: fixed as claimed.** High-RIR sets stop
  reading as decline.
- **Confidence honesty: preserved and visible.** RIR ≥ 4 ⇒ `low` confidence,
  and doc 10 §9 already says e1RM is weakest above ~12 effective reps or ≥ 4
  RIR — which is exactly where a rehab assignment puts every set. So the metric
  goes from *biased* (reads as decline) to *unbiased but noisier*. That's a real
  improvement, and it should be **stated** rather than smoothed over.
- **Volume metrics gain a new comparability wrinkle.** Sets still count 1.0 (or
  0.5 for a secondary role) toward MEV/MAV/MRV regardless of RIR, but a set at
  RIR 5 is not a "hard set" in the sense doc 10's landmarks are calibrated on.
  A block with heavy RIR-floored work will look fully dosed while delivering
  meaningfully less stimulus. Not a blocker — but `get_muscle_balance` /
  `preview_mesocycle_volume` / the volume tab should disclose it, in the same
  spirit as the deload handling.
- **Precedent for the trend:** deload microcycles are already excluded from the
  strength series (`queries/stats.ts:573,179,727`). Elevated-RIR exercise-weeks
  are the natural analogue — exclude or flag, owner's call (§9 Q5).

---

## 9. Owner decisions

**Q1 — N68 first?** The metric benefit doesn't exist until the stamp uses the
prescribed RIR, and that re-levels historical e1RMs upward. *Recommend: yes,
its own PR, before the RIR feature — it's a standing defect either way.*

**Q2 — Floor or absolute?** *Recommend floor (`max(weekRir, floor)`) for the
MCP/coach path; decide separately whether the in-app editor may set an absolute
value (useful for "push this one lift harder" programming, but it can raise
demand).*

**Q3 — Grain.** Per `meso_exercises` slot (day-slot × exercise) with a per-week
array, mirroring `mesocycles.rir_schedule` including its orphan-clearing rule on
shape edits? Or a simpler single value for all weeks? *Recommend the
schedule-shaped version — it is the owner's "each exercise and week", and the
pattern is already proven.*

**Q4 — Pair it with a set lever?** §4 says RIR alone is ~9 %, and the app's own
deload pairs RIR 6 with a 50 % set cut. *Recommend shipping a per-exercise set
floor in the same workstream (not necessarily the same PR).*

**Q5 — Stats treatment.** Exclude elevated-RIR exercise-weeks from the strength
trend (deload precedent), flag them, or leave them in? *Recommend flag, don't
exclude — with N68 fixed they are honest data points, just lower confidence.*

**Q6 — Earn-gate predicate.** Add "no earn while the slot's RIR is above the
week's RIR"? *Recommend yes — cheap, and it closes the case where an old
`moderate` anchor lets a rehab week mint a step.*

**Q7 — Reason text.** Store a short reason beside the assignment and surface it
in the day-view strip and `explain_prescription`? *Recommend yes — it is the
part of the override idea worth keeping, and it costs one column.*

**Q8 — Does the override review stay parked or get closed?** *Recommend parked:
bounded substitution (§7) is still unsolved and its review §4.4 is the only
place that failure mode is written down.*

---

## 10. Phasing

1. **N68 — one RIR premise.** Stamp `rir_reported ?? target_rir`; restamp
   history via the existing hook; doc 10/11 amendment; call out the level shift.
2. **Exercise RIR — plan + engine.** Column(s) on `meso_exercises`, pure
   resolution (`max(weekRir, floor)`), engine consumes it, `target_rir` written
   per slot, doc 14 wiring (config input + `mesoStaleSignature`), earn-gate
   predicate. Tests: composition vs ramp/deload, fingerprint scoping, no-change
   parity when unset.
3. **MCP.** `edit_mesocycle` op `set_exercise_rir` (+ reason), read-side
   disclosure in `get_mesocycle` / `get_current_state`.
4. **UI.** 09-changelog design pass: where the RIR chip lives on the planner
   slot and the day-view strip, and how a non-default RIR reads. Owner asked for
   "somewhere in the UI without overcomplicating it" — the Exercise page's
   "Load step" sheet behind the header `⋯` (doc 14 phase 3) is the precedent.
5. **Explanation.** Deterministic why states the assigned RIR and its reason
   before anything else (doc 19 layering).
6. *(separable)* Per-exercise set floor; bounded substitution.
