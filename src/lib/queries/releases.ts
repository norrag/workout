import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { ActiveWorkoutStatus } from "@/lib/version/suppression";
import { compare } from "@/lib/version/semver";

type Client = SupabaseClient<Database>;

/**
 * doc 23 §6.3 — the one read the gate costs: a PK-keyed single column.
 * Deliberately not `select("*")`; this runs on every app navigation.
 */
export async function getLastSeenVersion(
  supabase: Client,
  userId: string,
): Promise<{ lastSeenVersion: string | null } | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("last_seen_version")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? { lastSeenVersion: data.last_seen_version } : null;
}

/**
 * doc 23 §6.4 — the status of the workout the Workout tab would render.
 *
 * `logSet` flips `planned → in_progress` on the first logged set, so this is
 * the difference between a workout the user is looking at and one they are in.
 * Indexed by `workouts_user_idx (user_id, status)`; only read when the gate
 * has something to show, so it costs nothing in the ordinary case.
 */
export async function getActiveWorkoutStatus(
  supabase: Client,
  userId: string,
): Promise<ActiveWorkoutStatus | null> {
  // an in-progress workout outranks a planned one: it is the session the
  // athlete is actually in, whatever day order says. Asked as two explicit
  // filters rather than one ordered read, so the precedence is stated instead
  // of falling out of how the status values happen to sort.
  for (const status of ["in_progress", "planned"] as const) {
    const { data, error } = await supabase
      .from("workouts")
      .select("id")
      .eq("user_id", userId)
      .eq("status", status)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return status;
  }
  return null;
}

/**
 * doc 23 §6.3 — acknowledgment, guarded monotonically.
 *
 * Writes `CURRENT_VERSION` rather than the highest pending version, so a user
 * who skipped 1.1 and 1.2 clears both. Never moves last-seen backwards: after
 * a rollback (T8) an account may hold a version above the deployed one, and
 * lowering it would re-announce releases it has already been told about.
 *
 * Returns the value now stored, so a caller can assert the monotonic property.
 */
export async function setLastSeenVersion(
  supabase: Client,
  userId: string,
  version: string,
): Promise<string> {
  const current = await getLastSeenVersion(supabase, userId);
  const existing = current?.lastSeenVersion ?? null;
  if (existing != null && compare(existing, version) >= 0) return existing;
  const { error } = await supabase
    .from("profiles")
    .update({ last_seen_version: version })
    .eq("id", userId);
  if (error) throw error;
  return version;
}
