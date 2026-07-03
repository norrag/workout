import type { SupabaseClient } from "@supabase/supabase-js";
import { toEngineLoadType } from "@/lib/engine";
import type {
  Database,
  EquipmentType,
  ExcludedExerciseRow,
  ExerciseNoteRow,
  ExerciseRow,
  VExerciseOverviewRow,
} from "@/lib/types/database";

type Client = SupabaseClient<Database>;

export interface ExerciseWithMuscles extends ExerciseRow {
  muscles: { id: string; name: string; role: "primary" | "secondary" }[];
}

/** Stock + own custom exercises (RLS enforces visibility). */
export async function listExercises(
  supabase: Client,
  opts: { search?: string; equipment?: EquipmentType } = {},
): Promise<ExerciseWithMuscles[]> {
  let query = supabase.from("exercises").select("*").order("name");
  if (opts.search) query = query.ilike("name", `%${opts.search}%`);
  if (opts.equipment) query = query.eq("equipment_type", opts.equipment);
  const { data: exercises, error } = await query;
  if (error) throw error;
  if (!exercises || exercises.length === 0) return [];

  // Whole-library page: do NOT `.in()` on the id list — 330+ UUIDs make a
  // ~12 kB query string, which the local stack's gateway rejects with a 414
  // (hosted merely tolerates it). RLS already scopes the link table to
  // stock + own rows; fetch it all and join in memory.
  const idSet = new Set(exercises.map((e) => e.id));
  const [{ data: links, error: linkError }, { data: groups, error: mgError }] =
    await Promise.all([
      supabase.from("exercise_muscle_groups").select("*"),
      supabase.from("muscle_groups").select("*"),
    ]);
  if (linkError) throw linkError;
  if (mgError) throw mgError;

  const groupById = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const visibleLinks = (links ?? []).filter((l) => idSet.has(l.exercise_id));
  return exercises.map((e) => ({
    ...e,
    muscles: visibleLinks
      .filter((l) => l.exercise_id === e.id)
      .map((l) => ({
        id: l.muscle_group_id,
        name: groupById.get(l.muscle_group_id) ?? "",
        role: l.role,
      })),
  }));
}

/**
 * Muscle-group *ids* + roles for a set of exercises, keyed by exercise id —
 * the id-keyed sibling of `getMusclesForExercises` for callers that aggregate
 * by muscle_group_id (the engine's weekly-set ceiling input, R14 fractional
 * counting). RLS gates visibility on the anon/user client; the progression
 * paths call it on the service client with explicit user scoping upstream.
 */
export async function getMuscleRoleIdsForExercises(
  supabase: Client,
  exerciseIds: string[],
): Promise<Map<string, { muscleGroupId: string; role: "primary" | "secondary" }[]>> {
  const map = new Map<
    string,
    { muscleGroupId: string; role: "primary" | "secondary" }[]
  >();
  const ids = [...new Set(exerciseIds)];
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("exercise_muscle_groups")
    .select("exercise_id, muscle_group_id, role")
    .in("exercise_id", ids);
  if (error) throw error;
  for (const l of data ?? []) {
    const arr = map.get(l.exercise_id) ?? [];
    arr.push({ muscleGroupId: l.muscle_group_id, role: l.role });
    map.set(l.exercise_id, arr);
  }
  return map;
}

/**
 * Muscle roles (name + primary/secondary) for a set of exercises, keyed by
 * exercise id. Powers the connector's per-day PPL classification (12 §2) —
 * fractional 1.0/0.5 volume counting needs each exercise's own roles, not just
 * the planner group's assigned muscle. RLS gates visibility; no service role.
 */
export async function getMusclesForExercises(
  supabase: Client,
  exerciseIds: string[],
): Promise<Map<string, { name: string; role: "primary" | "secondary" }[]>> {
  const map = new Map<string, { name: string; role: "primary" | "secondary" }[]>();
  const ids = [...new Set(exerciseIds)];
  if (ids.length === 0) return map;
  const [{ data: links, error: linkError }, { data: groups, error: mgError }] =
    await Promise.all([
      supabase
        .from("exercise_muscle_groups")
        .select("exercise_id, muscle_group_id, role")
        .in("exercise_id", ids),
      supabase.from("muscle_groups").select("id, name"),
    ]);
  if (linkError) throw linkError;
  if (mgError) throw mgError;
  const nameById = new Map((groups ?? []).map((g) => [g.id, g.name]));
  for (const l of links ?? []) {
    const arr = map.get(l.exercise_id) ?? [];
    arr.push({ name: nameById.get(l.muscle_group_id) ?? "", role: l.role });
    map.set(l.exercise_id, arr);
  }
  return map;
}

