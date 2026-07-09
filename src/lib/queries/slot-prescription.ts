import type { SupabaseClient } from "@supabase/supabase-js";
import {
  prescribe,
  resolveEffectiveParams,
  seedMeso,
  toEngineEquipment,
  toEngineLoadType,
  volumeCountingWeights,
  type E1rmAnchor,
  type EngineInputs,
  type EngineParams,
  type ExerciseParamOverride,
  type Prescription,
} from "@/lib/engine";
import type {
  Database,
  EngineDecisionKind,
  ExerciseFeedbackRow,
  LoggedSetRow,
  ProfileRow,
  WorkoutExerciseRow,
  WorkoutFeedbackRow,
} from "@/lib/types/database";
import { getActiveEngineParams } from "./generation";
import { getExerciseE1rmAnchors } from "./anchors";
import { getExerciseParamOverrides } from "./exercise-overrides";
import { getMuscleRoleIdsForExercises } from "./exercises";
import {
  buildEngineInputs,
  peakByExercise,
  weeklySetsByGroup,
} from "./progression";
import { engineGoal, type EngineGoal } from "./engine-goal";
import {
  buildSeedInputs,
  computeDepFingerprint,
  configProjection,
  paramsTokenFor,
} from "./fingerprint";

type Client = SupabaseClient<Database>;

/**
 * Slot prescription resolver (N33, review doc 2026-07-04 §6/§9): the ONE way a
 * prescription enters a live workout's slot outside meso generation — an
 * exercise swap (`replaceWorkoutExercise`) or a mid-workout add
 * (`addWorkoutExercises`). Both entry points previously diverged: the add path
 * ran the pure `seedMeso` and recorded a decision (doc 14 §6.2), while the swap
 * wrote the user's all-time PR onto half the prescription tuple with no engine
 * call, no decision, and no fingerprint restamp — leaving the audit surface
 * incoherent and the freshness framework blind to the change.
 *
 * The resolver derives the engine KIND from the data, not from how the slot
 * came to exist:
 *   - ADVANCE when the incoming exercise has a recent same-day-slot completed
 *     instance in this meso (the §9 lookback: most recent instance WITH logged
 *     working sets within `LOOKBACK_WEEKS`, else the week-(N-1) counterpart even
 *     set-less — parity with `generateDay`'s empty-advance/hold). A swap-out /
 *     swap-back round trip therefore RESTORES the engine prescription instead
 *     of reseeding at the PR.
 *   - SEED otherwise — exactly the doc 14 §6.2 cold start (§S1 anchor pricing,
 *     the PR modeled as the cold-start `initial`, week RIR).
 *
 * Every result carries the full tuple + inputs + fingerprint so the caller can
 * write the row AND record the decision — a slot can never again hold numbers
 * the engine didn't produce (review doc §6 S1/S3).
 */

/** §9: how far back a missed/swapped week may reach for its advance source. */
export const LOOKBACK_WEEKS = 2;

export interface SlotPrescriptionResult {
  exerciseId: string;
  kind: EngineDecisionKind;
  /** the week-(N-k) source row an advance progresses from; null for a seed */
  sourceWorkoutExerciseId: string | null;
  inputs: EngineInputs;
  output: Prescription;
  depFingerprint: string;
  /** the incoming exercise's primary muscle group (for fresh-slot inserts) */
  muscleGroupId: string | null;
}

export interface SlotPrescriptionBatch {
  results: Map<string, SlotPrescriptionResult>;
  paramsVersion: number;
  params: EngineParams;
  coords: { workoutId: string; microcycleId: string; mesocycleId: string };
}

/**
 * Pure (§9 selection rule): pick the advance source from the lookback
 * candidates. Preference order:
 *   1. the most recent candidate WITH logged working sets (grade real work);
 *   2. else the week-(N-1) counterpart even without sets (parity with
 *      `generateDay`, whose empty advance holds/reprices off the anchor);
 *   3. else none — cold seed. A set-less week-(N-2) row is deliberately NOT
 *      advanced from: a two-week-old empty hold carries no information a
 *      cold anchor seed doesn't.
 */
