-- 20260701000002 — R1: share-redemption lockdown (repo review 2026-07-01)
--
-- `shares_grantee_accept` granted the grantee a row-level UPDATE on any share
-- row they were grantee on. RLS cannot scope columns, so a grantee could rewrite
-- `object_id` / `object_type` via PostgREST and re-submit their code — turning
-- the service-role copy-on-accept (`acceptShareCode`) into a cross-user copy
-- primitive: any object uuid, copied into the attacker's account.
--
-- No client-side path updates shares at all: redemption runs on the service
-- client (which bypasses RLS), and share creation is an owner INSERT. The policy
-- had no legitimate consumer, so it is dropped outright; grantees keep SELECT on
-- their accepted shares (`shares_grantee_select`) and owners keep full control
-- (`shares_owner_all`). Defense in depth for the remaining owner-side rewrite
-- surface (an owner pointing their own share at a victim's uuid) lands in
-- `acceptShareCode`, which now asserts the copied object is owned by
-- `share.owner_id` before copying. RLS tests: tests/rls/rls.test.ts ("shares").

drop policy if exists "shares_grantee_accept" on public.shares;
