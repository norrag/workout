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

## User Guide ch. 5 — Training a session (`ug/training-a-session`)

Phase 3c. Verified against the repo at `a2d2d62`. Read off
`log/[workoutId]/DayView.tsx`, `day-rules.ts` and `log/actions.ts` rather than
off doc 09: Batch 32 moved two of this screen's surfaces (N75, N77) the day
before doc 22 was written, and N68 changed what a log tap *does*.

| Claim ID | Manual location | Assertion | Source of truth | Verified |
|---|---|---|---|---|
| `C-day-01` | `ug/training-a-session#the-day-screen` | The Workout tab renders the day screen itself, headed by the coordinate `W{n}·D{n}` at the largest type on the page, with the date beside it and the week's effort target under it in the accent | `workout/page.tsx` (returns `<DayView …/>`, same premise as `C-app-04`); `DayView.tsx:778–782` (coordinate), `:783–790` (date + `rirLabel`, defined `:645`, rendered in the accent at `:786`) | ✓ 2026-08-11 |
| `C-day-02` | `ug/training-a-session#the-day-screen` | The progress rule under the header fills to `loggedSets / totalSets`, and **skipped sets leave the denominator** — a skipped slot is not an unfinished one | `DayView.tsx:644` (`pct`), `:797–803` (the rule); `day-rules.ts::daySetTotals` (74–90 — `status !== "skipped"`, then `planned − skipped`) | ✓ 2026-08-11 |
| `C-day-03` | `ug/training-a-session#the-day-screen` | Each exercise card carries four icon buttons above the name — prescription strip, note, history, `…` menu — then the movement's name, its equipment, and a row per planned set | `DayView.tsx:1156–1163` (the `NN — MUSCLE GROUP` eyebrow), `:1166–1222` (the four buttons), `:1224–1243` (name + equipment) | ✓ 2026-08-11 |
| `C-day-04` | `ug/training-a-session#the-day-screen` | The prescription strip's first line is **underlined and tappable**, and opens Prescription details — the row N75 removed from the `…` menu | `DayView.tsx:1244–1268` (the ask-line button → `onAudit`), `:1393–1396` (the N75 note where the menu row used to be) | ✓ 2026-08-11 |
| `C-day-05` | `ug/training-a-session#the-day-screen` | The Workout tab returns to the day last viewed rather than to the current one, and the pointer is session-scoped — closing the app drops it | `DayView.tsx:281–286` (stamped only while the meso is `active`); `BottomNav.tsx:33–40` (`sessionStorage.lastWorkoutId`, re-read per navigation). The owner's *"only for a few minutes"* read has **no timer** — see ch. 1's absent-claims note | ✓ 2026-08-11 |
| `C-day-06` | `ug/training-a-session#the-day-screen` | Opening the app regenerates any missing day and refreshes any not-yet-started prescription whose inputs have changed, leaving logged sets untouched | `workout/page.tsx:30–48` (`ensureFreshPrescriptions`, the doc 14 dependency fingerprint); `queries/regeneration.ts` | ✓ 2026-08-11 |
| `C-nav-01` | `ug/training-a-session#moving-between-days` | The logotype's chevron opens a week strip (`W{n}`, the deload as `DL`) over a chip per training day of the selected week; the panel's open state persists across day navigation | `DayView.tsx:632–645` (`dayNavOpen` in `sessionStorage`), `:700–725` (week buttons + `DL`), `:735–770` (day chips) | ✓ 2026-08-11 |
| `C-nav-02` | `ug/training-a-session#moving-between-days` | A completed day chip carries `✓`; an accent dot marks the block's current week **and** its current day, and the day being read is filled solid | `DayView.tsx:718–723` (week dot on `currentWeekNumber`), `:745–756` (chip `✓` + `status === "current"` dot), `:739–744` (`viewing`) | ✓ 2026-08-11 |
| `C-nav-03` | `ug/training-a-session#moving-between-days` | A day in a week that has not been generated opens the read-only planned view — exercises and set counts, no weights | `DayView.tsx:757–762` (chip href → `/cycles/meso/{id}/planned/{week}/{day}`); `cycles/meso/[mesoId]/planned/[week]/[day]/page.tsx` | ✓ 2026-08-11 |
| `C-nav-04` | `ug/training-a-session#moving-between-days` · `#finishing-the-session` | A completed session renders its rows as static values and its menus read `Logged — session locked` / `Session locked` | `DayView.tsx:1884–1890` (`staticCells`, N50), `:2244`, `:2267` | ✓ 2026-08-11 |
| `C-log-01` | `ug/training-a-session#logging-a-set` | A set row is `LB` · `REPS` · `RIR` · `LOG`, the first three pre-filled from the prescription, and the `LOG` box records the set and advances the active row | `DayView.tsx:1327–1336` (column heads), `:1654–1699` (initial values), `:2110–2160` (the box). RIR pre-fill is `day-rules.ts::captureRirDefault` — same rule as `C-rep-01` | ✓ 2026-08-11 |
| `C-log-02` | `ug/training-a-session#logging-a-set` | A log tap is **queued**: it is recorded locally and dispatched in the background, so the row advances without waiting on the network | `DayView.tsx:1836–1861` (`queue.enqueue({kind:"log"…})`); `lib/logging/queue.ts`; `components/logging/SetLogQueueProvider.tsx` (N68, hard rule 9) | ✓ 2026-08-11 |
| `C-log-03` | `ug/training-a-session#logging-a-set` | The queue is silent unless it has something to say — `{n} SETS WAITING FOR A CONNECTION`, or `{n} SETS DIDN'T SAVE` with `TRY AGAIN` | `components/logging/SetLogQueueStatus.tsx:14–42` | ✓ 2026-08-11 |
| `C-log-04` | `ug/training-a-session#logging-a-set` | Editing a logged row's weight, reps or RIR saves on blur (an amend against that set's id); tapping a ticked box unlogs the set | `DayView.tsx:1863–1873` (`kind:"amend"`), `:2137–2152` (unlog, foreground because it addresses a server id) | ✓ 2026-08-11 |
| `C-log-05` | `ug/training-a-session#logging-a-set` | Editing an unlogged set's weight re-estimates that row's reps to what the weight is worth at the week's target RIR, from the strength anchor | `DayView.tsx:1645–1652` (`predictReps` → `engine/predict.ts::predictRepsAtWeight`), `:2035–2046` (the blur path) | ✓ 2026-08-11 |
| `C-log-06` | `ug/training-a-session#logging-a-set` | An edited weight persists to that set alone; `Match weight across sets` (`More` → `Account & data`) carries it onto the exercise's other unlogged sets | `more/account/page.tsx:31–39`; `log/actions.ts:265–295` (`updateSetWeightAction`), `:174–183` (the same fan-out after a log) | ✓ 2026-08-11 |
| `C-adj-01` | `ug/training-a-session#adjusting-as-you-go` | The set `⋮` carries `Add set below`, `Skip set` / `Unskip set` and `Delete set`; the exercise `…` carries `Add set`, `Skip remaining sets`, `Unskip all sets`, `Reset to prescription` | `DayView.tsx:2176–2262` (set menu), `:1474–1533` (exercise menu) | ✓ 2026-08-11 |
| `C-adj-02` | `ug/training-a-session#adjusting-as-you-go` | Skipping greys the row out rather than deleting it, is reversible, and removes the set from the day's progress count | `DayView.tsx:2196–2210` (`toggleSkipSetAction`), `:1802–1810` (the struck-through cell); denominator via `day-rules.ts::daySetTotals` (`C-day-02`) | ✓ 2026-08-11 |
| `C-adj-03` | `ug/training-a-session#adjusting-as-you-go` | `Reset to prescription` drops the per-set weight overrides so the program's numbers show again on the **unlogged** sets; it appears only once an override exists | `DayView.tsx:1508–1522` (rendered when `set_weights` is non-empty); `log/actions.ts:302–311` → `queries/logging.ts::clearPlannedSetWeights` (884–893) | ✓ 2026-08-11 |
| `C-adj-04` | `ug/training-a-session#notes` | One note sheet writes both kinds: unpinned is *"Saved with just this session"*, and `Pin to this exercise` makes it *"Stays on this exercise in every workout"*, shown at the top of the card as `PINNED — …` | `DayView.tsx:2386–2400` (the checkbox + both lines), `:1294–1300` (the pinned line). Same two kinds ch. 15 states from the exercise page (`C-lib-09`) | ✓ 2026-08-11 |
| `C-adj-05` | `ug/training-a-session#notes` | **Both kinds of note are readable by a connected AI.** Pinned notes come back from `get_exercise_notes` (all of them, library-wide) and ride along with `get_exercise_history`; a per-session note is `session_note` on each history entry; the whole-session note is `notes` on `get_recent_sessions` | `mcp/tools/read.ts:1103–1134` (`get_exercise_notes`), `:799` (`session_note` per session), `:1308` (*"Pinned note = durable context; session notes = day-to-day observations"*); `mcp/tools/coaching.ts:230–245` (`get_recent_sessions` → `notes`) | ✓ 2026-08-11 |
| `C-adj-06` | `ug/training-a-session#notes` | Notes are **context, not an engine input** — no note reaches a prescription. `exerciseFeedbackInputSchema` is `{jointPain, pump, workload}` and nothing in `src/lib/engine/` reads a note | `engine/types.ts:27–31`; the connector is told to weigh them qualitatively instead (`mcp/tools/coaching.ts:387`, `:720` — exercise affinity flags "flagging notes") | ✓ 2026-08-11 |
| `C-adj-07` | `ug/training-a-session#notes` | A pinned note is durable, cross-workout context by design — that is the app's own description of it, and what an assistant is told it is for | `mcp/tools/read.ts:1114`; `mcp/tools/write.ts:711–724` (`log_note`, *"durable PINNED note … grip, setup, or a nagging caveat"*) | ✓ 2026-08-11 |
| `C-fb-01` | `ug/training-a-session#how-it-went` | The feedback sheet is offered on the **last planned set** of the first exercise of a muscle group and of the exercise that closes it — never on the ones in between | `DayView.tsx:404–414` (`handleLogged`), `:352–360` (`isFirstOfGroup` / `isLastOfGroup`) | ✓ 2026-08-11 |
| `C-fb-02` | `ug/training-a-session#how-it-went` | The first-of-group prompt asks how sore that muscle was **from the last session that trained it** and for how many days (0–5+) | `DayView.tsx:2911–2950`; the sheet's own *"— from last {group} session"* | ✓ 2026-08-11 |
| `C-fb-03` | `ug/training-a-session#how-it-went` | The group-closing prompt asks joint pain (`None` · `Low` · `Moderate` · `High`), optionally which exercise caused it, then pump and workload | `DayView.tsx:2810` (`PAIN_OPTIONS`), `:2952–3020` (pain + attribution), `:3023–3065` (pump, workload) | ✓ 2026-08-11 |
| `C-fb-04` | `ug/training-a-session#how-it-went` | The sheet's subtitle names where the answers land — `… · FEEDS W{n+1} TARGETS` | `DayView.tsx:2908` | ✓ 2026-08-11 |
| `C-fb-04a` | `ug/training-a-session#how-it-went` | The per-answer effects the section tabulates: joint pain acts alone (blocks an addition, holds the weight, and at its worst removes a set); workload is the primary set-count dial; pump only corroborates an easy session; soreness is recorded | `engine/rules/feedback.ts::modulateFromFeedback` — the same source ch. 11 states in full (`C-fbk-05`…`12`). Ch. 5 carries the one-line version because a reader lands on either chapter (doc 22 §8.4d rule 1) | ✓ 2026-08-11 |
| `C-fin-03a` | `ug/training-a-session#finishing-the-session` | The three session sliders decide one thing between them — whether next week's weight increase on this day goes ahead — and it takes **both** a wiped-out reading and a poor one | `feedback.ts` (`session_dampen_require_both`, `true` on live v25); `engine/index.ts:539–541`. Ch. 11 has the thresholds (`C-fbk-15`) | ✓ 2026-08-11 |
| `C-fin-03b` | `ug/training-a-session#finishing-the-session` | The session's free-text note is stored with the workout and read back by the connector | `queries/logging.ts::completeWorkout` (`workouts.notes`); `mcp/tools/coaching.ts:242` (`notes` on each recent session) | ✓ 2026-08-11 |
| `C-fb-05` | `ug/training-a-session#how-it-went` | Feedback can be opened or changed at any time from the exercise `…` menu (`Add feedback` / `Edit feedback`) | `DayView.tsx:1486–1494` | ✓ 2026-08-11 |
| `C-fb-06` | `ug/training-a-session#how-it-went` | Joint pain acts on its own: at `pain_gate` it blocks a set being added and at `pain_cut_gate` it takes one away, whatever the other answers say | `engine/rules/feedback.ts::modulateFromFeedback` (the gate is read before workload); `pain_gate` = 2 / `pain_cut_gate` = 3 on active v25 ([`22b`](./22b-source-map.md) §4.2). Ch. 11 owns the mechanism | ✓ 2026-08-11 |
| `C-fin-01` | `ug/training-a-session#finishing-the-session` | `COMPLETE WORKOUT` appears only once every set is logged or skipped, and reads `SAVING THE LAST SETS…` while queued writes are still draining | `DayView.tsx:470–490`; `:336–342` (`allDone` vs `allDoneOptimistic`) | ✓ 2026-08-11 |
| `C-fin-02` | `ug/training-a-session#finishing-the-session` | The complete sheet counts exercises completed, sets logged out of planned, and skipped — on the same skipped-excluded math as the header bar | `DayView.tsx:3168–3175`, `:3225–3240` | ✓ 2026-08-11 |
| `C-fin-03` | `ug/training-a-session#finishing-the-session` | It asks exactly three session questions — `Overall fatigue` (`FRESH` ↔ `WIPED OUT`), `Effort` (`EASY` ↔ `ALL OUT`), `Performance` (`OFF DAY` ↔ `STRONG`) — plus notes saved with the session, then `NEXT WORKOUT →` | `DayView.tsx:3120–3133` (`SESSION_SLIDERS`), `:3255–3272` (notes), `:3277–3290`. Same three ch. 1 names (`C-app-07`) | ✓ 2026-08-11 |
| `C-fin-04` | `ug/training-a-session#finishing-the-session` | Completing recalculates silently — the sheet saves the session feedback, closes the day and moves to the next workout with nothing to confirm | `DayView.tsx:3177–3196` (`completeWorkoutAction` → `router.push(next)`); the design rule is 09 2026-06-13 §2 (no autoregulation panel) | ✓ 2026-08-11 |
| `C-fin-05` | `ug/training-a-session#finishing-the-session` | The header `⋮` carries `End workout` — skip everything unlogged and complete now, keeping what is logged — and `End mesocycle`, which does that for every remaining day and closes the block. Both confirm first | `DayView.tsx:884–1000` (menu + both confirm sheets); `queries/logging.ts::endWorkout` (1567–1581), `::endMesocycle` (1589–…) — *"Logged sets are never touched"* (hard rule 5) | ✓ 2026-08-11 |

