-- 20260624000003 — workout_exercises.params_version (legible "accurate as of Vx")
--
-- doc 14's freshness fingerprint proves a prescription is accurate under the active
-- engine_params version, but it is an opaque sha256 — so "which version is this row
-- accurate as of?" wasn't answerable without recomputing the hash. That caused real
-- confusion: a row whose v11 recompute produced the SAME numbers keeps its older
-- engine_decisions row (no new decision is written when nothing changes), so the
-- only version label visible was the decision's — making fresh rows look stale.
--
-- This adds an explicit, legible stamp: the engine_params version this prescription
-- was last COMPUTED or verified-still-accurate under. It advances on EVERY reconcile
-- confirmation (changed, unchanged, or self-healed), not only when the numbers move,
-- so a planned row always advertises the latest version it is known-correct under.
-- It is stamped together with dep_fingerprint at every write site (generation, seed,
-- recompute) plus a one-time catch-up on the fresh-row short-circuit, so it stays
-- consistent with the fingerprint (the version is already a fingerprint component).
--
-- Additive + nullable; existing RLS on workout_exercises (owner via parent workout)
-- already covers it. Backfilled from each row's latest engine_decisions version (the
-- honest version it was last computed under); the read-path reconcile advances any
-- still-fresh planned row to the active version on its next view.

alter table public.workout_exercises
  add column if not exists params_version integer;

comment on column public.workout_exercises.params_version is
  'engine_params version this prescription was last computed or verified-accurate under (doc 14). Advances on every reconcile confirmation, even when the numbers do not change, so a row always advertises "accurate as of Vx". null = never stamped. Distinct from engine_decisions.params_version, which only advances on an actual numeric change.';

-- backfill: the version each row was last computed under = its latest decision's
-- params_version (null where a row has no decision yet — the reconcile stamps it).
update public.workout_exercises we
set params_version = d.params_version
from (
  select distinct on (workout_exercise_id) workout_exercise_id, params_version
  from public.engine_decisions
  where workout_exercise_id is not null
  order by workout_exercise_id, created_at desc
) d
where d.workout_exercise_id = we.id;
