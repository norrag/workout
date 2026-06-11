import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  EquipmentType,
  ExerciseFeedbackRow,
  LoggedSetRow,
  WorkoutExerciseRow,
  WorkoutFeedbackRow,
  WorkoutRow,
} from "@/lib/types/database";

type Client = SupabaseClient<Database>;

export interface WorkoutExerciseDetail extends WorkoutExerciseRow {
  exercise_name: string;
  equipment_type: EquipmentType;
  sets: LoggedSetRow[];
  feedback: ExerciseFeedbackRow | null;
}

export interface WorkoutDetail {
  workout: WorkoutRow;
  /** cycle stamps for logged_sets, derived server-side */
  stamps: {
    macrocycle_id: string;
    mesocycle_id: string;
    microcycle_id: string;
  };
  target_rir: number;
  week_number: number;
  is_deload: boolean;
  exercises: WorkoutExerciseDetail[];
  feedback: WorkoutFeedbackRow | null;
}

export async function getWorkoutDetail(
  supabase: Client,
  workoutId: string,
): Promise<WorkoutDetail | null> {
  const { data: workout, error } = await supabase
    .from("workouts")
    .select("*")
    .eq("id", workoutId)
    .maybeSingle();
  if (error) throw error;
  if (!workout) return null;

  const { data: micro, error: microError } = await supabase
    .from("microcycles")
    .select("*")
    .eq("id", workout.microcycle_id)
    .single();
  if (microError) throw microError;

  const { data: meso, error: mesoError } = await supabase
    .from("mesocycles")
    .select("id, macrocycle_id")
    .eq("id", micro.mesocycle_id)
    .single();
  if (mesoError) throw mesoError;

  const [
    { data: workoutExercises, error: weError },
    { data: loggedSets, error: setsError },
    { data: workoutFeedback, error: wfError },
  ] = await Promise.all([
    supabase
      .from("workout_exercises")
      .select("*")
      .eq("workout_id", workoutId)
      .order("position"),
    supabase
      .from("logged_sets")
      .select("*")
      .eq("workout_id", workoutId)
      .order("set_number"),
    supabase
      .from("workout_feedback")
      .select("*")
      .eq("workout_id", workoutId)
      .maybeSingle(),
  ]);
  if (weError) throw weError;
  if (setsError) throw setsError;
  if (wfError) throw wfError;

  const weIds = (workoutExercises ?? []).map((we) => we.id);
  const exerciseIds = [
    ...new Set((workoutExercises ?? []).map((we) => we.exercise_id)),
  ];

  const [{ data: exercises, error: exError }, { data: feedback, error: fbError }] =
    await Promise.all([
      exerciseIds.length > 0
        ? supabase
            .from("exercises")
            .select("id, name, equipment_type")
            .in("id", exerciseIds)
        : Promise.resolve({ data: [], error: null }),
      weIds.length > 0
        ? supabase
            .from("exercise_feedback")
            .select("*")
            .in("workout_exercise_id", weIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (exError) throw exError;
  if (fbError) throw fbError;

  const exerciseById = new Map((exercises ?? []).map((e) => [e.id, e]));

  return {
    workout,
    stamps: {
      macrocycle_id: meso.macrocycle_id,
      mesocycle_id: micro.mesocycle_id,
      microcycle_id: micro.id,
    },
    target_rir: micro.target_rir,
    week_number: micro.week_number,
    is_deload: micro.is_deload,
    exercises: (workoutExercises ?? []).map((we) => {
      const ex = exerciseById.get(we.exercise_id);
      return {
        ...we,
        exercise_name: ex?.name ?? "",
        equipment_type: (ex?.equipment_type ?? "other") as EquipmentType,
        sets: (loggedSets ?? []).filter(
          (s) => s.workout_exercise_id === we.id,
        ),
        feedback:
          (feedback ?? []).find((f) => f.workout_exercise_id === we.id) ??
          null,
      };
    }),
    feedback: workoutFeedback ?? null,
  };
}

/**
 * Insert (or idempotently re-insert) one logged set. The id is
 * client-generated so offline retries can't double-log; stamps are derived
 * server-side, never taken from the client.
 */
export async function upsertLoggedSet(
  supabase: Client,
  row: {
    id: string;
    workout_exercise_id: string;
    user_id: string;
    exercise_id: string;
    macrocycle_id: string;
    mesocycle_id: string;
    microcycle_id: string;
    workout_id: string;
    performed_at: string;
    set_number: number;
    weight: number;
    reps: number;
    rir_reported: number | null;
    is_warmup: boolean;
  },
): Promise<void> {
  const { error } = await supabase
    .from("logged_sets")
    .upsert({ ...row, notes: null }, { onConflict: "id" });
  if (error) throw error;
}

export async function upsertExerciseFeedback(
  supabase: Client,
  row: {
    workout_exercise_id: string;
    user_id: string;
    joint_pain: number | null;
    muscle_strain: number | null;
    pump: number | null;
    fatigue: number | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("exercise_feedback")
    .upsert({ ...row, notes: null }, { onConflict: "workout_exercise_id" });
  if (error) throw error;
}

export async function upsertWorkoutFeedback(
  supabase: Client,
  row: {
    workout_id: string;
    user_id: string;
    overall_fatigue: number | null;
    effort_rating: number | null;
    performance_rating: number | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("workout_feedback")
    .upsert({ ...row, notes: null }, { onConflict: "workout_id" });
  if (error) throw error;
}

export async function setWorkoutStatus(
  supabase: Client,
  workoutId: string,
  status: WorkoutRow["status"],
  performedAt?: string,
): Promise<void> {
  const patch: Partial<WorkoutRow> = { status };
  if (performedAt) patch.performed_at = performedAt;
  const { error } = await supabase
    .from("workouts")
    .update(patch)
    .eq("id", workoutId);
  if (error) throw error;
}
