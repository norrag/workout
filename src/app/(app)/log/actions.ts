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
  logSet,
  propagateAddedExercises,
  propagateExerciseOrder,
  propagateSubstitution,
  setPlannedSetWeight,
  clearPlannedSetWeights,
  removeWorkoutExercise,
  replaceWorkoutExercise,
  saveExerciseFeedback,
  savePinnedNote,
  saveSessionNote,
  saveWorkoutFeedback,
  setSetSkipped,
  skipRemainingSets,
  unlogSet,
} from "@/lib/queries/logging";
import { getExerciseHistory, type HistoryEntry } from "@/lib/queries/history";
import {
  getPrescriptionAudit,
  type PrescriptionAudit,
} from "@/lib/queries/audit";
import { getProfile, updateProfile } from "@/lib/queries/profiles";
import { getActiveEngineParams } from "@/lib/queries/generation";
import { estimateE1rm } from "@/lib/engine";
import type { EngineParams } from "@/lib/engine/params";
import {
  advanceWeekAfterWorkout,
  type AdvanceResult,
} from "@/lib/queries/progression";
import { createServiceClient } from "@/lib/supabase/service";
import { reportError } from "@/lib/observability/report";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  return { supabase, user };
}

/**
 * The engine's per-set e1RM (PH31), stored with the set so it's auditable and
 * can be surfaced (history flip, MCP) without recomputing. Null for bodyweight
 * (weight 0) / non-working input — `estimateE1rm` returns null there.
 */
function computeSetE1rm(
  params: EngineParams,
  weight: number,
  reps: number,
  rir: number | null,
): number | null {
  return estimateE1rm(weight, reps, rir, params)?.value ?? null;
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
  const [profile, { params }] = await Promise.all([
    getProfile(supabase, user.id),
    getActiveEngineParams(supabase),
  ]);
  await logSet(supabase, user.id, {
    workout_exercise_id: parsed.workout_exercise_id,
    set_number: parsed.set_number,
    weight: parsed.weight,
    reps: parsed.reps,
    rir_reported: parsed.rir_reported,
    set_type: parsed.set_type,
    e1rm: computeSetE1rm(params, parsed.weight, parsed.reps, parsed.rir_reported),
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
  const { params } = await getActiveEngineParams(supabase);
  await amendSet(supabase, user.id, parsed.set_id, {
    weight: parsed.weight,
    reps: parsed.reps,
    rir_reported: parsed.rir_reported,
    // recompute the stored e1RM since weight/reps/RIR all changed
    e1rm: computeSetE1rm(params, parsed.weight, parsed.reps, parsed.rir_reported),
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
}): Promise<void> {
  const parsed = feedbackSchema.parse(input);
  const { supabase, user } = await requireUser();
  await saveExerciseFeedback(supabase, user.id, {
    workout_exercise_id: parsed.workout_exercise_id,
    joint_pain: parsed.joint_pain,
    muscle_group_id: parsed.muscle_group_id,
    pump: parsed.pump,
    workload: parsed.workload,
    soreness: parsed.soreness,
    soreness_days: parsed.soreness_days,
  });
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

/** Exercise history (fig 3.2): sessions grouped by meso, newest first. */
export async function getExerciseHistoryAction(
  exerciseId: string,
): Promise<HistoryEntry[]> {
  const parsed = z.string().uuid().parse(exerciseId);
  const { supabase, user } = await requireUser();
  return getExerciseHistory(supabase, user.id, parsed);
}

/** Latest engine decision behind a prescription (day-view audit reveal). */
export async function getPrescriptionAuditAction(
  workoutExerciseId: string,
): Promise<PrescriptionAudit | null> {
  const parsed = z.string().uuid().parse(workoutExerciseId);
  const { supabase, user } = await requireUser();
  return getPrescriptionAudit(supabase, user.id, parsed);
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
