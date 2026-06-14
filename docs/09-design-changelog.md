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
