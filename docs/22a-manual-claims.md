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
| `C-app-04` | `ug/what-workout-is#the-workout-page` | The Workout page shows the workout you are due to do next, with nothing to open first — `/workout` renders `DayView` itself | `src/app/(app)/workout/page.tsx` (returns `<DayView …/>`); the same premise `lib/version/suppression.ts` is built on | ✓ 2026-08-08 |
| `C-app-05` | `ug/what-workout-is#the-workout-page` | The day screen's four zones, in order: a header carrying week·day, date and the week's effort target; a progress bar; the day's exercises with a prescription line each; a row per set with weight, reps and an RIR box | [`22c`](./22c-app-inventory.md) §B1.2, read against `DayView.tsx:780` (coordinate), `:800` (bar), `:1333` (set columns) | ✓ 2026-08-08 |
| `C-app-06` | `ug/what-workout-is#the-workout-page` | Weight and reps on a set row are editable, so a set can be logged as performed rather than as prescribed | `DayView.tsx` set-row inputs; same path as `C-rep-01` | ✓ 2026-08-09 |
| `C-app-07` | `ug/what-workout-is#the-workout-page` | `COMPLETE WORKOUT` closes the session and opens the Workout Complete sheet, which asks exactly three session questions: `Overall fatigue`, `Effort`, `Performance` | `DayView.tsx:478` (bottom action), `:3124–3131` (the three sliders) | ✓ 2026-08-09 |
| `C-app-08` | `ug/what-workout-is#the-workout-page` | With a block running but no open workout the page shows the latest **completed** meso's summary and a link to its stats; with no cycles at all it offers `SET UP CYCLES` | `workout/page.tsx` (resting-state branch, `v_meso_summary` where `status = completed`; `!state.mesocycle` branch) | ✓ 2026-08-08 |
| `C-app-09` | `ug/what-workout-is#the-five-tabs` | The More tab carries the version you are running | `src/app/(app)/more/page.tsx:167–180` (`displayVersion()`); doc 23 §8 | ✓ 2026-08-08 |

### Deliberately absent from ch. 1

Both cut at owner review round 3 (doc 22 §8.4b rule 1 — a chapter's depth is set
by its place in the reading order), not because they were wrong.

| Not claimed | Why, and who owns it |
|---|---|
| The Workout tab's **session-resume pointer** — that it returns to the last day viewed rather than to today | Real (`sessionStorage.lastWorkoutId`, `BottomNav.tsx:33–40`, gated to the active meso at `DayView.tsx:281`), but secondary, and it led a section that had not yet said what the Workout page shows. Worth recording precisely because the owner's read of it — *"only for a few minutes"* — has **no timer in the code**: the pointer is session-scoped, so it dies when the tab session does, which is why a relaunched PWA lands on the current workout. **Ch. 5** (Phase 3c) |
| The **version history** page and the **What's New sheet** — the whole `#what-changed` section, deleted | Not a primary function, so not chapter 1's. [`22c`](./22c-app-inventory.md) §B5.1a and §B6a already assign both to **ch. 19** (Phase 3h); ch. 1 keeps one clause in the tab table (`C-app-09`). The suppression rules (`lib/version/suppression.ts`) and the accumulate-then-dismiss behavior go with it |

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
| `C-cyc-01a` | `ug/cycle-model#the-four-layers` (figure) | `cycle-nesting.svg` draws the containment only — profile → macrocycle ⊃ mesocycle ⊃ microcycle ⊃ workout, with the profile **outside** the stack as an input. The duration hints are each layer's shape (`MONTHS` / `WEEKS` / `ONE WEEK` / `ONE SESSION`), never a bound, so nothing tunable is baked into the asset | `public/manual/cycle-nesting.svg`; containment from `macrocycles` → `mesocycles` → `microcycles` → `workouts` (doc 03); the profile-as-input from `queries/plan-rate.ts::profileToMacroProfile` → `engine/macro.ts`. Same rule as `C-ramp-06` | ✓ 2026-08-09 |
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

## User Guide ch. 4 — Planning a mesocycle (`ug/planning-a-mesocycle`)

Phase 3b. Verified against the repo at `88d2aaf`. The planner board was reworked
by N78 the day before doc 22 was written, so every row below was read off
`PlannerBoard.tsx` rather than off doc 09.

