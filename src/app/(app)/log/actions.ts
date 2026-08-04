"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  getAddExerciseCandidates,
  listPickerExercises,
  type AddExerciseCandidate,
} from "@/lib/queries/exercises";
import {
  addWorkoutExercises,
  adjustPrescribedSets,
  amendSet,
  clearPinnedNote,
  clearSkippedSets,
  completeWorkout,
  deleteLoggedSet,
  endMesocycle,
  endWorkout,
  getFutureSiblingWorkoutIds,
  getSetSlotTargetRir,
  getSlotTargetRir,
  logSet,
  propagateAddedExercises,
  propagateExerciseOrder,
  propagateSubstitution,
  setPlannedSetWeight,
  clearPlannedSetWeights,
  removeWorkoutExercise,
  replaceWorkoutExercise,
  saveExerciseFeedback,
  setExerciseJointPain,
  savePinnedNote,
  saveSessionNote,
  saveWorkoutFeedback,
  setSetSkipped,
  skipRemainingSets,
  skipWorkout,
  unlogSet,
} from "@/lib/queries/logging";
import {
  syncPlanAddedExercises,
  syncPlanOrderFromWorkout,
  syncPlanSubstitution,
} from "@/lib/queries/plan-order";
import { getExerciseHistory, type HistoryPage } from "@/lib/queries/history";
import {
  getPrescriptionAudit,
  type PrescriptionAudit,
} from "@/lib/queries/audit";
import { getProfile, updateProfile } from "@/lib/queries/profiles";
import { llmExplanationsServe } from "@/lib/llm/config";
import { appendBodyweightPoint } from "@/lib/queries/bodyweight";
import { localDayIso } from "@/lib/dates";
import {
  getActiveEngineParams,
  regenerateOpenWorkouts,
} from "@/lib/queries/generation";
import {
  EFFORT_REASON_MAX,
  SLOT_RIR_MAX,
  SLOT_RIR_MIN,
  getSlotEffortRows,
  loadEffortContext,
  overlaySlotRirSchedule,
  planEffortEdits,
  slotEffortKey,
  writeSlotEffort,
  type SlotEffortEdit,
} from "@/lib/queries/slot-effort";
import { assumedRir, stampE1rm } from "@/lib/engine";
import type { EngineParams } from "@/lib/engine/params";
import {
  advanceWeekAfterWorkout,
  type AdvanceResult,
} from "@/lib/queries/progression";
import { createServiceClient } from "@/lib/supabase/service";
import { reportError } from "@/lib/observability/report";
import { resolveJointPainAttribution } from "./feedback-attribution";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  return { supabase, user };
}

/**
 * The engine's per-set e1RM stamp (PH31): the estimate AND its confidence band,
 * stored with the set so both are auditable and surfaceable (history flip, MCP)
 * without recomputing. Both null for bodyweight (weight 0) / non-working input —
 * `estimateE1rm` returns null there.
 *
 * doc 21 §2 (N71): the RIR the stamp prices at is the SHARED resolution
 * `rir_reported ?? the slot's prescribed target_rir`, not the raw reported
 * value. Before this the stamp had no fallback while the anchor did, so a
 * never-written `rir_reported` made `effectiveReps = reps + 0` and every stats
 * surface read every set as taken to failure. `slotTargetRir` is the
 * prescription the set was logged against.
 *
 * doc 21 §6.1 (Phase 2b): past the measuring band the stamp is `null` with
 * confidence `none` — the set was priced and performed (and still counts as
 * volume), but the app does not claim to have measured strength from it. Every
 * strength surface aggregates this column, so the exclusion is by construction.
 */
function computeSetE1rm(
  params: EngineParams,
  weight: number,
  reps: number,
  rir: number | null,
  slotTargetRir: number | null,
): { e1rm: number | null; e1rm_confidence: string | null } {
  return stampE1rm(weight, reps, assumedRir(rir, slotTargetRir), params.e1rm);
}

const logSetSchema = z.object({
  workout_id: z.string().uuid(),
  workout_exercise_id: z.string().uuid(),
  set_number: z.coerce.number().int().min(1).max(30),
  weight: z.coerce.number().min(0).max(2000),
  reps: z.coerce.number().int().min(0).max(100),
  rir_reported: z.coerce.number().int().min(0).max(10).nullable(),
  set_type: z.enum(["straight", "drop"]),
  // R6: the client-local calendar day — the session's date as the lifter saw
  // it (an evening set must not land on tomorrow's UTC date)
  performed_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
});