### Deliberately absent from ch. 5

| Not claimed | Why |
|---|---|
| What the prescription strip's why lines and `COACH` line are, and what Prescription details shows | **Ch. 17's** subject (doc 19's three layers, N75). Ch. 5 says where the strip is, that its first line opens the working, and stops — and it must stay that way while the coaching line's serving mode is unconfirmed ([`22b`](./22b-source-map.md) §8 **O-A**) |
| What the RIR box means, and what a set above or below the ask does to next week | Ch. 6 owns both (`C-rep-01`…`03`, `C-miss-01`/`02`). Ch. 5 links into it twice rather than restating the mechanic |
| What the app does with soreness, pump and workload | **Ch. 11's** subject. §5 here covers when it is asked and what each question means, and links out to `ug/how-it-felt#what-your-answers-do` — the cross-link landed with ch. 11 in Phase 3e, which is when its target first resolved |
| Swapping, adding, reordering or removing an exercise, and `Repeat this change on this day in future weeks` | Ch. 4 owns editing a running block (`C-plan-21`/`22`) — those write the **plan**, not the session. Ch. 5 names them in one callout and links |
| The `Set type` row and drop sets | The row is hidden (P18, owner 2026-07-02); the data model stays dormant. Documenting it would describe a feature the reader cannot reach (§8.4) |
| That a note changes a prescription | It does not, and the chapter says the positive version — prescriptions come from logged sets, notes are the context around them (`C-adj-06`). Naming it matters because "the AI reads my notes" invites the opposite assumption |
| The bodyweight chip on a bodyweight exercise's card | Ch. 16 (Body data) owns bodyweight, and ch. 15 owns the three load meanings (`C-lib-16`). Ch. 5 would be the third place to explain the same thing |

---

## User Guide ch. 11 — Why the app asks how it felt (`ug/how-it-felt`)

Phase 3e. Verified against the repo at `2372056` and the **live v25 row**, re-read
on 2026-08-11 via `get_engine_params(25)` — still active, `params_hash
91887f0f…`, hash-verified. The four parameters this chapter states that
[`22b`](./22b-source-map.md) §4.2 did not yet carry (`pump_low`,
`session_dampen_require_both`, `session_fatigue_dampen_threshold`,
`session_performance_dampen_threshold`) were added there under that section's
own rule.

> **The chapter documents the ±1 model, which is what ships.** Doc 10 §3's
> graded MEV→MAV→MRV ramp and its two-week-at-MRV auto-deload were deferred
> (T-A5) and are not implemented ([`22b`](./22b-source-map.md) §7). No sentence
> in this chapter describes a volume ramp or an automatic deload trigger.

| Claim ID | Manual location | Assertion | Source of truth | Verified |
|---|---|---|---|---|
| `C-fbk-01` | `ug/how-it-felt#what-your-answers-do` | Feedback moves **set counts**, never the weight directly: `modulateFromFeedback` returns a `setDelta` of −1, 0 or +1, and the load comes from the anchor path | `engine/rules/feedback.ts::modulateFromFeedback` (its `setDelta` is a three-value union — one off, one on, or hold); `engine/index.ts:582` (`clampSets(sets + mod.setDelta, params)`) | ✓ 2026-08-11 |
| `C-fbk-02` | `ug/how-it-felt#what-your-answers-do` | The per-muscle answers reach the **same day slot in the following week**, since a week is generated from its own counterpart in the week before | `queries/progression.ts:380–402` (feedback for week N's workout feeds week N+1's same-day generation); same slot keying ch. 3 states (`C-cyc-03`) | ✓ 2026-08-11 |
| `C-fbk-03` | `ug/how-it-felt#what-your-answers-do` | Wherever an answer moved a number, the prescription strip says which one — the engine's own note is rendered as a plain-language why line | `lib/prescription-narrative.ts:234–252` (a why line per feedback cause); the notes come from `modulateFromFeedback` | ✓ 2026-08-11 |
| `C-fbk-03a` | `ug/how-it-felt#what-your-answers-do` | §1's table is the whole answer at one line each: joint pain acts alone and first; workload is the set-count dial; pump is the second signature and moves nothing alone; soreness and effort are recorded; fatigue and performance together decide whether the weight rises | `engine/rules/feedback.ts::modulateFromFeedback` for the first three and the last two; `engine/types.ts:27–40` for what is and is not an engine input. Rows are the one-line form of `C-fbk-05`…`17` (doc 22 §8.4d rule 2) | ✓ 2026-08-11 |
| `C-fbk-04` | `ug/how-it-felt#what-your-answers-do` | Unanswered feedback holds: with no `exerciseFeedback` every branch is skipped and `setDelta` stays 0 | `feedback.ts` (every predicate is `fb?.x != null && …`) | ✓ 2026-08-11 |
| `C-fbk-05` | `ug/how-it-felt#joint-pain-first` | Joint pain is evaluated **first and unconditionally** — the pain branches are checked before workload or pump are read at all | `feedback.ts` (`painCuts` → `else if (workloadHot)` → `else if (workloadEasy && pumpGood…)`), the doc 10 §3 "step 0" ordering | ✓ 2026-08-11 |
| `C-fbk-06` | `ug/how-it-felt#joint-pain-first` | At `pain_gate` (**2**, `Moderate`) an added set is vetoed and a warranted weight increase is held at the previously handled load; at `pain_cut_gate` (**3**, `High`) a set is removed and substitution is suggested | `feedback.ts` (`painGated`, `painVetoesAdd`, `painCuts`); `engine/index.ts:540`, `:590` (the gate can only hold, never lift); values from the live v25 row | ✓ 2026-08-11 |
| `C-fbk-07` | `ug/how-it-felt#joint-pain-first` | The four buttons are `None` · `Low` · `Moderate` · `High`, scored 0–3 | `DayView.tsx:2810` (`PAIN_OPTIONS`); `engine/types.ts:28` (`jointPain` 0–3). Same control ch. 5 names (`C-fb-03`) | ✓ 2026-08-11 |
| `C-fbk-08` | `ug/how-it-felt#workload` | Workload is the primary set-count signal: at or above `workload_high` (**8**) a set is removed; at or below `workload_low` (**3**) a set becomes eligible; between them the count holds | `feedback.ts` (`workloadHot` / `workloadEasy`); live v25 | ✓ 2026-08-11 |
| `C-fbk-09` | `ug/how-it-felt#workload` (layer 3) | Set counts are clamped to `min_sets` (**2**) and `max_sets_per_exercise` (**6**) whatever the feedback says | `engine/index.ts:1257` (`clampSets`); live v25 | ✓ 2026-08-11 |
| `C-fbk-10` | `ug/how-it-felt#pump-and-soreness` | A set is added only when **all** of: workload easy, pump ≥ `set_add_pump_min` (**6**), the block's goal is growth (`gain` / `hypertrophy`), and the muscle's weekly sets are under `mg_set_ceiling` (**20**) — and never over a pain veto | `feedback.ts` (the `workloadEasy && pumpGood && goalType && muscleGroupWeeklySets < mg_set_ceiling` branch, with `painVetoesAdd` inside it); live v25 | ✓ 2026-08-11 |
| `C-fbk-11` | `ug/how-it-felt#pump-and-soreness` | Pump can never move a set on its own — it only corroborates an easy session; a pump at or below `pump_low` (**2**) at an on-target workload produces the change-the-movement suggestion instead | `feedback.ts` (`pumpGood` appears only inside the add branch; the `pumpLow && workloadOnTarget` branch sets no delta); `prescription-narrative.ts:252` | ✓ 2026-08-11 |
| `C-fbk-12` | `ug/how-it-felt#pump-and-soreness` | **Soreness is recorded, not read by the engine.** The engine's exercise-feedback input is `{jointPain, pump, workload}`; soreness and its duration are stored on the feedback row and surfaced to the connector | `engine/types.ts:27–31` (`exerciseFeedbackInputSchema`); `queries/logging.ts:1279–1312` (stored); `mcp/envelope.ts:28` (exposed as a 0–10 scale) | ✓ 2026-08-11 |
| `C-fbk-13` | `ug/how-it-felt#pump-and-soreness` (layer 3) | The ceiling the add-branch checks is counted the same fractional way as every other volume number | `queries/progression.ts:243–265` (`weeklySetsByGroup` → 1.0 primary / 0.5 secondary); same counting rule as `C-vol-02` | ✓ 2026-08-11 |
| `C-fbk-14` | `ug/how-it-felt#the-session-questions` | The session sliders act on the **weight**, not the sets: a dampened session holds a warranted increase at the load already handled | `feedback.ts` (`sessionDampened`); `engine/index.ts:539–541`, `:590` | ✓ 2026-08-11 |
| `C-fbk-15` | `ug/how-it-felt#the-session-questions` | The hold needs **both** signals — fatigue ≥ `session_fatigue_dampen_threshold` (**8**) **and** performance ≤ `session_performance_dampen_threshold` (**3**) — because `session_dampen_require_both` is `true` on the live row | `feedback.ts` (`session_dampen_require_both ? fatigueHigh && performancePoor : …`); live v25 | ✓ 2026-08-11 |
| `C-fbk-16` | `ug/how-it-felt#the-session-questions` | A hold keeps the handled load and re-derives the reps so the ask stays internally consistent — it never lowers the weight | `engine/index.ts:531–552` (`gateHeld`, `hold_rep_consistent: true` on v25), `:588–592` (rounding may not lift a held weight) | ✓ 2026-08-11 |
| `C-fbk-17` | `ug/how-it-felt#the-session-questions` | `Effort` is stored with the session and read back by the connector and the explanation payload, and is not one of the two signals the hold is decided from | `engine/rules/feedback.ts` (reads `overallFatigue` / `performanceRating` only); `queries/logging.ts:1435–1441`; `mcp/tools/coaching.ts:266`; `lib/llm/explanations.ts:438`, `:567` | ✓ 2026-08-11 |

### Deliberately absent from ch. 11

| Not claimed | Why |
|---|---|
| A graded MEV→MAV→MRV volume ramp, or an automatic deload when a muscle sits at MRV | **Not implemented** — deferred as T-A5, so doc 10 §3 is aspirational on this one point ([`22b`](./22b-source-map.md) §7). The chapter describes the ±1 model that ships |
| What MEV / MAV / MRV are, and where the band comes from | Ch. 12 owns it. Ch. 11 names the ceiling in words and links |
| How the weight itself is chosen when nothing is held | Ch. 10's subject. Ch. 11 stops at *the answers move sets, and a rough day can hold a rise* |
| Where the feedback sheets are and what each control looks like | Ch. 5 owns the surface (`C-fb-01`…`05`) |

---

## User Guide ch. 12 — Volume (`ug/volume`)

Phase 3e. Verified against the repo at `2372056` and the live v25 row.

| Claim ID | Manual location | Assertion | Source of truth | Verified |
|---|---|---|---|---|
| `C-vol-01` | `ug/volume#what-volume-means-here` | Volume is counted as **working sets per muscle per week**, and the planner preview, the stats matrix and the engine's ceiling check all fold through the one function | `engine/volume.ts::fractionalSetCount` — read by `PlannerBoard` (`C-plan-12`), `queries/volume-projection.ts::weightWeekMuscleSets`, and `queries/progression.ts::weeklySetsByGroup`; CLAUDE.md conventions ("one counting definition") | ✓ 2026-08-11 |
| `C-vol-01a` | `ug/volume#what-volume-means-here` (layer 3) | A logged set credits volume when it is **not a warm-up** and was taken to **4 or fewer reps in reserve**, with an unreported RIR counting; planned counts have no such filter | `supabase/migrations/20260702000001_v_meso_week_muscle_sets.sql` (`logged_hard_sets`: `not is_warmup and (rir_reported is null or rir_reported <= 4)`, the §2 rule baked into SQL); `volume-projection.ts:78` reads `logged_hard_sets` for the logged cells | ✓ 2026-08-11 |
| `C-vol-02` | `ug/volume#why-a-set-can-count-as-half` | An exercise credits **1.0 to each primary muscle and 0.5 to each secondary**, which is why counts carry halves | `engine/volume.ts::volumeCountingWeights` (`volume.direct ?? 1.0` / `volume.indirect ?? 0.5` — both keys absent from the v25 row, so the code defaults apply) + `::fractionalSetCount` | ✓ 2026-08-11 |
| `C-vol-03` | `ug/volume#why-a-set-can-count-as-half` | Which muscles an exercise credits, and in which role, comes from the exercise's own primary/secondary links — the user's to set on a custom exercise | `exercise_muscle_groups.role`; `exercises/new/NewExerciseForm.tsx` (one primary, up to four secondaries — `C-lib-14`/`15`) | ✓ 2026-08-11 |
| `C-vol-04` | `ug/volume#the-band` | Each muscle's band is `[MEV, MAV, MRV]` from `volume.landmarks`, scaled by `volume.experience_scale` (**0.7** beginner / **1.0** intermediate / **1.1** advanced) and rounded to whole sets | `engine/volume.ts::muscleVolumeLandmark`; live v25 (e.g. chest `[8, 20, 22]`, hamstrings `[6, 16, 20]`) | ✓ 2026-08-11 |
| `C-vol-05` | `ug/volume#the-band` | MAV is the top of the productive zone: below MEV is too little, MEV–MAV is the productive zone, MAV–MRV is productive but near the recoverable ceiling, above MRV is more than can be recovered from | `engine/volume.ts::classifyVolume` + `ZONE_NOTE` (the four zones, in those words) | ✓ 2026-08-11 |
| `C-vol-06` | `ug/volume#the-band` | **Ten** muscle groups carry a band; a muscle without one is still counted and shown, it simply has no range to be judged against | live v25 `volume.landmarks` (abs, back, chest, quads, biceps, calves, glutes, triceps, shoulders, hamstrings); `muscleVolumeLandmark` returns `null` otherwise | ✓ 2026-08-11 |
| `C-vol-07` | `ug/volume#the-band` | The landmarks are heuristics carrying large individual variance — advisory, never a prescription | `engine/volume.ts` module header, quoting doc 10 §9; the same guardrail `GLOSSARY.volume_landmarks` carries | ✓ 2026-08-11 |
| `C-vol-08` | `ug/volume#where-your-sets-show-up` | The planner board's preview is the **only screen** that calls a count high or low; the meso stats matrix reports counts without judging them | `PlannerBoard.tsx:1072–1125` (`UNDER MEV` / `OVER MRV`) vs `components/stats/MesoStatsViews.tsx:39–120` (no zone rendering). *(The connector's `get_muscle_group_volume` also assesses — that is a tool, not a screen)* | ✓ 2026-08-11 |
| `C-vol-09` | `ug/volume#where-your-sets-show-up` | `SETS / WEEK` is a muscle × week grid — logged counts behind you, the current week accented, and future weeks marked `AUTOREGULATED PLAN` | `MesoStatsViews.tsx:39–120`; `queries/stats.ts::buildVolumeMatrix` (568–581, the `logged` / `current` / `planned` cell kinds) | ✓ 2026-08-11 |
| `C-vol-10` | `ug/volume#where-your-sets-show-up` | `AVG SETS / WEEK — PLANNED` and the `PUSH` / `PULL` / `LEGS` cards average over **non-deload** weeks | `queries/stats.ts::buildBalance` (626–648, `filter(({w}) => !w.is_deload)`) | ✓ 2026-08-11 |
| `C-vol-11` | `ug/volume#where-your-sets-show-up` | `BALANCE CHECK` states exactly two things — the push:pull ratio and the lowest-volume muscle — and makes no claim beyond them | `queries/stats.ts::buildBalance` (655–665, the two `parts`); doc 10 §9 makes push:pull advisory with no posture or injury claim | ✓ 2026-08-11 |
| `C-vol-12` | `ug/volume#weight-lifted-is-a-different-number` | `TOTAL VOLUME · LB` is `sum(weight × reps)` over non-warm-up sets — a different quantity from the set counts the band judges | `supabase/migrations/20260616000004_adherence_rule.sql:26`, `:57` (`v_meso_summary` / `v_macro_summary`); rendered at `cycles/macro/[macroId]/page.tsx:387` | ✓ 2026-08-11 |
| `C-vol-13` | `ug/volume#weight-lifted-is-a-different-number` | `VOLUME PR` is the best single set's `weight × reps`; `BEST SESSION VOL` is the best session total for that exercise | `supabase/migrations/20260615000004_exercise_overview.sql:24–52`; rendered at `exercises/[exerciseId]/page.tsx:216–223` | ✓ 2026-08-11 |

