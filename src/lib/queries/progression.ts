import type { SupabaseClient } from "@supabase/supabase-js";
import {
  composeAutoregulationSummary,
  composeMesoCompleteSummary,
  prescribe,
  resolveEffectiveParams,
  toEngineEquipment,
  volumeCountingWeights,
  type EngineInputs,
  type EngineParams,
  type E1rmAnchor,
  type ExerciseParamOverride,
  type Prescription,
  type SummaryDelta,
  type VolumeCountingWeights,
} from "@/lib/engine";
import { getExerciseE1rmAnchors } from "./logging";
import { getMuscleRoleIdsForExercises } from "./exercises";
import {
  buildConfigInputs,
  computeDepFingerprint,
  configProjection,
  paramsTokenFor,
} from "./fingerprint";
import {
  getExerciseIncrementOverride,
  getExerciseParamOverrides,
} from "./exercise-overrides";
import type {
  Database,
  ExerciseFeedbackRow,
  MacroGoalType,
  LoggedSetRow,
  MesocycleRow,
  MicrocycleRow,
  ProfileRow,
  WorkoutExerciseRow,
  WorkoutFeedbackRow,
  WorkoutRow,
} from "@/lib/types/database";
import { getActiveEngineParams } from "./generation";
import { engineGoal, type EngineGoal } from "./engine-goal";
import { engineCodeSha, hashParams } from "./params-provenance";

// re-export so existing importers (regeneration.ts, callers) keep working while
// the canonical definition lives in the leaf module (avoids a generation.ts ↔
// progression.ts import cycle now that generation needs it for seed inputs).
export { engineGoal, type EngineGoal } from "./engine-goal";

/**
 * Week N → N+1 generation (07 Phase 4). Runs after a workout completes,
 * with the SERVICE client: `engine_decisions` is deliberately not writable
 * by users (audit trail), so every query here scopes by the server-derived
 * `userId` explicitly (CLAUDE.md hard rule 4).
 */

type Client = SupabaseClient<Database>;

/**
 * Recording-time provenance for an engine decision (P0-4). The progression
 * premise (doc 11) is that a logged set's RIR equals its prescribed target RIR
 * — so a null `rir_reported` is treated as the week target, not missing data.
 * That assumption was silently applied; this records when and how often, plus
 * the engine build, so a decision is auditable after the fact.
 */
function decisionProvenance(
  inputs: EngineInputs,
  codeSha: string | null,
): Record<string, unknown> {
  const working = inputs.actualSets.filter((s) => !s.isWarmup);
  const assumed = working.filter((s) => s.rirReported == null).length;
  return {
    code_sha: codeSha,
    rir_fallback: {
      rule: "null rir_reported assumed at the prescribed target RIR (doc 11)",
      working_sets: working.length,
      sets_assumed: assumed,
      applied: assumed > 0,
    },
  };
}

export interface AdvanceResult {
  /** the fig 1.5 autoregulation copy for the workout-complete sheet */
  summary: string;
  /** where the NEXT button should land, when a workout exists to go to */
  nextWorkoutId: string | null;
  nextLabel: string | null;
}

/** Assemble pure engine inputs for one exercise from week-N rows. */
export function buildEngineInputs(args: {
  we: WorkoutExerciseRow;
  sets: LoggedSetRow[];
  feedback: ExerciseFeedbackRow | null;
  groupFeedback: { pump: number | null; workload: number | null } | null;
  workoutFeedback: WorkoutFeedbackRow | null;
  microTargetRir: number;
  nextWeek: { targetRir: number; isDeload: boolean };
  goal: EngineGoal;
  equipmentType: string;
  loadType?: string | null;
  profile: Pick<ProfileRow, "experience_level">;
  muscleGroupWeeklySets: number | null;
  weekPeak: EngineInputs["weekPeak"];
  strengthAnchor: EngineInputs["strengthAnchor"];
  bodyweight: EngineInputs["bodyweight"];
}): EngineInputs {
  const { we } = args;
  // config half resolved through the single shared resolver (doc 14 §3) so the
  // freshness fingerprint is built the same way at write and at check; the
  // derived half (logged history) is assembled below.
  const previous = {
    weight: we.prescribed_weight,
    reps: we.prescribed_reps,
    sets: we.prescribed_sets ?? 1,
    targetRir: we.target_rir ?? args.microTargetRir,
  };
  return {
    ...buildConfigInputs({
      equipmentType: args.equipmentType,
      loadType: args.loadType,
      profile: args.profile,
      goal: args.goal,
      week: args.nextWeek,
      previous,
      initial: null,
    }),
    actualSets: args.sets.map((s, index) => ({
      setNumber: s.set_number,
      weight: s.weight,
      reps: s.reps,
      rirReported: s.rir_reported,
      isWarmup: s.is_warmup,
      // P0-4: carry the immutable set id + a stable position so the recorded
      // decision is auditable back to exact rows (set_number alone collides
      // between warmup and working sets)
      loggedSetId: s.id,
      sequenceIndex: index,
    })),
    exerciseFeedback: {
      jointPain: args.feedback?.joint_pain ?? null,
      pump: args.groupFeedback?.pump ?? null,
      workload: args.groupFeedback?.workload ?? null,
    },
    workoutFeedback: args.workoutFeedback
      ? {
          overallFatigue: args.workoutFeedback.overall_fatigue,
          effortRating: args.workoutFeedback.effort_rating,
          performanceRating: args.workoutFeedback.performance_rating,
        }
      : null,
    muscleGroupWeeklySets: args.muscleGroupWeeklySets,
    weekPeak: args.weekPeak,
    strengthAnchor: args.strengthAnchor,
    bodyweight: args.bodyweight,
  };
}

