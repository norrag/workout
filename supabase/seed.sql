-- Seed: muscle groups, stock exercises, stock templates, default engine params.
-- Stock rows have user_id null and are written only here (service context).

-- ---------------------------------------------------------------------------
-- muscle groups
-- ---------------------------------------------------------------------------

insert into public.muscle_groups (name) values
  ('chest'), ('back'), ('quads'), ('hamstrings'), ('glutes'), ('biceps'),
  ('triceps'), ('shoulders'), ('calves'), ('abs'), ('forearms'), ('traps')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- stock exercises
-- ---------------------------------------------------------------------------

with ex (name, equipment_type, primary_mg, secondary_mg) as (
  values
    -- chest
    ('Barbell Bench Press', 'barbell', 'chest', 'triceps'),
    ('Incline Barbell Bench Press', 'barbell', 'chest', 'shoulders'),
    ('Dumbbell Bench Press', 'dumbbell', 'chest', 'triceps'),
    ('Incline Dumbbell Press', 'dumbbell', 'chest', 'shoulders'),
    ('Dumbbell Fly', 'dumbbell', 'chest', null),
    ('Cable Fly', 'cable', 'chest', null),
    ('Pec Deck', 'machine', 'chest', null),
    ('Machine Chest Press', 'machine', 'chest', 'triceps'),
    ('Smith Machine Bench Press', 'smith', 'chest', 'triceps'),
    ('Push-Up', 'bodyweight', 'chest', 'triceps'),
    ('Weighted Dip', 'bodyweight', 'chest', 'triceps'),
    -- back
    ('Deadlift', 'barbell', 'back', 'hamstrings'),
    ('Barbell Row', 'barbell', 'back', 'biceps'),
    ('Pendlay Row', 'barbell', 'back', 'biceps'),
    ('Dumbbell Row', 'dumbbell', 'back', 'biceps'),
    ('Chest-Supported Row', 'machine', 'back', 'biceps'),
    ('Seated Cable Row', 'cable', 'back', 'biceps'),
    ('Lat Pulldown', 'cable', 'back', 'biceps'),
    ('Pull-Up', 'bodyweight', 'back', 'biceps'),
    ('Chin-Up', 'bodyweight', 'back', 'biceps'),
    ('Straight-Arm Pulldown', 'cable', 'back', null),
    ('T-Bar Row', 'machine', 'back', 'biceps'),
    ('Rack Pull', 'barbell', 'back', 'traps'),
    -- quads
    ('Back Squat', 'barbell', 'quads', 'glutes'),
    ('Front Squat', 'barbell', 'quads', 'abs'),
    ('Leg Press', 'machine', 'quads', 'glutes'),
    ('Hack Squat', 'machine', 'quads', 'glutes'),
    ('Smith Machine Squat', 'smith', 'quads', 'glutes'),
    ('Leg Extension', 'machine', 'quads', null),
    ('Bulgarian Split Squat', 'dumbbell', 'quads', 'glutes'),
    ('Walking Lunge', 'dumbbell', 'quads', 'glutes'),
    ('Goblet Squat', 'dumbbell', 'quads', 'glutes'),
    -- hamstrings
    ('Romanian Deadlift', 'barbell', 'hamstrings', 'glutes'),
    ('Dumbbell Romanian Deadlift', 'dumbbell', 'hamstrings', 'glutes'),
    ('Seated Leg Curl', 'machine', 'hamstrings', null),
    ('Lying Leg Curl', 'machine', 'hamstrings', null),
    ('Nordic Curl', 'bodyweight', 'hamstrings', null),
    ('Good Morning', 'barbell', 'hamstrings', 'back'),
    -- glutes
    ('Barbell Hip Thrust', 'barbell', 'glutes', 'hamstrings'),
    ('Machine Hip Thrust', 'machine', 'glutes', 'hamstrings'),
    ('Cable Kickback', 'cable', 'glutes', null),
    ('Hip Abduction Machine', 'machine', 'glutes', null),
    ('Sumo Deadlift', 'barbell', 'glutes', 'hamstrings'),
    -- biceps
    ('Barbell Curl', 'barbell', 'biceps', 'forearms'),
    ('EZ-Bar Curl', 'barbell', 'biceps', 'forearms'),
    ('Dumbbell Curl', 'dumbbell', 'biceps', null),
    ('Hammer Curl', 'dumbbell', 'biceps', 'forearms'),
    ('Incline Dumbbell Curl', 'dumbbell', 'biceps', null),
    ('Cable Curl', 'cable', 'biceps', null),
    ('Preacher Curl', 'machine', 'biceps', null),
    -- triceps
    ('Cable Pushdown', 'cable', 'triceps', null),
    ('Overhead Cable Extension', 'cable', 'triceps', null),
    ('Skull Crusher', 'barbell', 'triceps', null),
    ('Dumbbell Overhead Extension', 'dumbbell', 'triceps', null),
    ('Close-Grip Bench Press', 'barbell', 'triceps', 'chest'),
    ('Machine Triceps Extension', 'machine', 'triceps', null),
    -- shoulders
    ('Overhead Press', 'barbell', 'shoulders', 'triceps'),
    ('Seated Dumbbell Press', 'dumbbell', 'shoulders', 'triceps'),
    ('Machine Shoulder Press', 'machine', 'shoulders', 'triceps'),
    ('Dumbbell Lateral Raise', 'dumbbell', 'shoulders', null),
    ('Cable Lateral Raise', 'cable', 'shoulders', null),
    ('Reverse Pec Deck', 'machine', 'shoulders', 'back'),
    ('Face Pull', 'cable', 'shoulders', 'traps'),
    ('Arnold Press', 'dumbbell', 'shoulders', 'triceps'),
    -- calves
    ('Standing Calf Raise', 'machine', 'calves', null),
    ('Seated Calf Raise', 'machine', 'calves', null),
    ('Smith Machine Calf Raise', 'smith', 'calves', null),
    ('Single-Leg Calf Raise', 'bodyweight', 'calves', null),
    -- abs
    ('Cable Crunch', 'cable', 'abs', null),
    ('Hanging Leg Raise', 'bodyweight', 'abs', null),
    ('Ab Wheel Rollout', 'other', 'abs', null),
    ('Plank', 'bodyweight', 'abs', null),
    ('Machine Crunch', 'machine', 'abs', null),
    ('Decline Sit-Up', 'bodyweight', 'abs', null),
    -- forearms
    ('Barbell Wrist Curl', 'barbell', 'forearms', null),
    ('Reverse Curl', 'barbell', 'forearms', 'biceps'),
    ('Farmer Carry', 'dumbbell', 'forearms', 'traps'),
    -- traps
    ('Barbell Shrug', 'barbell', 'traps', null),
    ('Dumbbell Shrug', 'dumbbell', 'traps', null),
    ('Cable Shrug', 'cable', 'traps', null)
),
inserted as (
  insert into public.exercises (user_id, name, equipment_type)
  select null, ex.name, ex.equipment_type from ex
  where not exists (
    select 1 from public.exercises e where e.name = ex.name and e.user_id is null
  )
  returning id, name
)
insert into public.exercise_muscle_groups (exercise_id, muscle_group_id, role)
select i.id, mg.id, r.role
from inserted i
join ex on ex.name = i.name
cross join lateral (
  values (ex.primary_mg, 'primary'), (ex.secondary_mg, 'secondary')
) as r (mg_name, role)
join public.muscle_groups mg on mg.name = r.mg_name
where r.mg_name is not null
on conflict (exercise_id, muscle_group_id) do nothing;

