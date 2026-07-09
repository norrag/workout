# Follow-up — prescribed progression: owner responses (macro-rate pacing, the double-progression concern, confidence, reported RIR)

**Date:** 2026-07-08
**Source:** owner follow-up to
[`2026-07-07-prescribed-progression-review.md`](./2026-07-07-prescribed-progression-review.md)
(N35). Four threads: (1) confirmation that the review's reframe matches the
memo's intent, with "when" restated; (2) a concern that the RIR ramp plus the
earned quantum asks the athlete to progress **twice** per week; (3) a proposal
to promote the macrocycle strength rate from *rate limiter* to the *driver* of
prescription progression, with per-goal rates; (4) two point questions —
`anchor.confidence` never reaching `high` under compliant hypertrophy, and
what "reported RIR" actually is.
**Status:** all four answered; the design is **amended** (§3: the §6.6 rate
ceiling is promoted to a macro-rate *pacer*, and the per-goal booleans become
per-goal rate factors). Where this doc conflicts with the 2026-07-07 review,
**this doc wins**. The updated owner-decision list is §6. No code changes.
**Relates to:** N35 (this thread), N21 (macro-target correction — the pacer's
Phase-3 dependency), N34 (DEXA — the cut/maintain outcome measurement), T-I5,
R24, doc 10 §4/§5/§9, doc 11 (RIR premise), doc 13 §9.2.
**Follow-up 2 (2026-07-09):** auditability, pacing mechanics, the envelope
idea, and standalone mesos answered in
[`2026-07-09-prescribed-progression-followup-2.md`](./2026-07-09-prescribed-progression-followup-2.md)
— it amends this doc's realized-ask trace silence (always-on status-coded
progression trace) and replaces `rate_source`'s `band_mid`/`band_top` halves
with a continuous `band_position`; where the two conflict, follow-up 2 wins.

---

## 1. Summary

1. **Convergence confirmed** (§2.1). The memo and the review describe the same
   loop: increment the prescription off the real measured e1RM so that future
   *performed* e1RM rises. The review's precise answer to "when": **when
   earned, at most once per exercise per microcycle, and paced by a rate
   governor** — the cadence is the quantization, not the rate.
2. **The double-progression concern is half right, and the half that is right
   is already load-bearing in the design** (§2.2). The ramp's weekly +1 rep
   demands zero new capacity (it spends reserve the prescription previously
   ordered held — effective reps stay constant), so in capacity terms the
   weekly ask is exactly **one** quantum, not two. But the owner's instinct
   about aggressiveness is correct at the *rate* level: an ungoverned
   quantum-per-microcycle is ~10–15%/month, above even the beginner band. The
   answer is not to slow the cadence but to adopt the owner's own §3 proposal:
   let the macro rate pace the steps. Under the doc-10 §5 bands, an
   intermediate earns a step roughly **monthly**, an advanced lifter every
   **2–3 months** — "every microcycle" is the ceiling only a fresh beginner
   approaches.
3. **Macro-rate-as-driver: adopted, with one hard boundary** (§3). The
   macrocycle layer defines the expected strength rate of change (profile →
   rate), the meso layer translates it into when earned quanta are offered —
   exactly the original macro-as-aggregation-layer vision. The boundary:
   **the rate meters the ask; only performance mints it.** The pacer may
   delay an earned step; it must never prescribe an unearned one to keep a
   trajectory on schedule (that is the rejected "scheduled linear %"
   alternative, and a T-I5 violation one level up). Mechanically this is a
   small generalization of the Phase-1 rate ceiling — same predicate,
   configurable rate source and per-goal factors — so it ships in Phase 1
   nearly for free (§3.3).
4. **Yes: every macro goal carries a strength rate under this design** (§4) —
   it is precisely the pacer's input. Strength paces at the full band;
   hypertrophy/gain at a similar-order but likely modestly lower factor
   (**[HEURISTIC — needs the doc-10 research pass before the default
   lands]**); cut and maintain at **zero**, which reproduces the R24
   "hold honestly" resolution and *subsumes* the review's per-goal booleans —
   one mechanism instead of two. The owner's corollary holds: strength vs
   hypertrophy programming then differs chiefly by **rep window** (already
   per-goal in `engine_params.rep_window`), and cut vs maintain differ by
   stated objective and outcome measurement (which is what N34's DEXA
   integration would supply), not by prescription behavior.
