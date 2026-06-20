import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExerciseParamOverride } from "@/lib/engine";
import type { Database } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

/**
 * Per-user × exercise engine overrides (doc 14 phase 3). Data access for the
 * first tunable — the editable weight increment — read at every generation /
 * recompute site (resolved into effective params) and the freshness check
 * (folded into the dependency fingerprint). Goes through the query layer (no
 * inline supabase in components); RLS scopes every row to `user_id = auth.uid()`.
 */

/**
 * The user's increment overrides for the given exercises (or all, when omitted),
 * keyed by exercise id. Absent exercises simply aren't in the map — a missing
 * entry means "use the engine default" (resolveEffectiveParams returns params
 * unchanged and the fingerprint omits the override).
 */
export async function getExerciseParamOverrides(
  client: Client,
  userId: string,
  exerciseIds?: string[],
): Promise<Map<string, ExerciseParamOverride>> {
  if (exerciseIds && exerciseIds.length === 0) return new Map();
  let query = client
    .from("exercise_param_overrides")
    .select("exercise_id, weight_increment")
    .eq("user_id", userId);
  if (exerciseIds) query = query.in("exercise_id", exerciseIds);
  const { data, error } = await query;
  if (error) throw error;
  return new Map(
    (data ?? []).map((r) => [
      r.exercise_id,
      { weightIncrement: r.weight_increment },
    ]),
  );
}

/** The increment override (in the user's units) for one exercise, or null. */
export async function getExerciseIncrementOverride(
  client: Client,
  userId: string,
  exerciseId: string,
): Promise<number | null> {
  const { data, error } = await client
    .from("exercise_param_overrides")
    .select("weight_increment")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .maybeSingle();
  if (error) throw error;
  return data?.weight_increment ?? null;
}

/**
 * Set (upsert) the increment override for one exercise. The new value differs
 * from the fingerprint the stored prescriptions carry, so the next read-path
 * reconcile recomputes exactly that exercise's open rows (doc 14 §7) — no eager
 * invalidation wiring here.
 */
export async function setExerciseIncrementOverride(
  client: Client,
  userId: string,
  exerciseId: string,
  weightIncrement: number,
): Promise<void> {
  const { error } = await client.from("exercise_param_overrides").upsert(
    {
      user_id: userId,
      exercise_id: exerciseId,
      weight_increment: weightIncrement,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,exercise_id" },
  );
  if (error) throw error;
}

/** Clear the increment override for one exercise (fall back to the default). */
export async function clearExerciseIncrementOverride(
  client: Client,
  userId: string,
  exerciseId: string,
): Promise<void> {
  const { error } = await client
    .from("exercise_param_overrides")
    .delete()
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId);
  if (error) throw error;
}
