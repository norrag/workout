-- 20260802000004 — doc 21 Phase 4: the optional per-slot rep position (§4.2)
--
-- The useful half of the RETRACTED centered-reps rule, demoted from a mandate to
-- a knob. §4.2's correction stands: repricing at a different RIR needs NO special
-- case, and forcing window-centered reps whenever the resolved RIR differed from
-- the week's was a special case masquerading as a rule. What survives is the
-- observation behind it — because the load depends on where in the rep window the
-- prescription sits (the §4.2 table spans 18 lb across an 8–12 window), a coach
-- may want to say "reprice this one at the top of the window" for a deeper cut.
--
--   rep_position UNSET  ⇒ the Option-A climb schedule decides (today's behavior,
--                         and the default: unset is byte-identical to pre-Phase-4)
--   rep_position SET    ⇒ this slot's load is priced for that rep position instead
--
-- Values: 'bottom' | 'center' | 'top' — resolved against the goal window's TARGET
-- band — or an explicit rep count as digits, clamped by the engine to the window's
-- HARD bounds. One text column rather than a keyword column plus an int column:
-- the two forms are one knob with one resolution (`engine/index.ts::repsAtPosition`),
-- and splitting them across two columns would make "exactly one of these is set"
-- an invariant to enforce rather than a shape.
--
-- FLAT per slot, with NO per-week schedule — unlike the RIR and set-cap levers.
-- The position is a statement about how the exercise is priced, not an intensity
-- that ramps across the block; a second week-indexed array would be a knob nobody
-- asked for, and §4.2 asks for exactly one ("an OPTIONAL per-slot rep_position").
--
-- RLS: covered by the existing `meso_exercises_all_own` policy (scoped through
-- `mesocycles.user_id = auth.uid()`, same WITH CHECK for all commands) — a new
-- column on an existing row adds no policy surface and does not affect row
-- visibility. Asserted in tests/rls/rls.test.ts, which writes it as the owner and
-- as a non-owner.

alter table public.meso_exercises
  add column if not exists rep_position text;

alter table public.meso_exercises
  add constraint meso_exercises_rep_position_check
    check (
      rep_position is null
      or rep_position in ('bottom', 'center', 'top')
      -- an explicit rep count: 1..50, no leading zeros (so the stored text and
      -- the parsed number round-trip through one canonical form)
      or rep_position ~ '^([1-9]|[1-4][0-9]|50)$'
    );

comment on column public.meso_exercises.rep_position is
  'doc 21 §4.2: where in the goal rep window this slot is priced — bottom|center|top (against the target band) or an explicit rep count 1-50 (clamped to the window''s hard bounds). NULL = the Option-A climb schedule decides, which is the default and today''s behavior.';
