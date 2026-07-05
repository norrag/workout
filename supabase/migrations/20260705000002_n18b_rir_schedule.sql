-- 20260705000002 — N18-B: per-week independent RIR (mesocycles.rir_schedule)
--
-- The owner's Batch-7 ask: "we might as well allow the RIR for each week to be
-- set independently, rather than just choosing a ramp, for more flexibility."
-- Part A (create-time ramp disclosure) shipped in PR #140; this adds the data
-- model for Part B.
--
-- `rir_schedule` is an explicit per-WORKING-week RIR array (the deload week's
-- RIR always comes from the active engine_params, exactly as the interpolated
-- ramp does). NULL ⇒ the existing rir_start→rir_end linear ramp; when present,
-- `rirRamp()` emits schedule[i] per working week instead of interpolating.
-- Values are deliberately unordered (any 0–5 per week — flexibility is the
-- point), so the rir_start >= rir_end descend check does NOT apply to it;
-- rir_start/rir_end remain the summary/fallback pair.
--
-- Length consistency with `weeks`/`includes_deload` is owned by the app layer
-- (zod on every boundary + updateMesocycleAttrs clears a schedule orphaned by
-- a shape edit that doesn't re-supply it); the DB check pins element bounds and
-- a sane length envelope (working weeks are 2..8: weeks 3..8, deload −1).
--
-- Freshness (doc 14): per-week RIR already flows into the prescription
-- fingerprint through `week.targetRir` (microcycles.target_rir), and a
-- schedule edit reaches planned rows through the read-path reconcile — the
-- schedule is added to the meso stale-signature inputs in the same PR, so the
-- gate fires on a schedule-only edit. This is the framework's literal worked
-- example (doc 14 §"worked example").
--
-- RLS: column on an existing RLS-guarded table; the per-user policies on
-- `mesocycles` (owner-only select/insert/update/delete, default deny) apply
-- unchanged — no new policy surface.

alter table public.mesocycles
  add column if not exists rir_schedule int[] null;

alter table public.mesocycles
  add constraint mesocycles_rir_schedule_shape check (
    rir_schedule is null
    or (
      array_length(rir_schedule, 1) between 2 and 8
      and rir_schedule <@ array[0, 1, 2, 3, 4, 5]
    )
  );

comment on column public.mesocycles.rir_schedule is
  'N18-B: explicit per-working-week target RIR (deload week excluded — its RIR comes from engine_params). NULL = interpolate rir_start→rir_end. Length must equal the working weeks (app-enforced).';
