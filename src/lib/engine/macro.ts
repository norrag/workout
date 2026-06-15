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
  /** years since `training_since`; weak fallback proxy when body comp is unknown */
  trainingYears: z.number().min(0).nullable().default(null),
  /** estimated body-fat %; with height+weight gives FFMI (proximity to potential) */
  bodyFatPct: z.number().min(2).max(70).nullable().default(null),
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

function kgToUnit(kg: number, unit: WeightUnit): number {
  return unit === "lb" ? kg * LB_PER_KG : kg;
}

type Sex = "male" | "female";
function sexKey(profile: MacroProfile): Sex {
  return profile.sex === "female" ? "female" : "male";
}

/**
 * Muscular development from body composition: normalized FFMI vs the genetic
 * ceiling. `fraction` is 0 at the untrained baseline → 1 at the ceiling;
 * `remainingLb` is the muscle left to the ceiling in the user's unit. Returns
 * null when body fat or height is unknown (caller falls back to training age).
 */
function muscularDevelopment(
  profile: MacroProfile,
  mt: EngineParams["macro_target"],
): { fraction: number; remainingLb: number } | null {
  if (
    profile.bodyFatPct == null ||
    profile.heightCm == null ||
    profile.bodyweight == null
  ) {
    return null;
  }
  const hM = profile.heightCm / 100;
  if (hM <= 0) return null;
  const bwKg = toKg(profile.bodyweight, profile.bodyweightUnit);
  const ffmKg = bwKg * (1 - profile.bodyFatPct / 100);
  const ffmi = ffmKg / (hM * hM);
  // normalize to 1.83 m so the ceiling/baseline are height-independent
  const ffmiNorm = ffmi + 6.1 * (1.83 - hM);
  const sex = sexKey(profile);
  const ceiling = mt.ffmi_ceiling[sex];
  const untrained = mt.ffmi_untrained[sex];
  const fraction = clamp((ffmiNorm - untrained) / (ceiling - untrained), 0, 1);
  // remaining FFM to the ceiling, de-normalized back to the user's actual height
  const ceilingActual = ceiling - 6.1 * (1.83 - hM);
  const remainingKg = Math.max(0, ceilingActual * hM * hM - ffmKg);
  return { fraction, remainingLb: kgToUnit(remainingKg, profile.bodyweightUnit) };
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

/**
 * Suggest the mesocycle length (weeks) that divides a macro duration most
 * evenly — the block size whose whole-number count leaves the least leftover.
 * Ties break toward the canonical 5-week block, then the shorter block.
 * (fig 2.3 — the create engine pre-selects this; the user can still override.)
 */
export function suggestMesoLength(
  durationMonths: number,
  options: readonly number[] = [4, 5, 6],
): number {
  const weeks = durationMonths * WEEKS_PER_MONTH;
  let best = options[0];
  let bestScore = Infinity;
  for (const len of options) {
    const count = Math.max(1, Math.round(weeks / len));
    const leftover = Math.abs(weeks - count * len);
    // small tie-breakers: prefer closeness to a 5-week block, then shorter
    const score = leftover + Math.abs(len - 5) * 0.05 + len * 0.001;
    if (score < bestScore) {
      bestScore = score;
      best = len;
    }
  }
  return best;
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
    // compound on the shrinking bodyweight so long cuts decelerate, then cap
    // total loss at a realistic fraction of bodyweight (no fat floor in profile)
    const lossFor = (pctWeek: number) =>
      bw * (1 - Math.pow(1 - pctWeek / 100, weeks));
    const cap = bw * mt.cut_cap_pct_bw;
    const high = Math.min(lossFor(rate[1]), cap);
    const low = Math.min(lossFor(rate[0]), high);
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

  // hypertrophy — rate is driven by proximity to genetic potential (FFMI) when
  // body comp is known, else by training-age decay. The target scales with
  // duration and is capped at a fraction of remaining potential so long blocks
  // (and very undermuscled lifters) stay realistic.
  const rate = hypertrophyRate(profile, bucket, mt);
  const sf = sexFactor(profile, mt);
  const am = ageMultiplier(profile.age, mt);
  let low = bw * (rate.low / 100) * months * sf * am;
  let high = bw * (rate.high / 100) * months * sf * am;
  if (rate.remainingLb != null) {
    const cap = mt.proximity_macro_cap_frac * rate.remainingLb;
    high = Math.min(high, cap);
    low = Math.min(low, high);
  }

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

/**
 * Hypertrophy %BW/month band. Primary: proximity to potential (FFMI) — rate =
 * floor + (base − floor)·(1 − developedFraction), so an undermuscled lifter
 * gains fast regardless of calendar training age (the "trained since 2013 but
 * never grew" case). Fallback when body comp is unknown: training-age decay
 * `base × e^(−T/tau)`. `remainingLb` is non-null only in the proximity path.
 */
function hypertrophyRate(
  profile: MacroProfile,
  bucket: ExperienceBucket,
  mt: EngineParams["macro_target"],
): { low: number; high: number; remainingLb: number | null } {
  const dev = muscularDevelopment(profile, mt);
  if (dev) {
    const base = mt.hypertrophy_base_pct_bw_month;
    const floor = mt.hypertrophy_floor_pct_bw_month;
    const headroom = 1 - dev.fraction;
    return {
      low: floor.low + (base.low - floor.low) * headroom,
      high: floor.high + (base.high - floor.high) * headroom,
      remainingLb: dev.remainingLb,
    };
  }
  const years = profile.trainingYears ?? assumedYears(bucket);
  const decay = Math.exp(-years / mt.hypertrophy_decay_tau_years);
  return {
    low: mt.hypertrophy_base_pct_bw_month.low * decay,
    high: mt.hypertrophy_base_pct_bw_month.high * decay,
    remainingLb: null,
  };
}

function leannessBand(
  profile: MacroProfile,
  mt: EngineParams["macro_target"],
): "high_bf" | "average" | "lean" {
  // prefer measured body-fat % when known; else fall back to the BMI proxy
  if (profile.bodyFatPct != null) {
    const t = mt.cut_bf_thresholds[sexKey(profile)];
    if (profile.bodyFatPct >= t.high) return "high_bf";
    if (profile.bodyFatPct < t.lean) return "lean";
    return "average";
  }
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
  const rate = hypertrophyRate(profile, bucket, mt);
  const sf = sexFactor(profile, mt);
  const am = ageMultiplier(profile.age, mt);
  const monthlyMid = bw * ((rate.low + rate.high) / 2 / 100) * sf * am;
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
