-- ---------------------------------------------------------------------------
-- 20260702000006 — completion-lock hardening (R5)
--
-- Closes the write-surface gaps the 2026-07-01 repo review found around the
-- completion lock (docs/reviews/2026-07-01-repo-review.md §R5). Until now the
-- lock covered only logged_sets update/delete and exercise_feedback
-- update/delete (20260615000002); the rest of the session surface stayed
-- writable after completion, and child INSERT policies never verified the
-- FK'd parent's owner (FK checks bypass RLS).
--
-- What changes for the authenticated role (the service role bypasses RLS, so
-- generation/advance/reconcile are unaffected):
--   * workouts — updates only while planned/in_progress: no
--     completed→in_progress resurrection (which re-opened every locked set),
--     no notes/performed_at rewrites on a completed session. Inserts must
--     target an owned microcycle and enter as 'planned' (no fabricated
--     history). Deletes only for planned rows carrying no logged sets
--     (hard rule #5 at the DB layer).
--   * workout_exercises — insert/update/delete only while the parent workout
--     is planned/in_progress. prescribed_*/set_weights/status were editable
--     on completed workouts — exactly what the engine reads as `previous`
--     and what the volume views count. Deletes additionally require no
--     logged sets on the slot.
--   * logged_sets — INSERT now requires the parent workout to be owned and
--     planned/in_progress (update/delete were already locked; new sets could
--     still be inserted into a completed workout), and the referenced
--     workout_exercise must belong to that same workout.
--   * workout_feedback — was a bare owner FOR ALL: the session dampener
--     stayed editable after the engine consumed it. Same open-parent lock as
--     the rest; the app saves feedback BEFORE flipping the workout to
--     completed, so completion keeps working.
--   * exercise_feedback — INSERT (and UPDATE's WITH CHECK) gain the
--     parent-ownership + open-status EXISTS. Closes the "feedback-slot
--     squat": exercise_feedback is UNIQUE (workout_exercise_id), so a
--     stranger who learns a victim's workout_exercise uuid could insert a row
--     keyed to it and permanently block the victim's own feedback. Also stops
--     re-pointing an existing row at a locked/foreign slot. UPDATE's USING
--     widens from in_progress to planned/in_progress to match the insert
--     surface (editing pre-session feedback on a planned day was a silent
--     0-row no-op).
--   * microcycles — inserts must target an owned mesocycle; updates only
--     while not completed (no resurrecting a finished week); deletes only for
--     weeks with no logged history.
--
-- App-flow audit (record in docs/PROGRESS.md 2026-07-02): every authed write
-- path was inventoried before this migration. Completion-time writes
-- (workout_exercises status batch, workout_feedback save) happen BEFORE the
-- workout row flips to completed; startMeso/regenerateOpenWorkouts touch only
-- planned rows without logged history; no app path transitions a workout out
-- of completed/skipped. Nothing legitimate is blocked.
--
-- New/replaced quals are written initplan-wrapped — (select auth.uid()) —
-- matching the 20260620115322 posture.
-- ---------------------------------------------------------------------------

-- workouts --------------------------------------------------------------------

drop policy if exists "workouts_all_own" on public.workouts;

create policy "workouts_select_own" on public.workouts
  for select using (user_id = (select auth.uid()));

create policy "workouts_insert_own" on public.workouts
  for insert with check (
    user_id = (select auth.uid())
    and status = 'planned'
    and exists (
      select 1 from public.microcycles m
      where m.id = workouts.microcycle_id
        and m.user_id = (select auth.uid())
    )
  );

create policy "workouts_update_open" on public.workouts
  for update
  using (
    user_id = (select auth.uid())
    and status in ('planned', 'in_progress')
  )
  with check (user_id = (select auth.uid()));

create policy "workouts_delete_planned" on public.workouts
  for delete
  using (
    user_id = (select auth.uid())
    and status = 'planned'
    and not exists (
      select 1 from public.logged_sets ls
      where ls.workout_id = workouts.id
    )
  );

-- workout_exercises -----------------------------------------------------------

drop policy if exists "workout_exercises_all_own" on public.workout_exercises;

create policy "workout_exercises_select_own" on public.workout_exercises
  for select using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = (select auth.uid())
    )
  );