### Deliberately absent from ch. 12

| Not claimed | Why |
|---|---|
| That volume is what *causes* growth, or any dose-response curve | Doc 10 §9. The chapter says sets per muscle per week is the unit the evidence is clearest on, and that the band is a heuristic — no further claim |
| How a set count actually changes week to week | Ch. 11 owns it (`C-fbk-01`…`10`); ch. 12 links out twice |
| How to read the meso and macro stats screens generally | Ch. 13's subject. Ch. 12 covers only the volume surfaces on them |
| That warm-up sets can be marked in the app | The column exists (`logged_sets.is_warmup`) and the day view has no control for it, so the chapter states only what counts, per §8.4 |
| A glossary entry for **MAV** | The app never renders the term — the planner flags only `UNDER MEV` and `OVER MRV`, and `GLOSSARY.volume_landmarks` defines those two. §8.1's add-it-to-the-glossary rule fires on terms the app *shows*, so MAV is spelled out in place in the chapter instead |

---
## User Guide ch. 7 — Choosing your ramp: training styles (`ug/choosing-your-ramp`)

Phase 3d. Verified against the repo at `bfc474f` and the live v25 row.

> **This chapter carries two kinds of row, and they are sourced differently.**
> Rows about **app behavior** cite code or the active params row, like every
> other row in this file ([`22b`](./22b-source-map.md) §9.2). Rows about the
> **evidence** cite the primary literature, read first-hand for the doc 22
> Phase 3d-r research pass and recorded in
> [`docs/reviews/2026-08-11-rir-ramps-and-training-styles.md`](./reviews/2026-08-11-rir-ramps-and-training-styles.md).
> That review is a *record of sources*, not a spec of behavior, so citing it is
> not the spec-citation §9.2 forbids — the paper behind each row is named.

