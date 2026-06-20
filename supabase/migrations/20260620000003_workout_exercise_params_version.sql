-- Per-prescription engine_params version stamp — a fast staleness gate for the
-- on-load meso reconcile (PR #51).
--
-- PR #51 reconciles the open plan to the ACTIVE engine_params on every Workout-tab
-- load so activating a new version propagates to every user transparently. But
-- deciding whether anything is stale meant, on every open, joining
-- workout_exercises → engine_decisions and recomputing strength anchors from logged
-- history — work that is almost always wasted (a new version is rare). Stamping the
-- version a prescription was last computed/reconciled under lets the load path
-- settle staleness with one cheap indexed read and skip the heavy replay unless the
-- active version actually moved ahead.

alter table public.workout_exercises
  add column params_version int;

comment on column public.workout_exercises.params_version is
  'engine_params.version this prescription was last computed/reconciled under (null = pre-stamp legacy row). Compared against the active version to gate the on-load meso reconcile; heavy regeneration only runs when a planned row is behind.';

-- Backfill from the latest engine decision per prescription, so a genuinely stale
-- generated row (its decision predates the active version) stays detectable and
-- gets refreshed on the next open.
update public.workout_exercises we
set params_version = d.params_version
from (
  select distinct on (workout_exercise_id)
    workout_exercise_id, params_version
  from public.engine_decisions
  where workout_exercise_id is not null
  order by workout_exercise_id, created_at desc
) d
where d.workout_exercise_id = we.id;

-- Seeded / user-added prescriptions carry no engine decision (the engine only
-- records one at a week advance). The reconcile never re-runs the engine on those
-- (there are no recorded inputs to replay), so mark any still-null row current —
-- otherwise the staleness gate would trip forever on rows it can never refresh.
-- New seeds/adds are stamped at insert time.
update public.workout_exercises
set params_version = (
  select version from public.engine_params where is_active limit 1
)
where params_version is null;
