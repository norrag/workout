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
import { engineCodeSha, hashParams } from "./params-provenance";

/**
 * Regenerate already-planned prescriptions against the active engine params
 * (doc 13 fast-follow). The engine only writes a prescription at week N→N+1
 * generation, so activating a new `engine_params` version (or otherwise changing
 * a tunable) leaves *already generated, not-yet-performed* workouts holding stale
 * numbers — nothing re-fires `prescribe()` for them.
 *
 * This module re-runs the engine on those planned prescriptions and writes the
 * refreshed weight/reps/sets/RIR back, with a fresh `engine_decisions` row so the
 * audit trail stays intact. It is the write-back counterpart of `replayDecisions`
 * (admin.ts): same pure replay, but the result is persisted.
 *
 * Scope rules (CLAUDE.md hard rule #5 — no deletes/edits of logged history):
 *   - only `planned` workouts, and only `workout_exercises` with NO logged set;
 *   - never `in_progress` / `completed` workouts;
 *   - manual per-set weight overrides (`set_weights`) are left untouched — they
 *     sit on top of the prescription in the UI and are cleared separately by the
 *     "Reset to prescription" menu item.
 *
 * Cross-user: the caller (an admin MCP tool) passes a service-role client. Every
 * write is scoped to the row's own server-derived owner (hard rule #4); no
 * `user_id` ever comes from a tool argument (hard rule #5).
 */

type Client = SupabaseClient<Database>;

/** One stale, not-yet-started prescription that can be re-run by the engine. */
export interface PlannedDecisionCandidate {
  /** the source (stale) decision being superseded */
  decisionId: string;
  /** owner of the planned workout, derived server-side (never from input) */
  userId: string;
  /** the planned `workout_exercises` row to refresh (= the decision's target) */
  workoutExerciseId: string;
  exerciseId: string;
  exerciseName: string | null;
  workoutId: string;
  microcycleId: string;
  mesocycleId: string | null;
  /** W·D label for display, when resolvable */
  coordinate: string | null;
  /** carried forward onto the new decision so the chain stays intact */
  sourceWorkoutExerciseId: string | null;
  /** the params version the stale prescription was made under */
  fromParamsVersion: number;
  /** the exact inputs the stale decision recorded (replayed verbatim) */
  inputs: Record<string, unknown>;
  /** the stale prescription, for diffing */
  output: Record<string, unknown>;
}

export type RegenStatus =
  | "changed"
  | "unchanged"
  | "invalid_source"
  | "execution_error";

export interface RegenChangedField {
  field: "weight" | "reps" | "sets" | "targetRir";
  from: unknown;
  to: unknown;
}

export interface RegenItem {
  candidate: PlannedDecisionCandidate;
  status: RegenStatus;
  /** parsed inputs, present when the source validated */
  inputs?: EngineInputs;
  /** the freshly computed prescription, present when the engine ran */
  output?: Prescription;
  /** the prescription fields the active params would change */
  changedFields?: RegenChangedField[];
}

export interface RegenCounts {
  total: number;
  changed: number;
  unchanged: number;
  invalid_source: number;
  execution_error: number;
}

export interface RegenPlan {
  items: RegenItem[];
  counts: RegenCounts;
}

const PRESCRIPTION_FIELDS = ["weight", "reps", "sets", "targetRir"] as const;

/**
 * Pure: replay each candidate's stored inputs against the active params and
 * classify the outcome. No I/O — same inputs + params ⇒ same plan, so it is
 * unit-tested directly (hard rule #3) and the MCP tool's dry run is exactly what
 * gets applied.
 */
