# Follow-up 2 — prescribed progression: auditability, pacing mechanics, the envelope idea, standalone mesos

**Date:** 2026-07-09
**Source:** owner follow-up #2 to the N35 thread
([review](./2026-07-07-prescribed-progression-review.md) →
[follow-up 1](./2026-07-08-prescribed-progression-followup.md)). Four
threads: (1) prescription auditability under the new progression layer —
record earned/unearned events, and does an earned-progression history add
value beyond exercise history or duplicate it? (2) is the pacer mechanically
coupled to the heuristic strength-gain calculations, and where in the band
does it target by default — is that tunable? (3) a proposal: let accumulated
performance select the *position within* the macro-established rate envelope
rather than modify the envelope itself; (4) standalone mesocycles under this
model.
**Status:** all four answered; two design amendments (§2.2's always-on
progression trace replaces the follow-up-1 silence rule, and §3.2's
continuous `band_position` replaces the `band_mid`/`band_top` halves of
`rate_source`); the envelope proposal is **adopted as the designated Phase-3
shape** (§4). Where this doc conflicts with the earlier two, this doc wins.
Updated decision list in §6. No code changes.
**Relates to:** N35, N21 (`rate_source: "plan"` dependency), doc 14 (derived
inputs, decision records), doc 05 / hard rule 9 (engine inspection over
MCP), P0-4 (trace ↔ rationale lockstep), migration `20260620000005`
(`engine_decisions.kind`), `docs/reviews/2026-06-23-standalone-prescription-investigation.md`.

---

## 1. Summary

1. **Auditability is the cheapest part of this design, because the audit
   substrate already exists** (§2). Every prescription is an
   `engine_decisions` row carrying full `inputs` + `output` JSONB including
   the structured trace, replayable by `replay_decisions` and explained by
   `explain_prescription`. The amendment the owner's concern earns: the
   progression rule emits a **status-coded trace step on every working
   prescription while the block is active** — earned-and-stepped,
   earned-but-vanished, earned-but-paced-out (naming the governor), or
   not-earned (naming the first failing predicate) — with a small structured
   payload. Follow-up 1's "emit no trace when the ask vanishes" is refined:
   **never *claim* an overload that isn't asked, but always *record* why.**
2. **Recording vs aggregating vs feeding back are three different
   commitments, and the line goes between the second and third** (§2.3).
   Record at decision grain (Phase 1, near-free — it's a trace step).
   Aggregate on the read side only (an MCP surface over `engine_decisions`;
   validating cadence/params is exactly this — no new table, no new
   write path). Feed back into prescriptions only as a doc-14 **derived
   input** — which is precisely the owner's envelope proposal, §4, Phase 3.
   The history is *not* a duplicate of exercise history: exercise history is
   performance-side (what was done); progression events are demand-side and
   relational (what was asked, whether the ask was granted, which governor
   said no, and how the athlete answered). The earn/miss/skip stream exists
   nowhere else in the system.
3. **The pacer is decoupled from the heuristic strength projections, in
   exactly the way the owner hopes — with one deliberate, opt-in exception**
   (§3.1). It consumes the `strength_pct_month` *band table* (a param, not a
   computation) keyed by experience bucket; it consumes none of
   `planMacrocycle`'s computed projections in v1. The quantum is not derived
   from the band at all — it is the smallest honest mechanical step the
   exercise can express (one loadable increment or one rep); the band only
   gates step *frequency*. The single coupling point is `rate_source:
   "plan"` (post-N21), which is an explicit flip, not a default — if the
   strength model stays weak, the pacer never inherits its weakness.
4. **Where in the band: mid by default, and yes, tunable — now as a
   continuous parameter** (§3.2). Follow-up 1's `band_mid`/`band_top` enum
   halves are replaced by `band_position` (0–1, default 0.5):
   `target_rate = lerp(band[bucket], band_position) × goal_rate_factor[goal]`.
   This is a cleaner answer to "is that itself tunable" and — not
   coincidentally — it is exactly the variable the owner's envelope proposal
   wants to drive.
5. **The envelope idea is adopted as the Phase-3 shape** (§4): the macro
   layer establishes the allowable progression envelope (the band, post-N21
   personalized); accumulated performance moves `band_position` within it —
   bounded, slow, hysteretic, recorded in every decision's inputs so each
   prescription stays replay-exact. It resolves follow-up 1's §3.4
   double-feedback caution *by construction* (performance can never widen or
   escape the envelope), and it is the concrete answer to "where is the
   additional value in the progression history."
6. **Standalone mesocycles need nothing beyond what is already specified**
   (§5). They resolve to the hypertrophy goal (`engineGoal(null)`), and every
   pacer input is macro-independent: the goal factor keys off the resolved
   goal, the band keys off the *profile's* experience bucket (no macrocycle
   required), and the progression history is per user × exercise from
   `engine_decisions`, flowing across meso and macro boundaries by
   construction. Post-N21 `"plan"` mode also works: `planMacrocycle` is a
   pure function of profile + goal, evaluable with the standalone default —
   no stored macrocycle needed.

