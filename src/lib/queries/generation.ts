import type { SupabaseClient } from "@supabase/supabase-js";
import {
  engineParamsSchema,
  rirRamp,
  seedMeso,
  type EngineParams,
} from "@/lib/engine";
import type { Database, ExerciseRow, ProfileRow } from "@/lib/types/database";
import { getMesoPlan, type PlannedDay } from "./cycles";

type Client = SupabaseClient<Database>;

interface SeedCtx {
  equipmentById: Map<string, ExerciseRow["equipment_type"]>;
  prById: Map<string, { best_weight: number | null; best_reps: number | null }>;
  experienceLevel: ProfileRow["experience_level"];
  units: ProfileRow["units"];
  targetRir: number;
  params: EngineParams;
}

/** Build the seeded `workout_exercises` rows for one planned day's groups/fills
 *  (shared by meso start and the open-workout regeneration on a plan edit). */
function buildDayExerciseRows(workoutId: string, day: PlannedDay, ctx: SeedCtx) {
  let position = 1;
  return day.groups.flatMap((group) =>
    group.fills.map((fill) => {
      const equipment = ctx.equipmentById.get(fill.exercise_id) ?? "other";
      const pr = ctx.prById.get(fill.exercise_id);
      const seeded = seedMeso(
        pr?.best_weight != null
          ? { weight: pr.best_weight, reps: pr.best_reps, sets: fill.initial_sets }
          : null,
        {
          weight: fill.initial_weight,
          reps: fill.initial_reps,
          sets: fill.initial_sets,
        },
        { equipmentType: equipment },
        {
          experienceLevel: ctx.experienceLevel ?? "beginner",
          units: ctx.units,
        },
        ctx.targetRir,
        ctx.params,
      );
      return {
        workout_id: workoutId,
        exercise_id: fill.exercise_id,
        muscle_group_id: group.muscle_group_id,
        position: position++,
        prescribed_weight: seeded.weight,
        prescribed_reps: seeded.reps,
        prescribed_sets: seeded.sets,
        target_rir: seeded.targetRir,
        status: "pending" as const,
        notes: seeded.rationale,
      };
    }),
  );
}

export interface ActiveEngineParams {
  version: number;
  params: EngineParams;
}

export async function getActiveEngineParams(
  supabase: Client,
): Promise<ActiveEngineParams> {
  const { data, error } = await supabase
    .from("engine_params")
    .select("*")
    .eq("is_active", true)
    .single();
  if (error) throw error;
  return { version: data.version, params: engineParamsSchema.parse(data.params) };
}

/**
 * Activate a planned meso: build the full microcycle ramp and the week-1
 * workouts from the planner board (07 Phase 2 — `seedMeso`/`rirRamp`).
 */