export function planRegeneration(
  candidates: PlannedDecisionCandidate[],
  activeParams: EngineParams,
): RegenPlan {
  const items: RegenItem[] = [];
  const counts: RegenCounts = {
    total: candidates.length,
    changed: 0,
    unchanged: 0,
    invalid_source: 0,
    execution_error: 0,
  };

  for (const candidate of candidates) {
    const parsed = engineInputsSchema.safeParse(candidate.inputs);
    if (!parsed.success) {
      counts.invalid_source += 1;
      items.push({ candidate, status: "invalid_source" });
      continue;
    }

    let output: Prescription;
    try {
      output = prescribe(parsed.data, activeParams);
    } catch {
      counts.execution_error += 1;
      items.push({ candidate, status: "execution_error", inputs: parsed.data });
      continue;
    }

    const changedFields: RegenChangedField[] = [];
    for (const field of PRESCRIPTION_FIELDS) {
      const from = candidate.output[field];
      const to = output[field];
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        changedFields.push({ field, from, to });
      }
    }

    if (changedFields.length > 0) {
      counts.changed += 1;
      items.push({
        candidate,
        status: "changed",
        inputs: parsed.data,
        output,
        changedFields,
      });
    } else {
      counts.unchanged += 1;
      items.push({ candidate, status: "unchanged", inputs: parsed.data, output });
    }
  }

  return { items, counts };
}

/** Key a recomputed anchor by its owner + exercise (anchors are per-user). */
export function anchorKey(userId: string, exerciseId: string): string {
  return `${userId}:${exerciseId}`;
}

/**
 * Overwrite each candidate's recorded `inputs.strengthAnchor` with a freshly
 * recomputed anchor (keyed by `anchorKey`). Pure.
 *
 * Why this is required: a decision recorded under v8 or earlier predates the
 * `strengthAnchor` input (doc 13), so its stored inputs carry none. The v9
 * rep-window weight selection is gated on a non-null anchor — replaying those
 * anchor-less inputs always falls through to the legacy increment branch and
 * reports "unchanged". Recomputing the anchor from the user's logged history
 * (the same `getExerciseE1rmAnchors` the live week-advance uses) is what lets a
 * backfill actually pick up the new model. A null anchor (no usable history) is
 * left in place so the engine keeps its plan-based cold-start fallback.
 */
export function withRecomputedAnchors(
  candidates: PlannedDecisionCandidate[],
  anchorByKey: Map<string, E1rmAnchor>,
): PlannedDecisionCandidate[] {
  return candidates.map((candidate) => {
    if (
      typeof candidate.inputs !== "object" ||
      candidate.inputs === null ||
      Array.isArray(candidate.inputs)
    ) {
      return candidate;
    }
    const anchor = anchorByKey.get(anchorKey(candidate.userId, candidate.exerciseId)) ?? null;
    return { ...candidate, inputs: { ...candidate.inputs, strengthAnchor: anchor } };
  });
}

/**
 * Gather the not-yet-started prescriptions whose latest decision predates the
 * active params version. Service-role, cross-user; optionally scoped to one
 * mesocycle. Returns at most `limit` candidates, oldest-coordinate first.
 *
 * Each candidate's `inputs.strengthAnchor` is recomputed from the owner's
 * logged history against `params` (`withRecomputedAnchors`) so a backfill can
 * exercise the active model's anchor-driven path rather than replaying a stale,
 * anchor-less input verbatim.
 */
