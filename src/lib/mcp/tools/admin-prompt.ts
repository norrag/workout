import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  listCoachingPrompts,
  getCoachingPromptVersion,
  getActiveCoachingPrompt,
  proposeCoachingPrompt,
  activateCoachingPrompt,
  getCoachingPromptDeletionImpact,
  deleteCoachingPromptVersion,
} from "@/lib/queries/coaching-prompts";
import {
  COACHING_SYSTEM_PROMPT,
  COACHING_PROMPT_VERSION,
  COACHING_PAYLOAD_VERSION,
  COACHING_FACTS_FIELD_GUIDE,
  COACHING_MAX_CHARS,
} from "@/lib/llm/coaching";
import { resolveAdmin } from "./admin-gate";
import { toolResult, type EnvelopeOpts } from "../envelope";
import { recordMcpWrite } from "../audit";
import type { McpExtra, McpClient } from "../session";

/**
 * doc 19 / N60 follow-up — edit the LLM coaching SYSTEM PROMPT from the admin
 * MCP surface, without a code deploy. Mirrors the engine_params tuning loop
 * (propose an inactive draft → preview it against a real decision with
 * test_llm_explanation → activate → regenerate with generate_explanations
 * overwrite). All admin-gated (resolveAdmin); identity always from the session.
 *
 * The code constant COACHING_SYSTEM_PROMPT (prompt version 3) is the PERMANENT
 * fallback: with no active DB prompt, generation uses it, so this surface can
 * never take the pipeline down. DB prompt versions start at 4 so they always
 * clear the doc-19 serving cut.
 *
 * Regeneration is deliberately a SEPARATE step: activating changes only which
 * prompt FUTURE generations use. Existing stored explanations are left as-is
 * until you run generate_explanations overwrite=true (they also re-key
 * naturally as decisions recompute).
 */

import { errorMessage } from "./admin";

function jsonResult(payload: Record<string, unknown>, opts: EnvelopeOpts = {}) {
  return toolResult(payload, opts);
}

/** N62 — what the model actually receives and must return, reported alongside
 *  every prompt read so a revision can be checked against the CURRENT payload
 *  (a prompt written before a payload amendment keeps working, it just says
 *  nothing about the new fields). */
const PAYLOAD_CONTRACT = {
  payload_version: COACHING_PAYLOAD_VERSION,
  facts_fields: COACHING_FACTS_FIELD_GUIDE,
  output:
    '{"coaching_context": string | null, "note_class": one of ["pain","setup","technique","equipment","preference","normal_exertion","performance_explanation","unclear"], "abstain": boolean}',
  max_chars: COACHING_MAX_CHARS,
  enforced_regardless_of_prompt:
    "post-check: abstention stores nothing; length cap; every numeral must appear in the facts payload; a note-only trigger classified normal_exertion/unclear is discarded",
} as const;

/** The effective active prompt (DB active row, else the code fallback) — the
 *  prompt a generation would actually run right now. */
async function effectiveActivePrompt(
  client: McpClient,
): Promise<{ source: "db" | "code_fallback"; version: number; body: string }> {
  const active = await getActiveCoachingPrompt(client);
  if (active) return { source: "db", version: active.version, body: active.body };
  return { source: "code_fallback", version: COACHING_PROMPT_VERSION, body: COACHING_SYSTEM_PROMPT };
}

// --- get_coaching_prompt -----------------------------------------------------

export const GET_COACHING_PROMPT = "get_coaching_prompt";
function registerGetCoachingPrompt(server: McpServer) {
  server.registerTool(
    GET_COACHING_PROMPT,
    {
      title: "Get the LLM coaching prompt",
      description:
        "Admin only. Inspect the editable LLM coaching SYSTEM PROMPT (doc 19). " +
        "With no arguments: browse every stored version (which is active, notes, " +
        "size, dates) plus a summary of the EFFECTIVE active prompt — the DB " +
        "active row, or, when none is activated, the built-in code fallback " +
        "(the code constant). With version: return that stored version's full " +
        "body. Pass include_body=true (no version) to also return the effective " +
        "active body verbatim — copy it, edit, and feed it to " +
        "propose_coaching_prompt to start a new version. Always returns " +
        "payload_contract: the doc-19 §5 facts fields the model currently " +
        "receives — check any prompt against it, since a prompt authored before " +
        "a payload change keeps running but won't describe the newer fields.",
      inputSchema: {
        version: z.number().int().positive().optional(),
        include_body: z.boolean().optional(),
      },
    },
    async (
      { version, include_body }: { version?: number; include_body?: boolean },
      extra: McpExtra,
    ) => {
      const { client } = await resolveAdmin(extra);
      if (version != null) {
        const detail = await getCoachingPromptVersion(client, version);
        if (!detail) return jsonResult({ found: false, error: `version ${version} not found` });
        return jsonResult({ found: true, ...detail, payload_contract: PAYLOAD_CONTRACT });
      }
      const [versions, active] = await Promise.all([
        listCoachingPrompts(client),
        effectiveActivePrompt(client),
      ]);
      return jsonResult({
        versions,
        active: {
          source: active.source,
          version: active.version,
          char_count: active.body.length,
        },
        ...(include_body ? { active_body: active.body } : {}),
        // N62: the facts payload the model actually receives. A DB prompt
        // authored before a payload amendment keeps running — it just won't
        // describe the newer fields until it is revised.
        payload_contract: PAYLOAD_CONTRACT,
        note:
          active.source === "code_fallback"
            ? `No DB prompt is active — generation uses the built-in code fallback ` +
              `(version ${COACHING_PROMPT_VERSION}). Call again with include_body=true to copy it, ` +
              `edit, then propose_coaching_prompt to create the first DB version.`
            : "The active prompt is a stored DB version. Edit via propose_coaching_prompt " +
              "→ preview with test_llm_explanation prompt_version=<draft> (no activation " +
              "needed) → activate_coaching_prompt.",
      });
    },
  );
}

