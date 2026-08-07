# 22c — App inventory & concept map (doc 22, Phases 0b + 0c)

**Status:** ground truth for the User Guide. Working document — not user-facing prose.
**Audited:** 2026-08-06, from the code at `6d5d674` — **post-Batch-32** (doc 22
§11 requires this; N75–N79 moved four documented surfaces the day before) —
and **re-checked against `6441e93`** after PR #230 shipped the versioning &
release framework (doc 23, N80), which added one route, one modal and one
changed label. Those are folded in below and marked **(doc 23)**.
**Scope:** doc 22 §11 Phase 0b (route-by-route functional inventory) and
Phase 0c (concept & FAQ inventory, appended per the plan).
**Excludes:** sign-up / sign-in / onboarding (doc 22 §1.2), the OAuth consent
screen (part of the connector flow, covered in [`22d`](./22d-connector-inventory.md) §5),
and all admin-gated surfaces (doc 22 §1.2 — there is no admin UI anyway; hard
rule 9).

> **Method, and its one limitation.** This is a **code read**, not a device
> walkthrough: routes, components, rendered labels, controls, menu rows, sheet
> contents, and empty/loading/error states were taken from the source. Copy is
> transcribed verbatim where the manual will need to match it. What a code read
> cannot establish is **feel** — motion, tap targets, what is actually reachable
> with a thumb. Phase 3 chapters that describe *how a screen behaves under the
> finger* should be checked on device before they ship.
>
> **Companion documents:** [`22b`](./22b-source-map.md) says which doc is
> authoritative per topic and **what is not live**; check it before writing any
> mechanism prose. [`22d`](./22d-connector-inventory.md) covers the connector.

---

# Part A — Route map

Five tabs (`BottomNav.tsx`, doc 08 §2), in bar order. `■` marks the active tab.

| Tab | Owns paths | Landing route |
|---|---|---|
| **Workout** | `/`, `/workout`, `/log/**` | the latest uncompleted workout **is** the tab |
| **Cycles** | `/cycles/**` | `/cycles` |
| **Templates** | `/templates/**` | `/templates` |
| **Exercises** | `/exercises/**` | `/exercises` |
| **More** | `/more/**` | `/more` |

**A behavior the manual must state (ch. 1):** the Workout tab does not always
go to "today." It links to **the last day you viewed this session**
(`sessionStorage.lastWorkoutId`), falling back to `/workout`. Returning to the
tab lands where you left off.

Full route inventory — every screen a standard user can reach:

| # | Route | What it is | UG ch. |
|---|---|---|---|
| 1 | `/workout` | Workout tab. Renders the day view for the next workout; otherwise a resting summary | 1, 5 |
| 2 | `/log/[workoutId]` | **Day view** — the logging screen | 5, 6, 8, 17 |
| 3 | `/cycles` | Cycle list: current, planned, and (behind a toggle) completed | 3 |
| 4 | `/cycles/new` | Create a macrocycle | 14 |
| 5 | `/cycles/macro/[macroId]` | Macro Overview / Balance / Performance | 13, 14 |
| 6 | `/cycles/macro/[macroId]/edit` | Edit macro goal + its block slots | 14 |
| 7 | `/cycles/meso/[mesoId]` | Meso page: header + Overview / Balance / Performance | 3, 4, 13 |
| 8 | `/cycles/meso/[mesoId]/plan` | **Planner board** — the single meso planning surface | 4 |
| 9 | `/cycles/meso/[mesoId]/planned/[week]/[day]` | Read-only view of a planned (not yet generated) day | 4 |
| 10 | `/cycles/meso/[mesoId]/stats` | Redirect into the meso page's stats tabs | 13 |
| 11 | `/cycles/plan` | "Plan a meso" — the four entry paths | 4 |
| 12 | `/cycles/plan/template` | Pick a template to start from | 4, 15 |
| 13 | `/cycles/plan/copy` | Copy an existing mesocycle | 4 |
| 14 | `/templates` | Template library + filters | 15 |
| 15 | `/templates/[templateId]` | Template detail → start a meso from it | 15 |
| 16 | `/exercises` | Exercise library + two-axis filter | 15 |
| 17 | `/exercises/[exerciseId]` | Exercise page: Overview / History | 13, 15 |
| 18 | `/exercises/new` | Create a custom exercise | 15 |
| 19 | `/more` | Settings hub + workouts-logged counter | 1, 19 |
| 20 | `/more/profile` | Profile editor | 2, 16 |
| 21 | `/more/account` | Logging preference, export, delete account | 19 |
| 22 | `/more/delete-account` | Account deletion confirm | 19 |
| 23 | `/more/connector` | AI connector setup → the AI Manual's hub | 18 |
| 24 | `/more/bodyspec` | BodySpec DEXA connect / sync / scan list | 16 |
| 25 | `/more/bodyspec/[scanId]` | One scan's detail ledger | 16 |
| 26 | `/more/whats-new` | **Version history** — every release, newest first (doc 23 §8) | 1, 19 |
| 27 | `/~offline` | Offline fallback for a navigation with no network | 19 |

Share **redemption has no route of its own** — it is the `RedeemForm` reached
from `/cycles` → `Create new` → `OR ADD FROM A CODE` (`src/app/(app)/share/actions.ts`).
`/cycles/meso/[mesoId]/stats` is a redirect that preserves old deep links into
the meso page's tabs.

Every route in `/cycles/**`, `/exercises/**`, `/templates/**`, `/more`, plus the
day view, ships a route-level `loading.tsx` skeleton that mirrors its layout
(N1). Worth one line in ch. 1: **a tap always paints immediately.**

---

# Part B — Screen inventory

## B1 · Workout tab

### B1.1 `/workout` — the tab itself

Three states, in the order the page resolves them:

