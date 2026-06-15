-- Exercise page (3.1a/3.1b) + two-axis library filter (Design v2 reconciliation,
-- 09 2026-06-14 session-3 §1/§2; 03-data-model §"Exercise page" / shared views).
--
-- 1. v_exercise_overview — per (user, exercise) lifetime aggregates that back the
--    3.1a Overview tab. One definition of "progress" shared by the stats screens and
--    MCP read tools (CLAUDE.md shared-views list). security_invoker so RLS on
--    logged_sets/exercises applies (a user only ever aggregates their own sets).
-- 2. exercises(equipment_type) index — the 3.1 library gains an EQUIP filter axis
--    (combined AND with the muscle filter); keep it queryable/indexed (09 §1 DATA).
--
-- Append-only; no table changes, so no new RLS policies are required (the view
-- inherits the underlying tables' policies under security_invoker).

create view public.v_exercise_overview
with (security_invoker = true) as
with working as (
  select * from public.logged_sets where not is_warmup
),
agg as (
  select
    user_id,
    exercise_id,
    count(distinct workout_id)                   as times_trained,
    sum(weight * reps)                           as total_volume,
    min(performed_at)                            as first_logged_at,
    max(performed_at)                            as last_performed_at,
    max(weight)                                  as weight_pr,
    max(weight * reps)                           as volume_pr,
    max(weight * (1 + reps / 30.0))              as best_e1rm
  from working
  group by user_id, exercise_id
),
-- reps at the heaviest-ever weight (the most reps among sets at that weight)
weight_pr_reps as (
  select distinct on (w.user_id, w.exercise_id)
    w.user_id, w.exercise_id, w.reps as weight_pr_reps
  from working w
  join agg a
    on a.user_id = w.user_id and a.exercise_id = w.exercise_id and w.weight = a.weight_pr
  order by w.user_id, w.exercise_id, w.reps desc
),
-- the weight x reps that produced the best single-set tonnage
volume_pr_set as (
  select distinct on (w.user_id, w.exercise_id)
    w.user_id, w.exercise_id, w.weight as volume_pr_weight, w.reps as volume_pr_reps
  from working w
  join agg a
    on a.user_id = w.user_id and a.exercise_id = w.exercise_id and (w.weight * w.reps) = a.volume_pr
  order by w.user_id, w.exercise_id, w.weight desc
),
session_vol as (
  select user_id, exercise_id, max(sv) as best_session_volume
  from (
    select user_id, exercise_id, workout_id, sum(weight * reps) as sv
    from working
    group by user_id, exercise_id, workout_id
  ) t
  group by user_id, exercise_id
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
join public.exercises e on e.id = a.exercise_id
left join weight_pr_reps wpr on wpr.user_id = a.user_id and wpr.exercise_id = a.exercise_id
left join volume_pr_set vps on vps.user_id = a.user_id and vps.exercise_id = a.exercise_id
left join session_vol sv on sv.user_id = a.user_id and sv.exercise_id = a.exercise_id;

comment on view public.v_exercise_overview is
  'Per user/exercise lifetime aggregates for the Exercise page Overview (3.1a) and MCP. security_invoker.';

create index if not exists exercises_equipment_type_idx
  on public.exercises (equipment_type);
