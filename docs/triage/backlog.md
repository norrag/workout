# Backlog — field notes (imported 2026-06-22)

Single source of truth for every item parsed from the Notes doc. Update the
**status** column whenever an item moves; record the *why* in [`log.md`](./log.md).
Verbatim source text for each item is preserved in the [appendix](#appendix-verbatim-source) so nothing is lost in summarizing.

Type: `Q` question · `B` bug · `F` feature · `UX` polish · `D` needs-decision.
Status legend and workstreams: see [`README.md`](./README.md).

> **Reconciled with Notes v2 (2026-06-22).** The owner pruned items that session 1
> resolved and added two. Removed as stale/resolved: **S4**, **S5** (answered in
> `A-engine-metrics.md`), **I13** (shipped), **I15** (already exists),
> **PR22–PR25** (answered). Added: **S8** (engine add/remove sets/reps — answered
> by the existing S7/S4 research) and **PR26** (retire the legacy increment path →
> v9, the new substantive engine task). Removed items are kept here with status
> `resolved (removed in v2)` rather than deleted, so the history is intact.

## Index

| ID | Title | Type | Pri | WS | Status |
|----|-------|------|-----|----|--------|
| S1 | How is estimated strength (e1RM) calculated? | Q | — | A | answered |
| S2 | How is strength increase calculated? (e.g. Est. Strength Key Lifts) | Q | — | A | answered |
| S3 | How are deload weeks handled in stats? | Q | — | A | answered → T-A2 |
| S4 | Progression: add sets vs reps vs weight; double-progression? | Q | — | A | resolved (removed in v2) → T-A3 |
| S5 | How are misses defined and handled? | Q | — | A | resolved (removed in v2) → T-A4 |
| S6 | Does adding a set manually transfer to future plans? | Q | — | A | answered |
| S7 | How is the number of sets planned? | Q | — | A | answered → T-A5 |
| S8 | When/why/how does the engine add or remove sets/reps? | Q | — | A | answered (see S7 + S4) |
| M8 | Stats unification: meso gets est-strength under performance; macro gets balance+performance via 3-way toggle | F | — | C | needs-input (meso est-strength present but owner wants its meaning clarified; macro part folds into a broader meso/macro stats redesign) |
| M9 | Macrocycle custom-duration field won't allow momentary empty cell (can't backspace to re-enter) | B | MED | D | done (PR #61) |
| M10 | Show only *unplanned* mesocycles on the macrocycle overview page | UX | — | D | needs-input |
| I11 | Meso stats rework — include strength increases for all exercises | F | HIGH | C | triaged |
| I12 | Address mesocycle management under a macrocycle | F | HIGH | D | triaged (needs design pass) |
| I13 | Per-exercise, per-user weight increment | F | HIGH | F | done (confirmed merged by owner) |
| I14 | Raise complete-workout feedback slider resolution to match per-exercise feedback | F | HIGH | E | needs-input (scope) |
| I15 | Add exercise-note icon left of the history icon in day view | F | HIGH | E | done (already exists — removed in v2; see PH42) |
| P16 | Meso overview buttons monotonous/ugly → overview↔stats page toggle | UX | LOW | C | needs-input |
| P17 | Remove page back-button when day dropdown selects a new day | UX | LOW | E | needs-input |
| P18 | Remove the set-type option from the set menu | UX | LOW | E | needs-input (spec conflict) |
| P19 | Logged sets get a small over/under-prescription icon | F | LOW | E | done (rule = e1RM; PR pending) |
| P20 | Exercise search list should live-filter as you type | UX | LOW | F | done (client ExercisesBrowser; PR pending) |
| P21 | Should soreness be recorded when user reports 0 days sore? | D | LOW | H | needs-input |
| PR22 | RIR ramp: how is starting weight seeded? does it catch over-performance and re-baseline a new 0-RIR high-water-mark? | Q→F | — | A | resolved (removed in v2) → T-A6 |
| PR23 | How is baseline weight & reps set (last vs best vs combo; recency/goal/averages)? | Q | — | A | resolved (removed in v2) |
| PR24 | Mid-cycle add/sub of an exercise with history but none in the current meso — behavior? | Q | — | A | resolved (removed in v2) |
| PR25 | Behavior when no history is present at all? | Q | — | A | resolved (removed in v2) |
| PR26 | Retire the legacy increment path; understand its remaining use (likely bodyweight) and fold cleanly into a v9 engine model | F | HIGH | I | scoped (see `I-engine-v9.md`; spawns T-I1–T-I4) |
| PH26 | Clean up settings page: move match-weight/export/delete-acct to a dedicated page | UX | LOW | F | done (/more/account; PR pending) |
| PH27 | Move template share-code into the New Template button (tray: blank or enter code) | F | LOW | F | done (PR pending) |
| PH28 | Profile height input behaves in cm→ft, ignores chosen units | B | HIGH | G | done (imply system from units; onboarding reordered; PR pending) |
| PH29 | Page switches slow + double-layer label/loading glitch; want instant switch w/ placeholders | B | HIGH | G | triaged (needs repro) |
| PH30 | Expanded weekly prescription explanation — LLM API for brief analysis? | D | — | H | needs-input |
| PH31 | Store calculated e1RM per set; expose to public MCP tools (audit) | F | HIGH | B | done (logged_sets.e1rm + backfill; RIR-aware engine formula; MCP history; PR pending) |
| PH32 | Tap a set in history to flip sets/reps ↔ e1RM view (fade anim, default sets/reps) | F | HIGH | B | done (list-wide flip in ExerciseHistoryList, session-best e1rm, metric-fade; PR pending) |
| PH33 | Scope admin MCP tools as private (hidden from non-admins) | F | LOW | H | needs-input (likely low/wontfix) |
| PH34 | Meso-stats "planned sets" review — what counts as "planned"? completed + remaining prescribed | Q→B | — | C | triaged |
| PH35 | BUG: application error on auto match weights | B | HIGH | G | done — REAL cause was `profiles` RLS recursion (42P17); migration applied live + error boundary/toggle guards (PR pending) |
| PH36 | Check model & weight-increment settings for bodyweight-only exercises | B/Q | MED | F | triaged (needs repro) |
| PH37 | Aggregate strength gains per muscle group over macro/meso/all-time | F | — | C | inbox |
| PH38 | First sets/reps wrong when you switch exercise (correct after reset to prescription) | B | HIGH | G | triaged (needs repro) |
| PH39 | How fast does e1RM recency decay? (Pulldown e1RM 110.1 but did 115×11 on May 22) | Q | — | A | answered → T-A1 |
| PH40 | Sets reprice as you log — recalculating after each set; should it only use prior sets? | Q→B | — | A | answered → T-A7 |
| PH41 | History includes the current (incomplete) workout — expected it to be excluded until complete | Q→B | — | A | answered → T-A8 |
| PH42 | Note pencil icon hard to recognize | UX | MED | E | done (legible SVG PencilGlyph, +20%; absorbs I15) — PR pending |

## Open follow-up tasks (spawned during triage)

Tasks surfaced by the answered engine/metrics questions (workstream A). Details
and rationale in [`A-engine-metrics.md`](./A-engine-metrics.md#spawned-follow-up-tasks-add-to-backlogmd).

| ID | From | Title | Type | Status |
|----|------|-------|------|--------|
| T-A1 | S1/PH39 | Reconcile the two e1RM systems (engine anchor vs raw-Epley stats view); decide what screens show | D→F | needs-input |
| T-A2 | S3 | Decide + document deload handling in stats; skip deload sessions in `getMesoProgressScores` | D→B | needs-input |
| T-A3 | S4 | Confirm active `weight_selection`; surface the legacy fallback | Q→B | resolved (fallback moot under v9; folded into WS I) |
| T-A4 | S5 | Decide whether a hard big-miss back-off belongs in rep_window mode | D | **decided (2026-06-25): anchor-only, no back-off; retire `regression_pct`** (see T-I3/T-I5) |
| T-A5 | S7 | Implement graded MEV→MAV→MRV ramp + MRV-stop auto-deload, or amend doc 10 to ±1 model | D→F | needs-input (sequenced in WS I) |
| T-A6 | PR22/PR23 | Seed a new meso from the recency anchor / rep high-water-mark, not just top-weight PR | F | needs-input |
| T-A7 | PH40 | Freeze in-session prescription at session start vs adapt live (+ make legible) | D | needs-input |
| T-A8 | PH41 | Decide whether in-progress workout sets count toward history/stats | D | needs-input |
| T-I1 | PR26 | Decide bodyweight data model (flag vs split buckets; loadable anchoring; store bodyweight-in-set?) | D | needs-input |
| T-I2 | PR26 | Build v9 no-anchor/cold-start prescription model incl. bodyweight reps-at-fixed-load (+ weight=0 test) | F | blocked on T-I1 |
| T-I3 | PR26 | Decide big-miss back-off policy in the v9 model (explicit regression vs anchor-only) | D | **decided (2026-06-25): anchor-only; no hidden back-off** |
| T-I4 | PR26 | Delete legacy increment block + retire legacy-only params (new engine_params version, migrate old rows, update tests) | F | blocked on T-I2 |
| T-I5 | owner ruling 2026-06-25 | Retire the prior-peak × back-off meso seed (`seedMeso` `priorPeak` branch) + the no-anchor fabrication fallback; seed precedence = confident anchor → user `initial_*` (manual seed) → unseeded/prompt. New engine_params version, drop `meso_seed_backoff_pct`, update seed goldens + replay. | F | **ready (decided); retire at next opportunity** |

---

## Appendix: verbatim source

Exact text from the Notes doc, grouped as written, so the original phrasing is
never lost.

### Stats, metrics, calculations
- **S1** — How is estimated strength calculated?
- **S2** — How is strength increase calculated?
- **S3** — How are deload weeks handled in stats?
- **S4** — Progression algorithm tuning: when to add sets, reps, or weight? "It seems like it's preferring to add weight each week. Is that true, and if so does the science back that? If not, what does the research support? e.g.: Keep the same load until every working set reaches 12 repetitions at the prescribed reps in reserve. Increase the load by the smallest available increment. Accept that repetitions may return to eight or nine. Build back toward 12."
- **S5** — How does the progression algorithm handle misses, and what's the definition of misses? What does it do in response?
- **S6** — Does adding a set manually transfer to future workout plans?
- **S7** — How are number of sets planned?
- **S8** — When/why/how does the engine add or remove sets/reps? *(added v2)*

> _v2 removed S4 ("Progression algorithm tuning: when to add sets, reps, or weight? It seems like it's preferring to add weight each week… [double-progression description]") and S5 ("How does the progression algorithm handle misses…") as resolved — answers retained in `A-engine-metrics.md`._

### Macrocycles
- **M8** — "I'm thinking there should be a bit of stats unification between meso stats and macro stats. Stats that should be in both: Meso stats should get estimated strength under performance. Macro stats should get the same balance and performance tabs, probably via a three way page toggle; overview, balance, performance."
- **M9** — "Choosing a custom duration in macrocycles will not allow an empty cell even momentarily. This prohibits the user from backspacing the value to enter a new one. This needs to be handled."
- **M10** — "Only show unplanned mesocycles under the macrocycle overview page. This leaves the cycles page cleaner, and the user can click on the macrocycle to see and begin planning unplanned mesos."

### More important
- **I11** — "Meso stats needs a rework. Include strength increases for all exercises? Q: how is it calculated"
- **I12** — "Need to address mesocycle management under a macrocycle"
- **I13** — "Expose a per-exercise, per-user weight increment. It needs to be per-user as not to mess with other users who may have different increments on the same exercise/machine." (NOTE: a per-user/per-exercise `weight_increment` override shipped 2026-06-21 per PROGRESS.md — verify this fully satisfies the note before closing.)
- **I14** — "Increase the complete workout feedback sliders resolution to the same resolution scale as the exercise feedback. This will unify the feedback scales."
- **I15** — "Put an exercise note icon to the left of the exercise history icon in the workout day view, for users to quickly log an exercise note."

### Less important
- **P16** — "The buttons on the mesocycle overview page are monotonous and ugly. I am thinking a page toggle between overview and stats."
- **P17** — "When the user drops down the weeks/days from the workout page and selects a new day, it displays the page back button in the top left corner, but I don't like this in this condition and it clutters it up. The user can just select the current day again to go back. Remove this."
- **P18** — "The set type option from the set menu can be removed."
- **P19** — "Logged workout sets should get a small icon indicating if the logged set was above or below the prescription"
- **P20** — "Exercises search list should live filter as you type"
- **P21** — "Should muscle soreness be recorded when the user states they were sore for 0 days?"

### Progression model
- **PR26** *(added v2)* — "From what I understand the legacy increment path that it's keeping as a fall back. This legacy model probably shouldn't be present at all, however we need to understand where and how it's still used if at all to ensure it's done correctly. I think the only remaining use case might be how bodyweight only and bodyweight loadable exercises are handled. We should consider these and any other use cases and probably roll them into the v9 model so that everything is handled cleanly."
- **Owner ruling (2026-06-25)** *(→ T-I5)* — "We don't ever want to use the old, defunct load_first, prior peak back off seed ever again for any reason. This is discussed in the triage docs… That logic is broken fundamentally, and it should be retired at the next possible opportunity. The goal with prescriptions is not always to provide one at any cost — it's to use the data when available to effectively train the user as best as possible. If something truly does not have enough data to provide a starting place, the user should just seed themselves and enter a starting place themselves manually rather than make up data or produce bad numbers."

> _v2 removed PR22–PR25 (RIR-ramp seeding, baselining, mid-cycle swap-in, no-history) as resolved — answers retained in `A-engine-metrics.md`. Kept below for the record:_

- **PR22** — "how does it seed the starting weight? does it catch progression that might exceed the rir prescription, and if so what does it do with it? … on occasion most of us will hit a 0 rir week … and realize we've got more in the tank. [leg press 190×3×8 @1RIR, next week @0RIR hit 12 then 20 reps] … Will it catch that and landmark that high water mark as my new 0 rir going forward, and keep the user appropriately honest going forward? This would be the goal, but accomplishing it may be nuanced."
- **PR23** — "How is the baseline weight and reps set? I.e. does it go off last recorded only, best historical, some combination of both? Does macrocycle goal, recency, averages, or anything else play a part in determining the baseline which the ramp is based on?"
- **PR24** — "What does it do if I add or sub in an exercise mid-cycle which has exercise history, but no history in the current meso?"
- **PR25** — "What does it do if no history is present?"

### Phone Notes
- **PH26** — PRIORITY LOW — "Clean up settings page: move match weight, export, delete acct to a dedicated page"
- **PH27** — PRIORITY LOW — "Move template share code to the new template button. New button shows tray similar to the create new mesocycle, but shows blank template or enter code."
- **PH28** — PRIORITY HIGH — "Weight input in profile is entered in cm and the converted to ft. should follow units"
- **PH29** — PRIORITY HIGH — "Sometimes switching pages is a little slow and when doing so the page label shows a weird double layer stage. … displaying some sort of label loading animation, but it is displaying the regular label too … Should responsive switch pages instantly, even if the page itself shows a short loading gif or blank container/placeholders"
- **PH30** — NEEDS THOUGHT — "I'd like to see an even more expanded explanation of my exercise prescription each week — OpenAI API for brief analysis?"
- **PH31** — PRIORITY HIGH — "For audit-ability, I would like for the calculated e1rm from each set be stored with that set, and exposed to the appropriate public mcp tools."
- **PH32** — PRIORITY HIGH — "I would like the ability to see each set's calculated e1rm from the app if desired, but not in too prominent a way. … view the exercise history, tap any one of the sets and reps and it would flip from sets and reps view to e1rm view for all sets … nice quick fade in and out animation. Tap again to flip back. Default on history load is always sets and reps."
- **PH33** — PRIORITY LOW — "Can the admin mcp tools be scoped as private, so they're not visible to non-admin users?"
- **PH34** — NEEDS THOUGHT — "Meso-stats weekly planned sets needs a review. 'Planned' seems to be off from actual when the meso is partly or even mostly complete. Should be real complete sets per muscle group + remaining planned sets, averaged. 'Planned' definition should reflect prescribed future sets … I think this is, in part, due to future sets not really being 'planned' until the previous weeks same day is complete. So what is really considered the 'plan' and how is it set or determined?"
- **PH35** — PRIORITY HIGH — "BUG: application error on auto match weights"
- **PH36** — PRIORITY MEDIUM — "Check on model and weight increment settings for body weight only exercises"
- **PH37** — NEEDS THOUGHT — "Aggregate strength gains per muscle group over period of time; macro, meso, (all time?)"
- **PH38** — PRIORITY HIGH — "First sets / reps not right if you switch exercise — after I changed and then reset to prescription it was right"
- **PH39** — NEEDS THOUGHT — "How quick does the e1rm recency decay? Pulldown e1rm at 110.1 but I did 115 for 11 May 22nd"
- **PH40** — NEEDS THOUGHT — "It looks like sets are repricing as you go in the set. I guess if your current set is your best set, then it's averaging your remaining sets as you go… so it's recalculating after every set is calculated apparently. Is that good or should it only look at previous sets"
- **PH41** — NEEDS THOUGHT — "History also includes current workout — had in my head that basically a current workout doesn't get entered anywhere until it's complete"
- **PH42** — PRIORITY MEDIUM — "Note pencil icon is hard to see what it is"