export async function startMeso(
  supabase: Client,
  userId: string,
  mesoId: string,
  profile: ProfileRow,
): Promise<{ error: string | null }> {
  const plan = await getMesoPlan(supabase, mesoId);
  if (!plan) return { error: "Mesocycle not found." };
  const { meso, days } = plan;
  if (meso.status !== "planned") return { error: "Mesocycle already started." };
  if (days.length === 0) return { error: "Add at least one day before starting." };
  const hasExercise = days.some((d) =>
    d.groups.some((g) => g.fills.length > 0),
  );
  if (!hasExercise)
    return { error: "Fill at least one exercise slot before starting." };

  const { params } = await getActiveEngineParams(supabase);
  const ramp = rirRamp(
    meso.weeks,
    meso.includes_deload,
    meso.rir_start,
    meso.rir_end,
    params,
  );

  // exercises referenced by the plan, for equipment-aware seeding
  const exerciseIds = [
    ...new Set(days.flatMap((d) => d.groups.flatMap((g) => g.fills.map((f) => f.exercise_id)))),
  ];
  const [{ data: exercises, error: exError }, { data: prs, error: prError }] =
    await Promise.all([
      supabase.from("exercises").select("id, equipment_type").in("id", exerciseIds),
      supabase.from("v_exercise_prs").select("*").eq("user_id", userId),
    ]);
  if (exError) throw exError;
  if (prError) throw prError;
  const equipmentById = new Map(
    (exercises ?? []).map((e) => [e.id, e.equipment_type]),
  );
  const prById = new Map((prs ?? []).map((p) => [p.exercise_id, p]));

  const today = new Date().toISOString().slice(0, 10);

  // microcycles for every week of the ramp; week 1 active
  const { data: micros, error: microError } = await supabase
    .from("microcycles")
    .insert(
      ramp.map((week) => ({
        mesocycle_id: meso.id,
        user_id: userId,
        week_number: week.weekNumber,
        target_rir: week.targetRir,
        is_deload: week.isDeload,
        start_date: week.weekNumber === 1 ? today : null,
        status: week.weekNumber === 1 ? ("active" as const) : ("pending" as const),
      })),
    )
    .select();
  if (microError) throw microError;
  const week1 = (micros ?? []).find((m) => m.week_number === 1);
  if (!week1) return { error: "Failed to create week 1." };

  const seedCtx: SeedCtx = {
    equipmentById,
    prById,
    experienceLevel: profile.experience_level,
    units: profile.units,
    targetRir: meso.rir_start,
    params,
  };

  // week-1 workouts in planner order, seeded per exercise
  for (const day of days) {
    const { data: workout, error: workoutError } = await supabase
      .from("workouts")
      .insert({
        microcycle_id: week1.id,
        user_id: userId,
        day_number: day.day_number,
        scheduled_date: null,
        performed_at: null,
        status: "planned",
        notes: null,
      })
      .select()
      .single();
    if (workoutError) throw workoutError;

    const rows = buildDayExerciseRows(workout.id, day, seedCtx);
    if (rows.length > 0) {
      const { error: weError } = await supabase
        .from("workout_exercises")
        .insert(rows);
      if (weError) throw weError;
    }
  }

  const { error: activateError } = await supabase
    .from("mesocycles")
    .update({ status: "active", start_date: today })
    .eq("id", meso.id);
  if (activateError) throw activateError;

  return { error: null };
}

/**
 * After a plan edit is saved to an **active** meso, bring the open (not-yet-
 * started) workouts in line with the new plan. This is a **structural merge**,
 * not a reseed: completed / in-progress / skipped workouts and all logged sets
 * are never touched, and exercises that survive the edit keep their existing
 * (engine-progressed) prescription. Only added/removed days and added/removed
 * exercises change. Future weeks aren't generated yet, so they pick up the new
 * plan automatically when their generation job runs.
 */
