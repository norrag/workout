-- 20260806000002 — N80 / doc 23 §6.1: per-user release-notification state
--
-- One nullable column, not a table. A scalar is sufficient because the
-- REGISTRY — not the database — knows what happened between two versions:
-- `src/content/releases/` is compiled into the bundle, and the gate
-- (`lib/version/gate.ts`) selects every unseen feature release from it. The
-- database only has to answer "how far has this account been told about".
--
-- `null` is meaningful and is NOT the same as 1.0.0. It means **not yet
-- primed** — a new signup, or a row a backfill missed — and the gate treats it
-- as "show nothing, prime now" (doc 23 T3). Without that distinction every new
-- account would be greeted by a changelog of releases that happened before it
-- existed.
--
-- Existing rows are backfilled to '1.0.0' in this migration (§4.3 / O8): the
-- pre-release app is declared production, everyone is considered caught up, and
-- the first What's New anyone ever sees is 1.1.0. Building the framework inside
-- 1.0.0 is deliberate — the first notified release must not also be the release
-- that debuts the notification.
--
-- RLS (hard rule 1): nothing new is needed. `profiles_update_own` already
-- allows self-writes for every column except `role`, so a user can technically
-- set their own last-seen to anything. That is deliberate, not an oversight:
-- this is the user's own notification state and the entire blast radius is
-- seeing, or not seeing, a sheet about their own app. The acknowledgment path
-- (`more/actions.ts::acknowledgeReleases`) is guarded monotonically in
-- TypeScript so the app never moves it backwards; a rollback leaves last-seen
-- above current and the gate is a no-op in that state (doc 23 T8).

alter table public.profiles
  add column if not exists last_seen_version text;

comment on column public.profiles.last_seen_version is
  'doc 23 §6.1 — the highest release version this account has been shown. '
  'null = not yet primed (new signup): show nothing, prime to CURRENT_VERSION. '
  'Compared against the in-repo release registry, never against another table.';

-- every account that exists at 1.0.0 is caught up by definition
update public.profiles
   set last_seen_version = '1.0.0'
 where last_seen_version is null;
