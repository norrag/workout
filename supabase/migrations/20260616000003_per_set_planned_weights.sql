-- ===========================================================================
-- Per-set planned weight overrides (doc 11 auto-match weights)
--
-- The plan stores a single `prescribed_weight` per exercise, so an edit to an
-- upcoming (unlogged) set had nowhere to persist — it lived only as staging UI
-- state and was lost on navigation, and the auto-match setting had nothing to
-- write to. This adds a per-set override map (`set_number` → planned weight) for
-- *unlogged* sets:
--   - editing a set's weight persists its override (survives navigation);
--   - with `profiles.auto_match_weights` on, the edit (or a logged weight) is
--     written to every still-unlogged set of the exercise.
-- Logged history is unaffected — actuals live in `logged_sets`; this only seeds
-- the planned weight shown before a set is logged. Display falls back to
-- `prescribed_weight` when a set has no override.
--
-- Rides the existing owner-gated workout_exercises RLS (writes go through the
-- parent workout's ownership). Append-only.
-- ===========================================================================

alter table public.workout_exercises
  add column if not exists set_weights jsonb not null default '{}'::jsonb;
