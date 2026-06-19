import type { EngineInputs } from "../types";

export function baseInputs(
  overrides: Partial<EngineInputs> = {},
): EngineInputs {
  return {
    exercise: { equipmentType: "barbell" },
    user: { experienceLevel: "intermediate", units: "kg" },
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