| Claim ID | Manual location | Assertion | Source of truth | Verified |
|---|---|---|---|---|
| `C-plan-01` | `ug/planning-a-mesocycle#starting-a-block` | `plan a meso` offers **three working routes** — `Copy a mesocycle`, `Start with a template`, `From scratch` — and each creates a draft and lands on the planner board | `cycles/plan/page.tsx:17–43` (the fourth row has `href: null` and no `scratch` flag — see `D-09`); `actions.ts:193`, `:201`, `:218` | ✓ 2026-08-10 |
| `C-plan-01a` | `ug/planning-a-mesocycle#starting-a-block` | A connected AI can draft a block for you: `create_mesocycle` writes it from a template or day by day and it lands **`planned`** — a draft in Cycles, not a live block. Starting it is a separate step, and the tool that does it requires `confirm="activate"` and is told to prefer letting the athlete activate in-app | `mcp/tools/write.ts:210–260` (`create_mesocycle`, *"The meso lands PLANNED (an unapproved draft)"*); `mcp/tools/authoring.ts:358–405` (`activate_mesocycle`); [`22d`](./22d-connector-inventory.md) §3.4 | ✓ 2026-08-11 |
| `C-plan-01b` | `ug/planning-a-mesocycle#starting-a-block` | The connector is reached from `More` → `AI connector` | `src/app/(app)/more/page.tsx:127–130` | ✓ 2026-08-11 |
| `C-plan-02` | `ug/planning-a-mesocycle#starting-a-block` | Copying carries the structure **and** the length / deload flag / RIR ramp forward; loads are **not** copied — they reseed from the user's best when the block starts | `actions.ts:218–237` (`createDraftMeso` from the source's `weeks, includes_deload, rir_start, rir_end, rir_schedule` + `copyMesoStructure`); `queries/cycles.ts:507` comment; `generation.ts::startMeso` reseeds from `v_exercise_prs` + anchors | ✓ 2026-08-10 |
| `C-plan-03` | `ug/planning-a-mesocycle#starting-a-block` | Starting from a template fills the board and drops anything on the user's exclusion list | `actions.ts:201–216` → `queries/templates.ts::applyTemplateToMeso` (222–257); same exclusion path as `C-prof-15` | ✓ 2026-08-10 |
| `C-plan-04` | `ug/planning-a-mesocycle#starting-a-block` | One draft at a time: `DRAFT IN PROGRESS` → `CONTINUE EDITING ›`, and *"Starting a new plan below replaces this draft."* is on the page | `cycles/plan/page.tsx:55–84`; `queries/cycles.ts:151` (`createDraftMeso` clears any other). Same rule ch. 3 states from `/cycles` (`C-cyc-08`) | ✓ 2026-08-10 |
| `C-plan-05` | `ug/planning-a-mesocycle#the-planner-board` | The board is **groups-first**: a day holds muscle-group blocks, each block holds a fixed number of exercise slots, and an unfilled slot renders dashed with `— pick exercise` / `OPEN SLOT` | `PlannerBoard.tsx:1020–1046` (open-slot rows), `:1790–1935` (`DaySetupSheet` — `MUSCLE GROUPS — EXERCISES PER GROUP`) | ✓ 2026-08-10 |
| `C-plan-05a` | `ug/planning-a-mesocycle#the-planner-board` (figure) | `planner-structure.svg` draws the containment only — day → muscle-group block → exercise slots, with the open slot dashed as the board draws it. `3 SETS` is one plausible starting count, not a default the engine owns, and the split is an example: nothing tunable is baked into the asset | `public/manual/planner-structure.svg`; structure from `PlannerBoard.tsx` as `C-plan-05`; dashed = planned/empty is hard rule 7. Same rule as `C-ramp-06` / `C-cyc-01a` | ✓ 2026-08-10 |
| `C-plan-06` | `ug/planning-a-mesocycle#the-planner-board` | Days are tabs with `+` to add one; a filled exercise row moves anywhere in the day with `▲` / `▼`, **across muscle groups**, because the day board is one flat ordered list | `PlannerBoard.tsx:882–909` (tab strip + `+`), `:940–1018` (`flatDayFills`, `moveDayExercise`) | ✓ 2026-08-10 |
| `C-plan-07` | `ug/planning-a-mesocycle#the-planner-board` | `EDIT DAY` is where the weekday, the label, muscle-group order, exercises-per-group and `Remove day` live | `PlannerBoard.tsx:1790–1958` (`DaySetupSheet`) | ✓ 2026-08-10 |
| `C-plan-08` | `ug/planning-a-mesocycle#the-exercise-sheet` | One tap on an exercise row opens a single sheet carrying all four of `STARTING SETS`, `TARGET RIR`, `Replace exercise`, `Remove from day` | `PlannerBoard.tsx:1607–1765` (`ExerciseSheet`, N78) | ✓ 2026-08-10 |
| `C-plan-09` | `ug/planning-a-mesocycle#the-exercise-sheet` | `STARTING SETS` is **week 1 only** — *"the engine takes set progression from there"* | `PlannerBoard.tsx:1648–1674`; `meso_exercises.initial_sets` is read by the week-1 seed, and later weeks come from `rules/feedback.ts::modulateFromFeedback` | ✓ 2026-08-10 |
| `C-plan-10` | `ug/planning-a-mesocycle#the-exercise-sheet` | The board's `TARGET RIR` is **block-wide** (it has no week axis), the meso's own ramp is shown beside it as the default being departed from, and a slot already carrying per-week values reads `RIR BY WEEK` rather than being flattened | `PlannerBoard.tsx:1596–1605` (the why), `:1676–1740`, `:196` (`fillRirLabel`); N78. Same claim ch. 6 makes from the other side (`C-perex-04`) | ✓ 2026-08-10 |
| `C-plan-11` | `ug/planning-a-mesocycle#the-volume-check` | `WEEKLY SETS PER MUSCLE` re-totals live as the board is edited, and flags `UNDER MEV {n}` / `OVER MRV {n}` per muscle against an experience-scaled band. **MEV and MRV are defined in the section**, through the `volume_landmarks` card the board's own `InfoDot` renders (doc 22 §8.4c rule 2) | `PlannerBoard.tsx:1072–1125`; bands from `engine/volume.ts::muscleVolumeLandmark` (`volume.experience_scale`, active v25); the definition is `GLOSSARY.volume_landmarks`, rendered not restated (§8.1) | ✓ 2026-08-11 |
| `C-plan-12` | `ug/planning-a-mesocycle#the-volume-check` | The preview counts sets the same way the stats do — a full set to the primary muscle, a half to each secondary — so plan and result are comparable | `engine/volume.ts::fractionalSetCount` / `volumeCountingWeights`, shared with `v_meso_week_muscle_sets` (CLAUDE.md conventions) | ✓ 2026-08-10 |
| `C-plan-13` | `ug/planning-a-mesocycle#naming-and-starting` | `CREATE MESOCYCLE` needs at least one exercise, and asks for a name and a length of 4–8 weeks | `PlannerBoard.tsx:1141–1157` (disabled + *"Add at least one exercise to finish."*), `:1437–1455` (weeks chips); `actions.ts` `finalizeSchema` (3–8, the sheet offers 4–8) | ✓ 2026-08-10 |
| `C-plan-14` | `ug/planning-a-mesocycle#naming-and-starting` | The create sheet's collapsed line summarises the block's RIR plan with an `EDIT` disclosure carrying `START RIR`, `END RIR`, the per-week editor, and `Final week is a deload` | `PlannerBoard.tsx:1466–1560` (`FinalizeSheet`); `RirScheduleEditor.tsx` | ✓ 2026-08-10 |
| `C-plan-15` | `ug/planning-a-mesocycle#naming-and-starting` | The deload week's target RIR is the engine's, not the planner's — the schedule editor says `DELOAD — RIR SET BY THE ENGINE` and `rirRamp` appends it from `deload.target_rir` | `RirScheduleEditor.tsx:110–113`; `engine/rules/rir.ts:58–63`. Same parameter as `C-ramp-04`. **The create sheet's own summary line contradicts this — see `D-08`** | ✓ 2026-08-10 |
| `C-plan-16` | `ug/planning-a-mesocycle#naming-and-starting` | `START MESOCYCLE` is what makes a planned block live: it writes every week's target RIR, seeds week 1's workouts, chooses opening loads from the user's bests and anchors, and redirects to `/workout` | `generation.ts::startMeso` (423–…); `actions.ts:782–796`; `StartMesoForm.tsx:33` (`GENERATING W1`) | ✓ 2026-08-10 |
| `C-plan-17` | `ug/planning-a-mesocycle#naming-and-starting` | Inside a macrocycle, activation is exclusive and sequential — an unfinished earlier block blocks the start, and the button renders disabled carrying the reason rather than failing on tap | `generation.ts::mesoActivationBlock` (354–378), re-checked in `startMeso`; `cycles/meso/[mesoId]/page.tsx:263–278`; `StartMesoForm.tsx:30–39` | ✓ 2026-08-10 |
| `C-plan-18` | `ug/planning-a-mesocycle#editing-a-running-block` | `Edit plan` reopens the board for a `planned` **or** in-progress block (N78); a `completed` / `abandoned` one reads `FINISHED` and the route redirects away | `MesoHeader.tsx:368–371`; `cycles/meso/[mesoId]/plan/page.tsx:57–60` | ✓ 2026-08-10 |
| `C-plan-19` | `ug/planning-a-mesocycle#editing-a-running-block` | Edits to a non-draft block are **staged**: the bar reads `NO CHANGES` until something changes, `CANCEL` discards behind a confirm, and nothing is written until `SAVE CHANGES` | `PlannerBoard.tsx:238–241` (the contract), `:1169–1196` (the bar), `:1338–1352` (the discard confirm) | ✓ 2026-08-10 |
| `C-plan-20` | `ug/planning-a-mesocycle#editing-a-running-block` | A save reaches only not-yet-started days; completed and in-progress workouts and every logged set are untouched, and the confirm sheet says so (`LOGGED HISTORY IS PROTECTED`) | `PlannerBoard.tsx:1288–1310`; `queries/cycles.ts::saveMesoPlan` (hard rule 5 — no deletes of logged history) | ✓ 2026-08-10 |
| `C-plan-21` | `ug/planning-a-mesocycle#editing-a-running-block` | **The board is not the only editing surface.** The day view's exercise `⋮` menu carries `Move up` / `Move down`, `Replace exercise` and `Effort target`, and the workout menu carries `Add exercise` — all writing the same plan | `log/[workoutId]/DayView.tsx:1383–1470` (the exercise menu), `:905–916` (`Add exercise`); `log/actions.ts:750–804` | ✓ 2026-08-11 |
| `C-plan-22` | `ug/planning-a-mesocycle#editing-a-running-block` | A swap or an add offers `Repeat this change on this day in future weeks`, which reaches the **same day number in later, not-yet-complete weeks of the same mesocycle**. A **reorder propagates unconditionally** — there is no checkbox on it | `DayView.tsx:2516–2531` (replace), `:2770–2785` (add); `log/actions.ts:779–781` (`moveExercise` propagates with no flag); `queries/logging.ts::getFutureSiblingWorkoutIds` (`day_number` + later micros + `status in (planned, in_progress)`) | ✓ 2026-08-11 |

