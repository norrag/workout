import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import {
  engineParamsSchema,
  resolveEffectiveParams,
  rirRamp,
  seedMeso,
  toEngineEquipment,
  toEngineLoadType,
  type E1rmAnchor,
  type EngineInputs,
  type EngineParams,
  type ExerciseParamOverride,
  type Prescription,
} from "@/lib/engine";
import { getExerciseE1rmAnchors } from "./anchors";
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
import {
  getProgressionHistories,
  type ProgressionHistoryInput,
} from "./progression-history";
import { getSeedEarnContexts, type SeedEarnBundle } from "./seed-progression";
import { derivePlanStrengthRate, type PlanStrengthRate } from "./plan-rate";
import { getBandPosition } from "./envelope";

type Client = SupabaseClient<Database>;

interface SeedCtx {
  equipmentById: Map<string, ExerciseRow["equipment_type"]>;
  prById: Map<string, { best_weight: number | null; best_reps: number | null }>;
  experienceLevel: ProfileRow["experience_level"];
  /** T-I2: the lifter's bodyweight — effective-load base for bodyweight movements */
  bodyweight: number | null;
  targetRir: number;
  isDeload: boolean;
  goal: EngineGoal;
  params: EngineParams;
  paramsVersion: number;
  /** per-user×exercise increment overrides (doc 14 phase 3); absent ⇒ default */
  overrideByExerciseId: Map<string, ExerciseParamOverride>;
  /** §S1: recency strength anchor per exercise for the anchor-aware meso seed */
  anchorByExerciseId: Map<string, E1rmAnchor>;
  /** doc 16 §3.7: the earned-at-close context per exercise (meso activation
   *  only — swaps/mid-meso adds have no compliance context and never earn).
   *  Null while the progression mode is inactive for this goal. */
  earnByExerciseId: Map<string, SeedEarnBundle> | null;
  /** doc 16 §8.2: the governors' derived lookback per exercise. Null while the
   *  mode is inactive — the recorded seed inputs then omit every progression
   *  field, staying byte-identical to today (§2.7). */
  progressionByExerciseId: Map<string, ProgressionHistoryInput> | null;
  /** doc 17 §3 (N37): the pacer's personalized plan strength band — per user ×
   *  goal, derived once per operation. Recorded (and passed to the engine) only
   *  under the same mode gate as `progressionByExerciseId`. */
  planStrengthRate: PlanStrengthRate | null;
  /** doc 17 §7 (N36): the envelope loop's per-user band position — derived once
   *  per operation from the trailing completed mesos' decisions. Null while the
   *  loop is off (envelope block absent/disabled): recorded and passed only
   *  when non-null, so everything stays byte-identical without it. */
  bandPosition: number | null;
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
    params_version: number;
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
  // §S1: anchor-aware seed (gated by seed_from_anchor in effectiveParams). The
  // anchor is a derived input — carried into the seed decision so replay
  // reproduces it, but excluded from the freshness fingerprint (doc 14 §3).
  const anchor = ctx.anchorByExerciseId.get(fill.exercise_id) ?? null;
  // doc 16 §3.7: the seed-route earn (meso activation carries the prior meso's
  // final working session across the deload boundary; a mid-meso add has none)
  // + the §8.2 governors' lookback. All derived inputs — recorded in the seed
  // decision for replay, excluded from the fingerprint; omitted entirely while
  // the mode is inactive so recorded inputs stay byte-identical.
  const earnBundle = ctx.earnByExerciseId?.get(fill.exercise_id) ?? null;
  const history = ctx.progressionByExerciseId?.get(fill.exercise_id) ?? null;
  const output = seedMeso(
    priorPeak,
    initial,
    { equipmentType: engineEquipment, loadType: toEngineLoadType(equipment) },
    { experienceLevel: ctx.experienceLevel ?? "beginner" },
    ctx.targetRir,
    effectiveParams,
    {
      goalType: ctx.goal,
      anchor,
      bodyweight: ctx.bodyweight,
      isDeload: ctx.isDeload,
      ...(earnBundle
        ? {
            earn: earnBundle.earn,
            daysSincePreviousSession: earnBundle.daysSincePreviousSession,
          }
        : {}),
      ...(ctx.progressionByExerciseId
        ? {
            progressionHistory: history,
            planStrengthRate: ctx.planStrengthRate,
          }
        : {}),
      ...(ctx.bandPosition != null ? { bandPosition: ctx.bandPosition } : {}),
    },
  );
  const inputs = buildSeedInputs({
    equipmentType: equipment,
    profile: { experience_level: ctx.experienceLevel },
    goal: ctx.goal,
    startRir: ctx.targetRir,
    isDeload: ctx.isDeload,
    initial,
    priorPeak,
    strengthAnchor: anchor,
    bodyweight: ctx.bodyweight,
    ...(ctx.progressionByExerciseId
      ? {
          progression: {
            seedEarn: earnBundle?.earn ?? null,
            progressionHistory: history,
            daysSincePreviousSession:
              earnBundle?.daysSincePreviousSession ?? null,
            planStrengthRate: ctx.planStrengthRate,
            // key present only when the loop is on — a recorded seed input
            // without it stays byte-identical to pre-envelope decisions
            ...(ctx.bandPosition != null
              ? { bandPosition: ctx.bandPosition }
              : {}),
          },
        }
      : {}),
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
      // legible "accurate as of Vx" stamp, written beside the fingerprint
      params_version: ctx.paramsVersion,
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
 * Whether a positioned meso in a macro may be activated yet. Sequential blocks:
 * a meso only starts once every earlier-positioned sibling is completed/abandoned
 * and no sibling is currently active — so its prescriptions are seeded from the
 * latest results of the prior blocks, never in advance of them (planned mesos
 * hold no prescriptions until activation, so this is the whole guarantee). Pure.
 */
export function mesoActivationBlock(
  siblings: { position: number | null; status: string }[],
  position: number | null,
): { blocked: boolean; reason: string } {
  if (siblings.some((s) => s.status === "active"))
    return {
      blocked: true,
      reason:
        "another mesocycle in this macrocycle is currently active — finish it before starting this one.",
    };
  if (position == null) return { blocked: false, reason: "" };
  const earlier = siblings.filter(
    (s) =>
      s.position != null &&
      s.position < position &&
      s.status !== "completed" &&
      s.status !== "abandoned",
  ).length;
  if (earlier > 0)
    return {
      blocked: true,
      reason: `${earlier} earlier mesocycle(s) in this macrocycle aren't complete yet — finish them first so this block's prescriptions use their latest results.`,
    };
  return { blocked: false, reason: "" };
}

/**
 * R4 (hard rule #5): which of the delete candidates are actually removable —
 * anything carrying a logged set is preserved, because deleting it would
 * cascade `logged_sets` and destroy logged history. A workout can genuinely be
 * `planned` with sets on it (logSet's status flip is a separate statement), so
 * the status guard alone is porous. Pure; exported for unit tests.
 */
export function withoutLoggedHistory<T extends { id: string }>(
  candidates: T[],
  idsWithLoggedSets: ReadonlySet<string>,
): T[] {
  return candidates.filter((c) => !idsWithLoggedSets.has(c.id));
}

/** The subset of the given ids that have at least one logged set, keyed by the
 *  given denormalized `logged_sets` column. */
async function idsWithLoggedSets(
  supabase: Client,
  column: "workout_id" | "workout_exercise_id",
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from("logged_sets")
    .select(column)
    .in(column, ids);
  if (error) throw error;
  return new Set(
    (data ?? []).map((r) => (r as Record<string, string>)[column]),
  );
}

/**
 * Activate a planned meso: build the full microcycle ramp and the week-1
 * workouts from the planner board (07 Phase 2 — `seedMeso`/`rirRamp`).
 *
 * R3: retry-safe. The old flow inserted microcycles first and flipped the meso
 * `active` last; a mid-flight failure left a `planned` meso whose retry hit
 * `unique (mesocycle_id, week_number)` — permanently unstartable with no
 * cleanup path. A retry now upserts the ramp, prunes stale rows from an older
 * attempt (guarded: never anything carrying logged history), skips
 * already-seeded days, and completes the flip.
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

  // one live block per user (R15): never start a meso while ANY other meso is
  // active — same macro, different macro, or standalone. The old gate only
  // checked same-macro siblings, so a second block could go live and the
  // Workout tab would silently follow the newest one. Backstopped by the
  // partial unique index `mesocycles_one_active_per_user` (race-safe).
  const { data: liveMesos, error: liveErr } = await supabase
    .from("mesocycles")
    .select("id, name")
    .eq("user_id", userId)
    .eq("status", "active")
    .neq("id", meso.id)
    .limit(1);
  if (liveErr) throw liveErr;
  if (liveMesos && liveMesos.length > 0)
    return {
      error: `another mesocycle ("${liveMesos[0].name}") is currently active — complete or abandon it before starting this one.`,
    };

  // sequential activation within a macro: don't start a future block while an
  // earlier one is unfinished (or another is live). A planned meso has no
  // prescriptions yet, so gating activation is what keeps them from being
  // seeded off stale, pre-completion state.
  if (meso.macrocycle_id) {
    const { data: siblings, error: sibErr } = await supabase
      .from("mesocycles")
      .select("position, status")
      .eq("macrocycle_id", meso.macrocycle_id)
      .eq("user_id", userId)
      .neq("id", meso.id);
    if (sibErr) throw sibErr;
    const gate = mesoActivationBlock(siblings ?? [], meso.position);
    if (gate.blocked) return { error: gate.reason };
  }

  const { version: paramsVersion, params } = await getActiveEngineParams(supabase);
  const goal = await resolveMesoGoal(supabase, meso.macrocycle_id);
  const ramp = rirRamp(
    meso.weeks,
    meso.includes_deload,
    meso.rir_start,
    meso.rir_end,
    params,
    meso.rir_schedule,
  );

  // exercises referenced by the plan, for equipment-aware seeding
  const exerciseIds = [
    ...new Set(days.flatMap((d) => d.groups.flatMap((g) => g.fills.map((f) => f.exercise_id)))),
  ];
  const [
    { data: exercises, error: exError },
    { data: prs, error: prError },
    overrideByExerciseId,
    anchorByExerciseId,
  ] = await Promise.all([
    supabase.from("exercises").select("id, equipment_type").in("id", exerciseIds),
    supabase.from("v_exercise_prs").select("*").eq("user_id", userId),
    getExerciseParamOverrides(supabase, userId, exerciseIds),
    // §S1: recency strength anchors for the anchor-aware seed (no-op unless
    // seed_from_anchor is active; cheap when there's no history)
    getExerciseE1rmAnchors(supabase, userId, exerciseIds, params),
  ]);
  if (exError) throw exError;
  if (prError) throw prError;
  const equipmentById = new Map(
    (exercises ?? []).map((e) => [e.id, e.equipment_type]),
  );
  const prById = new Map((prs ?? []).map((p) => [p.exercise_id, p]));

  const today = new Date().toISOString().slice(0, 10);

  // microcycles for every week of the ramp; week 1 active. Upsert so a retry
  // after a half-applied start converges instead of failing on the unique key.
  const { data: micros, error: microError } = await supabase
    .from("microcycles")
    .upsert(
      ramp.map((week) => ({
        mesocycle_id: meso.id,
        user_id: userId,
        week_number: week.weekNumber,
        target_rir: week.targetRir,
        is_deload: week.isDeload,
        start_date: week.weekNumber === 1 ? today : null,
        status: week.weekNumber === 1 ? ("active" as const) : ("pending" as const),
      })),
      { onConflict: "mesocycle_id,week_number" },
    )
    .select();
  if (microError) throw microError;
  const week1 = (micros ?? []).find((m) => m.week_number === 1);
  if (!week1) return { error: "Failed to create week 1." };

  // prune weeks a prior (differently-shaped) attempt left beyond this ramp —
  // guarded: never delete anything carrying logged history (hard rule #5)
  const { data: staleMicros, error: staleError } = await supabase
    .from("microcycles")
    .select("id")
    .eq("mesocycle_id", meso.id)
    .gt("week_number", ramp.length);
  if (staleError) throw staleError;
  if (staleMicros && staleMicros.length > 0) {
    const { count, error: lsError } = await supabase
      .from("logged_sets")
      .select("*", { count: "exact", head: true })
      .in(
        "microcycle_id",
        staleMicros.map((m) => m.id),
      );
    if (lsError) throw lsError;
    if ((count ?? 0) > 0)
      return {
        error: "logged sets exist beyond the planned weeks — this mesocycle can't be started.",
      };
    const { error: pruneError } = await supabase
      .from("microcycles")
      .delete()
      .in(
        "id",
        staleMicros.map((m) => m.id),
      );
    if (pruneError) throw pruneError;
  }

  // doc 16 §3.7: the earned-at-close derivation (the prior meso's final working
  // session per exercise) + the §8.2 governors' lookback keyed to the week-1
  // micro (a retried activation must see a step an earlier attempt already
  // recorded — cadence). Both self-gate: null while the mode is inactive, so
  // the seed path below is byte-identical to today with the block absent.
  const [earnByExerciseId, progressionByExerciseId] = await Promise.all([
    getSeedEarnContexts(supabase, userId, exerciseIds, goal, params),
    getProgressionHistories(supabase, userId, exerciseIds, week1.id, params),
  ]);
  // doc 17 §3: the pacer's plan strength band, derived once per activation
  // (per-user, not per-exercise) from the live profile under the resolved goal
  // (standalone mesos resolve to hypertrophy). Self-gates: null while the
  // progression mode is inactive.
  const planStrengthRate = derivePlanStrengthRate(profile, goal, params);
  // doc 17 §7: the envelope loop's per-user band position, folded from the
  // trailing completed mesos' decisions — the meso boundary IS this seed.
  // Self-gates: null while the loop is off.
  const bandPosition = await getBandPosition(supabase, userId, params);

  const seedCtx: SeedCtx = {
    equipmentById,
    prById,
    experienceLevel: profile.experience_level,
    bodyweight: profile.bodyweight ?? null,
    // N18-B: week 1's RIR comes from the ramp (a per-week schedule can differ
    // from rir_start), so the seed fingerprint matches the microcycle row
    targetRir: ramp[0].targetRir,
    isDeload: week1.is_deload,
    goal,
    params,
    paramsVersion,
    overrideByExerciseId,
    anchorByExerciseId,
    earnByExerciseId,
    progressionByExerciseId,
    planStrengthRate,
    bandPosition,
  };

  // a half-applied prior attempt may have created some week-1 workouts
  // already; skip fully-seeded days, adopt empty ones, create the rest
  const { data: priorW1, error: priorW1Error } = await supabase
    .from("workouts")
    .select("id, day_number")
    .eq("microcycle_id", week1.id);
  if (priorW1Error) throw priorW1Error;

  // ghost days a prior attempt created for a since-removed plan day — prune,
  // with the same logged-history guard
  const planDayNumbers = new Set(days.map((d) => d.day_number));
  const ghosts = (priorW1 ?? []).filter((w) => !planDayNumbers.has(w.day_number));
  if (ghosts.length > 0) {
    const ghostsWithSets = await idsWithLoggedSets(
      supabase,
      "workout_id",
      ghosts.map((w) => w.id),
    );
    const removable = withoutLoggedHistory(ghosts, ghostsWithSets);
    if (removable.length > 0) {
      const { error: ghostError } = await supabase
        .from("workouts")
        .delete()
        .in(
          "id",
          removable.map((w) => w.id),
        );
      if (ghostError) throw ghostError;
    }
  }

  const w1ByDay = new Map((priorW1 ?? []).map((w) => [w.day_number, w]));
  const w1Populated = new Set<string>();
  if (priorW1 && priorW1.length > 0) {
    const { data: priorWes, error: priorWesError } = await supabase
      .from("workout_exercises")
      .select("workout_id")
      .in(
        "workout_id",
        priorW1.map((w) => w.id),
      );
    if (priorWesError) throw priorWesError;
    for (const we of priorWes ?? []) w1Populated.add(we.workout_id);
  }

  // week-1 workouts in planner order, seeded per exercise
  for (const day of days) {
    const prior = w1ByDay.get(day.day_number);
    if (prior && w1Populated.has(prior.id)) continue; // seeded by a prior attempt
    let workoutId = prior?.id ?? null;
    if (workoutId == null) {
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
      workoutId = workout.id;
    }

    await persistSeededRows(
      supabase,
      userId,
      buildDayExerciseRows(workoutId, day, seedCtx),
      { workoutId, microcycleId: week1.id, mesocycleId: meso.id },
      params,
      paramsVersion,
    );
  }

  const { error: activateError } = await supabase
    .from("mesocycles")
    .update({ status: "active", start_date: today })
    .eq("id", meso.id);
  if (activateError) {
    // the one-active-per-user index (R15): a concurrent activation won the
    // race between our gate check and this flip. Everything seeded above is
    // retry-safe (R3) — finishing the other block and starting again converges.
    if (activateError.code === "23505")
      return {
        error:
          "another mesocycle just went active — complete or abandon it before starting this one.",
      };
    throw activateError;
  }

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
  const [
    { data: exercises, error: exError },
    { data: prs, error: prError },
    overrideByExerciseId,
    anchorByExerciseId,
  ] = await Promise.all([
    exerciseIds.length > 0
      ? supabase
          .from("exercises")
          .select("id, equipment_type")
          .in("id", exerciseIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("v_exercise_prs").select("*").eq("user_id", userId),
    getExerciseParamOverrides(supabase, userId, exerciseIds),
    // §S1: recency strength anchors for the anchor-aware seed of added exercises
    getExerciseE1rmAnchors(supabase, userId, exerciseIds, params),
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
      bodyweight: profile.bodyweight ?? null,
      targetRir: micro.target_rir,
      isDeload: micro.is_deload,
      goal,
      params,
      paramsVersion,
      overrideByExerciseId,
      anchorByExerciseId,
      // doc 16 §3.7: a plan-edit add mid-meso is a cold start — no compliance
      // context, never earned; the seed emits `not_earned` while the mode is
      // active and stays byte-identical while it is absent. The plan rate rides
      // the same gate (a never-earned seed can't reach the pacer anyway).
      earnByExerciseId: null,
      progressionByExerciseId: null,
      planStrengthRate: null,
      bandPosition: null,
    };

    // 1. drop planned workouts whose day was removed from the plan — but never
    // one carrying logged sets (R4, hard rule #5): the delete would cascade
    // logged_sets, and `planned` alone is porous because logSet's in_progress
    // flip is a separate statement that can fail after the set is written.
    const removedDays = workouts.filter(
      (w) => w.status === "planned" && !planByDayNumber.has(w.day_number),
    );
    if (removedDays.length > 0) {
      const daysWithSets = await idsWithLoggedSets(
        supabase,
        "workout_id",
        removedDays.map((w) => w.id),
      );
      const removableDays = withoutLoggedHistory(removedDays, daysWithSets);
      if (removableDays.length > 0) {
        const { error } = await supabase
          .from("workouts")
          .delete()
          .in(
            "id",
            removableDays.map((w) => w.id),
          );
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
        // a newly added day → create a fresh planned workout, fully seeded.
        // ignoreDuplicates: a concurrent generation may have created the day
        // since our read — the unique (microcycle_id, day_number) key makes
        // that a silent no-row result instead of a duplicated week (R3).
        const { data: created, error: cErr } = await supabase
          .from("workouts")
          .upsert(
            {
              microcycle_id: micro.id,
              user_id: userId,
              day_number: day.day_number,
              scheduled_date: null,
              performed_at: null,
              status: "planned",
              notes: null,
            },
            { onConflict: "microcycle_id,day_number", ignoreDuplicates: true },
          )
          .select()
          .maybeSingle();
        if (cErr) throw cErr;
        if (!created) continue; // another writer owns this day now
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

      // remove exercises no longer in the plan — same logged-history guard
      // (R4): `removeWorkoutExercise` refuses when sets exist, and so does the
      // regeneration path now. A kept row stays in `haveIds`, so it is never
      // re-added either.
      const toRemove = (wes ?? []).filter((w) => !planIds.has(w.exercise_id));
      if (toRemove.length > 0) {
        const wesWithSets = await idsWithLoggedSets(
          supabase,
          "workout_exercise_id",
          toRemove.map((w) => w.id),
        );
        const removableWes = withoutLoggedHistory(toRemove, wesWithSets);
        if (removableWes.length > 0) {
          const { error } = await supabase
            .from("workout_exercises")
            .delete()
            .in(
              "id",
              removableWes.map((w) => w.id),
            );
          if (error) throw error;
        }
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
