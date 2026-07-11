# 03 — Data Model

Schema lives in `supabase/migrations/`. All tables: `id uuid pk default gen_random_uuid()`, `created_at`/`updated_at timestamptz`, RLS enabled. Naming: snake_case, singular FK columns (`user_id`), plural table names.

The structures below are designed for three consumers: the UI, the internal progression engine, and MCP tools — so linkage between cycles, exercises, and logged history is first-class.

## Entity relationship overview

```
profiles ─┬─< macrocycles ─< mesocycles ─< microcycles ─< workouts ─< workout_exercises ─< logged_sets
          │   (goal layer)  │ (positioned;                  │              │
          │                 │  may be standalone)           │              │
          │                 └─ meso_days ─< meso_day_groups ─< meso_exercises (slot fills)
          │                                                  │              └─ exercise_feedback
          │                                                  └─ workout_feedback
          ├─< exercises (custom; stock have user_id null)
          ├─< excluded_exercises / exercise_notes
          ├─< templates ─< template_days ─< template_day_groups ─< template_exercises
          └─< shares
exercises ─< exercise_muscle_groups >─ muscle_groups
engine_params / engine_decisions / mcp_write_audit (tuning — operated via MCP, see 08 §3)
```

> **Macrocycle restructure (June 2026, 09 2026-06-13 §3–5).** The `macro_slots` "goal arc" is
> **retired**: a macrocycle now carries a single goal and a computed plan, and mesocycles
> themselves carry `position` + suggested `phase` within the macro. Unplanned positions are
> mesocycle rows in `unplanned` status (the Overview's `+ PLAN` rows). The migration delta is
> noted on the `macrocycles` / `mesocycles` / `macro_slots` entries below; this is a documented
> target shape for a future implementation session, not yet migrated.

## Tables

### `profiles`
Extends `auth.users` 1:1 (`id` = auth uid).
- `display_name text`
- `age int`, `gender text` (enum-ish check: female / male / other / undisclosed)
- `height_cm numeric`, `bodyweight numeric` (stored in `units`), `bodyweight_updated_at`
- `training_since date` — powers the "TRAINING SINCE '21" profile line
- `experience_level text` — beginner / intermediate / advanced (drives starting volumes + ramp aggressiveness)
- `preferred_equipment text[]` — the equipment-access chips (values from the `exercises.equipment_type` vocabulary)
- `units text` — kg / lb (**default lb**)
- `week_starts_on int` — ISO 1–7, set via the day-setup sheet; days auto-sort by it
- `role text` — user / admin (admin gates the MCP tuning tools)

### `bodyweight_log`
The measured bodyweight series (doc 17 §5, N41; migration `20260711000001`): `user_id`, `measured_on date`, `weight numeric > 0` (lb), `source text` (`manual` quick entry / `profile` edit append / `dexa` Phase-5 sync), `created_at`; unique `(user_id, measured_on, source)` — a same-day re-entry replaces that day's point, and reads resolve a day to the latest-entered point across sources. Macro-layer measurement substrate ONLY: it grades mass-goal retrospectives and backs "as of" freshness labels; it never feeds prescriptions, and `profiles.bodyweight` remains the engine input (the log is never folded back into it).

### `excluded_exercises`
Profile-managed exclusions (fig 4.5): `user_id`, `exercise_id`, `reason text` (e.g. "LOW BACK"). Excluded movements never appear in pickers or templates.

### `exercise_notes`
Per-user pinned notes shown under the exercise header in the day view and managed from the exercise menu: `user_id`, `exercise_id`, `body`, `is_pinned`.

### `muscle_groups`
Seeded reference table: chest, back, quads, hamstrings, glutes, biceps, triceps, shoulders, calves, abs, forearms, traps…

### `exercises`
- `user_id uuid null` — **null ⇒ stock exercise** (visible to all); set ⇒ custom (visible to author + grantees)
- `name text`, `equipment_type text` — dumbbell / barbell / machine / cable / smith / bodyweight / bands / kettlebell / other
- `tracking_type text default 'weight_reps'` — **how each set is logged** (fig 3.1c TRACK PER
  SET): `weight_reps` (default), `reps` (reps only, e.g. bodyweight), `time` (duration, e.g.
  planks / carries). Drives set-row inputs and history rendering. **Migration delta:** new column.
- `description text`, `notes text`, `video_url text null`
- `source_exercise_id uuid null` — provenance when copied via sharing

### `exercise_muscle_groups`
- `exercise_id`, `muscle_group_id`, `role text` — primary / secondary

### `macrocycles`
The **goal layer** (figs 2.1/2.2/2.3). One long-term goal organizing several positioned mesos.
- `user_id`, `name`
- `goal_type text` — **hypertrophy / strength / cut / maintain** (June 2026 vocabulary; replaces
  the old cut/gain/maintain — `gain` → `hypertrophy`, `strength` added; migrate existing rows)
- `duration_months int` — chosen on the create engine (3 / 6 / 12 / custom), or the engine's
  **recommended timeframe** for the goal + profile (`planMacrocycle`, 04 / 10 §5)
- `meso_length_weeks int` — the user's preferred block length incl. deload (4 / 5 / 6); drives
  how many evenly-spaced mesos fit
- **Realistic target (derived, cached for display):** `target_low numeric`, `target_high numeric`,
  `target_unit text` (e.g. `lb_lean_mass`, `pct_strength`, `lb_loss`), computed from
  goal + duration + profile (training age, bodyweight, experience). The **per-month rate** shown
  in orange is `target range ÷ duration_months` — derived, not stored. No body-weight/lean-mass
  progress is tracked (09 2026-06-14 §3); the target is a planning framework only.
- `goal_notes text`
- `start_date date`, `target_end_date date null`
- `status text` — active / completed / archived
- **Migration delta:** add `duration_months`, `meso_length_weeks`, target columns; migrate
  `goal_type` vocabulary. The old free-form `target_metrics jsonb` is superseded by the derived
  target columns (keep for migration if any data exists, otherwise drop).

### `macro_slots` — **retired**
Superseded by mesocycle `position` + `phase` (below). The macro's progression is now an ordered
series of **mesocycles** (some `unplanned` placeholders), not a separate slot table. Existing
rows migrate into the host mesos' `position`/`phase`; the table is dropped once migrated.

### `mesocycles`
- `macrocycle_id uuid null` — **null ⇒ standalone meso** (fig 2.1 has a standalone section)
- `position int null` — `M1…Mn` placement within the macro (null for standalone); replaces
  `macro_slot_id`
- `phase text null` — suggested/assigned phase: **accumulation / intensification / peak**
  (deload is a per-week flag, not a meso phase). Set by the create engine; editable when planning.
- `user_id` (denormalized for RLS + query speed)
- `name`, `weeks int check (3..8)` (picker offers 4–8 incl. deload), `days_per_week int`
- `includes_deload bool`
- `rir_start int default 3`, `rir_end int default 0` — the planned RIR ramp
- `status text` — **unplanned** / planned / active / completed / abandoned. `unplanned` is the
  macro placeholder (Overview/list `+ PLAN` rows, `Mesocycle n` + `SUGGESTED <phase> · NOT
  PLANNED`); planning it fills the board and moves it to `planned`.
- `template_id uuid null` — provenance
- `start_date date null`
- **Migration delta:** add `position`, `phase`; add `unplanned` to the status check; drop
  `macro_slot_id`. Macro creation pre-creates the computed number of `unplanned` mesos with
  `position` + suggested `phase` (09 2026-06-13 §3–4).

### Groups-first plan: `meso_days` → `meso_day_groups` → `meso_exercises`
The planner board (figs 2.4/2.5): days are columns of muscle-group blocks; each block has N exercise slots filled from the pre-filtered picker.
- `meso_days`: `mesocycle_id`, `user_id`, `day_number`, `label` ("Lower A"), `weekday int` (ISO 1–7; **no manual reorder — days auto-sort by weekday** respecting `profiles.week_starts_on`)
- `meso_day_groups`: `meso_day_id`, `muscle_group_id`, `position`, `exercise_slots int` — the per-group exercise count from the day-setup steppers
- `meso_exercises` (slot fills): `meso_day_group_id`, `slot_number`, `exercise_id`, `initial_weight/reps/sets` (legacy `day_of_week` retired, nullable)

### `microcycles`
Generated when a meso starts/created.
- `mesocycle_id`, `user_id`
- `week_number int` (1-based), `target_rir int`, `is_deload bool`
- `start_date date null`, `status text` — pending / active / completed

### `workouts` (a session)
- `microcycle_id`, `user_id`, `day_number int`
- `scheduled_date date null`, `performed_at timestamptz null`
- `status text` — planned / in_progress / completed / skipped
- `notes text`

**Completion lock.** A `completed` workout is **immutable** — its `logged_sets`, feedback, and
exercise rows can no longer be added, edited, or deleted. Completion is what feeds the engine's
next-week generation (it writes `engine_decisions` and seeds the following week), so locking the
session avoids having to recompute the downstream chain. All set editing/deleting happens **while
the workout is `in_progress`** (the day view, fig 1.3 set menu); the meso planner's edits likewise
never touch a completed workout (the partial-completion lock, 09 2026-06-13 §5).

### `workout_exercises`
An exercise instance within a session, carrying the **prescription** the engine produced and ordering.
- `workout_id`, `exercise_id`, `position int`
- `muscle_group_id uuid null` — the planner group this slot came from; drives the day view's "01 — QUADS" headers and the feedback prompt's scope
- `prescribed_weight numeric null`, `prescribed_reps int null`, `prescribed_sets int null`, `target_rir int null`
- `status text` — pending / completed / skipped (a *whole* exercise skipped; set on completion for an exercise with no logged sets)
- `skipped_set_numbers int[]` (default `'{}'`) — **individually skipped sets** (fig 1.3): greyed in place, non-interactable, reversible while the workout is `in_progress`. "Skip remaining sets" fills this with every uncompleted slot (it no longer flips the exercise to `status = skipped`). Skipped sets are never logged, so the engine/views ignore them. **Migration delta:** `20260615000003_per_set_skip.sql` (shipped).
- `notes text` — the engine prescription rationale (read-only context in the 1.2 menu)
- **Notes model delta (planned, 09 session-5 §8):** add a **session log note** for the exercise-in-this-workout — `log_note text` here (or reuse `exercise_feedback.notes`) — distinct from the cross-workout **pinned note** (`exercise_notes.is_pinned`). The session note shows as a note-icon on history rows and is editable only on the live workout; the pinned note gets an inline edit affordance on the Day View.

The complete sheet's progress/denominator counts `prescribed_sets` minus `skipped_set_numbers`; "done" = every planned slot logged or skipped.

### `logged_sets`
The atomic history record. **This is the primary input to the engine and MCP analysis** — each row is fully stamped with cycle context for efficient time-series queries.
- `workout_exercise_id`
- denormalized stamps: `user_id`, `exercise_id`, `macrocycle_id` (null for standalone mesos), `mesocycle_id`, `microcycle_id`, `workout_id`, `performed_at timestamptz`
- `set_number int`, `weight numeric null`, `unit text` (lb/kg — the unit in effect when logged), `reps int null`, `duration_seconds int null`
  - which columns are populated follows the exercise's `tracking_type`: `weight_reps` ⇒ weight + reps; `reps` ⇒ reps only (weight null); `time` ⇒ duration_seconds (weight/reps null). **Migration delta:** make `weight`/`reps` nullable, add `duration_seconds`.
- `set_type text` — straight / drop
- `rir_reported int null` — user's own RIR estimate, when given
- `is_warmup bool default false`
- `notes text`

**Editable only within the active session.** Sets can be amended **and deleted** from the day-view
set menu (fig 1.3 `Delete set`) **while the parent workout is `in_progress`**. Once the workout is
`completed` the rows are locked (see `workouts` §Completion lock) — no client `update`/`delete`.
This refines hard rule #5: logged history is append-only/immutable *after completion*, not during
the live workout. (RLS: `delete`/`update` policies on `logged_sets` are gated on the parent
workout's status being `in_progress`.)

### `exercise_feedback`
The post-exercise prompt (fig 1.4) — one row per `workout_exercise`, scoped to a muscle group ("GLUTES — AFTER DEADLIFT").
- `workout_exercise_id`, `user_id`, `muscle_group_id`
- `joint_pain int` (0–3: none / low / moderate / high) — per exercise; the engine's pain gate operates on this
- `pump int` (0–10 snap-slider: NO PUMP → BEST EVER)
- `workload int` (0–10 snap-slider: TOO EASY → JUST RIGHT (5) → TOO MUCH) — sets next week's set count; supersedes the old strain/fatigue fields
- `notes text`

### `workout_feedback`
After completing a session — **retained** and captured on the **redesigned Workout Complete sheet**
(1.5), which re-adds these sliders (same UI as the per-exercise prompt) alongside the notes field
(decision 2026-06-14; the mockup had dropped them — see 09 / PROGRESS). Used as a session-level
dampener by the engine (see [10-metrics-spec.md](10-metrics-spec.md) §3).
- `workout_id`, `user_id`
- `overall_fatigue int` (0–4) — how tired/fatigued today
- `effort_rating int` (0–4), `performance_rating int` (0–4)
- `notes text` (paragraph notes; also mirrored to `workouts.notes`)

### `templates`
- `user_id null` — null ⇒ stock template
- `name`, `emphasis text` — arms / legs / upper / lower / full_body / push_pull_legs / …
- `intended_gender text null`, `days_per_week int`
- `description text`, `source_template_id uuid null`

### `template_days` / `template_day_groups` / `template_exercises`
Templates mirror the groups-first board so selecting one opens the planner prefilled.
- `template_days`: `template_id`, `day_number`, `label`
- `template_day_groups`: `template_day_id`, `muscle_group_id`, `position`, `exercise_slots`
- `template_exercises`: `template_day_group_id`, `slot_number`, `exercise_id`, `position`, `default_sets`, `default_rep_range int4range null`

### Sharing — `shares`
Unified grant table for custom content:
- `owner_id`, `grantee_id uuid null` (null + `share_code` set ⇒ link-share)
- `object_type text` — exercise / template / mesocycle
- `object_id uuid`, `share_code text unique null`, `expires_at null`

**Accepting a share copies the object** into the grantee's account (with `source_*_id` provenance), and recursively copies any custom exercises referenced by a shared template/meso (deduped by `source_exercise_id`). Copy-on-accept keeps RLS simple and avoids cross-user FK tangles.

### Engine & MCP tables
- `engine_params`: versioned parameter sets — `version int`, `params jsonb`, `is_active bool`, `notes`. Seeded with defaults; new versions are written via the admin-gated **MCP tuning tools** (no admin UI — see 08 §3).
- `engine_decisions`: audit log — `user_id`, `workout_exercise_id`, `inputs jsonb`, `output jsonb`, `params_version int`, `created_at`. Powers the "why did it prescribe this?" rationale (in-app and via MCP) and replay/tuning.
- `mcp_write_audit`: `user_id`, `tool`, `args_hash`, `summary`, `created_at` — written by the MCP server (service role) for every write tool call; owner-readable.

## RLS strategy

| Table group | Policy sketch |
|---|---|
| profiles | owner read/write own row |
| cycles (incl. meso_days/groups), workouts, exclusions, exercise_notes | `user_id = auth.uid()` (directly or via parent) for all ops |
| logged_sets, exercise_feedback | `user_id = auth.uid()` for select/insert; **`update`/`delete` only while the parent workout is `in_progress`** — a `completed` workout is locked (no delete/update policy match) |
| exercises, templates (incl. day groups) | read: `user_id is null or user_id = auth.uid()`; write: owner only; stock rows written only via service role/seed |
| shares | owner manages; grantee can select rows addressed to them |
| engine_params | read: all authenticated; write: admin role (via MCP tuning tools) |
| engine_decisions, mcp_write_audit | owner reads own; admin reads all; writes via service role only |

## Indexing & access patterns

- `logged_sets (user_id, exercise_id, performed_at desc)` — recent-performance lookups (the engine's hottest query).
- `logged_sets (user_id, mesocycle_id)` and `(user_id, microcycle_id)` — cycle rollups.
- `exercises (equipment_type)` — the Exercises tab's **EQUIP** filter axis (fig 3.1); combines (AND) with the muscle-group join for the **MUSCLE** axis and the live `n OF N` count. **Index delta.**
- **Week → day completion** for the Day View navigator (09 2026-06-13 §2) and the planner-board lock (09 2026-06-13 §5): per week in the active meso, the programmed days with each day's completion state (completed / active / planned) and `setsLogged ÷ setsPlanned` counts — from `microcycles` (week status) → `workouts` (day status) → `logged_sets` vs `workout_exercises.prescribed_sets`. Add `v_meso_week_days` if a single query is cleaner; the planner lock keys off `microcycles.status` (edits apply only to `pending` weeks).
- Muscle-group volume: view `v_muscle_group_volume` joining `logged_sets → exercises → exercise_muscle_groups`, aggregated per user/week. **Fractional set counting** (primary `role` = 1.0, secondary = 0.5; working sets only) is the default convention for all "sets per muscle" metrics and the volume-autoregulation engine — see [10-metrics-spec.md](10-metrics-spec.md) §2.
- Meso stats — **Balance (4.1) / Performance (4.2)** (Volume tab removed, 09 2026-06-14 §4): `v_meso_week_sets` — planned vs logged sets per muscle group per meso week (future weeks carry the autoregulated plan), now consumed by the Balance "avg sets/week — planned" bars + push/pull/legs split; `v_exercise_prs` — all-time bests per exercise for PR badges and the performance tab.
- **Exercise page (3.1a/3.1b):** `v_exercise_overview` — lifetime aggregates per user/exercise: last performed (date + W·D), all-time bests (weight PR, est. 1RM, volume PR, best session volume), est. 1RM by meso across the current macro, times trained, total volume, first logged. History tab groups `v_exercise_history` rows by meso.
- **Macrocycle stats (2.2):** `v_macro_summary` — rolled up across the macro's mesos: est. strength on key lifts (% vs macro start), total volume, sessions logged, adherence. The Overview's `FULL ›` link expands the same rollup.
- Shared views for MCP/stats: `v_exercise_history`, `v_meso_summary`, `v_meso_week_sets`, `v_exercise_prs`, `v_exercise_overview`, `v_macro_summary` — so MCP tools and the stats screens share one definition of "progress."
