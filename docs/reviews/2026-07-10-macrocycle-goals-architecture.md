# Macrocycle goals — end-to-end architecture (set → use → measure → carry)

**Date:** 2026-07-10
**Status:** design/architecture record for the **N21 thread** — answers the
owner's four macro-goal questions (below) and fixes the architecture for the
N21 build and its dependents (N37 `rate_source:"plan"`, N36 envelope loop),
plus the two loop-closing stages that had no design yet (macro-close
measurement, cross-macro carry). Not a build.
**Consumes:** [doc 10 §5](../10-metrics-spec.md) (target engine),
[doc 16](../16-prescribed-progression.md) (prescribed progression — authority
intact; nothing here amends it),
[N21 priming](./2026-07-09-n21-strength-rate-priming.md),
[follow-ups 1–3](./2026-07-08-prescribed-progression-followup.md),
[doc 14](../14-prescription-invalidation.md) (freshness),
[doc 15](../15-bodyspec-dexa-integration.md) (DEXA), the
[N21 audit](../notes/scoping.md), and a current-state code sweep (2026-07-10,
cited inline).
**The owner's questions:** (1) how do we get the macro targets *right*;
(2) how do we then *use* them for macrocycle progress; (3) how do we *measure
results* and close the loop back to the goals; (4) what, if anything, should
*persist at the user level* across macrocycle boundaries.

---

## 0. Frame: the goal layer is a loop with four stages

The owner's summary is confirmed as stated: **the levers mesocycles pull from
macrocycle data are cadence and pacing** — cadence bounds how often a
progression step may be offered, pacing bounds the total prescribed progress
against an expected rate — and **the envelope loop exists to tune position
within those bounds, never the bounds themselves**. Two sharpenings the rest
of this doc builds on:

