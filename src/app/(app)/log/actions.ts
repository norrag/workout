"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  adjustPrescribedSets,
  amendSet,
  completeWorkout,
  logSet,
  removeWorkoutExercise,
  saveExerciseFeedback,
  savePinnedNote,
  setExerciseStatus,
} from "@/lib/queries/logging";
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

export async function skipSetAction(input: {
  workout_id: string;
  workout_exercise_id: string;
}): Promise<void> {
  const parsed = weTargetSchema.parse(input);
  const { supabase } = await requireUser();
  await adjustPrescribedSets(supabase, parsed.workout_exercise_id, -1);
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

export async function skipRemainingAction(input: {
  workout_id: string;
  workout_exercise_id: string;
}): Promise<void> {
  const parsed = weTargetSchema.parse(input);
  const { supabase } = await requireUser();
  await setExerciseStatus(supabase, parsed.workout_exercise_id, "skipped");
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

const feedbackSchema = z.object({
  workout_id: z.string().uuid(),
  workout_exercise_id: z.string().uuid(),
  joint_pain: z.coerce.number().int().min(0).max(3).nullable(),
  muscle_group_id: z.string().uuid().nullable(),
  pump: z.coerce.number().int().min(0).max(10).nullable(),
  workload: z.coerce.number().int().min(0).max(10).nullable(),
});

export async function saveFeedbackAction(input: {
  workout_id: string;
  workout_exercise_id: string;
  joint_pain: number | null;
  muscle_group_id: string | null;
  pump: number | null;
  workload: number | null;
}): Promise<void> {
  const parsed = feedbackSchema.parse(input);
  const { supabase, user } = await requireUser();
  await saveExerciseFeedback(supabase, user.id, {
    workout_exercise_id: parsed.workout_exercise_id,
    joint_pain: parsed.joint_pain,
    muscle_group_id: parsed.muscle_group_id,
    pump: parsed.pump,
    workload: parsed.workload,
  });
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

export interface HistoryEntry {
  meso_name: string;
  coordinate: string;
  performed_on: string;
  top_weight: number | null;
  reps: string;
  is_deload: boolean;
}

/** Exercise history (fig 3.2): sessions grouped by meso, newest first. */
export async function getExerciseHistoryAction(
  exerciseId: string,
): Promise<HistoryEntry[]> {
  const parsed = z.string().uuid().parse(exerciseId);
  const { supabase, user } = await requireUser();

  const { data: sets, error } = await supabase
    .from("logged_sets")
    .select("*")
    .eq("user_id", user.id)
    .eq("exercise_id", parsed)
    .eq("is_warmup", false)
    .order("performed_at", { ascending: false })
    .limit(120);
  if (error) throw error;
  if (!sets || sets.length === 0) return [];

  const mesoIds = [...new Set(sets.map((s) => s.mesocycle_id))];
  const microIds = [...new Set(sets.map((s) => s.microcycle_id))];
  const workoutIds = [...new Set(sets.map((s) => s.workout_id))];
  const [
    { data: mesos, error: mesoError },
    { data: micros, error: microError },
    { data: workouts, error: workoutError },
  ] = await Promise.all([
    supabase.from("mesocycles").select("id, name").in("id", mesoIds),
    supabase
      .from("microcycles")
      .select("id, week_number, is_deload")
      .in("id", microIds),
    supabase.from("workouts").select("id, day_number").in("id", workoutIds),
  ]);
  if (mesoError) throw mesoError;
  if (microError) throw microError;
  if (workoutError) throw workoutError;
  const mesoById = new Map((mesos ?? []).map((m) => [m.id, m]));
  const microById = new Map((micros ?? []).map((m) => [m.id, m]));
  const workoutById = new Map((workouts ?? []).map((w) => [w.id, w]));

  // one entry per workout: top weight and its reps across the session
  const byWorkout = new Map<string, typeof sets>();
  for (const s of sets) {
    const cur = byWorkout.get(s.workout_id) ?? [];
    cur.push(s);
    byWorkout.set(s.workout_id, cur);
  }
  return [...byWorkout.entries()].map(([workoutId, group]) => {
    const top = Math.max(...group.map((s) => s.weight));
    const reps = group
      .filter((s) => s.weight === top)
      .sort((a, b) => a.set_number - b.set_number)
      .map((s) => s.reps)
      .join(", ");
    const micro = microById.get(group[0].microcycle_id);
    const workout = workoutById.get(workoutId);
    return {
      meso_name: mesoById.get(group[0].mesocycle_id)?.name ?? "",
      coordinate: `W${micro?.week_number ?? "?"}·D${workout?.day_number ?? "?"}`,
      performed_on: group[0].performed_at.slice(0, 10),
      top_weight: top,
      reps,
      is_deload: micro?.is_deload ?? false,
    };
  });
}

export async function moveExerciseDownAction(input: {
  workout_id: string;
  workout_exercise_id: string;
}): Promise<void> {
  const parsed = weTargetSchema.parse(input);
  const { supabase } = await requireUser();
  const { data: wes, error } = await supabase
    .from("workout_exercises")
    .select("id, position")
    .eq("workout_id", parsed.workout_id)
    .order("position");
  if (error) throw error;
  const idx = (wes ?? []).findIndex((w) => w.id === parsed.workout_exercise_id);
  if (idx < 0 || idx >= (wes ?? []).length - 1) return;
  const a = wes![idx];
  const b = wes![idx + 1];
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
  revalidatePath(`/log/${parsed.workout_id}`);
  revalidatePath("/workout");
}

const completeSchema = z.object({
  workout_id: z.string().uuid(),
  notes: z.string().max(2000).nullable(),
});

export async function completeWorkoutAction(input: {
  workout_id: string;
  notes: string | null;
}): Promise<AdvanceResult> {
  const parsed = completeSchema.parse(input);
  const { supabase, user } = await requireUser();
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
