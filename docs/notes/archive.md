# Archive — closed items

Terminal items swept out of [`backlog.md`](./backlog.md)'s live index so the live
index stays lean. An item lands here when it's **done-and-merged**, **wontfix**,
**superseded**, or **resolved-and-removed-from-source**. Its raw text remains in
the backlog [appendix](./backlog.md#appendix-verbatim-source) (the append-only
record); only the tracking row moves here, with its resolution preserved.

Newest sweeps first. See [`CLAUDE.md`](./CLAUDE.md#consolidation--purge-policy-keeping-the-live-index-lean)
for the purge policy.

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
