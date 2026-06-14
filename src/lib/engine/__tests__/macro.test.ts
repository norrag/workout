/**
 * Macrocycle planning engine — golden fixtures + property tests
 * (docs/04 §Macrocycle planning, docs/10 §5).
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "../params";
import { planMacrocycle, spreadPhases, type MacroProfile } from "../macro";

const params = DEFAULT_ENGINE_PARAMS;

const intermediateMale: MacroProfile = {
  sex: "male",
  age: 34,
  bodyweight: 198,
  bodyweightUnit: "lb",
  heightCm: 180,
  experienceLevel: "intermediate",
  trainingYears: 3,
};

describe("planMacrocycle — golden plans", () => {
  it("hypertrophy, intermediate male, 198 lb, 6 mo / 5-wk blocks", () => {
    const plan = planMacrocycle(
      {
        goal: "hypertrophy",
        profile: intermediateMale,
        durationMonths: 6,
        mesoLengthWeeks: 5,
      },
      params,
    );
    expect(plan.target).toEqual({
      low: 5.9,
      high: 11.9,
      unit: "lb",
      direction: "gain",
    });
    expect(plan.perMonthRate).toEqual({
      low: 1.0,
      high: 2.0,
      unit: "lb",
      direction: "gain",
    });
    expect(plan.recommendedDurationMonths).toBe(5);
    expect(plan.durationMonths).toBe(6);
    expect(plan.mesoCount).toBe(5);
    expect(plan.phases).toEqual([
      "accumulation",
      "accumulation",
      "intensification",
      "intensification",
      "peak",
    ]);
    expect(plan.estimate).toBe(true);
    expect(plan.rationale).toMatch(/estimate/i);
  });

  it("strength compounds monthly and is capped", () => {
    const plan = planMacrocycle(
      {
        goal: "strength",
        profile: intermediateMale,
        durationMonths: 6,
        mesoLengthWeeks: 5,
      },
      params,
    );
    expect(plan.target).toEqual({
      low: 9.3,
      high: 19.4,
      unit: "%",
      direction: "gain",
    });
    // per-month rate is the monthly band, not total ÷ months (compounding)
    expect(plan.perMonthRate).toEqual({
      low: 1.5,
      high: 3,
      unit: "%",
      direction: "gain",
    });
    expect(plan.recommendedDurationMonths).toBe(4);
  });

  it("cut scales by leanness (BMI proxy) and reads as a loss", () => {
    const plan = planMacrocycle(
      {
        goal: "cut",
        profile: {
          sex: "male",
          age: 30,
          bodyweight: 180,
          bodyweightUnit: "lb",
          heightCm: 178,
          experienceLevel: "intermediate",
          trainingYears: 3,
        },
        durationMonths: 3,
        mesoLengthWeeks: 5,
      },
      params,
    );
    expect(plan.target).toEqual({
      low: 11.7,
      high: 23.4,
      unit: "lb",
      direction: "loss",
    });
    expect(plan.perMonthRate.direction).toBe("loss");
    expect(plan.mesoCount).toBe(2);
    expect(plan.phases).toEqual(["accumulation", "intensification"]);
  });

  it("maintain has no weight target", () => {
    const plan = planMacrocycle(
      { goal: "maintain", profile: intermediateMale, mesoLengthWeeks: 5 },
      params,
    );
    expect(plan.target.low).toBe(0);
    expect(plan.target.high).toBe(0);
    expect(plan.target.direction).toBe("none");
    // duration falls back to the recommendation when omitted
    expect(plan.durationMonths).toBe(plan.recommendedDurationMonths);
  });

  it("uses the recommended duration when none is supplied", () => {
    const plan = planMacrocycle(
      { goal: "hypertrophy", profile: intermediateMale, mesoLengthWeeks: 5 },
      params,
    );
    expect(plan.durationMonths).toBe(plan.recommendedDurationMonths);
    expect(plan.durationMonths).toBe(5);
  });
});

describe("planMacrocycle — properties", () => {
  it("targets are non-negative, ordered, and always estimates", () => {
    for (const goal of ["hypertrophy", "strength", "cut", "maintain"] as const) {
      for (const months of [2, 4, 6, 9, 12]) {
        const plan = planMacrocycle(
          {
            goal,
            profile: intermediateMale,
            durationMonths: months,
            mesoLengthWeeks: 5,
          },
          params,
        );
        expect(plan.target.low).toBeGreaterThanOrEqual(0);
        expect(plan.target.high).toBeGreaterThanOrEqual(plan.target.low);
        expect(plan.mesoCount).toBeGreaterThanOrEqual(1);
        expect(plan.phases).toHaveLength(plan.mesoCount);
        expect(plan.estimate).toBe(true);
      }
    }
  });

  it("hypertrophy target grows monotonically with duration (cap permitting)", () => {
    const profile: MacroProfile = {
      ...intermediateMale,
      bodyweight: 170,
      trainingYears: 1,
      age: 25,
    };
    const highs = [3, 6, 9].map(
      (m) =>
        planMacrocycle(
          { goal: "hypertrophy", profile, durationMonths: m, mesoLengthWeeks: 5 },
          params,
        ).target.high,
    );
    expect(highs[1]).toBeGreaterThan(highs[0]);
    expect(highs[2]).toBeGreaterThan(highs[1]);
  });

  it("female absolute hypertrophy target is ~half the male one", () => {
    const base: MacroProfile = {
      ...intermediateMale,
      bodyweight: 150,
      age: 25,
      trainingYears: 2,
    };
    const male = planMacrocycle(
      { goal: "hypertrophy", profile: { ...base, sex: "male" }, durationMonths: 4, mesoLengthWeeks: 5 },
      params,
    );
    const female = planMacrocycle(
      { goal: "hypertrophy", profile: { ...base, sex: "female" }, durationMonths: 4, mesoLengthWeeks: 5 },
      params,
    );
    expect(female.target.high * 2).toBeCloseTo(male.target.high, 1);
  });

  it("hypertrophy target scales down with training experience", () => {
    const highs = (["beginner", "intermediate", "advanced"] as const).map(
      (experienceLevel) =>
        planMacrocycle(
          {
            goal: "hypertrophy",
            profile: {
              ...intermediateMale,
              bodyweight: 180,
              age: 25,
              trainingYears: null,
              experienceLevel,
            },
            durationMonths: 6,
            mesoLengthWeeks: 5,
          },
          params,
        ).target.high,
    );
    expect(highs[0]).toBeGreaterThan(highs[1]);
    expect(highs[1]).toBeGreaterThan(highs[2]);
  });

  it("per-month rate × duration ≈ total target for weight goals", () => {
    for (const goal of ["hypertrophy", "cut"] as const) {
      const plan = planMacrocycle(
        { goal, profile: intermediateMale, durationMonths: 6, mesoLengthWeeks: 5 },
        params,
      );
      expect(plan.perMonthRate.high * 6).toBeCloseTo(plan.target.high, 0);
      expect(plan.perMonthRate.low * 6).toBeCloseTo(plan.target.low, 0);
    }
  });
});

describe("spreadPhases", () => {
  const plan = params.phase_plan;
  it("spreads accumulate → intensify → peak", () => {
    expect(spreadPhases(1, plan)).toEqual(["accumulation"]);
    expect(spreadPhases(2, plan)).toEqual(["accumulation", "intensification"]);
    expect(spreadPhases(3, plan)).toEqual([
      "accumulation",
      "intensification",
      "peak",
    ]);
    expect(spreadPhases(4, plan)).toEqual([
      "accumulation",
      "accumulation",
      "intensification",
      "peak",
    ]);
    expect(spreadPhases(6, plan)).toEqual([
      "accumulation",
      "accumulation",
      "accumulation",
      "intensification",
      "intensification",
      "peak",
    ]);
  });

  it("the last meso peaks once there are three or more", () => {
    for (let n = 3; n <= 8; n++) {
      expect(spreadPhases(n, plan).at(-1)).toBe("peak");
    }
  });
});
