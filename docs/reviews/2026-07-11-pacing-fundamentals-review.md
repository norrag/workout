# Pacing fundamentals — pressure-test of the pacer vs the self-pacing loop

**Status:** review + simulation finding (2026-07-11), pressure-testing the owner's
model of what the macro-rate pacer is *for*, using a harness that drives the
**real pure engine** (`prescribe` / `seedMeso` / `recencyWeightedE1rm` /
`assessProgression`) through simulated mesocycles. Companion to
[`2026-07-11-strength-rate-model-research.md`](./2026-07-11-strength-rate-model-research.md)
(N43 — why the band the pacer reads is miscalibrated). Relates: doc 16
(prescribed progression), doc 16 §11 / N38 (honest-RIR backstop), doc 17 §7 / N36
(envelope loop).

The harness is `scratchpad/pacing-sim.ts` (not committed — it imports engine
internals directly); every number below is reproducible from it. It is a
*model*, not the app: performance is synthesized from a latent true-capacity
e1RM, and the progression-history governor inputs are a faithful re-port of
`queries/progression-history.ts::aggregateProgressionHistory`. Treat the
magnitudes as directional, the mechanisms as exact.

---

## 1. The owner's thesis (what we're testing)

Paraphrased from the Batch-16 note:

1. The pacer is a **safety mechanism**, not the primary progression limiter. If a
   user earns *all* their progression, that is a genuine signal the strength band
   may be too low — which is what the envelope loop should consume.
2. The only way to escape the earn signal is **RIR misrepresentation**, and that
   is only possible when RIR > 0. On higher-RIR weeks a user could sacrifice
   reserve to fulfill the prescription, "banking" progression early — then the
   **zero-RIR week exposes them** ("the tide goes out"), because there's no
   reserve left to mortgage.
3. The existing machinery — the **measured recency anchor** and the **seed** —
   should detect that exposure and push the athlete back to reality at the next
   meso, so progress stays paced by real, unfabricatable performance.
4. Residual concern: a **max-length (8-week) meso** with more high-RIR weeks lets
   a user mortgage more and bank longer before exposure.

Each of these is a testable claim about the engine. They hold, with two
qualifications that matter for the N43 band decision.

---

## 2. The two pacing loops, named

The engine has **two** things that keep the prescription tied to reality, and the
owner's note is really about the relationship between them:

- **The self-pacing loop (measured anchor → prescription).** Every logged working
  set feeds the recency-weighted e1RM anchor (`recencyWeightedE1rm`,
  `session_best`, 30-day half-life). The prescription is *chosen off that anchor*
  (rep-window weight selection). This loop is **reactive**: the prescription
  follows measured performance, and it cannot durably exceed what was logged. It
  is always on, with or without earned-step progression.
- **The leading loop (earned-step + pacer).** With `progression` active, the
  engine *leads* the anchor by one earned quantum (`A* = A + δ`) when the previous
  session fully complied — then the **pacer** decides whether to grant that lead
  this microcycle, by comparing the trailing prescribed-e1RM gain against a target
  rate (`lerp(band, position) × goal_rate_factor`). This loop is **proactive**: it
  anticipates progress instead of only reacting to it.

The owner's thesis is, in these terms: *the self-pacing loop is the real honesty
mechanism; the pacer only meters how fast the leading loop is allowed to run.*
The simulation confirms exactly that — and shows the pacer becomes a *problem*
only when the band it references is miscalibrated (N43).

---

## 3. The pacer target, in numbers

`pacerTargetRate = lerp(strength_band, band_position) × goal_rate_factor[hypertrophy=0.75]`.
Computed straight from v21 params:

| band (source) | pos 0.0 | pos 0.5 | pos 1.0 | prescribed %/mo ceiling |
|---|---|---|---|---|
| beginner `[4,8]` | 3.00 | 4.50 | 6.00 | (fast) |
| intermediate `[1.5,3]` — v21 self-report | 1.13 | 1.69 | **2.25** | (moderate) |
| advanced `[0.5,1.5]` — v22 plan / training-years | 0.38 | 0.75 | **1.13** | (slow) |

