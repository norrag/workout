import type { SupabaseClient } from "@supabase/supabase-js";
import {
  engineParamsSchema,
  rirRamp,
  seedMeso,
  type EngineParams,
} from "@/lib/engine";
import type { Database, ProfileRow } from "@/lib/types/database";
import { getMesoPlan } from "./cycles";

type Client = SupabaseClient<Database>;

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

    let position = 1;
    const rows = day.groups.flatMap((group) =>
      group.fills.map((fill) => {
        const equipment = equipmentById.get(fill.exercise_id) ?? "other";
        const pr = prById.get(fill.exercise_id);
        const seeded = seedMeso(
          pr?.best_weight != null
            ? {
                weight: pr.best_weight,
                reps: pr.best_reps,
                sets: fill.initial_sets,
              }
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
          meso.rir_start,
          params,
        );
        return {
          workout_id: workout.id,
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
