/**
 * Macrocycle planning engine (figs 2.2/2.3) — pure and parameterized like
 * `prescribe`. No I/O, no `Date.now()`; all rate tables / coefficients come
 * from `engine_params.macro_target` + `phase_plan` (docs/04 §Macrocycle
 * planning, defaults + evidence in docs/10 §5).
 *
 * `planMacrocycle` ingests the full profile, returns a realistic target range,
 * a per-month rate, a recommended timeframe, the number of evenly-spaced
 * mesocycles that fit, and their suggested phases. Targets are always
 * presented as **estimates** (10 §9 honesty guardrails).
 */
import { z } from "zod";
import {
  engineParamsSchema,
  experienceLevels,
  macroGoalTypes,
  phaseNames,
  type EngineParams,
} from "./params";

const LB_PER_KG = 2.2046226218;
const WEEKS_PER_MONTH = 4.33;

export type MacroGoal = (typeof macroGoalTypes)[number];
export type PhaseName = (typeof phaseNames)[number];
export type TargetDirection = "gain" | "loss" | "none";
export type WeightUnit = "kg" | "lb";

export const macroProfileSchema = z.object({
  sex: z
    .enum(["female", "male", "other", "undisclosed"])
    .nullable()
    .default(null),
  age: z.number().positive().nullable().default(null),
  /** bodyweight in `bodyweightUnit` */
  bodyweight: z.number().positive().nullable().default(null),
  bodyweightUnit: z.enum(["kg", "lb"]).default("lb"),
  heightCm: z.number().positive().nullable().default(null),
  experienceLevel: z.enum(experienceLevels).nullable().default(null),
  /** years since `training_since`; proxy for proximity to genetic potential */
  trainingYears: z.number().min(0).nullable().default(null),
});

export const macroPlanInputSchema = z.object({
  goal: z.enum(macroGoalTypes),
  profile: macroProfileSchema,
  /** omitted ⇒ the engine recommends one */
  durationMonths: z.number().positive().nullable().default(null),
  mesoLengthWeeks: z.number().int().min(3).max(8).default(5),
});

export type MacroProfile = z.infer<typeof macroProfileSchema>;
export type MacroPlanInput = z.infer<typeof macroPlanInputSchema>;
/** caller-facing shape: defaulted fields (durationMonths, mesoLengthWeeks…) optional */
export type MacroPlanArgs = z.input<typeof macroPlanInputSchema>;

export interface MacroRange {
  low: number;
  high: number;
  unit: WeightUnit | "%";
  direction: TargetDirection;
}

export interface MacroPlan {
  /** realistic total goal over the (chosen or recommended) duration */
  target: MacroRange;
  /** target ÷ duration for weight goals; the monthly band for strength */
  perMonthRate: MacroRange;
  /** the engine's suggested timeframe for this goal + profile */
  recommendedDurationMonths: number;
  /** the duration actually used (the user's choice, else the recommendation) */
  durationMonths: number;
  /** evenly-spaced mesocycles that fit the duration */
  mesoCount: number;
  /** suggested phase per mesocycle position (index 0 = M1) */
  phases: PhaseName[];
  /** always true — every target is a model-based estimate (10 §9) */
  estimate: true;
  rationale: string;
}

type ExperienceBucket = "beginner" | "intermediate" | "advanced";

/** experience bucket: training age leads, falling back to the self-reported level */
function bucketFor(profile: MacroProfile): ExperienceBucket {
  if (profile.trainingYears != null) {
    if (profile.trainingYears < 1) return "beginner";
    if (profile.trainingYears < 4) return "intermediate";
    return "advanced";
  }
  return profile.experienceLevel ?? "intermediate";
}

/** assumed career training years when `training_since` is unknown */
function assumedYears(bucket: ExperienceBucket): number {
  return bucket === "beginner" ? 0.5 : bucket === "intermediate" ? 2.5 : 6;
}

function sexFactor(profile: MacroProfile, mt: EngineParams["macro_target"]): number {
  return profile.sex === "female" ? mt.sex_factor_female : 1;
}

/** older lifters scale toward the conservative end of the rate band */
function ageMultiplier(
  age: number | null,
  mt: EngineParams["macro_target"],
): number {
  if (!mt.age_taper || age == null || age <= mt.age_taper_start) return 1;
  return Math.max(
    mt.age_taper_floor,
    1 - (age - mt.age_taper_start) * mt.age_taper_per_year,
  );
}

function toKg(weight: number, unit: WeightUnit): number {
  return unit === "lb" ? weight / LB_PER_KG : weight;
}

