-- Build Garron's training history from public.import_hist (loaded by
-- scripts/import-history.py). Runs in ONE session so the temp tables persist
-- across the steps. Idempotency guard: refuses to run if the account already
-- has mesocycles. All structure is derived; nothing is hand-numbered.
--
--   macrocycles  : contiguous bulk/cut runs (goal = cut if name~'cut' else
--                  hypertrophy); position-capped so each macro holds one run.
--   mesocycles   : one per CSV "Mesocycle"; weeks/days from the data; completed.
--   microcycles  : one per (meso,week); target_rir is a 3->0 ramp over working
--                  weeks, deload week = 4 (RIR was not tracked in the export).
--   meso_days/groups/exercises : the per-day plan, rebuilt from what was logged
--                  (groups-first by target muscle; initial_* from first week).
--   workouts/workout_exercises/logged_sets : the performed history. Set 1 was
--                  the weight; Set 2..N the reps -> one logged_set per rep cell.

do $$
begin
  if (select count(*) from public.mesocycles
      where user_id = '3183ce71-0f09-43c0-a732-296623eacc5f') > 0 then
    raise exception 'history already present for this user — aborting';
  end if;
end $$;

-- ---- meso-level rollup + bulk/cut blocking -------------------------------
create temp table t_meso as
with base as (
  select meso,
         min(perf_date)        as start_date,
         max(perf_date)        as end_date,
         max(week)             as weeks,
         max(day)              as days_per_week,
         bool_or(deload)       as includes_deload,
         case when lower(meso) like '%cut%' then 'cut' else 'hypertrophy' end as goal
  from public.import_hist
  group by meso
),
seq as (
  select *, row_number() over (order by start_date) as meso_seq from base
),
lagged as (
  select *, case when goal is distinct from lag(goal) over (order by meso_seq)
                 then 1 else 0 end as chg
  from seq
),
blocks as (
  select *, sum(chg) over (order by meso_seq) as block_id from lagged
)
select gen_random_uuid() as id, b.*,
       row_number() over (partition by block_id order by meso_seq) as position
from blocks b;

-- ---- macrocycles ---------------------------------------------------------
create temp table t_macro as
select gen_random_uuid() as id,
       block_id,
       min(goal)            as goal,
       min(start_date)      as start_date,
       max(end_date)        as end_date,
       row_number() over (order by min(start_date)) as macro_seq
from t_meso
group by block_id;

insert into public.macrocycles
  (id, user_id, name, goal_type, goal_notes, start_date, target_end_date, status)
select id, '3183ce71-0f09-43c0-a732-296623eacc5f',
       (case when goal = 'cut' then 'Cut' else 'Bulk' end) || ' · '
         || to_char(start_date, 'Mon YYYY') || ' – ' || to_char(end_date, 'Mon YYYY'),
       goal, 'Imported from training history.', start_date, end_date, 'completed'
from t_macro;

-- attach macro id to each meso
alter table t_meso add column macro_id uuid;
update t_meso m set macro_id = ma.id from t_macro ma where ma.block_id = m.block_id;

-- ---- mesocycles ----------------------------------------------------------
insert into public.mesocycles
  (id, macrocycle_id, user_id, name, weeks, days_per_week, includes_deload,
   rir_start, rir_end, status, start_date, position)
select id, macro_id, '3183ce71-0f09-43c0-a732-296623eacc5f', meso,
       greatest(3, least(8, weeks)), greatest(1, least(7, days_per_week)),
       includes_deload, 3, 0, 'completed', start_date, position
from t_meso;

-- ---- microcycles (target_rir ramp 3->0; deload = 4) ----------------------
create temp table t_micro as
with wk as (
  select meso, week, min(perf_date) as start_date, bool_or(deload) as is_deload
  from public.import_hist group by meso, week
),
nw as (
  select meso, count(*) filter (where not is_deload) as n_working from wk group by meso
)
select gen_random_uuid() as id, w.meso, w.week, w.start_date, w.is_deload,
       mm.id as meso_id,
       greatest(0, least(5, case
         when w.is_deload then 4
         when nw.n_working <= 1 then 2
         else round(3.0 * (nw.n_working - w.week) / (nw.n_working - 1))::int
       end)) as target_rir
from wk w
join nw on nw.meso = w.meso
join t_meso mm on mm.meso = w.meso;

insert into public.microcycles
  (id, mesocycle_id, user_id, week_number, target_rir, is_deload, start_date, status)
select id, meso_id, '3183ce71-0f09-43c0-a732-296623eacc5f', week, target_rir,
       is_deload, start_date, 'completed'
from t_micro;

-- ---- meso_days -----------------------------------------------------------
create temp table t_mday as
select gen_random_uuid() as id, mm.id as meso_id, d.meso, d.day
from (select distinct meso, day from public.import_hist) d
join t_meso mm on mm.meso = d.meso;

