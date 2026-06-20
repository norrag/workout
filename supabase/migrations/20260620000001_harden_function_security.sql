-- 07 Phase 7 — security pass. Resolves the Supabase security advisor WARNs on
-- public functions. No table, column, or RLS-policy change; grants + a pinned
-- search_path only.
--
-- Findings addressed:
--   * function_search_path_mutable: set_updated_at() had no fixed search_path.
--   * anon/authenticated_security_definer_function_executable: trigger and
--     event-trigger helpers were callable via PostgREST RPC by anon/authenticated
--     because the default EXECUTE grant goes to PUBLIC.
--
-- Triggers and event triggers fire regardless of EXECUTE grants, so revoking the
-- direct-call privilege is safe. is_admin() is referenced inside RLS policies
-- evaluated as the `authenticated` role, so it must keep an explicit grant to
-- authenticated — only the blanket PUBLIC (anon) grant is dropped.

-- Pin the trigger function's search_path (the one mutable-path finding).
alter function public.set_updated_at() set search_path = '';

-- Remove the implicit PUBLIC execute grant on the internal helpers so they can't
-- be invoked directly via /rest/v1/rpc/*.
revoke execute on function public.set_updated_at() from public;
revoke execute on function public.handle_new_user() from public;
-- rls_auto_enable() is referenced here but was never created by a migration, so
-- an unguarded REVOKE aborts a clean `supabase db reset` ("function does not
-- exist"). Guard it: a no-op where the function is absent, an identical revoke
-- where it exists — drift-free either way.
do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'rls_auto_enable'
      and pronamespace = 'public'::regnamespace
  ) then
    revoke execute on function public.rls_auto_enable() from public;
  end if;
end
$$;
revoke execute on function public.is_admin() from public;

-- RLS policies call is_admin() as the authenticated role; keep it callable there.
grant execute on function public.is_admin() to authenticated;
