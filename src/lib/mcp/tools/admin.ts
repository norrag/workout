import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prescribe, type EngineInputs, type EngineParams, type Prescription } from "@/lib/engine";
import { getProfile } from "@/lib/queries/profiles";
import {
  listEngineParams,
  getEngineParamsVersion,
  proposeEngineParams,
  activateEngineParams,
  getEngineDecisions,
  type DecisionRecord,
} from "@/lib/queries/engine-admin";
import { resolveSession, type McpExtra, type McpClient } from "../session";
import { recordMcpWrite } from "../audit";

/**
 * Slice 4 admin/tuning + replay tools (05 §Admin & tuning), role-gated by
 * `profiles.role = 'admin'`. The MCP connector is the entire admin interface
 * (08 §3) — no admin UI exists. The tuning loop: inspect decisions → propose a
 * version → replay real history against it → review diffs → activate. Pure
 * merge/diff/replay helpers are exported for tests.
 */

function jsonResult(payload: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

/** Fetch the session and assert the caller is an admin (else deny). */
async function resolveAdmin(extra: McpExtra): Promise<{ client: McpClient; userId: string }> {
  const { client, userId } = resolveSession(extra);
  const profile = await getProfile(client, userId);
  if (!profile || profile.role !== "admin") {
    throw new Error("this tool requires an admin session");
  }
  return { client, userId };
}

// --- pure helpers ----------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Recursively merge `override` onto `base` (scalars/arrays replace). Pure. */
export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const prev = out[key];
    if (isPlainObject(prev) && isPlainObject(value)) {
      out[key] = deepMerge(prev, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export interface ParamDiffEntry {
  path: string;
  from: unknown;
  to: unknown;
}

function flatten(obj: unknown, prefix: string, out: Map<string, unknown>) {
  if (isPlainObject(obj)) {
    for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out.set(prefix, obj);
  }
}

/** Dot-path diff between two params objects — only the differing leaves. Pure. */
export function diffParams(a: unknown, b: unknown): ParamDiffEntry[] {
  const fa = new Map<string, unknown>();
  const fb = new Map<string, unknown>();
  flatten(a, "", fa);
  flatten(b, "", fb);
  const paths = new Set([...fa.keys(), ...fb.keys()]);
  const diffs: ParamDiffEntry[] = [];
  for (const p of paths) {
    const from = fa.get(p);
    const to = fb.get(p);
    if (JSON.stringify(from) !== JSON.stringify(to)) diffs.push({ path: p, from, to });
  }
  return diffs.sort((x, y) => x.path.localeCompare(y.path));
}

export interface PrescriptionDiff {
  changed: boolean;
  fields: Partial<Record<keyof Prescription, { from: unknown; to: unknown }>>;
}

/** Compare a stored prescription with a replayed one (ignores rationale prose). */
export function diffPrescription(
  stored: Record<string, unknown>,
  replayed: Prescription,
): PrescriptionDiff {
  const fields: PrescriptionDiff["fields"] = {};
  for (const key of ["weight", "reps", "sets", "targetRir"] as const) {
    const from = stored[key];
    const to = replayed[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) fields[key] = { from, to };
  }
  return { changed: Object.keys(fields).length > 0, fields };
}

export interface ReplayOutcome {
  total: number;
  changed: number;
  diffs: {
    decision_id: string;
    exercise_name: string | null;
    coordinate: string | null;
    fields: PrescriptionDiff["fields"];
  }[];
  errors: number;
}

/** Re-run stored decisions against candidate params; collect the diffs. Pure. */
export function replayDecisions(
  decisions: DecisionRecord[],
  candidateParams: EngineParams,
): ReplayOutcome {
  let changed = 0;
  let errors = 0;
  const diffs: ReplayOutcome["diffs"] = [];
  for (const d of decisions) {
    let replayed: Prescription;
    try {
      replayed = prescribe(d.inputs as unknown as EngineInputs, candidateParams);
    } catch {
      errors += 1;
      continue;
    }
    const diff = diffPrescription(d.output, replayed);
    if (diff.changed) {
      changed += 1;
      diffs.push({
        decision_id: d.id,
        exercise_name: d.exercise_name,
        coordinate: d.coordinate,
        fields: diff.fields,
      });
    }
  }
  return { total: decisions.length, changed, diffs, errors };
}

// --- list_engine_params / get_engine_params --------------------------------

export const LIST_ENGINE_PARAMS = "list_engine_params";
function registerListEngineParams(server: McpServer) {
  server.registerTool(
    LIST_ENGINE_PARAMS,
    {
      title: "List engine param versions",
      description:
        "Admin only. Browse engine parameter versions (which is active, notes, " +
        "created date). Takes no arguments.",
      inputSchema: {},
    },
    async (_args: Record<string, never>, extra: McpExtra) => {
      const { client } = await resolveAdmin(extra);
      return jsonResult({ versions: await listEngineParams(client) });
    },
  );
}

export const GET_ENGINE_PARAMS = "get_engine_params";
function registerGetEngineParams(server: McpServer) {
  server.registerTool(
    GET_ENGINE_PARAMS,
    {
      title: "Get / diff engine params",
      description:
        "Admin only. Get one engine-params version's full values; with " +
        "compare_to_version, return the dot-path diff between two versions.",
      inputSchema: {
        version: z.number().int().positive(),
        compare_to_version: z.number().int().positive().optional(),
      },
    },
    async (
      { version, compare_to_version }: { version: number; compare_to_version?: number },
      extra: McpExtra,
    ) => {
      const { client } = await resolveAdmin(extra);
      const a = await getEngineParamsVersion(client, version);
      if (!a) return jsonResult({ found: false, error: `version ${version} not found` });
      if (compare_to_version == null) {
        return jsonResult({
          found: true,
          version: a.version,
          is_active: a.is_active,
          notes: a.notes,
          // P0-3: the params exactly as stored, plus provenance. `is_replayable`
          // is false for legacy versions stored before snapshots existed — their
          // values were back-filled from defaults at read time, so they cannot be
          // reproduced byte-for-byte; `resolved` is the best-effort full set.
          schema_version: a.schema_version,
          params_hash: a.params_hash,
          is_replayable: a.is_replayable,
          hash_verified: a.hash_verified,
          params: a.params,
          resolved: a.resolved as unknown as Record<string, unknown> | null,
        });
      }
      const b = await getEngineParamsVersion(client, compare_to_version);
      if (!b)
        return jsonResult({ found: false, error: `version ${compare_to_version} not found` });
      return jsonResult({
        found: true,
        from_version: a.version,
        to_version: b.version,
        // diff the stored bytes, not the defaults-filled view — so legacy versions
        // that only differ in what was actually written show their real deltas
        diff: diffParams(a.params, b.params),
        note:
          a.is_replayable && b.is_replayable
            ? undefined
            : "One or both versions predate immutable snapshots; the diff reflects stored values only.",
      });
    },
  );
}

// --- propose_engine_params -------------------------------------------------

export const PROPOSE_ENGINE_PARAMS = "propose_engine_params";
function registerProposeEngineParams(server: McpServer) {
  server.registerTool(
    PROPOSE_ENGINE_PARAMS,
    {
      title: "Propose engine params",
      description:
        "Admin only. Write a new INACTIVE engine-params version. Provide " +
        "base_version to start from an existing version and pass only the keys " +
        "you want to change (deep-merged); or pass a full params object. The set " +
        "is zod-validated before storage — a malformed set is rejected and can " +
        "never be activated. Activate it separately after reviewing a replay.",
      inputSchema: {
        params: z.record(z.string(), z.unknown()),
        base_version: z.number().int().positive().optional(),
        notes: z.string().max(500).optional(),
      },
    },
    async (
      args: { params: Record<string, unknown>; base_version?: number; notes?: string },
      extra: McpExtra,
    ) => {
      const { client, userId } = await resolveAdmin(extra);
      let merged: Record<string, unknown> = args.params;
      if (args.base_version != null) {
        const base = await getEngineParamsVersion(client, args.base_version);
        if (!base)
          return jsonResult({ ok: false, error: `base version ${args.base_version} not found` });
        merged = deepMerge(base.params as unknown as Record<string, unknown>, args.params);
      }
      let newVersion: number;
      try {
        newVersion = await proposeEngineParams(client, merged as unknown as EngineParams, args.notes ?? null);
      } catch (e) {
        return jsonResult({
          ok: false,
          error: `params failed validation: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
      const summary = `proposed engine_params v${newVersion} (inactive)`;
      await recordMcpWrite(userId, PROPOSE_ENGINE_PARAMS, { base_version: args.base_version, notes: args.notes }, summary);
      return jsonResult({
        ok: true,
        version: newVersion,
        summary: `${summary}. Replay it before activating.`,
      });
    },
  );
}

// --- activate_engine_params ------------------------------------------------

export const ACTIVATE_ENGINE_PARAMS = "activate_engine_params";
function registerActivateEngineParams(server: McpServer) {
  server.registerTool(
    ACTIVATE_ENGINE_PARAMS,
    {
      title: "Activate engine params",
      description:
        "Admin only. Make an engine-params version the single active set. " +
        "Requires confirm_version to equal version (an explicit echo) — this " +
        "changes the live engine for all users' future generation.",
      inputSchema: {
        version: z.number().int().positive(),
        confirm_version: z.number().int().positive(),
      },
    },
    async (
      { version, confirm_version }: { version: number; confirm_version: number },
      extra: McpExtra,
    ) => {
      const { client, userId } = await resolveAdmin(extra);
      if (version !== confirm_version)
        return jsonResult({
          ok: false,
          error: `confirm_version (${confirm_version}) must echo version (${version}).`,
        });
      try {
        await activateEngineParams(client, version);
      } catch (e) {
        return jsonResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
      const summary = `activated engine_params v${version}`;
      await recordMcpWrite(userId, ACTIVATE_ENGINE_PARAMS, { version }, summary);
      return jsonResult({ ok: true, version, summary: `${summary} — now live for future generation.` });
    },
  );
}

// --- get_engine_decisions --------------------------------------------------

function shapeDecisions(decisions: DecisionRecord[]): Record<string, unknown> {
  return {
    count: decisions.length,
    decisions: decisions.map((d) => ({
      decision_id: d.id,
      // linkage so a decision chains into get_exercise_history /
      // explain_prescription / exercise-filtered tools without a re-lookup
      exercise_id: d.exercise_id,
      workout_exercise_id: d.workout_exercise_id,
      exercise_name: d.exercise_name,
      coordinate: d.coordinate,
      params_version: d.params_version,
      created_at: d.created_at,
      inputs: d.inputs,
      output: d.output,
    })),
  };
}

export const GET_ENGINE_DECISIONS = "get_engine_decisions";
function registerGetEngineDecisions(server: McpServer) {
  server.registerTool(
    GET_ENGINE_DECISIONS,
    {
      title: "Inspect engine decisions",
      description:
        "Admin only. The caller's own recorded engine decisions (inputs, output, " +
        "rationale), newest first, filterable by params version, exercise, and " +
        "date. The raw material for tuning and replay.",
      inputSchema: {
        params_version: z.number().int().positive().optional(),
        exercise_id: z.string().uuid().optional(),
        since: z.string().optional().describe("ISO date/time lower bound"),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (
      args: { params_version?: number; exercise_id?: string; since?: string; limit?: number },
      extra: McpExtra,
    ) => {
      const { client, userId } = await resolveAdmin(extra);
      const decisions = await getEngineDecisions(client, userId, {
        paramsVersion: args.params_version,
        exerciseId: args.exercise_id,
        since: args.since,
        limit: args.limit,
      });
      return jsonResult(shapeDecisions(decisions));
    },
  );
}

// --- replay_decisions ------------------------------------------------------

export const REPLAY_DECISIONS = "replay_decisions";
function registerReplayDecisions(server: McpServer) {
  server.registerTool(
    REPLAY_DECISIONS,
    {
      title: "Replay decisions",
      description:
        "Admin only. Re-run the caller's recorded engine decisions against a " +
        "candidate params version and return the prescription diffs (load / reps " +
        "/ sets / RIR that would change). The safe way to evaluate a proposed " +
        "version against real history before activating it. Read-only.",
      inputSchema: {
        candidate_version: z.number().int().positive(),
        params_version: z.number().int().positive().optional().describe("filter source decisions by the version they were made under"),
        exercise_id: z.string().uuid().optional(),
        since: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (
      args: {
        candidate_version: number;
        params_version?: number;
        exercise_id?: string;
        since?: string;
        limit?: number;
      },
      extra: McpExtra,
    ) => {
      const { client, userId } = await resolveAdmin(extra);
      const candidate = await getEngineParamsVersion(client, args.candidate_version);
      if (!candidate)
        return jsonResult({ ok: false, error: `candidate version ${args.candidate_version} not found` });
      if (!candidate.resolved)
        return jsonResult({
          ok: false,
          error: `candidate version ${args.candidate_version} no longer validates against the current schema and cannot be replayed`,
        });
      const decisions = await getEngineDecisions(client, userId, {
        paramsVersion: args.params_version,
        exerciseId: args.exercise_id,
        since: args.since,
        limit: args.limit,
      });
      const outcome = replayDecisions(decisions, candidate.resolved);
      return jsonResult({
        ok: true,
        candidate_version: args.candidate_version,
        candidate_is_replayable: candidate.is_replayable,
        ...outcome,
        note: "Diffs are what would change under the candidate; nothing was written. Activate separately.",
      });
    },
  );
}

// --- registry --------------------------------------------------------------

export function registerAdminTools(server: McpServer) {
  registerListEngineParams(server);
  registerGetEngineParams(server);
  registerProposeEngineParams(server);
  registerActivateEngineParams(server);
  registerGetEngineDecisions(server);
  registerReplayDecisions(server);
}
