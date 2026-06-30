import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS, prescribe } from "../index";
import { baseInputs } from "./helpers";

const params = DEFAULT_ENGINE_PARAMS;

describe("prescribe — performance delta (§3)", () => {
  it("met reps at target RIR with gain goal: load increases by equipment increment", () => {
    const out = prescribe(baseInputs(), params);
    // barbell 5 lb × intermediate 1.0
    expect(out.weight).toBe(105);
    expect(out.sets).toBe(3);
    expect(out.targetRir).toBe(2);
    expect(out.rationale).toMatch(/\+5 lb/);
  });

  it("emits a structured trace the rationale is composed from (P0-4)", () => {
    const out = prescribe(baseInputs(), params);
    expect(out.trace.length).toBeGreaterThan(0);
    // every trace step has a stable rule code + detail
    for (const step of out.trace) {
      expect(typeof step.rule).toBe("string");
      expect(step.detail.length).toBeGreaterThan(0);
    }
    // the load step is what drove the +5 lb increase
    expect(out.trace.some((s) => s.rule === "load")).toBe(true);
    // rationale === the trace details joined, capitalized, terminated
    const composed =
      out.trace.map((s) => s.detail).join("; ").replace(/^./, (c) => c.toUpperCase()) +
      ".";
    expect(out.rationale).toBe(composed);
  });

  it("scales the increment by experience level", () => {
    const out = prescribe(
      baseInputs({ user: { experienceLevel: "beginner" } }),
      params,
    );
    // 5 × 1.5 = +7.5 ⇒ 107.5, rounded to the 5 lb barbell step ⇒ 110
    expect(out.weight).toBe(110);
  });

  it("uses per-equipment lb increments for lb users", () => {
    const out = prescribe(
      baseInputs({ user: { experienceLevel: "intermediate" } }),
      params,
    );
    // barbell lb increment is 5
    expect(out.weight).toBe(105);
    expect(out.rationale).toMatch(/\+5 lb/);
  });

  it("kettlebell steps in kettlebell jumps, not plate math", () => {
    const out = prescribe(
      baseInputs({
        exercise: { equipmentType: "kettlebell", loadType: "external" },
        user: { experienceLevel: "intermediate" },
        previous: { weight: 16, reps: 10, sets: 3, targetRir: 3 },
        actualSets: [
          { setNumber: 1, weight: 16, reps: 10, rirReported: 3, isWarmup: false },
        ],
      }),
      params,
    );
    // 16 + 9 lb kettlebell jump ⇒ 25, rounded to the 9 lb kettlebell step ⇒ 27
    expect(out.weight).toBe(27);
  });

  it("bands progress in coarse band steps", () => {
    const out = prescribe(
      baseInputs({
        exercise: { equipmentType: "bands", loadType: "external" },
        user: { experienceLevel: "intermediate" },
        previous: { weight: 30, reps: 12, sets: 3, targetRir: 3 },
        actualSets: [
          { setNumber: 1, weight: 30, reps: 12, rirReported: 3, isWarmup: false },
        ],
      }),
      params,
    );
    expect(out.weight).toBe(40);
  });

  it("small miss: holds the weight actually achieved", () => {
    const out = prescribe(
      baseInputs({
        actualSets: [
          { setNumber: 1, weight: 100, reps: 7, rirReported: null, isWarmup: false },
        ],
      }),
      params,
    );
    expect(out.weight).toBe(100);
    expect(out.rationale).toMatch(/close miss/);
  });

  it("reps met but at a lower RIR than target: holds load, worded as not a miss (§5.11)", () => {
    const out = prescribe(
      baseInputs({
        // hit the prescribed 8 reps but at 1 RIR vs the 3 RIR target — harder
        // than prescribed, so the load holds; this is NOT a missed-reps set
        actualSets: [
          { setNumber: 1, weight: 100, reps: 8, rirReported: 1, isWarmup: false },
        ],
      }),
      params,
    );
    expect(out.weight).toBe(100);
    expect(out.rationale).toMatch(/hit reps but below target RIR/);
    expect(out.rationale).not.toMatch(/close miss/);
  });

  it("big miss: regresses load by regression_pct", () => {
    const out = prescribe(
      baseInputs({
        actualSets: [
          { setNumber: 1, weight: 100, reps: 4, rirReported: null, isWarmup: false },
        ],
      }),
      params,
    );
    expect(out.weight).toBe(90);
    expect(out.rationale).toMatch(/-10% load/);
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
    expect(out.weight).toBe(105);
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
  it("cut goal holds load when prescription merely met", () => {
    const out = prescribe(baseInputs({ goalType: "cut" }), params);
    expect(out.weight).toBe(100);
    expect(out.rationale).toMatch(/RIR drop/);
  });

  it("cut goal still progresses on clear overperformance", () => {
    const out = prescribe(
      baseInputs({
        goalType: "cut",
        actualSets: [
          { setNumber: 1, weight: 100, reps: 11, rirReported: 3, isWarmup: false },
        ],
      }),
      params,
    );
    expect(out.weight).toBe(105);
  });

  it("maintain goal holds prescriptions stable", () => {
    const out = prescribe(baseInputs({ goalType: "maintain" }), params);
    expect(out.weight).toBe(100);
  });
});

describe("prescribe — feedback modulation (§4, pump/workload 0–10)", () => {
  it("pain at the gate blocks load increases", () => {
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

  it("low pump at the right workload flags exercise selection, not load", () => {
    const out = prescribe(
      baseInputs({
        exerciseFeedback: { jointPain: 0, pump: 1, workload: 5 },
      }),
      params,
    );
    expect(out.sets).toBe(3);
    expect(out.weight).toBe(105);
    expect(out.rationale).toMatch(/different exercise/);
  });

  it("a rough session dampens load increases", () => {
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