-- ---------------------------------------------------------------------------
-- stock templates
-- ---------------------------------------------------------------------------

create or replace function pg_temp.seed_template(
  p_name text,
  p_emphasis text,
  p_days int,
  p_description text,
  p_days_spec jsonb -- [{ "label": "...", "exercises": [{ "name": "...", "sets": 3, "reps": [8,12] }] }]
) returns void language plpgsql as $$
declare
  v_template_id uuid;
  v_day jsonb;
  v_day_id uuid;
  v_ex jsonb;
  v_day_number int := 0;
  v_position int;
  v_exercise_id uuid;
  v_mg_id uuid;
  v_group_id uuid;
  v_group_position int;
  v_slot int;
begin
  if exists (select 1 from public.templates where name = p_name and user_id is null) then
    return;
  end if;

  insert into public.templates (user_id, name, emphasis, intended_gender, days_per_week, description)
  values (null, p_name, p_emphasis, 'any', p_days, p_description)
  returning id into v_template_id;

  for v_day in select * from jsonb_array_elements(p_days_spec) loop
    v_day_number := v_day_number + 1;
    insert into public.template_days (template_id, day_number, label)
    values (v_template_id, v_day_number, v_day ->> 'label')
    returning id into v_day_id;

    v_position := 0;
    v_group_position := 0;
    for v_ex in select * from jsonb_array_elements(v_day -> 'exercises') loop
      v_position := v_position + 1;
      select id into v_exercise_id from public.exercises
      where name = v_ex ->> 'name' and user_id is null;
      if v_exercise_id is null then
        raise exception 'seed template references unknown exercise: %', v_ex ->> 'name';
      end if;

      -- groups-first shape: one template_day_group per primary muscle group,
      -- in first-appearance order; exercises slot into their group
      select emg.muscle_group_id into v_mg_id
      from public.exercise_muscle_groups emg
      where emg.exercise_id = v_exercise_id and emg.role = 'primary';

      select g.id into v_group_id from public.template_day_groups g
      where g.template_day_id = v_day_id and g.muscle_group_id = v_mg_id;
      if v_group_id is null then
        v_group_position := v_group_position + 1;
        insert into public.template_day_groups (template_day_id, muscle_group_id, position, exercise_slots)
        values (v_day_id, v_mg_id, v_group_position, 1)
        returning id into v_group_id;
        v_slot := 1;
      else
        update public.template_day_groups
        set exercise_slots = exercise_slots + 1
        where id = v_group_id
        returning exercise_slots into v_slot;
      end if;

      insert into public.template_exercises (template_day_id, template_day_group_id, slot_number, exercise_id, position, default_sets, default_rep_range)
      values (
        v_day_id, v_group_id, v_slot, v_exercise_id, v_position,
        coalesce((v_ex ->> 'sets')::int, 3),
        int4range((v_ex -> 'reps' ->> 0)::int, (v_ex -> 'reps' ->> 1)::int, '[]')
      );
    end loop;
  end loop;
