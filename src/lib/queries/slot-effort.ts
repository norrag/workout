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
import { repPositionSchema, type RepPosition } from "@/lib/engine";

export type { RepPosition };

/** The assignment columns of one `meso_exercises` row (doc 21 §3). */
export interface SlotEffortAssignment {
  target_rir: number | null;
  rir_schedule: (number | null)[] | null;
  set_cap: number | null;
  set_cap_schedule: (number | null)[] | null;
  /** doc 21 §4.2 (Phase 4) — the optional rep position, stored as text: one of
   *  `bottom|center|top` or an explicit rep count as digits. Flat per slot, with
   *  NO per-week schedule: it is a statement about how this exercise is priced,
   *  not an intensity that ramps, and a second week-indexed array would be a
   *  knob nobody asked for. */
  rep_position: string | null;
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

/**
 * Parse the stored `rep_position` text into the engine's union (doc 21 §4.2).
 * Unrecognized text resolves to null — the knob is optional everywhere, so a row
 * the DB check somehow let through degrades to "the schedule decides" rather
 * than failing a prescription.
 */
export function parseRepPosition(
  stored: string | null | undefined,
): RepPosition | null {
  if (stored == null) return null;
  const raw = /^\d+$/.test(stored) ? Number(stored) : stored;
  const parsed = repPositionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The storage form of a rep position — the inverse of `parseRepPosition`. */
export function repPositionToDb(position: RepPosition): string {
  return typeof position === "number" ? String(position) : position;
}

/** The slot's rep position, or null when unassigned. Pure. */
export function slotRepPosition(
  assignment: SlotEffortAssignment | null | undefined,
): RepPosition | null {
  return parseRepPosition(assignment?.rep_position);
}

/**
 * doc 21 §6.2 — the intent key, in one place. A slot is "backed off" for a week
 * when it was authored to run EASIER than the week it sits in. Everything that
 * treats a session as incomparable — the earn gate (§5), the strength trend, the
 * PR scan, the exercise analysis — keys on exactly this, and the four stats
 * views mirror it in SQL against the stored, already-resolved values
 * (`workout_exercises.target_rir > microcycles.target_rir`).
 *
 * Deliberately NOT symmetric: a slot run HARDER than its week (an assignment
 * below the ramp) stays fully comparable and keeps every strength claim it
 * earns — the athlete really did that work, and §4.1 already discloses the
 * hardening at authoring time.
 */
export function isBackedOffSlot(
  slotRir: number | null | undefined,
  weekRir: number | null | undefined,
): boolean {
  return slotRir != null && weekRir != null && slotRir > weekRir;
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
  /** §4.2 — where in the rep window this slot is priced; null = the schedule */
  repPosition: RepPosition | null;
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
    repPosition: slotRepPosition(assignment),
    reason: assignment?.effort_reason ?? null,
    backedOff: isBackedOffSlot(assignedRir, weekRir),
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

/** The `exerciseSetCap` engine input for a slot (doc 21 A4). Undefined — not
 *  null — when unassigned, for exactly the reason above. */
export function exerciseSetCapInput(
  assignment: SlotEffortAssignment | null | undefined,
  weekNumber: number,
): number | undefined {
  return slotSetCap(assignment, weekNumber) ?? undefined;
}

/** The `exerciseRepPosition` engine input for a slot (doc 21 §4.2). Undefined
 *  when unassigned, same fingerprint reasoning. */
export function exerciseRepPositionInput(
  assignment: SlotEffortAssignment | null | undefined,
): RepPosition | undefined {
  return slotRepPosition(assignment) ?? undefined;
}

/** All three engine inputs for one slot in one week, spread-ready: every key is
 *  OMITTED when its lever is unassigned, so an unassigned slot's config
 *  projection is byte-identical to a pre-doc-21 one. */
export function slotEffortInputs(
  assignment: SlotEffortAssignment | null | undefined,
  weekNumber: number,
): {
  exerciseRir?: number;
  exerciseSetCap?: number;
  exerciseRepPosition?: RepPosition;
} {
  const rir = exerciseRirInput(assignment, weekNumber);
  const setCap = exerciseSetCapInput(assignment, weekNumber);
  const repPosition = exerciseRepPositionInput(assignment);
  return {
    ...(rir != null ? { exerciseRir: rir } : {}),
    ...(setCap != null ? { exerciseSetCap: setCap } : {}),
    ...(repPosition != null ? { exerciseRepPosition: repPosition } : {}),
  };
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
// authoring (doc 21 Phase 3 — the write side, still pure)
// ---------------------------------------------------------------------------

/** DB bounds (migration 20260802000001), mirrored so the pure core can refuse
 *  a value the database would reject rather than surfacing a constraint error. */
export const SLOT_RIR_MIN = 0;
/** §4.3: the ask is unbounded in principle; 30 is what the app persists. */
export const SLOT_RIR_MAX = 30;
export const SLOT_SET_CAP_MIN = 1;
export const SLOT_SET_CAP_MAX = 20;
export const EFFORT_REASON_MAX = 500;

/** The columns one assignment write touches. Absent key = leave as-is. */
export interface SlotEffortPatch {
  target_rir?: number | null;
  rir_schedule?: (number | null)[] | null;
  set_cap?: number | null;
  set_cap_schedule?: (number | null)[] | null;
  rep_position?: string | null;
  effort_reason?: string | null;
}

/** An empty (never-assigned) slot — the starting point for a fresh write. */
export function emptySlotEffort(): SlotEffortAssignment {
  return {
    target_rir: null,
    rir_schedule: null,
    set_cap: null,
    set_cap_schedule: null,
    rep_position: null,
    effort_reason: null,
  };
}

/** Apply a patch to an assignment, so a sequence of edits composes purely. */
export function applySlotEffortPatch(
  current: SlotEffortAssignment,
  patch: SlotEffortPatch,
): SlotEffortAssignment {
  return { ...current, ...patch };
}

/**
 * One authoring intent, for either lever. Exactly one of `value` / `schedule` /
 * `clear` carries the assignment:
 *
 * - `value` alone      — a flat assignment for the whole meso (the deload week
 *                        included: a flat value is what a week off the end of
 *                        the schedule falls back to).
 * - `value` + `weeks`  — that value on those WORKING weeks, ramp elsewhere.
 * - `schedule`         — the explicit per-working-week array (null = ramp).
 * - `clear`            — remove this lever's assignment entirely.
 *
 * `reason` (A7) is orthogonal: absent leaves it untouched, a string sets it,
 * null clears it. Clearing the last assignment on a slot clears the reason too
 * — a reason with nothing to explain is noise in every surface that reads it.
 */
export interface SlotEffortEdit {
  /** doc 21 Phase 4 adds `rep_position`, which is FLAT per slot: it takes
   *  `position` and refuses `weeks`/`schedule` (see `planSlotEffortEdit`). */
  lever: "rir" | "sets" | "rep_position";
  value?: number | null;
  /** `rep_position` only — `bottom | center | top` or an explicit rep count */
  position?: RepPosition | null;
  weeks?: number[] | null;
  schedule?: (number | null)[] | null;
  clear?: boolean;
  reason?: string | null;
}

export interface SlotEffortEditPlan {
  /** the columns to write */
  patch: SlotEffortPatch;
  /** the assignment as it reads after the write */
  next: SlotEffortAssignment;
  /** this lever's value per working week after the write (null = ramp) */
  byWeek: (number | null)[];
  /** the working weeks that carry a value after the write */
  assignedWeeks: number[];
  /** true when the slot carries no assignment on EITHER lever afterwards */
  cleared: boolean;
  /**
   * true when a trailing deload week also inherits this assignment. A flat
   * value governs every week the schedule doesn't cover — including the deload
   * — which is exactly §4.1's "absolute, deload included", and exactly the
   * thing that must never apply silently.
   */
  coversDeload: boolean;
  /** one line for the tool result / audit summary */
  summary: string;
}

export type SlotEffortEditResult =
  | { ok: true; plan: SlotEffortEditPlan }
  | { ok: false; error: string };

interface LeverSpec {
  flat: "target_rir" | "set_cap";
  sched: "rir_schedule" | "set_cap_schedule";
  min: number;
  max: number;
  label: string;
  unit: (v: number) => string;
}

/** The two WEEK-SCHEDULED levers. `rep_position` is deliberately absent: it is
 *  flat per slot and has its own planner (`planRepPositionEdit`). */
const LEVERS: Record<"rir" | "sets", LeverSpec> = {
  rir: {
    flat: "target_rir",
    sched: "rir_schedule",
    min: SLOT_RIR_MIN,
    max: SLOT_RIR_MAX,
    label: "target RIR",
    unit: (v) => `RIR ${v}`,
  },
  sets: {
    flat: "set_cap",
    sched: "set_cap_schedule",
    min: SLOT_SET_CAP_MIN,
    max: SLOT_SET_CAP_MAX,
    label: "working-set cap",
    unit: (v) => `${v} set${v === 1 ? "" : "s"}`,
  },
};

function weekList(weeks: number[]): string {
  return weeks.length === 1 ? `week ${weeks[0]}` : `weeks ${weeks.join(", ")}`;
}

/**
 * Plan one assignment write. Pure: takes the slot's current assignment, the
 * intent, and the meso's shape; returns the exact column patch or a refusal.
 * Every bound the database enforces is checked here first so the caller can
 * report a sentence instead of a constraint violation, and so the whole
 * authoring surface is unit-testable without a database.
 */
export function planSlotEffortEdit(
  current: SlotEffortAssignment,
  edit: SlotEffortEdit,
  shape: { weeks: number; includesDeload: boolean },
): SlotEffortEditResult {
  if (edit.lever === "rep_position")
    return planRepPositionEdit(current, edit, shape);
  const spec = LEVERS[edit.lever];
  const workingWeeks = shape.includesDeload ? shape.weeks - 1 : shape.weeks;
  if (workingWeeks < 1)
    return { ok: false, error: "this mesocycle has no working weeks to assign." };

  const wantsClear = edit.clear === true || edit.value === null;
  if (edit.weeks != null && wantsClear)
    return {
      ok: false,
      error:
        "clearing removes the whole assignment — it can't be limited to weeks. To drop just some weeks, send a schedule with nulls in those positions.",
    };
  if (edit.weeks != null && edit.value == null)
    return {
      ok: false,
      error: "`weeks` selects the weeks a flat value applies to — supply the value too.",
    };
  const modes = [
    wantsClear,
    edit.value != null,
    edit.schedule != null,
  ].filter(Boolean).length;
  if (modes === 0)
    return {
      ok: false,
      error: `nothing to set — give a ${edit.lever === "rir" ? "rir" : "sets"} value (optionally with weeks), a schedule, or clear: true.`,
    };
  if (modes > 1)
    return {
      ok: false,
      error: "give exactly one of a flat value, a schedule, or clear: true.",
    };

  const patch: SlotEffortPatch = {};

  if (wantsClear) {
    patch[spec.flat] = null;
    patch[spec.sched] = null;
  } else if (edit.schedule != null) {
    const schedule = edit.schedule;
    if (schedule.length !== workingWeeks)
      return {
        ok: false,
        error: `schedule must cover the ${workingWeeks} working week(s) (got ${schedule.length}). Use null for a week that should follow the ramp.`,
      };
    for (const v of schedule) {
      if (v == null) continue;
      if (!Number.isInteger(v) || v < spec.min || v > spec.max)
        return {
          ok: false,
          error: `${spec.label} values must be whole numbers ${spec.min}–${spec.max} (got ${v}).`,
        };
    }
    if (schedule.every((v) => v == null))
      return {
        ok: false,
        error: "that schedule assigns nothing — use clear: true to remove the assignment.",
      };
    patch[spec.flat] = null;
    patch[spec.sched] = [...schedule];
  } else {
    const value = edit.value!;
    if (!Number.isInteger(value) || value < spec.min || value > spec.max)
      return {
        ok: false,
        error: `${spec.label} must be a whole number ${spec.min}–${spec.max} (got ${value}).`,
      };
    if (edit.weeks != null) {
      const weeks = [...new Set(edit.weeks)].sort((a, b) => a - b);
      if (weeks.length === 0)
        return { ok: false, error: "`weeks` was empty — omit it to assign every week." };
      const outOfRange = weeks.filter((w) => w < 1 || w > workingWeeks);
      if (outOfRange.length > 0)
        return {
          ok: false,
          error: `week(s) ${outOfRange.join(", ")} are outside this mesocycle's ${workingWeeks} working week(s)${
            shape.includesDeload ? " (the deload week can't be targeted by week — a flat value covers it)" : ""
          }.`,
        };
      const schedule: (number | null)[] = Array.from({ length: workingWeeks }, () => null);
      for (const w of weeks) schedule[w - 1] = value;
      patch[spec.flat] = null;
      patch[spec.sched] = schedule;
    } else {
      patch[spec.flat] = value;
      patch[spec.sched] = null;
    }
  }

  if (edit.reason !== undefined) {
    const trimmed = edit.reason?.trim();
    if (trimmed != null && trimmed.length > EFFORT_REASON_MAX)
      return {
        ok: false,
        error: `reason is limited to ${EFFORT_REASON_MAX} characters (got ${trimmed.length}).`,
      };
    patch.effort_reason = trimmed != null && trimmed.length > 0 ? trimmed : null;
  }

  let next = applySlotEffortPatch(current, patch);
  const cleared = !hasAssignment(next);
  if (cleared && next.effort_reason != null) {
    patch.effort_reason = null;
    next = applySlotEffortPatch(next, { effort_reason: null });
  }

  const byWeek: (number | null)[] = [];
  for (let w = 1; w <= workingWeeks; w++) {
    byWeek.push(pickWeek(next[spec.flat], next[spec.sched], w));
  }
  const assignedWeeks = byWeek
    .map((v, i) => (v == null ? null : i + 1))
    .filter((w): w is number => w != null);
  const coversDeload = shape.includesDeload && next[spec.flat] != null;

  let summary: string;
  if (wantsClear) {
    summary = `cleared the ${spec.label} assignment`;
  } else if (patch[spec.flat] != null) {
    summary = `${spec.unit(patch[spec.flat]!)} for the whole mesocycle`;
  } else {
    const values = [...new Set(assignedWeeks.map((w) => byWeek[w - 1]!))];
    summary =
      values.length === 1
        ? `${spec.unit(values[0])} on ${weekList(assignedWeeks)}`
        : `${spec.label} ${assignedWeeks.map((w) => `w${w}:${byWeek[w - 1]}`).join(" ")}`;
  }

  return {
    ok: true,
    plan: { patch, next, byWeek, assignedWeeks, cleared, coversDeload, summary },
  };
}

/**
 * The rep-position lever (doc 21 §4.2), planned through the same entry point and
 * the same result shape as the two week-scheduled levers so a caller composing a
 * batch never has to branch. Flat by design: `weeks` and `schedule` are refused
 * rather than quietly ignored, because a caller that asked for a per-week rep
 * position asked for something this column cannot express.
 *
 * `byWeek` / `assignedWeeks` / `coversDeload` are deliberately empty-and-false:
 * they describe a per-week intensity assignment, and a rep position is neither
 * per-week nor an intensity. That also means the batch planner's already-trained
 * -week warning and its deload disclosure stay silent for this lever, which is
 * correct — there is no week it can name.
 */
function planRepPositionEdit(
  current: SlotEffortAssignment,
  edit: SlotEffortEdit,
  shape: { weeks: number; includesDeload: boolean },
): SlotEffortEditResult {
  const workingWeeks = shape.includesDeload ? shape.weeks - 1 : shape.weeks;
  if (workingWeeks < 1)
    return { ok: false, error: "this mesocycle has no working weeks to assign." };
  if (edit.weeks != null || edit.schedule != null)
    return {
      ok: false,
      error:
        "rep position is flat for the slot — it takes no weeks or schedule. Use set_exercise_rir for a per-week assignment.",
    };
  if (edit.value != null)
    return {
      ok: false,
      error: "rep position takes `position` (bottom | center | top | a rep count), not a value.",
    };

  const wantsClear = edit.clear === true || edit.position === null;
  if (!wantsClear && edit.position === undefined)
    return {
      ok: false,
      error:
        "nothing to set — give a position (bottom | center | top | a rep count) or clear: true.",
    };
  if (edit.clear === true && edit.position != null)
    return { ok: false, error: "give exactly one of a position or clear: true." };
  if (!wantsClear) {
    const parsed = repPositionSchema.safeParse(edit.position);
    if (!parsed.success)
      return {
        ok: false,
        error:
          "rep position must be bottom, center, top, or a whole rep count 1–50.",
      };
  }

  const patch: SlotEffortPatch = {
    rep_position: wantsClear ? null : repPositionToDb(edit.position!),
  };
  if (edit.reason !== undefined) {
    const trimmed = edit.reason?.trim();
    if (trimmed != null && trimmed.length > EFFORT_REASON_MAX)
      return {
        ok: false,
        error: `reason is limited to ${EFFORT_REASON_MAX} characters (got ${trimmed.length}).`,
      };
    patch.effort_reason = trimmed != null && trimmed.length > 0 ? trimmed : null;
  }

  let next = applySlotEffortPatch(current, patch);
  const cleared = !hasAssignment(next);
  if (cleared && next.effort_reason != null) {
    patch.effort_reason = null;
    next = applySlotEffortPatch(next, { effort_reason: null });
  }

  return {
    ok: true,
    plan: {
      patch,
      next,
      byWeek: Array.from({ length: workingWeeks }, () => null),
      assignedWeeks: [],
      cleared,
      coversDeload: false,
      summary: wantsClear
        ? "cleared the rep position — the climb schedule decides again"
        : `priced at ${
            typeof edit.position === "number"
              ? `${edit.position} reps`
              : `the ${edit.position} of the rep window`
          }`,
    },
  };
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
    a.set_cap_schedule != null ||
    a.rep_position != null
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
  for (const row of await getSlotEffortRows(client, mesoId, true)) {
    out.set(row.key, row.assignment);
  }
  return out;
}

/** One `meso_exercises` row with its day-slot identity resolved. */
export interface SlotEffortRow {
  id: string;
  key: string;
  dayNumber: number;
  exerciseId: string;
  assignment: SlotEffortAssignment;
}

/**
 * The row-level load behind both the read map and the write paths. With
 * `assignedOnly` it is the cheap hot-path read described above; without it, it
 * is how a writer addresses a slot after `save_meso_plan` has re-minted every
 * row id (the day-slot × exercise key is stable across that replace, the id is
 * not).
 */
export async function getSlotEffortRows(
  client: Client,
  mesoId: string,
  assignedOnly: boolean,
): Promise<SlotEffortRow[]> {
  let query = client
    .from("meso_exercises")
    .select(
      "id, exercise_id, day_of_week, meso_day_group_id, target_rir, rir_schedule, set_cap, set_cap_schedule, rep_position, effort_reason",
    )
    .eq("mesocycle_id", mesoId);
  if (assignedOnly)
    query = query.or(
      "target_rir.not.is.null,rir_schedule.not.is.null,set_cap.not.is.null,set_cap_schedule.not.is.null,rep_position.not.is.null",
    );
  const { data: slots, error } = await query;
  if (error) throw error;
  const out: SlotEffortRow[] = [];
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
    out.push({
      id: slot.id,
      key: slotEffortKey(dayNumber, slot.exercise_id),
      dayNumber,
      exerciseId: slot.exercise_id,
      assignment: {
        target_rir: slot.target_rir,
        rir_schedule: slot.rir_schedule,
        set_cap: slot.set_cap,
        set_cap_schedule: slot.set_cap_schedule,
        rep_position: slot.rep_position,
        effort_reason: slot.effort_reason,
      },
    });
  }
  return out;
}

/** Write one slot's assignment columns. RLS scopes the row (`meso_exercises`
 *  is guarded through `mesocycles.user_id`), so no user filter is needed. */
export async function writeSlotEffort(
  client: Client,
  slotId: string,
  patch: SlotEffortPatch,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const { error } = await client
    .from("meso_exercises")
    .update(patch)
    .eq("id", slotId);
  if (error) throw error;
}

/**
 * Carry assignments across `save_meso_plan`'s wholesale replace.
 *
 * The planner-board save deletes the meso's days and re-inserts every slot from
 * the payload, and that payload has never carried the assignment columns — so
 * without this, reordering a day (in the app or over MCP) would silently drop
 * every effort assignment in the meso. Re-keying by day-slot × exercise is
 * exactly the identity the resolution itself uses (`slotEffortKey`), so a slot
 * that survived the edit keeps its assignment and one that was removed loses it,
 * which is the right outcome in both cases.
 *
 * Returns the number of slots restored. A meso with no assignments — every meso
 * today — costs one filtered, indexed query and writes nothing.
 */
export async function restoreSlotEffortAssignments(
  client: Client,
  mesoId: string,
  snapshot: SlotEffortMap,
): Promise<number> {
  if (snapshot.size === 0) return 0;
  const rows = await getSlotEffortRows(client, mesoId, false);
  let restored = 0;
  for (const row of rows) {
    const saved = snapshot.get(row.key);
    if (!saved) continue;
    await writeSlotEffort(client, row.id, {
      target_rir: saved.target_rir,
      rir_schedule: saved.rir_schedule,
      set_cap: saved.set_cap,
      set_cap_schedule: saved.set_cap_schedule,
      rep_position: saved.rep_position,
      effort_reason: saved.effort_reason,
    });
    restored++;
  }
  return restored;
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
        `${key}|${a.target_rir ?? ""}|${(a.rir_schedule ?? []).map((v) => v ?? "").join(",")}|${a.set_cap ?? ""}|${(a.set_cap_schedule ?? []).map((v) => v ?? "").join(",")}|${a.rep_position ?? ""}`,
    )
    .sort();
}
