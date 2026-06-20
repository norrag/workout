-- 20260620000005 — engine_decisions.kind: normalize seed vs advance (doc 14 phase 2)
--
-- A prescription is a cached derived value produced by one of TWO engine entries:
--   * "advance" — prescribe(), the week N → N+1 progression (the only kind recorded
--                 before this migration)
--   * "seed"    — seedMeso(), a cold start: meso activation, an open-workout
--                 regeneration on a plan edit, or a slot added during a workout
--
-- Phase 1 (doc 14) recorded a decision only for advances, so seed rows carried no
-- replay source and were SKIPPED by the read-path freshness reconcile. Phase 2
-- (§6.2) records a decision for seeds too, tagged with this column, so the recompute
-- dispatcher can re-run the engine of the right `kind` on the stored config inputs
-- with the live config overlaid — one uniform replay path, no per-origin special case.
--
-- Additive column with a default; existing rows are all advances (only generateDay
-- wrote decisions before this), so the default backfills them correctly. RLS on
-- engine_decisions is unchanged (owner-or-admin select; writes are service-role
-- only) — this column changes no access, so the existing policy already covers it.

alter table public.engine_decisions
  add column kind text not null default 'advance'
    check (kind in ('seed', 'advance'));

comment on column public.engine_decisions.kind is
  'which engine entry produced this decision: "advance" (prescribe, week N→N+1) or "seed" (seedMeso: meso start / open-workout regeneration / slot added during a workout). The read-path freshness recompute dispatches on this (doc 14 §6.2); replay_decisions re-runs the matching engine. Existing rows default to advance (the only kind recorded before phase 2).';
