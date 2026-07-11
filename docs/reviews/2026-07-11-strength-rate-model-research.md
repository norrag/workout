# Strength-rate model research — training age × body composition (N43)

**Status:** research finding for **N43** (backlog), the strength-path analogue
of the N21 hypertrophy correction. Written 2026-07-11 after the R3 (`rate_source:
"plan"`) flip surfaced that the personalized plan strength band still buckets by
**calendar training years** — the same calendar-vs-body-composition defect N21
fixed for hypertrophy. This doc is the evidence record the owner reviews before a
`strength_pct_month` engine change (a future v23); it does **not** itself change
params. Evidence is labelled **EVIDENCED** (direction supported by studies) vs
**HEURISTIC** (magnitude is a modeling estimate), the doc-10 §9 house style.

Companion: [`2026-07-11-pacing-fundamentals-review.md`](./2026-07-11-pacing-fundamentals-review.md)
(what the miscalibrated band does to the pacer, simulated).

---

## 0. The problem, precisely

`planMacrocycle`'s strength band is
`strength_pct_month[bucketFor(profile)] × strengthSexFactor × ageTaper`
(`src/lib/engine/macro.ts:166-175`). `bucketFor` (`macro.ts:99-106`) reads
**training years** first: `<1 ⇒ beginner, <4 ⇒ intermediate, else advanced`;
self-reported level is only the fallback. The bands
(`macro_target.strength_pct_month`): beginner `[4,8]`, intermediate `[1.5,3]`,
advanced `[0.5,1.5]` %/mo.

The **hypertrophy** path was corrected in N21/v5 to price **proximity to genetic
potential** (normalized FFMI vs an untrained baseline and a ceiling), precisely
because calendar time is a poor proxy for remaining adaptive headroom: a lifter
can have 13 years under the bar and still be undermuscled (low FFMI) with
near-novice growth headroom (`hypertrophyRate` / `muscularDevelopment`,
`macro.ts:218-245, 464-487`). The strength path never got the equivalent
treatment.

**The owner's hypothesis (the thing this doc tests).** Strength gain has two
separable components:

1. a **neural/skill** component — motor-unit recruitment, firing rate, technique,
   1RM-as-a-skill — large in true novices, decaying toward a floor with *calendar*
   training age, and largely independent of muscle size;
2. a **hypertrophy-driven** component — strength that tracks fat-free-mass gain,
   governed by FFMI proximity-to-potential (the N21 model), not calendar time.

So a true novice earns **both** (fast neural + fast hypertrophic); a
technically-proficient long-training but undermuscled lifter earns **primarily
the hypertrophic** component (their neural gains are largely banked). Two lifters
at the same FFMI but different training ages should have **different** expected
strength rates.

---

## 1. Verdict

**The two-component structure is supported — the neural half strongly, the
hypertrophic half in direction with contested magnitude — and it should be
combined ADDITIVELY.** Bucketing strength rate on training age alone is wrong for
the same reason it was wrong for hypertrophy, *and additionally* collapses the two
components the literature says are distinct and roughly additive. But the fix is
**not** to swing all the way to an FFMI-only model (the mirror error): the
neural/skill component is real, time-course-driven, and genuinely decouples from
muscle size — so training age belongs in the model, as the **neural term**, not as
the whole bucket.

The strongest single support is **Balshaw et al. (2017)**, which regressed
*individual* strength gains onto their mechanistic drivers and found three roughly
additive contributors — **neural drive 30.6% of variance, muscle volume 18.7%,
pre-training strength 10.6%** — neural the largest single term even at 12 weeks,
hypertrophy already independent and real. That is the two-component (plus a
baseline) structure, measured.

Four caveats that must ride into the params decision:

- **Combine the terms additively, not multiplicatively.** The empirical
  decompositions (Moritani/deVries; Balshaw) *sum* independent contributions, and
  additive gives the right corners for free (a true novice gets both terms large;
  a skilled-but-undermuscled lifter gets mostly the hypertrophic term; a
  skilled-and-near-potential lifter gets only a small residual). A multiplicative
  form would wrongly zero strength gain whenever either term is near zero.