5. **The confidence ceiling is intentional and should stand** (§5.1).
   Confidence grades the *accuracy of the e1RM estimate*, which genuinely
   degrades with effective reps (doc 10 §9: weakest above ~12 effective
   reps); a compliant hypertrophy set sits at ~11, so `moderate` is the
   honest maximum. It is a property of the measurement, not a defect — it
   only ever mattered because a *gate* was keyed to it, and the review
   already fixed that (the `moderate` floor).
6. **"Reported RIR" is a real, optional per-set database field — not derived —
   that no surface can currently write** (§5.2). `logged_sets.rir_reported`
   has existed since the initial schema and is honored everywhere on read
   (set e1RM stamping, the anchor query, PR views, the hard-set rule), but
   the day view logs every set with `rir_reported: null` and nothing else
   sets it. Today it is always null; every set is scored at the prescribed
   target RIR per the doc-11 premise. The review's mentions are the *hook*
   the design honors if a capture affordance ever ships — and review §10 Q6
   (periodic honest-RIR confirmation) **requires** that affordance, so the
   two are one decision (§6).

---

## 2. The two progression questions

### 2.1 Convergence, and "when", restated precisely

Agreed that the memo and the review land in the same place: the prescription
target is incremented off the real measured e1RM, and — via the doc-11
premise that a logged set is performed at its prescribed target RIR —
performing that prescription *is* the data point that raises the measured
e1RM to meet it. The review's contribution is the bookkeeping (never touch
the measurement; re-arm off the measured anchor so the lead never compounds
unconfirmed), not a different mechanism.

One precision on "when", because "once per microcycle" is only the first of
three nested conditions, and the distinction matters for §2.2:

- **earned** — the previous session met the full compliance gate (all sets at
  prescription, no pain, no dampener, workload not hot, fresh, confident
  anchor, goal opted in);
- **at most once per exercise per microcycle** — the cadence, i.e. the
  *granularity* of steps;
- **paced by the rate governor** — the trailing ~30-day prescribed gain must
  sit inside the athlete's evidenced rate (§3). This is the condition that
  determines the actual *frequency* of steps for everyone past the novice
  stage.

So the effective answer to "when do we apply the increment" is: **at the
athlete's evidenced rate, in earned, discrete quanta, quantized to at most
one per microcycle.** The cadence is the clock tick; the rate is the speed.

### 2.2 "Isn't the athlete progressing twice each week?"

Restating the concern: the RIR step already adds one prescribed rep per week;
the earned quantum adds another rep (or a load step) on top — two rep-units
of weekly progression, which may be too aggressive.

**In capacity terms, it is one, not two.** The ramp's +1 rep pairs with a −1
RIR step, so effective reps — and therefore the e1RM the set demands — are
unchanged (the §3.2 fixed point of the review is the proof: under the ramp
alone, measured e1RM is pinned to the decimal for the whole meso). The week-1
athlete prescribed 145 × 8 @ 3 could already, by the model's own claim,
perform 145 × 11 @ 0 — week 4 merely stops ordering them to leave those reps
in reserve. The ramp rep is *reserve drawdown on capacity the athlete already
has*; the quantum is the only demand for capacity they don't yet have. The
weekly capacity ask under the amended design is exactly one quantum,
~2.5–3.5% of e1RM — and only in weeks where it is earned and the pacer
offers it.

**In performed-rep terms, the owner's arithmetic is right** — on a light lift
where the quantum manifests as a rep, week 2 can ask 10 reps where week 1
asked 8 (one rep of drawdown + one genuine rep); on a barbell lift it asks
the same climbed reps at one plate step more. And it is fair to say the
*sessions get harder faster* than either mechanism alone: less reserve and
more absolute load in the same week. Three answers, in increasing strength:

1. **That combination is the standard shape of autoregulated periodization,
   not an anomaly.** An RIR ramp exists to make room for overload inside a
   meso, not to substitute for it — mainstream RIR-based hypertrophy
   programming raises load/reps *while* proximity to failure increases across
   the accumulation, then deloads. A ramp with zero overload is exactly the
   treadmill the memo diagnosed.
