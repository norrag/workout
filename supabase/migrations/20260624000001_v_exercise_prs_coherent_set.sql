-- 20260624000001 — v_exercise_prs: report a coherent best set (§S2)
--
-- Standalone-prescription investigation (docs/reviews/2026-06-23-standalone-
-- prescription-investigation.md §2.2 / §S2). The view reported three INDEPENDENT
-- per-column maxes:
--
--   max(weight)  as best_weight
--   max(reps)    as best_reps
--   max(weight * (1 + reps/30.0)) as best_e1rm   -- raw Epley, no RIR, no cap
--
-- so best_weight and best_reps could come from DIFFERENT sets — a (heaviest
-- weight × most reps) pair the user never performed (e.g. Seated Leg Curl
-- returned 140 × 30 from a 140×12 heavy day and a 100×30 burnout). That
-- fabricated pair was handed to seedMeso as the meso-start `priorPeak`.
--
-- Fix: pick the SINGLE best set by the engine's honest e1RM (one real set), so
-- best_weight/best_reps are a coherent pair, and compute best_e1rm with the same
-- estimator the engine uses — averaged Epley/Brzycki over EFFECTIVE reps
-- (reps + rir·rir_offset) with the §S3 cutoff (Brzycki only ≤ brzycki_max_eff_reps,
-- Epley above) — instead of raw single-formula Epley. Both tunables are read from
-- the ACTIVE engine_params, so the view tracks the engine in lockstep: it taming
-- of the high-rep e1RM blow-up lands when the §S3 params version is activated
-- (brzycki_max_eff_reps absent ⇒ the legacy `< 36 ⇒ average` rule, matching every
-- pre-v11 row). The "coherent set" fix (best_weight/reps from one set) is
-- immediate and independent of activation.
--
-- NOTE (semantic change): best_weight/best_reps are now the weight/reps of the
-- best-e1RM set, not the all-time heaviest weight and most reps independently.
-- Consumers (stats, coaching weight_pr fallback, exercises page, copy-meso,
-- generation prById) display/seed from this as "your best" — still truthful, now
-- coherent. Once §S1 is active the meso seed prefers the recency anchor over this
-- peak anyway; the peak remains the fallback.
--
-- Read model only: security_invoker preserved, RLS unaffected (reads logged_sets,
-- which is owner-scoped). Append-only — replaces the view. Dropped + recreated
-- (not create-or-replace) because best_e1rm's type changes (double → numeric).

drop view if exists public.v_exercise_prs;

create view public.v_exercise_prs
with (security_invoker = true) as
with active as (
  -- the active engine_params drives the estimator, so the view and the engine
  -- never diverge; defaults match the engine's legacy fallbacks.
  select
    coalesce((params -> 'e1rm' ->> 'rir_offset')::numeric, 1) as rir_offset,
    -- absent ⇒ NULL ⇒ legacy "< 36 ⇒ average" rule (see §S3 e1rmFactor)
    (params -> 'e1rm' ->> 'brzycki_max_eff_reps')::numeric as brzycki_max_eff_reps
  from public.engine_params
  where is_active = true
  limit 1
),
scored as (
  select
    ls.user_id,
    ls.exercise_id,
    ls.weight,
    ls.reps,
    ls.performed_at,
    round(
      case
        when (ls.reps + coalesce(ls.rir_reported, 0) * a.rir_offset) < 36
         and (a.brzycki_max_eff_reps is null
              or (ls.reps + coalesce(ls.rir_reported, 0) * a.rir_offset) <= a.brzycki_max_eff_reps)
        then (
          ls.weight * (1 + (ls.reps + coalesce(ls.rir_reported, 0) * a.rir_offset) / 30.0)
          + (ls.weight * 36.0)
            / (37 - (ls.reps + coalesce(ls.rir_reported, 0) * a.rir_offset))
        ) / 2.0
        else ls.weight * (1 + (ls.reps + coalesce(ls.rir_reported, 0) * a.rir_offset) / 30.0)
      end::numeric,
      1
    ) as e1rm
  from public.logged_sets ls
  cross join active a
  where not ls.is_warmup
    and ls.weight > 0
    and ls.reps > 0
)
select distinct on (s.user_id, s.exercise_id)
  s.user_id,
  s.exercise_id,
  e.name as exercise_name,
  s.weight as best_weight,
  s.reps as best_reps,
  s.e1rm as best_e1rm,
  max(s.performed_at) over (partition by s.user_id, s.exercise_id) as last_performed_at
from scored s
join public.exercises e on e.id = s.exercise_id
order by s.user_id, s.exercise_id, s.e1rm desc nulls last, s.weight desc, s.performed_at desc;
