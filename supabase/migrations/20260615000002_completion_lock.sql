-- ---------------------------------------------------------------------------
-- 20260615000002 — workout completion lock (Design v2 backlog, fig 1.3)
--
-- Refines hard rule #5 (logged history is append-only). Sets and per-exercise
-- feedback stay editable/deletable *while the parent workout is in_progress*,
-- and lock the moment it is completed — completion runs the engine's next-week
-- generation off that session, so we must not let it change underneath.
--
-- - logged_sets: replace the user-only update policy with one that also
--   requires the parent workout to be in_progress; add a matching delete
--   policy (none existed — deletes were blocked outright).
-- - exercise_feedback: split the blanket "for all" policy into select/insert
--   (own) + update/delete (own AND parent workout in_progress).
--
-- The week N→N+1 job runs on the service role (bypasses RLS), so generation
-- writes are unaffected. Inserts stay open: the first set of a workout is
-- written while the status is still 'planned', and it flips to in_progress
-- immediately after.
-- ---------------------------------------------------------------------------

-- logged_sets ----------------------------------------------------------------

drop policy if exists "logged_sets_update_own" on public.logged_sets;

create policy "logged_sets_update_own" on public.logged_sets
  for update
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.workouts w
      where w.id = logged_sets.workout_id and w.status = 'in_progress'
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.workouts w
      where w.id = logged_sets.workout_id and w.status = 'in_progress'
    )
  );

create policy "logged_sets_delete_in_progress" on public.logged_sets
  for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.workouts w
      where w.id = logged_sets.workout_id and w.status = 'in_progress'
    )
  );

-- exercise_feedback ----------------------------------------------------------

drop policy if exists "exercise_feedback_all_own" on public.exercise_feedback;

create policy "exercise_feedback_select_own" on public.exercise_feedback
  for select using (user_id = auth.uid());

create policy "exercise_feedback_insert_own" on public.exercise_feedback
  for insert with check (user_id = auth.uid());

create policy "exercise_feedback_update_in_progress" on public.exercise_feedback
  for update
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = exercise_feedback.workout_exercise_id
        and w.status = 'in_progress'
    )
  )
  with check (user_id = auth.uid());

create policy "exercise_feedback_delete_in_progress" on public.exercise_feedback
  for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = exercise_feedback.workout_exercise_id
        and w.status = 'in_progress'
    )
  );
