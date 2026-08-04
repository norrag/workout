import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { assumedRir, type EngineParams } from "@/lib/engine";
import {
  pickSessionE1rm,
  type ExerciseSession,
  type SessionSet,
} from "@/lib/analysis/comparability";
import { getMuscleGroupsCached } from "./reference";
import { isBackedOffSlot } from "./slot-effort";

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

/**
 * Fetch every row whose id is in `ids`, chunking the id filter (URL-length cap)
 * *and* paginating each chunk (row cap) — for an `.in(ids)` query that can both
 * have a long id list and return more rows than the cap (e.g. all
 * workout_exercises across a heavily trained lift's sessions). The page query
 * must carry a stable `.order(...)`.
 */
export async function selectAllForIds<T>(
  ids: string[],
  run: (
    chunk: string[],
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const rows = await fetchAllRows<T>((from, to) => run(chunk, from, to));
    out.push(...rows);
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
    getMuscleGroupsCached(),
    supabase.from("excluded_exercises").select("exercise_id").eq("user_id", userId),
  ]);
  if (exclusionRows.error) throw exclusionRows.error;

  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
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
// exercise session series (chronological) — feeds analyze_exercise_progress'
// comparability analysis (12 §Stage 3 + §Stage 5). One row per logged session,
// oldest first, each tagged with the comparability dimensions (block goal +
// prescribed RIR + Stage 5's day-slot and session-order position) and a
// confidence-aware, RIR-folded representative e1RM. Unlike v_exercise_history's
// Epley-only e1RM, the e1RM here folds RIR into effective reps and carries a
// confidence band ([10] §1), so trend/stall can down-weight weak (high-rep /
// far-from-failure) estimates. The day-slot (workouts.day_number) and session
// position (workout_exercises.position rank) let the analysis separate a
// movement's two day-slots and normalize for fatigue position (12 §Stage 5).
// ---------------------------------------------------------------------------