The pacer **skips** an earned step whenever the trailing measured gain already
meets the target for the row's band + position. So the *band* sets the ceiling on
how fast prescribed e1RM may climb, and `band_position` (fixed 0.5 today; the
envelope loop's future lever) slides within it. A lifter whose true rate exceeds
the pos-1.0 ceiling is **capped by the band, not by the earn gate** — they earn,
and the pacer defers. That is the whole mechanism the owner is reasoning about.

---

## 4. Simulation results

Nine scenarios, hypertrophy goal, 5-week mesos (except S5), 3 back-to-back mesos,
machine lift (5-lb step). "true capacity" = the lifter's latent 0-RIR e1RM,
growing at the stated real monthly rate; "prescribed rate" = the e1RM the
prescription demanded, first→last working week, normalized to %/mo.

| # | scenario | behavior | real rate | prescribed rate | max overshoot | exposure wks | reads |
|---|---|---|---|---|---|---|---|
| S1 | honest, real 1.5%/mo (= band mid) | honest | 1.5 | 1.40 | 0.00% | 0 | tracks truth |
| S2 | honest strong, real 4%/mo | honest | 3.87 | 1.40 | 0.00% | 0 | **pacer caps at band** |
| S3 | honest plateau, real 0% | honest | 0.0 | ~0 (transient seed recovery) | 0.20% | 0 | holds |
| S4 | RIR-mortgager, real 0% (5-wk) | mortgage | 0.0 | ~0 | 0.20% | 0 | nothing to bank |
| S5 | RIR-mortgager, **8-wk** meso | mortgage | 0.0 | — | **4.80%** | **3** | **banks, then exposed** |
| S6 | mortgager, progression OFF | mortgage | 0.0 | 0.74 | 0.00% | 0 | anchor-only, no lead |
| S7 | honest strong 4%/mo, progression OFF | honest | 3.87 | 0.74 | 0.00% | 0 | reactive lag |
| S8 | honest strong 4%/mo, `rate_source=PLAN` (advanced) | honest | 3.87 | 1.40 | 0.00% | 0 | R3: same-or-tighter |
| S9 | honest strong 4%/mo, **correctly-calibrated** band (beginner) | honest | 3.87 | **3.33** | 0.00% | 0 | **pacer lets it flow** |

### 4.1 The pacer is a rate-limiter on the lead, not the progression engine (S6/S7 vs S2/S9)

Turn earned-step progression **off** (S7): an honest 4%/mo gainer is prescribed at
only **0.74%/mo** — the self-pacing loop is purely *reactive*, the recency anchor
rises only after performance is logged, and the rep-window climb is slow, so it
lags a fast gainer badly. Turn progression **on** with the (miscalibrated,
too-tight) intermediate band (S2): **1.40%/mo** — leading helps, but the pacer
caps it. Turn progression on with a **correctly-calibrated** band for this lifter
(S9, beginner band): **3.33%/mo**, tracking the 3.87% truth with the pacer
intervening only near the top.

**This is the core finding:** the pacer does not *drive* progression — the
measured anchor does. The pacer meters how much of the earned *lead* is granted.
Correctly calibrated (S9) it lets honestly-earned progress flow; miscalibrated
too-tight (S2/S8) it starves an honest earner. The owner's framing — *pacer as
safety backstop, not primary limiter* — is correct **when the band is right**.

### 4.2 An honest lifter cannot be over-prescribed (S1/S2/S3)

Every honest scenario shows **max overshoot ≈ 0%**: the prescription never demands
more e1RM than the lifter's true capacity, because the earn gate requires the
*previous* session to have fully complied in e1RM space, and an honest lifter who
can't comply simply doesn't — the gate holds. Honesty in, no overshoot out. There
is **no exploit for the honest lifter**, and no scenario where the pacer's absence
would have hurt them beyond under-leading (which is a calibration issue, §4.1).

### 4.3 RIR-mortgaging: real, bounded, self-correcting — worst on long mesos (S4 vs S5)

The mortgager logs the prescribed reps at the *reported* target RIR on RIR>0
weeks, sacrificing true reserve (the misrepresentation), and is forced honest at
RIR 0.

- **5-week meso (S4): 0.20% overshoot, 0 exposures.** The loophole barely opens —
  the pacer + cadence hold the prescription so close to the anchor that the
  prescription never gets pushed above true capacity, so there is *nothing to
  mortgage*. Mortgaging only pays once the prescription already exceeds capacity.
- **8-week meso (S5): 4.80% overshoot, 3 exposure weeks.** The owner's residual
  concern is **confirmed**: the extra high-RIR weeks let earned steps + mortgaged
  compliance inflate the anchor up to ~4.8% above true capacity — then the low-RIR
  end of the ramp exposes it (3 missed weeks where the mortgager can't produce the
  reps at 0 reserve). The **anchor self-corrects**: the exposed misses are recent,
  low-rep, high-confidence measurements, so they pull the anchor back down (in S5
  the anchor dropped from ~154 to ~148.7 across the exposure), and the next meso
  **seeds off the corrected anchor**. The tide goes out exactly as described, and
  the machinery reels it back — with a bounded transient overshoot of a few
  percent that scales with the number of consecutive high-RIR weeks.

So: the loophole exists, is **self-limiting and self-correcting within ~1 meso**,
and its size is bounded by (consecutive high-RIR weeks × quantum), which the pacer
itself further throttles (S5 recorded 7 `paced` weeks — the pacer *slowed* the
banking). The max-length meso is the worst case, as the owner intuited.

### 4.4 What actually binds — often not the pacer (all progression-on scenarios)

Across S1/S2/S8, the status mix was `not_earned` on ~6 of 15 weeks — the
**confidence gate** and **cadence**, not the pacer, held those. The RIR-3/RIR-2
early weeks produce low/moderate-confidence anchors, and the earn gate needs the
*previous* session's anchor at ≥ moderate confidence. **Implication for the
envelope fit (N36):** do not read every held week as a pacer trip. The
`get_progression_history` aggregate must attribute holds to their actual governor
(`gate_failures.confidence` vs `governor_firings.rate_pacer`) before the envelope
thresholds are fit, or the loop will mis-tune against confidence noise it can't
control.

---

## 5. What role does pacing play, then?

Synthesizing §4:

- **The measured anchor is the primary honesty mechanism.** Prescribed e1RM cannot
  durably exceed logged e1RM, and logged e1RM cannot durably exceed true capacity
  **without RIR misrepresentation**. RIR misrepresentation is impossible at RIR 0,
  and every meso ramps to a low-RIR peak, so the anchor is **periodically trued-up
  against unfabricatable data**. This is the self-pacing loop, and it is what makes
  the whole system honest. It needs no pacer.
- **The earned-step pacer is a rate-limiter on the *lead*.** Its job is to stop the
  engine leading the anchor faster than the athlete's goal-appropriate rate — so a
  lucky noisy anchor, or a coarse plate jump, doesn't run the prescription away
  from reality between the periodic true-ups. It is a **smoothing/safety governor
  on the proactive loop**, exactly the owner's "backstop, not primary limiter."
- **But a miscalibrated band inverts the pacer's role.** When the band is too tight
  (N43 — the calendar-advanced band on an undermuscled long-time lifter), the pacer
  stops being a backstop and becomes the *primary and wrong* limiter: it defers
  steps an honest earner has genuinely earned (S2/S8, 1.40 vs 3.87 true). The
  signal that this is happening is **a high earn rate meeting a frequently-binding
  pacer** — precisely the "you're earning everything, the band may be wrong" signal
  the owner named, and precisely what the envelope loop is designed to read.

**The crucial limit the simulation exposes:** the envelope loop moves
`band_position` *within* the band (S-values pos 0→1), so it can correct a band
that is *slightly* off. It **cannot** correct a *whole-band* miscalibration — at
pos 1.0 the advanced band still caps at 1.13%/mo and the intermediate at 2.25%/mo,
both far under a 3.87%/mo true rate (S9's beginner band was needed to track it).
So the envelope loop is **not** a substitute for fixing N43: position sliding and
band selection are different knobs, and a lifter whose correct band is "beginner"
cannot be paced correctly by sliding position within "advanced." N43 (the band)
must be right first; the envelope (the position) refines within it.

---

## 6. Implication for the interim v21-vs-v22 decision

The owner rolled back to **v21** (`rate_source: "band"`) this session. The
simulation supports that as the better *interim* under a miscalibrated model:

- v22's plan/advanced band caps this lifter's prescribed rate at **1.13%/mo**
  (pos 1.0); v21's self-report intermediate band caps at **2.25%/mo**. The
  companion research doc puts the model-derived rate at **~1.5–2.3%/mo**
  (intermediate). So v21's band **contains** the honest rate at its top; v22's
  cannot reach it at any position. v21 is the less-wrong band while N43 is open.
- Either way the **earn gate remains the honesty mechanism** (§4.2) — the rollback
  does not weaken any guardrail; it only loosens a limiter that was set too tight.
- Neither is *correct* — both are calendar/self-report buckets. The real fix is the
  N43 two-component model (v23), which derives the band from FFMI proximity + a
  neural term and lands this lifter in the intermediate range *for the right
  reason*.

## 7. Recommendations

1. **Ship N43 (v23) — the band is the load-bearing fix.** The pacer is sound; the
   band it reads is not. Priorities and functional form in the research doc §4.
2. **Keep the pacer.** It is doing its designed job (S4/S5: it throttled the
   mortgage-banking; S9: it let honest progress flow once the band was right). Do
   not weaken or remove it in response to the S2 under-leading — that is a band
   problem, not a pacer problem.
3. **N38 (periodic honest-RIR confirmation) is the right backstop for the residual
   mortgage loophole** (§4.3). The loophole is bounded and self-correcting, so this
   stays MED priority — but the 8-week worst case (4.8% transient overshoot) is the
   concrete motivation, and field data from `get_progression_history`
   (`earned_then_missed` pairs clustering at low-RIR weeks) is how you'd detect a
   real user doing it.
4. **When fitting the envelope loop (N36), attribute holds to their actual
   governor** (§4.4) — confidence/cadence vs pacer — and remember the loop refines
   *position within* a band it cannot itself re-scale (§5). Fit it only after N43,
   or it will chase a band error it structurally can't fix.

---

*Reproduce:* `npx tsx scratchpad/pacing-sim.ts` (harness imports the engine
directly; performance is synthesized, governor inputs re-ported from
`queries/progression-history.ts`). Magnitudes are model-directional; mechanisms
(earn gate, pacer arithmetic, anchor fold, seed carry) are the real engine.
