# Build progress

Running log of implementation state against [07-implementation-plan.md](07-implementation-plan.md). Update this file in any PR that moves a phase forward.

## 2026-06-14 (latest) — Metrics & engine-params research lock-down (no code)

Research + documentation pass turning every mockup metric into a precise, research-backed
definition with default `engine_params`. Ran a multi-source sports-science review (e1RM accuracy,
rate-of-gain models, volume landmarks, subjective-feedback validity, progression/deload, push/pull
balance) with primary citations. **No code changed.**

### Done

- **New [10-metrics-spec.md](10-metrics-spec.md)** — authoritative metric/param doc: e1RM
  (effective-reps = reps+RIR, avg Epley/Brzycki, confidence weighting), fractional volume counting
  (1.0/0.5), MEV/MAV/MRV landmarks, workload/pump/joint-pain → set-count autoregulation, RIR ramp,
  increments/regression/deload, the profile-personalized macrocycle target + recommended-timeframe
  engine, key-lifts-by-frequency, stats rollups (total volume, adherence, progress score, advisory
  push:pull), consolidated default `engine_params`, and §9 honesty guardrails.
- **Decisions locked (user, 2026-06-14):** (1) macrocycle target personalized from the full profile
  + engine recommends timeframe; shown as an estimate, no progress bar; (2) **session feedback
  sliders restored** to a redesigned Workout Complete sheet (mockup dropped them in error); (3)
  fractional 1.0/0.5 volume counting; (4) key lifts = most-logged (by frequency). Defaults: female
  absolute-target ×0.5 (relative %s equal); pump = secondary nudge only.
- Threaded through 01 (F2/F3), 03 (`workout_feedback` kept + redesigned sheet; macro recommended
  duration; fractional counting), 04 (`planMacrocycle` profile inputs + recommend-timeframe; metric
  pointers), 05, 07 (backlog: Complete redesign, profile-driven target, params seeding), 08
  (decisions log), 09 (new 2026-06-14 session-4 entry), CLAUDE.md (10 in read-first list).

### Recorded deviation

- **Workout Complete (1.5) re-adds session sliders** — authorized deviation from the mockup, which
  dropped overall fatigue / effort / performance. Sheet = counts + the three session sliders (1.4
  slider UI) + paragraph notes + `NEXT WORKOUT →`; autoregulation panel stays removed.

### Not done yet / next

- Implement the metrics/params per 10 (engine + migrations + the Complete-sheet redesign), in the
  07 reconciliation backlog. Hard rules in force; engine changes need golden fixtures.

## 2026-06-14 — Design v2 handoff: docs integration (no code)

Documentation-only pass folding the **2026-06-13/14 design sessions** into the spec docs ahead of
implementation. New design assets imported and every doc reconciled; **no schema, engine, or UI
code changed** — the implementation lands in future sessions per the new reconciliation backlog.

### Done

- **Imported design artifacts** into `docs/design/`: updated source-of-truth mockup
  `workout - App Screens v2.dc.html`; new interactive prototype `WorkoutApp.dc.html` +
  `workout - Interactive Prototype.dc.html`; session-3 render screenshots under
  `screenshots/v2-session3/`; and the new **`docs/09-design-changelog.md`** (authoritative for its
  dated deltas).
- **08-design-decisions** — added the 09 amendment pointer; reconciled the §5 figure index
  (Section 02 renumbered, `+ NEW` chooser 2.1b, Macrocycle Overview 2.2, Create Macrocycle 2.3,
  planner board 2.5; Exercise page 3.1a/b/c; Volume stats tab removed → Balance 4.1 / Performance
  4.2); repointed stats to the planner `STATS` toggle; logged new decisions (macrocycle goal layer,
  realistic target, plan-a-meso paths, exercise tracking type, simplified complete sheet).
- **01-product-spec** — macrocycle as a single-goal layer (hypertrophy/strength/cut/maintain) with
  the create engine + realistic target; F2 cycle flow (chooser, 4-path plan, planner lock); F3
  complete sheet simplified; F5 tracking type + two-axis filter + Exercise page; F7 stats restructure.
- **03-data-model** — `DATA` target shape: `macrocycles` goal vocab + `duration_months` /
  `meso_length_weeks` / derived target columns; **retire `macro_slots`** → `mesocycles.position` +
  `phase` + `unplanned` status; `exercises.tracking_type`; `logged_sets` nullable weight/reps +
  `duration_seconds`; new views `v_exercise_overview` / `v_macro_summary`; week→day completion +
  `exercises(equipment_type)` index. Marked as migration deltas (not yet migrated).
- **04-feedback-engine** — goal vocab (gain→hypertrophy, +strength) + phase modulation; new pure
  `planMacrocycle()` (meso count, suggested phases, realistic target + per-month rate from
  goal/duration/block-length/profile); module layout + golden/property test requirements.
- **05-mcp-connector** — `create_macrocycle` (engine-computed) + `get_macro_summary`; goal-update
  tool reworked; new views added to the data-shape contract.
