import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  dryRunDecisionTriggers,
  generateDecisionExplanations,
  probeDecisionExplanation,
  probeLlmConnectivity,
  resolveCoachingPromptSelection,
  type CoachingPromptSelection,
  type ExplanationOutcome,
  type ResolvedCoachingPrompt,
} from "@/lib/llm/explanations";
import { llmExplanationsMode } from "@/lib/llm/config";
import { explanationModel } from "@/lib/llm/openai";
import { COACHING_PROMPT_VERSION } from "@/lib/llm/coaching";
import { getActiveCoachingPrompt } from "@/lib/queries/coaching-prompts";
import { resolveActiveMesocycle } from "@/lib/queries/cycles";
import { reconcilePrescriptions } from "@/lib/queries/regeneration";
import { listOpenDecisionTargets } from "@/lib/queries/open-decisions";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveAdmin } from "./admin-gate";
import { toolResult, type EnvelopeOpts } from "../envelope";
import { recordMcpWrite } from "../audit";
import type { McpExtra, McpClient } from "../session";

/**
 * N58 follow-up (2026-07-20 testing session) — the LLM-explanation test loop
 * as admin MCP tools. The v1 pipeline is fire-and-forget by design (doc 18
 * §5), which made its first live failure invisible: errors lived only in
 * Vercel function logs, no rows landed, and there was no way to re-trigger a
 * generation without re-training. These tools close that loop from a Claude
 * session:
 *
 *   get_llm_explanation_status — config + stored rows + the durable failure log
 *   test_llm_explanation      — one live call, exact upstream error surfaced
 *   generate_explanations     — synchronous (re)generation for a chosen scope
 *   recompute_prescriptions   — forced re-decide of open rows (all / day / exercise)
 *
 * All admin-gated (resolveAdmin), identity always from the session (hard rule
 * #5); recompute touches only planned rows with no logged sets (the standing
 * reconcile invariants — logged history is untouchable).
 */

function jsonResult(payload: Record<string, unknown>, opts: EnvelopeOpts = {}) {
  return toolResult(payload, opts);
}

/** Explanation generation is capped per call so one tool call can't run the
 *  serverless window out or fire an unbounded token spend. Matches the
 *  write-site burst bound (explanations.ts MAX_BURST). */
const GENERATION_CAP = 40;

async function generateInChunks(
  userId: string,
  decisionIds: string[],
  overwrite: boolean,
  opts?: { prompt?: ResolvedCoachingPrompt; preview?: boolean },
): Promise<{ stored: number; results: ExplanationOutcome[] }> {
  const results: ExplanationOutcome[] = [];
  let stored = 0;
  for (let i = 0; i < decisionIds.length; i += GENERATION_CAP) {
    const run = await generateDecisionExplanations(
      userId,
      decisionIds.slice(i, i + GENERATION_CAP),
      undefined,
      { overwrite, prompt: opts?.prompt, preview: opts?.preview },
    );
    stored += run.stored;
    results.push(...run.results);
  }
  return { stored, results };
}

/** N62 — resolve the `prompt_version` / `prompt_body` override the LLM admin
 *  tools accept, so a draft revision can be previewed without activating it.
 *  Returns the refusal message instead of a selection when the args conflict or
 *  the named version doesn't exist. */
async function resolvePromptArgs(
  client: McpClient,
  args: { prompt_version?: number; prompt_body?: string },
): Promise<CoachingPromptSelection | { error: string }> {
  if (args.prompt_version == null && args.prompt_body == null) {
    return resolveCoachingPromptSelection(client);
  }
  return resolveCoachingPromptSelection(client, {
    version: args.prompt_version,
    body: args.prompt_body,
  });
}

function promptReport(selection: CoachingPromptSelection) {
  return {
    source: selection.source, // active | draft_version | ad_hoc_body | code_fallback
    version: selection.prompt.version || null,
    char_count: selection.prompt.body.length,
  };
}

