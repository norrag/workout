/**
 * N51 — the anchor seed must respect the target rep window, exactly like the
 * working prescribe path. `seedCore` (meso seed) and prescribe's cold-start /
 * swap-in branch both priced `target_low` at the start RIR, rounded to the
 * NEAREST increment (heavy half the time), then clamped only to the hard
 * [min,max] window — so 6–7 reps sailed through an 8–12 target. The fix routes
 * both branches through the same `boundRepsToWindow` the working path applies,
 * gated (like the working path) on `bound_to_target_window`, so pre-v12 params
 * rows replay byte-identically.
 *
 * Worked numbers (machine, 5 lb step, start RIR 3, hypertrophy 8–12):
 * anchor 100 ⇒ raw 72.69 for 8 reps; nearest-step rounding lands 75, which
 * predicts 7 reps — below the window. One step down (70) predicts 10 under the v12 e1RM config.
 */
import { describe, expect, it } from "vitest";
import { prescribe, seedMeso } from "../index";
import { baseInputs, V11_PARAMS, V12_PARAMS } from "./helpers";

const exercise = { equipmentType: "machine" as const, loadType: "external" as const };
const user = { experienceLevel: "intermediate" as const };
const anchor = { value: 100, confidence: "moderate" as const };

describe("N51 — meso seed (seedMeso §S1 anchor branch)", () => {
  const seed = (params = V12_PARAMS) =>
    seedMeso({ weight: 75, reps: 10, sets: 3 }, null, exercise, user, 3, params, {
      goalType: "hypertrophy",
      anchor,
    });

  it("steps the weight down one increment when nearest-step rounding prices below target_low", () => {
    const out = seed();
    expect(out.weight).toBe(70); // 75 predicted 7 reps — below the 8–12 target
    expect(out.reps).toBe(10);
  });

  it("prescribed reps land inside the target window across a sweep of anchors", () => {
    for (let a = 60; a <= 260; a += 2.5) {
      const out = seedMeso(null, null, exercise, user, 3, V12_PARAMS, {
        goalType: "hypertrophy",
        anchor: { value: a, confidence: "moderate" },
      });
      if (out.weight == null || out.reps == null) continue;
      expect(out.reps).toBeGreaterThanOrEqual(8);
      expect(out.reps).toBeLessThanOrEqual(12);
    }
  });

  it("stays gated: without bound_to_target_window the old hard-bounds-only seed is unchanged", () => {
    // v11 rows must replay byte-identically (doc 14): 75×7 passes the hard
    // [6,15] clamp, so the pre-fix prescription survives under pre-v12 params.
    const out = seed(V11_PARAMS);
    expect(out.weight).toBe(75);
    expect(out.reps).toBe(7);
  });
});

describe("N51 — cold-start / swap-in seed (prescribe no_data branch)", () => {
  const coldStart = (params = V12_PARAMS) =>
    prescribe(
      baseInputs({
        exercise,
        goalType: "hypertrophy",
        week: { targetRir: 3, isDeload: false },
        previous: null,
        actualSets: [],
        exerciseFeedback: null,
        workoutFeedback: null,
        strengthAnchor: anchor,
      }),
      params,
    );

  it("applies the same window bound as the meso seed", () => {
    const out = coldStart();
    expect(out.trace[0]?.rule).toBe("seed_anchor");
    expect(out.weight).toBe(70);
    expect(out.reps).toBe(10);
  });

  it("stays gated off under pre-v12 params", () => {
    const out = coldStart(V11_PARAMS);
    expect(out.trace[0]?.rule).toBe("seed_anchor");
    expect(out.weight).toBe(75);
    expect(out.reps).toBe(7);
  });
});
