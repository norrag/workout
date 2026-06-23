import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import {
  engineParamsSchema,
  resolveEffectiveParams,
  rirRamp,
  seedMeso,
  toEngineEquipment,
  type EngineInputs,
  type EngineParams,
  type ExerciseParamOverride,
  type Prescription,
} from "@/lib/engine";
import type {
  Database,
  ExerciseRow,
  MacroGoalType,
  ProfileRow,
} from "@/lib/types/database";
import { getMesoPlan, type PlannedDay, type SlotFill } from "./cycles";
import {
  buildSeedInputs,
  computeDepFingerprint,
  configProjection,
  paramsTokenFor,
} from "./fingerprint";
import { getExerciseParamOverrides } from "./exercise-overrides";
import { engineGoal, type EngineGoal } from "./engine-goal";
import {
  recordSeedDecisions,
  type SeededDecision,
  type SeedDecisionCoords,
} from "./seed-decisions";

type Client = SupabaseClient<Database>;

interface SeedCtx {
  equipmentById: Map<string, ExerciseRow["equipment_type"]>;
  prById: Map<string, { best_weight: number | null; best_reps: number | null }>;
  experienceLevel: ProfileRow["experience_level"];
  targetRir: number;
  isDeload: boolean;
  goal: EngineGoal;
  params: EngineParams;
  paramsVersion: number;
  /** per-user×exercise increment overrides (doc 14 phase 3); absent ⇒ default */
  overrideByExerciseId: Map<string, ExerciseParamOverride>;
}

/** A seeded prescription row plus the engine I/O that produced it, so the caller
 *  can stamp the freshness fingerprint AND record a kind:"seed" decision (doc 14
 *  §6.2) once the inserted row's id is known. */
interface SeededExercise {
  row: {
    workout_id: string;
    exercise_id: string;
    muscle_group_id: string | null;
    position: number;
    prescribed_weight: number | null;
    prescribed_reps: number | null;
    prescribed_sets: number;
    target_rir: number;
    status: "pending";
    notes: string;
    dep_fingerprint: string;
  };
  exerciseId: string;
  inputs: EngineInputs;
  output: Prescription;
}

/** Seed one fill into a prescription + its engine inputs/output (doc 14 §6.2).
 *  The fingerprint over the config projection lets the read-path reconcile detect
 *  an input change without re-running the engine; the inputs/output back the
 *  recorded seed decision so the row can be replayed through seedMeso on recompute. */
function seedExerciseRow(
  workoutId: string,
  fill: Pick<
    SlotFill,
    "exercise_id" | "initial_weight" | "initial_reps" | "initial_sets"
  >,
  muscleGroupId: string | null,
  position: number,
  ctx: SeedCtx,
): SeededExercise {
  const equipment = ctx.equipmentById.get(fill.exercise_id) ?? "other";
  const engineEquipment = toEngineEquipment(equipment);
  const pr = ctx.prById.get(fill.exercise_id);
  const priorPeak =
    pr?.best_weight != null
      ? { weight: pr.best_weight, reps: pr.best_reps, sets: fill.initial_sets }
      : null;
  const initial = {
    weight: fill.initial_weight,
    reps: fill.initial_reps,
    sets: fill.initial_sets,
  };
  // effective params = global active + this user×exercise override (doc 14 §6.1)
  const override = ctx.overrideByExerciseId.get(fill.exercise_id) ?? null;
  const effectiveParams = resolveEffectiveParams(
    ctx.params,
    override,
    engineEquipment,
  );
  const output = seedMeso(
    priorPeak,
    initial,
    { equipmentType: engineEquipment },
    { experienceLevel: ctx.experienceLevel ?? "beginner" },
    ctx.targetRir,
    effectiveParams,
  );
  const inputs = buildSeedInputs({
    equipmentType: equipment,
    profile: { experience_level: ctx.experienceLevel },
    goal: ctx.goal,
    startRir: ctx.targetRir,
    isDeload: ctx.isDeload,
    initial,
    priorPeak,
  });
  return {
    row: {
      workout_id: workoutId,
      exercise_id: fill.exercise_id,
      muscle_group_id: muscleGroupId,
      position,
      prescribed_weight: output.weight,
      prescribed_reps: output.reps,
      prescribed_sets: output.sets,
      target_rir: output.targetRir,
      status: "pending" as const,
      notes: output.rationale,
      dep_fingerprint: computeDepFingerprint(
        configProjection(inputs),
        paramsTokenFor(ctx.paramsVersion, override?.weightIncrement),
      ),
    },
    exerciseId: fill.exercise_id,
    inputs,
    output,
  };
}

/** Build the seeded rows for one planned day's groups/fills, in flat day order
 *  (shared by meso start and the open-workout regeneration on a plan edit). */
function buildDayExerciseRows(
  workoutId: string,
  day: PlannedDay,
  ctx: SeedCtx,
): SeededExercise[] {
  let position = 1;
  // flat day order (across groups, #2): meso_exercises.position is the day-level
  // order; group.position + slot_number break ties for legacy/clustered rows.
  const ordered = day.groups
    .flatMap((group) => group.fills.map((fill) => ({ group, fill })))
    .sort(
      (a, b) =>
        a.fill.position - b.fill.position ||
        a.group.position - b.group.position ||
        (a.fill.slot_number ?? 0) - (b.fill.slot_number ?? 0),
    );
  return ordered.map(({ group, fill }) =>
    seedExerciseRow(workoutId, fill, group.muscle_group_id, position++, ctx),
  );
}

