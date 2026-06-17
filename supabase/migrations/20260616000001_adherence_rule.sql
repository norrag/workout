-- 20260616000001 — adherence rule fix
--
-- Adherence = attended / due over WORKING (non-deload) weeks, counting only
-- *decided* days: `completed` (attended) and `skipped` (missed). Days that are
-- not yet due — `planned`/`in_progress` (the current and future days) — and all
-- deload-week days are excluded, so a meso in progress isn't dinged for sessions
-- that haven't come up yet, and reduced deload volume isn't counted as absence.
--
-- Adds sessions_attended / sessions_due to the shared summary views (the single
-- definition of progress for stats + MCP); macro.ts computes the % from them.
-- Existing columns are unchanged (append-only), so callers keep working.

create or replace view public.v_macro_summary
with (security_invoker = true) as
select
  m.user_id,
  m.macrocycle_id,
  count(distinct m.id) as meso_count,
  count(distinct w.id) filter (where w.status = 'completed') as sessions_logged,
  count(distinct w.id) as workouts_total,
  count(ls.id) filter (where not ls.is_warmup) as working_sets,
  coalesce(sum(ls.weight * ls.reps) filter (where not ls.is_warmup), 0) as total_volume,
  min(mc.start_date) as first_week_start,
  count(distinct w.id) filter (
    where w.status = 'completed' and not coalesce(mc.is_deload, false)
  ) as sessions_attended,
  count(distinct w.id) filter (
    where w.status in ('completed', 'skipped') and not coalesce(mc.is_deload, false)
  ) as sessions_due
from public.mesocycles m
  left join public.microcycles mc on mc.mesocycle_id = m.id
  left join public.workouts w on w.microcycle_id = mc.id
  left join public.logged_sets ls on ls.workout_id = w.id
where m.macrocycle_id is not null
group by m.user_id, m.macrocycle_id;

create or replace view public.v_meso_summary
with (security_invoker = true) as
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
  count(distinct w.id) filter (where w.status = 'completed') as workouts_completed,
  count(distinct w.id) as workouts_total,
  count(ls.id) filter (where not ls.is_warmup) as working_sets,
  sum(ls.weight * ls.reps) filter (where not ls.is_warmup) as total_volume,
  max(ls.weight * (1 + ls.reps / 30.0)) filter (where not ls.is_warmup) as best_e1rm,
  avg(ef.joint_pain) as avg_joint_pain,
  avg(ef.pump) as avg_pump,
  avg(wf.overall_fatigue) as avg_overall_fatigue,
  avg(wf.performance_rating) as avg_performance,
  count(distinct w.id) filter (
    where w.status = 'completed' and not coalesce(mc.is_deload, false)
  ) as sessions_attended,
  count(distinct w.id) filter (
    where w.status in ('completed', 'skipped') and not coalesce(mc.is_deload, false)
  ) as sessions_due
from public.mesocycles m
  left join public.microcycles mc on mc.mesocycle_id = m.id
  left join public.workouts w on w.microcycle_id = mc.id
  left join public.logged_sets ls on ls.workout_id = w.id
  left join public.workout_exercises we on we.workout_id = w.id
  left join public.exercise_feedback ef on ef.workout_exercise_id = we.id
  left join public.workout_feedback wf on wf.workout_id = w.id
group by m.id;
