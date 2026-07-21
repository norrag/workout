-- 20260721000001 — one-time catch-up restamp of logged_sets.e1rm to the v11+ model
--
-- Follow-up to T-N33 (queries/e1rm-restamp.ts, PR #147). `logged_sets.e1rm` is a
-- DERIVED display value stamped at log time under the then-active engine params.
-- The T-N33 policy recomputes every stamp on `activate_engine_params` — but ONLY
-- when the incoming version's `e1rm` block differs from the OUTGOING (previously
-- active) one. That guard compares consecutive activations, not the stored stamp.
--
-- The gap: the `e1rm` block changed exactly once — v10 → v11, when
-- `brzycki_max_eff_reps: 10` was introduced (§S3, 2026-06-23), switching the
-- estimate from averaged Epley+Brzycki to Epley-only above 10 effective reps.
-- But v11 shipped INACTIVE and the T-N33 restamp hook did not exist yet; by the
-- time it landed the active version was already well past v11, and every
-- activation since (v11 → … → v25) left the `e1rm` block byte-identical, so
-- `e1rmBlockChanged` returned false and the hook never fired. Result: sets
-- stamped under the pre-v11 averaged formula persisted indefinitely, inflating
-- e1RM on high-rep sets (effective reps > 10) — e.g. the owner's Deadlift read
-- 384.2 where the v11+ model says 367.5 (review doc 2026-07-04 §8.2).
--
-- This migration is the one-time backfill that catches the stored stamps up to
-- the active (v11+) `e1rm` model. After it runs, the existing T-N33 policy is
-- sufficient: any future `e1rm`-block change re-triggers a full restamp.
--
-- Faithfulness: the recompute below reproduces the engine's estimate
-- (`estimateE1rm` in src/lib/engine/predict.ts) for the active params —
-- rir_offset 1, brzycki_max_eff_reps 10:
--     effReps = reps + rir_reported (null ⇒ 0)
--     k       = effReps <= 10 ? avg(1+effReps/30, 36/(37-effReps)) : 1+effReps/30
--     e1rm    = round(weight * k, 1)
-- Deliberately computed in DOUBLE PRECISION (IEEE-754 float64, the same type JS
-- uses) with Math.round reproduced as floor(x*10 + 0.5)/10 — NOT numeric/exact
-- rounding, which disagrees with the engine on ~10 half-way ties (e.g. 22.5×13
-- eff = 32.25 → engine 32.3, exact-decimal 32.2). Verified against the real TS
-- engine across all 1153 distinct (weight, effReps) combos in prod: 0 mismatches.
--
-- Idempotent: only rows whose stamp actually moves are written; non-working rows
-- (weight/reps <= 0) keep their null stamp; confidence bands are unchanged by the
-- v11 delta (the cutoff touches only the value), so e1rm_confidence is untouched.
--
-- NOTE: the hosted prod DB was backfilled out-of-band via the Supabase MCP on
-- 2026-07-21 (4919 rows across 3 users; a rollback snapshot of all prior stamps
-- was taken into ops.e1rm_restamp_backup_20260721 first). On prod this migration
-- is therefore a verified no-op; in every other environment it performs the
-- catch-up. Hard rule #5 is not implicated — `e1rm` is a derived column the
-- amend path already rewrites, not logged truth.

update public.logged_sets ls
set e1rm = sub.new_e1rm
from (
  select
    id,
    (floor(
      (weight::float8) *
      (case
         when (reps + coalesce(rir_reported, 0))::float8 <= 10
              and (reps + coalesce(rir_reported, 0))::float8 < 36
           then ((1 + (reps + coalesce(rir_reported, 0))::float8 / 30)
                 + 36::float8 / (37 - (reps + coalesce(rir_reported, 0))::float8)) / 2
         else (1 + (reps + coalesce(rir_reported, 0))::float8 / 30)
       end)
      * 10 + 0.5) / 10)::numeric(12, 1) as new_e1rm
  from public.logged_sets
  where weight > 0 and reps > 0
) as sub
where ls.id = sub.id
  and ls.e1rm is distinct from sub.new_e1rm;
