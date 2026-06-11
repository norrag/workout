import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS, prescribe } from "../index";
import { baseInputs } from "./helpers";

const params = DEFAULT_ENGINE_PARAMS;

describe("prescribe — performance delta (§3)", () => {
  it("met reps at target RIR with gain goal: load increases by equipment increment", () => {
    const out = prescribe(baseInputs(), params);
    // barbell 2.5kg × intermediate 1.0
    expect(out.weight).toBe(102.5);
    expect(out.sets).toBe(3);
    expect(out.targetRir).toBe(2);
    expect(out.rationale).toMatch(/\+2\.5kg/);
  });

  it("scales the increment by experience level", () => {
    const out = prescribe(
      baseInputs({ user: { experienceLevel: "beginner", units: "kg" } }),
      params,
    );
    // 2.5 × 1.5 = +3.75, rounded to the 2.5kg barbell step
    expect(out.weight).toBe(105);
  });

  it("uses lb increments for lb users", () => {
    const out = prescribe(
      baseInputs({ user: { experienceLevel: "intermediate", units: "lb" } }),
      params,
    );
    // 2.5kg base × lb factor 2 = +5lb
    expect(out.weight).toBe(105);
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
    expect(out.weight).toBe(102.5);
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
    expect(out.weight).toBe(102.5);
  });

  it("maintain goal holds prescriptions stable", () => {
    const out = prescribe(baseInputs({ goalType: "maintain" }), params);
    expect(out.weight).toBe(100);
  });
});

describe("prescribe — feedback modulation (§4)", () => {
  it("pain at the gate blocks load increases", () => {
    const out = prescribe(
      baseInputs({
        exerciseFeedback: { jointPain: 2, muscleStrain: 1, pump: 2, fatigue: 1 },
      }),
      params,
    );
    expect(out.weight).toBe(100);
    expect(out.rationale).toMatch(/joint pain/);
  });

  it("high strain with low pump cuts a set (floored at min_sets)", () => {
    const out = prescribe(
      baseInputs({
        exerciseFeedback: { jointPain: 0, muscleStrain: 3, pump: 0, fatigue: 1 },
      }),
      params,
    );
    expect(out.sets).toBe(2);
    expect(out.rationale).toMatch(/volume reduced/);
  });

  it("low fatigue + good pump + gain goal adds a set under the ceiling", () => {
    const out = prescribe(
      baseInputs({
        exerciseFeedback: { jointPain: 0, muscleStrain: 0, pump: 3, fatigue: 0 },
        muscleGroupWeeklySets: 10,
      }),
      params,
    );
    expect(out.sets).toBe(4);
  });

  it("does not add a set at the muscle-group ceiling", () => {
    const out = prescribe(
      baseInputs({
        exerciseFeedback: { jointPain: 0, muscleStrain: 0, pump: 3, fatigue: 0 },
        muscleGroupWeeklySets: 20,
      }),
      params,
    );
    expect(out.sets).toBe(3);
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
