-- ---------------------------------------------------------------------------
-- 20260725000001 — N65: a share code captures what was shared, when it was
-- shared.
--
-- `acceptShareCode` copied the object by reading the owner's LIVE rows at
-- redemption time, so a shared mesocycle was whatever the owner's planner board
-- happened to hold when the grantee typed the code — not what the owner meant
-- to hand over. Two consequences in the field:
--
--   1. edits the owner made after minting the code silently changed what the
--      grantee received (and a later plan edit could remove it entirely);
--   2. nothing recorded WHAT was shared, so a redemption could not be reasoned
--      about after the fact.
--
-- `payload` is that record: a server-built snapshot of the object's structure,
-- written by the owner when the code is minted (and refreshed whenever the
-- owner re-mints the still-open code, so "share again after editing" hands over
-- the current state). Redemption copies from the snapshot and falls back to the
-- live read for codes minted before this shipped.
--
-- No RLS change: `shares_owner_all` covers the owner's write, and
-- `shares_grantee_select` lets a grantee read the row (hence the snapshot) only
-- once they have accepted it. Referenced exercises are still resolved live at
-- redemption, so the R1 ownership assertion (20260701000002) keeps holding —
-- the snapshot can never widen what a copy may touch.
-- ---------------------------------------------------------------------------

alter table public.shares add column payload jsonb;

comment on column public.shares.payload is
  'Structure snapshot of the shared object, captured server-side when the code was minted (schema: {version, type, ...}). Null for pre-20260725 codes, which redeem from the owner''s live rows.';
