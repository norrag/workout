import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreProgress } from "@/lib/engine";
import type { Database } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

/**
 * Progress scoring v1 (07 Phase 4): per-exercise e1RM trend across a meso,
 * read from `v_exercise_history` so the UI and MCP report the same numbers.
 */
export interface ExerciseProgressScore {
  exercise_id: string;
  exercise_name: string;
  first_e1rm: number | null;
  last_e1rm: number | null;
  /** percentage e1RM change first → last session of the meso */
  score_pct: number | null;
}

export async function getMesoProgressScores(
  supabase: Client,
  userId: string,
  mesoId: string,
): Promise<ExerciseProgressScore[]> {
  const { data, error } = await supabase
    .from("v_exercise_history")
    .select("*")
    .eq("user_id", userId)
    .eq("mesocycle_id", mesoId)
    .order("performed_on");
  if (error) throw error;

  const byExercise = new Map<
    string,
    { name: string; first: number | null; last: number | null }
  >();
  for (const row of data ?? []) {
    if (row.e1rm == null) continue;
    const cur = byExercise.get(row.exercise_id);
    if (!cur) {
      byExercise.set(row.exercise_id, {
        name: row.exercise_name,
        first: row.e1rm,
        last: row.e1rm,
      });
    } else {
      cur.last = row.e1rm;
    }
  }

  return [...byExercise.entries()].map(([exercise_id, v]) => ({
    exercise_id,
    exercise_name: v.name,
    first_e1rm: v.first,
    last_e1rm: v.last,
    score_pct: scoreProgress(v.first, v.last),
  }));
}