---

## 2. Auditability

### 2.1 What the audit substrate already provides

The concern is right to be raised and cheap to satisfy, because the system
was built for it: every prescription — seed or advance — persists an
`engine_decisions` row with the full `inputs` and `output` JSONB
(`20260611000001_initial_schema.sql:620`, kinds normalized by
`20260620000005`), the output carries the structured `DecisionTraceStep[]`
the human rationale is composed from (P0-4: "the trace and the prose can
never drift", `src/lib/engine/types.ts:118-134`), and the MCP surface
already exposes the whole chain: `get_engine_decisions` (raw rows),
`explain_prescription` (one decision, narrated), `replay_decisions`
(recompute a stored decision against stored or live params),
`simulate_prescriptions` (forward preview — the v20 activation diff). The
progression design adds **inputs** to this substrate (the `progression`
params block rides `paramsToken`; `progressionHistory` and the seed's
`earned` opt are derived inputs recorded like `opts.anchor`), so every
progression-influenced prescription is replayable and diffable with the
machinery that exists today. Doc 14's write/check parity is what guarantees
the audit trail can't silently diverge from live behavior.

### 2.2 Amendment: the progression trace is always-on and status-coded

Follow-up 1's realized-ask rule had one polarity backwards for audit
purposes: "if the earned prescription is byte-identical to the unearned one,
emit **no** `progression` trace." That rule conflated two things — *not
claiming* an overload (correct: the rationale must never announce an
overload that isn't being asked) and *not recording* the assessment
(wrong: a silent non-event is exactly what makes cadence bugs invisible).
Amended rule: while `progression.mode` is active, **every working
prescription's trace contains exactly one `progression` step**, carrying a
status and a small structured payload alongside the human `detail`:

| status | meaning | example detail |
|---|---|---|
| `stepped` | earned, offered, realized | "earned overload: targeting e1RM 203.0 (measured 198.2 + 4.8)" |
| `vanished` | earned + offered, but the realized ask was byte-identical (lattice/window/bodyweight cap) — earn **not** consumed | "earned but unrealizable at this increment; earn retained" |
| `paced` | earned but skipped by a governor — names it | "earned; skipped by rate pacer (trailing 2.6%/mo ≥ target 2.25)" / cadence / peak-week / `max_pct_per_step` |
| `not_earned` | gate failed — names the **first failing predicate** | "not earned: workload high" / "set 3 below prescription" / "deload week" |
| `off` | *(no step emitted)* goal factor 0 or mode absent — byte-identical-to-today paths stay byte-identical | — |

Structured payload (inside the step, additive JSONB — no schema change):
`{ status, deltaTarget, deltaRealized, governor?, predicate? }`. The
rationale composition rule stays as reviewed — an earned overload is
announced, a hold is *not* narrated as an overload, and the two never
co-occur for the same load — the trace just stops having gaps. The §7.4
trace-consistency goldens extend accordingly (every active-mode decision has
exactly one progression step; `off` paths emit none and stay byte-identical).

This is the "record earned (and perhaps unearned) progression events" ask,
implemented at zero new storage: the events *are* decision trace steps, in
rows that already exist, under RLS that already scopes them.

### 2.3 Aggregation: read-side only, and what it adds beyond exercise history

**Validating that cadence and pacing behave as intended** is a query over
those status-coded steps: earns per exercise per microcycle (cadence),
trailing prescribed-gain vs the target rate (pacer), `paced`/`not_earned`
reason mix (gate health), `vanished` frequency (increment sizing — feeds the
doc 10 §8 finer-increments cleanup). Recommended surface, in order of cost:

1. **Phase 1 (ships with the feature):** a `rule`/`status` filter on
   `get_engine_decisions`, plus `simulate_prescriptions` as the activation
   preview — enough to validate v20 before and after flipping it on.
2. **When the first real meso of field data exists:** an admin MCP
   `get_progression_history` (per user × exercise: earn/miss/skip series,
   trailing prescribed vs measured gain, governor firings) — an aggregation
   over `engine_decisions`, no new table. Per hard rule 9 this stays an
   admin-gated MCP tool; the user-facing echo is already free
   (`explain_prescription` narrates the progression step like any other).
3. **Only if a stats screen ever wants it:** a `v_progression_events` view
   extracting the step fields — deferred until a screen exists, per the
   shared-views convention.

**Does it duplicate exercise history?** No — the two are different sides of
the ledger, and the join between them is the new information:

- `v_exercise_history` is **performance-side**: what was done (sets, loads,
  reps, stamped e1RM). It cannot distinguish "athlete matched the
  prescription" from "prescription matched the athlete" — that symmetry is
  the original fixed-point problem.
- Progression events are **demand-side and relational**: what was asked,
  whether the ask was granted, which governor declined it, and whether the
  athlete answered an offered step (`stepped` followed by full performance)
  or refused it (the earned-then-missed stream feeding the throttle).
  Earn rate, miss ratio, skip-reason mix, and the prescribed-vs-measured
  gain gap exist **nowhere** in exercise history.

**Where the line is drawn:** record at decision grain (Phase 1); aggregate
on read (admin MCP, then a view if a screen wants it); feed back into
prescriptions **only** as a doc-14 derived input — recomputed on the read
path, excluded from the fingerprint, recorded in `inputs` for replay — and
only in Phase 3, in the bounded form of §4. Anything past that line (a
write-side progression table, an unbounded adaptive rate) buys no
auditability and re-opens the runaway analysis.

---

## 3. Pacing mechanics, confirmed and sharpened

### 3.1 Decoupled from the heuristic projections — by construction, with one opt-in exception

The owner's understanding is correct on all three points, stated precisely:

- **The pacer consumes a param table, not a computation.** v1 reads
  `engine_params.macro_target.strength_pct_month[bucket]` — the same
  *evidence table* `planMacrocycle` reads, deliberately, so there is one
  definition of "evidenced rate" in the system — but none of
  `planMacrocycle`'s computed outputs (no FFMI proximity, no age taper, no
  compounding projections). The bucket itself comes from the profile
  (training-age-led, `macro.ts:89-96`). If the macro-target model is wrong
  (the N21 audit says its strength path is), the pacer is not wrong with
  it — the band is a research table, not a prediction.
- **The quantum is mechanical, not modeled.** δ = the smallest honest step
  the exercise can express — one loadable increment or one rep at held load,
  evaluated through the e1RM curve. It derives from plates and rep math,
  never from the band; personalization enters only through the per-exercise
  editable increment. The band governs *when* steps are offered, never *how
  big* they are (the `max_pct_per_step` cap binds the realized ask; the
  earn gate binds the entitlement).
- **The single coupling point is explicit and opt-in.** `rate_source:
  "plan"` (post-N21) swaps the band for `planMacrocycle`'s personalized
  per-user rate. It is a param flip, not a default, precisely so the pacer
  never silently inherits the projection model's weaknesses. If N21's
  correction disappoints, the pacer stays on `"band"` forever and loses
  nothing but finesse.

So yes: all personalization collapses into one rate band (v1: bucket-keyed;
post-N21: optionally a personalized band/rate), `goal_rate_factor` scales
it per goal, and the quantum is a static mechanical size — the band budget
determines only the *frequency* with which quanta are offered.

### 3.2 Where in the band, and yes — it's a parameter (amendment)

Follow-up 1 answered this with an enum (`rate_source: "band_mid"` default,
`"band_top"` optional). The owner's question — "is that itself a tunable
parameter?" — exposes that the enum is two samples of a continuous knob.
Amended params shape:

```jsonc
"pacing": "macro_rate",
"rate_source": "band",         // "band" (bucket table) | "plan" (post-N21)
"band_position": 0.5,          // 0 = band floor, 1 = band top; the tunable
"goal_rate_factor": { ... }    // unchanged (follow-up 1 §3.3)
```

`target_rate = lerp(band_low, band_high, band_position) × goal_rate_factor[goal]`,
compared against the trailing ~30-day prescribed gain exactly as before.
Defaults: `0.5` (the mid-band recommendation stands — pace to the middle of
the evidence, leave headroom for volunteered over-performance, which remains
un-paced). `1.0` reproduces the original rate-ceiling semantics; the whole
enum discussion collapses into one honest scalar. And deliberately so: a
continuous, decision-recorded `band_position` is **exactly the variable the
§4 envelope loop needs to drive** — the static param is the Phase-1/2
default, the feedback loop is a Phase-3 *writer* for the same knob. Design
the knob once.

---

## 4. The envelope: performance selects position, never the envelope (adopted, Phase 3)

The proposal — macro establishes the allowable progression envelope,
accumulated performance determines whether the athlete is paced toward its
lower, middle, or upper portion — is adopted as the designated Phase-3
shape, replacing follow-up 1's vaguer "per-user measured rate feeding the
band." It is the right structure for three reasons:

1. **Bounded by construction.** Follow-up 1 §3.4 warned against pacing on
   the measured rate because it creates a second feedback path around the
   same signal. The envelope dissolves the objection structurally:
   performance can move `band_position` within [0, 1] and nothing else —
   it can never widen the envelope, never escape the evidence, never
   compound. The worst possible outcome of a broken outer loop is pacing at
   the band floor or the band top, both of which are defensible programs.
2. **Auditable by the §2 machinery.** `band_position` enters the engine as
   a doc-14 derived input: computed on the read path from the same
   `engine_decisions` lookback as `progressionHistory` (longer window),
   excluded from the fingerprint, **recorded in each decision's `inputs`**
   — so every prescription remains replay-exact and the position's own
   history is reconstructible from the decisions that consumed it. This is
   also the promised answer to "where is the additional value in the
   progression history": the earn/miss/skip stream is the loop's input.
3. **It is the honest version of "close the loop in the macro/meso
   engine."** The macro layer keeps owning the envelope (identity: who the
   athlete is → what rates are plausible); the accumulated demand-side
   record owns responsiveness (how this athlete is actually answering the
   asks). Neither writes to the other's territory; macro *goals* are never
   modified by performance, exactly as the owner specified.