| Claim ID | Manual location | Assertion | Source of truth | Verified |
|---|---|---|---|---|
| `C-ramp-07` | `ug/choosing-your-ramp#effort-and-fatigue` | Strength gains are comparable across a wide range of distances from failure — the meta-regression's confidence intervals for estimated RIR contain null across all best-fit models | Robinson/Wolf/Refalo/Zourdos et al., *Sports Medicine* meta-regression series; research pass §2.1 | ✓ 2026-08-11 |
| `C-ramp-08` | `ug/choosing-your-ramp#effort-and-fatigue` | Muscle growth improves a little as sets end closer to failure: pooled failure-vs-non-failure ES **0.19** (95% CI 0.00, 0.37), and a negative marginal RIR slope excluding null in the meta-regression | Refalo et al. 2023 *Sports Medicine* 53(3):649–665; Robinson et al. as above; research pass §2.1 | ✓ 2026-08-11 |
| `C-ramp-09` | `ug/choosing-your-ramp#effort-and-fatigue` | Bar-speed loss four minutes after six bench sets at 75% 1RM was **−8%** at 3 RIR, **−13%** at 1 RIR and **−25%** at failure, and the proximity↔fatigue relationship was linear | Refalo et al. 2023 *Sports Medicine — Open* 9:10; research pass §2.2. Doc 10 §4 states the same pair | ✓ 2026-08-11 |
| `C-ramp-09a` | `ug/choosing-your-ramp#effort-and-fatigue` | The chapter states the **trade** (small per-set gain, steep per-set fatigue cost, fatigue limits weekly sets) rather than doc 10 §4's "gains flatten past ~1–2 RIR", which neither source supports | research pass §2.2 and ledger `D-13`; the rewrite is the finding, not a paraphrase of doc 10 | ✓ 2026-08-11 |
| `C-ramp-10` | `ug/choosing-your-ramp#why-a-ramp` | The app's default block is 5 weeks with a deload, ramping `3 → 0` | `supabase/migrations/20260611000001_initial_schema.sql:211–212` (`rir_start` default 3, `rir_end` default 0, each 0–5); `queries/cycles.ts:194–197` (`weeks ?? 5`, `includes_deload ?? true`) | ✓ 2026-08-11 |
| `C-ramp-11` | `ug/choosing-your-ramp#why-a-ramp` · `#four-shapes` | The end value is the final **working** week's target, reached once, with the deload after it | `engine/rules/rir.ts::rirRamp` (`t = i/(workingWeeks−1)`, so the last working week sits on `rirEnd`; the deload is appended afterwards). Same rule ch. 6 states (`C-ramp-05`) | ✓ 2026-08-11 |
| `C-ramp-12` | `ug/choosing-your-ramp#four-shapes` | Every shape the chapter names is reachable: start and end are each **0–5** with `end ≤ start`, over **3–8** weeks | `MesoHeader.tsx:640–684` (both cell rows are `[0,1,2,3,4,5]`, end disabled above start); `rirRamp` throws outside `3..8` and on `rir_end > rir_start` | ✓ 2026-08-11 |
| `C-ramp-13` | `ug/choosing-your-ramp#judging-your-own-effort` | Reported RIR is more accurate close to failure and less accurate far from it, in long sets, and in lifters new to the scale | Zourdos et al. 2016 *JSCR* 30(1):267–275 (experienced > novice accuracy); Zourdos/Halperin et al. 2019 *JSCR* (accuracy rises with proximity, falls with set length); research pass §2.3 | ✓ 2026-08-11 |
| `C-ramp-14` | `ug/choosing-your-ramp#judging-your-own-effort` | That report is an engine input, not a diary entry — it resolves the RIR every strength estimate is priced at | `engine/predict.ts::assumedRir` (`rir_reported ?? target_rir`); same chain ch. 6 states (`C-e1rm-01`/`05`) | ✓ 2026-08-11 |
| `C-ramp-15` | `ug/choosing-your-ramp#what-else-a-ramp-moves` | A session reported past just right removes a set from that exercise next week, so a harder ramp tends to reduce set counts rather than raise them | `engine/rules/feedback.ts::modulateFromFeedback` (`workloadHot` ⇒ `setDelta = −1`), `workload_high` **8** on the live v25 row. Same claim as `C-fbk-08` | ✓ 2026-08-11 |
| `C-ramp-16` | `ug/choosing-your-ramp#what-else-a-ramp-moves` | A set more than `e1rm.mod_max_rir` (**3**) reps short of failure lands in the lowest confidence band, and a step up is offered only from an anchor at `progression.min_confidence` (**moderate**) or better — so a ramp whose easiest value is 4 or above holds the weight | `engine/predict.ts::confidenceFor`; `engine/reps.ts::recencyWeightedE1rm` → `bestConfidence`; `engine/rules/progression.ts:266–273` (`not_earned`, reason `confidence`); values from live v25 | ✓ 2026-08-11 |
| `C-ramp-17` | `ug/choosing-your-ramp#what-else-a-ramp-moves` | The deload week's target comes from the program whatever the ramp is, and deload timing follows the block's length rather than its steepness | `engine/rules/rir.ts::rirRamp` (the deload is appended at `params.deload.target_rir`, outside the interpolation and outside a per-week schedule) | ✓ 2026-08-11 |

