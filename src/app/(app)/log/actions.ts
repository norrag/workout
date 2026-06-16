"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { listPickerExercises } from "@/lib/queries/exercises";
import {
  adjustPrescribedSets,
  amendSet,
  clearPinnedNote,
  clearSkippedSets,
  completeWorkout,
  deleteLoggedSet,
  endMesocycle,
  endWorkout,
  logSet,
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
import { getProfile } from "@/lib/queries/profiles";
import {
  advanceWeekAfterWorkout,
  type AdvanceResult,
} from "@/lib/queries/progression";
import { createServiceClient } from "@/lib/supabase/service";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  return { supabase, user };
}

const logSetSchema = z.object({
  workout_id: z.string().uuid(),
  workout_exercise_id: z.string().uuid(),
  set_number: z.coerce.number().int().min(1).max(30),
  weight: z.coerce.number().min(0).max(2000),
  reps: z.coerce.number().int().min(0).max(100),
  rir_reported: z.coerce.number().int().min(0).max(10).nullable(),
  set_type: z.enum(["straight", "drop"]),
});

export async function logSetAction(input: {
  workout_id: string;
  workout_exercise_id: string;
  set_number: number;
  weight: number;
  reps: number;
  rir_reported: number | null;
  set_type: "straight" | "drop";
}): Promise<void> {
  const parsed = logSetSchema.parse(input);
  const { supabase, user } = await requireUser();
  const profile = await getProfile(supabase, user.id);
  await logSet(supabase, user.id, {
    workout_exercise_id: parsed.workout_exercise_id,
    set_number: parsed.set_number,
    weight: parsed.weight,
    reps: parsed.reps,
    rir_reported: parsed.rir_reported,
    set_type: parsed.set_type,
    unit: profile?.units ?? "lb",
  });
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
  await amendSet(supabase, user.id, parsed.set_id, {
    weight: parsed.weight,
    reps: parsed.reps,
    rir_reported: parsed.rir_reported,
  });
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

const weTargetSchema = z.object({
  workout_id: z.string().uuid(),
  workout_exercise_id: z.string().uuid(),
});

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

const replaceSchema = z.object({
  workout_id: z.string().uuid(),
  workout_exercise_id: z.string().uuid(),
  exercise_id: z.string().uuid(),
});

export async function replaceExerciseAction(input: {
  workout_id: string;
  workout_exercise_id: string;
  exercise_id: string;
}): Promise<{ error: string | null }> {
  const parsed = replaceSchema.parse(input);
  const { supabase, user } = await requireUser();
  const result = await replaceWorkoutExercise(
    supabase,
    user.id,
    parsed.workout_exercise_id,
    parsed.exercise_id,
  );
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
  return result;
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

/** Swap an exercise with its neighbour (delta -1 = up, +1 = down). */
async function moveExercise(
  workoutId: string,
  workoutExerciseId: string,
  delta: -1 | 1,
): Promise<void> {
  const { supabase } = await requireUser();
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
  overall_fatigue: z.coerce.number().int().min(0).max(4).nullable(),
  effort_rating: z.coerce.number().int().min(0).max(4).nullable(),
  performance_rating: z.coerce.number().int().min(0).max(4).nullable(),
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
    console.error("week generation failed after completion", error);
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
    console.error("week generation failed after ending workout", error);
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
