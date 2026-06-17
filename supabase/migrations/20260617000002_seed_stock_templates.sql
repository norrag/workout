-- ---------------------------------------------------------------------------
-- Seed stock templates (templates.user_id = null) — a starter library spanning
-- a range of splits, day counts, and intended audiences. Each is fully
-- structured in the groups-first shape (template_days → template_day_groups →
-- template_exercises) so it opens the planner board prefilled (08 §4, fig 3.3).
--
-- template_day_groups is unique on (day, muscle_group), so a day trains each
-- muscle group once; multiple movements for a group are ordered slots within it.
-- Exercises are resolved by name against the stock library and disambiguated by
-- the slot's muscle group (so a duplicate display name like "Hack Squat" lands
-- on the intended movement). The whole seed is guarded so re-running is a no-op.
-- ---------------------------------------------------------------------------

-- group helper: create a template_day_group for a muscle group (by name)
create function pg_temp.seed_group(p_day uuid, p_mg text, p_pos int, p_slots int)
returns uuid language plpgsql as $$
declare gid uuid; mgid uuid;
begin
  select id into mgid from public.muscle_groups where lower(name) = lower(p_mg);
  if mgid is null then
    raise exception 'muscle group not found: %', p_mg;
  end if;
  insert into public.template_day_groups
    (template_day_id, muscle_group_id, position, exercise_slots)
  values (p_day, mgid, p_pos, p_slots)
  returning id into gid;
  return gid;
end $$;

-- exercise helper: fill one slot, matching the exercise to the group's muscle
-- group (resolves duplicate names) and requiring a stock (user_id null) match
create function pg_temp.seed_ex(p_group uuid, p_ex text, p_slot int, p_sets int)
returns void language plpgsql as $$
declare exid uuid; dayid uuid; mgid uuid;
begin
  select template_day_id, muscle_group_id into dayid, mgid
    from public.template_day_groups where id = p_group;
  select e.id into exid
    from public.exercises e
    join public.exercise_muscle_groups emg
      on emg.exercise_id = e.id and emg.role = 'primary'
    where e.name = p_ex and e.user_id is null and emg.muscle_group_id = mgid
    order by e.id
    limit 1;
  if exid is null then
    raise exception 'stock exercise not found for muscle group: %', p_ex;
  end if;
  insert into public.template_exercises
    (template_day_id, template_day_group_id, exercise_id, position, slot_number, default_sets)
  values (dayid, p_group, exid, p_slot, p_slot, p_sets);
end $$;

