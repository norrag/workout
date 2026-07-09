# 16 — Prescribed progression (earned-step overload + macro-rate pacing)

**Status: authoritative build spec** (2026-07-09). Consolidates the owner
memo *Updates to the Prescription Engine* (N35, Batch 12) and the full
design thread:
[review](./reviews/2026-07-07-prescribed-progression-review.md) →
[follow-up 1](./reviews/2026-07-08-prescribed-progression-followup.md) →
[follow-up 2](./reviews/2026-07-09-prescribed-progression-followup-2.md) →
[follow-up 3](./reviews/2026-07-09-prescribed-progression-followup-3.md).
Those docs are the rationale record; **where they conflict with this doc,
this doc wins.** Implementation proceeds in new sessions, one phase per PR
(§10). Amends doc 10 §4 (implements its double-progression intent inside
doc 13's anchor→weight framework) and doc 13 §9.2 (the climb stops being
the only motion); complies with doc 14 (freshness) and T-I5 (never
fabricate a measurement).

---

## 1. Problem

Under the active params, exact compliance is a **fixed point**: prescription
and measurement invert the same e1RM curve, the Option-A rep climb is
RIR-neutral (R24a), and every seed reprices the unchanged anchor to the
window bottom — so an athlete who performs exactly what is prescribed
reproduces their anchor to the pound forever, and meso N+1 opens identical
to meso N. Progression exists only as *detection* of voluntary
over-performance, never as *demand*. (Verified by engine simulation: three
consecutive byte-identical mesos, anchor pinned — review §3.)

## 2. Principles (each is binding)

1. **Never fabricate a measurement** (T-I5). No stored e1RM, anchor, or
   stat is ever bumped. The measurement pipeline is untouched.
2. **The demand leads by at most one earned quantum.** Prescribe from a
   target anchor `A* = A + δ` when earned, `A` otherwise. Re-arm off the
   *measured* anchor every time — never `previousTarget + δ`.
3. **Retry, don't stack.** An unrealizable earned step retains the
   entitlement (a later session re-arms at `A + δ` again) but never
   accumulates (`A + kδ` does not exist). **The measured anchor is the only
   accumulator** — each quantum must be performed before the next stacks.
4. **Budget, never quota.** The macro rate meters *when* steps are offered;
   only performance mints them. No governor ever creates an unearned step.
5. **One curve, one comparison.** Prescription pricing, live day-view
   re-derivation, the compliance gate, and the ▲/met/▼ markers share the
   same e1RM math and the same band — they cannot diverge.
6. **Always record, never overclaim.** While the mode is active, every
   working prescription carries exactly one status-coded `progression`
   trace step; the rationale announces an overload only when one is
   actually asked.
7. **Absent ⇒ byte-identical.** With the params block absent (or a goal
   factor of 0), every output, fingerprint, and trace is identical to
   today. v20 ships inactive.

## 3. Mechanism

### 3.1 Target anchor

```
A  = recency-weighted measured anchor          (unchanged, trailing)
A* = A + δ   if the step is EARNED and OFFERED (the prescription basis)
   = A       otherwise
```

`A*` is threaded through the **existing** §9.2 machinery (rep-window
pricing, climb, `boundRepsToWindow`, §S5 gate-holds, rounding) — all
expressed relative to the anchor input, so they compose unchanged. Two
composition rules: the **R24b deadband is evaluated only on un-earned
weeks**, and the **realized-ask rule runs after rounding** (§3.3).

### 3.2 The quantum δ

`step: "min"` (default): δ = min(δ_w, δ_r) evaluated in e1RM space at the
current effective reps `E` —

- δ_w = `rounding[equipment] × k(E)` (one loadable step; per-user/exercise
  via the editable increment override);
- δ_r = `w × (k(E+1) − k(E))` (one rep at held load).

The smallest honest step the exercise can express; coarse-increment lifts
progress on the rep axis, micro-loadable lifts on the weight axis.
Alternatives `"increment"` / `"rep"` force one axis.

### 3.3 Realized-ask rule (after rounding)

- Realized ask **byte-identical** to the unearned prescription (window hard
  cap, `bodyweight_only` rep ceiling): status `vanished`, **earn not
  consumed** (retry per principle 3), no overload claimed. At the
  `bodyweight_only` cap the rationale carries the substitution nudge
  ("add load / progress to the loadable variation").
- Realized ask **> `max_pct_per_step` × A** (coarse plate jump on a light
  lift): status `paced` (governor `max_pct_per_step`), hold today's
  behavior.
- Otherwise: status `stepped`, trace announces the target
  (e.g. "earned overload: targeting e1RM 203.0 (measured 198.2 + 4.8)").

