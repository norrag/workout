-- 20260711000004 — BodySpec OAuth server-side transactions (doc 15 §8.5,
-- N34 Phase 5a follow-up).
--
-- Field failure (2026-07-11, installed PWA on iOS): the OAuth round trip
-- spans TWO browsing contexts. CONNECT is tapped inside the installed app's
-- context, but iOS opens the out-of-scope BodySpec login in an in-app
-- browser sheet with its own ephemeral cookie jar — and the redirect back
-- lands the callback in that sheet. The 5a flow carried the PKCE verifier +
-- state in httpOnly cookies and required the Supabase session cookie at the
-- callback; none of the three exist in the sheet's jar, so the flow could
-- never complete from the installed app (the owner hit Keycloak's "Cookie
-- not found" at the final hop). The round trip now rides this server-side
-- transaction table and the callback needs NO cookies at all.
--
-- One row per started connect flow:
--   created by the /connect route while the app context still has the
--   Supabase session (user_id is session-derived there, hard rule 4);
--   consumed (single-use delete) by the /callback route by `state` alone.
-- The 256-bit single-use state with a short TTL is the bearer of the round
-- trip. A transaction can only ever connect a BodySpec account to the user
-- who STARTED the flow — the callback takes no user identity from its own
-- context, so a foreign context completing it changes nothing about scoping.
--
-- Deny-all like external_connection_secrets: RLS enabled with NO policies +
-- client grants revoked. Only the service role touches it, exclusively via
-- src/lib/queries/oauth-transactions.ts.

create table public.oauth_transactions (
  -- the OAuth `state` value: 32 bytes of URL-safe entropy, primary key so a
  -- consumed (deleted) transaction can never be replayed
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('bodyspec')),
  code_verifier text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.oauth_transactions enable row level security;
revoke all on table public.oauth_transactions from anon, authenticated;

comment on table public.oauth_transactions is
  'In-flight OAuth connect round trips (doc 15 §8.5; N34). Deny-all: RLS with no policies + client grants revoked; service-role call sites only. Created with a session-derived user_id at /connect, consumed single-use by state at /callback — carries the PKCE verifier so the callback works with no cookies (installed-PWA two-context flow). Expired rows are pruned opportunistically on insert.';
