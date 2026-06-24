/**
 * v12 rep-window refinements (standalone-prescription investigation round 2):
 * #1 climb on PERFORMED reps (min working set), #2 bound to the TARGET window.
 * Grounded in real W4·D3 cases. Each asserted on V12 and shown unchanged on V11.
 */
import { describe, expect, it } from "vitest";
import { prescribe } from "../index";
import type { EngineInputs } from "../types";
import { baseInputs, V11_PARAMS, V12_PARAMS } from "./helpers";

// Cable Overhead Triceps: prescribed 12 last week, but only PERFORMED 11.
function cableOverhead(over: Partial<EngineInputs> = {}): EngineInputs {
  return baseInputs({
    exercise: { equipmentType: "cable" },
    goalType: "hypertrophy",
    week: { targetRir: 0, isDeload: false },
    previous: { weight: 125, reps: 12, sets: 2, targetRir: 1 },
    actualSets: [
      { setNumber: 1, weight: 125, reps: 11, rirReported: null, isWarmup: false },
      { setNumber: 2, weight: 125, reps: 11, rirReported: null, isWarmup: false },
    ],
    strengthAnchor: { value: 177.5, confidence: "moderate" },
    exerciseFeedback: { jointPain: 0, pump: 5, workload: 5 },
    workoutFeedback: { overallFatigue: 2, effortRating: 3, performanceRating: 3 },
    ...over,
  });
}

describe("§v12 #1 — the climb advances on PERFORMED reps, not the prescription", () => {
  it("v11 resets to the window bottom on a prescribed-12/performed-11 set; v12 keeps climbing", () => {
    const v11 = prescribe(cableOverhead(), V11_PARAMS);
    const v12 = prescribe(cableOverhead(), V12_PARAMS);
    // v11 reads the prescribed 12 ⇒ resets reps to the bottom + a bigger load jump
    expect(v11.reps).toBeLessThanOrEqual(9);
    // v12 reads the performed 11 ⇒ no reset, keeps climbing in the upper window…
    expect(v12.reps).toBeGreaterThanOrEqual(10);
    // …with a smaller load step than v11's reset-bump
    expect(v12.weight!).toBeLessThan(v11.weight!);
  });

  it("v12 DOES reset + bump once every set actually reaches the top of the window", () => {
    const out = prescribe(
      cableOverhead({
        actualSets: [
          { setNumber: 1, weight: 125, reps: 12, rirReported: null, isWarmup: false },
          { setNumber: 2, weight: 125, reps: 12, rirReported: null, isWarmup: false },
        ],
      }),
      V12_PARAMS,
    );
    expect(out.weight).toBeGreaterThan(125); // performed 12 on all sets ⇒ reset + load
    expect(out.reps).toBeLessThanOrEqual(9);
  });

  it("v12 does NOT reset when one set lags, even if another set hit the top", () => {
    const out = prescribe(
      cableOverhead({
        actualSets: [
          { setNumber: 1, weight: 125, reps: 12, rirReported: null, isWarmup: false },
          { setNumber: 2, weight: 125, reps: 10, rirReported: null, isWarmup: false },
        ],
      }),
      V12_PARAMS,
    );
    expect(out.reps).toBeGreaterThanOrEqual(10); // min performed 10 ⇒ still climbing
  });
});

describe("§v12 #2 — bound the load to the TARGET window, not just the hard bounds", () => {
  // MaxPump High Row: anchor 73.3, prev performed 11 at 50 lb (machine, step 5).
  function highRow(params = V12_PARAMS) {
    return prescribe(
      baseInputs({
        exercise: { equipmentType: "machine" },
        goalType: "hypertrophy",
        week: { targetRir: 0, isDeload: false },
        previous: { weight: 50, reps: 11, sets: 2, targetRir: 1 },
        actualSets: [
          { setNumber: 1, weight: 50, reps: 11, rirReported: null, isWarmup: false },
          { setNumber: 2, weight: 50, reps: 11, rirReported: null, isWarmup: false },
        ],
        strengthAnchor: { value: 73.3, confidence: "low" },
        exerciseFeedback: { jointPain: 0, pump: 5, workload: 5 },
        workoutFeedback: { overallFatigue: 2, effortRating: 3, performanceRating: 3 },
      }),
      params,
    );
  }

  it("v11 leaves 50×14 (predicts above 12 but below the hard max 15 ⇒ no nudge)", () => {
    const out = highRow(V11_PARAMS);
    expect(out.weight).toBe(50);
    expect(out.reps).toBeGreaterThan(12);
  });

  it("v12 steps to 55×10 — one step up lands squarely in the 8–12 target", () => {
    const out = highRow(V12_PARAMS);
    expect(out.weight).toBe(55);
    expect(out.reps).toBeGreaterThanOrEqual(8);
    expect(out.reps).toBeLessThanOrEqual(12);
  });

  it("v12 keeps the lighter load when stepping up would undershoot the floor (true buffer)", () => {
    // anchor ~29.5 at a 5 lb (stock) machine step: 20→13 reps, but the next step 25
    // predicts ~5 reps (below target_low) ⇒ keep 20, run the buffer.
    const out = prescribe(
      baseInputs({
        exercise: { equipmentType: "machine" },
        goalType: "hypertrophy",
        week: { targetRir: 0, isDeload: false },
        previous: { weight: 20, reps: 11, sets: 3, targetRir: 1 },
        actualSets: [
          { setNumber: 1, weight: 20, reps: 11, rirReported: null, isWarmup: false },
        ],
        strengthAnchor: { value: 29.5, confidence: "low" },
        exerciseFeedback: { jointPain: 0, pump: 5, workload: 5 },
        workoutFeedback: { overallFatigue: 2, effortRating: 3, performanceRating: 3 },
      }),
      V12_PARAMS,
    );
    expect(out.weight).toBe(20); // no in-window step exists at a 5 lb increment
    expect(out.reps).toBeLessThanOrEqual(15); // stays within the hard bound
  });

  it("v12 never breaches the hard bounds (steps anyway if the buffer would exceed 15)", () => {
    // a very light load vs a high anchor predicts > 15 ⇒ must step up regardless
    const out = prescribe(
      baseInputs({
        exercise: { equipmentType: "machine" },
        goalType: "hypertrophy",
        week: { targetRir: 0, isDeload: false },
        previous: { weight: 25, reps: 11, sets: 3, targetRir: 1 },
        actualSets: [
          { setNumber: 1, weight: 25, reps: 11, rirReported: null, isWarmup: false },
        ],
        strengthAnchor: { value: 38.2, confidence: "low" },
        exerciseFeedback: { jointPain: 0, pump: 5, workload: 5 },
        workoutFeedback: { overallFatigue: 2, effortRating: 3, performanceRating: 3 },
      }),
      V12_PARAMS,
    );
    expect(out.reps).toBeLessThanOrEqual(15);
  });
});
