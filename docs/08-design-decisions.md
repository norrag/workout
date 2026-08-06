# 08 — Design Decisions (mockup round, June 2026)

Status: **authoritative baseline**. This document records the design direction settled in the
mockup project ("workout — App Screens v2") and supersedes conflicting guidance in
[06-design-system.md](06-design-system.md) and the key-screen list therein. Figure numbers
refer to the mockup file, which ships alongside the repo docs as the visual source
of truth.

> **Amendments after the June 2026 mockup round are logged, dated, in
> [09-design-changelog.md](09-design-changelog.md).** Where a dated entry there conflicts with
> this document, the changelog wins. Check 09 before building any screen. The figure index in
> §5 below has been reconciled with the 2026-06-13/14 sessions (Section 02 renumbered, the
> Volume stats tab removed, the Exercise page and `+ NEW` chooser added).

## 1. Visual direction — the light ledger system

The dark-mode-first system in 06 is **replaced** by the light "ledger" system used across all
mockups. Attitude is unchanged (serious tool, restrained, quiet, slightly counterculture);
the execution changes:

| Token | Old (06) | New | Use |
|---|---|---|---|
| `--bg-base` | `#0B0B0C` | `#F4F0E6` | app background (warm cream) |
| `--ink` | `#F2F2F0` | `#17140F` | primary text, structural rules, filled/active elements |
| `--ink-secondary` | `#9A9AA0` | `rgba(23,20,15,0.55)` | labels, metadata |
| `--ink-faint` | — | `rgba(23,20,15,0.45)` | inactive tabs, planned-future values |
| `--hairline` | `#26262A` | `rgba(23,20,15,0.15)` | row dividers |
| `--rule` | — | `#17140F` @ 1.5–2px | section rules, segmented-control borders, tab bar top |
| `--accent` | `#F25C05` | `#C14B2A` | the orange — current position + selected states ONLY |

Principles observed throughout the mockups:

- **Square corners everywhere.** Radii are 0 — no 8px cards, no pills. Structure comes from
  rules and hairlines, not containers and shadows. No gradients, no noise texture, no shadows.
- **Orange budget:** orange marks *where you are* (current week/day/set, in-progress values)
  and *what is selected* — never decoration, never large fills, at most one accent concern
  per screen. `#D14F04` pressed-state and the green/yellow status colors from 06 are dropped;
  status is carried by weight, opacity, and dashed-vs-solid borders instead.
- **Filled-ink active states:** segmented controls and selected chips invert to
  ink-on-cream → cream-on-ink (see BALANCE/PERFORMANCE in 4.1, LB/KG in 4.4,
  equipment chips in 4.5).
- **Dashed borders = empty/planned** (unfilled exercise slot 2.5, future macro bars 4.2,
  "+ ADD EXCLUSION" 4.5).
- **Typography:** Archivo throughout. Lowercase logotype `workout` (wide tracking); big
  800-weight lowercase screen titles; all-caps 0.1–0.14em tracked labels; tabular-lining
  numerals for all data. Numbers remain the heroes.
- Motion guidance, accessibility targets (≥44px, one-thumb logging), and copy voice from 06
  still apply unchanged. PWA themed status bar becomes `#F4F0E6`.

## 2. Navigation — canon tab bar

`WORKOUT · CYCLES · TEMPLATES · EXERCISES · MORE` (replaces Today/Cycles/Insights/Library/Settings).

- **Insights is not a tab.** Meso stats (**Balance · Performance**, figs 4.1–4.2 — the Volume
  tab was removed, see 09 2026-06-14 §4) are reached via the **`PLAN | STATS` toggle on the
  planner board (2.5)**; stats open on **Balance**. Their back-nav reads `‹ PLAN`.
  **Macrocycle stats** live on the **Macrocycle Overview (2.2)**. Exercise history (3.2) and the
  full Exercise page (3.1a/3.1b Overview · History) live in the exercise library and picker.