### Deliberately absent from ch. 7

| Not claimed | Why |
|---|---|
| That gains **flatten** past 1–2 RIR | Neither source supports a plateau — see `D-13`. The chapter states the trade instead |
| The measuring band, `max_measuring_rir`, "priced but not measured" | **Not live** ([`22b`](./22b-source-map.md) §4.1 ①). `C-ramp-16`'s confidence ladder is the live mechanism and predates doc 21 |
| Any named third-party program | Research pass §6 takes doc 22 **O7**'s recommendation at its conservative end: the literature studies proximity as a variable, not as a published program's schedule, so a name would be a third-party claim this ledger cannot verify. Reversible — one `detail` block adds it |
| An automatic deload, or an MRV stop | Not implemented ([`22b`](./22b-source-map.md) §7). Ch. 9 says the deload is scheduled |
| A best ramp | Doc 10 §9. The chapter says the evidence supports the shape of the trade and not a winner |
| The ramp **controls** — start/end cells, the per-week schedule, the deload's own line | Ch. 6 owns them (`C-ramp-01`…`05`). Ch. 7 links rather than restating (§8.4b rule 3) |

---

## User Guide ch. 8 — Exercise-level RIR (`ug/exercise-level-rir`)

Phase 3d. Verified against the repo at `bfc474f` and the live v25 row.

> **Written from doc 21 §6.2, not §6.1** — [`22b`](./22b-source-map.md) §4.1 ①'s
> explicit instruction for this chapter. The reassurance a reader needs
> ("a protected block does not read as a decline") is the read-time
> comparability policy, which is **live**. The measuring band is a different
> rule with different live status, and appears nowhere here.

| Claim ID | Manual location | Assertion | Source of truth | Verified |
|---|---|---|---|---|
| `C-perex-05` | `ug/exercise-level-rir#why-one-exercise-differs` | Resolution is **absolute**: `resolvedRir = slotRir ?? weekRir`, with no floor, offset or clamp against the week — and clearing an assignment restores the ramp with nothing to unwind | `queries/slot-effort.ts::resolveSlotEffort` (+ the module header stating the rule); `engine/index.ts:158` | ✓ 2026-08-11 |
| `C-perex-06` | `ug/exercise-level-rir#why-one-exercise-differs` | The week's own ramp stops at **5**; an exercise-level target is not bounded there — the sheet persists up to `RIR_MAX` (**30**) | `MesoHeader.tsx:640–684` (0–5 cells) vs `EffortSheet.tsx:66` (`RIR_MAX = 30`, "the ASK is unbounded in principle"); doc 21 §4.3 | ✓ 2026-08-11 |
| `C-perex-07` | `ug/exercise-level-rir#why-one-exercise-differs` · `#backing-an-exercise-off` | Both directions reprice through the **same** path — the resolved RIR is substituted for pricing only, so a higher target buys a lighter weight and a lower one a heavier weight | `engine/index.ts:1049`; doc 21 §4.2 (28d, "no special case"). Same claim as `C-perex-02` | ✓ 2026-08-11 |
| `C-perex-08` | `ug/exercise-level-rir#backing-an-exercise-off` | The sheet offers **0** plus steps of **1 · 2 · 4 · 8** above the week's value, and any whole number you type | `EffortSheet.tsx:59–63` (`EASIER_STEPS = [1,2,4,8]`, `rirOptions`), `:70` (`parseRir`, 0–30) | ✓ 2026-08-11 |
| `C-perex-09` | `ug/exercise-level-rir#backing-an-exercise-off` | The `REASON` stored with an assignment is surfaced wherever the assignment reads, as a `Noted:` line above the engine's own reasoning | `EffortSheet.tsx:316–323`; `lib/slot-effort-display.ts::composeReasonLine`, `::composeEffortLines` (the effort block renders **above** the engine's why — doc 21 §8) | ✓ 2026-08-11 |
| `C-perex-10` | `ug/exercise-level-rir#backing-an-exercise-off` · `#pushing-an-exercise-harder` | The exercise eyebrow reads `BACKED OFF` when the assignment is easier than its week and `PUSHED HARDER` when it is harder | `lib/slot-effort-display.ts::effortEyebrowParts`, `::isPushedHarder` | ✓ 2026-08-11 |
| `C-perex-11` | `ug/exercise-level-rir#what-it-does-to-your-numbers` | "Backed off" keys on the **plan's intent** — `workout_exercises.target_rir > microcycles.target_rir` — never on measured confidence | `queries/slot-effort.ts::isBackedOffSlot`; migration `20260804000001_backed_off_stats_policy.sql` (the same predicate in SQL across four views); doc 10 §9 | ✓ 2026-08-11 |
| `C-perex-12` | `ug/exercise-level-rir#what-it-does-to-your-numbers` | Backed-off sets are dropped from the strength claims — the best-set PR view, `v_exercise_overview.best_e1rm` and `v_meso_summary.best_e1rm` — and from the exercise's trend | migration `20260804000001`:160 (PR view comment + filter), `:213`, `:314–317`; `lib/analysis/comparability.ts` (`backed_off` sessions set aside from trend/phase/matched comparison) | ✓ 2026-08-11 |
| `C-perex-13` | `ug/exercise-level-rir#what-it-does-to-your-numbers` | They are **kept** in volume and in the literal observations: weekly sets, `total_volume`, `times_trained`, `weight_pr` and `volume_pr` all count them | migration `20260804000001`:165–171 (the stated asymmetry), `:436–465` (`logged_backed_off_sets` is disclosure only and stays inside the counts) | ✓ 2026-08-11 |
| `C-perex-14` | `ug/exercise-level-rir#what-it-does-to-your-numbers` | The exclusion is **disclosed, not hidden**: the excluded working sets are counted as `backed_off_sets` on the block and exercise rollups, and a session carries a `BACKED OFF` tag in exercise history beside the date, in the same grammar as `DELOAD` | migration `20260804000001`:214, `:322`, `:380`; `components/ExerciseHistoryList.tsx:179–182` | ✓ 2026-08-11 |
| `C-perex-15` | `ug/exercise-level-rir#what-it-does-to-your-numbers` | While an assignment is easing an exercise the program stops leading the demand upward, and says so — the earn gate refuses with reason `exercise_rir`; the session also cannot arm the miss throttle | `engine/rules/progression.ts:251–256` (`slotBackedOff` ⇒ `notEarned("exercise_rir", …)`), and the comment above it (deload parity) | ✓ 2026-08-11 |
| `C-perex-16` | `ug/exercise-level-rir#what-it-does-to-your-numbers` | The policy is **asymmetric by design**: a slot run harder than its week stays fully comparable and keeps every claim it earns | `queries/slot-effort.ts::isBackedOffSlot` (strictly `slotRir > weekRir`, documented as deliberately not symmetric); doc 10 §9's closing parenthesis | ✓ 2026-08-11 |
| `C-perex-17` | `ug/exercise-level-rir#pushing-an-exercise-harder` | A set reported past just right removes a set from **that exercise** the following week | `engine/rules/feedback.ts::modulateFromFeedback` (`workloadHot`); the feedback grain is per exercise (`C-fbk-08`) | ✓ 2026-08-11 |
| `C-perex-18` | `ug/exercise-level-rir#pushing-an-exercise-harder` | The working-set cap is read-only in the sheet under `SET BY YOUR COACH`, set through the connector; the program may prescribe fewer sets than the cap and never more, and an authored cap may go below the program's own floor | `EffortSheet.tsx:329–352` (read-only block + "Set through the AI connector"); `engine/index.ts:176–188` (`cappedSets`, "an authored cap below `params.min_sets` wins") | ✓ 2026-08-11 |
| `C-perex-19` | `ug/exercise-level-rir#pushing-an-exercise-harder` | Above every assignment sits a ceiling of **6** working sets for one exercise (`max_sets_per_exercise`) | `engine/index.ts:1257` (`clampSets`); live v25. Same value as `C-fbk-09` | ✓ 2026-08-11 |
| `C-perex-20` | `ug/exercise-level-rir#how-far-it-reaches` | `THIS WEEK` reaches one week; `WORKING WEEKS` reaches this week forward but not the deload; `ALL WEEKS` is the only choice that reaches the deload | `EffortSheet.tsx:31–46` (`SCOPES` + `scopeHelp`), and the module header's reason: a flat `target_rir` governs every week the schedule does not, and the deload falls off the end of the schedule by construction (`slot-effort.ts::pickWeek`) | ✓ 2026-08-11 |
| `C-perex-21` | `ug/exercise-level-rir#how-far-it-reaches` | Weeks already behind are never rewritten — the scoped forms write from the current week forward | `EffortSheet.tsx:22–29` (the `rest_of_block` rationale); `planEffortEdits` / `regenerateOpenWorkouts` and hard rule 5 each keep it independently | ✓ 2026-08-11 |
| `C-perex-22` | `ug/exercise-level-rir#how-far-it-reaches` | Assignments live on the plan, so duplicating a block carries them | `meso_exercises` holds the assignment columns (doc 21 §3 / A3); `duplicate_mesocycle` copies the plan rows; doc 21 §5 "Cross-meso" | ✓ 2026-08-11 |

