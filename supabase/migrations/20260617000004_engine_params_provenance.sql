-- 20260617000004 — engine_params provenance / reproducibility (MCP tooling review P0-3)
--
-- `engine_params.params` rows were stored *partial* (each migration wrote only
-- the keys it changed) and the admin reader re-ran them through the zod schema,
-- which back-fills every missing key with *today's* default. So an old version
-- read back with current values — v2/v5/v6 all resolved identically and their
-- diffs came up empty, while v1 (predating the schema) failed validation. That
-- is a genuine reproducibility defect: a "historical" version could not be
-- reproduced, only re-derived against the live defaults.
--
-- This makes a params version an immutable, self-describing snapshot:
--   * schema_version — the engine-params schema shape the row targets
--   * params_hash    — sha256 of the canonical (sorted-key) JSON of the row
--   * code_sha        — the engine build that produced the snapshot (nullable)
--   * is_replayable   — true only when the stored bytes are already a complete
--                       materialization under the current schema (no default had
--                       to be injected to read them)
--
-- Going forward `propose_engine_params` stores fully-materialized params plus
-- this provenance; the reader stops masking partial legacy rows and flags the
-- non-replayable ones instead of emitting back-filled values.
--
-- Additive columns + a data backfill only — no behavioural change to live
-- generation, which always reads the active version (v6, already complete).

alter table public.engine_params
  add column if not exists schema_version int,
  add column if not exists params_hash text,
  add column if not exists code_sha text,
  add column if not exists is_replayable boolean not null default false;

-- Backfill provenance for the existing versions. Values computed from the
-- stored params with the same canonicalization the app uses (sha256 of
-- sorted-key JSON); is_replayable is true only where the stored bytes already
-- deep-equal the parsed-with-defaults result. Only v6 (the active, complete
-- snapshot) qualifies — v1..v5 were stored partial and are reproducible only
-- as historical context, not byte-for-byte, so they are flagged non-replayable.
update public.engine_params set schema_version = 1, params_hash = '9bfd2e3903638632c813bb442b923ce644672f89a2da7f4f71d0494f983967ae', is_replayable = false where version = 1;
update public.engine_params set schema_version = 2, params_hash = '2f78f232d9a3b98226b213805f4fa85cef08227c35335b6d43377ebcc1014160', is_replayable = false where version = 2;
update public.engine_params set schema_version = 2, params_hash = 'a75bff16b9ff3fbaef0105f4b6fa377d0b40142abffee33a2e82d4ab36f4decc', is_replayable = false where version = 3;
update public.engine_params set schema_version = 2, params_hash = 'c73b0e14304f9195866b76d0b8f557fd66918b5a3e5d0f39d9b165d39e56d17f', is_replayable = false where version = 4;
update public.engine_params set schema_version = 2, params_hash = '91f0118fe9296f38325ab9d3397ef6a3846d9441e8f2f2434af5e681b8bb4620', is_replayable = false where version = 5;
update public.engine_params set schema_version = 2, params_hash = 'a2f5632de889a4ae9542e426e2ab672c54666c989db0540ca22608b2b809c429', is_replayable = true where version = 6;

comment on column public.engine_params.is_replayable is
  'true only when the stored params are a complete materialization under the current schema — a replay reproduces exactly what generation saw, with no default injected on read.';
