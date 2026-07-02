-- 20260702000003 — R6: workout dates land on the client's local day
--
-- Day buckets (history sessions, PRs, weekly rollups) were derived as
-- `performed_at::date` — the UTC day — so an evening session in a western
-- timezone lands on *tomorrow's* date everywhere it is displayed or grouped.
--
-- Owner ruling (2026-07-02, option b): "store the session at whatever date it
-- was when the client recorded the session." New `logged_sets.performed_on`
-- (date) is supplied by the client at log time; `performed_at` (timestamptz)
-- stays the precise instant. Existing rows backfill to the old UTC bucket —
-- their true local day is unrecoverable — so history reads unchanged and only
-- new sets gain local-day accuracy. The session-grain history view buckets on
-- the new column (coalesced, defensively, onto the old expression).
--
-- RLS: column addition on an RLS-enabled table; the existing owner-scoped
-- row policies cover it unchanged. View keeps security_invoker.

alter table public.logged_sets
  add column if not exists performed_on date;

comment on column public.logged_sets.performed_on is
  'Client-local calendar day the set was performed (R6). Written by the client at log time; pre-R6 rows are backfilled with performed_at::date (UTC). Day-grain reads (history/PRs/rollups) bucket on this, not performed_at.';

update public.logged_sets
set performed_on = (performed_at at time zone 'utc')::date
where performed_on is null;

-- v_exercise_history — same shape as 20260702000002 §3; only the day bucket
-- changes to the client-local day.
create or replace view public.v_exercise_history
with (security_invoker = true) as
select
  ls.user_id,
  ls.exercise_id,
  e.name as exercise_name,
  ls.mesocycle_id,
  ls.microcycle_id,
  ls.workout_id,
  coalesce(ls.performed_on, (ls.performed_at at time zone 'utc')::date) as performed_on,
  count(*) filter (where not ls.is_warmup) as working_sets,
  sum(ls.weight * ls.reps) filter (where not ls.is_warmup) as volume,
  max(ls.weight) filter (where not ls.is_warmup) as top_weight,
  round(avg(ls.e1rm) filter (where not ls.is_warmup), 1) as e1rm,
  avg(ls.rir_reported) filter (where not ls.is_warmup) as avg_rir_reported,
  -- T-A1: the session's single best per-set engine e1RM, for set-grain
  -- comparisons (PR detection) where the session average would understate
  max(ls.e1rm) filter (where not ls.is_warmup) as best_set_e1rm
from public.logged_sets ls
join public.exercises e on e.id = ls.exercise_id
group by ls.user_id, ls.exercise_id, e.name, ls.mesocycle_id, ls.microcycle_id, ls.workout_id,
  coalesce(ls.performed_on, (ls.performed_at at time zone 'utc')::date);

comment on view public.v_exercise_history is
  'Per-session exercise rollup. performed_on = the client-local day the session was logged (R6; pre-R6 rows keep their UTC bucket). e1rm = session average of stored per-set engine e1RM; best_set_e1rm = session max (T-A1).';
