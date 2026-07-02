-- 20260702000002 — T-A1: engine e1RM everywhere; retire the last raw-Epley views
--
-- Owner decision (2026-07-02, Batch 4): standardize every surface on the
-- engine's e1RM formula — the RIR-aware averaged Epley/Brzycki over effective
-- reps that `logged_sets.e1rm` stores per set at log/amend time (PH31,
-- 20260623130000). Stats show the UNDECAYED best-ever/observed value; recency
-- decay remains a prescription-only concern (the anchor in queries/logging.ts).
--
-- Three view changes, all reading the stored per-set engine estimate instead of
-- recomputing raw single-formula Epley `weight * (1 + reps/30)`:
--
--   1. v_exercise_overview.best_e1rm — the last raw-Epley e1RM a screen could
--      show (Exercise page overview). Now max(logged_sets.e1rm) over working
--      sets. Null-safe: max() ignores nulls (bodyweight sets store null e1rm),
--      so an all-bodyweight exercise reads null, matching the engine.
--   2. v_meso_summary.best_e1rm — same swap at the meso rollup grain
--      (meso summary UI + MCP get_mesocycle_summary / compare_mesocycles).
--   3. v_exercise_history gains best_set_e1rm (appended last — create or
--      replace keeps existing column order/types): the session's best per-set
--      engine e1RM alongside the existing session-average `e1rm`. This gives
--      PR logic a set-grain engine number to compare against (the session
--      average is systematically below any single set's best, so comparing a
--      best set to it inflated REP PR detection after the 06-26 avg change).
--
-- Raw Epley survives nowhere in SQL after this. Read models only:
-- security_invoker preserved; RLS unaffected (owner-scoped base tables).

-- 1. v_exercise_overview — best_e1rm from the stored engine per-set estimate
--    (security_invoker stated inline: 20260630000002 flipped it on via ALTER;
--    restating it here keeps the end state explicit through the replace)
create or replace view public.v_exercise_overview
with (security_invoker = true) as
  with working as (
    select
      logged_sets.id,
      logged_sets.workout_exercise_id,
      logged_sets.user_id,
      logged_sets.exercise_id,
      logged_sets.macrocycle_id,
      logged_sets.mesocycle_id,
      logged_sets.microcycle_id,
      logged_sets.workout_id,
      logged_sets.performed_at,
      logged_sets.set_number,
      logged_sets.weight,
      logged_sets.reps,
      logged_sets.rir_reported,
      logged_sets.is_warmup,
      logged_sets.notes,
      logged_sets.created_at,
      logged_sets.updated_at,
      logged_sets.set_type,
      logged_sets.e1rm
    from logged_sets
    where not logged_sets.is_warmup
  ),
  agg as (
    select
      working.user_id,
      working.exercise_id,
      count(distinct working.workout_id) as times_trained,
      sum(working.weight * working.reps::numeric) as total_volume,
      min(working.performed_at) as first_logged_at,
      max(working.performed_at) as last_performed_at,
      max(working.weight) as weight_pr,
      max(working.weight * working.reps::numeric) as volume_pr,
      -- T-A1: engine per-set e1RM (undecayed best-ever), not raw Epley
      max(working.e1rm) as best_e1rm
    from working
    group by working.user_id, working.exercise_id
  ),
  weight_pr_reps as (
    select distinct on (w.user_id, w.exercise_id)
      w.user_id,
      w.exercise_id,
      w.reps as weight_pr_reps
    from working w
      join agg a_1 on a_1.user_id = w.user_id and a_1.exercise_id = w.exercise_id and w.weight = a_1.weight_pr
    order by w.user_id, w.exercise_id, w.reps desc
  ),
  volume_pr_set as (
    select distinct on (w.user_id, w.exercise_id)
      w.user_id,
      w.exercise_id,
      w.weight as volume_pr_weight,
      w.reps as volume_pr_reps
    from working w
      join agg a_1 on a_1.user_id = w.user_id and a_1.exercise_id = w.exercise_id and (w.weight * w.reps::numeric) = a_1.volume_pr
    order by w.user_id, w.exercise_id, w.weight desc
  ),
  session_vol as (
    select
      t.user_id,
      t.exercise_id,
      max(t.sv) as best_session_volume
    from (
      select
        working.user_id,
        working.exercise_id,
        working.workout_id,
        sum(working.weight * working.reps::numeric) as sv
      from working
      group by working.user_id, working.exercise_id, working.workout_id
    ) t
    group by t.user_id, t.exercise_id
  )
  select
    a.user_id,
    a.exercise_id,
    e.name as exercise_name,
    a.times_trained,
    a.total_volume,
    a.first_logged_at,
    a.last_performed_at,
    a.weight_pr,
    wpr.weight_pr_reps,
    a.volume_pr,
    vps.volume_pr_weight,
    vps.volume_pr_reps,
    a.best_e1rm,
    sv.best_session_volume
  from agg a
    join exercises e on e.id = a.exercise_id
    left join weight_pr_reps wpr on wpr.user_id = a.user_id and wpr.exercise_id = a.exercise_id
    left join volume_pr_set vps on vps.user_id = a.user_id and vps.exercise_id = a.exercise_id
    left join session_vol sv on sv.user_id = a.user_id and sv.exercise_id = a.exercise_id;

-- 2. v_meso_summary — best_e1rm from the stored engine per-set estimate
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
    -- T-A1: engine per-set e1RM (undecayed best in the meso), not raw Epley
    max(ls.e1rm) filter (where not ls.is_warmup) as best_e1rm,
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

-- 3. v_exercise_history — append best_set_e1rm (session best per-set engine
--    e1RM) after the existing columns; session-average `e1rm` is unchanged.
create or replace view public.v_exercise_history
with (security_invoker = true) as
select
  ls.user_id,
  ls.exercise_id,
  e.name as exercise_name,
  ls.mesocycle_id,
  ls.microcycle_id,
  ls.workout_id,
  ls.performed_at::date as performed_on,
  count(*) filter (where not ls.is_warmup) as working_sets,
  sum(ls.weight * ls.reps) filter (where not ls.is_warmup) as volume,
  max(ls.weight) filter (where not ls.is_warmup) as top_weight,
  round(avg(ls.e1rm) filter (where not ls.is_warmup), 1) as e1rm,
  avg(ls.rir_reported) filter (where not ls.is_warmup) as avg_rir_reported,
  -- T-A1: the session's single best per-set engine e1RM, for set-grain
  -- comparisons (PR detection) where the session average would understate
  max(ls.e1rm) filter (where not ls.is_warmup) as best_set_e1rm
from public.logged_sets ls
join public.exercises e on e.id = ls.exercise_id
group by ls.user_id, ls.exercise_id, e.name, ls.mesocycle_id, ls.microcycle_id, ls.workout_id, ls.performed_at::date;