### 3.4 The earn gate (all must hold for the previous session)

| condition | predicate |
|---|---|
| prescription fully performed | working-set count ≥ prescribed, **and every working set is not `under` its prescribed set in e1RM space** — the §6.2 shared comparison (effective loads; reported RIR ?? target RIR; band `compliance_band`). The grinder guard is intrinsic: an honestly reported low RIR scores under. |
| no pain gate | `!painGated` (`pain_cut_gate` a fortiori) |
| no session dampener | `!sessionDampened` |
| workload not hot | `exerciseFeedback.workload < workload_high`, and no pain/workload-driven set cut this session |
| not a deload week (either side) | deloads neither earn nor take steps |
| not stale | `daysSincePreviousSession ≤ max_gap_days` (caller-supplied) |
| anchor confident | `anchor.confidence ≥ min_confidence` — **`moderate`**; `high` is provably inert for hypertrophy (compliant sets pin at ~11 effective reps) |
| goal opted in | `goal_rate_factor[goal] > 0` |

### 3.5 Governors (earned ≠ offered)

Computed from the `progressionHistory` derived input (§8.2):

- **Cadence** — at most one step per exercise per **microcycle**.
- **Rate pacer** — skip (status `paced`) while the trailing ~30-day
  *prescribed* gain ≥ `lerp(band[bucket], band_position) ×
  goal_rate_factor[goal]`, pro-rated to the window. v1 band =
  `macro_target.strength_pct_month` keyed by the profile's experience
  bucket; `rate_source: "plan"` (post-N21) swaps in the personalized
  `planMacrocycle` rate. The pacer only ever delays (principle 4).
- **Miss throttle** — after ≥ 2 consecutive earned-then-missed cycles,
  require `miss_rearm_sessions` fully compliant sessions to re-arm.
- **Peak week** — `peak_week: "skip"`: no step at target RIR 0.

Approximate pacing outcomes at defaults (quantum ≈ 3%, `band_position`
0.5): beginner ≈ every other microcycle, intermediate ≈ monthly, advanced
≈ quarterly per lift. Voluntary over-performance is never paced — the
anchor path is untouched.

### 3.6 Trace (always-on while active)

Exactly one `progression` step per working prescription:
`{ rule: "progression", detail, status, deltaTarget, deltaRealized,
governor?, predicate? }` with `status ∈ stepped | vanished | paced |
not_earned` (`paced` names the governor; `not_earned` names the first
failing predicate). Mode absent / factor 0 ⇒ no step and byte-identical
output. An earned overload and a "holding" rule never co-occur for the
same load. Grading (`gradeOnRir`) stays on the measured anchor.

### 3.7 Seed route (meso-over-meso carry)

`seedMeso()` accepts a derived `targetAnchor` (or `earned`) opt alongside
`opts.anchor`; the caller derives it from the prior meso's final working
session exactly as the advance chain does, so an earn at meso close carries
across the deload boundary into the next seed. Swaps/cold starts have no
compliance context ⇒ not earned ⇒ today's `seed_anchor` behavior.

## 4. Per-goal rates and the macro layer

- `goal_rate_factor` defaults: **strength 1.0; hypertrophy/gain 0.75
  [HEURISTIC — research pass is an activation gate, §10 Phase R];
  cut/maintain 0.0** (holds strength honestly per R24; factor 0 disables
  the gate — one mechanism, no separate booleans). Strength vs hypertrophy
  otherwise differ by rep window only (`rep_window` per goal); cut vs
  maintain differ by stated objective + outcome measurement (N34).
- **Standalone mesos need nothing extra:** goal resolves via
  `engineGoal(null)` → hypertrophy; the band keys off the *profile's*
  bucket; history is per user × exercise across meso/macro boundaries.
- **Envelope loop (Phase 3, deferred):** demand-side outcomes (earn rate,
  miss ratio, throttle trips, `beat`s) move `band_position` within [0, 1]
  at meso boundaries, bounded steps with hysteresis, position recorded in
  decision inputs. Macro goals are never modified by performance. Update
  rule chosen from Phase-1/2 field data.

## 5. Day-view contract

1. **Prefill flow-through is automatic** — the engine writes the stored
   prescription; the day view renders it. No new wiring; asserted by the
   Phase-3 e2e.
2. **Live coupling prices off the prescription-basis anchor.** The day
   read (`queries/logging.ts`) carries, per exercise, the target anchor
   recorded in the decision that priced this workout (`A*` when stepped,
   else `A`); `predictRepsAtWeight` in the day view consumes it, so an
   athlete-owned weight edit re-derives reps faithful to the prescribed
   target including the lead. Fallback (no recorded target): measured
   anchor — today's behavior. The measured anchor remains the basis
   everywhere else (stats, PRs, sampling, confidence, grading).