function lbToUnit(lb: number, unit: WeightUnit): number {
  return unit === "lb" ? lb : lb / LB_PER_KG;
}

function bmiOf(profile: MacroProfile): number | null {
  if (profile.bodyweight == null || profile.heightCm == null) return null;
  const kg = toKg(profile.bodyweight, profile.bodyweightUnit);
  const m = profile.heightCm / 100;
  if (m <= 0) return null;
  return kg / (m * m);
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x));

/**
 * Spread phases across `count` positions: a leading run of accumulation, then
 * intensification, then a single peak (only once there are ≥3 mesos).
 */
export function spreadPhases(
  count: number,
  plan: EngineParams["phase_plan"],
): PhaseName[] {
  const [acc, intensify, peak] = plan.order;
  if (count <= 0) return [];
  if (count === 1) return [acc];
  if (count === 2) return [acc, intensify];
  const peakN = 1;
  const accN = Math.max(1, Math.round((count - peakN) * plan.accumulation_fraction));
  const intN = count - peakN - accN;
  return [
    ...Array<PhaseName>(accN).fill(acc),
    ...Array<PhaseName>(Math.max(0, intN)).fill(intensify),
    ...Array<PhaseName>(peakN).fill(peak),
  ];
}

interface Computed {
  target: MacroRange;
  perMonthRate: MacroRange;
  recommendedDurationMonths: number;
}

export function planMacrocycle(
  rawInput: MacroPlanArgs,
  rawParams: EngineParams,
): MacroPlan {
  const { goal, profile, durationMonths, mesoLengthWeeks } =
    macroPlanInputSchema.parse(rawInput);
  const params = engineParamsSchema.parse(rawParams);
  const mt = params.macro_target;
  const bucket = bucketFor(profile);

  // recommended timeframe first; it backstops an omitted duration
  const recommended = recommendDuration(goal, profile, bucket, mt);
  const months = durationMonths ?? recommended;

  const computed = computeTarget(goal, profile, bucket, months, mt);
  // never let an explicit duration drop the recommendation below itself
  computed.recommendedDurationMonths = recommended;

  const mesoCount = Math.max(
    1,
    Math.floor((months * WEEKS_PER_MONTH) / mesoLengthWeeks),
  );
  const phases = spreadPhases(mesoCount, params.phase_plan);

  return {
    target: computed.target,
    perMonthRate: computed.perMonthRate,
    recommendedDurationMonths: recommended,
    durationMonths: months,
    mesoCount,
    phases,
    estimate: true,
    rationale: composeRationale(goal, bucket, profile, months, computed.target),
  };
}

function unitOf(profile: MacroProfile): WeightUnit {
  return profile.bodyweightUnit;
}

function computeTarget(
  goal: MacroGoal,
  profile: MacroProfile,
  bucket: ExperienceBucket,
  months: number,
  mt: EngineParams["macro_target"],
): Computed {
  const unit = unitOf(profile);

  if (goal === "maintain") {
    const zero: MacroRange = { low: 0, high: 0, unit, direction: "none" };
    return { target: zero, perMonthRate: zero, recommendedDurationMonths: months };
  }

  if (goal === "strength") {
    const rate = mt.strength_pct_month[bucket];
    const cap = mt.strength_cap_total_pct[bucket];
    const compound = (r: number) => (Math.pow(1 + r / 100, months) - 1) * 100;
    const low = Math.min(compound(rate[0]), cap);
    const high = Math.min(compound(rate[1]), cap);
    return {
      target: { low: round1(low), high: round1(high), unit: "%", direction: "gain" },
      // strength is compounding, so the per-month rate is the band itself
      perMonthRate: {
        low: round1(rate[0]),
        high: round1(rate[1]),
        unit: "%",
        direction: "gain",
      },
      recommendedDurationMonths: months,
    };
  }

  // hypertrophy + cut both need bodyweight
  if (profile.bodyweight == null) {
    const zero: MacroRange = {
      low: 0,
      high: 0,
      unit,
      direction: goal === "cut" ? "loss" : "gain",
    };
    return { target: zero, perMonthRate: zero, recommendedDurationMonths: months };
  }
  const bw = profile.bodyweight;

  if (goal === "cut") {
    const band = leannessBand(profile, mt);
    const rate = mt.cut_pct_bw_week[band];
    const weeks = months * WEEKS_PER_MONTH;
    const low = bw * (rate[0] / 100) * weeks;
    const high = bw * (rate[1] / 100) * weeks;
    return {
      target: { low: round1(low), high: round1(high), unit, direction: "loss" },
      perMonthRate: {
        low: round1(low / months),
        high: round1(high / months),
        unit,
        direction: "loss",
      },
      recommendedDurationMonths: months,
    };
  }

  // hypertrophy
  const rate = mt.hypertrophy_pct_bw_month[bucket];
  const sf = sexFactor(profile, mt);
  const am = ageMultiplier(profile.age, mt);
  let low = bw * (rate[0] / 100) * months * sf * am;
  let high = bw * (rate[1] / 100) * months * sf * am;

  // career cap: remaining lean-mass potential decays with training age
  const capLb = profile.sex === "female" ? mt.career_cap_lb.female : mt.career_cap_lb.male;
  const years = profile.trainingYears ?? assumedYears(bucket);
  const gainedFraction = 1 - Math.exp(-years / mt.career_tau_years);
  const remaining = lbToUnit(capLb, unit) * (1 - gainedFraction);
  high = Math.min(high, remaining);
  low = Math.min(low, high);

  return {
    target: { low: round1(low), high: round1(high), unit, direction: "gain" },
    perMonthRate: {
      low: round1(low / months),
      high: round1(high / months),
      unit,
      direction: "gain",
    },
    recommendedDurationMonths: months,
  };
}

