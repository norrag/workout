# Phase R research pass — `goal_rate_factor.hypertrophy`

**Status:** research finding for the doc-16 §10 **Phase R** activation gate
(2026-07-09). Resolves the `[HEURISTIC — research pass is an activation gate]`
flag on `progression.goal_rate_factor.hypertrophy` (doc 16 §4, §6; doc 10 §4).
Evidence-labelled in the doc-10 house style. **Recommendation: keep 0.75**
(do **not** collapse to 1.0). This doc is the rationale record the owner reviews
before activating v20.

---

## 1. What the factor does (so the number means something)

`goal_rate_factor[goal]` scales the **macro-rate pacer's** target gain rate
(`rules/progression.ts::pacerTargetRate`):

```
target %/mo = ( band.low + (band.high − band.low) × band_position ) × goal_rate_factor[goal]
```

where `band = macro_target.strength_pct_month[experienceBucket]`. The pacer
**skips** an earned step (status `paced`) while the trailing prescribed e1RM
gain already meets `target`. So the factor sets **how fast prescribed e1RM is
allowed to climb for a given goal**, expressed as a fraction of the strength
band. It is a *governor on the ask* — it never mints an unearned step
(principle 4, budget-never-quota). Cut/maintain at 0.0 disable the gate
entirely (R24 — hold strength honestly); the live question is only the
hypertrophy/gain value.

Crucially, the factor is **not** the ratio of hypertrophy to strength — the
engine already separates those goals by **rep window** (`rep_window.strength`
3–5 vs `rep_window.hypertrophy` 8–12). The factor captures the **residual**:
even at matched effort and compliance, a block trained in the 8–12 window
converts to measured 1RM/e1RM strength **more slowly** than a 3–5 block. The
question the research answers: *by how much?*

## 2. Evidence

All estimates **[HEURISTIC / model-based]** — labelled per doc 10 §9; present
the conservative end.

**Heavy vs. moderate load, 1RM strength [EVIDENCED — direction; magnitude
HEURISTIC].** In resistance-trained men, matched to failure, heavy (2–4 rep)
vs. moderate (8–12 rep) loading over 8 weeks:

| Lift | Heavy Δ1RM | Moderate Δ1RM | moderate ÷ heavy |
|---|---|---|---|
| Squat | +30.0% (ES 1.12) | +16.8% (ES 0.71) | **0.56** |
| Bench | +14.4% (ES 0.67) | +10.5% (ES 0.38) | **0.73** |

*(Schoenfeld/Peterson/Ogborn/Contreras/Sonmez 2016, JSCR — "Differential
Effects of Heavy vs. Moderate Loads." Hypertrophy ran the other way: moderate
group grew more, lateral thigh 10.4% vs 4.1%.)*

**Load-continuum meta-analysis [EVIDENCED — direction].** Pooled across
studies, 1RM gains significantly favour higher loads; hypertrophy is similar
across the loading spectrum. *(Schoenfeld/Grgic/Ogborn/Krieger 2017, JSCR
meta-analysis — "maximal strength benefits are obtained from the use of heavy
loads while muscle hypertrophy can be equally achieved across a spectrum of
loading ranges.")*

**Volume-matched intensity [EVIDENCED — direction].** With volume equated,
all intensities build strength, but only the heavier intensity (80% 1RM) is
*superior*; the 8–12 zone lands between. *(Lasevicius 2018, EJSS; Campos 2002
— the 3–5RM group showed the greatest 1RM gains of the three rep zones.)*

**Synthesis.** The moderate-load 1RM conversion runs **~0.56–0.73** of the
heavy-load rate in the one head-to-head that isolates rep zone, consistent
with the meta-analytic direction. A hypertrophy-goal athlete (8–12 window)
should be *paced* to a prescribed-strength rate below the strength band, not
at it.

## 3. Recommendation

**Keep `goal_rate_factor.hypertrophy = 0.75` (and `gain = 0.75`).** It sits at
the top of the evidenced 0.56–0.73 conversion band — the deliberately
**conservative-for-a-governor** choice: the pacer's job is to *delay* steps,
so erring the factor slightly **high** means the pacer intervenes *less* and
lets honestly-earned performance flow through (the anchor path is never paced,
principle 4). A value at the band's floor (~0.56) would throttle earned
hypertrophy progression harder than the evidence warrants. 0.75 also keeps the
pacing outcomes doc 16 §3.5 quotes (intermediate ≈ monthly) intact.

**Do not collapse to 1.0.** Pacing hypertrophy at the full strength band would
assert that an 8–12 block earns 1RM as fast as a 3–5 block — contradicted by
every source above.

**Residual uncertainty (labelled).** The 0.56–0.73 range is from trained-male
data on two lifts; individual variation dwarfs the mean (doc 10 §5, Hubal
2005). 0.75 is a **defensible default, not a tuned constant** — the doc-16
§8.3 audit aggregate (`get_progression_history`: `vanished` share, earn/miss
mix, prescribed-vs-measured gain) is the field-data instrument to revisit it
once v20 has run. This is exactly the Phase-1/2-field-data feedback the
envelope loop (doc 16 §11) is designed to consume.

## 4. Interaction with the "too aggressive?" concern (Batch 13)

The owner's follow-up worried the RIR ramp (+1 performed rep/week) **plus** an
earned step is double progression. The answer already in doc 16: the ramp rep
is *reserve drawdown* (RIR-neutral, no e1RM change), and the **pacer bounds the
capacity quantum to one honest step per the goal rate**. The 0.75 factor is a
direct lever on that bound — it is *why* a hypertrophy block does not get the
full strength cadence. Keeping it at 0.75 (vs 1.0) is the mechanism that keeps
the combined ask from being too aggressive. Confirms the design; no change.

## 5. Feeds N21

This pass also surfaced the **strength-path** evidence N21 needs (age/sex
modifiers), captured separately in
[`2026-07-09-n21-strength-rate-priming.md`](./2026-07-09-n21-strength-rate-priming.md)
so the `rate_source: "plan"` flip (doc 16 §11) has a correct per-user monthly
strength rate to read once N21 lands.

## Sources

- Schoenfeld BJ, Contreras B, Vigotsky AD, Peterson M. Differential Effects of
  Heavy vs. Moderate Loads on Measures of Strength and Hypertrophy in
  Resistance-Trained Men. *J Strength Cond Res* 2016.
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC5131226/>
- Schoenfeld BJ, Grgic J, Ogborn D, Krieger JW. Strength and Hypertrophy
  Adaptations Between Low- vs. High-Load Resistance Training: A Systematic
  Review and Meta-analysis. *J Strength Cond Res* 2017.
  <https://journals.lww.com/nsca-jscr/fulltext/2017/12000/strength_and_hypertrophy_adaptations_between_low_.31.aspx>
- Lasevicius T, et al. Effects of different intensities of resistance training
  with equated volume load on muscle strength and hypertrophy. *Eur J Sport
  Sci* 2018. <https://onlinelibrary.wiley.com/doi/10.1080/17461391.2018.1450898>
- Campos GER, et al. Muscular adaptations in response to three different
  resistance-training regimens. *Eur J Appl Physiol* 2002.
