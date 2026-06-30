/**
 * Golden test: full meso simulation for "intermediate, gain, 5 weeks +
 * deload" on barbell bench. The user hits every prescription cleanly with
 * benign feedback; assert the exact week-by-week prescriptions.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS, prescribe, rirRamp, seedMeso } from "../index";
import type { EngineInputs, Prescription } from "../types";

const params = DEFAULT_ENGINE_PARAMS;
const exercise = { equipmentType: "barbell" as const, loadType: "external" as const };
const user = { experienceLevel: "intermediate" as const };

function simulateCleanWeek(prev: Prescription): EngineInputs["actualSets"] {
  return Array.from({ length: prev.sets }, (_, i) => ({
    setNumber: i + 1,
    weight: prev.weight!,
    reps: prev.reps!,
    rirReported: prev.targetRir,
    isWarmup: false,
  }));
}

describe("golden meso: intermediate gain, 5 weeks + deload, barbell 100lb start", () => {
  const ramp = rirRamp(5, true, 3, 0, params);

  it("progresses 100 → 105 → 110 → 115 then deloads to 65", () => {
    const prescriptions: Prescription[] = [];
    let prev: Prescription = seedMeso(
      null,
      { weight: 100, reps: 8, sets: 3 },
      exercise,
      user,
      ramp[0].targetRir,
      params,
    );
    prescriptions.push(prev);

    for (const week of ramp.slice(1)) {
      const peak = prescriptions.reduce((a, b) =>
        (b.weight ?? 0) > (a.weight ?? 0) ? b : a,
      );
      const next = prescribe(
        {
          exercise,
          user,
          goalType: "gain",
          week: { targetRir: week.targetRir, isDeload: week.isDeload },
          previous: prev,
          actualSets: simulateCleanWeek(prev),
          exerciseFeedback: { jointPain: 0, pump: 6, workload: 5 },
          workoutFeedback: { overallFatigue: 1, effortRating: 2, performanceRating: 3 },
          muscleGroupWeeklySets: 12,
          weekPeak: { weight: peak.weight, reps: peak.reps, sets: peak.sets, targetRir: peak.targetRir },
          initial: null,
          strengthAnchor: null,
          bodyweight: null,
        },
        params,
      );
      prescriptions.push(next);
      prev = next;
    }

    expect(
      prescriptions.map((p) => ({ weight: p.weight, rir: p.targetRir, sets: p.sets })),
    ).toEqual([
      { weight: 100, rir: 3, sets: 3 },
      { weight: 105, rir: 2, sets: 3 },
      { weight: 110, rir: 1, sets: 3 },
      { weight: 115, rir: 0, sets: 3 },
      // deload: 55% of 115 = 63.25, rounded to barbell 5 step = 65; half sets
      { weight: 65, rir: 4, sets: 2 },
    ]);

    // every prescription explains itself
    for (const p of prescriptions) {
      expect(p.rationale.length).toBeGreaterThan(10);
    }
  });

  it("next meso seeds from this meso's peak, backed off", () => {
    const seeded = seedMeso(
      { weight: 107.5, reps: 8, sets: 3 },
      null,
      exercise,
      user,
      3,
      params,
    );
    // 107.5 × 0.925 = 99.4 → rounded to 100
    expect(seeded.weight).toBe(100);
    expect(seeded.targetRir).toBe(3);
    expect(seeded.rationale).toMatch(/prior meso peak/);
  });
});
