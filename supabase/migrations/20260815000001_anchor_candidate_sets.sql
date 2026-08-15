-- N88 — the strength anchor stops starving on batch size.
--
-- THE DEFECT. `getExerciseE1rmAnchors` (queries/anchors.ts) fetched every
-- exercise's anchor candidates with ONE recency-ordered read bounded by a
-- global `.limit(600)`. That is a per-CALL cap, not a per-EXERCISE one: the
-- rows it returns are the BATCH's 600 most recent sets, so an exercise trained
-- on a longer rotation than its batch-mates can have its whole history pushed
-- past the cutoff by OTHER exercises' recent sets. The anchor query then hands
-- back nothing for it, the seed reads that as "no history", and the athlete
-- gets a blank starting weight on a lift they have years of data for.
--
-- The bug is a function of BATCH WIDTH, not of age — which is why it bites the
-- meso seed (one call, every exercise in the plan) and not the single-exercise
-- paths, and why re-seeding the same exercise alone silently "fixes" it. The
-- module comment above the old limit reasoned that skipping a `performed_at`
-- recency floor kept old-but-real history usable; the global LIMIT over a
-- recency-ordered union was exactly that floor in disguise, with a cutoff that
-- moved with how many other exercises were in the plan.
--
-- Observed (owner's 2026-08-10 seed of "August '26 - Bulk", 23 exercises):
-- 815 eligible sets sat newer than Kneeling Hamstring Curl's most recent set,
-- so all 66 of its rows fell outside the cap (best rank 755) — as did all 52 of
-- Barbell Hip Thrust's (best rank 2860). Those two, and only those two, seeded
-- `strengthAnchor: null`. Hip Thrust was re-seeded alone two days later and
-- immediately anchored at 286.7 lb off the same untouched history.
--
-- THE FIX. Rank each user's candidate sets WITHIN an exercise, so the bound is
-- per-exercise and one lift's rotation can never evict another's. Consumers ask
-- for `set_rank <= N`; Postgres applies that as a WindowAgg Run Condition and
-- stops early per partition, so egress stays bounded without a global cutoff.
-- `logged_sets_user_exercise_idx (user_id, exercise_id, performed_at desc)`
-- already serves the partition + order exactly.
--
-- Eligibility lives in the view so the RANK WINDOW MATCHES what the caller can
-- actually use — a rank slot spent on a row the caller would discard is the
-- same starvation in miniature:
--   * warmups and 0-rep rows are never anchor candidates (doc 11);
--   * N3 — only PREVIOUS COMPLETED workouts feed prescriptions, so the
--     in-progress session's sets must not consume rank slots either.
-- The `weight > 0` filter deliberately stays OUT: under the bodyweight model
-- (`bodyweight_model`, live) a bodyweight set is entered as 0 and anchors on
-- effective load, so the view must return it. With the flag off the caller adds
-- `.gt("weight", 0)` itself; those rows cost a rank slot before being dropped,
-- which is immaterial at the per-exercise depth the caller asks for.
--
-- `id desc` breaks ties: imported history shares one `performed_at` across a
-- whole session, and an unstable sort at the boundary would truncate a session
-- mid-way and hand the engine a partial `session_best`.
--
-- Read model only — security_invoker, so the owner-scoped RLS on `logged_sets`
-- and `workouts` governs it unchanged.

create view public.v_anchor_candidate_sets
with (security_invoker = true) as
select
  ls.user_id,
  ls.exercise_id,
  ls.workout_exercise_id,
  ls.workout_id,
  ls.weight,
  ls.reps,
  ls.rir_reported,
  ls.performed_at,
  ls.bodyweight,
  row_number() over (
    partition by ls.user_id, ls.exercise_id
    order by ls.performed_at desc, ls.id desc
  ) as set_rank
from public.logged_sets ls
join public.workouts w
  on w.id = ls.workout_id
 and w.status = 'completed'
where ls.is_warmup = false
  and ls.reps > 0;

comment on view public.v_anchor_candidate_sets is
  'Anchor candidate sets ranked per (user, exercise) by recency — N88. Filter '
  '`set_rank <= N` for a PER-EXERCISE bound; a global LIMIT lets one lift''s '
  'rotation evict another''s history and seed a blank weight. Already filtered '
  'to completed, non-warmup, rep-bearing sets so the rank window matches '
  'eligibility. Zero-weight rows are kept for the bodyweight model.';
