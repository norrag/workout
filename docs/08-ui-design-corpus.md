# 08 — UI Design Corpus

Binding interaction rules for every screen. [06-design-system.md](06-design-system.md) defines the visual foundations (color, type, spacing, voice); this document defines **how screens behave and how information is organized**. Any new or changed screen is checked against both before merge. When a rule here conflicts with expedience, the rule wins.

## Why this exists

WORKOUT's value is taking the burden of planning off the user. The UI must do the same: at every moment the screen should show one job, the information needed for that job, and an obvious next action. The reference point is a phone, one-thumbed, between sets or while planning on a couch — never a desktop dashboard.

## Core principles

### 1. One job per screen

Every screen (or step of a flow) has exactly one user job. If a screen accumulates a second job, split it into a step, tab, or sheet. Long forms are restructured as short sequences. Corollaries:

- Multi-step creation flows: a **board step** where the user does the real work, then a **minimal confirm step** (name + the one or two structural choices) right before commit.
- Tabs and segmented controls separate parallel slices of the same job (e.g. days of a plan), never unrelated jobs.
- Detail belongs on detail screens. Lists show identity + state, nothing more.

### 2. No dropdowns

Native `<select>` and custom dropdown menus are banned, including overflow "..." menus. They hide options, require precision taps, and break the visible-state rule. Replace by option count:

| Options | Pattern |
|---|---|
| 2–4 | segmented control (full-width, equal slices) |
| 5–8 | chip group (wrapping tap-chips, single- or multi-select) |
| 9+ / searchable | **picker sheet**: full-height sheet with search field and filter chips |
| numeric | steppers (`NumberStepper`) or chip presets — never typed except free weights |
| rare/destructive actions | place them at the bottom of the relevant detail screen, plainly labeled |

Every choice's current value is always visible on the screen without opening anything.

### 3. Color is information, not decoration

Two color systems, never mixed:

- **Accent (orange)** — action and progress only: the primary CTA, the active/selected state, completion ticks. Unchanged from 06.
- **Categorical (muscle groups)** — a fixed muted palette identifies muscle groups everywhere they appear (builder slots, logging headers, volume charts). Tokens in `globals.css` (`--color-mg-*`), rendered via the `MuscleChip` component. These are labels, not buttons: small chips/bars next to the exercise name, low saturation, never full-row fills.

Status (planned/active/completed) is text + position, not color. Warning yellow is reserved for pain/strain flags and validation.

### 4. Planning altitude

Each cycle level exposes only the decisions that belong to it, and defers the rest downward. This is both a UI rule and a product rule.

| Level | User decides | UI gives | Deferred downward |
|---|---|---|---|
| **Macrocycle** | goal (cut/gain/maintain), timeline | goal chips, date fields | everything else |
| **Mesocycle** | days/week, weeks, deload, which exercises on which day, exercise order, muscle balance | day tabs, muscle-chip slots, per-muscle weekly set counts while building | sets, reps, weights, RIR |
| **Microcycle / week** | adjustments to what the engine prescribed | generated workouts, prescriptions with rationale | — |
| **Workout (in session)** | actual weight × reps, add/remove sets, feedback | steppers, set rows, feedback scales | — |

The meso builder is a **balancing tool**: while the user assigns exercises to days it shows the resulting weekly set distribution per muscle group so imbalance is visible at plan time. It never asks for numbers the engine will compute (and in week 1, the user records what they actually lifted — that anchors the engine).

### 5. RIR is built in, not chosen

The 3 → 0 RIR ramp with an optional trailing deload is research-backed and fixed. No screen offers RIR start/end as an input. The ramp appears **read-only** wherever it explains state: the week strip on a meso, the RIR badge on Today and the logging header, the rationale strings. Per-set *reported* RIR while logging remains optional input — that's observation, not configuration.

The same posture applies generally: defaults computed from science or history are presented as decisions already made, with a quiet way to adjust where flexibility is genuinely needed — not as blank questionnaires.

### 6. Built for the thumb

