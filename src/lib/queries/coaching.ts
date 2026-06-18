import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Coaching readers (05 §Coaching & analysis) — read-only views the model uses
// to act as a grounded trainer. Built on the shared views + base tables, always
// RLS-scoped to the caller. No write surface.
// ---------------------------------------------------------------------------

export interface RecentSession {
  workout_id: string;
  performed_on: string | null;
  coordinate: string;
  mesocycle_id: string;
  meso_name: string;
  is_deload: boolean;
  working_sets: number;
  exercises_logged: number;
  feedback: {
    overall_fatigue: number | null;
    effort: number | null;
    performance: number | null;
  } | null;
  notes: string | null;
}

/**
 * Reverse-chron feed of the user's completed workouts with session feedback and
 * the workout note — recovery & adherence signal (05 §get_recent_sessions).
 */
export async function getRecentSessions(
  supabase: Client,
  userId: string,
  limit = 10,
): Promise<RecentSession[]> {
  const { data: workouts, error } = await supabase
    .from("workouts")
    .select("id, microcycle_id, day_number, performed_at, status")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("performed_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  if (!workouts || workouts.length === 0) return [];

  const microIds = [...new Set(workouts.map((w) => w.microcycle_id))];
  const workoutIds = workouts.map((w) => w.id);
  const [
    { data: micros, error: microError },
    { data: feedback, error: fbError },
    { data: history, error: histError },
  ] = await Promise.all([
    supabase
      .from("microcycles")
      .select("id, week_number, is_deload, mesocycle_id")
      .in("id", microIds),
    supabase
      .from("workout_feedback")
      .select("*")
      .eq("user_id", userId)
      .in("workout_id", workoutIds),
    supabase
      .from("v_exercise_history")
      .select("workout_id, exercise_id, working_sets")
      .eq("user_id", userId)
      .in("workout_id", workoutIds),
  ]);
  if (microError) throw microError;
  if (fbError) throw fbError;
  if (histError) throw histError;

  const microById = new Map((micros ?? []).map((m) => [m.id, m]));
  const mesoIds = [...new Set((micros ?? []).map((m) => m.mesocycle_id))];
  const { data: mesos, error: mesoError } = await supabase
    .from("mesocycles")
    .select("id, name")
    .in("id", mesoIds);
  if (mesoError) throw mesoError;
  const mesoById = new Map((mesos ?? []).map((m) => [m.id, m.name]));
  const fbByWorkout = new Map((feedback ?? []).map((f) => [f.workout_id, f]));

  const aggByWorkout = new Map<string, { sets: number; exercises: Set<string> }>();
  for (const h of history ?? []) {
    const cur = aggByWorkout.get(h.workout_id) ?? { sets: 0, exercises: new Set() };
    cur.sets += h.working_sets;
    cur.exercises.add(h.exercise_id);
    aggByWorkout.set(h.workout_id, cur);
  }

  return workouts.map((w) => {
    const micro = microById.get(w.microcycle_id);
    const fb = fbByWorkout.get(w.id);
    const agg = aggByWorkout.get(w.id);
    return {
      workout_id: w.id,
      performed_on: w.performed_at ? w.performed_at.slice(0, 10) : null,
      coordinate: `W${micro?.week_number ?? "?"}·D${w.day_number}`,
      mesocycle_id: micro?.mesocycle_id ?? "",
      meso_name: micro ? (mesoById.get(micro.mesocycle_id) ?? "") : "",
      is_deload: micro?.is_deload ?? false,
      working_sets: agg?.sets ?? 0,
      exercises_logged: agg?.exercises.size ?? 0,
      feedback: fb
        ? {
            overall_fatigue: fb.overall_fatigue,
            effort: fb.effort_rating,
            performance: fb.performance_rating,
          }
        : null,
      notes: fb?.notes ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// exercise affinity (05 §get_exercise_affinity) — the user's exercise-selection
// profile: what they actually train, how well it loads, and how their notes /
// feedback read on it. Respects exclusions.
// ---------------------------------------------------------------------------

export interface ExerciseAffinity {
  exercise_id: string;
  name: string;
  equipment_type: string;
  muscles: { name: string; role: "primary" | "secondary" }[];
  times_trained: number;
  last_performed_at: string | null;
  best_weight: number | null;
  best_e1rm_estimate: number | null;
  total_volume: number | null;
  pinned_note: string | null;
  feedback: {
    sessions: number;
    avg_joint_pain: number | null;
    avg_workload: number | null;
    avg_pump: number | null;
  };
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/** How many exercises the affinity profile reports (most-trained first). */
export const AFFINITY_LIMIT = 60;

/**
 * PostgREST renders `.in(col, ids)` into the request URL, so an unbounded id
 * list overflows the URL-length limit and the query fails with an opaque error
 * (the real cause of the no-arg / equipment affinity breakage, §5.1 — the
 * `muscle_group_id` path happened to narrow the set enough to stay under it).
 * Splitting the list into bounded chunks keeps every request well-formed.
 */
export const ID_CHUNK = 150;

export async function selectInChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await run(ids.slice(i, i + ID_CHUNK));
    if (error) throw error;
    if (data) out.push(...data);
  }
  return out;
}

/**
 * PostgREST also caps every response at `db.max_rows` (1000 here, see
 * `supabase/config.toml`), so a single `.in(...)` over a large set silently
 * drops rows past the cap — which is what made the unfiltered affinity feedback
 * rollup path-dependent (a popular exercise's `workout_exercises` rows fell past
 * the cap and read as zero feedback). `fetchAllRows` walks `.range()` windows
 * until a short page proves exhaustion; the page query MUST carry a stable
 * `.order(...)` or rows can repeat/skip across windows. Page size must be ≤ the
 * server cap to make progress.
 */
export const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return out;
}

export async function getExerciseAffinity(
  supabase: Client,
  userId: string,
  opts: { muscleGroupId?: string; equipment?: string } = {},
): Promise<ExerciseAffinity[]> {
  // exercises the user has actually trained (frequency / recency / loads),
  // most-trained first so the post-filter cap keeps the most relevant movements
  const { data: overview, error: ovError } = await supabase
    .from("v_exercise_overview")
    .select("*")
    .eq("user_id", userId)
    .order("times_trained", { ascending: false });
  if (ovError) throw ovError;
  if (!overview || overview.length === 0) return [];

  const allIds = overview.map((o) => o.exercise_id);

  // exercise-grained metadata needed to filter — bounded by the number of
  // distinct exercises trained, but chunked so a heavy library can't overflow.
  const [exercises, muscleLinks, groups, exclusionRows] = await Promise.all([
    selectInChunks<{ id: string; name: string; equipment_type: string }>(allIds, (c) =>
      supabase.from("exercises").select("id, name, equipment_type").in("id", c),
    ),
    selectInChunks<{ exercise_id: string; muscle_group_id: string; role: "primary" | "secondary" }>(
      allIds,
      (c) =>
        supabase
          .from("exercise_muscle_groups")
          .select("exercise_id, muscle_group_id, role")
          .in("exercise_id", c),
    ),
    supabase.from("muscle_groups").select("id, name"),
    supabase.from("excluded_exercises").select("exercise_id").eq("user_id", userId),
  ]);
  if (groups.error) throw groups.error;
  if (exclusionRows.error) throw exclusionRows.error;

  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  const groupNameById = new Map((groups.data ?? []).map((g) => [g.id, g.name]));
  const excluded = new Set((exclusionRows.data ?? []).map((x) => x.exercise_id));
  const inGroup = opts.muscleGroupId
    ? new Set(
        muscleLinks
          .filter((l) => l.muscle_group_id === opts.muscleGroupId)
          .map((l) => l.exercise_id),
      )
    : null;
  const equip = opts.equipment?.toLowerCase() ?? null;

  // apply every filter to the candidate set *before* the heavy per-set fan-out,
  // then cap to the most-trained AFFINITY_LIMIT (the list is already ordered)
  const exerciseIds = allIds
    .filter((id) => {
      if (excluded.has(id)) return false;
      if (inGroup && !inGroup.has(id)) return false;
      if (equip && (exerciseById.get(id)?.equipment_type ?? "").toLowerCase() !== equip)
        return false;
      return true;
    })
    .slice(0, AFFINITY_LIMIT);
  if (exerciseIds.length === 0) return [];
  const keep = new Set(exerciseIds);

  // per-exercise extras only for the capped set
  const [notes, prs] = await Promise.all([
    selectInChunks<{ exercise_id: string; body: string }>(exerciseIds, (c) =>
      supabase
        .from("exercise_notes")
        .select("exercise_id, body")
        .eq("user_id", userId)
        .eq("is_pinned", true)
        .in("exercise_id", c),
    ),
    supabase.from("v_exercise_prs").select("exercise_id, best_weight").eq("user_id", userId),
  ]);
  if (prs.error) throw prs.error;

  const noteByExercise = new Map(notes.map((n) => [n.exercise_id, n.body]));
  const bestWeightByExercise = new Map((prs.data ?? []).map((p) => [p.exercise_id, p.best_weight]));

  // feedback aggregation: exercise_feedback carries no exercise_id, so resolve it
  // through workout_exercises. Drive this off the (sparse, unique-per-we)
  // feedback table — paginated so the row cap can't drop rows — and resolve
  // exercise_id only for the workout_exercises that actually have feedback (a
  // primary-key lookup, chunked well under the cap). Scanning the full
  // workout_exercises set instead overflowed the 1000-row cap and made the
  // rollup path-dependent (a popular exercise read as zero feedback no-arg but
  // populated when an equipment filter shrank the set).
  const feedbackRows = await fetchAllRows<{
    workout_exercise_id: string;
    joint_pain: number | null;
    workload: number | null;
    pump: number | null;
  }>((from, to) =>
    supabase
      .from("exercise_feedback")
      .select("workout_exercise_id, joint_pain, workload, pump")
      .eq("user_id", userId)
      .order("workout_exercise_id")
      .range(from, to),
  );
  const feedbackWeIds = [...new Set(feedbackRows.map((f) => f.workout_exercise_id))];
  const wes = await selectInChunks<{ id: string; exercise_id: string }>(feedbackWeIds, (c) =>
    supabase.from("workout_exercises").select("id, exercise_id").in("id", c),
  );
  const weToExercise = new Map(wes.map((w) => [w.id, w.exercise_id]));

  const feedbackByExercise = new Map<
    string,
    { joint: number[]; workload: number[]; pump: number[]; sessions: number }
  >();
  for (const row of feedbackRows) {
    const exId = weToExercise.get(row.workout_exercise_id);
    // keep only feedback for the exercises this call actually reports
    if (!exId || !keep.has(exId)) continue;
    const cur = feedbackByExercise.get(exId) ?? {
      joint: [],
      workload: [],
      pump: [],
      sessions: 0,
    };
    cur.sessions += 1;
    if (row.joint_pain != null) cur.joint.push(row.joint_pain);
    if (row.workload != null) cur.workload.push(row.workload);
    if (row.pump != null) cur.pump.push(row.pump);
    feedbackByExercise.set(exId, cur);
  }

  return overview
    .filter((o) => keep.has(o.exercise_id))
    .map((o) => {
      const ex = exerciseById.get(o.exercise_id);
      const fbAgg = feedbackByExercise.get(o.exercise_id);
      return {
        exercise_id: o.exercise_id,
        name: ex?.name ?? o.exercise_name,
        equipment_type: ex?.equipment_type ?? "",
        muscles: muscleLinks
          .filter((l) => l.exercise_id === o.exercise_id)
          .map((l) => ({ name: groupNameById.get(l.muscle_group_id) ?? "", role: l.role })),
        times_trained: o.times_trained,
        last_performed_at: o.last_performed_at,
        best_weight: bestWeightByExercise.get(o.exercise_id) ?? o.weight_pr,
        best_e1rm_estimate: o.best_e1rm,
        total_volume: o.total_volume,
        pinned_note: noteByExercise.get(o.exercise_id) ?? null,
        feedback: {
          sessions: fbAgg?.sessions ?? 0,
          avg_joint_pain: mean(fbAgg?.joint ?? []),
          avg_workload: mean(fbAgg?.workload ?? []),
          avg_pump: mean(fbAgg?.pump ?? []),
        },
      };
    });
}

// ---------------------------------------------------------------------------
// exercise e1RM series (chronological) — feeds analyze_exercise_progress
// stall/plateau detection. One row per session, oldest first.
// ---------------------------------------------------------------------------

export interface E1rmPoint {
  performed_on: string;
  e1rm: number | null;
  top_weight: number | null;
  working_sets: number;
}

export async function getExerciseE1rmSeries(
  supabase: Client,
  userId: string,
  exerciseId: string,
): Promise<E1rmPoint[]> {
  const { data, error } = await supabase
    .from("v_exercise_history")
    .select("performed_on, e1rm, top_weight, working_sets")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .order("performed_on", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    performed_on: r.performed_on,
    e1rm: r.e1rm,
    top_weight: r.top_weight,
    working_sets: r.working_sets,
  }));
}