/**
 * Collapse duplicate muscle-group entries to one row per group (R12) — a
 * duplicated group used to hit the unique constraint AFTER the exercise row
 * insert, stranding an orphan exercise with no muscles. First occurrence wins,
 * except a `primary` role always beats a `secondary` for the same group.
 */
export function dedupeMuscleRoles(
  muscleGroups: { muscle_group_id: string; role: "primary" | "secondary" }[],
): { muscle_group_id: string; role: "primary" | "secondary" }[] {
  const byGroup = new Map<string, "primary" | "secondary">();
  for (const mg of muscleGroups) {
    const existing = byGroup.get(mg.muscle_group_id);
    if (existing === undefined || (existing === "secondary" && mg.role === "primary")) {
      byGroup.set(mg.muscle_group_id, mg.role);
    }
  }
  return [...byGroup].map(([muscle_group_id, role]) => ({ muscle_group_id, role }));
}

export async function createCustomExercise(
  supabase: Client,
  userId: string,
  input: {
    name: string;
    equipment_type: EquipmentType;
    description?: string | null;
    notes?: string | null;
    muscle_groups: { muscle_group_id: string; role: "primary" | "secondary" }[];
  },
): Promise<ExerciseRow> {
  const { data, error } = await supabase
    .from("exercises")
    .insert({
      user_id: userId,
      name: input.name,
      equipment_type: input.equipment_type,
      // derive how entered weight maps to effective load (R12) — without this
      // the column default ('external') gave custom bodyweight exercises wrong
      // e1RM/effective-load math forever (coerceLoadType prefers a stored value)
      load_type: toEngineLoadType(input.equipment_type),
      description: input.description ?? null,
      notes: input.notes ?? null,
      video_url: null,
      source_exercise_id: null,
    })
    .select()
    .single();
  if (error) throw error;

  const muscleGroups = dedupeMuscleRoles(input.muscle_groups);
  if (muscleGroups.length > 0) {
    const { error: mgError } = await supabase
      .from("exercise_muscle_groups")
      .insert(
        muscleGroups.map((mg) => ({
          exercise_id: data.id,
          muscle_group_id: mg.muscle_group_id,
          role: mg.role,
        })),
      );
    if (mgError) {
      // don't strand an orphan exercise with no muscles — remove the row the
      // failed link insert was for (best-effort; the row is muscle-less either way)
      await supabase.from("exercises").delete().eq("id", data.id);
      throw mgError;
    }
  }
  return data;
}

// ---------------------------------------------------------------------------
// delete a custom exercise (MCP undo for create_custom_exercise, §5.8). Only a
// user-owned (custom) exercise can be deleted, and never one with logged sets —
// deleting a movement that has logged history would rewrite the past, which the
// hard rules forbid (the review's editor note). A movement still referenced by
// a planned meso or a generated workout is also refused (those FKs are NO
// ACTION and would error anyway) so the tool returns a clean reason instead.
// `exercise_muscle_groups` cascade-deletes with the row. RLS `exercises_delete_own`.
// ---------------------------------------------------------------------------

export interface ExerciseDeletionImpact {
  found: boolean;
  /** false for stock library exercises (user_id is null) — never deletable */
  isCustom: boolean;
  loggedSets: number;
  plannedRefs: number;
  workoutRefs: number;
  /** safe to delete: custom, no logged history, no plan/workout references */
  deletable: boolean;
}

export async function getExerciseDeletionImpact(
  supabase: Client,
  userId: string,
  exerciseId: string,
): Promise<ExerciseDeletionImpact> {
  const { data: exercise, error: exError } = await supabase
    .from("exercises")
    .select("id, user_id")
    .eq("id", exerciseId)
    .maybeSingle();
  if (exError) throw exError;
  if (!exercise)
    return { found: false, isCustom: false, loggedSets: 0, plannedRefs: 0, workoutRefs: 0, deletable: false };

  const isCustom = exercise.user_id === userId;
  if (!isCustom)
    return { found: true, isCustom: false, loggedSets: 0, plannedRefs: 0, workoutRefs: 0, deletable: false };

  const [logged, planned, workout] = await Promise.all([
    supabase
      .from("logged_sets")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("exercise_id", exerciseId),
    supabase
      .from("meso_exercises")
      .select("*", { count: "exact", head: true })
      .eq("exercise_id", exerciseId),
    supabase
      .from("workout_exercises")
      .select("*", { count: "exact", head: true })
      .eq("exercise_id", exerciseId),
  ]);
  if (logged.error) throw logged.error;
  if (planned.error) throw planned.error;
  if (workout.error) throw workout.error;

  const loggedSets = logged.count ?? 0;
  const plannedRefs = planned.count ?? 0;
  const workoutRefs = workout.count ?? 0;
  return {
    found: true,
    isCustom: true,
    loggedSets,
    plannedRefs,
    workoutRefs,
    deletable: loggedSets === 0 && plannedRefs === 0 && workoutRefs === 0,
  };
}

