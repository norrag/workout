/**
 * Macrocycle planning engine — golden fixtures + property tests
 * (docs/04 §Macrocycle planning, docs/10 §5).
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS, engineParamsSchema } from "../params";
import {
  planMacrocycle,
  spreadPhases,
  suggestMesoLength,
  type MacroProfile,
} from "../macro";

const params = DEFAULT_ENGINE_PARAMS;

// the v21 macro-target correction (doc 17 §2 / N21), built the same way the
// 20260710000002 migration materializes it
const v21 = engineParamsSchema.parse({
  ...DEFAULT_ENGINE_PARAMS,
  macro_target: {
    ...DEFAULT_ENGINE_PARAMS.macro_target,
    strength_sex_factor: { male: 1.0, female: 1.0 },
    age_taper_floor_strength: 0.7,
    bf_proxy_pct: {
      male: { lean: 10, average: 16, high_bf: 25 },
      female: { lean: 18, average: 26, high_bf: 35 },
    },
  },
});

const intermediateMale: MacroProfile = {
  sex: "male",
  age: 34,
  bodyweight: 198,
  heightIn: 71,
  experienceLevel: "intermediate",
  trainingYears: 3,
  bodyFatPct: null,
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
          heightIn: 70,
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
      heightIn: 69,
      experienceLevel: "intermediate",
      trainingYears: 3,
      bodyFatPct: null,
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

  it("female absolute hypertrophy target scales by the sex factor (research-corrected 0.7, not 0.5)", () => {
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
    // relative gains are ~equal between sexes; the absolute factor (0.7) reflects
    // women's lower lean-mass fraction, not a halved adaptive response
    expect(female.target.high).toBeCloseTo(
      male.target.high * params.macro_target.sex_factor_female,
      1,
    );
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

describe("hypertrophy — FFMI proximity model (when body fat is known)", () => {
  // 6'1" 159 lb 36yo ~16.5% bf, "trained since 2013" but undermuscled (FFMI ~17,
  // below untrained baseline). Calendar training age says elite; body comp says
  // beginner. The proximity model must give him beginner-class gains.
  const undermuscled: MacroProfile = {
    sex: "male",
    age: 36,
    bodyweight: 159,
    heightIn: 73,
    experienceLevel: "intermediate",
    trainingYears: 13,
    bodyFatPct: 16.5,
  };

  it("gives an undermuscled long-time trainee beginner-class gains, not elite", () => {
    const proximity = planMacrocycle(
      { goal: "hypertrophy", profile: undermuscled, durationMonths: 12 },
      params,
    ).target;
    // beginner-class: well above the ~2 lb/yr the training-age model gave
    expect(proximity.high).toBeGreaterThan(20);
    // and far above what the same calendar-age profile gets with body fat unknown
    const trainingAge = planMacrocycle(
      { goal: "hypertrophy", profile: { ...undermuscled, bodyFatPct: null }, durationMonths: 12 },
      params,
    ).target;
    expect(trainingAge.high).toBeLessThan(4); // 13yr decay → elite
    expect(proximity.high).toBeGreaterThan(trainingAge.high * 4);
  });

  it("a lifter near the FFMI ceiling gets minimal gains regardless of training age", () => {
    const jacked: MacroProfile = {
      sex: "male",
      age: 30,
      bodyweight: 200,
      heightIn: 70,
      experienceLevel: "advanced",
      trainingYears: 13,
      bodyFatPct: 10, // FFMI ~25, at the ceiling
    };
    const plan = planMacrocycle(
      { goal: "hypertrophy", profile: jacked, durationMonths: 12 },
      params,
    );
    expect(plan.target.high).toBeLessThan(2);
  });

  it("leaner/more-muscular at equal bodyweight ⇒ slower gains (reads muscle, not weight)", () => {
    const at = (bf: number) =>
      planMacrocycle(
        {
          goal: "hypertrophy",
          profile: {
            sex: "male",
            age: 30,
            bodyweight: 180,
            heightIn: 70,
            experienceLevel: "intermediate",
            trainingYears: 5,
            bodyFatPct: bf,
          },
          durationMonths: 12,
        },
        params,
      ).target.high;
    // higher body fat at same weight = less muscle = more room = faster
    expect(at(28)).toBeGreaterThan(at(20));
    expect(at(20)).toBeGreaterThan(at(10));
  });

  it("cut leanness band uses body fat % when present", () => {
    const cut = (bf: number) =>
      planMacrocycle(
        {
          goal: "cut",
          profile: {
            sex: "male",
            age: 30,
            bodyweight: 200,
            heightIn: 70,
            experienceLevel: "intermediate",
            trainingYears: 3,
            bodyFatPct: bf,
          },
          durationMonths: 2,
        },
        params,
      ).perMonthRate.high;
    // higher-BF band cuts faster than the lean band
    expect(cut(28)).toBeGreaterThan(cut(10));
  });
});

// ---------------------------------------------------------------------------
// doc 17 §2 / v21 — target-engine correction (N21). Everything below is gated
// on the three new macro_target params; with them absent (DEFAULT / every
// pre-v21 row) the plan is byte-identical to before — the golden fixtures
// above run on DEFAULT and pin that.
// ---------------------------------------------------------------------------

describe("v21 §2.1 — strength-path personalization", () => {
  const strengthPlan = (
    p: Partial<MacroProfile>,
    engineParams = v21,
    bucket: MacroProfile["experienceLevel"] = "beginner",
  ) =>
    planMacrocycle(
      {
        goal: "strength",
        profile: {
          sex: "male",
          age: 30,
          bodyweight: 160,
          heightIn: 68,
          experienceLevel: bucket,
          trainingYears: null,
          bodyFatPct: null,
          ...p,
        },
        durationMonths: 4,
        mesoLengthWeeks: 5,
      },
      engineParams,
    );

  it("legacy (v20 params): a 60-yr-old female beginner gets the identical band as an 18-yr-old male", () => {
    // the audited defect — the strength target ignored age and sex entirely
    const older = strengthPlan({ sex: "female", age: 60 }, params);
    const younger = strengthPlan({ sex: "male", age: 18 }, params);
    expect(older.perMonthRate).toEqual(younger.perMonthRate);
    expect(older.target).toEqual(younger.target);
  });

  it("v21: the 60-yr-old's band tapers (×0.7 floor) while the 18-yr-old's doesn't", () => {
    const older = strengthPlan({ sex: "female", age: 60 });
    const younger = strengthPlan({ sex: "male", age: 18 });
    // beginner band [4, 8] × the strength floor 0.7 (1 − 20yr × 0.02 = 0.6 binds below it)
    expect(older.perMonthRate.low).toBeCloseTo(2.8, 5);
    expect(older.perMonthRate.high).toBeCloseTo(5.6, 5);
    expect(younger.perMonthRate.low).toBeCloseTo(4, 5);
    expect(younger.perMonthRate.high).toBeCloseTo(8, 5);
    expect(older.target.high).toBeLessThan(younger.target.high);
  });

  it("v21: sexes are equal at the default factors (strength ≠ hypertrophy 0.7)", () => {
    const female = strengthPlan({ sex: "female", age: 30 });
    const male = strengthPlan({ sex: "male", age: 30 });
    expect(female.perMonthRate).toEqual(male.perMonthRate);
    expect(female.target).toEqual(male.target);
  });

  it("v21: the strength floor binds for high ages (taper never drops below 0.7)", () => {
    const at60 = strengthPlan({ age: 60 });
    const at80 = strengthPlan({ age: 80 });
    expect(at80.perMonthRate).toEqual(at60.perMonthRate);
    expect(at80.strengthRatePctMonth).toEqual(at60.strengthRatePctMonth);
  });

  it("v21: recommendDuration reads the personalized band (older ⇒ longer)", () => {
    const older = planMacrocycle(
      {
        goal: "strength",
        profile: {
          sex: "male",
          age: 60,
          bodyweight: 180,
          heightIn: 70,
          experienceLevel: "intermediate",
          trainingYears: 3,
          bodyFatPct: null,
        },
        mesoLengthWeeks: 5,
      },
      v21,
    );
    const younger = planMacrocycle(
      {
        goal: "strength",
        profile: {
          sex: "male",
          age: 30,
          bodyweight: 180,
          heightIn: 70,
          experienceLevel: "intermediate",
          trainingYears: 3,
          bodyFatPct: null,
        },
        mesoLengthWeeks: 5,
      },
      v21,
    );
    expect(older.recommendedDurationMonths).toBeGreaterThan(
      younger.recommendedDurationMonths,
    );
  });
});

describe("v21 §2.4 — strengthRatePctMonth is exposed goal-independently", () => {
  const profile: MacroProfile = {
    sex: "male",
    age: 60,
    bodyweight: 198,
    heightIn: 71,
    experienceLevel: "intermediate",
    trainingYears: 3,
    bodyFatPct: null,
  };

  it("is present for all four goals and identical across them (profile-only)", () => {
    const bands = (["hypertrophy", "strength", "cut", "maintain"] as const).map(
      (goal) =>
        planMacrocycle({ goal, profile, durationMonths: 4, mesoLengthWeeks: 5 }, v21)
          .strengthRatePctMonth,
    );
    for (const band of bands) {
      expect(band.low).toBeGreaterThan(0);
      expect(band.high).toBeGreaterThan(band.low);
      expect(band).toEqual(bands[0]);
    }
    // intermediate [1.5, 3] × floor-bound 0.7 taper at age 60 — and unrounded
    expect(bands[0].low).toBeCloseTo(1.05, 10);
    expect(bands[0].high).toBeCloseTo(2.1, 10);
  });

  it("falls back to the raw bucket band when the v21 params are absent", () => {
    const plan = planMacrocycle(
      { goal: "hypertrophy", profile, durationMonths: 4, mesoLengthWeeks: 5 },
      params,
    );
    expect(plan.strengthRatePctMonth).toEqual({ low: 1.5, high: 3 });
  });

  it("stays strength-denominated on a mass-goal macro (never lb/mo)", () => {
    const plan = planMacrocycle(
      { goal: "hypertrophy", profile, durationMonths: 4, mesoLengthWeeks: 5 },
      v21,
    );
    // the display band is lb/mo, the pacer carrier is %/mo — different numbers
    expect(plan.perMonthRate.unit).toBe("lb");
    expect(plan.strengthRatePctMonth.low).toBeCloseTo(1.05, 10);
    expect(plan.strengthRatePctMonth.high).toBeCloseTo(2.1, 10);
  });
});

describe("v21 §2.2 — hypertrophy continuity (bf proxy)", () => {
  // male, 5'10" 180 lb ⇒ BMI ≈ 25.8 ⇒ "average" band ⇒ proxy bf 16%
  const base: MacroProfile = {
    sex: "male",
    age: 30,
    bodyweight: 180,
    heightIn: 70,
    experienceLevel: "intermediate",
    trainingYears: 5,
    bodyFatPct: null,
  };
  const high = (p: Partial<MacroProfile>, engineParams = v21) =>
    planMacrocycle(
      {
        goal: "hypertrophy",
        profile: { ...base, ...p },
        durationMonths: 6,
        mesoLengthWeeks: 5,
      },
      engineParams,
    ).target.high;

  it("continuity golden: entering a bf% equal to the proxy moves the target by ≈ 0", () => {
    expect(high({ bodyFatPct: 16 })).toBe(high({ bodyFatPct: null }));
  });

  it("a different bf% moves the target proportionally, never discontinuously", () => {
    // higher bf at equal weight = less muscle = more headroom = faster
    expect(high({ bodyFatPct: 14 })).toBeLessThan(high({ bodyFatPct: null }));
    expect(high({ bodyFatPct: 18 })).toBeGreaterThan(high({ bodyFatPct: null }));
    // the completion step is small — nothing like the old model flip
    const jump = Math.abs(high({ bodyFatPct: 18 }) - high({ bodyFatPct: null }));
    expect(jump).toBeLessThan(high({ bodyFatPct: null }) * 0.25);
  });

  it("the decay path is reserved for profiles missing height/bodyweight", () => {
    // no BMI ⇒ no band ⇒ proxy can't apply; identical to the legacy fallback
    expect(high({ heightIn: null })).toBe(high({ heightIn: null }, params));
  });

  it("legacy (v20 params): bf-unknown still flips to the training-age decay", () => {
    expect(high({}, params)).not.toBe(high({}));
  });
});

describe("v21 §2.3 — cut-band proportional rescale (parameterless)", () => {
  it("the band never collapses when the total cap binds", () => {
    // 12-month cut at high body fat: both raw endpoints exceed cap (25% BW)
    const plan = planMacrocycle(
      {
        goal: "cut",
        profile: {
          sex: "male",
          age: 30,
          bodyweight: 200,
          heightIn: 70,
          experienceLevel: "intermediate",
          trainingYears: 3,
          bodyFatPct: 28,
        },
        durationMonths: 12,
        mesoLengthWeeks: 5,
      },
      params,
    );
    expect(plan.target.high).toBeCloseTo(50, 5); // cap = 200 × 0.25
    // low rescales by cap/high_raw instead of clamping onto the cap
    expect(plan.target.low).toBeLessThan(plan.target.high);
    expect(plan.target.low).toBeCloseTo(37.4, 0);
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
