import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  MacrocycleRow,
  MesocycleRow,
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
