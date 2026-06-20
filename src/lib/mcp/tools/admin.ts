import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  engineInputsSchema,
  prescribe,
  type EngineParams,
  type Prescription,
} from "@/lib/engine";
import { getProfile } from "@/lib/queries/profiles";
import {
  listEngineParams,
  getEngineParamsVersion,
  proposeEngineParams,
  activateEngineParams,
  getParamsDeletionImpact,
  deleteEngineParamsVersion,
  getEngineDecisions,
  type DecisionRecord,
} from "@/lib/queries/engine-admin";
import { resolveSession, type McpExtra, type McpClient } from "../session";
import { toolResult, type EnvelopeOpts } from "../envelope";
import { recordMcpWrite } from "../audit";

/**
 * Slice 4 admin/tuning + replay tools (05 §Admin & tuning), role-gated by
 * `profiles.role = 'admin'`. The MCP connector is the entire admin interface
 * (08 §3) — no admin UI exists. The tuning loop: inspect decisions → propose a
 * version → replay real history against it → review diffs → activate. Pure
 * merge/diff/replay helpers are exported for tests.
 */

function jsonResult(payload: Record<string, unknown>, opts: EnvelopeOpts = {}) {
  return toolResult(payload, opts);
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
  replayed: Pick<Prescription, "weight" | "reps" | "sets" | "targetRir"> &
    Partial<Pick<Prescription, "rationale" | "trace">>,
): PrescriptionDiff {
  const fields: PrescriptionDiff["fields"] = {};
  for (const key of ["weight", "reps", "sets", "targetRir"] as const) {
    const from = stored[key];
    const to = replayed[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) fields[key] = { from, to };
  }
  return { changed: Object.keys(fields).length > 0, fields };
}

export interface ReplayOutcomeBreakdown {
  unchanged: number;
  changed: number;
  /** decision.inputs no longer parse as engine inputs */
  invalid_source: number;
  /** prescribe() threw on otherwise-valid inputs */
  execution_error: number;
}

export interface ReplaySample {
  decision_id: string;
  exercise_name: string | null;
  coordinate: string | null;
}

export interface ReplayOutcome {
  total: number;
  changed: number;
  /** legacy alias: every decision that did not yield a clean diff */
  errors: number;
  outcomes: ReplayOutcomeBreakdown;
  /** how many replayed prescriptions exercised each engine rule */
  rule_coverage: Record<string, number>;
  diffs: (ReplaySample & { fields: PrescriptionDiff["fields"] })[];
  /** a bounded sample of decisions the candidate would leave unchanged */
  unchanged_sample: ReplaySample[];
}

/**
 * Re-run stored decisions against candidate params and classify each outcome
 * (P1-3). Pure: no I/O. `unchangedSampleSize` bounds the optional sample of
 * decisions the candidate leaves untouched (0 = none).
 */
