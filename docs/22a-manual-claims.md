# 22a — Manual claims ledger

**Status:** live register, doc 22 §8.3. Working document, not user-facing prose.
**Opened:** 2026-08-07 (doc 22 Phase 1, N74).

> **The rule.** A claim about app behavior enters the manual only after its row
> exists here and is verified against **code or the active `engine_params` row**
> — never against a numbered spec ([`22b`](./22b-source-map.md) §9.2), because a
> spec citation is precisely what the Phase-0 audit exists to prevent. A PR that
> changes user-visible behavior greps this file.
>
> Given doc 22 §2.4 (Batch 32 moved four documented surfaces in a single day),
> this ledger is the difference between a manual and a snapshot. **Every row is
> re-validated at Phase 4.**

## How to read a row

| Column | Meaning |
|---|---|
| **Claim ID** | `C-<topic>-<nn>`, stable. Referenced from the content file's header comment when a section leans on several |
| **Manual location** | section ID (doc 22 §9.4.2), so a claim is greppable to the screen that renders it |
| **Assertion** | what the prose commits to, compressed — not the prose itself |
| **Source of truth** | the file, symbol, or `engine_params` path a reviewer opens to check it |
| **Verified** | date the row was last read against that source |

---

## User Guide ch. 6 — Effort: RIR and the ramp (`ug/effort-rir`)

Phase 1's exemplar. All rows verified against the repo at `42c0c01` and the
live-parameter transcription in [`22b`](./22b-source-map.md) §4.2 (active row
**v25**).