function shapeOutcomes(results: ExplanationOutcome[]) {
  return results.map((r) => ({
    decision_id: r.decisionId,
    exercise: r.exercise,
    ok: r.ok,
    disposition: r.disposition, // stored | skipped | abstained | discarded | error
    ...(r.triggers ? { triggers: r.triggers } : {}),
    ...(r.disposition === "stored" || r.disposition === "previewed"
      ? {
          body: r.body,
          note_class: r.noteClass ?? null,
          model: r.model,
          tokens_in: r.tokensIn,
          tokens_out: r.tokensOut,
        }
      : {}),
    ...(r.disposition === "abstained"
      ? { note_class: r.noteClass ?? null, tokens_in: r.tokensIn, tokens_out: r.tokensOut }
      : {}),
    ...(r.ok ? {} : { stage: r.stage, error: r.error }),
  }));
}

/** Pure: validate the recompute tool's scope args — either the explicit
 *  all=true opt-in, or a narrower exercise/week/day scope, never both.
 *  Returns the refusal message, or null when valid. Exported for tests. */
export function validateRecomputeScope(args: {
  all?: boolean;
  exercise_id?: string;
  week?: number;
  day?: number;
}): string | null {
  const scoped = args.exercise_id != null || args.week != null || args.day != null;
  if (!args.all && !scoped) {
    return "pass a scope: all=true for every open row, or exercise_id and/or week/day";
  }
  if (args.all && scoped) {
    return "all=true cannot be combined with exercise_id/week/day";
  }
  return null;
}

/** The caller's active meso id, or the explicitly passed one (validated as
 *  theirs by RLS — the read simply finds nothing otherwise). */
