-- 0002 — design pivot (docs/08-design-decisions.md)
-- Schema delta for the June 2026 mockup round: groups-first meso planning,
-- per-muscle-group feedback sliders, profile expansion (body data, equipment
-- access, exclusions, week start), macro goal-arc slots, standalone mesos,
-- pinned exercise notes, set types/units, MCP write audit, and the meso-stats
-- views. Append-only: extends 0001, never edits it.

-- ---------------------------------------------------------------------------
-- profiles — body data, training history, week start (08 §4.4/4.5)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column height_cm numeric check (height_cm between 90 and 250),
  add column bodyweight numeric check (bodyweight > 0), -- stored in `units`
  add column bodyweight_updated_at timestamptz,
  add column training_since date,
  -- ISO weekday 1 (Mon) .. 7 (Sun); set from the day-setup sheet (08 fig 2.5)
  add column week_starts_on int not null default 1 check (week_starts_on between 1 and 7);

-- equipment-access chips (4.5) reuse preferred_equipment; canonical values are
-- the exercises.equipment_type vocabulary below.

-- ---------------------------------------------------------------------------
-- exercises — wider equipment vocabulary + description (08 §4 exercise detail)
-- ---------------------------------------------------------------------------

alter table public.exercises drop constraint exercises_equipment_type_check;
alter table public.exercises
  add constraint exercises_equipment_type_check
  check (equipment_type in ('dumbbell', 'barbell', 'machine', 'cable', 'smith', 'bodyweight', 'bands', 'kettlebell', 'other'));

alter table public.exercises add column description text;

-- ---------------------------------------------------------------------------
-- excluded exercises — never appear in pickers or templates (fig 4.5)
-- ---------------------------------------------------------------------------

create table public.excluded_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  reason text, -- short label, e.g. "LOW BACK"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, exercise_id)
);

alter table public.excluded_exercises enable row level security;

create policy "excluded_exercises_all_own" on public.excluded_exercises
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index excluded_exercises_user_idx on public.excluded_exercises (user_id);

create trigger excluded_exercises_updated_at before update on public.excluded_exercises
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- exercise notes — pinned per-user notes shown under the exercise header
-- in the day view and managed from the exercise menu (figs 1.1/1.2)
-- ---------------------------------------------------------------------------

create table public.exercise_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  body text not null,
  is_pinned boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.exercise_notes enable row level security;

create policy "exercise_notes_all_own" on public.exercise_notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index exercise_notes_user_exercise_idx on public.exercise_notes (user_id, exercise_id);

create trigger exercise_notes_updated_at before update on public.exercise_notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- macro goal arc — ordered slots ("CUT → BULK → BULK II → PEAK", fig 2.1/2.7)
-- ---------------------------------------------------------------------------

create table public.macro_slots (
  id uuid primary key default gen_random_uuid(),
  macrocycle_id uuid not null references public.macrocycles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  slot_number int not null check (slot_number between 1 and 12),
  goal_type text not null check (goal_type in ('cut', 'gain', 'maintain', 'peak')),
  label text, -- display label, e.g. "Bulk II"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (macrocycle_id, slot_number)
);

alter table public.macro_slots enable row level security;

create policy "macro_slots_all_own" on public.macro_slots
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index macro_slots_macro_idx on public.macro_slots (macrocycle_id, slot_number);

create trigger macro_slots_updated_at before update on public.macro_slots
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- mesocycles — standalone mesos, macro slot placement, 3–8 week range (2.7)
-- ---------------------------------------------------------------------------

alter table public.mesocycles alter column macrocycle_id drop not null;
alter table public.mesocycles add column macro_slot_id uuid references public.macro_slots (id) on delete set null;

alter table public.mesocycles drop constraint mesocycles_weeks_check;
alter table public.mesocycles
  add constraint mesocycles_weeks_check check (weeks between 3 and 8);

-- standalone mesos have no macro stamp on their sets
alter table public.logged_sets alter column macrocycle_id drop not null;