// --- propose_coaching_prompt -------------------------------------------------

export const PROPOSE_COACHING_PROMPT = "propose_coaching_prompt";
function registerProposeCoachingPrompt(server: McpServer) {
  server.registerTool(
    PROPOSE_COACHING_PROMPT,
    {
      title: "Propose a new coaching prompt",
      description:
        "Admin only. Write a new INACTIVE coaching-prompt version from the given " +
        "body. It is never active on write and can never be activated by accident. " +
        "Preview it WITHOUT activating: test_llm_explanation with a decision_id " +
        "+ prompt_version=<this version> runs the full pipeline (facts → " +
        "completion → post-check) under the draft, and generate_explanations " +
        "with prompt_version + preview=true reads it across a whole scope — the " +
        "live prompt keeps serving throughout. (prompt_body on either tool tries " +
        "an edit before you even propose it.) Keep the doc-19 output contract " +
        "intact (the deterministic post-check still enforces the number-set and " +
        "length caps regardless of prompt text), and check get_coaching_prompt's " +
        "payload_contract for the facts fields the current payload carries. " +
        "Version numbers auto-increment above the highest existing version.",
      inputSchema: {
        body: z.string().min(50).max(12000),
        notes: z.string().max(500).optional(),
      },
    },
    async ({ body, notes }: { body: string; notes?: string }, extra: McpExtra) => {
      const { client, userId } = await resolveAdmin(extra);
      let newVersion: number;
      try {
        newVersion = await proposeCoachingPrompt(client, body, notes ?? null);
      } catch (e) {
        return jsonResult({ ok: false, error: errorMessage(e) });
      }
      const summary = `proposed coaching_prompt v${newVersion} (inactive)`;
      await recordMcpWrite(userId, PROPOSE_COACHING_PROMPT, { version: newVersion, notes }, summary);
      return jsonResult({
        ok: true,
        version: newVersion,
        char_count: body.length,
        summary: `${summary}. Review it, then activate_coaching_prompt to make it live.`,
      });
    },
  );
}

// --- activate_coaching_prompt ------------------------------------------------

export const ACTIVATE_COACHING_PROMPT = "activate_coaching_prompt";
function registerActivateCoachingPrompt(server: McpServer) {
  server.registerTool(
    ACTIVATE_COACHING_PROMPT,
    {
      title: "Activate a coaching prompt",
      description:
        "Admin only. Make a coaching-prompt version the single active prompt — " +
        "all FUTURE explanation generations use it. Requires confirm_version to " +
        "echo version (an explicit acknowledgement). This does NOT rewrite " +
        "existing stored explanations: run generate_explanations overwrite=true " +
        "afterward to regenerate a scope under the new prompt (they also re-key " +
        "naturally as decisions recompute). Atomic — a failed activation leaves " +
        "the prior active prompt in place.",
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
        await activateCoachingPrompt(client, version);
      } catch (e) {
        return jsonResult({ ok: false, error: errorMessage(e) });
      }
      const summary = `activated coaching_prompt v${version}`;
      await recordMcpWrite(userId, ACTIVATE_COACHING_PROMPT, { version }, summary);
      return jsonResult({
        ok: true,
        version,
        summary: `${summary}. Future generations use it now; run generate_explanations overwrite=true to regenerate existing rows.`,
      });
    },
  );
}

// --- discard_coaching_prompt -------------------------------------------------

export const DISCARD_COACHING_PROMPT = "discard_coaching_prompt";
function registerDiscardCoachingPrompt(server: McpServer) {
  server.registerTool(
    DISCARD_COACHING_PROMPT,
    {
      title: "Discard a coaching prompt",
      description:
        "Admin only. Delete an INACTIVE coaching-prompt version (undo for " +
        "propose_coaching_prompt). The active version can never be discarded, and " +
        "a version referenced by any stored explanation is preserved so those " +
        "rows keep a resolvable prompt provenance. Requires confirm_version to " +
        "echo version.",
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
      const impact = await getCoachingPromptDeletionImpact(client, version);
      if (!impact.found)
        return jsonResult({ ok: false, error: `coaching_prompt version ${version} does not exist.` });
      if (impact.isActive)
        return jsonResult({
          ok: false,
          error: `version ${version} is active — activate a different version before discarding it.`,
        });
      if (impact.explanationRefs > 0)
        return jsonResult({
          ok: false,
          error: `version ${version} is referenced by ${impact.explanationRefs} stored explanation(s); it is kept so those rows stay traceable.`,
        });
      await deleteCoachingPromptVersion(client, version);
      const summary = `discarded inactive coaching_prompt v${version}`;
      await recordMcpWrite(userId, DISCARD_COACHING_PROMPT, { version }, summary);
      return jsonResult({ ok: true, version, summary });
    },
  );
}

// --- registry ----------------------------------------------------------------

export function registerCoachingPromptTools(server: McpServer) {
  registerGetCoachingPrompt(server);
  registerProposeCoachingPrompt(server);
  registerActivateCoachingPrompt(server);
  registerDiscardCoachingPrompt(server);
}

export const COACHING_PROMPT_TOOL_NAMES: readonly string[] = [
  GET_COACHING_PROMPT,
  PROPOSE_COACHING_PROMPT,
  ACTIVATE_COACHING_PROMPT,
  DISCARD_COACHING_PROMPT,
];
