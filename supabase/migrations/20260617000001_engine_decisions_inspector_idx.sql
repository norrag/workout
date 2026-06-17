-- ---------------------------------------------------------------------------
-- 20260617000001 — engine_decisions inspector index (07 Phase 6 Slice 4)
--
-- The MCP admin inspector / replay tools (get_engine_decisions, replay_decisions)
-- filter a user's decisions by params version, newest first. The initial schema
-- indexed (user_id, created_at desc) and (workout_exercise_id); this adds the
-- params-version dimension so version-scoped inspection/replay stays cheap as
-- the decision log grows.
--
-- Additive index only — no table, column, or RLS change. engine_decisions
-- selects remain owner-or-admin scoped (initial schema policy unchanged); writes
-- stay service-role (the generation job). Append-only per CLAUDE.md hard rule 2.
-- ---------------------------------------------------------------------------

create index if not exists engine_decisions_user_version_idx
  on public.engine_decisions (user_id, params_version, created_at desc);
