-- 07 Phase 7 — security pass, follow-up to 20260620000001.
--
-- Supabase grants EXECUTE on public functions to anon/authenticated/service_role
-- explicitly (via ALTER DEFAULT PRIVILEGES), not only via PUBLIC, so the prior
-- `revoke ... from public` did not clear the advisor's
-- anon/authenticated_security_definer_function_executable WARNs. Revoke the
-- explicit role grants on the two helper functions that are pure triggers /
-- event triggers and must never be reachable via PostgREST RPC. Triggers fire
-- regardless of EXECUTE grants, so this is behaviour-preserving.
--
-- is_admin() is intentionally NOT revoked: it is referenced by RLS policies on
-- engine_params / engine_decisions / mcp_write_audit that apply to all roles, so
-- it must stay executable (the function only reveals the caller's own admin
-- status — no data leak). Its remaining advisor WARN is accepted as intentional.

revoke execute on function public.handle_new_user() from anon, authenticated;
-- rls_auto_enable() was never created by a migration; guard the revoke so a
-- clean rebuild doesn't abort on a missing function (drift-free — see
-- 20260620000001).
do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'rls_auto_enable'
      and pronamespace = 'public'::regnamespace
  ) then
    revoke execute on function public.rls_auto_enable() from anon, authenticated;
  end if;
end
$$;
