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
 */
import { engineParamsSchema, type EngineParams } from "./params";

export type E1rmConfidence = "high" | "moderate" | "low";

export interface E1rmEstimate {
  value: number;
  confidence: E1rmConfidence;
  effectiveReps: number;
}

export function epley(weight: number, effectiveReps: number): number {
  return weight * (1 + effectiveReps / 30);
}

export function brzycki(weight: number, effectiveReps: number): number {
  // denominator goes non-positive at 37 effective reps; caller falls back
  return (weight * 36) / (37 - effectiveReps);
}

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
  const cfg = params.e1rm;

  const effectiveReps = reps + (rir ?? 0) * cfg.rir_offset;

  // Brzycki is invalid as effectiveReps → 37; fall back to Epley alone
  const value =
    effectiveReps >= 36
      ? epley(weight, effectiveReps)
      : (epley(weight, effectiveReps) + brzycki(weight, effectiveReps)) / 2;

  return {
    value: Math.round(value * 10) / 10,
    confidence: confidenceFor(effectiveReps, rir, cfg),
    effectiveReps,
  };
}

function confidenceFor(
  effectiveReps: number,
  rir: number | null,
  cfg: EngineParams["e1rm"],
): E1rmConfidence {
  // an unreported RIR can't be high/moderate confidence
  if (rir == null) return "low";
  if (effectiveReps <= cfg.high_max_eff_reps && rir <= cfg.high_max_rir) {
    return "high";
  }
  if (effectiveReps <= cfg.mod_max_eff_reps && rir <= cfg.mod_max_rir) {
    return "moderate";
  }
  return "low";
}
