import type { SupabaseClient } from "@supabase/supabase-js";
import {
  engineInputsSchema,
  prescribe,
  type E1rmAnchor,
  type EngineInputs,
  type EngineParams,
  type Prescription,
} from "@/lib/engine";
import type { Database } from "@/lib/types/database";
import { getExerciseE1rmAnchors } from "./logging";
import { getActiveEngineParams } from "./generation";
import { catchUpMesoGeneration, engineGoal } from "./progression";
import { engineCodeSha, hashParams } from "./params-provenance";
import {
  buildConfigInputs,
  computeDepFingerprint,
  type ConfigInputs,
  type ParamsToken,
} from "./fingerprint";
import type { MacroGoalType } from "@/lib/types/database";

/**
 * Prescription freshness reconcile (doc 14) — the single "keep stored
 * prescriptions correct" operation, run on the read path.
 *
 * A prescription is a cached derived value: the output of the pure engine, frozen
 * at a meso seed or a week N→N+1 advance, then displayed for days. It goes stale
 * the instant any input that fed it changes (engine params, profile, macro goal,
 * meso config, the upstream week's prescription). Rather than make each source
 * hunt down and flag the rows it affects, every prescription carries a fingerprint
 * of the CONFIG projection of its inputs (doc 14 §3); on read we re-resolve those
 * inputs as they are NOW and compare. A mismatch means stale, and exactly the
 * diverged rows recompute — lazily, in week order, lightly (a hash compare).
 *
 * This supersedes the single-scalar `params_version` staleness gate (doc 14 §9):
 * the params version is now just one component of the fingerprint, and the
 * fingerprint additionally sees every other config input the engine consumes.
 *
 * Scope / invariants (CLAUDE.md hard rules):
 *   - #5 immutable history: only `planned` workouts, only `workout_exercises`
 *     with NO logged set, are ever rewritten; logged sets and manual `set_weights`
 *     overrides are untouched.
 *   - #4 service-role scoping: the caller passes a service client; every read and
 *     write is scoped to the row's own server-derived owner, never a tool arg.
 *   - #3 engine purity: all resolution + hashing live here; the engine still takes
 *     one resolved `EngineInputs` + `EngineParams`.
 */

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// pure recompute core (unit-tested; doc 14 §6.1) — replay the row's stored
// derived inputs through the engine with the LIVE config overlaid + a refreshed
// strength anchor, then classify the outcome. This is the reshaped core of the
// old plan/applyRegeneration (doc 14 §10): same replay→classify→write, now keyed
// on the dependency fingerprint instead of a params-version diff.
// ---------------------------------------------------------------------------

export type RecomputeStatus = "changed" | "unchanged" | "invalid_source";

export interface RecomputeArgs {
  /** the diverged row's latest decision inputs (source of the derived history) */
  storedInputs: Record<string, unknown>;
  /** the freshly-resolved config inputs (live equipment/profile/goal/week/previous) */
  liveConfig: ConfigInputs;
  /** the strength anchor recomputed from current logged history (or null) */
  anchor: E1rmAnchor | null;
  /** the row's current stored prescription, for diffing */
  currentOutput: Pick<Prescription, "weight" | "reps" | "sets" | "targetRir">;
}

export interface RecomputeResult {
  status: RecomputeStatus;
  /** the rebuilt inputs that produced `output` (present unless invalid_source) */
  inputs?: EngineInputs;
  /** the freshly computed prescription (present unless invalid_source) */
  output?: Prescription;
}

const PRESCRIPTION_FIELDS = ["weight", "reps", "sets", "targetRir"] as const;

/** Did the engine output diverge from the stored prescription? (ignores prose) */
function prescriptionChanged(
  stored: RecomputeArgs["currentOutput"],
  fresh: Pick<Prescription, "weight" | "reps" | "sets" | "targetRir">,
): boolean {
  return PRESCRIPTION_FIELDS.some(
    (f) => JSON.stringify(stored[f]) !== JSON.stringify(fresh[f]),
  );
}

/**
 * Pure: rebuild a diverged row's engine inputs from its immutable derived history
 * (`storedInputs`) + the live config + a fresh anchor, run the engine, and report
 * whether the prescription changed. No I/O — same inputs + params ⇒ same plan, so
 * it is unit-tested directly (hard rule #3).
 *
 * Reusing the stored derived inputs is correct (doc 14 §6.4): an open
 * prescription's `previous` and derived inputs come from immutable, completed work
 * that doesn't drift mid-view. Overlaying the live config is what makes a profile /
 * goal / meso / params / upstream-week change take effect; refreshing the anchor is
 * what makes a config-triggered recompute also pick up the latest history.
 */
