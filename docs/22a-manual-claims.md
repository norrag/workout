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
| `C-ramp-06` | `ug/effort-rir#the-weeks-ramp` (figure) | `rir-ramp.svg` draws the ramp's **shape only** — four working weeks stepping 3 · 2 · 1 · 0 and a deload week above all of them, carrying no number. Nothing tunable is baked into the asset | `public/manual/rir-ramp.svg`; the shape is `engine/rules/rir.ts::rirRamp` (same source as `C-ramp-05`) | ✓ 2026-08-08 |
| `C-rep-01` | `ug/effort-rir#report-what-you-did` | The RIR box is pre-filled with the week's prescribed target — never 0 | `log/[workoutId]/day-rules.ts::captureRirDefault` (+ the N11 note) | ✓ 2026-08-07 |
| `C-rep-02` | `ug/effort-rir#report-what-you-did` | An empty box reports nothing, which resolves to the prescribed target — the same as leaving it untouched | `day-rules.ts::reportedRirFromInput` → `engine/predict.ts::assumedRir` | ✓ 2026-08-07 |
| `C-rep-03` | `ug/effort-rir#report-what-you-did` | Reportable RIR runs 0–10 | `day-rules.ts::isReportableRir`; `logged_sets.rir_reported` check constraint | ✓ 2026-08-07 |
| `C-e1rm-01` | `ug/effort-rir#why-honesty-matters` | Effective reps = `reps + rir × e1rm.rir_offset`, and `rir_offset` is **1** | `engine/predict.ts::estimateE1rm`; [`22b`](./22b-source-map.md) §4.2 | ✓ 2026-08-07 |
| `C-e1rm-02` | `ug/effort-rir#why-honesty-matters` | e1RM **rises** with effective reps, so at the same weight × reps the set with reps in reserve implies more strength | `engine/predict.ts::e1rmFactor` (Epley `1 + effReps/30`, Brzycki `36/(37 − effReps)`, both increasing); corroborated by the doc 21 §2 restamp moving every stamp upward (+4.85%, 2026-08-02) | ✓ 2026-08-07 |
| `C-e1rm-03` | `ug/effort-rir#why-honesty-matters` (layer 3) | Epley and Brzycki are averaged up to `e1rm.brzycki_max_eff_reps` (**10**) effective reps, Epley alone above | `engine/predict.ts::e1rmFactor`; [`22b`](./22b-source-map.md) §4.2 / §6.1 | ✓ 2026-08-07 |
| `C-e1rm-04` | `ug/effort-rir#why-honesty-matters` (layer 3) | A set with no reported RIR resolves to the RIR it was prescribed at, never to 0 | `engine/predict.ts::assumedRir` | ✓ 2026-08-07 |
| `C-e1rm-05` | `ug/effort-rir#why-honesty-matters` | The e1RM of recent sets is what the strength anchor is built from, and the anchor is what the next weight is chosen off | `queries/anchors.ts::recencyWeightedE1rm` → `engine/index.ts` (`weightForRepsAtRir(anchor…)`) | ✓ 2026-08-07 |
| `C-miss-01` | `ug/effort-rir#missing-the-ask` | A logged set is marked above / met / below its prescription, compared **by e1RM** so reps and RIR both count | `day-rules.ts` (P19 → doc 16 §5.3 marker) | ✓ 2026-08-07 |
| `C-miss-01a` | `ug/effort-rir#missing-the-ask` | Those three marks are **`▲` / `■` / `▼`**, shown beside the set number, and the manual renders the same characters the day view does | `src/lib/set-markers.ts`, read by both `DayView.tsx` and the manual's `legend` block; pinned by a source assertion in `src/content/manual/__tests__/registry.test.ts` | ✓ 2026-08-07 |
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

## User Guide ch. 1 — What WORKOUT is (`ug/what-workout-is`)

Phase 3a. Verified against the repo at `788c0d8`.

