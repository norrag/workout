-- 20260711000002 — BodySpec DEXA connect + import (doc 15 §2.2, doc 17 §6,
-- N34 Phase 5a).
--
-- Two-and-a-half pieces:
--   external_connections        — the per-user account link (status/timestamps;
--                                 NO secrets — owner-visible)
--   external_connection_secrets — OAuth token material, deny-all: RLS enabled
--                                 with NO policies and grants revoked, reached
--                                 exclusively through service-role call sites
--                                 (src/lib/queries/external-connections.ts,
--                                 hard rule 4) with explicit user scoping
--   body_scans                  — one row per imported scan result: canonical
--                                 imperial columns for everything views/stats
--                                 need + the verbatim provider payloads (raw
--                                 jsonb) so early-access API drift is always
--                                 re-mappable (doc 15 §8.3)
--
-- Scan-derived facts are MACRO-LAYER measurement substrate (doc 15 §3.3):
-- they inform targets and verdicts, never prescriptions, and are excluded
-- from the doc-14 dependency fingerprint like bodyweight (doc 15 §2.4 —
-- a new scan must never invalidate a week of stored workouts).

-- ---------------------------------------------------------------------------
-- external_connections
-- ---------------------------------------------------------------------------

create table public.external_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('bodyspec')),
  -- 'connected' | 'error' (error = sync/refresh failed and needs a reconnect;
  -- disconnect DELETES the row — there is no 'revoked' resting state)
  status text not null default 'connected'
    check (status in ('connected', 'error')),
  -- provider-side identity, for the "CONNECTED AS" display only
  provider_user_id text,
  provider_email text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.external_connections enable row level security;

-- owner-only, initplan-wrapped (T-R2 convention). The row carries no secrets;
-- delete-by-owner IS the disconnect of record (secrets cascade below), though
-- the app path also revokes provider-side first (best-effort).
create policy "external_connections_all_own" on public.external_connections
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger set_external_connections_updated_at
  before update on public.external_connections
  for each row execute function public.set_updated_at();

comment on table public.external_connections is
  'Per-user link to an external data provider (doc 15 §2.2; N34). Status/timestamps only — token material lives in external_connection_secrets (deny-all). Owner-visible; disconnect deletes the row.';

-- ---------------------------------------------------------------------------
-- external_connection_secrets (deny-all)
-- ---------------------------------------------------------------------------

create table public.external_connection_secrets (
  connection_id uuid primary key
    references public.external_connections (id) on delete cascade,
  -- redundant with the parent but kept for explicit service-role scoping:
  -- every service.ts call site filters by a server-derived user id, never
  -- by connection id alone (hard rule 4)
  user_id uuid not null references auth.users (id) on delete cascade,
  access_token text not null,
  refresh_token text,
  access_token_expires_at timestamptz,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS on with NO policies: default-deny for anon/authenticated; only the
-- service role (which bypasses RLS) can touch token material. Belt and
-- braces: also revoke the blanket table grants (20260701000003) so the
-- client roles cannot reach the table even before RLS is evaluated —
-- nothing token-shaped is ever selectable from a client (doc 15 §2.2).
alter table public.external_connection_secrets enable row level security;
revoke all on table public.external_connection_secrets from anon, authenticated;

create trigger set_external_connection_secrets_updated_at
  before update on public.external_connection_secrets
  for each row execute function public.set_updated_at();

comment on table public.external_connection_secrets is
  'OAuth token material for external_connections (doc 15 §2.2). Deny-all: RLS enabled with no policies + client grants revoked; service-role call sites only, always scoped by an explicit server-derived user id.';

-- ---------------------------------------------------------------------------
-- body_scans
-- ---------------------------------------------------------------------------

create table public.body_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'bodyspec' check (provider in ('bodyspec')),
  provider_result_id text not null,
  scanned_at timestamptz not null,
  scanner_model text,
  -- intake snapshot at scan time (converted at the import boundary — the app
  -- is imperial-only per 20260623120000; kg/cm never land in a column)
  weight_lb numeric check (weight_lb > 0),
  height_in numeric check (height_in > 0),
  age_years numeric,
  -- total tissue_fat_pct — fat % of soft tissue, the app's body-fat notion
  body_fat_pct numeric,
  lean_mass_lb numeric,
  fat_mass_lb numeric,
  bone_mass_lb numeric,
  vat_mass_lb numeric,
  vat_volume_cm3 numeric,
  android_gynoid_ratio numeric,
  -- from the percentiles section (metric values; kg/m² is a ratio, not a mass)
  lmi_kg_m2 numeric,
  almi_kg_m2 numeric,
  bmd_total_g_cm2 numeric,
  -- the two FFM-based-or-surfaced RMR estimates we display (doc 15 §3.4)
  rmr_kcal_cunningham int,
  rmr_kcal_mifflin int,
  -- per-region composition, converted to lb at import ({region: {lean_lb, …}})
  regions jsonb,
  -- {metric: {value, percentile}} + params, verbatim shape from the provider
  percentiles jsonb,
  -- verbatim API payloads per section — early-access fidelity/replay (§2.2)
  raw jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- re-syncs are idempotent upserts
  unique (user_id, provider, provider_result_id)
);

alter table public.body_scans enable row level security;

-- owner-only. Delete stays owner-allowed: imported third-party health data
-- is the user's to remove (doc 15 §2.3) — hard rule 5 protects logged
-- TRAINING history, which this is not.
create policy "body_scans_all_own" on public.body_scans
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create index body_scans_user_scanned_idx
  on public.body_scans (user_id, scanned_at desc);

create trigger set_body_scans_updated_at
  before update on public.body_scans
  for each row execute function public.set_updated_at();

comment on table public.body_scans is
  'Imported DEXA scan results, one row per provider result (doc 15 §2.2; N34): canonical imperial columns + verbatim raw payloads. Macro-layer measurement substrate — informs targets and verdicts, never prescriptions; excluded from the doc-14 fingerprint like bodyweight.';