end;
$$;

select pg_temp.seed_template(
  'Upper / Lower — 4 day', 'upper_lower', 4,
  'Balanced upper/lower split. Compound-led, moderate volume.',
  '[
    { "label": "Upper A", "exercises": [
      { "name": "Barbell Bench Press", "sets": 3, "reps": [6, 10] },
      { "name": "Barbell Row", "sets": 3, "reps": [6, 10] },
      { "name": "Seated Dumbbell Press", "sets": 3, "reps": [8, 12] },
      { "name": "Lat Pulldown", "sets": 3, "reps": [8, 12] },
      { "name": "Dumbbell Curl", "sets": 2, "reps": [10, 15] },
      { "name": "Cable Pushdown", "sets": 2, "reps": [10, 15] } ] },
    { "label": "Lower A", "exercises": [
      { "name": "Back Squat", "sets": 3, "reps": [5, 8] },
      { "name": "Romanian Deadlift", "sets": 3, "reps": [8, 12] },
      { "name": "Leg Press", "sets": 3, "reps": [10, 15] },
      { "name": "Seated Leg Curl", "sets": 2, "reps": [10, 15] },
      { "name": "Standing Calf Raise", "sets": 3, "reps": [10, 15] },
      { "name": "Cable Crunch", "sets": 3, "reps": [10, 15] } ] },
    { "label": "Upper B", "exercises": [
      { "name": "Overhead Press", "sets": 3, "reps": [6, 10] },
      { "name": "Pull-Up", "sets": 3, "reps": [6, 10] },
      { "name": "Incline Dumbbell Press", "sets": 3, "reps": [8, 12] },
      { "name": "Seated Cable Row", "sets": 3, "reps": [8, 12] },
      { "name": "Dumbbell Lateral Raise", "sets": 3, "reps": [12, 20] },
      { "name": "Hammer Curl", "sets": 2, "reps": [10, 15] } ] },
    { "label": "Lower B", "exercises": [
      { "name": "Deadlift", "sets": 3, "reps": [4, 6] },
      { "name": "Hack Squat", "sets": 3, "reps": [8, 12] },
      { "name": "Bulgarian Split Squat", "sets": 2, "reps": [8, 12] },
      { "name": "Lying Leg Curl", "sets": 2, "reps": [10, 15] },
      { "name": "Seated Calf Raise", "sets": 3, "reps": [12, 20] },
      { "name": "Hanging Leg Raise", "sets": 3, "reps": [8, 15] } ] }
  ]'::jsonb
);

