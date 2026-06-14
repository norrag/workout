# 06 — Design System

> **Partially superseded (June 2026).** [08-design-decisions.md](08-design-decisions.md) is now the authoritative design source: the dark-mode-first color system, the key-screen list, and the Today/Insights/Settings navigation below are **replaced** by the light "ledger" system, the canon tab bar, and the mockups in `docs/design/`. The attitude, motion guidance, accessibility targets, and copy voice in this document still apply unchanged.

## Attitude

Strong, restrained, deliberate — never loud or motivational. The interface is a **serious tool for people who train consistently**, not a lifestyle brand trying to hype them up. Minimal copy, obvious actions, clean tracking screens, a slightly counterculture visual attitude: disciplined, useful, quiet, distinct.

## Foundations

### Color — dark-mode-first
Deep charcoal and near-black surfaces, softened by subtle gradients, shadow, and texture so it feels premium without becoming flashy.

| Token | Value (initial) | Use |
|---|---|---|
| `--bg-base` | `#0B0B0C` | app background (near-black) |
| `--bg-surface` | `#141416` | cards, sheets |
| `--bg-raised` | `#1C1C1F` | raised elements, inputs |
| `--border-subtle` | `#26262A` | hairlines, dividers |
| `--text-primary` | `#F2F2F0` | primary text |
| `--text-secondary` | `#9A9AA0` | labels, metadata |
| `--accent` | `#F25C05` | **the orange — a confident signal color** |
| `--accent-pressed` | `#D14F04` | pressed/active accent |
| `--positive` | `#4CAF7D` | progression up (muted) |
| `--warning` | `#E0B23C` | pain/strain flags (muted) |

**Accent discipline:** orange is for active states, primary actions, progress marks, and small highlights — never full-screen energy, never large filled backgrounds, at most one primary accent element per screen.

Surfaces may use very subtle top-light gradients (≤4% luminance shift) and soft shadow; optional fine grain/noise texture at low opacity for the premium feel. No glows, no neon.

### Typography
- Simple, bold sans (e.g., Inter or Archivo). Not overly condensed or aggressive.
- **All-caps** for the WORKOUT logotype and key labels (section headers, button labels), with tracking ~0.05–0.08em. Sentence case for body and data.
- Numbers are the heroes of tracking screens: large tabular-lining numerals for weight/reps.

### Spacing, shape, motion
- 4px spacing scale; generous whitespace — clarity over density.
- Radii: 8px cards, 6px inputs/buttons. No pill shapes.
- Motion: fast and functional (120–180ms ease-out); no celebratory animation. A completed set gets a quiet accent tick, not confetti.

## Copy voice

Minimal and direct. "LOG SET", "START WEEK 3", "0 RIR — PEAK WEEK". No exclamation marks, no "crush it" language. Feedback prompts are clinical and quick: "Joint pain?" `none / low / moderate / high`.

## Core components (`src/components/ui/`)

| Component | Notes |
|---|---|
| `Button` | primary (accent), secondary (raised surface), ghost; all-caps label |
| `Card` | surface + subtle border; section header slot |
| `NumberStepper` | thumb-sized +/- for weight & reps; long-press to accelerate |
| `SetRow` | weight × reps row with done-state accent tick |
| `RirBadge` | week's target RIR chip |
| `FeedbackScale` | 4-point tap scale for pain/pump/fatigue prompts |
| `CycleTimeline` | macro→meso→micro position; accent dot = today |
| `ProgressSpark` | small trend line, accent stroke |
| `BottomNav` | Today / Cycles / Insights / Library / Settings |
| `Sheet` | bottom sheet for in-workout actions |

## Key screens

1. **Today** — current workout card, position in cycle, single accent CTA: "START WORKOUT".
2. **Logging** — one exercise at a time; prescription shown faintly above each set row; big steppers; feedback sheet after the final set; session feedback on finish.
3. **Cycles** — macro overview with meso ribbons; meso detail showing the RIR ramp across weeks.
4. **Insights** — exercise/muscle-group charts; restrained: dark surfaces, single accent stroke, secondary gray for prior periods.
5. **Library** — exercise & template browsing with the standard filters; stock vs custom clearly but quietly distinguished.

## Accessibility & mobile

- Touch targets ≥ 44px; logging flow operable one-thumbed, bottom-anchored controls.
- Contrast ≥ 4.5:1 for text (the palette above passes on its intended surfaces).
- PWA: standalone display, themed status bar (`#0B0B0C`), app icon = all-caps WORKOUT mark with orange accent element.

## Addendum — post-mockup component & token deltas (June 2026)

The light ledger system ([08-design-decisions.md](08-design-decisions.md)) is the production
direction; these refinements from the 2026-06-13/14 design sessions live in
[09-design-changelog.md](09-design-changelog.md) and are the build specs for the affected
primitives:

- **`SetRow` density** (09 2026-06-13 §5): input box height **32px**, value font **14px**, log
  checkbox **21px**, row vertical padding **4px**, grip/log columns **20px / 44px**. The visual
  box shrank; keep the log control's **hit area ≥ 44px**. One row component across figs 1.1/1.2/1.3.
  Set-row inputs adapt to the exercise's tracking type (weight × reps / reps / time).
- **Day View header** (09 2026-06-13): a **sticky/locked** region (logotype + collapsible
  week/day navigator + `W·D` coordinate + Target RIR + an **orange progress bar** filling
  `setsLogged ÷ setsPlanned`); the set list scrolls beneath it.
- **Two-axis filter** (09 2026-06-14 §1): `MUSCLE` and `EQUIP` chip rows on the Exercises tab,
  combining with AND, each active chip clearable (`✕`), with a live `n OF N` count + `CLEAR ALL`.
- **`PLAN | STATS` segmented toggle** on the planner board, and the planner's read-only **lock
  banner** for logged/active weeks.
- **Dark theme (exploratory):** the interactive prototype ships a **muted terracotta** dark
  cousin of the paper ledger — full token table in 09 §5a (accent `#C8593B`, soft radii, ink
  CTAs). 06's original signal-orange dark mode is superseded by those values **for that
  direction**; dark mode is still out of scope for the production build. Paper ledger (cream
  `#F4F0E6` / ink `#17140F` / accent `#C14B2A`, hard 0px edges) remains primary.
