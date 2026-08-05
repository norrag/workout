import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, WorkoutRow } from "@/lib/types/database";
import { getProfile } from "@/lib/queries/profiles";
import {
  getMesoPlan,
  saveMesoPlan,
  type MesoPlan,
  type PlanDayInput,
} from "@/lib/queries/cycles";
import {
  getActiveEngineParams,
  regenerateOpenWorkouts,
} from "@/lib/queries/generation";
import { repPositionSchema } from "@/lib/engine";
import {
  getSlotEffortRows,
  loadEffortContext,
  planEffortEdits,
  slotEffortKey,
  writeSlotEffort,
  EFFORT_REASON_MAX,
  SLOT_RIR_MAX,
  SLOT_RIR_MIN,
  SLOT_SET_CAP_MAX,
  SLOT_SET_CAP_MIN,
  type EffortContext,
  type EffortOp,
  type EffortPlanResult,
  type EffortSlotRef,
  type SlotEffortAssignment,
} from "@/lib/queries/slot-effort";

// The effort-authoring batch planner + its context loader moved to the query
// layer in doc 21 Phase 6, when the app gained a write surface of its own —
// re-exported here so the tool's own tests (and any existing importer) keep
// addressing them where they were first defined.
export {
  planEffortEdits,
  type EffortContext,
  type EffortPlanResult,
  type EffortSlotRef,
};
import {
  findUnknownExerciseIds,
  getMusclesForExercises,
  listMuscleGroups,
} from "@/lib/queries/exercises";
import { resolveSession, type McpExtra } from "../session";
import { toolResult, type EnvelopeOpts } from "../envelope";
import { recordMcpWrite } from "../audit";
import { resolveMuscleGroupIds } from "./write";
import { formatMesoPlan } from "./read";

/**
 * Stage 4 (12 §Stage 4) — `edit_mesocycle`. The first *structural* write on an
 * existing meso, so the "analyze → suggest → apply on approval" loop finally has
 * an apply step (agentic rebalancing: a muscle below MEV → add a slot → ramp it
 * forward). Five bounded, in-place operations: add / remove / swap an exercise,
 * reorder a day's exercises, and set a slot's week-1 baseline set count.
 *
 * Hard-rule discipline (12 decisions #1/#2, hard rules #3/#5/#6):
 * - The **engine still owns every prescribed number.** The LLM edits *structure*
 *   and the week-1 baseline only; the edit re-saves the planner board and lets
 *   `regenerateOpenWorkouts` ramp the change into the open (not-started) workouts.
 * - **Editable targets = any day that is neither completed nor in progress**
 *   (decision #1), including untouched later days of the current week. A day
 *   whose current-week workout is completed/in-progress is refused, and
 *   regeneration never touches a started/finished workout or any logged set.
 * - Only a **planned or active** meso is editable; validated with zod; every
 *   successful edit records a `mcp_write_audit` row. No `user_id` argument.
 */

type Client = SupabaseClient<Database>;

function jsonResult(payload: Record<string, unknown>, opts: EnvelopeOpts = {}) {
  return toolResult(payload, opts);
}

// --- pure edit core --------------------------------------------------------
// A neutral, I/O-free model of the planner board (days → groups → slot fills)
// plus an `applyMesoEdits` transformer, so every operation's effect on the plan
// is unit-testable without a database.

export interface EditSlot {
  /** the meso_exercise id (a slot is addressed by this; new fills get a marker) */
  slot_id: string;
  exercise_id: string;
  initial_sets: number;
  /** day-level order across all groups (the flat board order, 08/#2) */
  day_position: number;
  /** group-local slot index (tie-break only) */
  slot_number: number | null;
}
export interface EditGroup {
  group_id: string;
  muscle_group_id: string;
  position: number;
  exercise_slots: number;
  fills: EditSlot[];
}
export interface EditDay {
  day_number: number;
  label: string | null;
  weekday: number | null;
  groups: EditGroup[];
}

/** One muscle-group block of an added day (names already resolved to ids). */
export interface ResolvedDayGroup {
  muscle_group_id: string;
  exercises: { exercise_id: string; sets?: number }[];
}

