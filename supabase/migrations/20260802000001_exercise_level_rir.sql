-- 20260802000001 — doc 21 Phase 2: exercise-level RIR (the assignment columns)
--
-- Assign a target RIR per exercise, per week, inside a program (docs/21 §1/§3).
-- Grain is `meso_exercises` — day-slot × exercise — so the same exercise on two
-- days can run at different effort (A3). Modelled directly on
-- `mesocycles.rir_schedule` (N18-B, migration 20260705000002), including its
-- orphan-clearing rule: a shape edit that changes `weeks`/`includes_deload`
-- without re-supplying a schedule clears it back to null (app layer,
-- `updateMesocycleAttrs`).
--
-- Semantics (§4.1, ABSOLUTE — A2): the resolved value is
--   slotRir      = rir_schedule[week] ?? target_rir
--   resolvedRir  = slotRir ?? microcycles.target_rir
-- Set wins, unset yields to the meso's RIR ramp. No floor/offset parameters.
-- The schedule is indexed by WORKING week exactly like `mesocycles.rir_schedule`;
-- a deload week falls off the end of the array and resolves to the flat
-- `target_rir` (an assignment there deliberately wins over the deload RIR — a
-- coach ramping back into a block — surfaced with the week's default beside it).
--
-- NULL elements are meaningful and allowed: `[null, null, 4, 4]` is "RIR 4 for
-- weeks 3 and 4, ramp otherwise", which is the headline use case. CHECK
-- constraints cannot contain subqueries, so the element bound is expressed as
-- containment of the null-stripped array (`array_remove(x, null)` removes NULLs
-- under IS NOT DISTINCT FROM semantics).
--
-- BOUNDS — 0..30, not the 0..8 in the doc's §3 code block. §3's prose and §4.3
-- supersede that block (revised 2026-07-31 after the owner's §4.2 pushback):
-- prescription RIR is UNBOUNDED upward so one lever spans deload → rehab → deep
-- back-off without a second mechanism, and 30 is the practical ceiling the app
-- persists. What is bounded is not the *ask* but the *measurement* — the §6.1
-- measuring band (`e1rm.max_measuring_rir`) is what keeps an unbounded ask
-- honest, and it ships alongside this (Phase 2b). `logged_sets.rir_reported`
-- stays 0..10: that is the range a human can actually estimate.
--
-- The two prescription-carrying checks widen with it: `microcycles.target_rir`
-- (a whole week can be assigned) and `workout_exercises.target_rir` (where the
-- resolved value lands per slot). Pure widening — every existing 0..8 row stays
-- valid, so there is no data migration.
--
-- RLS: `meso_exercises` is guarded by `meso_exercises_all_own`, which scopes
-- through `mesocycles.user_id = auth.uid()` for ALL commands with the same
-- WITH CHECK. New columns on an existing row are covered by that policy
-- unchanged — there is no new policy surface, and default-deny is untouched.
-- A CHECK bound does not affect row visibility either. (Policy coverage is
-- asserted in tests/rls/rls.test.ts, which now writes these columns as the
-- owner and as a non-owner.)

-- ---------------------------------------------------------------------------
-- 1. the assignment columns (§3)
-- ---------------------------------------------------------------------------

alter table public.meso_exercises
  add column if not exists target_rir int,
  add column if not exists rir_schedule int[],
  add column if not exists set_cap int,
  add column if not exists set_cap_schedule int[],
  add column if not exists effort_reason text;

alter table public.meso_exercises
  add constraint meso_exercises_target_rir_check
    check (target_rir is null or target_rir between 0 and 30),
  add constraint meso_exercises_rir_schedule_shape
    check (
      rir_schedule is null
      or (
        array_length(rir_schedule, 1) between 1 and 8
        and array_remove(rir_schedule, null::int) <@ array[
          0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,
          16,17,18,19,20,21,22,23,24,25,26,27,28,29,30
        ]
      )
    ),
  add constraint meso_exercises_set_cap_check
    check (set_cap is null or set_cap between 1 and 20),
  add constraint meso_exercises_set_cap_schedule_shape
    check (
      set_cap_schedule is null
      or (
        array_length(set_cap_schedule, 1) between 1 and 8
        and array_remove(set_cap_schedule, null::int) <@ array[
          1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20
        ]
      )
    ),
  add constraint meso_exercises_effort_reason_len
    check (effort_reason is null or char_length(effort_reason) <= 500);

comment on column public.meso_exercises.target_rir is
  'doc 21 §4.1: flat per-slot target RIR for the whole meso. NULL = the meso RIR ramp applies. ABSOLUTE — set wins over microcycles.target_rir, including on a deload week.';
comment on column public.meso_exercises.rir_schedule is
  'doc 21 §3: per-WORKING-week target RIR for this slot (same indexing as mesocycles.rir_schedule). A NULL element = no assignment that week (falls back to target_rir, then the ramp). NULL = use target_rir. Length consistency with weeks/includes_deload is app-enforced; a shape edit that orphans it clears it.';
comment on column public.meso_exercises.set_cap is
  'doc 21 A4/§8: per-slot working-set cap for the whole meso. NULL = the engine''s own set count.';
comment on column public.meso_exercises.set_cap_schedule is
  'doc 21 A4: per-WORKING-week set cap for this slot, same shape rules as rir_schedule. NULL = use set_cap.';
comment on column public.meso_exercises.effort_reason is
  'doc 21 A7: why this slot carries an effort assignment (surfaced next to it in the planner, day view, and MCP read tools).';

-- ---------------------------------------------------------------------------
-- 2. widen the prescription-carrying RIR checks 0–8 → 0–30 (§3, §4.3)
-- ---------------------------------------------------------------------------

alter table public.microcycles
  drop constraint if exists microcycles_target_rir_check,
  add constraint microcycles_target_rir_check check (target_rir between 0 and 30);

alter table public.workout_exercises
  drop constraint if exists workout_exercises_target_rir_check,
  add constraint workout_exercises_target_rir_check check (target_rir between 0 and 30);