export async function getRegenerablePlannedDecisions(
  service: Client,
  activeVersion: number,
  params: EngineParams,
  opts: { mesocycleId?: string; limit?: number } = {},
): Promise<PlannedDecisionCandidate[]> {
  // optional mesocycle scoping → its microcycle ids
  let microFilter: string[] | null = null;
  if (opts.mesocycleId) {
    const { data, error } = await service
      .from("microcycles")
      .select("id")
      .eq("mesocycle_id", opts.mesocycleId);
    if (error) throw error;
    microFilter = (data ?? []).map((m) => m.id);
    if (microFilter.length === 0) return [];
  }

  // planned workouts (all users, or just the scoped meso's weeks)
  let workoutQuery = service
    .from("workouts")
    .select("id, user_id, microcycle_id, day_number")
    .eq("status", "planned");
  if (microFilter) workoutQuery = workoutQuery.in("microcycle_id", microFilter);
  const { data: workouts, error: workoutsError } = await workoutQuery;
  if (workoutsError) throw workoutsError;
  if (!workouts || workouts.length === 0) return [];
  const workoutById = new Map(workouts.map((w) => [w.id, w]));
  const workoutIds = workouts.map((w) => w.id);

  // microcycle → (week, meso) for the coordinate label + decision linkage
  const microIds = [...new Set(workouts.map((w) => w.microcycle_id))];
  const { data: micros, error: microsError } = await service
    .from("microcycles")
    .select("id, week_number, mesocycle_id")
    .in("id", microIds);
  if (microsError) throw microsError;
  const microById = new Map((micros ?? []).map((m) => [m.id, m]));

  // exercises planned on those workouts
  const { data: wes, error: wesError } = await service
    .from("workout_exercises")
    .select("id, workout_id, exercise_id")
    .in("workout_id", workoutIds);
  if (wesError) throw wesError;
  if (!wes || wes.length === 0) return [];
  const weIds = wes.map((we) => we.id);

  // exclude any exercise that already has a logged set — a `planned` workout
  // should have none, but never re-prescribe over started work (hard rule #5)
  const { data: logged, error: loggedError } = await service
    .from("logged_sets")
    .select("workout_exercise_id")
    .in("workout_exercise_id", weIds);
  if (loggedError) throw loggedError;
  const loggedWeIds = new Set((logged ?? []).map((s) => s.workout_exercise_id));

  // the latest decision per planned exercise (newest first → first seen wins)
  const { data: decisions, error: decisionsError } = await service
    .from("engine_decisions")
    .select(
      "id, user_id, workout_exercise_id, source_workout_exercise_id, params_version, inputs, output, created_at",
    )
    .in("workout_exercise_id", weIds)
    .order("created_at", { ascending: false });
  if (decisionsError) throw decisionsError;
  const latestByWe = new Map<string, (typeof decisions)[number]>();
  for (const d of decisions ?? []) {
    if (d.workout_exercise_id && !latestByWe.has(d.workout_exercise_id)) {
      latestByWe.set(d.workout_exercise_id, d);
    }
  }

  // exercise names for the dry-run report
  const exerciseIds = [...new Set(wes.map((we) => we.exercise_id))];
  const { data: exercises } =
    exerciseIds.length > 0
      ? await service.from("exercises").select("id, name").in("id", exerciseIds)
      : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((exercises ?? []).map((e) => [e.id, e.name]));

  const candidates: PlannedDecisionCandidate[] = [];
  for (const we of wes) {
    if (loggedWeIds.has(we.id)) continue;
    const decision = latestByWe.get(we.id);
    // no decision = a seed (e.g. week-1) the engine never prescribed → nothing
    // to replay; skip rather than invent inputs
    if (!decision) continue;
    if (decision.params_version >= activeVersion) continue; // already current
    const workout = workoutById.get(we.workout_id);
    if (!workout) continue;
    const micro = microById.get(workout.microcycle_id);
    candidates.push({
      decisionId: decision.id,
      userId: workout.user_id,
      workoutExerciseId: we.id,
      exerciseId: we.exercise_id,
      exerciseName: nameById.get(we.exercise_id) ?? null,
      workoutId: we.workout_id,
      microcycleId: workout.microcycle_id,
      mesocycleId: micro?.mesocycle_id ?? null,
      coordinate: micro ? `W${micro.week_number}·D${workout.day_number}` : null,
      sourceWorkoutExerciseId: decision.source_workout_exercise_id,
      fromParamsVersion: decision.params_version,
      inputs: decision.inputs,
      output: decision.output,
    });
  }

  candidates.sort((a, b) => (a.coordinate ?? "").localeCompare(b.coordinate ?? ""));
  const limited =
    opts.limit != null ? candidates.slice(0, opts.limit) : candidates;

  // recompute the strength anchor per (owner, exercise) from logged history so
  // the active model's anchor-driven path can engage on the backfill. Anchors
  // are per-user, so batch the exercise ids by owner.
  const exerciseIdsByUser = new Map<string, Set<string>>();
  for (const c of limited) {
    const set = exerciseIdsByUser.get(c.userId) ?? new Set<string>();
    set.add(c.exerciseId);
    exerciseIdsByUser.set(c.userId, set);
  }
  const anchorByKey = new Map<string, E1rmAnchor>();
  for (const [uid, exIds] of exerciseIdsByUser) {
    const anchors = await getExerciseE1rmAnchors(service, uid, [...exIds], params);
    for (const [exId, anchor] of anchors) {
      anchorByKey.set(anchorKey(uid, exId), anchor);
    }
  }
  return withRecomputedAnchors(limited, anchorByKey);
}