select pg_temp.seed_template(
  'Push / Pull / Legs — 6 day', 'push_pull_legs', 6,
  'High-frequency PPL for intermediate and advanced lifters.',
  '[
    { "label": "Push A", "exercises": [
      { "name": "Barbell Bench Press", "sets": 3, "reps": [6, 10] },
      { "name": "Seated Dumbbell Press", "sets": 3, "reps": [8, 12] },
      { "name": "Cable Fly", "sets": 3, "reps": [10, 15] },
      { "name": "Dumbbell Lateral Raise", "sets": 3, "reps": [12, 20] },
      { "name": "Cable Pushdown", "sets": 3, "reps": [10, 15] } ] },
    { "label": "Pull A", "exercises": [
      { "name": "Barbell Row", "sets": 3, "reps": [6, 10] },
      { "name": "Lat Pulldown", "sets": 3, "reps": [8, 12] },
      { "name": "Face Pull", "sets": 3, "reps": [12, 20] },
      { "name": "Barbell Curl", "sets": 3, "reps": [8, 12] },
      { "name": "Barbell Shrug", "sets": 3, "reps": [10, 15] } ] },
    { "label": "Legs A", "exercises": [
      { "name": "Back Squat", "sets": 3, "reps": [5, 8] },
      { "name": "Romanian Deadlift", "sets": 3, "reps": [8, 12] },
      { "name": "Leg Press", "sets": 3, "reps": [10, 15] },
      { "name": "Seated Leg Curl", "sets": 2, "reps": [10, 15] },
      { "name": "Standing Calf Raise", "sets": 4, "reps": [10, 15] } ] },
    { "label": "Push B", "exercises": [
      { "name": "Overhead Press", "sets": 3, "reps": [6, 10] },
      { "name": "Incline Dumbbell Press", "sets": 3, "reps": [8, 12] },
      { "name": "Weighted Dip", "sets": 3, "reps": [8, 12] },
      { "name": "Cable Lateral Raise", "sets": 3, "reps": [12, 20] },
      { "name": "Overhead Cable Extension", "sets": 3, "reps": [10, 15] } ] },
    { "label": "Pull B", "exercises": [
      { "name": "Pull-Up", "sets": 3, "reps": [6, 10] },
      { "name": "Seated Cable Row", "sets": 3, "reps": [8, 12] },
      { "name": "Reverse Pec Deck", "sets": 3, "reps": [12, 20] },
      { "name": "Incline Dumbbell Curl", "sets": 3, "reps": [10, 15] },
      { "name": "Hammer Curl", "sets": 2, "reps": [10, 15] } ] },
    { "label": "Legs B", "exercises": [
      { "name": "Deadlift", "sets": 3, "reps": [4, 6] },
      { "name": "Hack Squat", "sets": 3, "reps": [8, 12] },
      { "name": "Walking Lunge", "sets": 2, "reps": [10, 15] },
      { "name": "Lying Leg Curl", "sets": 2, "reps": [10, 15] },
      { "name": "Seated Calf Raise", "sets": 4, "reps": [12, 20] } ] }
  ]'::jsonb
);

select pg_temp.seed_template(
  'Full Body — 3 day', 'full_body', 3,
  'Three full-body sessions. Good for beginners and time-constrained lifters.',
  '[
    { "label": "Day 1", "exercises": [
      { "name": "Back Squat", "sets": 3, "reps": [5, 8] },
      { "name": "Barbell Bench Press", "sets": 3, "reps": [6, 10] },
      { "name": "Barbell Row", "sets": 3, "reps": [6, 10] },
      { "name": "Standing Calf Raise", "sets": 3, "reps": [10, 15] },
      { "name": "Cable Crunch", "sets": 3, "reps": [10, 15] } ] },
    { "label": "Day 2", "exercises": [
      { "name": "Deadlift", "sets": 3, "reps": [4, 6] },
      { "name": "Overhead Press", "sets": 3, "reps": [6, 10] },
      { "name": "Lat Pulldown", "sets": 3, "reps": [8, 12] },
      { "name": "Dumbbell Curl", "sets": 2, "reps": [10, 15] },
      { "name": "Cable Pushdown", "sets": 2, "reps": [10, 15] } ] },
    { "label": "Day 3", "exercises": [
      { "name": "Leg Press", "sets": 3, "reps": [10, 15] },
      { "name": "Incline Dumbbell Press", "sets": 3, "reps": [8, 12] },
      { "name": "Seated Cable Row", "sets": 3, "reps": [8, 12] },
      { "name": "Romanian Deadlift", "sets": 3, "reps": [8, 12] },
      { "name": "Dumbbell Lateral Raise", "sets": 3, "reps": [12, 20] } ] }
  ]'::jsonb
);

