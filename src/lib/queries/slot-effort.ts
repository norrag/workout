/**
 * Exercise-level RIR — the pure resolution (docs/21-exercise-level-rir.md §4.1).
 *
 * A per-slot effort assignment lives on `meso_exercises` (day-slot × exercise,
 * A3) and is resolved per week into the value the engine prices against:
 *
 *   weekRir      = microcycles.target_rir            (ramp / rir_schedule / deload)
 *   slotRir      = rir_schedule[week] ?? target_rir
 *   resolvedRir  = slotRir ?? weekRir                -- ABSOLUTE: set wins, unset yields
 *
 * ABSOLUTE semantics (A2): there is no floor, offset, or clamp against the
 * week's value. Where an assignment is set it takes control — including a
 * deload week, and including *downward* (a coach ramping back into a block).
 * Where it is unset the configured ramp reasserts itself the moment the
 * assignment is removed, with nothing to unwind.
 *
 * This module is pure and lives in the query layer, not the engine: the engine
 * takes one already-resolved `EngineInputs` (hard rule 3). It is the query
 * layer's job to run this AFTER `liveWeekRirUpdates` in the reconcile
 * (`regeneration.ts`), which re-derives an unstarted week's RIR from the ramp —
 * resolving first would let the reconcile stomp the assignment on the next read.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/** The assignment columns of one `meso_exercises` row (doc 21 §3). */
export interface SlotEffortAssignment {
  target_rir: number | null;
  rir_schedule: (number | null)[] | null;
  set_cap: number | null;
  set_cap_schedule: (number | null)[] | null;
  effort_reason: string | null;
}

/**
 * The lookup key for a slot assignment. `meso_exercises` has no FK on
 * `workout_exercises`, so the grain is addressed the way every other plan↔session
 * join in the codebase addresses it (and the way the seed backfill already keys
 * `initialByDayExercise`): the meso's day number plus the exercise.
 */
export function slotEffortKey(dayNumber: number, exerciseId: string): string {
  return `${dayNumber}::${exerciseId}`;
}

/**
 * `schedule[week] ?? flat` — the per-slot half of the resolution, for either
 * lever. The schedule is indexed by WORKING week (1-based), exactly like
 * `mesocycles.rir_schedule`: a deload week falls off the end of the array and
 * resolves to the flat value, which is what makes "assign the whole meso" and
 * "assign weeks 3–4 only" the same column pair. A null ELEMENT means "no
 * assignment that week" and falls through to the flat value too.
 */
function pickWeek(
  flat: number | null | undefined,
  schedule: (number | null)[] | null | undefined,
  weekNumber: number,
): number | null {
  const fromSchedule =
    schedule != null && weekNumber >= 1 ? schedule[weekNumber - 1] : undefined;
  return fromSchedule ?? flat ?? null;
}

/**
 * The slot's assigned RIR for a week, or null when the slot is unassigned
 * (⇒ the caller uses the week's ramp value). Pure.
 */
export function slotRir(
  assignment: SlotEffortAssignment | null | undefined,
  weekNumber: number,
): number | null {
  if (!assignment) return null;
  return pickWeek(assignment.target_rir, assignment.rir_schedule, weekNumber);
}

/**
 * The slot's assigned working-set cap for a week, or null when unassigned
 * (⇒ the engine's own set count stands). Pure. (A4 — the set lever ships with
 * the same resolution shape as the RIR one so the two can never drift.)
 */
export function slotSetCap(
  assignment: SlotEffortAssignment | null | undefined,
  weekNumber: number,
): number | null {
  if (!assignment) return null;
  return pickWeek(assignment.set_cap, assignment.set_cap_schedule, weekNumber);
}

/** The resolved effort for one slot in one week (§4.1). */
export interface ResolvedSlotEffort {
  /** the RIR the engine prices against: `slotRir ?? weekRir` */
  rir: number;
  /** the slot's own assignment, when it has one (null ⇒ the ramp is in control) */
  assignedRir: number | null;
  /** the week's ramp value, always — the "default beside the field" (§4.1) */
  weekRir: number;
  /** the slot's working-set cap for this week, when assigned */
  setCap: number | null;
  /** A7 — surfaced next to the assignment wherever it reads */
  reason: string | null;
  /** true while an assignment is EASING this slot relative to the week's ramp.
   *  The §5 earn gate and the §6.2 stats policy both key on exactly this:
   *  a slot running easier than the week it sits in neither earns progression
   *  nor contributes to strength surfaces. */
  backedOff: boolean;
}

/**
 * Resolve one slot's effort for one week. `weekRir` is the microcycle's stored
 * target RIR — already live-refreshed from the ramp by the caller (§4.1).
 */
export function resolveSlotEffort(
  assignment: SlotEffortAssignment | null | undefined,
  weekNumber: number,
  weekRir: number,
): ResolvedSlotEffort {
  const assignedRir = slotRir(assignment, weekNumber);
  const rir = assignedRir ?? weekRir;
  return {
    rir,
    assignedRir,
    weekRir,
    setCap: slotSetCap(assignment, weekNumber),
    reason: assignment?.effort_reason ?? null,
    backedOff: assignedRir != null && assignedRir > weekRir,
  };
}

/**
 * The `exerciseRir` engine input for a slot: the assigned value, or undefined
 * when the slot is unassigned. Undefined — not null — on purpose: the key is
 * then omitted from the config projection entirely, so an unassigned row's
 * dependency fingerprint and recorded decision inputs stay byte-identical to
 * everything written before this feature existed (doc 14 §3 / doc 21 §7).
 */
export function exerciseRirInput(
  assignment: SlotEffortAssignment | null | undefined,
  weekNumber: number,
): number | undefined {
  return slotRir(assignment, weekNumber) ?? undefined;
}

