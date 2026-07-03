-- 20260703000002 — R23: retire the dead v_muscle_group_volume view
--
-- Defined in the initial schema and never consumed by any app/MCP code path.
-- It also disagrees with the locked counting definitions, so leaving it
-- queryable invites a second definition of progress (root CLAUDE.md: stats
-- and MCP share ONE set of views):
--   * fixed date_trunc('week') boundary — UTC Mondays, ignoring the profile's
--     week_starts_on and the microcycle structure everything else uses;
--   * integer primary/secondary set counts — not the fractional 1.0/0.5
--     weighting locked in doc 10 §2 (engine/volume.ts::fractionalSetCount);
--   * no hard-set (RIR ≤ 4) gate.
-- The live per-(week, muscle) surface is v_meso_week_muscle_sets (R14).
--
-- RLS: view drop only — no table, policy, or grant changes.

drop view public.v_muscle_group_volume;