/**
 * Planned weekly working sets per muscle group (id-keyed) across a week's
 * exercises — the engine's set-add ceiling input. Fractional since R14
 * (doc 10 §2): each slot credits `direct` (default 1.0) to every muscle its
 * exercise links as primary and `indirect` (default 0.5) to every secondary,
 * so the `mg_set_ceiling` gate sees direct-equivalent volume. Exercises with
 * no muscle links (or when no roles map is supplied — legacy callers/tests)
 * fall back to crediting the slot's assigned group at the direct weight.
 */
export function weeklySetsByGroup(
  wes: WorkoutExerciseRow[],
  rolesByExercise?: Map<
    string,
    { muscleGroupId: string; role: "primary" | "secondary" }[]
  >,
  weights: VolumeCountingWeights = { direct: 1.0, indirect: 0.5 },
): Map<string, number> {
  const out = new Map<string, number>();
  const credit = (groupId: string, amount: number) =>
    out.set(groupId, round2((out.get(groupId) ?? 0) + amount));
  for (const we of wes) {
    if (we.status === "skipped") continue;
    const sets = we.prescribed_sets ?? 0;
    const roles = rolesByExercise?.get(we.exercise_id);
    if (roles && roles.length > 0) {
      for (const r of roles) {
        credit(
          r.muscleGroupId,
          sets * (r.role === "primary" ? weights.direct : weights.indirect),
        );
      }
    } else if (we.muscle_group_id) {
      credit(we.muscle_group_id, sets * weights.direct);
    }
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Heaviest prescription of the meso so far, per exercise (deload sizing). */
export function peakByExercise(
  wes: WorkoutExerciseRow[],
  fallbackRir: number,
): Map<string, NonNullable<EngineInputs["weekPeak"]>> {
  const out = new Map<string, NonNullable<EngineInputs["weekPeak"]>>();
  for (const we of wes) {
    if (we.prescribed_weight == null) continue;
    const cur = out.get(we.exercise_id);
    if (!cur || we.prescribed_weight > (cur.weight ?? 0)) {
      out.set(we.exercise_id, {
        weight: we.prescribed_weight,
        reps: we.prescribed_reps,
        sets: we.prescribed_sets ?? 1,
        targetRir: we.target_rir ?? fallbackRir,
      });
    }
  }
  return out;
}

interface WeekContext {
  service: Client;
  userId: string;
  profile: ProfileRow;
  params: EngineParams;
  paramsVersion: number;
  meso: MesocycleRow;
  micro: MicrocycleRow;
  nextMicro: MicrocycleRow;
  goal: EngineGoal;
  weekWes: WorkoutExerciseRow[];
  setsByWe: Map<string, LoggedSetRow[]>;
  feedbackByWe: Map<string, ExerciseFeedbackRow>;
  workoutFeedbackByWorkout: Map<string, WorkoutFeedbackRow>;
  mgWeeklySets: Map<string, number>;
  peaks: Map<string, NonNullable<EngineInputs["weekPeak"]>>;
  anchorsByExercise: Map<string, E1rmAnchor>;
  equipmentByExercise: Map<string, string>;
  nameByExercise: Map<string, string>;
  /** per-user×exercise increment overrides (doc 14 phase 3); absent ⇒ default */
  overrideByExercise: Map<string, ExerciseParamOverride>;
}

/**
 * Generate the week-N+1 counterpart of one week-N workout: prescriptions
 * via `prescribe()`, rationale on each row, and one `engine_decisions`
 * write per exercise. Returns the summary deltas for the 1.5 sheet.
 */
async function generateDay(
  ctx: WeekContext,
  weekNWorkout: WorkoutRow,
): Promise<{ workoutId: string | null; deltas: SummaryDelta[] }> {
  const dayWes = ctx.weekWes
    .filter((we) => we.workout_id === weekNWorkout.id)
    .sort((a, b) => a.position - b.position);

  // group-scoped pump/workload lives on whichever exercise closed the group
  const groupFeedback = new Map<
    string,
    { pump: number | null; workload: number | null }
  >();
  for (const we of dayWes) {
    const fb = ctx.feedbackByWe.get(we.id);
    if (fb?.muscle_group_id && (fb.pump != null || fb.workload != null)) {
      groupFeedback.set(fb.muscle_group_id, {
        pump: fb.pump,
        workload: fb.workload,
      });
    }
  }

  const decisions: {
    inputs: EngineInputs;
    output: Prescription;
    sourceWeId: string;
    exerciseId: string;
  }[] = [];
  const deltas: SummaryDelta[] = [];
  const rows = dayWes.map((we, index) => {
    const equipment = ctx.equipmentByExercise.get(we.exercise_id) ?? "other";
    const inputs = buildEngineInputs({
      we,
      sets: ctx.setsByWe.get(we.id) ?? [],
      feedback: ctx.feedbackByWe.get(we.id) ?? null,
      groupFeedback: we.muscle_group_id
        ? (groupFeedback.get(we.muscle_group_id) ?? null)
        : null,
      workoutFeedback: ctx.workoutFeedbackByWorkout.get(weekNWorkout.id) ?? null,
      microTargetRir: ctx.micro.target_rir,
      nextWeek: {
        targetRir: ctx.nextMicro.target_rir,
        isDeload: ctx.nextMicro.is_deload,
      },
      goal: ctx.goal,
      equipmentType: equipment,
      profile: ctx.profile,
      muscleGroupWeeklySets: we.muscle_group_id
        ? (ctx.mgWeeklySets.get(we.muscle_group_id) ?? null)
        : null,
      weekPeak: ctx.peaks.get(we.exercise_id) ?? null,
      strengthAnchor: ctx.anchorsByExercise.get(we.exercise_id) ?? null,
      bodyweight: ctx.profile.bodyweight ?? null,
    });
    // effective params = global active + this user×exercise increment override
    // (doc 14 §6.1); the override also feeds the row's fingerprint token below.
    const override = ctx.overrideByExercise.get(we.exercise_id) ?? null;
    const output = prescribe(
      inputs,
      resolveEffectiveParams(
        ctx.params,
        override,
        toEngineEquipment(equipment),
      ),
    );
    decisions.push({ inputs, output, sourceWeId: we.id, exerciseId: we.exercise_id });
    deltas.push({
      exerciseName: ctx.nameByExercise.get(we.exercise_id) ?? "Exercise",
      previousWeight: we.prescribed_weight,
      previousSets: we.prescribed_sets ?? 1,
      nextWeight: output.weight,
      nextSets: output.sets,
      previousReps: we.prescribed_reps,
      nextReps: output.reps,
    });
    return {
      exercise_id: we.exercise_id,
      muscle_group_id: we.muscle_group_id,
      position: index + 1,
      prescribed_weight: output.weight,
      prescribed_reps: output.reps,
      prescribed_sets: output.sets,
      target_rir: output.targetRir,
      status: "pending" as const,
      notes: output.rationale,
      // freshness fingerprint over the config projection (doc 14): lets the
      // read-path reconcile detect when an input changed without re-running the
      // engine, and recompute only the rows that diverged.
      dep_fingerprint: computeDepFingerprint(
        configProjection(inputs),
        paramsTokenFor(ctx.paramsVersion, override?.weightIncrement),
      ),
      // legible "accurate as of Vx" stamp, written beside the fingerprint
      params_version: ctx.paramsVersion,
    };
  });

  // R3: workout + exercises + decisions land in ONE transaction
  // (`insert_generated_day`, 20260702000005). The old three-insert sequence
  // could fail after the workout insert and leave a poisoned empty planned day
  // the catch-up scan forever treated as generated. The function also ADOPTS
  // an existing empty planned (microcycle, day) row, healing any poisoned day,
  // and returns created:false when the day is genuinely generated already
  // (idempotent under races — unique (microcycle_id, day_number) backs it).
  const paramsHash = hashParams(ctx.params as unknown as Record<string, unknown>);
  const codeSha = engineCodeSha();
  const { data: generated, error: genError } = await ctx.service.rpc(
    "insert_generated_day",
    {
      p_mesocycle_id: ctx.meso.id,
      p_workout: {
        microcycle_id: ctx.nextMicro.id,
        user_id: ctx.userId,
        day_number: weekNWorkout.day_number,
      },
      p_exercises: rows,
      p_decisions: decisions.map((d, index) => ({
        // joins its generated week-N+1 row by position inside the function
        position: index + 1,
        user_id: ctx.userId,
        // P0-4: persist source identity + cycle coordinates so a decision
        // chains into history/explain without a re-lookup
        exercise_id: d.exerciseId,
        source_workout_exercise_id: d.sourceWeId,
        inputs: d.inputs as unknown as Record<string, unknown>,
        output: d.output as unknown as Record<string, unknown>,
        params_version: ctx.paramsVersion,
        params_hash: paramsHash,
        provenance: decisionProvenance(d.inputs, codeSha),
        // week N→N+1 progression (doc 14 §6.2); the read-path recompute replays
        // these through prescribe().
        kind: "advance" as const,
      })),
    },
  );
  if (genError) throw genError;
  if (!generated?.created) {
    // a concurrent writer generated this day between our check and the insert
    return { workoutId: generated?.workout_id ?? null, deltas: [] };
  }

  return { workoutId: generated.workout_id, deltas };
}

/**
 * "First open of new week" fallback: if the meso is active but no microcycle
 * is (all workouts of the active week were closed without the job running),
 * re-run the advance job off the last completed workout. Idempotent.
 * Returns true when a job ran.
 */
export async function catchUpProgression(
  service: Client,
  userId: string,
  mesoId: string,
): Promise<boolean> {
  const { data: micros, error: microsError } = await service
    .from("microcycles")
    .select("*")
    .eq("mesocycle_id", mesoId)
    .eq("user_id", userId)
    .order("week_number");
  if (microsError) throw microsError;
  if ((micros ?? []).some((m) => m.status === "active")) return false;

  const lastCompleted = [...(micros ?? [])]
    .reverse()
    .find((m) => m.status === "completed");
  if (!lastCompleted) return false;

  const { data: workouts, error: workoutsError } = await service
    .from("workouts")
    .select("id")
    .eq("microcycle_id", lastCompleted.id)
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("day_number", { ascending: false })
    .limit(1);
  if (workoutsError) throw workoutsError;
  if (!workouts || workouts.length === 0) return false;

  await advanceWeekAfterWorkout(service, userId, workouts[0].id);
  return true;
}

/** One closed day whose next-week same-day counterpart is missing. */
export interface CatchUpSource {
  workoutId: string;
  week: number;
  day: number;
}

/**
 * Pure: find every CLOSED (completed/skipped) day whose next-week counterpart
 * does not exist yet, in week→day order. These are the source days to re-run the
 * advance job on. A day is only a source when the following week actually exists
 * in the meso (so the final week never qualifies). Exported for unit tests.
 *
 * R3: an EMPTY planned counterpart (`has_exercises === false`) counts as
 * missing — it is a poisoned day from a pre-20260702000005 half-applied
 * generation, and the atomic `insert_generated_day` adopts + fills it. Rows
 * without the flag keep the legacy meaning (exists ⇒ generated).
 */
export function planCatchUp(
  weeks: { id: string; week_number: number }[],
  workouts: {
    id: string;
    microcycle_id: string;
    day_number: number;
    status: string;
    has_exercises?: boolean;
  }[],
): CatchUpSource[] {
  const weekByMicro = new Map(weeks.map((m) => [m.id, m.week_number]));
  const weekNumbers = new Set(weeks.map((m) => m.week_number));
  const existing = new Set<string>();
  for (const w of workouts) {
    const wk = weekByMicro.get(w.microcycle_id);
    if (wk == null) continue;
    if (w.status === "planned" && w.has_exercises === false) continue;
    existing.add(`${wk}:${w.day_number}`);
  }
  const gaps: CatchUpSource[] = [];
  for (const w of workouts) {
    if (w.status !== "completed" && w.status !== "skipped") continue;
    const wk = weekByMicro.get(w.microcycle_id);
    if (wk == null) continue;
    if (!weekNumbers.has(wk + 1)) continue; // no next week to generate into
    if (existing.has(`${wk + 1}:${w.day_number}`)) continue; // already generated
    gaps.push({ workoutId: w.id, week: wk, day: w.day_number });
  }
  return gaps.sort((a, b) => a.week - b.week || a.day - b.day);
}

/**
 * Fill generation gaps across a meso: for every closed day whose next-week
 * counterpart is missing, run the normal advance job to create it. Reuses
 * `advanceWeekAfterWorkout` (idempotent), so it composes with the per-completion
 * path and never touches started/completed workouts or logged sets.
 *
 * Why this exists: prescriptions are generated *per completed workout*. Any day
 * whose completion didn't run the job — seeded/imported history, a failed or
 * raced completion, a missed run — leaves a permanent hole the per-completion
 * path can't reach (a locked day can't be re-completed). This scan heals them,
 * idempotently, and is cheap when there is nothing to do.
 *
 * Returns the number of source days advanced.
 */
export async function getCatchUpSources(
  service: Client,
  userId: string,
  mesoId: string,
): Promise<CatchUpSource[]> {
  const { data: micros, error: microsError } = await service
    .from("microcycles")
    .select("id, week_number")
    .eq("mesocycle_id", mesoId)
    .eq("user_id", userId)
    .order("week_number");
  if (microsError) throw microsError;
  const weeks = micros ?? [];
  if (weeks.length < 2) return [];

  const { data: workouts, error: workoutsError } = await service
    .from("workouts")
    .select("id, microcycle_id, day_number, status")
    .in(
      "microcycle_id",
      weeks.map((m) => m.id),
    )
    .eq("user_id", userId);
  if (workoutsError) throw workoutsError;

  // which workouts actually hold exercises — an empty planned day is a
  // poisoned half-applied generation, and counts as a gap (R3)
  const populated = await workoutIdsWithExercises(
    service,
    (workouts ?? []).map((w) => w.id),
  );
  return planCatchUp(
    weeks,
    (workouts ?? []).map((w) => ({ ...w, has_exercises: populated.has(w.id) })),
  );
}

/** The subset of the given workout ids that have at least one exercise row. */
async function workoutIdsWithExercises(
  service: Client,
  workoutIds: string[],
): Promise<Set<string>> {
  if (workoutIds.length === 0) return new Set();
  const { data, error } = await service
    .from("workout_exercises")
    .select("workout_id")
    .in("workout_id", workoutIds);
  if (error) throw error;
  return new Set((data ?? []).map((w) => w.workout_id));
}

export async function catchUpMesoGeneration(
  service: Client,
  userId: string,
  mesoId: string,
): Promise<number> {
  const gaps = await getCatchUpSources(service, userId, mesoId);
  // advance is idempotent: a closed-week advance backfills its siblings, so a
  // later gap whose counterpart got backfilled is a safe no-op on its turn.
  for (const gap of gaps) {
    await advanceWeekAfterWorkout(service, userId, gap.workoutId);
  }
  return gaps.length;
}

export async function advanceWeekAfterWorkout(
  service: Client,
  userId: string,
  workoutId: string,
): Promise<AdvanceResult> {
  const { data: workout, error: workoutError } = await service
    .from("workouts")
    .select("*")
    .eq("id", workoutId)
    .eq("user_id", userId)
    .single();
  if (workoutError) throw workoutError;

  const { data: micro, error: microError } = await service
    .from("microcycles")
    .select("*")
    .eq("id", workout.microcycle_id)
    .eq("user_id", userId)
    .single();
  if (microError) throw microError;

  const [
    { data: meso, error: mesoError },
    { data: micros, error: microsError },
    { data: profile, error: profileError },
  ] = await Promise.all([
    service
      .from("mesocycles")
      .select("*")
      .eq("id", micro.mesocycle_id)
      .eq("user_id", userId)
      .single(),
    service
      .from("microcycles")
      .select("*")
      .eq("mesocycle_id", micro.mesocycle_id)
      .eq("user_id", userId)
      .order("week_number"),
    service.from("profiles").select("*").eq("id", userId).single(),
  ]);
  if (mesoError) throw mesoError;
  if (microsError) throw microsError;
  if (profileError) throw profileError;

  const weekMicros = micros ?? [];
  const nextMicro =
    weekMicros.find((m) => m.week_number === micro.week_number + 1) ?? null;

  // sibling workouts of the completed week, for navigation and week close
  const { data: siblings, error: siblingError } = await service
    .from("workouts")
    .select("*")
    .eq("microcycle_id", micro.id)
    .eq("user_id", userId)
    .order("day_number");
  if (siblingError) throw siblingError;
  const weekWorkouts = siblings ?? [];
  const weekClosed = weekWorkouts.every(
    (w) => w.status === "completed" || w.status === "skipped",
  );

  // final week of the meso: nothing to generate — close out the meso
  if (!nextMicro) {
    if (weekClosed && meso.status === "active") {
      const { error } = await service
        .from("mesocycles")
        .update({ status: "completed" })
        .eq("id", meso.id)
        .eq("user_id", userId);
      if (error) throw error;
    }
    const nextSibling = weekWorkouts.find(
      (w) =>
        w.day_number > workout.day_number &&
        (w.status === "planned" || w.status === "in_progress"),
    );
    return {
      summary: composeMesoCompleteSummary(meso.name),
      nextWorkoutId: nextSibling?.id ?? null,
      nextLabel: nextSibling
        ? `W${micro.week_number}·D${nextSibling.day_number}`
        : null,
    };
  }

  // -------------------------------------------------------------------------
  // assemble the shared week-N picture
  // -------------------------------------------------------------------------
  const weekWorkoutIds = weekWorkouts.map((w) => w.id);
  const { data: weekWesData, error: weekWesError } = await service
    .from("workout_exercises")
    .select("*")
    .in("workout_id", weekWorkoutIds);
  if (weekWesError) throw weekWesError;
  const weekWes = weekWesData ?? [];
  const weekWeIds = weekWes.map((we) => we.id);

  // prior prescriptions across the meso (weeks ≤ N) for deload peaks
  const priorMicroIds = weekMicros
    .filter((m) => m.week_number <= micro.week_number)
    .map((m) => m.id);
  const { data: mesoWorkouts, error: mesoWorkoutsError } = await service
    .from("workouts")
    .select("id")
    .in("microcycle_id", priorMicroIds)
    .eq("user_id", userId);
  if (mesoWorkoutsError) throw mesoWorkoutsError;

  const [
    { data: sets, error: setsError },
    { data: feedback, error: feedbackError },
    { data: workoutFeedback, error: wfError },
    { data: mesoWes, error: mesoWesError },
  ] = await Promise.all([
    weekWeIds.length > 0
      ? service
          .from("logged_sets")
          .select("*")
          .in("workout_exercise_id", weekWeIds)
          .eq("user_id", userId)
          .order("set_number")
      : Promise.resolve({ data: [] as LoggedSetRow[], error: null }),
    weekWeIds.length > 0
      ? service
          .from("exercise_feedback")
          .select("*")
          .in("workout_exercise_id", weekWeIds)
          .eq("user_id", userId)
      : Promise.resolve({ data: [] as ExerciseFeedbackRow[], error: null }),
    service
      .from("workout_feedback")
      .select("*")
      .in("workout_id", weekWorkoutIds)
      .eq("user_id", userId),
    service
      .from("workout_exercises")
      .select("*")
      .in("workout_id", (mesoWorkouts ?? []).map((w) => w.id)),
  ]);
  if (setsError) throw setsError;
  if (feedbackError) throw feedbackError;
  if (wfError) throw wfError;
  if (mesoWesError) throw mesoWesError;

  const exerciseIds = [...new Set(weekWes.map((we) => we.exercise_id))];
  const { data: exercises, error: exError } =
    exerciseIds.length > 0
      ? await service
          .from("exercises")
          .select("id, name, equipment_type")
          .in("id", exerciseIds)
      : { data: [], error: null };
  if (exError) throw exError;

  // goal context: macrocycle goal → standalone default (09 2026-06-13 §4: no
  // more slots; the macro's single goal drives progression)
  let macroGoal: MacroGoalType | null = null;
  if (meso.macrocycle_id) {
    const { data: macro, error } = await service
      .from("macrocycles")
      .select("goal_type")
      .eq("id", meso.macrocycle_id)
      .maybeSingle();
    if (error) throw error;
    macroGoal = macro?.goal_type ?? null;
  }

  const { version: paramsVersion, params } =
    await getActiveEngineParams(service);

  // recency-weighted strength anchors (value + confidence) per exercise, for
  // rep-window weight selection + RIR grading (doc 13). Cross-history, so a
  // mid-cycle swap-in with prior history is seeded sensibly.
  const anchorsByExercise = await getExerciseE1rmAnchors(
    service,
    userId,
    exerciseIds,
    params,
  );
  const overrideByExercise = await getExerciseParamOverrides(
    service,
    userId,
    exerciseIds,
  );
  // R14: each exercise's muscle links (id + role) so the weekly-set ceiling
  // input counts fractionally (1.0 primary / 0.5 secondary), not by-slot only
  const rolesByExercise = await getMuscleRoleIdsForExercises(
    service,
    exerciseIds,
  );

  const setsByWe = new Map<string, LoggedSetRow[]>();
  for (const s of sets ?? []) {
    const cur = setsByWe.get(s.workout_exercise_id) ?? [];
    cur.push(s);
    setsByWe.set(s.workout_exercise_id, cur);
  }

  const ctx: WeekContext = {
    service,
    userId,
    profile,
    params,
    paramsVersion,
    meso,
    micro,
    nextMicro,
    goal: engineGoal(macroGoal),
    weekWes,
    setsByWe,
    feedbackByWe: new Map(
      (feedback ?? []).map((f) => [f.workout_exercise_id, f]),
    ),
    workoutFeedbackByWorkout: new Map(
      (workoutFeedback ?? []).map((f) => [f.workout_id, f]),
    ),
    mgWeeklySets: weeklySetsByGroup(
      weekWes,
      rolesByExercise,
      volumeCountingWeights(params),
    ),
    peaks: peakByExercise(mesoWes ?? [], micro.target_rir),
    anchorsByExercise,
    equipmentByExercise: new Map(
      (exercises ?? []).map((e) => [e.id, e.equipment_type]),
    ),
    nameByExercise: new Map((exercises ?? []).map((e) => [e.id, e.name])),
    overrideByExercise,
  };

  // -------------------------------------------------------------------------
  // generate this day's week-N+1 counterpart (idempotent)
  // -------------------------------------------------------------------------
  const { data: existingNext, error: existingError } = await service
    .from("workouts")
    .select("*")
    .eq("microcycle_id", nextMicro.id)
    .eq("user_id", userId);
  if (existingError) throw existingError;
  // an EMPTY planned counterpart is a poisoned half-applied generation, not a
  // generated day — let generateDay adopt + fill it atomically (R3)
  const nextPopulated = await workoutIdsWithExercises(
    service,
    (existingNext ?? []).map((w) => w.id),
  );
  const generatedDays = new Set(
    (existingNext ?? [])
      .filter((w) => !(w.status === "planned" && !nextPopulated.has(w.id)))
      .map((w) => w.day_number),
  );

  let deltas: SummaryDelta[] = [];
  if (!generatedDays.has(workout.day_number)) {
    const result = await generateDay(ctx, workout);
    deltas = result.deltas;
    generatedDays.add(workout.day_number);
  }

  // -------------------------------------------------------------------------
  // week close: backfill skipped days, then activate week N+1
  // -------------------------------------------------------------------------
  if (weekClosed) {
    for (const sibling of weekWorkouts) {
      if (!generatedDays.has(sibling.day_number)) {
        await generateDay(ctx, sibling);
        generatedDays.add(sibling.day_number);
      }
    }
    if (nextMicro.status === "pending") {
      const { error } = await service
        .from("microcycles")
        .update({
          status: "active",
          start_date: new Date().toISOString().slice(0, 10),
        })
        .eq("id", nextMicro.id)
        .eq("user_id", userId);
      if (error) throw error;
    }
  }

  // navigation target: next uncompleted day this week, else W(N+1) day 1
  const nextSibling = weekWorkouts.find(
    (w) =>
      w.day_number > workout.day_number &&
      (w.status === "planned" || w.status === "in_progress"),
  );
  let nextWorkoutId = nextSibling?.id ?? null;
  let nextLabel = nextSibling
    ? `W${micro.week_number}·D${nextSibling.day_number}`
    : null;
  if (!nextSibling && weekClosed) {
    const { data: nextWeekWorkouts, error } = await service
      .from("workouts")
      .select("id, day_number")
      .eq("microcycle_id", nextMicro.id)
      .eq("user_id", userId)
      .order("day_number")
      .limit(1);
    if (error) throw error;
    if (nextWeekWorkouts && nextWeekWorkouts.length > 0) {
      nextWorkoutId = nextWeekWorkouts[0].id;
      nextLabel = `W${nextMicro.week_number}·D${nextWeekWorkouts[0].day_number}`;
    }
  }

  return {
    summary: composeAutoregulationSummary({
      nextWeekNumber: nextMicro.week_number,
      nextTargetRir: nextMicro.target_rir,
      nextIsDeload: nextMicro.is_deload,
      currentTargetRir: micro.target_rir,
      deltas,
    }),
    nextWorkoutId,
    nextLabel,
  };
}

// ---------------------------------------------------------------------------
// engine-decision reader (05 §explain_prescription) — surfaces the engine's
// recorded inputs/output/rationale for a prescription. Read-only and
// RLS-scoped: `engine_decisions` selects are gated to the owner (or admin), so
// this runs on the caller's own token-bound client, no service role.
// ---------------------------------------------------------------------------

export interface PrescriptionDecision {
  exercise_id: string;
  exercise_name: string;
  workout_exercise_id: string;
  /** W·D the prescription was generated for, when resolvable */
  coordinate: string | null;
  decided_at: string;
  params_version: number;
  inputs: Record<string, unknown>;
  output: Record<string, unknown>;
}

/**
 * The most recent engine decision for one of the user's exercises. Walks the
 * user's `workout_exercises` for the exercise (RLS-scoped through the parent
 * workout), then the latest `engine_decisions` row keyed to those. Returns null
 * when the engine has never prescribed the exercise for this user.
 */
export async function getLatestPrescriptionDecision(
  supabase: Client,
  userId: string,
  exerciseId: string,
): Promise<PrescriptionDecision | null> {
  const [{ data: exercise, error: exError }, { data: wes, error: weError }] =
    await Promise.all([
      supabase.from("exercises").select("name").eq("id", exerciseId).maybeSingle(),
      supabase
        .from("workout_exercises")
        .select("id, workout_id")
        .eq("exercise_id", exerciseId),
    ]);
  if (exError) throw exError;
  if (weError) throw weError;
  if (!wes || wes.length === 0) return null;

  const weById = new Map(wes.map((w) => [w.id, w]));
  const { data: decisions, error: decError } = await supabase
    .from("engine_decisions")
    .select("*")
    .eq("user_id", userId)
    .in(
      "workout_exercise_id",
      wes.map((w) => w.id),
    )
    .order("created_at", { ascending: false })
    .limit(1);
  if (decError) throw decError;
  if (!decisions || decisions.length === 0) return null;
  const decision = decisions[0];

  let coordinate: string | null = null;
  const we = decision.workout_exercise_id
    ? weById.get(decision.workout_exercise_id)
    : undefined;
  if (we) {
    const { data: workout, error: wError } = await supabase
      .from("workouts")
      .select("day_number, microcycle_id")
      .eq("id", we.workout_id)
      .maybeSingle();
    if (wError) throw wError;
    if (workout) {
      const { data: micro, error: mError } = await supabase
        .from("microcycles")
        .select("week_number")
        .eq("id", workout.microcycle_id)
        .maybeSingle();
      if (mError) throw mError;
      if (micro) coordinate = `W${micro.week_number}·D${workout.day_number}`;
    }
  }

  return {
    exercise_id: exerciseId,
    exercise_name: exercise?.name ?? "",
    workout_exercise_id: decision.workout_exercise_id ?? "",
    coordinate,
    decided_at: decision.created_at,
    params_version: decision.params_version,
    inputs: decision.inputs,
    output: decision.output,
  };
}

// ---------------------------------------------------------------------------
// projected prescription (§5.5) — when no decision was recorded for an exercise
// yet (the engine only writes one when a week is *generated*, and the exercise
// may not be in the latest generated day), recompute what the engine WOULD
// prescribe next, read-only, from the exercise's most recent completed week.
// Uses the same pure `prescribe()` and input assembly as live generation, so the
// projection is the engine's, not the model's. Clearly labeled as a projection.
// ---------------------------------------------------------------------------

export interface ProjectedPrescription {
  exercise_id: string;
  exercise_name: string;
  /** W·D the projection is computed from (the last completed session) */
  source_coordinate: string | null;
  /** the week the projection targets + how its RIR was chosen */
  projected_for: { target_rir: number; is_deload: boolean; basis: string };
  params_version: number;
  inputs: Record<string, unknown>;
  output: Record<string, unknown>;
}

export async function projectNextPrescription(
  supabase: Client,
  userId: string,
  exerciseId: string,
): Promise<ProjectedPrescription | null> {
  const [{ data: exercise, error: exError }, { data: wes, error: weError }] =
    await Promise.all([
      supabase
        .from("exercises")
        .select("id, name, equipment_type")
        .eq("id", exerciseId)
        .maybeSingle(),
      supabase.from("workout_exercises").select("*").eq("exercise_id", exerciseId),
    ]);
  if (exError) throw exError;
  if (weError) throw weError;
  if (!exercise || !wes || wes.length === 0) return null;

  // the exercise's most recent *completed* workout = the projection source
  const { data: sourceWorkout, error: swError } = await supabase
    .from("workouts")
    .select("*")
    .in("id", wes.map((w) => w.workout_id))
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("performed_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (swError) throw swError;
  if (!sourceWorkout) return null;

  const { data: micro, error: microError } = await supabase
    .from("microcycles")
    .select("*")
    .eq("id", sourceWorkout.microcycle_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (microError) throw microError;
  if (!micro) return null;

  const [
    { data: meso, error: mesoError },
    { data: micros, error: microsError },
    { data: profile, error: profileError },
  ] = await Promise.all([
    supabase.from("mesocycles").select("*").eq("id", micro.mesocycle_id).maybeSingle(),
    supabase
      .from("microcycles")
      .select("*")
      .eq("mesocycle_id", micro.mesocycle_id)
      .eq("user_id", userId)
      .order("week_number"),
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
  ]);
  if (mesoError) throw mesoError;
  if (microsError) throw microsError;
  if (profileError) throw profileError;
  if (!meso || !profile) return null;

  // sibling workouts of the source week → the shared week-N picture
  const { data: siblings, error: sibError } = await supabase
    .from("workouts")
    .select("*")
    .eq("microcycle_id", micro.id)
    .eq("user_id", userId)
    .order("day_number");
  if (sibError) throw sibError;
  const weekWorkouts = siblings ?? [];
  const weekWorkoutIds = weekWorkouts.map((w) => w.id);

  const { data: weekWesData, error: weekWesError } = await supabase
    .from("workout_exercises")
    .select("*")
    .in("workout_id", weekWorkoutIds);
  if (weekWesError) throw weekWesError;
  const weekWes = weekWesData ?? [];
  const weekWeIds = weekWes.map((we) => we.id);

  // the source we for THIS exercise in the source workout
  const sourceWe = weekWes.find(
    (we) => we.workout_id === sourceWorkout.id && we.exercise_id === exerciseId,
  );
  if (!sourceWe) return null;

  // prior meso weeks (≤ N) for deload peak sizing
  const priorMicroIds = (micros ?? [])
    .filter((m) => m.week_number <= micro.week_number)
    .map((m) => m.id);
  const { data: mesoWorkouts, error: mwError } = await supabase
    .from("workouts")
    .select("id")
    .in("microcycle_id", priorMicroIds)
    .eq("user_id", userId);
  if (mwError) throw mwError;

  const [
    { data: sets, error: setsError },
    { data: feedback, error: fbError },
    { data: workoutFeedback, error: wfError },
    { data: mesoWes, error: mesoWesError },
  ] = await Promise.all([
    weekWeIds.length > 0
      ? supabase
          .from("logged_sets")
          .select("*")
          .in("workout_exercise_id", weekWeIds)
          .eq("user_id", userId)
          .order("set_number")
      : Promise.resolve({ data: [] as LoggedSetRow[], error: null }),
    weekWeIds.length > 0
      ? supabase
          .from("exercise_feedback")
          .select("*")
          .in("workout_exercise_id", weekWeIds)
          .eq("user_id", userId)
      : Promise.resolve({ data: [] as ExerciseFeedbackRow[], error: null }),
    supabase
      .from("workout_feedback")
      .select("*")
      .in("workout_id", weekWorkoutIds)
      .eq("user_id", userId),
    supabase
      .from("workout_exercises")
      .select("*")
      .in("workout_id", (mesoWorkouts ?? []).map((w) => w.id)),
  ]);
  if (setsError) throw setsError;
  if (fbError) throw fbError;
  if (wfError) throw wfError;
  if (mesoWesError) throw mesoWesError;

  // goal context from the macrocycle (standalone → gain)
  let macroGoal: MacroGoalType | null = null;
  if (meso.macrocycle_id) {
    const { data: macro, error } = await supabase
      .from("macrocycles")
      .select("goal_type")
      .eq("id", meso.macrocycle_id)
      .maybeSingle();
    if (error) throw error;
    macroGoal = macro?.goal_type ?? null;
  }

  const { version: paramsVersion, params } = await getActiveEngineParams(supabase);

  const setsByWe = new Map<string, LoggedSetRow[]>();
  for (const s of sets ?? []) {
    const cur = setsByWe.get(s.workout_exercise_id) ?? [];
    cur.push(s);
    setsByWe.set(s.workout_exercise_id, cur);
  }
  const feedbackByWe = new Map(
    (feedback ?? []).map((f) => [f.workout_exercise_id, f]),
  );

  // group-scoped pump/workload from whichever exercise closed each group, for
  // the source day (mirrors generateDay)
  const dayWes = weekWes.filter((we) => we.workout_id === sourceWorkout.id);
  const groupFeedback = new Map<string, { pump: number | null; workload: number | null }>();
  for (const we of dayWes) {
    const fb = feedbackByWe.get(we.id);
    if (fb?.muscle_group_id && (fb.pump != null || fb.workload != null)) {
      groupFeedback.set(fb.muscle_group_id, { pump: fb.pump, workload: fb.workload });
    }
  }

  // target week: the meso's next microcycle if one exists, else hold this
  // week's RIR (the meso is over / not yet extended — labeled so)
  const nextMicro =
    (micros ?? []).find((m) => m.week_number === micro.week_number + 1) ?? null;
  const nextWeek = nextMicro
    ? { targetRir: nextMicro.target_rir, isDeload: nextMicro.is_deload }
    : { targetRir: micro.target_rir, isDeload: false };
  const basis = nextMicro
    ? `next week W${nextMicro.week_number} (target RIR ${nextMicro.target_rir}${nextMicro.is_deload ? ", deload" : ""})`
    : `no later week exists in this block — projected holding W${micro.week_number}'s target RIR ${micro.target_rir}`;

  const anchors = await getExerciseE1rmAnchors(
    supabase,
    userId,
    [exerciseId],
    params,
  );
  // R14: fractional weekly-set ceiling input (mirrors generateDay)
  const weekRoles = await getMuscleRoleIdsForExercises(
    supabase,
    weekWes.map((we) => we.exercise_id),
  );
  const inputs = buildEngineInputs({
    we: sourceWe,
    sets: setsByWe.get(sourceWe.id) ?? [],
    feedback: feedbackByWe.get(sourceWe.id) ?? null,
    groupFeedback: sourceWe.muscle_group_id
      ? (groupFeedback.get(sourceWe.muscle_group_id) ?? null)
      : null,
    workoutFeedback:
      (workoutFeedback ?? []).find((f) => f.workout_id === sourceWorkout.id) ?? null,
    microTargetRir: micro.target_rir,
    nextWeek,
    goal: engineGoal(macroGoal),
    equipmentType: exercise.equipment_type,
    profile,
    muscleGroupWeeklySets: sourceWe.muscle_group_id
      ? (weeklySetsByGroup(
          weekWes,
          weekRoles,
          volumeCountingWeights(params),
        ).get(sourceWe.muscle_group_id) ?? null)
      : null,
    weekPeak: peakByExercise(mesoWes ?? [], micro.target_rir).get(exerciseId) ?? null,
    strengthAnchor: anchors.get(exerciseId) ?? null,
    bodyweight: profile.bodyweight ?? null,
  });
  const override = await getExerciseIncrementOverride(supabase, userId, exerciseId);
  const output = prescribe(
    inputs,
    resolveEffectiveParams(
      params,
      override == null ? null : { weightIncrement: override },
      toEngineEquipment(exercise.equipment_type),
    ),
  );

  return {
    exercise_id: exerciseId,
    exercise_name: exercise.name,
    source_coordinate: `W${micro.week_number}·D${sourceWorkout.day_number}`,
    projected_for: { target_rir: nextWeek.targetRir, is_deload: nextWeek.isDeload, basis },
    params_version: paramsVersion,
    inputs: inputs as unknown as Record<string, unknown>,
    output: output as unknown as Record<string, unknown>,
  };
}
