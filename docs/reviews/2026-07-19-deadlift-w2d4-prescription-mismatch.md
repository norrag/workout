# 2026-07-19 — W2·D4 deadlift prescription mismatch (N56): code-side investigation

**Report (owner, 2026-07-19, verbatim in `docs/notes/backlog.md` → Batch 19):**
"Please look at my next deadlift session prescription it does not match what is
shown on screen. Please assess and address." Attached screenshot: the day view
for **W2·D4, SAT 18 JUL** of *JULY '26 – BULK (CHEST/BACK FOCUS)*, header
**TARGET 2 RIR**, all sets unlogged. Slot 01 — GLUTES **Deadlift (barbell): 250
lb × 8, three sets**; slot 02 — QUADS Leg Press (machine) 270 × 8 × 3; slot 03
Leg Extension below the fold.

**Session constraint, stated up front.** This session ran without live data
access: the `workout` MCP connector is connected at the org level but was
toggled off for this chat, and the session is non-interactive (the OAuth flow
and a clarifying question could not run). The N33 precedent
(`2026-07-04-swap-prescription-provenance.md`) was cracked by reading the live
`engine_decisions` audit trail; this report therefore records everything the
code and repo history pin down, ranks the possible mechanisms, and lists the
exact live queries that settle it (§5). One structural gap that can produce
exactly this class of mismatch was found and fixed in the same PR (§4).

---

## 1. What the screen is showing, mechanically

The day view (`src/app/(app)/log/[workoutId]/page.tsx:32`) runs
`ensureFreshPrescriptions` (doc 14 §5) before rendering, then displays the
stored `logged_sets` prescribed values via `getWorkoutDetail`
(`src/lib/queries/logging.ts:145`). So at screenshot time (20:02, Jul 18) the
numbers on screen were **freshness-reconciled against the live config** —
whatever engine params / profile / meso config were active at that moment, the
250 × 8 × 3 is the engine's then-current output for that row (or its stored
value re-verified unchanged). The screen is not a stale cache; the reconcile
gate (`mesocycles.last_reconcile_sig`) guarantees a recompute ran if any
fingerprint input had changed.

Key recompute semantics (verified in `src/lib/queries/regeneration.ts`):

- **Refreshed live** on every recompute: the strength anchor and bodyweight
  (`recomputeAdvance`, regeneration.ts:212) plus all config inputs.
- **Replayed frozen** from the stored decision: `progressionHistory`,
  `seedEarn`, `planStrengthRate`, `bandPosition`, `daysSincePreviousSession`
  (regeneration.ts:260–288) — the earn/pace context is immutable completed
  work.
- The anchor's recency weighting is **relative** among samples
  (`0.5^(ageDays/halflife)`, `src/lib/queries/anchors.ts:17`,
  `src/lib/engine/reps.ts:174`): scaling every sample's age by the same Δ
  leaves the weighted result unchanged, so **pure passage of time cannot move
  a recomputed prescription**. Absent new deadlift sets, the Jul-18 anchor
  equals the Jul-11 anchor.

Consequence: under stable params, the W2·D4 deadlift row reads the same all
week. For the screen to differ from a number seen earlier, either an input
actually changed (params flip, profile/meso edit, increment override), or the
other number never came from this row at all.

## 2. Timeline and params context

- The meso runs Jul '26; W1·D4 ≈ Sat Jul 11 — **the same day as the
  v21→v22→v21 hosted params churn** (N43 interim decision: v22's plan-band
  pacer rolled back; v22 was hosted-only, no repo migration). W2·D4 was
  generated at W1·D4 completion (`catchUpMesoGeneration`), i.e. possibly under
  any of v21/v22 that day — but every later day-view open re-reconciled it to
  the finally-active **v21**, so the churn cannot leave a stale number behind.
- v21 progression block (migration `20260710000002`): `mode:"earned_step"`,
  `step:"min"`, `compliance_band` 0.015, `cadence:"microcycle"`,
  `pacing:"macro_rate"`, `rate_source:"band"`, `band_position` 0.5,
  `goal_rate_factor` hypertrophy **0.75**, `strength_pct_month` intermediate
  **[1.5, 3]**.
- v23 (`20260712000001`) is applied but **inactive**; its activation is
  owner-gated (N43 Phase R). If the owner activated it mid-week via the
  runbook, that IS a fingerprint flip → the next day-view open recomputed every
  open row. Worth checking (§5).

## 3. The worked numbers for this exact row

All engine math, from `src/lib/engine/rules/progression.ts` +
`src/lib/engine/predict.ts` (Brzycki ≤ 10 effective reps, Epley above,
`rir_offset` 1.0, barbell rounding grid 5 lb):

- Screen: 250 × 8 @ 2 RIR → effective reps E = 10 → k(10) = 36/27 = 1.3333 →
  **implied anchor ≈ 333 lb** (250 × 1.3333); with the 5-lb grid the screen is
  consistent with any anchor in roughly **330–340**.
- If W1·D4 had been 250 × 8 @ 3 RIR fully performed: session e1RM = 250 ×
  k(11) = 250 × 1.3667 ≈ **341.7**. A plain *hold* (no earned step) at 2 RIR
  would already price 341.7/1.3333 ≈ 256 → **255 on the grid** — the RIR ramp
  does that climb, not the earn. The screen's 250 therefore implies the anchor
  is ≈ 333, i.e. **W1·D4 was lighter than 250×8@3** (e.g. 245×8@3 → anchor
  334.9 → hold prices 251.2 → 250 ✓), or older/lower sessions still weigh into
  the `session_best` anchor, or a reported RIR below target derated the
  session.