3. **Markers are three-state and share the gate's comparison.**
   `loggedSetMarker` returns `over | met | under` (null reserved for
   not-comparable); the band moves from the module-local `MARKER_BAND`
   into params (`compliance_band`) so marker, gate, and grading read one
   tunable. Session-level "progression earned" is disclosed via the
   trace/rationale affordances, not a new indicator. UI treatment of the
   `met` glyph is mockup-governed: 09-changelog entry + hard-rule-8
   transcription at build time.

## 6. Params (v20, inactive at ship)

```jsonc
"progression": {
  "mode": "earned_step",            // absent/off ⇒ current behavior
  "step": "min",                    // "min" | "increment" | "rep"   (§3.2)
  "min_confidence": "moderate",     // §3.4 — "high" is inert for hypertrophy
  "compliance_band": 0.015,         // shared set-level e1RM band (§5.3; absorbs MARKER_BAND)
  "cadence": "microcycle",          // "microcycle" | "session"
  "pacing": "macro_rate",           // absent/off ⇒ cadence-only
  "rate_source": "band",            // "band" | "plan" (post-N21)
  "band_position": 0.5,             // 0 = band floor, 1 = band top; Phase-3 envelope writes this
  "goal_rate_factor": { "strength": 1.0, "hypertrophy": 0.75, "gain": 0.75,
                        "cut": 0.0, "maintain": 0.0 },
  "miss_rearm_sessions": 2,
  "max_gap_days": 10,
  "peak_week": "skip",              // no step at target RIR 0
  "max_pct_per_step": 0.05          // cap on the REALIZED ask / A (§3.3)
}
```

House `.optional()` discipline: block absent ⇒ byte-identical fingerprints
and outputs. The block rides `paramsToken` (activation moves every open
fingerprint at once — intended v-bump semantics).

## 7. Worked example (defaults; hypertrophy window 8–12, `rir_offset` 1, 5 lb step)

