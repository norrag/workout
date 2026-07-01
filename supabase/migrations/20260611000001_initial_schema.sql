-- 0001 — initial schema (docs/03-data-model.md)
-- Every table: uuid pk, created_at/updated_at, RLS enabled with default deny.

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  age int check (age between 13 and 120),
  gender text check (gender in ('female', 'male', 'other', 'undisclosed')),
  experience_level text check (experience_level in ('beginner', 'intermediate', 'advanced')),
  preferred_equipment text[] not null default '{}',
  units text not null default 'lb' check (units in ('kg', 'lb')),
  role text not null default 'user' check (role in ('user', 'admin')),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- security definer so policies can check the caller's role without
-- recursing into profiles' own RLS
-- (defined after public.profiles: LANGUAGE sql bodies are validated at create
-- time, so a clean-DB apply aborts if the table doesn't exist yet. Reordered
-- 2026-07-01 [R2]; end-state identical, hosted DB unaffected — deviation from
-- append-only recorded in docs/PROGRESS.md.)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- auto-create a profile row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- reference: muscle groups
-- ---------------------------------------------------------------------------

create table public.muscle_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.muscle_groups enable row level security;

create policy "muscle_groups_select_all" on public.muscle_groups
  for select using (auth.role() = 'authenticated');

create trigger muscle_groups_updated_at before update on public.muscle_groups
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- exercises
-- ---------------------------------------------------------------------------

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade, -- null => stock
  name text not null,
  equipment_type text not null check (equipment_type in ('dumbbell', 'barbell', 'machine', 'cable', 'smith', 'bodyweight', 'other')),
  notes text,
  video_url text,
  source_exercise_id uuid references public.exercises (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.exercises enable row level security;

create policy "exercises_select_stock_or_own" on public.exercises
  for select using (user_id is null or user_id = auth.uid());
create policy "exercises_insert_own" on public.exercises
  for insert with check (user_id = auth.uid());
create policy "exercises_update_own" on public.exercises
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "exercises_delete_own" on public.exercises
  for delete using (user_id = auth.uid());

create index exercises_user_idx on public.exercises (user_id);
create index exercises_source_idx on public.exercises (source_exercise_id);

create trigger exercises_updated_at before update on public.exercises
  for each row execute function public.set_updated_at();

create table public.exercise_muscle_groups (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  muscle_group_id uuid not null references public.muscle_groups (id) on delete cascade,
  role text not null default 'primary' check (role in ('primary', 'secondary')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exercise_id, muscle_group_id)
);

alter table public.exercise_muscle_groups enable row level security;

create policy "emg_select_visible" on public.exercise_muscle_groups
  for select using (
    exists (
      select 1 from public.exercises e
      where e.id = exercise_id and (e.user_id is null or e.user_id = auth.uid())
    )
  );
create policy "emg_write_own" on public.exercise_muscle_groups
  for insert with check (
    exists (select 1 from public.exercises e where e.id = exercise_id and e.user_id = auth.uid())
  );
create policy "emg_update_own" on public.exercise_muscle_groups
  for update using (
    exists (select 1 from public.exercises e where e.id = exercise_id and e.user_id = auth.uid())
  );
create policy "emg_delete_own" on public.exercise_muscle_groups
  for delete using (
    exists (select 1 from public.exercises e where e.id = exercise_id and e.user_id = auth.uid())
  );

create index emg_exercise_idx on public.exercise_muscle_groups (exercise_id);
create index emg_muscle_group_idx on public.exercise_muscle_groups (muscle_group_id);

create trigger emg_updated_at before update on public.exercise_muscle_groups
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- cycles
-- ---------------------------------------------------------------------------

create table public.macrocycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  goal_type text not null check (goal_type in ('cut', 'gain', 'maintain')),
  goal_notes text,
  target_metrics jsonb not null default '{}',
  start_date date not null,
  target_end_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.macrocycles enable row level security;

create policy "macrocycles_all_own" on public.macrocycles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index macrocycles_user_idx on public.macrocycles (user_id, status);

create trigger macrocycles_updated_at before update on public.macrocycles
  for each row execute function public.set_updated_at();

create table public.mesocycles (
  id uuid primary key default gen_random_uuid(),
  macrocycle_id uuid not null references public.macrocycles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  weeks int not null check (weeks between 3 and 6),
  days_per_week int not null check (days_per_week between 1 and 7),
  includes_deload boolean not null default true,
  rir_start int not null default 3 check (rir_start between 0 and 5),
  rir_end int not null default 0 check (rir_end between 0 and 5),
  status text not null default 'planned' check (status in ('planned', 'active', 'completed', 'abandoned')),
  template_id uuid,
  start_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (rir_start >= rir_end)
);

alter table public.mesocycles enable row level security;

create policy "mesocycles_all_own" on public.mesocycles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index mesocycles_user_idx on public.mesocycles (user_id, status);
create index mesocycles_macro_idx on public.mesocycles (macrocycle_id);

create trigger mesocycles_updated_at before update on public.mesocycles
  for each row execute function public.set_updated_at();

create table public.meso_exercises (
  id uuid primary key default gen_random_uuid(),
  mesocycle_id uuid not null references public.mesocycles (id) on delete cascade,
  day_of_week int not null check (day_of_week between 1 and 7),
  position int not null default 1,
  exercise_id uuid not null references public.exercises (id),
  initial_weight numeric,
  initial_reps int check (initial_reps between 1 and 100),
  initial_sets int not null default 3 check (initial_sets between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.meso_exercises enable row level security;

create policy "meso_exercises_all_own" on public.meso_exercises
  for all using (
    exists (select 1 from public.mesocycles m where m.id = mesocycle_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.mesocycles m where m.id = mesocycle_id and m.user_id = auth.uid())
  );

create index meso_exercises_meso_idx on public.meso_exercises (mesocycle_id, day_of_week, position);

create trigger meso_exercises_updated_at before update on public.meso_exercises
  for each row execute function public.set_updated_at();

create table public.microcycles (
  id uuid primary key default gen_random_uuid(),
  mesocycle_id uuid not null references public.mesocycles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  week_number int not null check (week_number >= 1),
  target_rir int not null check (target_rir between 0 and 5),
  is_deload boolean not null default false,
  start_date date,
  status text not null default 'pending' check (status in ('pending', 'active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mesocycle_id, week_number)
);

alter table public.microcycles enable row level security;

create policy "microcycles_all_own" on public.microcycles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index microcycles_user_idx on public.microcycles (user_id, status);
create index microcycles_meso_idx on public.microcycles (mesocycle_id, week_number);

create trigger microcycles_updated_at before update on public.microcycles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- workouts & logging
-- ---------------------------------------------------------------------------

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  microcycle_id uuid not null references public.microcycles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  day_number int not null check (day_number between 1 and 7),
  scheduled_date date,
  performed_at timestamptz,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed', 'skipped')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workouts enable row level security;

create policy "workouts_all_own" on public.workouts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index workouts_user_idx on public.workouts (user_id, status);
create index workouts_micro_idx on public.workouts (microcycle_id, day_number);

create trigger workouts_updated_at before update on public.workouts
  for each row execute function public.set_updated_at();

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  position int not null default 1,
  prescribed_weight numeric,
  prescribed_reps int,
  prescribed_sets int,
  target_rir int check (target_rir between 0 and 5),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workout_exercises enable row level security;

create policy "workout_exercises_all_own" on public.workout_exercises
  for all using (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  );

create index workout_exercises_workout_idx on public.workout_exercises (workout_id, position);

create trigger workout_exercises_updated_at before update on public.workout_exercises
  for each row execute function public.set_updated_at();

create table public.logged_sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  -- denormalized cycle stamps: the engine's and MCP's primary time series
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  macrocycle_id uuid not null references public.macrocycles (id) on delete cascade,
  mesocycle_id uuid not null references public.mesocycles (id) on delete cascade,
  microcycle_id uuid not null references public.microcycles (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  performed_at timestamptz not null default now(),
  set_number int not null check (set_number >= 1),
  weight numeric not null check (weight >= 0),
  reps int not null check (reps between 0 and 200),
  rir_reported int check (rir_reported between 0 and 10),
  is_warmup boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.logged_sets enable row level security;

create policy "logged_sets_select_own" on public.logged_sets
  for select using (user_id = auth.uid());
create policy "logged_sets_insert_own" on public.logged_sets
  for insert with check (user_id = auth.uid());
create policy "logged_sets_update_own" on public.logged_sets
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- no delete policy: logged history is append-only from the client

-- the engine's hottest query
create index logged_sets_user_exercise_idx on public.logged_sets (user_id, exercise_id, performed_at desc);
create index logged_sets_user_meso_idx on public.logged_sets (user_id, mesocycle_id);
create index logged_sets_user_micro_idx on public.logged_sets (user_id, microcycle_id);
create index logged_sets_we_idx on public.logged_sets (workout_exercise_id);

create trigger logged_sets_updated_at before update on public.logged_sets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- feedback
-- ---------------------------------------------------------------------------

create table public.exercise_feedback (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joint_pain int check (joint_pain between 0 and 3),
  muscle_strain int check (muscle_strain between 0 and 3),
  pump int check (pump between 0 and 3),
  fatigue int check (fatigue between 0 and 3),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_exercise_id)
);

alter table public.exercise_feedback enable row level security;

create policy "exercise_feedback_all_own" on public.exercise_feedback
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index exercise_feedback_user_idx on public.exercise_feedback (user_id);

create trigger exercise_feedback_updated_at before update on public.exercise_feedback
  for each row execute function public.set_updated_at();

create table public.workout_feedback (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  overall_fatigue int check (overall_fatigue between 0 and 4),
  effort_rating int check (effort_rating between 0 and 4),
  performance_rating int check (performance_rating between 0 and 4),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_id)
);

alter table public.workout_feedback enable row level security;

create policy "workout_feedback_all_own" on public.workout_feedback
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index workout_feedback_user_idx on public.workout_feedback (user_id);

create trigger workout_feedback_updated_at before update on public.workout_feedback
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- templates
-- ---------------------------------------------------------------------------

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade, -- null => stock
  name text not null,
  emphasis text not null check (emphasis in ('arms', 'legs', 'upper', 'lower', 'full_body', 'push_pull_legs', 'upper_lower', 'other')),
  intended_gender text check (intended_gender in ('female', 'male', 'any')),
  days_per_week int not null check (days_per_week between 1 and 7),
  description text,
  source_template_id uuid references public.templates (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.templates enable row level security;

create policy "templates_select_stock_or_own" on public.templates
  for select using (user_id is null or user_id = auth.uid());
create policy "templates_insert_own" on public.templates
  for insert with check (user_id = auth.uid());
create policy "templates_update_own" on public.templates
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "templates_delete_own" on public.templates
  for delete using (user_id = auth.uid());

create index templates_user_idx on public.templates (user_id);

create trigger templates_updated_at before update on public.templates
  for each row execute function public.set_updated_at();

create table public.template_days (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates (id) on delete cascade,
  day_number int not null check (day_number between 1 and 7),
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, day_number)
);

alter table public.template_days enable row level security;

create policy "template_days_select_visible" on public.template_days
  for select using (
    exists (
      select 1 from public.templates t
      where t.id = template_id and (t.user_id is null or t.user_id = auth.uid())
    )
  );
create policy "template_days_write_own" on public.template_days
  for insert with check (
    exists (select 1 from public.templates t where t.id = template_id and t.user_id = auth.uid())
  );
create policy "template_days_update_own" on public.template_days
  for update using (
    exists (select 1 from public.templates t where t.id = template_id and t.user_id = auth.uid())
  );
create policy "template_days_delete_own" on public.template_days
  for delete using (
    exists (select 1 from public.templates t where t.id = template_id and t.user_id = auth.uid())
  );

create index template_days_template_idx on public.template_days (template_id, day_number);

create trigger template_days_updated_at before update on public.template_days
  for each row execute function public.set_updated_at();

create table public.template_exercises (
  id uuid primary key default gen_random_uuid(),
  template_day_id uuid not null references public.template_days (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  position int not null default 1,
  default_sets int not null default 3 check (default_sets between 1 and 20),
  default_rep_range int4range,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.template_exercises enable row level security;

create policy "template_exercises_select_visible" on public.template_exercises
  for select using (
    exists (
      select 1 from public.template_days d
      join public.templates t on t.id = d.template_id
      where d.id = template_day_id and (t.user_id is null or t.user_id = auth.uid())
    )
  );
create policy "template_exercises_write_own" on public.template_exercises
  for insert with check (
    exists (
      select 1 from public.template_days d
      join public.templates t on t.id = d.template_id
      where d.id = template_day_id and t.user_id = auth.uid()
    )
  );
create policy "template_exercises_update_own" on public.template_exercises
  for update using (
    exists (
      select 1 from public.template_days d
      join public.templates t on t.id = d.template_id
      where d.id = template_day_id and t.user_id = auth.uid()
    )
  );
create policy "template_exercises_delete_own" on public.template_exercises
  for delete using (
    exists (
      select 1 from public.template_days d
      join public.templates t on t.id = d.template_id
      where d.id = template_day_id and t.user_id = auth.uid()
    )
  );

create index template_exercises_day_idx on public.template_exercises (template_day_id, position);

create trigger template_exercises_updated_at before update on public.template_exercises
  for each row execute function public.set_updated_at();

-- mesocycles.template_id provenance fk (after templates exists)
alter table public.mesocycles
  add constraint mesocycles_template_fk
  foreign key (template_id) references public.templates (id) on delete set null;

-- ---------------------------------------------------------------------------
-- sharing
-- ---------------------------------------------------------------------------

create table public.shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  grantee_id uuid references auth.users (id) on delete cascade,
  object_type text not null check (object_type in ('exercise', 'template', 'mesocycle')),
  object_id uuid not null,
  share_code text unique,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (grantee_id is not null or share_code is not null)
);

alter table public.shares enable row level security;

create policy "shares_owner_all" on public.shares
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "shares_grantee_select" on public.shares
  for select using (grantee_id = auth.uid());
create policy "shares_grantee_accept" on public.shares
  for update using (grantee_id = auth.uid()) with check (grantee_id = auth.uid());

create index shares_owner_idx on public.shares (owner_id);
create index shares_grantee_idx on public.shares (grantee_id);

create trigger shares_updated_at before update on public.shares
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- engine tables
-- ---------------------------------------------------------------------------

create table public.engine_params (
  id uuid primary key default gen_random_uuid(),
  version int not null unique,
  params jsonb not null,
  is_active boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.engine_params enable row level security;

create policy "engine_params_select_authenticated" on public.engine_params
  for select using (auth.role() = 'authenticated');
create policy "engine_params_admin_insert" on public.engine_params
  for insert with check (public.is_admin());
create policy "engine_params_admin_update" on public.engine_params
  for update using (public.is_admin());

-- at most one active param version
create unique index engine_params_single_active_idx
  on public.engine_params (is_active) where is_active;

create trigger engine_params_updated_at before update on public.engine_params
  for each row execute function public.set_updated_at();

create table public.engine_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_exercise_id uuid references public.workout_exercises (id) on delete set null,
  inputs jsonb not null,
  output jsonb not null,
  params_version int not null,
  created_at timestamptz not null default now()
);

alter table public.engine_decisions enable row level security;

create policy "engine_decisions_select_own_or_admin" on public.engine_decisions
  for select using (user_id = auth.uid() or public.is_admin());
-- writes happen via service role only (engine job); no insert policy for users

create index engine_decisions_user_idx on public.engine_decisions (user_id, created_at desc);
create index engine_decisions_we_idx on public.engine_decisions (workout_exercise_id);

-- ---------------------------------------------------------------------------
-- views — the shared definition of progress (UI, insights, MCP)
-- security_invoker so RLS of the querying user applies
-- ---------------------------------------------------------------------------

create view public.v_exercise_history
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
  -- Epley e1RM on the best working set
  max(ls.weight * (1 + ls.reps / 30.0)) filter (where not ls.is_warmup) as e1rm,
  avg(ls.rir_reported) filter (where not ls.is_warmup) as avg_rir_reported
from public.logged_sets ls
join public.exercises e on e.id = ls.exercise_id
group by ls.user_id, ls.exercise_id, e.name, ls.mesocycle_id, ls.microcycle_id, ls.workout_id, ls.performed_at::date;

create view public.v_muscle_group_volume
with (security_invoker = true) as
select
  ls.user_id,
  mg.id as muscle_group_id,
  mg.name as muscle_group,
  ls.microcycle_id,
  ls.mesocycle_id,
  date_trunc('week', ls.performed_at)::date as week_start,
  count(*) filter (where not ls.is_warmup and emg.role = 'primary') as primary_sets,
  count(*) filter (where not ls.is_warmup and emg.role = 'secondary') as secondary_sets,
  sum(ls.weight * ls.reps) filter (where not ls.is_warmup) as volume
from public.logged_sets ls
join public.exercise_muscle_groups emg on emg.exercise_id = ls.exercise_id
join public.muscle_groups mg on mg.id = emg.muscle_group_id
group by ls.user_id, mg.id, mg.name, ls.microcycle_id, ls.mesocycle_id, date_trunc('week', ls.performed_at)::date;

create view public.v_meso_summary
with (security_invoker = true) as
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
  count(distinct w.id) filter (where w.status = 'completed') as workouts_completed,
  count(distinct w.id) as workouts_total,
  count(ls.id) filter (where not ls.is_warmup) as working_sets,
  sum(ls.weight * ls.reps) filter (where not ls.is_warmup) as total_volume,
  max(ls.weight * (1 + ls.reps / 30.0)) filter (where not ls.is_warmup) as best_e1rm,
  avg(ef.joint_pain) as avg_joint_pain,
  avg(ef.pump) as avg_pump,
  avg(wf.overall_fatigue) as avg_overall_fatigue,
  avg(wf.performance_rating) as avg_performance
from public.mesocycles m
left join public.microcycles mc on mc.mesocycle_id = m.id
left join public.workouts w on w.microcycle_id = mc.id
left join public.logged_sets ls on ls.workout_id = w.id
left join public.workout_exercises we on we.workout_id = w.id
left join public.exercise_feedback ef on ef.workout_exercise_id = we.id
left join public.workout_feedback wf on wf.workout_id = w.id
group by m.id;
