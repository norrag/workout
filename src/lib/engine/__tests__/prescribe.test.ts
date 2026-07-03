import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS, prescribe } from "../index";
import { baseInputs } from "./helpers";

const params = DEFAULT_ENGINE_PARAMS;

// T-I4: the legacy increment/regression progression is retired. With no confident
// strength anchor (baseInputs default) prescribe() takes the no-anchor SAFETY HOLD —
// it never fabricates a +increment on a hit or a −regression% on a miss (anchor-only,
// owner ruling T-I3). The live progression (rep-window, anchor-driven) is covered by
// rep-window.test.ts / v12-rep-window.test.ts / standalone-prescription.test.ts.
describe("prescribe — no-anchor hold fallback (§3, T-I4)", () => {
  it("met reps but no strength anchor: holds the load (no fabricated increment)", () => {
    const out = prescribe(baseInputs(), params);
    expect(out.weight).toBe(100);
    expect(out.sets).toBe(3);
    expect(out.targetRir).toBe(2);
    expect(out.rationale).toMatch(/hold 100 lb/i);
    expect(out.rationale).toMatch(/not enough recent data to reprice/i);
  });

  it("emits a structured trace the rationale is composed from (P0-4)", () => {
    const out = prescribe(baseInputs(), params);
    expect(out.trace.length).toBeGreaterThan(0);
    for (const step of out.trace) {
      expect(typeof step.rule).toBe("string");
      expect(step.detail.length).toBeGreaterThan(0);
    }
    expect(out.trace.some((s) => s.rule === "load")).toBe(true);
    const composed =
      out.trace.map((s) => s.detail).join("; ").replace(/^./, (c) => c.toUpperCase()) +
      ".";
    expect(out.rationale).toBe(composed);
  });

  it("a small miss holds the load", () => {
    const out = prescribe(
      baseInputs({
        actualSets: [
          { setNumber: 1, weight: 100, reps: 7, rirReported: null, isWarmup: false },
        ],
      }),
      params,
    );
    expect(out.weight).toBe(100);
  });

  it("a big miss holds too — no −% regression without an anchor (anchor-only, T-I3)", () => {
    const out = prescribe(
      baseInputs({
        actualSets: [
          { setNumber: 1, weight: 100, reps: 4, rirReported: null, isWarmup: false },
        ],
      }),
      params,
    );
    expect(out.weight).toBe(100);
    expect(out.rationale).not.toMatch(/%/); // no regression_pct back-off
  });

  it("warmup sets are ignored when anchoring", () => {
    const out = prescribe(
      baseInputs({
        actualSets: [
          { setNumber: 1, weight: 140, reps: 1, rirReported: null, isWarmup: true },
          { setNumber: 2, weight: 100, reps: 8, rirReported: 3, isWarmup: false },
        ],
      }),
      params,
    );
    expect(out.weight).toBe(100);
  });

  it("no history and no previous: falls back to plan initials", () => {
    const out = prescribe(
      baseInputs({
        previous: null,
        actualSets: [],
        initial: { weight: 60, reps: 10, sets: 3 },
      }),
      params,
    );
    expect(out).toMatchObject({ weight: 60, reps: 10, sets: 3, targetRir: 2 });
  });
});

describe("prescribe — goal bias (§5)", () => {
  it("holds the load without a strength anchor regardless of goal", () => {
    expect(prescribe(baseInputs({ goalType: "cut" }), params).weight).toBe(100);
    expect(prescribe(baseInputs({ goalType: "maintain" }), params).weight).toBe(100);
    expect(prescribe(baseInputs({ goalType: "gain" }), params).weight).toBe(100);
  });

  it("a dropping target RIR is itself the progression on a held load", () => {
    // previous targetRir 3, this week 2 → the RIR step is noted as the progression
    const out = prescribe(baseInputs({ goalType: "cut" }), params);
    expect(out.weight).toBe(100);
    expect(out.rationale).toMatch(/target RIR steps 3 to 2/);
  });
});

describe("prescribe — feedback modulation (§4, pump/workload 0–10)", () => {
  it("pain at the gate is reported (load already held without an anchor)", () => {
    const out = prescribe(
      baseInputs({
        exerciseFeedback: { jointPain: 2, pump: 5, workload: 5 },
      }),
      params,
    );
    expect(out.weight).toBe(100);
    expect(out.rationale).toMatch(/joint pain/);
  });

  it("workload past just right cuts a set (floored at min_sets)", () => {
    const out = prescribe(
      baseInputs({
        exerciseFeedback: { jointPain: 0, pump: 5, workload: 9 },
      }),
      params,
    );
    expect(out.sets).toBe(2);
    expect(out.rationale).toMatch(/set removed/);
  });

  it("easy workload with strong pump + gain goal adds a set under the ceiling", () => {
    const out = prescribe(
      baseInputs({
        exerciseFeedback: { jointPain: 0, pump: 7, workload: 2 },
        muscleGroupWeeklySets: 10,
      }),
      params,
    );
    expect(out.sets).toBe(4);
    expect(out.rationale).toMatch(/set added/);
  });

  it("easy workload without pump corroboration holds volume", () => {
    const out = prescribe(
      baseInputs({
        exerciseFeedback: { jointPain: 0, pump: 3, workload: 2 },
        muscleGroupWeeklySets: 10,
      }),
      params,
    );
    expect(out.sets).toBe(3);
  });

  it("does not add a set at the muscle-group ceiling", () => {
    const out = prescribe(
      baseInputs({
        exerciseFeedback: { jointPain: 0, pump: 7, workload: 2 },
        muscleGroupWeeklySets: 20,
      }),
      params,
    );
    expect(out.sets).toBe(3);
  });

  it("low pump at the right workload flags exercise selection", () => {
    const out = prescribe(
      baseInputs({
        exerciseFeedback: { jointPain: 0, pump: 1, workload: 5 },
      }),
      params,
    );
    expect(out.sets).toBe(3);
    expect(out.weight).toBe(100);
    expect(out.rationale).toMatch(/different exercise/);
  });

  it("a rough session is reported on a held load", () => {
    const out = prescribe(
      baseInputs({
        workoutFeedback: { overallFatigue: 4, effortRating: 2, performanceRating: 3 },
      }),
      params,
    );
    expect(out.weight).toBe(100);
    expect(out.rationale).toMatch(/rough session/);
  });
});

describe("prescribe — determinism", () => {
  it("same inputs and params always produce the same output", () => {
    const a = prescribe(baseInputs(), params);
    const b = prescribe(baseInputs(), params);
    expect(a).toEqual(b);
  });
});

describe("prescribe — no-anchor hold keeps the exact load (R24)", () => {
  it("holds a non-step load verbatim — rounding must not fabricate a +step", () => {
    // 27.5 lb on barbell's 5-lb step used to prescribe 30 while the rationale
    // still read "hold 27.5 lb" — a fabricated +2.5 on the one path whose whole
    // point (T-I3/T-I5) is never inventing numbers.
    const out = prescribe(
      baseInputs({
        previous: { weight: 27.5, reps: 8, sets: 3, targetRir: 3 },
        actualSets: [
          { setNumber: 1, weight: 27.5, reps: 8, rirReported: 3, isWarmup: false },
          { setNumber: 2, weight: 27.5, reps: 8, rirReported: 3, isWarmup: false },
        ],
      }),
      params,
    );
    expect(out.weight).toBe(27.5);
    expect(out.rationale).toMatch(/hold 27\.5 lb/i);
  });
});
