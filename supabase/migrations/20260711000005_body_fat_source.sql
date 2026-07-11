-- 20260711000005 — profiles.body_fat_source (doc 17 §6 Phase 5c, N34; owner
-- note 2026-07-11): body-fat provenance.
--
-- The profile's body_fat_pct has two very different origins — the user's own
-- estimate (a band pick or a custom value) and a DEXA measurement applied from
-- a scan via the consented proposal (doc 15 §2.3). The profile screen needs to
-- know which it is: while a BodySpec connection exists and the value is
-- measured, the estimate bands give way to the scan's value (a connected,
-- current user has better data than any band); a self-estimate keeps the
-- picker. Provenance only — the engine reads the VALUE through the existing
-- bodyFatPct profile input either way (doc 15 §3.1: measured values ride the
-- same path, no engine change; doc 17 §6 5c).
--
--   'estimate' — self-reported (band pick or custom entry)
--   'dexa'     — written by the consented scan-proposal APPLY
--   null       — legacy/unset (rows predating this migration)
--
-- RLS: profiles' owner-scoped, column-agnostic policies cover the new nullable
-- column with no policy change (same shape as 20260710000001 birthdate).

alter table public.profiles
  add column body_fat_source text
    check (body_fat_source in ('estimate', 'dexa'));

comment on column public.profiles.body_fat_source is
  'Provenance of body_fat_pct (doc 17 Phase 5c): ''estimate'' = self-reported band/custom value; ''dexa'' = applied from a body scan via the consented proposal (doc 15 §2.3). Null = legacy/unset.';