### Deliberately absent from ch. 8

| Not claimed | Why |
|---|---|
| The measuring band, `e1rm.max_measuring_rir`, "priced but not treated as a measurement", `LIGHT` in place of an RIR | **Not live** — v26 is inactive, so today every logged set at every RIR is treated as a measurement ([`22b`](./22b-source-map.md) §4.1 ①). The code is complete and inert; the chapter gains it in the release that activates v26, per **O-B** |
| Where the sheet is and how to open it | Ch. 6 owns the controls (`C-rir-03`, `C-perex-01`…`04`). Ch. 8 is about using the lever, not finding it |
| `Priced at` / the rep position | Connector-set like the set cap, and a third lever would crowd the chapter. It is disclosed in the sheet; ch. 17 is the natural home once the prescription layers are written |
| That a backed-off set is dropped from the strength **anchor** | It is **kept** — doc 21 §5 is explicit that backed-off sets still anchor, because dropping them would freeze the anchor and make the return prescription jump. Ch. 10 owns the anchor |
| How the weight is actually re-priced | Ch. 10's subject. Ch. 8 stops at *lighter for a higher target, heavier for a lower one* |

---

## User Guide ch. 9 — Deloads (`ug/deloads`)

Phase 3d. Verified against the repo at `bfc474f` and the live v25 row. Evidence
rows are sourced as in ch. 7 — the primary paper is named, and the reading is
recorded in the [3d-r research pass](./reviews/2026-08-11-rir-ramps-and-training-styles.md) §2.4.

> **Doc 10 §9's deload guardrail is binding on every line**, and enforced:
> `contracts.test.ts` fails the build on growth or strength framing in any
> sentence mentioning a deload.

| Claim ID | Manual location | Assertion | Source of truth | Verified |
|---|---|---|---|---|
| `C-deload-01` | `ug/deloads#what-a-deload-is` | A deload is a deliberately light week, usually a block's last, that sheds accumulated fatigue — it protects progress rather than builds it | `GLOSSARY.deload`, rendered verbatim as the section's `term` card (§8.1); doc 10 §9 | ✓ 2026-08-11 |
| `C-deload-02` | `ug/deloads#the-week-itself` | The deload week's effort target is `deload.target_rir` — **6** on the live v25 row — and it comes from the program rather than from the ramp | `engine/rules/rir.ts::rirRamp` (appended at `params.deload.target_rir`, outside the interpolation); live v25. Same value as `C-ramp-04` | ✓ 2026-08-11 |
| `C-deload-03` | `ug/deloads#the-week-itself` | Sets are roughly halved against the block's heaviest week (`deload.set_pct` **0.5**), with a floor of `min_sets` (**2**) | `engine/index.ts:310–313` and `rules/deload.ts` (`max(min_sets, round(baseSets × set_pct))`, then `clampSets`); live v25 | ✓ 2026-08-11 |
| `C-deload-04` | `ug/deloads#the-week-itself` | The weight is chosen **the same way a working week's is** — the load that lands window-centred reps at the higher deload RIR, off the strength anchor | `engine/index.ts:251–325` (the `deload_anchor_rir` branch: `weightForRepsAtRir(anchor…, deloadRir)`, `boundRepsToWindow`, `predictRepsAtWeight`); `deload_anchor_rir` **true** on live v25. `deload.load_pct` is the no-anchor fallback (`rules/deload.ts`) | ✓ 2026-08-11 |
| `C-deload-05` | `ug/deloads#the-week-itself` | The block's header carries `DELOAD W{n} — {rir} RIR` and its meta line `DELOAD`; the day screen's header reads `DELOAD WEEK` where a working week names its target | `cycles/meso/[mesoId]/page.tsx:318`, `:362–365`; `log/[workoutId]/DayView.tsx:644`. Same header claim as `C-rir-01` | ✓ 2026-08-11 |
| `C-deload-06` | `ug/deloads#how-it-reads-afterwards` | Deload sessions are dropped from the strength trend, per exercise and per muscle group | `queries/stats.ts:196–200`, `:786–793` (`deloadMicroIds` → `foldProgressScores`) | ✓ 2026-08-11 |
| `C-deload-07` | `ug/deloads#how-it-reads-afterwards` | They are left out of the block's attendance figures — `sessions_attended` and `sessions_due` both filter deload weeks out | migration `20260804000001`:296–302 (`not coalesce(is_deload, false)` on both) | ✓ 2026-08-11 |
| `C-deload-08` | `ug/deloads#how-it-reads-afterwards` | Their sets, reps and weight lifted are counted in full; the muscle × week grid shows them, and the block's per-week averages leave them out | migration `20260804000001`:307–312 (`working_sets` / `total_volume` filter only on warm-ups); `queries/stats.ts::buildBalance` (626–634, `filter(({w}) => !w.is_deload)`). Same averaging claim as `C-vol-10` | ✓ 2026-08-11 |
| `C-deload-09` | `ug/deloads#how-it-reads-afterwards` | A deload session is tagged `DELOAD` beside the date in exercise history | `components/ExerciseHistoryList.tsx:169–173` | ✓ 2026-08-11 |
| `C-deload-10` | `ug/deloads#when-you-need-one` | **The app never triggers a deload.** A block's deload is its final week when `includes_deload` is set, and nothing watches for a condition to insert one | `engine/rules/rir.ts::rirRamp` (the deload is appended from the block's own flag, from no other input); `rules/feedback.ts::modulateFromFeedback` returns only a `setDelta` and a dampener — no deload signal exists in the engine's output type. Doc 10 §3's MRV-stop rule is **not implemented** ([`22b`](./22b-source-map.md) §7, T-A5) | ✓ 2026-08-11 |
| `C-deload-11` | `ug/deloads#when-you-need-one` | Between deloads the app manages fatigue by moving an exercise's set count one at a time, from joint pain and workload | `engine/rules/feedback.ts::modulateFromFeedback`; the same ±1 model ch. 11 documents (`C-fbk-01`, `C-fbk-06`, `C-fbk-08`) | ✓ 2026-08-11 |
| `C-deload-12` | `ug/deloads#when-you-need-one` | Surveyed competitive strength and physique athletes all deloaded, typically **6.4 ± 1.7 days** every **5.6 ± 2.3 weeks**, mostly pre-planned, triggered by stalled performance, soreness or joint stress | Rogerson, Nolan, Korakakis, Immonen, Wolf & Bell 2024, *Sports Medicine — Open* 10:26 (n = 246); research pass §2.4 | ✓ 2026-08-11 |
| `C-deload-13` | `ug/deloads#when-you-need-one` | The one controlled trial of a planned mid-block deload had the deload group **abstain from training for a week**; that group finished with worse lower-body strength and no difference in hypertrophy, power or muscular endurance — so it tests a week off, not a light week | Coleman et al. 2024, *PeerJ* 12:e16777 (n = 39, 9-week programme, midpoint abstention); research pass §2.4, which is where the "different intervention" reading is recorded | ✓ 2026-08-11 |
| `C-deload-14` | `ug/deloads#choosing-to-have-one` | `Final week is a deload` is the control, and a block of *n* weeks with it ticked has *n−1* working weeks | `PlannerBoard.tsx:1549–1561` / `MesoHeader.tsx:688–708` (the checkbox); `rirRamp` (`workingWeeks = includesDeload ? weeks − 1 : weeks`) | ✓ 2026-08-11 |
| `C-deload-15` | `ug/deloads#choosing-to-have-one` | Both the deload flag and the block length are editable only while the block is `planned`; after that the details sheet edits the name | `MesoHeader.tsx:568` (`shapeLocked = status !== "planned"`), `:583`, `:599–612`. Same lock as `C-ramp-03` | ✓ 2026-08-11 |
| `C-deload-16` | `ug/deloads#choosing-to-have-one` | Inside a running block, a per-exercise effort target is the way to ease off, and it can go as light as a deload on the exercises that need it | `queries/slot-effort.ts::resolveSlotEffort` (absolute, unbounded — `C-perex-05`/`06`); the assignment applies from the current week forward (`C-perex-21`) | ✓ 2026-08-11 |