export function replayDecisions(
  decisions: DecisionRecord[],
  candidateParams: EngineParams,
  unchangedSampleSize = 0,
): ReplayOutcome {
  const outcomes: ReplayOutcomeBreakdown = {
    unchanged: 0,
    changed: 0,
    invalid_source: 0,
    execution_error: 0,
  };
  const rule_coverage: Record<string, number> = {};
  const diffs: ReplayOutcome["diffs"] = [];
  const unchanged_sample: ReplaySample[] = [];

  for (const d of decisions) {
    const sample: ReplaySample = {
      decision_id: d.id,
      exercise_name: d.exercise_name,
      coordinate: d.coordinate,
    };

    const parsed = engineInputsSchema.safeParse(d.inputs);
    if (!parsed.success) {
      outcomes.invalid_source += 1;
      continue;
    }

    let replayed: Prescription;
    try {
      replayed = prescribe(parsed.data, candidateParams);
    } catch {
      outcomes.execution_error += 1;
      continue;
    }

    // rule coverage from the candidate's resulting trace
    for (const step of replayed.trace) {
      rule_coverage[step.rule] = (rule_coverage[step.rule] ?? 0) + 1;
    }

    const diff = diffPrescription(d.output, replayed);
    if (diff.changed) {
      outcomes.changed += 1;
      diffs.push({ ...sample, fields: diff.fields });
    } else {
      outcomes.unchanged += 1;
      if (unchanged_sample.length < unchangedSampleSize) unchanged_sample.push(sample);
    }
  }

  return {
    total: decisions.length,
    changed: outcomes.changed,
    errors: outcomes.invalid_source + outcomes.execution_error,
    outcomes,
    rule_coverage,
    diffs,
    unchanged_sample,
  };
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
        "changes the live engine for all users' future generation. No manual " +
        "regenerate step is needed: already-planned, not-yet-started prescriptions " +
        "refresh automatically on each user's next view (the read-path freshness " +
        "reconcile detects the changed engine_params token and recomputes them).",
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
      exercise_name: d.exercise_name,
      workout_exercise_id: d.workout_exercise_id,
      source_workout_exercise_id: d.source_workout_exercise_id,
      workout_id: d.workout_id,
      microcycle_id: d.microcycle_id,
      mesocycle_id: d.mesocycle_id,
      coordinate: d.coordinate,
      params_version: d.params_version,
      params_hash: d.params_hash,
      provenance: d.provenance,
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
        cursor: z
          .string()
          .optional()
          .describe("keyset cursor from a prior page's next_cursor (created_at)"),
      },
    },
    async (
      args: {
        params_version?: number;
        exercise_id?: string;
        since?: string;
        limit?: number;
        cursor?: string;
      },
      extra: McpExtra,
    ) => {
      const { client, userId } = await resolveAdmin(extra);
      const limit = Math.min(args.limit ?? 25, 100);
      const decisions = await getEngineDecisions(client, userId, {
        paramsVersion: args.params_version,
        exerciseId: args.exercise_id,
        since: args.since,
        limit,
        cursor: args.cursor,
      });
      // a full page implies there may be more; hand back the keyset to continue
      const next_cursor =
        decisions.length === limit ? decisions[decisions.length - 1].created_at : null;
      return jsonResult({ ...shapeDecisions(decisions), next_cursor });
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
        unchanged_sample: z
          .number()
          .int()
          .min(0)
          .max(20)
          .optional()
          .describe("include up to N decisions the candidate would leave unchanged"),
      },
    },
    async (
      args: {
        candidate_version: number;
        params_version?: number;
        exercise_id?: string;
        since?: string;
        limit?: number;
        unchanged_sample?: number;
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
          // invalid_candidate: the candidate itself no longer validates
          error: `candidate version ${args.candidate_version} no longer validates against the current schema and cannot be replayed`,
          invalid_candidate: true,
        });
      const decisions = await getEngineDecisions(client, userId, {
        paramsVersion: args.params_version,
        exerciseId: args.exercise_id,
        since: args.since,
        limit: args.limit,
      });
      const outcome = replayDecisions(
        decisions,
        candidate.resolved,
        args.unchanged_sample ?? 0,
      );
      // source build identity (P0-3 linkage): which params versions + hashes the
      // replayed decisions were originally recorded under
      const sourceVersions = [...new Set(decisions.map((d) => d.params_version))].sort(
        (a, b) => a - b,
      );
      const sourceHashes = [
        ...new Set(decisions.map((d) => d.params_hash).filter((h): h is string => h != null)),
      ];
      return jsonResult({
        ok: true,
        candidate: {
          version: candidate.version,
          params_hash: candidate.params_hash,
          code_sha: candidate.provenance.code_sha,
          is_replayable: candidate.is_replayable,
        },
        source: {
          params_versions: sourceVersions,
          params_hashes: sourceHashes,
        },
        ...outcome,
        note: "Diffs are what would change under the candidate; nothing was written. Activate separately.",
      });
    },
  );
}

// --- simulate_prescriptions ------------------------------------------------