1. **A next workout exists** → renders the **day view** inline (B1.2). Before
   rendering, the page silently does two things worth explaining once in ch. 5:
   - `ensureFreshPrescriptions` — regenerates any missing day whose previous-week
     counterpart is complete, and **refreshes any not-yet-started prescription
     whose inputs have changed** since it was computed (doc 14's dependency
     fingerprint). User-visible statement: *"prescriptions refresh when you open
     the app; nothing you have already logged is touched."*
   - `catchUpProgression` — a fallback that advances the week if the previous
     week closed without generation firing.
2. **A meso exists but no open workout** → the resting state: the latest
   completed meso's summary, a volume view, and `ALL STATS ›`.
3. **No cycles at all** → `SET UP CYCLES`.

### B1.2 `/log/[workoutId]` — the day view

The app's densest screen and the subject of ch. 5. Four zones.

**① Sticky header** (`DayHeader`)

| Element | Detail |
|---|---|
| Brand row | `workout` logotype + chevron; tapping toggles the **week/day navigator** |
| Meso name | tracked caps, right-aligned |
| Navigator | collapsible; week selector with nested day chips. Stays open across day navigation (persisted in `sessionStorage.dayNavOpen`). Day chips carry status: `done` / `current` / `next` / `planned` / `empty` |
| Coordinate | `W{week}·D{day}` at 46 px — the largest type on the screen |
| Date | right of the coordinate |
| Effort label | **`TARGET {n} RIR`**, or **`DELOAD WEEK`** on a deload — in accent orange, with an `InfoDot` (`rir` / `deload`) |
| `⋮` | workout & mesocycle options (below) |
| **Progress bar** | 3 px rule, accent fill = `loggedSets / totalSets`. **Skipped slots are excluded from the denominator**, and a *queued* set counts as logged (the lifter did it) |

**Header `⋮` menu:** `Mesocycle stats` · `Add exercise` (opens a picker) ·
`End workout` · `End mesocycle`. The two "end" rows open confirm sheets:
`SKIP REMAINING · COMPLETE` → `END WORKOUT`, and
`SKIP REMAINING DAYS · COMPLETE` → `END MESOCYCLE`.

**② Exercise card**

Top row is four icon buttons: **prescription strip toggle**, **note**,
**history**, **`…` menu**. Then the exercise name (20 px bold) with equipment
type and — for bodyweight movements — a **bodyweight chip** (tap to edit the
bodyweight the set is priced against).

**The prescription strip** (N63 three-layer ledger, N75) — ch. 17's subject:

| Layer | Content | Always there? |
|---|---|---|
| **Ask line** | the prescription in words. **Underlined — tapping it opens Prescription details** (N75; it used to be a `⋮` row called "Engine audit") | yes |
| **Why lines** | deterministic causes, one per line, with air between them | yes, once loaded |
| **`COACH`** | ruled off under its own tracked-caps label so it is never mistaken for a program fact | **only when one exists** — see [`22b`](./22b-source-map.md) §4.1 ② |

Strip states: `Reading the program's decision…` while loading; on failure,
a tappable `Couldn't read the program's decision — tap to retry.`

Below it, a `PINNED — {note}` line when the exercise carries a pinned note.

**Exercise `…` menu** (all rows, current code):
`View exercise` · `Effort target` · `Notes` / `Add note` · `Replace exercise` ·
`Move up` · `Move down` · `Add set` · `Edit feedback` / `Add feedback` ·
`Skip remaining sets` · `Reset to prescription` · `Unskip all sets` ·
`Remove exercise`.

> **Correction for the manual:** there is **no `Engine audit` row.** Any source
> that says there is predates 2026-08-06.

**③ Set rows**

Columns: `SET` · weight · `REPS` · `RIR` · `LOG`. Weight and reps are editable;
**RIR is captured per set** (doc 21 Phase 1) with `no report` as a legitimate
state. A logged set carries a three-state marker — **above prescription** /
**met prescription** / **below prescription** (the doc 16 §5.3 `▲ / met / ▼`
glyphs).

Per-set `…` menu: `Add set below` · `Set type` · `Skip set` / `Unskip set` ·
`Delete set`. Skipping greys a set rather than removing it, and is reversible.

**Logging is queued** (N68, hard rule 9). A tap enqueues and the UI advances
immediately, so a slow write can never strand you mid-set. The queue surfaces:
`That save is taking too long — it's safe to try again`,
`Couldn't save that set — check your connection`, and a banner with `TRY AGAIN`.
Deletes and unlogs stay foreground (`That set is still saving — one moment`).

A completed session renders its sets as **static text**: `Logged — session
locked` / `Session locked`.

**④ Sheets reachable from the day view**