### Deliberately absent from ch. 4

| Not claimed | Why |
|---|---|
| The **meso builder** path | It is rendered disabled with ` (soon)` — `D-09`. doc 22 §8.4 forbids documenting an absence, so the chapter carries the three routes that work |
| ~~What MEV and MRV mean~~ | **Reversed at owner review round 4 (2026-08-11).** Ch. 4 now renders the `volume_landmarks` card where the reader meets the terms; ch. 12 keeps the depth (how the band is derived, how much to trust it). doc 22 §8.4c rule 2 |
| How volume is counted, in full | Ch. 12's. Ch. 4 states the half-set rule because its own preview shows halves, and stops there |
| How to *use* the connector — what to ask it, what it can do | Ch. 18 and the AI Manual. Ch. 4 names the route and hands off (§8.4c rule 1); the typed cross-link is owed once those sections exist |
| The RIR ramp's shape, values and interpolation | Ch. 6 owns it (`C-ramp-01`…`05`); ch. 4 stops at where it is set |
| `Place into macrocycle`, `Duplicate mesocycle`, `Delete mesocycle` | Macrocycle placement is ch. 14; the rest are ch. 19's data surface |
| `SAVE AS TEMPLATE` | Ch. 15 owns templates end to end (`C-lib-15`) |

---

