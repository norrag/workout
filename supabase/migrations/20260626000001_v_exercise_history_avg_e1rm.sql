-- 20260626000001 — N2 / T-A1: v_exercise_history.e1rm = session-average engine e1RM
--
-- The per-session e1RM in v_exercise_history was `max(weight * (1 + reps/30.0))`
-- filtered to working sets — the single best set, on raw single-formula Epley
-- (no RIR, no Brzycki cap). Two problems the owner flagged (N2) and the metrics
-- reconciliation (T-A1) close together here:
--
--   1. It took the session MAX, so one strong set defined the whole session. N2:
--      the session stat should AVERAGE over the session's working sets.
--   2. It used a different e1RM formula than the engine. logged_sets.e1rm (PH31)
--      already stores the engine's honest per-set estimate (RIR-aware averaged
--      Epley/Brzycki over effective reps, computed at log/amend time). Averaging
--      that stored column unifies this stat with the engine's e1RM system, so
--      the UI/MCP history stat and the engine no longer diverge in formula.
--
-- New e1rm = round(avg(logged_sets.e1rm) over working sets, 1). avg() ignores
-- nulls, so a working set with no estimate (weight 0) is skipped, never counted
-- as zero; a session of only bodyweight sets yields null (the flip view shows
-- "—"), matching the app-side sessionAvgE1rm helper.
--
-- Read model only: security_invoker preserved, RLS unaffected (reads logged_sets,
-- owner-scoped). No SQL view depends on this one (v_macro_summary / v_meso_summary
-- derive from it in the query layer, not in SQL). Append-only. Dropped + recreated
-- (not create-or-replace) because the e1rm column type changes (double → numeric),
-- which CREATE OR REPLACE VIEW cannot do.

drop view if exists public.v_exercise_history;

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
  -- N2 / T-A1: session-average engine per-set e1RM (was max raw-Epley best set)
  round(avg(ls.e1rm) filter (where not ls.is_warmup), 1) as e1rm,
  avg(ls.rir_reported) filter (where not ls.is_warmup) as avg_rir_reported
from public.logged_sets ls
join public.exercises e on e.id = ls.exercise_id
group by ls.user_id, ls.exercise_id, e.name, ls.mesocycle_id, ls.microcycle_id, ls.workout_id, ls.performed_at::date;
