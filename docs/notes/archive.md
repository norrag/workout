# Archive — closed items

Terminal items swept out of [`backlog.md`](./backlog.md)'s live index so the live
index stays lean. An item lands here when it's **done-and-merged**, **wontfix**,
**superseded**, or **resolved-and-removed-from-source**. Its raw text remains in
the backlog [appendix](./backlog.md#appendix-verbatim-source) (the append-only
record); only the tracking row moves here, with its resolution preserved.

Newest sweeps first. See [`CLAUDE.md`](./CLAUDE.md#consolidation--purge-policy-keeping-the-live-index-lean)
for the purge policy.

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
