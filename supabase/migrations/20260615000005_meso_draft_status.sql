-- Draft mesocycles (2026-06-15 on-device feedback): "create mesocycle" becomes
-- the final stage. Scratch/template/copy drop the user onto the planner board
-- with the meso in a `draft` state; finalizing (name + weeks) flips it to
-- `planned`. One draft at a time is enforced in the query layer
-- (createDraftMeso deletes any existing draft first).
--
-- Append-only: widen the status check to admit 'draft'. RLS is unchanged —
-- `mesocycles_all_own` already covers every status for the owner.

alter table public.mesocycles drop constraint if exists mesocycles_status_check;
alter table public.mesocycles
  add constraint mesocycles_status_check
  check (status in ('draft', 'unplanned', 'planned', 'active', 'completed', 'abandoned'));
