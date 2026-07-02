import type { SupabaseClient } from "@supabase/supabase-js";
import { engineParamsSchema, type EngineParams } from "@/lib/engine";
import type { Database, EngineDecisionKind } from "@/lib/types/database";
import {
  CURRENT_PARAMS_SCHEMA_VERSION,
  engineCodeSha,
  hashParams,
  materializeParams,
  resolveProvenance,
  type ParamsProvenance,
} from "./params-provenance";
import { getExerciseParamOverrides } from "./exercise-overrides";

type Client = SupabaseClient<Database>;

/**
 * Admin/tuning data layer (07 Phase 6 Slice 4, 05 §Admin & tuning). The MCP
 * connector is the entire admin surface (08 §3) — these readers/writers back
 * the role-gated tools. `engine_params` RLS already gates writes to
 * `is_admin()`, so an admin's own token-bound client is sufficient (no service
 * role); `engine_decisions` selects are owner-or-admin scoped.
 */

export interface EngineParamVersion {
  version: number;
  is_active: boolean;
  notes: string | null;
  schema_version: number | null;
  params_hash: string | null;
  is_replayable: boolean;
  created_at: string;
}

export async function listEngineParams(client: Client): Promise<EngineParamVersion[]> {
  const { data, error } = await client
    .from("engine_params")
    .select("version, is_active, notes, schema_version, params_hash, is_replayable, created_at")
    .order("version", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface EngineParamsDetail extends EngineParamVersion {
  /** the params exactly as stored — no defaults injected on read (P0-3) */
  params: Record<string, unknown>;
  /** stored params resolved to a full EngineParams; null if they no longer validate */
  resolved: EngineParams | null;
  provenance: ParamsProvenance;
  /** the recorded hash matches a fresh hash of the stored params */
  hash_verified: boolean;
}

export async function getEngineParamsVersion(
  client: Client,
  version: number,
): Promise<EngineParamsDetail | null> {
  const { data, error } = await client
    .from("engine_params")
    .select("*")
    .eq("version", version)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // P0-3: do NOT re-parse-with-defaults and hand that back as "the version".
  // Return the stored bytes; resolve a usable EngineParams separately and carry
  // an explicit replayability flag instead of silently materializing.
  const stored = data.params;
  const parsed = engineParamsSchema.safeParse(stored);
  const provenance = resolveProvenance(stored, { code_sha: data.code_sha });
  return {
    version: data.version,
    is_active: data.is_active,
    notes: data.notes,
    schema_version: data.schema_version,
    params_hash: data.params_hash,
    is_replayable: data.is_replayable,
    created_at: data.created_at,
    params: stored,
    resolved: parsed.success ? parsed.data : null,
    provenance,
    hash_verified: data.params_hash != null && data.params_hash === provenance.params_hash,
  };
}

/**
 * Write a new INACTIVE param version (max+1) as an immutable, self-describing
 * snapshot (P0-3): the params are fully materialized (every default resolved)
 * before storage, with a content hash, schema version, and engine build id, so
 * the version can be reproduced exactly later. A malformed set can never be
 * stored — and therefore never activated.
 */
export async function proposeEngineParams(
  client: Client,
  params: EngineParams,
  notes: string | null,
): Promise<number> {
  const materialized = materializeParams(params);
  const snapshot = materialized as unknown as Record<string, unknown>;
  const { data: top, error: topError } = await client
    .from("engine_params")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (topError) throw topError;
  const nextVersion = (top?.version ?? 0) + 1;

  const { error } = await client.from("engine_params").insert({
    version: nextVersion,
    params: snapshot,
    is_active: false,
    notes,
    schema_version: CURRENT_PARAMS_SCHEMA_VERSION,
    params_hash: hashParams(snapshot),
    code_sha: engineCodeSha(),
    is_replayable: true,
  });
  if (error) throw error;
  return nextVersion;
}

/**
 * Activate a version. A partial unique index enforces a single active row.
 * R3: the deactivate + activate pair runs in ONE DB transaction
 * (`activate_engine_params`, 20260702000005) — the old two-round-trip swap
 * could fail between statements and leave ZERO active rows, which throws on
 * every page/generation path app-wide until manually repaired.
 */
export async function activateEngineParams(
  client: Client,
  version: number,
): Promise<void> {
  const { data: target, error: findError } = await client
    .from("engine_params")
    .select("version, is_active")
    .eq("version", version)
    .maybeSingle();
  if (findError) throw findError;
  if (!target) throw new Error(`engine_params version ${version} does not exist`);
  if (target.is_active) return;

  const { error } = await client.rpc("activate_engine_params", {
    p_version: version,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// discard an inactive engine-params version (MCP undo for propose_engine_params,
// §5.8). The tuning loop leaves inactive proposals behind (this QA left an
// undeletable v7); admins can now discard one. Guarded: the ACTIVE version can
// never be deleted, and a version referenced by any recorded engine_decision is
// preserved so historical decisions keep a resolvable params snapshot (the
// auditability the connector is built on). A new RLS delete policy
// (20260618000002) gates the delete to admins.
// ---------------------------------------------------------------------------

export interface ParamsDeletionImpact {
  found: boolean;
  isActive: boolean;
  decisionRefs: number;
  deletable: boolean;
}

export async function getParamsDeletionImpact(
  client: Client,
  version: number,
): Promise<ParamsDeletionImpact> {
  const { data: row, error } = await client
    .from("engine_params")
    .select("version, is_active")
    .eq("version", version)
    .maybeSingle();
  if (error) throw error;
  if (!row) return { found: false, isActive: false, decisionRefs: 0, deletable: false };

  const { count, error: refError } = await client
    .from("engine_decisions")
    .select("*", { count: "exact", head: true })
    .eq("params_version", version);
  if (refError) throw refError;
  const decisionRefs = count ?? 0;
  return {
    found: true,
    isActive: row.is_active,
    decisionRefs,
    deletable: !row.is_active && decisionRefs === 0,
  };
}

export async function deleteEngineParamsVersion(
  client: Client,
  version: number,
): Promise<void> {
  const { error } = await client
    .from("engine_params")
    .delete()
    .eq("version", version)
    .eq("is_active", false);
  if (error) throw error;
}

export interface DecisionRecord {
  id: string;
  kind: EngineDecisionKind;
  workout_exercise_id: string | null;
  source_workout_exercise_id: string | null;
  exercise_id: string | null;
  exercise_name: string | null;
  workout_id: string | null;
  microcycle_id: string | null;
  mesocycle_id: string | null;
  coordinate: string | null;
  params_version: number;
  params_hash: string | null;
  provenance: Record<string, unknown> | null;
  created_at: string;
  inputs: Record<string, unknown>;
  output: Record<string, unknown>;
  /**
   * The caller's per-exercise weight-increment override for this decision's
   * exercise (doc 14 phase 3), in pounds, or null. Replay folds it into the
   * candidate params via `resolveEffectiveParams` exactly as the live generation /
   * recompute path does — otherwise an override'd exercise replays at the STOCK
   * loadable step and diffs spuriously (the override sets `rounding`, which every
   * prescribed weight rounds to).
   */
  incrementOverride: number | null;
}

export interface DecisionFilters {
  paramsVersion?: number;
  exerciseId?: string;
  since?: string;
  limit?: number;
  /** keyset cursor: return decisions strictly older than this created_at (P1-4) */
  cursor?: string;
}

/**
 * Decision inspector — the caller's own `engine_decisions`, newest first,
 * filterable by params version / exercise / date. Identity stays the session's
 * (hard rule #5); cross-user inspection is intentionally out of scope. Linkage
 * (exercise, source we, cycle coordinates, params hash) is read from the
 * persisted columns (P0-4) — no join needed to resolve identity.
 */
export async function getEngineDecisions(
  client: Client,
  userId: string,
  filters: DecisionFilters = {},
): Promise<DecisionRecord[]> {
  let query = client
    .from("engine_decisions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(filters.limit ?? 25, 100));
  if (filters.paramsVersion != null) query = query.eq("params_version", filters.paramsVersion);
  if (filters.since) query = query.gte("created_at", filters.since);
  if (filters.cursor) query = query.lt("created_at", filters.cursor);
  // exercise filter is now a direct column predicate (persisted exercise_id)
  if (filters.exerciseId) query = query.eq("exercise_id", filters.exerciseId);

  const { data: decisions, error } = await query;
  if (error) throw error;
  if (!decisions || decisions.length === 0) return [];

  // resolve display labels (exercise name + W·D coordinate) from the persisted
  // ids; fall back to the generated workout_exercise for any legacy row whose
  // exercise_id never got backfilled
  const exerciseIds = [
    ...new Set(decisions.map((d) => d.exercise_id).filter((x): x is string => x != null)),
  ];
  const workoutIds = [
    ...new Set(decisions.map((d) => d.workout_id).filter((x): x is string => x != null)),
  ];
  const exerciseNameById = new Map<string, string>();
  const coordByWorkout = new Map<string, string>();

  if (exerciseIds.length > 0) {
    const { data: exercises } = await client
      .from("exercises")
      .select("id, name")
      .in("id", exerciseIds);
    for (const e of exercises ?? []) exerciseNameById.set(e.id, e.name);
  }

  // per-exercise increment overrides (doc 14 phase 3), scoped to the caller — so
  // replay folds them into the candidate params exactly as the live generation /
  // recompute path does (otherwise an override'd lift replays at the stock step).
  const overrideByExercise =
    exerciseIds.length > 0
      ? await getExerciseParamOverrides(client, userId, exerciseIds)
      : new Map();
  if (workoutIds.length > 0) {
    const { data: workouts } = await client
      .from("workouts")
      .select("id, day_number, microcycle_id")
      .in("id", workoutIds);
    const microIds = [...new Set((workouts ?? []).map((w) => w.microcycle_id))];
    const { data: micros } = microIds.length
      ? await client.from("microcycles").select("id, week_number").in("id", microIds)
      : { data: [] };
    const weekByMicro = new Map((micros ?? []).map((m) => [m.id, m.week_number]));
    for (const w of workouts ?? [])
      coordByWorkout.set(w.id, `W${weekByMicro.get(w.microcycle_id) ?? "?"}·D${w.day_number}`);
  }

  return decisions.map((d) => ({
    id: d.id,
    kind: d.kind,
    workout_exercise_id: d.workout_exercise_id,
    source_workout_exercise_id: d.source_workout_exercise_id,
    exercise_id: d.exercise_id,
    exercise_name: d.exercise_id ? (exerciseNameById.get(d.exercise_id) ?? null) : null,
    workout_id: d.workout_id,
    microcycle_id: d.microcycle_id,
    mesocycle_id: d.mesocycle_id,
    coordinate: d.workout_id ? (coordByWorkout.get(d.workout_id) ?? null) : null,
    params_version: d.params_version,
    params_hash: d.params_hash,
    provenance: d.provenance,
    created_at: d.created_at,
    inputs: d.inputs,
    output: d.output,
    incrementOverride: d.exercise_id
      ? (overrideByExercise.get(d.exercise_id)?.weightIncrement ?? null)
      : null,
  }));
}