/**
 * §4.1 "no silent semantics": an assignment BELOW the week's default makes that
 * week harder than programmed — legitimate (ramping back into a block), but the
 * MCP tool and the editor must say so rather than apply it silently. Pure
 * predicate so the tool result and the UI warn off one rule.
 */
export function assignmentHardensWeek(
  assignedRir: number | null,
  weekRir: number,
): boolean {
  return assignedRir != null && assignedRir < weekRir;
}

/**
 * N18-B's orphan-clearing rule, applied to the per-slot schedules (§3): a shape
 * edit that changes `weeks`/`includes_deload` without re-supplying a schedule
 * leaves any schedule whose length no longer covers the working weeks orphaned.
 * Pure: returns the ids whose schedules must be cleared back to null, so the
 * meso reverts to `target_rir` / the ramp rather than carrying a week map that
 * no longer lines up.
 */
export function orphanedSlotSchedules(
  slots: { id: string; rir_schedule: (number | null)[] | null; set_cap_schedule: (number | null)[] | null }[],
  workingWeeks: number,
): { id: string; rir: boolean; setCap: boolean }[] {
  const out: { id: string; rir: boolean; setCap: boolean }[] = [];
  for (const s of slots) {
    const rir = s.rir_schedule != null && s.rir_schedule.length !== workingWeeks;
    const setCap =
      s.set_cap_schedule != null && s.set_cap_schedule.length !== workingWeeks;
    if (rir || setCap) out.push({ id: s.id, rir, setCap });
  }
  return out;
}

// ---------------------------------------------------------------------------
// loading (the only I/O in this module — everything above is pure)
// ---------------------------------------------------------------------------

type Client = SupabaseClient<Database>;

/** An assignment map keyed by `slotEffortKey(dayNumber, exerciseId)`. */
export type SlotEffortMap = Map<string, SlotEffortAssignment>;

/** True when a `meso_exercises` row carries any effort assignment at all. */
export function hasAssignment(a: SlotEffortAssignment): boolean {
  return (
    a.target_rir != null ||
    a.rir_schedule != null ||
    a.set_cap != null ||
    a.set_cap_schedule != null
  );
}

/**
 * Load one meso's slot assignments, keyed by day-slot × exercise.
 *
 * Cheap by design, because this sits on the generation/advance/reconcile hot
 * paths: ONE indexed read filtered to rows that actually carry an assignment,
 * and the day-number join is only paid when that read returns something. A meso
 * with no assignments — every meso today — costs exactly one empty query and
 * produces an empty map, which resolves to `undefined` for every slot and so
 * leaves fingerprints, recorded inputs, and prescriptions byte-identical.
 */
export async function getSlotEffortAssignments(
  client: Client,
  mesoId: string,
): Promise<SlotEffortMap> {
  const out: SlotEffortMap = new Map();
  const { data: slots, error } = await client
    .from("meso_exercises")
    .select(
      "exercise_id, day_of_week, meso_day_group_id, target_rir, rir_schedule, set_cap, set_cap_schedule, effort_reason",
    )
    .eq("mesocycle_id", mesoId)
    .or(
      "target_rir.not.is.null,rir_schedule.not.is.null,set_cap.not.is.null,set_cap_schedule.not.is.null",
    );
  if (error) throw error;
  if (!slots || slots.length === 0) return out;

  // day_number lives on `meso_days`, two hops up from the slot; resolved only
  // when at least one assignment exists.
  const { data: days, error: daysError } = await client
    .from("meso_days")
    .select("id, day_number")
    .eq("mesocycle_id", mesoId);
  if (daysError) throw daysError;
  const dayNumberById = new Map((days ?? []).map((d) => [d.id, d.day_number]));
  const dayIds = [...dayNumberById.keys()];
  const dayIdByGroupId = new Map<string, string>();
  if (dayIds.length > 0) {
    const { data: groups, error: groupsError } = await client
      .from("meso_day_groups")
      .select("id, meso_day_id")
      .in("meso_day_id", dayIds);
    if (groupsError) throw groupsError;
    for (const g of groups ?? []) dayIdByGroupId.set(g.id, g.meso_day_id);
  }

  for (const slot of slots) {
    const dayId = slot.meso_day_group_id
      ? dayIdByGroupId.get(slot.meso_day_group_id)
      : undefined;
    // legacy rows predate meso_days and carry the weekday directly; the plan
    // reader treats those as their own day ordering, so mirror it here.
    const dayNumber =
      (dayId != null ? dayNumberById.get(dayId) : undefined) ??
      slot.day_of_week ??
      null;
    if (dayNumber == null) continue;
    out.set(slotEffortKey(dayNumber, slot.exercise_id), {
      target_rir: slot.target_rir,
      rir_schedule: slot.rir_schedule,
      set_cap: slot.set_cap,
      set_cap_schedule: slot.set_cap_schedule,
      effort_reason: slot.effort_reason,
    });
  }
  return out;
}

/**
 * The stale-signature component for a meso's assignments (doc 21 §7.2): a
 * canonical, ORDER-STABLE serialization of every assignment in the meso, or
 * null when there is none. Null ⇒ the caller omits the key entirely, so a meso
 * without assignments hashes to exactly the signature it did before this
 * feature existed and no user pays a spurious full reconcile on deploy.
 */
export function slotEffortSignatureInput(
  assignments: SlotEffortMap,
): string[] | null {
  if (assignments.size === 0) return null;
  return [...assignments.entries()]
    .map(
      ([key, a]) =>
        `${key}|${a.target_rir ?? ""}|${(a.rir_schedule ?? []).map((v) => v ?? "").join(",")}|${a.set_cap ?? ""}|${(a.set_cap_schedule ?? []).map((v) => v ?? "").join(",")}`,
    )
    .sort();
}
