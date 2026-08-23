import type { EngineInputs, LoggedSetInput } from "../types";
import { bestSet } from "../best-set";
import type { EngineParams } from "../params";
import { impliedRirAtReps } from "../reps";

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

  // N89: the ONE definition of the set that counts, shared with every layer
  // that has to say what changed "versus last session" (`engine/best-set.ts`).
  const best = bestSet<LoggedSetInput>(working)!;

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

export type RirGrade = "on_track" | "easier" | "harder";

/**
 * Grade last week on RIR rather than rep count (doc 13 §4.3): infer the RIR the
 * lifter actually hit (from their best set vs the strength anchor) and compare it
 * to the week's target. Overshooting intensity (a harder set than asked) is a
 * *hold*, never a regress; genuine under-performance is carried by the falling
 * anchor, so this only colors the rationale. Null without a usable anchor/set.
 */
export function gradeOnRir(
  perf: PerformanceAssessment,
  anchorValue: number,
  targetRir: number,
  params: EngineParams,
): { grade: RirGrade; detail: string } | null {
  if (perf.bestWeight == null || perf.bestReps == null) return null;
  const achieved = impliedRirAtReps(
    anchorValue,
    perf.bestWeight,
    perf.bestReps,
    params,
  );
  if (achieved == null) return null;
  const tol = params.rir_tolerance;
  if (Math.abs(achieved - targetRir) <= tol) {
    return { grade: "on_track", detail: `on target at ~${achieved} RIR` };
  }
  if (achieved - targetRir > tol) {
    return {
      grade: "easier",
      detail: `easier than asked (~${achieved} RIR vs ${targetRir} target)`,
    };
  }
  return {
    grade: "harder",
    detail: `harder than asked (~${achieved} vs ${targetRir} RIR) — held, not a miss`,
  };
}
