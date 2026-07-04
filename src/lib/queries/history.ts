import type { SupabaseClient } from "@supabase/supabase-js";
import { coerceLoadType, effectiveLoad, isBodyweightLoad } from "@/lib/engine";
import type { Database } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

export interface HistoryEntry {
  mesocycle_id: string;
  meso_name: string;
  coordinate: string;
  performed_on: string;
  top_weight: number | null;
  reps: string;
  /** session-average stored per-set e1RM (PH31/PH32 flip view); null if none
   * stored (e.g. a bodyweight session, where weight 0 yields no estimate) */
  e1rm: number | null;
  /** T-I2: session-average EFFECTIVE load (bodyweight ± entered) for a bodyweight
   * exercise — the flip-view metric in place of e1RM there (owner #3). Null for
   * external exercises (the flip shows e1RM) or when no bodyweight was captured. */
  effective_load: number | null;
  is_deload: boolean;
  /** per-session log note (09 §8), shown as a tap-to-reveal note icon */
  session_note: string | null;
}

export interface HistoryMesoGroup {
  mesocycle_id: string;
  meso_name: string;
  entries: HistoryEntry[];
}

/** One page of session history plus the cursor for the next (older) page. */
export interface HistoryPage {
  entries: HistoryEntry[];
  /** pass as `before` to fetch the next page; null = history exhausted (N30) */
  nextCursor: string | null;
}

/** Sets fetched per page — the initial view the owner sized as "plenty";
 * older pages lazy-load past it until the history is exhausted (N30). */
export const HISTORY_PAGE_SETS = 120;

/**
 * The session's average stored per-set e1RM (PH32 flip view, N2): the mean engine
 * estimate across the session's working sets. N2 — the session e1RM stat should
 * average over all the session's sets, not take the single best set (the old
 * `max`), so one strong set no longer defines the session. Rounded to one decimal
 * to match the stored per-set precision. Null when no set carries an estimate —
 * e.g. a bodyweight session, where weight 0 yields no e1RM (the flip view shows
 * "—"); null per-set values are skipped, never counted as zero.
 */
export function sessionAvgE1rm(e1rms: (number | null)[]): number | null {
  const present = e1rms.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  return Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 10) / 10;
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
 * Trim an over-fetched (limit+1) newest-first set window to a whole-day page
 * (N30). The raw row limit can split a session — and the sets of one workout
 * can even share identical timestamps (imports) — so the page boundary is the
 * calendar day: every row of the oldest, possibly-split day is dropped and the
 * cursor points at the start of the oldest day kept, so the next fetch
 * (`performed_at < cursor`) re-reads the dropped day in full. No set is ever
 * skipped or duplicated across pages. Degenerate guard: if every fetched row
 * is on one day (a >limit-set day), keep the split rather than an empty page.
 */
export function pageSetsByDay<T extends { performed_at: string }>(
  rows: T[],
  limit: number,
): { page: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { page: rows, nextCursor: null };
  const boundaryDay = rows[limit].performed_at.slice(0, 10);
  const page = rows
    .slice(0, limit)
    .filter((r) => r.performed_at.slice(0, 10) > boundaryDay);
  if (page.length === 0) {
    const kept = rows.slice(0, limit);
    return { page: kept, nextCursor: kept[kept.length - 1].performed_at };
  }
  const oldestKeptDay = page[page.length - 1].performed_at.slice(0, 10);
  return { page, nextCursor: `${oldestKeptDay}T00:00:00Z` };
}

/**
 * Exercise history (fig 3.2): one entry per session — top weight with the
 * reps at that weight — grouped by meso, newest first. Shared by the library
 * detail page, the planner picker, and the day-view exercise menu.
 *
 * Paged (N30): each call returns up to ~HISTORY_PAGE_SETS sets' worth of whole
 * sessions plus a cursor; pass it back as `before` to walk older history until
 * `nextCursor` is null. Full history is always reachable.
 *
 * Scoped (N15): `scopeMesoIds` restricts the window to those mesocycles — the
 * macro/meso Performance drill-down shows the history behind a trend, not the
 * lifetime record. Pagination applies within the scope unchanged.
 */
export async function getExerciseHistory(
  supabase: Client,
  userId: string,
  exerciseId: string,
  before?: string | null,
  scopeMesoIds?: string[] | null,
): Promise<HistoryPage> {
  let query = supabase
    .from("logged_sets")
    .select("*")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .eq("is_warmup", false)
    .order("performed_at", { ascending: false })
    .limit(HISTORY_PAGE_SETS + 1);
  if (scopeMesoIds && scopeMesoIds.length > 0)
    query = query.in("mesocycle_id", scopeMesoIds);
  if (before) query = query.lt("performed_at", before);
  const { data: fetched, error } = await query;
  if (error) throw error;
  if (!fetched || fetched.length === 0) return { entries: [], nextCursor: null };
  const { page: sets, nextCursor } = pageSetsByDay(fetched, HISTORY_PAGE_SETS);
  if (sets.length === 0) return { entries: [], nextCursor: null };

  const mesoIds = [...new Set(sets.map((s) => s.mesocycle_id))];
  const microIds = [...new Set(sets.map((s) => s.microcycle_id))];
  const workoutIds = [...new Set(sets.map((s) => s.workout_id))];
  const weIds = [...new Set(sets.map((s) => s.workout_exercise_id))];
  const [
    { data: mesos, error: mesoError },
    { data: micros, error: microError },
    { data: workouts, error: workoutError },
    { data: feedback, error: feedbackError },
    { data: exercise, error: exError },
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
    supabase
      .from("exercises")
      .select("equipment_type, load_type")
      .eq("id", exerciseId)
      .maybeSingle(),
  ]);
  if (mesoError) throw mesoError;
  if (microError) throw microError;
  if (workoutError) throw workoutError;
  if (feedbackError) throw feedbackError;
  if (exError) throw exError;
  // T-I2: for a bodyweight exercise the flip view shows the session-average
  // EFFECTIVE load (bodyweight ± entered) using each set's captured bodyweight.
  const loadType = exercise
    ? coerceLoadType(exercise.load_type, exercise.equipment_type)
    : "external";
  const isBw = isBodyweightLoad(loadType);
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
  const entries = [...byWorkout.entries()].map(([workoutId, group]) => {
    const top = Math.max(...group.map((s) => s.weight));
    const reps = group
      .filter((s) => s.weight === top)
      .sort((a, b) => a.set_number - b.set_number)
      .map((s) => s.reps)
      .join(", ");
    const e1rm = sessionAvgE1rm(group.map((s) => s.e1rm));
    const effective_load = isBw
      ? sessionAvgE1rm(
          group.map((s) => effectiveLoad(loadType, s.weight, s.bodyweight)),
        )
      : null;
    const micro = microById.get(group[0].microcycle_id);
    const workout = workoutById.get(workoutId);
    return {
      mesocycle_id: group[0].mesocycle_id,
      meso_name: mesoById.get(group[0].mesocycle_id)?.name ?? "",
      coordinate: `W${micro?.week_number ?? "?"}·D${workout?.day_number ?? "?"}`,
      performed_on: group[0].performed_at.slice(0, 10),
      top_weight: top,
      reps,
      e1rm,
      effective_load,
      is_deload: micro?.is_deload ?? false,
      session_note: noteByWe.get(group[0].workout_exercise_id) ?? null,
    };
  });
  return { entries, nextCursor };
}