### Deliberately absent from ch. 9

| Not claimed | Why |
|---|---|
| An automatic deload, an MRV stop, or a graded volume ramp | **Not implemented** — deferred as T-A5 ([`22b`](./22b-source-map.md) §7). This directly overrides doc 22 §6.1's "the MRV-stop rule (two weeks of workload ≥ 9 …)", which the Phase-0 audit had already corrected |
| That the create-mesocycle sheet says the deload runs at 4 RIR | It does (`D-08`), and it is wrong. Per the Phase-3a precedent on `D-06`/`D-07`, the chapter states the truth and does not narrate the defect |
| That a deload builds anything | Doc 10 §9, and enforced by `contracts.test.ts`. The chapter says a deload protects what you built |
| That deload sets are excluded from your best estimated strength | They are **not** — only the strength *trend* and the attendance figures exclude them. Claiming more than the code does is what this ledger exists to prevent |
| How the anchor and the rep window pick a weight | Ch. 10's subject. Ch. 9 says "the same way a working week's is" and links |

---
## User Guide ch. 10 — How your next weight is chosen (`ug/how-your-weight-is-chosen`)

Phase 3f, the chapter doc 22 §11 gives its own review gate. Verified against the
repo at `12023ae` and the **live v25 row**, re-read on 2026-08-11 via
`get_engine_params(25)` — still active, `params_hash 91887f0f…`, hash-verified,
and `e1rm.max_measuring_rir` still absent. Nine parameters this chapter states
that [`22b`](./22b-source-map.md) §4.2 did not yet carry were added there under
that section's own rule.

> **The correction this chapter exists to get right** is
> [`22b`](./22b-source-map.md) §6.1: the Epley/Brzycki pair is a **cutoff**, not
> a cancelling average. Doc 22 §5's own chapter-10 row states the corrected form,
> and `C-wt-06` is where the prose is pinned to the code.