/** A muscle-group-resolved edit (the tool maps `muscle_group` name → id first). */
export type ResolvedEdit =
  | {
      op: "add_exercise";
      day_number: number;
      muscle_group_id: string;
      exercise_id: string;
      sets?: number;
    }
  | { op: "remove_exercise"; slot_id: string }
  | { op: "swap_exercise"; slot_id: string; new_exercise_id: string }
  | { op: "reorder_day"; day_number: number; ordered_slot_ids: string[] }
  | { op: "set_baseline_sets"; slot_id: string; sets: number }
  | {
      op: "add_day";
      day_number: number | null;
      label: string | null;
      weekday: number | null;
      groups: ResolvedDayGroup[];
    }
  | { op: "remove_day"; day_number: number };

export type ApplyResult =
  | { ok: true; days: PlanDayInput[]; touched: number[]; summaries: string[] }
  | { ok: false; error: string };

/** Project a fetched meso plan into the neutral edit model. */
export function toEditDays(plan: MesoPlan): EditDay[] {
  return plan.days.map((d) => ({
    day_number: d.day_number,
    label: d.label,
    weekday: d.weekday,
    groups: d.groups.map((g) => ({
      group_id: g.id,
      muscle_group_id: g.muscle_group_id,
      position: g.position,
      exercise_slots: g.exercise_slots,
      fills: g.fills.map((f) => ({
        slot_id: f.id,
        exercise_id: f.exercise_id,
        initial_sets: f.initial_sets,
        day_position: f.position,
        slot_number: f.slot_number,
      })),
    })),
  }));
}

const DEFAULT_BASELINE_SETS = 3;
const MAX_SLOTS_PER_GROUP = 10; // mirrors the app planner / DB check

/**
 * Apply a sequence of structural edits to the planner board and emit a fresh
 * `PlanDayInput[]` for `saveMesoPlan`. Pure: no I/O, no clock, no randomness —
 * every prescribed number is the engine's job downstream. Operations apply in
 * order; the first invalid one aborts with a message (nothing is half-applied
 * because the caller only persists a fully-`ok` result).
 *
 * A group whose fills change (add/remove) is "resized to its filled slots" — an
 * add grows it, a remove drops the slot, and a group emptied by a remove is
 * dropped entirely. Untouched groups keep their exact slot count (so a planned
 * open slot elsewhere survives an unrelated edit).
 */
