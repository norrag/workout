# 03 — Data Model

Schema lives in `supabase/migrations/`. All tables: `id uuid pk default gen_random_uuid()`, `created_at`/`updated_at timestamptz`, RLS enabled. Naming: snake_case, singular FK columns (`user_id`), plural table names.

The structures below are designed for three consumers: the UI, the internal progression engine, and MCP tools — so linkage between cycles, exercises, and logged history is first-class.

## Entity relationship overview

```
profiles ─┬─< macrocycles ─< mesocycles ─< microcycles ─< workouts ─< workout_exercises ─< logged_sets
          │                     │                            │              │
          │                     └─ meso_exercises (plan)     │              └─ exercise_feedback
          │                                                  └─ workout_feedback
          ├─< exercises (custom; stock have user_id null)
          ├─< templates ─< template_days ─< template_exercises
          └─< shares
exercises ─< exercise_muscle_groups >─ muscle_groups
engine_params / engine_decisions (admin/tuning)
```

## Tables

### `profiles`
Extends `auth.users` 1:1 (`id` = auth uid).
- `display_name text`
- `age int`, `gender text` (enum-ish check: female / male / other / undisclosed)
- `experience_level text` — beginner / intermediate / advanced
- `preferred_equipment text[]` — machines, free_weights, cables, bodyweight…
- `units text` — kg / lb (default lb)
- `role text` — user / admin (admin gates tuning UI)

### `muscle_groups`
Seeded reference table: chest, back, quads, hamstrings, glutes, biceps, triceps, shoulders, calves, abs, forearms, traps…

### `exercises`
- `user_id uuid null` — **null ⇒ stock exercise** (visible to all); set ⇒ custom (visible to author + grantees)
- `name text`, `equipment_type text` — dumbbell / barbell / machine / cable / smith / bodyweight / other
- `notes text`, `video_url text null`
- `source_exercise_id uuid null` — provenance when copied via sharing

### `exercise_muscle_groups`
- `exercise_id`, `muscle_group_id`, `role text` — primary / secondary

### `macrocycles`
- `user_id`, `name`
- `goal_type text` — cut / gain / maintain
- `goal_notes text`, `target_metrics jsonb` — e.g. `{ "bodyweight_delta_kg": 4, "key_lifts": {...} }`
- `start_date date`, `target_end_date date null`
- `status text` — active / completed / archived

### `mesocycles`
- `macrocycle_id`, `user_id` (denormalized for RLS + query speed)
- `name`, `weeks int check (3..6)`, `days_per_week int`
- `includes_deload bool`
- `rir_start int default 3`, `rir_end int default 0` — the planned RIR ramp
- `status text` — planned / active / completed / abandoned
- `template_id uuid null` — provenance
- `start_date date null`

### `meso_exercises` (the plan)
The exercise slots of a mesocycle: which exercise on which day, in what order, with initial prescription.
- `mesocycle_id`, `day_of_week int` (1..days_per_week), `position int`
- `exercise_id`
- `initial_weight numeric null`, `initial_reps int null`, `initial_sets int`

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
- `prescribed_weight numeric null`, `prescribed_reps int null`, `prescribed_sets int null`, `target_rir int null`
- `notes text`

### `logged_sets`
The atomic history record. **This is the primary input to the engine and MCP analysis** — each row is fully stamped with cycle context for efficient time-series queries.
- `workout_exercise_id`
- denormalized stamps: `user_id`, `exercise_id`, `macrocycle_id`, `mesocycle_id`, `microcycle_id`, `workout_id`, `performed_at timestamptz`
- `set_number int`, `weight numeric`, `reps int`
- `rir_reported int null` — user's own RIR estimate, when given
- `is_warmup bool default false`
- `notes text`

### `exercise_feedback`
After finishing an exercise's sets.
- `workout_exercise_id`, `user_id`
- `joint_pain int` (0–3), `muscle_strain int` (0–3) — pain/strain levels
- `pump int` (0–3) — muscle pump rating
- `fatigue int` (0–3) — local fatigue/soreness carry-over
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

### `template_days` / `template_exercises`
- `template_days`: `template_id`, `day_number`, `label`
- `template_exercises`: `template_day_id`, `exercise_id`, `position`, `default_sets`, `default_rep_range int4range null`

### Sharing — `shares`
Unified grant table for custom content:
- `owner_id`, `grantee_id uuid null` (null + `share_code` set ⇒ link-share)
- `object_type text` — exercise / template / mesocycle
- `object_id uuid`, `share_code text unique null`, `expires_at null`

**Accepting a share copies the object** into the grantee's account (with `source_*_id` provenance), and recursively copies any custom exercises referenced by a shared template/meso (deduped by `source_exercise_id`). Copy-on-accept keeps RLS simple and avoids cross-user FK tangles.

### Engine tables
- `engine_params`: versioned parameter sets — `version int`, `params jsonb`, `is_active bool`, `notes`. Seeded with defaults; admin tooling writes new versions.
- `engine_decisions`: audit log — `user_id`, `workout_exercise_id`, `inputs jsonb`, `output jsonb`, `params_version int`, `created_at`. Powers the admin "why did it prescribe this?" view and offline replay/tuning.

## RLS strategy

| Table group | Policy sketch |
|---|---|
| profiles | owner read/write own row |
| cycles, workouts, sets, feedback | `user_id = auth.uid()` for all ops |
| exercises, templates | read: `user_id is null or user_id = auth.uid()`; write: owner only; stock rows written only via service role/seed |
| shares | owner manages; grantee can select rows addressed to them |
| engine_params | read: all authenticated; write: admin role |
| engine_decisions | owner reads own; admin reads all |

## Indexing & access patterns

- `logged_sets (user_id, exercise_id, performed_at desc)` — recent-performance lookups (the engine's hottest query).
- `logged_sets (user_id, mesocycle_id)` and `(user_id, microcycle_id)` — cycle rollups.
- Muscle-group volume: view `v_muscle_group_volume` joining `logged_sets → exercises → exercise_muscle_groups`, aggregated per user/week.
- Materialized or computed views for MCP/insights: `v_exercise_history`, `v_meso_summary` — so MCP tools and charts share one definition of "progress."