| Claim ID | Manual location | Assertion | Source of truth | Verified |
|---|---|---|---|---|
| `C-wt-01` | `ug/how-your-weight-is-chosen#the-anchor` | The chain is: each logged set becomes a strength estimate → the estimates for one exercise fold into one anchor → the anchor prices this week's weight → a compliant session earns one step on top | `engine/predict.ts::estimateE1rm` → `engine/reps.ts::recencyWeightedE1rm` → `engine/index.ts::prescribeCore` (`weightForRepsAtRir`) → `engine/index.ts::prescribeWithProgression` | ✓ 2026-08-11 |
| `C-wt-02` | `ug/how-your-weight-is-chosen#the-anchor` | The anchor is the recency-weighted **best set's whole session, averaged** — not a lifetime best and not an average of everything (`e1rm.anchor_method` = `session_best`) | `engine/reps.ts::recencyWeightedE1rm` (the `session_best` branch: argmax `value × recency`, then the mean of that session's sets); live v25 | ✓ 2026-08-11 |
| `C-wt-03` | `ug/how-your-weight-is-chosen#the-anchor` | Each set's weight in that search **halves every 30 days** (`e1rm.recency_halflife_days`) — `0.5^(ageDays / halflife)` | `engine/reps.ts::recencyWeightedE1rm`; live v25 | ✓ 2026-08-11 |
| `C-wt-04` | `ug/how-your-weight-is-chosen#the-anchor` (layer 3) | An exercise last trained months ago still yields an anchor — the recency weight is relative among that exercise's own samples, with no age floor | `queries/anchors.ts` (the WS-J note: no `performed_at` floor, because ~56% of (user, exercise) pairs were last trained > 4 half-lives ago) | ✓ 2026-08-11 |
| `C-wt-05` | `ug/how-your-weight-is-chosen#how-sharp-the-estimate-is` | Confidence is **high** at ≤ `e1rm.high_max_eff_reps` (**8**) effective reps **and** ≤ `e1rm.high_max_rir` (**2**) RIR; **moderate** at ≤ **12** and ≤ **3**; **low** otherwise, and always low when no RIR was reported | `engine/predict.ts::confidenceFor`; live v25 | ✓ 2026-08-11 |
| `C-wt-06` | `ug/how-your-weight-is-chosen#how-sharp-the-estimate-is` | Epley and Brzycki are averaged **only up to** `e1rm.brzycki_max_eff_reps` (**10**) effective reps, and Epley runs alone above it — because Brzycki inflates past that point, not because the two biases cancel everywhere | `engine/predict.ts::e1rmFactor`; doc 10 §1's 2026-06-24 amendment; [`22b`](./22b-source-map.md) §6.1. Same rule ch. 6 states in layer 3 (`C-e1rm-03`) | ✓ 2026-08-11 |
| `C-wt-07` | `ug/how-your-weight-is-chosen#how-sharp-the-estimate-is` (layer 3) | An anchor takes the **best** rating present in its session, not the worst or an average | `engine/reps.ts::bestConfidence` (`high` ▸ `moderate` ▸ `low`), used by both the `session_best` and `mean` folds | ✓ 2026-08-11 |
| `C-wt-08` | `ug/how-your-weight-is-chosen#from-a-number-to-a-weight` | The weight is the load that lands the schedule's reps at the week's effort target, taken from the anchor | `engine/index.ts` (`weightForRepsAtRir(anchor.value, targetReps, week.targetRir, params)`), gated on `weight_selection: "rep_window"` — live v25 | ✓ 2026-08-11 |
| `C-wt-09` | `ug/how-your-weight-is-chosen#from-a-number-to-a-weight` | The block's goal sets the rep range: growth / cut / maintain aim for **8–12** inside **6–15**; strength aims for **3–5** inside **2–6** (`rep_window`) | live v25 `rep_window`; `engine/reps.ts::repWindowFor` | ✓ 2026-08-11 |
| `C-wt-10` | `ug/how-your-weight-is-chosen#from-a-number-to-a-weight` | The load is rounded to the exercise's own step **and then the reps are re-derived from the rounded load**, so the weight / reps / effort triple stays internally consistent | `engine/index.ts` (`roundToStep` → `boundRepsToWindow` → `predictRepsAtWeight`, clamped to the window); the same consistency fix `hold_rep_consistent` exists for (**true** on v25) | ✓ 2026-08-11 |
| `C-wt-11` | `ug/how-your-weight-is-chosen#reps-first-then-weight` | Double progression: reps climb inside the window at a held load, and reset to `target_low` with a heavier load once the window tops out | `engine/index.ts` (the §9.2 Option-A schedule: `toppedOut ? target_low : min(target_high, max(target_low, prevReps + 1))`) | ✓ 2026-08-11 |
| `C-wt-12` | `ug/how-your-weight-is-chosen#reps-first-then-weight` | The **+1 rep rides the RIR step** — a rep is added on weeks the target RIR steps down, and reps hold on a week where the ramp holds (`climb_requires_rir_step`, **true** on the live row) | `engine/index.ts` (the `climbs` predicate — a climb needs `rirStepped` while the flag is on — and the §R24a note: the unconditional +1 repriced the load *down* mid-meso); live v25 | ✓ 2026-08-11 |
| `C-wt-13` | `ug/how-your-weight-is-chosen#reps-first-then-weight` | Topping out is judged on the **lowest** working set actually performed, not the best one or the previous prescription (`climb_on_performed_reps`, **true** on the live row) | `engine/index.ts` (`performedMin = Math.min(...workingReps)`, §v12 #1); live v25 | ✓ 2026-08-11 |
| `C-wt-14` | `ug/how-your-weight-is-chosen#leading-by-one-step` | The prescription is priced off `A* = A + δ` when a step is earned and `A` otherwise — the anchor describes what was done, and the step is what turns it into a demand (`progression.mode` = `earned_step`) | `engine/index.ts::prescribeWithProgression`; `engine/rules/progression.ts`; doc 16 §3.1; live v25 | ✓ 2026-08-11 |
| `C-wt-15` | `ug/how-your-weight-is-chosen#leading-by-one-step` | δ is the **smaller** of one load step and one extra rep at the held load, measured in estimated-max space (`progression.step` = `min`) — so a coarse-increment lift progresses on the rep axis | `engine/rules/progression.ts::quantum`; doc 16 §3.2; live v25 | ✓ 2026-08-11 |
| `C-wt-16` | `ug/how-your-weight-is-chosen#leading-by-one-step` | All of these must hold for the previous session: the prescription was fully performed with no working set under its own ask, no pain gate, no session dampener, workload under `workload_high`, not stale, anchor at `progression.min_confidence` (**moderate**) or better, and a working week rather than a deload | `engine/rules/progression.ts::assessProgression` (the predicate chain, each emitting a named `not_earned` reason); doc 16 §3.4; live v25 | ✓ 2026-08-11 |
| `C-wt-17` | `ug/how-your-weight-is-chosen#leading-by-one-step` | An unrealizable step is **retained, never stacked** — the next chance re-arms at `A + δ` off the *measured* anchor, and `A + kδ` does not exist | `engine/index.ts::applyRealizedAsk` (status `vanished`, earn not consumed); doc 16 principle 3 + §3.3 | ✓ 2026-08-11 |
| `C-wt-18` | `ug/how-your-weight-is-chosen#leading-by-one-step` | A held step is recorded with its reason and the prescription is untouched — a hold is never narrated as an overload | `engine/index.ts::holdStep` + `withProgressionStep` (exactly one status-coded `progression` trace step per working prescription); doc 16 principle 6 / §3.6 | ✓ 2026-08-11 |
| `C-wt-19` | `ug/how-your-weight-is-chosen#how-often-a-step-comes` | Earning a step and being offered one are separate: the pacer compares the trailing ~30-day **prescribed** gain against a target rate drawn from the macrocycle band, and skips the step while already at pace (`progression.pacing` = `macro_rate`, `rate_source` = `plan`) | `engine/rules/progression.ts::pacerTargetRate` and the `paced` branch; doc 16 §3.5; live v25 | ✓ 2026-08-11 |
| `C-wt-20` | `ug/how-your-weight-is-chosen#how-often-a-step-comes` | Three further governors delay a step: at most one per exercise per week (`progression.cadence` = `microcycle`), a re-arm requirement of `progression.miss_rearm_sessions` (**2**) compliant sessions after repeated earned-then-missed cycles, and no step on the peak week (`progression.peak_week` = `skip`) | `engine/rules/progression.ts` (the cadence, miss-throttle and peak-week branches); doc 16 §3.5; live v25 | ✓ 2026-08-11 |
| `C-wt-21` | `ug/how-your-weight-is-chosen#how-often-a-step-comes` | The pace is **personal and moving**: it is fitted to the profile through `rate_source: "plan"`, and the envelope loop (`progression.envelope.enabled`, **true**) slides the position within the band from a user's own completed blocks once `min_history_mesos` (**2**) qualifying ones exist | `engine/rules/envelope.ts` (self-gating per user, meso-boundary updates, each bounded to 0.25); [`22b`](./22b-source-map.md) §4.3 (*"must not describe pacing as a fixed rule"*); live v25 | ✓ 2026-08-11 |
| `C-wt-22` | `ug/how-your-weight-is-chosen#how-often-a-step-comes` | A **cutting or maintaining** block takes no steps at all — `progression.goal_rate_factor` is **0** for both, which switches the mode off for that goal | live v25 (`{cut: 0, gain: 0.75, hypertrophy: 0.75, maintain: 0, strength: 1}`); `engine/rules/progression.ts::progressionActive`; doc 16 §3.4 ("goal opted in") | ✓ 2026-08-11 |
| `C-wt-23` | `ug/how-your-weight-is-chosen#how-often-a-step-comes` | No governor ever creates a step — they only ever delay one, and performance is the only thing that mints one | doc 16 principle 4 (*budget, never quota*), realized in `assessProgression` (every governor returns `offered: false`, none returns a step) | ✓ 2026-08-11 |

### Deliberately absent from ch. 10

| Not claimed | Why |
|---|---|
| The measuring band, the `none` confidence rating, "priced but not measured" | **Not live** ([`22b`](./22b-source-map.md) §4.1 ①). `GLOSSARY.e1rm_confidence` carried the sentence and it is corrected in this PR (**`D-14`**); it returns in the release that activates v26 |
| That averaging Epley and Brzycki cancels their biases *everywhere* | It does not — that rationale holds only below the cutoff, which is the [`22b`](./22b-source-map.md) §6.1 correction this chapter exists to get right (`C-wt-06`) |
| A named pacing cadence ("a step every other week for beginners") | The envelope loop makes pacing per-user and time-varying ([`22b`](./22b-source-map.md) §4.3). Doc 16 §3.5's approximate outcomes are engine-tuning figures, not a promise to a reader |
| Where the strength trend and `EST. STRENGTH` come from | Ch. 13's subject — a different question (*how am I trending?*) from this chapter's (*what do I lift next?*), computed from a different window |
| The macrocycle rate band itself, and how a target is personalized | Ch. 14 owns it. Ch. 10 names the band as the pacer's source and links to the cycle model |
| What a set's effective reps are, and why an honest RIR matters | Ch. 6 owns both (`C-e1rm-01`/`02`). Ch. 10 starts from the estimate and links back |
| The `▲` / `■` / `▼` compliance markers | Ch. 6 (`C-miss-01`). This chapter states that a session must clear its own ask and links |
| `progression.max_pct_per_step`, `compliance_band`, the deadband, the seed route | Engine-tuning internals with no reader-facing consequence beyond "sometimes a step waits", which `C-wt-20` already states |

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
| **D-11** | Phase 3b owner review round 4, 2026-08-11 | `GLOSSARY.volume_landmarks` was labelled `MEV / MRV` and its body used both abbreviations without ever spelling them out — the same defect `D-02` fixed on `e1rm`, reintroduced in a card that predates `D-02`'s fix. Ch. 4's `§8.4c` rule 2 fix rendered the card at first use, which surfaced the gap rather than caused it: the definition a reader lands on didn't define the term | **Fixed**: body now reads *"MEV — minimum effective volume — is the floor… MRV — maximum recoverable volume — is the ceiling…"*, within the 280-char cap. `glossary.test.ts` gained a second abbreviation check (`MEV`/`MRV`, generalizing the one `D-02` added for `1RM`), so this class of defect is now caught by a test rather than by re-reading a card in review |
| **D-12** | Phase 3e, 2026-08-11 | [`22c`](./22c-app-inventory.md) §B2.4 lists `TOP SET BY WEEK — KEY LIFTS` among the meso page's Balance / Performance content. **N10 removed that grid** (owner, 2026-07-03) together with the `ACROSS MACRO` single-exercise chart, both as macro-scope content on a meso view — the removal is commented in `MesoStatsViews.tsx:202` and `queries/stats.ts:505`. Surfaced while reading the same file for ch. 12's volume surfaces | **Recorded**; 22c corrected in place, and its §C2 `KEY LIFTS` row flagged for re-siting. Not a code defect — the audit predates nothing here, it simply transcribed a surface that had already gone. It matters because §C2 recommends adding `KEY LIFTS` to the glossary on the strength of a screen that no longer shows it, which **ch. 13** (Phase 3g) would otherwise inherit |
| **D-13** | Phase 3d-r, 2026-08-11 | Doc 10 §4's RIR-ramp rationale reads *"hypertrophy gains flatten past ~1–2 RIR while fatigue keeps rising"*, and `COACHING_GUIDE` (`src/lib/mcp/coaching-guide.ts:72–78`) carries the same sentence verbatim. **Neither cited source establishes a flattening.** Refalo et al. 2023's failure-vs-non-failure effect is small but positive throughout (ES 0.19, 95% CI 0.00–0.37), and the Robinson et al. meta-regression found a *continuing* negative slope for RIR on hypertrophy with intervals excluding null — no plateau in either. The conclusion doc 10 draws from it (`0 RIR` is a peak-week ceiling) survives; the argument for it does not | **Recorded, not fixed** — doc 10 owns its own §4 wording and doc 22 §1.2 makes Phase 3 documentation-only. The manual states the **trade** instead (small per-set gain, steep per-set fatigue cost, fatigue limits weekly sets), which is the stronger argument and is what ch. 7 is written from (`C-ramp-09a`). Full working in the [3d-r research pass](./reviews/2026-08-11-rir-ramps-and-training-styles.md) §2.2. Worth a doc-10 amendment and a one-sentence `COACHING_GUIDE` edit, since the connector currently coaches from the same wrong rationale |
| **D-14** | Phase 3f, 2026-08-11 | `GLOSSARY.e1rm_confidence` closed with *"A set run far enough from failure isn't rated at all: it still counts as work and as volume, but it says nothing about your strength, so nothing is estimated from it."* That is the doc 21 §6.1 **measuring band** — `engine_params` **v26, which is inactive**. `e1rm.max_measuring_rir` is absent from the active v25 row, so `isMeasuringRir` returns `true` for every set and no estimate is ever left unrated. The card described behavior no user has. Surfaced because ch. 10 is the first chapter to render it — §8.1 forces the manual to carry the app's own words, and doc 22 **O3** forbids documenting inactive behavior, so the two contracts collided on the sentence | **Fixed**: the sentence is removed and the three bands are the whole ladder. A code comment records the exact text to restore in the release that activates v26 ([`22b`](./22b-source-map.md) §8 **O-B**), so re-adding it is a revert rather than a rewrite. Third defect §8.1 has caught in a card the manual was about to render (`D-01`, `D-11`, this) — and the first found by **O3** rather than by the copy rules. Worth noting the card had **no `InfoDot` call site**: it is one of [`22c`](./22c-app-inventory.md) §C1-a's defined-but-unsurfaced terms, so no user had read it |