export function recomputeRow(
  args: RecomputeArgs,
  params: EngineParams,
): RecomputeResult {
  const rebuilt = {
    ...args.storedInputs,
    ...args.liveConfig,
    strengthAnchor: args.anchor,
  };
  const parsed = engineInputsSchema.safeParse(rebuilt);
  if (!parsed.success) return { status: "invalid_source" };

  let output: Prescription;
  try {
    output = prescribe(parsed.data, params);
  } catch {
    return { status: "invalid_source" };
  }

  return {
    status: prescriptionChanged(args.currentOutput, output)
      ? "changed"
      : "unchanged",
    inputs: parsed.data,
    output,
  };
}

// ---------------------------------------------------------------------------
// read-path reconcile
// ---------------------------------------------------------------------------

export interface ReconcileResult {
  /** missing days created from a completed previous-week counterpart */
  generated: number;
  /** stale prescriptions whose recompute changed the prescribed numbers */
  refreshed: number;
}

/** A planned, not-yet-started prescription row + the cycle context to check it. */
interface OpenRow {
  id: string;
  workoutId: string;
  exerciseId: string;
  microcycleId: string;
  weekNumber: number;
  dayNumber: number;
  targetRir: number;
  isDeload: boolean;
  currentOutput: Pick<Prescription, "weight" | "reps" | "sets" | "targetRir">;
  depFingerprint: string | null;
}

interface LatestDecision {
  id: string;
  sourceWorkoutExerciseId: string | null;
  inputs: Record<string, unknown>;
}

/** Recording-time provenance for a recomputed decision (doc 14 §6.1 step 4): the
 *  doc-11 RIR-fallback record, the engine build, and WHY the row recomputed —
 *  the fingerprint transition plus the resolved dependency component values. */
function recomputeProvenance(
  inputs: EngineInputs,
  liveConfig: ConfigInputs,
  codeSha: string | null,
  fromFingerprint: string | null,
  toFingerprint: string,
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
    recomputed: {
      reason: "dependency fingerprint changed",
      from_fingerprint: fromFingerprint,
      to_fingerprint: toFingerprint,
      // the resolved dependency component values that fed the new fingerprint, so
      // explain_prescription can show what input changed on a recompute (doc 14 §4)
      dependencies: {
        equipmentType: liveConfig.exercise.equipmentType,
        experienceLevel: liveConfig.user.experienceLevel,
        units: liveConfig.user.units,
        goalType: liveConfig.goalType,
        week: liveConfig.week,
        previous: liveConfig.previous,
      },
    },
  };
}

/**
 * Bring a user's meso's stored prescriptions in line with their current inputs,
 * transparently and on demand. Two halves of one read-path job (doc 14 §10):
 *   1. heal generation gaps — create any missing day whose previous-week
 *      counterpart is complete (`catchUpMesoGeneration`); a SEPARATE concern the
 *      freshness framework does not cover, kept here.
 *   2. refresh freshness — for each open prescription with a recorded decision,
 *      re-resolve its config inputs, hash, and compare to the stored fingerprint;
 *      recompute exactly the rows that diverged, in week order so a changed
 *      `previous` propagates to the next week within the one pass.
 *
 * Lazy + idempotent: nothing recomputes until a row's inputs actually differ;
 * after a recompute the row carries the current fingerprint, so the next read
 * matches and short-circuits. Never touches started/completed workouts, logged
 * sets, or manual `set_weights` overrides.
 *
 * Seed / user-added rows carry no decision (the engine only records one at a week
 * advance); they are skipped here until doc 14 phase 2 normalizes them with a
 * kind:"seed" decision.
 */
