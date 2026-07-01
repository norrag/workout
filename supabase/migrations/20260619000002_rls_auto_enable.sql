-- Reconcile an out-of-band hosted object into version control (R2, 2026-07-01).
--
-- public.rls_auto_enable() + the `ensure_rls` event trigger have existed on the
-- hosted DB since ~2026-06-20 but were never committed as a migration (a hard
-- rule #2 violation): 20260620000001/2 REVOKE on the function, so a clean-DB
-- apply (`supabase db reset`, the CI rls-tests job) aborted on the dangling
-- reference. This migration is the runbook's prescribed fix
-- (docs/deployment/manual-operations.md → "Migration reconciliation"): capture
-- the hosted definition verbatim, sequenced BEFORE 0620 so the revokes resolve.
--
-- Function body transcribed exactly from hosted pg_get_functiondef() on
-- 2026-07-01. Everything here is idempotent (create-or-replace + guarded
-- trigger creation), so applying it to hosted — where both objects already
-- exist — is a no-op recorded for bookkeeping. Grants are intentionally NOT
-- touched here: the default function privileges apply on creation and
-- 20260620000001/2 then narrow them, reproducing hosted's end state
-- (execute: postgres + service_role only).
--
-- What it does: auto-enables row level security on every table created in
-- `public` (hard rule #1's backstop — a forgotten `enable row level security`
-- can never ship an unprotected table).

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    execute $ddl$
      create event trigger ensure_rls
        on ddl_command_end
        when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
        execute function public.rls_auto_enable()
    $ddl$;
  end if;
end
$$;
