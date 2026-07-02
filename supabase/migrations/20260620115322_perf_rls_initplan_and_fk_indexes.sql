-- 20260620115322 — perf_rls_initplan_and_fk_indexes (T-R2)
--
-- Transcription of the out-of-band HOSTED migration of the same version/name
-- (applied to the hosted project via the dashboard on 2026-06-20 but never
-- committed to this chain — found by the R2 hosted<->clean-DB diff,
-- docs/reviews/2026-07-01-repo-review.md). Body below this header is verbatim
-- from hosted supabase_migrations.schema_migrations.statements[1]
-- (md5 25446aa1f8021cce51116c3cfdbe088d), placed at its true position in the
-- chain. Perf-only: no policy gains or loses rows.
--
-- Two references are deliberate time-capsule state as of 2026-06-20 and are
-- superseded later in the chain, exactly as on hosted:
--   * shares_grantee_accept — dropped by 20260701000002_shares_grantee_lockdown
--   * profiles_update_own WITH CHECK (recursive role subquery) — replaced by
--     20260622220627_fix_profiles_update_recursion
-- Performance pass: RLS initplan optimization + foreign-key covering indexes.
-- 1. auth_rls_initplan: wrap auth.uid()/auth.role()/is_admin() in scalar subqueries
--    so Postgres evaluates them once per query (InitPlan) not once per row.
-- 2. unindexed_foreign_keys: add covering btree indexes.

ALTER POLICY engine_decisions_select_own_or_admin ON public.engine_decisions USING (((user_id = (SELECT auth.uid())) OR (SELECT is_admin())));
ALTER POLICY engine_params_admin_delete ON public.engine_params USING ((SELECT is_admin()));
ALTER POLICY engine_params_admin_insert ON public.engine_params WITH CHECK ((SELECT is_admin()));
ALTER POLICY engine_params_select_authenticated ON public.engine_params USING (((SELECT auth.role()) = 'authenticated'::text));
ALTER POLICY engine_params_admin_update ON public.engine_params USING ((SELECT is_admin()));
ALTER POLICY excluded_exercises_all_own ON public.excluded_exercises USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY exercise_feedback_delete_in_progress ON public.exercise_feedback USING (((user_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM (workout_exercises we
     JOIN workouts w ON ((w.id = we.workout_id)))
  WHERE ((we.id = exercise_feedback.workout_exercise_id) AND (w.status = 'in_progress'::text))))));
ALTER POLICY exercise_feedback_insert_own ON public.exercise_feedback WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY exercise_feedback_select_own ON public.exercise_feedback USING ((user_id = (SELECT auth.uid())));
ALTER POLICY exercise_feedback_update_in_progress ON public.exercise_feedback USING (((user_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM (workout_exercises we
     JOIN workouts w ON ((w.id = we.workout_id)))
  WHERE ((we.id = exercise_feedback.workout_exercise_id) AND (w.status = 'in_progress'::text)))))) WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY emg_delete_own ON public.exercise_muscle_groups USING ((EXISTS ( SELECT 1
   FROM exercises e
  WHERE ((e.id = exercise_muscle_groups.exercise_id) AND (e.user_id = (SELECT auth.uid()))))));
ALTER POLICY emg_write_own ON public.exercise_muscle_groups WITH CHECK ((EXISTS ( SELECT 1
   FROM exercises e
  WHERE ((e.id = exercise_muscle_groups.exercise_id) AND (e.user_id = (SELECT auth.uid()))))));
ALTER POLICY emg_select_visible ON public.exercise_muscle_groups USING ((EXISTS ( SELECT 1
   FROM exercises e
  WHERE ((e.id = exercise_muscle_groups.exercise_id) AND ((e.user_id IS NULL) OR (e.user_id = (SELECT auth.uid())))))));
ALTER POLICY emg_update_own ON public.exercise_muscle_groups USING ((EXISTS ( SELECT 1
   FROM exercises e
  WHERE ((e.id = exercise_muscle_groups.exercise_id) AND (e.user_id = (SELECT auth.uid()))))));
ALTER POLICY exercise_notes_all_own ON public.exercise_notes USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY exercises_delete_own ON public.exercises USING ((user_id = (SELECT auth.uid())));
ALTER POLICY exercises_insert_own ON public.exercises WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY exercises_select_stock_or_own ON public.exercises USING (((user_id IS NULL) OR (user_id = (SELECT auth.uid()))));
ALTER POLICY exercises_update_own ON public.exercises USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY logged_sets_delete_in_progress ON public.logged_sets USING (((user_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM workouts w
  WHERE ((w.id = logged_sets.workout_id) AND (w.status = 'in_progress'::text))))));
ALTER POLICY logged_sets_insert_own ON public.logged_sets WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY logged_sets_select_own ON public.logged_sets USING ((user_id = (SELECT auth.uid())));
ALTER POLICY logged_sets_update_own ON public.logged_sets USING (((user_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM workouts w
  WHERE ((w.id = logged_sets.workout_id) AND (w.status = 'in_progress'::text)))))) WITH CHECK (((user_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM workouts w
  WHERE ((w.id = logged_sets.workout_id) AND (w.status = 'in_progress'::text))))));
