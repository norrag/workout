-- 20260702000001 — R14: role-grain weekly-set facts for fractional volume counting
--
-- Doc 10 §2 (locked, [EVIDENCED]) counts volume fractionally: a completed
-- working set credits 1.0 to each of the exercise's primary muscles and 0.5 to
-- each secondary (`exercise_muscle_groups.role`), and only *hard* sets count —
-- warm-ups excluded, and a set must be near enough to failure to be a stimulus
-- (default: logged at rir ≤ 4; an unreported RIR counts, benefit of the doubt).
-- The old `v_meso_week_sets` credits each set solely to the slot's
-- `workout_exercises.muscle_group_id` (primary-only, no RIR gate), so secondary
-- delts/triceps/hamstrings volume from compounds is invisible: false "below
-- MEV" calls and overly permissive MRV/ceiling checks (repo review R14).
--
-- This view exposes the *facts* at (user, meso, week, muscle group, role) grain;
-- the fractional 1.0/0.5 weights are applied in one shared, params-tunable TS
-- fold (`engine/volume.ts::fractionalSetCount`, weights from
-- `engine_params.volume.direct/indirect`) — SQL cannot read versioned params,
-- so the weights deliberately do NOT live here. The two §2 companions the SQL
-- *must* own are structural here, at their doc-10 defaults:
--   * `warmups_count = false` — warm-ups are filtered from every count;
--   * `counting_max_rir = 4` — `logged_hard_sets` counts sets with
--     rir_reported ≤ 4 OR unreported. Changing either means a new migration on
--     this view (documented on the params schema).
--
-- Crediting: each workout_exercise credits every muscle its *exercise* is
-- linked to, by role. Exercises with no links (defensive: a custom exercise
-- created before links existed) fall back to the slot's assigned group as
-- primary, so no logged work ever disappears from the volume picture.
--
-- NEW view rather than replacing `v_meso_week_sets` in place: the deployed app
-- reads the old grain until the code half of R14 ships, so replacing it would
-- break live numbers in the apply→deploy window. `v_meso_week_sets` (and the
-- long-dead `v_muscle_group_volume`) become retirement candidates once this is
-- the only consumer path (tracked with repo-hygiene R23).
--
-- Read model only: security_invoker, so the underlying owner-scoped RLS on
-- microcycles/workouts/workout_exercises/logged_sets applies unchanged.

create view public.v_meso_week_muscle_sets
with (security_invoker = true) as
with we_muscles as (
  -- each workout_exercise → the muscles its exercise credits, by role
  select we.id as workout_exercise_id, emg.muscle_group_id, emg.role
  from public.workout_exercises we
  join public.exercise_muscle_groups emg on emg.exercise_id = we.exercise_id
  union all
  -- fallback: an exercise with no muscle links credits its slot's group as
  -- primary (keeps parity with the legacy by-slot count; muscle_group_id may
  -- be null → surfaces as "unassigned", never silently dropped)
  select we.id, we.muscle_group_id, 'primary'
  from public.workout_exercises we
  where not exists (
    select 1 from public.exercise_muscle_groups emg
    where emg.exercise_id = we.exercise_id
  )
),
we_sets as (
  -- collapse each workout_exercise to its own planned + logged counts first so
  -- prescribed_sets can't be multiplied by logged_sets rows (same guard as the
  -- 20260617000003 fan-out fix)
  select
    we.id as workout_exercise_id,
    we.workout_id,
    we.prescribed_sets,
    count(ls.id) filter (where not ls.is_warmup) as logged_sets,
    count(ls.id) filter (
      where not ls.is_warmup
        and (ls.rir_reported is null or ls.rir_reported <= 4)
    ) as logged_hard_sets
  from public.workout_exercises we
  left join public.logged_sets ls on ls.workout_exercise_id = we.id
  group by we.id, we.workout_id, we.prescribed_sets
)
select
  mc.user_id,
  mc.mesocycle_id,
  mc.week_number,
  mc.is_deload,
  wm.muscle_group_id,
  mg.name as muscle_group,
  wm.role,
  sum(wes.prescribed_sets)::bigint as planned_sets,
  sum(wes.logged_sets)::bigint as logged_sets,
  sum(wes.logged_hard_sets)::bigint as logged_hard_sets
from public.microcycles mc
  join public.workouts w on w.microcycle_id = mc.id
  join we_sets wes on wes.workout_id = w.id
  join we_muscles wm on wm.workout_exercise_id = wes.workout_exercise_id
  left join public.muscle_groups mg on mg.id = wm.muscle_group_id
group by
  mc.user_id, mc.mesocycle_id, mc.week_number, mc.is_deload,
  wm.muscle_group_id, mg.name, wm.role;

comment on view public.v_meso_week_muscle_sets is
  'Weekly set facts per (meso, week, muscle group, role) for doc 10 §2 fractional volume counting (R14). planned_sets/logged_sets/logged_hard_sets are UNWEIGHTED per-role counts; the 1.0/0.5 direct/indirect weighting is applied in engine/volume.ts::fractionalSetCount from engine_params. logged_hard_sets bakes the §2 hard-set rule: non-warmup, rir_reported <= 4 or unreported. Supersedes the primary-only v_meso_week_sets.';
