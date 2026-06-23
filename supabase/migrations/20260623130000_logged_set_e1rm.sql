-- 20260623130000 — PH31: store the engine's per-set e1RM with each logged set
--
-- e1RM was only ever computed on read (the stats views use a raw single-formula
-- Epley; the engine uses an averaged Epley/Brzycki over *effective* reps). For
-- auditability (PH31) and the tap-to-flip history view (PH32) we persist the
-- engine's honest per-set estimate alongside the set, computed at log/amend time
-- from the active engine_params. This is additive: the stats views and their
-- raw-Epley `e1rm` are left untouched (the broader two-systems reconciliation is
-- T-A1).
--
--   effectiveReps = reps + coalesce(rir_reported, 0) * rir_offset
--   e1RM = effectiveReps >= 36 ? Epley
--                              : mean(Epley, Brzycki)        -- Brzycki → ±∞ at 37
--   Epley   = weight * (1 + effReps/30)
--   Brzycki = weight * 36 / (37 - effReps)
-- null for weight <= 0 (bodyweight) or reps <= 0 — matches estimateE1rm().

alter table public.logged_sets
  add column e1rm numeric;

comment on column public.logged_sets.e1rm is
  'Engine per-set e1RM estimate (averaged Epley/Brzycki over effective reps = reps + rir*rir_offset), computed at log/amend time from the active engine_params. Null for weight<=0 (bodyweight) or non-working input. Distinct from the raw-Epley e1rm exposed by v_exercise_history.';

-- RLS: the existing logged_sets policies are column-agnostic (owner-scoped on the
-- whole row), so the new column is already covered — no policy change needed.

-- Backfill every historical working set with the same formula, reading rir_offset
-- from the currently-active engine_params row so stored values match what the app
-- writes going forward.
update public.logged_sets ls
set e1rm = round(
  case
    when eff >= 36 then ls.weight * (1 + eff / 30.0)
    else (ls.weight * (1 + eff / 30.0) + (ls.weight * 36.0) / (37 - eff)) / 2.0
  end::numeric,
  1
)
from (
  select coalesce((params -> 'e1rm' ->> 'rir_offset')::numeric, 1) as rir_offset
  from public.engine_params
  where is_active = true
  limit 1
) p,
lateral (
  select (ls.reps + coalesce(ls.rir_reported, 0) * p.rir_offset)::numeric as eff
) e
where ls.weight > 0
  and ls.reps > 0;