- **06-design-system** — addendum for the SetRow density, locked Day View header + progress bar,
  two-axis filter, `PLAN | STATS` toggle, and the exploratory dark theme (→ 09 §5a).
- **07-implementation-plan** — added the **Design v2 reconciliation backlog** (retrofit/net-new
  mapped to Phases 2/3/5 with `DATA`/`ENGINE` tags) for future execution.
- **CLAUDE.md** — 09 added to the read-first list and pixel-fidelity rule; mockup-over-prototype
  source-of-truth note; shared-views list extended.

### Not done yet / next

- Everything in the **07 reconciliation backlog** — the actual migrations, engine functions, and
  screen retrofits. Execute in future sessions, hard rules in force (append-only migration + RLS +
  tests per PR; engine changes need fixtures; pixel fidelity to the mockup, checking 09 first).
- **Resolved (2026-06-14):** the set menu (1.3) `Delete set` is allowed for **any set while the
  workout is `in_progress`** (not just unlogged). **Completing a workout locks it** — sets/feedback
  become immutable — since completion runs the engine's next-week generation and we don't want to
  recompute the chain. RLS gates `logged_sets`/`exercise_feedback` `update`/`delete` on the parent
  workout being `in_progress`; this refines hard rule #5 (append-only *after* completion). Edit-meso
  already can't touch completed weeks (planner lock). Captured in 03/07/08.
- Note: the interactive prototype is a **functional-testing** artifact and is not pixel-perfect —
  the **mockup is the source of truth** for every detail (already enforced in CLAUDE.md / 09).

## 2026-06-13 — Phase 5: meso stats, library, templates & sharing

### Done

**Phase 5 — meso stats, library & templates** (complete except a from-scratch template editor, which is not planned for v1)

- **Meso stats (figs 4.1–4.3)** at `/cycles/meso/[id]/stats` — one screen, three views via the segmented control, everything off the shared views (one definition of progress):
  - *Volume:* sets-per-group-per-week matrix from `v_meso_week_sets` — closed weeks show logged, the active week shows logged-so-far (orange `● W#` + `N OF M PLANNED SETS` footer), generated future weeks show the autoregulated plan, ungenerated weeks fall back to the planner baseline; TOTAL row; `W#–W# = AUTOREGULATED PLAN` caption
  - *Balance:* PUSH/PULL/LEGS cards (avg planned sets/wk; classification over the seeded vocabulary, abs excluded), per-muscle bars, BALANCE CHECK callout (push:pull ratio + lowest-volume group)
  - *Performance:* top-set-by-week grid for the meso's three biggest lifts (orange cell = in-progress week, `+N LB VS W1` badge), e1RM-across-macro bars for the lead lift (filled past / accent current / dashed future slots), PRS THIS MESO (ALL-TIME = heavier top weight than all pre-meso history; REP PR = better e1RM at or below the old top weight; lifts with no prior history can't PR)
  - Entered from meso detail, the 1.5 complete sheet, and the **Workout-tab resting state**, which now renders the last completed meso's full 4.1 view (08 §2)