insert into public.meso_days (id, mesocycle_id, user_id, day_number)
select id, meso_id, '3183ce71-0f09-43c0-a732-296623eacc5f', day from t_mday;

-- ---- meso_day_groups (one per target muscle per day, first-seen order) ----
create temp table t_mgrp as
with g as (
  select meso, day, tmg, min(rownum) as first_row,
         count(distinct ex_legacy) as nex
  from public.import_hist group by meso, day, tmg
)
select gen_random_uuid() as id, g.meso, g.day, g.tmg, g.nex,
       row_number() over (partition by g.meso, g.day order by g.first_row) as position,
       md.id as meso_day_id, mg.id as muscle_group_id
from g
join t_mday md on md.meso = g.meso and md.day = g.day
join public.muscle_groups mg on mg.name = g.tmg;

insert into public.meso_day_groups
  (id, meso_day_id, muscle_group_id, position, exercise_slots)
select id, meso_day_id, muscle_group_id, position, nex from t_mgrp;

-- ---- meso_exercises (plan; initial_* from first week the lift appears) ----
create temp table t_mex as
with fo as (
  select distinct on (meso, day, ex_legacy, tmg)
         meso, day, ex_legacy, tmg, rownum as first_row,
         weight as init_weight, reps[1] as init_reps, nsets as init_sets
  from public.import_hist
  order by meso, day, ex_legacy, tmg, week, rownum
)
select gen_random_uuid() as id, fo.*,
       row_number() over (partition by fo.meso, fo.day order by fo.first_row) as position,
       row_number() over (partition by fo.meso, fo.day, fo.tmg order by fo.first_row) as slot_number,
       mm.id as meso_id, gr.id as group_id, ex.id as exercise_id
from fo
join t_meso mm on mm.meso = fo.meso
join t_mgrp gr on gr.meso = fo.meso and gr.day = fo.day and gr.tmg = fo.tmg
join public.exercises ex on ex.legacy_id = fo.ex_legacy and ex.user_id is null;

insert into public.meso_exercises
  (id, mesocycle_id, day_of_week, position, exercise_id, initial_weight,
   initial_reps, initial_sets, meso_day_group_id, slot_number)
select id, meso_id, day, position, exercise_id, init_weight,
       greatest(1, least(100, init_reps)), greatest(1, least(20, init_sets)),
       group_id, slot_number
from t_mex;

-- ---- workouts (one per performed meso/week/day) --------------------------
create temp table t_workout as
with wd as (
  select meso, week, day, min(perf_date) as sd from public.import_hist group by meso, week, day
)
select gen_random_uuid() as id, wd.meso, wd.week, wd.day, wd.sd,
       mc.id as micro_id, mm.id as meso_id, mm.macro_id
from wd
join t_meso mm on mm.meso = wd.meso
join t_micro mc on mc.meso = wd.meso and mc.week = wd.week;

insert into public.workouts
  (id, microcycle_id, user_id, day_number, scheduled_date, performed_at, status)
select id, micro_id, '3183ce71-0f09-43c0-a732-296623eacc5f', day, sd,
       (sd + time '12:00')::timestamptz, 'completed'
from t_workout;

-- ---- workout_exercises (one per CSV row) ---------------------------------
create temp table t_we as
select gen_random_uuid() as id, h.rownum, h.weight, h.reps, h.nsets, h.perf_date,
       w.id as workout_id, w.micro_id, w.meso_id, w.macro_id,
       ex.id as exercise_id, mg.id as muscle_group_id, mc.target_rir,
       row_number() over (partition by h.meso, h.week, h.day order by h.rownum) as position
from public.import_hist h
join t_workout w on w.meso = h.meso and w.week = h.week and w.day = h.day
join t_micro mc on mc.meso = h.meso and mc.week = h.week
join public.exercises ex on ex.legacy_id = h.ex_legacy and ex.user_id is null
join public.muscle_groups mg on mg.name = h.tmg;

insert into public.workout_exercises
  (id, workout_id, exercise_id, position, prescribed_weight, prescribed_reps,
   prescribed_sets, target_rir, muscle_group_id, status)
select id, workout_id, exercise_id, position, weight, reps[1], nsets,
       target_rir, muscle_group_id, 'completed'
from t_we;

-- ---- logged_sets (one per rep cell; Set 1 was the weight) ----------------
insert into public.logged_sets
  (id, workout_exercise_id, user_id, exercise_id, macrocycle_id, mesocycle_id,
   microcycle_id, workout_id, performed_at, set_number, weight, reps,
   rir_reported, is_warmup, set_type, unit)
select gen_random_uuid(), we.id, '3183ce71-0f09-43c0-a732-296623eacc5f',
       we.exercise_id, we.macro_id, we.meso_id, we.micro_id, we.workout_id,
       (we.perf_date + time '12:00')::timestamptz, s.ord, we.weight, s.rep,
       null, false, 'straight', 'lb'
from t_we we
cross join lateral unnest(we.reps) with ordinality as s(rep, ord);
