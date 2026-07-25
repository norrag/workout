import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

/**
 * One exercise order, two surfaces (N64).
 *
 * A meso's exercise order lives in two places: the **planner board**
 * (`meso_exercises.position` — what the cycles view and every copy/share path
 * read) and the **generated sessions** (`workout_exercises.position` — what the
 * day view reads). They are written by different flows:
 *
 * - the planner board / MCP `edit_mesocycle` write the plan, then reconcile the
 *   open workouts (`regenerateOpenWorkouts`);
 * - the day view's move-up/down, replace and add write the workout (and carry
 *   forward to later weeks), and used to leave the plan untouched.
 *
 * So either side could drift from the other, and because sharing/duplication
 * copy the **plan**, a day-view reorder or substitution never reached the
 * person you shared with. This module is the single definition that keeps the
 * two in step, in both directions:
 *
 * - `applyPlanOrderToWorkout` — plan → session (called after a plan edit is
 *   merged into an open workout);
 * - `syncPlanOrderFromWorkout` / `syncPlanSubstitution` /
 *   `syncPlanAddedExercises` — session → plan (called by the day-view edits
 *   that are meant to outlive the session: a reorder, which always carries
 *   forward, and a replace/add with "repeat this change on this day in future
 *   weeks" ticked).
 *
 * Everything here is best-effort *structure*: no prescribed number is written,
 * no logged history is touched, and a workout whose plan day no longer exists
 * (or whose meso is no longer editable) is simply left alone.
 */

/** Pure: order a target list to match a source exercise order (by exercise_id).
 *  Targets not present in the source keep their relative order at the end. */
export function reorderToMatch<T extends { exercise_id: string }>(
  targets: T[],
  sourceExerciseOrder: string[],
): T[] {
  const order = new Map<string, number>();
  sourceExerciseOrder.forEach((id, i) => {
    if (!order.has(id)) order.set(id, i);
  });
  return targets
    .map((t, idx) => ({
      t,
      key: order.get(t.exercise_id) ?? Number.MAX_SAFE_INTEGER,
      idx,
    }))
    .sort((a, b) => a.key - b.key || a.idx - b.idx)
    .map((x) => x.t);
}

/** Pure: a planned day's exercise ids in flat day order (across groups) —
 *  `meso_exercises.position` is the day-level order; group position then
 *  group-local slot break ties for legacy rows where position mirrored the
 *  slot. Mirrors `buildDayExerciseRows` (generation.ts) exactly. */
export function planDayExerciseOrder(
  groups: {
    position: number;
    fills: { exercise_id: string; position: number; slot_number: number | null }[];
  }[],
): string[] {
  return groups
    .flatMap((group) => group.fills.map((fill) => ({ group, fill })))
    .sort(
      (a, b) =>
        a.fill.position - b.fill.position ||
        a.group.position - b.group.position ||
        (a.fill.slot_number ?? 0) - (b.fill.slot_number ?? 0),
    )
    .map((x) => x.fill.exercise_id);
}

/** The planner-board day behind a generated workout, when the meso's plan is
 *  still editable (planned/active). Null when there's no matching plan day —
 *  a removed day, a completed/abandoned meso — in which case every write-back
 *  here no-ops. */
export async function planDayForWorkout(
  supabase: Client,
  workoutId: string,
): Promise<{ mesocycleId: string; dayId: string } | null> {
  const { data: workout, error: wErr } = await supabase
    .from("workouts")
    .select("id, microcycle_id, day_number")
    .eq("id", workoutId)
    .maybeSingle();
  if (wErr) throw wErr;
  if (!workout) return null;

  const { data: micro, error: mErr } = await supabase
    .from("microcycles")
    .select("id, mesocycle_id")
    .eq("id", workout.microcycle_id)
    .maybeSingle();
  if (mErr) throw mErr;
  if (!micro) return null;

  const { data: meso, error: mesoErr } = await supabase
    .from("mesocycles")
    .select("id, status")
    .eq("id", micro.mesocycle_id)
    .maybeSingle();
  if (mesoErr) throw mesoErr;
  // a completed/abandoned meso's plan is a historical record — never rewritten
  if (!meso || (meso.status !== "active" && meso.status !== "planned")) return null;

  const { data: day, error: dErr } = await supabase
    .from("meso_days")
    .select("id")
    .eq("mesocycle_id", micro.mesocycle_id)
    .eq("day_number", workout.day_number)
    .maybeSingle();
  if (dErr) throw dErr;
  if (!day) return null;

  return { mesocycleId: micro.mesocycle_id, dayId: day.id };
}

