# Archive — closed items

Terminal items swept out of [`backlog.md`](./backlog.md)'s live index so the live
index stays lean. An item lands here when it's **done-and-merged**, **wontfix**,
**superseded**, or **resolved-and-removed-from-source**. Its raw text remains in
the backlog [appendix](./backlog.md#appendix-verbatim-source) (the append-only
record); only the tracking row moves here, with its resolution preserved.

Newest sweeps first. See [`CLAUDE.md`](./CLAUDE.md#consolidation--purge-policy-keeping-the-live-index-lean)
for the purge policy.

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