Measured anchor 198.2 (the review's fixed-point table); quantum
δ = min(δ_w ≈ 6.8, δ_r ≈ 4.8) = 4.8 ⇒ `A* = 203.0`:

| week | unearned (today) | earned | performed exactly ⇒ measured e1RM |
|---|---|---|---|
| 2 | 145 × 9 @ 2 | **150 × 9 @ 2** (lattice snaps the reprice up a plate) | 205.0 — real, on prescription |
| 2 (one rep short, honest log) | — | 150 × 8 @ 2 | 200.0 — target re-arms at 200.0 + δ (never 205 + δ) |
| meso N+1 week 1 (earned at close) | 145 × 8 @ 3 (identical forever) | **150 × 8 @ 3** | visible meso-over-meso prescribed progress |

## 8. Data, auditability, doc-14 treatment

### 8.1 What is stored

Nothing new. Decisions (`engine_decisions`) already persist inputs +
output; the progression trace step (§3.6) and the recorded target anchor
ride the output JSONB; `kind` stays `seed | advance` (the step is a rule
within either kind — recompute/replay dispatch untouched).

### 8.2 Derived inputs (doc 14 §3: recomputed on read, excluded from the fingerprint, recorded for replay)

```
progressionHistory: {
  earnedThisMicrocycle: boolean,
  trailing30dPrescribedGainPct: number | null,
  consecutiveMissedEarns: number,
}
```
assembled by the caller from recent `engine_decisions` (same pattern as the
strength anchor), plus the seed's `targetAnchor` opt (§3.7) and — Phase 3 —
`band_position`. Write/check parity per doc 14 §6.2; the config-side
projection is untouched.

### 8.3 Audit surfaces

- Phase 1: `rule`/`status` filter on `get_engine_decisions`;
  `simulate_prescriptions` is the activation replay-diff.
- Post field data: admin `get_progression_history` (per user × exercise:
  earn/miss/skip series, prescribed vs measured gain, governor firings,
  `vanished` frequency → increment sizing). Aggregation is read-side only;
  feedback into prescriptions only as a derived input (the envelope).
- `explain_prescription` narrates the progression step for free.

### 8.4 Trust-model consequence (unchanged from the review, restated)

Checkbox-logging compounds under this design (each fake compliant session
scores `A + δ` and re-arms). The governors that bound it — rate pacer,
workload gate, reported-RIR-aware compliance — are Phase-1 components, not
refinements. Periodic *required* honest-RIR confirmation is deferred with
its capture affordance (§11).

## 9. Interactions (settled; details in review §9)

RIR ramp/hold weeks compose (deadband on un-earned weeks only); pain gate /
dampener are independent locks in the correct order; deloads neither earn
nor step, the seed carries earns across the boundary; peak week skips;
swaps/cold starts unaffected; anchor reads completed workouts only, the
earn evaluates at the same boundary; stats/views/MCP untouched (measured
e1RM everywhere); provenance/dispatch untouched.

## 10. Implementation plan

One phase per PR, in order. Every phase lands green with the block absent
(byte-identical) and its own tests (hard rule 3).

**Phase 1 — engine core + advance chain.**
`src/lib/engine/rules/progression.ts` (gate §3.4, governors §3.5, statuses
§3.6 — pure; clockless; history/staleness from the caller);
`prescribe()` threading (`A*`, deadband carve-out, realized-ask,
always-on trace); params block + zod (`params.ts`); migration
`engine_params` **v20** (append-only, inactive); `progressionHistory`
assembly + advance-path plumbing (`queries/progression.ts` — also fix the
stale "standalone → gain" comment at `:1129`); `compliance_band` param
absorbing `MARKER_BAND` (engine side; UI consumption in Phase 3);
`get_engine_decisions` status filter.
*Tests:* treadmill golden (fixed point with block absent; one earned step
per microcycle + rising asks with it active); gate-arms-at-defaults per
goal; no-compounding (`A + δ`, never `A + kδ`) **and retry-not-stack**
(vanished earn re-arms un-stacked, earn retained); miss throttle; pacing
arithmetic vs `band_position`/factors (factor 0 ⇒ byte-identical); trace
consistency (exactly one status-coded step; no overload+holding
co-emission; `vanished` claims nothing); realized-ask bounds
(`max_pct_per_step`, `bodyweight_only` cap + nudge); full gate matrix
(each failing predicate ⇒ byte-identical output); e1RM-space compliance
(athlete-owned weight change up/down meeting the target ⇒ complies;
reported-low-RIR grind ⇒ under); replay determinism on historical
decisions.

**Phase 2 — seed route.** `seedMeso()` `targetAnchor` opt + caller
plumbing (meso activation `queries/generation.ts:117`; week generation
`queries/progression.ts:312` and replay `:1212`; swap-ins
`queries/slot-prescription.ts:178`; freshness recompute
`queries/regeneration.ts`); earned-at-close derivation.
*Tests:* seed-route parity with the advance route; deload-boundary carry;
meso-over-meso golden (the memo's acceptance case: meso N+1 week 1 asks
more than meso N week 1 under compliance); doc-14 fingerprint parity.

**Phase 3 — day-view coupling + markers.** Prescription-basis anchor in
the day read (`queries/logging.ts`) + `DayView` predictor swap with
measured-anchor fallback; `loggedSetMarker` three-state + params-fed band;
marker ⇄ gate agreement fixture; **09-changelog entry + mockup pass for
the `met` glyph (hard rule 8)**; e2e: earned prescription renders in the
row, weight edit re-derives reps against the target, markers reflect the
shared comparison.

**Phase 4 — audit aggregate (post field data, optional).** Admin
`get_progression_history` over `engine_decisions`; `v_progression_events`
view only if a stats screen wants it.

**Phase R — activation (owner-gated, runbook not code).**
(1) research pass on `goal_rate_factor.hypertrophy` (doc-10-style, evidence
labels; adjust 0.75 or collapse to 1.0); (2) replay diff via
`simulate_prescriptions` over live users; (3) owner reviews the diff;
(4) propose → activate v20 per `docs/deployment/manual-operations.md`;
(5) monitor via the decisions filter (earn/miss/skip mix, `vanished`
frequency). Recommended alongside: doc 10 §8 finer per-class increments
(or document the per-exercise override as the isolation-lift path).

## 11. Deferred (recorded, not in scope for Phases 1–3)

- **Envelope loop** (§4) — Phase-3-of-the-design; needs Phase-1/2 field
  data for the update rule.
- **`rate_source: "plan"`** — blocked on N21's macro-target correction
  (which should expose a per-user monthly strength rate).
- **Periodic required honest-RIR confirmation** — two-part (engine rule +
  per-set RIR capture affordance + narrow doc-11 premise amendment);
  revisit with field data.
- **Per-exercise "progression off" override** — slots into the existing
  `ExerciseParamOverride` merge (doc 14 §6.1) when wanted.
- **Cross-doc updates at build time:** doc 10 §4 and doc 13 §9.2 gain
  pointers to this doc in the Phase-1 PR; `docs/PROGRESS.md` records each
  phase; the N35 backlog row moves per the notes protocol.
