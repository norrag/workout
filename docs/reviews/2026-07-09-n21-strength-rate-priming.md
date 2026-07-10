# N21 priming — per-user strength rate + the `rate_source: "plan"` coupling

**Status:** scoping + research record for **N21** (macro-target engine
correction), produced during doc-16 **Phase R** so N21 is the next
highest-priority target with the table set (2026-07-09). Not a build. Pairs the
[goal-rate-factor research pass](./2026-07-09-goal-rate-factor-research.md).
Consumes the N21 audit in
[`docs/notes/scoping.md` §N21](../notes/scoping.md) and the pacer design in
[doc 16 §3.5 / §11](../16-prescribed-progression.md) and
[follow-up 2 §3.4](./2026-07-09-prescribed-progression-followup-2.md).

---

## 1. Why N21 is now the critical path

Two doc-16 deferrals are **blocked on N21**, so correcting the macro target is
the unlock for finishing prescribed progression:

- **`rate_source: "plan"`** (doc 16 §6, §11) — the pacer currently reads a
  **bucket-only** band (`macro_target.strength_pct_month[bucket]`). The `"plan"`
  source is meant to swap in a **personalized per-user monthly strength rate**.
  That rate has to come from `planMacrocycle`, whose strength path is exactly
  what N21 found broken. Wiring `"plan"` to a wrong rate would pace every user's
  earned steps against a wrong target.
- **Envelope loop** (doc 16 §4 Phase 3, §11) — moves `band_position` within
  [0,1] from demand-side outcomes. Its band is the same `strength_pct_month`
  band N21 governs. The loop's update rule wants Phase-1/2 field data *and* a
  correct band to move within.

## 2. The N21 audit, confirmed against current source

`planMacrocycle` / `computeTarget` in `src/lib/engine/macro.ts`
(re-verified 2026-07-09):

1. **Strength target is bucket-only.** `computeTarget` (`macro.ts:285-302`)
   reads `mt.strength_pct_month[bucket]` and compounds it over `months`, capped
   at `strength_cap_total_pct[bucket]`. It **never** applies `sexFactor` or
   `ageMultiplier` — those are called only on the hypertrophy path
   (`macro.ts:344-345`). So a 60-year-old female beginner and an 18-year-old
   male beginner get an identical strength projection. This is the headline N21
   defect.
2. **Hypertrophy model flips discontinuously** on profile completeness
   (`hypertrophyRate`, `macro.ts:378-388`): full body-comp → FFMI-proximity
   model (capped); any field missing → training-age exponential decay
   (uncapped). Completing one profile field switches models.
3. **Cut range can collapse** (`macro.ts:325-326`): when the flat
   `cut_cap_pct_bw` cap binds, both band endpoints clamp to the cap, collapsing
   low/high to a point.

`perMonthRate` is already returned (`MacroPlan`, `macro.ts:68-84`); for
strength it is the **raw band**, un-personalized. That field is the natural
carrier for the `"plan"` rate **once it is age/sex-aware**.

## 3. Research: age/sex modifiers for the strength path

All **[HEURISTIC / model-based]** — present the conservative end (doc 10 §9).

**Sex — relative strength gains are ~equal, not 0.7.** The existing
`sex_factor_female = 0.7` models women's lower absolute lean-mass fraction for a
**hypertrophy (lb of mass)** target. Applied to a **strength (% gain)** target
it is **wrong**: relative 1RM gains are approximately sex-equal, with women
often showing slightly *higher* relative upper-body gains from a lower baseline.
*(Roberts 2020; Refalo 2025; doc 10 §5 already states "relative gains
~sex-equal.")* → **strength `sexFactor ≈ 1.0`** (do not reuse the hypertrophy
0.7). This is a distinct param, not a shared one.

**Age — taper, but gentler than hypertrophy.** Older adults retain a strong
strength response (≈25–30% over ~18–20 wk of progressive RT), with a milder
decline than mass gain because early strength gains are substantially
neural. *(Peterson 2010 meta-analysis, older adults; Moritani & DeVries 1979
neural time-course; ACSM 2009.)* The existing `age_taper` (`start 40`,
`per_year 0.02`, `floor 0.6`) is defensible for strength but should be applied
(it currently is not) — possibly with a **higher floor** than the hypertrophy
path to reflect preserved neural adaptation. → apply `ageMultiplier` on the
strength path; consider a strength-specific `age_taper_floor` (e.g. 0.7).

**Experience is already modelled** via `strength_pct_month[bucket]`
(beginner 4–8 / intermediate 1.5–3 / advanced 0.5–1.5 %/mo, doc 10 §5) and
`bucketFor` (training-years-led, `macro.ts:89-96`). Keep — the fix is to
**modulate** that band by sex + age, not replace it.

## 4. Proposed shape (for the N21 build session — not built here)

A new engine version (v21, inactive) that:

1. **Strength path applies personalization.** In `computeTarget`, multiply the
   compounded strength band by `strengthSexFactor(sex)` and
   `ageMultiplier(age)` — mirroring the hypertrophy path — with
   `strengthSexFactor` a **new** param defaulting to `{female: 1.0, male: 1.0}`
   (NOT the hypertrophy 0.7) and an optional strength-specific
   `age_taper_floor`. Exposes a corrected personalized `perMonthRate`.
2. **Hypertrophy continuity.** Blend or fall back so the FFMI→decay transition
   is continuous (e.g. clamp the decay path by the same remaining-potential cap,
   or interpolate on a body-comp-confidence weight). Detailed options deferred
   to the build.
3. **Cut range guard.** Cap each endpoint independently / floor the range width
   so the band never collapses to a point.
4. **Expose the per-user monthly strength rate** on the `MacroPlan` (already
   `perMonthRate`, now personalized) and have the pacer read it under
   `rate_source: "plan"`:
   `pacerTargetRate` (`progression.ts:388-398`) branches on `p.rate_source` —
   `"band"` keeps today's `strength_pct_month[bucket]`; `"plan"` reads the
   caller-supplied personalized rate (assembled like the other derived inputs,
   doc 14 §3, recorded for replay). The `goal_rate_factor` and `band_position`
   scaling stay identical — only the *source rate* changes.

**Doc touch on build:** doc 10 §5 (strength personalization + the new
`strengthSexFactor` / strength `age_taper_floor` params), doc 16 §3.5 (flip the
`rate_source: "plan"` note from deferred to live), re-enable the N21 hidden
target cards (PR #140 made it a pure view change).

## 5. Envelope loop — what N21 sets up

The envelope loop (doc 16 §4, §11) writes `band_position` from demand-side
outcomes (earn rate, miss ratio, throttle trips, `beat`s) at meso boundaries,
bounded with hysteresis. It needs:

- **A correct band to move within** — N21 delivers it (§4 above).
- **Field data for the update rule** — `get_progression_history` (doc 16 §8.3,
  shipped Phase 4) is the instrument; it needs v20 **active** and a few mesos of
  real earn/miss/paced events before the rule can be fit. So envelope-loop
  sequencing is: activate v20 (Phase R) → collect field data → N21 corrects the
  band → fit + build the loop. Recorded as its own high-priority backlog item.

## 6. Sequencing summary

```
Phase R (this session): v20 applied inactive + replay diff + research → owner activation
        ↓ (field data accrues via get_progression_history)
N21    : correct planMacrocycle strength path (age/sex-aware per-user rate) → v21 inactive → replay → activate
        ↓ (unblocks)
rate_source:"plan"  : pacer reads the personalized rate (small pacer branch, N21 exposes the rate)
Envelope loop       : fit band_position update rule from field data + the corrected band
```