| Claim ID | Manual location | Assertion | Source of truth | Verified |
|---|---|---|---|---|
| `C-app-01` | `ug/what-workout-is#the-idea` | Each session's weight, reps and sets are derived from recent logged sets rather than stepped on a written schedule | `engine/index.ts` (`weight_selection: "rep_window"` off the anchor) → `queries/slot-prescription.ts::computeSlotPrescription` | ✓ 2026-08-08 |
| `C-app-02` | `ug/what-workout-is#the-five-tabs` | Five tabs, in bar order: `Workout` · `Cycles` · `Templates` · `Exercises` · `More`; the active one carries `■` and heavier ink | `src/components/ui/BottomNav.tsx:11–17`, `:76–81` | ✓ 2026-08-08 |
| `C-app-03` | `ug/what-workout-is#the-five-tabs` | Every list and detail route ships a route-level skeleton that paints before the data arrives | `loading.tsx` under `(app)/{cycles,exercises,exercises/[exerciseId],templates,more,workout,log/[workoutId]}` (N1) | ✓ 2026-08-08 |
| `C-app-04` | `ug/what-workout-is#the-workout-tab` | The Workout tab **is** the session — `/workout` renders `DayView` inline rather than linking to it | `src/app/(app)/workout/page.tsx` (returns `<DayView …/>`); the same premise `lib/version/suppression.ts` is built on | ✓ 2026-08-08 |
| `C-app-05` | `ug/what-workout-is#the-workout-tab` | The tab targets the last day viewed **this session** (`sessionStorage.lastWorkoutId`), falling back to `/workout` — so it resumes rather than resetting to today | `BottomNav.tsx:33–40` (re-read on each navigation); stamped by `DayView` | ✓ 2026-08-08 |
| `C-app-06` | `ug/what-workout-is#the-workout-tab` | With a block running but no open workout the tab shows the latest **completed** meso's summary and `ALL STATS ›`; with no cycles at all it offers `SET UP CYCLES` | `workout/page.tsx` (resting-state branch, `v_meso_summary` where `status = completed`; `!state.mesocycle` branch) | ✓ 2026-08-08 |
| `C-app-07` | `ug/what-workout-is#the-workout-tab` | Tapping the `workout` logotype toggles the week/day navigator, whose week chips read `W{n}` (or `DL`) and day chips `D{n}` | `DayView.tsx:700–760` | ✓ 2026-08-08 |
| `C-app-08` | `ug/what-workout-is#what-changed` | The More footer reads `WORKOUT {version} — WHAT'S NEW ›` and links to `/more/whats-new`; the number comes from the release registry | `src/app/(app)/more/page.tsx:167–180` (`displayVersion()`); doc 23 §8 | ✓ 2026-08-08 |
| `C-app-09` | `ug/what-workout-is#what-changed` | `/more/whats-new` lists every release newest first with the current version marked | `src/app/(app)/more/whats-new/page.tsx:32–50` (`RELEASES_NEWEST_FIRST`, `isCurrent`) | ✓ 2026-08-08 |
| `C-app-10` | `ug/what-workout-is#what-changed` | The sheet carries **every** unseen feature release at once, and dismissing it is an explicit action that marks them seen | `WhatsNewGate.tsx` → `lib/version::versionGate` (accumulates `gate.releases`); doc 23 §6 | ✓ 2026-08-08 |
| `C-app-11` | `ug/what-workout-is#what-changed` | The sheet is suppressed on `/log/**`, while the set-logging queue has pending writes, and on the Workout tab once that workout is `in_progress` | `src/lib/version/suppression.ts::suppressWhatsNew` | ✓ 2026-08-08 |
| `C-app-12` | `ug/what-workout-is#what-changed` | Fix releases ship without a sheet and are recorded in the history page instead | `content/releases/types.ts` (`kind`), `versionGate` announcing `feature`/`major` only; `FixReleaseRow` | ✓ 2026-08-08 |

---

## User Guide ch. 2 — Your profile (`ug/your-profile`)

Phase 3a. Parameter values re-read from the **active v25 row** on 2026-08-08
(`get_engine_params(25)`), not from `DEFAULT_ENGINE_PARAMS`; the additions are
folded into [`22b`](./22b-source-map.md) §4.2 per its own rule.

