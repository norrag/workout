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
 * The e1RM-per-pound factor `k(effReps)` so `e1RM = weight × k`. Both Epley and
 * Brzycki are linear in weight, so this single factor backs the forward estimate
 * (`e1rm.ts`) AND the closed-form inverse (`reps.ts weightForRepsAtRir`) — they
 * must share it or forward/inverse drift.
 *
 * The switch (§S3, standalone-prescription investigation 2026-06-23): Brzycki
 * tracks Epley to ~10 reps then inflates increasingly above it. When
 * `brzycki_max_eff_reps` is set we average Epley+Brzycki only up to that cutoff
 * and use Epley alone above it (dropping the average outside the band where they
 * agree). When it is ABSENT (every pre-v11 row) we keep the exact legacy rule —
 * average until Brzycki is invalid (`effReps ≥ 36` ⇒ Epley alone) — so those rows
 * estimate byte-identically.
 */
export function e1rmFactor(
  effectiveReps: number,
  cfg: Pick<EngineParams["e1rm"], "brzycki_max_eff_reps">,
): number {
  const epleyK = 1 + effectiveReps / 30;
  const max = cfg.brzycki_max_eff_reps;
  const useBrzycki =
    max == null ? effectiveReps < 36 : effectiveReps <= max && effectiveReps < 36;
  if (!useBrzycki) return epleyK;
  const brzyckiK = 36 / (37 - effectiveReps);
  return (epleyK + brzyckiK) / 2;
}

/** Forward e1RM at a given effective-rep count, applying the §S3 switch. */
export function e1rmFromEffectiveReps(
  weight: number,
  effectiveReps: number,
  cfg: Pick<EngineParams["e1rm"], "brzycki_max_eff_reps">,
): number {
  return weight * e1rmFactor(effectiveReps, cfg);
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

  // §S3 switch (Brzycki ≤ cutoff, Epley above) — shared with reps.ts so forward
  // and inverse stay consistent. Absent cutoff ⇒ legacy `≥36 ⇒ Epley` rule.
  const value = e1rmFromEffectiveReps(weight, effectiveReps, cfg);

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
