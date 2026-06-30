-- Advisor cleanup (workstream J, from the audit) — three low-risk fixes flagged by
-- the Supabase database linter. No app-visible behavior change.

-- 1. SECURITY: `v_exercise_overview` was SECURITY DEFINER (linter ERROR
--    0010_security_definer_view), so it ran with the creator's privileges and
--    bypassed the querying user's RLS. The view aggregates `logged_sets` GROUP BY
--    user_id; every app query already filters `.eq(user_id, …)`, and `logged_sets`
--    RLS is owner-scoped, so under security_invoker the view returns exactly the
--    querying user's own rows — same data the app uses, now properly RLS-enforced
--    (an unauthenticated/other-user read returns nothing instead of all users).
alter view public.v_exercise_overview set (security_invoker = on);

-- 2. PERFORMANCE: cover the `exercise_id` foreign key on `exercise_param_overrides`
--    (linter 0001_unindexed_foreign_keys). The existing index leads with `user_id`,
--    so a cascade/lookup by `exercise_id` alone (e.g. deleting a library exercise)
--    was a seq scan. Read on the reconcile hot path via getExerciseParamOverrides.
create index if not exists exercise_param_overrides_exercise_id_idx
  on public.exercise_param_overrides (exercise_id);

-- 3. PERFORMANCE: the owner RLS policy re-evaluated `auth.uid()` per row (linter
--    0003_auth_rls_initplan). Wrapping it in a scalar subselect makes Postgres
--    evaluate it once per query. Semantically identical (still owner-only).
alter policy "exercise_param_overrides_all_own"
  on public.exercise_param_overrides
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