| Claim ID | Manual location | Assertion | Source of truth | Verified |
|---|---|---|---|---|
| `C-prof-01` | `ug/your-profile#what-it-is-for` | The profile is reached from `More` → the name row, and each field edits in place | `src/app/(app)/more/profile/ProfileEditor.tsx`; `more/page.tsx:60–68` | ✓ 2026-08-08 |
| `C-prof-02` | `ug/your-profile#what-it-is-for` | Bodyweight renders with an `AS OF {date}` freshness label | `ProfileEditor.tsx:161` (`bodyweight_updated_at`) | ✓ 2026-08-08 |
| `C-prof-03` | `ug/your-profile#what-it-is-for` | `Log bodyweight` on the More tab appends a dated measurement to the bodyweight series and never rewrites the profile scalar | `more/LogBodyweightRow.tsx`; `queries/bodyweight.ts`; `more/page.tsx` comment (doc 17 §5) | ✓ 2026-08-08 |
| `C-prof-04` | `ug/your-profile#what-it-is-for` | Bodyweight is the load a bodyweight movement is priced against | `engine/rules/bodyweight.ts::usesBodyweightModel` + `effectiveLoad`; `slot-prescription.ts:323` reads it per prescription | ✓ 2026-08-08 |
| `C-prof-05` | `ug/your-profile#body-and-age` | Sex scales the **muscle-gain** side of a macro target (`macro_target.sex_factor_female` = `0.7`); the **strength** side is scaled `1` for both (`macro_target.strength_sex_factor`) | `engine/macro.ts::sexFactor` / `::strengthSexFactor`; active v25 | ✓ 2026-08-08 |
| `C-prof-06` | `ug/your-profile#body-and-age` | Age is derived from `BIRTHDATE` and moves the target toward the conservative end from `macro_target.age_taper_start` = **40** | `queries/plan-rate.ts::profileToMacroProfile` (`profileAge`); `macro.ts::ageMultiplier` / `::ageMultiplierStrength`; active v25 | ✓ 2026-08-08 |
| `C-prof-07` | `ug/your-profile#body-and-age` | Height, bodyweight and body fat together give normalized lean mass for height, read against a modeled untrained baseline and ceiling; the closer to the ceiling, the slower the rate a target plans for | `macro.ts::muscularDevelopment` (`ffmi_untrained` / `ffmi_ceiling`) | ✓ 2026-08-08 |
| `C-prof-08` | `ug/your-profile#body-and-age` | Body fat renders as `BODY FAT — MEASURED` (a DEXA scan) or `BODY FAT — ESTIMATE` (bands or a custom value, validated 2–70) | `ProfileEditor.tsx:284–287`, `:320–365`, `:571` | ✓ 2026-08-08 |
| `C-prof-09` | `ug/your-profile#body-and-age` | A target is presented at the conservative end of its range (`macro_target.present: "conservative_end"`) | active v25; doc 10 §5 / doc 17 | ✓ 2026-08-08 |
| `C-prof-10` | `ug/your-profile#body-and-age` (layer 3) | A blank body fat resolves to a representative value for the height-and-weight band (`macro_target.bf_proxy_pct`, **present on v25**), so completing the field moves the target continuously; it falls back to training age only when height or bodyweight is also missing | `macro.ts::effectiveBodyFatPct` → `::muscularDevelopment` (null ⇒ decay fallback) | ✓ 2026-08-08 |
| `C-prof-11` | `ug/your-profile#experience` | `TRAINING SINCE` leads: under 1 year reads beginner, under 4 intermediate, longer advanced. `TRAINING EXPERIENCE` is used when the date is blank | `macro.ts::bucketFor`; `plan-rate.ts::profileToMacroProfile` (`trainingYears`) | ✓ 2026-08-08 |
| `C-prof-12` | `ug/your-profile#experience` | Experience scales the per-muscle weekly set band by `volume.experience_scale` — `0.7` / `1.0` / `1.1` | `engine/volume.ts::muscleVolumeLandmark`; active v25 | ✓ 2026-08-08 |
| `C-prof-13` | `ug/your-profile#experience` | Pacing is not fixed by these fields: with enough finished blocks the envelope loop derives the band position from the user's own record (`progression.envelope.enabled` = `true`, `min_history_mesos` = `2`) | `engine/rules/progression.ts::pacerTargetRate` (`inputs.bandPosition ?? p.band_position`); active v25; [`22b`](./22b-source-map.md) §4.3 | ✓ 2026-08-08 |
| `C-prof-14` | `ug/your-profile#equipment-and-exclusions` | `EQUIPMENT ACCESS` toggles eight equipment types and travels with the profile to the AI connector | `ProfileEditor.tsx:30–40`, `:374–400`; `mcp/tools/read.ts:128` (`get_profile`) | ✓ 2026-08-08 |
| `C-prof-15` | `ug/your-profile#equipment-and-exclusions` | An excluded exercise is filtered out of the exercise pickers **and** out of template fills | `queries/exercises.ts:674`, `:715`; `queries/templates.ts:222–257` | ✓ 2026-08-08 |
| `C-prof-16` | `ug/your-profile#equipment-and-exclusions` | An exclusion carries an optional free-text reason, prompted as `Reason — e.g. LOW BACK` | `ProfileEditor.tsx:596–602` (`maxLength={40}`) | ✓ 2026-08-08 |

