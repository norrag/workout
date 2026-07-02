/**
 * I14 (2026-07-02) — the session sliders (overall fatigue / effort /
 * performance) move from 0–4 onto the per-exercise 0–10 scale. Stored rows
 * were rescaled round(x × 2.5) and engine_params v18 carries the thresholds
 * on the same scale (fatigue ≥ 8, performance ≤ 3). The contract pinned here:
 * the rescale is behavior-preserving — every old rating classifies exactly as
 * before — and the §S5 dampener semantics restate cleanly on the new scale.
 */
import { describe, expect, it } from "vitest";
import { prescribe } from "../index";
import { modulateFromFeedback } from "../rules/feedback";
import type { EngineInputs } from "../types";
import { baseInputs, V17_PARAMS, V18_PARAMS } from "./helpers";

/** the migration's mapping: 0→0, 1→3, 2→5, 3→8, 4→10 */
const rescale = (v: number) => Math.round(v * 2.5);

const exercise = { equipmentType: "barbell", loadType: "external" } as const;

// §S5's "strong" shape: an anchor well above the held load wants an increase
function strong(over: Partial<EngineInputs> = {}): EngineInputs {
  return baseInputs({
    exercise,
    goalType: "hypertrophy",
    week: { targetRir: 2, isDeload: false },
    previous: { weight: 100, reps: 8, sets: 2, targetRir: 3 },
    actualSets: [
      { setNumber: 1, weight: 100, reps: 8, rirReported: 3, isWarmup: false },
    ],
    strengthAnchor: { value: 165, confidence: "high" },
    ...over,
  });
}

describe("I14 — rescale is behavior-preserving", () => {
  it("every old 0–4 rating pair classifies identically after round(x × 2.5) under v18", () => {
    for (let fatigue = 0; fatigue <= 4; fatigue++) {
      for (let perf = 0; perf <= 4; perf++) {
        const oldScale = modulateFromFeedback(
          baseInputs({
            workoutFeedback: {
              overallFatigue: fatigue,
              effortRating: 2,
              performanceRating: perf,
            },
          }),
          V17_PARAMS,
        );
        const newScale = modulateFromFeedback(
          baseInputs({
            workoutFeedback: {
              overallFatigue: rescale(fatigue),
              effortRating: rescale(2),
              performanceRating: rescale(perf),
            },
          }),
          V18_PARAMS,
        );
        expect(newScale.sessionDampened).toBe(oldScale.sessionDampened);
      }
    }
  });
});

describe("I14 — §S5 dampener semantics on the 0–10 scale (v18)", () => {
  it("fatigued-but-strong still reprices up (require both)", () => {
    const out = prescribe(
      strong({
        workoutFeedback: { overallFatigue: 8, effortRating: 8, performanceRating: 8 },
      }),
      V18_PARAMS,
    );
    expect(out.weight).toBeGreaterThan(100);
  });

  it("dampens when BOTH wiped-out fatigue and poor performance are present", () => {
    const out = prescribe(
      strong({
        workoutFeedback: { overallFatigue: 8, effortRating: 3, performanceRating: 3 },
      }),
      V18_PARAMS,
    );
    expect(out.weight).toBe(100); // both signals → genuine hold
  });

  it("the new midpoint (5/5/5 — the sheet default) never dampens", () => {
    const out = prescribe(
      strong({
        workoutFeedback: { overallFatigue: 5, effortRating: 5, performanceRating: 5 },
      }),
      V18_PARAMS,
    );
    expect(out.weight).toBeGreaterThan(100);
  });
});
