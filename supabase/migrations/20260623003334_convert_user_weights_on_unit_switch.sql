-- ===========================================================================
-- Convert a user's stored weights when they switch unit (lb <-> kg).
--
-- The app stores weights in the user's chosen unit (logged_sets also tag the
-- unit per row). Switching the `profiles.units` setting alone left every stored
-- number unchanged, so a 159 lb bodyweight became "159 kg", etc. This helper
-- converts every weight-bearing value the user owns and re-tags logged history,
-- then flips the unit -- all in one transaction. Scoped to auth.uid() (SECURITY
-- DEFINER bypasses RLS but every statement is filtered to the caller).
-- Idempotent: no-op (only syncs the setting) when already on the target unit.
-- ===========================================================================

create or replace function public.convert_my_weights(to_unit text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cur text;
  factor numeric;
begin
  if to_unit not in ('lb','kg') then
    raise exception 'invalid unit %', to_unit;
  end if;
  if uid is null then
    raise exception 'no authenticated user';
  end if;

  select units into cur from public.profiles where id = uid;
  if cur is null or cur = to_unit then
    -- already on the target unit: just make sure the setting reflects it
    update public.profiles set units = to_unit where id = uid and units is distinct from to_unit;
    return;
  end if;

  factor := case when to_unit = 'kg' then 0.45359237 else 2.20462262 end;

  -- logged history: convert the magnitude and re-tag the per-row unit
  update public.logged_sets
     set weight = round(weight * factor, 1), unit = to_unit
   where user_id = uid;

  -- bodyweight
  update public.profiles
     set bodyweight = round(bodyweight * factor, 1)
   where id = uid and bodyweight is not null;

  -- live prescriptions: scalar weight + the per-set planned-weight jsonb map
  update public.workout_exercises we
     set prescribed_weight = round(prescribed_weight * factor, 1)
   where prescribed_weight is not null
     and we.workout_id in (select w.id from public.workouts w where w.user_id = uid);

  update public.workout_exercises we
     set set_weights = (
       select coalesce(jsonb_object_agg(k, round((v)::numeric * factor, 1)), '{}'::jsonb)
       from jsonb_each_text(we.set_weights) as e(k, v)
     )
   where we.set_weights <> '{}'::jsonb
     and we.workout_id in (select w.id from public.workouts w where w.user_id = uid);

  -- mesocycle seed weights
  update public.meso_exercises me
     set initial_weight = round(initial_weight * factor, 1)
   where initial_weight is not null
     and me.mesocycle_id in (select m.id from public.mesocycles m where m.user_id = uid);

  -- macrocycle goal targets / rates (target_unit follows)
  update public.macrocycles
     set target_low  = round(target_low  * factor, 1),
         target_high = round(target_high * factor, 1),
         rate_low    = round(rate_low    * factor, 1),
         rate_high   = round(rate_high   * factor, 1),
         target_unit = case when target_unit is not null then to_unit else target_unit end
   where user_id = uid;

  -- per-user / per-exercise weight increment override
  update public.exercise_param_overrides
     set weight_increment = round(weight_increment * factor, 2)
   where user_id = uid and weight_increment is not null;

  -- finally flip the setting
  update public.profiles set units = to_unit where id = uid;
end $$;

revoke all on function public.convert_my_weights(text) from public;
grant execute on function public.convert_my_weights(text) to authenticated;