create policy "workout_exercises_insert_open" on public.workout_exercises
  for insert with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = (select auth.uid())
        and w.status in ('planned', 'in_progress')
    )
  );

create policy "workout_exercises_update_open" on public.workout_exercises
  for update
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = (select auth.uid())
        and w.status in ('planned', 'in_progress')
    )
  )
  with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = (select auth.uid())
        and w.status in ('planned', 'in_progress')
    )
  );

create policy "workout_exercises_delete_open" on public.workout_exercises
  for delete
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = (select auth.uid())
        and w.status in ('planned', 'in_progress')
    )
    and not exists (
      select 1 from public.logged_sets ls
      where ls.workout_exercise_id = workout_exercises.id
    )
  );

-- logged_sets -----------------------------------------------------------------

drop policy if exists "logged_sets_insert_own" on public.logged_sets;

create policy "logged_sets_insert_own" on public.logged_sets
  for insert with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.workouts w
      where w.id = logged_sets.workout_id
        and w.user_id = (select auth.uid())
        and w.status in ('planned', 'in_progress')
    )
    and exists (
      select 1 from public.workout_exercises we
      where we.id = logged_sets.workout_exercise_id
        and we.workout_id = logged_sets.workout_id
    )
  );

-- workout_feedback ------------------------------------------------------------

drop policy if exists "workout_feedback_all_own" on public.workout_feedback;

create policy "workout_feedback_select_own" on public.workout_feedback
  for select using (user_id = (select auth.uid()));

create policy "workout_feedback_insert_open" on public.workout_feedback
  for insert with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.workouts w
      where w.id = workout_feedback.workout_id
        and w.user_id = (select auth.uid())
        and w.status in ('planned', 'in_progress')
    )
  );

create policy "workout_feedback_update_open" on public.workout_feedback
  for update
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.workouts w
      where w.id = workout_feedback.workout_id
        and w.status in ('planned', 'in_progress')
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.workouts w
      where w.id = workout_feedback.workout_id
        and w.user_id = (select auth.uid())
        and w.status in ('planned', 'in_progress')
    )
  );

create policy "workout_feedback_delete_open" on public.workout_feedback
  for delete
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.workouts w
      where w.id = workout_feedback.workout_id
        and w.status in ('planned', 'in_progress')
    )
  );

-- exercise_feedback -----------------------------------------------------------

drop policy if exists "exercise_feedback_insert_own" on public.exercise_feedback;

create policy "exercise_feedback_insert_own" on public.exercise_feedback
  for insert with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = exercise_feedback.workout_exercise_id
        and w.user_id = (select auth.uid())
        and w.status in ('planned', 'in_progress')
    )
  );

drop policy if exists "exercise_feedback_update_in_progress" on public.exercise_feedback;

create policy "exercise_feedback_update_in_progress" on public.exercise_feedback
  for update
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = exercise_feedback.workout_exercise_id
        and w.status in ('planned', 'in_progress')
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = exercise_feedback.workout_exercise_id
        and w.user_id = (select auth.uid())
        and w.status in ('planned', 'in_progress')
    )
  );

-- microcycles -----------------------------------------------------------------

drop policy if exists "microcycles_all_own" on public.microcycles;

create policy "microcycles_select_own" on public.microcycles
  for select using (user_id = (select auth.uid()));

create policy "microcycles_insert_own" on public.microcycles
  for insert with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.mesocycles m
      where m.id = microcycles.mesocycle_id
        and m.user_id = (select auth.uid())
    )
  );

create policy "microcycles_update_open" on public.microcycles
  for update
  using (
    user_id = (select auth.uid())
    and status <> 'completed'
  )
  with check (user_id = (select auth.uid()));

create policy "microcycles_delete_open" on public.microcycles
  for delete
  using (
    user_id = (select auth.uid())
    and not exists (
      select 1 from public.logged_sets ls
      where ls.microcycle_id = microcycles.id
    )
  );
