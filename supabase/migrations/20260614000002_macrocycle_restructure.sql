-- ===========================================================================
-- Macrocycle restructure (June 2026, 09 changelog 2026-06-13 §3–5 / 2026-06-14)
-- The macrocycle becomes the single-goal layer (hypertrophy / strength / cut /
-- maintain) with a profile-personalized realistic target and an ordered series
-- of positioned mesocycles. The `macro_slots` "goal arc" is retired: a macro's
-- progression is now its mesocycles, each carrying a `position` + suggested
-- `phase`, with `unplanned` placeholders for not-yet-planned positions.
-- Append-only (CLAUDE hard rule #2): this migration alters/retires, never edits
-- 20260612000001. RLS unchanged for altered tables (still owner-scoped);
-- the new view ships security_invoker (hard rule #1).
-- See docs/03-data-model.md (macrocycles / mesocycles / macro_slots).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- macrocycles — goal vocabulary + engine target snapshot
-- ---------------------------------------------------------------------------

-- migrate the old cut/gain/maintain vocabulary to the June 2026 goals first,
-- then swap the check constraint (gain ⇒ hypertrophy; strength is net-new)
alter table public.macrocycles drop constraint if exists macrocycles_goal_type_check;
update public.macrocycles set goal_type = 'hypertrophy' where goal_type = 'gain';
alter table public.macrocycles
  add constraint macrocycles_goal_type_check
  check (goal_type in ('hypertrophy', 'strength', 'cut', 'maintain'));

-- create-engine inputs (chosen on fig 2.3) + the planMacrocycle output, cached
-- for display on the Overview (fig 2.2). Nullable so the legacy row survives;
-- the Overview recomputes live when these are null. The per-month rate is
-- cached too (strength's compounding band is not derivable from the total).
alter table public.macrocycles
  add column duration_months int check (duration_months between 1 and 60),
  add column meso_length_weeks int not null default 5 check (meso_length_weeks between 3 and 8),
  add column recommended_duration_months int check (recommended_duration_months between 1 and 60),
  add column target_low numeric,
  add column target_high numeric,
  add column target_unit text,
  add column target_direction text check (target_direction in ('gain', 'loss', 'none')),
  add column rate_low numeric,
  add column rate_high numeric;

-- ---------------------------------------------------------------------------
-- mesocycles — position + suggested phase; unplanned placeholders
-- ---------------------------------------------------------------------------

alter table public.mesocycles
  add column position int check (position between 1 and 24),
  add column phase text check (phase in ('accumulation', 'intensification', 'peak'));

-- carry any existing slot ordering onto the host meso before the table goes
update public.mesocycles m
  set position = s.slot_number
  from public.macro_slots s
  where m.macro_slot_id = s.id and m.position is null;

-- `unplanned` placeholders (Overview/list `+ PLAN` rows) join the status set
alter table public.mesocycles drop constraint if exists mesocycles_status_check;
alter table public.mesocycles
  add constraint mesocycles_status_check
  check (status in ('unplanned', 'planned', 'active', 'completed', 'abandoned'));

-- the slot FK is superseded by position/phase
alter table public.mesocycles drop column macro_slot_id;

create index mesocycles_macro_position_idx
  on public.mesocycles (macrocycle_id, position);

-- ---------------------------------------------------------------------------
-- retire macro_slots (its policy / index / trigger drop with the table)
-- ---------------------------------------------------------------------------

drop table if exists public.macro_slots cascade;

-- ---------------------------------------------------------------------------
-- v_macro_summary (fig 2.2 macro stats) — rolled up across the macro's mesos.
-- One definition of progress shared with MCP (CLAUDE conventions). Est.
-- strength on key lifts is an e1RM trend (engine-side) computed in the query
-- layer over the shared v_exercise_history, not in SQL.
-- ---------------------------------------------------------------------------

create view public.v_macro_summary
with (security_invoker = true) as
select
  m.user_id,
  m.macrocycle_id,
  count(distinct m.id) as meso_count,
  count(distinct w.id) filter (where w.status = 'completed') as sessions_logged,
  count(distinct w.id) as workouts_total,
  count(ls.id) filter (where not ls.is_warmup) as working_sets,
  coalesce(sum(ls.weight * ls.reps) filter (where not ls.is_warmup), 0) as total_volume,
  min(mc.start_date) as first_week_start
from public.mesocycles m
left join public.microcycles mc on mc.mesocycle_id = m.id
left join public.workouts w on w.microcycle_id = mc.id
left join public.logged_sets ls on ls.workout_id = w.id
where m.macrocycle_id is not null
group by m.user_id, m.macrocycle_id;
