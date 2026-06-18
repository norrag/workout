import type { EngineInputs, LoggedSetInput } from "../types";

export interface PerformanceAssessment {
  /** best working set actually performed (anchor for next week) */
  bestWeight: number | null;
  bestReps: number | null;
  workingSetCount: number;
  /** met = hit prescribed reps at/under target RIR; beat = exceeded them */
  outcome: "met" | "beat" | "small_miss" | "big_miss" | "no_data";
  /**
   * whether the prescribed reps were met (or exceeded). A `small_miss` can be
   * either a genuine reps-short miss (false) or reps met/beaten but at a lower
   * RIR than target — i.e. harder than prescribed — (true); they hold the load
   * for different reasons, so the rationale wording differs (§5.11).
   */
  repsMet: boolean;
  detail: string;
}

/**
 * Anchor on actuals: find the best working set vs the previous prescription
 * and classify the performance delta (§3 of the v1 sketch).
 */
export function assessPerformance(
  inputs: EngineInputs,
  smallMissReps: number,
): PerformanceAssessment {
  const working = inputs.actualSets.filter((s) => !s.isWarmup);
  if (working.length === 0 || !inputs.previous) {
    return {
      bestWeight: null,
      bestReps: null,
      workingSetCount: working.length,
      outcome: "no_data",
      repsMet: false,
      detail: "no logged history for this exercise",
    };
  }

  const best = working.reduce<LoggedSetInput>(
    (a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a),
    working[0],
  );

  const prescribedReps = inputs.previous.reps;
  const targetRir = inputs.previous.targetRir;
  if (prescribedReps === null) {
    return {
      bestWeight: best.weight,
      bestReps: best.reps,
      workingSetCount: working.length,
      outcome: "met",
      repsMet: true,
      detail: `did ${best.weight}×${best.reps} with no rep target`,
    };
  }

  // a reported RIR above target means the set was easier than prescribed;
  // below target means it was harder (counts against a clean "met")
  const overTarget =
    best.rirReported !== null && best.rirReported < targetRir
      ? best.rirReported - targetRir
      : 0;

  const repDelta = best.reps - prescribedReps;
  let outcome: PerformanceAssessment["outcome"];
  if (repDelta > 0 && overTarget === 0) outcome = "beat";
  else if (repDelta >= 0 && overTarget === 0) outcome = "met";
  else if (repDelta >= 0 && overTarget < 0) outcome = "small_miss";
  else if (-repDelta <= smallMissReps) outcome = "small_miss";
  else outcome = "big_miss";

  const rirNote =
    best.rirReported !== null ? ` at ${best.rirReported} RIR` : "";
  return {
    bestWeight: best.weight,
    bestReps: best.reps,
    workingSetCount: working.length,
    outcome,
    repsMet: repDelta >= 0,
    detail: `did ${best.weight}×${best.reps}${rirNote} vs ${inputs.previous.weight ?? "?"}×${prescribedReps} prescribed at ${targetRir} RIR`,
  };
}
