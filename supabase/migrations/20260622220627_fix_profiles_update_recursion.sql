-- ===========================================================================
-- Fix infinite recursion in the profiles UPDATE policy (PH35 real cause)
--
-- profiles_update_own's WITH CHECK guarded against role self-escalation with
--   role = (select p.role from public.profiles p where p.id = auth.uid())
-- a subquery on profiles *inside* a profiles policy. Postgres flags this as
-- "42P17 infinite recursion detected in policy", so EVERY regular-user UPDATE
-- to profiles fails — auto-match toggle, units, profile edits, onboarding.
-- (Latent since the initial schema; surfaced once Postgres started enforcing
-- recursion detection on this self-referential policy.)
--
-- Fix: read the caller's stored role through a SECURITY DEFINER helper, which
-- runs as the table owner and bypasses RLS (the table is not FORCE RLS), so the
-- lookup no longer re-enters the policy. The anti-escalation guard is preserved:
-- a user can change their own non-role columns, but not their role.
--
-- Idempotent (create-or-replace + alter policy) so re-running on deploy is safe.
-- ===========================================================================

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

revoke all on function public.current_profile_role() from public;
grant execute on function public.current_profile_role() to authenticated, anon;

alter policy "profiles_update_own" on public.profiles
  with check (
    id = (select auth.uid())
    and role = public.current_profile_role()
  );
