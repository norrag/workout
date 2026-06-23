-- 20260623120000 — imperial units only
--
-- The imperial/metric unit-conversion feature is removed: the app records and
-- displays weight exclusively in pounds and height in inches. All existing data
-- is already stored in `lb` (the only unit any profile ever used), so this is a
-- structural cleanup plus a height unit conversion — no weight values change.
--
--   * drop the per-record / per-profile unit tags that are now redundant
--     (`profiles.units`, `logged_sets.unit`) — every row is already 'lb';
--   * convert `profiles.height_cm` → `profiles.height_in` (whole inches), the
--     unit the app now reads/writes;
--   * drop `convert_my_weights(to_unit)`, the unit-switch conversion routine.
--
-- `macrocycles.target_unit` is kept: it stores 'lb' OR '%' and encodes the
-- weight-vs-percentage distinction of a macro goal, not the metric/imperial
-- choice.

-- 1. Drop the unit-switch conversion function (references profiles.units /
--    height_cm, which are dropped below).
drop function if exists public.convert_my_weights(text);

-- 2. Recreate v_exercise_overview without the logged_sets.unit reference so the
--    column can be dropped. Output columns are unchanged (unit was carried in the
--    `working` CTE but never surfaced).
create or replace view public.v_exercise_overview as
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
      logged_sets.set_type
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
      max(working.weight * (1::numeric + working.reps::numeric / 30.0)) as best_e1rm
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

-- 3. Drop the per-set unit tag (every logged set is already 'lb').
alter table public.logged_sets drop column if exists unit;

-- 4. Convert profiles.height_cm → height_in (whole inches), then drop the
--    cm column and the units column.
alter table public.profiles add column if not exists height_in numeric
  check (height_in is null or height_in between 36 and 96);
update public.profiles set height_in = round(height_cm / 2.54)
  where height_cm is not null;
alter table public.profiles drop column if exists height_cm;
alter table public.profiles drop column if exists units;
