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

  // T-I4: with no strength anchor the engine HOLDS the load (the legacy +increment
  // progression is retired) while the RIR ramp tightens week to week, then deloads.
  // Anchor-driven progression is covered by the rep-window golden tests.
  it("holds the load down the RIR ramp (no anchor), then deloads", () => {
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
      { weight: 100, rir: 2, sets: 3 },
      { weight: 100, rir: 1, sets: 3 },
      { weight: 100, rir: 0, sets: 3 },
      // deload: legacy load_pct path (no anchor) = 55% of peak 100 = 55; half sets
      { weight: 55, rir: 4, sets: 2 },
    ]);

    // every prescription explains itself
    for (const p of prescriptions) {
      expect(p.rationale.length).toBeGreaterThan(10);
    }
  });

  it("a new meso no longer seeds from the prior peak (T-I4): it defers to a manual seed", () => {
    const seeded = seedMeso(
      { weight: 107.5, reps: 8, sets: 3 },
      null,
      exercise,
      user,
      3,
      params,
    );
    // the prior-peak × back-off seed is retired — with no anchor and no plan seed,
    // defer rather than fabricate.
    expect(seeded.weight).toBeNull();
    expect(seeded.targetRir).toBe(3);
    expect(seeded.rationale).toMatch(/enter a starting weight/i);
  });
});