1. **The engine-facing product of the whole macro layer is one number** (plus
   two lookups). Of everything `planMacrocycle` produces — target range,
   per-month rate, duration, meso count, phases — the only output that will
   ever touch a prescription is the **expected monthly strength rate** the
   pacer consumes, together with the goal's `goal_rate_factor` and `rep_window`
   lookups. The mass-denominated targets (hypertrophy lb, cut lb) are
   informational and outcome-graded only; they never drive demand (doc 15
   §3.3's boundary, already binding). Getting targets "right" therefore has
   two distinct correctness bars — a *display* bar (honest band, doc 10 §9)
   and a much stricter *engine* bar (a defensible per-user rate, because it
   meters real prescriptions).
2. **The loop closes at four nested timescales**, and each stage already has
   its conservation law:

| stage | timescale | mechanism | law | status |
|---|---|---|---|---|
| entitlement | session | earn gate (doc 16 §3.4) | only performance mints a step | shipped (v20 inactive) |
| pacing | ~30 d trailing | rate pacer + cadence (doc 16 §3.5) | budget, never quota | shipped (v20 inactive) |
| position | meso boundary | envelope loop moves `band_position` (N36) | performance selects *position in* the envelope, never the envelope | designed, blocked on field data + N21 |
| contract | macro | targets set at create; results graded at close; record primes the next macro | outcomes inform *humans and the next contract*, never mutate the current goal or the model | **no design until this doc** (§3.4, §4) |

The four questions map one-to-one onto **set (§1) → use (§2) → measure (§3)
→ carry (§4)**.

---

## 1. Q1 — getting the targets right

### 1.1 What "right" means

A macro target is **a personalized, evidence-bounded, conservative-end
estimate band, denominated in the goal's own unit, over an explicitly chosen
duration** (doc 10 §5, decision 1). It is *right* when:

- **it is honest** — a band, never a point; labeled estimate; conservative end
  presented (doc 10 §9). Individual variation dwarfs the model (Hubal 2005).
- **it is personalized by everything the profile can defensibly support** —
  and *only* that. Sex, age, bodyweight, height, body-fat/FFMI, training age;
  each modifier a separate research-grounded param, never a shared fudge.
- **it degrades continuously** as profile inputs go missing — never flips
  models discontinuously on field completeness.
- **its engine-facing projection is separately defensible.** The per-user
  monthly strength rate must stand on its own, because N37 wires it into the
  pacer: a wrong display band mildly misleads; a wrong pacer rate mis-meters
  every earned step.

### 1.2 The current defects and their fixes (N21 — recap, authority in the priming doc)

Confirmed against `src/lib/engine/macro.ts` (all three re-verified 2026-07-09,
[priming §2](./2026-07-09-n21-strength-rate-priming.md)):

1. **Strength is bucket-only** — `computeTarget` reads
   `strength_pct_month[bucket]` and never applies `sexFactor`/`ageMultiplier`
   (`macro.ts:285-302`; those apply only on the hypertrophy path,
   `macro.ts:344-345`). Fix: apply an age multiplier (possibly with a higher,
   strength-specific floor — early strength gains are substantially neural)
   and a **new** `strength_sex_factor ≈ {female: 1.0, male: 1.0}` param —
   relative 1RM gains are ~sex-equal; do **not** reuse the hypertrophy 0.7,
   which models absolute lean-mass fraction (priming §3).
2. **Hypertrophy flips discontinuously** between the FFMI-proximity model and
   training-age decay on profile completeness (`hypertrophyRate`,
   `macro.ts:378-388`). Fix: make the transition continuous — clamp the decay
   path by the same remaining-potential cap, or interpolate on a
   body-comp-confidence weight (option chosen at build).
3. **The cut band can collapse to a point** when the flat `cut_cap_pct_bw`
   binds both endpoints (`macro.ts:325-326`). Fix: cap endpoints
   independently and floor the band width.

Ship discipline: **v21, inactive** → `simulate_prescriptions`/replay diff →
owner activation (the v20 runbook pattern) → re-enable the hidden target
cards (PR #140 deliberately made that a pure view change).

### 1.3 The input-quality ladder (how targets keep getting *more* right)

"Right" is not a one-time fix; it is a pipeline whose inputs improve in tiers.
The model (and this architecture) should be written so each tier drops in
without reshaping anything:

| tier | input | state today | consumer |
|---|---|---|---|
| 0 | self-reported profile (sex, age, experience, bf% band picker) | live | `profileToMacroProfile` (`src/lib/queries/macro.ts:26-46`) |
| 1 | derived (trainingYears from `training_since`; FFMI from bw × height × bf%) | live | `bucketFor` / `muscularDevelopment` (`macro.ts:89-96,140-166`) |
| 2 | **measured** body composition (DEXA `body_scans`, N34; a bodyweight series, §4.3a) | not built | replaces the weakest guesses (bf% → measured; doc 15 §3.1 — zero engine change, it arrives as the same `bodyFatPct`/FFM profile input) |
| 3 | **observed training record** — the user's own demonstrated strength rate from prior blocks | exists in the data (`measured_gain`, `get_progression_history`), unconsumed | next-macro priming, §4.3c — the record is the best predictor of the same athlete's next block |

Two profile-hygiene defects surfaced by the sweep, both cheap and both
target-relevant:

- **`profiles.age` is a static int** (`20260611000001:25`) — it silently goes
  stale a birthday at a time, and the corrected v21 strength path will
  actually consume it. Migrate to `birthdate` (derive age at read) at some
  N21-adjacent opportunity.
- **`bodyweight` staleness is knowable but unused** — `bodyweight_updated_at`
  exists; the target engine could annotate (not block) when the driving
  bodyweight is months old. Display-layer nicety, not v21 scope.

### 1.4 Snapshot semantics: the stored target is the contract, the live target is the estimate

The sweep confirmed a subtle and *load-bearing* behavior: the persisted
`target_*`/`rate_*` columns (`20260614000002:20-39`) are written at create and
overwritten **only by an explicit goals edit** (`updateMacrocycle`,
`src/lib/queries/macro.ts:249-389`), while the Overview **recomputes the plan
live from the current profile on every render** (`planForMacro` at
`macro.ts:769`; the columns are docstring-described as a "fallback snapshot",
`macro.ts:48-52`). This is currently undocumented intent; this doc fixes it as
**designed behavior**, because it is exactly right once named:

- The **live recompute** is the doc-14 pull philosophy applied to targets:
  the *estimate* self-corrects as the profile improves (a DEXA sync updating
  bf% updates the displayed band with no invalidation machinery).
- The **stored snapshot** is the *contract*: what was promised, under the
  profile as it stood, when the goal was set (or last consciously re-set — an
  explicit goal edit is a re-contract, so overwriting on edit is correct).
  §3.4's retrospective grades against the **snapshot**, never the live
  recompute — otherwise mid-block profile drift silently moves the goalposts.
- Consequence for the N21 build: the v21 correction changes `planMacrocycle`,
  so *live* bands move on activation but stored contracts don't. That is
  correct (old contracts were made under the old model) — the retrospective
  must therefore carry the snapshot's values, not re-derive them. One gap:
  the snapshot stores the plan **outputs** but not the profile **inputs** that
  produced them; for explainability ("target was set when you were 205 lb /
  22% bf") persist the small `MacroProfile` JSONB alongside the target columns
  at create/edit time. Additive column, no behavior change (§5 slice 1).

### 1.5 What stays out of "getting them right"

- **No per-user auto-tuning of the rate tables.** The evidence bands are
  research artifacts; personal deviation is expressed through `band_position`
  (§3.3) and the observed-record prior (§4.3c), never by rewriting a user's
  band. This is the same never-widen-the-envelope law, applied at the model.
- **No target-setting from outcomes mid-block.** `update_macrocycle_goals`
  stays the only mutation path, human-initiated (doc-14 handles the
  prescription fallout lazily and precisely — `goalType` is already a
  fingerprint dimension, `fingerprint.ts:105-119`).

---

## 2. Q2 — using the targets for macrocycle progress

### 2.1 The interface the macro layer hands down

Everything a mesocycle ever receives from the macro layer, exhaustively:

```
goal_type      → goal_rate_factor[goal]   (strength 1.0 / hypertrophy·gain 0.75 / cut·maintain 0)
               → rep_window[goal]         (the only other per-goal engine difference)
expected rate  → pacer target: lerp(rate_band, band_position) × goal_rate_factor[goal]
duration       → mesoCount + phases       (timeline scaffolding; phases are informational)
```

Nothing else crosses. The lb-denominated targets, the recommended duration,
the rationale string — all display-layer. Phases (`spreadPhases`,
`macro.ts:184-200`) do not modulate the engine today and shouldn't: intensity
periodization is already expressed by the RIR ramp per meso; peak-week
behavior keys off target RIR 0, not the phase label (doc 16 §3.5).

### 2.2 The two levers, and the three non-levers

**Cadence** — at most one step per exercise per microcycle
(`progression.cadence`, doc 16 §3.5). The frequency ceiling; per-exercise
history staggers steps naturally across lifts (follow-up 1 §3.2).

**Pacing** — skip earned steps (status `paced`) while the trailing ~30-day
*prescribed* gain sits at/above the target rate
(`rules/progression.ts:244-253`; trailing rate derived per doc-14 from
`engine_decisions`, `progression-history.ts:111-131`). The macro layer sets
the target rate; performance mints the steps. **Budget, never quota** (doc 16
principle 4): a plateaued athlete gets a flat line in the stats, never an
escalating demand.

Equally binding, the **non-levers** — things the macro layer must never
reach:

1. **Quantum size.** δ is the smallest honest mechanical step the exercise
   can express (one increment or one rep through the e1RM curve, doc 16
   §3.2). The rate meters *when*, never *how big*.
2. **Entitlement.** Every step passes the full earn gate regardless of how
   far behind trajectory the athlete is. Below-trajectory, the pacer is
   simply not binding — it only ever delays.
3. **The measured anchor.** T-I5 — no macro consideration ever bumps a
   measurement.

### 2.3 `rate_source: "plan"` — the N37 mechanics, fixed here

The pacer currently reads the bucket band
(`pacerTargetRate`, `rules/progression.ts:388-398`); `"plan"` is a documented
stub. Decisions for the build:

1. **The plan rate stays a band, not a scalar.** `MacroPlan.perMonthRate` is
   already `{low, high}` (`macro.ts:68-84`); `"plan"` mode lerps it exactly as
   `"band"` mode lerps the bucket table:
   `target = lerp(planRate.low, planRate.high, band_position) ×
   goal_rate_factor[goal]`. This keeps `band_position` — and therefore the
   whole N36 envelope loop — composing identically under either source. Only
   the *source* of the band changes (the priming doc's "only the source rate
   changes", made concrete).
2. **It arrives as a doc-14 derived input.** The caller (the same assembly
   site as `progressionHistory`) evaluates the pure
   `planMacrocycle(profile, resolvedGoal)` in the queries layer and passes
   `planRate: {low, high} | null` into `EngineInputs`; it is **excluded from
   the fingerprint** (doc-14 denylist, like `seedEarn`) and **recorded in the
   decision's inputs for replay**. This choice does real work: the plan rate
   depends on bodyweight/bf%/age — none of which are fingerprint dimensions —
   so deriving it keeps a bodyweight edit from churning every open
   prescription's fingerprint, while replay determinism is preserved by the
   recorded value. (Experience level, which *is* a config dimension, already
   invalidates via `user.experienceLevel`.)
3. **Degradation is always toward `"band"`, never toward unpaced.** Missing
   profile fields → `planMacrocycle` produces a weak or null strength rate →
   the pacer falls back to the bucket band (the code comment at
   `progression.ts:384-386` already promises this). A null band (no evidenced
   bucket) disables the pacer as today.
4. **Standalone mesos ride free.** `planMacrocycle` is pure (profile + goal),
   so a standalone meso evaluates it under `engineGoal(null)` → hypertrophy
   with no macro row (follow-up 2 §5). One code path.

### 2.4 What the mass targets are *for*, given they never drive demand

For hypertrophy/cut/maintain macros the engine consumes only the rate factor
and rep window; the lb target's uses are: (a) the create-flow reality check
(recommended duration, "meaningful but realistic" framing); (b) the Overview
card (returning post-N21); (c) the §3.4 close-out grading term — *when a
measured outcome exists to grade against it* (N34 / §4.3a). That is the
complete list, and it should stay complete: any proposal that routes a mass
target into prescriptions re-opens the quota failure mode one level up.

---

## 3. Q3 — measuring results and closing the loop

### 3.1 The measurement asymmetry (per goal)

The honest position, which every surface must respect (doc 10 §9):

| goal | target unit | measurable in-app today? | instrument |
|---|---|---|---|
| strength | % on key lifts | **yes, fully** | measured e1RM trend on key lifts (`keyLiftStrengthPct`, `stats.ts:67-78`); `measured_gain` per exercise (`get_progression_history`) |
| hypertrophy | lb lean mass | **no** — inputs only (volume, e1RM proxies) | needs a bodyweight series (§4.3a) or DEXA brackets (N34, doc 15 §3.2); until then: proxies, honestly labeled as proxies |
| cut | lb bodyweight/fat | **no** (bodyweight is a scalar, `profiles.bodyweight`) | same as above; DEXA additionally separates fat from lean retention |
| maintain | ≈ 0 | partially | strength-hold is measurable; mass-hold needs the same body data |

So "closing the loop" is **goal-dependent**: for strength macros the loop can
close entirely in-app, now; for mass macros the loop *cannot honestly close*
until measured body data exists — and the design must say "not measurable
yet" rather than grade on proxies. (The locked doc-10 decision "no
progress-vs-target bar" was made precisely because bodyweight isn't tracked;
it stands until §4.3a/N34 change the facts, and even then grading arrives as
a **close-out verdict**, not a live bar.)

### 3.2 The instruments that already exist

- **Demand-vs-response, per exercise:** `get_progression_history` (PR #161)
  returns `prescribed_gain` *and* `measured_gain` (`%/30d`, span, points —
  `progression-history.ts:365-423`) plus the earn/miss/skip mix, governor
  firings, and `vanished` share. The prescribed−measured gap is the single
  best "is the demand honest for this athlete" signal in the system.
- **Macro rollups:** `v_macro_summary` (logged-work aggregation only —
  sessions, volume, adherence; `20260616000004:17-39`), the Overview stat
  tiles, `get_macrocycle_summary` (surfaces the target band and stats but
  computes **no** progress-vs-target delta, `read.ts:469-536` — correct under
  the current honesty rule).
- **Key lifts:** most-logged selection per doc 10 decision 4. One drift
  found: the tile computation takes top **3** by frequency
  (`keyLiftStrengthPct(qualifyingScores, topN = 3)`, `stats.ts:67-78`) while
  `params.key_lifts.n` is **5** (`params.ts:592-598`) — the display should
  read the param (one-line cleanup, fold into the N21 PR).
- One stale doc line: doc 15 §3.2's claim that the Overview "already renders
  progress-vs-target" predates the N21 hide — corrected by pointer here.

### 3.3 Closing the loop *within* the macro: the envelope loop (N36), architecture fixed

Doc 16 §4 and follow-up 2 §4 fixed the shape (demand-side outcomes move
`band_position` within [0,1] at meso boundaries, bounded, hysteretic; macro
goals never modified; update rule fit from field data). What was **not** yet
fixed is where the per-user position *lives* — today `band_position` is a
global scalar inside `engine_params.progression` (v20 migration;
`rules/progression.ts:397`). Decision:

**`band_position` becomes a per-user derived input, computed as a pure fold
over the trailing `engine_decisions` stream — not a stored per-user column.**
The params field stays as the *default/starting* position (and the fixed
value while the loop is off).

Mechanics:

- At seed time (the meso boundary — already the carry point for earns,
  doc 16 §3.7), the caller folds the trailing window of demand-side outcomes
  (earn rate, earned-then-missed ratio, throttle trips, workload-gate
  firings, `over`/beat share) into a position:
  `position = clamp(default + Σ boundary_steps, 0, 1)`, each boundary step
  bounded (±0.25) with a minimum dwell; thresholds fit from Phase-1/2 field
  data. The fold is deterministic and clockless — same inputs, same position.
- It enters the engine exactly like `progressionHistory` and `planRate`:
  **excluded from the fingerprint, recorded in each decision's `inputs`** —
  every prescription replay-exact, the position's own history reconstructible
  from the decisions that consumed it (follow-up 2 §4's promise, kept without
  a new table, a write path, or RLS surface).
- **Boundary-window forgetting is a feature.** A fold over a bounded lookback
  (~2–3 mesos of decisions) regresses toward the default as events age out —
  which is exactly the right behavior for an athlete returning from a long
  absence (the position, like the earn gate's staleness predicate, treats the
  distant past as weak evidence). No detraining model needed.
- Fallback documented for the build: if field data shows the fold wants a
  longer memory than a bounded lookback can carry, the escape hatch is a
  small per-user materialization written at seed time — but it is the
  *second* choice, taken only on evidence, because it adds the first mutable
  per-user engine state in the system (§4.1's principle).

Grain: **per user** (one position), not per user × exercise. The envelope
paces a person's trajectory; per-exercise responsiveness is already expressed
by each exercise's own earn record. Splitting the position per lift would
multiply the fitted surface by ~15 with no evidence any athlete needs it —
revisit only if field data shows systematic per-lift divergence.

### 3.4 Closing the loop *at* the macro: close-out + retrospective (new design)

Today **nothing happens when a macro ends**: `macrocycles.status` allows
`completed`/`archived` but no code path ever writes them (the sweep found
zero writers; macros are born `active` and stay `active`), the Overview is a
live to-date rollup, and no verdict/retrospective concept exists outside the
unbuilt doc 15 §3.2. The contract stage of the loop needs three small pieces:

1. **A close transition.** Owner-initiated ("Complete macrocycle" in the ⋮
   menu / an MCP write), nudged — not forced — when `target_end_date` passes.
   Auto-completion is wrong: trailing workouts land late, and completion is a
   statement of intent (the same reason meso activation is explicit). Closing
   sets `status = 'completed'`; nothing is deleted or frozen except (2).
2. **A retrospective, graded against the contract.** A read-side rollup over
   surfaces that all exist, rendered on the Overview once completed (and via
   `get_macrocycle_summary`):
   - **Strength verdict** (all goals): key-lift measured e1RM gain vs the
     **stored** `target_*`/`rate_*` snapshot (§1.4) — "measured +4.1% on key
     lifts over 4 months; the target band was +3.8–7.2%" — stated as
     estimate-vs-estimate band overlap, never a letter grade, with the
     comparability caveats the MCP guardrails already require (cut-phase e1RM
     suppression, confidence weighting).
   - **Demand-side summary:** earn rate, miss ratio, how often the pacer
     bound (was the athlete rate-limited or entitlement-limited?), `vanished`
     share — the `get_progression_history` aggregate, narrated per-user.
   - **Adherence + volume** (already on the tiles).
   - **Mass verdict: only when bracketed by measurements** (≥2 scans or a
     bodyweight series spanning the macro; N34 §3.2's LSC bands) — otherwise
     the row states "not measured", not a proxy grade.
3. **Mockup first.** No figure exists for a completed-macro Overview or the
   retrospective card — hard rule 8 requires the 09-changelog entry + mockup
   pass before the build (same path Phase 3's `met` glyph took).

Derive, don't snapshot, the retrospective itself (v1): it is recomputable
from decisions + logged sets + the stored contract. Freezing a verdict row
becomes worthwhile only if verdicts later feed anything downstream (§4.3d).

### 3.5 What feeds back where (the loop-closure law, consolidated)

| signal | feeds | automatically? |
|---|---|---|
| per-set compliance | earn gate (entitlement) | yes — per session |
| trailing prescribed gain | pacer (skip/offer) | yes — per decision |
| demand-side outcome mix | `band_position` within the envelope | yes — per meso boundary, bounded (N36) |
| measured outcome vs contract | retrospective → the **human's** next goal choice | no — displayed, never auto-applied |
| observed strength rate | next macro's create flow as a labeled prior (§4.3c) | no — displayed/annotated, never silently blended |
| anything | the current macro's goal, the rate tables, the evidence bands | **never** |

---

## 4. Q4 — what persists at the user level across macrocycle boundaries

### 4.1 The principle: the permanent record *is* the persistence layer

The system already has a complete, RLS-scoped, append-only record of
everything that happened — logged sets, feedback, and every engine decision
with its full inputs/outputs. The architecture rule this codebase has
followed, and should keep following: **derive cross-boundary state from the
permanent record on read; do not maintain parallel mutable user-state.** The
measured anchor is the only accumulator (doc 16 principle 3);
`progressionHistory` flows across meso/macro boundaries by construction
(per user × exercise over `engine_decisions`, indifferent to cycle
membership — follow-up 2 §5); `band_position` joins the same pattern (§3.3).
Today's *entire* mutable per-user engine state is one table
(`exercise_param_overrides` — the editable increment), and it should be hard
to grow that list.

What already crosses macro boundaries with no new work:

| substrate | carries | boundary behavior |
|---|---|---|
| `profiles` | identity inputs (tier 0/1) | continuous; improving it improves every future target |
| `logged_sets` + views | measured e1RM history, PRs, anchors | anchors re-derive per exercise; staleness/confidence gates the return-from-absence case (`max_gap_days`, `min_confidence`) — no detraining model needed |
| `engine_decisions` | the demand-side stream: earns, misses, governors, prescribed/measured gains | 90-day lookbacks flow across boundaries by construction |
| `exercise_param_overrides` | per-lift loadable step | permanent until edited |
| `macrocycles` rows (old) | the historical contracts (`target_*` snapshots, §1.4) | permanent; the retrospective's denominator |

### 4.2 What must NOT be persisted

- **No learned per-user rate tables** ("this user gains 2.1%/mo → store it →
  pace on it"). That is the double-feedback path follow-up 1 §3.4 rejected;
  the envelope's [0,1] position is the entire sanctioned adaptive surface.
- **No auto-written profile enrichment.** Measured data (DEXA, §4.3a
  bodyweight entries) reaches `profiles` through a user-confirmed proposal
  flow (doc 15 §2.3 pattern), never a silent write.
- **No carried target anchors.** An earn carries across one deload boundary
  via the seed (doc 16 §3.7) and no further; nothing pre-loads demand into a
  new macro.

### 4.3 The genuine gaps — what *should* exist, in value order

**a. A bodyweight time series (new, small, high-leverage).** The single
biggest measurement gap: every mass-denominated goal is ungradable because
`profiles.bodyweight` is a scalar. A minimal `bodyweight_log`
(`user_id, measured_on date, weight numeric`, owner-RLS, append via profile
edit + an optional quick-entry affordance; N34's `body_scans` rows join it as
high-quality points) unlocks: cut/hypertrophy retrospective verdicts (§3.4),
leanness-band freshness for cut targets, and honest "bodyweight as of" labels.
It is also the *cheap* half of what N34 delivers — worth building even if
DEXA adoption stalls. → proposed backlog row (§5).

**b. `band_position` continuity — already solved by §3.3.** Because the fold
runs over per-user decisions regardless of cycle membership, position carries
across macro boundaries (and standalone mesos) for free, and its bounded
lookback handles decay. Nothing to persist.

**c. Observed-rate priming of the next contract (derive-on-read, no
storage).** At macro create, alongside the model band, compute and display
the athlete's **own measured trailing rate** (key-lift `measured_gain` over
the prior block — the `get_progression_history` fold, or `foldProgressScores`
at display grain): *"the model band for you is 1.5–3%/mo; your measured rate
last block was 1.9%/mo."* v1 is **display-only** — a labeled prior beside the
estimate, informing the human's duration/goal choice. Deliberately not
blended into the band automatically: the observed rate is confounded (phase,
adherence, exercise selection changed), and silently mixing it into the
target reproduces the learned-rate-table failure of §4.2 under another name.
If a later version wants a blend, it must clamp within the evidence band and
label the blend — but earn that with field experience first.

**d. A frozen outcome record — deferred until something consumes it.** The
retrospective derives live (§3.4). Freeze a verdict row only when verdicts
become inputs (e.g., a future create-flow that reads "last macro's verdict"),
because live-derived history drifts as params/views evolve. Not v1.

**e. Profile `age` → `birthdate`** (§1.3) — hygiene, N21-adjacent.

### 4.4 The answer to Q4, compressed

Persist **nothing new for the control loops** — decisions + logged history
already carry entitlement, pacing, and position across every boundary, and
deriving them is what keeps every prescription replayable. Persist **two
things for measurement**: the contract snapshot enriched with its profile
inputs (§1.4 — additive columns on `macrocycles`), and a bodyweight series
(§4.3a — the one genuinely missing substrate). Everything else that "crosses
the boundary" should cross as a *derivation* (observed-rate prior, position
fold, retrospective) so it is always current, always consistent with the
record, and never a second source of truth.

---

## 5. Sequencing and slices

Order respects the existing dependency spine (N21 → N37 → field data → N36)
and adds the contract stage behind it:

| slice | contents | depends on | backlog |
|---|---|---|---|
| 1. **N21 build** | v21 (strength personalization via `strength_sex_factor`/age floor; hypertrophy continuity; cut-band guard); expose personalized `perMonthRate`; persist the `MacroProfile` snapshot on create/edit (§1.4); `key_lifts.n` drift fix (§3.2); `age`→`birthdate` if cheap; inactive → replay → activate; re-enable target cards | — | N21 (in flight) |
| 2. **N37** | pacer `"plan"` branch: band-shaped plan rate as a derived input, fallback to `"band"` (§2.3) | 1 | N37 |
| 3. **field data** | v20 active + real mesos observed via `get_progression_history` | Phase R activation (owner) | — |
| 4. **N36** | envelope loop: per-user derived `band_position` fold at seed time, bounded/hysteretic, thresholds fit from (3) (§3.3) | 1, 3 | N36 |
| 5. **macro close + retrospective** | close transition + strength-verdict retrospective vs the stored contract; mockup/09 entry first (§3.4) | 1 (contract snapshot); independent of 2–4 | **new row proposed** |
| 6. **bodyweight series** | `bodyweight_log` + profile-edit append + retrospective mass rows flip from "not measured" (§4.3a); N34 joins here when adopted | independent; unlocks the rest of 5 | **new row proposed** |

Slices 5 and 6 are filed as `needs-input` rows (owner scope/adoption call)
rather than build-ready — the mechanics above are the design record they
point at.

## 6. Decision list (owner)

1. **Plan-rate shape** — band + `band_position` lerp (recommended, §2.3) vs
   collapsing to a scalar. The band keeps N36 composing unchanged.
2. **`band_position` residence** — per-user derived fold, params value as
   default (recommended, §3.3) vs a persisted per-user column. Derived keeps
   zero new mutable state and full replayability.
3. **Envelope grain** — per user (recommended) vs per user × exercise (§3.3).
4. **Macro close semantics** — explicit owner action with an end-date nudge
   (recommended, §3.4) vs auto-complete at `target_end_date`.
5. **Retrospective v1 scope** — strength verdict + demand-side summary +
   adherence, mass rows saying "not measured" (recommended) vs waiting for
   body data so every goal grades on day one.
6. **Observed-rate priming** — display-only labeled prior at create
   (recommended, §4.3c) vs any automatic blend into the target band.
7. **Bodyweight series** — adopt the minimal `bodyweight_log` independent of
   the N34 decision (recommended), fold into N34, or decline (mass goals stay
   ungradable in-app).