Design constraints to carry into Phase 3 (recorded now so the Phase-1 data
model serves them):

- **Drive it with demand-side outcomes, not the measured e1RM rate.** The
  inner loop (earn gate, no-compounding re-arm, miss throttle) already
  reacts to measured performance per-step; the outer loop should read the
  *relational* stream — earn rate, earned-then-missed ratio, throttle
  trips, workload-gate firings, `beat` outcomes (volunteered
  over-performance arguing for a higher position). Discrete outcomes are
  robust to anchor noise, deadband corners, and unit drift; a
  measured-rate-driven outer loop would re-import all three.
- **Timescale separation, with hysteresis.** The inner loop acts
  per-session/per-microcycle; the outer loop should move `band_position`
  **at meso boundaries only** (the natural block-review cadence, and the
  seed route is already the meso-boundary carrier), by bounded steps
  (e.g. ±0.25) with a minimum dwell. Two loops on one signal at one
  timescale oscillate; a slow, stepped, bounded outer loop reads like a
  coach adjusting between blocks — predictable, explainable, and each
  adjustment is one trace line in the meso's seed decisions.
- **It waits for field data on purpose.** The static `band_position` ships
  first (Phase 1), the event record accumulates (Phase 1), the aggregate
  surface reads it (§2.3), and the loop closes only when the observed
  earn/miss distributions say what the update rule should be. Measure
  twice, cut once — the owner's own framing is the phase plan.