select pg_temp.seed_template(
  'Glute Emphasis — 4 day', 'lower', 4,
  'Lower-biased split with glute emphasis; upper maintenance volume.',
  '[
    { "label": "Glutes & Quads", "exercises": [
      { "name": "Barbell Hip Thrust", "sets": 3, "reps": [8, 12] },
      { "name": "Back Squat", "sets": 3, "reps": [5, 8] },
      { "name": "Walking Lunge", "sets": 2, "reps": [10, 15] },
      { "name": "Hip Abduction Machine", "sets": 3, "reps": [12, 20] },
      { "name": "Standing Calf Raise", "sets": 3, "reps": [10, 15] } ] },
    { "label": "Upper", "exercises": [
      { "name": "Dumbbell Bench Press", "sets": 3, "reps": [8, 12] },
      { "name": "Lat Pulldown", "sets": 3, "reps": [8, 12] },
      { "name": "Seated Dumbbell Press", "sets": 3, "reps": [8, 12] },
      { "name": "Seated Cable Row", "sets": 3, "reps": [8, 12] },
      { "name": "Dumbbell Lateral Raise", "sets": 2, "reps": [12, 20] } ] },
    { "label": "Glutes & Hamstrings", "exercises": [
      { "name": "Sumo Deadlift", "sets": 3, "reps": [4, 6] },
      { "name": "Romanian Deadlift", "sets": 3, "reps": [8, 12] },
      { "name": "Machine Hip Thrust", "sets": 3, "reps": [10, 15] },
      { "name": "Seated Leg Curl", "sets": 3, "reps": [10, 15] },
      { "name": "Cable Kickback", "sets": 2, "reps": [12, 20] } ] },
    { "label": "Full Body", "exercises": [
      { "name": "Leg Press", "sets": 3, "reps": [10, 15] },
      { "name": "Incline Dumbbell Press", "sets": 3, "reps": [8, 12] },
      { "name": "Chest-Supported Row", "sets": 3, "reps": [8, 12] },
      { "name": "Bulgarian Split Squat", "sets": 2, "reps": [8, 12] },
      { "name": "Cable Crunch", "sets": 3, "reps": [10, 15] } ] }
  ]'::jsonb
);

-- ---------------------------------------------------------------------------
-- groups-first backfill for stock templates seeded before the pivot shape:
-- derive template_day_groups from each exercise's primary muscle group and
-- link the exercises. Idempotent — only touches unlinked stock rows.
-- ---------------------------------------------------------------------------

do $$
declare
  v_row record;
  v_group_id uuid;
  v_slot int;
begin
  for v_row in
    select te.id as te_id, te.template_day_id, emg.muscle_group_id
    from public.template_exercises te
    join public.template_days td on td.id = te.template_day_id
    join public.templates t on t.id = td.template_id
    join public.exercise_muscle_groups emg
      on emg.exercise_id = te.exercise_id and emg.role = 'primary'
    where t.user_id is null and te.template_day_group_id is null
    order by te.template_day_id, te.position
  loop
    select g.id into v_group_id from public.template_day_groups g
    where g.template_day_id = v_row.template_day_id
      and g.muscle_group_id = v_row.muscle_group_id;
    if v_group_id is null then
      insert into public.template_day_groups (template_day_id, muscle_group_id, position, exercise_slots)
      values (
        v_row.template_day_id,
        v_row.muscle_group_id,
        coalesce((select max(position) from public.template_day_groups
                  where template_day_id = v_row.template_day_id), 0) + 1,
        1
      )
      returning id into v_group_id;
      v_slot := 1;
    else
      update public.template_day_groups
      set exercise_slots = exercise_slots + 1
      where id = v_group_id
      returning exercise_slots into v_slot;
    end if;

    update public.template_exercises
    set template_day_group_id = v_group_id, slot_number = v_slot
    where id = v_row.te_id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- default engine params (version 2) — mirrors src/lib/engine/params.ts
-- (version 1 is historical; migration 20260613000001 owns the v2 row on
-- existing databases, so this insert is guarded)
-- ---------------------------------------------------------------------------

insert into public.engine_params (version, params, is_active, notes)
select 2, '{
  "increment": {
    "barbell": { "kg": 2.5, "lb": 5 },
    "smith": { "kg": 2.5, "lb": 5 },
    "dumbbell": { "kg": 2.0, "lb": 5 },
    "machine": { "kg": 2.5, "lb": 5 },
    "cable": { "kg": 2.5, "lb": 5 },
    "bodyweight": { "kg": 2.5, "lb": 5 },
    "bands": { "kg": 5.0, "lb": 10 },
    "kettlebell": { "kg": 4.0, "lb": 9 },
    "other": { "kg": 2.5, "lb": 5 }
  },
  "experience_increment_scale": {
    "beginner": 1.5,
    "intermediate": 1.0,
    "advanced": 0.5
  },
  "progression_style": {
    "gain": "load_first",
    "cut": "hold",
    "maintain": "hold"
  },
  "small_miss_reps": 2,
  "regression_pct": 0.9,
  "pain_gate": 2,
  "workload_high": 8,
  "workload_low": 3,
  "set_add_pump_min": 6,
  "pump_low": 2,
  "min_sets": 2,
  "max_sets_per_exercise": 6,
  "mg_set_ceiling": 20,
  "session_fatigue_dampen_threshold": 3,
  "session_performance_dampen_threshold": 1,
  "deload": { "load_pct": 0.55, "set_pct": 0.5, "target_rir": 4 },
  "meso_seed_backoff_pct": 0.925,
  "rounding": {
    "barbell": { "kg": 2.5, "lb": 5 },
    "smith": { "kg": 2.5, "lb": 5 },
    "dumbbell": { "kg": 2.0, "lb": 5 },
    "machine": { "kg": 2.5, "lb": 5 },
    "cable": { "kg": 2.5, "lb": 5 },
    "bodyweight": { "kg": 2.5, "lb": 5 },
    "bands": { "kg": 5.0, "lb": 10 },
    "kettlebell": { "kg": 4.0, "lb": 9 },
    "other": { "kg": 2.5, "lb": 5 }
  }
}'::jsonb, false, 'v2 — pivot feedback re-alignment (pump/workload 0-10), per-equipment per-unit increments incl. bands/kettlebell'
where not exists (select 1 from public.engine_params where version = 2);