do $$
declare tid uuid; d uuid; g uuid;
begin
  -- idempotency guard: skip if the library has already been seeded
  if exists (
    select 1 from public.templates
    where user_id is null and name = 'Full Body Foundations'
  ) then
    return;
  end if;

  -- =====================================================================
  -- 1. Full Body Foundations — full_body · any · 3 day
  -- =====================================================================
  insert into public.templates (user_id, name, emphasis, intended_gender, days_per_week, description)
  values (null, 'Full Body Foundations', 'full_body', 'any', 3,
    'A balanced three-day full-body plan — every major muscle trained three times a week. A strong starting point for beginners and anyone on a tight schedule.')
  returning id into tid;

  insert into public.template_days (template_id, day_number, label) values (tid, 1, 'Full Body A') returning id into d;
  g := pg_temp.seed_group(d, 'quads', 1, 1);     perform pg_temp.seed_ex(g, 'Barbell Squat (High Bar)', 1, 3);
  g := pg_temp.seed_group(d, 'chest', 2, 1);     perform pg_temp.seed_ex(g, 'Bench Press (Medium Grip)', 1, 3);
  g := pg_temp.seed_group(d, 'back', 3, 1);      perform pg_temp.seed_ex(g, 'Pulldown (Wide Grip)', 1, 3);
  g := pg_temp.seed_group(d, 'hamstrings', 4, 1);perform pg_temp.seed_ex(g, 'Lying Leg Curl', 1, 3);
  g := pg_temp.seed_group(d, 'shoulders', 5, 1); perform pg_temp.seed_ex(g, 'Dumbbell Lateral Raise', 1, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 2, 'Full Body B') returning id into d;
  g := pg_temp.seed_group(d, 'glutes', 1, 1);    perform pg_temp.seed_ex(g, 'Barbell Hip Thrust', 1, 3);
  g := pg_temp.seed_group(d, 'back', 2, 1);      perform pg_temp.seed_ex(g, 'Seated Cable Row', 1, 3);
  g := pg_temp.seed_group(d, 'chest', 3, 1);     perform pg_temp.seed_ex(g, 'Dumbbell Press (Low Incline)', 1, 3);
  g := pg_temp.seed_group(d, 'triceps', 4, 1);   perform pg_temp.seed_ex(g, 'Cable Triceps Pushdown (Rope)', 1, 3);
  g := pg_temp.seed_group(d, 'biceps', 5, 1);    perform pg_temp.seed_ex(g, 'EZ Bar Curl (Normal Grip)', 1, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 3, 'Full Body C') returning id into d;
  g := pg_temp.seed_group(d, 'quads', 1, 1);     perform pg_temp.seed_ex(g, 'Leg Press', 1, 3);
  g := pg_temp.seed_group(d, 'back', 2, 1);      perform pg_temp.seed_ex(g, 'Pullup (Normal Grip)', 1, 3);
  g := pg_temp.seed_group(d, 'shoulders', 3, 1); perform pg_temp.seed_ex(g, 'Machine Shoulder Press', 1, 3);
  g := pg_temp.seed_group(d, 'hamstrings', 4, 1);perform pg_temp.seed_ex(g, 'Seated Leg Curl', 1, 3);
  g := pg_temp.seed_group(d, 'calves', 5, 1);    perform pg_temp.seed_ex(g, 'Standing Calf Raise', 1, 3);

  -- =====================================================================
  -- 2. Upper / Lower Split — upper_lower · any · 4 day
  -- =====================================================================
  insert into public.templates (user_id, name, emphasis, intended_gender, days_per_week, description)
  values (null, 'Upper / Lower Split', 'upper_lower', 'any', 4,
    'Four days alternating upper- and lower-body sessions. Each region is trained twice a week, with room for more volume per muscle than a full-body plan.')
  returning id into tid;

  insert into public.template_days (template_id, day_number, label) values (tid, 1, 'Upper A') returning id into d;
  g := pg_temp.seed_group(d, 'chest', 1, 1);     perform pg_temp.seed_ex(g, 'Bench Press (Medium Grip)', 1, 3);
  g := pg_temp.seed_group(d, 'back', 2, 1);      perform pg_temp.seed_ex(g, 'Barbell Bent Over Row', 1, 3);
  g := pg_temp.seed_group(d, 'shoulders', 3, 1); perform pg_temp.seed_ex(g, 'Dumbbell Lateral Raise', 1, 3);
  g := pg_temp.seed_group(d, 'triceps', 4, 1);   perform pg_temp.seed_ex(g, 'Cable Triceps Pushdown (Bar)', 1, 3);
  g := pg_temp.seed_group(d, 'biceps', 5, 1);    perform pg_temp.seed_ex(g, 'Dumbbell Curl (2-Arm)', 1, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 2, 'Lower A') returning id into d;
  g := pg_temp.seed_group(d, 'quads', 1, 1);     perform pg_temp.seed_ex(g, 'Barbell Squat (High Bar)', 1, 3);
  g := pg_temp.seed_group(d, 'hamstrings', 2, 1);perform pg_temp.seed_ex(g, 'Lying Leg Curl', 1, 3);
  g := pg_temp.seed_group(d, 'glutes', 3, 1);    perform pg_temp.seed_ex(g, 'Barbell Hip Thrust', 1, 3);
  g := pg_temp.seed_group(d, 'calves', 4, 1);    perform pg_temp.seed_ex(g, 'Standing Calf Raise', 1, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 3, 'Upper B') returning id into d;
  g := pg_temp.seed_group(d, 'back', 1, 1);      perform pg_temp.seed_ex(g, 'Pulldown (Wide Grip)', 1, 3);
  g := pg_temp.seed_group(d, 'chest', 2, 1);     perform pg_temp.seed_ex(g, 'Dumbbell Press (Low Incline)', 1, 3);
  g := pg_temp.seed_group(d, 'shoulders', 3, 1); perform pg_temp.seed_ex(g, 'Machine Shoulder Press', 1, 3);
  g := pg_temp.seed_group(d, 'biceps', 4, 1);    perform pg_temp.seed_ex(g, 'Cable Curl', 1, 3);
  g := pg_temp.seed_group(d, 'triceps', 5, 1);   perform pg_temp.seed_ex(g, 'EZ Bar Skullcrusher', 1, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 4, 'Lower B') returning id into d;
  g := pg_temp.seed_group(d, 'glutes', 1, 1);    perform pg_temp.seed_ex(g, 'Deadlift', 1, 3);
  g := pg_temp.seed_group(d, 'quads', 2, 1);     perform pg_temp.seed_ex(g, 'Leg Press', 1, 3);
  g := pg_temp.seed_group(d, 'hamstrings', 3, 1);perform pg_temp.seed_ex(g, 'Seated Leg Curl', 1, 3);
  g := pg_temp.seed_group(d, 'calves', 4, 1);    perform pg_temp.seed_ex(g, 'Calf Raise - Seated', 1, 3);

  -- =====================================================================
  -- 3. Push Pull Legs (6-Day) — push_pull_legs · male · 6 day
  -- =====================================================================
  insert into public.templates (user_id, name, emphasis, intended_gender, days_per_week, description)
  values (null, 'Push Pull Legs (6-Day)', 'push_pull_legs', 'male', 6,
    'The classic six-day push/pull/legs rotation run twice through the week. High frequency and volume for intermediate and advanced lifters.')
  returning id into tid;

  insert into public.template_days (template_id, day_number, label) values (tid, 1, 'Push A') returning id into d;
  g := pg_temp.seed_group(d, 'chest', 1, 2);
    perform pg_temp.seed_ex(g, 'Bench Press (Medium Grip)', 1, 3);
    perform pg_temp.seed_ex(g, 'Cable Flye (High)', 2, 3);
  g := pg_temp.seed_group(d, 'shoulders', 2, 2);
    perform pg_temp.seed_ex(g, 'Machine Shoulder Press', 1, 3);
    perform pg_temp.seed_ex(g, 'Dumbbell Lateral Raise', 2, 3);
  g := pg_temp.seed_group(d, 'triceps', 3, 1);  perform pg_temp.seed_ex(g, 'Cable Triceps Pushdown (Rope)', 1, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 2, 'Pull A') returning id into d;
  g := pg_temp.seed_group(d, 'back', 1, 2);
    perform pg_temp.seed_ex(g, 'Pullup (Normal Grip)', 1, 3);
    perform pg_temp.seed_ex(g, 'Seated Cable Row', 2, 3);
  g := pg_temp.seed_group(d, 'shoulders', 2, 1);perform pg_temp.seed_ex(g, 'Cable Rope Facepull', 1, 3);
  g := pg_temp.seed_group(d, 'biceps', 3, 2);
    perform pg_temp.seed_ex(g, 'EZ Bar Curl (Normal Grip)', 1, 3);
    perform pg_temp.seed_ex(g, 'Hammer Curl', 2, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 3, 'Legs A') returning id into d;
  g := pg_temp.seed_group(d, 'quads', 1, 2);
    perform pg_temp.seed_ex(g, 'Barbell Squat (High Bar)', 1, 3);
    perform pg_temp.seed_ex(g, 'Leg Press', 2, 3);
  g := pg_temp.seed_group(d, 'hamstrings', 2, 1);perform pg_temp.seed_ex(g, 'Lying Leg Curl', 1, 3);
  g := pg_temp.seed_group(d, 'glutes', 3, 1);    perform pg_temp.seed_ex(g, 'Barbell Hip Thrust', 1, 3);
  g := pg_temp.seed_group(d, 'calves', 4, 1);    perform pg_temp.seed_ex(g, 'Standing Calf Raise', 1, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 4, 'Push B') returning id into d;
  g := pg_temp.seed_group(d, 'chest', 1, 2);
    perform pg_temp.seed_ex(g, 'Bench Press (Incline, Medium Grip)', 1, 3);
    perform pg_temp.seed_ex(g, 'Machine Chest Press', 2, 3);
  g := pg_temp.seed_group(d, 'shoulders', 2, 2);
    perform pg_temp.seed_ex(g, 'Barbell Shoulder Press (Seated)', 1, 3);
    perform pg_temp.seed_ex(g, 'Machine Lateral Raise', 2, 3);
  g := pg_temp.seed_group(d, 'triceps', 3, 1);  perform pg_temp.seed_ex(g, 'Dumbbell Overhead Extension', 1, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 5, 'Pull B') returning id into d;
  g := pg_temp.seed_group(d, 'back', 1, 3);
    perform pg_temp.seed_ex(g, 'Barbell Bent Over Row', 1, 3);
    perform pg_temp.seed_ex(g, 'Pulldown (Wide Grip)', 2, 3);
    perform pg_temp.seed_ex(g, 'Chest Supported Row', 3, 3);
  g := pg_temp.seed_group(d, 'biceps', 2, 1);    perform pg_temp.seed_ex(g, 'Cable Curl', 1, 3);
  g := pg_temp.seed_group(d, 'traps', 3, 1);     perform pg_temp.seed_ex(g, 'Barbell Shrug', 1, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 6, 'Legs B') returning id into d;
  g := pg_temp.seed_group(d, 'glutes', 1, 2);
    perform pg_temp.seed_ex(g, 'Deadlift', 1, 3);
    perform pg_temp.seed_ex(g, 'Cable Pull Through', 2, 3);
  g := pg_temp.seed_group(d, 'quads', 2, 1);     perform pg_temp.seed_ex(g, 'Hack Squat', 1, 3);
  g := pg_temp.seed_group(d, 'hamstrings', 3, 1);perform pg_temp.seed_ex(g, 'Seated Leg Curl', 1, 3);
  g := pg_temp.seed_group(d, 'calves', 4, 1);    perform pg_temp.seed_ex(g, 'Calf Raise - Seated', 1, 3);

  -- =====================================================================
  -- 4. Glute & Lower Emphasis — lower · female · 4 day
  -- =====================================================================
  insert into public.templates (user_id, name, emphasis, intended_gender, days_per_week, description)
  values (null, 'Glute & Lower Emphasis', 'lower', 'female', 4,
    'Lower-body focused with heavy glute and hamstring volume, plus two lighter upper sessions to round it out. Built around a glutes-and-legs priority.')
  returning id into tid;

  insert into public.template_days (template_id, day_number, label) values (tid, 1, 'Glutes & Hamstrings') returning id into d;
  g := pg_temp.seed_group(d, 'glutes', 1, 3);
    perform pg_temp.seed_ex(g, 'Barbell Hip Thrust', 1, 4);
    perform pg_temp.seed_ex(g, 'Cable Kickback', 2, 3);
    perform pg_temp.seed_ex(g, 'Hip Abduction Machine', 3, 3);
  g := pg_temp.seed_group(d, 'hamstrings', 2, 2);
    perform pg_temp.seed_ex(g, 'Single Leg Romanian Deadlift', 1, 3);
    perform pg_temp.seed_ex(g, 'Seated Leg Curl', 2, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 2, 'Upper A') returning id into d;
  g := pg_temp.seed_group(d, 'back', 1, 1);      perform pg_temp.seed_ex(g, 'Pulldown (Wide Grip)', 1, 3);
  g := pg_temp.seed_group(d, 'shoulders', 2, 1); perform pg_temp.seed_ex(g, 'Dumbbell Lateral Raise', 1, 3);
  g := pg_temp.seed_group(d, 'chest', 3, 1);     perform pg_temp.seed_ex(g, 'Dumbbell Press (Low Incline)', 1, 3);
  g := pg_temp.seed_group(d, 'biceps', 4, 1);    perform pg_temp.seed_ex(g, 'Dumbbell Curl (2-Arm)', 1, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 3, 'Quads & Glutes') returning id into d;
  g := pg_temp.seed_group(d, 'quads', 1, 2);
    perform pg_temp.seed_ex(g, 'Barbell Squat (High Bar)', 1, 3);
    perform pg_temp.seed_ex(g, 'Leg Extension', 2, 3);
  g := pg_temp.seed_group(d, 'glutes', 2, 2);
    perform pg_temp.seed_ex(g, 'Walking Lunges (Glute-Focused, Dumbbell)', 1, 3);
    perform pg_temp.seed_ex(g, 'Machine Hip Thrust', 2, 3);
  g := pg_temp.seed_group(d, 'calves', 3, 1);    perform pg_temp.seed_ex(g, 'Standing Calf Raise', 1, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 4, 'Upper B') returning id into d;
  g := pg_temp.seed_group(d, 'back', 1, 1);      perform pg_temp.seed_ex(g, 'Seated Cable Row', 1, 3);
  g := pg_temp.seed_group(d, 'shoulders', 2, 2);
    perform pg_temp.seed_ex(g, 'Machine Shoulder Press', 1, 3);
    perform pg_temp.seed_ex(g, 'Cable Rope Facepull', 2, 3);
  g := pg_temp.seed_group(d, 'triceps', 3, 1);   perform pg_temp.seed_ex(g, 'Cable Triceps Pushdown (Rope)', 1, 3);

  -- =====================================================================
  -- 5. Push Pull Legs (3-Day) — push_pull_legs · any · 3 day
  -- =====================================================================
  insert into public.templates (user_id, name, emphasis, intended_gender, days_per_week, description)
  values (null, 'Push Pull Legs (3-Day)', 'push_pull_legs', 'any', 3,
    'A three-day push/pull/legs split, each session once a week. A simpler entry into PPL or a fit for a three-day-a-week schedule.')
  returning id into tid;

  insert into public.template_days (template_id, day_number, label) values (tid, 1, 'Push') returning id into d;
  g := pg_temp.seed_group(d, 'chest', 1, 1);     perform pg_temp.seed_ex(g, 'Bench Press (Medium Grip)', 1, 3);
  g := pg_temp.seed_group(d, 'shoulders', 2, 2);
    perform pg_temp.seed_ex(g, 'Machine Shoulder Press', 1, 3);
    perform pg_temp.seed_ex(g, 'Dumbbell Lateral Raise', 2, 3);
  g := pg_temp.seed_group(d, 'triceps', 3, 1);   perform pg_temp.seed_ex(g, 'Cable Triceps Pushdown (Rope)', 1, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 2, 'Pull') returning id into d;
  g := pg_temp.seed_group(d, 'back', 1, 2);
    perform pg_temp.seed_ex(g, 'Pulldown (Wide Grip)', 1, 3);
    perform pg_temp.seed_ex(g, 'Seated Cable Row', 2, 3);
  g := pg_temp.seed_group(d, 'biceps', 2, 1);    perform pg_temp.seed_ex(g, 'EZ Bar Curl (Normal Grip)', 1, 3);
  g := pg_temp.seed_group(d, 'shoulders', 3, 1); perform pg_temp.seed_ex(g, 'Cable Rope Facepull', 1, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 3, 'Legs') returning id into d;
  g := pg_temp.seed_group(d, 'quads', 1, 1);     perform pg_temp.seed_ex(g, 'Barbell Squat (High Bar)', 1, 3);
  g := pg_temp.seed_group(d, 'hamstrings', 2, 1);perform pg_temp.seed_ex(g, 'Lying Leg Curl', 1, 3);
  g := pg_temp.seed_group(d, 'glutes', 3, 1);    perform pg_temp.seed_ex(g, 'Barbell Hip Thrust', 1, 3);
  g := pg_temp.seed_group(d, 'calves', 4, 1);    perform pg_temp.seed_ex(g, 'Standing Calf Raise', 1, 3);

  -- =====================================================================
  -- 6. Upper Body Emphasis — upper · male · 3 day
  -- =====================================================================
  insert into public.templates (user_id, name, emphasis, intended_gender, days_per_week, description)
  values (null, 'Upper Body Emphasis', 'upper', 'male', 3,
    'Three upper-focused days for chest, back, shoulders and arms, each with a single lower movement to maintain the legs. For an upper-body bias block.')
  returning id into tid;

  insert into public.template_days (template_id, day_number, label) values (tid, 1, 'Chest & Back') returning id into d;
  g := pg_temp.seed_group(d, 'chest', 1, 2);
    perform pg_temp.seed_ex(g, 'Bench Press (Medium Grip)', 1, 3);
    perform pg_temp.seed_ex(g, 'Dumbbell Press (Low Incline)', 2, 3);
  g := pg_temp.seed_group(d, 'back', 2, 2);
    perform pg_temp.seed_ex(g, 'Barbell Bent Over Row', 1, 3);
    perform pg_temp.seed_ex(g, 'Pulldown (Wide Grip)', 2, 3);
  g := pg_temp.seed_group(d, 'quads', 3, 1);     perform pg_temp.seed_ex(g, 'Leg Press', 1, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 2, 'Shoulders & Arms') returning id into d;
  g := pg_temp.seed_group(d, 'shoulders', 1, 3);
    perform pg_temp.seed_ex(g, 'Barbell Shoulder Press (Seated)', 1, 3);
    perform pg_temp.seed_ex(g, 'Dumbbell Lateral Raise', 2, 3);
    perform pg_temp.seed_ex(g, 'Cable Rope Facepull', 3, 3);
  g := pg_temp.seed_group(d, 'biceps', 2, 1);    perform pg_temp.seed_ex(g, 'EZ Bar Curl (Normal Grip)', 1, 3);
  g := pg_temp.seed_group(d, 'triceps', 3, 1);   perform pg_temp.seed_ex(g, 'EZ Bar Skullcrusher', 1, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 3, 'Chest, Back & Arms') returning id into d;
  g := pg_temp.seed_group(d, 'chest', 1, 1);     perform pg_temp.seed_ex(g, 'Bench Press (Incline, Medium Grip)', 1, 3);
  g := pg_temp.seed_group(d, 'back', 2, 1);      perform pg_temp.seed_ex(g, 'Seated Cable Row', 1, 3);
  g := pg_temp.seed_group(d, 'biceps', 3, 1);    perform pg_temp.seed_ex(g, 'Hammer Curl', 1, 3);
  g := pg_temp.seed_group(d, 'triceps', 4, 1);   perform pg_temp.seed_ex(g, 'Cable Triceps Pushdown (Rope)', 1, 3);
  g := pg_temp.seed_group(d, 'hamstrings', 5, 1);perform pg_temp.seed_ex(g, 'Lying Leg Curl', 1, 3);

  -- =====================================================================
  -- 7. Five-Day Body Part Split — other · male · 5 day
  -- =====================================================================
  insert into public.templates (user_id, name, emphasis, intended_gender, days_per_week, description)
  values (null, 'Five-Day Body Part Split', 'other', 'male', 5,
    'A classic bodybuilding split — one major region per day across five days, with high per-session volume. Best for advanced lifters with time to train.')
  returning id into tid;

  insert into public.template_days (template_id, day_number, label) values (tid, 1, 'Chest') returning id into d;
  g := pg_temp.seed_group(d, 'chest', 1, 4);
    perform pg_temp.seed_ex(g, 'Bench Press (Medium Grip)', 1, 3);
    perform pg_temp.seed_ex(g, 'Dumbbell Press (Low Incline)', 2, 3);
    perform pg_temp.seed_ex(g, 'Cable Flye (High)', 3, 3);
    perform pg_temp.seed_ex(g, 'Machine Chest Press', 4, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 2, 'Back') returning id into d;
  g := pg_temp.seed_group(d, 'back', 1, 4);
    perform pg_temp.seed_ex(g, 'Pullup (Normal Grip)', 1, 3);
    perform pg_temp.seed_ex(g, 'Barbell Bent Over Row', 2, 3);
    perform pg_temp.seed_ex(g, 'Pulldown (Wide Grip)', 3, 3);
    perform pg_temp.seed_ex(g, 'Seated Cable Row', 4, 3);
  g := pg_temp.seed_group(d, 'traps', 2, 1);     perform pg_temp.seed_ex(g, 'Barbell Shrug', 1, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 3, 'Shoulders') returning id into d;
  g := pg_temp.seed_group(d, 'shoulders', 1, 4);
    perform pg_temp.seed_ex(g, 'Barbell Shoulder Press (Seated)', 1, 3);
    perform pg_temp.seed_ex(g, 'Dumbbell Lateral Raise', 2, 3);
    perform pg_temp.seed_ex(g, 'Cable Rope Facepull', 3, 3);
    perform pg_temp.seed_ex(g, 'Machine Lateral Raise', 4, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 4, 'Legs') returning id into d;
  g := pg_temp.seed_group(d, 'quads', 1, 2);
    perform pg_temp.seed_ex(g, 'Barbell Squat (High Bar)', 1, 3);
    perform pg_temp.seed_ex(g, 'Leg Press', 2, 3);
  g := pg_temp.seed_group(d, 'hamstrings', 2, 1);perform pg_temp.seed_ex(g, 'Lying Leg Curl', 1, 3);
  g := pg_temp.seed_group(d, 'glutes', 3, 1);    perform pg_temp.seed_ex(g, 'Barbell Hip Thrust', 1, 3);
  g := pg_temp.seed_group(d, 'calves', 4, 1);    perform pg_temp.seed_ex(g, 'Standing Calf Raise', 1, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 5, 'Arms') returning id into d;
  g := pg_temp.seed_group(d, 'biceps', 1, 2);
    perform pg_temp.seed_ex(g, 'EZ Bar Curl (Normal Grip)', 1, 3);
    perform pg_temp.seed_ex(g, 'Dumbbell Curl (Incline)', 2, 3);
  g := pg_temp.seed_group(d, 'triceps', 2, 2);
    perform pg_temp.seed_ex(g, 'Cable Triceps Pushdown (Rope)', 1, 3);
    perform pg_temp.seed_ex(g, 'Dumbbell Overhead Extension', 2, 3);
  g := pg_temp.seed_group(d, 'abs', 3, 1);       perform pg_temp.seed_ex(g, 'Cable Rope Crunch', 1, 3);

  -- =====================================================================
  -- 8. Minimalist Full Body — full_body · any · 2 day
  -- =====================================================================
  insert into public.templates (user_id, name, emphasis, intended_gender, days_per_week, description)
  values (null, 'Minimalist Full Body', 'full_body', 'any', 2,
    'Two efficient full-body sessions a week built around the big compound lifts. Ideal for maintenance, time-crunched weeks, or easing back into training.')
  returning id into tid;

  insert into public.template_days (template_id, day_number, label) values (tid, 1, 'Full Body A') returning id into d;
  g := pg_temp.seed_group(d, 'quads', 1, 1);     perform pg_temp.seed_ex(g, 'Barbell Squat (High Bar)', 1, 3);
  g := pg_temp.seed_group(d, 'chest', 2, 1);     perform pg_temp.seed_ex(g, 'Bench Press (Medium Grip)', 1, 3);
  g := pg_temp.seed_group(d, 'back', 3, 1);      perform pg_temp.seed_ex(g, 'Seated Cable Row', 1, 3);
  g := pg_temp.seed_group(d, 'shoulders', 4, 1); perform pg_temp.seed_ex(g, 'Dumbbell Lateral Raise', 1, 3);

  insert into public.template_days (template_id, day_number, label) values (tid, 2, 'Full Body B') returning id into d;
  g := pg_temp.seed_group(d, 'glutes', 1, 1);    perform pg_temp.seed_ex(g, 'Deadlift', 1, 3);
  g := pg_temp.seed_group(d, 'chest', 2, 1);     perform pg_temp.seed_ex(g, 'Dumbbell Press (Low Incline)', 1, 3);
  g := pg_temp.seed_group(d, 'back', 3, 1);      perform pg_temp.seed_ex(g, 'Pulldown (Wide Grip)', 1, 3);
  g := pg_temp.seed_group(d, 'biceps', 4, 1);    perform pg_temp.seed_ex(g, 'EZ Bar Curl (Normal Grip)', 1, 3);
  g := pg_temp.seed_group(d, 'triceps', 5, 1);   perform pg_temp.seed_ex(g, 'Cable Triceps Pushdown (Rope)', 1, 3);
end $$;