---

## 5. Standalone mesocycles

Nothing additional is required — the hypertrophy default is the only
special-casing they need, and it already exists:

- **Goal:** standalone mesos resolve `engineGoal(null)` → `hypertrophy`
  (`src/lib/queries/engine-goal.ts:17-27`) — one shared leaf module used by
  the seed writer, the advance path, and the freshness check, so the
  resolved goal feeds the fingerprint identically at write and check. The
  pacer's `goal_rate_factor` keys off this resolved goal like the rep
  window does: a standalone meso paces at the hypertrophy factor.
- **Band:** the experience bucket comes from the **profile**
  (training-age-led, `macro.ts:89-96`) — it does not require a macrocycle
  to exist. A standalone meso paces against the same band a
  hypertrophy-macro meso would.
- **History:** `progressionHistory` (and the §4 lookback) is per
  user × exercise over `engine_decisions`, indifferent to which meso or
  macro a decision belonged to. The trailing window therefore flows across
  meso boundaries and across the standalone/macro divide by construction —
  back-to-back standalone mesos chain into one continuous pacing record,
  and an exercise carried from a macro meso into a standalone one keeps its
  trailing rate.
- **Post-N21 `"plan"` mode also degrades gracefully:** `planMacrocycle` is
  pure (profile + goal → rate), so a standalone meso can evaluate it with
  the default goal and no stored macrocycle row; if the implementation
  prefers not to, falling back to `"band"` for standalone mesos is one
  branch. Either is fine; the former keeps one code path.