2. **The earn gate is fatigue-aware by construction.** The step is only
   offered when the *previous* session was fully handled — every set at
   prescription with no pain flag, no session dampener, and workload feedback
   below `workload_high`. An athlete for whom the combined ask is too much
   fails to earn (or misses the attempt, which re-arms without compounding
   and, repeated, trips the miss throttle). Misses are the rate limiter
   working, not a failure state.
3. **The rate governor bounds the aggregate, and this is where the owner's
   instinct is quantitatively correct.** Ungoverned, quantum-per-microcycle
   compliance is ~10–15%/month of prescribed e1RM gain — too aggressive for
   everyone but a raw novice, as the review itself conceded (§6.2). The
   amendment in §3 makes the athlete's own evidenced band the pacer, so the
   *frequency* of aggressive-feeling weeks is what the profile supports:
   roughly every other microcycle for a beginner, monthly for an
   intermediate, quarterly for an advanced lifter (§3.3 arithmetic). In all
   other weeks the prescription is byte-identical to today's — the ramp
   spends reserve and nothing else moves.

So: the concern is correct as a critique of *uniform* per-microcycle
stepping, and the resolution is not a slower cadence (which would
under-serve novices and still over-serve advanced lifters) but the
owner's own macro-rate proposal — which the design now adopts as the pacer.

---

## 3. Macro rate: from limiter to pacer (design amendment)

### 3.1 What the owner proposed, and where it lands

The proposal: the macrocycle layer should aggregate athlete characteristics
(age, sex, training experience, body composition, eventually DEXA) into an
expected **strength rate of change**, and the mesocycle layer should
translate that rate into prescription adjustments — calibrating the
progression ask to the athlete's projected adaptation instead of stepping
every exercise every microcycle regardless of subject or goal.

This is adopted, and it is a genuinely better shape than the review's
"ceiling" framing — same machinery, better semantics:

- The review's §6.6 rate ceiling already reads `strength_pct_month[bucket]`
  and skips steps above the band top. It answers "is the ask still inside
  the evidence?" — a guardrail.
- The pacer answers "is the ask *on the athlete's trajectory*?" — the band
  (or, post-N21, the personalized planMacrocycle rate) becomes the **target
  rate**, and earned steps are offered at whatever frequency keeps the
  trailing prescribed gain tracking it. The layering the owner originally
  envisioned is restored: **macro** (profile + goal → expected rate) →
  **meso** (rate → when quanta are offered; rep window per goal) →
  **session** (compliance → whether the offered quantum is earned).

Incidentally this resolves §2.2 for free, which is the sign the two
follow-up threads are the same idea: the athlete progresses at their modeled
rate, in honest discrete quanta, rather than at the engine's clock rate.

### 3.2 The push-back: a budget, never a quota

One boundary must be explicit, because "actively determine the rate of
prescription progression" can be read two ways, and one of them is the
alternative the review rejected:

- **Budget (adopted):** the rate determines *when the next earned quantum is
  offered*. An athlete below trajectory gets steps as often as they earn
  them (the pacer only ever delays; below-trajectory it is simply not
  binding). A plateaued athlete gets **no** scheduled progress — the flat
  line shows up in stats and MCP analytics, not as escalating prescriptions.
- **Quota (rejected):** the rate determines *how much progress the plan
  contains*, and the engine escalates to keep the trajectory on schedule
  regardless of performance. That is "scheduled linear %" from the review's
  §8 — it reintroduces the retired fabricated-progression path one level up
  (a projected rate is a model estimate; writing it into demand without
  per-step performance confirmation compounds while the athlete stalls, the
  exact T-I5 failure class).

**The rate meters the ask; only performance mints it.** Every quantum still
requires the full §6.4 earn gate; the macro layer decides *pacing*, never
*entitlement*. This also means the pacer needs no new safety analysis: it is
strictly more conservative than the design it amends (it can only skip steps
the ceiling would have allowed).

One smaller push-back on "rather than blindly progressing every exercise
each microcycle": the per-exercise `progressionHistory` lookback already
staggers steps naturally — each exercise has its own earn record and its own
trailing window, so even at a beginner's pace the steps land on different
lifts in different weeks rather than the whole program lurching at once.

### 3.3 Mechanism

The §7.2 params block changes shape (this supersedes `rate_ceiling` and the
`goals` booleans; everything else in §7 stands):

