-- ---------------------------------------------------------------------------
-- 20260615000003 — per-set skip state (Design v2 review, figs 1.1/1.3)
--
-- A set can now be *skipped* individually: greyed and non-interactable, but
-- still displayed in the grid, and reversible while the workout is in_progress.
-- "Skip remaining sets" marks every uncompleted set of an exercise skipped
-- (leaving the logged ones and the exercise itself untouched) rather than
-- skipping the whole exercise.
--
-- Stored as an array of set numbers on the workout_exercise. Skipped sets are
-- invisible to the engine (no logged_sets row is written), so views and the
-- progression job are unaffected. UI gates editing to in_progress workouts;
-- no separate RLS is needed (workout_exercises is already owner-scoped).
-- ---------------------------------------------------------------------------

alter table public.workout_exercises
  add column skipped_set_numbers int[] not null default '{}';
