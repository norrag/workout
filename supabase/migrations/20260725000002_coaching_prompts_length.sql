-- 20260725000002 — widen coaching_prompts.body 12 000 → 24 000 chars
--
-- RECONSTRUCTED, not new (2026-08-02). This change was applied to hosted on
-- 2026-07-25 as `coaching_prompts_length` (ledger version 20260725015605) but
-- never committed here, so `supabase/migrations` and prod disagreed: a fresh
-- environment built from this directory caps the doc-19 coaching prompt at
-- 12 000 characters and rejects a body prod accepts. Found while reconciling
-- the ledger for doc 21 Phase 2 (the same sweep that caught an un-ledgered
-- restamp migration).
--
-- Idempotent by construction — `drop constraint if exists` then re-add — so it
-- is a no-op on hosted (where the constraint already reads 24 000) and applies
-- cleanly everywhere else. Hosted already has its own ledger row under a
-- different version string; this file exists so every OTHER environment
-- converges to the same schema.
--
-- RLS: a CHECK bound does not affect row visibility; the coaching_prompts
-- policies are untouched.

alter table public.coaching_prompts
  drop constraint if exists coaching_prompts_body_check,
  add constraint coaching_prompts_body_check
    check (char_length(body) between 1 and 24000);
