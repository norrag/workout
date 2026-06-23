/**
 * Shared MCP response envelope & cross-tool conventions (MCP tooling review
 * P1-4/P2). Every tool wraps its payload in one consistent shape so a consumer
 * can read `schema_version`, know when the snapshot was taken, see the weight
 * unit, and gauge data quality without each tool inventing its own contract.
 *
 *   { schema_version, generated_at, units, data_quality, data }
 *
 * Formatters keep returning their inner `data` shape (and stay unit-tested as
 * pure functions); the tool handler is the only thing that envelopes.
 */

/** Bumped when the envelope or a tool's `data` contract changes incompatibly. */
export const MCP_SCHEMA_VERSION = 1;

/**
 * The fixed scale ranges every feedback/rating field uses, so a consumer never
 * has to guess what "pump: 7" means. Surfaced wherever averages or raw ratings
 * are reported.
 */
export const FEEDBACK_SCALES = {
  joint_pain: "0–3 (0 none, 3 sharp)",
  pump: "0–10",
  workload: "0–10 (5 = just right)",
  soreness: "0–3",
  overall_fatigue: "0–4",
  effort_rating: "0–4",
  performance_rating: "0–4",
  rir: "reps in reserve (lower = closer to failure)",
} as const;

export type FeedbackScaleKey = keyof typeof FEEDBACK_SCALES;

/**
 * The legend for just the named feedback fields (so a tool that only emits
 * fatigue/effort/performance doesn't ship the joint-pain/pump scales it never
 * reports). Pure. (§5.3)
 */
export function scaleLegend(...keys: FeedbackScaleKey[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = FEEDBACK_SCALES[k];
  return out;
}

/** Standing caveat that e1RM-derived numbers are estimates, not tested maxes. */
export const E1RM_ESTIMATE_NOTE =
  "e1RM and any e1RM-derived change are Epley-based estimates, not tested 1RMs — read trends, not absolute values.";

/**
 * Standing caveat that feedback was only captured from this date (earlier
 * history was migrated from another app without exportable feedback — the
 * report's editor's note). Surfaced so sparse early feedback reads as expected,
 * not missing. (§5.3 / §5.5)
 */
export const FEEDBACK_HISTORY_NOTE =
  "Subjective feedback (joint pain / workload / pump / session ratings) was only captured from 2026-06-15; earlier sessions were migrated without it, so their feedback means are absent by design, not lost.";

/**
 * Round a number to `dp` decimal places (default 1), pass null/undefined
 * through. The connector reports e1RM, volume, and feedback means from SQL
 * views that emit raw floats (e.g. `73.33333333333333`, `5.1230769230769235`);
 * rounding them consistently keeps the "precise/scientific" surface from
 * leaking float noise and stops one tool disagreeing with another on the same
 * number (§5.7). Pure.
 */
export function roundTo(n: number | null | undefined, dp = 1): number | null {
  if (n == null || !Number.isFinite(n)) return n ?? null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Round to one decimal place, null-safe — the connector's default precision. */
export const round1 = (n: number | null | undefined): number | null => roundTo(n, 1);

export interface EnvelopeOpts {
  /** sample sizes / coverage / caveats that qualify the numbers */
  dataQuality?: Record<string, unknown> | null;
}

export interface Envelope<T = unknown> {
  schema_version: number;
  generated_at: string;
  /** the app records weight exclusively in pounds */
  units: "lb";
  data_quality: Record<string, unknown> | null;
  data: T;
}

export function envelope<T>(data: T, opts: EnvelopeOpts = {}): Envelope<T> {
  return {
    schema_version: MCP_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    units: "lb",
    data_quality: opts.dataQuality ?? null,
    data,
  };
}

/** Standard MCP tool result: the enveloped payload as text + structured content. */
export function toolResult(data: Record<string, unknown>, opts: EnvelopeOpts = {}) {
  const payload = envelope(data, opts);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as unknown as Record<string, unknown>,
  };
}

export interface StructuredError {
  code: string;
  message: string;
  detail: string | null;
}

/**
 * Turn an arbitrary thrown value into a structured `{ code, message, detail }`
 * (MCP tooling review §5.6). The SDK stringifies a thrown error with `String()`,
 * so throwing a plain Supabase error object surfaced as the opaque
 * `[object Object]` a consumer can't diagnose. Pure.
 */
export function toStructuredError(err: unknown): StructuredError {
  if (err instanceof Error) {
    // PostgrestError-shaped values are also Error instances in some clients;
    // pull the richer fields when present.
    const e = err as Error & { code?: string; details?: string; hint?: string };
    return {
      code: e.code ?? e.name ?? "tool_error",
      message: e.message,
      detail: e.details ?? e.hint ?? null,
    };
  }
  if (err && typeof err === "object") {
    const e = err as {
      code?: string;
      message?: string;
      details?: string;
      hint?: string;
      error?: string;
    };
    return {
      code: e.code ?? "tool_error",
      message: e.message ?? e.error ?? "Unknown tool error",
      detail: e.details ?? e.hint ?? null,
    };
  }
  return { code: "tool_error", message: String(err), detail: null };
}

/**
 * A standard error tool result: a structured `{ error }` body flagged with
 * `isError` so a consumer never has to parse `[object Object]` (§5.6).
 */
export function toolError(err: unknown) {
  const error = toStructuredError(err);
  const payload = { error };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as unknown as Record<string, unknown>,
    isError: true as const,
  };
}

/**
 * Count non-null samples behind a set of averages and express coverage over the
 * expected denominator — the "sample counts/coverage beside every average" the
 * review asked for. Pure.
 */
export function feedbackCoverage(
  counts: Record<string, number | null | undefined>,
  denominator: number | null,
): Record<string, unknown> {
  const samples: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) samples[k] = v ?? 0;
  return {
    samples,
    denominator,
    scales: FEEDBACK_SCALES,
  };
}