### Deliberately absent from ch. 2

| Not claimed | Why |
|---|---|
| That `EQUIPMENT ACCESS` narrows the exercise library | It does not — see `D-06` below. The chapter states what the field **does** reach (the connector) and points at the `EQUIP` filter for browsing, per doc 22 §8.4 |
| The macro target's actual numbers (rates, bands, month counts) | Ch. 14's subject. Ch. 2 stops at *which field moves which way* |
| That the app "falls back to training age" when body fat is blank | The app's own field copy says so, but v21's `bf_proxy_pct` made it a two-step fallback — `D-07` below |

---

## User Guide ch. 3 — The cycle model (`ug/cycle-model`)

Phase 3a. `day_slot` was added to `src/lib/glossary.ts` in the same PR, because
doc 22 §8.1 forbids the manual defining a term in words the app does not use
and [`22c`](./22c-app-inventory.md) §C2 flags ch. 3 as depending on it.

| Claim ID | Manual location | Assertion | Source of truth | Verified |
|---|---|---|---|---|
| `C-cyc-01` | `ug/cycle-model#the-four-layers` | A session is named by coordinate — `W{week}·D{day}` — and the navigator labels weeks `W{n}` / `DL` and days `D{n}` | `DayView.tsx:703`, `:741`, `:780` | ✓ 2026-08-08 |
| `C-cyc-02` | `ug/cycle-model#the-four-layers` | Each week carries its own target RIR from the block's ramp | `microcycles.target_rir`; `engine/rules/rir.ts::rirRamp`; same source as `C-ramp-05` | ✓ 2026-08-08 |
| `C-cyc-03` | `ug/cycle-model#day-slots` | The program chooses an exercise's next weight from that exercise **in the same day slot** in earlier weeks of the block, not from every session of the movement | `queries/slot-prescription.ts::findAdvanceBases`, keyed `{ mesocycleId, weekNumber, dayNumber }` (§9 advance-source lookup) | ✓ 2026-08-08 |
| `C-cyc-04` | `ug/cycle-model#day-slots` | History analysis splits a lift's sessions by `workouts.day_number` so a movement trained twice a week at different loads reads as two clean series rather than one sawtooth | `analysis/comparability.ts::analyzeByDaySlot`; surfaced as `day_slots` in `mcp/tools/coaching.ts:303` | ✓ 2026-08-08 |
| `C-cyc-05` | `ug/cycle-model#finding-your-cycles` | `/cycles` lists macrocycles (each expanding to its blocks), then `STANDALONE — NO MACROCYCLE` | `src/app/(app)/cycles/page.tsx:246–305` | ✓ 2026-08-08 |
| `C-cyc-06` | `ug/cycle-model#finding-your-cycles` | Finished cycles are hidden behind a quiet toggle carrying the count — `SHOW {n} COMPLETED CYCLE(S)` / `HIDE COMPLETED CYCLES` — implemented as `?completed=1` | `cycles/page.tsx:333–352` (N76) | ✓ 2026-08-08 |
| `C-cyc-07` | `ug/cycle-model#finding-your-cycles` | A completed block **inside a running macrocycle** stays visible; the filter applies to macrocycles and standalone blocks, not to a macro's own meso list | `cycles/page.tsx:186–192` (`macros` / `standaloneMesos` filtered; `macro.mesos` rendered whole) | ✓ 2026-08-08 |
| `C-cyc-08` | `ug/cycle-model#finding-your-cycles` | There is one draft at a time — `DRAFT IN PROGRESS` → `CONTINUE EDITING ›`, and starting a new plan replaces it | `cycles/page.tsx:204–222`; `queries/cycles.ts:151` (creating a draft clears any other) | ✓ 2026-08-08 |
| `C-cyc-09` | `ug/cycle-model#one-block-at-a-time` | More than one mesocycle may be `active` at once — one per macrocycle, standalone blocks unconstrained | N79; `queries/cycles.ts::resolveActiveMesocycle` exists precisely because the single-active DB guarantee was lifted | ✓ 2026-08-08 |
| `C-cyc-10` | `ug/cycle-model#one-block-at-a-time` | The block the app follows is the one holding the **most recently logged set**, falling back to newest-created when no candidate has been logged into | `queries/cycles.ts:1206–1237` (`resolveActiveMesocycle`), read by `getCurrentState` | ✓ 2026-08-08 |

---

## Defects this ledger surfaced

