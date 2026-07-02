-- ---------------------------------------------------------------------------
-- 20260702000005 — write integrity (R3 + R4, 2026-07-01 repo review)
--
-- Closes the non-atomic write paths and the race-duplication holes:
--
--   1. logged_sets dedup + unique (workout_exercise_id, set_number).
--      Retried/double-tapped logSet calls inserted blind duplicates — the live
--      DB carried 11 duplicated (exercise, set) groups, all machine-cadence
--      retry artifacts (identical values written 0.6–2s apart), each
--      double-counting volume/PR stats. The dedup keeps the NEWEST row per
--      group (max performed_at, tie max id — the retry semantics the app
--      adopts going forward via upsert). Recorded deviation from hard rule #5
--      (no deletes of logged history): these rows are bug artifacts, not
--      history — removing them makes history truthful. No-op on a clean DB.
--
--   2. workouts unique (microcycle_id, day_number). Generation is
--      read-then-insert; a double-tapped completion racing the catch-up scan
--      could create two week-N+1 day-D workouts, double-counted by every
--      weekly rollup. Live DB verified duplicate-free before this ships.
--
--   3. save_meso_plan(): the planner-board save was a client-side
--      delete-then-insert loop — any failure after the delete left the plan
--      wiped or half-written (for an ACTIVE meso that cascades into open-
--      workout regeneration). Now one transaction: all-or-nothing.
--      SECURITY INVOKER — RLS applies; plus an explicit ownership guard so a
--      caller can never target another user's meso even through R5-class
--      child-policy gaps.
--
--   4. activate_engine_params(): the deactivate-then-activate pair ran as two
--      client round-trips; a failure between them left ZERO active params —
--      every page and generation path app-wide throws until manually
--      repaired. Now one transaction; a failed activation rolls back the
--      deactivation. SECURITY INVOKER: RLS admin-gates the updates, so a
--      non-admin call updates nothing and raises.
--
--   5. insert_generated_day(): week N→N+1 generation inserted the workout,
--      then its exercises, then the decisions — a failure after the first
--      insert left a poisoned empty "planned" day the catch-up scan forever
--      treated as generated. Now one transaction, and an existing EMPTY
--      planned day for the same (microcycle, day) is adopted and filled —
--      healing any poisoned day instead of ducking behind it. Service-role
--      only (generation runs on the service client; engine_decisions is not
--      user-writable).
-- ---------------------------------------------------------------------------

-- 1. logged_sets: dedup retry artifacts, then enforce uniqueness ------------

delete from public.logged_sets ls
using public.logged_sets newer
where newer.workout_exercise_id = ls.workout_exercise_id
  and newer.set_number = ls.set_number
  and newer.id <> ls.id
  and (newer.performed_at > ls.performed_at
       or (newer.performed_at = ls.performed_at and newer.id > ls.id));

alter table public.logged_sets
  add constraint logged_sets_exercise_set_number_key
  unique (workout_exercise_id, set_number);

-- 2. workouts: one workout per (week, day) -----------------------------------

alter table public.workouts
  add constraint workouts_microcycle_day_number_key
  unique (microcycle_id, day_number);

-- 3. atomic planner-board save ------------------------------------------------

