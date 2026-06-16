/**
 * Live reps ⇄ weight ⇄ RIR linkage (doc 11) — pure.
 *
 * The premise (decision, doc 11): the app *prescribes* a target RIR and trusts
 * the user to hit it honestly, so a logged `weight × reps` against a target RIR
 * is itself an RIR data point — no separate per-set RIR capture. From a recency-
 * weighted strength anchor (e1RM) we can invert the e1RM relationship to answer:
 * "at this weight, how many reps lands on the target RIR?" and the converse,
 * "at these reps, what RIR does this weight imply?"
 *
 * All math reuses the §1 effective-reps model (`e1rm.ts`); all tunables come
 * from `engine_params.e1rm`. No I/O, no clock, no randomness.
 */
import { engineParamsSchema, type EngineParams } from "./params";
import {
  epley,
  brzycki,
  estimateE1rm,
  type E1rmConfidence,
} from "./e1rm";

/** Forward averaged Epley/Brzycki e1RM at a given effective-rep count. */
function e1rmAtEffectiveReps(weight: number, effectiveReps: number): number {
  return effectiveReps >= 36
    ? epley(weight, effectiveReps)
    : (epley(weight, effectiveReps) + brzycki(weight, effectiveReps)) / 2;
}

/**
 * Invert the averaged e1RM curve: the effective reps at which `weight` yields
 * `e1rm`. Monotonic increasing in reps, so bisection is exact-to-tolerance and
 * deterministic. Returns 0 when the weight is already at/above the e1RM (you
 * couldn't complete even one effective rep).
 */
export function effectiveRepsForE1rm(
  e1rm: number,
  weight: number,
  rawParams: EngineParams,
): number {
  engineParamsSchema.parse(rawParams);
  if (e1rm <= 0 || weight <= 0) return 0;
  if (weight >= e1rm) return 0; // at or above estimated 1RM: ≤ 1 rep
  let lo = 0;
  let hi = 35.9; // Brzycki blows up at 37; cap inside the valid band
  // e1RM grows without bound as reps→36; if even hi can't reach e1rm, return hi
  if (e1rmAtEffectiveReps(weight, hi) < e1rm) return hi;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (e1rmAtEffectiveReps(weight, mid) < e1rm) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Predicted reps to hit `targetRir` at `weight`, given the exercise's strength
 * anchor `e1rm`. `reps = effectiveReps − targetRir × rir_offset`, clamped to a
 * whole number ≥ 1 (decision: single integer). Null when there's no usable
 * anchor/weight.
 */
export function predictRepsAtWeight(
  e1rm: number | null,
  weight: number,
  targetRir: number,
  rawParams: EngineParams,
): number | null {
  const params = engineParamsSchema.parse(rawParams);
  if (e1rm == null || e1rm <= 0 || weight <= 0) return null;
  const effReps = effectiveRepsForE1rm(e1rm, weight, params);
  const reps = Math.round(effReps - targetRir * params.e1rm.rir_offset);
  return Math.max(1, reps);
}

/**
 * The RIR implied by doing `reps` at `weight` against the anchor — the converse
 * hint surfaced when the user edits reps instead of weight. Clamped ≥ 0; null
 * when there's no usable anchor.
 */
export function impliedRirAtReps(
  e1rm: number | null,
  weight: number,
  reps: number,
  rawParams: EngineParams,
): number | null {
  const params = engineParamsSchema.parse(rawParams);
  if (e1rm == null || e1rm <= 0 || weight <= 0 || reps <= 0) return null;
  const effReps = effectiveRepsForE1rm(e1rm, weight, params);
  const rir = (effReps - reps) / (params.e1rm.rir_offset || 1);
  return Math.max(0, Math.round(rir));
}

/** One historical working set feeding the recency-weighted anchor. */
export interface E1rmSample {
  weight: number;
  reps: number;
  /** assumed RIR = the set's prescribed target RIR (doc 11 premise) */
  targetRir: number | null;
  /** days before the reference point; the caller computes it (engine stays pure) */
  ageDays: number;
}

export interface E1rmAnchor {
  value: number;
  confidence: E1rmConfidence;
}

/**
 * Recency-weighted strength anchor (decision: recency-weighted e1RM). Each
 * sample's e1RM is weighted by `0.5^(ageDays / recency_halflife_days)` and by a
 * confidence factor (high > moderate > low), so recent, near-failure sets
 * dominate and the anchor falls when current performance dips. Pure: the caller
 * supplies `ageDays` (no clock here).
 */
export function recencyWeightedE1rm(
  samples: E1rmSample[],
  rawParams: EngineParams,
): E1rmAnchor | null {
  const params = engineParamsSchema.parse(rawParams);
  const halflife = params.e1rm.recency_halflife_days;
  const confWeight: Record<E1rmConfidence, number> = {
    high: 1,
    moderate: 0.6,
    low: 0.3,
  };

  let weightedSum = 0;
  let weightTotal = 0;
  let best: { value: number; confidence: E1rmConfidence } | null = null;

  for (const s of samples) {
    const est = estimateE1rm(s.weight, s.reps, s.targetRir, params);
    if (!est) continue;
    const recency = Math.pow(0.5, Math.max(0, s.ageDays) / halflife);
    const w = recency * confWeight[est.confidence];
    if (w <= 0) continue;
    weightedSum += est.value * w;
    weightTotal += w;
    if (!best || est.value > best.value) {
      best = { value: est.value, confidence: est.confidence };
    }
  }

  if (weightTotal === 0) return null;
  // confidence of the anchor = the best contributing sample's confidence
  return {
    value: Math.round((weightedSum / weightTotal) * 10) / 10,
    confidence: best!.confidence,
  };
}