export function chooseAdvanceSource<T>(
  candidates: { offset: number; hasSets: boolean; source: T }[],
): T | null {
  const withSets = [...candidates]
    .filter((c) => c.hasSets)
    .sort((a, b) => a.offset - b.offset);
  if (withSets.length > 0) return withSets[0].source;
  const w1 = candidates.find((c) => c.offset === 1);
  return w1 ? w1.source : null;
}

/** Everything one slot's computation needs, already fetched (pure input). */
export interface SlotComputationArgs {
  exerciseId: string;
  /** the TARGET week the slot lives in */
  week: { targetRir: number; isDeload: boolean };
  equipmentType: string;
  loadType: string | null;
  profile: Pick<ProfileRow, "experience_level">;
  bodyweight: number | null;
  goal: EngineGoal;
  params: EngineParams;
  paramsVersion: number;
  override: ExerciseParamOverride | null;
  anchor: E1rmAnchor | null;
  pr: { best_weight: number | null; best_reps: number | null } | null;
  /** cold-start set count when seeding (a swap passes the slot's current sets) */
  initialSets: number;
  /** the assembled advance basis, or null → cold seed */
  advance: {
    sourceWe: WorkoutExerciseRow;
    sourceTargetRir: number;
    sets: LoggedSetRow[];
    feedback: ExerciseFeedbackRow | null;
    groupFeedback: { pump: number | null; workload: number | null } | null;
    workoutFeedback: WorkoutFeedbackRow | null;
    muscleGroupWeeklySets: number | null;
    weekPeak: EngineInputs["weekPeak"];
  } | null;
}

/**
 * Pure: compute one slot's prescription (kind derived from the presence of an
 * advance basis). Exported for unit tests (hard rule #3 discipline — the I/O
 * orchestrator below stays thin). If the advance replay throws (malformed
 * source data), falls back to the cold seed rather than failing the user's
 * swap/add.
 */
export function computeSlotPrescription(
  args: SlotComputationArgs,
): Omit<SlotPrescriptionResult, "muscleGroupId"> {
  const effectiveParams = resolveEffectiveParams(
    args.params,
    args.override,
    toEngineEquipment(args.equipmentType),
  );

  if (args.advance) {
    const a = args.advance;
    const inputs = buildEngineInputs({
      we: a.sourceWe,
      sets: a.sets,
      feedback: a.feedback,
      groupFeedback: a.groupFeedback,
      workoutFeedback: a.workoutFeedback,
      microTargetRir: a.sourceTargetRir,
      nextWeek: args.week,
      goal: args.goal,
      equipmentType: args.equipmentType,
      loadType: args.loadType,
      profile: args.profile,
      muscleGroupWeeklySets: a.muscleGroupWeeklySets,
      weekPeak: a.weekPeak,
      strengthAnchor: args.anchor,
      bodyweight: args.bodyweight,
    });
    try {
      const output = prescribe(inputs, effectiveParams);
      return {
        exerciseId: args.exerciseId,
        kind: "advance",
        sourceWorkoutExerciseId: a.sourceWe.id,
        inputs,
        output,
        depFingerprint: computeDepFingerprint(
          configProjection(inputs),
          paramsTokenFor(args.paramsVersion, args.override?.weightIncrement),
        ),
      };
    } catch {
      // fall through to the cold seed — a swap must never fail on a replayable
      // source defect; the seed is always computable.
    }
  }

  // cold seed — identical to the doc 14 §6.2 add path: the user's best is the
  // cold-start `initial` (no prior-meso peak ⇒ no backoff) and §S1 prices off
  // the recency anchor when one is confident.
  const initial = {
    weight: args.pr?.best_weight ?? null,
    reps: args.pr?.best_reps ?? null,
    sets: args.initialSets,
  };
  const output = seedMeso(
    null,
    initial,
    {
      equipmentType: toEngineEquipment(args.equipmentType),
      loadType: toEngineLoadType(args.equipmentType),
    },
    { experienceLevel: args.profile.experience_level ?? "beginner" },
    args.week.targetRir,
    args.params,
    {
      goalType: args.goal,
      anchor: args.anchor,
      bodyweight: args.bodyweight,
      // doc 16 §3.7: a swap/add has no compliance context ⇒ never earns (no
      // `earn` opt); a deload target week bypasses the progression wrapper.
      isDeload: args.week.isDeload,
    },
  );
  const inputs = buildSeedInputs({
    equipmentType: args.equipmentType,
    profile: args.profile,
    goal: args.goal,
    startRir: args.week.targetRir,
    isDeload: args.week.isDeload,
    initial,
    priorPeak: null,
    strengthAnchor: args.anchor,
    bodyweight: args.bodyweight,
  });
  return {
    exerciseId: args.exerciseId,
    kind: "seed",
    sourceWorkoutExerciseId: null,
    inputs,
    output,
    depFingerprint: computeDepFingerprint(
      configProjection(inputs),
      paramsTokenFor(args.paramsVersion, args.override?.weightIncrement),
    ),
  };
}