create or replace function public.save_meso_plan(
  p_mesocycle_id uuid,
  p_days jsonb
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_day jsonb;
  v_group jsonb;
  v_group_pos int;
  v_day_id uuid;
  v_group_id uuid;
begin
  -- explicit ownership guard (RLS also applies — SECURITY INVOKER — but the
  -- child-table policies check user_id only, so assert the parent here)
  if not exists (
    select 1 from public.mesocycles m
    where m.id = p_mesocycle_id and m.user_id = (select auth.uid())
  ) then
    raise exception 'mesocycle not found or not owned by the caller';
  end if;

  -- wholesale replace, now atomic: dropping the days cascades groups +
  -- exercises; any later failure rolls the delete back too. day_numbers are
  -- preserved by the caller so generated workouts (matched by day_number)
  -- still line up.
  delete from public.meso_days where mesocycle_id = p_mesocycle_id;

  for v_day in select * from jsonb_array_elements(p_days) loop
    insert into public.meso_days (mesocycle_id, user_id, day_number, label, weekday)
    values (
      p_mesocycle_id,
      (select auth.uid()),
      (v_day->>'day_number')::int,
      v_day->>'label',
      (v_day->>'weekday')::int
    )
    returning id into v_day_id;

    for v_group, v_group_pos in
      select g.value, g.ordinality
      from jsonb_array_elements(v_day->'groups') with ordinality g
    loop
      insert into public.meso_day_groups (meso_day_id, muscle_group_id, position, exercise_slots)
      values (
        v_day_id,
        (v_group->>'muscle_group_id')::uuid,
        v_group_pos,
        greatest(coalesce((v_group->>'exercise_slots')::int, 1), 1)
      )
      returning id into v_group_id;

      insert into public.meso_exercises
        (mesocycle_id, meso_day_group_id, day_of_week, slot_number, position,
         exercise_id, initial_weight, initial_reps, initial_sets)
      select
        p_mesocycle_id,
        v_group_id,
        null,
        (f->>'slot_number')::int,
        -- day-level order (across groups), not the group-local slot
        (f->>'day_position')::int,
        (f->>'exercise_id')::uuid,
        null,
        null,
        (f->>'initial_sets')::int
      from jsonb_array_elements(coalesce(v_group->'fills', '[]'::jsonb)) f;
    end loop;
  end loop;

  update public.mesocycles
  set days_per_week = greatest(1, jsonb_array_length(p_days))
  where id = p_mesocycle_id;
end;
$$;

revoke execute on function public.save_meso_plan(uuid, jsonb) from public;
grant execute on function public.save_meso_plan(uuid, jsonb) to authenticated;

-- 4. atomic engine-params activation -------------------------------------------

create or replace function public.activate_engine_params(
  p_version int
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- both statements run in this function's transaction: a failure activating
  -- rolls back the deactivation, so exactly one active row always survives.
  -- RLS admin-gates engine_params updates; a non-admin touches 0 rows and
  -- falls through to the exception below.
  update public.engine_params set is_active = false
  where is_active and version <> p_version;

  update public.engine_params set is_active = true
  where version = p_version;
  if not found then
    raise exception 'engine_params version % not found (or not permitted)', p_version;
  end if;
end;
$$;

revoke execute on function public.activate_engine_params(int) from public;
grant execute on function public.activate_engine_params(int) to authenticated;

-- 5. atomic week-N+1 day generation (service role only) -----------------------

create or replace function public.insert_generated_day(
  p_mesocycle_id uuid,
  p_workout jsonb,
  p_exercises jsonb,
  p_decisions jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_microcycle_id uuid := (p_workout->>'microcycle_id')::uuid;
  v_day_number int := (p_workout->>'day_number')::int;
  v_workout_id uuid;
  v_adopted boolean := false;
begin
  insert into public.workouts
    (microcycle_id, user_id, day_number, scheduled_date, performed_at, status, notes)
  values (
    v_microcycle_id,
    (p_workout->>'user_id')::uuid,
    v_day_number,
    null, null, 'planned', null
  )
  on conflict (microcycle_id, day_number) do nothing
  returning id into v_workout_id;

  if v_workout_id is null then
    -- the day already exists. If it is a poisoned EMPTY planned day (a prior
    -- half-applied generation), adopt and fill it; otherwise it is genuinely
    -- generated (or started) — leave it alone.
    select w.id into v_workout_id
    from public.workouts w
    where w.microcycle_id = v_microcycle_id
      and w.day_number = v_day_number
      and w.status = 'planned'
      and not exists (
        select 1 from public.workout_exercises we where we.workout_id = w.id
      );
    if v_workout_id is null then
      return jsonb_build_object('workout_id', null, 'created', false);
    end if;
    v_adopted := true;
  end if;

  insert into public.workout_exercises
    (workout_id, exercise_id, muscle_group_id, position, prescribed_weight,
     prescribed_reps, prescribed_sets, target_rir, status, notes,
     dep_fingerprint, params_version)
  select
    v_workout_id,
    (x->>'exercise_id')::uuid,
    (x->>'muscle_group_id')::uuid,
    (x->>'position')::int,
    (x->>'prescribed_weight')::numeric,
    (x->>'prescribed_reps')::int,
    (x->>'prescribed_sets')::int,
    (x->>'target_rir')::int,
    coalesce(x->>'status', 'pending'),
    x->>'notes',
    x->>'dep_fingerprint',
    (x->>'params_version')::int
  from jsonb_array_elements(p_exercises) x;

  -- decisions join their generated row by position (1-based day order)
  insert into public.engine_decisions
    (user_id, workout_exercise_id, exercise_id, source_workout_exercise_id,
     workout_id, microcycle_id, mesocycle_id, inputs, output,
     params_version, params_hash, provenance, kind)
  select
    (d->>'user_id')::uuid,
    we.id,
    (d->>'exercise_id')::uuid,
    (d->>'source_workout_exercise_id')::uuid,
    v_workout_id,
    v_microcycle_id,
    p_mesocycle_id,
    d->'inputs',
    d->'output',
    (d->>'params_version')::int,
    d->>'params_hash',
    d->'provenance',
    coalesce(d->>'kind', 'advance')
  from jsonb_array_elements(p_decisions) d
  join public.workout_exercises we
    on we.workout_id = v_workout_id
   and we.position = (d->>'position')::int;

  return jsonb_build_object(
    'workout_id', v_workout_id,
    'created', true,
    'adopted', v_adopted
  );
end;
$$;

-- generation runs exclusively on the service client (engine_decisions is not
-- user-writable); nobody else may call this.
revoke execute on function public.insert_generated_day(uuid, jsonb, jsonb, jsonb) from public;
revoke execute on function public.insert_generated_day(uuid, jsonb, jsonb, jsonb) from anon;
revoke execute on function public.insert_generated_day(uuid, jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.insert_generated_day(uuid, jsonb, jsonb, jsonb) to service_role;
