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
}

export async function skipSetAction(input: {
  workout_id: string;
  workout_exercise_id: string;
}): Promise<void> {
  const parsed = weTargetSchema.parse(input);
  const { supabase } = await requireUser();
  await adjustPrescribedSets(supabase, parsed.workout_exercise_id, -1);
  revalidatePath(`/log/${parsed.workout_id}`);
}

export async function skipRemainingAction(input: {
  workout_id: string;
  workout_exercise_id: string;
}): Promise<void> {
  const parsed = weTargetSchema.parse(input);
  const { supabase } = await requireUser();
  await setExerciseStatus(supabase, parsed.workout_exercise_id, "skipped");
  revalidatePath(`/log/${parsed.workout_id}`);
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
}

const completeSchema = z.object({
  workout_id: z.string().uuid(),
  notes: z.string().max(2000).nullable(),
});

export async function completeWorkoutAction(input: {
  workout_id: string;
  notes: string | null;
}): Promise<void> {
  const parsed = completeSchema.parse(input);
  const { supabase, user } = await requireUser();
  await completeWorkout(
    supabase,
    user.id,
    parsed.workout_id,
    parsed.notes?.trim() || null,
  );
  revalidatePath("/workout");
  revalidatePath(`/log/${parsed.workout_id}`);
  redirect("/workout");
}
