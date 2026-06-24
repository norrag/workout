import type { EngineInputs } from "../types";
import { DEFAULT_ENGINE_PARAMS, type EngineParams } from "../params";

/**
 * The v11 params: DEFAULT (v10) plus the four gated behaviors from the
 * standalone-prescription investigation (2026-06-23) turned on — Brzycki ≤10 /
 * Epley >10, low-confidence session down-weighting, anchor-seed, rep-consistent
 * hold, and require-both dampening. Mirrors `20260624000001_engine_params_v11`.
 */
export const V11_PARAMS: EngineParams = {
  ...DEFAULT_ENGINE_PARAMS,
  e1rm: {
    ...DEFAULT_ENGINE_PARAMS.e1rm,
    brzycki_max_eff_reps: 10,
    session_value_confidence_weights: { high: 1, moderate: 0.6, low: 0.3 },
  },
  seed_from_anchor: true,
  hold_rep_consistent: true,
  session_dampen_require_both: true,
};

export function baseInputs(
  overrides: Partial<EngineInputs> = {},
): EngineInputs {
  return {
    exercise: { equipmentType: "barbell" },
    user: { experienceLevel: "intermediate" },
    goalType: "gain",
    week: { targetRir: 2, isDeload: false },
    previous: { weight: 100, reps: 8, sets: 3, targetRir: 3 },
    actualSets: [
      { setNumber: 1, weight: 100, reps: 8, rirReported: 3, isWarmup: false },
      { setNumber: 2, weight: 100, reps: 8, rirReported: 3, isWarmup: false },
      { setNumber: 3, weight: 100, reps: 8, rirReported: 3, isWarmup: false },
    ],
    exerciseFeedback: { jointPain: 0, pump: 5, workload: 5 },
    workoutFeedback: { overallFatigue: 1, effortRating: 2, performanceRating: 3 },
    muscleGroupWeeklySets: 10,
    weekPeak: null,
    initial: null,
    strengthAnchor: null,
    ...overrides,
  };
}
