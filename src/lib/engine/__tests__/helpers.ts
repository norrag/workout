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

/** v12 = v11 plus the two rep-window refinements (climb on performed reps; bound
 *  to the target window). Mirrors `20260624…_engine_params_v12`. */
export const V12_PARAMS: EngineParams = {
  ...V11_PARAMS,
  climb_on_performed_reps: true,
  bound_to_target_window: true,
};

/** v14 = v12 plus the prior-peak seed retirement (T-I5, owner ruling 2026-06-25):
 *  no fabricated peak seed — precedence is confident anchor → user initial_* →
 *  unseeded. Mirrors `20260625000001_engine_params_v14`. (v13 is a throwaway test
 *  row in the hosted DB only — no migration; skipped.) */
export const V14_PARAMS: EngineParams = {
  ...V12_PARAMS,
  retire_prior_peak_seed: true,
};

/** v15 = v14 plus anchor-based deload selection (owner ruling 2026-06-25): the
 *  deload picks its load from the strength anchor to land window-centered reps at
 *  a higher recovery RIR (≈6), the same model as a working week — instead of the
 *  legacy load_pct-of-peak heuristic. Mirrors `…_engine_params_v15`. */
export const V15_PARAMS: EngineParams = {
  ...V14_PARAMS,
  deload_anchor_rir: true,
  deload: { ...V14_PARAMS.deload, target_rir: 6 },
};

/** v16 = v15 plus the bodyweight load-type model (T-I2): bodyweight movements price
 *  on effective load and progress on reps / the rep-window in effective space.
 *  Mirrors `20260626000003_engine_params_v16_bodyweight_model`. */
export const V16_PARAMS: EngineParams = {
  ...V15_PARAMS,
  bodyweight_model: true,
};

/** v17 = v16 plus the joint-pain hard gate on set counts (R8, doc 10 §3 step 0):
 *  pain ≥ pain_gate vetoes set additions; pain ≥ pain_cut_gate cuts a set and
 *  suggests substitution. Mirrors `20260701000001_engine_params_v17_pain_set_gate`. */
export const V17_PARAMS: EngineParams = {
  ...V16_PARAMS,
  pain_cut_gate: 3,
};

export function baseInputs(
  overrides: Partial<EngineInputs> = {},
): EngineInputs {
  return {
    exercise: { equipmentType: "barbell", loadType: "external" },
    user: { experienceLevel: "intermediate" },
    goalType: "gain",
    week: { targetRir: 2, isDeload: false },
    bodyweight: null,
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
