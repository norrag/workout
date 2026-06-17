-- 20260617000005 — engine_decisions integrity / linkage (MCP tooling review P0-4)
--
-- engine_decisions stored only workout_exercise_id (the generated prescription's
-- row) plus inputs/output jsonb. Everything else — the exercise, the source
-- workout_exercise that fed the inputs, and the cycle coordinates — was resolved
-- by join at read time, so a decision could not be chained into history without
-- a re-lookup, and there was no record of which params content produced it or
-- how missing per-set RIR was handled.
--
-- This persists the source identity on the row itself:
--   * exercise_id                 — the movement
--   * source_workout_exercise_id  — the week-N workout_exercise the inputs came
--                                   from (workout_exercise_id stays the generated
--                                   week-N+1 prescription target)
--   * workout_id / microcycle_id / mesocycle_id — cycle coordinates
--   * params_hash                 — content hash of the params used (ties the
--                                   decision to an immutable engine_params snapshot)
--   * provenance jsonb            — recording-time notes (e.g. the RIR-fallback
--                                   rule applied when rir_reported was null)
--
-- The immutable logged_set_id + sequence_index for each input set live in the
-- inputs jsonb (engine input shape), set by the recording path. Additive columns
-- + a one-time backfill of the join-resolvable fields for existing rows; RLS is
-- unchanged (owner-or-admin select; writes are service-role only).

alter table public.engine_decisions
  add column if not exists exercise_id uuid references public.exercises (id) on delete set null,
  add column if not exists source_workout_exercise_id uuid references public.workout_exercises (id) on delete set null,
  add column if not exists workout_id uuid references public.workouts (id) on delete set null,
  add column if not exists microcycle_id uuid references public.microcycles (id) on delete set null,
  add column if not exists mesocycle_id uuid references public.mesocycles (id) on delete set null,
  add column if not exists params_hash text,
  add column if not exists provenance jsonb;

-- Backfill the join-resolvable coordinates for existing decisions from the
-- generated workout_exercise. source_workout_exercise_id and params_hash stay
-- null for legacy rows (the source we / params content were not recorded then).
update public.engine_decisions ed set
  exercise_id = we.exercise_id,
  workout_id = w.id,
  microcycle_id = w.microcycle_id,
  mesocycle_id = mc.mesocycle_id
from public.workout_exercises we
  join public.workouts w on w.id = we.workout_id
  join public.microcycles mc on mc.id = w.microcycle_id
where ed.workout_exercise_id = we.id
  and ed.exercise_id is null;

create index if not exists engine_decisions_exercise_idx
  on public.engine_decisions (user_id, exercise_id, created_at desc);

comment on column public.engine_decisions.source_workout_exercise_id is
  'the week-N workout_exercise whose logged sets fed this decision; workout_exercise_id is the generated week-N+1 prescription target.';
comment on column public.engine_decisions.provenance is
  'recording-time provenance: rir-fallback rule applied, engine build, etc. Distinct from the engine inputs/output.';
