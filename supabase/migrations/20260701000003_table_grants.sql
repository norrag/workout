-- Reconcile table grants into the migration chain (R2, 2026-07-01).
--
-- No migration ever GRANTed on tables: the chain silently relied on the
-- environment's default privileges. Hosted has them (every table carries
-- postgres-stamped ALL grants for anon/authenticated/service_role — verified
-- via pg_class.relacl), but the CI local stack does not apply them to
-- migration-created tables, so the first-ever run of the RLS suite failed with
-- "permission denied for table macrocycles" before RLS was even evaluated.
--
-- This reproduces hosted's grant posture explicitly. It does NOT loosen
-- security: RLS is enabled default-deny on every table (hard rule #1), so
-- policies remain the gate — grants only let the roles reach the tables, as on
-- hosted. Functions are deliberately untouched (20260620000001/2 revoked
-- specific ones; a blanket function grant would undo that).
--
-- Idempotent; on hosted every statement is a recorded no-op.

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- future tables/sequences created by the role that applies migrations in this
-- environment (postgres on hosted; the CLI's migration role locally)
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
