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
  e1rmFactor,
  e1rmFromEffectiveReps,
  estimateE1rm,
  type E1rmConfidence,
} from "./e1rm";

/** Forward e1RM at a given effective-rep count (shared §S3 switch with e1rm.ts). */
function e1rmAtEffectiveReps(
  weight: number,
  effectiveReps: number,
  cfg: EngineParams["e1rm"],
): number {
  return e1rmFromEffectiveReps(weight, effectiveReps, cfg);
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
  const params = engineParamsSchema.parse(rawParams);
  const cfg = params.e1rm;
  if (e1rm <= 0 || weight <= 0) return 0;
  if (weight >= e1rm) return 0; // at or above estimated 1RM: ≤ 1 rep
  let lo = 0;
  let hi = 35.9; // Brzycki blows up at 37; cap inside the valid band
  // e1RM grows without bound as reps→36; if even hi can't reach e1rm, return hi
  if (e1rmAtEffectiveReps(weight, hi, cfg) < e1rm) return hi;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (e1rmAtEffectiveReps(weight, mid, cfg) < e1rm) lo = mid;
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
 * The weight that lands `reps` on `targetRir` for a lift whose strength anchor
 * is `e1rm` — the converse of `predictRepsAtWeight`, used by the rep-window
 * prescription (doc 13 §4.1) to *choose the load* for a target rep. Closed-form:
 * both Epley and Brzycki are linear in weight, so `e1RM = weight × k(effReps)`
 * and `weight = e1RM / k`. No bisection. Null without a usable anchor/reps.
 */
export function weightForRepsAtRir(
  e1rm: number | null,
  reps: number,
  targetRir: number,
  rawParams: EngineParams,
): number | null {
  const params = engineParamsSchema.parse(rawParams);
  if (e1rm == null || e1rm <= 0 || reps <= 0) return null;
  const eff = reps + targetRir * params.e1rm.rir_offset;
  // same §S3 switch as the forward estimate (e1rm.ts e1rmFactor), so choosing a
  // load for target reps inverts exactly the curve used to score a logged set.
  const k = e1rmFactor(eff, params.e1rm);
  if (k <= 0) return null;
  return e1rm / k;
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
  /**
   * Groups sets into one session for the `session_best` anchor (doc 13 §9.3) —
   * in practice the `workout_exercise_id` (one exercise, one day). Optional: the
   * `mean`/`best` methods ignore it, and `session_best` treats a missing key as a
   * singleton session.
   */
  sessionKey?: string | null;
}

export interface E1rmAnchor {
  value: number;
  confidence: E1rmConfidence;
}

const CONF_WEIGHT: Record<E1rmConfidence, number> = {
  high: 1,
  moderate: 0.6,
  low: 0.3,
};

/** Strongest confidence present, for a session-averaged anchor (lenient floor). */
function bestConfidence(cs: E1rmConfidence[]): E1rmConfidence {
  if (cs.includes("high")) return "high";
  if (cs.includes("moderate")) return "moderate";
  return "low";
}

/**
 * Recency-weighted strength anchor (doc 11 + doc 13 §9.3). Each sample's e1RM is
 * weighted by `0.5^(ageDays / recency_halflife_days)`; `params.e1rm.anchor_method`
 * selects how those fold into one number:
 *  - `mean` (legacy): confidence-weighted average — recent near-failure sets
 *    dominate, the anchor falls when performance dips.
 *  - `best`: the recency-weighted single max set (`argmax e1RM × recency`).
 *  - `session_best` (default): that best set's *session* (all its working sets,
 *    grouped by `sessionKey`), averaged — robust to a lone blow-out set.
 * Pure: the caller supplies `ageDays`/`sessionKey` (no clock, no I/O here).
 */
export function recencyWeightedE1rm(
  samples: E1rmSample[],
  rawParams: EngineParams,
): E1rmAnchor | null {
  const params = engineParamsSchema.parse(rawParams);
  const halflife = params.e1rm.recency_halflife_days;
  const method = params.e1rm.anchor_method;

  const entries: {
    value: number;
    confidence: E1rmConfidence;
    recency: number;
    sessionKey?: string | null;
  }[] = [];
  for (const s of samples) {
    const est = estimateE1rm(s.weight, s.reps, s.targetRir, params);
    if (!est) continue;
    const recency = Math.pow(0.5, Math.max(0, s.ageDays) / halflife);
    if (recency <= 0) continue;
    entries.push({
      value: est.value,
      confidence: est.confidence,
      recency,
      sessionKey: s.sessionKey,
    });
  }
  if (entries.length === 0) return null;

  if (method === "mean") {
    let weightedSum = 0;
    let weightTotal = 0;
    let best: { value: number; confidence: E1rmConfidence } | null = null;
    for (const e of entries) {
      const w = e.recency * CONF_WEIGHT[e.confidence];
      if (w <= 0) continue;
      weightedSum += e.value * w;
      weightTotal += w;
      if (!best || e.value > best.value) best = e;
    }
    if (weightTotal === 0) return null;
    return {
      value: Math.round((weightedSum / weightTotal) * 10) / 10,
      confidence: best!.confidence,
    };
  }

  // `best` and `session_best` both start from the recency-weighted best set
  let bestEntry = entries[0];
  for (const e of entries) {
    if (e.value * e.recency > bestEntry.value * bestEntry.recency) bestEntry = e;
  }

  if (method === "best") {
    return {
      value: Math.round(bestEntry.value * 10) / 10,
      confidence: bestEntry.confidence,
    };
  }

  // session_best: average every working set from the best set's session.
  // §S3: when `session_value_confidence_weights` is set, weight each set's e1RM by
  // its confidence so a low-confidence burnout (a 20–30-rep set) contributes little
  // to the anchor *value*, not just its label. Absent ⇒ legacy equal-weight mean.
  const session =
    bestEntry.sessionKey == null
      ? [bestEntry]
      : entries.filter((e) => e.sessionKey === bestEntry.sessionKey);
  const cw = params.e1rm.session_value_confidence_weights;
  let mean: number;
  if (cw) {
    let weightedSum = 0;
    let weightTotal = 0;
    for (const e of session) {
      const w = cw[e.confidence];
      weightedSum += e.value * w;
      weightTotal += w;
    }
    mean =
      weightTotal > 0
        ? weightedSum / weightTotal
        : session.reduce((acc, e) => acc + e.value, 0) / session.length;
  } else {
    mean = session.reduce((acc, e) => acc + e.value, 0) / session.length;
  }
  return {
    value: Math.round(mean * 10) / 10,
    confidence: bestConfidence(session.map((e) => e.confidence)),
  };
}
