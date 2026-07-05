import "server-only";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import type { ExerciseRow, MuscleGroupRow } from "@/lib/types/database";

/**
 * Cached reads for GLOBAL reference data (WS-J Phase-2 #7) — the two datasets
 * every user sees identically and the app was re-fetching from Postgres on
 * every request:
 *
 *  - `muscle_groups` — a ~15-row lookup table, previously fetched in 8+ hot
 *    paths (day view, planner, templates, stats, coaching, volume projection).
 *  - the STOCK exercise library (`exercises` where `user_id IS NULL`) + its
 *    muscle links — ~330 rows + links, previously fetched whole on every
 *    /exercises visit, planner open, and add-exercise sheet.
 *
 * Both live in the Next Data Cache via `unstable_cache`: shared across users
 * and requests, so identical global rows are served without a DB round trip.
 *
 * Why the service client (hard rule #4): `unstable_cache` callbacks run
 * outside the request's cookie scope, so the RLS user client can't be used
 * inside them — and MUST not be, or one user's session would populate a cache
 * other users read. Both reads are explicitly scoped to global rows only:
 * `muscle_groups` has no user column, and the library read filters
 * `user_id IS NULL` (stock only — visible to every user by RLS design).
 * Per-user data (custom exercises, exclusions, PRs, overrides) is NEVER
 * cached here; callers fetch those live on the RLS client and merge.
 *
 * Invalidation: nothing in-app mutates either dataset (custom exercises are
 * per-user and stay live; stock rows change only via migrations/admin), so
 * correctness never depends on a bust. The TTL bounds staleness after a
 * migration; the tags allow an explicit `revalidateTag` if an admin path ever
 * needs one.
 */

export const MUSCLE_GROUPS_TAG = "ref:muscle-groups";
export const STOCK_LIBRARY_TAG = "ref:stock-library";

/** One hour: reference data only changes via migrations; self-heals fast
 *  enough after one without per-request DB traffic in between. */
const REFERENCE_TTL_SECONDS = 3600;

export type StockLibraryLink = {
  exercise_id: string;
  muscle_group_id: string;
  role: "primary" | "secondary";
};

export interface StockLibrary {
  /** stock exercises (user_id IS NULL), name-ordered */
  exercises: ExerciseRow[];
  /** muscle links for those exercises only */
  links: StockLibraryLink[];
}

/** All muscle groups, name-ordered. Cached; identical for every user. */
export const getMuscleGroupsCached = unstable_cache(
  async (): Promise<MuscleGroupRow[]> => {
    const service = createServiceClient();
    const { data, error } = await service
      .from("muscle_groups")
      .select("*")
      .order("name");
    if (error) throw error;
    return data ?? [];
  },
  ["reference-muscle-groups"],
  { revalidate: REFERENCE_TTL_SECONDS, tags: [MUSCLE_GROUPS_TAG] },
);

/** The stock exercise library + muscle links. Cached; identical for every
 *  user. Callers merge the user's live custom exercises on top. */
export const getStockLibraryCached = unstable_cache(
  async (): Promise<StockLibrary> => {
    const service = createServiceClient();
    const [{ data: exercises, error: exError }, { data: links, error: linkError }] =
      await Promise.all([
        service.from("exercises").select("*").is("user_id", null).order("name"),
        // stock-only links via the FK join — an `.in()` on 330+ ids would hit
        // the same 414 query-string limit listExercises documents. The
        // hand-authored DB types carry no relationship metadata, so the embed
        // shape is typed via the cast below (same pattern as logSet's chain).
        service
          .from("exercise_muscle_groups")
          .select("exercise_id, muscle_group_id, role, exercises!inner(user_id)")
          .is("exercises.user_id", null),
      ]);
    if (exError) throw exError;
    if (linkError) throw linkError;
    const linkRows = (links ?? []) as unknown as (StockLibraryLink & {
      exercises: { user_id: string | null };
    })[];
    return {
      exercises: exercises ?? [],
      links: linkRows.map((l) => ({
        exercise_id: l.exercise_id,
        muscle_group_id: l.muscle_group_id,
        role: l.role,
      })),
    };
  },
  ["reference-stock-library"],
  { revalidate: REFERENCE_TTL_SECONDS, tags: [STOCK_LIBRARY_TAG] },
);
