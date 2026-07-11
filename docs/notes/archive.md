# Archive — closed items

Terminal items swept out of [`backlog.md`](./backlog.md)'s live index so the live
index stays lean. An item lands here when it's **done-and-merged**, **wontfix**,
**superseded**, or **resolved-and-removed-from-source**. Its raw text remains in
the backlog [appendix](./backlog.md#appendix-verbatim-source) (the append-only
record); only the tracking row moves here, with its resolution preserved.

Newest sweeps first. See [`CLAUDE.md`](./CLAUDE.md#consolidation--purge-policy-keeping-the-live-index-lean)
for the purge policy.

---

## Swept 2026-07-10 — macro goals Phase 2 merged (PR #170)

Reconciliation sweep at the doc-17 Phase-3 session start: N37's PR merged
2026-07-10 (row stamped `done (PR #170)` in-PR per protocol). Full record in
doc 17 §3, doc 16 §6, PROGRESS, and the Session-63 `log.md` entry.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| N37 | `rate_source: "plan"` pacer branch (doc 16 §6, §11 — the macro-rate pacer paces against the profile-personalized plan band instead of the bucket table) | F | P | **done (PR #170, merged 2026-07-10).** Doc 17 §3 / Phase 2: `EngineInputs.planStrengthRate` derived input (doc-14 denylisted from the fingerprint, recorded in decision inputs, replays frozen through recompute + admin replay), leaf `queries/plan-rate.ts` (`derivePlanStrengthRate` over `planMacrocycle.strengthRatePctMonth`; self-gates on mode; never throws) assembled at the `progressionHistory` sites, `pacerTargetRate` `"plan"` branch (lerp × goal factor, degrades to `"band"` — never unpaced; source-agnostic for N36), `seedMeso` opt. No migration, no behavior change — every params row keeps `rate_source: "band"`; the flip is the v22 micro-bump at doc 17 Phase R3 (after R1 + R2). Tests +16 (suite 991). |

## Swept 2026-07-10 — macro goals Phase 1 merged (PR #169)

Reconciliation sweep at the doc-17 Phase-2 session start: N21's PR merged
2026-07-10 (row stamped `done (PR #169)` in-PR per protocol). Full record in
doc 17 §2, doc 10 §5, PROGRESS, and the Session-62 `log.md` entry.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| N21 | "Realistic" macro-target engine correction (strength target ignored age/sex; hypertrophy model flipped discontinuously on profile completeness; cut caps collapsed the range) | Q→D | C | **done (PR #169, merged 2026-07-10).** Doc 17 §2 / Phase 1: engine_params **v21 INACTIVE** (`20260710000002` — `strength_sex_factor` {1,1}, `age_taper_floor_strength` 0.7, `bf_proxy_pct`), strength band personalized (target + recommended duration), hypertrophy continuity via the BMI-band bf% proxy (continuity golden), cut-band proportional rescale, goal-independent `MacroPlan.strengthRatePctMonth` (the N37 carrier), `macrocycles.plan_inputs` contract snapshot + goals-edit gate (principle 3), `profiles.birthdate` + derived age (`20260710000001`), doc 10 §5 amendments. Activation + target-card re-enable = doc 17 Phase R2 (`manual-operations.md`). Unblocked N37 (built in the next session). |

## Swept 2026-07-10 — est-strength rework merged (PR #157)

Reconciliation sweep at the doc-17 session start: N42's PR merged
2026-07-10 (after the row was stamped `done` in-PR). Full record in doc 10
§1/§6/§8, PROGRESS, and the Session-57 `log.md` entry.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| N42 | Est-strength rework: aggregated macro strength dropped the moment a new meso started | B→F | A | **done (PR #157, merged 2026-07-10).** Root cause: the first→last two-point delta let a fresh block's light RIR-ramp opener define the endpoint; and the Overview tile (top-3 key-lift mean) was a different aggregation from the Performance rollup. New pure `engine/strength.ts` `strengthTrend` (recent-best vs baseline-best, symmetric non-overlapping rolling windows; `engine_params.strength` optional → replay-safe, `DEFAULT_STRENGTH` fallback); `foldProgressScores` uses it; headline = volume-weighted mean of the muscle rollup — one definition for tile + tab; **key-lifts fold retired from the metric**. Confidence persisted (`logged_sets.e1rm_confidence`, migration `20260708000001` + backfill/restamp). Glossary rewrites + InfoDots + RIR in the history flip. Supersedes archived N16, extends N9. *(Filed as N36 in the PR session; renumbered twice at merge — N36–N39 were taken by the doc-16 spine, N40/N41 by the architecture doc.)* The doc-17 retrospective (N40) grades with this rollup. |

## Swept 2026-07-05 (later 2) — Session-51 quad merged (PRs #152/#153)

Session 51 closed the four unblocked items on PR #152; a same-session
follow-up (PR #153) fixed the pre-existing rls-tests CI regression from #151
and recorded the hosted deploy: both 2026-07-05 migrations applied via the
Supabase MCP, v19 replayed (0 changed / 0 errors over v18-sourced decisions)
and ACTIVATED via the admin MCP tool. Both PRs merged in-session → swept
in-session. Full record in PROGRESS "2026-07-05 (latest)", the 09 entries
"2026-07-05 (session 2)", and the Session 51 `log.md` entry.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| R24 | Engine guardrail batch (hold-week reprice-down remainder) | B | G | **done (PR #127 + #152; v19 LIVE).** Mechanical four shipped PR #127. Remainder: both reprice-down mechanisms fixed as engine_params v19 — `climb_requires_rir_step` (the Option-A +1 rep climb only on a real RIR step; top-out reset unconditional; kills the "−5 lb, +1 rep" ramp-hold move) + `hold_week_anchor_deadband` (a pure hold absorbs a sub-step anchor-decay shortfall; a full-step fall is real signal — the cut/maintain preserve-strength answer). Ramp-hold case golden under both param sets. Applied + replayed (clean) + activated 2026-07-05; v18 is the rollback target. Doc 13 §9.2 amended; runbook v19 step recorded done. |
| R25 | MCP polish (consolidation + error-contract remainder) | F | K | **done (PR #129 + #152).** Failure contract converged at the composition root (`{ok:false}` refusals now also `isError` — one signal, both dialects; error-contract test pins all four quadrants; docs/05 Failure-contract section). `place_mesocycle` → `manage_macrocycle_slots` action "place"; `list_engine_params` → `get_engine_params` no-arg browse (47→45 tools; verified live post-deploy). preview vs muscle-balance deliberately KEPT split (plan-pre-start vs trained-weeks) with cross-referencing descriptions. docs/05 drift fixed (stale regenerate row, summary-tool names, resource list). |
| N18 | Per-week independent RIR (create-time ramp, Parts A+B) | F | D | **done (PR #140 + #152; migration applied).** Part A: FinalizeSheet ADVANCED disclosure (START/END RIR + deload). Part B: `mesocycles.rir_schedule` (per-working-week array; deload week engine-owned), `rirRamp(schedule?)`, week-1 seed reads the ramp not `rir_start`, `mesoStaleSignature` gains the column (the only freshness change — `week.targetRir` was already fingerprinted, exactly as doc 14's worked example predicted), shared `RirScheduleEditor` behind both sheets' disclosure, MCP create/update/read + duplicate/copy carry. Doc 14 amended. |
| N29 | Filtering: picker filters + unified chip FilterBar | UX→F | F | **done (PR #148 + #152).** Picker half PR #148. Unification: one `components/ui/FilterBar.tsx` (fig 3.1 grammar — labeled chip tracks, ALL reset chip, ✕-to-clear, live count + CLEAR ALL) serves exercises (MUSCLE gains the ALL chip per the 3.1 spec), templates tab + from-template picker (selects → chips via shared `TemplateFilterPanel`; duplicated search-form collapsed; `TemplateFilters.tsx` retired), and the planner picker's equipment row. 09 entry "2026-07-05 (session 2)". |

---

## Swept 2026-07-05 (later) — N25 glossary InfoDot merged (PR #148)

Session 48 built N25 (plus the N29 picker half, whose row stays live for the
FilterBar remainder); PR #148 merged while the session was live, so the sweep
ran in-session. Full record in PROGRESS "2026-07-05 (latest)", the 09 entry
"2026-07-05 — Glossary info affordance", and the Session 48 (cont.) `log.md`
entry.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| N25 | Info/help screens for jargon app-wide: shared `InfoDot` primitive + one `glossary.ts` source; migrate the 2 ad-hoc feedback-sheet explainers; place incrementally | F | M | **done (PR #148).** `src/lib/glossary.ts` (11 terms; copy-contract test enforces all-caps labels, no exclamation marks, card-sized bodies, e1RM/deload honesty guardrails) + `components/ui/InfoDot.tsx` (circled-"i" grammar → anchored square glossary card, AnchoredMenu placement, modal a11y + refcounted scroll lock, stacks over sheets). Both feedback explainers migrated (workload no longer auto-expands — deliberate, in 09). Wave-1 dots: day-view header TARGET/DELOAD, meso calendar ramp footer, edit-details + finalize START RIR, planner volume readout, meso Volume SETS/WEEK, EST. STRENGTH headers, exercise EST. 1RM cell. Further placement is incremental adoption as screens are touched. |

---

## Swept 2026-07-05 — N33 + T-N33 merged (PR #147)

Session 47 investigated the owner's W5·D2 swap-provenance report end-to-end
(review doc `docs/reviews/2026-07-04-swap-prescription-provenance.md`), built
both items on PR #147, and the PR merged after the session — swept at the next
session start per the resume protocol. Full record in PROGRESS "2026-07-05
(latest)" and the Session 47 (cont. 3) `log.md` entry.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| N33 | Exercise swap writes prescriptions out-of-band → incoherent audit state + doc-14 blind spot (swap bypassed the engine; framework blind to exercise identity) | B | G | **done (PR #147).** `queries/slot-prescription.ts` resolver: swap (`replaceWorkoutExercise`) and add (`addWorkoutExercises`) both compute via the engine — advance off the §9 lookback source (most recent same-day-slot instance with logged working sets within 2 weeks, set-less N-1 fallback) else the doc 14 §6.2 cold seed; full tuple + rationale + fingerprint + decision written. Reconcile gains the `dropForeignDecisions` exercise-identity replay guard + the §9 lookback in the §7c backfill. Detail sheet gains the out-of-band tripwire (false "re-verified" line replaced by an explicit divergence note). Golden test restores the owner's case: swap-back yields 215×10@6RIR·2. Doc 14 §6.2 amended. |
| T-N33 | Stored per-set e1RM stamps (`logged_sets.e1rm`) stale across params versions (384.2 log-time stamp vs 367.5 live v11 estimate) | D→F | G | **done (PR #147).** Owner decided restamp-on-activation: `queries/e1rm-restamp.ts` wired into MCP `activate_engine_params` — restamps only when the `e1rm` block changed, chunked PK upserts on the service client, idempotent, counts in the tool result. Golden test: 245×15 restamps 384.2 → 367.5. Caveat: migration-activated versions bypass the hook — activate via the MCP tool when a proposal touches the `e1rm` block. |

---

## Swept 2026-07-04 (later 5) — N32 history-sheet fixes merged (PR #145)

Session 46 root-caused the owner's field report on the PR #144 drill-down and
fixed it on the open sweep PR; merged while the session was live, so the
sweep ran in-session. Full record in PROGRESS 2026-07-04 "N32", the 09
"2026-07-04 (session 5)" entry, and the Session 46 (cont. 2) `log.md` entry.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| N32 | History-sheet fixes from N15 testing: sheet "not scrollable" / background moved; revert e1RM-first opening; link the exercise name | B+UX | E | **done (PR #145).** Root cause was N6 × the scroll lock — `position:fixed` zeroes `window.scrollY`, so `PullToRefresh` armed on every drag over any open sheet (all sheets since N6, not an N15 defect). Fix: `isScrollLocked()` guard in `PullToRefresh`, `overscroll-contain` + touch isolation on `BottomSheet`. Drill-down opens on sets/reps (`initialFlipped`/`e1rm_first` removed; PH32 default holds everywhere). Sheet subtitle's exercise name links to `/exercises/{id}` on every entry point (`BottomSheet.subtitle` → ReactNode). |

---

## Swept 2026-07-04 (later 4) — Batch-7 build 3 merged (PR #144)

Session 46 built the fourth attack-order slot (N24) plus the N15 stats slice
and the three small ready items; merged with checks green while the session
was live, so the sweep ran in-session. Full record in PROGRESS 2026-07-04
"Batch-7 build 3", the 09 "2026-07-04 (session 4)" entry, and the Session 46
`log.md` entry.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| N15 | Macro muscle groups drill to a macro/meso-scoped exercise history, e1RM-first | F | C | **done (PR #144).** `getExerciseHistory` gains `scopeMesoIds` (N30 day-grain pagination applies within scope); macro contributor rows + meso ALL EXERCISES rows open the scoped `HistorySheet` (`meso_ids`/`scope_label`/`e1rm_first` on the target), opening on the e1RM view with tap-to-flip to sets/reps (PH32 inverse for this entry point). MCP `get_exercise_history` contract unchanged. |
| N24 | Macrocycle views adopt the shared header | UX | D | **done (PR #144).** Sticky `MacroHeader` on the shared header grammar (brand row, title + ⋮ `AnchoredMenu` with Edit macrocycle → the existing `/edit` route, meta + status badge, goal-notes line); bottom EDIT MACROCYCLE link removed; skeleton mirrored. Header unification complete across day view / meso / exercise / macro. |
| N26 | Day-view set rows +~10% | UX | E | **done (PR #144).** 35px cells / 15px values / 23px LOG box / 5px row padding; R18 tap targets grown to 44×35px; grid templates untouched. |
| N27 | Back links honor origin (meso stats from day view) | UX | E | **done (PR #144).** Producer appends `&from=/log/<id>`; meso page validates with the N4 guard and threads `backHref`/`backLabel` into `MesoHeader` (`‹ WORKOUT` when honored). |
| N28 | Re-sort macros/mesos newest-first | UX→B | D | **done (PR #144).** Pure `orderCyclesTopLevel` (`start_date ?? created_at` desc, `created_at` tie-break) on the /cycles top level; `created_at` was an import-order artifact. Within-macro order untouched. 3 unit tests. |

---

## Swept 2026-07-04 (later 3) — N31 planner replace fix merged (PR #143)

Session 45 fixed the Batch-8 planner-substitution bug; merged, swept at the
Session-46 resume. Full record in PROGRESS 2026-07-04 "Batch-8 fix", the 09
"2026-07-04 (session 3)" entry, and the Session 45 `log.md` entry.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| N31 | Planner board: tapping a filled row appended the pick instead of replacing in place (grew the slot count, left an empty slot after cleanup) | B | D | **done (PR #143).** `PickerTarget.replaceFill`: a filled-row tap opens the picker in replace mode — single-select, seeded with the current movement, rows already filling another slot of the group disabled (`ALREADY IN THIS GROUP`), `REPLACE EXERCISE` submit. Swap keeps the fill's id/day position/slot/sets: staged in editing mode, `replaceSlotAction` → `replaceSlotExercise` single-row update on live drafts (+ duplicate guard, 5 unit tests). Open-slot taps keep the multi-select. |

---

## Swept 2026-07-04 (later 2) — Batch-7 build 2 merged (PR #142)

Session 44 built the third attack-order slot (N22+N23) with the N30 rider;
merged, swept at the Session-45 resume. Full record in PROGRESS 2026-07-04
"Batch-7 build 2", the 09 "2026-07-04 (session 2)" entry, and the Session 44
`log.md` entry.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| N22 | Exercise surfaces overhaul (header + create rebuild + MCP parity) | F+UX | F | **done (PR #142).** (a) Sticky `ExerciseHeader` on the meso-header grammar ([share][⋮] on `AnchoredMenu`); `LoadStepSheet` menu-driven, disabled-not-hidden on bodyweight-only; share off the OVERVIEW tab; in-app delete for owned custom exercises with the MCP tool's guards. (b) Create page rebuilt in ledger sections, load step settable at creation (per-equipment default from `engine_params.rounding`). (c) `create_custom_exercise` +notes/+weight_increment; new `set_exercise_increment` tool (doc 05 updated). |
| N23 | Exercise sharing entry points — the new-exercise tray | F | F | **done (PR #142).** `NewExerciseButton` chooser (Blank exercise / OR ADD FROM A CODE with the kind-agnostic `RedeemForm`) replaces the bare `+ NEW` link. Backend untouched — sharing already worked; this completes the receptacle set (templates PH27, cycles N20). |
| N30 | Full exercise history reachable (120-set silent cap) | F | C | **done (PR #142).** `getExerciseHistory` cursor-paged on whole calendar days (`pageSetsByDay`, pure + unit-tested — import-artifact identical timestamps can't split/dupe a session across pages); `LOAD OLDER` IntersectionObserver row in `ExerciseHistoryList`; HISTORY tab + `HistorySheet` inherit; MCP first-page contract unchanged. N15's scoped variant should reuse this pagination. |

---

## Swept 2026-07-04 (later) — Batch-7 build 1 merged (PR #140)

Session 43 built the first two attack-order slots; merged with checks green
while the session was live, so the sweep ran in-session. Full record in
PROGRESS 2026-07-04 (latest), the 09 2026-07-04 entry, and the Session 43
`log.md` entry. **N18** (Part B per-week RIR open) and **N21** (target-engine
correction needs-decision) keep live rows for their remainders.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| N14 | Macro muscle-group rollup: bogus "starting e1RM of 7" endpoint | B | C | **done (PR #140).** `dropE1rmOutliers` in `foldProgressScores`: sessions >3× from the exercise's window median (either direction) are dropped from the trend endpoints and the qualification count; <3 sessions keeps all. Kills order-of-magnitude mis-logs; a genuine within-window doubling survives. |
| N16 | "EST. STRENGTH · KEY LIFTS" tile contradicts the Performance tab | B | C | **done (PR #140).** Bespoke `buildMacroStats` fold deleted; the tile reads `getProgressScores` → pure `keyLiftStrengthPct` (top-3 **qualifying** by frequency, deload-filtered) — one definition with the Performance tab; MCP `get_macrocycle_summary` inherits. Deload-tail regression test. |
| N17 | Planner: no way to edit # of sets per exercise | F | D | **done (PR #140).** −/＋ START SETS stepper on each filled board row (compact group-stepper grammar); staged in edit mode, live `updateFillSetsAction` → `updateMesoExerciseSets` on drafts; clamp 1–20. Pick-time default stays 3. |
| N20 | Enter-share-code in the new-cycle tray | UX | D | **done (PR #140).** `NewCycleButton` sheet mounts the kind-agnostic `RedeemForm` under OR ADD FROM A CODE (template-tray pattern). Rode with the planner slice instead of N23. |

---

## Swept 2026-07-04 — N19 dropped at the Batch-7 addendum

Same-session sweep during the Batch 7 intake: the owner reviewed the intake
findings and dropped the archival idea outright, so the row never reached a
build session.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| N19 | Archive macros/mesos (view/unarchive under profile); never allow full deletion | F | D | **wontfix (owner 2026-07-04).** "Drop the archival bit. Its really not important." Scoping preserved in `scoping.md` § N19 in case it returns. The finding it surfaced — the app's meso delete cascades logged history behind an ack checkbox while MCP refuses (rule-5 spirit gap) — was **not** ruled on and is worth revisiting if the delete flow is ever touched. |

---

## Swept 2026-07-03 (later 7) — I12 completed + N13 first-set reset fix merged (PR #137)

Session 41 closed the last open HIGH feature and the Batch-6 bug in one PR;
merged with all checks green while the session was live, so the sweep ran
in-session. Full record in PROGRESS 2026-07-03 (latest) and the Session 41
log entry; the four new surfaces' design of record is the 09 2026-07-03
session-4 entry (owner-authorized design — no mockups existed, so the owner's
field feedback is the acceptance check; reopen anything that doesn't hold up).

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| I12 | Address mesocycle management under a macrocycle | F | D | **done — merged (PR #137;** PR #92 MCP, PR #134 first slices**).** In-app now covers the whole MCP authoring set: Place-into-macrocycle sheet (exact landing per row — fills the open slot inheriting its phase, or appends), Edit-details sheet (name any time; weeks/RIR/deload until start), BLOCKS management on the macro edit page (▲▼ never crossing started history, ✕ on open slots, + ADD BLOCK), WEEKLY SETS PER MUSCLE live readout on the planner board (shared R14 fold in `lib/plan/volume-preview.ts`, MEV/MRV bands). Deliberately MCP-only: explicit-position placement, phase editing. |
| N13 | Reset-to-prescription broken on the exercise's first set | B | G | **done — merged (PR #137).** R13-era root cause: the reset echo (override → null) arrived via the planned-input channel whose typed-row guard never releases on an unlogged row — and set 1 is necessarily typed-in. New `prescription-reset` class in `adoptServerRowState` always adopts + clears the flag; null→null transitions keep the R13 mid-typing protection; N5 swap remount verified intact. |

---

## Swept 2026-07-03 (later 6) — R21 coverage suite merged (PR #134)

Session 40 shipped R21 (all three bullets) alongside the N1 skeleton slice and
the I12 scoping + first slices; PR #134 merged with all checks green — the new
CI e2e job and the integration suite ran green on the final commit — so the
sweep ran in-session on a follow-up docs PR. Full record in PROGRESS
2026-07-03 (latest) and the Session 40 log entry. I12 and N1 stay live
(in-progress rows) — only R21 was completed outright. Bonus fix that rode
along: the e2e surfaced a real 414 on `/exercises` (330-id `.in()` query
string) — `listExercises` now joins the RLS-scoped link table in memory.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| R21 | Coverage gaps: Playwright e2e suite absent (dead `test:e2e`); no write-pipeline integration tests; golden meso only covers no-anchor v10 shape | F | L | **done — merged (PR #134).** (a) `golden-meso-live.test.ts`: v18-params full-meso golden with a week-to-week `recencyWeightedE1rm` anchor — pins anchor seed, window-bounded rep climb, anchor-based RIR-6 deload, bodyweight_loadable effective-load pricing. (b) `tests/integration/write-pipeline.test.ts` (+config, `test:integration`, riding the CI rls-tests job): plan → `startMeso` seed → `logSet` upsert/flip → feedback → `completeWorkout` → `advanceWeekAfterWorkout` generation/rollover + the R15 refusal. (c) Playwright e2e smoke + CI e2e job: UI sign-in → START → log (incl. auto-prompted feedback sheet) → complete → asserts the engine-generated W2·D1. |

---

## Swept 2026-07-03 (later 5) — N12 + N9 + N10 + N6 WS-J slice + Performance reorg merged (PR #132)

Session 39 shipped the next two slots of the attack order plus N6; PR #132
merged with all checks green the same session, so the sweep ran in-session on
a follow-up docs PR (a merged PR can't sweep its own rows). Full record in
PROGRESS 2026-07-03 (latest) and the Session 39 log entry; N9/N10's design
delta is the 09 2026-07-03 (session 2) entry. The N12 on-device feel (set-log
round-trip + no hung spinner) and the N6 gesture remain flagged for the
owner's spot-check — reopen if the device check fails.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| N12 | Set logging takes seconds; spinner occasionally never resolves (write actually landed) | B | J | **done — merged (PR #132).** Latency: `logSet`'s 4 serial stamp SELECTs → 1 embedded read (live-validated); `in_progress` flip skipped past planned; reconcile-gate watermark reads closed workouts only, so the first set no longer busts the gate. Hang: spinner tracks the server action (15s watchdog), acknowledges on write-confirm, revalidation echo remounts the row; timeout = retryable shake+toast (R3 upsert converges). J-Phase-2 #5 deferred with #7; #6 assessed & dropped (bytes, not round trips). |
| N9 | Macro Performance: muscle-group strength gain primary, per-group exercise drill-down; flat list dropped at macro scope | F | C | **done — merged (PR #132).** `rollupMuscleProgress` carries `contributors[]`; new `MuscleStrengthSection` (▸/▾ drill-down) on the macro Performance panel; meso tab untouched; MCP unaffected. 09 delta recorded. |
| N10 | Meso Performance: drop TOP SET BY WEEK + ACROSS MACRO sections (macro-scope content on a meso view) | F | C | **done — merged (PR #132).** `buildKeyLifts` + top-set fold + chart query + types deleted (~230 lines net); `contextLine`'s meso position re-derived from the macro's meso ordering (decoupled from `keyLifts[0]`). |
| N6 | Pull-to-refresh on day view + cycles pages (installed PWA = no native PTR) | F | E | **done — merged (PR #132).** One `PullToRefresh` wrapper in `(app)/layout.tsx` covers every page; armed at `scrollY === 0`, `router.refresh()` in a transition, travelling-gap indicator; `overscroll-behavior-y: contain` prevents Android double-fire. |

---

## Swept 2026-07-03 (later 4) — N5 + N7 + N8 + N11 Batch-5 quick fixes merged (PR #131)

Session 38 shipped the four scoped one-file Batch-5 items in one PR; PR #131
merged with all checks green. Full record in PROGRESS 2026-07-03 and the
Session 38 log entry; N8's design delta is a dated 09 entry (figs 2.1/2.2).
N5 + N7 remain flagged for the owner's on-device spot-check (N7 is
installed-iOS-PWA-specific) — reopen if the device check fails.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| N5 | Replace-exercise leaves the OLD exercise's weight/reps on set 1 only (PH38's symptom, different mechanism: retained client `useState` on the editable first row) | B | G | **done — merged (PR #131).** `SetRow` key now includes `we.exercise_id`; a replace remounts the rows and set 1 re-initializes from the new prescription. Re-sync effects untouched (R13 semantics preserved). |
| N7 | Note-sheet keyboard dismiss leaves page scroll lower than the start | UX | E | **done — merged (PR #131).** `useScrollLock` captures `scrollY` + applies `position:fixed; top:-scrollY; width:100%`; release restores styles and `scrollTo`s the saved offset. One file — covers every sheet/menu. |
| N8 | Planned-meso badge: PLANNED text badge, checkbox only when completed, mute planned + unplanned | UX | D | **done — merged (PR #131).** `/cycles` `StatusMark` planned → ink PLANNED badge (CURRENT geometry); macro timeline planned rows swap the progress bar for the badge (numbered marks stay); muting widened on both surfaces. 09 delta recorded (figs 2.1/2.2). |
| N11 | Deload sets show ▼ at exactly-prescribed weight+reps (RIR-asymmetric marker comparison) | B | G | **done — merged (PR #131).** Marker extracted to pure `day-rules.ts::loggedSetMarker`; unreported RIR compares both sides at the week's target RIR (`rir_reported ?? targetRir`). 6 unit tests incl. the deload regression. |

---

## Swept 2026-07-03 (later 3) — R23 repo hygiene merged (PR #122)

Session 36 (cont. 3) shipped the hygiene batch; PR #122 merged with all checks
green. Migrations `20260703000002` + `20260703000003` applied live. Full
record in PROGRESS 2026-07-03 and the Session 36 (cont. 3) log entry.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| R23 | Repo hygiene: 2 unused-but-live server actions (attack surface), dead exports/components (NumberStepper stale-closure), dead `v_muscle_group_volume` view, dep nits (analyzer major, tsx, dependabot) | F | L | **done — merged (PR #122).** Dead endpoints (`reorderGroupExercisesAction`+query, `saveProfileDetails`), dead exports (`listMacrocycles`, `setExerciseStatus`, `confidenceRank`), 7 barrel over-exports, 6 dead components deleted; `v_muscle_group_volume` **and** the superseded `v_meso_week_sets` retired (migrations `20260703000002/3`, applied live — resolves root CLAUDE.md's pending-retirement note); analyzer aligned to next-15, `tsx` devDep, dead vitest include dropped, dependabot added. |

---

## Swept 2026-07-03 (later 2) — R22 env validation merged (PR #121)

Session 36 (cont. 2) shipped the first of the LOW tail; PR #121 merged with
all checks green. Full record in PROGRESS 2026-07-03 and the Session 36
(cont. 2) log entry.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| R22 | Env vars unvalidated at boot — missing/typo'd var passes build (CI placeholders), fails as request-time 500s inside @supabase/ssr | F | L | **done — merged (PR #121).** New `src/lib/env.ts` (zod, parsed once, every offending var named); all four supabase factories + the MCP auth bridge read through it; `next.config.ts` asserts presence at build/dev boot. Service-role key stays confined to `service.ts` (hard rule #4). 6 unit tests; build verified both directions. |

---

## Swept 2026-07-03 (later) — R15 single-active-meso merged (PR #120)

Session 36 (cont.) shipped the next WS-D item; PR #120 merged with all checks
green (`rls-tests` ran the new constraint probe against the migrated chain).
Migration `20260703000001` applied live + verified (no pre-existing
violations; advisors unchanged). Full record in PROGRESS 2026-07-03 and the
Session 36 (cont.) log entry.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| R15 | Second concurrently-active meso possible — sequential-activation invariant only covers same-macro siblings; `get_current_state` silently picks newest; tool description overstates the guarantee | B | D | **done — merged (PR #120).** `startMeso` gate now user-wide (ANY active meso blocks, named in the error; macro-position gate unchanged behind it; in-app + MCP share the choke point); partial unique index `mesocycles_one_active_per_user` makes it race-safe (losing flip → friendly 23505 error; pre-flip seeding R3-retry-safe); `activate_mesocycle` description states the exclusive contract. Scratch-chain green + 4-step probe + RLS-suite test. |

---

## Swept 2026-07-03 — R11 + R12 engine-I/O fixes merged (PR #119)

Session 36 shipped the next two WS-G items; PR #119 merged with all checks
green. TS-only (no schema change; the engine itself untouched). Full record in
PROGRESS 2026-07-03 and the Session 36 log entry.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| R11 | Reconcile's unbounded `engine_decisions` fetch truncates at the PostgREST row cap → open rows misclassified decision-less and re-seeded off the prior-meso peak | B | G | **done — merged (PR #119).** `latestDecisionsByRow` pages the fetch in a stable (`created_at desc, id desc`) order with early exit once every open row has its newest decision; 5 unit tests incl. the beyond-page-1 truncation regression. Grounded live: hosted at 641 decisions (max 38/row) and climbing. |
| R12 | Custom bodyweight exercises stored `load_type='external'` forever (wrong e1RM/effective-load math; app + MCP) + MCP create/search equipment as bare string + dup muscle-group crash leaves orphan exercise | B | G | **done — merged (PR #119).** `createCustomExercise` derives `load_type` via `toEngineLoadType` at insert; create vocabulary (new `src/lib/types/equipment.ts`, shared app form + action schema + MCP) drops load-ambiguous bare `"bodyweight"` for the three load-typed labels; MCP equipment args zod-enum'd (hard rule #6); `dedupeMuscleRoles` + link-failure cleanup kill the orphan path. No backfill needed — hosted verified to have zero custom / bare-bodyweight rows. |

---

## Swept 2026-07-02 (late 3) — R9 + R10 analysis fixes merged (PR #117)

Session 35 (cont. 3) shipped the next two WS-G items; PR #117 merged with all
checks green. TS-only (no schema/engine change — both fixes sit outside
`src/lib/engine/`; the replay fix makes the harness faithful, it changes no
engine output). Full record in PROGRESS 2026-07-02 and the Session 35
(cont. 3) log entry.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| R9 | `analyze_exercise_progress`: any phase with ≤3 sessions reads "improving", even a strict decline (every phase start asserts improvement) | B | G | **done — merged (PR #117).** Short phases (no prior baseline) read the trend within the window — latest vs first, tolerance-banded (declining/improving/plateau); longer phases take the same branches as before. New 4-case trend test; the flat day-slot series still reads plateau, never declining. |
| R10 | Replay re-runs seed decisions without `bodyweight` → every bodyweight-lift seed diffs spuriously, corrupting the params tuning loop | B | G | **done — merged (PR #117).** `replay_decisions`' seed branch passes the stored `bodyweight` to `seedMeso`; regression test replays a v16 bodyweight seed unchanged (verified failing without the fix, and it asserts a real priced load so it can't pass vacuously). |

---

## Swept 2026-07-02 (late 2) — R5 + R7 hardening merged (PR #116)

Session 35 (cont. 2) shipped the next two WS-K items; PR #116 merged with all
checks green (`rls-tests` ran the 9 new completion-lock tests against the
migrated chain). Migration `20260702000006` applied live, per-table policy
state hash-verified against the scratch chain. Full record in PROGRESS
2026-07-02 and the Session 35 (cont. 2) log entry.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| R5 | Completion lock bypassable/asymmetric (completed→in_progress flip; `workout_exercises`/`workout_feedback` mutable post-completion; sets insertable into completed workouts) + child INSERT policies skip parent-ownership (feedback-slot squat) | B | K | **done — merged (PR #116).** Migration `20260702000006_completion_lock_hardening`: workouts update-open/insert-planned-own-micro/delete-planned-no-history; workout_exercises + workout_feedback + logged_sets INSERT + exercise_feedback INSERT/WITH CHECK gated on owned, planned/in_progress parents (slot squat closed); microcycles update-not-completed/insert-own-meso/delete-no-history. Authed write-path inventory first — completion writes land pre-flip, nothing legitimate blocked. 29 scratch probes + 9 RLS suite tests; applied live + hash-verified. |
| R7 | Service worker caches authed pages/RSC ~24h, never purged on sign-out (stale prescriptions offline + shared-device privacy; contradicts online-only) | B | K | **done — merged (PR #116).** `sw.ts` runtime caching trimmed to static assets (documents/RSC/`/api/` NetworkOnly — built `sw.js` has zero NetworkFirst handlers); precached `/~offline` ledger interstitial served on offline navigations; `ClearClientCaches` on auth screens purges non-precache CacheStorage + the `lastWorkoutId` pointer. |

---

## Swept 2026-07-02 (late) — T-R2 hosted-migration transcription merged (PR #115)

Session 35 shipped the follow-up table's last `ready` item; PR #115 merged with
all checks green (`rls-tests` rebuilt the chain with the new file). SQL-only —
no app change, no hosted apply (hosted already recorded the version). Full
record in PROGRESS 2026-07-02 (latest) and the Session 35 log entry. The
hosted↔repo drift R2 documented is now fully closed (runbook annotated).

| ID | From | Title | Type | Resolution |
|----|------|-------|------|------------|
| T-R2 | R2 | Capture the out-of-band hosted migration `20260620115322_perf_rls_initplan_and_fk_indexes` in the repo chain (56 initplan-wrapped policies + 23 FK indexes, hosted-only) | F | **done — merged (PR #115).** Body transcribed verbatim from hosted `schema_migrations.statements` (base64-fetched, md5-verified `25446aa1…`), placed at its true chain position with the two time-capsule references documented (`shares_grantee_accept`, pre-fix `profiles_update_own` — both superseded later in the chain, as on hosted). Scratch-PG16 verification: chain applies from zero; end-state policy + index aggregate hashes identical to hosted (56 policies `15f40291…`, 105 indexes `037f0d6d…`); negative control without the file diverges by exactly the documented drift. |

---

## Swept 2026-07-02 (night) — R20 observability merged (PR #112)

Session 34 shipped the review's HIGH observability item; PR #112 merged with
all checks green. No schema change, no new dependency. Raw text stays in the
backlog appendix (Batch 3); full record in PROGRESS 2026-07-02 (latest) and the
Session 34 log entry. 07 Phase 7 "Error handling/observability" is ticked.
Remaining external step: set `SENTRY_DSN` in Vercel (manual-operations row
updated — the structured console floor is live regardless).

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| R20 | Zero production error observability — reconcile/generation/MCP failures swallowed (silently stale prescriptions); no `global-error.tsx`/`(auth)` boundary; SENTRY_DSN pending but unread | F | L | **done — merged (PR #112).** One `reportError()` funnel (`src/lib/observability/`): structured `[report:<scope>]` console line always (Vercel logs capture pre-config) + dependency-free Sentry envelope delivery when `SENTRY_DSN` is set (no SDK — client bundle is a live N1 concern; pure wire-format builders, never throws). `instrumentation.ts` `onRequestError` global server capture; the 5 deliberate swallow sites (freshness reconcile, seed decisions, complete/end week generation, workout-tab catch-up) + MCP tool guard report before degrading; new root `global-error.tsx` + `(auth)/error.tsx` boundaries; same-origin-guarded, zod-capped pre-auth `/api/client-error` intake. 713 tests (+20); end-to-end probed against a mock ingest. |

---

## Swept 2026-07-02 (evening) — R3 + R4 write integrity merged (PR #110)

Session 33 shipped the review's write-integrity pair (attack order after
R17/R16); PR #110 merged with all checks green (incl. `rls-tests` on a
from-scratch stack — also verified locally pre-push, a first since R2 revived
the suite). Migration `20260702000005` applied live + verified before merge.
Raw text stays in the backlog appendix (Batch 3); full record in PROGRESS
2026-07-02 (latest) and the Session 33 log entry.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| R3 | Non-atomic plan/param writes: `saveMesoPlan` delete-then-insert can wipe an (active) plan; `startMeso` half-apply = permanently unstartable meso; `generateDay` poisoned empty day; `activateEngineParams` can leave ZERO active params app-wide; missing uniques let races duplicate days/sets | B | K | **done — merged (PR #110).** `save_meso_plan` (ownership-guarded) / `activate_engine_params` / service-only `insert_generated_day` DB functions — one transaction each (migration `20260702000005`); `insert_generated_day` also adopts+fills poisoned empty days and `planCatchUp` flags them as gaps; `startMeso` retry-safe (recorded deviation: seed math stays pure-TS per rule 3); unique keys `workouts (microcycle_id, day_number)` + `logged_sets (workout_exercise_id, set_number)` with `logSet` upsert semantics — 11 live retry-storm duplicate groups (15 excess rows) deduped in the migration (recorded rule-5 deviation, newest kept); MCP `create_mesocycle` validates dup days/groups + exercise existence before any write + orphan-draft compensation; `edit_mesocycle add_day` rejects same-group-twice days. |
| R4 | Plan regeneration cascade-deletes logged history (`regenerateOpenWorkouts` skips the logged-set check; `logSet`'s status flip silently swallowed → hard-rule-#5 breach path) | B | K | **done — merged (PR #110).** Both delete branches exclude anything with logged sets (pure `withoutLoggedHistory`, the `removeWorkoutExercise` pattern; kept rows stay in `haveIds` so they aren't re-added); `logSet` status-flip error surfaced; `completeWorkout` per-exercise statuses batched + error-checked. |

---

## Swept 2026-07-02 (build 2) — WS-C consumers + I14 merged (PRs #104, #105)

Session 32 shipped the Batch-4 consumer half (stats screens + meso surface +
nav/date fixes, PR #104) and the slider unification with its data migration
(PR #105, stacked); both merged. Raw text stays in the backlog appendix; full
record in PROGRESS 2026-07-02 and the two Session 32 log entries. Migrations
`20260702000003` (R6 `performed_on`) and `20260702000004` (I14 rescale + v18
activation) were applied live and verified before merge.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| M8 | Stats unification: meso gets est-strength under performance; macro gets overview+balance+performance 3-way toggle | F | C | **done — merged (PR #104).** Macro page gains OVERVIEW\|BALANCE\|PERFORMANCE (Balance = macro-scope 4.1 view over materialized weeks; Performance = I11/PH37 sections); meso side shipped through P16; tab naming reconciled to BALANCE on both (09 2026-07-02 §1); rule-8 no-mockup deviation recorded. |
| I11 | Meso stats rework — est-strength %-change for all exercises | F | C | **done — merged (PR #104).** EST. STRENGTH — ALL EXERCISES on meso+macro Performance: %-change per exercise logged ≥3 non-deload sessions (engine e1RM, undecayed, deloads excluded); `sessions` exposed via MCP summaries. Live check: 18/24 exercises qualified in the active meso. |
| I14 | Raise complete-workout feedback slider resolution to match per-exercise feedback | F | E | **done — merged (PR #105).** All sliders one 0–10 scale; stored `workout_feedback` rescaled round(x×2.5); **engine_params v18** (thresholds 8/3) ACTIVATED in migration `20260702000004` (recorded deviation — rescale and thresholds inseparable); exhaustive scale-equivalence test; applied live + verified. |
| P16 | Meso page rework: Overview\|Volume\|Performance toggle + planner-style overview + header actions | UX | C/D | **done — merged (PR #104).** Day-view-style sticky header (calendar dropdown = week×day matrix with clickable days, share sheet, ⋮ menu = edit/save-template/delete, meso progress bar) + the three-way toggle; Overview = read-only planner board; `/stats` route redirects into the toggle. Deviations + tab naming in PROGRESS / 09 2026-07-02. |
| P17 | Remove page back-button when day dropdown selects a new day | UX | E | **done — merged (PR #104).** `/log/[workoutId]` renders no back button (option 2 — the day navigator lives inside the Workout tab). |
| PH37 | Aggregate strength gains per muscle group over macro/meso | F | C | **done — merged (PR #104).** STRENGTH BY MUSCLE GROUP on meso+macro Performance — role-weighted mean (primary 1.0 / secondary 0.5 via `engine_params.volume`) of I11's qualifying %-changes; `muscle_group_progress` on both MCP summaries; all-time dropped per owner. |
| R6 | Workout dates & week rollups computed in UTC — evening sessions land on tomorrow's date | B | K | **done — merged (PR #104).** `logged_sets.performed_on` (client-local day; migration `20260702000003` applied live, 10,821 rows backfilled) written at log time; `v_exercise_history` re-bucketed on it; the 6 `shortDate` copies collapsed into `lib/dates.ts`. |
| N4 | Back button should return to origin on deep-link (day view → view exercise → back) | UX | E | **done — merged (PR #104).** "View exercise" carries `?from=/log/<id>`; the exercise page back control validates the path and returns to the originating day view. |

---

## Swept 2026-07-02 (build 1) — metric-definition foundation merged (PR #103)

Session 31 built the Batch-4 dependency-first foundation (fractional volume +
e1RM standardization + deload exclusion) plus the fitting quick wins; PR #103
merged. Raw text stays in the backlog appendix; full record in PROGRESS
2026-07-02 and the Session 31 log entry. Both migrations were applied live and
probe-verified before merge.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| R14 | Volume counting is primary-only — doc 10's fractional 1.0/0.5 + RIR≤4 hard-set rule unimplemented | D→F | C | **done — merged (PR #103).** Role-grain `v_meso_week_muscle_sets` (applied live) + one shared fold (`engine/volume.ts::fractionalSetCount`, tunable `volume.direct/indirect`) across stats/MCP/projection/engine ceiling input; RIR≤4-or-unreported hard-set rule baked in the view. Recorded deviation: `counting_max_rir`/`warmups_count` are view-baked doc defaults, not live params. Old `v_meso_week_sets` + dead `v_muscle_group_volume` retire with R23. |
| P18 | Remove the set-type option from the set menu | UX | E | **done — merged (PR #103).** Menu affordance hidden; drop-set data model (`set_type`, DROP badge) left dormant per the owner's ruling. |
| P21 | Should soreness be recorded when user reports 0 days sore? | D | H | **done — merged (PR #103), verified no-op.** Current behavior already stores an explicit 0 (`soreness_days` picker gates on `=== null`; 0 is a real value through save). |
| PH33 | Scope admin MCP tools as private (hidden from non-admins) | F | H | **done — merged (PR #103).** `mcp/visibility.ts` wraps the SDK tools/list handler with a `profiles.role` filter; per-call `resolveAdmin` denial unchanged; fails open to visible-but-denied if SDK internals shift. |
| T-A1 | Reconcile the two e1RM systems; decide what each screen shows | D→F | A | **done — merged (PR #103).** Engine e1RM everywhere: `v_exercise_overview`/`v_meso_summary` `best_e1rm` = max stored per-set engine e1RM; `v_exercise_history.best_set_e1rm` added; raw Epley retired (`epleyE1rm` deleted). Stats show undecayed values; decay stays prescription-only; 30-day half-life confirmed MCP-tunable (`e1rm.recency_halflife_days`, v17). Answers PH39. |
| T-A2 | Decide + document deload handling in stats | D→B | A | **done — merged (PR #103).** `getMesoProgressScores` skips deload-microcycle sessions; volume + PR stats keep deloads; denoted in the MCP metric definitions/notes. |

---

## Swept 2026-07-02 (later) — owner decision batch (Batch 4): terminal items

Session 30 processed the owner's decisions on every open `needs-input` item
(backlog appendix Batch 4). Two items reached a terminal state and are swept
here; the rest were decided-and-kept-live as `ready`/`deferred` rows (see the
Session 30 `log.md` entry). Raw text stays in the backlog appendix.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| M10 | Show only *unplanned* mesocycles on the macrocycle overview page | UX | D | **wontfix (owner 2026-07-02).** "Eh, drop that. Leave unplanned mesos there as they are. Drop this idea." The macro timeline keeps showing all mesos (matches doc 09's full chronological ledger). |
| T-A6 | Seed a new meso from the recency anchor / rep high-water-mark, not just the top-weight PR | F | A | **done — resolved by WS-I (owner-confirmed 2026-07-02).** The prior-peak × back-off seed was retired entirely (PRs #72/#80/#81/#82); seed precedence is now confident recency anchor → user `initial_*` → unseeded/prompt, which delivers what T-A6 asked for. Owner: "Yes, I believe this is addressed and T-A6 can be closed." |

---

## Swept 2026-07-02 — R13 + R18 + R19 UI/UX cluster merged (PR #100)

Session 29 shipped the three open UX-facing items on the day-view surface (per
the owner's steer toward documented UI issues); PR #100 merged. Raw text stays
in the backlog appendix (Batch 3); full record in PROGRESS 2026-07-02 and the
Session 29 log entry. On-device confirmation of the R13 flow (type reps, log a
different set with auto-match on, confirm the typed value survives) remains the
owner's final check.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| R13 | SetRow re-sync effect clobbers in-progress typing after background weight writes / auto-match — wrong reps can get logged | B | G | **done — merged (PR #100).** Re-sync effect split: own-logged-set changes (log/unlog/amend echo) always adopt server state; planned-input changes (`set_weights`/bodyweight via auto-match fan-out or blur-persisted weight) adopt only while the row has no uncommitted typing — explicit input wins. Pure `day-rules.ts::adoptServerRowState`, unit-tested. Client-side cousin of the shipped N3. |
| R18 | Modal a11y + touch: no focus management/Escape/trap on any sheet/menu; LOG checkbox 21px & ⋮/▲▼ below-minimum targets; `maximumScale:1` kills pinch-zoom. Scopes doc-07 Phase-7 a11y audit | UX | E | **done — merged (PR #100).** Shared `useModalA11y` (focus in/restore, Tab trap, Escape via overlay stack) wired into BottomSheet, CompleteSheet (+ its missing role=dialog), AnchoredMenu (menuitem roles + arrow-key nav). Tap targets to the WCAG 24px floor with visuals unchanged: LOG checkbox fills its 44×32 cell, per-set ⋮ 24×32, planner ▲▼ 24×24. **Zoom-cap bullet ruled wontfix** (owner 2026-07-02: installed-PWA native feel; `maximumScale:1` stays, ruling recorded on the viewport config). Full doc-07 Phase-7 logging-flow a11y audit remains its own phase item. |
| R19 | Small defect sweep: no `not-found.tsx` (Workout tab can 404 via stale `lastWorkoutId`); CompleteSheet totals contradict header progress; SAVE AS TEMPLATE SubmitButton | UX | E | **done — merged (PR #100 + PR #98).** New `(app)/not-found.tsx` ledger card inside the app shell; landing there clears the stale session `lastWorkoutId` so the Workout tab can't 404 after its meso is deleted. CompleteSheet totals share the header's skipped-slot-excluded math via pure `day-rules.ts::daySetTotals` (unit-tested). The SAVE AS TEMPLATE SubmitButton bullet had shipped earlier with R17 (PR #98). All 3 bullets closed. |

---

## Swept 2026-07-01 (evening) — R17 + R16 field usability merged (PR #98)

Session 28 shipped the review's two destructive-failure UX items together (per
its attack order); PR #98 merged with all checks green (incl. the revived
`rls-tests`). Raw text stays in the backlog appendix (Batch 3); full record in
PROGRESS 2026-07-01 and the Session 28 log entry. On-device failure-path spot
check (e.g. airplane-mode a note save) remains the owner's final confirmation.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| R17 | Sheet writes fail destructively: Note/Feedback/Complete close optimistically then error boundary wipes typed input while error page claims "Nothing was lost"; fetch-on-open sheets stuck on "Loading…"; save-as-template fails silently | B | E | **done — merged (PR #98).** No sheet write can reach the error boundary: shared `commit` (~14 menu ops) catches + toasts; Note/Feedback/Complete/End/Add close only after the write lands (failure keeps typed input + SAVING…/retry); amends via `runLog`; fetch-on-open sheets (History/Replace/AddExercise) get catch + stale-guard + shared `FetchRetry`; `?error=template` finally read by the meso page (+ SubmitButton — an R19 bullet); error-page copy honest. |
| R16 | PlannerBoard staged edits: one failed save (throws to boundary, remounts, discards session) or one stray navigation (`dirty` only guards CANCEL) = total loss | B | D | **done — merged (PR #98).** `doSave` catches — staged `workDays` + confirm sheet survive for one-tap retry. New `useNavigationGuard` (capture-phase link intercept, history-sentinel back absorb, native beforeunload) routes all dirty-state navigation through the discard-confirm sheet with the intercepted destination; pure `shouldGuardNavigation` rule unit-tested. **R3 (server half — non-atomic `saveMesoPlan`) stays open in the live index.** |

---

## Swept 2026-07-01 (later) — R2 merged (PR #96)

Session 27 shipped the guardrail revival; PR #96 is merged and its CI run was
the proof (first green `rls-tests` in the repo's history). Raw text stays in
the backlog appendix (Batch 3); full fix-by-fix record in PROGRESS 2026-07-01
and the Session 27 log entry.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| R2 | Guardrails dead: migrations don't apply to a clean DB + stale RLS suite → CI red since ~06-20, checks not required | B | K | **done — merged (PR #96; stale assertions via PR #95).** Six masked breaks fixed: `is_admin()` ordering (recorded rule-#2 deviation), muscle-group seed-order (`20260611000002`), hosted-only `rls_auto_enable()`+`ensure_rls` captured (`20260619000002`), duplicate version `20260616000001` (adherence_rule → `000004`), missing table grants (`20260701000003`, matches hosted posture; RLS stays the gate), stale escalation assertion (42501). Reconciliation migrations applied to hosted as verified no-ops. **CI green: 29/29 RLS tests on a from-scratch stack.** Spawned **T-R2** (open). Owner step: make `checks`+`rls-tests` required on `main` (runbook). |

---

## Swept 2026-07-01 — review top two merged (PR #95)

Session 26 shipped the repo review's suggested first slice (R1 + R8); PR #95 is
merged and both changes are verified live. Raw text stays in the backlog
appendix (Batch 3); full evidence in
[`docs/reviews/2026-07-01-repo-review.md`](../reviews/2026-07-01-repo-review.md).

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| R1 | Share redemption is a cross-user copy primitive (`shares_grantee_accept` lets a grantee rewrite `object_id`; service-role copy never verifies owner) | B | K | **done — merged (PR #95).** Migration `20260701000002` drops `shares_grantee_accept` (**applied live + probe-verified**: grantee UPDATE touches 0 rows; grantee SELECT + owner control intact). Defense in depth: `acceptShareCode` asserts every copied object is owned by `share.owner_id` (stock exercises excepted), also closing the owner-side re-point surface. New `shares` RLS describe block + 5 mocked-service ownership tests. |
| R8 | Engine: joint-pain 3/3 still ADDS a set — doc 10's one hard safety gate unenforced on set additions | B | G | **done — merged (PR #95).** New gated `pain_cut_gate` param: pain ≥ 2 vetoes set additions, pain 3 forces −1 set + a substitution note, regardless of workload/pump. engine_params **v17 applied + ACTIVATED** after a clean replay (zero set-count diffs; only the pre-existing R10 bodyweight-seed artifact). Table-driven `pain-gate.test.ts` + bounds property invariant + v17 hash guard. |

---

## Swept 2026-06-30 (later) — bug sweep (PR #84)

Session 15 closed the open Workstream-G/adjacent bugs in one PR, now merged. Raw
text stays in the backlog appendix.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| PH38 | First sets/reps wrong after switching exercise | B | G | **done — merged (PR #84).** `replaceWorkoutExercise` left the outgoing exercise's per-set `set_weights` overrides on the slot, so the first set showed the old planned weight/reps until "reset to prescription"; now cleared on swap. Query-layer test added. |
| PH29 | Page-switch "double layer label" glitch | B | G | **done — merged (PR #84).** Bottom nav drew two `■` position markers during a transition (`usePathname` lags the commit → old tab `active` while tapped tab `pending`); lifted a single `anyPending` signal so exactly one shows. The instant-switch/slowness remainder is server-compute-bound → carried into WS-J (N1). |
| PH36 | Model & weight-increment settings for bodyweight-only exercises | B/Q | F | **done — merged (PR #84).** Engine half already correct under engine_params v16 (reps-only at fixed bodyweight; increment inert); UI gap closed by hiding the Exercise-page "Load step" control for `bodyweight_only` lifts. |
| PH34 | Meso-stats "planned sets" off mid-meso (what counts as "planned"?) | Q→B | C | **done — merged (PR #84).** Owner ruled "autoregulated projection": pure `projectWeekSets` (`queries/volume-projection.ts`) carries the last materialized week's set count forward (deload-scaled) for unmaterialized weeks; wired into `buildVolumeMatrix` (stats) + `get_muscle_group_volume` (MCP, `projected` status) as one definition, no SQL migration. Caveat: flat across accumulation weeks (no forward set ramp — T-A5). |

---

## Swept 2026-06-30 — reconcile merged build PRs

Catch-up sweep. A pile of rows sat in the live index as `done (PR pending)` even
though their PRs had **merged** — the post-merge sweep was never run. Reconciled
the index against the merged-PR list (only the unrelated #48 remains open); every
item below is confirmed merged. Raw text stays in the backlog appendix.

### Shipped & merged — UI / feature / bug items

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| PH35 | Application error on auto-match weights | B | G | **done — merged (PR #62).** Real cause: `profiles` RLS recursion (`42P17`) — `profiles_update_own` self-referenced `profiles` in its WITH CHECK. Fix migration (`…220627`) reads role via a SECURITY DEFINER helper; **applied live + verified** (normal update OK, escalation BLOCKED 42501). Error boundary + toggle revert/toast retained as defense-in-depth. |
| PH42 | Note pencil icon hard to recognize (absorbs **I15**) | UX | E | **done — merged (PR #62).** Illegible Unicode `✎` swapped for a legible inline SVG `PencilGlyph` (+20%). |
| P20 | Exercise search list should live-filter as you type | UX | F | **done — merged (PR #62).** Client `ExercisesBrowser` filters the loaded list in memory (mirrors the muscle/equip axis pattern). |
| PH26 | Move match-weight / export / delete-acct to a dedicated settings sub-page | UX | F | **done — merged (PR #62).** `/more/account` sub-page; single Link left on the More page. |
| P19 | Over/under-prescription marker on logged sets | F | E | **done — merged (PR #62).** `▲`/`▼` marker in `SetRow`, compared by **e1RM** (owner's rule), ±1.5% on-target band, no marker without a prescription. |
| PH27 | Template share-code into the New Template button (tray) | F | F | **done — merged (PR #62).** `NewTemplateButton` tray (blank template → planner, or redeem a share code). |
| PH28 | Profile height entered in cm, ignores chosen units | B | G | **done — merged (PR #62).** Unit-aware height input (ft/in when imperial), canonical `height_cm` storage, both `formatHeight` copies unified; onboarding reordered (units first; deviation recorded in PROGRESS). |
| PH31 | Store calculated e1RM per set; expose to public MCP tools (audit) | F | B | **done — merged (PR #65; backfill SQL fix #66).** Nullable `logged_sets.e1rm` + backfill on the RIR-aware engine formula; write path computes+stores; MCP `get_exercise_history` returns a per-session e1RM with an honesty caveat. |
| PH32 | Tap a set in history to flip sets/reps ↔ e1RM view | F | B | **done — merged (PR #65).** List-wide flip in `ExerciseHistoryList`, session-best e1RM, `metric-fade` (reduced-motion → instant), default load = sets/reps. |
| O1 | Auditability: re-stamp open decisions on a params bump; make version + decision kind viewable from the day-view dropdown | F | I | **done — merged (PR #72/#73).** Invariant confirmed already held (`params_version` advances on every reconcile; day view reconciles on load). Built the "Prescription detail" reveal (decision kind, verified-as-of vs computed-under, rationale/trace) + the prescribed `weight × reps · sets · RIR` line. Admin-gating left as an easy follow-up. |
| PH40 | Sets reprice as you log — should it only use prior sets? | Q→B | A | **done — merged (PR #78, via N3/T-A7).** Anchor reads `workouts.status='completed'` only ⇒ the in-progress workout never re-prices the live session. |
| PH41 | History includes the current (incomplete) workout | Q→B | A | **done — merged (PR #78, via N3/T-A8).** In-progress sets still post to history/stats live, but are excluded from the prescription/prediction anchor until the workout completes. |

### Shipped & merged — engine (WS-I / PR26 complete)

| ID | From | Title | Type | Resolution |
|----|------|-------|------|------------|
| PR26 | — | Retire the legacy increment path; fold remaining (bodyweight) use into the v9 model | F | **done — WS-I complete (PRs #72/#80/#81/#82).** Bodyweight load-type model live (engine_params **v16 active**); legacy increment/regression + prior-peak seed retired. Umbrella for T-I1–T-I5. |
| T-I1 | PR26 | Decide bodyweight data model (load type; bodyweight as effective load; assisted = negative) | D | **decided 2026-06-25; realized in T-I2.** bodyweight-only (profile BW read-only, progress on reps), loadable (BW+added), assisted (negative). |
| T-I2 | PR26 | Build the v9 no-anchor/cold-start + bodyweight effective-load model | F | **done + LIVE — merged (engine PR #80, UI PR #81).** Load-type model + effective load; migrations applied; **engine_params v16 ACTIVATED**. |
| T-I3 | PR26 | Big-miss back-off policy (regression vs anchor-only) | D | **decided 2026-06-25: anchor-only, no hidden back-off** (realized via T-I4). |
| T-I4 | PR26 | Delete legacy increment block + retire legacy-only params | F | **done — merged (PR #82).** Legacy `else` → no-anchor hold; `incrementFor` removed; legacy params marked DEPRECATED (kept in schema for replay; no version bump / no row migration); test harness re-pointed. |
| T-I5 | owner ruling 2026-06-25 | Retire the prior-peak × back-off meso seed | F | **done — merged (PR #72; gated v14, superseded by the v16 active model + T-I4 deletion).** Seed precedence = confident anchor → user `initial_*` → unseeded/prompt. |

---

## Swept 2026-06-26 — Group 1 merged (PR #78)

Active-workout isolation + session-average e1RM. Built and merged (PR #78); the
view migration was applied to the live project and verified against real data
(all 4,411 history rows now equal the session average; 1,271 differ from the old
session max). Raw text stays in the backlog appendix (Batch 2).

### Shipped & merged

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| N2 | History e1RM took the session **max**; should **average** across working sets | B | B | **done — merged (PR #78).** Both surfaces average the stored engine per-set e1RM: `history.ts sessionAvgE1rm` + `v_exercise_history.e1rm` (migration `20260626000001`, applied 2026-06-26). Unified the history stat onto the engine formula (advanced **T-A1**, still open for `v_exercise_overview.best_e1rm` + the "what each screen shows" / PH39 call). |
| N3 | Active/in-progress workout must not feed live prescriptions/predictions | D→B | A/I | **done — merged (PR #78).** `getExerciseE1rmAnchors` filters candidate sets to `workouts.status='completed'` at source ⇒ all consumers (live predictor, seed, progression, regeneration) exclude the in-progress workout; history/stats still post live. |

### Resolved follow-up tasks

| ID | From | Title | Type | Resolution |
|----|------|-------|------|------------|
| T-A7 | PH40 | Freeze in-session prescription vs adapt live | D→F | **done — merged (PR #78, via N3).** Anchor reads completed workouts only ⇒ current-session sets never re-price the live session. |
| T-A8 | PH41 | Should in-progress sets count toward history/stats? | D→F | **done — merged (PR #78, via N3).** In-progress sets post to history/stats live but are excluded from the anchor (prescription/prediction input) until the workout completes. |

---

## Swept 2026-06-26 — notes-area reorg

### Resolved-and-removed at the Notes-v2 reconciliation (2026-06-22)

Answered in `A-engine-metrics.md` and pruned from the source doc by the owner;
each spawned a follow-up task where open work remained.

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| S4 | Progression: add sets vs reps vs weight; double-progression? | Q | A | answered in `A-engine-metrics.md`; removed in Notes v2 → spawned **T-A3** (now resolved, below) |
| S5 | How are misses defined and handled? | Q | A | answered in `A-engine-metrics.md`; removed in Notes v2 → spawned **T-A4** (decided 2026-06-25: anchor-only, no back-off) |
| PR22 | RIR ramp: starting-weight seed; does it catch over-performance and re-baseline a new 0-RIR high-water-mark? | Q→F | A | answered in `A-engine-metrics.md`; removed in Notes v2 → spawned **T-A6** (open) |
| PR23 | How is baseline weight & reps set (last vs best vs combo; recency/goal/averages)? | Q | A | answered in `A-engine-metrics.md`; removed in Notes v2 |
| PR24 | Mid-cycle add/sub of an exercise with history but none in the current meso — behavior? | Q | A | answered in `A-engine-metrics.md`; removed in Notes v2 |
| PR25 | Behavior when no history is present at all? | Q | A | answered in `A-engine-metrics.md`; removed in Notes v2. Later informed the 2026-06-25 "no fabricated prescriptions" ruling (→ T-I5) |

### Shipped & merged

| ID | Title | Type | WS | Resolution |
|----|-------|------|----|------------|
| M9 | Macrocycle custom-duration field can't be momentarily emptied (can't backspace to retype) | B | D | **done — merged (PR #61).** `CreateMacroForm` holds the duration as a string, clamps on blur/submit. |
| I13 | Per-exercise, per-user weight increment | F | F | **done — confirmed merged by owner.** `exercise_param_overrides.weight_increment` (per-user, per-exercise), CUSTOM picker on the Exercise page, folded into `params.rounding/increment` via `resolveEffectiveParams`. Shipped 2026-06-21. |
| I15 | Add exercise-note icon left of the history icon in day view | F | E | **superseded → PH42.** The note icon already existed; the real issue was the illegible edit-pencil glyph, fixed under PH42 (legible SVG `PencilGlyph`). Removed in Notes v2. |

### Resolved follow-up tasks

| ID | From | Title | Type | Resolution |
|----|------|-------|------|------------|
| T-A3 | S4 | Confirm active `weight_selection`; surface the legacy fallback | Q→B | **resolved.** Fallback is moot under the active rep-window engine (reached only via no-anchor, not confidence); the legacy-path cleanup folded into workstream **I** (T-I4). |
