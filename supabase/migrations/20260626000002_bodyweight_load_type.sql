-- 20260626000002 — T-I2: load-type model + bodyweight capture
--
-- The bodyweight prescription model (WS-I / T-I2, owner ruling 2026-06-25) needs
-- two first-class data points the schema didn't carry:
--
--   1. exercises.load_type — how the entered weight maps to EFFECTIVE load. The
--      engine collapsed both 'bodyweight only' and 'bodyweight loadable' into one
--      'bodyweight' equipment bucket and could not represent 'machine assistance'
--      (assisted) at all, so bodyweight movements were un-anchorable (weight 0) and
--      fell to the legacy increment path. Backfilled from equipment_type with the
--      same mapping the engine's toEngineLoadType() uses, so existing rows match.
--
--   2. logged_sets.bodyweight — the lifter's bodyweight at log time, the effective-
--      load base for bodyweight movements (effective = bodyweight ± entered, #4).
--      Captured going forward by the log action; historical rows are backfilled from
--      the user's CURRENT profile bodyweight (the only bodyweight we have for the
--      past — a documented approximation; the recency-weighted anchor favours recent
--      sets anyway).
--
-- Both are consumed only when engine_params.bodyweight_model is active (v16,
-- shipped INACTIVE) — the columns are inert until activation.
--
-- RLS: column adds on existing tables. `logged_sets` policies are owner-scoped and
-- column-agnostic (no change needed). `exercises` is the shared library + own custom
-- rows; its existing select/own policies are column-agnostic too. No new table or
-- policy ⇒ no new RLS test (consistent with 20260623130000_logged_set_e1rm).

-- 1. exercises.load_type ------------------------------------------------------
alter table public.exercises add column load_type text;

update public.exercises
set load_type = case equipment_type
  when 'bodyweight only' then 'bodyweight_only'
  when 'bodyweight loadable' then 'bodyweight_loadable'
  when 'machine assistance' then 'bodyweight_assisted'
  else 'external'
end;

alter table public.exercises
  alter column load_type set default 'external',
  alter column load_type set not null,
  add constraint exercises_load_type_check check (
    load_type in (
      'external',
      'bodyweight_only',
      'bodyweight_loadable',
      'bodyweight_assisted'
    )
  );

comment on column public.exercises.load_type is
  'T-I2: how the entered weight maps to effective load — external | bodyweight_only | bodyweight_loadable | bodyweight_assisted. Backfilled from equipment_type; consumed only when engine_params.bodyweight_model is active.';

-- 2. logged_sets.bodyweight ---------------------------------------------------
alter table public.logged_sets add column bodyweight numeric check (bodyweight > 0);

comment on column public.logged_sets.bodyweight is
  'T-I2/#4: the lifter''s bodyweight (lb) at log time — effective-load base for bodyweight movements. Captured at log, locked once the workout completes. Null when the profile had no bodyweight. Consumed only when engine_params.bodyweight_model is active.';

-- backfill historical working sets from the user's current profile bodyweight (the
-- best available estimate of past bodyweight; null-safe — leaves rows null when the
-- profile has none, in which case the anchor simply skips that set).
update public.logged_sets ls
set bodyweight = p.bodyweight
from public.profiles p
where p.id = ls.user_id
  and p.bodyweight is not null;