## User Guide ch. 15 — Exercises & templates (`ug/exercises-and-templates`)

Phase 3b. Verified against the repo at `88d2aaf`. `load_step` was added to
`src/lib/glossary.ts` in the same PR — [`22c`](./22c-app-inventory.md) §C2
recommends it and doc 22 §8.1 forbids the manual defining it alone.

| Claim ID | Manual location | Assertion | Source of truth | Verified |
|---|---|---|---|---|
| `C-lib-01` | `ug/exercises-and-templates#finding-an-exercise` | The library filter is two axes, `MUSCLE` × `EQUIP`, ANDed, on top of a name search | `exercises/ExercisesBrowser.tsx:38–71` | ✓ 2026-08-10 |
| `C-lib-02` | `ug/exercises-and-templates#finding-an-exercise` | The equipment axis offers only what survives the current search, so a filter combination can never empty the list | `ExercisesBrowser.tsx:44–47` (`equipTypes` derived from `searched`) | ✓ 2026-08-10 |
| `C-lib-03` | `ug/exercises-and-templates#finding-an-exercise` | A row carries its primary muscle, equipment, last-performed date and a `CUSTOM` mark on the user's own | `ExercisesBrowser.tsx:107–133` | ✓ 2026-08-10 |
| `C-lib-04` | `ug/exercises-and-templates#what-an-exercise-remembers` | The exercise page has two tabs, `OVERVIEW` and `HISTORY` | `exercises/[exerciseId]/page.tsx:46–47`, `SegmentedTabs` | ✓ 2026-08-10 |
| `C-lib-05` | `ug/exercises-and-templates#what-an-exercise-remembers` | `OVERVIEW` shows `LAST PERFORMED`, `ALL-TIME BESTS` (`WEIGHT PR · LB`, `EST. 1RM`, `VOLUME PR`, `BEST SESSION VOL`), `TIMES TRAINED`, `TOTAL VOLUME · LB` and `FIRST LOGGED` | `exercises/[exerciseId]/page.tsx:187–290`, from `v_exercise_overview` | ✓ 2026-08-10 |
| `C-lib-06` | `ug/exercises-and-templates#what-an-exercise-remembers` | `HISTORY` groups sessions under the block they belong to, newest first, with `LOAD OLDER` paging | `components/ExerciseHistoryList.tsx:99–107`, `:218–228` | ✓ 2026-08-10 |
| `C-lib-07` | `ug/exercises-and-templates#what-an-exercise-remembers` | The right-hand history column toggles between the logged load and the strength read — `E1RM`, or `EFF LOAD` on a bodyweight lift | `ExerciseHistoryList.tsx:92–98`, `:133–134` (N77: no `EFF REPS`, no `~`) | ✓ 2026-08-10 |
| `C-lib-08` | `ug/exercises-and-templates#what-an-exercise-remembers` | Session rows carry `DELOAD` and `BACKED OFF` tags; `BACKED OFF` marks a slot run easier than its week asked (doc 21 §6.2, live) | `ExerciseHistoryList.tsx:165–185` | ✓ 2026-08-10 |
| `C-lib-09` | `ug/exercises-and-templates#what-an-exercise-remembers` | A session note stays with its session in the history; a **pinned** note is exercise-wide and shows at the top of the page on every visit | `exercises/[exerciseId]/ExercisePinnedNote.tsx:8–11`; `exercise_notes.is_pinned` read in `page.tsx:100–107` | ✓ 2026-08-10 |
| `C-lib-10` | `ug/exercises-and-templates#the-load-step` | The load step is reached from the exercise page's `⋮` → `Load step`, and it is *the weight the engine adds when you hit a prescription*, overriding the equipment default for that exercise only | `exercises/[exerciseId]/LoadStepSheet.tsx:26–37`, `:93–101`; `ExerciseHeader.tsx:16–24` (N22 moved it out of a faint `⋯`) | ✓ 2026-08-10 |
| `C-lib-11` | `ug/exercises-and-templates#the-load-step` | Steps are indexed off **the last weight entered**, not off round numbers — 88 lb with a 10 lb step goes to 98 or 78 | `LoadStepSheet.tsx:96–101` (the sheet's own copy); N67; the engine's `rounding.*` / `increment.*` on active v25 | ✓ 2026-08-10 |
| `C-lib-12` | `ug/exercises-and-templates#the-load-step` | Choices are preset jumps, a `CUSTOM` value, or `USE DEFAULT` to clear the override | `LoadStepSheet.tsx:9`, `:103–177` | ✓ 2026-08-10 |
| `C-lib-13` | `ug/exercises-and-templates#the-load-step` | Changing it re-stamps the exercise's planned prescriptions on next view and never touches logged history | `LoadStepSheet.tsx:30–33`; doc 14 phase 3 (the read-path freshness reconcile) | ✓ 2026-08-10 |
| `C-lib-14` | `ug/exercises-and-templates#your-own-exercises` | A custom exercise is created from `+ NEW` → `Blank exercise` with name, equipment, one primary muscle and up to four secondaries, an optional load step, description and private notes | `exercises/NewExerciseButton.tsx:30–45`; `exercises/new/NewExerciseForm.tsx:56–59`, `:96–258` | ✓ 2026-08-10 |
| `C-lib-15` | `ug/exercises-and-templates#your-own-exercises` | The primary/secondary split is what decides how the exercise counts toward each muscle's weekly volume | `exercise_muscle_groups.role` → `engine/volume.ts::fractionalSetCount`; same counting rule as `C-plan-12` | ✓ 2026-08-10 |
| `C-lib-16` | `ug/exercises-and-templates#your-own-exercises` | The three bodyweight equipment kinds, verbatim: `bodyweight only` — *"The load is your bodyweight — push-up, air squat."*; `bodyweight loadable` — *"Entered weight is ADDED to bodyweight — weighted pull-up."*; `machine assistance` — *"Entered weight is assistance REMOVED — assisted dip."* | `NewExerciseForm.tsx:22–26` (`LOAD_HINTS`, R12); `engine/rules/bodyweight.ts::effectiveLoad` | ✓ 2026-08-10 |
| `C-lib-17` | `ug/exercises-and-templates#your-own-exercises` | A custom exercise is visible only to its owner until shared | `NewExerciseForm.tsx:269–272`; `exercises.user_id` RLS | ✓ 2026-08-10 |
| `C-lib-18` | `ug/exercises-and-templates#your-own-exercises` | Delete is refused, with the reason, when the exercise carries logged sets or is still referenced by a plan or generated workout — and only the owner's own custom exercises are deletable at all | `exercises/actions.ts:100–117` (hard rule 5) | ✓ 2026-08-10 |
| `C-lib-19` | `ug/exercises-and-templates#templates` | A template is days → muscle groups → exercises with a default set count, and no history | `queries/templates.ts::getTemplateDetail`; `templates/[templateId]/page.tsx:59–90` | ✓ 2026-08-10 |
| `C-lib-20` | `ug/exercises-and-templates#templates` | The Templates tab filters on days per week, split, and an intended-trainee axis, with `YOURS` on the user's own | `templates/TemplateFilterPanel.tsx`; `templates/page.tsx:54–81` | ✓ 2026-08-10 |
| `C-lib-21` | `ug/exercises-and-templates#templates` | `START A MESO FROM THIS` opens the planner board prefilled, and excluded movements never carry over | `templates/[templateId]/page.tsx:92–104`; `actions.ts::startTemplateDraftAction` → `applyTemplateToMeso`; same exclusion path as `C-plan-03` | ✓ 2026-08-10 |
| `C-lib-22` | `ug/exercises-and-templates#templates` | A template is saved **out of a plan** — `SAVE AS TEMPLATE` on the planner board, which is also where `+ NEW` → `Blank template` sends you | `PlannerBoard.tsx:1129–1140`; `actions.ts::saveMesoAsTemplateAction`; `templates/NewTemplateButton.tsx:30–45`. See `D-10` | ✓ 2026-08-10 |
| `C-lib-23` | `ug/exercises-and-templates#sharing-by-code` | Exercises, templates and mesocycles you own can each mint a share code, and the alphabet excludes the characters people mistype (`A–Z` minus `O`/`I`, `2–9`) | `components/ShareRow.tsx`; `queries/sharing.ts:156` (the alphabet note), `:275` (`/^[A-Z2-9]{8}$/`) | ✓ 2026-08-10 |
| `C-lib-24` | `ug/exercises-and-templates#sharing-by-code` | Redemption is **copy-on-accept** — the grantee gets their own independent copy, and it is good for one redemption | `queries/sharing.ts:254–…` (`acceptShareCode`, `accepted_at`); `createShareCode` re-surfaces the one open code until it is used | ✓ 2026-08-10 |
| `C-lib-25` | `ug/exercises-and-templates#sharing-by-code` | A shared **mesocycle** hands over a snapshot captured when the code was minted, refreshed if the owner shares again before it is used; logged history never travels | `queries/sharing.ts:169–243` (`buildMesoSnapshot`, N65) | ✓ 2026-08-10 |
| `C-lib-26` | `ug/exercises-and-templates#sharing-by-code` | Codes are entered from the `+ NEW` trays on Exercises and Templates and from `Create new` on Cycles, under `OR ADD FROM A CODE`, and any kind of code works from any of them | `exercises/NewExerciseButton.tsx:8–13`, `:47–50`; `templates/NewTemplateButton.tsx:47–50`; `components/RedeemForm.tsx` | ✓ 2026-08-10 |

### Deliberately absent from ch. 15

| Not claimed | Why |
|---|---|
| That a saved template can be edited in place | It cannot (N46, open) — `D-10`. §8.4 takes the positive rule instead: adjust the block, then save it as a template |
| What `EST. 1RM`, `VOLUME PR` and `BEST SESSION VOL` are worked out from | Ch. 10 and ch. 13. Ch. 15 names what the page shows and stops |
| What `BACKED OFF` does to a strength read | Ch. 8's subject (doc 21 §6.2). Ch. 15 says what the tag marks and links to the lever in ch. 6 |
| The exclusion list itself | Ch. 2 owns it (`C-prof-15`/`16`); ch. 15 states only that exclusions are honoured on the way into a plan |

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
| **D-08** | Phase 3b, 2026-08-10 | The create-mesocycle sheet's collapsed summary line reads `· W{n} DELOAD AT 4 RIR` — a hardcoded literal (`PlannerBoard.tsx:1473`). The deload week's target RIR is `deload.target_rir`, which is **6** on the active v25 row, and every other surface reads it: `rirRamp` appends the week at the parameter, the day header renders it, and `RirScheduleEditor` deliberately declines to name a number at all (`W{n} DELOAD — RIR SET BY THE ENGINE`). So the one place a user sets the deload up is the one place that states it wrongly | **Recorded, not fixed** — doc 22 §1.2 makes Phase 3 documentation-only, and the line is a design surface (hard rule 8). Ch. 4 states the truth positively — the deload week's effort target is the program's to set — and quotes the schedule editor's line rather than the create sheet's (`C-plan-15`). A one-token fix (read the active params into the sheet, or drop the number as the editor does) closes it |
| **D-09** | Phase 3b, 2026-08-10 | [`22c`](./22c-app-inventory.md) §B2.6 tabulates **four** ways to start a block from `/cycles/plan`'s copy. `Meso builder` is rendered with `href: null` and no `scratch` flag, so it paints at 45% ink and appends `" (soon)"` (`cycles/plan/page.tsx:31–35`, `:103`) — three routes work. An audit transcribing copy without checking the row's state is exactly the failure doc 22 §2 warns about, one level down | **Recorded**; ch. 4 documents the three that work and stays quiet about the fourth per §8.4 (no absence framing). 22c §B2.6 should gain the state at the Phase-4 re-validation. Not a code defect — the row is deliberately a placeholder |
| **D-10** | Phase 3b, 2026-08-10 | N46 (open): a saved custom template has **no edit path** — `/templates/[templateId]` offers start-from and share only, and `saveMesoAsTemplate` always inserts. Adjusting a saved split means starting a block from it, changing the board, and saving a second template | **Recorded, not fixed** (N46 is the backlog item; a template editor is a screen, so hard rule 8 applies). Ch. 15 states the positive rule — a template is saved *out of* a plan, so adjust and save again — rather than naming the gap, per §8.4 |