- **Exercises tab (3.1) build-out:** rows link to an exercise detail page (description, primary/secondary groups + equipment, last performed, all-time best, pinned note, inline 3.2 history); `+ NEW` creates custom exercises (name, equipment, primary + secondary groups, description/notes; zod-validated)
- **Exercise history (3.2) shared everywhere:** query moved to `src/lib/queries/history.ts` with one presentational component; used by the day-view menu, the exercise detail page, and the **picker (2.6)**, whose selected card now shows the last-session line (`115 lb × 13, 12 · MESO — W4·D1`) and the underlined `FULL HISTORY ›` sheet per the mockup
- **Templates (3.3):** live tab (search, emphasis label, `N D/WK` + gender chips) → template detail page → `START A MESO FROM THIS` (2.7 create sheet with `FROM TEMPLATE — NAME` subtitle, then the planner board opens prefilled — days, groups, slot fills; **excluded exercises never carry over**, their slots stay open); `SAVE AS TEMPLATE` on meso detail round-trips the full `template_day_groups` shape; plan-a-meso (2.3) option 02 is live via a slot-aware template picker
- **Sharing (F5/F6):** one-time share codes (8 chars, no 0/O/1/I) for custom exercises, templates, and mesocycles — SHARE row on each detail page, redeem form on the Templates tab. Copy-on-accept with provenance ids (`source_exercise_id`/`source_template_id`) and per-grantee dedupe; custom exercises referenced by shared templates/mesos are copied (and deduped) too; shared mesos copy as **planned standalone structure** — the owner's loads don't carry, the engine seeds the grantee's numbers at start. Acceptance reads run on the service client (grantee can't read the owner's rows) with every write explicitly scoped to the redeeming user
- **Seed polish:** stock templates now seed `template_day_groups` (groups derived from each exercise's primary muscle group, slots linked); idempotent backfill added to the seed and **applied to the hosted project** (64 groups, 89/89 exercises linked)

**Phase 3 leftover — replace exercise (1.2 menu):** live picker pre-filtered to the slot's muscle group; blocked once sets are logged (row shows a LOGGED state); the prescription reseeds from the user's all-time best on the incoming movement with a clinical rationale line

### Recorded deviations

- **Templates `+ NEW` stays dimmed** and the 3.3 `CONTINUE EDITING DRAFT ›` row is omitted: templates come from save-meso-as-template (and Phase 6's MCP `create_template`); a from-scratch template editor + draft model is out of v1 scope
- **Share/redeem UI is not mocked** — built in the house style (bordered rows, redeem input on the Templates tab). Codes are single-redemption: mint again to share again
- **Volume view, ungenerated weeks:** workouts generate week-by-week, so far-future weeks show the planner baseline under the mockup's `AUTOREGULATED PLAN` caption until the engine generates them; ungenerated **deload** weeks show `—` (the engine sizes deload sets at generation)
- The performance macro chart labels itself `ACROSS MACRO — {LIFT} EST. 1RM` (no macro short-code; macros have names, not codes)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (62/62 — 14 new unit tests over the volume matrix, balance copy, key-lift grid, PR detection, emphasis vocabulary, share-code format), `npm run build` green. Hosted-DB smoke through the real modules: signup → stock template detail carries the backfilled groups-first shape → exclusion added → meso created from template (board prefilled, excluded movement's slot left open, slot counts intact) → saved back as a template (groups round-trip) → meso started → 2 sets logged → `getMesoStats` (current-week volume, key-lift cell, balance note), `getExerciseHistory` (W1·D1 entry) → custom exercise share code minted (format + dedupe on re-mint, stock objects refused). Smoke user + data deleted after; `acceptShareCode` itself isn't integration-tested (needs the service key, not available in this environment) — its helpers are unit-tested and all writes are user-scoped

### Not done yet / next

1. Phase 3 leftover: Playwright e2e for the logging loop (still no browser runtime in this environment)
2. Phase 6 — MCP connector at `/api/mcp`: OAuth bridge, read tools over the same views, draft write tools with `mcp_write_audit`, admin param/replay tools (`engine_decisions` + versioned params are flowing)
3. Phase 7 — production hardening (RLS/advisor audit, rate limiting, Sentry, accessibility pass, CSV export + account deletion, final design QA)
4. In-browser pixel QA of the new screens (stats, exercise detail, templates) against `docs/design/screenshots/`

## 2026-06-13 — Phase 4: progression engine alignment & wiring

### Done

**Phase 4 — engine re-alignment + week N→N+1 generation** (complete)

- **Feedback re-alignment:** engine inputs now take the redesigned 1.4 signals — joint pain 0–3 per exercise, pump and workload 0–10 per muscle group. The workload slider anchors set counts ("just right" = 5): `workload ≥ workload_high (8)` pulls a set; `workload ≤ workload_low (3)` with pump ≥ `set_add_pump_min (6)` under the gain goal adds one up to the group ceiling; low pump at the right dose flags exercise selection in the rationale instead of touching load. Strain/fatigue thresholds removed
- **Per-equipment per-unit increments:** `engine_params` v2 expresses increment + rounding per equipment in **both units** (`{ kg, lb }`) — lb users get real plate math (barbell +5 lb, not 2.5 kg × factor) — with first-class **bands (10 lb / 5 kg)** and **kettlebell (9 lb / 4 kg)** steps; the `engineEquipment` shim in generation is gone. Rationale copy now reads "+5 lb" (mockup voice)
- **Params v2** shipped as append-only migration `20260613000001_engine_params_v2.sql` (v1 deactivated and kept for replay; single-active index holds), mirrored in `params.ts` defaults and seed; **applied to the hosted project**; RLS test updated to expect v2 active
- **Week N→N+1 generation job** (`src/lib/queries/progression.ts`): on workout completion, `advanceWeekAfterWorkout` builds the same day of week N+1 from week-N actuals + feedback (group-scoped pump/workload resolved from whichever exercise closed the group, weekly group set totals, meso peak per exercise for deload sizing, goal from macro slot → macro → gain for standalone, peak slots train as gain), inserts the workout + prescriptions with rationale strings, and writes one `engine_decisions` row per exercise (inputs/output/params version) via the **service client** with explicit user scoping. Idempotent per day; on week close it backfills skipped days (prescriptions carry forward) and activates microcycle N+1; the final week closes the meso. `catchUpProgression` re-runs the job on first open of the Workout tab if completion-time generation failed
- **Autoregulation summary composer** (`src/lib/engine/summary.ts`, pure + unit-tested): the 1.5 copy — "Feedback recorded. W3 targets recalculated — Hack Squat +5 lb, Cable Pushdown +1 set. Ramp moves to 1 RIR next week.", deload and meso-close variants, clause cap with "and N more"
- **Complete sheet wired** (fig 1.5): `COMPLETE W2·D1` completes + recalculates in one action and the AUTOREGULATION callout swaps to the real engine summary; the primary becomes `NEXT — W2·D2` (next sibling, or W(N+1)·D1 once the week closes; `DONE` after the meso)
- **Progress scoring v1:** `getMesoProgressScores` (`src/lib/queries/stats.ts`) — per-exercise e1RM trend across a meso from `v_exercise_history` via `scoreProgress`, ready for Phase 5 stats and MCP
- Tests: 48 passing — reworked golden meso/prescribe/bounds fixtures to the new feedback shape, new cases for workload-anchored volume, pump corroboration, selection flag, kettlebell/bands steps, summary composer, and pure progression helpers (`buildEngineInputs`, `weeklySetsByGroup`, `peakByExercise`, `engineGoal`)

### Recorded deviations

- **Complete sheet is two-phase** (confirm → recalculated state): the 1.5 mockup shows the post-completion state; a confirm step is kept so opening the sheet can't silently mark untouched exercises skipped. After confirming, the sheet matches the mockup (real summary + NEXT button)
- Week-1 seeding decisions (from `startMeso`) are not yet audited to `engine_decisions` — the rationale lives on `workout_exercises.notes`; folding seeding into the decisions audit is noted for Phase 6 (replay wants it)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (48/48), `npm run build` green. Migration applied to the hosted project (v2 active, v1 kept inactive). Hosted-DB integration smoke through the real modules: signup → standalone 4-week meso (2 exercises, one group) → start (hosted params v2 parse) → 6 clean sets logged → group feedback (pump 7, workload 2) → complete → **advance**: week-2 workout generated with +5 lb on barbell, +1 set group-wide, RIR 3→2, full rationale strings, microcycle 2 activated, summary exactly in the mockup voice (`engine_decisions` insert shimmed in the smoke — no service key in this environment; covered by RLS tests). Smoke user deleted afterwards (and the leftover `smoke-test-claude@example.com` from the earlier session cleaned up too)

### Not done yet / next

1. Phase 3 leftover: Playwright e2e for the logging loop (still no browser runtime in this environment); exercise-menu replace/move
2. Phase 5 — meso stats screens (figs 4.1–4.3) off the shared views, exercises tab build-out, history sheet integration in picker/menu, templates round-trip, sharing
3. Phase 6 — MCP connector incl. admin param/replay tools (`engine_decisions` + versioned params are now flowing, so the decision inspector and replay harness have real data)

## 2026-06-12 — Design-fidelity pass: every screen transcribed from the v2 mockup HTML

The first builds of the 1.x–4.x screens improvised layouts from the spec prose; this pass re-reads `docs/design/mockups/workout - App Screens v2.dc.html` figure by figure and rebuilds each screen to its exact structure, copy, sizes, and colors. **New CLAUDE.md hard rule #8:** pixel fidelity to the mockup HTML is mandatory before building or changing any screen.

### Reworked to match

- **Day view (1.1)** is now the Workout tab itself (no header/back-link page): brand row (`workout` logotype + meso name), meso week track with the `MESO X OF Y · MACRO` / `● WEEK N — TARGET R RIR` caption, 46px `W2·D1` coordinate with date + `N OF M SETS LOGGED`, and per-exercise blocks — group caps label with 28px history/menu buttons, 20px exercise name + equipment, `PINNED —` note bar, and the **LB / REPS / LOG set grid**: editable cells (logged = tinted ink-framed; next = paper with 1.5px ink frame; future = faint), 26px LOG checkbox (filled ✓ / 2px frame / faint), ⋮ handle per row. `/log/[id]` stays as a deep link with a `‹ WORKOUT` crumb
- **Exercise menu (1.2)** and **set menu (1.3)** are anchored menu cards (offset hard shadow, scrim) — not bottom sheets — with the mockup's row sets: History › / New note / Replace exercise / Move down / Add set / Skip remaining sets / Remove exercise; Add set below / Set type (STRAIGHT⇄DROP) / Skip set / Delete set. History opens the 3.2 sheet (real `logged_sets` data grouped by meso)
- **Feedback (1.4):** title "Feedback", `MG — AFTER EXERCISE · FEEDS W# TARGETS` subtitle, sentence-case None/Low/Moderate/High pain options, ⓘ explainers, pump endpoints NO PUMP / BEST EVER, workload TOO EASY / JUST RIGHT / TOO MUCH with the explainer callout, Cancel + SAVE footer
- **Complete (1.5):** "W2·D1 complete." sheet with Exercises completed / Sets logged / Skipped rows, bordered AUTOREGULATION callout (placeholder copy until Phase 4), framed WORKOUT NOTES field, underlined "View meso stats", `NEXT — W#·D#` primary
- **Cycles (2.1):** `+ NEW` header button, expandable macro blocks (▼/▶) with `GOAL ARC: … · ● NOW IN SLOT N`, ink-rule-indented slot rows (✓ box / accent CURRENT badge / faint "Slot N" + dashed `+ PLAN`), `STANDALONE — NO MACRO` section
- **Meso detail (2.2):** WK/RIR/day-column ramp matrix (✓ cells, accent-framed next day, dashed deload/unbuilt), `RAMP 3 → 0 RIR` / `DELOAD W# — # RIR` caption, EDIT WEEKS + GO TO W#·D# button pair, MESO STATS row
- **Plan a meso (2.3):** numbered 01–04 rows (copy / template / builder / scratch) with chevrons
- **Planner board (2.4):** framed day-tab bar with `+` cell, `N OF M PICKED · S SETS` caption + `✎ DAY SETUP`, group headers with two-letter badges and sets counts, ⋮⋮ exercise rows with `EQUIPMENT · START N SETS`, dashed `Slot n — pick exercise` rows, macro-context strip with mini slot bars
- **Day setup (2.5):** label + weekday side-by-side, week-starts checkbox + accent Remove day, per-group −/n/+ steppers with ✕, in-sheet + ADD MUSCLE GROUP, helper copy, Cancel/DONE
- **Picker (2.6):** search + filled group chip, select-then-add model with the accent-framed SELECTED card (equipment, last performed, best set), `ADD TO {DAY}` primary
- **Create meso (2.7):** macro-placement timeline (filled/✓, accent-framed selected, dashed open slots with the JAN '26 … caption), framed 4–8 weeks segmented row, `RIR RAMP: 3 → 0 · W# DELOAD` caption, Cancel/CREATE; deload is always included per the mockup (toggle removed)
- **Exercises (3.1):** search frame, FILTERS chip row (muscle-group filter), `NAME / GROUP · EQUIPMENT · LAST date` rows; **Templates (3.3)** frame
- **More (4.4):** logotype, framed profile card (name, `34 · INTERMEDIATE · 198 LB · 5′11″` meta, TRAINING SINCE / N WORKOUTS LOGGED footer), SETTINGS rule with inline LB/KG mini-toggle, AI connector + CSV rows, version line
- **Profile (4.5):** read-only data rows (tap to edit in a sheet; height displayed ft/in for lb users), framed experience segmented control + helper, filled/bordered equipment chips, `NAME / REASON · ✕` exclusion rows + dashed + ADD EXCLUSION + helper

### Recorded deviations (hard-rule or phase-driven)

- **No "Delete set" on logged sets** — logged history is append-only (hard rule 5); the set menu offers amend-in-place instead. Delete/skip exist for unlogged sets only
- **Flow order:** the meso row is created at 2.7 before the board (the planner persists to `meso_days`/`meso_day_groups`, which need the meso id); the screens themselves match the mockups
- **Picker card** shows ALL-TIME BEST instead of the last-session set line (last-session line + FULL HISTORY land with the 3.2 integration in Phase 5)
- `+ NEW` on Exercises/Templates is dimmed until create-custom (Phase 5); plan-entry options 01–03 dimmed with "(soon)" until their phases
- Profile height edits in cm (display converts to ft/in); sign-out button added to More (needed, not mocked)

### Verified

`typecheck` / `lint` / `test` (30/30) / `build` green; hosted-DB smoke re-run for the extended day-view detail (context label, sibling workouts, microcycles) with cleanup.

## 2026-06-12 (later) — Phase 3 workout logging (core loop)

### Done

**Phase 3 — workout logging** (core loop; e2e + engine-derived summary pending)

- Day view `/log/[workoutId]` (fig 1.1): meso week track + RIR/deload badge in the header, day coordinate + day label, exercises grouped under `01 — QUADS` rules with pinned notes, set rows in three states — logged (filled ink, tap to amend), the live set (accent frame with weight/reps steppers, RIR chips, drop-set toggle, LOG SET), unstarted (faint prescription row)
- Logging data layer (`src/lib/queries/logging.ts`): `getWorkoutDetail` (one shape for the whole day), `logSet` with denormalized cycle stamps + auto `in_progress` flip, `amendSet` (corrections are updates — logged history stays append-only), prescribed-set add/skip, exercise skip/remove (remove blocked once sets exist, since the FK would cascade logged history), pinned-note save (one pinned per exercise)
- Exercise menu (fig 1.2): prescription rationale line, new/replace pinned note, add set, skip last set, skip remaining, remove (destructive accent row)
- Per-exercise feedback prompt (fig 1.4): auto-opens after the last planned set; joint pain (NONE/LOW/MODERATE/HIGH) per exercise; pump + workload 0–10 snap-sliders scoped to the muscle group when the exercise is the group's last to finish ("just right" centered), with explainer copy; writes the redesigned `exercise_feedback` rows
- Workout complete sheet (fig 1.5): per-exercise summary rows (set count + top set), workout notes, completion marks logged exercises completed / untouched ones skipped, closes the microcycle when the whole week is done (next-week activation is the Phase 4 job); autoregulation summary placeholder until Phase 4
- Workout tab resting state (08 §2): with no active meso, shows the latest completed meso's summary (`v_meso_summary`) above the setup prompt

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (30/30), `npm run build` green. Hosted-DB integration smoke for the full loop: standalone meso → plan → start → pinned note → 2 logged sets (workout flips `in_progress`) → group-scoped feedback (pump 7 / workload 5) → complete (status, notes, exercise statuses, microcycle closed) — then cleaned up.

### Not done yet / next

1. Phase 4 — week N→N+1 generation job (prescribe() wired to the new feedback signals, `engine_decisions` writes, autoregulation summary copy), engine input re-alignment to pump/workload 0–10 with new golden fixtures, per-equipment lb increments
2. Playwright e2e for the logging loop (no browser runtime in this environment)
3. Exercise menu leftovers: history sheet (3.2, Phase 5), replace exercise, move

## 2026-06-12 — Phase 1 delta complete; Phase 2 cycles & groups-first planning

### Done

**Phase 1 delta** (complete)

- Queries for the pivot tables in `src/lib/queries/`: exclusions (list/add/remove), pinned exercise notes, picker query (`listPickerExercises` — muscle-group pre-filter, search, last-performed + best-set from `v_exercise_prs`, exclusions removed), wider profile patch, `getActiveEngineParams`
- Onboarding rebuilt as the 08 §4 four-step sequence (about you → experience → equipment access → units, lb default) with a step rail; submits once at the end, lands on Cycles
- Profile screen `/more/profile` (fig 4.5): data rows (name/age/height/bodyweight + updated-at/training-since), experience segmented control (instant save), equipment chips, excluded-exercise management with reason labels and a search sheet
- More tab (fig 4.4): profile card → Profile, working LB/KG toggle, AI connector + CSV export placeholder rows, version line
- Hosted Supabase confirmed live (both migrations + seed applied); `.env.example` unchanged — anon key + URL wired locally via `.env.local` for verification

**Phase 2 — cycles & groups-first planning** (core flow complete)

- Cycles tab (fig 2.1): macro sections with ordered goal-arc slots — filled slots show their meso (orange marker = active), empty slots show dashed `+ PLAN`; legacy/unslotted mesos still listed under their macro; standalone section; empty state per 08 §4
- Macro creation `/cycles/new`: name, date range, goal-arc slot builder (tap to cycle cut/gain/maintain/peak, add/remove up to 12)
- Plan-a-meso entry `/cycles/plan` (fig 2.3): from-scratch live; template/copy/builder as dashed "soon" cards
- Create mesocycle `/cycles/plan/new` (fig 2.7): name, placement (standalone or any open macro slot), weeks 4–8, deload toggle, live RIR-ramp preview on `WeekTrack`
- Planner board `/cycles/meso/[id]/plan` (figs 2.4–2.6): weekday-sorted day tabs, muscle-group blocks with numbered slots (filled rows + dashed `+ EXERCISE`), add-group sheet, day-setup sheet (label, weekday, week-starts-here → `profiles.week_starts_on`, per-group slot steppers, remove day), exercise picker pre-filtered to the slot's muscle group with search, start-sets stepper, last-performed/best-set data
- Meso detail `/cycles/meso/[id]` (fig 2.2): RIR ramp matrix (weeks × days; filled = complete, accent frame = in progress, dashed = unbuilt/planned), `GO TO W#·D#`, edit plan, `MESO STATS` stub
- **Meso start generation** (`src/lib/queries/generation.ts`): on start, builds all microcycles from `rirRamp` (week 1 active) and week-1 workouts/`workout_exercises` from the planner board via `seedMeso` — prescriptions carry muscle-group context, target RIR, and the engine rationale string; bands/kettlebell map to `other` increments until Phase 4
- Engine: `rirRamp` widened from 3–6 to 3–8 weeks (matches the 2.7 week range + pivot schema), with a new 8-week golden test
- Workout tab updated for standalone mesos (`getCurrentState` now anchors on the active meso, macro optional); read-only day view at `/log/[workoutId]` shows generated prescriptions grouped by muscle group with rationale lines (logging itself is Phase 3)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (30/30), `npm run build` all green. End-to-end integration smoke against the **hosted** Supabase project (signup → onboarding writes → macro + slots → meso into slot → 2 planner days → group + slot fill → start meso): 5 microcycles created with the 3→0 ramp + deload, week-1 workouts generated with correct sets/target RIR/muscle group/rationale, `getCurrentState` surfaces the next workout; test data cleaned up after. Route auth gating spot-checked on a local dev server.

### Not done yet / next

1. Phase 3 — workout logging (day view 1.1 one-thumb logging, exercise/set menus, per-exercise feedback prompt, workout-complete sheet, Playwright e2e). The `/log/[workoutId]` read-only view is the starting skeleton
2. Phase 4 — engine feedback re-alignment (pump/workload 0–10 inputs, new golden fixtures), week N→N+1 generation job, per-equipment lb increments incl. bands/kettlebell
3. Phase 2 leftovers tracked in 07: template-prefilled planner (Phase 5), copy-a-meso, meso builder
4. A throwaway auth user (`smoke-test-claude@example.com`) remains on the hosted project from the integration smoke; safe to delete from the Supabase dashboard

## 2026-06-12 — Phase R: light-ledger retheme, canon tab bar

### Done

**Phase R — design-system retheme** (code-complete)

- Token set replaced in `src/styles/globals.css` per 08 §1: cream `#F4F0E6` base, paper `#FCFAF4` surfaces, ink `#17140F`, accent `#C14B2A`; opacity steps of ink (`ink/55`, `ink/45`, `ink/15`…) carry the secondary/faint/hairline roles; square corners everywhere (all radius tokens removed); the old dark palette, pressed-orange, and green/yellow status colors are gone. `--shadow-menu` (5px 5px 0 hard offset) is the single permitted shadow
- Typography: Archivo variable (latin, 100–900) committed at `src/app/fonts/` and self-hosted via `next/font/local`; helpers `.title-display` (800 lowercase tight), `.logotype` (0.22em lowercase), `.label-caps` retracked to 0.12em, `.numeral` unchanged
- Primitives reworked to the ledger: `Button` (filled-ink primary / 1.5px ink-frame secondary), `Card` → ruled section (caps header over 1.5px rule, no box), `Input` (paper bg, ink focus), `FeedbackScale` (accent-fill selection per fig 1.4), `NumberStepper`, `RirBadge` (accent frame at peak, dashed deload)
- New primitives from the mockups: `SegmentedControl` (filled-ink active), `Chip` (filled-ink selected + dashed planned variant), `SnapSlider` (snap-to-stop 0–10, tick stops, rectangular accent thumb, keyboard support), `BottomSheet` (ink scrim, 2px-rule sheet), `MenuCard`/`MenuItem` (offset hard shadow, accent destructive row), `WeekTrack` (filled/current+dot/faint/dashed-deload states)
- **Canon tab bar** `WORKOUT · CYCLES · TEMPLATES · EXERCISES · MORE`: routes renamed `today`→`workout`, `settings`→`more`, `insights` removed, `templates` placeholder added; sign-in lands on `/workout`, onboarding completion lands on `/cycles` (08 §4); active tab is bold ink with ■ marker
- All existing screens (landing, auth, onboarding, cycles, exercises, workout, more) re-dressed in the system: ruled headers with lowercase display titles, hairline row dividers, filled-ink radio/checkbox chips, no rounded corners anywhere
- PWA: manifest + theme color → `#F4F0E6`, `start_url` → `/workout`, status bar `default`; icons regenerated for the light system (`scripts/generate-icons.mjs` recolored). Service worker already shell-precache-only — no offline-logging assumptions to remove

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (29/29), `npm run build` all green. Token/spacing values transcribed from the v2 mockup HTML (figs 1.1–4.5); pixel QA in a real browser still worth a pass when deploys exist.

### Not done yet / next

1. Phase 1 delta — onboarding rebuilt as the 08 §4 four-step sequence, Profile screen (fig 4.5), real More tab rows, queries for the pivot tables; provision hosted Supabase + Vercel
2. Phase 2 — cycles & groups-first planning (the new primitives — Chip, BottomSheet, WeekTrack, SegmentedControl — are ready for the planner screens)
3. Engine feedback re-alignment (pump/workload 0–10) needs new golden fixtures before wiring (Phase 4)

## 2026-06-12 — Design pivot ingested; plan rewritten; schema delta

### Done

**Design handoff ingested** (Claude Design mockup round)

- [08-design-decisions.md](08-design-decisions.md) added as the authoritative design source; mockup HTML + screenshots in `docs/design/`
- Specs updated for the pivot: light ledger system supersedes the dark system in 06 (banner added); canon tab bar `WORKOUT · CYCLES · TEMPLATES · EXERCISES · MORE`; **offline sync cut** (01/02/07 — app is online-only); **admin UI cut** — engine inspection/tuning/replay ship as admin-gated MCP tools (01/02/04/05/07); CLAUDE.md hard rules updated
- [07-implementation-plan.md](07-implementation-plan.md) rewritten: new Phase R (design-system retheme), groups-first planning in Phase 2, redesigned feedback + workout-complete flow in Phase 3, engine re-alignment in Phase 4, meso stats/library/templates in Phase 5, MCP incl. admin tooling in Phase 6, hardening in Phase 7

**Schema delta** — migration `20260612000001_design_pivot.sql` (RLS + tests in the same PR; `database.ts` updated)

- `profiles`: height/bodyweight (+`bodyweight_updated_at`), `training_since`, `week_starts_on`
- New tables: `excluded_exercises`, `exercise_notes` (pinned), `macro_slots` (goal arc), `meso_days` + `meso_day_groups` (groups-first planner), `template_day_groups`, `mcp_write_audit`
- `mesocycles`: nullable `macrocycle_id` (standalone mesos), `macro_slot_id`, weeks 3–8
- `workout_exercises`: `muscle_group_id` (day-view grouping + feedback scope), `status` (skip states)
- `logged_sets`: `set_type` (straight/drop), `unit` (lb/kg); nullable `macrocycle_id`
- `exercise_feedback` redesigned: joint pain 0–3 per exercise; pump/workload 0–10 sliders per muscle group (strain/fatigue dropped)
- Equipment vocabulary + bands/kettlebell; `exercises.description`
- New views `v_meso_week_sets` (stats volume/balance) and `v_exercise_prs` (performance/PRs)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (29/29) green; both migrations applied in order against a clean Postgres (`check_function_bodies=off`, as on Supabase)

### Not done yet / next

1. Phase R — retheme tokens/primitives to the light ledger system (blocks all screen work)
2. Phase 1 delta — onboarding sequence, Profile/More screens, queries for the new tables; provision hosted Supabase + Vercel
3. Phase 2 onward per the rewritten plan; engine feedback re-alignment (pump/workload 0–10) needs new golden fixtures before wiring

## 2026-06-11 — Foundation, data model, engine core

### Done

**Phase 0 — Foundation & scaffolding** (code-complete; deploys pending)

- Next.js 15 (App Router) + TypeScript + Tailwind v4, structured per [02-architecture.md](02-architecture.md)
- PWA baseline: `manifest.webmanifest`, generated icons (`scripts/generate-icons.mjs`), Serwist service worker (`src/app/sw.ts`, disabled in dev)
- Design tokens from [06-design-system.md](06-design-system.md) as Tailwind theme variables in `src/styles/globals.css`
- UI primitives: `Button`, `Card`, `Input`, `BottomNav`, `RirBadge`, `NumberStepper`, `FeedbackScale`
- ESLint (flat config) + Prettier + Vitest; CI workflow (`.github/workflows/ci.yml`): typecheck, lint, unit tests, build, plus an RLS job against a local Supabase stack

**Phase 1 — Auth, profiles & data model** (code-complete; hosted project pending)

- Full schema migration `supabase/migrations/20260611000001_initial_schema.sql`: all 19 tables from [03-data-model.md](03-data-model.md), RLS enabled everywhere with default deny, denormalized cycle stamps on `logged_sets`, hot-path indexes, `security_invoker` views `v_exercise_history`, `v_muscle_group_volume`, `v_meso_summary`, signup trigger creating `profiles`
- Notable policy decisions: no client `delete` policy on `logged_sets` (append-only history); `profiles` update policy prevents self role-escalation; `engine_decisions` written only via service role; single-active-row constraint on `engine_params`
- Seed (`supabase/seed.sql`): 12 muscle groups, ~80 stock exercises with muscle-group mappings, 4 stock templates (Upper/Lower 4-day, PPL 6-day, Full Body 3-day, Glute Emphasis 4-day), `engine_params` v1 mirroring `src/lib/engine/params.ts`
- RLS test suite (`tests/rls/`, `npm run test:rls`): cross-user reads/writes blocked, stock visibility, append-only sets, role escalation, engine table gating
- Supabase clients (`src/lib/supabase/`): browser, SSR server, middleware session refresh, and `service.ts` (the only module allowed to touch the service-role key)
- Email/password auth (server actions, zod-validated), onboarding flow writing profile + `onboarded_at`
- Hand-authored `Database` types (`src/lib/types/database.ts` — regenerate with `npm run db:types` once a stack is running) and `src/lib/queries/` for profiles, exercises, cycles

**Phase 4 — engine core** (pulled forward; it is pure code with no infra dependency)

- `src/lib/engine/`: `prescribe()`, `seedMeso()`, `rirRamp()`, `scoreProgress()`; rule modules for performance delta, feedback modulation, deload, RIR ramp, rounding/increments
- All tunables flow from `engine_params` (zod schema gate — a malformed row cannot be parsed, so it can never be activated)
- 29 tests: table-driven rule-branch units, a golden 5-week + deload meso simulation (100 → 102.5 → 105 → 107.5 → 60 kg deload), and seeded-PRNG property tests on hard bounds (pain gate blocks increases, deload < peak, set floor/ceiling)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (29/29), `npm run build` all green locally. RLS tests are written and wired into CI but need a running Supabase stack to execute.

### Not done yet / next

1. **Provision hosted Supabase project + Vercel project** (needs account decisions): apply migration + seed, set env vars, enable an OAuth provider, then regenerate `database.ts` from the live schema
2. **Phase 2 — cycle management**: meso builder UI, microcycle generation (`rirRamp` is ready), week-1 workout generation, exercise library v2 (create custom), cycle timeline screen
3. **Phase 3 — logging flow**: logging UI (primitives exist), feedback sheets, offline outbox + sync, Playwright e2e
4. **Phase 4 remainder**: week N→N+1 generation job wiring `prescribe()` to data + `engine_decisions` audit writes
5. Phases 5–8 per the plan
