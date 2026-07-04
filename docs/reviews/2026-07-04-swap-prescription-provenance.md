# Swap / seed-path prescription provenance — investigation (N33)

**Date:** 2026-07-04 · **Reporter:** owner (in-chat, with a W5·D2 screenshot)
· **Status:** investigated, root-caused, solutions assessed — no code changed yet.
**Scoping record for backlog item N33.**

---

## 1. What the owner saw

On the June '26 Bulk deload week (W5·D2, workout `b001def5`, planned), after
swapping Deadlift out for a test exercise and back in again:

- Set rows filled with **245 lb × 5 reps** (2 sets).
- Exercise menu note: *"Swapped in at your all-time best 245 × 15; this week's
  sets seed next week."*
- Prescription detail sheet, all at once:
  - PRESCRIPTION: **245 lb × 15 reps · 2 sets · 6 RIR**
  - Rationale: *"Deload off strength anchor (e1RM 331.9 lb): **215 lb for 10
    reps** at 6 RIR, 2 sets. Recover before the next block."*
  - TRACE: `DELOAD — deload off strength anchor (e1RM 331.9 lb): 215 lb for 10
    reps at 6 RIR, 2 sets`
  - DECISION KIND: ADVANCE · VERIFIED AS OF **V18** · COMPUTED UNDER **V17** ·
    *"Re-verified under V18 — numbers unchanged since V17."*

Three different prescriptions on one screen, none matching the filled sets.

## 2. Reconstructed timeline (verified against `engine_decisions` + history via MCP)

Row = `workout_exercises` `14afbf78` (W5·D2 Deadlift slot).