| Claim ID | Manual location | Assertion | Source of truth | Verified |
|---|---|---|---|---|
| `C-rir-01` | `ug/effort-rir#what-rir-means` | The day view header reads `TARGET {n} RIR`, or `DELOAD WEEK` on a deload week | `src/app/(app)/log/[workoutId]/DayView.tsx:644` | ✓ 2026-08-07 |
| `C-rir-02` | `ug/effort-rir#what-rir-means` | Each set row carries an editable `RIR` column | `DayView.tsx:1333` (column head), `:2103` (input) | ✓ 2026-08-07 |
| `C-rir-03` | `ug/effort-rir#what-rir-means` · `#per-exercise` | A per-exercise target is reached from the exercise `…` menu → `Effort target` | [`22c`](./22c-app-inventory.md) §B1.2 (exercise `…` menu), `EffortSheet` | ✓ 2026-08-07 |
| `C-ramp-01` | `ug/effort-rir#the-weeks-ramp` | `START RIR` / `END RIR` are set per mesocycle, each 0–5 | `src/app/(app)/cycles/meso/[mesoId]/MesoHeader.tsx:640–684` | ✓ 2026-08-07 |
| `C-ramp-02` | `ug/effort-rir#the-weeks-ramp` | `Set each week independently` writes one RIR per working week, any values in any order | `RirScheduleEditor.tsx:17–119`; `engine/rules/rir.ts` (N18-B) | ✓ 2026-08-07 |
| `C-ramp-03` | `ug/effort-rir#the-weeks-ramp` | The ramp is editable while a block is `planned`; after that the details sheet edits the name | `MesoHeader.tsx:568` (`shapeLocked = status !== "planned"`), `:583` | ✓ 2026-08-07 |
| `C-ramp-04` | `ug/effort-rir#the-weeks-ramp` | A deload week's target RIR is **6**, taken from `deload.target_rir` rather than from the ramp | `engine/rules/rir.ts` (deload week appended at `params.deload.target_rir`); value from [`22b`](./22b-source-map.md) §4.2 | ✓ 2026-08-07 |
| `C-ramp-05` | `ug/effort-rir#the-weeks-ramp` (layer 3) | Without a schedule, working weeks interpolate linearly start→end and round; the last working week sits on the end value | `engine/rules/rir.ts::rirRamp` | ✓ 2026-08-07 |
| `C-rep-01` | `ug/effort-rir#report-what-you-did` | The RIR box is pre-filled with the week's prescribed target — never 0 | `log/[workoutId]/day-rules.ts::captureRirDefault` (+ the N11 note) | ✓ 2026-08-07 |
| `C-rep-02` | `ug/effort-rir#report-what-you-did` | An empty box reports nothing, which resolves to the prescribed target — the same as leaving it untouched | `day-rules.ts::reportedRirFromInput` → `engine/predict.ts::assumedRir` | ✓ 2026-08-07 |
| `C-rep-03` | `ug/effort-rir#report-what-you-did` | Reportable RIR runs 0–10 | `day-rules.ts::isReportableRir`; `logged_sets.rir_reported` check constraint | ✓ 2026-08-07 |
| `C-e1rm-01` | `ug/effort-rir#why-honesty-matters` | Effective reps = `reps + rir × e1rm.rir_offset`, and `rir_offset` is **1** | `engine/predict.ts::estimateE1rm`; [`22b`](./22b-source-map.md) §4.2 | ✓ 2026-08-07 |
| `C-e1rm-02` | `ug/effort-rir#why-honesty-matters` | e1RM **rises** with effective reps, so at the same weight × reps the set with reps in reserve implies more strength | `engine/predict.ts::e1rmFactor` (Epley `1 + effReps/30`, Brzycki `36/(37 − effReps)`, both increasing); corroborated by the doc 21 §2 restamp moving every stamp upward (+4.85%, 2026-08-02) | ✓ 2026-08-07 |
| `C-e1rm-03` | `ug/effort-rir#why-honesty-matters` (layer 3) | Epley and Brzycki are averaged up to `e1rm.brzycki_max_eff_reps` (**10**) effective reps, Epley alone above | `engine/predict.ts::e1rmFactor`; [`22b`](./22b-source-map.md) §4.2 / §6.1 | ✓ 2026-08-07 |
| `C-e1rm-04` | `ug/effort-rir#why-honesty-matters` (layer 3) | A set with no reported RIR resolves to the RIR it was prescribed at, never to 0 | `engine/predict.ts::assumedRir` | ✓ 2026-08-07 |
| `C-e1rm-05` | `ug/effort-rir#why-honesty-matters` | The e1RM of recent sets is what the strength anchor is built from, and the anchor is what the next weight is chosen off | `queries/anchors.ts::recencyWeightedE1rm` → `engine/index.ts` (`weightForRepsAtRir(anchor…)`) | ✓ 2026-08-07 |
| `C-miss-01` | `ug/effort-rir#missing-the-ask` | A logged set is marked above / met / below its prescription, compared **by e1RM** so reps and RIR both count | `day-rules.ts` (P19 → doc 16 §5.3 marker) | ✓ 2026-08-07 |
| `C-miss-02` | `ug/effort-rir#missing-the-ask` | Next week's weight is re-derived from recent sets rather than stepped on a fixed schedule, so a week run harder than asked can produce a lighter next ask | `engine/index.ts` (`weight_selection: "rep_window"` off the anchor); FAQ **F1**/**F2** in [`22c`](./22c-app-inventory.md) Part D | ✓ 2026-08-07 |
| `C-perex-01` | `ug/effort-rir#per-exercise` | An exercise-level target RIR is **absolute** — set, it wins over the week's ramp; unset, the exercise follows the ramp | `engine/index.ts:158` (`week: { …, targetRir: inputs.exerciseRir }`), doc 21 §4 | ✓ 2026-08-07 |
| `C-perex-02` | `ug/effort-rir#per-exercise` | The load reprices **symmetrically** through the normal rep-window path — higher target ⇒ lighter, lower ⇒ heavier | `engine/index.ts:1049` (the substitution is for pricing only), doc 21 §5 | ✓ 2026-08-07 |
| `C-perex-03` | `ug/effort-rir#per-exercise` | `Applies to` offers `THIS WEEK` / `WORKING WEEKS` / `ALL WEEKS`, and only `ALL WEEKS` covers the deload | `EffortSheet` scope glosses transcribed in [`22c`](./22c-app-inventory.md) §B1.2 | ✓ 2026-08-07 |
| `C-perex-04` | `ug/effort-rir#per-exercise` | The planner board's RIR column is block-wide; a slot carrying per-week assignments reads `RIR BY WEEK` and keeps them | `cycles/meso/[mesoId]/plan/PlannerBoard.tsx`; `RirScheduleEditor.tsx::rirSummary`; N78 | ✓ 2026-08-07 |

### Deliberately absent from ch. 6

| Not claimed | Why |
|---|---|
| The **measuring band** (`e1rm.max_measuring_rir`, "priced but not measured") | **Not live** — v26 is inactive, so today every logged set at every RIR is treated as a measurement ([`22b`](./22b-source-map.md) §4.1 ①). Ch. 8 gains it when v26 activates |
| `BACKED OFF` and the read-time comparability policy (doc 21 §6.2) | Live, but it is ch. 8's subject; ch. 6 stops at the lever's mechanics |
| Which ramps suit which training style | Ch. 7, and it is blocked on the 3d-r research pass (doc 22 §6.3) |

---

## Defects this ledger surfaced

| # | Found | What | Disposition |
|---|---|---|---|
| **D-01** | Phase 1, 2026-08-07 | `GLOSSARY.e1rm` ended *"closer to failure reads as stronger"* — the mechanic inverted. e1RM is increasing in effective reps (`reps + rir`), so at the same weight × reps the set with reps **in reserve** implies the greater strength; the doc 21 §2 restamp moving every historical stamp upward is the same fact observed in production | **Fixed** in the Phase-1 PR (`src/lib/glossary.ts`) and pinned by a test in `src/lib/__tests__/glossary.test.ts`. Caught because doc 22 §8.1 forces the manual to render the glossary's own words |