async function resolveMesoId(
  client: McpClient,
  userId: string,
  mesocycleId: string | undefined,
): Promise<{ mesoId: string | null; error?: string }> {
  if (mesocycleId) {
    const { data, error } = await client
      .from("mesocycles")
      .select("id")
      .eq("id", mesocycleId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data
      ? { mesoId: data.id }
      : { mesoId: null, error: `mesocycle ${mesocycleId} not found (or not yours)` };
  }
  // N79: more than one block can be live, so this is the same resolution every
  // other "the current meso" surface uses — most recently logged wins.
  const meso = await resolveActiveMesocycle(client, userId);
  return meso
    ? { mesoId: meso.id }
    : { mesoId: null, error: "no active mesocycle (pass mesocycle_id explicitly)" };
}

// --- get_llm_explanation_status ---------------------------------------------

export const GET_LLM_EXPLANATION_STATUS = "get_llm_explanation_status";
function registerGetLlmExplanationStatus(server: McpServer) {
  server.registerTool(
    GET_LLM_EXPLANATION_STATUS,
    {
      title: "LLM explanation status",
      description:
        "Admin only. One-shot health readout of the LLM prescription-explanation " +
        "pipeline (doc 18): the resolved env config (mode, model id, key " +
        "presence) as the DEPLOYED function sees it, stored-explanation counts " +
        "with the latest sample, and the most recent rows of the durable " +
        "failure log (llm_explanation_failures) — the first place to look when " +
        "decision_explanations stays empty.",
      inputSchema: {
        failure_limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ failure_limit }: { failure_limit?: number }, extra: McpExtra) => {
      const { client, userId } = await resolveAdmin(extra);
      const limit = failure_limit ?? 10;

      const [explanationCount, latest, failureCount, failures, activePrompt] = await Promise.all([
        client
          .from("decision_explanations")
          .select("decision_id", { count: "exact", head: true })
          .eq("user_id", userId),
        client
          .from("decision_explanations")
          .select("decision_id, body, model, prompt_version, tokens_in, tokens_out, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        client
          .from("llm_explanation_failures")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        client
          .from("llm_explanation_failures")
          .select("decision_id, stage, error, context, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit),
        getActiveCoachingPrompt(client),
      ]);
      for (const r of [explanationCount, latest, failureCount, failures]) {
        if (r.error) throw r.error;
      }

      // The prompt a generation would actually run: the active DB prompt
      // (editable via the coaching-prompt tools), else the built-in code fallback.
      const promptSource = activePrompt ? "db" : "code_fallback";
      const promptVersion = activePrompt ? activePrompt.version : COACHING_PROMPT_VERSION;

      const key = process.env.OPENAI_API_KEY;
      return jsonResult({
        config: {
          mode: llmExplanationsMode(),
          api_key_present: !!key,
          // enough to spot a wrong key KIND (e.g. sk- vs sk-proj-), never the key
          api_key_prefix: key ? key.slice(0, 8) : null,
          llm_explanations_env: process.env.LLM_EXPLANATIONS ?? null,
          model: explanationModel(),
          model_env_override: process.env.OPENAI_EXPLANATION_MODEL ?? null,
          prompt_version: promptVersion,
          prompt_source: promptSource,
        },
        explanations: {
          stored: explanationCount.count ?? 0,
          latest: latest.data ?? null,
        },
        failures: {
          total: failureCount.count ?? 0,
          recent: failures.data ?? [],
        },
        note:
          "Config reflects THIS deployment's env. mode=off means the kill switch " +
          "is engaged (no key, or LLM_EXPLANATIONS=off); shadow generates+stores " +
          "but serves nothing; on serves. Use test_llm_explanation for a live call.",
      });
    },
  );
}

// --- test_llm_explanation ----------------------------------------------------

export const TEST_LLM_EXPLANATION = "test_llm_explanation";
function registerTestLlmExplanation(server: McpServer) {
  server.registerTool(
    TEST_LLM_EXPLANATION,
    {
      title: "Test the LLM explanation pipeline live",
      description:
        "Admin only. Makes ONE live OpenAI call from the deployed environment " +
        "and returns the raw outcome — including the exact upstream error when " +
        "the key, billing, or model id is wrong (the diagnostic the fire-and-" +
        "forget hook can't surface). Without arguments: a ~30-token " +
        "connectivity ping. With decision_id: runs the FULL doc-18 pipeline " +
        "for that recorded decision (payload projection → completion → §4 " +
        "post-check) and returns every intermediate; nothing is stored unless " +
        "store=true (then upserted with overwrite, so iterating on one " +
        "decision is cheap). Works regardless of the LLM_EXPLANATIONS mode. " +
        "PREVIEW A PROMPT REVISION WITHOUT ACTIVATING IT: pass prompt_version " +
        "to run the probe under any stored coaching-prompt version (an inactive " +
        "draft included), or prompt_body to try an unsaved edit verbatim. " +
        "Neither changes which prompt production uses; an ad-hoc prompt_body " +
        "can never be stored (it names no version), so propose it first when " +
        "you want the resulting row kept.",
      inputSchema: {
        decision_id: z.string().uuid().optional(),
        store: z.boolean().optional(),
        prompt_version: z.number().int().positive().optional(),
        prompt_body: z.string().min(50).max(12000).optional(),
      },
    },
    async (
      {
        decision_id,
        store,
        prompt_version,
        prompt_body,
      }: {
        decision_id?: string;
        store?: boolean;
        prompt_version?: number;
        prompt_body?: string;
      },
      extra: McpExtra,
    ) => {
      const { client, userId } = await resolveAdmin(extra);
      if (!decision_id) {
        const probe = await probeLlmConnectivity();
        return jsonResult({
          ok: probe.ok,
          kind: "connectivity_ping",
          model: probe.model ?? explanationModel(),
          ...(probe.ok
            ? { body: probe.body, tokens_in: probe.tokensIn, tokens_out: probe.tokensOut }
            : { error: probe.error }),
        });
      }
      const selection = await resolvePromptArgs(client, { prompt_version, prompt_body });
      if ("error" in selection) return jsonResult({ ok: false, error: selection.error });

      const probe = await probeDecisionExplanation(userId, decision_id, {
        store,
        prompt: selection.prompt,
      });
      if (probe.stored) {
        await recordMcpWrite(
          userId,
          TEST_LLM_EXPLANATION,
          { decision_id, store: true },
          `stored a probe explanation for decision ${decision_id}`,
        );
      }
      return jsonResult({
        ok: probe.ok,
        kind: "decision_probe",
        decision_id,
        // N62: which prompt this run used — a preview under a draft is never
        // silently mistaken for a run under the live prompt
        prompt: promptReport(selection),
        // doc 19 §5–§6.2: the facts worldview the model saw + the trigger
        // verdict + the classification, alongside the coaching body. The probe
        // always calls (an explicit test); would_generate says whether prod
        // WOULD have, and abstained whether the model chose silence (§6.2).
        payload: probe.payload ?? null,
        facts: probe.facts ?? null,
        triggers: probe.triggers ?? null,
        would_generate: probe.wouldGenerate ?? null,
        note_class: probe.noteClass ?? null,
        abstained: probe.abstained ?? false,
        body: probe.body ?? null,
        model: probe.model ?? null,
        tokens_in: probe.tokensIn ?? null,
        tokens_out: probe.tokensOut ?? null,
        post_check: probe.postCheck ?? null,
        stored: probe.stored ?? false,
        ...(probe.error ? { error: probe.error } : {}),
      });
    },
  );
}

// --- generate_explanations ---------------------------------------------------

export const GENERATE_EXPLANATIONS = "generate_explanations";
function registerGenerateExplanations(server: McpServer) {
  server.registerTool(
    GENERATE_EXPLANATIONS,
    {
      title: "Generate LLM explanations synchronously",
      description:
        "Admin only. Synchronously (re)generate stored LLM explanations for a " +
        "chosen scope of the caller's own decisions and return per-decision " +
        "outcomes (body, tokens, or the exact failure). Scope: explicit " +
        "decision_ids, OR the latest decision of every OPEN prescription row " +
        "of the active meso, narrowed by exercise_id and/or week/day. Set " +
        "overwrite=true to replace existing rows (prompt iteration); default " +
        "skips decisions that already have one. Costs ~$0.001 per decision; " +
        "capped at 40 generations per call. Pass dry_run=true to report the " +
        "doc-19 §6.1 would-trigger status across the scope WITHOUT any API " +
        "call or stored row — the calibration view before the trigger gate " +
        "flips on (works in any mode, including off). PROMPT REVISION LOOP: " +
        "pass prompt_version (any stored version, active or draft) or " +
        "prompt_body (an unsaved edit) to run the batch under that prompt " +
        "instead of the active one, and preview=true to read what it would say " +
        "WITHOUT writing any row — the voice-read pass over a real scope with " +
        "the live prompt still serving. preview=true costs tokens (the calls " +
        "are real); dry_run=true costs none but only reports triggers.",
      inputSchema: {
        decision_ids: z.array(z.string().uuid()).max(40).optional(),
        exercise_id: z.string().uuid().optional(),
        week: z.number().int().min(1).optional(),
        day: z.number().int().min(1).optional(),
        mesocycle_id: z.string().uuid().optional(),
        overwrite: z.boolean().optional(),
        dry_run: z.boolean().optional(),
        preview: z.boolean().optional(),
        prompt_version: z.number().int().positive().optional(),
        prompt_body: z.string().min(50).max(12000).optional(),
      },
    },
    async (
      args: {
        decision_ids?: string[];
        exercise_id?: string;
        week?: number;
        day?: number;
        mesocycle_id?: string;
        overwrite?: boolean;
        dry_run?: boolean;
        preview?: boolean;
        prompt_version?: number;
        prompt_body?: string;
      },
      extra: McpExtra,
    ) => {
      const { client, userId } = await resolveAdmin(extra);
      // dry-run reports trigger status only — no API call, so it is allowed to
      // run even when generation is off (that is exactly when you calibrate)
      if (!args.dry_run && llmExplanationsMode() === "off") {
        return jsonResult({
          ok: false,
          error:
            "LLM explanations are OFF (no OPENAI_API_KEY or LLM_EXPLANATIONS=off) — " +
            "run get_llm_explanation_status / fix the env first.",
        });
      }

      let decisionIds: string[];
      let scope: Record<string, unknown>;
      if (args.decision_ids && args.decision_ids.length > 0) {
        decisionIds = args.decision_ids;
        scope = { decision_ids: args.decision_ids.length };
      } else {
        const { mesoId, error } = await resolveMesoId(client, userId, args.mesocycle_id);
        if (!mesoId) return jsonResult({ ok: false, error });
        const targets = await listOpenDecisionTargets(
          createServiceClient(),
          userId,
          mesoId,
          {
            exerciseId: args.exercise_id,
            weekNumber: args.week,
            dayNumber: args.day,
          },
        );
        decisionIds = targets.map((t) => t.decisionId);
        scope = {
          mesocycle_id: mesoId,
          exercise_id: args.exercise_id ?? null,
          week: args.week ?? null,
          day: args.day ?? null,
          open_rows: targets.length,
        };
      }
      if (decisionIds.length === 0) {
        return jsonResult({ ok: true, generated: 0, results: [], note: "no matching decisions" });
      }

      // doc 19 §7.3 dry-run: report the would-trigger status across the scope
      // with zero API calls / zero rows, then stop. Bounded by MAX_BURST.
      if (args.dry_run) {
        const dry = await dryRunDecisionTriggers(userId, decisionIds.slice(0, GENERATION_CAP));
        const wouldGenerate = dry.filter((d) => d.wouldGenerate).length;
        return jsonResult({
          ok: true,
          dry_run: true,
          scope,
          scanned: dry.length,
          would_generate: wouldGenerate,
          trigger_rate: dry.length > 0 ? wouldGenerate / dry.length : 0,
          decisions: dry.map((d) => ({
            decision_id: d.decisionId,
            exercise: d.exercise,
            triggers: d.triggers,
            would_generate: d.wouldGenerate,
            prescription_change: d.facts.prescription_change,
            primary_reason: d.facts.primary_reason,
            pace_status: d.facts.pace_status,
            trend_status: d.facts.trend_status,
          })),
          note:
            "Trigger status only — no OpenAI call, nothing stored. Use this to " +
            "calibrate §6.1 before flipping the gate on.",
        });
      }

      // N62: run under a specific prompt (draft or ad-hoc) when asked, so a
      // revision can be read across a real scope before it goes live
      const selection = await resolvePromptArgs(client, args);
      if ("error" in selection) return jsonResult({ ok: false, error: selection.error });
      const preview = args.preview ?? false;
      if (!preview && selection.prompt.version === 0) {
        return jsonResult({
          ok: false,
          error:
            "an ad-hoc prompt_body can only be run with preview=true (a stored row must name a stored prompt version) — propose it first to generate under it",
        });
      }

      const truncated = decisionIds.length > GENERATION_CAP;
      const run = await generateInChunks(
        userId,
        decisionIds.slice(0, GENERATION_CAP),
        args.overwrite ?? false,
        { prompt: selection.prompt, preview },
      );
      // doc 19 §6: most decisions skip (no trigger) or abstain — surface the
      // full disposition breakdown, not just the stored count
      const tally = { stored: 0, previewed: 0, skipped: 0, abstained: 0, discarded: 0, error: 0 };
      for (const r of run.results) tally[r.disposition] += 1;
      const attempted = Math.min(decisionIds.length, GENERATION_CAP);
      const summary = preview
        ? `previewed ${tally.previewed}/${attempted} under prompt ${selection.source} v${selection.prompt.version || "ad-hoc"} (skipped ${tally.skipped}, abstained ${tally.abstained})`
        : `generated ${run.stored}/${attempted} (skipped ${tally.skipped}, abstained ${tally.abstained})`;
      await recordMcpWrite(
        userId,
        GENERATE_EXPLANATIONS,
        { ...scope, overwrite: args.overwrite ?? false, preview, prompt_version: selection.prompt.version },
        summary,
      );
      return jsonResult({
        ok: true,
        generated: run.stored,
        attempted,
        prompt: promptReport(selection),
        ...(preview
          ? {
              preview: true,
              previewed: tally.previewed,
              preview_note:
                "nothing was written — these are the lines this prompt WOULD produce; the active prompt still serves",
            }
          : {}),
        breakdown: tally,
        results: shapeOutcomes(run.results),
        ...(truncated
          ? {
              note: `scope matched ${decisionIds.length} decisions; capped at ${GENERATION_CAP} — narrow the scope or call again for the rest`,
            }
          : {}),
        ...(args.overwrite
          ? {}
          : {
              note_existing:
                "decisions that already have an explanation were left as-is (pass overwrite=true to replace)",
            }),
      });
    },
  );
}

// --- recompute_prescriptions -------------------------------------------------

export const RECOMPUTE_PRESCRIPTIONS = "recompute_prescriptions";
function registerRecomputePrescriptions(server: McpServer) {
  server.registerTool(
    RECOMPUTE_PRESCRIPTIONS,
    {
      title: "Force-recompute open prescriptions",
      description:
        "Admin only. Force the engine to RE-DECIDE open (planned, un-logged) " +
        "prescription rows of the caller's active meso right now — no waiting " +
        "for an input change to move the freshness fingerprint. Scope: " +
        "all=true for every open row, or narrow with exercise_id and/or " +
        "week/day (a single day coordinate). Each recomputed row writes a new " +
        "engine_decisions row (even when the numbers come out identical), so " +
        "the LLM explanation pipeline re-keys; with_explanations=true (default " +
        "when the LLM feature is enabled) generates them synchronously and " +
        "returns the outcomes. Logged history and started workouts are never " +
        "touched. This is the doc-14-era regenerate tool reborn as an explicit " +
        "TESTING lever — production freshness still flows through the " +
        "automatic read-path reconcile.",
      inputSchema: {
        all: z.boolean().optional().describe("recompute every open row (explicit opt-in)"),
        exercise_id: z.string().uuid().optional(),
        week: z.number().int().min(1).optional(),
        day: z.number().int().min(1).optional(),
        mesocycle_id: z.string().uuid().optional(),
        with_explanations: z.boolean().optional(),
      },
    },
    async (
      args: {
        all?: boolean;
        exercise_id?: string;
        week?: number;
        day?: number;
        mesocycle_id?: string;
        with_explanations?: boolean;
      },
      extra: McpExtra,
    ) => {
      const { client, userId } = await resolveAdmin(extra);
      const scopeError = validateRecomputeScope(args);
      if (scopeError) return jsonResult({ ok: false, error: scopeError });

      const { mesoId, error } = await resolveMesoId(client, userId, args.mesocycle_id);
      if (!mesoId) return jsonResult({ ok: false, error });

      const llmOn = llmExplanationsMode() !== "off";
      const withExplanations = (args.with_explanations ?? true) && llmOn;

      const result = await reconcilePrescriptions(
        createServiceClient(),
        userId,
        mesoId,
        undefined,
        {
          force: args.all
            ? {}
            : {
                exerciseId: args.exercise_id,
                weekNumber: args.week,
                dayNumber: args.day,
              },
          explanations: "skip", // generated synchronously below (or not at all)
        },
      );

      let explanations: Record<string, unknown> | null = null;
      if (withExplanations && result.writtenDecisionIds.length > 0) {
        const capped = result.writtenDecisionIds.slice(0, GENERATION_CAP);
        const run = await generateInChunks(userId, capped, true);
        explanations = {
          generated: run.stored,
          attempted: capped.length,
          results: shapeOutcomes(run.results),
          ...(result.writtenDecisionIds.length > GENERATION_CAP
            ? {
                note: `capped at ${GENERATION_CAP} generations — run generate_explanations for the rest`,
              }
            : {}),
        };
      }

      const summary = `force-recomputed ${result.writtenDecisionIds.length} open prescription row(s) (${result.refreshed} changed)`;
      await recordMcpWrite(
        userId,
        RECOMPUTE_PRESCRIPTIONS,
        {
          mesocycle_id: mesoId,
          all: args.all ?? false,
          exercise_id: args.exercise_id ?? null,
          week: args.week ?? null,
          day: args.day ?? null,
        },
        summary,
      );

      return jsonResult({
        ok: true,
        mesocycle_id: mesoId,
        recomputed: result.writtenDecisionIds.length,
        changed: result.refreshed,
        generated_days: result.generated,
        rows: (result.details ?? []).map((d) => ({
          decision_id: d.decisionId,
          workout_exercise_id: d.workoutExerciseId,
          exercise_id: d.exerciseId,
          coordinate: `week ${d.weekNumber}, day ${d.dayNumber}`,
          kind: d.kind,
          changed: d.changed,
          from: d.from,
          to: d.to,
        })),
        explanations:
          explanations ??
          (withExplanations
            ? { generated: 0, note: "no decisions written" }
            : {
                generated: 0,
                note: llmOn
                  ? "with_explanations=false — none generated"
                  : "LLM feature is off — none generated",
              }),
      });
    },
  );
}

// --- registry ----------------------------------------------------------------

export function registerLlmAdminTools(server: McpServer) {
  registerGetLlmExplanationStatus(server);
  registerTestLlmExplanation(server);
  registerGenerateExplanations(server);
  registerRecomputePrescriptions(server);
}

export const LLM_ADMIN_TOOL_NAMES: readonly string[] = [
  GET_LLM_EXPLANATION_STATUS,
  TEST_LLM_EXPLANATION,
  GENERATE_EXPLANATIONS,
  RECOMPUTE_PRESCRIPTIONS,
];