| # | Found | What | Disposition |
|---|---|---|---|
| **D-01** | Phase 1, 2026-08-07 | `GLOSSARY.e1rm` ended *"closer to failure reads as stronger"* — the mechanic inverted. e1RM is increasing in effective reps (`reps + rir`), so at the same weight × reps the set with reps **in reserve** implies the greater strength; the doc 21 §2 restamp moving every historical stamp upward is the same fact observed in production | **Fixed** in the Phase-1 PR (`src/lib/glossary.ts`) and pinned by a test in `src/lib/__tests__/glossary.test.ts`. Caught because doc 22 §8.1 forces the manual to render the glossary's own words |
| **D-02** | Phase 1 owner review round 2, 2026-08-07 | `GLOSSARY.e1rm` was labelled `ESTIMATED 1RM (E1RM)` and its body used "RM" without ever spelling it out — a definition leaning on the abbreviation it exists to explain. Two other cards inherited it | **Fixed**: the label is now `ESTIMATED ONE-REP MAX (E1RM)`, the body ties the words to the letters, and `e1rm_confidence` / `est_strength` follow. A test asserts any card mentioning `1RM`/`e1RM` also spells it out. Same §8.1 mechanism as D-01 |
| **D-04** | Phase 2, 2026-08-08 | doc 22 **D3's third promise** — "a chapter read once is a hashed immutable build asset, so it re-opens offline" — does not hold. The reader is server-rendered, so a section's prose is in HTML and the RSC payload, both `NetworkOnly` under R7; it never becomes a `/_next/static/**` asset. Offline manual reading was never going to work as designed | **Recorded, not fixed** — doc 22 §4 withdraws the promise on the owner's own **O1** framing (worth having only because it is free; it is not free). Buying it back would mean shipping prose as client JS or precaching the guide, and the second contradicts D3 guard 2 outright. D3's *condition* is unaffected: all three guards shipped |
| **D-05** | Phase 2, 2026-08-08 | The first pass at D3 guard 2 was written against `@serwist/next`'s **config** entry, not the **webpack-plugin** entry the repo actually uses — so it added a `globIgnores` option that does not exist on that path (caught by `tsc`) to exclude assets that were never precached | **Fixed and written down** (09-changelog 2026-08-08 §6): `additionalPrecacheEntries` already replaces the public-dir glob, `server/**` is plugin-excluded, and a real build emits exactly one manifest entry. The guard that carries the weight now reads the **built** service worker in CI |
| **D-06** | Phase 3a, 2026-08-08 | `profiles.preferred_equipment` (the `EQUIPMENT ACCESS` toggles) has **no consumer in the app**. It is written by the profile editor and onboarding, and read only by the connector's `get_profile` (`mcp/tools/read.ts:128`) — no picker filters on it, no engine path reads it, and it is absent from `src/lib/engine/` entirely. A reader would reasonably expect toggling `barbell` off to stop barbell movements being offered | **Recorded, not fixed** — a behavior change is outside doc 22's scope (§1.2: documentation only). Ch. 2 states the positive truth (it reaches the connector, so a block drafted there can be built around your gym) and points at the Exercises tab's `EQUIP` filter for browsing, per §8.4. Worth a backlog item: either wire it into the pickers or drop the field |
| **D-07** | Phase 3a, 2026-08-08 | The profile's own body-fat copy ends *"Skip it and we fall back to training age."* Since v21 that is one step short: `macro.ts::effectiveBodyFatPct` first substitutes a representative body fat for the profile's BMI leanness band (`macro_target.bf_proxy_pct`, **present on the active v25 row**), and training age is the fallback only when height or bodyweight is missing too. The app's copy under-describes a deliberate v21 improvement — the proxy exists so completing the field moves the target *proportionally* rather than switching models | **Recorded**; ch. 2 documents the two-step fallback in its layer-3 `detail` (`C-prof-10`) and does not repeat the app's line. A one-sentence copy fix to `ProfileEditor.tsx` would close it; not taken here because Phase 3a is a content PR and the sentence is a design surface (hard rule 8) |
| **D-03** | Phase 1 owner review round 2, 2026-08-07 | The `▲` / `■` / `▼` marker glyphs and their names were inline literals in `DayView.tsx`, so the manual could only *describe* them — and any manual drawing of them would drift the first time the app changed one | **Fixed**: extracted to `src/lib/set-markers.ts`, read by the day view and by the manual's `legend` block. A source assertion keeps the day view off inline characters. Not a defect a reader would have hit; a defect the manual would have created |
