-- 20260912000001 — N91: per-connection MCP tool-catalog freshness
--
-- The problem this table exists to solve is not an HTTP cache. ChatGPT keeps a
-- FROZEN SNAPSHOT of a connector's tool catalog taken at connect time, and only
-- re-fetches `tools/list` when the user hits Settings → Plugins → Workout →
-- Refresh. A connector that gained tools since a user connected therefore looks,
-- from that conversation, exactly as it did months ago — and nothing in the
-- protocol tells the server that. `tools/list` carrying `ttlMs: 0` does not help:
-- it governs shared HTTP caches, not the client's own snapshot.
--
-- So the server has to remember what it last HANDED OUT, per connection, and
-- compare that against what it would hand out now. This table is that memory:
-- one row per (WORKOUT user, OAuth client), written on every `tools/list`.
--
-- KEY IS (user_id, client_id), NOT user_id. One person's ChatGPT connection and
-- their Claude connection hold independent snapshots and go stale independently;
-- collapsing them would clear ChatGPT's staleness the moment Claude re-listed.
-- `client_id` is the OAuth client on the bearer token (`auth.ts`), never an
-- argument — hard rule #5 holds here as everywhere.
--
-- `catalog_fingerprint` IS NULLABLE AND NULL IS MEANINGFUL. It means **this
-- connection has never been observed fetching a catalog** — every connection
-- that existed before this table did. Those are treated as stale (one refresh
-- establishes a baseline) precisely BECAUSE we cannot know what they hold; the
-- alternative, assuming they are current, would permanently hide the notice
-- from exactly the users most likely to be missing tools. A row with a null
-- fingerprint and a non-null `notified_at` is such a connection, already told.
--
-- The fingerprint itself is a sha256 over the tool definitions AS SERVED
-- (`src/lib/mcp/catalog.ts`), with the catalog generation and the server
-- instructions folded in, so an added/removed/reworded tool changes it without
-- anyone remembering to bump anything.
--
-- RLS (hard rule 1): default deny, owner/admin read, and NO write policy for
-- users — the MCP server writes these rows service-role with a server-derived
-- user id, exactly like `mcp_write_audit`. A user being able to forge their own
-- freshness row would only let them silence their own notice, but there is no
-- reason to allow it.

create table if not exists public.mcp_client_catalog (
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id text not null,
  -- sha256 of the catalog this connection was last served; null = never observed
  catalog_fingerprint text,
  -- human-readable companion to the hash, for debugging and migrations
  catalog_generation integer,
  -- which listing this connection received: admin tools included, or not
  catalog_variant text check (catalog_variant in ('standard', 'admin')),
  tool_count integer,
  -- clientInfo.name off the request envelope, when the client sends one
  client_name text,
  -- when this connection last fetched a catalog (null = never observed)
  listed_at timestamptz,
  -- when the stale-catalog notice was last attached to a tool result
  notified_at timestamptz,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

comment on table public.mcp_client_catalog is
  'N91 — per (user, OAuth client) record of the MCP tool catalog last served, '
  'so a client holding a frozen snapshot (ChatGPT) can be told to refresh. '
  'Written service-role from /api/mcp only; never from a tool argument.';

comment on column public.mcp_client_catalog.catalog_fingerprint is
  'sha256 over the served tool definitions + catalog generation + server '
  'instructions (src/lib/mcp/catalog.ts). null = never observed listing.';

alter table public.mcp_client_catalog enable row level security;

create policy "mcp_client_catalog_select_own_or_admin" on public.mcp_client_catalog
  for select using (user_id = auth.uid() or public.is_admin());
-- writes happen via service role only (MCP server); no insert/update policy

create index if not exists mcp_client_catalog_user_idx
  on public.mcp_client_catalog (user_id);