export const SIMULATE_PRESCRIPTIONS = "simulate_prescriptions";
function registerSimulatePrescriptions(server: McpServer) {
  server.registerTool(
    SIMULATE_PRESCRIPTIONS,
    {
      title: "Simulate prescriptions",
      description:
        "Admin only. Run a params version against hypothetical engine inputs " +
        "(not stored history) and return what it would prescribe — for probing a " +
        "candidate on cases the data hasn't produced yet. Each case is validated " +
        "as engine inputs; invalid cases are reported, not silently dropped. " +
        "Read-only; nothing is written.",
      inputSchema: {
        version: z.number().int().positive(),
        cases: z.array(z.record(z.string(), z.unknown())).min(1).max(50),
      },
    },
    async (
      args: { version: number; cases: Record<string, unknown>[] },
      extra: McpExtra,
    ) => {
      const { client } = await resolveAdmin(extra);
      const params = await getEngineParamsVersion(client, args.version);
      if (!params)
        return jsonResult({ ok: false, error: `version ${args.version} not found` });
      if (!params.resolved)
        return jsonResult({
          ok: false,
          error: `version ${args.version} no longer validates and cannot be simulated`,
          invalid_candidate: true,
        });
      const results = args.cases.map((c, index) => {
        const parsed = engineInputsSchema.safeParse(c);
        if (!parsed.success) {
          // field-level detail so an admin can see *which* input is wrong, not
          // just "invalid engine inputs" (§5.11)
          return {
            case_index: index,
            ok: false,
            error: "invalid engine inputs",
            issues: parsed.error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          };
        }
        try {
          const output = prescribe(parsed.data, params.resolved!);
          return { case_index: index, ok: true, output };
        } catch (e) {
          return {
            case_index: index,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      });
      return jsonResult({
        ok: true,
        version: args.version,
        params_hash: params.params_hash,
        count: results.length,
        results,
      });
    },
  );
}

// --- discard_engine_params -------------------------------------------------

export const DISCARD_ENGINE_PARAMS = "discard_engine_params";
function registerDiscardEngineParams(server: McpServer) {
  server.registerTool(
    DISCARD_ENGINE_PARAMS,
    {
      title: "Discard engine params",
      description:
        "Admin only. Delete an INACTIVE engine-params version (undo for " +
        "propose_engine_params — removes a mistaken proposal). The active version " +
        "can never be discarded, and a version referenced by any recorded engine " +
        "decision is preserved so historical decisions keep a resolvable params " +
        "snapshot. Requires confirm_version to echo version.",
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
      const impact = await getParamsDeletionImpact(client, version);
      if (!impact.found)
        return jsonResult({ ok: false, error: `engine_params version ${version} does not exist.` });
      if (impact.isActive)
        return jsonResult({
          ok: false,
          error: `version ${version} is active — activate a different version before discarding it.`,
        });
      if (impact.decisionRefs > 0)
        return jsonResult({
          ok: false,
          error: `version ${version} is referenced by ${impact.decisionRefs} recorded decision(s); it is kept so those decisions stay reproducible.`,
        });
      await deleteEngineParamsVersion(client, version);
      const summary = `discarded inactive engine_params v${version}`;
      await recordMcpWrite(userId, DISCARD_ENGINE_PARAMS, { version }, summary);
      return jsonResult({ ok: true, version, summary });
    },
  );
}

// --- registry --------------------------------------------------------------
//
// Note (doc 14 §10): the `regenerate_planned_prescriptions` and
// `catch_up_generation` MCP tools were RETIRED here. The read-path freshness
// reconcile (`reconcilePrescriptions`) now keeps every input change propagated
// automatically — no manual "re-run the engine on planned rows" step. The
// generation gap-heal those tools fronted survives as the on-load
// `catchUpMesoGeneration` auto-heal. `replay_decisions` / `simulate_prescriptions`
// stay as read-only inspection (preview what a recompute would produce).

export function registerAdminTools(server: McpServer) {
  registerListEngineParams(server);
  registerGetEngineParams(server);
  registerProposeEngineParams(server);
  registerActivateEngineParams(server);
  registerGetEngineDecisions(server);
  registerReplayDecisions(server);
  registerSimulatePrescriptions(server);
  registerDiscardEngineParams(server);
}
