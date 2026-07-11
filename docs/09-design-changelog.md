# 09 — Design Changelog (post-mockup amendments)

Status: **authoritative for the deltas below**. This document records design changes made in
ongoing design sessions **after** the June 2026 mockup round captured in
[08-design-decisions.md](08-design-decisions.md). Where an entry here conflicts with 08 or
[06-design-system.md](06-design-system.md), **this document wins** (most recent dated entry
takes precedence). Figure numbers (1.1–4.5) refer to the mockup index in 08 §5 and the visual
source file `workout - App Screens v2.dc.html`.

> **Why this file exists.** 08 is the settled baseline. Designers keep iterating in separate
> design sessions, and those changes have to reach the production build (Next.js + Tailwind,
> see [07-implementation-plan.md](07-implementation-plan.md) / [PROGRESS.md](../PROGRESS.md))
> without ambiguity. Every design session appends a **dated entry** here so handoff to
> engineering is explicit and traceable.

## How to use this file (for designers)

Append a new `## YYYY-MM-DD — <short title>` section at the **top** of the Entries list for
each session. In it, for every discrete change include:

- **Change** — what is different now, concretely (screen + element).
- **Rationale** — why.
- **Affected figures** — e.g. `1.1`.
- **Impact** — one of the tags below, plus exactly what engineering must do.

**Impact tags**

| Tag | Meaning |
|---|---|
| `NET-NEW` | New behavior/spec for a screen **not yet built** — fold into the build, no retrofit. |
| `RETROFIT` | Changes a screen/component **already implemented** — code change required. |
| `TOKENS` | Touches design tokens / shared primitives — review for cross-screen impact. |
| `DATA` | Implies a data-model or query requirement — check [03-data-model.md](03-data-model.md). |
| `NO-CODE` | Mockup/spec clarification only; no engineering action. |

> **Build context as of 2026-06-13:** Phase 3 (logging flow) is **not yet implemented**
> (see PROGRESS.md → "Not done yet"). Everything in the 2026-06-13 entry below therefore
> lands as `NET-NEW` against the logging UI — there is no existing Day View code to retrofit.
> Build the Day View to this spec the first time.

---

## Entries

## 2026-07-11 — Bodyweight series: quick-entry, freshness labels, create-flow priming (doc 17 §5, N41 Phase 4)