function leannessBand(
  profile: MacroProfile,
  mt: EngineParams["macro_target"],
): "high_bf" | "average" | "lean" {
  const bmi = bmiOf(profile);
  if (bmi == null) return "average";
  if (bmi >= mt.cut_bmi_high) return "high_bf";
  if (bmi < mt.cut_bmi_lean) return "lean";
  return "average";
}

/** months to reach a "meaningful but realistic" target for the goal + profile */
function recommendDuration(
  goal: MacroGoal,
  profile: MacroProfile,
  bucket: ExperienceBucket,
  mt: EngineParams["macro_target"],
): number {
  const lo = mt.recommend_min_months;
  const hi = mt.recommend_max_months;

  if (goal === "maintain") return clamp(3, lo, hi);

  if (goal === "strength") {
    const rate = mt.strength_pct_month[bucket];
    const avg = (rate[0] + rate[1]) / 2;
    const months =
      Math.log(1 + mt.recommend_strength_total_pct / 100) /
      Math.log(1 + avg / 100);
    return clamp(Math.round(months), lo, hi);
  }

  if (profile.bodyweight == null) return clamp(6, lo, hi);
  const bw = profile.bodyweight;

  if (goal === "cut") {
    const band = leannessBand(profile, mt);
    const rate = mt.cut_pct_bw_week[band];
    const weeks = mt.recommend_cut_bw_pct / rate[0];
    return clamp(Math.round(weeks / WEEKS_PER_MONTH), lo, hi);
  }

  // hypertrophy: months to reach the recommended absolute gain at the mid rate
  const rate = mt.hypertrophy_pct_bw_month[bucket];
  const sf = sexFactor(profile, mt);
  const am = ageMultiplier(profile.age, mt);
  const monthlyMid = bw * ((rate[0] + rate[1]) / 2 / 100) * sf * am;
  if (monthlyMid <= 0) return clamp(6, lo, hi);
  const targetLb = profile.sex === "female" ? mt.recommend_target_lb.female : mt.recommend_target_lb.male;
  const target = lbToUnit(targetLb, unitOf(profile));
  return clamp(Math.round(target / monthlyMid), lo, hi);
}

function composeRationale(
  goal: MacroGoal,
  bucket: ExperienceBucket,
  profile: MacroProfile,
  months: number,
  target: MacroRange,
): string {
  const who =
    profile.sex && profile.sex !== "undisclosed" && profile.sex !== "other"
      ? `${bucket} ${profile.sex}`
      : bucket;
  if (goal === "maintain") {
    return `Maintain over ${months} mo — recomposition focus, no weight target (estimate, ${who}).`;
  }
  const unit = target.unit;
  const sign = target.direction === "loss" ? "−" : "+";
  const range =
    target.low === target.high
      ? `${sign}${target.low}${unit === "%" ? "%" : ` ${unit}`}`
      : `${sign}${target.low}–${target.high}${unit === "%" ? "%" : ` ${unit}`}`;
  const label =
    goal === "hypertrophy"
      ? "lean mass"
      : goal === "strength"
        ? "on key lifts"
        : "bodyweight";
  return `${cap(goal)} over ${months} mo: ${range} ${label} (estimate, ${who}).`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