-- ---------------------------------------------------------------------------
-- groups-first meso plan (figs 2.4/2.5): days carry a label + weekday;
-- each day is a column of muscle-group blocks; each block has N exercise
-- slots filled from the pre-filtered picker (2.6).
-- ---------------------------------------------------------------------------

create table public.meso_days (
  id uuid primary key default gen_random_uuid(),
  mesocycle_id uuid not null references public.mesocycles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  day_number int not null check (day_number between 1 and 7),
  label text, -- e.g. "Lower A"
  weekday int check (weekday between 1 and 7), -- ISO; days auto-sort by this
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mesocycle_id, day_number)
);

alter table public.meso_days enable row level security;

create policy "meso_days_all_own" on public.meso_days
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index meso_days_meso_idx on public.meso_days (mesocycle_id, day_number);

create trigger meso_days_updated_at before update on public.meso_days
  for each row execute function public.set_updated_at();

create table public.meso_day_groups (
  id uuid primary key default gen_random_uuid(),
  meso_day_id uuid not null references public.meso_days (id) on delete cascade,
  muscle_group_id uuid not null references public.muscle_groups (id),
  position int not null default 1,
  exercise_slots int not null default 1 check (exercise_slots between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meso_day_id, muscle_group_id)
);

alter table public.meso_day_groups enable row level security;

create policy "meso_day_groups_all_own" on public.meso_day_groups
  for all using (
    exists (select 1 from public.meso_days d where d.id = meso_day_id and d.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.meso_days d where d.id = meso_day_id and d.user_id = auth.uid())
  );

create index meso_day_groups_day_idx on public.meso_day_groups (meso_day_id, position);

create trigger meso_day_groups_updated_at before update on public.meso_day_groups
  for each row execute function public.set_updated_at();

-- meso_exercises become slot fills within a day group; legacy day_of_week
-- addressing is retired (column kept nullable for the 0001 shape)
alter table public.meso_exercises
  alter column day_of_week drop not null,
  add column meso_day_group_id uuid references public.meso_day_groups (id) on delete cascade,
  add column slot_number int check (slot_number between 1 and 10);

create index meso_exercises_group_idx on public.meso_exercises (meso_day_group_id, slot_number);

-- ---------------------------------------------------------------------------
-- workout execution — group context, skip states, set types, units
-- ---------------------------------------------------------------------------

-- the day view groups exercises under "01 — QUADS" headers (1.1) and the
-- feedback prompt is addressed per muscle group (1.4)
alter table public.workout_exercises
  add column muscle_group_id uuid references public.muscle_groups (id),
  add column status text not null default 'pending'
    check (status in ('pending', 'completed', 'skipped'));

alter table public.logged_sets
  add column set_type text not null default 'straight' check (set_type in ('straight', 'drop')),
  add column unit text not null default 'lb' check (unit in ('lb', 'kg'));

-- ---------------------------------------------------------------------------
-- exercise feedback — redesigned prompt (fig 1.4): joint pain 0–3 per
-- exercise, pump and workload as 0–10 sliders scoped to a muscle group.
-- muscle_strain/fatigue are superseded by the workload slider.
-- ---------------------------------------------------------------------------

alter table public.exercise_feedback
  drop column muscle_strain,
  drop column fatigue,
  add column muscle_group_id uuid references public.muscle_groups (id),
  add column workload int check (workload between 0 and 10);

alter table public.exercise_feedback drop constraint exercise_feedback_pump_check;
alter table public.exercise_feedback
  add constraint exercise_feedback_pump_check check (pump between 0 and 10);

-- ---------------------------------------------------------------------------
-- templates — mirror the groups-first board so template detail opens the
-- planner prefilled (08 §4)
-- ---------------------------------------------------------------------------

create table public.template_day_groups (
  id uuid primary key default gen_random_uuid(),
  template_day_id uuid not null references public.template_days (id) on delete cascade,
  muscle_group_id uuid not null references public.muscle_groups (id),
  position int not null default 1,
  exercise_slots int not null default 1 check (exercise_slots between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_day_id, muscle_group_id)
);