export function applyMesoEdits(input: EditDay[], ops: ResolvedEdit[]): ApplyResult {
  // deep clone so the input (and the fetched plan behind it) is never mutated
  const days: EditDay[] = input.map((d) => ({
    ...d,
    groups: d.groups.map((g) => ({ ...g, fills: g.fills.map((f) => ({ ...f })) })),
  }));
  const touched = new Set<number>();
  const changedGroups = new Set<string>(); // groups whose fill set changed (add/remove)
  const summaries: string[] = [];
  let counter = 0;

  const findSlot = (slotId: string) => {
    for (const d of days)
      for (const g of d.groups) {
        const f = g.fills.find((x) => x.slot_id === slotId);
        if (f) return { day: d, group: g, fill: f };
      }
    return null;
  };

  for (const op of ops) {
    switch (op.op) {
      case "add_exercise": {
        const day = days.find((d) => d.day_number === op.day_number);
        if (!day) return { ok: false, error: `no day ${op.day_number} in this mesocycle.` };
        let group = day.groups.find((g) => g.muscle_group_id === op.muscle_group_id);
        if (!group) {
          group = {
            group_id: `__new_g_${counter++}`,
            muscle_group_id: op.muscle_group_id,
            position: Math.max(0, ...day.groups.map((g) => g.position)) + 1,
            exercise_slots: 0,
            fills: [],
          };
          day.groups.push(group);
        }
        const dayMax = Math.max(
          0,
          ...day.groups.flatMap((g) => g.fills.map((f) => f.day_position)),
        );
        const slotNum = Math.max(0, ...group.fills.map((f) => f.slot_number ?? 0)) + 1;
        group.fills.push({
          slot_id: `__new_${counter++}`,
          exercise_id: op.exercise_id,
          initial_sets: op.sets ?? DEFAULT_BASELINE_SETS,
          day_position: dayMax + 1,
          slot_number: slotNum,
        });
        changedGroups.add(group.group_id);
        touched.add(day.day_number);
        summaries.push(`added an exercise to day ${day.day_number}`);
        break;
      }
      case "remove_exercise": {
        const loc = findSlot(op.slot_id);
        if (!loc) return { ok: false, error: `slot ${op.slot_id} not found in this mesocycle.` };
        loc.group.fills = loc.group.fills.filter((f) => f.slot_id !== op.slot_id);
        changedGroups.add(loc.group.group_id);
        touched.add(loc.day.day_number);
        summaries.push(`removed an exercise from day ${loc.day.day_number}`);
        break;
      }
      case "swap_exercise": {
        const loc = findSlot(op.slot_id);
        if (!loc) return { ok: false, error: `slot ${op.slot_id} not found in this mesocycle.` };
        loc.fill.exercise_id = op.new_exercise_id;
        touched.add(loc.day.day_number);
        summaries.push(`swapped the exercise on day ${loc.day.day_number}`);
        break;
      }
      case "set_baseline_sets": {
        const loc = findSlot(op.slot_id);
        if (!loc) return { ok: false, error: `slot ${op.slot_id} not found in this mesocycle.` };
        loc.fill.initial_sets = op.sets;
        touched.add(loc.day.day_number);
        summaries.push(`set day ${loc.day.day_number} baseline to ${op.sets} set(s)`);
        break;
      }
      case "add_day": {
        // pick the smallest free 1..7 when unspecified (mirrors addMesoDay), so a
        // later add can't push a day past the 7-day week ceiling
        const taken = new Set(days.map((d) => d.day_number));
        let dayNumber = op.day_number ?? 0;
        if (dayNumber === 0) {
          for (let n = 1; n <= 7; n++)
            if (!taken.has(n)) {
              dayNumber = n;
              break;
            }
          if (dayNumber === 0)
            return { ok: false, error: "a week can hold at most 7 training days." };
        } else if (taken.has(dayNumber)) {
          return {
            ok: false,
            error: `day ${dayNumber} already exists — remove it first or add without a day_number.`,
          };
        }
        // R3: two blocks resolving to the same muscle group (e.g. "Chest"/
        // "chest") would violate the meso_day_groups unique key at save time —
        // refuse up front instead
        const seenGroups = new Set<string>();
        for (const g of op.groups) {
          if (seenGroups.has(g.muscle_group_id))
            return {
              ok: false,
              error: `the added day lists the same muscle group twice — merge its exercises into one block.`,
            };
          seenGroups.add(g.muscle_group_id);
        }
        let dayPos = 0;
        const newDay: EditDay = {
          day_number: dayNumber,
          label: op.label,
          weekday: op.weekday,
          groups: op.groups.map((g, gi) => {
            const groupId = `__new_g_${counter++}`;
            changedGroups.add(groupId);
            return {
              group_id: groupId,
              muscle_group_id: g.muscle_group_id,
              position: gi + 1,
              exercise_slots: g.exercises.length,
              fills: g.exercises.map((ex, i) => ({
                slot_id: `__new_${counter++}`,
                exercise_id: ex.exercise_id,
                initial_sets: ex.sets ?? DEFAULT_BASELINE_SETS,
                day_position: ++dayPos,
                slot_number: i + 1,
              })),
            };
          }),
        };
        days.push(newDay);
        touched.add(dayNumber);
        summaries.push(
          `added day ${dayNumber} (${op.groups.reduce((n, g) => n + g.exercises.length, 0)} exercise(s))`,
        );
        break;
      }
      case "remove_day": {
        const idx = days.findIndex((d) => d.day_number === op.day_number);
        if (idx < 0)
          return { ok: false, error: `no day ${op.day_number} in this mesocycle.` };
        days.splice(idx, 1);
        touched.add(op.day_number);
        summaries.push(`removed day ${op.day_number}`);
        break;
      }
      case "reorder_day": {
        const day = days.find((d) => d.day_number === op.day_number);
        if (!day) return { ok: false, error: `no day ${op.day_number} in this mesocycle.` };
        const slotIds = day.groups.flatMap((g) => g.fills.map((f) => f.slot_id));
        const wanted = op.ordered_slot_ids;
        if (
          wanted.length !== slotIds.length ||
          !slotIds.every((id) => wanted.includes(id))
        )
          return {
            ok: false,
            error: `reorder_day for day ${op.day_number} must list exactly its ${slotIds.length} slot id(s), each once.`,
          };
        const orderIndex = new Map(wanted.map((id, i) => [id, i + 1]));
        for (const g of day.groups)
          for (const f of g.fills) f.day_position = orderIndex.get(f.slot_id)!;
        touched.add(day.day_number);
        summaries.push(`reordered day ${op.day_number}`);
        break;
      }
    }
  }

  // emit PlanDayInput for ALL days (saveMesoPlan does a wholesale replace), with
  // day_position renumbered 1..n per day in the current flat order.
  const out: PlanDayInput[] = [];
  for (const day of days) {
    const flat = day.groups
      .flatMap((g) => g.fills.map((f) => ({ g, f })))
      .sort(
        (a, b) =>
          a.f.day_position - b.f.day_position ||
          a.g.position - b.g.position ||
          (a.f.slot_number ?? 0) - (b.f.slot_number ?? 0),
      );
    const newPos = new Map<EditSlot, number>();
    flat.forEach((x, i) => newPos.set(x.f, i + 1));

    const groups = [...day.groups]
      // a group emptied by a removal is dropped; a pre-existing empty (untouched)
      // group is kept (an intentional open block the user will fill in-app)
      .filter((g) => !(changedGroups.has(g.group_id) && g.fills.length === 0))
      .sort((a, b) => a.position - b.position)
      .map((g) => {
        const fills = [...g.fills].sort(
          (a, b) => (newPos.get(a) ?? 0) - (newPos.get(b) ?? 0),
        );
        const slots = changedGroups.has(g.group_id)
          ? Math.max(fills.length, 1)
          : Math.max(g.exercise_slots, fills.length);
        return {
          muscle_group_id: g.muscle_group_id,
          exercise_slots: slots,
          fills: fills.map((f, i) => ({
            slot_number: i + 1,
            exercise_id: f.exercise_id,
            initial_sets: f.initial_sets,
            day_position: newPos.get(f)!,
          })),
        };
      });

    const oversized = groups.find((g) => g.exercise_slots > MAX_SLOTS_PER_GROUP);
    if (oversized)
      return {
        ok: false,
        error: `a muscle-group block would hold ${oversized.exercise_slots} slots (max ${MAX_SLOTS_PER_GROUP}). Split it across days or groups.`,
      };

    out.push({
      day_number: day.day_number,
      label: day.label,
      weekday: day.weekday,
      groups,
    });
  }

  return { ok: true, days: out, touched: [...touched].sort((a, b) => a - b), summaries };
}