interface PlanFill {
  id: string;
  exercise_id: string;
  position: number;
  slot_number: number | null;
  meso_day_group_id: string | null;
}

interface PlanGroup {
  id: string;
  muscle_group_id: string;
  position: number;
  exercise_slots: number;
  fills: PlanFill[];
}

/** The plan day's groups (position order) with their fills. */
async function planDayGroups(
  supabase: Client,
  dayId: string,
): Promise<PlanGroup[]> {
  const { data: groups, error: gErr } = await supabase
    .from("meso_day_groups")
    .select("id, muscle_group_id, position, exercise_slots")
    .eq("meso_day_id", dayId)
    .order("position");
  if (gErr) throw gErr;
  const groupIds = (groups ?? []).map((g) => g.id);
  if (groupIds.length === 0) return [];

  const { data: fills, error: fErr } = await supabase
    .from("meso_exercises")
    .select("id, exercise_id, position, slot_number, meso_day_group_id")
    .in("meso_day_group_id", groupIds)
    .order("position")
    .order("slot_number");
  if (fErr) throw fErr;

  return (groups ?? []).map((g) => ({
    ...g,
    fills: (fills ?? []).filter((f) => f.meso_day_group_id === g.id),
  }));
}

/** The workout's exercise ids in day-view order. */
async function workoutExerciseOrder(
  supabase: Client,
  workoutId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("workout_exercises")
    .select("exercise_id, position")
    .eq("workout_id", workoutId)
    .order("position", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map((w) => w.exercise_id);
}

/**
 * Plan → session: renumber a workout's exercises to the plan day's flat order.
 * Rows the plan no longer lists (kept because they carry logged sets) hold
 * their relative order at the end. Only rows whose position actually changes
 * are written; `workout_exercises.position` has no unique constraint, so a
 * straight rewrite needs no temp-value dance.
 */
export async function applyPlanOrderToWorkout(
  supabase: Client,
  workoutId: string,
  planExerciseIds: string[],
): Promise<void> {
  if (planExerciseIds.length === 0) return;
  const { data: wes, error } = await supabase
    .from("workout_exercises")
    .select("id, exercise_id, position")
    .eq("workout_id", workoutId)
    .order("position", { ascending: true, nullsFirst: false });
  if (error) throw error;
  const ranked = reorderToMatch(wes ?? [], planExerciseIds);
  for (let i = 0; i < ranked.length; i++) {
    if (ranked[i].position === i + 1) continue;
    const { error: updErr } = await supabase
      .from("workout_exercises")
      .update({ position: i + 1 })
      .eq("id", ranked[i].id);
    if (updErr) throw updErr;
  }
}

/**
 * Session → plan: rewrite the plan day's flat `meso_exercises.position` to the
 * workout's current exercise order. Planned fills the workout doesn't hold
 * (an exercise removed from this session only) keep their relative order at the
 * end, so a week-local removal never reshuffles the plan.
 */
export async function syncPlanOrderFromWorkout(
  supabase: Client,
  workoutId: string,
): Promise<void> {
  const planDay = await planDayForWorkout(supabase, workoutId);
  if (!planDay) return;
  const groups = await planDayGroups(supabase, planDay.dayId);
  const fills = groups.flatMap((g) => g.fills);
  if (fills.length === 0) return;

  const order = await workoutExerciseOrder(supabase, workoutId);
  // keep the existing flat plan order as the tie-break for fills the workout
  // doesn't carry, not the group-clustered read order
  const current = [...fills].sort(
    (a, b) => a.position - b.position || (a.slot_number ?? 0) - (b.slot_number ?? 0),
  );
  const ranked = reorderToMatch(current, order);
  for (let i = 0; i < ranked.length; i++) {
    if (ranked[i].position === i + 1) continue;
    const { error } = await supabase
      .from("meso_exercises")
      .update({ position: i + 1 })
      .eq("id", ranked[i].id);
    if (error) throw error;
  }
}

/**
 * Session → plan: carry a day-view substitution into the plan (the "repeat
 * this change on this day in future weeks" path — the same intent that
 * propagates the swap to later weeks). No-op when the plan day doesn't hold
 * the outgoing exercise, or already holds the incoming one.
 */
export async function syncPlanSubstitution(
  supabase: Client,
  workoutId: string,
  oldExerciseId: string,
  newExerciseId: string,
): Promise<void> {
  if (oldExerciseId === newExerciseId) return;
  const planDay = await planDayForWorkout(supabase, workoutId);
  if (!planDay) return;
  const fills = (await planDayGroups(supabase, planDay.dayId)).flatMap(
    (g) => g.fills,
  );
  if (fills.some((f) => f.exercise_id === newExerciseId)) return;
  const target = fills.find((f) => f.exercise_id === oldExerciseId);
  if (!target) return;

  const { error } = await supabase
    .from("meso_exercises")
    .update({ exercise_id: newExerciseId })
    .eq("id", target.id);
  if (error) throw error;
}

/**
 * Session → plan: carry day-view additions into the plan (the "repeat this
 * change on this day in future weeks" path). Each exercise joins the plan day's
 * block for the muscle group the day view stamped on it, growing that block's
 * slot count; a group that isn't on the day yet is created after the existing
 * ones. Order is settled afterwards by `syncPlanOrderFromWorkout`, so the added
 * fills land exactly where they sit in the session.
 *
 * A block already at the 10-slot ceiling (`meso_day_groups.exercise_slots` /
 * `meso_exercises.slot_number` DB checks) is left alone — the session keeps the
 * exercise, the plan just doesn't grow past what the planner board allows.
 */
export async function syncPlanAddedExercises(
  supabase: Client,
  workoutId: string,
  exerciseIds: string[],
): Promise<void> {
  if (exerciseIds.length === 0) return;
  const planDay = await planDayForWorkout(supabase, workoutId);
  if (!planDay) return;

  // the muscle group each added slot was stamped with in the session — one
  // definition of "which block does this exercise belong to"
  const { data: added, error: addedErr } = await supabase
    .from("workout_exercises")
    .select("exercise_id, muscle_group_id, position, prescribed_sets")
    .eq("workout_id", workoutId)
    .in("exercise_id", exerciseIds)
    .order("position");
  if (addedErr) throw addedErr;

  const groups = await planDayGroups(supabase, planDay.dayId);
  const have = new Set(groups.flatMap((g) => g.fills).map((f) => f.exercise_id));
  let dayMax = Math.max(
    0,
    ...groups.flatMap((g) => g.fills.map((f) => f.position)),
  );
  let groupMax = Math.max(0, ...groups.map((g) => g.position));

  for (const row of added ?? []) {
    if (!row.muscle_group_id || have.has(row.exercise_id)) continue;
    let group = groups.find((g) => g.muscle_group_id === row.muscle_group_id);
    if (!group) {
      const { data: created, error: cErr } = await supabase
        .from("meso_day_groups")
        .insert({
          meso_day_id: planDay.dayId,
          muscle_group_id: row.muscle_group_id,
          position: ++groupMax,
          exercise_slots: 1,
        })
        .select("id, muscle_group_id, position, exercise_slots")
        .single();
      if (cErr) throw cErr;
      group = { ...created, fills: [] };
      groups.push(group);
    }
    const slotNumber = Math.max(0, ...group.fills.map((f) => f.slot_number ?? 0)) + 1;
    if (slotNumber > 10) continue; // planner ceiling — leave the block as it is

    const { data: fill, error: fErr } = await supabase
      .from("meso_exercises")
      .insert({
        mesocycle_id: planDay.mesocycleId,
        day_of_week: null,
        meso_day_group_id: group.id,
        slot_number: slotNumber,
        position: ++dayMax,
        exercise_id: row.exercise_id,
        initial_weight: null,
        initial_reps: null,
        // the session's own set count is the plan's week-1 baseline for the
        // added slot (clamped to the meso_exercises 1..20 check)
        initial_sets: Math.min(Math.max(row.prescribed_sets ?? 3, 1), 20),
      })
      .select("id, exercise_id, position, slot_number, meso_day_group_id")
      .single();
    if (fErr) throw fErr;
    group.fills.push(fill);
    have.add(row.exercise_id);

    if (group.exercise_slots < group.fills.length) {
      const { error: gErr } = await supabase
        .from("meso_day_groups")
        .update({ exercise_slots: group.fills.length })
        .eq("id", group.id);
      if (gErr) throw gErr;
      group.exercise_slots = group.fills.length;
    }
  }
}