- The screen's primary action is a single bottom-anchored CTA, full width, accent. Everything above it is reachable scrolling content.
- Touch targets ≥ 44px (existing rule); destructive/rare actions get smaller visual weight but the same hit area.
- List rows act on a single tap; reorder uses explicit up/down controls (drag is a progressive enhancement, never the only way).
- In-session logging is operable without reading: position, size, and state repeat identically for every set and every exercise.

### 7. Show state, don't ask for trust

Every persisted action gives a quiet, immediate mark (accent tick on a logged set, status text change). Anything generated (prescriptions, ramps, schedules) is shown with its reasoning available — engine rationale strings surface inline. The user should never wonder "did that save?" or "why this number?".

## Named patterns

Reusable flows and components implementing the principles. New screens compose these rather than inventing variants.

- **`SegmentedTabs`** — equal-width slice control for 2–7 parallel items (day tabs, lb/kg). Selected slice: raised surface + primary text; unselected: secondary text.
- **`ChoiceChips`** — wrapping single/multi-select chips for 5–8 options (equipment, goal, weeks). Selected: accent border + accent text (counts as the screen's active state, not its CTA).
- **`PickerSheet`** — full-height overlay for 9+ options: search field on top, filter chips, scrollable result list, tap = pick + dismiss. Used for the exercise library everywhere exercises are chosen.
- **`MuscleChip`** — categorical label: three short vertical bars in the muscle color + all-caps muscle name. Used wherever an exercise appears outside the library itself.
- **Set row** — `weight × reps [RIR] [✓]` with steppers when active; identical anatomy in planning previews and live logging.
- **Board → confirm** — creation flows: build on the board (tabs + slots), then one small sheet for name + structural facts, then commit.

## Per-screen application (current app)

- **Cycles list**: macro card with meso rows (identity + status only) — compliant.
- **Meso builder**: day tabs across the top; each day a list of `MuscleChip` exercise slots with reorder/remove; add via `PickerSheet`; live per-muscle weekly set tally; structure (weeks/days/deload) as chips; fixed ramp shown read-only; single CTA "CREATE MESOCYCLE". **No RIR inputs, no weight/reps/sets inputs.**
- **Meso detail**: read-only week strip (RIR badges), day plans, one CTA ("START MESOCYCLE" while planned).
- **Logging**: one exercise at a time, set rows + steppers, feedback sheet after final set — compliant; future work (exercise swap) goes through `PickerSheet`.
- **Library**: list rows with `MuscleChip`; custom-exercise creation uses chips, never selects.

## Muscle group palette

Muted, dark-surface-tuned categorical hues (tokens in `globals.css`):

| Group | Token | Hex |
|---|---|---|
| chest | `--color-mg-chest` | `#C96A6A` |
| back | `--color-mg-back` | `#6A9BC9` |
| shoulders | `--color-mg-shoulders` | `#C96AB0` |
| biceps | `--color-mg-biceps` | `#6AC9A8` |
| triceps | `--color-mg-triceps` | `#C9A86A` |
| quads | `--color-mg-quads` | `#8E6AC9` |
| hamstrings | `--color-mg-hamstrings` | `#C9866A` |
| glutes | `--color-mg-glutes` | `#6AC96E` |
| calves | `--color-mg-calves` | `#6AC0C9` |
| abs | `--color-mg-abs` | `#B5C96A` |
| forearms | `--color-mg-forearms` | `#9A8E78` |
| traps | `--color-mg-traps` | `#7E86C9` |

Unknown/missing group falls back to `--color-text-secondary`.

## Review checklist (per PR touching UI)

1. Does each screen/step have exactly one job?
2. Zero dropdowns/selects/overflow menus?
3. Is every current selection visible without interaction?
4. Is any information asked for that a lower planning level (or the engine) should own?
5. Any RIR-as-preference leak?
6. One accent CTA, bottom-anchored, thumb-reachable?
7. Muscle groups colored via `MuscleChip`/tokens; accent untouched by categorical color?
8. Copy voice per 06 (minimal, no hype, no exclamation marks)?
