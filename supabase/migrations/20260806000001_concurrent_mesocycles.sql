-- 20260806000001 — N79: more than one mesocycle may be live at a time
--
-- R15 (migration 20260703000001) made "one active block per user" a database
-- guarantee. The owner has now asked for the case that rule cannot express: a
-- rehab assignment, or any block that has to run BESIDE the macrocycle rather
-- than instead of it. Pausing a macrocycle to run it, then restarting, loses
-- the macro's continuity for something that was never meant to replace it.
--
-- The invariant narrows rather than disappears. What remains true:
--   * at most one active mesocycle WITHIN a macrocycle — a macro is a sequence,
--     and two of its blocks running at once is incoherent, not flexible. This
--     is the index below; `mesoActivationBlock` is its app-side twin.
--   * at most one active macrocycle per user — guarded in the app
--     (`createMacrocycleWithMesos`) rather than here on purpose: a unique index
--     would fail this migration outright on any account that already carries
--     two, and no user's data may be held hostage to a new rule.
-- What is now allowed: a standalone (macro-less) mesocycle running alongside an
-- active macrocycle's block. "Which meso is the current one" stops being a
-- uniqueness question and becomes a resolution one — `resolveActiveMesocycle`
-- picks the block holding the most recently logged set.
--
-- Safe in both directions: dropping a unique index can never fail on data, and
-- the replacement is strictly weaker than the one it replaces (≤1 active per
-- user implies ≤1 active per macrocycle), so every existing row satisfies it.
--
-- RLS: no policy change (index-only on an already RLS-locked table adds no
-- read/write surface). Constraint probed in tests/rls/rls.test.ts
-- ("concurrent mesocycles (N79)").

drop index if exists public.mesocycles_one_active_per_user;

create unique index mesocycles_one_active_per_macrocycle
  on public.mesocycles (macrocycle_id)
  where status = 'active' and macrocycle_id is not null;

comment on index public.mesocycles_one_active_per_macrocycle is
  'N79: at most one active mesocycle per macrocycle. Standalone mesocycles are deliberately unconstrained — one may run alongside an active macrocycle block (rehab, a temporary step outside the plan); the current block is resolved by most-recent logged set, not by uniqueness.';
