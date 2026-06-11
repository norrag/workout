import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivationPlan } from "@/lib/plan/activation";
import type {
  Database,
  MacrocycleRow,
  MesocycleRow,
  MesoExerciseRow,
  MicrocycleRow,
  WorkoutRow,
} from "@/lib/types/database";

type Client = SupabaseClient<Database>;

export async function listMacrocycles(
  supabase: Client,
): Promise<MacrocycleRow[]> {
  const { data, error } = await supabase
    .from("macrocycles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createMacrocycle(
  supabase: Client,
  userId: string,
  input: Pick<
    MacrocycleRow,
    "name" | "goal_type" | "start_date"
  > &
    Partial<Pick<MacrocycleRow, "goal_notes" | "target_end_date">>,
): Promise<MacrocycleRow> {
  const { data, error } = await supabase
    .from("macrocycles")
    .insert({
      user_id: userId,
      name: input.name,
      goal_type: input.goal_type,
      goal_notes: input.goal_notes ?? null,
      target_metrics: {},
      start_date: input.start_date,
      target_end_date: input.target_end_date ?? null,
      status: "active",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listMesocyclesByMacro(
  supabase: Client,
  macrocycleIds: string[],
): Promise<MesocycleRow[]> {
  if (macrocycleIds.length === 0) return [];
  const { data, error } = await supabase
    .from("mesocycles")
    .select("*")
    .in("macrocycle_id", macrocycleIds)
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function getMacrocycle(
  supabase: Client,
  id: string,
): Promise<MacrocycleRow | null> {
  const { data, error } = await supabase
    .from("macrocycles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface MesoPlanInput {
  macrocycle_id: string;
  name: string;
  weeks: number;
  days_per_week: number;
  includes_deload: boolean;
  rir_start: number;
  rir_end: number;
  start_date: string | null;
  exercises: Pick<
    MesoExerciseRow,
    | "day_of_week"
    | "position"
    | "exercise_id"
    | "initial_weight"
    | "initial_reps"
    | "initial_sets"
  >[];
}

/** Insert a planned mesocycle and its exercise slots. */
export async function createMesocyclePlan(
  supabase: Client,
  userId: string,
  input: MesoPlanInput,
): Promise<MesocycleRow> {
  const { data: meso, error } = await supabase
    .from("mesocycles")
    .insert({
      macrocycle_id: input.macrocycle_id,
      user_id: userId,
      name: input.name,
      weeks: input.weeks,
      days_per_week: input.days_per_week,
      includes_deload: input.includes_deload,
      rir_start: input.rir_start,
      rir_end: input.rir_end,
      status: "planned",
      template_id: null,
      start_date: input.start_date,
    })
    .select()
    .single();
  if (error) throw error;

  const { error: slotError } = await supabase.from("meso_exercises").insert(
    input.exercises.map((slot) => ({ ...slot, mesocycle_id: meso.id })),
  );
  if (slotError) {
    // best-effort cleanup so a half-created plan doesn't linger
    await supabase.from("mesocycles").delete().eq("id", meso.id);
    throw slotError;
  }
  return meso;
}

export interface MesocycleDetail {
  meso: MesocycleRow;
  planItems: (MesoExerciseRow & { exercise_name: string })[];
  microcycles: MicrocycleRow[];
}

export async function getMesocycleDetail(
  supabase: Client,
  mesoId: string,
): Promise<MesocycleDetail | null> {
  const { data: meso, error } = await supabase
    .from("mesocycles")
    .select("*")
    .eq("id", mesoId)
    .maybeSingle();
  if (error) throw error;
  if (!meso) return null;

  const [
    { data: planItems, error: planError },
    { data: microcycles, error: microError },
  ] = await Promise.all([
    supabase
      .from("meso_exercises")
      .select("*")
      .eq("mesocycle_id", mesoId)
      .order("day_of_week")
      .order("position"),
    supabase
      .from("microcycles")
      .select("*")
      .eq("mesocycle_id", mesoId)
      .order("week_number"),
  ]);
  if (planError) throw planError;
  if (microError) throw microError;

  const exerciseIds = [...new Set((planItems ?? []).map((p) => p.exercise_id))];
  let nameById = new Map<string, string>();
  if (exerciseIds.length > 0) {
    const { data: exercises, error: exError } = await supabase
      .from("exercises")
      .select("id, name")
      .in("id", exerciseIds);
    if (exError) throw exError;
    nameById = new Map((exercises ?? []).map((e) => [e.id, e.name]));
  }

  return {
    meso,
    planItems: (planItems ?? []).map((p) => ({
      ...p,
      exercise_name: nameById.get(p.exercise_id) ?? "",
    })),
    microcycles: microcycles ?? [],
  };
}

/**
 * Persist a computed activation plan: microcycles for every week, plus the
 * week-1 workouts with their seeded prescriptions, then flip the meso to
 * active. Inserts run in dependency order; RLS scopes everything to the user.
 */
export async function applyActivationPlan(
  supabase: Client,
  userId: string,
  meso: MesocycleRow,
  plan: ActivationPlan,
): Promise<void> {
  const { data: micros, error: microError } = await supabase
    .from("microcycles")
    .insert(
      plan.microcycles.map((m) => ({
        mesocycle_id: meso.id,
        user_id: userId,
        ...m,
      })),
    )
    .select();
  if (microError) throw microError;

  const week1 = (micros ?? []).find((m) => m.week_number === 1);
  if (!week1) throw new Error("week 1 microcycle missing after insert");

  const { data: workouts, error: workoutError } = await supabase
    .from("workouts")
    .insert(
      plan.week1Workouts.map((w) => ({
        microcycle_id: week1.id,
        user_id: userId,
        day_number: w.day_number,
        scheduled_date: null,
        performed_at: null,
        status: "planned" as const,
        notes: null,
      })),
    )
    .select();
  if (workoutError) throw workoutError;

  const workoutByDay = new Map((workouts ?? []).map((w) => [w.day_number, w.id]));
  const exerciseRows = plan.week1Workouts.flatMap((w) =>
    w.exercises.map((e) => ({
      workout_id: workoutByDay.get(w.day_number)!,
      exercise_id: e.exercise_id,
      position: e.position,
      prescribed_weight: e.prescription.weight,
      prescribed_reps: e.prescription.reps,
      prescribed_sets: e.prescription.sets,
      target_rir: e.prescription.targetRir,
      notes: null,
    })),
  );
  if (exerciseRows.length > 0) {
    const { error: weError } = await supabase
      .from("workout_exercises")
      .insert(exerciseRows);
    if (weError) throw weError;
  }

  const { error: statusError } = await supabase
    .from("mesocycles")
    .update({
      status: "active",
      start_date: plan.microcycles[0].start_date,
    })
    .eq("id", meso.id);
  if (statusError) throw statusError;
}

export interface CurrentState {
  macrocycle: MacrocycleRow | null;
  mesocycle: MesocycleRow | null;
  microcycle: MicrocycleRow | null;
  nextWorkout: WorkoutRow | null;
}

/** The user's position in macro → meso → micro → next workout. */
export async function getCurrentState(
  supabase: Client,
  userId: string,
): Promise<CurrentState> {
  const { data: macrocycle, error: macroError } = await supabase
    .from("macrocycles")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (macroError) throw macroError;
  if (!macrocycle)
    return { macrocycle: null, mesocycle: null, microcycle: null, nextWorkout: null };

  const { data: mesocycle, error: mesoError } = await supabase
    .from("mesocycles")
    .select("*")
    .eq("macrocycle_id", macrocycle.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (mesoError) throw mesoError;
  if (!mesocycle)
    return { macrocycle, mesocycle: null, microcycle: null, nextWorkout: null };

  const { data: microcycle, error: microError } = await supabase
    .from("microcycles")
    .select("*")
    .eq("mesocycle_id", mesocycle.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (microError) throw microError;
  if (!microcycle)
    return { macrocycle, mesocycle, microcycle: null, nextWorkout: null };

  const { data: nextWorkout, error: workoutError } = await supabase
    .from("workouts")
    .select("*")
    .eq("microcycle_id", microcycle.id)
    .in("status", ["planned", "in_progress"])
    .order("day_number")
    .limit(1)
    .maybeSingle();
  if (workoutError) throw workoutError;

  return { macrocycle, mesocycle, microcycle, nextWorkout: nextWorkout ?? null };
}