alter table public.template_day_groups enable row level security;

create policy "template_day_groups_select_visible" on public.template_day_groups
  for select using (
    exists (
      select 1 from public.template_days d
      join public.templates t on t.id = d.template_id
      where d.id = template_day_id and (t.user_id is null or t.user_id = auth.uid())
    )
  );
create policy "template_day_groups_insert_own" on public.template_day_groups
  for insert with check (
    exists (
      select 1 from public.template_days d
      join public.templates t on t.id = d.template_id
      where d.id = template_day_id and t.user_id = auth.uid()
    )
  );
create policy "template_day_groups_update_own" on public.template_day_groups
  for update using (
    exists (
      select 1 from public.template_days d
      join public.templates t on t.id = d.template_id
      where d.id = template_day_id and t.user_id = auth.uid()
    )
  );
create policy "template_day_groups_delete_own" on public.template_day_groups
  for delete using (
    exists (
      select 1 from public.template_days d
      join public.templates t on t.id = d.template_id
      where d.id = template_day_id and t.user_id = auth.uid()
    )
  );

create index template_day_groups_day_idx on public.template_day_groups (template_day_id, position);

create trigger template_day_groups_updated_at before update on public.template_day_groups
  for each row execute function public.set_updated_at();

alter table public.template_exercises
  add column template_day_group_id uuid references public.template_day_groups (id) on delete cascade,
  add column slot_number int check (slot_number between 1 and 10);

-- ---------------------------------------------------------------------------
-- MCP write audit — every MCP write tool call is recorded server-side
-- (admin & tuning operate through MCP per 08 §3; no /admin UI)
-- ---------------------------------------------------------------------------

create table public.mcp_write_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tool text not null,
  args_hash text not null,
  summary text,
  created_at timestamptz not null default now()
);

alter table public.mcp_write_audit enable row level security;

create policy "mcp_write_audit_select_own_or_admin" on public.mcp_write_audit
  for select using (user_id = auth.uid() or public.is_admin());
-- writes happen via service role only (MCP server); no insert policy for users

create index mcp_write_audit_user_idx on public.mcp_write_audit (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- views — meso stats (figs 4.1–4.3) share one definition with MCP
-- ---------------------------------------------------------------------------

-- volume table (4.1) + balance bars (4.2): planned vs logged sets per
-- muscle group per meso week; future weeks have planned_sets only
create view public.v_meso_week_sets
with (security_invoker = true) as
select
  mc.user_id,
  mc.mesocycle_id,
  mc.week_number,
  mc.is_deload,
  we.muscle_group_id,
  mg.name as muscle_group,
  sum(we.prescribed_sets) as planned_sets,
  count(ls.id) filter (where not ls.is_warmup) as logged_sets
from public.microcycles mc
join public.workouts w on w.microcycle_id = mc.id
join public.workout_exercises we on we.workout_id = w.id
left join public.muscle_groups mg on mg.id = we.muscle_group_id
left join public.logged_sets ls on ls.workout_exercise_id = we.id
group by mc.user_id, mc.mesocycle_id, mc.week_number, mc.is_deload, we.muscle_group_id, mg.name;

-- performance (4.3): all-time bests per exercise; PR badges and the
-- top-set-by-week grid derive from this plus v_exercise_history
create view public.v_exercise_prs
with (security_invoker = true) as
select
  ls.user_id,
  ls.exercise_id,
  e.name as exercise_name,
  max(ls.weight) filter (where not ls.is_warmup) as best_weight,
  max(ls.reps) filter (where not ls.is_warmup) as best_reps,
  max(ls.weight * (1 + ls.reps / 30.0)) filter (where not ls.is_warmup) as best_e1rm,
  max(ls.performed_at) as last_performed_at
from public.logged_sets ls
join public.exercises e on e.id = ls.exercise_id
group by ls.user_id, ls.exercise_id, e.name;