1. **2026-06-24, W4·D2** — logged 245×15, 245×15 (RIR unreported) → session
   e1RM **384.2** (averaged Epley/Brzycki at 15 effective reps — the "skews
   high" observation; see §7).
2. **2026-06-24, W4·D4 advance** (decision `0d53b1a1`, V11): *"+25 lb to 9 reps
   at 0 RIR (anchor e1RM 367.5, **low** confidence)"* → prescribed **285×9**.
   Performed 2026-07-01: 285×7, 285×4 ("Low back was the limiting factor") →
   session e1RM **331.9**.
3. **2026-07-01, W5·D2 deload advance** (decision `c34a062d`, **V17**, kind
   `advance`, latest for the row): recomputed on fingerprint change → *deload
   off strength anchor (e1RM 331.9, high confidence): **215 lb × 10 reps @ 6
   RIR, 2 sets***. Row written to 215/10/2/6.
4. **V18 activated** → read-path reconcile re-ran the row, numbers unchanged →
   `params_version` stamped 18, **no new decision** (by design: the stamp gap
   *is* the audit signal). Sheet honestly read "re-verified under V18".
5. **Swap out → swap back** (`replaceWorkoutExercise`,
   `src/lib/queries/logging.ts:746`). Each leg wrote **only**:
   `exercise_id`, `prescribed_weight ← v_exercise_prs.best_weight` (245),
   `prescribed_reps ← best_reps` (15), `set_weights ← {}`, `notes ← "Swapped
   in at your all-time best…"`. It left **untouched**: `prescribed_sets` (2),
   `target_rir` (6), `dep_fingerprint`, `params_version` (18), and the
   decision log. No engine call, no decision recorded.

## 3. Why each number on the screen is what it is

| Surface | Value | Source |
|---|---|---|
| Sheet PRESCRIPTION line | 245 × 15 · 2 sets · 6 RIR | Live row: 245/15 from the swap's PR write **+** 2 sets/6 RIR left over from the V17 deload — a chimera of two writers (`PrescriptionDetailSheet.tsx:137`) |
| Sheet rationale + TRACE + kind | Deload 215×10, ADVANCE | Latest `engine_decisions` row (V17) — the swap recorded nothing, so the pre-swap decision is still "the" decision (`audit.ts:58`) |
| "Re-verified under V18 — numbers unchanged" | **now false** | Row stamp (18) > decision version (17). True at step 4; the swap then changed the numbers *outside* the engine, which the framework can't see |
| Menu note | "Swapped in at your all-time best 245 × 15…" | `workout_exercises.notes`, the swap's own string — a third provenance channel |
| Set rows: 245 × **5** | anchor-predicted | Day view ignores `prescribed_reps` on unlogged rows and shows `predictRepsAtWeight(anchor 331.9, 245 lb, 6 RIR)` ≈ 5 (`DayView.tsx:1336`, `engine/predict.ts:151`). Deliberate (doc 13): reps follow the shown weight. It quietly "repaired" the impossible 245×15@6RIR into the anchor-honest rep count — which is why the fill looked *vaguely* sensible while matching nothing |

So the sets were filled with a number no engine and no write path ever
prescribed: prescribed weight (swap) × predicted reps (anchor at the stale
deload RIR).

## 4. Why the framework never self-corrects this

Doc 14's premise is *"`prescribed_*` is a cached engine output; freshness =
re-resolve the config inputs and compare fingerprints."* The swap violates the
premise's hidden invariant — **only the engine writes prescriptions** — and is
invisible at both levels of the reconcile:

- **Gate level** (`regeneration.ts:423` `MesoStaleInputs`): a swap changes no
  gated input (no params/profile/goal/meso-config change; no workout added or
  closed; `exercises.updated_at` is the library, not the slot). The whole pass
  short-circuits on `last_reconcile_sig`.
- **Row level** (`regeneration.ts:1066`): even when the pass runs, the
  fingerprint hashes *config inputs only* — equipment, profile, goal, week,
  `previous`, `initial`, params token. It contains **neither the row's
  `exercise_id` nor the prescribed numbers**. Deadlift→deadlift round-trip:
  every input identical → fingerprint matches → row is "fresh", and the
  reconcile will keep advancing its "verified as of" stamp — actively
  certifying hand-written numbers.

The mid-swap state is just as blind: swapping to any same-equipment exercise
also matches (exercise identity isn't hashed), leaving the test exercise
"verified" under the *deadlift's* deload decision. Had the equipment differed,
the row would go stale and be recomputed — but as a **replay of the deadlift's
stored advance inputs** applied to the new exercise, which is differently
wrong. The framework has no concept of "the exercise behind this slot
changed."

**Contrast — the add path is already correct.** `addWorkoutExercises`
(`logging.ts:932`, doc 14 §6.2) runs the pure `seedMeso` (PR modeled as the
cold-start `initial`, anchor-aware via §S1), stamps `dep_fingerprint`, and
records a `kind:"seed"` decision. The swap path was simply never brought into
the framework. (N5/N13 were client-side symptoms of the same swap flow —
display remount and reset-echo — fixed in PRs #131/#137; this is the
data-layer half.)

## 5. Root causes, ranked

1. **RC1 — `replaceWorkoutExercise` is an out-of-band prescription writer.**
   Writes PR numbers verbatim onto half the prescription tuple, records no
   decision, stamps no fingerprint, ignores week context (seeded an all-out PR
   *into a deload week*).
2. **RC2 — the freshness framework is blind to exercise identity.** Neither
   the fingerprint nor the replay checks that the latest decision was computed
   for the row's current exercise (`engine_decisions.exercise_id` is stored
   but never compared).
3. **RC3 — presentation stitches two provenance sources with no coherence
   check.** The sheet pairs the live row with the latest decision and *infers*
   "re-verified, unchanged" from the version gap — valid only while RC1 can't
   happen. The menu note is a third, free-text provenance channel.
4. *(Not a defect)* anchor-predicted reps in the day view masked the
   incoherence with plausible numbers.

## 6. Solution assessment — and the generalization

The unifying principle: **a prescription may only enter `workout_exercises`
as an engine output with recorded provenance** (decision + fingerprint), and
**the engine kind is derived from the data, not from how the row came to
exist**. Concretely:

- **S1 (core fix): route the swap through the engine, like the add path.**
  On swap, after updating `exercise_id` and clearing `set_weights`:
  - If the incoming exercise has a **completed same-exercise counterpart in
    week N-1** (the reconcile's §7c advance-backfill basis,
    `regeneration.ts:821`), compute an **ADVANCE** via `prescribe` — deload-
    aware by construction. A→B→A round-trips then *restore* the engine
    prescription (here: exactly 215×10@6RIR·2 sets), fixing the "technically
    correct but undesirable" reseed the owner flagged.
  - Otherwise compute a **cold seed** via `seedMeso` exactly as
    `addWorkoutExercises` does (PR as `initial`, §S1 anchor pricing, week RIR)
    — on-step, window-priced, deload-RIR-aware instead of raw PR.
  - Either way: write the full tuple (weight/reps/sets/targetRir), set `notes`
    to the engine rationale (one provenance string, killing the bespoke
    "all-time best" copy), stamp `dep_fingerprint` + `params_version`, insert
    the decision. The pure per-row recompute already exists
    (`recomputeRow`, `regeneration.ts:148`) — extract/reuse rather than
    duplicating; the swap runs it inline so the UI has correct numbers
    immediately (the stale gate then needs no change — the row is written
    correct, not left for the reconcile to find).
- **S2 (framework amendment, belt-and-braces): exercise-identity check in the
  reconcile.** When `latestDecision.exercise_id ≠ row.exercise_id`, treat the
  row as **decision-less** (fall into the existing §7b/§7c backfill) instead
  of replaying a foreign decision. One comparison; makes any *future*
  out-of-band exercise change self-correcting instead of silently certified.
  (Preferable to hashing `exercise_id` into the fingerprint, which would
  mass-invalidate every existing row for no gain once S1/S2 land.)
- **S3 (chokepoint invariant): one `writePrescription` helper** — engine
  output + inputs + kind in; row update + decision insert + fingerprint stamp
  out — used by generation, reconcile, add, and swap. Guard with a test (or
  grep-lint) that no other call site updates `prescribed_*` on
  `workout_exercises`. This is what generalizes the system: the next feature
  that touches prescriptions (manual edit, template import, …) physically
  cannot repeat RC1.
- **S4 (UI honesty guard, small):** the detail sheet should compare the live
  tuple against the decision's output and, on mismatch, say so ("numbers were
  changed outside the engine") rather than render the false "re-verified —
  unchanged" line. After S1–S3 it's an assertion that should never fire —
  cheap regression tripwire.
- **S5 (optional engine nicety):** `seedMeso` has no `isDeload` branch
  (`engine/index.ts:565`), so a cold seed landing in a deload week gets
  working-week structure at deload RIR (affects the add path too). With S1's
  advance-first rule the common case is covered; consider passing
  `week.isDeload` through and applying `deload.set_pct` in a follow-up with
  golden tests.

Suggested slicing: **S1+S2** as one PR (queries + unit tests over the
swap/advance/seed matrix and the A→B→A round-trip), **S3** in the same PR if
the extraction stays mechanical (else immediate follow-up), **S4** small
follow-up, **S5** separate engine PR.

## 7. Secondary observations (out of scope here, noted for the record)

- **The 285×9 over-prescription** the owner mentioned traces to the V11-era
  anchor **367.5, LOW confidence** (Epley-only at 15 effective reps) driving a
  +25 lb jump off the 245×15 outlier session. Later params versions already
  temper this (V17 anchor 331.9, high confidence; §S3 Brzycki cutoff; R24
  capped the cutoff ≤10). Whether a *low-confidence* anchor should authorize a
  full-increment jump at all may be worth folding into the open R24
  reprice/guardrail investigation.
- **`v_exercise_prs` best (245×15) is itself the outlier set** — one more
  reason "swap in at your all-time best" is the wrong seed basis versus the
  recency anchor (consistent with the T-I5 owner ruling: don't fabricate;
  prefer data-honest seeds).
- The swap note's *"this week's sets seed next week"* is false in a final /
  deload week; S1 retires the copy along with the path.
