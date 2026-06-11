"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  setWorkoutStatus,
  upsertExerciseFeedback,
  upsertLoggedSet,
  upsertWorkoutFeedback,
} from "@/lib/queries/workouts";
import type { Database } from "@/lib/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActionResult {
  error: string | null;
}

const scale3 = z.number().int().min(0).max(3).nullable();
const scale4 = z.number().int().min(0).max(4).nullable();

const logSetSchema = z.object({
  id: z.string().uuid(), // client-generated, makes retries idempotent
  workout_exercise_id: z.string().uuid(),
  set_number: z.number().int().min(1).max(50),
  weight: z.number().min(0),
  reps: z.number().int().min(0).max(200),
  rir_reported: z.number().int().min(0).max(10).nullable(),
  is_warmup: z.boolean(),
});

const exerciseFeedbackSchema = z.object({
  workout_exercise_id: z.string().uuid(),
  joint_pain: scale3,
  muscle_strain: scale3,
  pump: scale3,
  fatigue: scale3,
});

const completeSchema = z.object({
  workout_id: z.string().uuid(),
  overall_fatigue: scale4,
  effort_rating: scale4,
  performance_rating: scale4,
});

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  return { supabase, user };
}

/**
 * Resolve the cycle stamps for a workout_exercise from the DB — the client
 * is never trusted for denormalized context.
 */
async function resolveStamps(
  supabase: SupabaseClient<Database>,
  workoutExerciseId: string,
) {
  const { data: we, error: weError } = await supabase
    .from("workout_exercises")
    .select("id, workout_id, exercise_id")
    .eq("id", workoutExerciseId)
    .single();
  if (weError) throw weError;

  const { data: workout, error: wError } = await supabase
    .from("workouts")
    .select("id, microcycle_id, status")
    .eq("id", we.workout_id)
    .single();
  if (wError) throw wError;

  const { data: micro, error: microError } = await supabase
    .from("microcycles")
    .select("id, mesocycle_id")
    .eq("id", workout.microcycle_id)
    .single();
  if (microError) throw microError;

  const { data: meso, error: mesoError } = await supabase
    .from("mesocycles")
    .select("id, macrocycle_id")
    .eq("id", micro.mesocycle_id)
    .single();
  if (mesoError) throw mesoError;

  return {
    exercise_id: we.exercise_id,
    workout_id: workout.id,
    workout_status: workout.status,
    microcycle_id: micro.id,
    mesocycle_id: meso.id,
    macrocycle_id: meso.macrocycle_id,
  };
}

export async function logSetAction(payload: unknown): Promise<ActionResult> {
  const parsed = logSetSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase, user } = await requireUser();
  const stamps = await resolveStamps(supabase, parsed.data.workout_exercise_id);

  if (stamps.workout_status === "planned") {
    await setWorkoutStatus(
      supabase,
      stamps.workout_id,
      "in_progress",
      new Date().toISOString(),
    );
  }

  await upsertLoggedSet(supabase, {
    id: parsed.data.id,
    workout_exercise_id: parsed.data.workout_exercise_id,
    user_id: user.id,
    exercise_id: stamps.exercise_id,
    macrocycle_id: stamps.macrocycle_id,
    mesocycle_id: stamps.mesocycle_id,
    microcycle_id: stamps.microcycle_id,
    workout_id: stamps.workout_id,
    performed_at: new Date().toISOString(),
    set_number: parsed.data.set_number,
    weight: parsed.data.weight,
    reps: parsed.data.reps,
    rir_reported: parsed.data.rir_reported,
    is_warmup: parsed.data.is_warmup,
  });
  return { error: null };
}

export async function exerciseFeedbackAction(
  payload: unknown,
): Promise<ActionResult> {
  const parsed = exerciseFeedbackSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase, user } = await requireUser();
  await upsertExerciseFeedback(supabase, {
    ...parsed.data,
    user_id: user.id,
  });
  return { error: null };
}

export async function completeWorkoutAction(
  payload: unknown,
): Promise<ActionResult> {
  const parsed = completeSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase, user } = await requireUser();
  await upsertWorkoutFeedback(supabase, {
    workout_id: parsed.data.workout_id,
    user_id: user.id,
    overall_fatigue: parsed.data.overall_fatigue,
    effort_rating: parsed.data.effort_rating,
    performance_rating: parsed.data.performance_rating,
  });
  await setWorkoutStatus(supabase, parsed.data.workout_id, "completed");
  revalidatePath("/today");
  revalidatePath("/cycles");
  return { error: null };
}
