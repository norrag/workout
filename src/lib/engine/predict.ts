/**
 * e1RM / rep-prediction core (10-metrics-spec.md §1, doc 11) — pure math, and
 * deliberately **zod-free** so the client bundle can carry the live predictor
 * without shipping the schema layer (WS-J: `/log`'s day view runs these on
 * every render).
 *
 * Every function here takes the already-validated `e1rm` slice of
 * `EngineParams` (`E1rmConfig`). Validation stays at the boundaries: server
 * code loads params through `engineParamsSchema.parse` (queries/generation
 * `getActiveEngineParams`), and the public engine API in `e1rm.ts` / `reps.ts`
 * wraps these cores with a parse so external callers keep the guarantee. Only
 * code holding a parsed `EngineParams` (e.g. a client component fed validated
 * server props) should import this module directly.
 *
 * IMPORTANT (WS-J bundle guard): no runtime imports here beyond type-only ones
 * — `import type` is erased at compile time, so this module must never gain a
 * value import of `./params` (zod) or the client bundle regresses. See
 * `__tests__/predict.test.ts`.
 */
import type { EngineParams } from "./params";

/** The validated `engine_params.e1rm` block every core function keys on. */
export type E1rmConfig = EngineParams["e1rm"];

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
 * AND the closed-form inverse (`weightForRepsAtRir`) — they must share it or
 * forward/inverse drift.
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
  cfg: Pick<E1rmConfig, "brzycki_max_eff_reps">,
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
  cfg: Pick<E1rmConfig, "brzycki_max_eff_reps">,
): number {
  return weight * e1rmFactor(effectiveReps, cfg);
}

function confidenceFor(
  effectiveReps: number,
  rir: number | null,
  cfg: E1rmConfig,
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

/**
 * The RIR a logged set is ASSUMED to have been performed at — doc 21 §2, the
 * one resolution rule shared by every consumer:
 *
 *   assumedRir(set) = set.rir_reported ?? set.workout_exercise.target_rir
 *
 * The athlete's honest report wins; where they did not report, the set falls
 * back to what the prescription asked for (the doc-11 RIR premise, now a
 * FALLBACK rather than an assumption). Used identically at the per-set e1RM
 * stamp site, in the strength anchor, in the compliance marker, and in the
 * restamp backfill — before doc 21 the stamp path had no fallback at all, so a
 * never-written `rir_reported` made every stats surface read every set as taken
 * to failure (N71).
 *
 * **Never default a captured value to 0** (the N11 regression, pinned by
 * `day-rules.test.ts`): an absent report resolves to the prescribed target, not
 * to zero, or an exactly-as-prescribed set reads as a big miss — worst on
 * deloads, where the target RIR is the largest in the ramp.
 */
export function assumedRir(
  reported: number | null | undefined,
  prescribed: number | null | undefined,
): number | null {
  return reported ?? prescribed ?? null;
}

/**
 * From a logged working set of `weight × reps` at reported `rir`:
 *   effectiveReps = reps + rir × rir_offset
 *   e1RM = average( Epley, Brzycki ) over effectiveReps (§S3 switch)
 * Confidence degrades with effective reps / RIR. e1RM is an estimate/trend,
 * never a to-the-pound claim (§9 honesty guardrail).
 *
 * @param rir reported reps-in-reserve, or null (unknown ⇒ low confidence)
 * @returns null for non-working input (weight or reps ≤ 0)
 */
export function estimateE1rm(
  weight: number,
  reps: number,
  rir: number | null,
  cfg: E1rmConfig,
): E1rmEstimate | null {
  if (weight <= 0 || reps <= 0) return null;
  const effectiveReps = reps + (rir ?? 0) * cfg.rir_offset;
  const value = e1rmFromEffectiveReps(weight, effectiveReps, cfg);
  return {
    value: Math.round(value * 10) / 10,
    confidence: confidenceFor(effectiveReps, rir, cfg),
    effectiveReps,
  };
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
  cfg: E1rmConfig,
): number {
  if (e1rm <= 0 || weight <= 0) return 0;
  if (weight >= e1rm) return 0; // at or above estimated 1RM: ≤ 1 rep
  let lo = 0;
  let hi = 35.9; // Brzycki blows up at 37; cap inside the valid band
  // e1RM grows without bound as reps→36; if even hi can't reach e1rm, return hi
  if (e1rmFromEffectiveReps(weight, hi, cfg) < e1rm) return hi;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (e1rmFromEffectiveReps(weight, mid, cfg) < e1rm) lo = mid;
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
  cfg: E1rmConfig,
): number | null {
  if (e1rm == null || e1rm <= 0 || weight <= 0) return null;
  const effReps = effectiveRepsForE1rm(e1rm, weight, cfg);
  const reps = Math.round(effReps - targetRir * cfg.rir_offset);
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
  cfg: E1rmConfig,
): number | null {
  if (e1rm == null || e1rm <= 0 || reps <= 0) return null;
  const eff = reps + targetRir * cfg.rir_offset;
  // same §S3 switch as the forward estimate (e1rmFactor), so choosing a load
  // for target reps inverts exactly the curve used to score a logged set.
  const k = e1rmFactor(eff, cfg);
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
  cfg: E1rmConfig,
): number | null {
  if (e1rm == null || e1rm <= 0 || weight <= 0 || reps <= 0) return null;
  const effReps = effectiveRepsForE1rm(e1rm, weight, cfg);
  const rir = (effReps - reps) / (cfg.rir_offset || 1);
  return Math.max(0, Math.round(rir));
}