/** The meso's progression goal for a slot (macro goal → default). */
async function resolveSlotGoal(
  supabase: Client,
  mesocycleId: string,
): Promise<EngineGoal> {
  const { data: meso, error } = await supabase
    .from("mesocycles")
    .select("macrocycle_id")
    .eq("id", mesocycleId)
    .maybeSingle();
  if (error) throw error;
  if (!meso?.macrocycle_id) return engineGoal(null);
  const { data: macro, error: macroErr } = await supabase
    .from("macrocycles")
    .select("goal_type")
    .eq("id", meso.macrocycle_id)
    .maybeSingle();
  if (macroErr) throw macroErr;
  return engineGoal(macro?.goal_type ?? null);
}

/**
 * Compute prescriptions for one or more incoming exercises on a live workout.
 * One orchestrator for both the swap and the add path: resolves the shared
 * config dimensions once, finds each exercise's §9 advance source (same
 * day-slot, same exercise, completed/skipped, within `LOOKBACK_WEEKS`),
 * assembles the advance basis exactly like `generateDay`/the §7c backfill, and
 * runs the pure compute per slot.
 */
export async function computeSlotPrescriptions(
  supabase: Client,
  userId: string,
  workoutId: string,
  exerciseIds: string[],
  opts?: { initialSetsByExercise?: Map<string, number> },
): Promise<SlotPrescriptionBatch> {
  // target slot context: workout → microcycle (week/RIR/deload/meso)
  const { data: workout, error: wErr } = await supabase
    .from("workouts")
    .select("id, day_number, microcycle_id")
    .eq("id", workoutId)
    .single();
  if (wErr) throw wErr;
  const { data: micro, error: mErr } = await supabase
    .from("microcycles")
    .select("id, mesocycle_id, week_number, target_rir, is_deload")
    .eq("id", workout.microcycle_id)
    .single();
  if (mErr) throw mErr;

  const { version: paramsVersion, params } = await getActiveEngineParams(supabase);
  const [
    { data: links, error: linkErr },
    { data: prs, error: prErr },
    { data: exercises, error: exErr },
    { data: profile, error: pErr },
    goal,
    overrideByEx,
    anchorByEx,
  ] = await Promise.all([
    supabase
      .from("exercise_muscle_groups")
      .select("exercise_id, muscle_group_id")
      .in("exercise_id", exerciseIds)
      .eq("role", "primary"),
    supabase
      .from("v_exercise_prs")
      .select("exercise_id, best_weight, best_reps")
      .eq("user_id", userId)
      .in("exercise_id", exerciseIds),
    supabase
      .from("exercises")
      .select("id, equipment_type, load_type")
      .in("id", exerciseIds),
    supabase
      .from("profiles")
      .select("experience_level, bodyweight")
      .eq("id", userId)
      .single(),
    resolveSlotGoal(supabase, micro.mesocycle_id),
    getExerciseParamOverrides(supabase, userId, exerciseIds),
    // §S1: recency strength anchors — drive both the anchor seed and the
    // advance replay's live repricing
    getExerciseE1rmAnchors(supabase, userId, exerciseIds, params),
  ]);
  if (linkErr) throw linkErr;
  if (prErr) throw prErr;
  if (exErr) throw exErr;
  if (pErr) throw pErr;
  const mgByEx = new Map((links ?? []).map((l) => [l.exercise_id, l.muscle_group_id]));
  const prByEx = new Map((prs ?? []).map((p) => [p.exercise_id, p]));
  const exByEx = new Map((exercises ?? []).map((e) => [e.id, e]));

  // §9 advance-source lookup: same day slot, same exercise, closed workout,
  // weeks [N-LOOKBACK .. N-1] of this meso, most-recent-with-sets preferred.
  const advanceByEx = await findAdvanceBases(
    supabase,
    userId,
    {
      mesocycleId: micro.mesocycle_id,
      weekNumber: micro.week_number,
      dayNumber: workout.day_number,
    },
    exerciseIds,
    params,
  );

  const results = new Map<string, SlotPrescriptionResult>();
  for (const id of exerciseIds) {
    const ex = exByEx.get(id);
    const computed = computeSlotPrescription({
      exerciseId: id,
      week: { targetRir: micro.target_rir, isDeload: micro.is_deload },
      equipmentType: ex?.equipment_type ?? "other",
      loadType: ex?.load_type ?? null,
      profile: { experience_level: profile.experience_level },
      bodyweight: profile.bodyweight ?? null,
      goal,
      params,
      paramsVersion,
      override: overrideByEx.get(id) ?? null,
      anchor: anchorByEx.get(id) ?? null,
      pr: prByEx.get(id) ?? null,
      initialSets: opts?.initialSetsByExercise?.get(id) ?? 3,
      advance: advanceByEx.get(id) ?? null,
    });
    results.set(id, { ...computed, muscleGroupId: mgByEx.get(id) ?? null });
  }

  return {
    results,
    paramsVersion,
    params,
    coords: {
      workoutId,
      microcycleId: micro.id,
      mesocycleId: micro.mesocycle_id,
    },
  };
}

