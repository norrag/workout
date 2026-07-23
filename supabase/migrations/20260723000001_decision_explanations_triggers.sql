-- N60 / doc 19 §6.3 phase 3 — the v3 coaching layer stores WHICH triggers
-- (§6.1) routed a decision to the generation call, as an audit trail beside the
-- coaching context. `body` now holds coaching context only (≤360 chars per
-- §6.2, enforced by the post-check; the 480 DB check stays the backstop and is
-- untouched so existing v1–v2 rows remain valid). `prompt_version` keeps doing
-- the serving cut (§3: serve only prompt_version >= 3).
--
-- Additive column only — nullable, so every existing v1–v2 row stays valid and
-- reads as "no recorded triggers". No RLS change: the owner-or-admin SELECT
-- policy and the service-role-only write posture from 20260720000001 apply to
-- the new column unchanged (RLS is per-row, not per-column).

alter table public.decision_explanations
  add column triggers text[];

comment on column public.decision_explanations.triggers is
  'doc 19 §6.1 — the deterministic triggers that routed this decision to the LLM coaching call (audit: why this row exists). Null on pre-v3 rows.';
