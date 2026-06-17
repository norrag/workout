-- 20260617000003 — metric-truth view fixes (MCP tooling review, P0-1 / P0-2)
--
-- Two shared stats views fanned out their set-level facts across unrelated
-- joins, inflating every additive metric:
--
--   * v_meso_summary joined logged_sets together with workout_exercises,
--     exercise_feedback and workout_feedback on the workout grain. Each logged
--     set was multiplied by (#workout_exercises × #workout_feedback) rows, so
--     `working_sets`, `total_volume`, and the feedback averages were all
--     over-counted (observed: working_sets ≈ 1104 for ~10 four-day sessions).
--
--   * v_meso_week_sets summed workout_exercises.prescribed_sets while joined to
--     logged_sets, so each exercise's planned-set count was multiplied by the
--     number of sets actually logged against it. That is the real cause of the
--     "45 planned vs 15 logged" mismatch the review flagged — both sides already
--     attribute to the workout_exercise's muscle group, so it was never a
--     credit-model difference, just join fan-out (note that future/unlogged
--     weeks, with zero logged sets, reported the correct planned total).
--
-- Fix: pre-aggregate set facts (and feedback) in CTEs before combining, so each
-- logged set and each prescribed-set count is counted exactly once. Adds
-- `working_reps` (the true repetition sum) so callers can distinguish set count
-- from rep count. Append-only; column order is preserved and the new column is
-- added last so `create or replace view` succeeds.

-- ---------------------------------------------------------------------------
-- v_meso_summary — set facts and feedback aggregated independently per meso
-- ---------------------------------------------------------------------------

create or replace view public.v_meso_summary
with (security_invoker = true) as
with meso_workouts as (
  select m.id as mesocycle_id, w.id as workout_id, w.status, mc.is_deload
  from public.mesocycles m
  join public.microcycles mc on mc.mesocycle_id = m.id
  join public.workouts w on w.microcycle_id = mc.id
),
workout_agg as (
  select
    mesocycle_id,
    count(distinct workout_id) filter (where status = 'completed') as workouts_completed,
    count(distinct workout_id) as workouts_total,
    count(distinct workout_id) filter (
      where status = 'completed' and not coalesce(is_deload, false)
    ) as sessions_attended,
    count(distinct workout_id) filter (
      where status in ('completed', 'skipped') and not coalesce(is_deload, false)
    ) as sessions_due
  from meso_workouts
  group by mesocycle_id
),
set_agg as (
  select
    mw.mesocycle_id,
    count(ls.id) filter (where not ls.is_warmup) as working_sets,
    sum(ls.weight * ls.reps) filter (where not ls.is_warmup) as total_volume,
    max(ls.weight * (1 + ls.reps / 30.0)) filter (where not ls.is_warmup) as best_e1rm,
    sum(ls.reps) filter (where not ls.is_warmup) as working_reps
  from meso_workouts mw
  join public.logged_sets ls on ls.workout_id = mw.workout_id
  group by mw.mesocycle_id
),
ef_agg as (
  -- one row per exercise_feedback; not multiplied by logged sets
  select
    mc.mesocycle_id,
    avg(ef.joint_pain) as avg_joint_pain,
    avg(ef.pump) as avg_pump
  from public.microcycles mc
  join public.workouts w on w.microcycle_id = mc.id
  join public.workout_exercises we on we.workout_id = w.id
  join public.exercise_feedback ef on ef.workout_exercise_id = we.id
  group by mc.mesocycle_id
),
wf_agg as (
  -- one row per workout_feedback; not multiplied by logged sets or exercises
  select
    mc.mesocycle_id,
    avg(wf.overall_fatigue) as avg_overall_fatigue,
    avg(wf.performance_rating) as avg_performance
  from public.microcycles mc
  join public.workouts w on w.microcycle_id = mc.id
  join public.workout_feedback wf on wf.workout_id = w.id
  group by mc.mesocycle_id
)
select
  m.user_id,
  m.id as mesocycle_id,
  m.name,
  m.status,
  m.weeks,
  m.days_per_week,
  m.rir_start,
  m.rir_end,
  m.includes_deload,
  m.start_date,
  coalesce(wa.workouts_completed, 0) as workouts_completed,
  coalesce(wa.workouts_total, 0) as workouts_total,
  coalesce(sa.working_sets, 0) as working_sets,
  sa.total_volume,
  sa.best_e1rm,
  ea.avg_joint_pain,
  ea.avg_pump,
  wfa.avg_overall_fatigue,
  wfa.avg_performance,
  coalesce(wa.sessions_attended, 0) as sessions_attended,
  coalesce(wa.sessions_due, 0) as sessions_due,
  coalesce(sa.working_reps, 0) as working_reps
from public.mesocycles m
  left join workout_agg wa on wa.mesocycle_id = m.id
  left join set_agg sa on sa.mesocycle_id = m.id
  left join ef_agg ea on ea.mesocycle_id = m.id
  left join wf_agg wfa on wfa.mesocycle_id = m.id;

-- ---------------------------------------------------------------------------
-- v_meso_week_sets — planned and logged sets counted once per workout_exercise
-- ---------------------------------------------------------------------------

create or replace view public.v_meso_week_sets
with (security_invoker = true) as
with we_sets as (
  -- collapse each workout_exercise to its own planned + logged counts first,
  -- so summing prescribed_sets can't be multiplied by logged_sets rows
  select
    we.id as workout_exercise_id,
    we.workout_id,
    we.muscle_group_id,
    we.prescribed_sets,
    count(ls.id) filter (where not ls.is_warmup) as logged_sets
  from public.workout_exercises we
  left join public.logged_sets ls on ls.workout_exercise_id = we.id
  group by we.id, we.workout_id, we.muscle_group_id, we.prescribed_sets
)
select
  mc.user_id,
  mc.mesocycle_id,
  mc.week_number,
  mc.is_deload,
  wes.muscle_group_id,
  mg.name as muscle_group,
  -- cast back to bigint so `create or replace view` keeps the original column
  -- types (sum() of the per-we counts widens to numeric otherwise)
  sum(wes.prescribed_sets)::bigint as planned_sets,
  sum(wes.logged_sets)::bigint as logged_sets
from public.microcycles mc
  join public.workouts w on w.microcycle_id = mc.id
  join we_sets wes on wes.workout_id = w.id
  left join public.muscle_groups mg on mg.id = wes.muscle_group_id
group by mc.user_id, mc.mesocycle_id, mc.week_number, mc.is_deload, wes.muscle_group_id, mg.name;