/**
 * Insert a batch of seeded rows (user client — it owns workout_exercises),
 * stamping each `dep_fingerprint`, then record their kind:"seed" engine_decisions
 * via a service client (doc 14 §6.2). The decision write is best-effort
 * (`recordSeedDecisions`): on failure the row keeps its fingerprint but no
 * decision, so the reconcile skips it — never breaking the seed itself.
 */
async function persistSeededRows(
  supabase: Client,
  userId: string,
  seeded: SeededExercise[],
  coords: SeedDecisionCoords,
  params: EngineParams,
  paramsVersion: number,
): Promise<void> {
  if (seeded.length === 0) return;
  const { data: newWes, error } = await supabase
    .from("workout_exercises")
    .insert(seeded.map((s) => s.row))
    .select("id, position");
  if (error) throw error;
  const idByPosition = new Map((newWes ?? []).map((w) => [w.position, w.id]));
  const decisions: SeededDecision[] = seeded
    .map((s): SeededDecision | null => {
      const id = idByPosition.get(s.row.position);
      return id
        ? {
            workoutExerciseId: id,
            exerciseId: s.exerciseId,
            inputs: s.inputs,
            output: s.output,
          }
        : null;
    })
    .filter((d): d is SeededDecision => d !== null);
  await recordSeedDecisions(userId, decisions, coords, params, paramsVersion);
}

/** The meso's progression goal (macrocycle goal → standalone hypertrophy default). */
async function resolveMesoGoal(
  supabase: Client,
  macrocycleId: string | null,
): Promise<EngineGoal> {
  if (!macrocycleId) return engineGoal(null);
  const { data: macro, error } = await supabase
    .from("macrocycles")
    .select("goal_type")
    .eq("id", macrocycleId)
    .maybeSingle();
  if (error) throw error;
  return engineGoal((macro?.goal_type as MacroGoalType | null) ?? null);
}

export interface ActiveEngineParams {
  version: number;
  params: EngineParams;
}

// Request-deduped: the active params are global and immutable within a request
// (they only change via a separate admin-activation request), yet this is read
// multiple times per render (page + getWorkoutDetail). cache() collapses those
// to a single query without risking cross-request or post-mutation staleness.
export const getActiveEngineParams = cache(async function getActiveEngineParams(
  supabase: Client,
): Promise<ActiveEngineParams> {
  const { data, error } = await supabase
    .from("engine_params")
    .select("*")
    .eq("is_active", true)
    .single();
  if (error) throw error;
  return { version: data.version, params: engineParamsSchema.parse(data.params) };
});

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

  const { version: paramsVersion, params } = await getActiveEngineParams(supabase);
  const goal = await resolveMesoGoal(supabase, meso.macrocycle_id);
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
  const [{ data: exercises, error: exError }, { data: prs, error: prError }, overrideByExerciseId] =
    await Promise.all([
      supabase.from("exercises").select("id, equipment_type").in("id", exerciseIds),
      supabase.from("v_exercise_prs").select("*").eq("user_id", userId),
      getExerciseParamOverrides(supabase, userId, exerciseIds),
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
    targetRir: meso.rir_start,
    isDeload: week1.is_deload,
    goal,
    params,
    paramsVersion,
    overrideByExerciseId,
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

    await persistSeededRows(
      supabase,
      userId,
      buildDayExerciseRows(workout.id, day, seedCtx),
      { workoutId: workout.id, microcycleId: week1.id, mesocycleId: meso.id },
      params,
      paramsVersion,
    );
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

  const { version: paramsVersion, params } = await getActiveEngineParams(supabase);
  const goal = await resolveMesoGoal(supabase, plan.meso.macrocycle_id);
  const exerciseIds = [
    ...new Set(
      days.flatMap((d) => d.groups.flatMap((g) => g.fills.map((f) => f.exercise_id))),
    ),
  ];
  const [{ data: exercises, error: exError }, { data: prs, error: prError }, overrideByExerciseId] =
    await Promise.all([
      exerciseIds.length > 0
        ? supabase
            .from("exercises")
            .select("id, equipment_type")
            .in("id", exerciseIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("v_exercise_prs").select("*").eq("user_id", userId),
      getExerciseParamOverrides(supabase, userId, exerciseIds),
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
      targetRir: micro.target_rir,
      isDeload: micro.is_deload,
      goal,
      params,
      paramsVersion,
      overrideByExerciseId,
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
        await persistSeededRows(
          supabase,
          userId,
          buildDayExerciseRows(created.id, day, ctx),
          { workoutId: created.id, microcycleId: micro.id, mesocycleId: mesoId },
          params,
          paramsVersion,
        );
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

      // add exercises new to the plan, seeded, appended after the max position.
      // Each carries a stamped fingerprint + a recorded kind:"seed" decision
      // (doc 14 §6.2) so the read-path reconcile keeps it fresh thereafter.
      let position = Math.max(0, ...(wes ?? []).map((w) => w.position));
      const seededNew = day.groups.flatMap((group) =>
        group.fills
          .filter((f) => !haveIds.has(f.exercise_id))
          .map((fill) =>
            seedExerciseRow(existing.id, fill, group.muscle_group_id, ++position, ctx),
          ),
      );
      await persistSeededRows(
        supabase,
        userId,
        seededNew,
        { workoutId: existing.id, microcycleId: micro.id, mesocycleId: mesoId },
        params,
        paramsVersion,
      );
    }
  }
}