// --- active-week target guard (decision #1) --------------------------------

/** The current (active) week's workout status per day_number, for the lock check. */
async function activeWeekStatusByDay(
  client: Client,
  mesoId: string,
): Promise<Map<number, WorkoutRow["status"]>> {
  const { data: micro, error: microError } = await client
    .from("microcycles")
    .select("id")
    .eq("mesocycle_id", mesoId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (microError) throw microError;
  if (!micro) return new Map();
  const { data: workouts, error: woError } = await client
    .from("workouts")
    .select("day_number, status")
    .eq("microcycle_id", micro.id);
  if (woError) throw woError;
  return new Map((workouts ?? []).map((w) => [w.day_number, w.status]));
}

// --- tool ------------------------------------------------------------------

const addOp = z.object({
  op: z.literal("add_exercise"),
  day_number: z.number().int().min(1).max(7),
  muscle_group: z.string().min(1),
  exercise_id: z.string().uuid(),
  sets: z.number().int().min(1).max(10).optional(),
});
const removeOp = z.object({
  op: z.literal("remove_exercise"),
  slot_id: z.string().uuid(),
});
const swapOp = z.object({
  op: z.literal("swap_exercise"),
  slot_id: z.string().uuid(),
  new_exercise_id: z.string().uuid(),
});
const reorderOp = z.object({
  op: z.literal("reorder_day"),
  day_number: z.number().int().min(1).max(7),
  ordered_slot_ids: z.array(z.string().uuid()).min(1),
});
const setSetsOp = z.object({
  op: z.literal("set_baseline_sets"),
  slot_id: z.string().uuid(),
  sets: z.number().int().min(1).max(10),
});
const addDayOp = z.object({
  op: z.literal("add_day"),
  // omit day_number to take the next free slot (1..7); a week holds at most 7
  day_number: z.number().int().min(1).max(7).nullable().optional(),
  label: z.string().max(40).nullable().optional(),
  weekday: z.number().int().min(1).max(7).nullable().optional(),
  groups: z
    .array(
      z.object({
        muscle_group: z.string().min(1),
        exercises: z
          .array(
            z.object({
              exercise_id: z.string().uuid(),
              sets: z.number().int().min(1).max(10).optional(),
            }),
          )
          .min(1)
          .max(10),
      }),
    )
    .min(1)
    .max(20),
});
const removeDayOp = z.object({
  op: z.literal("remove_day"),
  day_number: z.number().int().min(1).max(7),
});
// doc 21 §8 — the effort levers. Same slot addressing as every other op; the
// value forms are "flat", "flat + weeks", "explicit schedule", or "clear".
const setExerciseRirOp = z.object({
  op: z.literal("set_exercise_rir"),
  slot_id: z.string().uuid(),
  rir: z.number().int().min(SLOT_RIR_MIN).max(SLOT_RIR_MAX).nullable().optional(),
  weeks: z.array(z.number().int().min(1).max(8)).min(1).max(8).optional(),
  schedule: z
    .array(z.number().int().min(SLOT_RIR_MIN).max(SLOT_RIR_MAX).nullable())
    .min(1)
    .max(8)
    .optional(),
  clear: z.boolean().optional(),
  reason: z.string().max(EFFORT_REASON_MAX).nullable().optional(),
});
const setExerciseSetsOp = z.object({
  op: z.literal("set_exercise_sets"),
  slot_id: z.string().uuid(),
  sets: z
    .number()
    .int()
    .min(SLOT_SET_CAP_MIN)
    .max(SLOT_SET_CAP_MAX)
    .nullable()
    .optional(),
  weeks: z.array(z.number().int().min(1).max(8)).min(1).max(8).optional(),
  schedule: z
    .array(z.number().int().min(SLOT_SET_CAP_MIN).max(SLOT_SET_CAP_MAX).nullable())
    .min(1)
    .max(8)
    .optional(),
  clear: z.boolean().optional(),
  reason: z.string().max(EFFORT_REASON_MAX).nullable().optional(),
});
// doc 21 §4.2 — the rep-position lever. Flat per slot (no weeks/schedule), so
// the shape is deliberately narrower than the other two.
const setExerciseRepPositionOp = z.object({
  op: z.literal("set_exercise_rep_position"),
  slot_id: z.string().uuid(),
  position: repPositionSchema.nullable().optional(),
  clear: z.boolean().optional(),
  reason: z.string().max(EFFORT_REASON_MAX).nullable().optional(),
});
const operationSchema = z.discriminatedUnion("op", [
  addOp,
  removeOp,
  swapOp,
  reorderOp,
  setSetsOp,
  addDayOp,
  removeDayOp,
  setExerciseRirOp,
  setExerciseSetsOp,
  setExerciseRepPositionOp,
]);
type Operation = z.infer<typeof operationSchema>;

type EffortOperation =
  | z.infer<typeof setExerciseRirOp>
  | z.infer<typeof setExerciseSetsOp>
  | z.infer<typeof setExerciseRepPositionOp>;

const EFFORT_OPS = new Set([
  "set_exercise_rir",
  "set_exercise_sets",
  "set_exercise_rep_position",
]);

function isEffortOp(o: Operation): o is EffortOperation {
  return EFFORT_OPS.has(o.op);
}

/** The zod op → the lever-neutral intent the pure planner takes. */
export function toEffortOp(o: EffortOperation): EffortOp {
  if (o.op === "set_exercise_rep_position")
    return {
      op: o.op,
      slot_id: o.slot_id,
      edit: {
        lever: "rep_position",
        ...(o.position !== undefined ? { position: o.position } : {}),
        ...(o.clear !== undefined ? { clear: o.clear } : {}),
        ...(o.reason !== undefined ? { reason: o.reason } : {}),
      },
    };
  const lever = o.op === "set_exercise_rir" ? "rir" : "sets";
  const value = o.op === "set_exercise_rir" ? o.rir : o.sets;
  return {
    op: o.op,
    slot_id: o.slot_id,
    edit: {
      lever,
      ...(value !== undefined ? { value } : {}),
      ...(o.weeks !== undefined ? { weeks: o.weeks } : {}),
      ...(o.schedule !== undefined ? { schedule: o.schedule } : {}),
      ...(o.clear !== undefined ? { clear: o.clear } : {}),
      ...(o.reason !== undefined ? { reason: o.reason } : {}),
    },
  };
}

export const EDIT_MESOCYCLE = "edit_mesocycle";

export function registerEditMesocycle(server: McpServer) {
  server.registerTool(
    EDIT_MESOCYCLE,
    {
      title: "Edit mesocycle structure",
      description:
        "Restructure a PLANNED or ACTIVE mesocycle by applying one or more " +
        "operations to its planner board (get the slot_id / day_number ids from " +
        "get_mesocycle first). Operations: add_day (lay down a WHOLE training day " +
        "at once — optional day_number/label/weekday + its muscle_group blocks, " +
        "each with exercises and optional starting sets; omit day_number to take " +
        "the next free slot), remove_day (day_number), add_exercise (day_number + " +
        "muscle_group name + exercise_id, optional sets), remove_exercise " +
        "(slot_id), swap_exercise (slot_id + new_exercise_id), reorder_day " +
        "(day_number + ordered_slot_ids covering that whole day), set_baseline_sets " +
        "(slot_id + sets). add_day lets you build an empty/placeholder meso up to a " +
        "complete multi-day plan in one call. You edit STRUCTURE and the week-1 " +
        "baseline set count only — the engine still computes every load/rep/per-week " +
        "set count and ramps the edited structure forward. For an active meso, only " +
        "days that are neither completed nor in progress this week can be edited; " +
        "completed/in-progress workouts and all logged sets are never touched " +
        "(hard rules #3/#5). " +
        "EFFORT ops (per exercise, per week): set_exercise_rir (slot_id + one of " +
        "rir for the whole meso, rir + weeks for those working weeks, schedule " +
        "with one value or null per working week, or clear: true) assigns a target " +
        "RIR to ONE exercise on ONE day, and the engine reprices the load to meet " +
        "it — higher RIR = lighter (back-off, rehab, fatigue management), lower = " +
        "harder. It is ABSOLUTE: where set it overrides the week's RIR (a flat " +
        "value overrides the deload week too), and removing it hands the week " +
        "straight back to the meso's ramp. No progression is earned while a slot " +
        "runs easier than its week. set_exercise_sets is the same shape for a " +
        "working-set CAP (sets/weeks/schedule/clear) — distinct from " +
        "set_baseline_sets, which seeds week 1 and then lets set progression run. " +
        "The cap is a ceiling: the engine clamps its own set count down to it and " +
        "never up, so use set_baseline_sets to start an exercise on MORE sets. " +
        "set_exercise_rep_position (slot_id + position: bottom | center | top | a " +
        "rep count, or clear: true) prices this slot at that point in the goal rep " +
        "window instead of following the climb schedule — a deeper cut at the same " +
        "RIR (top = lighter, bottom = heavier). It is flat for the slot: no weeks, " +
        "no schedule. " +
        "All three take an optional reason, surfaced wherever the assignment reads. A " +
        "week that has already been trained can't be reassigned by name.",
      inputSchema: {
        mesocycle_id: z.string().uuid(),
        operations: z.array(operationSchema).min(1).max(20),
      },
    },
    async (
      args: { mesocycle_id: string; operations: Operation[] },
      extra: McpExtra,
    ) => {
      const { client, userId } = resolveSession(extra);

      const { data: meso, error: mesoError } = await client
        .from("mesocycles")
        .select(
          "id, name, status, weeks, includes_deload, rir_start, rir_end, rir_schedule",
        )
        .eq("id", args.mesocycle_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (mesoError) throw mesoError;
      if (!meso) return jsonResult({ ok: false, error: "Mesocycle not found." });
      if (meso.status !== "planned" && meso.status !== "active")
        return jsonResult({
          ok: false,
          error: `cannot edit a ${meso.status} mesocycle — only a planned or active one. Logged history is immutable.`,
        });

      const plan = await getMesoPlan(client, args.mesocycle_id);
      if (!plan) return jsonResult({ ok: false, error: "Mesocycle not found." });
      // an empty/placeholder meso is only editable via add_day — that's exactly
      // how it's built out from zero days into a real plan (Tier-1 core gap).
      const hasAddDay = args.operations.some((o) => o.op === "add_day");
      if (plan.days.length === 0 && !hasAddDay)
        return jsonResult({
          ok: false,
          error:
            "this mesocycle has no days yet — use an add_day operation to build one.",
        });

      // resolve muscle-group names (add ops) up front so a typo fails cleanly
      const addNames = [
        ...args.operations
          .filter((o): o is z.infer<typeof addOp> => o.op === "add_exercise")
          .map((o) => o.muscle_group),
        ...args.operations
          .filter((o): o is z.infer<typeof addDayOp> => o.op === "add_day")
          .flatMap((o) => o.groups.map((g) => g.muscle_group)),
      ];
      const byName = new Map<string, string>();
      if (addNames.length > 0) {
        const res = resolveMuscleGroupIds(addNames, await listMuscleGroups());
        if (res.missing.length > 0)
          return jsonResult({
            ok: false,
            error: `unknown muscle group(s): ${res.missing.join(", ")}. Use exact library names.`,
          });
        for (const [k, v] of res.byName) byName.set(k, v);
      }

      // referenced exercises must exist and be visible (RLS-scoped)
      const refIds = [
        ...new Set(
          args.operations.flatMap((o) =>
            o.op === "add_exercise"
              ? [o.exercise_id]
              : o.op === "swap_exercise"
                ? [o.new_exercise_id]
                : o.op === "add_day"
                  ? o.groups.flatMap((g) => g.exercises.map((e) => e.exercise_id))
                  : [],
          ),
        ),
      ];
      const unknown = await findUnknownExerciseIds(client, refIds);
      if (unknown.length > 0)
        return jsonResult({
          ok: false,
          error: `unknown or not-visible exercise id(s): ${unknown.join(", ")}.`,
        });

      // slot_id → day_number, for the target-day guard and op resolution
      const slotDay = new Map<string, number>();
      const slotRefs = new Map<string, EffortSlotRef>();
      for (const d of plan.days)
        for (const g of d.groups)
          for (const f of g.fills) {
            slotDay.set(f.id, d.day_number);
            slotRefs.set(f.id, {
              slot_id: f.id,
              day_number: d.day_number,
              exercise_id: f.exercise_id,
              exercise_name: f.exercise_name,
            });
          }

      // doc 21 §8: effort ops write columns on an existing slot rather than
      // reshaping the board, so they take the week-precise guard below instead
      // of the structural day lock (assigning week 4 is legitimate on a day
      // whose week-1 session is already in the books).
      const structuralOps = args.operations.filter(
        (o): o is Exclude<Operation, EffortOperation> => !isEffortOp(o),
      );
      const effortOps = args.operations.filter(isEffortOp);

      // decision #1: a day whose current-week workout is completed/in-progress
      // is locked. Future weeks and untouched current-week days stay editable.
      if (meso.status === "active" && structuralOps.length > 0) {
        const statusByDay = await activeWeekStatusByDay(client, args.mesocycle_id);
        const targetDays = new Set<number>();
        for (const o of structuralOps) {
          if (o.op === "add_exercise" || o.op === "reorder_day" || o.op === "remove_day")
            targetDays.add(o.day_number);
          else if (o.op === "add_day") {
            if (o.day_number != null) targetDays.add(o.day_number);
          } else {
            const dn = slotDay.get(o.slot_id);
            if (dn != null) targetDays.add(dn);
          }
        }
        const locked = [...targetDays].filter((dn) => {
          const s = statusByDay.get(dn);
          return s === "in_progress" || s === "completed";
        });
        if (locked.length > 0)
          return jsonResult({
            ok: false,
            error: `day(s) ${locked
              .sort((a, b) => a - b)
              .join(", ")} are completed or in progress this week and can't be edited — logged history is immutable. Edit a later, untouched day instead.`,
          });
      }

      // doc 21 §8: plan every effort op BEFORE any write, so a refusal (an
      // unknown slot, an already-trained week, an out-of-range value) leaves the
      // plan exactly as it was even when the same call also carries structure.
      let effort: Extract<EffortPlanResult, { ok: true }> | null = null;
      if (effortOps.length > 0) {
        const { params } = await getActiveEngineParams(client);
        const ctx = await loadEffortContext(client, meso, params);
        const currentBySlot = new Map<string, SlotEffortAssignment>();
        for (const row of await getSlotEffortRows(client, args.mesocycle_id, true))
          currentBySlot.set(row.id, row.assignment);
        const planned = planEffortEdits(
          effortOps.map(toEffortOp),
          slotRefs,
          currentBySlot,
          ctx,
        );
        if (!planned.ok) return jsonResult({ ok: false, error: planned.error });
        effort = planned;
      }

      // resolve muscle_group → id and run the pure transform
      const resolved: ResolvedEdit[] = structuralOps.map((o) => {
        if (o.op === "add_exercise")
          return {
            op: "add_exercise" as const,
            day_number: o.day_number,
            muscle_group_id: byName.get(o.muscle_group)!,
            exercise_id: o.exercise_id,
            sets: o.sets,
          };
        if (o.op === "add_day")
          return {
            op: "add_day" as const,
            day_number: o.day_number ?? null,
            label: o.label ?? null,
            weekday: o.weekday ?? null,
            groups: o.groups.map((g) => ({
              muscle_group_id: byName.get(g.muscle_group)!,
              exercises: g.exercises,
            })),
          };
        return o;
      });
      let structuralSummaries: string[] = [];
      let touchedDays: number[] = [];
      if (structuralOps.length > 0) {
        const result = applyMesoEdits(toEditDays(plan), resolved);
        if (!result.ok) return jsonResult({ ok: false, error: result.error });
        if (result.touched.length === 0)
          return jsonResult({ ok: false, error: "no operations changed the plan." });
        // assignments survive the wholesale replace (saveMesoPlan re-keys them
        // by day-slot × exercise) — a reorder must not silently wipe them.
        await saveMesoPlan(client, userId, args.mesocycle_id, result.days);
        structuralSummaries = result.summaries;
        touchedDays = result.touched;
      }

      // effort writes go in after the structural save, because that save
      // re-mints every slot id — the day-slot × exercise key is what survives it
      // (and is the identity the resolution itself uses).
      const effortWarnings = [...(effort?.warnings ?? [])];
      if (effort) {
        let idByKey: Map<string, string> | null = null;
        if (structuralOps.length > 0) {
          idByKey = new Map(
            (await getSlotEffortRows(client, args.mesocycle_id, false)).map((r) => [
              r.key,
              r.id,
            ]),
          );
        }
        for (const w of effort.writes) {
          const targetId =
            idByKey?.get(slotEffortKey(w.day_number, w.exercise_id)) ??
            (idByKey ? null : w.slot_id);
          if (targetId == null) {
            effortWarnings.push(
              `day ${w.day_number}: the slot was removed by a structural operation in this same call — its effort assignment was not written.`,
            );
            continue;
          }
          await writeSlotEffort(client, targetId, w.patch);
          if (!touchedDays.includes(w.day_number)) touchedDays.push(w.day_number);
        }
        touchedDays.sort((a, b) => a - b);
      }

      // active meso: bring open (not-started) workouts in line; the engine ramps
      // the new structure forward and reprices any repointed effort assignment
      // (doc 21 §4.2 — one substitution on the existing pricing path).
      // Completed/in-progress workouts & logged sets are never touched
      // (regenerateOpenWorkouts skips them).
      let regenerated = false;
      if (meso.status === "active") {
        const profile = await getProfile(client, userId);
        if (profile) {
          await regenerateOpenWorkouts(client, userId, args.mesocycle_id, profile);
          regenerated = true;
        }
      }

      // return the fresh plan (new day_id/slot_id references) so a chain of edits
      // doesn't need a get_mesocycle round-trip between steps (needs-doc #8)
      const fresh = await getMesoPlan(client, args.mesocycle_id);
      const freshRoles = fresh
        ? await getMusclesForExercises(
            client,
            fresh.days.flatMap((d) => d.groups.flatMap((g) => g.fills.map((f) => f.exercise_id))),
          )
        : new Map();

      const changes = [...structuralSummaries, ...(effort?.summaries ?? [])];
      const summary = `edited mesocycle "${meso.name}" — ${changes.length} change(s) on day(s) ${
        touchedDays.join(", ") || "—"
      }`;
      await recordMcpWrite(userId, EDIT_MESOCYCLE, args, summary);
      return jsonResult({
        ok: true,
        mesocycle_id: args.mesocycle_id,
        touched_days: touchedDays,
        changes,
        regenerated_open_workouts: regenerated,
        ...(effort
          ? {
              effort_assignments: effort.disclosures,
              ...(effortWarnings.length > 0 ? { warnings: effortWarnings } : {}),
            }
          : {}),
        plan: formatMesoPlan(fresh, freshRoles),
        summary:
          meso.status === "active"
            ? `${summary}. Open (not-started) workouts were brought in line with the new structure; completed/in-progress days and all logged sets are untouched — the engine ramps the edited baseline forward.`
            : `${summary}. Review and start it in-app; the engine sets the numbers on activation.`,
      });
    },
  );
}
