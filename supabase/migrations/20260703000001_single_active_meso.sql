-- 20260703000001 — R15: one live block per user, as a DB guarantee
--
-- The sequential-activation invariant only covered same-macro siblings:
-- startMeso gated on the meso's OWN macrocycle's siblings, so a standalone
-- planned meso — or one in a different macro — could activate while another
-- block was live. getCurrentState then silently picked the newest-created
-- active meso, so the in-flight block vanished from the Workout tab and
-- get_current_state (docs/reviews/2026-07-01-repo-review.md §R15).
--
-- The app gate is now user-wide (src/lib/queries/generation.ts::startMeso);
-- this partial unique index makes the invariant hold even when two
-- activations race — the second status flip fails with 23505, which startMeso
-- surfaces as a friendly error.
--
-- RLS: no policy change (an index on an existing RLS-locked table adds no
-- read/write surface). Constraint probed in tests/rls/rls.test.ts
-- ("single active meso (R15)"). Verified on hosted before shipping: every
-- user has at most one active meso, so the index applies cleanly.

create unique index mesocycles_one_active_per_user
  on public.mesocycles (user_id)
  where status = 'active';

comment on index public.mesocycles_one_active_per_user is
  'R15: at most one active mesocycle per user — activation is exclusive across macros and standalone mesos alike, not just within one macrocycle.';
