# 08 — Design Decisions (mockup round, June 2026)

Status: **authoritative**. This document records the design direction settled in the mockup
project ("workout — App Screens v2") and supersedes conflicting guidance in
[06-design-system.md](06-design-system.md) and the key-screen list therein. Figure numbers
(1.1–4.5) refer to the mockup file, which ships alongside the repo docs as the visual source
of truth.

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
  ink-on-cream → cream-on-ink (see VOLUME/BALANCE/PERFORMANCE in 4.1, LB/KG in 4.4,
  equipment chips in 4.5).
- **Dashed borders = empty/planned** (unfilled exercise slot 2.4, future macro bars 4.3,
  "+ ADD EXCLUSION" 4.5).
- **Typography:** Archivo throughout. Lowercase logotype `workout` (wide tracking); big
  800-weight lowercase screen titles; all-caps 0.1–0.14em tracked labels; tabular-lining
  numerals for all data. Numbers remain the heroes.
- Motion guidance, accessibility targets (≥44px, one-thumb logging), and copy voice from 06
  still apply unchanged. PWA themed status bar becomes `#F4F0E6`.

## 2. Navigation — canon tab bar

`WORKOUT · CYCLES · TEMPLATES · EXERCISES · MORE` (replaces Today/Cycles/Insights/Library/Settings).

- **Insights is not a tab.** Meso stats (volume / balance / performance, figs 4.1–4.3) live
  behind a `MESO STATS` button on meso detail (2.2). Exercise history (3.2) lives in the
  exercise library and picker.
- **Library is split** into Templates (3.3) and Exercises (3.1) tabs.
- **Settings lives inside More** (4.4) — no separate tab.

### Workout tab resting logic
No designed "rest day" state. The Workout tab shows the **latest uncompleted workout**; if
all workouts are complete (or no active meso), it shows the **latest completed meso's stats**
(the 4.1 view). Nothing else.

## 3. Decisions log (from mockup rounds)

| Area | Decision |
|---|---|
| Units | **lb is the app default** (profile-level LB/KG toggle in More → Settings). All engine increments expressed per-equipment in the user's unit. |
| Meso planning | **Groups-first flow:** create meso (2.7 → 2.3) → planner board (2.4) shows days as columns of muscle-group slots → day setup sheet (2.5) sets label, weekday, groups + set counts → tapping an unfilled slot opens the exercise picker **pre-filtered to that muscle group** (2.6). |
| Day ordering | **No manual day reorder.** Days auto-sort by their assigned weekday, respecting the user's week-start setting (in day setup, 2.5). |
| Per-exercise feedback | Captured in the post-exercise prompt (1.4), **including joint pain per exercise** — the engine's pain gate operates on this. Session-level feedback captured at workout complete (1.5). |
| Workout notes | Free text on the complete sheet (1.5), after the autoregulation summary; saved with the session. |
| Engine transparency | The prescription rationale surfaces in the set/exercise menus (1.2/1.3) as short clinical lines ("+5 lb: hit all reps at 2 RIR"). |
| Profile | Lives in More → Profile (4.5): data rows, experience level (drives starting volumes + ramp aggressiveness), equipment access chips, and **excluded exercises** — exclusions never appear in pickers or templates. |
| Admin & tuning | **No admin UI will be built.** Decision inspection, param editing, and replay are operated **entirely through the MCP connector** (Claude as the tuning console). 04 §Admin tooling and the `/admin` phase in 07 should be read accordingly; the underlying tables, param versioning, and replay functions are still required — they just ship as MCP tools, not screens. |

## 4. Screens described, not mocked

Build these in the established system; no further mockups planned.

- **Onboarding / first run** — the Profile screen (4.5) presented as a short sequence:
  name/age/height/bodyweight → experience level → equipment access → units. Then land on
  Cycles with the create-macro empty state. No marketing carousel.
- **Template detail / start-from-template** — selecting a template opens the **planner board
  (2.4) prefilled** with the template's days, groups, and exercises; from there the flow is
  identical to a scratch meso.
- **Exercise detail** — simple page: description, equipment + muscle group, last performed,
  exercise history (the 3.2 content inline), and notes.
- **Create custom exercise** — simple form page in the house style: name, muscle group(s),
  equipment type, optional description/notes. Custom exercises are author-visible per F5.
- **Deload week logging** — the standard day view (1.1) with a `DELOAD` badge in the header
  and reduced prescriptions from the engine; target RIR 4+. No bespoke layout.

## 5. Mockup index

| Fig | Screen | Fig | Screen |
|---|---|---|---|
| 1.1 | Day view (logging) | 2.5 | Day setup sheet |
| 1.2 | Exercise menu | 2.6 | Exercise picker (pre-filtered) |
| 1.3 | Set menu | 2.7 | Create mesocycle |
| 1.4 | Per-exercise feedback prompt | 3.1 | Exercise library |
| 1.5 | Workout complete + session feedback | 3.2 | Exercise history sheet |
| 2.1 | Cycles — macro → meso | 3.3 | Templates |
| 2.2 | Meso detail — RIR ramp | 4.1–4.3 | Meso stats — volume / balance / performance |
| 2.3 | Plan a mesocycle | 4.4 | More — profile card + settings |
| 2.4 | Planner board (groups first) | 4.5 | Profile |
