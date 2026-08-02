-- 20260802000002 — doc 21 Phase 2b: the measuring band (§6.1)
--
-- §4.3 made the prescribed RIR unbounded so one lever spans deload → rehab →
-- extra effort. That is safe only with this guard, and §10 says so explicitly:
-- "§4.3's unbounded ceiling must not reach production without it."
--
-- The problem it solves. Doc 21 §2 (A1) made the prescribed RIR a MEASUREMENT
-- input — `assumedRir = rir_reported ?? target_rir` feeds the e1RM stamp and the
-- strength anchor. An unbounded ask therefore silently asserts a strength
-- measurement nobody observed: under Epley each RIR step is worth ~3.3% of
-- e1RM, so at RIR 21 the estimate is ~70% assumption and ~30% observation, and
-- past ~36 effective reps the curves are outside the band they were fitted on.
-- Meanwhile the confidence ladder bottoms out at `low` (`mod_max_rir: 3`), so a
-- set at RIR 4 and a set at RIR 21 currently make the SAME honesty claim.
--
-- The guard. Past `e1rm.max_measuring_rir` a set is priced and performed
-- normally but is NOT treated as a measurement:
--   * `logged_sets.e1rm` = null, `e1rm_confidence` = 'none' (a new label BELOW
--     `low` — it answers "is this a measurement at all", not "how precise");
--   * dropped from the strength anchor (`queries/anchors.ts`);
--   * excluded from every strength surface — and because they all aggregate
--     `logged_sets.e1rm` (max/avg ignore nulls), that exclusion is by
--     construction rather than by a filter each view has to remember;
--   * KEPT in volume / adherence surfaces (§9.1, owner-confirmed): the work
--     happened, it consumed recovery budget and occupied a slot in the week.
--     Dropping it would make MEV/MAV/MRV read as under-dosed during exactly the
--     block where the athlete is complying.
--
-- The gate is on the ASSUMED-RIR component, not on total effective reps: a
-- logged 15-rep set at RIR 1 is 15 reps of OBSERVATION, while a 9-rep set at
-- RIR 21 is 9 observed and 21 asserted. Gating on effective reps would punish
-- honest high-rep work; gating on RIR targets exactly the fictional component.
--
-- Consequence worth stating: during a deep back-off the anchor FREEZES at its
-- last measured value rather than drifting on fictional data. That is the
-- intended trade (doc 16 principle 1 — never fabricate a measurement); a
-- backed-off set INSIDE the band still anchors, because it is RIR-adjusted and
-- therefore comparable.
--
-- Nothing changes until v24 is activated: `max_measuring_rir` is `.optional()`
-- and ABSENT from every row up to and including the active v23, and absent ⇒
-- byte-identical parse, hash, and behavior.

-- ---------------------------------------------------------------------------
-- 1. the `none` confidence label
-- ---------------------------------------------------------------------------

alter table public.logged_sets
  drop constraint if exists logged_sets_e1rm_confidence_check,
  add constraint logged_sets_e1rm_confidence_check
    check (
      e1rm_confidence is null
      or e1rm_confidence in ('high', 'moderate', 'low', 'none')
    );

comment on column public.logged_sets.e1rm_confidence is
  'Confidence band of the per-set e1rm, stamped alongside it under the active engine_params (engine/predict.ts). high/moderate/low = how precise the estimate is. doc 21 §6.1: ''none'' = NOT A MEASUREMENT — the set was priced past e1rm.max_measuring_rir, so e1rm is null and every strength surface skips it while volume surfaces keep it. Null when e1rm is null for a non-working/bodyweight input.';

-- ---------------------------------------------------------------------------
-- 2. v_exercise_prs — honor the stored stamp
-- ---------------------------------------------------------------------------
--
-- Unlike the other strength surfaces, this view RE-COMPUTES e1RM in SQL from
-- `coalesce(ls.rir_reported, 0)` instead of reading the stamp. Two doc-21 rules
-- pass it by as a result: §2's shared resolution (`rir_reported ?? the slot's
-- prescribed target_rir` — the view still reads an unreported RIR as 0, i.e.
-- taken to failure, which is exactly the N71 defect Phase 1 closed everywhere
-- else) and §6.1's band.
--
-- Fix both by reading `logged_sets.e1rm` — the one stamped definition, which
-- already carries the shared resolution AND the band. The in-view expression is
-- kept only as a COALESCE fallback for any row that was never stamped, so no
-- historical PR can vanish; every row today is stamped (backfilled by
-- 20260623130000 and restamped by 20260721000001 + the `restamp_e1rm` tool), so
-- the fallback is belt-and-braces. Sets explicitly marked non-measuring are
-- excluded outright — they must not fall through to the fallback.
--
-- best_weight / best_reps keep their "coherent set" semantics (20260624000001):
-- the weight and reps of the single best-e1RM set, never a cross-set max.

drop view if exists public.v_exercise_prs;

create view public.v_exercise_prs
with (security_invoker = true) as
with active as (
  select
    coalesce((params -> 'e1rm' ->> 'rir_offset')::numeric, 1) as rir_offset,
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
    coalesce(
      ls.e1rm,
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
      )
    ) as e1rm
  from public.logged_sets ls
  cross join active a
  where not ls.is_warmup
    and ls.weight > 0
    and ls.reps > 0
    -- doc 21 §6.1: never a PR off a set the app didn't measure
    and ls.e1rm_confidence is distinct from 'none'
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

comment on view public.v_exercise_prs is
  'Per user × exercise best set: best_weight/best_reps are the COHERENT pair from the single best-e1RM set. e1RM reads the stored per-set stamp (doc 21 §2 resolution + §6.1 measuring band), falling back to an in-view estimate only for never-stamped rows; sets stamped ''none'' (non-measuring) are excluded.';