- **The within-person change coupling of size→strength is weak and
  methodology-dependent** (Reggiani & Schiaffino 2020: r ≈ 0.157 over ~20–24 wk,
  n ≈ 283; Vigotsky 2018: variance-accounted 0–24%), and there is a live debate
  (Loenneke vs Taber/Haun, 2019) over whether hypertrophy *causes* strength gain.
  The hypertrophic coefficient is a **modeling assumption**, defensible in
  direction, not a measured constant.
- **Neural gains don't fully "bank" to zero** (Pearcey 2021): cortical/spinal
  plasticity continues into chronic training. Keep a small non-zero neural floor
  for experienced lifters rather than forcing it to 0.
- **FFMI-proximity as a strength-rate driver is a novel synthesis**, not a cited
  formula. We reuse the N21 hypertrophy model as the input to an allometric
  strength coupling. A reasonable engineering choice; not something a paper
  reports.

---

## 2. Evidence by question

### 2.1 Neural adaptations dominate early strength gain, then cede to hypertrophy — EVIDENCED

- **Moritani & deVries (1979)**, *Am J Phys Med* 58(3):115–130 — over 8 weeks,
  neural factors carried the larger share of the **initial** strength increment;
  hypertrophy became dominant only after ~**3–5 weeks**.
- **Del Vecchio et al. (2019)**, *J Physiol* 597(7):1873–1887 — motor-unit
  decomposition: **≤4 weeks** of training raised force via lowered recruitment
  thresholds + higher firing rates ("mainly achieved by adaptations in neural
  drive").
- **Sale (1988)**, *MSSE* 20(5 Suppl):S135–145 and **Folland & Williams (2007)**,
  *Sports Med* 37(2):145–168 — reviews: neural factors greatest in the early
  stage; hypertrophy contributes from onset but leads later (overlapping, not
  cleanly sequential).
- **Balshaw, Massey, Maden-Wilkinson & Folland (2017)**, *Eur J Appl Physiol*
  117:631–640 — 12 weeks, 28 men, individual strength-change variance regressed on
  drivers: **agonist neural drive 30.6%, muscle volume 18.7%, pre-training
  strength 10.6%** (~60% total). Neural the single strongest predictor *even at
  12 weeks*; hypertrophy already an independent contributor. The best direct
  evidence for an additive two-(plus-baseline-)term structure.
- **Pearcey, Alizadeh, Power & Button (2021)**, *Eur J Appl Physiol* — the clean
  neural asymptote is an over-simplification: cortical/spinal plasticity
  **continues into chronic training**. Justifies a small non-zero neural floor for
  experienced lifters rather than zero.

**Reads on the model:** the neural term is real and front-loaded but never exactly
zero. Its natural argument is *effective* training age (time practicing the
specific lift), for which calendar years is a rough proxy — and it **decays** over
months-to-a-few-years toward a small floor. This is the part training age
legitimately informs.

### 2.2 Strength-gain rate by training status — EVIDENCED (direction), HEURISTIC (monthly magnitude)

- **ACSM Position Stand (2009)**, *MSSE* 41(3):687–708 (figures from the 2002
  stand / Kraemer & Ratamess) — cumulative strength increases of ≈ **40%
  untrained, 20% moderately-trained, 16% trained, 10% advanced, 2% elite**, over
  windows from ~4 weeks to 2 years. The canonical tiering — but **cumulative
  percent over heterogeneous durations, not a clean %/month**, so it backs the
  *shape* (monotone decay with status) not our specific band numbers.
- Better-quantified longitudinal leads exist (Steele et al. retrospective growth
  modelling; "Quantifying the Generality of Strength Adaptation", *Sports Med*
  2022) but were not fully read; flagged for a follow-up if the band numbers need
  firmer footing than the ACSM tiers give.

**Reads on the model:** the existing decay *direction* (beginner > intermediate >
advanced) is evidenced; the exact band endpoints are heuristic and always were.

### 2.3 1RM is partly a skill, trainable without hypertrophy — EVIDENCED

- **Mattocks et al. (2017)**, *MSSE* 49(9):1945–1954 — a TEST group doing only
  maximal singles gained **1RM equal to** a HYPER group doing 4×8–12 to failure,
  yet **only HYPER hypertrophied**. Direct dissociation of 1RM gain from muscle
  growth.
- **Buckner et al. (2016/2017)**, *Muscle & Nerve* 54(6):1058–1060 / *Sports Med*
  47(2):193–195 — frames the 1RM as a **specific skill**; the inference that
  hypertrophy causes strength rests on "surprisingly little direct evidence."

**Reads on the model:** supports a neural/skill term that is **partly decoupled**
from mass — i.e., the two terms should be **additive**, not a single mass term
scaled up.

### 2.4 Size→strength change-coupling is real but weak and contested — EVIDENCED (that it's weak)

- **Reggiani & Schiaffino (2020)**, *Eur J Transl Myol* 30(3) — pooled data
  (n ≈ 283, 20–24 wk): Δsize↔Δforce correlation **r ≈ 0.157** (~2.5% of variance),
  mean **+21% force vs +7% size**. The closest thing to a trained-population,
  months-long change-coupling number — and it is *low*.
- **Vigotsky et al. (2018)**, *PeerJ* 6:e5071 — within-person Δsize↔Δstrength
  variance-accounted **0–24%**, flipping with measurement site and statistical
  model (naïve between-subject ≈ 0; hierarchical models 7–24%). Recreationally
  active, 8 weeks.
- **Loenneke et al. (2019)** vs **Taber, Vigotsky, Nuckols & Haun (2019)**, both
  *Sports Med* 49 — the explicit debate: "changes in size do **not** contribute"
  vs "myofibrillar hypertrophy is a **contributory** cause." Unresolved; a causal-
  mediation design is proposed to settle it.

**Reads on the model:** the hypertrophic strength coefficient must be **modest**
and **labelled uncertain** — the *direction* (more FFM headroom → faster strength)
is solid, the *slope* is a judgment call. Crucially for the corner case (§4): for
a **skill-saturated** lifter the neural term is spent, so hypertrophy is the
*primary remaining* driver — the owner's framing — even though its coupling is
loose.

### 2.5 The allometric mass→strength exponent: ~0.65 vs body mass, ~0.76–1.1 vs FFM — EVIDENCED

- **Bamman et al. (2007)** / *Eur J Appl Physiol* 2007 (PubMed 17545893) —
  isometric strength scales as **body-mass^0.64 / CSA^0.71**, and **12 weeks of
  training did not alter the relationship** (the exponent is stable across a
  block). Compound lifts commonly scale body-mass^**0.65–0.75**.
- **Allometric scaling of strength to body size** (*Eur J Appl Physiol* 2007/2008)
  — **fat-free mass is the recommended denominator, and the FFM exponents are
  higher: ~0.76 (F) up to ~1.1 (M)**, because FFM strips out fat. Against FFM
  specifically, the exponent is nearer 1 than the 0.67 body-mass figure.

**Reads on the model — this is a material correction.** Because we couple to
**FFM** (not body mass), the exponent to use is ~**0.8–1.1**, not 0.67. Combined
with the fact that the *trained/tested* muscles grow somewhat faster than
whole-body FFM (amplification ~1.1–1.3×), the net hypertrophic-strength-per-FFM%
coupling is
**`k ≈ 0.8–1.3, central ≈ 1.0`** — i.e. roughly **1:1 with whole-body FFM %**,
once skill is fixed. This is the number that reconciles the owner's apparent
inconsistency (§3), and it lands *higher* than the naïve sub-linear read would
suggest. Caveat: cross-sectional exponents used as a within-person change coupling
is a standard-but-imperfect move, and §2.4's weak longitudinal coupling is the
reason to keep `k` a tunable band rather than a fixed constant.

### 2.6 Sex ≈ rate-equal; chronological age tapers the rate — EVIDENCED (direction)

Consistent with N21's existing choices: relative %/mo strength gains are ~sex-
equal (`strength_sex_factor {1,1}` stands), and the rate tapers with chronological
age (the existing `age_taper` with the strength floor 0.7). No change indicated;
both compose on top of whatever bucket/term structure §4 adopts.

---

## 3. Reconciling the owner's specific case

Garron's live profile: 160.1 lb at 20.4% bf ⇒ FFM ≈ **127.4 lb** (57.8 kg); at
73 in, normalized FFMI ≈ **16.7** — *below* the untrained-male baseline (18.5),
so N21's proximity model reports **developed fraction 0** (full novice-rate
headroom) and projects hypertrophy at the base rate **1.6–2.4 lb/mo** (≈ the
`planMacrocycle` output 9.6–14.4 lb / 6 mo). On 127.4 lb FFM that is **1.26–1.88%
FFM/mo**.