- The earned quantum for this row: δ = min(δ_w, δ_r) = min(5 × k(10), 250 ×
  (k(11) − k(10))) = min(6.67, 8.33) = **6.67 e1RM lb ≈ 1.95%** of the anchor.
- The v21 pacer target: lerp(1.5, 3, 0.5) × 0.75 = **1.69 %/mo**. One deadlift
  step "costs" ~1.95% — more than a whole month's budget — so **whenever any
  prescribed-gain event sits in the trailing 30-day window (e.g. the meso
  seed's earned carry, doc 16 §3.7), the `rate_pacer` governor defers the next
  step** (progression.ts:244–253). With an empty window (`trailing == null`)
  the pacer passes and the step is offered.

So the fully-self-consistent no-defect reading: **250 × 8 × 3 is the engine's
correct, stable v21 output for an anchor ≈ 333–335 with the earned step either
not earned (a W1 set scored `under` the §5.3 band) or earned-then-paced** — and
the "prescription" the owner compared against came from another surface: a
coach-chat number, the Prescription Detail sheet's anchor lines (which show the
*e1RM-space* target/measured anchors, not the load), the exercise page's
undecayed-best e1RM (deliberately different from the prescription's
recency-weighted anchor, T-A1(b)), or a number remembered from Jul 11 before
the churn settled.

## 4. What was found and fixed in code: MCP freshness parity (doc 14 §5 gap)

Doc 14 §5/§9 requires the read-path reconcile on **every** surface that
displays prescriptions ("move the check into the prescription read/query layer
so every surface that displays prescriptions gets fresh numbers"), and the
house convention requires MCP to share the app's definitions ("one definition
of progress"). The audit for this report found the two app pages call
`ensureFreshPrescriptions` — and **no MCP tool does**. `explain_prescription`
(`src/lib/mcp/tools/read.ts`) is the one public tool that reports a specific
open prescription (it prefers the latest recorded `engine_decisions` row), so a
coaching chat could quote a number computed under superseded inputs, which the
app would then contradict on next open after its reconcile — precisely the
reported shape of mismatch, with no way to distinguish it from a real defect
afterward.

**Fixed in this PR:** `explain_prescription` now runs the same
`ensureFreshPrescriptions` for the caller's active mesocycle before reading the
decision (degrading loudly-but-safely on failure, mirroring the page
contract). Whatever the tool reports is now the same reconciled state the app
shows. This is a parity/hygiene fix shipped on its own merits — it is **not**
claimed as the confirmed cause of the owner's observation.

## 5. What settles it (run from a connector-enabled session)

1. `explain_prescription` for Deadlift — the recorded decision's `kind`,
   `params_version`, `inputs.strengthAnchor` (compare to the §3 implied ≈333),
   `inputs.progressionHistory` (trailing gain / earn flags), and the
   `progression` trace step: `stepped` / `paced` (+ governor) / `not_earned`
   (+ predicate).
2. Admin `get_engine_decisions` (rule filter `progression`) or
   `get_progression_history` for Deadlift — whether a step was earned at W1→W2
   and what deferred it; whether a `recompute` decision exists this week and
   what changed.
3. The W2·D4 deadlift `workout_exercises.set_weights` — non-empty means an
   out-of-band planned-weight override is what's on screen (the detail sheet
   would also show its "numbers don't match this decision" warning).
4. `list_engine_params` — confirm v21 is still active (or spot a mid-week v23
   activation, which would have recomputed every open row on next view).
5. From the owner: **where** the mismatching number was seen (coach chat /
   detail sheet / remembered from earlier in the week) and what it was.

## 6. Ranked hypotheses

| # | Mechanism | Discriminator |
|---|-----------|---------------|
| 1 | **Working-as-designed hold**: earn gate failed or `rate_pacer` deferred (one deadlift step ≈ 1.95% vs 1.69 %/mo budget); the compared number was a coach-chat estimate, a detail-sheet e1RM line, or an expectation of 255 | trace step on the recorded decision; no divergent decision |
| 2 | **Cross-surface staleness**: the compared number was quoted by MCP before/after a reconcile boundary (params churn, v23 activation, profile/meso/override edit) | a `recompute` decision this week; params activation log; §4 fix prevents recurrence |
| 3 | **Out-of-band planned weight** (`set_weights` override / manual edit) | `set_weights` non-empty; detail-sheet warning |
| 4 | **Advance-path defect** (wrong source week per the N33 lookback, swap/first-set class) | decision `inputs.previous` pointing at the wrong session — considered least likely: all three sets uniform, no swap reported, suite green since PR #160 |

## 7. Structural observations (owner decisions, parked under N56)

- **Step cadence on coarse-increment lifts.** Under v21 a deadlift-sized
  quantum (~2%) exceeds the monthly paced budget (~1.7%), so heavy barbell
  lifts step roughly once per month by construction while machine lifts with
  finer grids step more often. If that reads as "the engine never progresses my
  deadlift", the levers are the per-exercise increment override, the
  `band_position`/band calibration (N43/v23, N36), or a per-exercise floor on
  the pacer — a doc 16 §6 design question, not a bug fix.
- **The hold explains itself only in the detail sheet.** The status-coded
  trace (`paced` / `not_earned` with governor/predicate) ships since Phase 1,
  but the day view's set rows carry no hint that a hold is a *decision*; the
  owner has to open the Prescription Detail sheet to see "skipped by rate
  pacer…". A tiny surfaced state (or the PH30 explanation layer) would have
  pre-empted this report.
- **R24 revisited, sharpened:** with relative recency weights (§1), a
  recompute cannot drift from time alone — the R24 "hold reprices down"
  concern is narrower than feared: it requires new logged data or a config
  change, both auditable. Recorded here so the next reprice-down report starts
  from this baseline.