export async function reconcilePrescriptions(
  service: Client,
  userId: string,
  mesoId: string,
): Promise<ReconcileResult> {
  // 1. heal generation gaps first; freshly generated days are stamped current, so
  //    the freshness pass below sees them as fresh.
  const generated = await catchUpMesoGeneration(service, userId, mesoId);

  const { version, params } = await getActiveEngineParams(service);
  const token: ParamsToken = { version };

  // 2. the meso's weeks (target RIR / deload per week)
  const { data: micros, error: microsError } = await service
    .from("microcycles")
    .select("id, week_number, target_rir, is_deload")
    .eq("mesocycle_id", mesoId)
    .eq("user_id", userId);
  if (microsError) throw microsError;
  if (!micros || micros.length === 0) return { generated, refreshed: 0 };
  const microById = new Map(micros.map((m) => [m.id, m]));
  const microIds = micros.map((m) => m.id);

  // 3. ALL the meso's workouts (planned + completed — completed rows are the
  //    `previous` sources for later weeks)
  const { data: workouts, error: workoutsError } = await service
    .from("workouts")
    .select("id, microcycle_id, day_number, status")
    .in("microcycle_id", microIds)
    .eq("user_id", userId);
  if (workoutsError) throw workoutsError;
  if (!workouts || workouts.length === 0) return { generated, refreshed: 0 };
  const workoutById = new Map(workouts.map((w) => [w.id, w]));
  const plannedWorkoutIds = new Set(
    workouts.filter((w) => w.status === "planned").map((w) => w.id),
  );

  // 4. ALL the meso's workout_exercises (need completed sources for `previous`)
  const { data: wes, error: wesError } = await service
    .from("workout_exercises")
    .select(
      "id, workout_id, exercise_id, prescribed_weight, prescribed_reps, prescribed_sets, target_rir, dep_fingerprint",
    )
    .in("workout_id", [...workoutById.keys()]);
  if (wesError) throw wesError;
  if (!wes || wes.length === 0) return { generated, refreshed: 0 };

  // live prescribed map for `previous` resolution + week-order propagation
  const livePrescribed = new Map<
    string,
    Pick<Prescription, "weight" | "reps" | "sets" | "targetRir">
  >();
  for (const we of wes) {
    const workout = workoutById.get(we.workout_id);
    const micro = workout ? microById.get(workout.microcycle_id) : undefined;
    livePrescribed.set(we.id, {
      weight: we.prescribed_weight,
      reps: we.prescribed_reps,
      sets: we.prescribed_sets ?? 1,
      targetRir: we.target_rir ?? micro?.target_rir ?? 0,
    });
  }

  // the open (planned) rows we may rewrite
  const openWes = wes.filter((we) => plannedWorkoutIds.has(we.workout_id));
  if (openWes.length === 0) return { generated, refreshed: 0 };
  const openWeIds = openWes.map((we) => we.id);

  // 5. exclude any open row that already has a logged set (defensive — a planned
  //    workout should have none, but never re-prescribe over started work)
  const { data: logged, error: loggedError } = await service
    .from("logged_sets")
    .select("workout_exercise_id")
    .in("workout_exercise_id", openWeIds);
  if (loggedError) throw loggedError;
  const loggedWeIds = new Set((logged ?? []).map((s) => s.workout_exercise_id));

  // 6. latest decision per open row (source pointer + stored derived inputs).
  //    A row with none is a seed / user-add → skip (doc 14 phase 1).
  const { data: decisions, error: decisionsError } = await service
    .from("engine_decisions")
    .select("id, workout_exercise_id, source_workout_exercise_id, inputs, created_at")
    .in("workout_exercise_id", openWeIds)
    .order("created_at", { ascending: false });
  if (decisionsError) throw decisionsError;
  const latestByWe = new Map<string, LatestDecision>();
  for (const d of decisions ?? []) {
    if (d.workout_exercise_id && !latestByWe.has(d.workout_exercise_id)) {
      latestByWe.set(d.workout_exercise_id, {
        id: d.id,
        sourceWorkoutExerciseId: d.source_workout_exercise_id,
        inputs: d.inputs,
      });
    }
  }

  // 7. config dimensions resolved once: profile, macro goal, equipment per exercise
  const [{ data: profile, error: profileError }, mesoGoal] = await Promise.all([
    service.from("profiles").select("*").eq("id", userId).single(),
    resolveMesoGoal(service, mesoId),
  ]);
  if (profileError) throw profileError;
  const goal = engineGoal(mesoGoal);

  const exerciseIds = [...new Set(openWes.map((we) => we.exercise_id))];
  const { data: exercises, error: exError } =
    exerciseIds.length > 0
      ? await service.from("exercises").select("id, equipment_type").in("id", exerciseIds)
      : { data: [] as { id: string; equipment_type: string }[], error: null };
  if (exError) throw exError;
  const equipmentById = new Map(
    (exercises ?? []).map((e) => [e.id, e.equipment_type]),
  );

  // assemble the open rows with their cycle context, in week → day → position order
  const rows: OpenRow[] = openWes
    .filter((we) => !loggedWeIds.has(we.id) && latestByWe.has(we.id))
    .map((we) => {
      const workout = workoutById.get(we.workout_id)!;
      const micro = microById.get(workout.microcycle_id)!;
      return {
        id: we.id,
        workoutId: we.workout_id,
        exerciseId: we.exercise_id,
        microcycleId: workout.microcycle_id,
        weekNumber: micro.week_number,
        dayNumber: workout.day_number,
        targetRir: micro.target_rir,
        isDeload: micro.is_deload,
        currentOutput: {
          weight: we.prescribed_weight,
          reps: we.prescribed_reps,
          sets: we.prescribed_sets ?? 1,
          targetRir: we.target_rir ?? micro.target_rir,
        },
        depFingerprint: we.dep_fingerprint,
      };
    })
    .sort((a, b) => a.weekNumber - b.weekNumber || a.dayNumber - b.dayNumber);

  if (rows.length === 0) return { generated, refreshed: 0 };

  // 8. week-order pass: detect divergence, recompute, write back. Anchors are
  //    fetched once, only if at least one row actually diverged.
  let anchors: Map<string, E1rmAnchor> | null = null;
  let refreshed = 0;
  const paramsHash = hashParams(params as unknown as Record<string, unknown>);
  const codeSha = engineCodeSha();

  for (const row of rows) {
    const decision = latestByWe.get(row.id)!;
    const sourceId = decision.sourceWorkoutExerciseId;
    const previous =
      (sourceId ? livePrescribed.get(sourceId) : undefined) ??
      ((decision.inputs.previous as ConfigInputs["previous"]) ?? null);
    const initial =
      (decision.inputs.initial as ConfigInputs["initial"]) ?? null;

    const liveConfig = buildConfigInputs({
      equipmentType: equipmentById.get(row.exerciseId) ?? "other",
      profile,
      goal,
      week: { targetRir: row.targetRir, isDeload: row.isDeload },
      previous,
      initial,
    });
    const expected = computeDepFingerprint(liveConfig, token);
    if (expected === row.depFingerprint) continue; // fresh — short-circuit

    // diverged → fetch anchors once, then rebuild + recompute
    if (!anchors) {
      anchors = await getExerciseE1rmAnchors(service, userId, exerciseIds, params);
    }
    const result = recomputeRow(
      {
        storedInputs: decision.inputs,
        liveConfig,
        anchor: anchors.get(row.exerciseId) ?? null,
        currentOutput: row.currentOutput,
      },
      params,
    );

    if (result.status === "invalid_source") {
      // self-heal (doc 14 §6.3): can't replay → stamp the current expected
      // fingerprint and move on. Not a permanent lie: if any input changes again,
      // the expected fingerprint changes again and the row is re-attempted.
      await stampFingerprint(service, row.id, expected);
      continue;
    }

    if (result.status === "unchanged") {
      // the change didn't move THIS row's prescription; stamp it current so the
      // next read short-circuits (the fingerprint, not the numbers, was stale).
      await stampFingerprint(service, row.id, expected);
      continue;
    }

    // changed → write the refreshed prescription + fingerprint, append an audited
    // decision, and propagate the new value to downstream weeks in this pass.
    const output = result.output!;
    const inputs = result.inputs!;
    const { error: updateError } = await service
      .from("workout_exercises")
      .update({
        prescribed_weight: output.weight,
        prescribed_reps: output.reps,
        prescribed_sets: output.sets,
        target_rir: output.targetRir,
        notes: output.rationale,
        dep_fingerprint: expected,
      })
      .eq("id", row.id);
    if (updateError) throw updateError;

    const { error: insertError } = await service.from("engine_decisions").insert({
      user_id: userId,
      workout_exercise_id: row.id,
      exercise_id: row.exerciseId,
      source_workout_exercise_id: sourceId,
      workout_id: row.workoutId,
      microcycle_id: row.microcycleId,
      mesocycle_id: mesoId,
      inputs: inputs as unknown as Record<string, unknown>,
      output: output as unknown as Record<string, unknown>,
      params_version: version,
      params_hash: paramsHash,
      provenance: recomputeProvenance(
        inputs,
        liveConfig,
        codeSha,
        row.depFingerprint,
        expected,
      ),
    });
    if (insertError) throw insertError;

    livePrescribed.set(row.id, output);
    refreshed += 1;
  }

  return { generated, refreshed };
}

/** Stamp a single open row's freshness fingerprint current (no prescription change). */
async function stampFingerprint(
  service: Client,
  workoutExerciseId: string,
  fingerprint: string,
): Promise<void> {
  const { error } = await service
    .from("workout_exercises")
    .update({ dep_fingerprint: fingerprint })
    .eq("id", workoutExerciseId);
  if (error) throw error;
}

/** The meso's progression goal (macro goal → standalone default). */
async function resolveMesoGoal(
  service: Client,
  mesoId: string,
): Promise<MacroGoalType | null> {
  const { data: meso, error } = await service
    .from("mesocycles")
    .select("macrocycle_id")
    .eq("id", mesoId)
    .maybeSingle();
  if (error) throw error;
  if (!meso?.macrocycle_id) return null;
  const { data: macro, error: macroError } = await service
    .from("macrocycles")
    .select("goal_type")
    .eq("id", meso.macrocycle_id)
    .maybeSingle();
  if (macroError) throw macroError;
  return macro?.goal_type ?? null;
}