```jsonc
"progression": {
  "mode": "earned_step",
  "step": "min",
  "min_confidence": "moderate",
  "cadence": "microcycle",
  // — pacing (supersedes rate_ceiling + goals) —
  "pacing": "macro_rate",           // absent/off ⇒ no pacing beyond cadence
  "rate_source": "band_mid",        // "band_top" (= the old ceiling) | "band_mid"
                                    //   | "plan" (planMacrocycle per-user rate, post-N21)
  "goal_rate_factor": {             // × the sourced rate, per macro goal (§4)
    "strength": 1.0,
    "hypertrophy": 0.75,            // [HEURISTIC — research pass before landing]
    "gain": 0.75,
    "cut": 0.0,                     // 0 ⇒ the gate never arms (replaces goals:false)
    "maintain": 0.0
  },
  "miss_rearm_sessions": 2,
  "max_gap_days": 10,
  "peak_week": "skip",
  "max_pct_per_step": 0.05
}
```

- **Predicate (unchanged shape):** skip the earn when
  `trailing30dPrescribedGainPct ≥ rate_source(bucket) × goal_rate_factor[goal]`
  (pro-rated to the window). With `rate_source: "band_top"` and factors
  `{1,1,1,0,0}` this is *exactly* the review's Phase-1 ceiling — the
  amendment is backward-compatible and costs nothing beyond two params and
  the factor table. It therefore **ships in Phase 1**, not Phase 3.
- **`goal_rate_factor: 0` subsumes the opt-out booleans.** Cut/maintain
  default to a flat prescribed-strength trajectory (the R24 resolution),
  and "let a novice cut still progress slowly" becomes one param flip
  (e.g. `cut: 0.25`) instead of a new mechanism.
- **Quantization arithmetic** (quantum ≈ 2.5–3.5% of e1RM, ~4.33
  microcycles/month, per exercise): at `band_mid`, a beginner (6%/mo) earns
  ~2 steps/month — roughly every other microcycle; an intermediate
  (2.25%/mo) ~0.8/month — about monthly; an advanced lifter (1%/mo)
  ~0.35/month — one step per quarter per lift. At `band_top` multiply by
  ~1.3. Coarse-increment lifts have larger quanta and step correspondingly
  less often (the `max_pct_per_step` cap and the editable per-exercise
  increment govern the extremes). Compounding is negligible at these
  magnitudes over a 30-day window.
- **Recommended default: `band_mid`.** It reads as "pace to the middle of
  the evidenced band, leave headroom for the athlete who volunteers more"
  (voluntary over-performance still raises the anchor directly — that path
  is untouched and un-paced). `band_top` is the single-flip aggressive
  setting; it is also the conservative *change* relative to the already-
  reviewed design, so it is the fallback if the owner wants the amendment
  landed with zero new tuning surface.

### 3.4 Personalization and the N21 dependency

Today the strength band is **bucket-only** — `computeTarget`'s strength path
reads `strength_pct_month[bucket]` and applies neither the age taper nor the
sex factor (`src/lib/engine/macro.ts:285-302`); that is finding one of the
N21 audit. So the v1 pacer personalizes exactly as far as the current macro
engine does: experience bucket (training-age-led, `macro.ts:89-96`). The
60-year-old-female-beginner vs 18-year-old-male-beginner distinction the
owner wants is real but **lives in N21**: when the macro-target correction
fixes the strength model (age/sex-aware, continuous rather than bucketed),
the pacer consumes it by flipping `rate_source` to `"plan"` — reading the
per-user rate off `planMacrocycle` output rather than the raw band. No
progression-side rework; the pacer is deliberately a thin consumer of
whatever rate the macro layer stands behind.

Two adjacent notes:

- **N34 (DEXA)** enriches the same pipeline from the other end: measured
  body-fat/FFMI sharpens the profile that N21's corrected model would
  consume. Neither is a blocker for Phase-1 pacing.
- **Measured-rate adaptation** (feeding the athlete's *achieved* trailing
  rate back into their target rate) stays **Phase 3, deliberately**. The
  measured anchor already self-corrects the loop per-step (misses re-arm
  without compounding); pacing on the measured rate as well creates a
  second feedback path around the same signal and invites oscillation.
  Revisit with field data, per the review's original Phase-3 posture.

---

## 4. A strength rate for every goal