| Sheet | Contents |
|---|---|
| **Prescription details** (`PrescriptionDetailSheet`) | `PRESCRIPTION` · `DECISION` (`KIND`: `SEED` / `ADVANCE`, `COMPUTED UNDER`, `VERIFIED AS OF`) · `EST. STRENGTH (e1RM)` (`PRESCRIBED IMPLIES`, `MEASURED ANCHOR`) · `TRACE`. Also `verified accurate as of Vx` / `re-verified, unchanged` |
| **Effort target** (`EffortSheet`, doc 21) | `TARGET RIR` presets + `CUSTOM VALUE`; `USE THE WEEK'S RAMP ({n} RIR)`; **`APPLIES TO`** = `THIS WEEK` / `WORKING WEEKS` / `ALL WEEKS`, with the scope's own gloss (*"Every working week — not the deload."* / *"Every working week and the deload."*); `REASON` (free text, surfaced wherever the assignment reads); a plain-language pricing line (*"two notches easier"*, *"kept well short of failure"*, *"taken right to failure"*, *"stopped 1 rep short of failure"*); and `SAVED — NOTE` warnings |
| **`SET BY YOUR COACH`** (inside the Effort sheet) | **Read-only.** `Working-set cap` and `Priced at` (rep position). See the finding in [§B7](#b7-two-levers-the-app-shows-but-cannot-set) |
| **Notes** | two kinds, deliberately distinct: a **pinned note** (*"Stays on this exercise in every workout."*) and a **session note** (*"Saved with just this session — a note on how it went today."*) |
| **History** | `THIS MACROCYCLE` scoped exercise history (B4.2's list component) |
| **Replace exercise** | search + `MUSCLE` / `EQUIP` filters, `NEVER PERFORMED` marker, confirm step |
| **Add exercise** | multi-select picker; `ADDED TO THE BOTTOM — REORDER AS NORMAL` |
| **Exercise feedback** | `RECOVERY CHECK` — soreness (`NONE` ↔ `VERY SORE`), joint pain (`None` / `Moderate` / `High`), **pump** (`NO PUMP` ↔ `BEST EVER`, with `InfoDot`), **workload** (`TOO EASY` · `JUST RIGHT` · `TOO MUCH`, with `InfoDot`) |
| **Workout Complete** | counts (`Exercises completed` / `Sets logged` / `Skipped`); `SESSION — FEEDS NEXT WEEK'S TARGETS` with three sliders — `Overall fatigue` (`FRESH` ↔ `WIPED OUT`), `Effort` (`EASY` ↔ `ALL OUT`), `Performance` (`OFF DAY` ↔ `STRONG`); `WORKOUT NOTES — SAVED WITH SESSION`; `NEXT WORKOUT →` |

Bottom action: `COMPLETE WORKOUT`, which becomes `SAVING THE LAST SETS…` while
the queue drains.

Two changes an in-workout edit can carry forward, both offered as checkboxes:
`Pin to this exercise` and **`Repeat this change on this day in future weeks`**.

## B2 · Cycles tab

### B2.1 `/cycles`

Sections: `CURRENT` · `PLANNED` · `STANDALONE — NO MACROCYCLE`. A saved draft
shows `DRAFT IN PROGRESS` → `CONTINUE EDITING ›`. Macro rows link `OVERVIEW ›`.

**N76 (new):** finished cycles are **hidden by default** behind a deliberately
quiet toggle — `HIDE COMPLETED CYCLES` / its show counterpart — carrying the
count, so hidden history reads as hidden rather than lost. Implemented as
`?completed=1` on the server render: no client state, no settings entry. **A
completed meso inside a running macro stays visible** — it is that macro's own
record of progress.

`Create new` opens a chooser: **Macrocycle** (*"A long-term goal arc that
organizes several mesocycles."*) or **Standalone mesocycle** (*"A single
training block, not tied to a macrocycle."*), plus `OR ADD FROM A CODE`.
Empty state: `nothing here`.

### B2.2 `/cycles/new` — create a macrocycle

Fields: `NAME` · `GOAL` (`HYPERTROPHY` / `STRENGTH` / `CUT` / `MAINTAIN`) ·
`DURATION` (presets + `CUSTOM`, in `MONTHS`) · `MESOCYCLE LENGTH`
(`incl. deload`, with a `SUGGESTED` marker) → `CREATE MACROCYCLE`.

The **create engine card** shows `PLAN` — how many blocks fit, and the
`ACCUMULATE` / `INTENSIFY` / `PEAK` phase strip — plus, when a previous block
supplies it, the `LAST BLOCK MEASURED` priming row (`+n%/MO EST. STRENGTH`).

> **Corrected 2026-08-11 (doc 22 Phase 3g).** This section listed **four**
> goals as three (`CUT` was missing), and described the card as showing
> `EST. STRENGTH` and *"a model band"*. **It shows neither.** The `YOUR TARGET`
> range, the per-month rate, the rationale line and the model band are hidden
> by **N54** (owner, 2026-07-11 — rolled back until N43's v23 band is
> trustworthy) on all three surfaces that would print them:
> `CreateMacroForm.tsx:204`, `EditMacroForm.tsx:234`, and this macro's own
> Overview (`macro/[macroId]/page.tsx:79`, `:178` — the `REALISTIC TARGET`
> card). `EST. STRENGTH` on this screen is only the suffix on the
> `LAST BLOCK MEASURED` row, which survives because it is measured rather than
> modelled. Recorded as [`22a`](./22a-manual-claims.md) **`D-15`**.
>
> **The brief below still holds, with one word changed.** The engine does
> compute the target, the timeframe, the block count and the phases, and the
> reader chooses the goal and the lengths — but ch. 14 cannot tell the reader
> to *look* at the target, because no screen prints it. The band reaches a user
> through the connector (`formatMacroSummary.target`) and through a completed
> macro's `RETROSPECTIVE` band, and that is how ch. 14 states it.

### B2.3 `/cycles/macro/[macroId]`

Header: `MACROCYCLE` + status (`ACTIVE` / `COMPLETE` / `ARCHIVED`), `⋮` with
`Edit macrocycle` and `End macrocycle` (confirm: `END OPEN BLOCKS · COMPLETE`).

Three tabs: `OVERVIEW` · `BALANCE` · `PERFORMANCE`.

- **Overview** — `MESOCYCLE TIMELINE` with per-block status
  (`DONE` / `IN PROGRESS` / `PLANNED` / `UNPLANNED` / `NOT BUILT` / `ABANDONED`);
  `MACROCYCLE STATS · TO DATE` (`EST. STRENGTH` with an `InfoDot`,
  `TOTAL VOLUME · LB`, `SESSIONS LOGGED`, `ADHERENCE`); `BODY COMPOSITION`
  (`LEAN LB` / `FAT LB` / `CHANGE`, and the honest
  `DIFFERENT SCANNERS — NOT COMPARABLE` flag); `MEASURED RMR` (`KCAL/DAY`,
  *"measured from your lean mass"*) on cut/gain macros.
- **On a completed macro**, `RETROSPECTIVE` replaces "to date":
  `STRENGTH` · `MASS` · `COMPOSITION` · `PROGRESSION` · `BLOCKS`, with verdicts
  (`GAINING`, `LEAN`) and explicit `NOT MEASURED` / `NOT COMPARABLE` states.

**Honesty note for ch. 14:** `NOT MEASURED` and `NOT COMPARABLE` are rendered
states, not error states. The manual should teach them as answers.

### B2.4 `/cycles/meso/[mesoId]`

Header (`MesoHeader`): `MESOCYCLE`, name, `CURRENT` week, the `RIR` ramp with an
`InfoDot` (`rir_ramp`), a calendar glyph, a share glyph, and `⋮`:

`Edit plan` · `Edit details` · `Duplicate mesocycle` · `Place into macrocycle` ·
`Save as template` · `Share mesocycle` · `Delete mesocycle`.

- **`Edit plan`** now opens for a **planned or in-progress** block (N78). It
  reads `FINISHED` and is inert on `completed` / `abandoned` — frozen at three
  layers, because a finished block's plan is part of its record.
- **`Edit details`** — `NAME` · `START RIR` · `END RIR` · `Final week is a
  deload`, gated by state: `NAME · LENGTH · RIR RAMP` before it starts,
  `NAME ONLY — RAMP LOCKED ONCE STARTED` after.
- **Per-week RIR editor** (`RirScheduleEditor`) — `Set each week
  independently`, superseding the start→end ramp.
- **`Place into macrocycle`** — `FILLS THE NEXT OPEN SLOT — LOADS RESEED ON START`.
- **`Delete mesocycle`** — requires ticking `I understand this erases logged
  history`; refused where history exists.

Body: `OVERVIEW` · `BALANCE` · `PERFORMANCE`, and a start action
(`START MESOCYCLE` → `GENERATING W1`).

**Overview** is the plan view (`MesoPlanView`): per-day `EXERCISE(S)` with
`SETS`; `Nothing planned for this day.` when empty.

**Balance / Performance** (`MesoStatsViews`, `StrengthProgress`):
`SETS / WEEK` · `AVG SETS / WEEK — PLANNED` (with a `fractional_sets` `InfoDot`)
· `BALANCE CHECK` with `PUSH` / `PULL` / `LEGS`
· `PRS THIS MESO` (`No PRs yet this meso.`) · `STRENGTH BY MUSCLE GROUP`
(`ROLE-WEIGHTED MEAN OF THE LIFTS ABOVE (PRIMARY 1.0 · SECONDARY 0.5)`), scoped
`THIS MESO` / `THIS MACROCYCLE`. Threshold copy: *"Not enough data yet — an
exercise trends after 3 sessions."*

> **Corrected 2026-08-11 (doc 22 Phase 3e).** This section listed
> `TOP SET BY WEEK — KEY LIFTS` on the meso stats tabs. **N10 dropped that
> grid** (owner, 2026-07-03) along with the `ACROSS MACRO` single-exercise chart,
> as macro-scope content on a meso view — `MesoStatsViews.tsx:202`,
> `queries/stats.ts:505`. Found while writing ch. 12 against the same file.
> **Consequence for ch. 13** (Phase 3g): `KEY LIFTS` is no longer rendered on
> the meso page, so §C2's row for it — and the "add to glossary" recommendation
> attached to it — needs re-siting against whatever surface still shows key
> lifts before ch. 13 states anything about them.


### B2.5 `/cycles/meso/[mesoId]/plan` — the planner board

The single meso planning surface (doc 09). Structure is **groups-first**:
day → muscle-group block → exercise slots.

- **Day**: `LABEL` · `WEEKDAY` · `Edit day` / `EDIT DAY` · `Remove day`;
  `MUSCLE GROUPS — EXERCISES PER GROUP`; `ADD DAY`, `Add groups`.
- **Exercise row (N78 rework)**: reads as a line of plan with a `3 SETS / RIR 4`
  summary. All four controls moved into **one exercise sheet** behind a single
  tap: `STARTING SETS` (*"Week 1 only — the engine takes set progression from
  there."*) · `TARGET RIR` (`FOLLOW THE RAMP` or a value) · `Replace exercise` ·
  `Remove from day`.
- **The board's RIR column is flat by design.** The board shows one week's shape
  repeated — it has no week axis — so it writes the block-wide `target_rir`
  only. A slot already carrying a per-week assignment reads **`RIR BY WEEK`**
  and is never silently flattened; the sheet says what setting a value would
  replace. Per-week assignment lives on the day view's Effort target sheet,
  where the week is known.
- **`WEEKLY SETS PER MUSCLE`** preview, with `volume_landmarks` and
  `fractional_sets` `InfoDot`s — the plan self-checks before it runs.
- Actions: `SAVE CHANGES` / `NO CHANGES` · `SAVE AS TEMPLATE` ·
  `CREATE MESOCYCLE` (`NAME IT AND CONFIRM THE LENGTH`) · `DISCARD DRAFT`.
- Save confirm on a block with history: **`LOGGED HISTORY IS PROTECTED`**.
- Guards: `Add at least one exercise to finish.`,
  `Add a muscle group to start picking exercises.`,
  `Add a training day to start planning the week.`,
  `Couldn't save the plan — your changes are still here, try again`.

### B2.6 `/cycles/plan` — the ways to start a block

> **Corrected 2026-08-10 (doc 22 Phase 3b; `22a` `D-09`).** This section was
> headed *"the four ways"* and tabulated four rows read off the page's copy.
> **Three are reachable.** `Meso builder` is rendered with `href: null` and no
> `scratch` flag, so it paints at 45% ink and appends `" (soon)"`
> (`cycles/plan/page.tsx:31–35`, `:103`). Transcribing copy without checking the
> row's state is doc 22 §2's failure one level down — in the audit that exists to
> prevent it. Ch. 4 documents the three that work and says nothing about the
> fourth (doc 22 §8.4).

| Path | State | Copy |
|---|---|---|
| **Copy a mesocycle** | live | *"Carry progressive overload forward — start from where you left off."* → `CARRY THE STRUCTURE FORWARD — LOADS RESEED FROM YOUR BEST` |
| **Start with a template** | live | *"Pick a saved split and adjust from there."* → `THE PLANNER BOARD OPENS PREFILLED` |
| **Meso builder** | **placeholder — ` (soon)`, not tappable** | *"Generated from your muscle-group priorities — emphasize, grow, maintain."* |
| **From scratch** | live | *"Blank board. You name it and set the weeks at the end."* |

A saved draft shows `DRAFT IN PROGRESS` with *"Starting a new plan below
replaces this draft."*

### B2.7 `/cycles/meso/[mesoId]/planned/[week]/[day]`

Read-only view of a day that has not been generated yet: `NOT PLANNED YET`,
`PLANNED SETS`, `DELOAD WEEK`, and empty states.

## B3 · Templates tab

`/templates` — library with `TemplateFilterPanel`: `DAYS` · `SPLIT`
(`Full body` / `Upper / lower` / `Push pull legs` / `Upper` / `Lower` / `Arms` /
`Legs` / `Other`) · a gender axis (`ANYONE` / `Male` / `Female`) · search.
`No templates found.`

`/templates/[templateId]` — `YOURS` badge on your own, `DAYS/WK`, `SETS`,
`START A MESO FROM THIS`, and a share row.

**Known gap (N46, open):** there is **no edit path for a custom template**.
Ch. 15 states the positive rule — *save a new template from a block you have
adjusted* — rather than describing the absence (doc 22 §8.4).

## B4 · Exercises tab

### B4.1 `/exercises`

Two-axis filter — `MUSCLE` × `EQUIP` — plus search (doc 09's `FilterBar`
grammar, shared with the day view's pickers and the template panel). `CUSTOM`
badge on your own. `No exercises found.`

### B4.2 `/exercises/[exerciseId]`

Header: `LIBRARY` / `CUSTOM`, `EXERCISE`, primary/secondary muscle roles, share
glyph, `⋮` → `Load step` · `Share exercise` · `Delete exercise`.

- **`Load step`** (`LoadStepSheet`) — `PER-SET WEIGHT JUMP FOR THIS EXERCISE`,
  `CUSTOM` or `USE DEFAULT`; reads `DEFAULT` or `BODYWEIGHT` when not set. Two
  behaviors ch. 15 must carry, both confirmed in the connector's own description
  of the same setting: it **indexes the steps off the last weight you actually
  entered** (N67 — with a 10 lb step, 88 lb goes to 98 or 78, not to 90), and
  **prescriptions refresh on next view while logged history is never touched**.
- **Delete** is refused with a plain reason: `can't be deleted:` … (stock
  exercise, logged sets, or still referenced by a plan).

Two tabs:

- **`OVERVIEW`** — `LAST PERFORMED`; `ALL-TIME BESTS` (`WEIGHT PR · LB`,
  `EST. 1RM` with an `e1rm` `InfoDot`, `VOLUME PR`, `BEST SESSION VOL`);
  `TIMES TRAINED`, `TOTAL VOLUME · LB`, `FIRST LOGGED`; scoped `MACRO` /
  all-time. `Never` when unlogged.
- **`HISTORY`** (`ExerciseHistoryList`) — session rows with tags **`DELOAD`** and
  **`BACKED OFF`** (doc 21 §6.2, live), a toggleable `EFF LOAD` and `E1RM`
  readout (*"Tap to toggle effective load"* / *"Tap to toggle estimated 1RM"*),
  expandable session notes, and `LOAD OLDER`. `Never logged.` when empty.

> **N77:** the e1RM row no longer shows `EFF REPS` or a `~` on RIR. Sources
> predating 2026-08-06 that describe those are wrong.

### B4.3 `/exercises/new`

`NAME` · `EQUIPMENT` · `PRIMARY MUSCLE GROUP` · `SECONDARY — OPTIONAL` ·
`LOAD STEP` · `DESCRIPTION — OPTIONAL` · `NOTES — OPTIONAL`
(*"Private notes — only you see these"*) → `CREATE EXERCISE`.

The three **bodyweight load meanings**, verbatim and worth a table in ch. 15:

| Choice | Copy |
|---|---|
| `bodyweight only` | *"The load is your bodyweight — push-up, air squat."* |
| `bodyweight loadable` | *"Entered weight is ADDED to bodyweight — weighted pull-up."* |
| `machine assistance` | *"Entered weight is assistance REMOVED — assisted dip."* |

## B5 · More tab

### B5.1 `/more`

`WORKOUTS LOGGED` counter; `Set up your profile` when incomplete;
`Log bodyweight` quick-entry (`MEASUREMENT · LB`); `SETTINGS` —
`Theme` (`LIGHT` / `DARK` / `SYSTEM`), `AI connector` (`SET UP ›` or
`CONNECTED`), `BodySpec DEXA`, `Account & data`; `SIGN OUT`.

**(doc 23)** The footer is no longer the hardcoded `WORKOUT 0.1 — PRE-RELEASE`.
It reads **`WORKOUT {version} — WHAT'S NEW ›`** and is a **link to
`/more/whats-new`**; the number comes from the release registry, and CI asserts
`package.json` / `CURRENT_VERSION` / `max(RELEASES)` agree. Ch. 1 should
mention it as the door to "what changed".

### B5.1a `/more/whats-new` — version history **(doc 23)**

`what's new` · `WORKOUT {version} · EVERY RELEASE, NEWEST FIRST`. Newest first;
**feature** and **major** releases render their entries in full through
`ReleaseEntryList`; **fix** releases collapse to a version, date and one line,
expandable (`FixReleaseRow`). The current version is marked.

This page is the **durable copy** of the What's New sheet — which is why the
sheet is strictly once-only. Ch. 19 covers it alongside export and account data;
ch. 1 links to it as "how to see what changed".

### B5.2 `/more/profile`

| Field | Note for ch. 2 |
|---|---|
| `NAME` | — |
| `BIRTHDATE` | replaced `AGE` (doc 17 §2.5) — feeds the age taper |
| `HEIGHT` (`FEET / INCHES`) | — |
| `BODYWEIGHT` | shown with an **"as of" freshness label** wherever it displays |
| `TRAINING SINCE` | the training-age input |
| `TRAINING EXPERIENCE` | *"Drives starting volumes and how aggressively autoregulation ramps."* |
| `SEX` (`FEMALE` / `MALE` / `OTHER` / `PREFER NOT`) | *"Calibrates the realistic muscle-gain target on your macrocycles."* |
| `BODY FAT — MEASURED` / `— ESTIMATE` | two distinct states; `BODYSPEC DEXA` marks a measured value; `OVERRIDE WITH AN ESTIMATE`, `CUSTOM VALUE`, `PERCENT · ESTIMATE`, validated `2`–`70` |
| `EQUIPMENT ACCESS` | — |
| `EXCLUDED EXERCISES` | *"Excluded movements never appear in pickers or templates."*, `NEVER SHOWN IN PICKERS OR TEMPLATES`, optional reason (`Reason — e.g. LOW BACK`) |

**The two `Drives…` / `Calibrates…` lines are the app's own answer to ch. 2's
brief** ("what each one changes"). The manual should extend them, not restate
them differently.

### B5.3 `/more/account`

`LOGGING` → **`Match weight across sets`**
(`CHANGING A SET'S WEIGHT UPDATES THE REST`).
`DATA` → `Export training data` (`CSV ›`) · `Delete account` (`DELETE ›`).

`/more/delete-account` states plainly what goes: *"This permanently deletes your
account and **all** of your training data — macrocycles, mesocycles, logged
workouts, exercises, notes, and feedback. It cannot be undone."* — and points at
the export first: `WANT A COPY FIRST? EXPORT YOUR DATA AS CSV FROM THE MORE TAB
BEFORE DELETING.` Ch. 19 should carry both, in this order.

### B5.4 `/more/connector`

Covered in [`22d`](./22d-connector-inventory.md) §5 and §9. Current sections:
intro paragraph, `ENDPOINT` (`ADD THIS AS A CUSTOM / REMOTE MCP CONNECTOR` +
copy field), `HOW TO CONNECT` (3 steps), `ACCESS & REVOCATION`. Phase 6e
reworks this into the AI Manual's hub.

### B5.5 `/more/bodyspec` and `/more/bodyspec/[scanId]`

`CONNECT BODYSPEC ACCOUNT`; `CONNECTION` (`CONNECTED` / `NEEDS RECONNECT`,
`CONNECTED AS`, `LAST SYNCED`, `RECONNECT`); `SCANS` with `BODY FAT` / `LEAN LB`
per scan; `NO SCANS IMPORTED YET`;
`SYNC AFTER YOUR APPOINTMENT — RESULTS APPEAR WITHIN A FEW DAYS`;
`NOT AVAILABLE IN THIS ENVIRONMENT` when unconfigured. Scan detail carries
`VS PREVIOUS SCAN` with the comparability rules.

## B6 · Cross-cutting

| Thing | Where | Ch. |
|---|---|---|
| **`InfoDot`** — circled-i → anchored glossary card | 9 sites (see [Part C](#part-c--concept-inventory-0c)) | all |
| **Share codes** (`ShareRow` / `RedeemForm`) | exercise, template, mesocycle | 15 |
| | `SHARE — GET CODE`, `SHARE CODE`, *"One redemption — whoever enters it gets their own copy."*, `Have a share code?` | |
| **Set-log queue banner** | day view | 5, 19 |
| **Offline** | `/~offline`: `OFFLINE` + `RETRY` | 19 |
| **Toasts** | consistently *"…— check your connection"* | 19 |
| **Route skeletons** | every list/detail route | 1 |
| **What's New sheet** **(doc 23)** | `WhatsNewGate` in `(app)/layout.tsx` | 1, 19 |

## B6a · The What's New sheet **(doc 23)**

A modal the reader will meet, so ch. 1 and ch. 19 must account for it.

- **What it is.** A bottom sheet listing every **feature** release the account
  has not yet seen, accumulated — a user away for three releases sees **one**
  sheet covering all three. Dismissing it is an explicit action that writes
  `profiles.last_seen_version`; a force-quit means it appears again.
- **Who never sees it.** A new account is primed at onboarding, so its history
  starts now. Nobody saw one for 1.0.0 — every existing account was backfilled.
- **When it is suppressed** (doc 23 §6.4), and this is the part worth a sentence
  in ch. 5: it never appears over a workout you are **in**. The line is
  `workouts.status = in_progress`, which `logSet` flips on your **first logged
  set** — a workout you are *looking at* is `planned`, one you are *training* is
  `in_progress`. Also suppressed on `/log/**` unconditionally and while the
  set-logging queue still has pending writes.
- **Where the copy lives.** `src/content/releases/` — same renderer as the
  history page (`ReleaseEntryList`), so an entry reads identically in both.

**Contract note for Phases 3 and 6.** Release notes are a *third* user-facing
copy surface, and doc 23 §5.2 binds them to **doc 22's own contracts** — §8.4
positive framing and §8.5 plain language, plus hard rule 7 and the doc 10 §9
guardrails. The manual and the release notes must not describe the same feature
in different words.

## B7 · Two levers the app shows but cannot set

**A finding, and it constrains two chapters.** The **working-set cap** and the
**rep position** are read-only in the app: the Effort sheet renders them under
**`SET BY YOUR COACH`** with no control to change them. Both are written
**only** through the connector's `edit_mesocycle`
(`set_exercise_sets`, `set_exercise_rep_position`).

- **User Guide ch. 8** covers the target-RIR lever (app + connector) and should
  describe the cap and rep position as *things you will see if you or your AI
  set them*, with the positive framing rule applied (doc 22 §8.4): say where
  they are set, not that the app "can't".
- **AI Manual ch. 8** owns them as capabilities, and this is a strong worked
  example — the connector authors something the app then displays.

---

# Part C — Concept inventory (0c)

## C1 · The glossary as shipped

`src/lib/glossary.ts` — **13 terms**. Per doc 22 §8.1 the manual reproduces each
`body` **verbatim**.

| Key | Label | Rendered in-app today? |
|---|---|---|
| `rir` | REPS IN RESERVE (RIR) | ✅ day header (non-deload) |
| `rir_ramp` | RIR RAMP | ✅ meso header ×2, planner board |
| `deload` | DELOAD | ✅ day header (deload week) |
| `e1rm` | ESTIMATED 1RM (E1RM) | ✅ exercise Overview |
| `e1rm_confidence` | ESTIMATE CONFIDENCE | ❌ **no `InfoDot` anywhere** |
| `est_strength` | EST. STRENGTH | ✅ macro page, strength sections ×2 |
| `volume_landmarks` | MEV / MRV | ✅ planner board |
| `fractional_sets` | HOW SETS ARE COUNTED | ✅ planner board, meso stats |
| `pump` | PUMP | ✅ feedback sheet |
| `workload` | WORKLOAD | ✅ feedback sheet |
| `macrocycle` | MACROCYCLE | ❌ no `InfoDot` |
| `mesocycle` | MESOCYCLE | ❌ no `InfoDot` |
| `microcycle` | MICROCYCLE | ❌ no `InfoDot` |

**Finding C1-a:** four terms are defined but never surfaced. Three of them
(`macrocycle` / `mesocycle` / `microcycle`) are the app's core vocabulary, used
as headings on screens with no way to ask what they mean. `e1rm_confidence` is
the caveat behind a number the app shows. These are strong Phase-7 link/`InfoDot`
placement candidates, and ch. 3 / ch. 10 should not assume the reader has met
them.

## C2 · Jargon the app renders with **no** definition anywhere

Every string below is user-visible and undefined. Per doc 22 §8.1, a term the
manual needs is **added to `glossary.ts`** (gaining an `InfoDot` for free), not
defined only in the manual. Recommendation in the last column.

| Term (as rendered) | Where | Ch. | Recommend |
|---|---|---|---|
| **`MEASURED ANCHOR`** / the strength anchor | Prescription details | 10 | **add to glossary** — ch. 10's headline concept |
| **`PRESCRIBED IMPLIES`** | Prescription details | 10, 17 | manual-only (sheet-specific) |
| **`COMPUTED UNDER`** / `VERIFIED AS OF` | Prescription details | 17 | manual-only |
| **`TRACE`** | Prescription details | 17 | manual-only |
| **`SEED`** / **`ADVANCE`** (decision kind) | Prescription details | 10, 17 | manual-only |
| **`BACKED OFF`** | history rows, stats disclosures | 8, 13 | **add to glossary** — doc 21 §6.2, live, and easy to misread |
| **`EFF LOAD`** (effective load) | history rows | 13 | **add to glossary** |
| **`Load step`** | exercise ⋮, custom-exercise form | 15 | **add to glossary** — ✅ added 2026-08-10 (Phase 3b, ch. 15) |
| **`TARGET RIR`** (per exercise) vs the week's | Effort sheet, planner | 6, 8 | covered by an extended `rir` / new key |
| **`RIR BY WEEK`** | planner board | 8 | manual-only |
| **`Working-set cap`** / **`Priced at`** | Effort sheet (read-only) | 8 | manual-only — see [B7](#b7-two-levers-the-app-shows-but-cannot-set) |
| **Phases**: `ACCUMULATE` / `INTENSIFY` / `PEAK` | create macro, meso details | 14 | **add to glossary** |
| **`ADHERENCE`** | meso + macro stats | 13 | **add to glossary** |
| **`BALANCE CHECK`**, `PUSH` / `PULL` / `LEGS` | meso Balance | 13 | manual-only; **advisory only** per doc 10 §9 |
| ~~**`KEY LIFTS`**~~ | **Closed 2026-08-11 (Phase 3g).** Nothing renders the term. The grid went with N10; `key_lifts.n` / `selection` remain on the live row with **no consumer in the repo** — schema plus two removal comments ([`22a`](./22a-manual-claims.md) `D-16`) | — | **no glossary entry.** A card for a term no screen shows is the [`22c`](./22c-app-inventory.md) §C1-a defect this table exists to shrink. Revisit if a key-lifts surface returns |
| **`VOLUME PR`** / `BEST SESSION VOL` | exercise Overview | 13 | manual-only |
| **`model band`** / `REALISTIC TARGET` | create macro, macro Overview | 14 | **add to glossary** |
| **`MEASURED RMR`** (`KCAL/DAY`) | macro Overview | 16 | manual-only |
| **`NOT COMPARABLE`** | macro/DEXA surfaces | 13, 16 | manual-only — teach it as an answer |
| **`day slot`** | not rendered, but the model behind "the same exercise on the same day" | 3, 13 | **add to glossary** — ✅ added 2026-08-08 (Phase 3a, ch. 3) |
| **`straight` / `drop` / `amend` set types** | per-set menu | 5 | manual-only |
| **`no report`** (RIR) | set rows | 6 | manual-only — ties to the ch. 6 honesty message |

**Finding C2-a:** ten terms are recommended for `glossary.ts`. That is a Phase-3
side-deliverable, not a Phase-0 one — but it must be decided **before** ch. 3,
6, 10, 13, 14 and 15 are written, because §8.1 forbids the manual defining a
term the app also shows in different words.

> **Decided at Phase 3a (2026-08-08):** each term lands with the chapter that
> needs it, so its definition is authored by the pass that verifies the behavior
> behind it. `day slot` landed with ch. 3; **`Load step` landed with ch. 15
> (Phase 3b, 2026-08-10)**. Eight to go.

## C3 · The vocabulary the app has already chosen

Copy patterns the manual must match rather than reinvent:

- **"the program"**, not "the engine" — the day view says *"Reading the
  program's decision…"*. The word *engine* is confined to Prescription details
  (doc 19 §4.2, enforced by `prescription-narrative.test.ts`).
- **"the ask"** — the prescription's first line is *the ask*, and reporting
  honestly *even when it misses the ask* is the glossary's own phrasing.
- **Tracked all-caps for labels, sentence case for explanation** — hard rule 7.
- **No exclamation marks anywhere**, and none in this inventory's transcriptions.
- **Negatives are used only where the negative is the reassurance**
  (*"it never deletes logged history"*, `LOGGED HISTORY IS PROTECTED`) — which is
  exactly doc 22 §8.4's allowlist.

---

# Part D — FAQ candidates (0c, mined)

Per **O6**, ch. 21 is mined from `docs/notes/`, not invented. Sources: the
`S`-series questions, workstream **A**'s engine Q&A, `PH`/`PR` items, and the
review docs.

> **Read [`22b`](./22b-source-map.md) §5.6 first.** `A-engine-metrics.md` is a
> mid-2026 snapshot whose *answers* are partly stale. **Use it for the questions.
> Re-derive every answer from the code.**

| # | The question, as actually asked | Real cause | Answer source | Status |
|---|---|---|---|---|
| **F1** | *"Why did my weight go down?"* | The load is re-derived from the recency-weighted anchor each week; a lighter recent session lowers it. Not a punishment | `engine/reps.ts`, doc 16 | ready |
| **F2** | *"Is it adding weight every week?"* — no, and the reason surprises people | Double progression: reps climb +1/wk while target RIR drops −1/wk, so effective reps stay ~constant and **load is held** until the rep window tops out or the anchor moves | S4; `weight_selection: "rep_window"` | ready |
| **F3** | *"Why does this say fewer sets than I did?"* | Fractional counting — 1.0 primary / 0.5 secondary. A leg day can read "short" | S7, doc 10 §2, glossary `fractional_sets` | ready |
| **F4** | *"Why is my e1RM lower after a good session?"* | Two live causes: the estimate folds RIR in (an easier set at the same weight×reps scores lower), and the **stats** number is undecayed while the **prescription** anchor is recency-weighted | PH39, doc 22 §5 ch. 10 | ready |
| **F5** | *"My PR is 115×11 but the app shows 110"* | The same anchor-vs-stats distinction as F4, plus confidence down-weighting | PH39 | ready |
| **F6** | *"Do sets from a workout I haven't finished count?"* | **Yes, immediately** — volume, e1RM, PRs and the anchor all read logged sets with no status filter. Next-*week* generation, by contrast, runs only off completed workouts | PH41 / T-A8 (**open decision**) | ready — describe current behavior |
| **F7** | *"The prescription changed while I was mid-workout"* | Real and by design: newly logged sets feed the anchor, so later sets can reprice | PH40 / T-A7 (**open decision**) | ready |
| **F8** | *"Does adding a set carry forward?"* | **Within the block yes** (as a baseline feedback can then undo); **across a block boundary no** — a new block seeds sets from the planner board | S6 | ready |
| **F9** | *"How are deload weeks handled in stats?"* | Kept in volume and PRs; excluded from adherence and from the first→last trend. Separately, a **backed-off** session is excluded from strength reads and tagged | S3 / T-A2, doc 21 §6.2 | ready |
| **F10** | *"How is 'strength increase' calculated?"* | Rolling recent-best vs baseline-best within the block, rolled up per muscle and weighted by work done — which is why a fresh block's easy opener does not tank it | S2, glossary `est_strength` | ready |
| **F11** | *"Why did all my old numbers change on 2 August?"* | The doc 21 §2 / N71 re-levelling restamp: unreported sets had been read as taken to failure. 9 087 stamps moved, average **+4.80 lb**, strictly upward | PROGRESS 2026-08-02 | **must be in ch. 21** |
| **F12** | *"Why can't I edit this template?"* | No edit path exists (N46, open). State the positive: save a new template from an adjusted block | N46 | positive framing required |
| **F13** | *"Which mesocycle am I in?"* — now answerable more than one way | More than one block can be live. The app follows **the block holding your most recently logged set** | N79 | new, **must be in ch. 3** |
| **F14** | *"Where did Engine audit go?"* | Renamed **Prescription details** and moved onto the prescription strip's ask line | N75 | new |
| **F15** | *"Where did my completed cycles go?"* | Hidden behind the `/cycles` toggle, which carries the count | N76 | new |
| **F16** | *"Can I edit a block that has already started?"* | **Yes** — the planner board opens through `active`; finished blocks are frozen | N78 | new |
| **F17** | *"A set is stuck saving"* | The queue retries; the banner offers `TRY AGAIN`; the session is never blocked | N68, N73 | ready |
| **F18** | *"Why is the target only the low end of the range?"* | `macro_target.present: "conservative_end"` — the conservative end is shown deliberately, and there is no progress bar | doc 10 §5, doc 17 | ready |

**Two candidates deliberately excluded:** anything about engine-parameter tuning
or replay (admin, doc 22 §1.2), and anything about the measuring band (not live
— [`22b`](./22b-source-map.md) §4.1).

---

# Part E — Gaps, and what Phase 3 must not assume

1. **Device pass outstanding.** This is a code read. Motion, gesture, and thumb
   reachability claims need verification on device before shipping.
2. **Ten glossary additions to decide** ([C2](#c2--jargon-the-app-renders-with-no-definition-anywhere)) — before ch. 3, 6, 10, 13, 14, 15.
3. **Four defined-but-unsurfaced terms** ([C1](#c1--the-glossary-as-shipped)) —
   feeds Phase 7a's placement audit.
4. **Two open product decisions surface in the FAQ** (T-A7 in-session repricing,
   T-A8 in-progress sets). The manual documents **current behavior** and does not
   promise it is settled.
5. **`docs/notes/` answers are stale by design** — [`22b`](./22b-source-map.md) §5.6.
6. **Re-validate at Phase 4.** Batch 32 moved four surfaces in one day; this
   inventory is a snapshot of one commit.