-- ---------------------------------------------------------------------------
-- default engine params (version 3, active) — adds the metric blocks
-- (e1rm, macro_target, phase_plan, key_lifts; 10-metrics-spec.md §8).
-- Migration 20260614000001 owns the v3 row on existing databases; this guarded
-- insert covers a fresh seed. Mirrors src/lib/engine/params.ts defaults.
-- ---------------------------------------------------------------------------

update public.engine_params set is_active = false where version < 3 and is_active;

insert into public.engine_params (version, params, is_active, notes)
select 3, '{
  "increment": {
    "barbell": { "kg": 2.5, "lb": 5 },
    "smith": { "kg": 2.5, "lb": 5 },
    "dumbbell": { "kg": 2.0, "lb": 5 },
    "machine": { "kg": 2.5, "lb": 5 },
    "cable": { "kg": 2.5, "lb": 5 },
    "bodyweight": { "kg": 2.5, "lb": 5 },
    "bands": { "kg": 5.0, "lb": 10 },
    "kettlebell": { "kg": 4.0, "lb": 9 },
    "other": { "kg": 2.5, "lb": 5 }
  },
  "experience_increment_scale": {
    "beginner": 1.5,
    "intermediate": 1.0,
    "advanced": 0.5
  },
  "progression_style": {
    "gain": "load_first",
    "cut": "hold",
    "maintain": "hold"
  },
  "small_miss_reps": 2,
  "regression_pct": 0.9,
  "pain_gate": 2,
  "workload_high": 8,
  "workload_low": 3,
  "set_add_pump_min": 6,
  "pump_low": 2,
  "min_sets": 2,
  "max_sets_per_exercise": 6,
  "mg_set_ceiling": 20,
  "session_fatigue_dampen_threshold": 3,
  "session_performance_dampen_threshold": 1,
  "deload": { "load_pct": 0.55, "set_pct": 0.5, "target_rir": 4 },
  "meso_seed_backoff_pct": 0.925,
  "rounding": {
    "barbell": { "kg": 2.5, "lb": 5 },
    "smith": { "kg": 2.5, "lb": 5 },
    "dumbbell": { "kg": 2.0, "lb": 5 },
    "machine": { "kg": 2.5, "lb": 5 },
    "cable": { "kg": 2.5, "lb": 5 },
    "bodyweight": { "kg": 2.5, "lb": 5 },
    "bands": { "kg": 5.0, "lb": 10 },
    "kettlebell": { "kg": 4.0, "lb": 9 },
    "other": { "kg": 2.5, "lb": 5 }
  },
  "e1rm": {
    "rir_offset": 1.0,
    "high_max_eff_reps": 8,
    "mod_max_eff_reps": 12,
    "high_max_rir": 2,
    "mod_max_rir": 3
  },
  "macro_target": {
    "sex_factor_female": 0.5,
    "career_cap_lb": { "male": 40, "female": 20 },
    "career_tau_years": 3,
    "hypertrophy_pct_bw_month": { "beginner": [1.0, 1.5], "intermediate": [0.5, 1.0], "advanced": [0.25, 0.5] },
    "strength_pct_month": { "beginner": [4, 8], "intermediate": [1.5, 3], "advanced": [0.5, 1.5] },
    "strength_cap_total_pct": { "beginner": 60, "intermediate": 30, "advanced": 15 },
    "cut_pct_bw_week": { "high_bf": [1.0, 1.5], "average": [0.5, 1.0], "lean": [0.25, 0.5] },
    "cut_bmi_high": 27,
    "cut_bmi_lean": 22,
    "age_taper": true,
    "age_taper_start": 40,
    "age_taper_per_year": 0.02,
    "age_taper_floor": 0.6,
    "recommend_target_lb": { "male": 8, "female": 4 },
    "recommend_strength_total_pct": 10,
    "recommend_cut_bw_pct": 8,
    "recommend_min_months": 2,
    "recommend_max_months": 12,
    "present": "conservative_end"
  },
  "phase_plan": { "order": ["accumulation", "intensification", "peak"], "accumulation_fraction": 0.6 },
  "key_lifts": { "n": 5, "selection": "frequency" }
}'::jsonb, false, 'v3 — metric defaults: e1RM, macro_target (planMacrocycle), phase_plan, key_lifts (10-metrics-spec.md)'
where not exists (select 1 from public.engine_params where version = 3);

