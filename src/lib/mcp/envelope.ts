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

export type Units = "kg" | "lb";

export interface EnvelopeOpts {
  /** the user's weight unit when the payload reports loads; else null */
  units?: Units | null;
  /** sample sizes / coverage / caveats that qualify the numbers */
  dataQuality?: Record<string, unknown> | null;
}

export interface Envelope<T = unknown> {
  schema_version: number;
  generated_at: string;
  units: Units | null;
  data_quality: Record<string, unknown> | null;
  data: T;
}

export function envelope<T>(data: T, opts: EnvelopeOpts = {}): Envelope<T> {
  return {
    schema_version: MCP_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    units: opts.units ?? null,
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
