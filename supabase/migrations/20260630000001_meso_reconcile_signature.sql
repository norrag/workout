-- Read-path reconcile gate (doc 14 / workstream J #1).
--
-- Every surface that shows prescriptions calls `ensureFreshPrescriptions` on open,
-- which runs the full per-row freshness reconcile + generation gap-heal — ~8-10
-- round-trips — even when nothing has changed. This column stores a cheap
-- meso-level staleness *signature* (a hash of every meso-global input that feeds a
-- prescription's dependency fingerprint: the active engine_params version, the
-- meso RIR ramp, the macro goal, the user's experience level, the per-user override
-- watermark, the exercise-library watermark, and a completed-work watermark). When
-- the live signature equals this stamp, no row can be stale and no generation gap
-- can have opened, so the reconcile is skipped.
--
-- The gate is conservative by construction: each component maps to a fingerprint
-- input, and the coarse watermarks only ever *over*-trigger (an extra, harmless
-- reconcile) — never under-trigger (a missed stale row). See
-- `src/lib/queries/regeneration.ts` (`loadMesoStaleInputs` / `mesoStaleSignature`).

alter table public.mesocycles
  add column last_reconcile_sig text;

comment on column public.mesocycles.last_reconcile_sig is
  'sha256 of the meso-global freshness inputs at the last successful read-path '
  'reconcile (engine_params version + RIR ramp + macro goal + profile experience '
  '+ override/exercise/completed-work watermarks). Gate: live signature == this '
  'column => no prescription can be stale => skip the reconcile. Conservative — any '
  'uncertainty busts the match. Written by reconcilePrescriptions; never edited by '
  'hand. See src/lib/queries/regeneration.ts.';

-- No backfill: a null signature means "never reconciled under the gate" and
-- correctly forces one full reconcile on the next open of each existing meso, which
-- stamps it. RLS is unchanged — the existing owner-scoped `mesocycles_all_own`
-- policy already covers this column; the reconcile writes via the service client
-- scoped `.eq(user_id, …)` exactly like its other writes (hard rule #4).
