/**
 * Estimated 1RM (10-metrics-spec.md §1) — pure.
 *
 * From a logged working set of `weight × reps` at reported `rir`:
 *   effectiveReps = reps + rir × rir_offset
 *   e1RM = average( Epley, Brzycki ) over effectiveReps
 * Confidence degrades with effective reps / RIR (formula + self-report error
 * both grow far from failure); low-confidence points are display-with-caveat
 * and down-weighted in "best e1RM" / trend lines. e1RM is an estimate/trend,
 * never a to-the-pound claim (§9 honesty guardrail).
 *
 * The math lives in `predict.ts` (zod-free, keyed on the validated `e1rm`
 * config slice — WS-J client-bundle split); this module is the validating
 * public API: it parses the raw params at the boundary and delegates.
 */
import { engineParamsSchema, type EngineParams } from "./params";
import { estimateE1rm as estimateE1rmCore } from "./predict";

export {
  epley,
  brzycki,
  e1rmFactor,
  e1rmFromEffectiveReps,
  assumedRir,
  type E1rmConfidence,
  type E1rmEstimate,
} from "./predict";
import type { E1rmEstimate } from "./predict";

/**
 * @param rir reported reps-in-reserve, or null (unknown ⇒ low confidence)
 * @returns null for non-working input (weight or reps ≤ 0)
 */
export function estimateE1rm(
  weight: number,
  reps: number,
  rir: number | null,
  rawParams: EngineParams,
): E1rmEstimate | null {
  if (weight <= 0 || reps <= 0) return null;
  const params = engineParamsSchema.parse(rawParams);
  return estimateE1rmCore(weight, reps, rir, params.e1rm);
}
