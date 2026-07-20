import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { latestDecisionsByRow, type DecisionPageRow } from "./regeneration";

type Client = SupabaseClient<Database>;

/**
 * N58 follow-up — resolve the LATEST engine decision behind each OPEN
 * prescription row of a meso (planned workout, week/day/exercise filterable).
 * The `generate_explanations` admin MCP tool uses this to target exactly the
 * decisions whose explanations the owner wants (re)generated, without forcing
 * a recompute first: the decision id is the explanation's cache key (doc 18
 * §5), so regenerating against the same id + `overwrite` is the cheap
 * iterate-on-the-prompt loop.
 */
export interface OpenDecisionTarget {
  decisionId: string;
  workoutExerciseId: string;
  exerciseId: string;
  weekNumber: number;
  dayNumber: number;
}

export async function listOpenDecisionTargets(
  service: Client,
  userId: string,
  mesoId: string,
  filter?: { exerciseId?: string; weekNumber?: number; dayNumber?: number },
): Promise<OpenDecisionTarget[]> {
  const { data: micros, error: microsError } = await service
    .from("microcycles")
    .select("id, week_number")
    .eq("mesocycle_id", mesoId)
    .eq("user_id", userId);
  if (microsError) throw microsError;
  const weekByMicro = new Map(
    (micros ?? [])
      .filter(
        (m) => filter?.weekNumber == null || m.week_number === filter.weekNumber,
      )
      .map((m) => [m.id, m.week_number]),
  );
  if (weekByMicro.size === 0) return [];

  let workoutsQuery = service
    .from("workouts")
    .select("id, microcycle_id, day_number")
    .in("microcycle_id", [...weekByMicro.keys()])
    .eq("user_id", userId)
    .eq("status", "planned");
  if (filter?.dayNumber != null) {
    workoutsQuery = workoutsQuery.eq("day_number", filter.dayNumber);
  }
  const { data: workouts, error: workoutsError } = await workoutsQuery;
  if (workoutsError) throw workoutsError;
  const workoutById = new Map((workouts ?? []).map((w) => [w.id, w]));
  if (workoutById.size === 0) return [];

  let wesQuery = service
    .from("workout_exercises")
    .select("id, workout_id, exercise_id")
    .in("workout_id", [...workoutById.keys()]);
  if (filter?.exerciseId) {
    wesQuery = wesQuery.eq("exercise_id", filter.exerciseId);
  }
  const { data: wes, error: wesError } = await wesQuery;
  if (wesError) throw wesError;
  if (!wes || wes.length === 0) return [];
  const weIds = wes.map((we) => we.id);

  const latest = await latestDecisionsByRow(async (from, to) => {
    const { data, error } = await service
      .from("engine_decisions")
      .select(
        "id, workout_exercise_id, source_workout_exercise_id, exercise_id, kind, inputs",
      )
      .in("workout_exercise_id", weIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as DecisionPageRow[];
  }, weIds);

  const targets: OpenDecisionTarget[] = [];
  for (const we of wes) {
    const decision = latest.get(we.id);
    if (!decision) continue; // decision-less rows have nothing to explain yet
    const workout = workoutById.get(we.workout_id);
    if (!workout) continue;
    targets.push({
      decisionId: decision.id,
      workoutExerciseId: we.id,
      exerciseId: we.exercise_id,
      weekNumber: weekByMicro.get(workout.microcycle_id) ?? 0,
      dayNumber: workout.day_number,
    });
  }
  return targets.sort(
    (a, b) => a.weekNumber - b.weekNumber || a.dayNumber - b.dayNumber,
  );
}