- **Library is split** into Templates (3.3) and Exercises (3.1) tabs.
- **Settings lives inside More** (4.4) — no separate tab.

### Workout tab resting logic
No designed "rest day" state. The Workout tab shows the **latest uncompleted workout**; if
all workouts are complete (or no active meso), it shows the **latest completed meso's stats**
(the Balance view, fig 4.1). Nothing else.

## 3. Decisions log (from mockup rounds)

| Area | Decision |
|---|---|
| Units | **lb is the app default** (profile-level LB/KG toggle in More → Settings). All engine increments expressed per-equipment in the user's unit. |
| Macrocycle = goal layer | A macrocycle carries a single long-term **goal** (`HYPERTROPHY · STRENGTH · CUT · MAINTAIN`) and organizes several mesocycles toward it. Its name taps through to the **Macrocycle Overview (2.2)**; the **Create Macrocycle engine (2.3)** computes evenly-spaced mesos + suggested phases + a realistic target from goal/duration/meso-length/profile. Mesos are created **unplanned** and planned as the user reaches each (see 09 2026-06-13 §3). |
| Realistic target | The Overview and the create engine show a **realistic target range** (e.g. `+8–11 lb lean mass`) plus a **per-month rate** (`≈ +1.1–1.6 lb / month`), derived from the target range ÷ duration. No body-weight/lean-mass progress tracking — the app tracks only the workout data it collects (see 09 2026-06-14 §3). |
| Meso planning | **Groups-first flow:** create meso (2.8 → 2.4 "plan a meso") → planner board (2.5, doubles as the meso view/edit surface) shows days as columns of muscle-group slots → day setup sheet (2.6) sets label, weekday, groups + set counts → tapping an unfilled slot opens the exercise picker **pre-filtered to that muscle group** (2.7). The planner enforces a **partial-completion lock**: logged/active weeks are read-only, edits apply forward only (see 09 2026-06-13 §5). |
| Plan-a-meso paths | The 2.4 chooser offers four paths: **Copy a mesocycle**, **Start with a template**, **Meso builder** (generated from muscle-group priorities — emphasize / grow / maintain), **From scratch**. |
| Day ordering | **No manual day reorder.** Days auto-sort by their assigned weekday, respecting the user's week-start setting (in day setup, 2.6). |
| Per-exercise feedback | Captured in the post-exercise prompt (1.4), **including joint pain per exercise** — the engine's pain gate operates on this. Session-level feedback captured at workout complete (1.5). |
| Workout complete (1.5) | Redesigned sheet: counts (exercises / sets / skipped) + **session feedback sliders** (overall fatigue / effort / performance, same UI as the 1.4 prompt) + free-text notes + `NEXT WORKOUT →`. **No autoregulation panel, no stats link** (autoregulation still recomputes silently; 09 2026-06-13 §2). The session sliders were dropped from the mockup in error and are restored (09 2026-06-14 session 4). |
| Exercise tracking | Custom exercises declare a **TRACK PER SET** type — `WEIGHT × REPS` (default), `REPS`, or `TIME` (fig 3.1c). Logging and history render to the chosen type. |
| Set edit / delete + lock | Sets can be amended **and deleted** from the day-view set menu (1.3 `Delete set`) **while the workout is in progress**. **Completing a workout locks it** — its sets/feedback become immutable — because completion runs the engine's next-week generation and we don't recompute the chain. Edit-meso never touches completed workouts (the planner lock, 09 2026-06-13 §5). Refines hard rule #5: logged history is append-only *after completion*. |
| Engine transparency | The prescription rationale surfaces in the set/exercise menus (1.2/1.3) as short clinical lines ("+5 lb: hit all reps at 2 RIR"). |
| Profile | Lives in More → Profile (4.5): data rows, experience level (drives starting volumes + ramp aggressiveness), equipment access chips, and **excluded exercises** — exclusions never appear in pickers or templates. |
| Admin & tuning | **No admin UI will be built.** Decision inspection, param editing, and replay are operated **entirely through the MCP connector** (Claude as the tuning console). 04 §Admin tooling and the `/admin` phase in 07 should be read accordingly; the underlying tables, param versioning, and replay functions are still required — they just ship as MCP tools, not screens. |

