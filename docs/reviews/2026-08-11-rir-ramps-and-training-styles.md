# Research pass — RIR ramps and training styles

**Status:** research finding for **doc 22 Phase 3d-r** (2026-08-11, N74), the hard
prerequisite for User Guide **chapter 7, "Choosing your ramp: training styles"**
([doc 22 §6.3](../22-user-manual.md#63-rir-ramps-and-training-styles)).
Evidence-labelled in the doc-10 house style (`[EVIDENCED]` / `[HEURISTIC]` /
`[DERIVED]`), following the pattern of
[`2026-07-09-goal-rate-factor-research.md`](./2026-07-09-goal-rate-factor-research.md).

> **Why this document exists.** Doc 22 §6.3 names chapter 7 as *"the one chapter
> whose content is not already in the repo"*: doc 10 and `COACHING_GUIDE`
> establish the RIR ↔ fatigue relationship and cite the evidence, but neither maps
> ramps to training styles and neither discusses how the *app's own* mechanics
> respond to a ramp choice. **Chapter 7 is written from this document, not from
> the open web** — that is the doc 22 §6.3 rule, and it is what keeps the
> manual's evidence claims reviewable in one place.

**Two outputs beyond the prose source:**

1. **A correction to doc 10 §4's RIR-ramp rationale** — §2.2 below. The
   "gains flatten past ~1–2 RIR" framing is not what the dose–response
   meta-regression found, and the *right* argument for ramping is stronger than
   the one currently written down.
2. **The O7 treatment, taken** — §6. No third-party program is named.

---

## 1. What a ramp actually is in this app (so the research has a target)

Read from `src/lib/engine/rules/rir.ts::rirRamp` and
`cycles/meso/[mesoId]/MesoHeader.tsx`, 2026-08-11. Everything in this section is
**app fact**, not evidence, and it is what the chapter's advice has to be
actionable *against*.

| Fact | Source |
|---|---|
| A block carries `START RIR` and `END RIR`, each an integer **0–5**, with `rir_end ≤ rir_start` enforced | `rirRamp` throws on `rir_end > rir_start`; `MesoHeader.tsx:640–684` |
| Working weeks interpolate **linearly** start → end and round; the last working week sits exactly on `END RIR` | `rirRamp` (`t = i/(workingWeeks−1)`, `Math.round`) |
| `Set each week independently` replaces the interpolation with one value per **working** week — any integers 0–5, **in any order** | `RirScheduleEditor.tsx`; `rirRamp(schedule)` validates `0..5` only, not monotonicity (N18-B) |
| A block is **3–8 weeks** | `rirRamp` throws outside `3..8` |
| The deload week is **engine-owned** — always `deload.target_rir`, never the ramp, whichever form is used | `rirRamp` appends it from `params.deload.target_rir`; `RirScheduleEditor.tsx:112` renders `W{n} DELOAD — RIR SET BY THE ENGINE` |
| The ramp is editable while the block is `planned`; once it is running, the shape is locked | `MesoHeader.tsx:568` (`shapeLocked = status !== "planned"`) |

**So the choosable space is exactly this:** a start value 0–5, an end value no
higher than it, over 3–8 weeks — or an arbitrary per-week sequence in 0–5. That
is the space chapter 7 has to give advice inside. It is narrower than the
literature's range (nothing above 5 RIR is reachable at the *week* level), which
matters: the very-easy end of the style space is reachable only through
**chapter 8's per-exercise lever**, which is unbounded. The two chapters are one
system, and the chapter has to say so.

---

## 2. The evidence

All sources are already in doc 10 §"Sources"; each was re-read at first hand for
this pass (2026-08-11) rather than taken from doc 10's summary, because §2.2 is
what happens when a summary drifts from its source.

### 2.1 Proximity to failure — what it buys

**Hypertrophy: a small, real gradient toward failure. `[EVIDENCED — direction;
magnitude small and uncertain]`**

- Refalo et al. 2023 (*Sports Medicine* 53(3):649–665), systematic review with
  meta-analysis, 15 studies: training **to** set failure versus **not** to
  failure gave a **trivial** advantage for hypertrophy — **ES 0.19 (95% CI 0.00,
  0.37)**. The interval touches zero.
- Robinson, Wolf, Refalo, Zourdos et al. (*Sports Medicine*, meta-regression
  series, "Exploring the Dose–Response Relationship Between Estimated Resistance
  Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy"): the
  marginal slope for estimated RIR on hypertrophy is **negative with confidence
  intervals excluding null** — i.e. muscle size improved progressively as sets
  ended closer to failure. The authors caution explicitly that because RIR was
  *estimated* across the pooled studies, "the exact relationship between RIR and
  muscle hypertrophy and strength remains unclear."

**Strength: flat across RIR. `[EVIDENCED — the more useful finding]`**

- Same meta-regression: for **strength gain**, the confidence intervals for
  estimated RIR **contained null across all best-fit models** — a negligible
  relationship. Strength improved comparably over a wide range of proximities to
  failure.

### 2.2 Proximity to failure — what it costs, and the doc 10 correction

**Fatigue rises with proximity, and it is close to linear. `[EVIDENCED]`**

Refalo et al. 2023 (*Sports Medicine — Open* 9:10): 24 resistance-trained adults
(12 male, 12 female), six bench-press sets at 75% 1RM, in three randomised
trials — to **failure**, to **1 RIR**, and to **3 RIR**. Lifting-velocity loss
four minutes post-exercise:

| Set terminated at | Velocity loss |
|---|---|
| Failure | **−25%** |
| 1 RIR | **−13%** |
| 3 RIR | **−8%** |

with the loss larger in males (−29%) than females (−21%) after the failure
condition. Ratings of perceived discomfort, exertion and soreness rose, general
feelings worsened and perceived recovery fell as failure was approached, and the
authors describe the proximity ↔ fatigue relationship as **linear**.

Doc 10 §4 states the −8% / −25% pair correctly. **Its rationale sentence is the
problem:**

> **doc 10 §4, RIR ramp:** *"`0 RIR` is a **peak-week ceiling, not the routine
> target** (hypertrophy gains flatten past ~1–2 RIR while fatigue keeps rising)."*
> The same sentence is in `COACHING_GUIDE` (`src/lib/mcp/coaching-guide.ts:72–78`).

**Finding: "gains flatten past ~1–2 RIR" is not supported by the sources doc 10
cites.** The meta-regression found a *continuing* negative slope, not a plateau,
and Refalo 2023's failure-vs-non-failure effect is small but positive throughout.
There is no flattening point in either paper.

**The correct argument is stronger, not weaker,** and it is the one chapter 7
must be written from:

> Per set, going closer to failure buys a **small** amount of extra growth and
> **no** extra strength. Per set, it costs fatigue that rises steeply — roughly
> three times the acute velocity loss at failure as at 3 RIR. Fatigue is what
> limits how many sets a week can hold. So a week of more sets a little further
> from failure and a week of fewer sets at failure can buy comparable growth,
> and the second one costs more to recover from.

That is a **trade**, not a diminishing return, and it is why a ramp — spending
the fatigue budget late in a block, when there is a deload behind it — is a
better structure than sitting at either end.

**`[DERIVED]` — not doc 22's to fix.** Doc 10 owns its own §4 wording; this pass
reports the mismatch. Recorded as ledger row **`D-13`** in
[`22a`](../22a-manual-claims.md), and chapter 7 states the trade form above.

### 2.3 Reported RIR is least accurate exactly where a conservative ramp lives

`[EVIDENCED]` — and this is the finding with the sharpest consequence for **this**
app, because a reported RIR is an engine input (doc 21 §2), not just a diary
entry.

- Zourdos et al. 2016 (*JSCR* 30(1):267–275), the paper that introduced the
  RIR-based RPE scale: 29 squatters, 15 experienced and 14 novice. Velocity and
  RPE correlated strongly in both groups (*r* = −0.88 experienced, −0.77 novice),
  but **experienced lifters' RIR reports were more accurate than novices'**. The
  authors' own practical note is that novice lifters should practise recording
  RIR rather than base progression on it until accuracy improves.
- Zourdos/Halperin et al. 2019 (*JSCR*, "Proximity to Failure and Total
  Repetitions Performed in a Set Influences Accuracy of Intraset
  Repetitions-in-Reserve-Based RPE"): **accuracy improves as the set approaches
  failure**, and degrades as the set gets longer.

**`[DERIVED]` consequence for a ramp choice.** A high-RIR ramp asks for exactly
the reports the evidence says are least reliable, and those reports price next
week's weight. The honest statement for the chapter is not "don't train easy" —
it is *"the further from failure you work, the harder your own report is to
judge, so a conservative block is one where the numbers are softer."*

### 2.4 Deloads (chapter 9's evidence, gathered here because it is one pass)

**The one RCT on a planned mid-cycle deload: null-to-negative. `[EVIDENCED — for
that intervention]`**

Coleman et al. 2024 (*PeerJ* 12:e16777), "Gaining more from doing less?": 39
resistance-trained participants (29 men, 10 women) on a 9-week high-volume
programme, randomised to a **complete one-week abstention** at the midpoint or to
continuous training. The deload group finished **worse on lower-body strength**,
with **no difference** in hypertrophy, power, or local muscular endurance.

> **A nuance doc 10 does not carry, and chapter 9 needs.** The trial tested a
> **full week off**, not a reduced week. WORKOUT's deload week prescribes
> *lighter work*, not *no work* — a real training week at `deload.target_rir`.
> The trial is therefore evidence against **taking the week off mid-block**, and
> only indirect evidence about a light week. Both halves have to be said, because
> the first half alone reads as "deloads are proven useless", which the study does
> not show about the thing this app actually does. `[DERIVED]`

**What trained lifters actually do. `[EVIDENCED — practice, not outcome]`**

Rogerson, Nolan, Korakakis, Immonen, Wolf & Bell 2024 (*Sports Medicine — Open*
10:26), cross-sectional survey of 246 competitive strength and physique athletes
(8.2 ± 6.2 years training): **all of them deloaded**. Typical duration **6.4 ± 1.7
days**, integrated **every 5.6 ± 2.3 weeks**. The strategy was predominantly
proactive and pre-planned, often combined with autoregulation, and the stated
triggers were **stalled performance, raised muscle soreness, and joint stress** —
with energy and fatigue management the dominant reason.

**`[HEURISTIC]` — the honest position for chapter 9.** The app's default (a
deload as the last week of a 3–8 week block) sits inside the practice consensus
(~every 5–6 weeks) and is *not* supported by outcome evidence, because the only
outcome trial tested a different intervention at a different point in the block.
It is a scheduling convention chosen for fatigue management. Doc 10 §9's guardrail
— *deloads are fatigue management, not a proven growth or strength booster* —
stands unchanged, and it is binding on every line of chapter 9
([doc 22 §6.1](../22-user-manual.md#61-deloads)).

---

## 3. The app's own response to a ramp choice

This is the part no published study can supply, and it is what makes chapter 7
more than a summary of the literature. All read from code on 2026-08-11.

### 3.1 A ramp that never goes below 4 RIR stops the engine earning steps

`[DERIVED — code, verified]`. The chain:

1. A set's e1RM confidence is `high` at effective reps ≤ `e1rm.high_max_eff_reps`
   (**8**) **and** RIR ≤ `e1rm.high_max_rir` (**2**); `moderate` at ≤
   `mod_max_eff_reps` (**12**) and RIR ≤ `mod_max_rir` (**3**); **`low`
   otherwise** — `engine/predict.ts::confidenceFor`.
2. The strength anchor takes the **strongest** confidence present in the winning
   set's session — `engine/reps.ts::recencyWeightedE1rm` → `bestConfidence`.
3. The earned step is refused when the anchor's confidence is below
   `progression.min_confidence`, which is **`moderate`** on the live v25 row —
   `engine/rules/progression.ts:267`, status `not_earned`, reason `confidence`.

So a block whose *easiest* week sits at **RIR 4 or above** produces only `low`
confidence estimates on those sessions, and the engine will not lead the demand
off them. It still prescribes; it stops **stepping**. That is a real, checkable,
user-visible consequence of a ramp choice, and it is the strongest reason a
conservative ramp should be chosen deliberately and for a reason rather than as a
default comfort setting.

*(It is also the honest counterweight to chapter 8's "back an exercise off" —
which is the same mechanism reached deliberately, with `exercise_rir` refusing
the earn explicitly at `progression.ts:251`.)*

### 3.2 A harder ramp takes sets away, through your own feedback

`[DERIVED — code, verified]`. `rules/feedback.ts::modulateFromFeedback` on the
live row: a reported `workload` ≥ `workload_high` (**8**) removes a set, and a
`workload` ≤ `workload_low` (**3**) with a pump ≥ `set_add_pump_min` (**6**) adds
one. Training closer to failure raises reported workload. So the ramp does not
only change how hard each set is — **it changes how many sets next week holds**,
by way of what you report. Chapter 11 owns that mechanism; chapter 7 owes the
link, because "a harder ramp gives me more volume" is the mistake this prevents.

### 3.3 The deload week is fixed, wherever the ramp ends

`[DERIVED — code, verified]`. `rirRamp` appends the deload at
`params.deload.target_rir` regardless of `START RIR`, `END RIR`, or a per-week
schedule. A conservative ramp does not "soften" its deload and an aggressive one
does not harden it. This closes the fourth interaction doc 22 §6.3 asks for
(*"how ramp choice interacts with deload timing"*): **it does not.** The
interaction is with the ramp's *length* — a block is 3–8 weeks and the deload is
its last week — not with its steepness.

> **The fifth interaction stays out.** Doc 22 §6.3 defers *"how much of your data
> is usable as a strength measurement"* to v26 (the measuring band), which is
> **inactive** ([`22b`](../22b-source-map.md) §4.1 ①). §3.1 above is a
> *different* mechanism — the confidence ladder, which is live and has been since
> long before doc 21 — so writing it is not writing the band. Chapter 7 must not
> mention `max_measuring_rir` or "priced but not measured".

---

## 4. Ramps as styles — the synthesis chapter 7 is written from

Four shapes, each named by what it is **for**, with its trade stated. Every row's
"buys" and "costs" columns trace to §2 or §3; nothing here is a recommendation
about which is correct, because the evidence does not support one.

| Shape | In the app | What it buys | What it costs |
|---|---|---|---|
| **Standard hypertrophy** | `3 → 0` or `3 → 1` over 4–6 weeks | The trade §2.2 describes, spent late: easy weeks accumulate sets, hard weeks claim the growth, the deload clears the bill | Nothing distinctive — it is the default because it is the middle |
| **Conservative / volume-led** | `4 → 2`, or `5 → 3` | Lower per-set fatigue (§2.1), so more weekly sets are recoverable; gentler on joints | Softer numbers (§2.3), and at an end value of 4 or above, **no earned steps** (§3.1) |
| **Strength-biased** | A **flat or shallow** ramp — `2 → 1`, `1 → 1` — plus chapter 8's per-exercise targets to spare effort elsewhere | Strength is flat across RIR (§2.1), so nothing is lost by *not* living at 0; concentrating effort on the lifts that matter is free | Requires the per-exercise lever to be used, or every accessory pays the same fatigue price as the main lift |
| **Maintenance / return** | A flat high ramp — `4 → 4`, `5 → 5` — or chapter 8's lever above 5 | Holds the pattern and the volume while fatigue clears or life is busy | No earned steps (§3.1), and the app is honest that this is holding, not building |

**The one thing all four share, and the chapter's spine:** the ramp sets *how
much of the fatigue budget each week spends*. It does not set how much growth a
week produces — the sets do that, and the sets are what fatigue limits.

**`0 RIR` stays a peak-week ceiling, not a routine target.** Doc 10 §4's
conclusion survives its own rationale being wrong: a whole block at 0 RIR spends
the entire budget every week, and §2.2's trade says that buys very little per set
while costing the most per set. This is now `[DERIVED]` from the trade rather
than `[EVIDENCED]` from a flattening that was never found.

---

## 5. What chapter 7 must **not** say

Compiled here so the chapter can be reviewed against a list.

1. **No flattening claim.** §2.2. Write the trade.
2. **No measuring band, no `max_measuring_rir`, no "priced but not measured".**
   v26 is inactive; [`22b`](../22b-source-map.md) §4.1 ①. §3.1's confidence ladder
   is the live mechanism and is the one to write.
3. **No MRV-stop or automatic deload.** The graded volume ramp and the
   two-week-at-MRV trigger in doc 10 §3 are **not implemented** ([`22b`](../22b-source-map.md)
   §7); what ships is ±1 set. Chapter 11 owns it.
4. **No growth framing on the deload** — doc 10 §9, enforced by
   `contracts.test.ts`.
5. **No RIR value above 5 attributed to the week's ramp.** The column is 0–5
   (§1). Above that is chapter 8's lever, and it is per-exercise.
6. **No named third-party program.** §6.
7. **No prescription of a "best" ramp.** The evidence does not support one and
   doc 10 §9 forbids the overclaim.

---

## 6. O7 — the "example programs" ask, resolved

**Doc 22 §13 O7 is still open with the owner.** Its recommendation
([doc 22 §6.3](../22-user-manual.md#63-rir-ramps-and-training-styles)) is to
**describe approaches by characteristic**, naming a published program only where
the ramp property is a documented, citable feature of that program, with the
citation and an explicit statement that WORKOUT does not implement it.

**This pass takes the recommendation, at its conservative end: chapter 7 names no
third-party program.** Three reasons, recorded so the owner can overrule with the
cost visible:

1. **The research did not turn up a citable ramp specification.** The literature
   in §2 studies proximity to failure as a *variable*, not as a published
   program's prescribed RIR schedule. Naming a program would mean sourcing its
   ramp from that program's own commercial materials, which is precisely the
   "checkable third-party claim that goes stale" doc 22 §6.3 warns about — and
   the manual's claims ledger has no way to verify it, because
   [`22a`](../22a-manual-claims.md)'s rule is *code or the active params row*.
2. **The characteristics carry the whole instructional load.** §4's four rows
   give a reader everything a named program would: the shape, what it is for, and
   what it costs. A name adds recognition, not understanding.
3. **It is the reversible choice.** Adding a named example later is a paragraph;
   removing one after a reader has acted on it is a correction.

**If the owner wants names**, the smallest safe form is a `detail` block (layer 3,
outside the length budget) listing one or two approaches with the citation and the
"WORKOUT does not implement this" sentence — an additive change to one section,
which is why nothing here is structured to prevent it.

---

## 7. What this pass feeds

| Consumer | What it takes |
|---|---|
| **UG ch. 7** (Phase 3d) | §1 (the app's ramp), §2.2 (the trade), §2.3 (report accuracy), §3 (the app's response), §4 (the four shapes), §5 (the denylist), §6 (no names) |
| **UG ch. 9** (Phase 3d) | §2.4 — both halves of the Coleman nuance, and the Rogerson practice numbers as the honest "when is one needed" answer |
| **UG ch. 8** (Phase 3d) | §3.1's earn-gate chain, which is the same refusal the per-exercise lever makes explicitly |
| [`22a`](../22a-manual-claims.md) | ledger row **`D-13`** (the doc 10 §4 rationale mismatch) |
| **doc 10** | §2.2 — its own §4 RIR-ramp rationale sentence, and the identical one in `COACHING_GUIDE`, are the doc's to correct. Not doc 22's ([doc 22 §1.2](../22-user-manual.md#12-scope-boundaries): no behavior changes) |

## Sources

- Refalo MC, Helms ER, Trexler ET, Hamilton DL, Fyfe JJ (2023). Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy: A Systematic Review with Meta-analysis. *Sports Medicine* 53(3):649–665. <https://link.springer.com/article/10.1007/s40279-022-01784-y>
- Robinson ZP, Wolf MG, Refalo MC, Zourdos MC, et al. Exploring the Dose–Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta-Regressions. *Sports Medicine*. <https://link.springer.com/article/10.1007/s40279-024-02069-2> (preprint: <https://sportrxiv.org/index.php/server/preprint/view/295>)
- Refalo MC, Helms ER, Robinson ZP, Hamilton DL, Fyfe JJ (2023). Influence of Resistance Training Proximity-to-Failure, Determined by Repetitions-in-Reserve, on Neuromuscular Fatigue in Resistance-Trained Males and Females. *Sports Medicine — Open* 9:10. <https://link.springer.com/article/10.1186/s40798-023-00554-y>
- Zourdos MC, Klemp A, Dolan C, et al. (2016). Novel Resistance Training-Specific Rating of Perceived Exertion Scale Measuring Repetitions in Reserve. *JSCR* 30(1):267–275. <https://journals.lww.com/nsca-jscr/fulltext/2016/01000/novel_resistance_training_specific_rating_of.31.aspx>
- Zourdos MC, Goldsmith JA, Helms ER, et al. (2019). Proximity to Failure and Total Repetitions Performed in a Set Influences Accuracy of Intraset Repetitions in Reserve-Based Rating of Perceived Exertion. *JSCR*. <https://www.ovid.com/jnls/nsca-jscr/fulltext/10.1519/jsc.0000000000002995~proximity-to-failure-and-total-repetitions-performed-in-a>
- Coleman M, Burke R, Benavente C, et al. (2024). Gaining more from doing less? The effects of a one-week deload period during supervised resistance training on muscular adaptations. *PeerJ* 12:e16777. <https://peerj.com/articles/16777/>
- Rogerson D, Nolan D, Korakakis PA, Immonen V, Wolf M, Bell L (2024). Deloading Practices in Strength and Physique Sports: A Cross-sectional Survey. *Sports Medicine — Open* 10:26. <https://link.springer.com/article/10.1186/s40798-024-00691-y>