The owner's inference is correct and the design embraces it: under §3 the
strength rate-of-change stops being a strength-goal artifact and becomes a
**per-goal pacing input** — every macrocycle type carries one, including the
flat ones.

| goal | `goal_rate_factor` (default) | rationale | evidence status |
|---|---|---|---|
| strength | 1.0 | the band *is* the goal | doc 10 §5 [EVIDENCED-adjacent, heuristic bands] |
| hypertrophy / gain | 0.75 | similar-order strength gain expected, modestly discounted for load specificity | **[HEURISTIC — confirm before landing]** |
| cut | 0.0 | hold strength honestly in a deficit (R24) | doc 10 §5 cut framing |
| maintain | 0.0 | flat by stated intent | — |

On the hypertrophy factor, the owner's "subject to confirming the research"
is the right instinct and the number above is a placeholder for that pass,
not a conclusion. Two considerations pull in opposite directions:

- **Load specificity** argues for a discount: heavy-load training produces
  larger 1RM gains than moderate-load training at similar hypertrophy
  (the Schoenfeld loading meta-analyses), so a lifter training 8–12 should
  bank tested-1RM strength somewhat slower than one training 3–5.
- **But our "strength" is e1RM measured in the trained window**, not a
  tested single. A hypertrophy athlete adding reps/load at 8–12 raises
  their e1RM through the same curve the strength athlete does; the
  specificity penalty largely concerns *expressing* the estimate as a
  maximal single. That narrows the gap and is why the factor is 0.75
  rather than 0.5.

If the research pass concludes the rates are effectively equal in e1RM
space, the factor collapses to 1.0 and the owner's sharper formulation
becomes literal: **strength vs hypertrophy programming differs by rep
window, not progression rate.** The windows are already per-goal
(`engine_params.rep_window`: strength 3–5 in 2–6, hypertrophy/gain/cut/
maintain 8–12 in 6–15 — `src/lib/engine/params.ts:316-320`), and the
quantum is priced in e1RM space so the progression machinery is
window-agnostic — nothing else differs.

Likewise cut vs maintain: identical flat prescription behavior, differing in
stated objective and in what *outcome* measurement would validate them —
which is exactly the slot N34's DEXA verdicts (lean-mass retention on a cut,
recomposition on maintenance) are designed to fill. The prescription engine
does not need to distinguish them; the macro layer's goal record and the
body-comp time series do.

---

## 5. The two point questions

### 5.1 `anchor.confidence` capping at `moderate` for compliant hypertrophy — intentional?

**Intentional, and it should stand.** Confidence grades the accuracy of the
e1RM *estimate*, not the quality of the training: the Epley/Brzycki-family
curves are calibrated near maximal efforts and their extrapolation error
grows with distance from a 1RM, which is why doc 10 §9's honesty guardrail
declares e1RM "weakest above ~12 effective reps or ≥4 RIR." The bands encode
exactly that (`confidenceFor`, `src/lib/engine/predict.ts:78-92`): `high`
requires ≤ 8 effective reps at ≤ 2 RIR — a genuinely near-maximal
observation — and a compliant hypertrophy set sits at ~11 effective reps all
meso by the Option-A invariant. Its e1RM estimate honestly *is* only
moderately confident; relabeling it `high` would weaken the guardrail to
flatter the flagship goal. (Strength-window sets, at 3–6 effective reps, do
reach `high` — the ceiling is a property of high-rep training, not of the
engine.)

It became worth flagging only because the earn gate keyed on it: a `high`
floor would have made the progression feature provably inert for
hypertrophy. The review already carries the fix — the floor opens at
`moderate` (§6.4), which every compliant week satisfies in both windows —
plus the §7.4 golden that asserts the gate actually arms at shipped
defaults per goal. If a future gate ever wants a stricter notion of "trust
this anchor" than the display bands express, the right move is review §10
Q3's decoupled earn-gate confidence, not inflating the measurement's label.

One adjacent nuance worth knowing: at the *individual set* level an
unreported RIR scores `low` confidence unconditionally
(`predict.ts:83-84`). Anchors still reach `moderate` because the anchor
query substitutes the prescription's target RIR for the missing report
(§5.2) — the assumed-RIR premise is what lifts anchor confidence off the
floor. That coupling is by design (doc 11), but it means §5.2's answer is
also the answer to "why does confidence work at all."