-- ---------------------------------------------------------------------------
-- default engine params (version 4, active) — macrocycle-target fix
-- (10-metrics-spec.md §5): hypertrophy rate decays continuously with training
-- age (replaces the discrete buckets + hard career-cap clamp that flattened
-- the per-macro target across durations); cut compounds + is %BW-capped.
-- Migration 20260614000003 owns the v4 row on existing databases.
-- ---------------------------------------------------------------------------

update public.engine_params set is_active = false where version < 4 and is_active;

insert into public.engine_params (version, params, is_active, notes)
select 4, '{
  "increment": {
    "barbell": { "kg": 2.5, "lb": 5 },
    "smith": { "kg": 2.5, "lb": 5 },
    "dumbbell": { "kg": 2.0, "lb": 5 },
    "machine": { "kg": 2.5, "lb": 5 },
    "cable": { "kg": 2.5, "lb": 5 },
    "bodyweight": { "kg": 2.5, "lb": 5 },
    "bands": { "kg": 5.0, "lb": 10 },
    "kettlebell": { "kg": 4.0, "lb": 9 },
    "other": { "kg": 2.5, "lb": 5 }
  },
  "experience_increment_scale": {
    "beginner": 1.5,
    "intermediate": 1.0,
    "advanced": 0.5
  },
  "progression_style": {
    "gain": "load_first",
    "cut": "hold",
    "maintain": "hold"
  },
  "small_miss_reps": 2,
  "regression_pct": 0.9,
  "pain_gate": 2,
  "workload_high": 8,
  "workload_low": 3,
  "set_add_pump_min": 6,
  "pump_low": 2,
  "min_sets": 2,
  "max_sets_per_exercise": 6,
  "mg_set_ceiling": 20,
  "session_fatigue_dampen_threshold": 3,
  "session_performance_dampen_threshold": 1,
  "deload": { "load_pct": 0.55, "set_pct": 0.5, "target_rir": 4 },
  "meso_seed_backoff_pct": 0.925,
  "rounding": {
    "barbell": { "kg": 2.5, "lb": 5 },
    "smith": { "kg": 2.5, "lb": 5 },
    "dumbbell": { "kg": 2.0, "lb": 5 },
    "machine": { "kg": 2.5, "lb": 5 },
    "cable": { "kg": 2.5, "lb": 5 },
    "bodyweight": { "kg": 2.5, "lb": 5 },
    "bands": { "kg": 5.0, "lb": 10 },
    "kettlebell": { "kg": 4.0, "lb": 9 },
    "other": { "kg": 2.5, "lb": 5 }
  },
  "e1rm": {
    "rir_offset": 1.0,
    "high_max_eff_reps": 8,
    "mod_max_eff_reps": 12,
    "high_max_rir": 2,
    "mod_max_rir": 3
  },
  "macro_target": {
    "sex_factor_female": 0.5,
    "hypertrophy_base_pct_bw_month": { "low": 1.0, "high": 1.5 },
    "hypertrophy_decay_tau_years": 5,
    "career_cap_lb": { "male": 40, "female": 20 },
    "career_tau_years": 3,
    "hypertrophy_pct_bw_month": { "beginner": [1.0, 1.5], "intermediate": [0.5, 1.0], "advanced": [0.25, 0.5] },
    "strength_pct_month": { "beginner": [4, 8], "intermediate": [1.5, 3], "advanced": [0.5, 1.5] },
    "strength_cap_total_pct": { "beginner": 60, "intermediate": 30, "advanced": 15 },
    "cut_pct_bw_week": { "high_bf": [1.0, 1.5], "average": [0.5, 1.0], "lean": [0.25, 0.5] },
    "cut_bmi_high": 27,
    "cut_bmi_lean": 22,
    "cut_cap_pct_bw": 0.25,
    "age_taper": true,
    "age_taper_start": 40,
    "age_taper_per_year": 0.02,
    "age_taper_floor": 0.6,
    "recommend_target_lb": { "male": 8, "female": 4 },
    "recommend_strength_total_pct": 10,
    "recommend_cut_bw_pct": 8,
    "recommend_min_months": 2,
    "recommend_max_months": 12,
    "present": "conservative_end"
  },
  "phase_plan": { "order": ["accumulation", "intensification", "peak"], "accumulation_fraction": 0.6 },
  "key_lifts": { "n": 5, "selection": "frequency" }
}'::jsonb, false, 'v4 — macro-target fix: continuous training-age hypertrophy decay + compounding/capped cut (10-metrics-spec.md §5)'
where not exists (select 1 from public.engine_params where version = 4);