export async function deleteCustomExercise(
  supabase: Client,
  userId: string,
  exerciseId: string,
): Promise<void> {
  const { error } = await supabase
    .from("exercises")
    .delete()
    .eq("id", exerciseId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function listMuscleGroups(supabase: Client) {
  const { data, error } = await supabase
    .from("muscle_groups")
    .select("*")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/** The subset of the given exercise ids that do NOT exist / aren't visible to
 *  the caller (RLS-scoped). Validation input for the MCP plan-authoring tools
 *  (R3): reject unknown ids up front instead of failing mid-save. */
export async function findUnknownExerciseIds(
  supabase: Client,
  ids: string[],
): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const { data, error } = await supabase
    .from("exercises")
    .select("id")
    .in("id", unique);
  if (error) throw error;
  const known = new Set((data ?? []).map((e) => e.id));
  return unique.filter((id) => !known.has(id));
}

// ---------------------------------------------------------------------------
// exercise page overview (fig 3.1a) — lifetime aggregates from
// v_exercise_overview + the est-1RM-across-the-current-macro bars (one
// definition of progress, computed like the meso-stats macro chart)
// ---------------------------------------------------------------------------

export interface ExerciseMacroBar {
  /** M1…Mn position in the macro */
  label: string;
  e1rm: number | null;
  state: "past" | "current" | "future";
}

/**
 * Bars of peak e1RM per meso across a macro: the meso the exercise was most
 * recently trained in is `current`, mesos with logged work are `past`, and
 * mesos with no logged work for this lift are `future` (dashed). Pure.
 */
export function buildExerciseMacroBars(
  orderedMesoIds: string[],
  currentMesoId: string | null,
  e1rmByMeso: Map<string, number>,
): ExerciseMacroBar[] {
  const currentIdx = currentMesoId ? orderedMesoIds.indexOf(currentMesoId) : -1;
  return orderedMesoIds.map((id, i) => {
    const e1rm = e1rmByMeso.get(id) ?? null;
    const state: ExerciseMacroBar["state"] =
      i === currentIdx ? "current" : e1rm != null ? "past" : "future";
    return { label: `M${i + 1}`, e1rm: e1rm != null ? Math.round(e1rm) : null, state };
  });
}

export interface ExerciseOverview {
  overview: VExerciseOverviewRow | null;
  /** W·D of the most recent session, e.g. "W2·D2" */
  lastCoordinate: string | null;
  macroName: string | null;
  /** e.g. "M2 TO DATE" — the exercise's current position in that macro */
  macroPosition: string | null;
  macroBars: ExerciseMacroBar[];
}

export async function getExerciseOverview(
  supabase: Client,
  userId: string,
  exerciseId: string,
): Promise<ExerciseOverview> {
  const [
    { data: overview, error: ovError },
    { data: hist, error: histError },
  ] = await Promise.all([
    supabase
      .from("v_exercise_overview")
      .select("*")
      .eq("user_id", userId)
      .eq("exercise_id", exerciseId)
      .maybeSingle(),
    supabase
      .from("v_exercise_history")
      .select("mesocycle_id, microcycle_id, workout_id, performed_on, e1rm")
      .eq("user_id", userId)
      .eq("exercise_id", exerciseId)
      .order("performed_on", { ascending: false }),
  ]);
  if (ovError) throw ovError;
  if (histError) throw histError;

  const result: ExerciseOverview = {
    overview: overview ?? null,
    lastCoordinate: null,
    macroName: null,
    macroPosition: null,
    macroBars: [],
  };
  if (!hist || hist.length === 0) return result;

  const latest = hist[0];
  const [{ data: micro }, { data: workout }, { data: latestMeso }] =
    await Promise.all([
      supabase
        .from("microcycles")
        .select("week_number")
        .eq("id", latest.microcycle_id)
        .maybeSingle(),
      supabase
        .from("workouts")
        .select("day_number")
        .eq("id", latest.workout_id)
        .maybeSingle(),
      supabase
        .from("mesocycles")
        .select("id, macrocycle_id")
        .eq("id", latest.mesocycle_id)
        .maybeSingle(),
    ]);
  if (micro && workout)
    result.lastCoordinate = `W${micro.week_number}·D${workout.day_number}`;

  if (latestMeso?.macrocycle_id) {
    const [{ data: macro }, { data: macroMesos }] = await Promise.all([
      supabase
        .from("macrocycles")
        .select("name")
        .eq("id", latestMeso.macrocycle_id)
        .maybeSingle(),
      supabase
        .from("mesocycles")
        .select("id")
        .eq("macrocycle_id", latestMeso.macrocycle_id)
        .order("position", { ascending: true, nullsFirst: false })
        .order("created_at"),
    ]);
    result.macroName = macro?.name ?? null;
    const orderedIds = (macroMesos ?? []).map((m) => m.id);
    const e1rmByMeso = new Map<string, number>();
    for (const row of hist) {
      if (row.e1rm == null) continue;
      const prev = e1rmByMeso.get(row.mesocycle_id);
      if (prev == null || row.e1rm > prev)
        e1rmByMeso.set(row.mesocycle_id, row.e1rm);
    }
    result.macroBars = buildExerciseMacroBars(
      orderedIds,
      latestMeso.id,
      e1rmByMeso,
    );
    const curIdx = orderedIds.indexOf(latestMeso.id);
    if (curIdx >= 0) result.macroPosition = `M${curIdx + 1} TO DATE`;
  }

  return result;
}

// ---------------------------------------------------------------------------
// exclusions (fig 4.5) — excluded exercises never appear in pickers
// ---------------------------------------------------------------------------

export interface ExclusionWithExercise extends ExcludedExerciseRow {
  exercise_name: string;
}

export async function listExclusions(
  supabase: Client,
  userId: string,
): Promise<ExclusionWithExercise[]> {
  const { data, error } = await supabase
    .from("excluded_exercises")
    .select("*")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const { data: exercises, error: exError } = await supabase
    .from("exercises")
    .select("id, name")
    .in(
      "id",
      data.map((x) => x.exercise_id),
    );
  if (exError) throw exError;
  const nameById = new Map((exercises ?? []).map((e) => [e.id, e.name]));
  return data.map((x) => ({
    ...x,
    exercise_name: nameById.get(x.exercise_id) ?? "",
  }));
}

export async function addExclusion(
  supabase: Client,
  userId: string,
  exerciseId: string,
  reason: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("excluded_exercises")
    .upsert(
      { user_id: userId, exercise_id: exerciseId, reason },
      { onConflict: "user_id,exercise_id" },
    );
  if (error) throw error;
}

export async function removeExclusion(
  supabase: Client,
  userId: string,
  exclusionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("excluded_exercises")
    .delete()
    .eq("id", exclusionId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** Remove an exclusion addressed by exercise (the MCP knows exercise ids, not
 * exclusion-row ids). No-op if the exercise isn't excluded. */
export async function removeExclusionByExercise(
  supabase: Client,
  userId: string,
  exerciseId: string,
): Promise<void> {
  const { error } = await supabase
    .from("excluded_exercises")
    .delete()
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// pinned notes (figs 1.1/1.2)
// ---------------------------------------------------------------------------

export async function listPinnedNotes(
  supabase: Client,
  userId: string,
  exerciseIds: string[],
): Promise<ExerciseNoteRow[]> {
  if (exerciseIds.length === 0) return [];
  const { data, error } = await supabase
    .from("exercise_notes")
    .select("*")
    .eq("user_id", userId)
    .eq("is_pinned", true)
    .in("exercise_id", exerciseIds)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface PinnedNoteWithExercise extends ExerciseNoteRow {
  exercise_name: string;
}

/** Every pinned note the user holds, with exercise names (MCP get_exercise_notes). */
export async function listAllPinnedNotes(
  supabase: Client,
  userId: string,
): Promise<PinnedNoteWithExercise[]> {
  const { data, error } = await supabase
    .from("exercise_notes")
    .select("*")
    .eq("user_id", userId)
    .eq("is_pinned", true)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const { data: exercises, error: exError } = await supabase
    .from("exercises")
    .select("id, name")
    .in(
      "id",
      data.map((n) => n.exercise_id),
    );
  if (exError) throw exError;
  const nameById = new Map((exercises ?? []).map((e) => [e.id, e.name]));
  return data.map((n) => ({
    ...n,
    exercise_name: nameById.get(n.exercise_id) ?? "",
  }));
}

// ---------------------------------------------------------------------------
// exercise picker (fig 2.6) — pre-filtered to a muscle group, exclusions
// removed, with last-performed data
// ---------------------------------------------------------------------------

export interface PickerExercise extends ExerciseRow {
  last_performed_at: string | null;
  best_weight: number | null;
  best_reps: number | null;
}

export interface AddExerciseCandidate {
  id: string;
  name: string;
  equipment_type: string;
  muscle_group_ids: string[];
  last_performed_at: string | null;
}

/** Full picker dataset for the workout "Add exercise" sheet — every visible
 *  exercise with its muscle groups + equipment (for open filters), exclusions
 *  removed, plus the muscle-group list for the filter dropdown. */
export async function getAddExerciseCandidates(
  supabase: Client,
  userId: string,
): Promise<{
  exercises: AddExerciseCandidate[];
  muscleGroups: { id: string; name: string }[];
}> {
  const [
    { data: exercises, error: exError },
    { data: links, error: linkError },
    { data: muscleGroups, error: mgError },
    { data: exclusions, error: exclError },
    { data: prs, error: prError },
  ] = await Promise.all([
    supabase.from("exercises").select("id, name, equipment_type").order("name"),
    supabase.from("exercise_muscle_groups").select("exercise_id, muscle_group_id"),
    supabase.from("muscle_groups").select("id, name").order("name"),
    supabase
      .from("excluded_exercises")
      .select("exercise_id")
      .eq("user_id", userId),
    supabase
      .from("v_exercise_prs")
      .select("exercise_id, last_performed_at")
      .eq("user_id", userId),
  ]);
  if (exError) throw exError;
  if (linkError) throw linkError;
  if (mgError) throw mgError;
  if (exclError) throw exclError;
  if (prError) throw prError;

  const excluded = new Set((exclusions ?? []).map((x) => x.exercise_id));
  const mgByExercise = new Map<string, string[]>();
  for (const l of links ?? []) {
    const arr = mgByExercise.get(l.exercise_id) ?? [];
    arr.push(l.muscle_group_id);
    mgByExercise.set(l.exercise_id, arr);
  }
  const lastById = new Map(
    (prs ?? []).map((p) => [p.exercise_id, p.last_performed_at]),
  );

  return {
    exercises: (exercises ?? [])
      .filter((e) => !excluded.has(e.id))
      .map((e) => ({
        id: e.id,
        name: e.name,
        equipment_type: e.equipment_type,
        muscle_group_ids: mgByExercise.get(e.id) ?? [],
        last_performed_at: lastById.get(e.id) ?? null,
      })),
    muscleGroups: muscleGroups ?? [],
  };
}

export async function listPickerExercises(
  supabase: Client,
  userId: string,
  opts: { muscleGroupId?: string; search?: string } = {},
): Promise<PickerExercise[]> {
  let exerciseIds: string[] | null = null;
  if (opts.muscleGroupId) {
    const { data: links, error: linkError } = await supabase
      .from("exercise_muscle_groups")
      .select("exercise_id")
      .eq("muscle_group_id", opts.muscleGroupId);
    if (linkError) throw linkError;
    exerciseIds = (links ?? []).map((l) => l.exercise_id);
    if (exerciseIds.length === 0) return [];
  }

  let query = supabase.from("exercises").select("*").order("name");
  if (exerciseIds) query = query.in("id", exerciseIds);
  if (opts.search) query = query.ilike("name", `%${opts.search}%`);
  const { data: exercises, error } = await query;
  if (error) throw error;
  if (!exercises || exercises.length === 0) return [];

  const [{ data: exclusions, error: exclError }, { data: prs, error: prError }] =
    await Promise.all([
      supabase
        .from("excluded_exercises")
        .select("exercise_id")
        .eq("user_id", userId),
      supabase.from("v_exercise_prs").select("*").eq("user_id", userId),
    ]);
  if (exclError) throw exclError;
  if (prError) throw prError;

  const excluded = new Set((exclusions ?? []).map((x) => x.exercise_id));
  const prById = new Map((prs ?? []).map((p) => [p.exercise_id, p]));

  return exercises
    .filter((e) => !excluded.has(e.id))
    .map((e) => {
      const pr = prById.get(e.id);
      return {
        ...e,
        last_performed_at: pr?.last_performed_at ?? null,
        best_weight: pr?.best_weight ?? null,
        best_reps: pr?.best_reps ?? null,
      };
    });
}
