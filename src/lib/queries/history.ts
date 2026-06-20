import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

export interface HistoryEntry {
  mesocycle_id: string;
  meso_name: string;
  coordinate: string;
  performed_on: string;
  top_weight: number | null;
  reps: string;
  is_deload: boolean;
  /** per-session log note (09 §8), shown as a tap-to-reveal note icon */
  session_note: string | null;
}

export interface HistoryMesoGroup {
  mesocycle_id: string;
  meso_name: string;
  entries: HistoryEntry[];
}

/**
 * Group session entries by mesocycle for the Exercise page History tab (3.1b),
 * preserving the newest-first order. Sessions within a meso are time-contiguous,
 * so consecutive grouping keeps each meso's block together.
 */
export function groupHistoryByMeso(entries: HistoryEntry[]): HistoryMesoGroup[] {
  const groups: HistoryMesoGroup[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.mesocycle_id === e.mesocycle_id) last.entries.push(e);
    else
      groups.push({
        mesocycle_id: e.mesocycle_id,
        meso_name: e.meso_name,
        entries: [e],
      });
  }
  return groups;
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
    .select(
      "mesocycle_id, microcycle_id, workout_id, workout_exercise_id, weight, reps, set_number, performed_at",
    )
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
  const weIds = [...new Set(sets.map((s) => s.workout_exercise_id))];
  const [
    { data: mesos, error: mesoError },
    { data: micros, error: microError },
    { data: workouts, error: workoutError },
    { data: feedback, error: feedbackError },
  ] = await Promise.all([
    supabase.from("mesocycles").select("id, name").in("id", mesoIds),
    supabase
      .from("microcycles")
      .select("id, week_number, is_deload")
      .in("id", microIds),
    supabase.from("workouts").select("id, day_number").in("id", workoutIds),
    supabase
      .from("exercise_feedback")
      .select("workout_exercise_id, notes")
      .in("workout_exercise_id", weIds),
  ]);
  if (mesoError) throw mesoError;
  if (microError) throw microError;
  if (workoutError) throw workoutError;
  if (feedbackError) throw feedbackError;
  const mesoById = new Map((mesos ?? []).map((m) => [m.id, m]));
  const microById = new Map((micros ?? []).map((m) => [m.id, m]));
  const workoutById = new Map((workouts ?? []).map((w) => [w.id, w]));
  const noteByWe = new Map(
    (feedback ?? [])
      .filter((f) => f.notes)
      .map((f) => [f.workout_exercise_id, f.notes]),
  );

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
      mesocycle_id: group[0].mesocycle_id,
      meso_name: mesoById.get(group[0].mesocycle_id)?.name ?? "",
      coordinate: `W${micro?.week_number ?? "?"}·D${workout?.day_number ?? "?"}`,
      performed_on: group[0].performed_at.slice(0, 10),
      top_weight: top,
      reps,
      is_deload: micro?.is_deload ?? false,
      session_note: noteByWe.get(group[0].workout_exercise_id) ?? null,
    };
  });
}