-- ---------------------------------------------------------------------------
-- default engine params (version 5, active) — FFMI proximity-to-potential
-- hypertrophy model + body-fat cut bands; sex factor 0.5->0.7 (10-spec §5).
-- Migration 20260615000001 owns the v5 row on existing databases.
-- ---------------------------------------------------------------------------

update public.engine_params set is_active = false where version < 5 and is_active;

insert into public.engine_params (version, params, is_active, notes)
select 5, '{
  "increment": { "barbell": { "kg": 2.5, "lb": 5 }, "smith": { "kg": 2.5, "lb": 5 }, "dumbbell": { "kg": 2.0, "lb": 5 }, "machine": { "kg": 2.5, "lb": 5 }, "cable": { "kg": 2.5, "lb": 5 }, "bodyweight": { "kg": 2.5, "lb": 5 }, "bands": { "kg": 5.0, "lb": 10 }, "kettlebell": { "kg": 4.0, "lb": 9 }, "other": { "kg": 2.5, "lb": 5 } },
  "experience_increment_scale": { "beginner": 1.5, "intermediate": 1.0, "advanced": 0.5 },
  "progression_style": { "gain": "load_first", "cut": "hold", "maintain": "hold" },
  "small_miss_reps": 2, "regression_pct": 0.9, "pain_gate": 2, "workload_high": 8, "workload_low": 3, "set_add_pump_min": 6, "pump_low": 2, "min_sets": 2, "max_sets_per_exercise": 6, "mg_set_ceiling": 20, "session_fatigue_dampen_threshold": 3, "session_performance_dampen_threshold": 1,
  "deload": { "load_pct": 0.55, "set_pct": 0.5, "target_rir": 4 }, "meso_seed_backoff_pct": 0.925,
  "rounding": { "barbell": { "kg": 2.5, "lb": 5 }, "smith": { "kg": 2.5, "lb": 5 }, "dumbbell": { "kg": 2.0, "lb": 5 }, "machine": { "kg": 2.5, "lb": 5 }, "cable": { "kg": 2.5, "lb": 5 }, "bodyweight": { "kg": 2.5, "lb": 5 }, "bands": { "kg": 5.0, "lb": 10 }, "kettlebell": { "kg": 4.0, "lb": 9 }, "other": { "kg": 2.5, "lb": 5 } },
  "e1rm": { "rir_offset": 1.0, "high_max_eff_reps": 8, "mod_max_eff_reps": 12, "high_max_rir": 2, "mod_max_rir": 3 },
  "macro_target": {
    "sex_factor_female": 0.7,
    "hypertrophy_base_pct_bw_month": { "low": 1.0, "high": 1.5 },
    "hypertrophy_decay_tau_years": 5,
    "hypertrophy_floor_pct_bw_month": { "low": 0.04, "high": 0.09 },
    "ffmi_ceiling": { "male": 25, "female": 21.5 },
    "ffmi_untrained": { "male": 18.5, "female": 14.5 },
    "proximity_macro_cap_frac": 0.6,
    "cut_bf_thresholds": { "male": { "high": 20, "lean": 12 }, "female": { "high": 30, "lean": 22 } },
    "career_cap_lb": { "male": 40, "female": 20 },
    "career_tau_years": 3,
    "hypertrophy_pct_bw_month": { "beginner": [1.0, 1.5], "intermediate": [0.5, 1.0], "advanced": [0.25, 0.5] },
    "strength_pct_month": { "beginner": [4, 8], "intermediate": [1.5, 3], "advanced": [0.5, 1.5] },
    "strength_cap_total_pct": { "beginner": 60, "intermediate": 30, "advanced": 15 },
    "cut_pct_bw_week": { "high_bf": [1.0, 1.5], "average": [0.5, 1.0], "lean": [0.25, 0.5] },
    "cut_bmi_high": 27, "cut_bmi_lean": 22, "cut_cap_pct_bw": 0.25,
    "age_taper": true, "age_taper_start": 40, "age_taper_per_year": 0.02, "age_taper_floor": 0.6,
    "recommend_target_lb": { "male": 8, "female": 4 }, "recommend_strength_total_pct": 10, "recommend_cut_bw_pct": 8, "recommend_min_months": 2, "recommend_max_months": 12, "present": "conservative_end"
  },
  "phase_plan": { "order": ["accumulation", "intensification", "peak"], "accumulation_fraction": 0.6 },
  "key_lifts": { "n": 5, "selection": "frequency" }
}'::jsonb, true, 'v5 — FFMI proximity-to-potential hypertrophy + body-fat cut bands; sex factor 0.7 (10-metrics-spec.md §5)'
where not exists (select 1 from public.engine_params where version = 5);