## 4. Screens described, not mocked

Build these in the established system; no further mockups planned.

- **Onboarding / first run** — the Profile screen (4.5) presented as a short sequence:
  name/age/height/bodyweight → experience level → equipment access → units. Then land on
  Cycles with the create-macro empty state. No marketing carousel.
- **Template detail / start-from-template** — selecting a template opens the **planner board
  (2.5) prefilled** with the template's days, groups, and exercises; from there the flow is
  identical to a scratch meso.
- **Exercise page** — now mocked (3.1a Overview / 3.1b History). Overview: equipment + muscle
  group, last performed, all-time bests (weight PR, est. 1RM, volume PR, best session volume),
  est. 1RM by meso across the current macro, lifetime totals (times trained, total volume,
  first logged). History: per-session weight × reps grouped by meso, with PR/deload badges and
  a "N earlier sessions ›" expander. Reached from the exercises list and the day-view exercise
  menu's **"View exercise ›"** (1.2, formerly "History ›").
- **Create custom exercise** — mocked (3.1c): name, primary muscle group (+ more), equipment
  type, and a **TRACK PER SET** type (`WEIGHT × REPS` / `REPS` / `TIME`), optional
  description/notes. Custom exercises are author-visible per F5.
- **Deload week logging** — the standard day view (1.1) with a `DELOAD` badge in the header
  and reduced prescriptions from the engine; target RIR 4+. No bespoke layout.

## 5. Mockup index

Reconciled with the updated `workout - App Screens v2.dc.html` after the 2026-06-13/14 sessions
(see [09-design-changelog.md](09-design-changelog.md) for the deltas and the old→new
renumbering).

| Fig | Screen | Fig | Screen |
|---|---|---|---|
| 1.1 | Day view (logging) — locked header + progress bar | 2.7 | Exercise picker (pre-filtered) |
| 1.2 | Exercise menu (`View exercise ›`) | 2.8 | Create mesocycle |
| 1.3 | Set menu | 3.1 | Exercises (MUSCLE + EQUIP filters) |
| 1.4 | Per-exercise feedback prompt | 3.1a | Exercise page — Overview |
| 1.5 | Workout complete (simplified) | 3.1b | Exercise page — History |
| 2.1 | Cycles — macrocycle → mesocycle | 3.1c | New exercise (+ TRACK PER SET) |
| 2.1b | `+ NEW` chooser (macrocycle / standalone meso) | 3.2 | Exercise history sheet |
| 2.2 | Macrocycle Overview (+ macro stats) | 3.3 | Templates |
| 2.3 | Create Macrocycle (the engine) | 4.1 | Meso stats — Balance |
| 2.4 | Plan a mesocycle (4 paths) | 4.2 | Meso stats — Performance |
| 2.5 | Planner board — view/edit meso (`PLAN \| STATS`, lock) | 4.4 | More — profile card + settings |
| 2.6 | Day setup · groups & counts | 4.5 | Profile |
| 2.6b | Add muscle group | 4.6 | Version history (More → What's new) † |
| | | 4.7 | What's New sheet † |

> † No mockup exists for 4.6/4.7 — the June round predates the idea of a release.
> Both are **derived from the house system** in the 2026-08-06 entry of
> [09-design-changelog.md](09-design-changelog.md) (doc 23 Phase 0), which is
> what the build transcribes.
>
> The Volume stats tab (old 4.1) was removed; Balance→4.1, Performance→4.2. There is no 4.3.
> Old 2.2 "Meso detail — RIR ramp" is gone — the planner board (2.5) is the single meso surface.
