import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  ExerciseFeedbackRow,
  ExerciseNoteRow,
  LoggedSetRow,
  MesocycleRow,
  MicrocycleRow,
  SetType,
  Units,
  WorkoutExerciseRow,
  WorkoutRow,
} from "@/lib/types/database";

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// day view detail (fig 1.1) — everything the logger needs in one shape
// ---------------------------------------------------------------------------

export interface LoggedExercise extends WorkoutExerciseRow {
  exercise_name: string;
  equipment_type: string;
  muscle_group: string;
  sets: LoggedSetRow[];
  pinned_note: ExerciseNoteRow | null;
  feedback: ExerciseFeedbackRow | null;
}

export interface WorkoutDetail {
  workout: WorkoutRow;
  microcycle: MicrocycleRow;
  mesocycle: MesocycleRow;
  /** all weeks of the meso, for the week track */
  microcycles: MicrocycleRow[];
  dayLabel: string | null;
  exercises: LoggedExercise[];
}

export async function getWorkoutDetail(
  supabase: Client,
  userId: string,
  workoutId: string,
): Promise<WorkoutDetail | null> {
  const { data: workout, error: workoutError } = await supabase
    .from("workouts")
    .select("*")
    .eq("id", workoutId)
    .maybeSingle();
  if (workoutError) throw workoutError;
  if (!workout) return null;

  const { data: microcycle, error: microError } = await supabase
    .from("microcycles")
    .select("*")
    .eq("id", workout.microcycle_id)
    .single();
  if (microError) throw microError;

  const [
    { data: mesocycle, error: mesoError },
    { data: microcycles, error: microsError },
    { data: workoutExercises, error: weError },
    { data: day, error: dayError },
  ] = await Promise.all([
    supabase
      .from("mesocycles")
      .select("*")
      .eq("id", microcycle.mesocycle_id)
      .single(),
    supabase
      .from("microcycles")
      .select("*")
      .eq("mesocycle_id", microcycle.mesocycle_id)
      .order("week_number"),
    supabase
      .from("workout_exercises")
      .select("*")
      .eq("workout_id", workoutId)
      .order("position"),
    supabase
      .from("meso_days")
      .select("label")
      .eq("mesocycle_id", microcycle.mesocycle_id)
      .eq("day_number", workout.day_number)
      .maybeSingle(),
  ]);
  if (mesoError) throw mesoError;
  if (microsError) throw microsError;
  if (weError) throw weError;
  if (dayError) throw dayError;

  const wes = workoutExercises ?? [];
  const weIds = wes.map((we) => we.id);
  const exerciseIds = [...new Set(wes.map((we) => we.exercise_id))];

  const [
    { data: exercises, error: exError },
    { data: sets, error: setsError },
    { data: notes, error: notesError },
    { data: feedback, error: fbError },
    { data: muscleGroups, error: mgError },
  ] = await Promise.all([
    exerciseIds.length > 0
      ? supabase
          .from("exercises")
          .select("id, name, equipment_type")
          .in("id", exerciseIds)
      : Promise.resolve({ data: [], error: null }),
    weIds.length > 0
      ? supabase
          .from("logged_sets")
          .select("*")
          .in("workout_exercise_id", weIds)
          .order("set_number")
      : Promise.resolve({ data: [], error: null }),
    exerciseIds.length > 0
      ? supabase
          .from("exercise_notes")
          .select("*")
          .eq("user_id", userId)
          .eq("is_pinned", true)
          .in("exercise_id", exerciseIds)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    weIds.length > 0
      ? supabase
          .from("exercise_feedback")
          .select("*")
          .in("workout_exercise_id", weIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("muscle_groups").select("*"),
  ]);
  if (exError) throw exError;
  if (setsError) throw setsError;
  if (notesError) throw notesError;
  if (fbError) throw fbError;
  if (mgError) throw mgError;

  const exerciseById = new Map((exercises ?? []).map((e) => [e.id, e]));
  const mgNameById = new Map((muscleGroups ?? []).map((g) => [g.id, g.name]));
  const noteByExercise = new Map<string, ExerciseNoteRow>();
  for (const note of notes ?? []) {
    if (!noteByExercise.has(note.exercise_id))
      noteByExercise.set(note.exercise_id, note);
  }
  const feedbackByWe = new Map(
    (feedback ?? []).map((f) => [f.workout_exercise_id, f]),
  );

  return {
    workout,
    microcycle,
    mesocycle,
    microcycles: microcycles ?? [],
    dayLabel: day?.label ?? null,
    exercises: wes.map((we) => ({
      ...we,
      exercise_name: exerciseById.get(we.exercise_id)?.name ?? "",
      equipment_type: exerciseById.get(we.exercise_id)?.equipment_type ?? "",
      muscle_group: we.muscle_group_id
        ? (mgNameById.get(we.muscle_group_id) ?? "")
        : "",
      sets: (sets ?? []).filter((s) => s.workout_exercise_id === we.id),
      pinned_note: noteByExercise.get(we.exercise_id) ?? null,
      feedback: feedbackByWe.get(we.id) ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// set logging — append-only (no client deletes of logged history)
// ---------------------------------------------------------------------------

export async function logSet(
  supabase: Client,
  userId: string,
  input: {
    workout_exercise_id: string;
    set_number: number;
    weight: number;
    reps: number;
    rir_reported: number | null;
    set_type: SetType;
    unit: Units;
  },
): Promise<LoggedSetRow> {
  // denormalized cycle stamps come from the workout chain
  const { data: we, error: weError } = await supabase
    .from("workout_exercises")
    .select("id, workout_id, exercise_id")
    .eq("id", input.workout_exercise_id)
    .single();
  if (weError) throw weError;
  const { data: workout, error: workoutError } = await supabase
    .from("workouts")
    .select("id, microcycle_id")
    .eq("id", we.workout_id)
    .single();
  if (workoutError) throw workoutError;
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

  const { data, error } = await supabase
    .from("logged_sets")
    .insert({
      workout_exercise_id: we.id,
      user_id: userId,
      exercise_id: we.exercise_id,
      macrocycle_id: meso.macrocycle_id,
      mesocycle_id: meso.id,
      microcycle_id: micro.id,
      workout_id: workout.id,
      performed_at: new Date().toISOString(),
      set_number: input.set_number,
      weight: input.weight,
      unit: input.unit,
      reps: input.reps,
      set_type: input.set_type,
      rir_reported: input.rir_reported,
      is_warmup: false,
      notes: null,
    })
    .select()
    .single();
  if (error) throw error;

  // first set flips the workout in progress
  await supabase
    .from("workouts")
    .update({ status: "in_progress" })
    .eq("id", workout.id)
    .eq("status", "planned");

  return data;
}

/** Amend a logged set (history is append-only; corrections are updates). */
export async function amendSet(
  supabase: Client,
  userId: string,
  setId: string,
  patch: Partial<Pick<LoggedSetRow, "weight" | "reps" | "rir_reported" | "set_type">>,
): Promise<void> {
  const { error } = await supabase
    .from("logged_sets")
    .update(patch)
    .eq("id", setId)
    .eq("user_id", userId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// exercise menu ops (fig 1.2)
// ---------------------------------------------------------------------------

export async function adjustPrescribedSets(
  supabase: Client,
  workoutExerciseId: string,
  delta: number,
): Promise<void> {
  const { data: we, error: weError } = await supabase
    .from("workout_exercises")
    .select("prescribed_sets")
    .eq("id", workoutExerciseId)
    .single();
  if (weError) throw weError;
  const next = Math.max(1, (we.prescribed_sets ?? 1) + delta);
  const { error } = await supabase
    .from("workout_exercises")
    .update({ prescribed_sets: next })
    .eq("id", workoutExerciseId);
  if (error) throw error;
}

export async function setExerciseStatus(
  supabase: Client,
  workoutExerciseId: string,
  status: "pending" | "completed" | "skipped",
): Promise<void> {
  const { error } = await supabase
    .from("workout_exercises")
    .update({ status })
    .eq("id", workoutExerciseId);
  if (error) throw error;
}

/** Remove an exercise from the day — only while nothing is logged on it
 * (deleting the row would cascade logged history otherwise). */
export async function removeWorkoutExercise(
  supabase: Client,
  workoutExerciseId: string,
): Promise<{ error: string | null }> {
  const { count, error: countError } = await supabase
    .from("logged_sets")
    .select("*", { count: "exact", head: true })
    .eq("workout_exercise_id", workoutExerciseId);
  if (countError) throw countError;
  if ((count ?? 0) > 0)
    return { error: "Sets are logged on this exercise. Skip it instead." };
  const { error } = await supabase
    .from("workout_exercises")
    .delete()
    .eq("id", workoutExerciseId);
  if (error) throw error;
  return { error: null };
}

export async function savePinnedNote(
  supabase: Client,
  userId: string,
  exerciseId: string,
  body: string,
): Promise<void> {
  // one pinned note per exercise: unpin previous, pin the new one
  const { error: unpinError } = await supabase
    .from("exercise_notes")
    .update({ is_pinned: false })
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .eq("is_pinned", true);
  if (unpinError) throw unpinError;
  const { error } = await supabase.from("exercise_notes").insert({
    user_id: userId,
    exercise_id: exerciseId,
    body,
    is_pinned: true,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// feedback (fig 1.4): joint pain per exercise; pump/workload 0–10 scoped
// to the exercise's muscle group, stored on that exercise's feedback row
// ---------------------------------------------------------------------------

export async function saveExerciseFeedback(
  supabase: Client,
  userId: string,
  input: {
    workout_exercise_id: string;
    joint_pain: number | null;
    muscle_group_id: string | null;
    pump: number | null;
    workload: number | null;
  },
): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from("exercise_feedback")
    .select("id")
    .eq("workout_exercise_id", input.workout_exercise_id)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const { error } = await supabase
      .from("exercise_feedback")
      .update({
        joint_pain: input.joint_pain,
        muscle_group_id: input.muscle_group_id,
        pump: input.pump,
        workload: input.workload,
      })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("exercise_feedback").insert({
      workout_exercise_id: input.workout_exercise_id,
      user_id: userId,
      joint_pain: input.joint_pain,
      muscle_group_id: input.muscle_group_id,
      pump: input.pump,
      workload: input.workload,
      notes: null,
    });
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// workout completion (fig 1.5)
// ---------------------------------------------------------------------------

export async function completeWorkout(
  supabase: Client,
  userId: string,
  workoutId: string,
  notes: string | null,
): Promise<void> {
  // exercises with logged sets are completed; untouched ones are skipped
  const { data: wes, error: weError } = await supabase
    .from("workout_exercises")
    .select("id, status")
    .eq("workout_id", workoutId);
  if (weError) throw weError;
  const weIds = (wes ?? []).map((w) => w.id);
  let loggedWeIds = new Set<string>();
  if (weIds.length > 0) {
    const { data: sets, error: setsError } = await supabase
      .from("logged_sets")
      .select("workout_exercise_id")
      .in("workout_exercise_id", weIds);
    if (setsError) throw setsError;
    loggedWeIds = new Set((sets ?? []).map((s) => s.workout_exercise_id));
  }
  for (const we of wes ?? []) {
    if (we.status !== "skipped") {
      await supabase
        .from("workout_exercises")
        .update({ status: loggedWeIds.has(we.id) ? "completed" : "skipped" })
        .eq("id", we.id);
    }
  }

  const { data: workout, error: workoutError } = await supabase
    .from("workouts")
    .update({
      status: "completed",
      performed_at: new Date().toISOString(),
      notes,
    })
    .eq("id", workoutId)
    .eq("user_id", userId)
    .select()
    .single();
  if (workoutError) throw workoutError;

  // when the whole week is logged, close the microcycle; the week N→N+1
  // generation job (Phase 4) activates the next one
  const { data: siblings, error: siblingError } = await supabase
    .from("workouts")
    .select("status")
    .eq("microcycle_id", workout.microcycle_id);
  if (siblingError) throw siblingError;
  const allDone = (siblings ?? []).every(
    (w) => w.status === "completed" || w.status === "skipped",
  );
  if (allDone) {
    const { error } = await supabase
      .from("microcycles")
      .update({ status: "completed" })
      .eq("id", workout.microcycle_id);
    if (error) throw error;
  }
}
