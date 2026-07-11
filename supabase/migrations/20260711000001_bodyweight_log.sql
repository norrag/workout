-- 20260711000001 — bodyweight_log: the measured bodyweight series (doc 17 §5,
-- N41 Phase 4).
--
-- `profiles.bodyweight` is a scalar, so every mass-denominated macro goal
-- (hypertrophy lb / cut lb / maintain) was ungradable in-app. This table is the
-- measurement substrate: dated points appended by explicit user actions —
--   'profile' — the profile bodyweight edit (profile editor, day-view BW chip,
--               onboarding) writes the scalar AND appends the point;
--   'manual'  — the More-page quick entry (09-changelog 2026-07-11), which
--               appends WITHOUT touching the profile scalar;
--   'dexa'    — Phase 5's BodySpec sync (no writer yet).
--
-- MACRO LAYER ONLY (doc 15 §3.3 boundary): the series feeds macro-level
-- verdicts and freshness labels — the Phase-3 retrospective's mass verdict
-- grades measured Δbw against the stored contract when points bracket the
-- macro's logged span (±14 days). It never feeds prescriptions, and
-- `profiles.bodyweight` remains the engine/profile input.
--
-- One row per (user, day, source): re-entering the same day's weight replaces
-- that point (the writer upserts; latest same-day entry wins on read via
-- created_at recency across sources). Append-forever otherwise — no updated_at
-- churn to track, created_at records when the point was (re)entered.

create table public.bodyweight_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- the calendar day the measurement is FOR (backdating allowed)
  measured_on date not null,
  -- pounds (imperial-only app, 20260623120000)
  weight numeric not null check (weight > 0),
  source text not null default 'manual'
    check (source in ('manual', 'profile', 'dexa')),
  created_at timestamptz not null default now(),
  unique (user_id, measured_on, source)
);

alter table public.bodyweight_log enable row level security;

-- default-deny + owner-only (CLAUDE.md #1): identity is auth.uid(), never a
-- column the client sets — initplan-wrapped per the T-R2 perf convention
-- (20260620115322). Delete stays owner-allowed — this is measurement
-- substrate, not logged training history (hard rule 5 protects the latter),
-- and a fat-fingered backdated point must be correctable.
create policy "bodyweight_log_all_own" on public.bodyweight_log
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create index bodyweight_log_user_measured_idx
  on public.bodyweight_log (user_id, measured_on);

comment on table public.bodyweight_log is
  'Measured bodyweight series (doc 17 §5, N41): dated points from explicit user actions (profile edit / quick entry / DEXA sync). Macro-layer measurement substrate only — grades mass-goal retrospectives and freshness labels; never feeds prescriptions. profiles.bodyweight remains the engine input.';

-- ---------------------------------------------------------------------------
-- v_macro_summary: the macro's logged span (first/last completed session)
-- ---------------------------------------------------------------------------
-- The retrospective's mass verdict brackets THIS span (±14 days), and the
-- create-flow priming line normalizes the prior block's est-strength headline
-- over it. Existing columns are unchanged (append-only view amendment, same
-- convention as 20260616000004); shared-views rule — the Overview, MCP, and
-- the create page all read the same definition of the span.

create or replace view public.v_macro_summary
with (security_invoker = true) as
select
  m.user_id,
  m.macrocycle_id,
  count(distinct m.id) as meso_count,
  count(distinct w.id) filter (where w.status = 'completed') as sessions_logged,
  count(distinct w.id) as workouts_total,
  count(ls.id) filter (where not ls.is_warmup) as working_sets,
  coalesce(sum(ls.weight * ls.reps) filter (where not ls.is_warmup), 0) as total_volume,
  min(mc.start_date) as first_week_start,
  count(distinct w.id) filter (
    where w.status = 'completed' and not coalesce(mc.is_deload, false)
  ) as sessions_attended,
  count(distinct w.id) filter (
    where w.status in ('completed', 'skipped') and not coalesce(mc.is_deload, false)
  ) as sessions_due,
  -- the logged span: first/last completed session (doc 17 §5). Null while
  -- nothing is logged — an unlogged block has no measurable span.
  min(w.performed_at) filter (where w.status = 'completed') as first_logged_at,
  max(w.performed_at) filter (where w.status = 'completed') as last_logged_at
from public.mesocycles m
  left join public.microcycles mc on mc.mesocycle_id = m.id
  left join public.workouts w on w.microcycle_id = mc.id
  left join public.logged_sets ls on ls.workout_id = w.id
where m.macrocycle_id is not null
group by m.user_id, m.macrocycle_id;
