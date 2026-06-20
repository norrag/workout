-- Prescription freshness: dependency fingerprint (doc 14).
--
-- A prescription is a cached derived value (the output of prescribe()/seedMeso).
-- It goes stale the instant any input that fed it changes. This column stores a
-- single fingerprint over the CONFIG PROJECTION of the engine inputs + the active
-- engine_params token, so the read-path reconcile can detect staleness by
-- comparing it against the inputs as they are NOW (pull, not push), and recompute
-- exactly the rows that diverged.
--
-- This supersedes the params_version staleness gate (doc 14 §9). That gate's
-- column was only ever defined in an orphaned migration that was never applied to
-- this database; it modeled exactly one input (global params) and could not see
-- per-user / per-exercise change. The fingerprint subsumes it (params version is
-- one component) and self-heals (doc 14 §6.3).
--
-- Existing RLS on workout_exercises (owner via the parent workout) already covers
-- the new column; no new policy is required.

alter table public.workout_exercises
  add column dep_fingerprint text;

comment on column public.workout_exercises.dep_fingerprint is
  'sha256 of the config projection of this prescription''s engine inputs + the engine_params token (doc 14). The read-path reconcile compares it against the freshly resolved inputs; a mismatch recomputes exactly this row. null = never stamped, so recompute on next view (self-healing). Seed / user-added rows carry none until decisions are normalized (doc 14 phase 2).';
