-- 20260708000001 — store the per-set e1RM confidence band alongside e1rm
--
-- The engine already computes a confidence band for every e1RM estimate
-- (high/moderate/low — `confidenceFor` in engine/predict.ts §1) but only the
-- value was persisted (PH31, 20260623130000). We now stamp the band too, so the
-- estimate's reliability is auditable and surfaceable (history marker, MCP)
-- without recomputing — one honest record of "how much to trust this number".
--
--   confidence =
--     rir_reported is null                          -> 'low'   (unreported RIR)
--     eff <= high_max_eff_reps AND rir <= high_max_rir -> 'high'
--     eff <= mod_max_eff_reps  AND rir <= mod_max_rir  -> 'moderate'
--     else                                          -> 'low'
--   eff = reps + coalesce(rir_reported, 0) * rir_offset
--
-- Only the four confidence thresholds + rir_offset drive the band (the
-- brzycki cutoff moves the value, not the band). Written at log/amend time from
-- the active engine_params going forward (log/actions.ts computeSetE1rm); the
-- activation restamp (e1rm-restamp.ts) rewrites it whenever the e1rm block
-- changes. Null exactly when e1rm is null (bodyweight / non-working input).

alter table public.logged_sets
  add column e1rm_confidence text
    check (e1rm_confidence is null or e1rm_confidence in ('high', 'moderate', 'low'));

comment on column public.logged_sets.e1rm_confidence is
  'Confidence band (high/moderate/low) of the per-set e1rm, stamped alongside it under the active engine_params (engine/predict.ts confidenceFor). Null when e1rm is null.';

-- RLS: the existing logged_sets policies are column-agnostic (owner-scoped on the
-- whole row), so the new column is already covered — no policy change needed.

-- Backfill every stamped set (e1rm not null) with the band under the currently
-- active engine_params, matching what the app writes going forward. (effReps is
-- computed in a derived subquery joined by id — UPDATE...FROM can't reference the
-- target table from a LATERAL item, same shape as the 20260623130000 backfill.)
update public.logged_sets ls
set e1rm_confidence = case
  when ls.rir_reported is null then 'low'
  when sub.eff <= sub.high_max_eff_reps and ls.rir_reported <= sub.high_max_rir then 'high'
  when sub.eff <= sub.mod_max_eff_reps and ls.rir_reported <= sub.mod_max_rir then 'moderate'
  else 'low'
end
from (
  select s.id,
         (s.reps + coalesce(s.rir_reported, 0) * p.rir_offset)::numeric as eff,
         p.high_max_eff_reps,
         p.mod_max_eff_reps,
         p.high_max_rir,
         p.mod_max_rir
  from public.logged_sets s
  cross join (
    select
      coalesce((params -> 'e1rm' ->> 'rir_offset')::numeric, 1) as rir_offset,
      coalesce((params -> 'e1rm' ->> 'high_max_eff_reps')::numeric, 8) as high_max_eff_reps,
      coalesce((params -> 'e1rm' ->> 'mod_max_eff_reps')::numeric, 12) as mod_max_eff_reps,
      coalesce((params -> 'e1rm' ->> 'high_max_rir')::numeric, 2) as high_max_rir,
      coalesce((params -> 'e1rm' ->> 'mod_max_rir')::numeric, 3) as mod_max_rir
    from public.engine_params
    where is_active = true
    limit 1
  ) p
) sub
where ls.id = sub.id
  and ls.e1rm is not null;