/**
 * Find + assemble the §9 advance basis per incoming exercise. Mirrors the
 * per-exercise assembly of `generateDay` / the reconcile's §7c backfill: the
 * source's logged sets, its joint-pain feedback + the group-closing pump /
 * workload, the source workout's session feedback, the source WEEK's planned
 * weekly sets (fractionally counted), and the heaviest meso prescription up to
 * the source week.
 */
async function findAdvanceBases(
  supabase: Client,
  userId: string,
  target: { mesocycleId: string; weekNumber: number; dayNumber: number },
  exerciseIds: string[],
  params: EngineParams,
): Promise<Map<string, NonNullable<SlotComputationArgs["advance"]>>> {
  const out = new Map<string, NonNullable<SlotComputationArgs["advance"]>>();
  if (target.weekNumber <= 1 || exerciseIds.length === 0) return out;

  const minWeek = Math.max(1, target.weekNumber - LOOKBACK_WEEKS);
  const { data: micros, error: microErr } = await supabase
    .from("microcycles")
    .select("id, week_number, target_rir")
    .eq("mesocycle_id", target.mesocycleId)
    .eq("user_id", userId)
    .gte("week_number", minWeek)
    .lt("week_number", target.weekNumber);
  if (microErr) throw microErr;
  if (!micros || micros.length === 0) return out;
  const microById = new Map(micros.map((m) => [m.id, m]));

  const { data: candWorkouts, error: cwErr } = await supabase
    .from("workouts")
    .select("id, microcycle_id, day_number, status")
    .in("microcycle_id", micros.map((m) => m.id))
    .eq("user_id", userId)
    .eq("day_number", target.dayNumber)
    .in("status", ["completed", "skipped"]);
  if (cwErr) throw cwErr;
  if (!candWorkouts || candWorkouts.length === 0) return out;
  const candWorkoutById = new Map(candWorkouts.map((w) => [w.id, w]));

  const { data: candWes, error: weErr } = await supabase
    .from("workout_exercises")
    .select("*")
    .in("workout_id", candWorkouts.map((w) => w.id))
    .in("exercise_id", exerciseIds);
  if (weErr) throw weErr;
  if (!candWes || candWes.length === 0) return out;

  // working-set presence per candidate (the §9 "instance you actually did" rule)
  const { data: candSets, error: csErr } = await supabase
    .from("logged_sets")
    .select("workout_exercise_id")
    .in("workout_exercise_id", candWes.map((w) => w.id))
    .eq("is_warmup", false);
  if (csErr) throw csErr;
  const hasSets = new Set((candSets ?? []).map((s) => s.workout_exercise_id));

  // pick per exercise via the pure §9 rule
  const chosen = new Map<string, WorkoutExerciseRow>();
  for (const id of exerciseIds) {
    const candidates = (candWes as WorkoutExerciseRow[])
      .filter((we) => we.exercise_id === id)
      .map((we) => {
        const w = candWorkoutById.get(we.workout_id);
        const m = w ? microById.get(w.microcycle_id) : undefined;
        return m
          ? {
              offset: target.weekNumber - m.week_number,
              hasSets: hasSets.has(we.id),
              source: we,
            }
          : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    const src = chooseAdvanceSource(candidates);
    if (src) chosen.set(id, src);
  }
  if (chosen.size === 0) return out;

  // assemble the derived history for each chosen source, generateDay-style
  const srcWorkoutIds = [...new Set([...chosen.values()].map((s) => s.workout_id))];
  const srcWeekNumbers = [...chosen.values()].map((s) => {
    const w = candWorkoutById.get(s.workout_id)!;
    return microById.get(w.microcycle_id)!.week_number;
  });
  const maxSrcWeek = Math.max(...srcWeekNumbers);

  // the meso's rows up to the deepest source week (weekly sets + peaks input)
  const { data: allMicros, error: amErr } = await supabase
    .from("microcycles")
    .select("id, week_number, target_rir")
    .eq("mesocycle_id", target.mesocycleId)
    .eq("user_id", userId)
    .lte("week_number", maxSrcWeek);
  if (amErr) throw amErr;
  const allMicroById = new Map((allMicros ?? []).map((m) => [m.id, m]));
  const { data: scopeWorkouts, error: swErr } = await supabase
    .from("workouts")
    .select("id, microcycle_id, day_number, status")
    .in("microcycle_id", (allMicros ?? []).map((m) => m.id))
    .eq("user_id", userId);
  if (swErr) throw swErr;
  const scopeWorkoutById = new Map((scopeWorkouts ?? []).map((w) => [w.id, w]));
  const { data: scopeWes, error: sweErr } = await supabase
    .from("workout_exercises")
    .select("*")
    .in("workout_id", (scopeWorkouts ?? []).map((w) => w.id));
  if (sweErr) throw sweErr;
  const wes = (scopeWes ?? []) as WorkoutExerciseRow[];

  const srcWes = wes.filter((we) => srcWorkoutIds.includes(we.workout_id));
  const srcWeIds = srcWes.map((we) => we.id);
  const [
    { data: srcSets, error: ssErr },
    { data: srcFb, error: sfErr },
    { data: srcWf, error: wfErr },
    roles,
  ] = await Promise.all([
    supabase
      .from("logged_sets")
      .select("*")
      .in("workout_exercise_id", srcWeIds)
      .eq("user_id", userId)
      .order("set_number"),
    supabase
      .from("exercise_feedback")
      .select("*")
      .in("workout_exercise_id", srcWeIds)
      .eq("user_id", userId),
    supabase
      .from("workout_feedback")
      .select("*")
      .in("workout_id", srcWorkoutIds)
      .eq("user_id", userId),
    getMuscleRoleIdsForExercises(supabase, wes.map((we) => we.exercise_id)),
  ]);
  if (ssErr) throw ssErr;
  if (sfErr) throw sfErr;
  if (wfErr) throw wfErr;

  const setsByWe = new Map<string, LoggedSetRow[]>();
  for (const s of (srcSets ?? []) as LoggedSetRow[]) {
    const cur = setsByWe.get(s.workout_exercise_id) ?? [];
    cur.push(s);
    setsByWe.set(s.workout_exercise_id, cur);
  }
  const fbByWe = new Map(
    ((srcFb ?? []) as ExerciseFeedbackRow[]).map((f) => [f.workout_exercise_id, f]),
  );
  const wfByWorkout = new Map(
    ((srcWf ?? []) as WorkoutFeedbackRow[]).map((f) => [f.workout_id, f]),
  );
  // group-scoped pump/workload lives on whichever exercise closed each group,
  // resolved per source workout (matches generateDay / §7c)
  const groupFbByWorkout = new Map<
    string,
    Map<string, { pump: number | null; workload: number | null }>
  >();
  for (const we of srcWes) {
    const fb = fbByWe.get(we.id);
    if (we.muscle_group_id && fb && (fb.pump != null || fb.workload != null)) {
      const m = groupFbByWorkout.get(we.workout_id) ?? new Map();
      m.set(we.muscle_group_id, { pump: fb.pump, workload: fb.workload });
      groupFbByWorkout.set(we.workout_id, m);
    }
  }

  const weights = volumeCountingWeights(params);
  const wesByWeek = new Map<number, WorkoutExerciseRow[]>();
  for (const we of wes) {
    const w = scopeWorkoutById.get(we.workout_id);
    const m = w ? allMicroById.get(w.microcycle_id) : undefined;
    if (!m) continue;
    const cur = wesByWeek.get(m.week_number) ?? [];
    cur.push(we);
    wesByWeek.set(m.week_number, cur);
  }

  for (const [exerciseId, srcWe] of chosen) {
    const srcWorkout = candWorkoutById.get(srcWe.workout_id)!;
    const srcMicro = microById.get(srcWorkout.microcycle_id)!;
    const priorWes = wes.filter((we) => {
      const w = scopeWorkoutById.get(we.workout_id);
      const m = w ? allMicroById.get(w.microcycle_id) : undefined;
      return m != null && m.week_number <= srcMicro.week_number;
    });
    const mgWeekly = weeklySetsByGroup(
      wesByWeek.get(srcMicro.week_number) ?? [],
      roles,
      weights,
    );
    const peaks = peakByExercise(priorWes, srcMicro.target_rir);
    out.set(exerciseId, {
      sourceWe: srcWe,
      sourceTargetRir: srcMicro.target_rir,
      sets: setsByWe.get(srcWe.id) ?? [],
      feedback: fbByWe.get(srcWe.id) ?? null,
      groupFeedback: srcWe.muscle_group_id
        ? (groupFbByWorkout.get(srcWe.workout_id)?.get(srcWe.muscle_group_id) ?? null)
        : null,
      workoutFeedback: wfByWorkout.get(srcWe.workout_id) ?? null,
      muscleGroupWeeklySets: srcWe.muscle_group_id
        ? (mgWeekly.get(srcWe.muscle_group_id) ?? null)
        : null,
      weekPeak: peaks.get(exerciseId) ?? null,
    });
  }
  return out;
}
