import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  engineInputsSchema,
  prescribe,
  resolveEffectiveParams,
  seedMeso,
  type EngineParams,
  type Prescription,
} from "@/lib/engine";
import {
  listEngineParams,
  getEngineParamsVersion,
  proposeEngineParams,
  activateEngineParams,
  getParamsDeletionImpact,
  deleteEngineParamsVersion,
  getEngineDecisions,
  getProgressionHistory,
  PROGRESSION_AUDIT_FETCH_LIMIT,
  type DecisionRecord,
  type ExerciseProgressionHistory,
} from "@/lib/queries/engine-admin";
import { getActiveEngineParams } from "@/lib/queries/generation";
import {
  e1rmBlockChanged,
  restampLoggedSetE1rms,
} from "@/lib/queries/e1rm-restamp";
import { createServiceClient } from "@/lib/supabase/service";
import { reportError } from "@/lib/observability/report";
import {
  checkAnnouncement,
  RELEASE_IMPACT_MEANING,
  type ReleaseImpact,
} from "@/lib/version/release-impact";
import { CURRENT_VERSION, RELEASES } from "@/content/releases";
import { registerLlmAdminTools, LLM_ADMIN_TOOL_NAMES } from "./admin-llm";
import { registerCoachingPromptTools, COACHING_PROMPT_TOOL_NAMES } from "./admin-prompt";
import { resolveAdmin } from "./admin-gate";
import type { McpExtra } from "../session";
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

/** doc 23 §9.5 — required on both parameter tools, so the classification is
 *  made at the moment someone is looking at the diff rather than remembered. */
const releaseImpactSchema = z
  .enum(["none", "fix", "feature"])
  .describe(
    `what this does to users (doc 23 §9.5). none: ${RELEASE_IMPACT_MEANING.none}. fix: ${RELEASE_IMPACT_MEANING.fix}. feature: ${RELEASE_IMPACT_MEANING.feature}.`,
  );

/**
 * Human-readable text for a thrown value. `String(e)` alone yields the useless
 * `"[object Object]"` for a PostgrestError — which is exactly what a failing
 * admin tool reported, hiding the real cause (a 414 from an oversized `.in()`
 * filter) behind a shrug. Postgrest errors carry `message`/`details`/`hint`/
 * `code` as plain properties and are NOT `Error` instances, so pull them out.
 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint]
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    const code = typeof o.code === "string" ? ` [${o.code}]` : "";
    if (parts.length > 0) return `${parts.join(" — ")}${code}`;
    try {
      return JSON.stringify(e);
    } catch {
      /* fall through to String() */
    }
  }
  return String(e);
}

