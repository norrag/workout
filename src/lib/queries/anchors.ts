import type { SupabaseClient } from "@supabase/supabase-js";
import {
  recencyWeightedE1rm,
  type EngineParams,
  type E1rmSample,
  type E1rmAnchor,
} from "@/lib/engine";
import type { Database } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Recency-weighted strength anchor (e1RM) per exercise (doc 11), powering the
 * live reps predictor — and, with `seed_from_anchor` (§S1, standalone-prescription
 * investigation 2026-06-23), the meso-start seed. Reads the user's recent working
 * sets, assumes each was performed at its prescribed target RIR (the app's RIR
 * premise — no separate per-set RIR capture), and folds them through the pure
 * `recencyWeightedE1rm`. `ageDays` is computed here (query land); the engine stays
 * clock-free.
 *
 * Lives in this leaf module (re-exported from `logging.ts` for existing importers)
 * so both `generation.ts` (seed) and `logging.ts`/`progression.ts` can use it
 * without a generation ↔ logging import cycle.
 */
export async function getExerciseE1rmAnchors(
  supabase: Client,
  userId: string,
  exerciseIds: string[],
  params: EngineParams,
): Promise<Map<string, E1rmAnchor>> {
  const out = new Map<string, E1rmAnchor>();
  if (exerciseIds.length === 0) return out;

  const { data: sets, error } = await supabase
    .from("logged_sets")
    .select(
      "exercise_id, workout_exercise_id, workout_id, weight, reps, rir_reported, performed_at",
    )
    .eq("user_id", userId)
    .in("exercise_id", exerciseIds)
    .eq("is_warmup", false)
    .gt("weight", 0)
    .gt("reps", 0)
    .order("performed_at", { ascending: false })
    .limit(600);
  if (error) throw error;
  if (!sets || sets.length === 0) return out;

  // N3 (resolves T-A7/T-A8): prescriptions and predictions read PREVIOUS
  // COMPLETED workouts only. The in-progress workout's sets post to history live
  // as they're logged, but must NOT feed the anchor — otherwise the first set of
  // the current exercise, if it's the recency-weighted best, makes the session
  // average (one set logged ⇒ that set IS the average) snap every remaining
  // prescription onto it. A workout becomes canonical for the engine only once
  // it is marked complete (with feedback ⇒ status 'completed'). Filtered in query
  // land so the pure engine stays clock-/state-free.
  const workoutIds = [...new Set(sets.map((s) => s.workout_id))];
  const { data: completedWorkouts, error: cwError } = await supabase
    .from("workouts")
    .select("id")
    .in("id", workoutIds)
    .eq("status", "completed");
  if (cwError) throw cwError;
  const completedIds = new Set((completedWorkouts ?? []).map((w) => w.id));
  const completedSets = sets.filter((s) => completedIds.has(s.workout_id));
  if (completedSets.length === 0) return out;

  // assumed RIR = the parent prescription's target RIR (RIR premise, doc 11),
  // unless the set carried an explicit reported RIR
  const weIds = [...new Set(completedSets.map((s) => s.workout_exercise_id))];
  const { data: wes, error: weError } = await supabase
    .from("workout_exercises")
    .select("id, target_rir")
    .in("id", weIds);
  if (weError) throw weError;
  const targetRirByWe = new Map((wes ?? []).map((w) => [w.id, w.target_rir]));

  const now = Date.now();
  const byExercise = new Map<string, E1rmSample[]>();
  for (const s of completedSets) {
    const ageDays = Math.max(
      0,
      (now - new Date(s.performed_at).getTime()) / DAY_MS,
    );
    const sample: E1rmSample = {
      weight: s.weight,
      reps: s.reps,
      targetRir: s.rir_reported ?? targetRirByWe.get(s.workout_exercise_id) ?? null,
      ageDays,
      // session = one exercise on one day (doc 13 §9.3 session_best anchor)
      sessionKey: s.workout_exercise_id,
    };
    const cur = byExercise.get(s.exercise_id) ?? [];
    cur.push(sample);
    byExercise.set(s.exercise_id, cur);
  }

  for (const [exerciseId, samples] of byExercise) {
    const anchor = recencyWeightedE1rm(samples, params);
    if (anchor) out.set(exerciseId, anchor);
  }
  return out;
}
