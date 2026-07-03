-- 20260703000003 — R23: retire the superseded v_meso_week_sets view
--
-- Superseded by v_meso_week_muscle_sets (R14, 20260702000001): role-grain
-- facts the app weights through engine/volume.ts::fractionalSetCount — one
-- counting definition. This view still counted every set as 1.0 for the
-- planner group's assigned muscle only (no fractional 1.0/0.5 weighting, no
-- hard-set gate), and nothing reads it anymore (volume-projection.ts moved to
-- the weighted loader; only the row-type mirror remained). Root CLAUDE.md
-- flagged it "pending retirement with R23" — this is that retirement.
--
-- RLS: view drop only — no table, policy, or grant changes.

drop view public.v_meso_week_sets;