// call-time admin gate: shared with admin-llm.ts via ./admin-gate

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

    // fold this exercise's increment override into the candidate params exactly
    // as the live generation / recompute path does (resolveEffectiveParams) — the
    // override sets the loadable `rounding` step every prescribed weight rounds to,
    // so replaying without it diffs spuriously against the stock step (the
    // per-exercise-override replay-fidelity gap).
    const effectiveCandidate = resolveEffectiveParams(
      candidateParams,
      d.incrementOverride != null ? { weightIncrement: d.incrementOverride } : null,
      parsed.data.exercise.equipmentType,
    );

    let replayed: Prescription;
    try {
      // replay the engine of the decision's kind (doc 14 §6.2) so a seed is
      // re-run through seedMeso, not prescribe — otherwise every seed would
      // diff spuriously against its stored output. Pass the seed's goal + stored
      // anchor so the anchor-aware seed (§S1) is exercised on replay, not silently
      // skipped (which would mask a seed_from_anchor change).
      replayed =
        d.kind === "seed"
          ? seedMeso(
              parsed.data.weekPeak
                ? {
                    weight: parsed.data.weekPeak.weight,
                    reps: parsed.data.weekPeak.reps,
                    sets: parsed.data.weekPeak.sets,
                  }
                : null,
              parsed.data.initial,
              parsed.data.exercise,
              parsed.data.user,
              parsed.data.week.targetRir,
              effectiveCandidate,
              {
                goalType: parsed.data.goalType,
                anchor: parsed.data.strengthAnchor,
                // R10: stored seed inputs carry the lifter's bodyweight; omitting
                // it made every bodyweight-lift seed replay as the deferred
                // null-weight prescription → a spurious diff on every candidate.
                bodyweight: parsed.data.bodyweight,
                // doc 16 §3.7: the seed's recorded earn context + governors'
                // lookback replay verbatim, so a stepped seed reproduces its
                // stored output under the same params (and diffs honestly
                // under a candidate that changes the gate).
                isDeload: parsed.data.week.isDeload,
                ...(parsed.data.seedEarn != null
                  ? {
                      earn: parsed.data.seedEarn,
                      daysSincePreviousSession:
                        parsed.data.daysSincePreviousSession ?? null,
                    }
                  : {}),
                ...(parsed.data.progressionHistory !== undefined
                  ? { progressionHistory: parsed.data.progressionHistory }
                  : {}),
                // doc 17 §3: the recorded plan rate replays verbatim, so a
                // candidate that flips `rate_source` to "plan" diffs honestly
                // against decisions recorded under "band".
                ...(parsed.data.planStrengthRate !== undefined
                  ? { planStrengthRate: parsed.data.planStrengthRate }
                  : {}),
                // doc 17 §7: the recorded envelope position replays verbatim
                ...(parsed.data.bandPosition !== undefined
                  ? { bandPosition: parsed.data.bandPosition }
                  : {}),
              },
            )
          : prescribe(parsed.data, effectiveCandidate);
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

// --- get_engine_params (list / get / diff — R25 consolidation) --------------
// `list_engine_params` was a strict subset (its no-arg browse is now this
// tool's no-arg mode); retired 2026-07-05 to cut tool-choice ambiguity.

export const GET_ENGINE_PARAMS = "get_engine_params";
function registerGetEngineParams(server: McpServer) {
  server.registerTool(
    GET_ENGINE_PARAMS,
    {
      title: "Browse / get / diff engine params",
      description:
        "Admin only. With no arguments, browse all engine-params versions " +
        "(which is active, notes, created date). With version, get that " +
        "version's full values; add compare_to_version for the dot-path diff " +
        "between two versions.",
      inputSchema: {
        version: z.number().int().positive().optional(),
        compare_to_version: z.number().int().positive().optional(),
      },
    },
    async (
      { version, compare_to_version }: { version?: number; compare_to_version?: number },
      extra: McpExtra,
    ) => {
      const { client } = await resolveAdmin(extra);
      if (version == null) {
        if (compare_to_version != null)
          return jsonResult({
            ok: false,
            error: "compare_to_version needs a version to diff against.",
          });
        return jsonResult({ versions: await listEngineParams(client) });
      }
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
        "never be activated. Activate it separately after reviewing a replay. " +
        "release_impact classifies what activating this set would do to users " +
        "(doc 23 §9.5): " +
        `none = ${RELEASE_IMPACT_MEANING.none}; ` +
        `fix = ${RELEASE_IMPACT_MEANING.fix}; ` +
        `feature = ${RELEASE_IMPACT_MEANING.feature}. ` +
        "Run replay_decisions first — it reports the diff this version would " +
        "produce, so the classification is a check rather than a guess.",
      inputSchema: {
        params: z.record(z.string(), z.unknown()),
        base_version: z.number().int().positive().optional(),
        notes: z.string().max(500).optional(),
        release_impact: releaseImpactSchema,
      },
    },
    async (
      args: {
        params: Record<string, unknown>;
        base_version?: number;
        notes?: string;
        release_impact: ReleaseImpact;
      },
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
          error: `params failed validation: ${errorMessage(e)}`,
        });
      }
      const summary = `proposed engine_params v${newVersion} (inactive, release_impact: ${args.release_impact})`;
      await recordMcpWrite(
        userId,
        PROPOSE_ENGINE_PARAMS,
        {
          base_version: args.base_version,
          notes: args.notes,
          release_impact: args.release_impact,
        },
        summary,
      );
      return jsonResult({
        ok: true,
        version: newVersion,
        release_impact: args.release_impact,
        summary: `${summary}. Replay it before activating.`,
        // the classification is carried forward by the caller, not stored:
        // activation re-asks for it, so a set re-classified after a replay is
        // judged on what it actually does rather than on the first guess
        next:
          args.release_impact === "feature"
            ? "Announce this in a feature release BEFORE activating — activate_engine_params refuses a feature-classified set with no live announcing release (doc 23 §9.5)."
            : "Activate when the replay looks right.",
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
        "reconcile detects the changed engine_params token and recomputes them). " +
        "If the new version changes the e1rm block, every stored per-set e1RM " +
        "stamp is recomputed under the new params (T-N33) — the result reports " +
        "how many rows were restamped. " +
        "release_impact classifies what this activation does to users (doc 23 " +
        `§9.5): none = ${RELEASE_IMPACT_MEANING.none}; ` +
        `fix = ${RELEASE_IMPACT_MEANING.fix}; ` +
        `feature = ${RELEASE_IMPACT_MEANING.feature}. ` +
        "A feature-classified activation must name announced_in — a live " +
        "feature or major release that tells users about it — and is REFUSED " +
        "without one. Announce, then activate.",
      inputSchema: {
        version: z.number().int().positive(),
        confirm_version: z.number().int().positive(),
        release_impact: releaseImpactSchema,
        announced_in: z
          .string()
          .optional()
          .describe(
            'the live release announcing this change, e.g. "1.1.0"; required when release_impact is "feature"',
          ),
      },
    },
    async (
      {
        version,
        confirm_version,
        release_impact,
        announced_in,
      }: {
        version: number;
        confirm_version: number;
        release_impact: ReleaseImpact;
        announced_in?: string;
      },
      extra: McpExtra,
    ) => {
      const { client, userId } = await resolveAdmin(extra);
      if (version !== confirm_version)
        return jsonResult({
          ok: false,
          error: `confirm_version (${confirm_version}) must echo version (${version}).`,
        });
      // doc 23 §9.5 / T10 — an activation is a user-visible change with no
      // diff. The same shape of refusal as confirm_version: a check, not a
      // reminder in a runbook.
      const announcement = checkAnnouncement(
        release_impact,
        announced_in,
        RELEASES,
        CURRENT_VERSION,
      );
      if (!announcement.ok)
        return jsonResult({ ok: false, error: announcement.error });
      // capture the outgoing active version BEFORE the flip, so the T-N33
      // restamp can compare e1rm blocks (already-active target ⇒ no change).
      let prior: EngineParams | null = null;
      try {
        prior = (await getActiveEngineParams(client)).params;
      } catch {
        prior = null; // no resolvable active version — restamp decides via null
      }
      try {
        await activateEngineParams(client, version);
      } catch (e) {
        return jsonResult({ ok: false, error: errorMessage(e) });
      }

      // T-N33 (owner decision 2026-07-04): stored per-set e1RM stamps are
      // derived values frozen under the params active at log time; when the
      // activation changes the e1rm block, restamp them under the new params
      // so history/display agrees with every live engine estimate. Runs on the
      // service client (stamps are global, per-user rows). Best-effort: the
      // activation itself is already committed, so a restamp failure is
      // reported, not thrown — re-activating (or any later e1rm-block change)
      // re-runs it, and the pass is idempotent.
      let restamp: { scanned: number; updated: number } | null = null;
      let restampError: string | null = null;
      const detail = await getEngineParamsVersion(client, version);
      if (detail?.resolved && e1rmBlockChanged(prior, detail.resolved)) {
        try {
          restamp = await restampLoggedSetE1rms(
            createServiceClient(),
            detail.resolved,
          );
        } catch (e) {
          restampError = errorMessage(e);
          await reportError("mcp:activate-params-restamp", e, { version });
        }
      }

      const summary = `activated engine_params v${version} (release_impact: ${release_impact}${announced_in ? `, announced in ${announced_in}` : ""})`;
      await recordMcpWrite(
        userId,
        ACTIVATE_ENGINE_PARAMS,
        { version, release_impact, announced_in },
        summary,
      );
      return jsonResult({
        ok: true,
        version,
        release_impact,
        announced_in: announced_in ?? null,
        summary: `${summary} — now live for future generation.`,
        e1rm_restamp: restampError
          ? { ran: true, error: restampError }
          : restamp
            ? { ran: true, ...restamp }
            : { ran: false, reason: "e1rm block unchanged" },
      });
    },
  );
}

