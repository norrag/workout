-- 20260617000006 — feedback sample counts on v_meso_summary (MCP review P1-4/P2)
--
-- v_meso_summary reported avg_joint_pain / avg_pump / avg_overall_fatigue /
-- avg_performance with no sense of how many observations stood behind each
-- average — a single grumpy session and twenty honest ones read the same. This
-- adds the per-metric sample counts so the MCP layer can surface coverage
-- beside every average. Append-only: the new columns are added last so
-- `create or replace view` keeps the existing column order/types.

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
  select
    mc.mesocycle_id,
    avg(ef.joint_pain) as avg_joint_pain,
    avg(ef.pump) as avg_pump,
    count(ef.joint_pain) as n_joint_pain,
    count(ef.pump) as n_pump
  from public.microcycles mc
  join public.workouts w on w.microcycle_id = mc.id
  join public.workout_exercises we on we.workout_id = w.id
  join public.exercise_feedback ef on ef.workout_exercise_id = we.id
  group by mc.mesocycle_id
),
wf_agg as (
  select
    mc.mesocycle_id,
    avg(wf.overall_fatigue) as avg_overall_fatigue,
    avg(wf.performance_rating) as avg_performance,
    count(wf.overall_fatigue) as n_overall_fatigue,
    count(wf.performance_rating) as n_performance
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
  coalesce(sa.working_reps, 0) as working_reps,
  coalesce(ea.n_joint_pain, 0) as n_joint_pain,
  coalesce(ea.n_pump, 0) as n_pump,
  coalesce(wfa.n_overall_fatigue, 0) as n_overall_fatigue,
  coalesce(wfa.n_performance, 0) as n_performance
from public.mesocycles m
  left join workout_agg wa on wa.mesocycle_id = m.id
  left join set_agg sa on sa.mesocycle_id = m.id
  left join ef_agg ea on ea.mesocycle_id = m.id
  left join wf_agg wfa on wfa.mesocycle_id = m.id;
