# 03 — Data Model

Schema lives in `supabase/migrations/`. All tables: `id uuid pk default gen_random_uuid()`, `created_at`/`updated_at timestamptz`, RLS enabled. Naming: snake_case, singular FK columns (`user_id`), plural table names.

The structures below are designed for three consumers: the UI, the internal progression engine, and MCP tools — so linkage between cycles, exercises, and logged history is first-class.

## Entity relationship overview

```
profiles ─┬─< macrocycles ─< macro_slots ─< mesocycles ─< microcycles ─< workouts ─< workout_exercises ─< logged_sets
          │   (mesos may also be standalone) │                              │              │
          │                                  └─ meso_days ─< meso_day_groups─< meso_exercises (slot fills)
          │                                                                 │              └─ exercise_feedback
          │                                                                 └─ workout_feedback
          ├─< exercises (custom; stock have user_id null)
          ├─< excluded_exercises / exercise_notes
          ├─< templates ─< template_days ─< template_day_groups ─< template_exercises
          └─< shares
exercises ─< exercise_muscle_groups >─ muscle_groups
engine_params / engine_decisions / mcp_write_audit (tuning — operated via MCP, see 08 §3)
```

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

### `excluded_exercises`
Profile-managed exclusions (fig 4.5): `user_id`, `exercise_id`, `reason text` (e.g. "LOW BACK"). Excluded movements never appear in pickers or templates.

### `exercise_notes`
Per-user pinned notes shown under the exercise header in the day view and managed from the exercise menu: `user_id`, `exercise_id`, `body`, `is_pinned`.

### `muscle_groups`
Seeded reference table: chest, back, quads, hamstrings, glutes, biceps, triceps, shoulders, calves, abs, forearms, traps…

### `exercises`
- `user_id uuid null` — **null ⇒ stock exercise** (visible to all); set ⇒ custom (visible to author + grantees)
- `name text`, `equipment_type text` — dumbbell / barbell / machine / cable / smith / bodyweight / bands / kettlebell / other
- `description text`, `notes text`, `video_url text null`
- `source_exercise_id uuid null` — provenance when copied via sharing

### `exercise_muscle_groups`
- `exercise_id`, `muscle_group_id`, `role text` — primary / secondary

### `macrocycles`
- `user_id`, `name`
- `goal_type text` — cut / gain / maintain
- `goal_notes text`, `target_metrics jsonb` — e.g. `{ "bodyweight_delta_kg": 4, "key_lifts": {...} }`
- `start_date date`, `target_end_date date null`
- `status text` — active / completed / archived

### `macro_slots`
The macro's **goal arc** ("CUT → BULK → BULK II → PEAK", figs 2.1/2.7): an ordered series of slots that mesos fill.
- `macrocycle_id`, `user_id`, `slot_number int`
- `goal_type text` — cut / gain / maintain / peak
- `label text null` — display label, e.g. "Bulk II"; unfilled slots render as "+ PLAN"

### `mesocycles`
- `macrocycle_id uuid null` — **null ⇒ standalone meso** (fig 2.1 has a standalone section)
- `macro_slot_id uuid null` — placement in the goal arc
- `user_id` (denormalized for RLS + query speed)
- `name`, `weeks int check (3..8)` (picker offers 4–8 incl. deload), `days_per_week int`
- `includes_deload bool`
- `rir_start int default 3`, `rir_end int default 0` — the planned RIR ramp
- `status text` — planned / active / completed / abandoned
- `template_id uuid null` — provenance
- `start_date date null`

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

### `workout_exercises`
An exercise instance within a session, carrying the **prescription** the engine produced and ordering.
- `workout_id`, `exercise_id`, `position int`
- `muscle_group_id uuid null` — the planner group this slot came from; drives the day view's "01 — QUADS" headers and the feedback prompt's scope
- `prescribed_weight numeric null`, `prescribed_reps int null`, `prescribed_sets int null`, `target_rir int null`
- `status text` — pending / completed / skipped ("skip remaining sets")
- `notes text`

Skipped-set counts on the complete sheet derive from `prescribed_sets` minus logged rows; individual skipped sets are simply never logged.

### `logged_sets`
The atomic history record. **This is the primary input to the engine and MCP analysis** — each row is fully stamped with cycle context for efficient time-series queries.
- `workout_exercise_id`
- denormalized stamps: `user_id`, `exercise_id`, `macrocycle_id` (null for standalone mesos), `mesocycle_id`, `microcycle_id`, `workout_id`, `performed_at timestamptz`
- `set_number int`, `weight numeric`, `unit text` (lb/kg — the unit in effect when logged), `reps int`
- `set_type text` — straight / drop
- `rir_reported int null` — user's own RIR estimate, when given
- `is_warmup bool default false`
- `notes text`

### `exercise_feedback`
The post-exercise prompt (fig 1.4) — one row per `workout_exercise`, scoped to a muscle group ("GLUTES — AFTER DEADLIFT").
- `workout_exercise_id`, `user_id`, `muscle_group_id`
- `joint_pain int` (0–3: none / low / moderate / high) — per exercise; the engine's pain gate operates on this
- `pump int` (0–10 snap-slider: NO PUMP → BEST EVER)
- `workload int` (0–10 snap-slider: TOO EASY → JUST RIGHT (5) → TOO MUCH) — sets next week's set count; supersedes the old strain/fatigue fields
- `notes text`

### `workout_feedback`
After completing a session.
- `workout_id`, `user_id`
- `overall_fatigue int` (0–4) — how tired/fatigued today
- `effort_rating int` (0–4), `performance_rating int` (0–4)
- `notes text`

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
| cycles (incl. macro_slots, meso_days/groups), workouts, sets, feedback, exclusions, exercise_notes | `user_id = auth.uid()` (directly or via parent) for all ops |
| exercises, templates (incl. day groups) | read: `user_id is null or user_id = auth.uid()`; write: owner only; stock rows written only via service role/seed |
| shares | owner manages; grantee can select rows addressed to them |
| engine_params | read: all authenticated; write: admin role (via MCP tuning tools) |
| engine_decisions, mcp_write_audit | owner reads own; admin reads all; writes via service role only |

## Indexing & access patterns

- `logged_sets (user_id, exercise_id, performed_at desc)` — recent-performance lookups (the engine's hottest query).
- `logged_sets (user_id, mesocycle_id)` and `(user_id, microcycle_id)` — cycle rollups.
- Muscle-group volume: view `v_muscle_group_volume` joining `logged_sets → exercises → exercise_muscle_groups`, aggregated per user/week.
- Meso stats (figs 4.1–4.3): `v_meso_week_sets` — planned vs logged sets per muscle group per meso week (future weeks carry the autoregulated plan); `v_exercise_prs` — all-time bests per exercise for PR badges and the performance tab.
- Shared views for MCP/stats: `v_exercise_history`, `v_meso_summary`, `v_meso_week_sets`, `v_exercise_prs` — so MCP tools and the stats screens share one definition of "progress."