/** Provenance for a regenerated decision — the doc-11 RIR-fallback record plus a
 *  marker that this decision came from a regeneration (not a week advance). */
function regenProvenance(
  inputs: EngineInputs,
  codeSha: string | null,
  fromParamsVersion: number,
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
    regenerated: {
      tool: "regenerate_planned_prescriptions",
      from_params_version: fromParamsVersion,
    },
  };
}

export interface RegenApplyResult {
  updatedExercises: number;
  insertedDecisions: number;
}

/**
 * Persist the changed items: overwrite each planned exercise's prescription and
 * append a fresh `engine_decisions` row stamped with the active version. Only
 * `status === "changed"` items are written. Idempotent in effect — re-running
 * after a successful apply finds nothing stale (the new decisions carry the
 * active version).
 */
export async function applyRegeneration(
  service: Client,
  items: RegenItem[],
  activeVersion: number,
  activeParams: EngineParams,
): Promise<RegenApplyResult> {
  const changed = items.filter(
    (i): i is RegenItem & { output: Prescription; inputs: EngineInputs } =>
      i.status === "changed" && i.output != null && i.inputs != null,
  );
  if (changed.length === 0) return { updatedExercises: 0, insertedDecisions: 0 };

  const paramsHash = hashParams(
    activeParams as unknown as Record<string, unknown>,
  );
  const codeSha = engineCodeSha();

  // overwrite each planned exercise's prescription (update by id; the table has
  // no user_id column — ownership is the parent workout's, already resolved
  // server-side into candidate.userId)
  let updatedExercises = 0;
  for (const { candidate, output } of changed) {
    const { error: updateError } = await service
      .from("workout_exercises")
      .update({
        prescribed_weight: output.weight,
        prescribed_reps: output.reps,
        prescribed_sets: output.sets,
        target_rir: output.targetRir,
        notes: output.rationale,
      })
      .eq("id", candidate.workoutExerciseId);
    if (updateError) throw updateError;
    updatedExercises += 1;
  }

  // append the fresh audit decisions (one batch insert, mirrors generateDay)
  const { error: insertError } = await service.from("engine_decisions").insert(
    changed.map(({ candidate, output, inputs }) => ({
      user_id: candidate.userId,
      workout_exercise_id: candidate.workoutExerciseId,
      exercise_id: candidate.exerciseId,
      source_workout_exercise_id: candidate.sourceWorkoutExerciseId,
      workout_id: candidate.workoutId,
      microcycle_id: candidate.microcycleId,
      mesocycle_id: candidate.mesocycleId,
      inputs: candidate.inputs as unknown as Record<string, unknown>,
      output: output as unknown as Record<string, unknown>,
      params_version: activeVersion,
      params_hash: paramsHash,
      provenance: regenProvenance(inputs, codeSha, candidate.fromParamsVersion),
    })),
  );
  if (insertError) throw insertError;

  return { updatedExercises, insertedDecisions: changed.length };
}