export async function regenerateOpenWorkouts(
  supabase: Client,
  userId: string,
  mesoId: string,
  profile: ProfileRow,
): Promise<void> {
  const plan = await getMesoPlan(supabase, mesoId);
  if (!plan || plan.meso.status !== "active") return;
  const { days } = plan;

  const { params } = await getActiveEngineParams(supabase);
  const exerciseIds = [
    ...new Set(
      days.flatMap((d) => d.groups.flatMap((g) => g.fills.map((f) => f.exercise_id))),
    ),
  ];
  const [{ data: exercises, error: exError }, { data: prs, error: prError }] =
    await Promise.all([
      exerciseIds.length > 0
        ? supabase
            .from("exercises")
            .select("id, equipment_type")
            .in("id", exerciseIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("v_exercise_prs").select("*").eq("user_id", userId),
    ]);
  if (exError) throw exError;
  if (prError) throw prError;
  const equipmentById = new Map(
    (exercises ?? []).map((e) => [e.id, e.equipment_type]),
  );
  const prById = new Map((prs ?? []).map((p) => [p.exercise_id, p]));

  // micros that may already hold generated workouts (the active week, plus any
  // pending week a catch-up generated early). Completed weeks are immutable.
  const { data: micros, error: microError } = await supabase
    .from("microcycles")
    .select("*")
    .eq("mesocycle_id", mesoId)
    .neq("status", "completed");
  if (microError) throw microError;

  const planByDayNumber = new Map(days.map((d) => [d.day_number, d]));

  for (const micro of micros ?? []) {
    const { data: workouts, error: woError } = await supabase
      .from("workouts")
      .select("*")
      .eq("microcycle_id", micro.id);
    if (woError) throw woError;
    if (!workouts || workouts.length === 0) continue; // not generated yet

    const ctx: SeedCtx = {
      equipmentById,
      prById,
      experienceLevel: profile.experience_level,
      units: profile.units,
      targetRir: micro.target_rir,
      params,
    };

    // 1. drop planned workouts whose day was removed from the plan
    for (const w of workouts) {
      if (w.status === "planned" && !planByDayNumber.has(w.day_number)) {
        const { error } = await supabase.from("workouts").delete().eq("id", w.id);
        if (error) throw error;
      }
    }

    // 2. reconcile each plan day against this week's workouts
    for (const day of days) {
      const existing = workouts.find((w) => w.day_number === day.day_number);
      // never touch a workout the user has started or finished
      if (
        existing &&
        (existing.status === "in_progress" ||
          existing.status === "completed" ||
          existing.status === "skipped")
      ) {
        continue;
      }

      const planExerciseIds = day.groups.flatMap((g) =>
        g.fills.map((f) => f.exercise_id),
      );

      if (!existing) {
        // a newly added day → create a fresh planned workout, fully seeded
        const { data: created, error: cErr } = await supabase
          .from("workouts")
          .insert({
            microcycle_id: micro.id,
            user_id: userId,
            day_number: day.day_number,
            scheduled_date: null,
            performed_at: null,
            status: "planned",
            notes: null,
          })
          .select()
          .single();
        if (cErr) throw cErr;
        const rows = buildDayExerciseRows(created.id, day, ctx);
        if (rows.length > 0) {
          const { error } = await supabase.from("workout_exercises").insert(rows);
          if (error) throw error;
        }
        continue;
      }

      // existing planned workout → structural merge of its exercises
      const { data: wes, error: wesError } = await supabase
        .from("workout_exercises")
        .select("id, exercise_id, position")
        .eq("workout_id", existing.id);
      if (wesError) throw wesError;
      const haveIds = new Set((wes ?? []).map((w) => w.exercise_id));
      const planIds = new Set(planExerciseIds);

      // remove exercises no longer in the plan
      const toRemove = (wes ?? []).filter((w) => !planIds.has(w.exercise_id));
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("workout_exercises")
          .delete()
          .in(
            "id",
            toRemove.map((w) => w.id),
          );
        if (error) throw error;
      }

      // add exercises new to the plan, seeded, appended after the max position
      let position = Math.max(0, ...(wes ?? []).map((w) => w.position));
      const newRows = day.groups.flatMap((group) =>
        group.fills
          .filter((f) => !haveIds.has(f.exercise_id))
          .map((fill) => {
            const equipment = equipmentById.get(fill.exercise_id) ?? "other";
            const pr = prById.get(fill.exercise_id);
            const seeded = seedMeso(
              pr?.best_weight != null
                ? { weight: pr.best_weight, reps: pr.best_reps, sets: fill.initial_sets }
                : null,
              {
                weight: fill.initial_weight,
                reps: fill.initial_reps,
                sets: fill.initial_sets,
              },
              { equipmentType: equipment },
              {
                experienceLevel: profile.experience_level ?? "beginner",
                units: profile.units,
              },
              micro.target_rir,
              params,
            );
            return {
              workout_id: existing.id,
              exercise_id: fill.exercise_id,
              muscle_group_id: group.muscle_group_id,
              position: ++position,
              prescribed_weight: seeded.weight,
              prescribed_reps: seeded.reps,
              prescribed_sets: seeded.sets,
              target_rir: seeded.targetRir,
              status: "pending" as const,
              notes: seeded.rationale,
            };
          }),
      );
      if (newRows.length > 0) {
        const { error } = await supabase
          .from("workout_exercises")
          .insert(newRows);
        if (error) throw error;
      }
    }
  }
}
