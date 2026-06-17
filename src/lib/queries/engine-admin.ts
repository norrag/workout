import type { SupabaseClient } from "@supabase/supabase-js";
import { engineParamsSchema, type EngineParams } from "@/lib/engine";
import type { Database } from "@/lib/types/database";
import {
  CURRENT_PARAMS_SCHEMA_VERSION,
  engineCodeSha,
  hashParams,
  materializeParams,
  resolveProvenance,
  type ParamsProvenance,
} from "./params-provenance";

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
 * Activate a version. A partial unique index enforces a single active row, so
 * we deactivate the current active row first, then flip the target on.
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

  const { error: deactivateError } = await client
    .from("engine_params")
    .update({ is_active: false })
    .eq("is_active", true);
  if (deactivateError) throw deactivateError;

  const { error: activateError } = await client
    .from("engine_params")
    .update({ is_active: true })
    .eq("version", version);
  if (activateError) throw activateError;
}

export interface DecisionRecord {
  id: string;
  workout_exercise_id: string | null;
  exercise_id: string | null;
  exercise_name: string | null;
  coordinate: string | null;
  params_version: number;
  created_at: string;
  inputs: Record<string, unknown>;
  output: Record<string, unknown>;
}

export interface DecisionFilters {
  paramsVersion?: number;
  exerciseId?: string;
  since?: string;
  limit?: number;
}

/**
 * Decision inspector — the caller's own `engine_decisions`, newest first,
 * filterable by params version / exercise / date. Identity stays the session's
 * (hard rule #5); cross-user inspection is intentionally out of scope.
 */
export async function getEngineDecisions(
  client: Client,
  userId: string,
  filters: DecisionFilters = {},
): Promise<DecisionRecord[]> {
  // exercise filter resolves through the user's workout_exercises
  let weFilter: string[] | null = null;
  if (filters.exerciseId) {
    const { data: wes, error: weError } = await client
      .from("workout_exercises")
      .select("id")
      .eq("exercise_id", filters.exerciseId);
    if (weError) throw weError;
    weFilter = (wes ?? []).map((w) => w.id);
    if (weFilter.length === 0) return [];
  }

  let query = client
    .from("engine_decisions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(filters.limit ?? 25, 100));
  if (filters.paramsVersion != null) query = query.eq("params_version", filters.paramsVersion);
  if (filters.since) query = query.gte("created_at", filters.since);
  if (weFilter) query = query.in("workout_exercise_id", weFilter);

  const { data: decisions, error } = await query;
  if (error) throw error;
  if (!decisions || decisions.length === 0) return [];

  // resolve exercise + coordinate for each via its workout_exercise
  const weIds = [...new Set(decisions.map((d) => d.workout_exercise_id).filter((x): x is string => x != null))];
  const weById = new Map<string, { exercise_id: string; workout_id: string }>();
  const exerciseNameById = new Map<string, string>();
  const coordByWorkout = new Map<string, string>();
  if (weIds.length > 0) {
    const { data: wes, error: weError } = await client
      .from("workout_exercises")
      .select("id, exercise_id, workout_id")
      .in("id", weIds);
    if (weError) throw weError;
    for (const we of wes ?? []) weById.set(we.id, { exercise_id: we.exercise_id, workout_id: we.workout_id });

    const exerciseIds = [...new Set((wes ?? []).map((w) => w.exercise_id))];
    const workoutIds = [...new Set((wes ?? []).map((w) => w.workout_id))];
    const [{ data: exercises }, { data: workouts }] = await Promise.all([
      client.from("exercises").select("id, name").in("id", exerciseIds),
      client.from("workouts").select("id, day_number, microcycle_id").in("id", workoutIds),
    ]);
    for (const e of exercises ?? []) exerciseNameById.set(e.id, e.name);
    const microIds = [...new Set((workouts ?? []).map((w) => w.microcycle_id))];
    const { data: micros } = await client
      .from("microcycles")
      .select("id, week_number")
      .in("id", microIds);
    const weekByMicro = new Map((micros ?? []).map((m) => [m.id, m.week_number]));
    for (const w of workouts ?? [])
      coordByWorkout.set(w.id, `W${weekByMicro.get(w.microcycle_id) ?? "?"}·D${w.day_number}`);
  }

  return decisions.map((d) => {
    const we = d.workout_exercise_id ? weById.get(d.workout_exercise_id) : undefined;
    return {
      id: d.id,
      workout_exercise_id: d.workout_exercise_id,
      exercise_id: we?.exercise_id ?? null,
      exercise_name: we ? (exerciseNameById.get(we.exercise_id) ?? null) : null,
      coordinate: we ? (coordByWorkout.get(we.workout_id) ?? null) : null,
      params_version: d.params_version,
      created_at: d.created_at,
      inputs: d.inputs,
      output: d.output,
    };
  });
}