The bodyweight measurement series (`bodyweight_log`) lands: profile bodyweight
edits now also append a dated point, and three small surfaces ride along.
**Rule-8 pass:** no mockup figure exists for a bodyweight quick-entry, a
freshness label, or the create-card priming line (re-verified against
`workout - App Screens v2.dc.html`: fig 4.4/4.5 show the profile card and data
rows without dates; fig 2.3's engine card has no measured-rate line). All three
treatments below are **house-style**, composed from established primitives;
this entry is the design record.

### 1. More page — "Log bodyweight" quick-entry row + sheet

- **Change:** the More page (fig 4.4) SETTINGS list gains a **"Log
  bodyweight"** row (above "AI connector"), right side showing the latest
  measured point as `205 LB · 30 JUN` (muted tracked caps, the settings-row
  grammar; `—` when no point exists). Tapping opens a `BottomSheet` — title
  `log bodyweight`, subtitle `MEASUREMENT · LB`, a weight input (prefilled
  with the latest known value) and a date input (defaults to today, may be
  backdated), Cancel + ink `SAVE` action. Saving appends a
  `source: 'manual'` point to `bodyweight_log`; **it never rewrites
  `profiles.bodyweight`** — the profile scalar stays the engine/profile
  input, edited only in the profile editor (doc 17 §5; doc 15 §3.3 boundary).
  Same-day re-entry overwrites that day's manual point (latest wins).
- **Rationale:** mass-denominated macro goals are ungradable without a
  measured series (N41); the quick entry is the cheapest honest writer, and
  backdating lets the owner bracket a block that just closed.
- **Affected figures:** none (fig 4.4's settings-list grammar).
- **Impact:** `NET-NEW` + `DATA` — `bodyweight_log` migration, quick-entry
  action + sheet component.

### 2. "As of" freshness label wherever profile bodyweight displays

- **Change:** profile-bodyweight displays gain a muted as-of suffix naming
  the date the value was last measured/updated: the More profile card's meta
  token and the create-engine profile chip (figs 2.2/2.3) read
  `205 LB · AS OF 30 JUN`; the profile editor's existing `UPDATED 30 JUN`
  suffix on the BODYWEIGHT row is reworded to `AS OF 30 JUN` (one vocabulary).
  The day-view BW chip (09 2026-07-04, T-I2) is exempt — it is a live editor
  whose value is current by construction, and the chip line has no room.
- **Rationale:** doc 17 §5 — the macro contract is priced off this number;
  a stale scalar should say so (doc 10 §9 honesty).
- **Affected figures:** 2.3 (chip row), 4.4 (profile card meta), 4.5
  (BODYWEIGHT data row).
- **Impact:** `RETROFIT` — suffix on three existing displays; no layout
  change.

### 3. Create engine card (fig 2.3) — prior-block measured-rate priming line

- **Change:** the create-macro engine card gains **one display-only line**
  when a prior **completed** macrocycle exists with a gradable strength
  rollup: below the PLAN card's phase strip, a top-ruled ledger line
  `LAST BLOCK MEASURED` / `+1.9%/MO EST. STRENGTH` (muted label left, numeral
  right). The rate is the block's est-strength headline (PR #157 rollup)
  normalized to %/mo over its logged span; blocks spanning under 28 days of
  logging don't qualify (a near-empty block can't honestly denominate a
  monthly rate). **Never blended into the target** (doc 17 principle 4) —
  the line is informational context for the human choosing a goal.
- **Deferred half:** doc 17 §5 composes this beside the model band
  (*"model band 1.5–3%/mo · your last block measured 1.9%/mo"*). The model
  band is currently hidden (N21 owner ruling 2026-07-04, pending v21
  activation), so the band half of the copy joins at **Phase R2** when the
  target cards are re-transcribed from figs 2.2/2.3; until then the line
  stands alone.
- **Affected figures:** 2.3.
- **Impact:** `NET-NEW` — prior-block rate lookup on the create page; line
  in `CreateMacroForm`'s PLAN card. Edit-macro (same engine, prefilled) does
  not show the line — priming is a create-time affordance.

## 2026-07-11 — Macrocycle closeout + retrospective (doc 17 §4, N40 Phase 3)

A macrocycle can now end — naturally when its last real block closes, or by an
explicit "End macrocycle" — and a completed macro's Overview grades the block
against the goal contract. **Rule-8 pass:** no mockup figure exists for a
completed-macro Overview, a retrospective card, or an End-macrocycle dialog
(re-verified against `workout - App Screens v2.dc.html`: fig 2.2 shows only the
live `MACROCYCLE STATS · TO DATE` block; the only "complete" surfaces are the
Workout Complete sheet). All three treatments below are **house-style**,
composed from established primitives; this entry is the design record.

### 1. Macro header ⋮ — "End macrocycle" + confirm sheet

- **Change:** the macro header's `⋮` menu (N24 grammar) gains a destructive
  **"End macrocycle"** row, shown only while the macro is `active`. It opens a
  `BottomSheet` confirm — title `End macrocycle`, subtitle
  `END OPEN BLOCKS · COMPLETE`, body copy: *"This ends every remaining block:
  anything with logged work is completed (open sets skipped), blocks never
  started are abandoned. Logged history is kept. This can't be undone."* —
  Cancel + accent `END MACROCYCLE` action. Exactly the End-mesocycle dialog's
  weight and geometry (fig 1.1 options menu, 09 session-5 §9), one level up.
- **Rationale:** owner's closeout semantics (2026-07-10): the close is a
  deliberate, irrevocable act mirroring the workout/meso closeout family —
  never end-date-driven. No history is deleted, so the delete-dialog's
  acknowledge-checkbox weight is not required.
- **Affected figures:** none (house-style; macro header per fig 2.2's header
  region).
- **Impact:** `NET-NEW` — `endMacrocycle` query + server action + MacroHeader
  menu/sheet.

### 2. Completed-macro Overview — retrospective replaces "to date"

- **Change (a):** once a macro is `completed`, the stats section header swaps
  `MACROCYCLE STATS · TO DATE` → **`RETROSPECTIVE`**, and a verdict list
  renders above the (unchanged) 2×2 stat tiles, in the ledger row grammar
  (tracked caps label left, value right, `1.5px` ink top rule):
  - **STRENGTH** — the est-strength headline vs the stored contract band,
    e.g. `+6.2% · TARGET +4–8%`, with a verdict tag `WITHIN BAND` /
    `ABOVE BAND` / `BELOW BAND` / `INSUFFICIENT DATA` (ink-bordered box, the
    PLANNED badge geometry — never orange; the macro is over, nothing is
    "current"). On a mass-goal macro the row is informational:
    `EST. STRENGTH +6.2% · NOT THE PROMISE` (factor-0.75/0 pacing — strength
    was never this macro's contract).
  - **MASS** — only on mass-denominated contracts (hypertrophy/cut/maintain):
    `NOT MEASURED` with a muted pointer line (*"needs a bodyweight series or
    DEXA scans bracketing the block"*) until N41/N34 land body data. Never
    proxy-graded.
  - **PROGRESSION** — the demand-side aggregate when progression decisions
    exist: `12 EARNED · 3 PACED · 5 HELD` with a muted breakdown line (pacer
    vs gate mix, vanished share). Hidden while the progression mode is
    inactive (no decisions recorded).
  - **BLOCKS** — the block outcome mix: `4 DONE · 1 ABANDONED · 2 NOT BUILT`.
- **Change (b):** on a completed macro the timeline's unplanned placeholders
  drop the `+ PLAN` affordance and read `NOT BUILT` (muted, dashed mark
  unchanged) — the macro is frozen; planning into it is over. The tiles keep
  their live definitions (adherence/volume restated at close reads the same
  numbers the macro accrued).
- **Rationale:** doc 17 §4.2 — grade against the contract
  (`target_low/high`), estimate-vs-estimate copy per doc 10 §9, verdict
  vocabulary fixed (never letter grades); derive-on-read, no new stored
  state.
- **Affected figures:** 2.2 (Overview stats region + timeline rows).
- **Impact:** `NET-NEW` + `DATA` — `macroRetrospective` fold shared by the
  Overview and `get_macrocycle_summary` (one definition of the verdict);
  natural close fires when the last real block reaches a terminal state.

## 2026-07-10 — Profile AGE row becomes BIRTHDATE (doc 17 §2.5, N21 Phase 1)

- **Change:** the profile data row **AGE** (fig 4.5) and the onboarding ABOUT
  YOU field **Age** are replaced by **BIRTHDATE** — same row/field pattern, a
  native date input instead of a number. The profile row displays the stored
  ISO date; a legacy profile that only carries the static age int shows
  `AGE <n>` until re-saved (no backfill; single-user deployment). Everything
  else on both screens is unchanged.
- **Rationale:** a stored age goes stale a year at a time, and the v21
  strength-path personalization now reads age (doc 17 §2.1). Age is derived
  fresh from birthdate at plan time (`profileAge`), falling back to the
  legacy int.
- **Affected figures:** 4.5 (profile), onboarding step 1.
- **Impact:** `RETROFIT` + `DATA` — `profiles.birthdate date` (migration
  `20260710000001`); onboarding/profile editors swap the field; every age
  read (`profileToMacroProfile`, MCP `get_profile`, More card) goes through
  the derived age.

## 2026-07-09 — Three-state set marker: `met` glyph joins ▲/▼ (doc 16 §5.3, N35 Phase 3)

- **Change:** the P19 per-set performance marker on logged set rows (Day View,
  fig 1.1) becomes **three-state**. `over` keeps the small ink `▲` at the top
  right corner of the reps cell and `under` keeps the `▼` at the bottom right;
  the in-band case — previously rendered as *absence* — now shows a small ink
  `■` (6px vs the carets' 8px, same `ink/50`), vertically centered on the
  cell's right edge between the carets' two positions. Accessible names:
  "above prescription" / "met prescription" / "below prescription". The
  on-target band is no longer a UI constant: marker, engine earn gate, and
  grading read the one shared tunable (`engine_params` →
  `progression.compliance_band`; ±1.5% default while the block is absent, the
  same value as the retired module-local `MARKER_BAND`).
- **Rationale:** doc 16 (prescribed progression) — under the earned-step model
  an in-band set is a *positive* state (delivering the ask is what earning
  looks like) and deserves a glyph rather than absence (owner ruling,
  follow-up 3 §4). Session-level "progression earned" stays disclosed through
  the existing rationale/audit affordances — no new indicator, display stays
  uncomplicated.
- **Affected figures:** 1.1 (set grid). Like the original P19 pair this is
  **house-style — no mockup figure exists for the marker** (rule-8 pass
  re-verified against `workout - App Screens v2.dc.html`: the only ▲/▼
  occurrences are annotation prose, not set-row treatments). Ink-only glyphs
  per the ledger system; orange stays reserved for position/selection.
- **Impact:** `RETROFIT` — shipped with N35 Phase 3 (`DayView` `SetRow` +
  `day-rules.ts::loggedSetMarker` delegating to the engine's shared
  comparison).

## 2026-07-05 (session 2, cont.) — Per-week RIR editor (N18-B)

- **Change:** both RIR surfaces — the planner **FinalizeSheet**'s ADVANCED
  disclosure (fig 2.8) and the meso header's **Edit details** sheet — gain a
  "Set each week independently" toggle (the deload checkbox grammar). Enabling
  it seeds one row per working week from the current ramp (`W1 … Wn`, each the
  same 0–5 segmented control as START/END RIR) and **hides the START/END pair**
  while active (the schedule supersedes it; no dead controls). The deload week
  never gets a row — a muted note reads `W{n} DELOAD — RIR SET BY THE ENGINE`.
  Values are deliberately free-form (any 0–5 per week, no descend constraint —
  flexibility is the point). The collapsed summary line reads
  `RIR BY WEEK: 3·2·2·1` instead of `RIR RAMP: 3 → 0`, and the meso header's
  ramp line follows the same swap. Changing WEEKS with a schedule active
  truncates it or extends it by repeating the last week's RIR.
- **Rationale:** N18 Batch-7 — "allow the RIR for each week to be set
  independently, rather than just choosing a ramp, for more flexibility…
  a deep option that we don't need to make overly obvious." Same disclosure,
  zero new surface when untouched.
- **Affected figures:** 2.8 (finalize), meso header edit sheet. **Impact:**
  `NET-NEW` + `DATA` — `mesocycles.rir_schedule` (per-working-week array; the
  deload RIR stays engine-owned), threaded through create/edit/duplicate/copy,
  the activation ramp, the doc-14 freshness reconcile, and the MCP
  create/update/read tools.

## 2026-07-05 (session 2) — Unified filter grammar: shared FilterBar (N29)

- **Change:** one shared **FilterBar** primitive (`components/ui/FilterBar.tsx`)
  replaces the three divergent filter UIs. The grammar generalizes the exercise
  library's two-axis idiom (fig 3.1, the sleekest of the three): each axis is a
  52px tracked-caps caption + a horizontally scrolling chip track led by an
  `ALL` reset chip; selected = filled ink with an `✕` (tapping the active chip
  also clears); while any axis is active, a live result count and a `CLEAR ALL`
  underline action appear. Chips are `min-h-8` (≥32px tap target), square,
  ink-selected — orange stays reserved for current position. State lives with
  the caller, so the same bar serves client-state surfaces and URL-driven ones.
- **Adoptions:** the **Templates tab** (fig 3.3) and the **from-template
  picker** (fig 2.4 option 02) swap their three `<select>` dropdowns for chip
  rows — `DAYS` (2–7), `SPLIT` (full body … other), `FOR` (ANYONE / FEMALE /
  MALE) — and gain the count + CLEAR ALL affordance the selects lacked; both
  render one shared `TemplateFilterPanel` (search form + FilterBar), still
  URL-driven. The **exercise library** (fig 3.1) keeps its exact behavior but
  its MUSCLE axis gains the leading `ALL` chip the original 3.1 spec described
  (previously only EQUIP had one). The **planner exercise picker** (fig 2.7)
  adopts the same chips for its equipment row and gains the `EQUIP` axis
  caption (previously an unlabeled, differently-sized chip row).
- **Rationale:** N29 — "a bit of a sleeker filtering UI for exercises and
  templates. They feel disjointed and clunky." Three hand-rolled chip specs and
  a select grid encoded the same filled-ink selection grammar with different
  sizes, borders, and affordances.
- **Affected figures:** 3.1, 3.3, 2.4, 2.7. **Impact:** `TOKENS` + `RETROFIT` —
  new shared primitive; no data changes. Deliberate deltas: templates filtering
  is now chip-based rather than dropdown-based, and its count line reads
  `n TEMPLATES` (no `OF total` — the list is server-filtered, the unfiltered
  total isn't fetched).

## 2026-07-05 — Glossary info affordance (InfoDot) + template-picker filters (N25, N29)

- **Change:** app-wide **InfoDot** primitive (`components/ui/InfoDot.tsx`) — the
  feedback sheet's circled-"i" trigger grammar (17px, or 14px `small` on dense
  meta lines; open state inverts to ink) generalized into a shared affordance
  that opens an **anchored glossary card**: ink/35 scrim + a square
  `border-[1.5px] border-ink` card (264px, `shadow-menu`, AnchoredMenu
  placement — below the trigger, flipping above when it won't fit) with a
  tracked all-caps term label and 2–3 sentence body. All copy comes from one
  source, `src/lib/glossary.ts` (RIR, RIR ramp, deload, e1RM, MEV/MRV,
  fractional set counting, pump, workload, macro/meso/microcycle) so a term is
  explained with the same words everywhere. **Rationale:** N25 — technical
  terms sit all over the app with no intuitive route to clarity; the owner
  asked for help affordances that don't clutter. **Affected figures:** 1.4
  (feedback sheet), 1.1 (day-view header meta), 2.6 (planner), 4.1/4.3
  (stats), 3.1 (exercise page). **Impact:** `TOKENS` + `RETROFIT` — new shared
  primitive; the two ad-hoc feedback-sheet explainers (pump/workload inline
  expanders) are migrated onto it. Deliberate delta: the workload explainer
  no longer auto-expands on sheet open (the slider's JUST RIGHT center label
  keeps the essential cue; full copy is one tap away, consistent with every
  other term).
- **Change:** wave-1 InfoDot placements: day-view header `TARGET n RIR` /
  `DELOAD WEEK` line (terms: RIR / deload), meso calendar ramp footer +
  edit-details START RIR (RIR ramp), planner finalize-sheet START RIR (RIR
  ramp), planner WEEKLY SETS PER MUSCLE header (MEV/MRV) + DIRECT·SECONDARY
  weights line (set counting), meso Volume tab SETS/WEEK header (set
  counting), EST. STRENGTH header on meso/macro Performance (e1RM), exercise
  page EST. 1RM best cell (e1RM). Placement is intentionally incremental —
  more surfaces adopt it as they're touched. **Impact:** `RETROFIT`.
- **Change:** the **from-template picker** (fig 2.4 option 02) gains the same
  DAYS/WK · SPLIT · FOR filter bar as the Templates tab (fig 3.3), URL-driven,
  search preserves active filters. **Rationale:** N29 — `listTemplates`
  already supported the filters; the picker just never rendered them.
  **Affected figures:** 2.4. **Impact:** `RETROFIT` (reuses
  `TemplateFilters` unchanged).

## 2026-07-04 (session 5) — History-sheet fixes from N15 testing (N32)

Owner field-tested the session-4 drill-down; three amendments (Batch 9 →
N32).

- **Change:** the drill-down history sheet opens on **sets/reps** like every
  other history entry point — the session-4 "e1RM-first" opening is
  **reverted** (tap a row to flip to e1RM, standard PH32 behavior).
  **Rationale:** owner: "keep the standard history behavior".
  **Affected figures:** 3.2. **Impact:** `RETROFIT` (amends the session-4
  entry).
- **Change:** the history sheet's subtitle **exercise name is a link** to the
  exercise page (`/exercises/{id}`, ink underline), on every entry point (day
  view, picker, drill-down). `BottomSheet.subtitle` widened to a ReactNode.
  **Rationale:** owner: users should be able to reach the full exercise page
  from the History panel. **Affected figures:** 3.2. **Impact:** `RETROFIT` +
  `TOKENS` (shared BottomSheet prop).
- **Change (bug, behavioral):** sheets no longer fight the N6 pull-to-refresh
  — while any overlay holds the scroll lock, `PullToRefresh` never arms
  (the lock's `position:fixed` zeroes `window.scrollY`, so every drag on an
  open sheet read as a top-of-page pull: the page behind the scrim visibly
  shifted and a long drag fired a refresh mid-interaction; present on all
  sheets since N6). Sheet panels also gain `overscroll-contain` and isolate
  their touch events. **Affected figures:** all sheets. **Impact:** `TOKENS`
  (BottomSheet / PullToRefresh / useScrollLock primitives).

## 2026-07-04 (session 4) — Macro header adoption, history drill-down, set-row scale, origin-aware back links

Batch-7 build 3 (N24/N15/N26/N27, with the N28 sort fix riding along). No
mockup figures exist for the macro header or the drill-down rows; they adopt
the established P16 header grammar and the fig-3.2 history sheet (recorded per
rule 8).

- **Change:** the macrocycle page (2.2) header is rebuilt as a sticky
  `MacroHeader` on the day-view/meso/exercise header grammar: brand row
  (`‹ CYCLES` back link + `MACROCYCLE` context label), 27px title + `⋮` icon
  button, meta line (`GOAL <TYPE> · <SPAN> · <N> MONTHS`) + status badge
  (ACTIVE in accent — the meso header's CURRENT geometry; COMPLETE/ARCHIVED
  in muted ink), with the owner's goal-notes line beneath when present. The ⋮
  `AnchoredMenu` carries **Edit macrocycle** (the existing `/edit` route —
  goal, duration, notes, and blocks all edit there), replacing the full-width
  `EDIT MACROCYCLE` link that sat at the bottom of the OVERVIEW tab. No share
  button — macrocycles aren't shareable. **Rationale:** N24 — completes the
  header unification: day view, meso, exercise, and macro now share one
  sticky-header idiom. **Affected figures:** 2.2. **Impact:** `RETROFIT`
  (route skeleton updated to match).
- **Change:** day-view set rows (1.1) scale up ~10%: value cells 32→35px tall
  at 15px (was 14px) type, row padding 4→5px, and the LOG box 21→23px (its
  ✓ 12→13px; the R18 full-cell tap target grows with the cell to 44×35px).
  Column grid (`20px 1fr 1fr 44px`) and the header row are unchanged.
  **Rationale:** N26 — owner: "they're just slightly too small". Amends the
  09 §5 "denser rows" values. **Affected figures:** 1.1. **Impact:**
  `RETROFIT` + `TOKENS` (LogCheckbox is a shared primitive; pull-to-refresh
  reuses only its travelling-gap animation, not the box size — unaffected).
- **Change:** the day-view ⋮ → "Mesocycle stats" deep link now carries its
  origin (the N4 `?from=` pattern): the meso page's back link reads
  `‹ WORKOUT` and returns to the workout you came from instead of the
  hardcoded `‹ CYCLES`. Only a same-app `/log/<id>` path is honored.
  **Rationale:** N27 — "you should always back link where you came from".
  **Affected figures:** 2.3. **Impact:** `RETROFIT`.
- **Change:** Performance-tab trend rows drill into history: the macro tab's
  muscle-group **contributor rows** and the meso tab's **ALL EXERCISES rows**
  are now tappable (a `›` after the meta line marks it) and open the fig-3.2
  history sheet **scoped to that cycle's mesocycles** — subtitle reads
  `<EXERCISE> — THIS MACROCYCLE` / `THIS MESO` in place of the equipment tag —
  and **e1RM-first**: the sheet opens on the e1RM view (the number the trend
  is made of) and a row tap flips to sets/reps, the inverse of the PH32
  default for this entry point only. Scoped history pages exactly like the
  full sheet (N30's LOAD OLDER row). **Rationale:** N15 — "drill even further
  down in macro muscle groups all the way down to exercise history".
  **Affected figures:** 3.2 (new entry point; sheet layout unchanged).
  **Impact:** `RETROFIT`.

## 2026-07-04 (session 3) — Planner picker: replace-in-place mode (N31)

- **Change:** tapping a **filled** row on the planner board (2.5) now opens
  the exercise picker (2.7) in a *replace* mode instead of the group
  multi-select: title "Replace exercise", subtitle
  `SWAPS <NAME> — SAME SLOT & SETS`, single-select rows (radio behavior,
  seeded with the current movement), exercises already filling another slot
  of the same group disabled with an `ALREADY IN THIS GROUP` sub-label, and a
  full-width `REPLACE EXERCISE` submit (disabled until a different pick).
  The swap keeps the slot's day position, group slot, and starting sets.
  Open-slot rows keep the original multi-select ("ADD TO …") unchanged.
  **Rationale:** N31 — substitution via the multi-select appended the pick at
  the day's end, kept the original, and grew the slot count.
  **Affected figures:** 2.5 / 2.7. **Impact:** `RETROFIT` (shipped PR #143).

## 2026-07-04 (session 2) — Exercise surfaces: shared header, create-page rebuild, new-exercise tray, paged history

Batch-7 build 2 (N22/N23/N30). No mockup figures exist for these controls; the
header adopts the established P16 meso-header grammar and the trays mirror the
PH27 template tray (recorded per rule 8).

- **Change:** the exercise detail page (3.1a/b) header is rebuilt as a sticky
  `ExerciseHeader` on the day-view/meso header grammar: brand row (back link —
  still honoring the N4 `?from=` origin — + `LIBRARY` context label), 28px
  title + `[share][⋮]` icon cluster, meta line + `CUSTOM` badge. The ⋮
  `AnchoredMenu` carries **Load step** (the I13 sheet — now shown *disabled*
  with a `BODYWEIGHT` trailing tag on bodyweight-only lifts instead of
  vanishing, PH36 intent preserved), **Share exercise** and **Delete
  exercise** (owned custom only). The share row leaves the bottom of the
  OVERVIEW tab for a share sheet behind the header icon (meso-header
  pattern). Delete gets a confirm sheet that mirrors the MCP tool's guards —
  refused with reasons when logged sets or plan references exist (hard rule
  #5). **Rationale:** N22 — the increment felt absent behind a faint `⋯`;
  header unification (day view / meso / exercise share one idiom).
  **Affected figures:** 3.1a/3.1b. **Impact:** `RETROFIT`.
- **Change:** the create-exercise page (08 §4, described-not-mocked) is
  rebuilt as divided ledger sections (NAME / EQUIPMENT / MUSCLES / LOAD STEP /
  DETAILS): bodyweight equipment picks now explain their load semantics
  inline, and a **LOAD STEP** section (same preset-chip grammar as the
  Load-step sheet, `DEFAULT +n lb` chip first, CUSTOM entry) makes the
  per-exercise increment settable **at creation** — previously
  create-then-edit. Hidden for bodyweight-only equipment (inert there).
  **Rationale:** N22(b) — owner: increments must be available at creation.
  **Affected figures:** none (08 §4). **Impact:** `RETROFIT`.
- **Change:** the exercises page `+ NEW` control becomes a chooser tray
  (template-tray grammar): **Blank exercise** row → the create page, plus the
  `OR ADD FROM A CODE` redeem input. **Rationale:** N23 — a user handed an
  exercise share code looks under *new exercise*, not the meso/template trays
  (redeem stays kind-agnostic; any code routes right). **Affected figures:**
  3.1. **Impact:** `RETROFIT`.
- **Change:** exercise history (3.2 — HISTORY tab and the day-view history
  sheet) no longer truncates silently at ~120 sets: older sessions lazy-load
  via a quiet `LOAD OLDER` ledger row (auto-fires as it scrolls into view;
  tappable as the fallback; shows `LOADING OLDER…` / retry states) until the
  history is exhausted. **Rationale:** N30 — full history must be reachable;
  the silent cap hid the N14 outlier session. **Affected figures:** 3.2.
  **Impact:** `RETROFIT` + `DATA` (paged `getExerciseHistory`).

## 2026-07-04 — Batch-7 build 1: planner set stepper, create-time RIR disclosure, cycles-tray redeem, target cards hidden

No mockup figures exist for the three new controls; each reuses established
grammar (recorded per rule 8). The card removals retrofit existing screens.

- **Change:** each filled planner-board row gains a compact −/＋ `START SETS`
  stepper (group-slots stepper grammar at 28px row scale, `START SETS`
  micro-caption below) between the exercise text and ✕; the `· START n SETS`
  text leaves the sub-label. **Rationale:** N17 — the seed was plumbed but
  uneditable. **Affected figures:** 2.5. **Impact:** `RETROFIT` (shipped
  PR #140).
- **Change:** the finalize sheet's `RIR RAMP: x → y` caption is now a
  disclosure row (right-aligned `EDIT`/`DONE` underline affordance) expanding
  to the edit-details sheet's START RIR / END RIR segmented rows + the
  final-week-deload checkbox. Collapsed by default with standard values.
  **Rationale:** N18-A — a deep option without badgering. **Affected
  figures:** 2.8. **Impact:** `RETROFIT` (shipped PR #140).
- **Change:** the cycles `+ NEW` sheet appends the template tray's
  `OR ADD FROM A CODE` divider + redeem input below the macro/meso rows.
  **Rationale:** N20 — one receptacle per create surface; redeem is
  kind-agnostic. **Affected figures:** 2.1b. **Impact:** `RETROFIT` (shipped
  PR #140).
- **Change:** the macro overview's `REALISTIC TARGET` card and the
  create-macrocycle `YOUR TARGET` range/rate/rationale are hidden; the create
  form keeps the block-fit sentence + M1..Mn phase strip under a plain `PLAN`
  label (ink/55, not accent — rule 7). **Rationale:** N21 — the target engine
  needs correction before the numbers are shown again; hiding is a pure view
  change. **Affected figures:** 2.2, 2.3. **Impact:** `RETROFIT` (shipped
  PR #140); re-enabling later is view-only.

## 2026-07-03 (session 4) — I12 completes in-app: place-into-macro, edit details, block management, planner volume readout

Owner authorization (2026-07-03, in-chat): *"I will take your design direction
on these… You're authorized to rework in any way you see fit to produce a
well-designed and intuitive end result."* No mockup figures exist for these
four surfaces; each reuses established grammar and is recorded here as the
design of record.

- **Change (meso ⋮ menu → "Place into macrocycle").** On a **standalone
  planned** meso only. Opens a bottom sheet listing the user's macrocycles —
  name, goal + block count — each row stating exactly where the meso would
  land: `FILLS M2` (consumes the earliest open slot, inheriting its phase) or
  `ADDS AS M5` (appends). One tap places it and lands on the macro timeline.
  Explicit position choice stays MCP-only (`place_mesocycle`); the default
  placement is the overwhelmingly common case. Empty state links to the
  macrocycle engine.
- **Change (meso ⋮ menu → "Edit details").** Any non-frozen meso. A sheet in
  the finalize-sheet grammar (fig 2.8): NAME always; WEEKS (3–8 segmented
  row), START/END RIR rows (end clamped ≤ start), and a "final week is a
  deload" checkbox — the shape controls render **only while the meso hasn't
  started** (subtitle: `NAME ONLY — RAMP LOCKED ONCE STARTED` after). Closes
  on save; server guards unchanged (`updateMesocycleAttrs`).
- **Change (macro edit page → BLOCKS section).** Below the re-plan form: the
  full timeline as rows (`M{n}`, name, status), with ▲▼ on not-yet-started
  blocks (a move never crosses a started/completed row), ✕ on open slots
  only, and a dashed `+ ADD BLOCK` appending a placeholder at the macro's
  block length. Applies immediately (not staged with the form) — stated in
  the caption.
- **Change (planner board → WEEKLY SETS PER MUSCLE).** Between the day list
  and SAVE AS TEMPLATE: fractional weekly sets per muscle over the CURRENT
  board (updates live as sets/exercises change), each row showing the
  experience-scaled band (`MEV 10 · MRV 22`), with `UNDER MEV n` / `OVER MRV
  n` emphasized in ink when out of band (no accent — rule 7). Counting is
  the shared R14 fold — relocated to `lib/plan/volume-preview.ts` so the
  board, the Balance tab, and MCP `preview_mesocycle_volume` share one
  definition. A just-added exercise credits its group at the direct weight
  until its roles arrive with the revalidation.
- **Affected figures.** 2.2-adjacent (macro edit), 2.5 (planner board), the
  meso page header menu. All `RETROFIT`, shipped with this entry's build.

## 2026-07-03 (session 3) — Meso header menu: Duplicate; START gate surfaces proactively (I12)

- **Change (meso ⋮ menu).** The mesocycle header's ⋮ menu (P16 grammar) gains a
  **"Duplicate mesocycle"** row between "Edit plan/weeks" and "Save as template":
  one tap copies the meso's settings + planner board (loads are never copied — the
  engine reseeds on activation) into a fresh standalone `planned` meso and lands on
  its page. Failure returns with an inline accent error line (same pattern as the
  template error).
- **Change (START MESOCYCLE).** On a planned meso whose activation is gated —
  another block is live, or earlier-positioned siblings in its macrocycle aren't
  finished — the START button now renders **disabled with the reason as a muted
  (`ink/55`) line beneath it**, instead of looking tappable and failing with a
  reactive error. The server-side gate is unchanged; the reactive accent error
  remains for races.
- **Rationale.** I12: the MCP authoring surface got duplicate + gated activation in
  PR #92; the in-app surface offered neither, and a dead-looking failure on tap
  violates the "acknowledge every input" bar (N1).
- **Affected figures.** → 2.2/2.5-adjacent (meso page header menu, START button
  state). No mockup figure exists for either control; both reuse the established
  menu-row / disabled-button grammar (`LOCKED` precedent) — recorded as a rule-8
  deviation in PROGRESS.
- **Impact.** `RETROFIT` — shipped with the same entry's build (PR #134).

## 2026-07-03 (session 2) — Performance-tab reorg: macro drill-down (N9) + meso trim (N10)

Owner decisions (verbatim in `docs/notes/backlog.md` appendix Batch 5). Amends
the Performance tabs introduced in the 2026-07-02 session-6 entry (M8/I11/PH37
— still no mockups for these surfaces; the rule-8 deviation carries over).

- **Change (macro Performance tab):** the **muscle-group strength gain is the
  primary statistic** — full-width rows (group name + role-weighted % gain),
  each **expandable** (▸/▾ disclosure) to the exercises that rolled into that
  number (name, first→last e1RM, session count, % score, `SECONDARY` marker on
  0.5-credit links). The **flat "ALL EXERCISES" list is dropped at macro
  scope** — across a whole macro it grows too long to read; per-exercise detail
  now lives inside its group. An exercise linked to several groups appears
  under each (fractional credit is expected, footnoted on the section).
- **Change (meso Performance tab):** the **"TOP SET BY WEEK — KEY LIFTS" grid
  and the "ACROSS MACRO — {lift} EST. 1RM" chart are removed** (macro-scope
  content on a meso view). The tab is now: est-strength trend (all exercises +
  muscle rollup, unchanged) + PRS THIS MESO.
- **Rationale:** muscle groups are the honest unit across a macro's many months
  and exercise swaps; single-exercise macro charts belong to macro-scope
  surfaces, not the meso tab.
- **Affected figures:** 4.3 (meso Performance) and the (mockup-less) macro
  stats Performance panel.
- **Impact:** `RETROFIT` — shipped in the same PR (`MesoStatsViews.tsx`
  `PerformanceView` trim; new `MuscleStrengthSection.tsx` on
  `cycles/macro/[macroId]/page.tsx`; rollup carries `contributors[]` in
  `queries/stats.ts`).

## 2026-07-03 — Planned-meso badge + future-meso muting (N8)

Owner decision (verbatim in `docs/notes/backlog.md` appendix Batch 5 + the
same-day addendum). The v2 mockup predates this — its fig 2.1 planned rows
still show the empty checkbox; this entry supersedes that detail.

- **Change (cycles list, fig 2.1):** planned mesocycles no longer render the
  empty checkbox — they get a **"PLANNED" text badge** in CURRENT's exact
  geometry (1.5px border, 8.5px/700/0.12em caps, 3px 7px padding) in **ink**
  rather than accent (the owner's "white": ink renders cream-white under the
  dark ledger inversion). The checkbox vocabulary is reserved for completion
  (✓ filled box). Row muting widens from unplanned-only to **every future
  meso**: planned + unplanned names at ink/50, sublines at ink/45 — only
  current/completed render full ink. Applies to macro-grouped and standalone
  rows alike.
- **Change (macro overview timeline, fig 2.2):** the numbered `TimelineMark`
  vocabulary stays, but **planned rows swap the right-side progress bar for
  the same PLANNED badge** (a zero-progress bar on a not-yet-started block
  carried no information); the same muting scheme applies (planned titles
  ink/50, sublines ink/45; unplanned rows keep `+ PLAN` and their existing
  muting; completed/active keep their bars).
- **Rationale:** an empty checkbox reads "incomplete task", not "scheduled
  block" — the badge names the state; muting keeps the current position the
  loudest element on the ledger (08 §1: orange marks current position only).
- **Affected figures:** 2.1, 2.2.
- **Impact:** `RETROFIT` — shipped in the same PR (`cycles/page.tsx`
  `StatusMark` + row muting; `cycles/macro/[macroId]/page.tsx` timeline).

## 2026-07-02 (session 6) — Meso page rework (P16) + macro stats tabs (M8) + strength trends (I11/PH37)

Owner-decided rework of the cycle surfaces (decisions verbatim in
`docs/notes/backlog.md` appendix Batch 4). No mockups exist for these — the
owner explicitly approved designing them from the existing patterns (recorded
rule-8 deviation); fidelity anchors are the day-view header (1.1), the planner
board (2.5), and the meso stats views (4.1/4.2).

### 1. Meso page = header + `OVERVIEW | BALANCE | PERFORMANCE` toggle — `RETROFIT`, `NET-NEW`
- **Change.** The meso detail page's button stack (EDIT / GO TO / MESO STATS /
  SAVE AS TEMPLATE / SHARE / DELETE) is replaced by:
  - a **day-view-style sticky header** (back link + macro context; title;
    meta + status badge; orange **completion progress bar** over the planned
    week×day grid) carrying three header actions — a **calendar button** that
    drops down the week × day matrix (the old page-body RIR ramp matrix; days
    clickable → day view when materialized, read-only planned view otherwise),
    a **share button** (opens the share-code sheet), and a **⋮ menu** holding
    *Edit plan/weeks* (locked once history exists, as before), *Save as
    template*, and *Delete mesocycle*;
  - a top-level **`OVERVIEW | BALANCE | PERFORMANCE`** segmented toggle.
    **OVERVIEW** renders the planner board **read-only** (day tabs + the flat
    ordered exercise list; editing goes through the ⋮ menu → planner board);
    GO TO / START stays its primary action. **BALANCE / PERFORMANCE** are the
    meso stats views, absorbed from the standalone screen.
- **Tab naming.** The owner's P16 wording said "volume" for the middle tab;
  his M8 wording said "balance" for the same view at macro scope. Reconciled
  to **BALANCE** on both surfaces — this file's 2026-06-14 §4 already retired
  "Volume" as a tab name for exactly this content, and M8's whole point is
  meso/macro naming unification.
- **Affected figures.** 2.2-old territory (meso detail), 4.1/4.2 (now panels
  of the meso page; `/cycles/meso/[id]/stats` redirects into the toggle).
- **Impact.** `RETROFIT` + `NET-NEW`. The "MESO STATS" button and screen are
  gone; deep links redirect.

### 2. Macro page gains the same three-way toggle (M8) — `NET-NEW`
- **Change.** Macrocycle Overview (2.2) gets `OVERVIEW | BALANCE |
  PERFORMANCE`. OVERVIEW keeps the existing content (realistic target,
  timeline, stat tiles, edit). **BALANCE** = the 4.1 balance view at macro
  scope (fractional sets averaged over materialized weeks across the macro's
  mesos; unbuilt future weeks excluded — no cross-meso projection).
  **PERFORMANCE** = the strength-trend sections below.
- **Impact.** `NET-NEW`; macro stats stay on the macro page per the
  2026-06-13 §6 "contextual stats, no tab" rule.

### 3. Est-strength trends: per-exercise list + muscle rollup (I11/PH37) — `NET-NEW`, `DATA`
- **Change.** Both Performance tabs gain **EST. STRENGTH — ALL EXERCISES**
  (every exercise **logged ≥3 non-deload sessions** in the window — owner's
  rule, excludes subbed-in lifts; first → last engine e1RM with the signed
  %-change) and **STRENGTH BY MUSCLE GROUP** (role-weighted mean of those
  %-changes — primary 1.0 / secondary 0.5 via `engine_params.volume`, the doc
  10 §2 counting weights). Deloads excluded per T-A2; values undecayed per
  T-A1. Same numbers surface on MCP `get_mesocycle_summary` /
  `get_macrocycle_summary`.
- **Impact.** `NET-NEW`, `DATA` (shared query folds; no schema change).

### 4. Day view loses its back button (P17) + deep-link return (N4) — `RETROFIT`
- **Change.** `/log/[workoutId]` no longer renders `‹ WORKOUT` — the day
  navigator lives inside the Workout tab, so selecting a day isn't a page
  change (owner, option 2). "View exercise" from the day view now carries its
  origin: the exercise page's back control returns to that day view
  (`‹ WORKOUT`), not the exercises list.
- **Affected figures.** 1.1, 3.1a.

## 2026-06-15 (session 5) — Logging-flow review on device (product)

First hands-on review of the deployed logging flow. Several interaction fixes plus two net-new
features. The interaction fixes (1–7) shipped in the same session; the two larger features
(notes model, workout/meso options menu) are specced here and below for dedicated next slices.

### 1. Day View navigator — stays open across day selection — `RETROFIT`
- **Change.** Selecting a day from the expanded navigator must **not** auto-close it; it stays
  open until the user closes it (chevron). Supersedes the 2026-06-13 note that the navigator
  "defaults closed on each entry."
- **Rationale.** Selecting consecutive days is common; collapsing on every pick is hostile.
- **Affected figures.** 1.1.
- **Impact.** `RETROFIT`. *(Shipped 2026-06-15: open state persisted in `sessionStorage` so it
  survives the day-chip navigation.)*

### 2. Set rows — capture the denser sizing — `RETROFIT`
- **Change.** The logging set rows were still at the **old** dimensions; rebuild to the denser
  spec (2026-06-13 §5: box 32px, value 14px, log box 21px, padding 4px, columns 20/44).
- **Affected figures.** 1.1/1.2/1.3.
- **Impact.** `RETROFIT`. *(Shipped 2026-06-15.)*

### 3. Sets are uncheckable — `RETROFIT`
- **Change.** Tapping a logged set's ✓ **un-marks** it (re-opens the slot for re-entry). Allowed
  only on an active (in_progress) workout; completed workouts are locked.
- **Rationale.** Mis-taps and corrections need a one-tap undo, not a menu detour.
- **Affected figures.** 1.1.
- **Impact.** `RETROFIT`, `DATA` (delete-the-logged-row while in_progress; keep the prescription).
  *(Shipped 2026-06-15: `unlogSet`.)*

### 4. Row menus must flip to stay on-screen — `RETROFIT`
- **Change.** When a row's `⋮` menu would overflow the bottom of the screen, it opens **above**
  the button instead of below; below when there's room.
- **Affected figures.** 1.2/1.3.
- **Impact.** `RETROFIT`. *(Shipped 2026-06-15: `AnchoredMenu` — viewport-fixed, measures and flips.)*

### 5. Skip set = grey, don't remove; reversible — `RETROFIT`, `DATA`
- **Change.** "Skip set" **greys the set in place** and makes it non-interactable (it is **not**
  removed). It is reversible via the same menu ("Unskip set"). Distinct from "Delete set", which
  drops a planned slot.
- **Affected figures.** 1.3.
- **Impact.** `RETROFIT`, `DATA`. *(Shipped 2026-06-15: per-set skip stored as
  `workout_exercises.skipped_set_numbers int[]`, migration `20260615000003`; reversible while
  in_progress.)*

### 6. Skip remaining sets = per-set, not whole-exercise — `RETROFIT`
- **Change.** "Skip remaining sets" greys **only the uncompleted sets** of the exercise; logged
  sets and the exercise itself stay displayed and interactive, and the exercise's own menu is
  unaffected (the prior bug greyed/!backgrounded the whole exercise and its reopened menu).
  Reversible per set.
- **Affected figures.** 1.2.
- **Impact.** `RETROFIT`. *(Shipped 2026-06-15: uses the same per-set skip mechanism; the
  exercise no longer flips to `status = skipped` during an active workout.)*

### 7. Complete-workout gating — `RETROFIT`
- **Change.** The "Complete workout" button appears **only when every set is logged or skipped**
  (not merely "after any set is logged").
- **Affected figures.** 1.1/1.5.
- **Impact.** `RETROFIT`. *(Shipped 2026-06-15.)*

### 8. Notes model — pinned note vs session log note — `NET-NEW`, `DATA` *(next slice)*
- **Change.** Two distinct kinds of exercise note:
  - **Pinned note** — an **attribute of the exercise record**, shown on that exercise in *every*
    workout until edited/unpinned. Editable from the Day View (an **edit (pencil) icon** on the
    pinned-note bar) or the Exercise page. Pinning is **optional**.
  - **Session log note** — a note **saved with that workout's exercise log** (per-session). Shown
    in exercise history (quick-view and the Exercise page) as a small **note icon** on the row;
    tapping the row reveals the note. **Editable only in the live, active workout** — never from
    history or after the workout completes.
- **Rationale.** Today there is only one notion (the pinned note via "New/Replace note"), so a
  per-session observation has nowhere to live and the pinned note's cross-workout semantics are
  implicit.
- **Affected figures.** 1.1, 1.2, 3.1a/3.2.
- **Impact.** `NET-NEW`, `DATA`. Pinned note already exists (`exercise_notes`, `is_pinned`); add
  a **per-(workout_exercise) session note** (likely `workout_exercises.log_note` or reuse
  `exercise_feedback.notes`), a note-icon affordance on history rows, and a pinned-note inline
  **edit icon**. Editing gated to the active workout (RLS like the completion lock). See
  [03-data-model.md](03-data-model.md).

### 9. Workout / mesocycle options menu — `NET-NEW`, `DATA` *(next slice)*
- **Change.** A new overflow (`⋮`) control on the Day View header, placed **to the right of the
  date / Target-RIR column** and sized vertically to match the height of those two rows. It opens
  a menu with two clearly separated groups:
  - **Mesocycle** — Mesocycle notes · Edit mesocycle (→ planner board) · Mesocycle stats
    (→ stats) · **End mesocycle** (skips all remaining sets on all remaining days and completes
    the mesocycle — **strong destructive warning** describing exactly what it does).
  - **Workout** — New/Edit workout note · Edit day (→ planner board, current day selected) · Add
    exercise · **End workout** (skips all remaining sets and completes the workout — warn it can't
    be undone).
- **Rationale.** There was no entry point for whole-workout / whole-meso actions from the logging
  screen; several were unreachable (end early, jump to edit, add an exercise mid-session).
- **Affected figures.** 1.1 (new control), → 2.5 (planner board), 4.1/4.2 (stats).
- **Impact.** `NET-NEW`, `DATA`. New header control + grouped menu. Navigation items reuse
  existing routes. **End workout** = skip-remaining-all + complete (the existing completion +
  per-set-skip paths). **End mesocycle** = skip/complete every remaining workout of the meso, then
  mark the meso complete — needs a new audited query + a confirm step. **Add exercise** opens the
  group-aware picker against the live workout. Mesocycle/workout notes depend on the §8 notes model.

### Round-2 refinements (same-day, all `RETROFIT`, shipped)
- **Navigator animation** only plays on an explicit chevron toggle — hydrating the open state on a
  day-chip navigation snaps (no re-run of the reveal). Refines §1.
- **Active-day dot** always shows on the resume week/day, even when it is the selected/viewed chip,
  so the live day is always findable. Refines §1/1.1.
- **Bottom-sheet motion:** all bottom sheets slide up on open / down on close (~280ms, scrim fade)
  via a shared `useSheetTransition`; applies to the per-exercise feedback sheet (1.4) and the
  Workout Complete sheet (1.5).
- **Unskip all:** the exercise menu (1.2) offers "Unskip all sets" when any set is skipped
  (alongside per-set unskip). Refines §6.

## 2026-06-14 (session 4) — Metrics lock-down (engineering/product) + Workout Complete redesign

Session scope: a research pass defining every displayed metric and engine parameter
([10-metrics-spec.md](../10-metrics-spec.md), the new authoritative metric/params doc), plus one
design correction to the Workout Complete sheet. Driven by engineering/product, not a designer
mockup pass — so the mockup is amended here.

### 1. Workout Complete (1.5) — session feedback sliders restored — `RETROFIT`
- **Change.** The session feedback sliders (overall **fatigue / effort / performance**, 0–4) are
  **re-added** to the complete sheet, using the same slider UI as the per-exercise prompt (1.4),
  alongside the paragraph notes and `NEXT WORKOUT →`. The sheet now reads: counts + the three
  session sliders + notes + next. The **autoregulation panel stays removed** (08 §3 / 2026-06-13 §2
  unchanged on that point).
- **Rationale.** The sliders were dropped from the mockup inadvertently; the engine uses
  session-level fatigue/performance as a dampener on that session's progression (10 §3). This
  supersedes the "counts + notes only" wording of the 2026-06-13 §2 entry for the slider question.
- **Affected figures.** 1.5.
- **Impact.** `RETROFIT`, `DATA`. Keep `workout_feedback` (overall_fatigue/effort/performance);
  build the redesigned sheet; wire the session dampener.

### 2. Metric & engine-parameter definitions locked — `NET-NEW` (doc), `DATA`/`ENGINE`
- **Change.** New [10-metrics-spec.md](../10-metrics-spec.md) gives research-backed definitions and
  default `engine_params` for: e1RM (effective-reps + Epley/Brzycki avg + confidence weighting),
  **fractional volume counting (1.0/0.5)**, MEV/MAV/MRV landmarks, the workload/pump/joint-pain
  set-count autoregulation, RIR ramp, increments/regression, deload, the **profile-personalized
  macrocycle target + recommended timeframe**, **key lifts = most-logged (by frequency)**, and
  stats rollups. Includes honesty guardrails (don't overclaim e1RM, targets are estimates, pump/
  soreness secondary, push:pull advisory-only, deloads = fatigue management).
- **Rationale.** Replace the mockups' illustrative numbers with grounded, citable definitions so the
  engine helps real progress rather than showing pretty-but-unfounded figures.
- **Affected figures.** 2.2, 2.3, 3.1a/b, 4.1, 4.2 (read-outs); 1.4 (signals).
- **Impact.** `DATA`/`ENGINE` — implement per 10; no UI layout change beyond softening the Balance
  Check copy (push:pull is advisory, not an injury/posture claim).

## 2026-06-14 (session 3) — Interactive prototype build; library, macrocycle & meso-stats refinements

Session scope: stood up a **fully interactive, reload-persistent prototype** of the whole
five-tab shell in both the paper and dark themes, then made a series of design refinements
against it — all reconciled back into the mockup `workout - App Screens v2.dc.html`, which
remains the source of truth. Deliverables: `workout - Interactive Prototype.dc.html` (the
side-by-side device board) and `WorkoutApp.dc.html` (the app component, mounted twice by theme).

> Source-of-truth note (applies going forward): **the mockup board
> `workout - App Screens v2.dc.html` is authoritative for all UI**, not the prototype. When the
> two diverge, the mockup wins; prototype is brought back in line. Recorded in `CLAUDE.md`.

### 1. Exercise library (3.1) — equipment-type filter added
- **Change.** The single `FILTERS` row (one muscle-group chip) is replaced by **two labeled
  filter rows**: `MUSCLE` (All / Glutes / Quads / …) and `EQUIP` (All / Barbell / Dumbbell /
  Machine / Cable). The two combine (AND); each active chip carries an `✕` to clear it; a live
  `n OF 16 EXERCISES` count and a `CLEAR ALL` action appear whenever any filter is active.
- **Rationale.** Users browse by equipment as often as by muscle (what's free in the gym,
  injury work-arounds); muscle-only filtering was insufficient.
- **Affected figures.** 3.1.
- **Impact.** `RETROFIT` — Exercises list gains a second filter axis (`equipment`) and the
  count/clear affordance. `DATA` — exercise records already carry `equipment`; ensure it is
  queryable/indexed for filtering.

### 2. Exercise menu (1.2) — "History" → "View exercise"
- **Change.** The day-view exercise overflow (`⋯`) menu item **"History ›"** is renamed
  **"View exercise ›"** and now opens the full Exercise page (Overview / History tabs, 3.1a–b)
  rather than jumping straight to history.
- **Rationale.** Per-exercise history already has a dedicated control in the Day View, so a
  second history shortcut here was redundant; "View exercise" exposes the whole page (bests,
  est-1RM trend, lifetime totals, and history) in one move.
- **Affected figures.** 1.2 → 3.1a/3.1b.
- **Impact.** `RETROFIT` — relabel the menu row and repoint its action to the Exercise page
  (default to Overview tab).

### 3. Macrocycle Overview (2.2) — progress tracking removed; per-month target rate added
- **Change (a).** The **"Progress · Lean Mass" block** (the +4.3 lb / on-track bar with the
  Jan→Aug body-weight axis) is **deleted**. The Overview now flows: header → Realistic Target →
  Mesocycle Timeline → Macrocycle Stats.
- **Change (b).** The **Realistic Target** card gains a **per-month rate** line under the total
  range, in orange — e.g. `≈ +1.1–1.6 lb / month` (Strength `≈ +1–2% / month`, Cut
  `≈ −2.2–3.4 lb / month`, etc.). The same rate is shown in the Create-Macrocycle engine card
  (2.3) and recomputes live with goal/duration.
- **Rationale.** The app does not (and won't, in scope) track body weight or other external
  progress inputs, so a body-weight progress bar implied data we never collect. The target
  **range remains as the planning framework**; expressing it as a monthly rate gives the user a
  more manageable cadence to gauge against. Actual tracking stays limited to the workout data
  the app collects directly (kept in **Macrocycle Stats**: est. strength, total volume,
  sessions, adherence).
- **Affected figures.** 2.2, 2.3.
- **Impact.** `RETROFIT` — remove the progress-vs-projection element from the Overview; add the
  per-month rate to both the Overview target card and the Create engine output. `DATA` — drop
  any body-weight/lean-mass progress query for this surface; per-month rate is derived from the
  target range ÷ duration (no new data).
- **Consistency fix.** Profile bodyweight reconciled to **198 LB** across Overview chips, More
  (4.4), and Profile (4.5).

### 4. Meso Stats (4.x) — Volume tab removed
- **Change.** The **Volume** tab (former 4.1, the weekly sets-per-group table) is **deleted**.
  Meso Stats now has **two tabs — Balance · Performance** — and opens on **Balance**. Figures
  renumbered: **Balance → 4.1, Performance → 4.2**.
- **Rationale.** The Volume table largely duplicated the Balance view's **"Avg sets / week —
  planned"** bars but was less useful; Balance leads with the planned-volume bars (the actual
  planning view) plus the push/pull/legs split and balance check.
- **Affected figures.** 4.1 (removed), 4.2→4.1, 4.3→4.2.
- **Impact.** `RETROFIT` — Meso Stats drops the Volume tab and defaults to Balance; ensure deep
  links / STATS toggle (2.5) open Balance.

### 5. Interactive prototype (net-new artifact)
- **Change.** New deliverables `workout - Interactive Prototype.dc.html` and `WorkoutApp.dc.html`:
  a working build of the five-tab shell (Workout · Cycles · Templates · Exercises · More) with a
  live logging flow (step weight/reps, log sets, progress bar, feedback bottom sheet, complete
  sheet, advance), navigable Cycles (list → overview → meso stats; create-macrocycle engine;
  create-mesocycle modal), exercise & template detail pages, and More/Profile. State **persists
  across reloads** (per-device localStorage). Presented in two themes side by side: the **paper
  ledger** (primary) and a **muted dark** cousin (restrained terracotta accent, soft radii).
- **Rationale.** A clickable single-flow prototype to evaluate the restructured app end-to-end
  (was listed as a "round 5 candidate" in the mockup notes).
- **Affected figures.** All.
- **Impact.** `NO-CODE` — prototype/spec artifact for evaluation and engineering reference; not
  a production target itself. The dark theme is exploratory (06 omits dark mode for now).

#### 5a. Dark-theme palette (as shipped in the prototype) — `TOKENS`
The prototype's dark theme is a **muted, restrained cousin of the paper ledger**, not 06's
original signal-orange dark mode. It intentionally **pulls the accent back** from 06's
`#F25C05` to a desaturated terracotta so the dark theme reads like a dimmed version of the
light theme rather than a louder one. Recorded here because it supersedes 06's initial dark
values for this direction.

| Role | Token (prototype) | Value | Notes vs 06 |
|---|---|---|---|
| App background | `bg` | `#0B0B0C` | same as 06 `--bg-base` |
| Surface | `surface` | `#141416` | same as 06 `--bg-surface` |
| Raised / input | `raised` / `field` | `#1C1C1F` | same as 06 `--bg-raised` |
| Hairline | `line` | `#26262A` | same as 06 `--border-subtle` |
| Hairline (soft) | `lineSoft` | `rgba(154,154,160,0.16)` | — |
| Heavy line | `heavy` | `#34343A` | — |
| Text primary | `ink` | `#F2F2F0` | same as 06 `--text-primary` |
| Text secondary | `soft` | `#9A9AA0` | same as 06 `--text-secondary` |
| Text tertiary | `softer` | `rgba(154,154,160,0.65)` | — |
| Text faint | `faint` | `rgba(154,154,160,0.32)` | — |
| **Accent** | `accent` | **`#C8593B`** | **muted terracotta — replaces 06 `#F25C05`** |
| Accent (dim fill) | `accentDim` | `rgba(200,89,59,0.18)` | low-opacity accent wash |
| On-accent | `onAccent` | `#0B0B0C` | text/icon on accent |
| Positive | `positive` | `#5E9B79` | softer than 06 `#4CAF7D` |
| Warning | `warning` | `#C7A050` | softer than 06 `#E0B23C` |
| Selected fill / ink | `selFill` / `selInk` | `#F2F2F0` / `#0B0B0C` | inverted chip/tab selection |
| Pop shadow | `pop` | `0 16px 40px rgba(0,0,0,0.6)` | menus/sheets |

Shape in dark: **soft radii** (`rCard` 6px, `rInput` 4px) vs the paper theme's hard 0px edges;
1px borders. Accent discipline from 06 still holds — current/selected markers, the day-view
progress bar, the slider thumb; **never** large filled backgrounds. Primary CTAs are **ink**
(`selFill`), not accent. Paper theme (primary) for reference: `bg #F4F0E6`, `ink #17140F`,
`accent #C14B2A`, `field #FCFAF4`, hard edges (0px radius), 1.5px borders.

---

## 2026-06-13 (session 2) — Workout Complete cleanup, Day View progress bar, Cycles → macrocycle restructure, stats model

Session scope: simplification of the Workout Complete sheet (1.5); a lock + progress-bar pass
on the Day View header (1.1); and a substantial restructure of the **Cycles** area — the
"macros" → "macrocycles" rebrand, retirement of "slots", a new macrocycle creation engine and
overview, a unified meso view/edit surface, and a contextual stats model. All changes live in
`workout - App Screens v2.dc.html`. **Section 02 figures were renumbered — see item 5.**

> Terminology note (applies app-wide): **"macro" / "macrocycle slot" → "macrocycle"**, and
> **"slot" → "mesocycle"**. "Macros" was dropped to avoid collision with macronutrients. Any
> existing copy, labels, or identifiers using "macro"/"slot" should be migrated.

### 1. Day View (1.1) — progress bar, RIR relocation, locked header
- **Change.** Three header changes, superseding parts of the earlier 2026-06-13 entry
  (items 2–3): (a) the `SCHEDULED · n SETS` / `3 OF 14 SETS LOGGED` text line is **replaced by
  an orange progress bar overlaying the marked divider** under the big `W2·D1` coordinate; the
  bar fills to `completed ÷ total` sets (0% planned, ~21% for 3/14, 100% complete). (b) The
  **Target RIR** label moves out of the expanded navigator card to the coordinate area (right
  of `W2·D1`, where the sets line used to sit). (c) The **`MESO 2 / 4` label is removed
  entirely** from the navigator card — the expanded card now contains only the week selector +
  day chips. (d) The header (logotype row, navigator, `W2·D1` + RIR + progress bar) is
  **pinned/locked at the top**; the exercise/set list scrolls in a container beneath it.
- **Rationale.** Encode completion visually instead of as a redundant text line; keep the most
  useful context (RIR) adjacent to the coordinate; declutter the navigator; keep the day
  identity fixed while logging.
- **Affected figures.** 1.1.
- **Impact.** `RETROFIT` against the Day View header spec in the prior same-day entry (not yet
  built, so really `NET-NEW` against code), `DATA`. Progress bar needs the live
  `setsLogged ÷ setsPlanned` for the viewed day. Build the header as a sticky region.

### 2. Workout Complete (1.5) — remove autoregulation panel, simplify CTA
- **Change.** Removed the boxed `AUTOREGULATION` summary panel and the `View meso stats`
  link from the completion sheet. The primary button changes from
  `NEXT — W2·D2 · WED 14 JUN` to a simple **`NEXT WORKOUT →`**.
- **Rationale.** The autoregulation recalculation still happens silently in the background — it
  doesn't need a panel shouting it on completion. Stats don't belong on the workout flow. The
  next-workout button was over-labeled.
- **Affected figures.** 1.5.
- **Impact.** `NET-NEW`. Completion sheet shows: counts (exercises / sets / skipped) + notes
  field + `NEXT WORKOUT →`. No autoregulation panel, no stats link.

### 3. Macrocycles are the goal layer — new entity, overview, and creation engine
- **Change.** A **macrocycle** now carries a single long-term **goal** (`Hypertrophy ·
  Strength · Cut · Maintain`) and organizes several mesocycles toward it.
  - **2.2 Macrocycle Overview** (NEW; replaces the retired meso-detail/RIR-ramp page).
    Tapping a macrocycle's **name** opens it. Contents: goal + date span; a **Realistic
    Target** panel (e.g. `+8–11 lb lean mass`) derived from the user's profile (training age,
    bodyweight, experience level); a **progress-vs-projection** bar (actual vs target band);
    the **mesocycle timeline** (each meso with suggested phase + status); and rolled-up
    **macrocycle stats** (est. strength, total volume, sessions, adherence).
  - **2.3 Create Macrocycle** (NEW; the "engine"). Inputs: name; goal; **duration**
    (`3 / 6 / 12 mo` + custom); **mesocycle length preference** (`4 / 5 / 6 wk`, incl. deload).
    From these + profile it computes the **number of evenly-spaced mesocycles** that fit and
    proposes **suggested phases** (Accumulate → Intensify → Peak), plus a realistic target.
    Mesocycles are created **unplanned** and the user plans each as they reach it.
- **Rationale.** Gives the endless succession of mesocycles a shared, science-grounded
  direction and a concrete long-term goal the user can track against.
- **Affected figures.** 2.2 (new), 2.3 (new).
- **Impact.** `NET-NEW`, `DATA`. Requires a macrocycle entity (goal, duration, computed
  target, ordered meso phases/placeholders) and a target/meso-count calculation from goal +
  duration + meso length + profile. Stats rollups aggregate across the macro's mesos. Check
  [03-data-model.md](03-data-model.md) for macrocycle goal, phase, and target fields.

### 4. Cycles list (2.1) restructure + "+ NEW" chooser (2.1b)
- **Change.** Macrocycle rows show **`GOAL <goal> · N MESOCYCLES`** (neutral ink — no orange
  budget) and an **`OVERVIEW ›`** link; the **name** taps through to the Overview, the
  **chevron** expands/collapses the mesocycle list (active macro auto-expanded). Removed the
  per-row `● ON MESO n` / `● AT W2·D1` orange status tags — the `CURRENT` badge on the active
  meso row is sufficient. Mesocycle rows drop all "slot" language (`SLOT 2 — BULK` →
  `MESO 2 · INTENSIFICATION`); unplanned mesos read `Mesocycle n` + `SUGGESTED <phase> ·
  NOT PLANNED` with a `+ PLAN` action. **`+ NEW`** opens a **chooser sheet (2.1b)** with two
  paths: **Macrocycle** or **Standalone mesocycle** (not tied to a macro). Mesocycles *inside*
  a macrocycle are created from that macro's **`+ PLAN`** rows, not from `+ NEW`.
- **Rationale.** Clear hierarchy and navigation; minimal orange; one creation entry that
  disambiguates the two "from scratch" paths while keeping in-macro planning contextual.
- **Affected figures.** 2.1, 2.1b (new).
- **Impact.** `NET-NEW`, `DATA`. List needs macrocycle→meso grouping with each meso's phase +
  status; standalone mesos remain supported (no macro FK). `+ PLAN` creates a meso attached to
  the macro at that position.

### 5. Planner board (2.5) = unified mesocycle view/edit surface; figures renumbered
- **Change.** The old meso-detail page (2.2) is **removed**; tapping a **mesocycle** opens the
  **planner board** as the single view/edit surface. It gains a **`PLAN | STATS` toggle** at
  the top (STATS routes to the meso stats screens, see item 6) and a **partial-completion
  lock**: completed + in-progress weeks are **read-only**, edits apply to upcoming weeks only
  (banner: "W1 logged · W2 in progress. Past & active weeks are locked — edits apply to W3
  onward."). The macrocycle context strip is rebranded (`MACROCYCLE 26-1 · MESO 2 OF 4 ·
  INTENSIFICATION`, no slot). Primary button is `SAVE CHANGES` when editing an existing meso.
  **Renumbering of Section 02:** 2.2 Macrocycle Overview (new), 2.3 Create Macrocycle (new),
  2.4 Plan a mesocycle (was 2.3), **2.5 Planner board** (was 2.4), 2.6 Day setup (was 2.5),
  2.7 Exercise picker (was 2.6), 2.8 Create mesocycle (was 2.7). The 2.8 create-mesocycle
  modal's placement block is rebranded `MACROCYCLE PLACEMENT` with meso positions `M1…M4`
  (`MESO 3 OF 4 · INTENSIFICATION`) replacing the old `SLOT 3 OF 4 — GOAL: BULK`.
- **Rationale.** The week-matrix detail page had no job the planner board can't do; unifying
  view/edit removes a screen and gives one clear place to manage a meso. Locking logged weeks
  protects history while still allowing forward edits.
- **Affected figures.** 2.5 (was 2.4); removes old 2.2; 2.4/2.6/2.7/2.8 renumbered.
- **Impact.** `NET-NEW`, `DATA`. Planner board must load an existing meso (any state),
  enforce read-only on completed/active weeks, and apply edits forward only. Needs per-week
  completion state.

### 6. Stats model — contextual, no new bottom-tab
- **Change.** Decided: **no dedicated stats tab** (Exercises/Templates tabs preserved).
  **Macrocycle stats** live on the Macrocycle Overview (2.2). **Mesocycle stats** (4.1–4.3:
  Volume / Balance / Performance) are reached via the **`STATS` toggle on the planner board
  (2.5)**; their back-nav changed `‹ MESO` → `‹ PLAN`. The Section 04 intro and the
  next-steps note were repointed accordingly; `ACROSS MACRO 26-1` → `ACROSS MACROCYCLE 26-1`.
- **Rationale.** Keeps stats one tap from the cycle they describe and keeps the Workout tab
  focused on the session, without spending a bottom-tab slot.
- **Affected figures.** 2.2, 2.5, 4.1–4.3.
- **Impact.** `NET-NEW`. Wire the planner board `STATS` toggle to the meso stats views; macro
  stats render on the Overview. No stats entry from the Workout tab.

### Verified (mockup)
All new/changed screens render with no console errors; Day View header locks with the orange
progress bar; `MESO 2/4` removed from the navigator; Cycles rows, `+ NEW` chooser, Macrocycle
Overview, Create Macrocycle engine, and the planner board `PLAN | STATS` toggle + lock banner
all display as specified. Title widths measured in-DOM (Archivo loaded) — no real wrapping;
apparent wraps in capture tooling are font-fallback artifacts only.

## 2026-06-13 — Day View (1.1) header rework + denser set rows

Session scope: the logging Day View header and set-row density. All changes live in
`workout - App Screens v2.dc.html`, figure 1.1.

### 1. Collapsible week/day navigator (was: always-on meso track)
- **Change.** The week/meso context block is **collapsed by default**. The header at rest
  shows only: the `workout` logotype + a chevron, the cycle label (`GARRON JUN '26 — BULK`)
  top-right, and the big `W2·D1` coordinate with its date / `3 OF 14 SETS LOGGED` line.
  Tapping the chevron (or the logotype row) expands a navigator panel with a quick
  reveal animation (~300ms height + fade).
- **Rationale.** The resting header previously stated the current week in four places and the
  day in nearly as many. It was overloaded for a screen whose primary job is logging.
- **Affected figures.** 1.1.
- **Impact.** `NET-NEW`. Build the Day View header as a disclosure: collapsed by default,
  animated expand. Persist the open/closed preference is **not** required (defaults closed on
  each entry to the screen).

### 2. Programmed-days row, nested under the selected week
- **Change.** The expanded navigator is **one bordered card**: the week segmented control
  (`W1 W2 W3 W4 DL`) on top, and directly beneath it — inside the same card, divided by a
  rule — a row of **day chips for the selected week** (`D1…D5`; fewer for `DL`). Selecting a
  different week swaps the day row to that week's days. Day chip states: completed = subtle
  ink-tint fill + `✓`; current day = orange dot; selected (viewing) = filled ink; planned =
  hairline outline. The day's coordinate detail (`W2·D1` + status line) updates with the
  selection (`COMPLETED · 14 OF 14 SETS`, `SCHEDULED · 14 SETS PLANNED`, or the live
  `3 OF 14 SETS LOGGED` for the active day).
- **Rationale.** There was no way to see or navigate the other programmed days in a week, or
  to review completed/upcoming days in past/future weeks. Nesting the days inside the week
  card makes the hierarchy (days belong to the selected week) unambiguous.
- **Affected figures.** 1.1.
- **Impact.** `NET-NEW`, `DATA`. The navigator needs, per week in the active meso: the list of
  programmed days with each day's label and completion state (completed / active / planned),
  and the set-logged counts for the coordinate line. Confirm `v_meso_summary` /
  microcycle/workout queries expose week→day lists with completion + set counts; add a query
  if not. Tapping a day should navigate the Day View to that day (read-only for completed,
  loggable for the active day) — wire to the same logging route.

### 3. Header de-cluttering
- **Change.** Removed the redundant `MESO 2 OF 4 · MACRO 26-1` meta line, the
  `PROGRAMMED DAYS — Wn` label, and the `● Wn — TARGET n RIR` line. The week now appears in
  exactly two places (the selector + the `W2·D1` headline). Inside the expanded card the only
  retained context is `MESO 2 / 4` (left) and the selected week's `TARGET n RIR` (right, in
  orange; `DELOAD WEEK` for the deload).
- **Rationale.** Remove repetition; keep only functionally necessary context.
- **Affected figures.** 1.1.
- **Impact.** `NET-NEW`. Honor the reduced information set when building the header.

### 4. Chevron styling
- **Change.** The disclosure chevron is **borderless** (no box), weighted to match the
  `workout` logotype, and vertically centered with it. Rotates 180° between
  collapsed (▾) and open (▴).
- **Rationale.** The boxed chevron read as a separate control; it should feel part of the
  logotype lockup.
- **Affected figures.** 1.1.
- **Impact.** `NET-NEW`.

### 5. Denser set rows
- **Change.** Set-row vertical density reduced across the logging screens: input box height
  `42px → 32px`, value font `17px → 14px`, log checkbox `26px → 21px`, row vertical padding
  `7px → 4px`, grip/log columns tightened (`22px / 50px → 20px / 44px`). Applied to all
  logging set rows (1.1, and the same row component wherever it appears — 1.2/1.3) for
  consistency.
- **Rationale.** The boxes were oversized for a full workout; a denser row fits more of the
  session on screen while staying above the ≥44px touch-target rule for the **interactive**
  controls (the row as a whole and the log checkbox hit area remain tappable; only the visual
  box shrank).
- **Affected figures.** 1.1 (and shared set-row component used by 1.2, 1.3).
- **Impact.** `NET-NEW`, `TOKENS`. These are the set-row dimensions to build the logging row
  primitive to. Verify the rendered touch target for the log control stays ≥44px (pad the hit
  area beyond the 21px visual box).

### Verified (mockup)
Collapsed/expanded states render; chevron toggles `grid-template-rows` 0fr↔1fr with opacity
fade; week selection swaps the day row and updates the coordinate line; no console errors.