- **Seed/advance behavior** (earn carry at meso close, deload boundary,
  swap-ins) is identical — none of it referenced the macrocycle in the
  first place.

One housekeeping note found while verifying: the advance path's comment
says "goal context from the macrocycle (standalone → gain)"
(`src/lib/queries/progression.ts:1129`) while the shared resolver and the
seed writer say hypertrophy. Behaviorally identical today (`gain` maps to
the hypertrophy window in `engineGoal`'s switch), but under per-goal rate
factors the *names* stop being interchangeable in principle — the comment
should be corrected to match `engineGoal` when the progression PR touches
that file. (The code already agrees; only the comment drifted.)

---

## 6. Updated decision list (supersedes follow-up 1 §6)

1. **δ mode** — unchanged: `min(weight, rep)` with the realized-ask rule.
2. **Adopt macro-rate pacing** — unchanged recommendation (yes, Phase 1),
   with the §3.2 amendment: `rate_source: "band" | "plan"` +
   **`band_position` (0–1, default 0.5)** replacing the `band_mid`/
   `band_top` enum halves.
3. **Per-goal rate factors** — unchanged (cut/maintain 0; hypertrophy 0.75
   pending the research pass).
4. **Progression trace polarity** *(new, recommend adopting as specified)* —
   always-on status-coded `progression` trace step while the mode is active
   (§2.2); Phase-1 validation via a `get_engine_decisions` filter +
   `simulate_prescriptions`; `get_progression_history` (admin MCP) once
   field data exists.
5. **The envelope loop** *(new)* — adopted as the Phase-3 shape (§4):
   demand-side outcomes move `band_position` within the macro envelope at
   meso boundaries, bounded and hysteretic; update rule chosen from
   Phase-1/2 field data.
6. **Peak-week steps** — unchanged: `skip` at target RIR 0.
7. **Periodic honest-RIR confirmation** — unchanged: a two-part decision
   (engine rule + capture affordance + doc-11 premise amendment); recommend
   deferring both together.

Standalone mesos require no decision — they ride the hypertrophy default
(§5). The review's §7 mechanism and phasing otherwise stand as written,
with the §7.4 goldens gaining: exactly one status-coded progression step
per active-mode working prescription (none when off, byte-identical
outputs), and pacing arithmetic asserted against `band_position`.
