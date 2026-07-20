import "server-only";

/**
 * N58 / doc 18 — feature gating for the LLM prescription explanation.
 *
 * Two env vars, both manual ops (docs/deployment/openai-api-setup.md):
 *
 * - `OPENAI_API_KEY` — unset ⇒ the feature silently doesn't exist (§7.2 kill
 *   switch). Server-only; never ships in a client bundle (`server-only` guard).
 * - `LLM_EXPLANATIONS` — `off` | `shadow` | `on`.
 *   - `off`: nothing generates, nothing serves (the other kill switch).
 *   - `shadow` (the DEFAULT when the key is set): explanations generate and
 *     store at decision-write, but every read surface keeps rendering the
 *     deterministic composer. This is the §9 voice gate made operational —
 *     the owner reads a stored first batch against doc 06's voice BEFORE any
 *     strip flips; phases 1–4 ship in this mode.
 *   - `on`: stored explanations replace the quick-read's body lines and ride
 *     `explain_prescription` (§6). The ask line stays deterministic always.
 */
export type LlmExplanationsMode = "off" | "shadow" | "on";

export function llmExplanationsMode(): LlmExplanationsMode {
  if (!process.env.OPENAI_API_KEY) return "off";
  const raw = process.env.LLM_EXPLANATIONS?.trim().toLowerCase();
  if (raw === "off") return "off";
  if (raw === "on") return "on";
  // unset or unrecognized ⇒ the safe middle: generate, never serve
  return "shadow";
}

/** Should the write sites generate + store explanations? */
export function llmExplanationsGenerate(): boolean {
  return llmExplanationsMode() !== "off";
}

/** Should the read surfaces (strip, MCP) serve stored explanations? */
export function llmExplanationsServe(): boolean {
  return llmExplanationsMode() === "on";
}
