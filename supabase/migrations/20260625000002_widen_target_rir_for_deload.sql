-- 20260625000002 — widen target_rir bounds 0–5 → 0–8 for the anchor-based deload
--
-- The deload now selects its load from the strength anchor to land window-centered
-- reps at a genuine recovery RIR (≈6), instead of the legacy "load_pct of peak +
-- carry the peak reps + state RIR 4" heuristic (which produced an internally
-- inconsistent triple). A deload microcycle therefore carries a target_rir above
-- the old working-week ceiling of 5. Widen the two CHECK constraints that gate it
-- so a 6-RIR deload week / prescription can be persisted.
--
-- Working weeks are unaffected: mesocycles.rir_start/rir_end stay 0–5 (the ramp is
-- bounded there); only the per-week microcycle target and the per-exercise
-- prescription target — which a deload writes — need the higher ceiling. The new
-- value is only produced when engine_params.deload_anchor_rir is active (v15+);
-- existing 0–5 rows remain valid, so this is a pure widening (no data migration).
--
-- No RLS change: the owner SELECT/INSERT/UPDATE policies on both tables are
-- untouched; a CHECK bound does not affect row visibility. Append-only (hard rule
-- #2): the inline constraints from the initial schema are dropped by their
-- Postgres-default names and re-added wider.

alter table public.microcycles
  drop constraint if exists microcycles_target_rir_check,
  add constraint microcycles_target_rir_check check (target_rir between 0 and 8);

alter table public.workout_exercises
  drop constraint if exists workout_exercises_target_rir_check,
  add constraint workout_exercises_target_rir_check check (target_rir between 0 and 8);