Apply the FFM-scaled coupling (§2.5, `k ≈ 1.0`) plus a small skill-saturated
neural residual (§4, `N_floor ≈ 0.1–0.4 %/mo`):

| term | rate |
|---|---|
| hypertrophic `k × (1.26–1.88%)`, k ≈ 1.0 | **1.26–1.88 %/mo** (range 1.0–2.4 at k's bounds) |
| neural residual (13 yr ⇒ near floor) | **0.1–0.4 %/mo** |
| **projected total** | **≈ 1.4–2.3 %/mo** |

The current **advanced** band (reached by the 12.7-year calendar bucket) is
**0.5–1.5 %/mo**; the **intermediate** band is **1.5–3 %/mo**. So:

- The owner's intuition is **correct, and more so than a sub-linear exponent would
  soften**: coupling to FFM (not body mass) gives `k ≈ 1.0`, so the hypertrophic
  component *alone* is ~1.3–1.9 %/mo, and the total lands squarely in the
  **intermediate** band (1.5–3 %/mo) — **not** the advanced band the calendar
  bucket assigns. Projecting near-novice muscle growth while pacing strength at the
  advanced floor (0.5 %/mo) is internally inconsistent by roughly a factor of two
  to three at the low end.
- This is self-consistent by construction: for a skill-saturated lifter
  `strength_rate ≈ FFM_rate + small residual`, so coupling strength to the *same*
  FFM engine that drives the hypertrophy target makes the two projections agree
  instead of contradict.
- The deeper tell: for a **true novice at the same FFMI 16.7**, the calendar
  bucket says beginner (4–8 %/mo) while the hypertrophic component is the *same*
  ~1.3–1.9 %/mo. The whole gap between how the engine should treat those two
  lifters is the **neural term** (`N0 ≈ 3–5 %/mo` at zero training age) — exactly
  what training age *should* inform, and exactly what a bucket-on-training-age
  model mis-assigns (it folds the neural term into the hypertrophic bucket instead
  of adding it).

**Conclusion:** the calendar-advanced bucket **understates** this lifter's
realistic strength rate (should be intermediate, ~1.5–2.3 %/mo, not advanced
0.5–1.5), gets the *reason* wrong, and mis-handles anyone whose training age and
FFMI disagree. It also retroactively supports the interim **rollback to v21**: the
self-report *intermediate* band (1.5–3) that v21's `"band"` source happens to read
for this profile is close to the model-derived rate, whereas v22's *advanced* plan
band (0.5–1.5) is the one that understates (pacing review §6).

---

## 4. Modeling recommendation

**Functional form — additive two-term, the structure the evidence supports
(§2.1, §2.3 decoupling; §2.5 sub-linear coupling):**

```
strengthRate%/mo  =  neural(trainingAge)  +  b × hypertrophyRate_FFM(profile)
```

- **`hypertrophyRate_FFM`** — reuse the N21 proximity model already in the code
  (`muscularDevelopment` → `hypertrophyRate`), expressed as **%/mo of FFM** (the
  existing %BW output ÷ FFM fraction). This is the term that makes an undermuscled
  long-time lifter progress like they have headroom — the whole point of N21,
  carried to strength.
- **`k`** — the FFM-scaled coupling, **1.0 [HEURISTIC, defensible band 0.8–1.3]**
  (§2.5: FFM exponent ~0.8–1.1 × trained-muscle amplification ~1.1–1.3). Expose it
  as a single tunable param and keep it in that band; the weak longitudinal
  coupling (§2.4) is the reason it is a band, not a fixed 1.0.
- **`neural(trainingAge)`** — a decaying term, **large near zero training age,
  small floor for the experienced**: `neural = N0 × exp(−trainingAge / τ) +
  N_floor`, with **N0 ≈ 3–5 %/mo, τ ≈ 4–8 months, N_floor ≈ 0.1–0.4 %/mo** — all
  **HEURISTIC**, chosen so the additive sum reproduces the ACSM/Balshaw tier
  *shape* (novice total ≈ 4–8 %/mo, advanced total ≈ 0.5–1.5 %/mo) at
  representative FFMI. `N_floor > 0` per Pearcey (2021). Calendar training age is
  the honest argument here — and *only* here.
- **Trust FFM over calendar age when they conflict (recommended guardrail).** FFMI
  16.7 after 13 calendar years is itself evidence of ineffective/inconsistent
  training — realized muscle is a more trustworthy signal than self-reported
  years, and neural adaptation is *effective-practice*-specific, not
  calendar-specific (§2.1). So discount the neural term's effective training age
  when realized FFM is low (let `N` carry a larger residual — partially "un-bank"
  the skill). This *raises* the projection modestly and closes the exact loophole
  (long calendar time, little to show) that motivated N43. **HEURISTIC**; a design
  choice that follows from the evidence, not a cited finding.
- **Sex factor + age taper** — unchanged from N21 (§2.6): sex-neutral rate (Roberts
  2020 — if anything women's relative upper-body rate is equal-or-higher, so a
  penalty would be wrong), age taper ~1.0 to 40 then a modest per-decade discount
  (NSCA 2019). Applied to the sum.
- **Fallback** — when body composition is absent (no height/weight/bf% and no
  proxy), the hypertrophic term can't be computed; degrade to **today's
  calendar-bucket band** as the no-body-comp fallback (mirrors how N21's
  hypertrophy path falls back to training-age decay). The bucket stops being the
  primary model and becomes graceful degradation.

**Sanity checks the goldens should pin:**

- Garron (13 yr, FFMI 16.7): `N_floor 0.1–0.4 + 1.0×(1.26–1.88)` ≈ **1.4–2.3 %/mo**
  — the **intermediate** band, *above* today's advanced calendar bucket, matching
  §3 and the owner's instinct that he is under-paced.
- True novice, FFMI 16.7: `N0 3–5 + 1.0×(1.26–1.88)` ≈ **4.3–6.9 %/mo** — the
  beginner band, *because of the neural term*, not the calendar bucket.
- Advanced & well-muscled (FFMI ≈ 24, developed fraction ≈ 0.85): `N_floor +
  1.0×(small headroom)` ≈ **0.3–0.9 %/mo** — the genuine advanced case the calendar
  bucket was trying to capture, now reached correctly.
- Clamp the total to a sane ceiling (≤ ~8 %/mo) for the genuine-novice corner.

**Explicitly NOT recommended:** an FFMI-only strength model (drops the evidenced
neural term — the mirror of the calendar error); a multiplicative combination
(zeroes strength when either term is near zero — contradicts the additive
decompositions); tuning any coefficient per-user from performance (that is the
envelope loop's job and it moves *position within* a band, never the band — doc 17
principle 4).

---

## 5. What this unblocks / how it ships

- This is **N43**, workstream C (macro engine). It ships as **engine_params v23**
  + a `docs/10-metrics-spec.md` §5 amendment + a `docs/17-macrocycle-goals.md` §2
  amendment, one PR, param-gated and inactive like every engine change (hard rule
  3, doc 17 principle 7), with continuity goldens (§4 sanity checks) and a replay
  diff before activation (Phase-R discipline).
- **Interim (this session):** rolled back to **v21** (`rate_source: "band"`), per
  the owner. Rationale in the pacing review §6 and N43: v21's self-report
  intermediate band (1.13–2.25 %/mo prescribed ceiling) is *less* miscalibrated
  for this lifter than v22's plan advanced band (0.38–1.13), and the earn gate
  remains the honesty mechanism under either (pacing review §3).
- **Precedence:** doc 16 keeps authority over progression internals; this only
  changes how the *target rate the pacer reads* is computed — the same seam N21
  and N37 already touch.

## Sources

- Balshaw TG, Massey GJ, Maden-Wilkinson TM, Folland JP. *Eur J Appl Physiol* 2017;117:631–640 (neural 30.6% / volume 18.7% / pre-strength 10.6% decomposition). <https://pubmed.ncbi.nlm.nih.gov/28239775/>
- Moritani T, deVries HA. *Am J Phys Med* 1979;58(3):115–130. <https://pubmed.ncbi.nlm.nih.gov/453338/>
- Del Vecchio A, et al. *J Physiol* 2019;597(7):1873–1887. <https://pubmed.ncbi.nlm.nih.gov/30727028/>
- Pearcey GEP, Alizadeh S, Power KE, Button DC. *Eur J Appl Physiol* 2021 (neural gains continue chronically). <https://link.springer.com/article/10.1007/s00421-021-04730-4>
- Sale DG. *Med Sci Sports Exerc* 1988;20(5 Suppl):S135–145. <https://pubmed.ncbi.nlm.nih.gov/3057313/>
- Folland JP, Williams AG. *Sports Med* 2007;37(2):145–168. <https://link.springer.com/article/10.2165/00007256-200737020-00004>
- ACSM Position Stand (Ratamess et al.). *Med Sci Sports Exerc* 2009;41(3):687–708. <https://pubmed.ncbi.nlm.nih.gov/19204579/>
- Kraemer WJ, Ratamess NA. *Med Sci Sports Exerc* 2004;36:674–688. <https://pubmed.ncbi.nlm.nih.gov/15064596/>
- Mattocks KT, et al. *Med Sci Sports Exerc* 2017;49(9):1945–1954. <https://pubmed.ncbi.nlm.nih.gov/28463902/>
- Buckner SL, et al. *Muscle Nerve* 2016;54(6):1058–1060. <https://pubmed.ncbi.nlm.nih.gov/27717161/>
- Buckner SL, et al. *Sports Med* 2017;47(2):193–195. <https://link.springer.com/article/10.1007/s40279-016-0580-3>
- Reggiani C, Schiaffino S. *Eur J Transl Myol* 2020;30(3) (size↔strength change r ≈ 0.157, n ≈ 283). <https://pmc.ncbi.nlm.nih.gov/articles/PMC7582410/>
- Vigotsky AD, et al. *PeerJ* 2018;6:e5071. <https://pmc.ncbi.nlm.nih.gov/articles/PMC6026459/>
- Loenneke JP, et al. *Sports Med* 2019;49. <https://link.springer.com/article/10.1007/s40279-019-01106-9>
- Taber CB, Vigotsky A, Nuckols G, Haun CT. *Sports Med* 2019;49. <https://link.springer.com/article/10.1007/s40279-019-01107-8>
- Bamman MM, et al. (allometric scaling of biceps strength before/after training) *Eur J Appl Physiol* 2007. <https://pubmed.ncbi.nlm.nih.gov/17545893/>
- Allometric scaling of strength measurements to body size (FFM exponents ~0.76–1.1). *Eur J Appl Physiol* 2007. <https://link.springer.com/article/10.1007/s00421-007-0654-x>
- Roberts BM, Nuckols G, Krieger JW. Sex differences in resistance training (relative gains ~sex-equal). *J Strength Cond Res* 2020 / corroborating meta *Sci Rep* 2021. <https://www.nature.com/articles/s41598-021-02867-y>
- NSCA Position Statement: Resistance Training for Older Adults. *J Strength Cond Res* 2019. <https://journals.lww.com/nsca-jscr/fulltext/2019/08000/resistance_training_for_older_adults__position.1.aspx>