// --- get_engine_decisions --------------------------------------------------

function shapeDecisions(decisions: DecisionRecord[]): Record<string, unknown> {
  return {
    count: decisions.length,
    decisions: decisions.map((d) => ({
      decision_id: d.id,
      // which engine produced it: "advance" (prescribe) or "seed" (seedMeso)
      kind: d.kind,
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
        "rationale), newest first, filterable by params version, exercise, " +
        "date, and trace rule/status (e.g. rule=progression + status=stepped — " +
        "the doc-16 earned-step audit surface). The raw material for tuning " +
        "and replay.",
      inputSchema: {
        params_version: z.number().int().positive().optional(),
        exercise_id: z.string().uuid().optional(),
        since: z.string().optional().describe("ISO date/time lower bound"),
        rule: z
          .string()
          .optional()
          .describe(
            'only decisions whose trace has a step with this rule (e.g. "progression")',
          ),
        status: z
          .string()
          .optional()
          .describe(
            'narrow to trace steps carrying this status ("stepped" | "vanished" | "paced" | "not_earned")',
          ),
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
        rule?: string;
        status?: string;
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
        rule: args.rule,
        status: args.status,
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

// --- get_progression_history (doc 16 §8.3, Phase 4) --------------------------

/** Default audit window: two mesos of history, comfortably past the pacer's
 *  90-day lookback, without dredging the whole table by default. */
const PROGRESSION_AUDIT_DEFAULT_DAYS = 180;

function shapeProgressionHistory(x: ExerciseProgressionHistory) {
  const s = x.summary;
  const gain = (g: typeof s.prescribedGain) =>
    g
      ? {
          first: g.first,
          last: g.last,
          gain_pct: g.gainPct,
          gain_pct_per_30d: g.gainPctPer30d,
          span_days: g.spanDays,
          points: g.points,
        }
      : null;
  return {
    exercise_id: x.exercise_id,
    exercise_name: x.exercise_name,
    summary: {
      decisions: s.decisions,
      status_counts: s.statusCounts,
      governor_firings: s.governorFirings,
      gate_failures: s.gateFailures,
      vanished_share: s.vanishedShare,
      earned_then_met: s.earnedThenMet,
      earned_then_missed: s.earnedThenMissed,
      earned_unanswered: s.earnedUnanswered,
      open_ask: s.openAsk,
      prescribed_gain: gain(s.prescribedGain),
      measured_gain: gain(s.measuredGain),
    },
    series: x.series,
    series_truncated: x.series_truncated,
  };
}

export const GET_PROGRESSION_HISTORY = "get_progression_history";
function registerGetProgressionHistory(server: McpServer) {
  server.registerTool(
    GET_PROGRESSION_HISTORY,
    {
      title: "Progression history (audit aggregate)",
      description:
        "Admin only. The earned-step audit aggregate over the caller's own " +
        "recorded engine decisions, per exercise: earn/miss/skip status mix, " +
        "governor firings, gate-failure reasons, vanished-ask share (the " +
        "increment-sizing signal), trailing prescribed vs measured e1RM gain, " +
        "and a bounded chronological event series. Read-only aggregation — " +
        "nothing new is stored. Empty while the progression mode is inactive " +
        "(no decision carries a progression step).",
      inputSchema: {
        exercise_id: z.string().uuid().optional(),
        since: z
          .string()
          .optional()
          .describe("ISO date/time lower bound (default: 180 days back)"),
        series_limit: z
          .number()
          .int()
          .min(0)
          .max(100)
          .optional()
          .describe("events per exercise in the series (default 20; 0 = summaries only)"),
      },
    },
    async (
      args: { exercise_id?: string; since?: string; series_limit?: number },
      extra: McpExtra,
    ) => {
      const { client, userId } = await resolveAdmin(extra);
      // prescribed-side pricing basis: the ACTIVE params' e1RM curve — the
      // same basis the governors' live lookback derivation prices through
      const { version, params } = await getActiveEngineParams(client);
      const since =
        args.since ??
        new Date(Date.now() - PROGRESSION_AUDIT_DEFAULT_DAYS * 86_400_000).toISOString();
      const result = await getProgressionHistory(client, userId, params, {
        exerciseId: args.exercise_id,
        since,
        seriesLimit: args.series_limit,
      });
      return jsonResult({
        since,
        pricing_params_version: version,
        decisions_scanned: result.decisions_scanned,
        exercise_count: result.exercises.length,
        exercises: result.exercises.map(shapeProgressionHistory),
        ...(result.window_truncated
          ? {
              note: `fetch window filled (${PROGRESSION_AUDIT_FETCH_LIMIT} decisions) — the oldest history was cut off; narrow with since/exercise_id`,
            }
          : {}),
      });
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
            error: errorMessage(e),
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

// --- restamp_e1rm ----------------------------------------------------------

export const RESTAMP_E1RM = "restamp_e1rm";
function registerRestampE1rm(server: McpServer) {
  server.registerTool(
    RESTAMP_E1RM,
    {
      title: "Restamp per-set e1RM",
      description:
        "Admin only. Recompute every stored per-set e1RM stamp (and its " +
        "confidence band) under the currently active engine params, using the " +
        "shared RIR resolution `rir_reported ?? the slot's prescribed " +
        "target_rir` (doc 21 §2). Idempotent — only rows whose value or " +
        "confidence actually moves are rewritten, and a re-run writes nothing. " +
        "activate_engine_params already runs this automatically when a version " +
        "changes the e1rm block; this tool exists for the case where the " +
        "RESOLUTION changed but no param value did (the one-time N71 " +
        "re-levelling, which moves every historical stamp upward). Requires " +
        "confirm to be the literal string 'restamp'.",
      inputSchema: {
        confirm: z.string(),
      },
    },
    async ({ confirm }: { confirm: string }, extra: McpExtra) => {
      const { client, userId } = await resolveAdmin(extra);
      if (confirm !== "restamp")
        return jsonResult({
          ok: false,
          error: "confirm must be the literal string 'restamp'.",
        });
      const { params, version } = await getActiveEngineParams(client);
      let result: { scanned: number; updated: number };
      try {
        result = await restampLoggedSetE1rms(createServiceClient(), params);
      } catch (e) {
        await reportError("mcp:restamp-e1rm", e, { version });
        return jsonResult({
          ok: false,
          error: errorMessage(e),
        });
      }
      const summary = `restamped ${result.updated} of ${result.scanned} logged sets under engine_params v${version}`;
      await recordMcpWrite(userId, RESTAMP_E1RM, { version }, summary);
      return jsonResult({ ok: true, version, ...result, summary });
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
  registerGetEngineParams(server);
  registerProposeEngineParams(server);
  registerActivateEngineParams(server);
  registerGetEngineDecisions(server);
  registerGetProgressionHistory(server);
  registerReplayDecisions(server);
  registerSimulatePrescriptions(server);
  registerDiscardEngineParams(server);
  registerRestampE1rm(server);
  // N58 follow-up: the LLM-explanation test loop + forced recompute
  // (admin-llm.ts) — registered here so the one entry point stays true.
  registerLlmAdminTools(server);
  // doc 19 / N60 follow-up: edit the LLM coaching system prompt (admin-prompt.ts).
  registerCoachingPromptTools(server);
}

/** Every role-gated tool this module registers — the roster the tools/list
 *  visibility filter hides from non-admins (PH33). */
export const ADMIN_TOOL_NAMES: ReadonlySet<string> = new Set([
  GET_ENGINE_PARAMS,
  PROPOSE_ENGINE_PARAMS,
  ACTIVATE_ENGINE_PARAMS,
  GET_ENGINE_DECISIONS,
  GET_PROGRESSION_HISTORY,
  REPLAY_DECISIONS,
  SIMULATE_PRESCRIPTIONS,
  DISCARD_ENGINE_PARAMS,
  RESTAMP_E1RM,
  ...LLM_ADMIN_TOOL_NAMES,
  ...COACHING_PROMPT_TOOL_NAMES,
]);
