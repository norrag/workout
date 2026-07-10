-- 20260710000001 — doc 17 §2.5 (Phase 1 / N21): contract snapshot + birthdate
--
-- 1) macrocycles.plan_inputs — the contract snapshot. The stored target_*/rate_*
--    columns are the CONTRACT (doc 17 principle 3): written at create, rewritten
--    only by an explicit goals edit. This column persists the plan INPUTS beside
--    those outputs — the resolved MacroProfile (sex/age/bodyweight/height/
--    experience/training-years/bf%) plus the engine_params version the plan ran
--    under — so any contract can later be explained ("set when you were 205 lb /
--    22% bf under v21"). Stamped by createMacrocycleWithMesos/updateMacrocycle
--    whenever they write target_*; no read path depends on it in Phase 1.
--
-- 2) profiles.birthdate — replaces the static `age` int as the age source: a
--    stored age goes stale a year at a time, and the v21 strength path now
--    reads age (doc 17 §2.1). profileToMacroProfile derives age from birthdate
--    when present, falling back to the legacy int. No backfill (single-user
--    deployment — the owner re-saves once); the legacy `age` column stays for
--    the fallback and for historical rows.
--
-- RLS: both tables already carry owner-scoped, column-agnostic policies
-- (macrocycles_all_own / profiles owner policies), so the new nullable columns
-- are covered with no policy change — same shape as 20260708000001.

alter table public.macrocycles
  add column plan_inputs jsonb;

comment on column public.macrocycles.plan_inputs is
  'Contract snapshot (doc 17 §2.5): the resolved MacroProfile + engine_params version the stored target_*/rate_* were priced from. Stamped at create and on goals edits only; null on rows predating Phase 1.';

alter table public.profiles
  add column birthdate date;

comment on column public.profiles.birthdate is
  'Preferred age source (doc 17 §2.5) — age is derived fresh from this at plan time; the legacy static `age` int is the fallback until the profile is re-saved.';