export async function getExerciseSessions(
  supabase: Client,
  userId: string,
  exerciseId: string,
  params: EngineParams,
): Promise<ExerciseSession[]> {
  // logged working sets for this lift, lifetime, RLS-scoped. Paginated against
  // the row cap (a heavily trained lift can exceed it) with a stable order.
  const sets = await fetchAllRows<{
    workout_id: string;
    workout_exercise_id: string;
    mesocycle_id: string;
    microcycle_id: string;
    performed_at: string;
    weight: number;
    reps: number;
    rir_reported: number | null;
  }>((from, to) =>
    supabase
      .from("logged_sets")
      .select(
        "workout_id, workout_exercise_id, mesocycle_id, microcycle_id, performed_at, weight, reps, rir_reported",
      )
      .eq("user_id", userId)
      .eq("exercise_id", exerciseId)
      .eq("is_warmup", false)
      .order("performed_at")
      .order("id")
      .range(from, to),
  );
  if (sets.length === 0) return [];

  // resolve the comparability dimensions: target RIR (microcycle), block name +
  // macro (mesocycle), goal/phase (macrocycle), and the Stage 5 session-order
  // dimensions: the day-slot (workouts.day_number + meso_days.label) and the
  // movement's ordinal within its session (workout_exercises.position).
  const microIds = [...new Set(sets.map((s) => s.microcycle_id))];
  const mesoIds = [...new Set(sets.map((s) => s.mesocycle_id))];
  const workoutIds = [...new Set(sets.map((s) => s.workout_id))];
  const [micros, mesos, workouts, slotPositions] = await Promise.all([
    selectInChunks<{ id: string; target_rir: number | null }>(microIds, (c) =>
      supabase.from("microcycles").select("id, target_rir").in("id", c),
    ),
    selectInChunks<{ id: string; name: string; macrocycle_id: string | null }>(mesoIds, (c) =>
      supabase.from("mesocycles").select("id, name, macrocycle_id").in("id", c),
    ),
    selectInChunks<{ id: string; day_number: number }>(workoutIds, (c) =>
      supabase.from("workouts").select("id, day_number").in("id", c),
    ),
    // every exercise slot in those sessions — to rank the target movement's
    // performed position (1 = first) and the session's exercise count. Chunked
    // *and* paginated: a heavily trained lift's sessions can exceed the row cap.
    // target_rir comes along for doc 21: the fallback half of `assumedRir`
    // (§2 — an unreported set is not a set taken to failure) and the slot half
    // of the §6.2 back-off comparison against the week's own RIR.
    selectAllForIds<{
      id: string;
      workout_id: string;
      position: number;
      target_rir: number | null;
    }>(
      workoutIds,
      (c, from, to) =>
        supabase
          .from("workout_exercises")
          .select("id, workout_id, position, target_rir")
          .in("workout_id", c)
          .order("workout_id")
          .order("position")
          .order("id")
          .range(from, to),
    ),
  ]);
  const macroIds = [...new Set(mesos.map((m) => m.macrocycle_id).filter((id): id is string => id != null))];
  // day labels keyed on (mesocycle, day_number) — meso_days carries the label.
  const dayByWorkout = new Map(workouts.map((w) => [w.id, w.day_number]));
  const [macros, mesoDays] = await Promise.all([
    selectInChunks<{ id: string; goal_type: string }>(macroIds, (c) =>
      supabase.from("macrocycles").select("id, goal_type").in("id", c),
    ),
    selectInChunks<{ mesocycle_id: string; day_number: number; label: string | null }>(
      mesoIds,
      (c) =>
        supabase
          .from("meso_days")
          .select("mesocycle_id, day_number, label")
          .in("mesocycle_id", c),
    ),
  ]);

  const targetRirByMicro = new Map(micros.map((m) => [m.id, m.target_rir]));
  const mesoById = new Map(mesos.map((m) => [m.id, m]));
  const goalByMacro = new Map(macros.map((m) => [m.id, m.goal_type]));
  const labelByMesoDay = new Map(
    mesoDays.map((d) => [`${d.mesocycle_id}:${d.day_number}`, d.label]),
  );

  // rank each session's exercise slots by position → a 1-based ordinal per
  // workout_exercise, and the session's exercise count (the ordinal denominator).
  const slotsByWorkout = new Map<string, { id: string; position: number }[]>();
  for (const s of slotPositions) {
    const cur = slotsByWorkout.get(s.workout_id) ?? [];
    cur.push({ id: s.id, position: s.position });
    slotsByWorkout.set(s.workout_id, cur);
  }
  const slotRirByWe = new Map(slotPositions.map((s) => [s.id, s.target_rir]));
  const ordinalByWe = new Map<string, number>();
  const sizeByWorkout = new Map<string, number>();
  for (const [wid, slots] of slotsByWorkout) {
    const ranked = [...slots].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    sizeByWorkout.set(wid, ranked.length);
    ranked.forEach((slot, i) => ordinalByWe.set(slot.id, i + 1));
  }

  // group by workout (one session), preserving the performed order
  const byWorkout = new Map<
    string,
    { sets: SessionSet[]; first: (typeof sets)[number]; backedOff: boolean }
  >();
  for (const s of sets) {
    // doc 21 §2, the one resolution rule: the athlete's report when there is
    // one, otherwise what the slot prescribed. Passing `rir_reported` raw here
    // was the last live corner of N71 — an unreported set read as taken to
    // failure, which quietly inflated this series' e1RM against the stamp's.
    const set = {
      weight: s.weight,
      reps: s.reps,
      rir: assumedRir(s.rir_reported, slotRirByWe.get(s.workout_exercise_id)),
    };
    // §6.2: the movement can occupy two slots in one day, so the session is
    // backed off if ANY of them was authored above the week's RIR
    const backedOff = isBackedOffSlot(
      slotRirByWe.get(s.workout_exercise_id),
      targetRirByMicro.get(s.microcycle_id),
    );
    const cur = byWorkout.get(s.workout_id);
    if (!cur) byWorkout.set(s.workout_id, { sets: [set], first: s, backedOff });
    else {
      cur.sets.push(set);
      cur.backedOff ||= backedOff;
    }
  }

  const out: ExerciseSession[] = [];
  for (const { sets: workoutSets, first, backedOff } of byWorkout.values()) {
    const pick = pickSessionE1rm(workoutSets, params);
    const meso = mesoById.get(first.mesocycle_id);
    const goal =
      meso?.macrocycle_id != null ? (goalByMacro.get(meso.macrocycle_id) ?? "unknown") : "unknown";
    const dayNumber = dayByWorkout.get(first.workout_id) ?? null;
    out.push({
      performed_on: first.performed_at.slice(0, 10),
      mesocycle_id: first.mesocycle_id,
      meso_name: meso?.name ?? "",
      goal_type: goal,
      target_rir: targetRirByMicro.get(first.microcycle_id) ?? null,
      backed_off: backedOff,
      e1rm: pick?.value ?? null,
      confidence: pick?.confidence ?? null,
      top_weight: pick?.top_weight ?? null,
      top_reps: pick?.top_reps ?? null,
      top_rir: pick?.top_rir ?? null,
      working_sets: workoutSets.length,
      day_number: dayNumber,
      day_label:
        dayNumber != null
          ? (labelByMesoDay.get(`${first.mesocycle_id}:${dayNumber}`) ?? null)
          : null,
      session_position: ordinalByWe.get(first.workout_exercise_id) ?? null,
      session_size: sizeByWorkout.get(first.workout_id) ?? null,
    });
  }
  // performed_at order is preserved by insertion (sets came back sorted)
  return out.sort((a, b) => a.performed_on.localeCompare(b.performed_on));
}
