/**
 * Macrocycle planning engine — golden fixtures + property tests
 * (docs/04 §Macrocycle planning, docs/10 §5).
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "../params";
import {
  planMacrocycle,
  spreadPhases,
  suggestMesoLength,
  type MacroProfile,
} from "../macro";

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
    // continuous training-age decay: rate(3yr) = base × e^(−3/5)
    expect(plan.target).toEqual({
      low: 6.5,
      high: 9.8,
      unit: "lb",
      direction: "gain",
    });
    expect(plan.perMonthRate).toEqual({
      low: 1.1,
      high: 1.6,
      unit: "lb",
      direction: "gain",
    });
    expect(plan.recommendedDurationMonths).toBe(6);
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
    // compounding weekly rate on the average (BMI) band over ~13 weeks
    expect(plan.target).toEqual({
      low: 11.3,
      high: 22,
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
    expect(plan.durationMonths).toBe(6);
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

  it("hypertrophy target grows monotonically with duration at every training age", () => {
    // regression for the "static across durations" bug: the old career-cap
    // clamp flattened the target for near-potential lifters (e.g. 13 training
    // years), so 3/6/12-month macros all returned the same number.
    for (const trainingYears of [1, 4, 7, 13]) {
      const profile: MacroProfile = {
        ...intermediateMale,
        bodyweight: 198,
        trainingYears,
        age: 30,
      };
      const highs = [3, 6, 12].map(
        (m) =>
          planMacrocycle(
            { goal: "hypertrophy", profile, durationMonths: m, mesoLengthWeeks: 5 },
            params,
          ).target.high,
      );
      expect(highs[1]).toBeGreaterThan(highs[0]);
      expect(highs[2]).toBeGreaterThan(highs[1]);
    }
  });

  it("hypertrophy decays with training age but stays positive for a 13-yr lifter", () => {
    const plan = (trainingYears: number, months: number) =>
      planMacrocycle(
        {
          goal: "hypertrophy",
          profile: { ...intermediateMale, bodyweight: 198, age: 40, trainingYears },
          durationMonths: months,
          mesoLengthWeeks: 5,
        },
        params,
      ).target.high;
    // a 13-yr trainee gains far less than a 4-yr one over the same window
    expect(plan(13, 12)).toBeLessThan(plan(4, 12));
    // ...but a year still yields a small, non-zero, research-plausible target
    expect(plan(13, 12)).toBeGreaterThan(1);
    expect(plan(13, 12)).toBeLessThan(5);
  });

  it("cut total is bounded by the realistic %BW cap on long durations", () => {
    const profile: MacroProfile = {
      sex: "male",
      age: 30,
      bodyweight: 200,
      bodyweightUnit: "lb",
      heightCm: 175,
      experienceLevel: "intermediate",
      trainingYears: 3,
    };
    const plan = planMacrocycle(
      { goal: "cut", profile, durationMonths: 12, mesoLengthWeeks: 5 },
      params,
    );
    // never project losing more than the capped fraction of bodyweight
    expect(plan.target.high).toBeLessThanOrEqual(
      200 * params.macro_target.cut_cap_pct_bw + 0.05,
    );
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

describe("suggestMesoLength", () => {
  it("picks the block length that divides the macro most evenly", () => {
    expect(suggestMesoLength(6)).toBe(5); // 26 wk → 5×5 (leftover 1)
    expect(suggestMesoLength(12)).toBe(4); // 52 wk → 13×4 (exact)
    expect(suggestMesoLength(5)).toBe(5); // ~21.6 wk → 4×5 (leftover ~1.6)
  });

  it("always returns one of the offered block lengths", () => {
    for (let m = 1; m <= 24; m++) {
      expect([4, 5, 6]).toContain(suggestMesoLength(m));
    }
  });

  it("the suggested length leaves no worse a remainder than any alternative", () => {
    const weeks = (m: number) => m * 4.33;
    const leftover = (w: number, len: number) =>
      Math.abs(w - Math.max(1, Math.round(w / len)) * len);
    for (const m of [3, 4, 6, 8, 9, 12]) {
      const w = weeks(m);
      const chosen = suggestMesoLength(m);
      const best = Math.min(...[4, 5, 6].map((l) => leftover(w, l)));
      expect(leftover(w, chosen)).toBeLessThanOrEqual(best + 1e-9);
    }
  });
});
