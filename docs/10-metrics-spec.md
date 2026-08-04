# 10 — Metrics & Engine Parameters (research-backed)

Status: **authoritative for metric definitions and default engine parameters.** This document
gives every number the app displays or the engine consumes a precise definition and a default
value, each grounded in sports-science evidence and flagged for confidence. It is the companion
to [04-feedback-engine.md](04-feedback-engine.md) (which describes the engine's *logic*); the
concrete *values* and *metric definitions* live here. All numeric thresholds are
**tunable in `engine_params`** per hard rule #3 — nothing below is hard-coded.

> **Evidence discipline.** The user directive: research-backed metrics that actually help, not
> "pretty numbers." Each item is tagged **[EVIDENCED]** (RCT/meta-analytic support),
> **[HEURISTIC]** (sound practitioner consensus, weak/!no direct trial support), or **[DERIVED]**
> (mechanical definition). §9 lists the honesty guardrails — things we must **not** overclaim.

## Decisions locked (2026-06-14)

1. **Realistic target = profile-personalized, scientifically-sound estimate.** The macrocycle
   engine ingests the full profile (sex, age, height, bodyweight, experience level, training age,
   and bodyweight relative to genetic potential) and outputs a **recommended goal range and a
   recommended macrocycle timeframe** for the chosen goal. Shown generally as an estimate; **no
   progress-vs-target bar** (we don't track bodyweight over time). §5.
2. **Session feedback stays.** The Workout Complete sheet (1.5) is **redesigned** to re-add the
   session sliders (overall fatigue / effort / performance) alongside paragraph notes, using the
   same slider UI as the per-exercise prompt (1.4). The mockup dropped these inadvertently
   (authorized deviation — see PROGRESS / 09). The autoregulation *panel* stays removed. §3.
3. **Volume counting = fractional 1.0 / 0.5** — a set counts 1.0 for the exercise's primary
   muscle(s) and 0.5 for secondary muscle(s), using `exercise_muscle_groups.role`. §2.
4. **Key lifts = auto by frequency** — the most-logged exercises across the macro define the
   strength rollup and the est-1RM-by-meso trend. §6.

Defaults applied unless overridden: **(a)** absolute targets sex-scale by ~0.5 for female profiles
(relative %s unchanged — see §5); **(b)** pump is a secondary ±1 corroborator only, never primary
(§3).

---

## 1. Estimated 1RM (e1RM)

**Definition [DERIVED + EVIDENCED].** From a logged working set of `weight × reps` at a reported
`rir`:
```
effectiveReps = reps + rir                    // reps-to-failure equivalent
e1RM = average( Epley(weight, effectiveReps), Brzycki(weight, effectiveReps) )
  Epley:   1RM = weight × (1 + effectiveReps/30)
  Brzycki: 1RM = weight × 36 / (37 − effectiveReps)
```
- **Why effective reps:** prediction formulas assume reps-to-failure; folding RIR in via
  `reps + rir` is the standard way to estimate from non-failure sets and matches RPE/RIR→%1RM
  tables. *(Zourdos 2016; standard RPE-calculator practice.)*
- **Why average Epley & Brzycki:** Epley drifts high and Brzycki low at higher reps; averaging
  cancels the opposing bias across the 5–15 range. *(LeSuer 1997; Mayhew 1992.)*
- **Brzycki cutoff [AMENDED 2026-06-24, §S3].** Brzycki tracks Epley to ~10 reps then inflates
  *increasingly* above it (its `37 − effReps` denominator goes near-zero), so a 20–30-rep burnout
  produced a 2–4× e1RM blow-up. The rule is now: **average Epley+Brzycki only for effective reps
  ≤ `e1rm.brzycki_max_eff_reps`, Epley alone above** (drop the average outside the band where the
  two agree). Tunable; default **10** in engine_params v11. The legacy `< 36 ⇒ average` behavior is
  preserved when the param is absent (every pre-v11 row). The single switch lives in `e1rmFactor()`
  so the forward estimate and the inverse load-for-reps math stay consistent. See
  `docs/reviews/2026-06-23-standalone-prescription-investigation.md`.
- **Confidence weighting [EVIDENCED]:** trust is highest at low effective reps / low RIR and
  degrades fast beyond. The band is now **persisted per set** (`logged_sets.e1rm_confidence`,
  migration `20260708000001`) alongside the stored `e1rm` — stamped at log/amend and restamped when
  the `e1rm` block changes — so an estimate's reliability is auditable and surfaceable (history
  glossary card, MCP) without recomputing. Down-weight low-confidence points in "best e1RM" and
  trend lines:
  | effective reps | RIR | confidence |
  |---|---|---|
  | ≤ 8 | 0–2 | high |
  | 9–12 | 0–3 | moderate |
  | > 12 | ≥ 4 | low (display with a band / caveat) |
  *(Formula error and RIR self-report error both grow with reps-from-failure: Hackett 2017 ≈ ±1 rep at 0–5 RIR vs >2 reps at 7–10; Steele 2017 — lifters systematically under-report proximity to failure.)*
- **Presentation guardrail:** e1RM is an **estimate/trend**, smoothed across sessions — never a
  to-the-pound claim, and never headline-precise from sets above ~12 effective reps.

Params: `e1rm.formula = ["epley","brzycki"]` (averaged), `e1rm.rir_offset = 1.0`,
`e1rm.confidence_bands` as above.

## 2. Volume metrics

**Counting rule [EVIDENCED — fractional]:** for a completed working set of an exercise,
credit **1.0 set** to each `primary` muscle and **0.5 set** to each `secondary` muscle
(`exercise_muscle_groups.role`). Only **hard/working sets** count (warm-ups excluded); a set must
be taken near enough to failure to be a stimulus (default: logged at `rir ≤ params.volume.counting_max_rir`, default 4). *(Pelland 2024 — fractional method had the strongest evidence; SBS/Nuckols, Helms Pyramid, Henselmans endorse 1.0/0.5; tunable because Krieger's prime-mover-binary is a defensible alternative.)*

Params: `volume.direct = 1.0`, `volume.indirect = 0.5`, `volume.counting_max_rir = 4`,
`volume.warmups_count = false`.

**Sets per muscle per week** (Balance tab, the autoregulation target): sum of fractional working
sets for a muscle across the meso week. "Avg sets/week — planned" = the planned fractional sets
averaged over the meso's working weeks.

**Weekly-set landmarks (MEV / MAV / MRV)** — the autoregulation ramp's floor, productive zone, and
ceiling. The broad dose-response (more sets → more growth, diminishing returns, productive band
**~10–20 hard sets/muscle/week**) is **[EVIDENCED]** *(Schoenfeld 2017; Baz-Valle 2022; Pelland
2024)*. The **per-muscle exact numbers are [HEURISTIC]** *(RP / Israetel)* — seed as tunable
starting points, scaled by experience (beginners start lower, lower MRV):

| Muscle group | MEV (start) | MAV (work zone) | MRV (ceiling) |
|---|---|---|---|
| Back | 10 | 14–22 | 25 |
| Chest | 8 | 12–20 | 22 |
| Quads | 8 | 12–18 | 20 |
| Hamstrings | 6 | 10–16 | 20 |
| Glutes | 4 | 8–16 | 20 |
| Shoulders (delts) | 8 | 12–20 | 26 |
| Biceps | 6 | 10–20 | 26 |
| Triceps | 6 | 10–18 | 24 |
| Calves | 6 | 8–16 | 20 |
| Abs | 4 | 8–16 | 25 |

> Numbers are weekly **direct-equivalent** sets for an intermediate; the engine starts a meso near
> MEV and ramps toward MRV via the §3 autoregulation, then deloads. These are starting points, not
> gospel (RP's own framing). Stored in `engine_params.volume.landmarks.<muscle>`.

## 3. Subjective feedback signals & volume autoregulation

**Per-exercise prompt (1.4), per muscle group:**
- `joint_pain` 0–3 (none / low / moderate / high) — **hard safety gate [DERIVED policy]**.
- `pump` 0–10 (no pump → best ever) — **secondary corroborator only [HEURISTIC, weak]**. The
  cell-swelling basis is explicitly *theoretical*; no human study shows pump magnitude predicts
  growth. *(Schoenfeld & Contreras 2014; Roberts 2020 — "virtually no supporting data.")*
- `workload` 0–10 (too easy ↔ just right=5 ↔ too much) — **primary volume driver [HEURISTIC, RP]**:
  the per-muscle recovery-disruption rating that sets next week's set count.

**Session feedback on the Workout Complete sheet (1.5), redesigned** (decision 2) — same slider UI:
- `overall_fatigue` 0–4, `effort_rating` 0–4, `performance_rating` 0–4 — a session-level dampener:
  poor fatigue/performance on a session **down-weights all increases** that session fed
  (`params.session.dampen_on_low_performance`). *(Soreness/fatigue are recovery gates, not growth
  proxies — Schoenfeld & Contreras 2013; use to hold back, not to push.)*

**Next-week set-count mapping** (per muscle group; lives in `engine_params.autoreg`):

| Step | Rule |
|---|---|
| 0. Joint-pain gate (first) | `joint_pain ≥ 2` → never add sets; `= 3` → −1 to −2 sets or suggest substitution, regardless of the rest. |
| 1. Primary, from `workload` | 0–2 → **+2**; 3–4 → **+1**; 5–6 (just right) → **+1** (default ramp toward MRV); 7–8 → **hold**; 9–10 → **−1 to −2** / trigger deload. |
| 2. Pump nudge (secondary, ±1 max) | base `+1` and `pump ≤ 3` → upgrade to **+2**; borderline `workload` 6–7 and `pump ≥ 8` → bias to **hold**. Never overrides steps 0/1. |
| 3. MRV stop | two weeks of `workload ≥ 9`, or `workload ≥ 7` with performance missing target, or `joint_pain ≥ 2` persisting → **deload** (§4) and restart the ramp. |

All clamped to the muscle's MEV floor and MRV ceiling (§2). **[HEURISTIC — RP method]**; mirrors
RP's published add/hold/reduce logic with the well-evidenced signals primary (workload/performance,
RIR) and the weak ones (pump) only nudging. Params: `autoreg.workload_bands`, `autoreg.pump_*`,
`autoreg.pain_gate`, `autoreg.mrv_stop`.

**RIR self-report reliability [EVIDENCED]:** usable but biased — lifters under-report proximity to
failure; accuracy is good within ~0–3 RIR and noisy at ≥4. Treat early-meso (high-RIR) targets as
softer; weight near-failure data highest. *(Zourdos 2016/2019; Hackett 2017; Steele 2017 — note the
experience effect is contested, so don't assume "advanced ⇒ accurate".)*

## 4. Progression & periodization defaults

**Load increment (double progression) [principle EVIDENCED; sizes HEURISTIC].** Advance reps within
the prescribed range; when the top of the range is hit for all sets at target RIR, add one
increment and reset to the bottom. *(Progressive overload via load or reps is interchangeable for
hypertrophy — Plotkin 2022.)*

> **Implemented by [doc 16 — prescribed progression](./16-prescribed-progression.md)** (2026-07-09,
> `engine_params` v20): the RIR-neutral Option-A climb had silently lost this section's overload
> intent (compliance was a fixed point — doc 16 §1). The earned-step mechanism realizes it inside
> doc 13's anchor→weight framework: the demand leads the measured anchor by one earned quantum
> (`A* = A + δ`, δ = the smallest honest step — one increment or one rep in e1RM space), gated on
> full compliance and paced by the §5 strength-rate band. Read doc 16 before touching this behavior.

Per-equipment increments in the user's unit, decaying over the block:

| Lift class | Increment (lb / kg) | ≈ % |
|---|---|---|
| Large lower compound (squat, hinge, leg press, hip thrust) | 5–10 / 2.5–5 | ~2.5–5% |
| Upper compound (bench, OHP, row, pull-up) | 2.5–5 / 1.25–2.5 | ~2.5–5% |
| Isolation / small (curl, lateral raise, triceps) | 1–2.5 / 0.5–1.25 (microplates) | ~1–2.5% |

`progression.regression_pct`: marginal miss **−5%**, clear/failed session **−10%**. **[HEURISTIC]**

**RIR ramp [EVIDENCED rationale].** Start ~3 RIR, fall to 0–1 at the peak week; `0 RIR` is a
**peak-week ceiling, not the routine target** (hypertrophy gains flatten past ~1–2 RIR while fatigue
keeps rising). *(Refalo 2023 proximity-to-failure: close-to-failure ≈ to-failure for growth but far
less fatigue; Refalo 2023 fatigue — velocity loss −8% at 3 RIR vs −25% at failure.)* Default
5-week loading block: `3 → 2 → 2/1 → 1 → 0–1`, then deload; compress for shorter blocks.
Params: `rir_ramp.start = 3`, `rir_ramp.end = 0`, `rir_ramp.peak_floor = 1`.

**Deload [HEURISTIC — fatigue management, NOT a proven booster].** Default: **~50% of week-1 sets,
~90% of load (light) down to ~50% (heavy), RIR ≥ 4**, one week, every ~4–6 weeks or at meso end /
on an MRV-stop flag. Frame honestly: the lone RCT *(Coleman 2024)* found **no benefit and a possible
strength decrement** from a planned mid-cycle deload — so deloads are a fatigue valve, not sold as a
growth multiplier. Params: `deload.set_pct = 0.5`, `deload.load_pct = 0.9` (light) / `0.5` (heavy),
`deload.target_rir = 4`.

## 5. Macrocycle target engine (figs 2.2 / 2.3)

`planMacrocycle(profile, goal, durationMonths?, mesoLengthWeeks)` → `{ targetRange, perMonthRate,
recommendedDurationMonths, mesoCount, phases }`. **Pure & parameterized** (§04). Profile inputs:
`sex, age, bodyweight, heightCm, experienceLevel, trainingYears` (training age = years since
`training_since`). The engine **personalizes the target *and* recommends a timeframe** appropriate
to the goal (decision 1) — e.g. a heavier user can be guided to a faster, still-safe cut; a near-
genetic-potential advanced lifter to a modest hypertrophy target over a longer block.

All rate models are **[HEURISTIC / model-based]** — present the **conservative end** and label as
estimates. Scale by experience/training age (front-loaded, halving) and sex.

**Hypertrophy — lean-mass gain. Primary driver = proximity to genetic potential (FFMI), not calendar
training age.** The rate of muscle gain is governed by **how far below your genetic ceiling you are**,
not how long ago you started (Barbell Medicine, SBS, Casey Butt all frame "advanced" as a
distance-from-potential state, not calendar time). We estimate that distance from body composition:
- `FFM = bodyweight × (1 − bodyFat%)`; `FFMI = FFM / height_m²`; normalize to 1.83 m
  (`FFMI_norm = FFMI + 6.1 × (1.83 − height_m)`).
- `developedFraction = clamp((FFMI_norm − untrained) / (ceiling − untrained), 0, 1)` with
  `ceiling = {male 25, female 21.5}`, `untrained = {male 18.5, female 14.5}` normalized FFMI.
- `rate%BW/mo = floor + (base − floor) × (1 − developedFraction)`, `base {1.0, 1.5}`,
  `floor {0.04, 0.09}` (`hypertrophy_base_pct_bw_month`, `hypertrophy_floor_pct_bw_month`).
- `targetLb = bodyweight × rate × months × sexFactor × ageMultiplier`, **capped at
  `proximity_macro_cap_frac` (0.6) × remaining-potential lb** so one block can't claim everything.

This fixes the headline failure case: a lifter who "trained since 2013" but is undermuscled (e.g.
6′1″ 159 lb ~16% bf → FFMI ≈ 17, *below* the untrained baseline) is correctly modeled as having
beginner-class headroom (~+19–29 lb/yr), **not** elite ~2 lb/yr. A genuinely jacked FFMI-25 lifter of
the same calendar age correctly gets ~0. `sexFactor = 0.7` female (relative gains are equal between
sexes — Roberts 2020 / Refalo 2025; the residual reflects women's lower lean-mass fraction, **not** a
halved response, so the old 0.5 was too low), `1.0` male. Also tapered by **age** (older → lower).

**Proxy (height + weight known, body fat not) [v21, doc 17 §2.2]:** the proximity model runs on a
**representative bf% for the BMI leanness band** (`bf_proxy_pct`, per sex: male `{lean 10, average
16, high_bf 25}`, female `{lean 18, average 26, high_bf 35}` — mid-band values consistent with
`cut_bf_thresholds`), so completing the bf% field moves the rate **continuously** from the band's
representative value instead of flipping models; the remaining-potential cap applies on both sides
of the toggle.

**Fallback (no height/bodyweight):** only when body composition can't be read at all we use the
**training-age decay** `rate(T)% = base × e^(−T/tau)`, `tau = 5` yr — monotonic in duration,
tapering toward potential with training age. *(Aragon %BW/month bands; Lyle McDonald front-loaded
model; Casey Butt / Kouri FFMI ceiling ~25; sex: Roberts 2020 / Refalo 2025.)*

> **Evolution.** v3 used experience buckets × duration with a hard **career-cap clamp**, which pinned
> near-potential lifters to an *identical target for every duration* (the "static" bug). v4 replaced
> it with continuous training-age decay. **v5** makes **FFMI proximity the primary driver** (training
> age was a poor proxy — it overstates adaptation for someone who trained for years without growing)
> and corrects the sex factor 0.5 → 0.7. `career_cap_lb` / `career_tau_years` remain in params for
> back-compat only. **Individual variation dwarfs these means** (Hubal 2005: −2% to +59% size on one
> program) — always a labeled estimate band, never a promise.

**Strength — % gain, measured by the §6 est-strength rollup** *(restated with v21: the "% on key
lifts" framing predates PR #157 — key lifts are retired from measurement; the target grades against
the volume-weighted `strengthTrend` headline)*: monthly compounding, decelerating by training
status: beginner ~4–8%/mo (neural/linear phase), intermediate ~1.5–3%/mo, advanced ~0.5–1.5%/mo;
cap long horizons (asymptotic toward potential). **Personalized (v21, doc 17 §2.1):** the band
scales by `strength_sex_factor` (default `{male 1.0, female 1.0}` — relative 1RM gains are
~sex-equal, women slightly higher upper-body; a distinct param from the hypertrophy lean-mass
factor) and by the existing age taper with a **strength-specific floor** `age_taper_floor_strength`
(default **0.7** > the hypertrophy 0.6 — neural adaptation is preserved with age; Peterson 2010,
ACSM 2009). Both endpoints scale; the recommended timeframe reads the same personalized band, and
`planMacrocycle` exposes it goal-independently as `MacroPlan.strengthRatePctMonth` (the doc-16
`rate_source: "plan"` pacer carrier). *(ACSM 2009 — ~40% untrained vs ~16% trained; SBS/Nuckols;
Moritani & DeVries 1979 neural time-course.)*

**Two-component model (v23, doc 17 §2.7 / N43 — supersedes the calendar bucket wherever body comp
is readable):** bucketing the strength rate on **calendar training years** is the same
calendar-vs-body-composition defect N21 fixed for hypertrophy — a lifter with 13 years under the bar
but a below-baseline FFMI has near-novice headroom the *advanced* bucket denies. Strength gain has
two separable, roughly **additive** parts (Moritani/deVries 1979; Balshaw 2017 decomposed individual
strength-change variance into neural drive 30.6% / muscle volume 18.7% / pre-strength 10.6%): a
**neural/skill** term (large in novices, decaying toward a small non-zero floor with effective
training age — Pearcey 2021: plasticity persists) and a **hypertrophy-driven** term (tracks FFM
gain, governed by FFMI proximity — the N21 model). So:
`strengthRate%/mo = neural(effectiveTrainingAge) + k × hypertrophyRate_FFM`, where
`hypertrophyRate_FFM` is the §above proximity rate re-expressed as %/mo of FFM (÷ fat-free fraction)
and `k ≈ 1.0` [HEURISTIC, band 0.8–1.3] — the allometric FFM exponent (~0.8–1.1, Bamman 2007) ×
trained-muscle amplification (~1.1–1.3), i.e. ≈1:1 with whole-body FFM % once skill is fixed. The
neural band is `N0·e^(−effYears/τ) + floor` (`neural_n0 {3,5}`, `neural_tau_years 0.5`,
`neural_floor {0.1,0.4}` %/mo); an **un-bank** guardrail (`undermuscled_unbank`, default 0.5)
discounts effective training age when realized FFM is low (long calendar time, little to show is
itself evidence of ineffective training; neural adaptation is effective-practice-specific). The sum
takes the same v21 sex factor + age taper and is clamped to `rate_ceiling_pct_month` (8%/mo). When
body composition can't be read (no FFMI) the model **degrades to the calendar-bucket band** — the
strength-path mirror of the hypertrophy fallback. NOT adopted: an FFMI-only model (drops the
evidenced neural term), a multiplicative combination (zeroes on either term), or per-user coefficient
tuning (the envelope loop moves position within a band, never the band). All coefficients are
**[HEURISTIC — magnitude a modeling estimate; direction evidenced]**. *(Balshaw 2017; Del Vecchio
2019; Mattocks 2017 — 1RM is partly a trainable skill; Reggiani & Schiaffino 2020 — size↔strength
change coupling is real but weak; Bamman 2007 — allometric FFM exponent.)*

**Cut — fat loss as %BW/week, scaled by leanness/bodyweight (the user's emphasis):**
| Leanness | %BW / week |
|---|---|
| Higher body fat | 1.0–1.5%+ |
| Average | 0.5–1.0% |
| Lean | 0.25–0.5% |
`fatLossLb = bodyweight × (1 − (1 − weeklyRate)^weeks)` — the weekly rate **compounds on the shrinking
bodyweight** so long cuts decelerate instead of extrapolating linearly to absurd totals, then the
total is **capped at `cut_cap_pct_bw` (25% of bodyweight)** since the profile carries no body-fat
floor. **[EVIDENCED — best of the three]** *(Helms/Aragon/Fitschen 2014: 0.5–1%/wk; Garthe 2011:
0.7%/wk preserved & built lean mass, 1.4% did not; Lyle ~31 kcal/lb-fat ceiling → leaner = slower.)*
Heavier/over-fat users can be guided faster and safely; lean users slower. **When the cap binds
the high endpoint (v21, doc 17 §2.3), the low endpoint rescales proportionally**
(`low = low_raw × cap / high_raw`) instead of clamping onto the cap — a long cut keeps a band with
its relative width rather than collapsing to a point.

**Maintain:** target ≈ 0 (recomposition framing); no weight target.

**Recommended timeframe:** given a goal + the personalized rate, the engine suggests the
`recommendedDurationMonths` that yields a meaningful-but-realistic target (e.g. enough months for a
worthwhile lean-mass range without implying gains past plausible rates), and validates/annotates a
user-chosen duration against it. `mesoCount = floor(durationMonths × 4.33 / mesoLengthWeeks)`;
phases spread accumulate → intensify → peak (`params.phase_plan`).

Params: `macro_target.<goal>` rate tables, `macro_target.sex_factor`, `macro_target.age_taper`,
`macro_target.career_cap`, `phase_plan`; v21 (doc 17 §2, gated — absent ⇒ prior behavior):
`macro_target.strength_sex_factor`, `macro_target.age_taper_floor_strength`,
`macro_target.bf_proxy_pct`; v23 (doc 17 §2.7 / N43, gated — absent ⇒ v21 bucket band):
`macro_target.strength_model` (`enabled`, `neural_n0`, `neural_floor`, `neural_tau_years`,
`ffm_coupling_k`, `undermuscled_unbank`, `rate_ceiling_pct_month`).

## 6. Performance metrics (exercise page 3.1a/b, performance tab 4.2)

- **Weight PR [DERIVED]:** heaviest `weight` ever logged for the exercise (any rep count),
  working sets only.
- **Est. 1RM (best) [DERIVED]:** highest §1 e1RM among high/moderate-confidence sets.
- **Volume PR [DERIVED]:** best single-set tonnage (`weight × reps`).
- **Best session volume [DERIVED]:** best per-session total tonnage for the exercise (working sets).
- **Est. 1RM by meso [DERIVED]:** peak e1RM in each meso of the current macro (the M1…M4 bars).
- **Top set by week [DERIVED]:** the set with the highest e1RM that week; `+N LB vs W1` compares its
  `weight` to W1's top set at matched intent.
- **PRs this meso [DERIVED]:** *ALL-TIME* = heavier top `weight` than all pre-meso history;
  *REP PR* = better e1RM at or below the prior top weight (lifts with no prior history can't PR).
- **Times trained / Total volume / First logged [DERIVED]:** session count where the exercise was
  logged / lifetime working-set tonnage / earliest logged date.
- **Est. strength [DERIVED, N16/N9 — supersedes the "key lifts" fold]:** one number rolled up
  bottom-up so the Overview tile and the Performance tab can never disagree (N16). Per exercise:
  **recent best vs starting best** — `(max session-avg e1RM over the most-recent `window_sessions`
  − max over the earliest `window_sessions`) / the earliest`, over its non-deload sessions in scope,
  symmetric non-overlapping windows that shrink on short series (best of first ⌊n/2⌋ vs best of last
  ⌊n/2⌋, capped at `window_sessions`). This replaced the old first→last two-point fold, which let a
  fresh block's deliberately light opening session define the endpoint and crater every continuing
  lift the moment a new meso began (the reported symptom). A single light opener no longer moves the
  number; a genuine multi-session decline still does. Qualifies at ≥`strength.min_sessions`
  non-deload sessions (I11). Per **muscle group**: role-weighted mean (primary 1.0 / secondary 0.5,
  `params.volume`) of its lifts' changes (PH37). **Headline**: volume-weighted mean of the muscle
  changes, weighted by each muscle's fractional set volume over the scope — so a one-lift muscle
  can't swing it as hard as a heavily-trained one. The session value stays the **session average**
  e1RM (N2), which is already RIR-aware (effective reps). `params.strength = { window_sessions: 3,
  min_sessions: 3, tolerance_pct: 1.5 }`. (`params.key_lifts` is retired from this metric.)

## 7. Stats & rollup metrics

- **Total volume (tonnage) [DERIVED]:** Σ `weight × reps` over **working sets only** (warm-ups
  excluded); for reps-only/time exercises, tonnage is omitted (count sessions/reps/time instead).
- **Sessions logged [DERIVED]:** count of `completed` workouts in the macro.
- **Adherence [DERIVED]:** `completed ÷ scheduled` workouts within the cycle to date (skipped and
  past-due-unlogged count against; future workouts excluded). `params.adherence.window = "cycle"`.
- **Progress score [HEURISTIC]:** composite per exercise/muscle from e1RM trend + volume trend +
  feedback quality, rolled to meso/macro, via the shared views so UI and MCP match (§04). Surface
  sparingly; it is a heuristic index, not a measured quantity.
- **Push : pull balance [HEURISTIC — advisory only]:** display the weekly fractional-set ratio with
  a soft band ~0.8–1.2; flag only large deviations as a *suggestion*. **Do not enforce, auto-
  rebalance, or assert posture/injury claims** — the 1:1 ratio is not evidence-based for injury
  prevention. *(Negrete; Augustsson 2024; Warneke 2024; Barbell Medicine.)* Soften the "Balance
  Check" copy accordingly. PPL map: push = chest, front/side delts, triceps; pull = back, rear
  delts, biceps; legs = quads, hamstrings, glutes, calves.

## 8. Consolidated default `engine_params` (sketch)

```jsonc
{
  "e1rm":        { "formulas": ["epley","brzycki"], "rir_offset": 1.0,
                   "confidence": { "high_max_eff_reps": 8, "mod_max_eff_reps": 12, "high_max_rir": 2 } },
  "volume":      { "direct": 1.0, "indirect": 0.5, "counting_max_rir": 4, "warmups_count": false,
                   "landmarks": { "back": [10,22,25], "chest": [8,20,22], "quads": [8,18,20], "hamstrings": [6,16,20],
                                  "glutes": [4,16,20], "delts": [8,20,26], "biceps": [6,20,26], "triceps": [6,18,24],
                                  "calves": [6,16,20], "abs": [4,16,25] } },          // [MEV, MAV_high, MRV]
  "autoreg":     { "workload_bands": { "add2": [0,2], "add1": [3,6], "hold": [7,8], "reduce": [9,10] },
                   "pump_low": 3, "pump_high": 8, "pain_gate": 2, "pain_reduce": 3,
                   "mrv_stop": { "workload_weeks": 2, "workload_min": 9 } },
  "session":     { "dampen_on_low_performance": 0.5 },
  "rir_ramp":    { "start": 3, "end": 0, "peak_floor": 1 },
  "progression": { "increment": { "lower_compound": 5, "upper_compound": 2.5, "isolation": 1.25 },  // lb
                   "regression_pct": { "marginal": 0.05, "failed": 0.10 }, "decay_per_week": true },
  "deload":      { "set_pct": 0.5, "load_pct_light": 0.9, "load_pct_heavy": 0.5, "target_rir": 4,
                   "every_weeks": [4,6] },
  "macro_target": { "sex_factor_female": 0.5, "career_cap_lb": { "male": 40, "female": 20 },
                    "hypertrophy_pct_bw_month": { "beginner": [1.0,1.5], "intermediate": [0.5,1.0], "advanced": [0.25,0.5] },
                    "strength_pct_month":       { "beginner": [4,8], "intermediate": [1.5,3], "advanced": [0.5,1.5] },
                    "cut_pct_bw_week":          { "high_bf": [1.0,1.5], "average": [0.5,1.0], "lean": [0.25,0.5] },
                    "present": "conservative_end", "age_taper": true },
  "phase_plan":  { "order": ["accumulation","intensification","peak"] },
  "key_lifts":   { "n": 5, "selection": "frequency" },   // retired from "est. strength" (N16); kept for parsing
  "strength":    { "window_sessions": 3, "min_sessions": 3, "tolerance_pct": 1.5 },  // §6 est-strength rolling windows
  "adherence":   { "window": "cycle" }
}
```

## 9. Honesty guardrails (do not overclaim)

- **e1RM** is an estimate/trend; never headline-precise, especially above ~12 effective reps or
  ≥4 RIR.
- **Realistic targets** are model-based projections that assume good training/nutrition/recovery
  (a surplus/deficit we don't track); show the conservative end, label as estimates, no progress bar.
- **Pump & soreness** are weak/secondary — never present a big pump or soreness as proof of a good
  workout.
- **Deloads** are fatigue management, not a proven growth/strength booster (Coleman 2024 RCT was
  null/negative).
- **Push:pull balance** is advisory; avoid posture/"muscle imbalance"/injury-prevention claims —
  the evidence doesn't support the 1:1 ratio for those outcomes.
- **MEV/MAV/MRV exact numbers** and **rate-of-gain tables** are heuristics with large individual
  variance — tunable starting points, not guarantees.
- **Reported vs assumed RIR** (doc 21 §2, 2026-08-02). Every strength estimate is priced at an
  *assumed* RIR resolved as `rir_reported ?? the slot's prescribed target_rir`. Surfaces must not
  present the fallback as something the athlete told us: exercise history carries `rir_source`
  (`reported` / `assumed` / `mixed`) and marks an assumed value `~`, and the MCP history payload
  says the same. An assumed RIR is a *plan fact*, not an observation.
- **Backed-off sessions are excluded from strength, kept in volume** (doc 21 §6.2,
  2026-08-04). A slot assigned a target RIR *above* its week's ran deliberately easier, so it is
  set aside from every strength surface — the e1RM trend, `best_e1rm`, and the PR views — the same
  way deload sessions already are (T-A2). The key is the **plan's intent**
  (`workout_exercises.target_rir > microcycles.target_rir`), never measured confidence: confidence
  degrades with effective reps too, so excluding on it would silently drop honest high-rep work.
  Those sets **stay** in volume / MEV-MAV-MRV / adherence with a disclosure count — the work
  consumed recovery budget — and every rollup that hides one says so in a sentence. A lower
  estimate inside a prescribed back-off is compliance, not regression, and no surface may present
  it as the latter. *(A slot run **harder** than its week is fully comparable and keeps every
  claim it earns.)*
  - **Open interaction, flagged not decided:** `logged_hard_sets` (§2's stimulus rule, RIR ≤ 4 or
    unreported) is a *different* filter, so a back-off reported past RIR 4 leaves the hard-set
    count while remaining in the disclosure. The "unreported counts, benefit of the doubt" clause
    that softened this now rarely applies — doc 21 Phase 1 gave `rir_reported` a write surface, so
    it is usually written. Whether a deep back-off should read as under-dosed volume is §2's call
    to make, not doc 21's.

### 9.1 The 2026-08-02 e1RM re-levelling (one-time, N71)

Until doc 21 Phase 1, `logged_sets.rir_reported` had **no write surface**: the day view always sent
`null`, and the per-set e1RM stamp had no fallback, so `effectiveReps = reps + 0` — **every stored
stamp was computed as if the set had been taken to failure**. The strength anchor, meanwhile,
already assumed each set's prescribed `target_rir`. The two disagreed; that divergence is what
showed 384 in exercise history while the anchor said 367.5 (2026-07-04 review §8.2).

Phase 1 makes both paths share `assumedRir`, and the stored stamps are re-derived under it via the
admin-gated `restamp_e1rm` MCP tool. **Every historical e1RM moves up, once** — a set prescribed at
RIR 2 gains 2 effective reps (≈ +6.7 % under Epley at the default `rir_offset: 1.0`). Everything
derived from the per-set stamp re-levels with it: `v_exercise_history.e1rm` / `.best_set_e1rm`,
`v_exercise_overview.best_e1rm`, `v_meso_summary.best_e1rm`, `v_exercise_prs`, key lifts, and the
strength trend.

Read it as a correction, not progress: **no set got stronger on 2026-08-02**, the numbers stopped
under-reporting. Cross-date comparisons that straddle the restamp are not like-for-like; the
*relative* shape of a trend is preserved wherever a block's sets shared one prescribed RIR, and
distorted where the prescribed RIR moved (a deload's sets gain the most, since their target RIR is
the largest in the ramp). Sets that already carried a reported RIR are untouched.

## References (primary anchors)

- e1RM: LeSuer et al. 1997 *JSCR*; Mayhew et al. 1992; Zourdos et al. 2016 *JSCR* 30(1):267 (RIR-RPE
  scale); Hackett et al. 2017 *JSCR* 31(8):2162; Steele et al. 2017 *PeerJ* 5:e4105.
- Volume dose-response & counting: Schoenfeld, Ogborn & Krieger 2017 *J Sports Sci* 35(11):1073;
  Baz-Valle et al. 2018/2022; Pelland et al. 2024/2026 *Sports Med* (fractional counting); Schoenfeld
  et al. 2019 *Sports* (set-counting methods); Israetel/RP volume landmarks.
- Proximity-to-failure & fatigue: Refalo et al. 2023 *Sports Med* 53(3):649; Refalo et al. 2023
  *Sports Med Open* (neuromuscular fatigue); Robinson/Zourdos et al. 2023 meta-regression.
- Pump / soreness validity: Schoenfeld & Contreras 2014 *Strength Cond J* 36(3):21; Schoenfeld &
  Contreras 2013 *Strength Cond J* 35(5):16; Roberts et al. 2020 *Front Physiol* 11:816.
- Rate of gain: Aragon model (*Girth Control* 2007); Lyle McDonald (bodyrecomposition.com); ACSM
  Position Stand 2009; Roberts, Nuckols & Krieger 2020 *JSCR* 34(5):1448 (sex); Refalo et al. 2025
  *PeerJ* (sex, muscle size).
- Cut rate: Helms, Aragon & Fitschen 2014 *JISSN* 11:20; Garthe et al. 2011 *IJSNEM* 21(2):97;
  Alpert 2005 *J Theor Biol* 233:1.
- Progression / deload: Plotkin et al. 2022 *PeerJ*; Helms et al. 2016 *Strength Cond J* (RIR-RPE
  application); Coleman et al. 2024 *PeerJ* 12:e16777 (deload RCT); Bell/Rogerson et al. 2024
  *Sports Med Open* (deload survey).
- Push:pull: Negrete et al. (push:pull ratio); Augustsson et al. 2024 *Sports* 12(8):201; Warneke et
  al. 2024 *Sports Med Open* (posture); Bagordo et al. 2020 *Sports* 8(9):124 (shoulder ER:IR).
</content>
</invoke>
