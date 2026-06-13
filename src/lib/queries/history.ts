import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

export interface HistoryEntry {
  meso_name: string;
  coordinate: string;
  performed_on: string;
  top_weight: number | null;
  reps: string;
  is_deload: boolean;
}

/**
 * Exercise history (fig 3.2): one entry per session — top weight with the
 * reps at that weight — grouped by meso, newest first. Shared by the library
 * detail page, the planner picker, and the day-view exercise menu.
 */
export async function getExerciseHistory(
  supabase: Client,
  userId: string,
  exerciseId: string,
): Promise<HistoryEntry[]> {
  const { data: sets, error } = await supabase
    .from("logged_sets")
    .select("*")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
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
