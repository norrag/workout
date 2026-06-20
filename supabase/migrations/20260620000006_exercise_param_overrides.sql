-- 20260620000006 — exercise_param_overrides: first per-user × exercise engine
-- override (doc 14 phase 3, §1 "Exercise param override" + §7 reusable contract).
--
-- A prescription is a cached derived value computed from the engine's inputs +
-- params (doc 14 §1). engine_params is GLOBAL; this table is the first per-user,
-- per-exercise tunable: the editable weight increment (the per-set load jump for
-- one lift). It is resolved into EFFECTIVE params (resolveEffectiveParams) at every
-- generation / recompute site, and folded into the prescription's dependency
-- fingerprint (the params token) so a change to it makes exactly that user's open
-- rows for that exercise go stale on the read path — scope falls out of the
-- fingerprint automatically (doc 14 §7), no bespoke "invalidate" wiring.
--
-- weight_increment is stored in the user's units (resolved against the live profile
-- at engine time); null is impossible here (the row is absent when there is no
-- override — clearing the override deletes the row). Future per-exercise overrides
-- (rep window, rounding, RIR cap — doc 14 §1) add columns to this same table and
-- flow through the same contract.

create table public.exercise_param_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  -- per-set weight increment for this exercise, in the user's units; > 0
  weight_increment numeric not null check (weight_increment > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, exercise_id)
);

alter table public.exercise_param_overrides enable row level security;

-- default-deny + owner-only (CLAUDE.md #1): a user sees and writes only their own
-- overrides; identity is auth.uid(), never a column the client sets.
create policy "exercise_param_overrides_all_own" on public.exercise_param_overrides
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index exercise_param_overrides_user_exercise_idx
  on public.exercise_param_overrides (user_id, exercise_id);

create trigger exercise_param_overrides_updated_at
  before update on public.exercise_param_overrides
  for each row execute function public.set_updated_at();

comment on table public.exercise_param_overrides is
  'Per-user × exercise engine overrides (doc 14 phase 3). First tunable: the editable weight increment, resolved into effective params (resolveEffectiveParams) and folded into the prescription dependency fingerprint so a change recomputes exactly that user''s open rows for that exercise.';
