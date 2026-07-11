-- 20260711000003 — BodySpec DEXA enrich + view (doc 15 §5 Phase 2, doc 17 §6,
-- N34 Phase 5b).
--
-- Two pieces:
--   body_scans ± two columns — the consented profile-update proposal's per-scan
--                              resolution (applied / dismissed), so the card
--                              never nags and provenance is recorded
--   v_body_comp_history      — the shared read surface for scan-to-scan
--                              comparison (doc 15 §2.2): deltas vs the previous
--                              scan + the same_scanner_as_prev comparability
--                              flag, so every consumer (scan detail, macro
--                              page, retrospective, the 5c MCP tool) inherits
--                              the doc 15 §6 guardrails from one definition

-- ---------------------------------------------------------------------------
-- body_scans: proposal resolution
-- ---------------------------------------------------------------------------
-- The post-sync profile-update proposal (doc 15 §2.3 — "import is mechanical;
-- profile mutation is consented") resolves per scan, permanently:
--   profile_applied_at   — the user accepted; profiles.bodyweight/body_fat_pct
--                          were written and a source:'dexa' point appended to
--                          bodyweight_log at that moment
--   profile_dismissed_at — the user chose to keep the current profile values
-- Both null = unresolved (only the newest scan is ever proposed). Covered by
-- the existing owner-only RLS policy on the table.

alter table public.body_scans
  add column profile_applied_at timestamptz,
  add column profile_dismissed_at timestamptz;

comment on column public.body_scans.profile_applied_at is
  'When the user accepted this scan''s profile-update proposal (doc 15 §2.3): bodyweight/body_fat_pct written to profiles + a source:''dexa'' point appended to bodyweight_log. Null with profile_dismissed_at null = unresolved.';
comment on column public.body_scans.profile_dismissed_at is
  'When the user declined this scan''s profile-update proposal (kept current profile values). The proposal never re-renders once resolved either way.';

-- ---------------------------------------------------------------------------
-- v_body_comp_history
-- ---------------------------------------------------------------------------
-- One row per scan, in scan order, with deltas vs the user's previous scan and
-- the same-scanner comparability flag (doc 15 §2.2/§6). security_invoker so
-- the querying user's RLS on body_scans applies (hard rule 1); consumers never
-- recompute a delta themselves — one counting definition, shared-views rule.
--
-- same_scanner_as_prev: null on a user's first scan (nothing to compare);
-- FALSE when either scanner model is unknown — an unverifiable pair is not
-- comparable by default (doc 15 §6.2 rule 2).

create view public.v_body_comp_history
with (security_invoker = true) as
select
  s.user_id,
  s.id as scan_id,
  s.provider,
  s.scanned_at,
  s.scanner_model,
  s.weight_lb,
  s.body_fat_pct,
  s.lean_mass_lb,
  s.fat_mass_lb,
  s.almi_kg_m2,
  lag(s.scanned_at) over w as prev_scanned_at,
  round(s.weight_lb - lag(s.weight_lb) over w, 2) as delta_weight_lb,
  round(s.body_fat_pct - lag(s.body_fat_pct) over w, 1) as delta_body_fat_pct,
  round(s.lean_mass_lb - lag(s.lean_mass_lb) over w, 2) as delta_lean_lb,
  round(s.fat_mass_lb - lag(s.fat_mass_lb) over w, 2) as delta_fat_lb,
  case
    when lag(s.scanned_at) over w is null then null
    when s.scanner_model is null or lag(s.scanner_model) over w is null then false
    else s.scanner_model = lag(s.scanner_model) over w
  end as same_scanner_as_prev
from public.body_scans s
window w as (partition by s.user_id, s.provider order by s.scanned_at, s.id);

comment on view public.v_body_comp_history is
  'Body-composition history over body_scans (doc 15 §2.2, N34 Phase 5b): per-scan values + deltas vs the previous scan + same_scanner_as_prev comparability flag. The one definition every scan-comparison surface reads (scan detail, macro page, retrospective, MCP). security_invoker — owner RLS applies.';