export async function logSetAction(input: {
  workout_id: string;
  workout_exercise_id: string;
  set_number: number;
  weight: number;
  reps: number;
  rir_reported: number | null;
  set_type: "straight" | "drop";
  performed_on?: string | null;
}): Promise<void> {
  const parsed = logSetSchema.parse(input);
  const { supabase, user } = await requireUser();
  // doc 21 §2: the slot's prescribed target RIR is the stamp's fallback, so it
  // is fetched alongside the profile/params rather than serially — the write
  // path's latency is unchanged.
  const [profile, { params }, slotTargetRir] = await Promise.all([
    getProfile(supabase, user.id),
    getActiveEngineParams(supabase),
    getSlotTargetRir(supabase, parsed.workout_exercise_id),
  ]);
  await logSet(supabase, user.id, {
    workout_exercise_id: parsed.workout_exercise_id,
    set_number: parsed.set_number,
    weight: parsed.weight,
    reps: parsed.reps,
    rir_reported: parsed.rir_reported,
    set_type: parsed.set_type,
    ...computeSetE1rm(
      params,
      parsed.weight,
      parsed.reps,
      parsed.rir_reported,
      slotTargetRir,
    ),
    // T-I2/#4: capture the lifter's bodyweight at log time (effective-load base for
    // bodyweight movements); locked once the workout completes.
    bodyweight: profile?.bodyweight ?? null,
    performed_on: parsed.performed_on ?? null,
  });
  // auto-match (doc 11): carry the logged weight onto the remaining unlogged
  // sets. Done here (after the insert excludes this set) to avoid a client race.
  if (profile?.auto_match_weights) {
    await setPlannedSetWeight(
      supabase,
      parsed.workout_exercise_id,
      parsed.set_number,
      parsed.weight,
      true,
    );
  }
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

const amendSchema = z.object({
  workout_id: z.string().uuid(),
  set_id: z.string().uuid(),
  weight: z.coerce.number().min(0).max(2000),
  reps: z.coerce.number().int().min(0).max(100),
  rir_reported: z.coerce.number().int().min(0).max(10).nullable(),
});

export async function amendSetAction(input: {
  workout_id: string;
  set_id: string;
  weight: number;
  reps: number;
  rir_reported: number | null;
}): Promise<void> {
  const parsed = amendSchema.parse(input);
  const { supabase, user } = await requireUser();
  const [{ params }, slotTargetRir] = await Promise.all([
    getActiveEngineParams(supabase),
    getSetSlotTargetRir(supabase, user.id, parsed.set_id),
  ]);
  await amendSet(supabase, user.id, parsed.set_id, {
    weight: parsed.weight,
    reps: parsed.reps,
    rir_reported: parsed.rir_reported,
    // recompute the stored e1RM + confidence since weight/reps/RIR all changed
    ...computeSetE1rm(
      params,
      parsed.weight,
      parsed.reps,
      parsed.rir_reported,
      slotTargetRir,
    ),
  });
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

const bodyweightSchema = z.object({
  workout_id: z.string().uuid(),
  bodyweight: z.coerce.number().positive().max(1500),
});

/**
 * T-I2: update the lifter's profile bodyweight from the day-view BW chip. The
 * day-view value and the profile value are one and the same (owner ruling), so an
 * inline edit here writes straight through to `profiles.bodyweight`. Going-forward
 * logged sets capture this bodyweight; it is the effective-load base for bodyweight
 * movements' live prediction.
 */
export async function updateBodyweightAction(input: {
  workout_id: string;
  bodyweight: number;
}): Promise<void> {
  const parsed = bodyweightSchema.parse(input);
  const { supabase, user } = await requireUser();
  await updateProfile(supabase, user.id, {
    bodyweight: parsed.bodyweight,
    bodyweight_updated_at: new Date().toISOString(),
  });
  // doc 17 §5: the chip edit IS a profile bodyweight edit (T-I2 — one value),
  // so it appends today's measured point like the profile editor does
  await appendBodyweightPoint(supabase, user.id, {
    measuredOn: localDayIso(),
    weight: parsed.bodyweight,
    source: "profile",
  });
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

const weTargetSchema = z.object({
  workout_id: z.string().uuid(),
  workout_exercise_id: z.string().uuid(),
});

const setWeightSchema = z.object({
  workout_id: z.string().uuid(),
  workout_exercise_id: z.string().uuid(),
  set_number: z.coerce.number().int().min(1).max(30),
  weight: z.coerce.number().min(0).max(2000),
});

/**
 * Persist an edited planned weight for an upcoming (unlogged) set (doc 11). The
 * weight always sticks; the user's `auto_match_weights` setting decides whether
 * it lands on just this set or every still-unlogged set of the exercise.
 */
export async function updateSetWeightAction(input: {
  workout_id: string;
  workout_exercise_id: string;
  set_number: number;
  weight: number;
}): Promise<void> {
  const parsed = setWeightSchema.parse(input);
  const { supabase, user } = await requireUser();
  const profile = await getProfile(supabase, user.id);
  await setPlannedSetWeight(
    supabase,
    parsed.workout_exercise_id,
    parsed.set_number,
    parsed.weight,
    profile?.auto_match_weights ?? false,
  );
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

/**
 * Reset an exercise's unlogged sets back to the engine prescription (doc 13
 * §4.4): drop the per-set planned-weight overrides so the prescribed weight (and
 * its predicted reps) shows again. Logged history is untouched.
 */
export async function resetToPrescriptionAction(input: {
  workout_id: string;
  workout_exercise_id: string;
}): Promise<void> {
  const parsed = weTargetSchema.parse(input);
  const { supabase } = await requireUser();
  await clearPlannedSetWeights(supabase, parsed.workout_exercise_id);
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

export async function addSetAction(input: {
  workout_id: string;
  workout_exercise_id: string;
}): Promise<void> {
  const parsed = weTargetSchema.parse(input);
  const { supabase } = await requireUser();
  await adjustPrescribedSets(supabase, parsed.workout_exercise_id, 1);
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

/** "Delete set" on an unlogged slot (fig 1.3) — drops one planned slot. */
export async function removeSetAction(input: {
  workout_id: string;
  workout_exercise_id: string;
}): Promise<void> {
  const parsed = weTargetSchema.parse(input);
  const { supabase } = await requireUser();
  await adjustPrescribedSets(supabase, parsed.workout_exercise_id, -1);
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

const toggleSkipSchema = z.object({
  workout_id: z.string().uuid(),
  workout_exercise_id: z.string().uuid(),
  set_number: z.coerce.number().int().min(1).max(30),
  skipped: z.boolean(),
});

/** Skip / unskip a single set (fig 1.3) — greyed but kept; reversible. */
export async function toggleSkipSetAction(input: {
  workout_id: string;
  workout_exercise_id: string;
  set_number: number;
  skipped: boolean;
}): Promise<void> {
  const parsed = toggleSkipSchema.parse(input);
  const { supabase } = await requireUser();
  await setSetSkipped(
    supabase,
    parsed.workout_exercise_id,
    parsed.set_number,
    parsed.skipped,
  );
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

const unlogSchema = z.object({
  workout_id: z.string().uuid(),
  set_id: z.string().uuid(),
});

/** Uncheck a logged set (fig 1.1) — re-opens the slot; keeps the prescription. */
export async function unlogSetAction(input: {
  workout_id: string;
  set_id: string;
}): Promise<void> {
  const parsed = unlogSchema.parse(input);
  const { supabase, user } = await requireUser();
  await unlogSet(supabase, user.id, parsed.set_id);
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

const deleteSetSchema = z.object({
  workout_id: z.string().uuid(),
  set_id: z.string().uuid(),
});

/** Delete a logged set (fig 1.3) — allowed only while in_progress (RLS). */
export async function deleteSetAction(input: {
  workout_id: string;
  set_id: string;
}): Promise<void> {
  const parsed = deleteSetSchema.parse(input);
  const { supabase, user } = await requireUser();
  await deleteLoggedSet(supabase, user.id, parsed.set_id);
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

/** Skip all uncompleted sets of an exercise (fig 1.2) — per-set, reversible. */
export async function skipRemainingAction(input: {
  workout_id: string;
  workout_exercise_id: string;
}): Promise<void> {
  const parsed = weTargetSchema.parse(input);
  const { supabase } = await requireUser();
  await skipRemainingSets(supabase, parsed.workout_exercise_id);
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

/** Unskip every skipped set of an exercise at once (fig 1.2). */
export async function unskipAllAction(input: {
  workout_id: string;
  workout_exercise_id: string;
}): Promise<void> {
  const parsed = weTargetSchema.parse(input);
  const { supabase } = await requireUser();
  await clearSkippedSets(supabase, parsed.workout_exercise_id);
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

export async function removeExerciseAction(input: {
  workout_id: string;
  workout_exercise_id: string;
}): Promise<{ error: string | null }> {
  const parsed = weTargetSchema.parse(input);
  const { supabase } = await requireUser();
  const result = await removeWorkoutExercise(
    supabase,
    parsed.workout_exercise_id,
  );
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
  return result;
}

const noteSchema = z.object({
  workout_id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  body: z.string().min(1).max(500),
});

export async function savePinnedNoteAction(input: {
  workout_id: string;
  exercise_id: string;
  body: string;
}): Promise<void> {
  const parsed = noteSchema.parse(input);
  const { supabase, user } = await requireUser();
  await savePinnedNote(supabase, user.id, parsed.exercise_id, parsed.body);
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

const clearPinnedSchema = z.object({
  workout_id: z.string().uuid(),
  exercise_id: z.string().uuid(),
});

/** Unpin the exercise's pinned note (used when a note is unpinned/cleared or
 * moved to session-only from the unified note sheet). */
export async function clearPinnedNoteAction(input: {
  workout_id: string;
  exercise_id: string;
}): Promise<void> {
  const parsed = clearPinnedSchema.parse(input);
  const { supabase, user } = await requireUser();
  await clearPinnedNote(supabase, user.id, parsed.exercise_id);
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

const sessionNoteSchema = z.object({
  workout_id: z.string().uuid(),
  workout_exercise_id: z.string().uuid(),
  note: z.string().max(500).nullable(),
});

/** Session log note (09 §8) — saved with the workout's exercise log; the
 * completion lock keeps it editable only while the workout is in_progress. */
export async function saveSessionNoteAction(input: {
  workout_id: string;
  workout_exercise_id: string;
  note: string | null;
}): Promise<void> {
  const parsed = sessionNoteSchema.parse(input);
  const { supabase, user } = await requireUser();
  await saveSessionNote(
    supabase,
    user.id,
    parsed.workout_exercise_id,
    parsed.note,
  );
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

const feedbackSchema = z.object({
  workout_id: z.string().uuid(),
  workout_exercise_id: z.string().uuid(),
  joint_pain: z.coerce.number().int().min(0).max(3).nullable(),
  muscle_group_id: z.string().uuid().nullable(),
  pump: z.coerce.number().int().min(0).max(10).nullable(),
  workload: z.coerce.number().int().min(0).max(10).nullable(),
  soreness: z.coerce.number().int().min(0).max(10).nullable(),
  soreness_days: z.coerce.number().int().min(0).max(5).nullable(),
  // fig 1.4 revision — joint-pain attribution. Joint pain is collected once the
  // muscle group closes; the lifter may pin it to the exercise(s) that actually
  // hurt. `pain_exercise_ids` are the selected performed exercises;
  // `group_exercise_ids` are every performed exercise in the group (so the
  // deselected ones can be cleared). Both null when the group section wasn't
  // shown (soreness-only prompt). An empty selection with pain reported defaults
  // to attributing the pain to every performed exercise in the group.
  pain_exercise_ids: z.array(z.string().uuid()).max(30).nullable(),
  group_exercise_ids: z.array(z.string().uuid()).max(30).nullable(),
});

export async function saveFeedbackAction(input: {
  workout_id: string;
  workout_exercise_id: string;
  joint_pain: number | null;
  muscle_group_id: string | null;
  pump: number | null;
  workload: number | null;
  soreness: number | null;
  soreness_days: number | null;
  pain_exercise_ids: string[] | null;
  group_exercise_ids: string[] | null;
}): Promise<void> {
  const parsed = feedbackSchema.parse(input);
  const { supabase, user } = await requireUser();

  // Resolve the per-exercise write plan: the group-closing row carries the
  // group-scoped pump / workload / soreness, while joint pain follows the
  // lifter's attribution across the group's performed exercises (fig 1.4).
  const { closerPain, others } = resolveJointPainAttribution({
    closerId: parsed.workout_exercise_id,
    jointPain: parsed.joint_pain,
    painExerciseIds: parsed.pain_exercise_ids,
    groupExerciseIds: parsed.group_exercise_ids,
  });

  await saveExerciseFeedback(supabase, user.id, {
    workout_exercise_id: parsed.workout_exercise_id,
    joint_pain: closerPain,
    muscle_group_id: parsed.muscle_group_id,
    pump: parsed.pump,
    workload: parsed.workload,
    soreness: parsed.soreness,
    soreness_days: parsed.soreness_days,
  });

  // Attribute (or clear) joint pain on the remaining performed exercises of the
  // group, leaving their pump / workload / soreness / notes untouched.
  for (const other of others) {
    await setExerciseJointPain(supabase, user.id, {
      workout_exercise_id: other.id,
      joint_pain: other.jointPain,
      muscle_group_id: parsed.muscle_group_id,
    });
  }

  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

/** Exercise history (fig 3.2): sessions grouped by meso, newest first.
 * Paged (N30): pass the previous page's `nextCursor` as `before` to walk
 * older sessions until the cursor comes back null. Scoped (N15): `mesoIds`
 * restricts the window to those mesocycles (the Performance drill-down). */
export async function getExerciseHistoryAction(
  exerciseId: string,
  before?: string,
  mesoIds?: string[],
): Promise<HistoryPage> {
  const parsed = z.string().uuid().parse(exerciseId);
  const parsedBefore = z
    .string()
    .datetime({ offset: true })
    .optional()
    .parse(before);
  const parsedMesoIds = z
    .array(z.string().uuid())
    .max(100)
    .optional()
    .parse(mesoIds);
  const { supabase, user } = await requireUser();
  return getExerciseHistory(
    supabase,
    user.id,
    parsed,
    parsedBefore ?? null,
    parsedMesoIds ?? null,
  );
}

/** Latest engine decision behind a prescription (day-view audit reveal). The
 *  stored LLM explanation rides along only when the feature is serving
 *  (N58 / doc 18 §6) — in shadow mode the quick-read stays deterministic. */
export async function getPrescriptionAuditAction(
  workoutExerciseId: string,
): Promise<PrescriptionAudit | null> {
  const parsed = z.string().uuid().parse(workoutExerciseId);
  const { supabase, user } = await requireUser();
  return getPrescriptionAudit(supabase, user.id, parsed, llmExplanationsServe());
}

const replaceSchema = z.object({
  workout_id: z.string().uuid(),
  workout_exercise_id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  // #4: also substitute on the same day in future incomplete weeks
  propagate: z.boolean().optional(),
});

export async function replaceExerciseAction(input: {
  workout_id: string;
  workout_exercise_id: string;
  exercise_id: string;
  propagate?: boolean;
}): Promise<{ error: string | null }> {
  const parsed = replaceSchema.parse(input);
  const { supabase, user } = await requireUser();

  // capture the outgoing movement before the swap so we can find it in the
  // future workouts (which still hold the old exercise).
  const { data: current } = await supabase
    .from("workout_exercises")
    .select("exercise_id")
    .eq("id", parsed.workout_exercise_id)
    .maybeSingle();

  const result = await replaceWorkoutExercise(
    supabase,
    user.id,
    parsed.workout_exercise_id,
    parsed.exercise_id,
  );

  if (!result.error && parsed.propagate && current?.exercise_id) {
    const siblings = await getFutureSiblingWorkoutIds(
      supabase,
      user.id,
      parsed.workout_id,
    );
    await propagateSubstitution(
      supabase,
      user.id,
      siblings,
      current.exercise_id,
      parsed.exercise_id,
    );
    // N64: "repeat this change on this day in future weeks" is a plan-level
    // edit — write it to the planner board too, so the cycles view and any
    // share/copy of the meso carry the substitution.
    await syncPlanSubstitution(
      supabase,
      parsed.workout_id,
      current.exercise_id,
      parsed.exercise_id,
    );
  }

  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
  return result;
}

/** Candidates + muscle-group list for the workout "Add exercise" picker. */
export async function listAddExerciseCandidatesAction(): Promise<{
  exercises: AddExerciseCandidate[];
  muscleGroups: { id: string; name: string }[];
}> {
  const { supabase, user } = await requireUser();
  return getAddExerciseCandidates(supabase, user.id);
}

const addExercisesSchema = z.object({
  workout_id: z.string().uuid(),
  exercise_ids: z.array(z.string().uuid()).min(1).max(20),
  // #4: also add to the same day in future incomplete weeks
  propagate: z.boolean().optional(),
});

/** Add picked exercises to the bottom of a live workout (workout-page editing). */
export async function addWorkoutExercisesAction(input: {
  workout_id: string;
  exercise_ids: string[];
  propagate?: boolean;
}): Promise<void> {
  const parsed = addExercisesSchema.parse(input);
  const { supabase, user } = await requireUser();
  await addWorkoutExercises(
    supabase,
    user.id,
    parsed.workout_id,
    parsed.exercise_ids,
  );
  if (parsed.propagate) {
    const siblings = await getFutureSiblingWorkoutIds(
      supabase,
      user.id,
      parsed.workout_id,
    );
    await propagateAddedExercises(
      supabase,
      user.id,
      siblings,
      parsed.exercise_ids,
    );
    // N64: same intent as the substitution — the addition belongs to the meso,
    // not just this session, so it joins the planner board (and then takes its
    // session position in the plan's flat day order).
    await syncPlanAddedExercises(
      supabase,
      parsed.workout_id,
      parsed.exercise_ids,
    );
    await syncPlanOrderFromWorkout(supabase, parsed.workout_id);
  }
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

export interface ReplacementCandidate {
  id: string;
  name: string;
  equipment_type: string;
  last_performed_at: string | null;
}

/** Candidates for replace-exercise: the slot's muscle group, exclusions out. */
export async function listReplacementCandidatesAction(
  muscleGroupId: string,
): Promise<ReplacementCandidate[]> {
  const parsed = z.string().uuid().parse(muscleGroupId);
  const { supabase, user } = await requireUser();
  const exercises = await listPickerExercises(supabase, user.id, {
    muscleGroupId: parsed,
  });
  return exercises.map((e) => ({
    id: e.id,
    name: e.name,
    equipment_type: e.equipment_type,
    last_performed_at: e.last_performed_at,
  }));
}

/** Swap an exercise with its neighbour (delta -1 = up, +1 = down). The new
 *  order is persisted and carried forward to the same training day in future
 *  incomplete weeks of the mesocycle (#4 — reorders propagate automatically). */
async function moveExercise(
  workoutId: string,
  workoutExerciseId: string,
  delta: -1 | 1,
): Promise<void> {
  const { supabase, user } = await requireUser();
  const { data: wes, error } = await supabase
    .from("workout_exercises")
    .select("id, position")
    .eq("workout_id", workoutId)
    .order("position");
  if (error) throw error;
  const list = wes ?? [];
  const idx = list.findIndex((w) => w.id === workoutExerciseId);
  const target = idx + delta;
  if (idx < 0 || target < 0 || target >= list.length) return;
  const a = list[idx];
  const b = list[target];
  const { error: e1 } = await supabase
    .from("workout_exercises")
    .update({ position: b.position })
    .eq("id", a.id);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from("workout_exercises")
    .update({ position: a.position })
    .eq("id", b.id);
  if (e2) throw e2;

  // carry the new order forward to later weeks' same day (incomplete only)
  const siblings = await getFutureSiblingWorkoutIds(supabase, user.id, workoutId);
  await propagateExerciseOrder(supabase, workoutId, siblings);
  // N64: and into the planner board, so the cycles view (and every copy/share
  // of this meso) shows the order the lifter actually trains in. A reorder
  // always carries forward, so it is always a plan-level change.
  await syncPlanOrderFromWorkout(supabase, workoutId);

  revalidatePath(`/log/${workoutId}`);
  revalidatePath("/workout");
}

export async function moveExerciseDownAction(input: {
  workout_id: string;
  workout_exercise_id: string;
}): Promise<void> {
  const parsed = weTargetSchema.parse(input);
  await moveExercise(parsed.workout_id, parsed.workout_exercise_id, 1);
}

export async function moveExerciseUpAction(input: {
  workout_id: string;
  workout_exercise_id: string;
}): Promise<void> {
  const parsed = weTargetSchema.parse(input);
  await moveExercise(parsed.workout_id, parsed.workout_exercise_id, -1);
}

const completeSchema = z.object({
  workout_id: z.string().uuid(),
  notes: z.string().max(2000).nullable(),
  // I14: session sliders share the per-exercise 0–10 scale
  overall_fatigue: z.coerce.number().int().min(0).max(10).nullable(),
  effort_rating: z.coerce.number().int().min(0).max(10).nullable(),
  performance_rating: z.coerce.number().int().min(0).max(10).nullable(),
});

export async function completeWorkoutAction(input: {
  workout_id: string;
  notes: string | null;
  overall_fatigue: number | null;
  effort_rating: number | null;
  performance_rating: number | null;
}): Promise<AdvanceResult> {
  const parsed = completeSchema.parse(input);
  const { supabase, user } = await requireUser();

  // session feedback must land before completion flips the status — the
  // next-week job reads it as a dampener (10 §3), and RLS will lock writes
  // once the workout is no longer in_progress.
  await saveWorkoutFeedback(supabase, user.id, {
    workout_id: parsed.workout_id,
    overall_fatigue: parsed.overall_fatigue,
    effort_rating: parsed.effort_rating,
    performance_rating: parsed.performance_rating,
  });

  await completeWorkout(
    supabase,
    user.id,
    parsed.workout_id,
    parsed.notes?.trim() || null,
  );

  // week N → N+1 generation (Phase 4): engine_decisions are service-role
  // writes, scoped to the session user. A failure here must not lose the
  // completion — the workout tab re-runs the job on next open.
  let result: AdvanceResult;
  try {
    result = await advanceWeekAfterWorkout(
      createServiceClient(),
      user.id,
      parsed.workout_id,
    );
  } catch (error) {
    // degrade to the friendly fallback, but report (R20) — a persistent
    // failure here means next week never generates until a page-open catch-up
    await reportError("actions:advance-week:complete", error, {
      workoutId: parsed.workout_id,
    });
    result = {
      summary:
        "Feedback recorded. Next week's targets recalculate when you next open the app.",
      nextWorkoutId: null,
      nextLabel: null,
    };
  }
  revalidatePath("/workout");
  revalidatePath(`/log/${parsed.workout_id}`);
  return result;
}

// ---------------------------------------------------------------------------
// end early (fig 1.1 options menu, 09 session-5 §9)
// ---------------------------------------------------------------------------

const endWorkoutSchema = z.object({ workout_id: z.string().uuid() });

/** End workout = skip every remaining set + complete + advance the week. */
export async function endWorkoutAction(input: {
  workout_id: string;
}): Promise<AdvanceResult> {
  const parsed = endWorkoutSchema.parse(input);
  const { supabase, user } = await requireUser();
  await endWorkout(supabase, user.id, parsed.workout_id);

  // same week N → N+1 generation as a normal completion; a failure must not
  // lose the early-end (the workout tab re-runs the job on next open).
  let result: AdvanceResult;
  try {
    result = await advanceWeekAfterWorkout(
      createServiceClient(),
      user.id,
      parsed.workout_id,
    );
  } catch (error) {
    // same degrade-loudly contract as the completion path (R20)
    await reportError("actions:advance-week:end", error, {
      workoutId: parsed.workout_id,
    });
    result = {
      summary:
        "Workout ended. Next week's targets recalculate when you next open the app.",
      nextWorkoutId: null,
      nextLabel: null,
    };
  }
  revalidatePath("/workout");
  revalidatePath(`/log/${parsed.workout_id}`);
  return result;
}

const skipWorkoutSchema = z.object({ workout_id: z.string().uuid() });

export interface SkipDayResult {
  ok: boolean;
  error: string | null;
  nextWorkoutId: string | null;
}

/**
 * Skip day = close an untrained day as `skipped`, then advance the week (N74).
 *
 * The counterpart to "End workout", for the case that had no terminal state:
 * a day the user decided not to train at all. Without it a single dropped
 * session left the week un-closable and the next week un-generatable — the
 * out-of-order/partial-week dead end. Refuses when the day has logged sets
 * (that day should be *completed*, hard rule #5); the refusal is surfaced
 * rather than thrown so the sheet can explain it.
 */
export async function skipWorkoutAction(input: {
  workout_id: string;
}): Promise<SkipDayResult> {
  const parsed = skipWorkoutSchema.parse(input);
  const { supabase, user } = await requireUser();

  const { skipped, error } = await skipWorkout(
    supabase,
    user.id,
    parsed.workout_id,
  );
  if (error) return { ok: false, error, nextWorkoutId: null };

  // the advance is what lets the now-closed week roll into the next one. Same
  // degrade-loudly contract as the completion path (R20): a failure must not
  // lose the skip, and the Workout tab's catch-up (or its retry) picks it up.
  let nextWorkoutId: string | null = null;
  try {
    const result = await advanceWeekAfterWorkout(
      createServiceClient(),
      user.id,
      parsed.workout_id,
    );
    nextWorkoutId = result.nextWorkoutId;
  } catch (advanceError) {
    await reportError("actions:advance-week:skip", advanceError, {
      workoutId: parsed.workout_id,
    });
  }

  revalidatePath("/workout");
  revalidatePath(`/log/${parsed.workout_id}`);
  return { ok: skipped, error: null, nextWorkoutId };
}

const endMesoSchema = z.object({
  workout_id: z.string().uuid(),
  meso_id: z.string().uuid(),
});

/** End mesocycle = skip/close every remaining workout, then complete the meso. */
export async function endMesocycleAction(input: {
  workout_id: string;
  meso_id: string;
}): Promise<void> {
  const parsed = endMesoSchema.parse(input);
  const { supabase, user } = await requireUser();
  await endMesocycle(supabase, user.id, parsed.meso_id);
  revalidatePath("/workout");
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath(`/cycles/meso/${parsed.meso_id}`);
  revalidatePath("/cycles");
}

// ---------------------------------------------------------------------------
// doc 21 §8 (Phase 6) — the effort-target assignment, from the app
// ---------------------------------------------------------------------------

const slotEffortSchema = z.object({
  workout_id: z.string().uuid(),
  mesocycle_id: z.string().uuid(),
  day_number: z.number().int().min(1),
  exercise_id: z.string().uuid(),
  week_number: z.number().int().min(1),
  scope: z.enum(["this_week", "rest_of_block", "whole_block"]),
  /** the absolute RIR to assign; null with `clear` */
  target_rir: z.number().int().min(SLOT_RIR_MIN).max(SLOT_RIR_MAX).nullable(),
  clear: z.boolean().default(false),
  reason: z.string().max(EFFORT_REASON_MAX).nullable().default(null),
});

export interface SlotEffortActionResult {
  ok: boolean;
  /** what was written, in the same words the MCP tool reports */
  summary?: string;
  /** §4.1 "no silent semantics" — harder-than-programmed, deload coverage, … */
  warnings?: string[];
  error?: string;
}

/**
 * Assign (or clear) this slot's target RIR for a scope of weeks.
 *
 * The app is the SECOND write surface for the lever — MCP was the first (Phase
 * 3) — and there is exactly one authoring policy: this action loads the same
 * context and runs the same pure planner (`loadEffortContext` +
 * `planEffortEdits`, both in `queries/slot-effort.ts`), so every refusal and
 * every §4.1 warning is identical whichever surface wrote. What differs is only
 * the input shape: the sheet offers three scopes instead of week arrays (§8 —
 * the UI stays deliberately minimal), and a scoped write OVERLAYS the slot's
 * existing per-week map rather than replacing it, so nudging one week can never
 * silently drop an assignment sitting on another.
 *
 * The set cap and the rep position are deliberately NOT writable here (A4):
 * they read in the sheet and are authored over the connector.
 */
export async function setSlotEffortAction(input: {
  workout_id: string;
  mesocycle_id: string;
  day_number: number;
  exercise_id: string;
  week_number: number;
  scope: "this_week" | "rest_of_block" | "whole_block";
  target_rir: number | null;
  clear?: boolean;
  reason?: string | null;
}): Promise<SlotEffortActionResult> {
  const parsed = slotEffortSchema.parse(input);
  const { supabase, user } = await requireUser();

  const { data: meso, error: mesoError } = await supabase
    .from("mesocycles")
    .select(
      "id, status, weeks, includes_deload, rir_start, rir_end, rir_schedule",
    )
    .eq("id", parsed.mesocycle_id)
    .maybeSingle();
  if (mesoError) throw mesoError;
  // RLS scopes the read, so a miss is "not yours or not there" either way
  if (!meso) return { ok: false, error: "That mesocycle isn't available." };
  if (meso.status !== "planned" && meso.status !== "active")
    return {
      ok: false,
      error: "This mesocycle is finished — its sessions are a record now.",
    };

  const rows = await getSlotEffortRows(supabase, parsed.mesocycle_id, false);
  const key = slotEffortKey(parsed.day_number, parsed.exercise_id);
  const row = rows.find((r) => r.key === key);
  if (!row)
    return {
      ok: false,
      error:
        "This exercise isn't on the plan for this day, so there's nothing to assign to. Replacing an exercise for one session doesn't move the plan.",
    };

  const workingWeeks = meso.includes_deload ? meso.weeks - 1 : meso.weeks;
  const clearing = parsed.clear || parsed.target_rir == null;
  let edit: SlotEffortEdit;
  if (clearing && parsed.scope === "whole_block") {
    edit = { lever: "rir", clear: true, reason: parsed.reason };
  } else if (parsed.scope === "whole_block") {
    edit = { lever: "rir", value: parsed.target_rir, reason: parsed.reason };
  } else {
    const schedule = overlaySlotRirSchedule(
      row.assignment,
      parsed.week_number,
      clearing ? null : parsed.target_rir,
      parsed.scope,
      workingWeeks,
    );
    // an overlay that empties the last assigned week IS a clear — say so to the
    // planner rather than handing it an all-null schedule it would refuse
    edit = schedule.every((v) => v == null)
      ? { lever: "rir", clear: true, reason: parsed.reason }
      : { lever: "rir", schedule, reason: parsed.reason };
  }

  const { params } = await getActiveEngineParams(supabase);
  const ctx = await loadEffortContext(supabase, meso, params);
  const planned = planEffortEdits(
    [{ op: "set_exercise_rir", slot_id: row.id, edit }],
    new Map([
      [
        row.id,
        {
          slot_id: row.id,
          day_number: row.dayNumber,
          exercise_id: row.exerciseId,
        },
      ],
    ]),
    new Map(rows.map((r) => [r.id, r.assignment])),
    ctx,
  );
  if (!planned.ok) return { ok: false, error: planned.error };

  for (const w of planned.writes) await writeSlotEffort(supabase, w.slot_id, w.patch);

  // an active meso reprices its OPEN workouts through the engine immediately —
  // the whole point of the lever is that this week's prescription changes. The
  // freshness fingerprint would catch it on the next read anyway (doc 21 §7),
  // but the athlete is looking at the day view right now.
  if (meso.status === "active") {
    const profile = await getProfile(supabase, user.id);
    if (profile)
      await regenerateOpenWorkouts(
        supabase,
        user.id,
        parsed.mesocycle_id,
        profile,
      );
  }

  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
  revalidatePath(`/cycles/meso/${parsed.mesocycle_id}`);
  return {
    ok: true,
    summary: planned.summaries[0] ?? "",
    warnings: planned.warnings,
  };
}
