import "server-only";
import { z } from "zod";

/**
 * N58 / doc 18 §7.2 — the one OpenAI call site: a thin server-only fetch to
 * the Responses API. No SDK (same reasoning as the Sentry funnel — one small
 * request shape, zod-validated, no dependency surface), 10s timeout, one
 * retry on transient failures. Errors THROW here; the orchestrator
 * (`explanations.ts`) owns the R20 report + the deterministic fallback —
 * a generation failure leaves no row, which IS the fallback (§5).
 *
 * Model: gpt-5.6-luna (§2, id verified against the official pricing page at
 * build, 2026-07-20). `reasoning.effort` is pinned to `"none"` — Luna
 * defaults to `medium`, and reasoning tokens bill as output, which would
 * otherwise dominate the §8 budget. `store: false` — the exchange is persisted
 * in our own decision_explanations table; OpenAI-side retention buys nothing.
 */

const RESPONSES_URL = "https://api.openai.com/v1/responses";
const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 500;

/** §2: env-overridable so a model rename never needs a deploy. An EMPTY or
 *  whitespace-only `OPENAI_EXPLANATION_MODEL` must fall back to the default —
 *  `??` alone would pass `""` through and every call 400s `model_not_found`
 *  (the empty-env-var footgun, hit in the field 2026-07-20). */
export const DEFAULT_EXPLANATION_MODEL = "gpt-5.6-luna";
export function explanationModel(): string {
  const configured = process.env.OPENAI_EXPLANATION_MODEL?.trim();
  return configured ? configured : DEFAULT_EXPLANATION_MODEL;
}

/** The slice of the Responses API result we consume. Extra fields ignored. */
const responseSchema = z.object({
  model: z.string(),
  status: z.string().optional(),
  output: z.array(
    z.object({
      type: z.string(),
      content: z
        .array(
          z.object({
            type: z.string(),
            text: z.string().optional(),
          }),
        )
        .optional(),
    }),
  ),
  usage: z
    .object({
      input_tokens: z.number(),
      output_tokens: z.number(),
    })
    .optional(),
});

export interface LlmCompletion {
  text: string;
  /** the resolved model id the API reports (recorded on the stored row) */
  model: string;
  tokensIn: number;
  tokensOut: number;
}

/** Pull the assistant text out of a Responses API `output` array. Pure. */
export function extractOutputText(
  output: z.infer<typeof responseSchema>["output"],
): string {
  return output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("")
    .trim();
}

export interface CompletionRequest {
  /** the static system prefix (§3) — kept byte-stable for prompt caching */
  instructions: string;
  /** the per-decision payload, JSON-serialized by the caller */
  input: string;
  /** §4: 120 so the 320-char clamp never truncates mid-sentence */
  maxOutputTokens: number;
}

type FetchLike = typeof fetch;

/**
 * One completion. Throws on any failure (timeout, non-2xx after the retry,
 * unparseable body, empty text) — the caller decides how loudly to degrade.
 * `fetchImpl` is injectable for tests only.
 */
export async function createCompletion(
  request: CompletionRequest,
  fetchImpl: FetchLike = fetch,
): Promise<LlmCompletion> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const body = JSON.stringify({
    model: explanationModel(),
    instructions: request.instructions,
    input: request.input,
    max_output_tokens: request.maxOutputTokens,
    reasoning: { effort: "none" },
    store: false,
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    try {
      const res = await fetchImpl(RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        // 4xx (except 429) is deterministic — a retry cannot fix a bad request
        const retryable = res.status === 429 || res.status >= 500;
        const error = new Error(`openai responded ${res.status}: ${detail}`);
        if (!retryable) throw Object.assign(error, { permanent: true });
        lastError = error;
        continue;
      }
      const parsed = responseSchema.parse(await res.json());
      const text = extractOutputText(parsed.output);
      if (!text) throw new Error("openai returned an empty completion");
      return {
        text,
        model: parsed.model,
        tokensIn: parsed.usage?.input_tokens ?? 0,
        tokensOut: parsed.usage?.output_tokens ?? 0,
      };
    } catch (error) {
      if ((error as { permanent?: boolean }).permanent) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? "openai call failed"));
}