### 5.2 What is "reported RIR"?

**A real, optional, per-set database field — not a derived value — that no
surface can currently write.** The full trace:

- **Schema:** `logged_sets.rir_reported int check (rir_reported between 0
  and 10)`, present since the initial schema
  (`supabase/migrations/20260611000001_initial_schema.sql:354`). Nullable;
  null means "not reported."
- **Honored everywhere on read.** The stamped per-set e1RM uses
  `coalesce(rir_reported, 0)`-style effective reps (migration
  `20260623130000_logged_set_e1rm.sql`); the strength-anchor query scores
  each set at `rir_reported ?? prescription target RIR`
  (`src/lib/queries/anchors.ts:149`); the PR view and the hard-set rule in
  `v_meso_week_muscle_sets` (`rir_reported ≤ 4 or unreported`) consume it;
  history views expose `avg_rir_reported`. The engine's performance
  assessment also reads it when present (a reported RIR below target is one
  of the two anchor-raising routes the review names).
- **Accepted at the boundary.** The log/amend server actions validate an
  optional `rir_reported` (`src/app/(app)/log/actions.ts:84,143`).
- **Never written.** The day view logs every set with `rir_reported: null`
  (`DayView.tsx:1496`) and the amend path preserves whatever is stored
  (`DayView.tsx:1520`); no MCP tool writes sets at all. So in practice the
  column is always null today, and every set is scored at the prescribed
  target RIR.

This is the doc-11 premise made concrete: the decision was explicitly *no
separate per-set RIR capture* — "the app prescribes a target RIR and trusts
the user to hit it honestly, so a logged weight × reps against a target RIR
is itself an RIR data point" (`src/lib/engine/reps.ts:4-9`). The column is
the deliberate escape hatch the schema kept: wherever an honest report
*does* exist, it overrides the assumption.

Why the review kept mentioning it: the recommended design leans on that
escape hatch in two places — the earn gate honors a reported RIR on any set
(a set ground out below `targetRir − rir_tolerance` breaks "fully
performed"), and §10 Q6 proposes periodically *requiring* one honest RIR
report to re-ground a long run of earned steps. Both are dormant while no
input affordance exists. So Q6 is really a two-part decision: adopting it
means shipping a minimal capture surface (e.g. an optional RIR field on the
set row or the set-audit sheet) **and** amending the doc-11 premise from
"no per-set RIR capture" to "optional, never demanded per set" — one narrow
product change, not an engine one. Until then, the honest-grinder
mitigation in review §6.5 runs entirely on the workload gate and the rate
pacer — which §3 just strengthened, and which is a further argument for
pacing shipping in Phase 1.

---

## 6. Updated decision list (supersedes review §10)

1. **δ mode** — unchanged ask: `min(weight, rep)` recommended, with the
   realized-ask rule owning the lattice; `increment`-only is the simpler
   alternative.
2. **Adopt macro-rate pacing** (§3, amends the review's rate ceiling) —
   recommended yes, Phase 1. Sub-choice: `rate_source` default `band_mid`
   (recommended) vs `band_top` (identical to the already-reviewed ceiling;
   zero new tuning).
3. **Per-goal rate factors** (§4) — confirm the shape (0 for cut/maintain
   replacing the booleans), and gate the hypertrophy default (0.75 vs 1.0)
   on a doc-10-style research pass before v20 lands.
4. **Confidence floor** — `moderate`, per §5.1 (`high` provably inert for
   hypertrophy); the decoupled earn-gate confidence remains available if
   ever needed.
5. **Peak-week steps** — unchanged: recommend `skip` at target RIR 0.
6. **Periodic honest-RIR confirmation** — now explicitly a two-part
   decision (§5.2): the engine rule **and** the per-set RIR capture
   affordance + doc-11 premise amendment it requires. Recommend deferring
   both together and relying on the workload gate + rate pacer until field
   data argues otherwise.

The review's §7 mechanism (rule module, `A*` threading, seed opt, doc-14
treatment, tests) and §7.5 phasing stand as written, with one delta: the
pacing params of §3.3 replace `rate_ceiling` + `goals`, and the §7.4 goldens
gain a pacing case (an over-trajectory earn is skipped and traced as such;
`goal_rate_factor: 0` reproduces today's behavior byte-identically).