ALTER POLICY macrocycles_all_own ON public.macrocycles USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY mcp_write_audit_select_own_or_admin ON public.mcp_write_audit USING (((user_id = (SELECT auth.uid())) OR (SELECT is_admin())));
ALTER POLICY meso_day_groups_all_own ON public.meso_day_groups USING ((EXISTS ( SELECT 1
   FROM meso_days d
  WHERE ((d.id = meso_day_groups.meso_day_id) AND (d.user_id = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM meso_days d
  WHERE ((d.id = meso_day_groups.meso_day_id) AND (d.user_id = (SELECT auth.uid()))))));
ALTER POLICY meso_days_all_own ON public.meso_days USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY meso_exercises_all_own ON public.meso_exercises USING ((EXISTS ( SELECT 1
   FROM mesocycles m
  WHERE ((m.id = meso_exercises.mesocycle_id) AND (m.user_id = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM mesocycles m
  WHERE ((m.id = meso_exercises.mesocycle_id) AND (m.user_id = (SELECT auth.uid()))))));
ALTER POLICY mesocycles_all_own ON public.mesocycles USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY microcycles_all_own ON public.microcycles USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY muscle_groups_select_all ON public.muscle_groups USING (((SELECT auth.role()) = 'authenticated'::text));
ALTER POLICY profiles_insert_own ON public.profiles WITH CHECK ((id = (SELECT auth.uid())));
ALTER POLICY profiles_select_own ON public.profiles USING ((id = (SELECT auth.uid())));
ALTER POLICY profiles_update_own ON public.profiles USING ((id = (SELECT auth.uid()))) WITH CHECK (((id = (SELECT auth.uid())) AND (role = ( SELECT p.role
   FROM profiles p
  WHERE (p.id = (SELECT auth.uid()))))));
ALTER POLICY shares_owner_all ON public.shares USING ((owner_id = (SELECT auth.uid()))) WITH CHECK ((owner_id = (SELECT auth.uid())));
ALTER POLICY shares_grantee_select ON public.shares USING ((grantee_id = (SELECT auth.uid())));
ALTER POLICY shares_grantee_accept ON public.shares USING ((grantee_id = (SELECT auth.uid()))) WITH CHECK ((grantee_id = (SELECT auth.uid())));
ALTER POLICY template_day_groups_delete_own ON public.template_day_groups USING ((EXISTS ( SELECT 1
   FROM (template_days d
     JOIN templates t ON ((t.id = d.template_id)))
  WHERE ((d.id = template_day_groups.template_day_id) AND (t.user_id = (SELECT auth.uid()))))));
ALTER POLICY template_day_groups_insert_own ON public.template_day_groups WITH CHECK ((EXISTS ( SELECT 1
   FROM (template_days d
     JOIN templates t ON ((t.id = d.template_id)))
  WHERE ((d.id = template_day_groups.template_day_id) AND (t.user_id = (SELECT auth.uid()))))));
ALTER POLICY template_day_groups_select_visible ON public.template_day_groups USING ((EXISTS ( SELECT 1
   FROM (template_days d
     JOIN templates t ON ((t.id = d.template_id)))
  WHERE ((d.id = template_day_groups.template_day_id) AND ((t.user_id IS NULL) OR (t.user_id = (SELECT auth.uid())))))));
ALTER POLICY template_day_groups_update_own ON public.template_day_groups USING ((EXISTS ( SELECT 1
   FROM (template_days d
     JOIN templates t ON ((t.id = d.template_id)))
  WHERE ((d.id = template_day_groups.template_day_id) AND (t.user_id = (SELECT auth.uid()))))));
ALTER POLICY template_days_delete_own ON public.template_days USING ((EXISTS ( SELECT 1
   FROM templates t
  WHERE ((t.id = template_days.template_id) AND (t.user_id = (SELECT auth.uid()))))));
ALTER POLICY template_days_write_own ON public.template_days WITH CHECK ((EXISTS ( SELECT 1
   FROM templates t
  WHERE ((t.id = template_days.template_id) AND (t.user_id = (SELECT auth.uid()))))));
ALTER POLICY template_days_select_visible ON public.template_days USING ((EXISTS ( SELECT 1
   FROM templates t
  WHERE ((t.id = template_days.template_id) AND ((t.user_id IS NULL) OR (t.user_id = (SELECT auth.uid())))))));
ALTER POLICY template_days_update_own ON public.template_days USING ((EXISTS ( SELECT 1
   FROM templates t
  WHERE ((t.id = template_days.template_id) AND (t.user_id = (SELECT auth.uid()))))));
ALTER POLICY template_exercises_delete_own ON public.template_exercises USING ((EXISTS ( SELECT 1
   FROM (template_days d
     JOIN templates t ON ((t.id = d.template_id)))
  WHERE ((d.id = template_exercises.template_day_id) AND (t.user_id = (SELECT auth.uid()))))));
ALTER POLICY template_exercises_write_own ON public.template_exercises WITH CHECK ((EXISTS ( SELECT 1
   FROM (template_days d
     JOIN templates t ON ((t.id = d.template_id)))
  WHERE ((d.id = template_exercises.template_day_id) AND (t.user_id = (SELECT auth.uid()))))));
ALTER POLICY template_exercises_select_visible ON public.template_exercises USING ((EXISTS ( SELECT 1
   FROM (template_days d
     JOIN templates t ON ((t.id = d.template_id)))
  WHERE ((d.id = template_exercises.template_day_id) AND ((t.user_id IS NULL) OR (t.user_id = (SELECT auth.uid())))))));
ALTER POLICY template_exercises_update_own ON public.template_exercises USING ((EXISTS ( SELECT 1
   FROM (template_days d
     JOIN templates t ON ((t.id = d.template_id)))
  WHERE ((d.id = template_exercises.template_day_id) AND (t.user_id = (SELECT auth.uid()))))));
ALTER POLICY templates_delete_own ON public.templates USING ((user_id = (SELECT auth.uid())));
ALTER POLICY templates_insert_own ON public.templates WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY templates_select_stock_or_own ON public.templates USING (((user_id IS NULL) OR (user_id = (SELECT auth.uid()))));
ALTER POLICY templates_update_own ON public.templates USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY workout_exercises_all_own ON public.workout_exercises USING ((EXISTS ( SELECT 1
   FROM workouts w
  WHERE ((w.id = workout_exercises.workout_id) AND (w.user_id = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workouts w
  WHERE ((w.id = workout_exercises.workout_id) AND (w.user_id = (SELECT auth.uid()))))));
ALTER POLICY workout_feedback_all_own ON public.workout_feedback USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY workouts_all_own ON public.workouts USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));

CREATE INDEX IF NOT EXISTS engine_decisions_exercise_id_idx ON public.engine_decisions (exercise_id);
CREATE INDEX IF NOT EXISTS engine_decisions_mesocycle_id_idx ON public.engine_decisions (mesocycle_id);
CREATE INDEX IF NOT EXISTS engine_decisions_microcycle_id_idx ON public.engine_decisions (microcycle_id);
CREATE INDEX IF NOT EXISTS engine_decisions_source_workout_exercise_id_idx ON public.engine_decisions (source_workout_exercise_id);
CREATE INDEX IF NOT EXISTS engine_decisions_workout_id_idx ON public.engine_decisions (workout_id);
CREATE INDEX IF NOT EXISTS excluded_exercises_exercise_id_idx ON public.excluded_exercises (exercise_id);
CREATE INDEX IF NOT EXISTS exercise_feedback_muscle_group_id_idx ON public.exercise_feedback (muscle_group_id);
CREATE INDEX IF NOT EXISTS exercise_notes_exercise_id_idx ON public.exercise_notes (exercise_id);
CREATE INDEX IF NOT EXISTS logged_sets_exercise_id_idx ON public.logged_sets (exercise_id);
CREATE INDEX IF NOT EXISTS logged_sets_macrocycle_id_idx ON public.logged_sets (macrocycle_id);
CREATE INDEX IF NOT EXISTS logged_sets_mesocycle_id_idx ON public.logged_sets (mesocycle_id);
CREATE INDEX IF NOT EXISTS logged_sets_microcycle_id_idx ON public.logged_sets (microcycle_id);
CREATE INDEX IF NOT EXISTS logged_sets_workout_id_idx ON public.logged_sets (workout_id);
CREATE INDEX IF NOT EXISTS meso_day_groups_muscle_group_id_idx ON public.meso_day_groups (muscle_group_id);
CREATE INDEX IF NOT EXISTS meso_days_user_id_idx ON public.meso_days (user_id);
CREATE INDEX IF NOT EXISTS meso_exercises_exercise_id_idx ON public.meso_exercises (exercise_id);
CREATE INDEX IF NOT EXISTS mesocycles_template_id_idx ON public.mesocycles (template_id);
CREATE INDEX IF NOT EXISTS template_day_groups_muscle_group_id_idx ON public.template_day_groups (muscle_group_id);
CREATE INDEX IF NOT EXISTS template_exercises_exercise_id_idx ON public.template_exercises (exercise_id);
CREATE INDEX IF NOT EXISTS template_exercises_template_day_group_id_idx ON public.template_exercises (template_day_group_id);
CREATE INDEX IF NOT EXISTS templates_source_template_id_idx ON public.templates (source_template_id);
CREATE INDEX IF NOT EXISTS workout_exercises_exercise_id_idx ON public.workout_exercises (exercise_id);
CREATE INDEX IF NOT EXISTS workout_exercises_muscle_group_id_idx ON public.workout_exercises (muscle_group_id);