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
const M_PER_IN = 0.0254;
const WEEKS_PER_MONTH = 4.33;

export type MacroGoal = (typeof macroGoalTypes)[number];
export type PhaseName = (typeof phaseNames)[number];
export type TargetDirection = "gain" | "loss" | "none";
/** The app records weight exclusively in pounds; "%" covers strength targets. */
export type WeightUnit = "lb";

export const macroProfileSchema = z.object({
  sex: z
    .enum(["female", "male", "other", "undisclosed"])
    .nullable()
    .default(null),
  age: z.number().positive().nullable().default(null),
  /** bodyweight in pounds */
  bodyweight: z.number().positive().nullable().default(null),
  /** height in inches */
  heightIn: z.number().positive().nullable().default(null),
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
  /**
   * The §2.1-personalized monthly strength band (%/mo), computed for EVERY
   * goal — it depends only on the profile (doc 17 §2.4). This is the carrier
   * the doc-16 macro-rate pacer reads under `rate_source: "plan"`: a
   * hypertrophy macro paces the *strength* dimension via `goal_rate_factor`,
   * so the source rate must be strength-denominated regardless of the macro's
   * goal (`perMonthRate` is lb/mo for mass goals — the wrong carrier).
   * Unrounded: an engine input, not a display band.
   */
  strengthRatePctMonth: { low: number; high: number };
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

/**
 * Strength-path sex factor (doc 17 §2.1). Relative 1RM gains are ~sex-equal,
 * so v21 seeds {1.0, 1.0}; the param exists as a tunable, distinct from the
 * hypertrophy `sex_factor_female` (lean-mass fraction — never reused here).
 * Param absent (pre-v21 rows) ⇒ 1 (legacy, no factor).
 */
function strengthSexFactor(
  profile: MacroProfile,
  mt: EngineParams["macro_target"],
): number {
  return mt.strength_sex_factor ? mt.strength_sex_factor[sexKey(profile)] : 1;
}

/**
 * Strength-path age taper (doc 17 §2.1): the existing taper slope with the
 * strength-specific floor (default 0.7 > hypertrophy 0.6 — preserved neural
 * adaptation). Gated on `age_taper_floor_strength`: absent (pre-v21 rows) ⇒ 1
 * (legacy — the strength band ignored age entirely).
 */
function ageMultiplierStrength(
  age: number | null,
  mt: EngineParams["macro_target"],
): number {
  if (mt.age_taper_floor_strength == null) return 1;
  if (!mt.age_taper || age == null || age <= mt.age_taper_start) return 1;
  return Math.max(
    mt.age_taper_floor_strength,
    1 - (age - mt.age_taper_start) * mt.age_taper_per_year,
  );
}

/**
 * The personalized monthly strength band. Two models, gated (doc 17 §2.1/§2.7):
 *
 * - v23 (`strength_model` present + enabled) AND body composition readable ⇒
 *   the two-component ADDITIVE model `neural(trainingAge) + k × hypRate_FFM`
 *   (see `twoComponentStrengthRate`), then × sex factor × age taper, clamped to
 *   the ceiling. This replaces the calendar bucket wherever an FFMI can be read.
 * - Otherwise (v23 absent, or v23 present but no body comp) ⇒ the v21 bucket
 *   band × sex factor × age taper. With v21 params also absent this degrades to
 *   the raw bucket band (legacy).
 *
 * Both endpoints scale by the SAME strength sex factor + age taper (doc 17 §2.1,
 * research §4 "applied to the sum"). Unrounded — `MacroPlan.strengthRatePctMonth`
 * carries it to the doc-16 pacer; display paths round on the way out.
 */
function strengthRateBand(
  profile: MacroProfile,
  bucket: ExperienceBucket,
  mt: EngineParams["macro_target"],
): { low: number; high: number } {
  const f =
    strengthSexFactor(profile, mt) * ageMultiplierStrength(profile.age, mt);
  const sm = mt.strength_model;
  if (sm?.enabled) {
    const model = twoComponentStrengthRate(profile, bucket, mt, sm);
    if (model) {
      const ceil = sm.rate_ceiling_pct_month;
      return {
        low: Math.min(model.low * f, ceil),
        high: Math.min(model.high * f, ceil),
      };
    }
    // body comp unreadable ⇒ fall through to the bucket band (graceful degrade)
  }
  const [low, high] = mt.strength_pct_month[bucket];
  return { low: low * f, high: high * f };
}

/**
 * The v23 two-component additive strength rate (research 2026-07-11 §4), BEFORE
 * the sex factor / age taper / ceiling the caller applies:
 *
 *   strengthRate%/mo = neural(effectiveTrainingAge) + k × hypertrophyRate_FFM
 *
 * - hypertrophic term: the N21 proximity rate (`hypertrophyRate`, %BW/mo) re-
 *   expressed as %/mo of FFM (÷ the fat-free fraction) and scaled by the FFM
 *   coupling `k`. An undermuscled long-time lifter gets headroom here, the whole
 *   point of N21 carried to strength.
 * - neural term: a decaying band `N0·e^(−effYears/τ) + floor`, front-loaded and
 *   never exactly zero. Its argument is EFFECTIVE training age — calendar years
 *   discounted toward `undermuscled_unbank` when realized FFM is low (§4).
 *
 * Returns null when body composition can't be read (no FFMI), so the caller
 * degrades to the bucket band — the strength-path mirror of `hypertrophyRate`'s
 * training-age-decay fallback.
 */
function twoComponentStrengthRate(
  profile: MacroProfile,
  bucket: ExperienceBucket,
  mt: EngineParams["macro_target"],
  sm: NonNullable<EngineParams["macro_target"]["strength_model"]>,
): { low: number; high: number } | null {
  const dev = muscularDevelopment(profile, mt);
  if (!dev) return null;
  const bodyFatPct = effectiveBodyFatPct(profile, mt);
  if (bodyFatPct == null) return null; // dev implies a bf%, but stay defensive
  const ffmFraction = 1 - bodyFatPct / 100;
  if (ffmFraction <= 0) return null;

  // hypertrophic component: proximity %BW band → %FFM band × coupling k. `dev`
  // is non-null, so hypertrophyRate takes its proximity branch here.
  const hyp = hypertrophyRate(profile, bucket, mt);
  const k = sm.ffm_coupling_k;
  const hypFfmLow = (hyp.low / ffmFraction) * k;
  const hypFfmHigh = (hyp.high / ffmFraction) * k;

  // neural component: decaying band on EFFECTIVE training age. Un-bank discounts
  // the calendar years toward `unbank` as realized FFM (developed fraction)
  // falls; unbank = 1 leaves calendar years intact.
  const years = profile.trainingYears ?? assumedYears(bucket);
  const effectiveYears =
    years * (sm.undermuscled_unbank + (1 - sm.undermuscled_unbank) * dev.fraction);
  const decay = Math.exp(-effectiveYears / sm.neural_tau_years);
  const neuralLow = sm.neural_n0.low * decay + sm.neural_floor.low;
  const neuralHigh = sm.neural_n0.high * decay + sm.neural_floor.high;

  return { low: neuralLow + hypFfmLow, high: neuralHigh + hypFfmHigh };
}

/** pounds → kilograms, for the FFMI/BMI physics computed in metric. */
function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

/** kilograms → pounds, back to the app's recording unit. */
function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

type Sex = "male" | "female";
function sexKey(profile: MacroProfile): Sex {
  return profile.sex === "female" ? "female" : "male";
}

/**
 * The body-fat % the proximity model runs on (doc 17 §2.2): the measured value
 * when present, else — gated on `bf_proxy_pct` (v21) — a representative bf%
 * for the profile's BMI leanness band. The proxy keeps the model continuous
 * across the "entered a bf%" toggle: completing the field moves the rate
 * proportionally from the band's representative value, never discontinuously
 * to a different model. Null ⇒ no body-comp read at all (decay fallback).
 */
function effectiveBodyFatPct(
  profile: MacroProfile,
  mt: EngineParams["macro_target"],
): number | null {
  if (profile.bodyFatPct != null) return profile.bodyFatPct;
  if (mt.bf_proxy_pct == null) return null;
  if (bmiOf(profile) == null) return null;
  // bodyFatPct is null here, so leannessBand reads the BMI thresholds
  return mt.bf_proxy_pct[sexKey(profile)][leannessBand(profile, mt)];
}

/**
 * Muscular development from body composition: normalized FFMI vs the genetic
 * ceiling. `fraction` is 0 at the untrained baseline → 1 at the ceiling;
 * `remainingLb` is the muscle left to the ceiling in the user's unit. Returns
 * null when body fat (measured or §2.2-proxied) or height is unknown (caller
 * falls back to training age).
 */
function muscularDevelopment(
  profile: MacroProfile,
  mt: EngineParams["macro_target"],
): { fraction: number; remainingLb: number } | null {
  const bodyFatPct = effectiveBodyFatPct(profile, mt);
  if (
    bodyFatPct == null ||
    profile.heightIn == null ||
    profile.bodyweight == null
  ) {
    return null;
  }
  const hM = profile.heightIn * M_PER_IN;
  if (hM <= 0) return null;
  const bwKg = lbToKg(profile.bodyweight);
  const ffmKg = bwKg * (1 - bodyFatPct / 100);
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
  return { fraction, remainingLb: kgToLb(remainingKg) };
}

function bmiOf(profile: MacroProfile): number | null {
  if (profile.bodyweight == null || profile.heightIn == null) return null;
  const kg = lbToKg(profile.bodyweight);
  const m = profile.heightIn * M_PER_IN;
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
    // §2.4: goal-independent — profile-only, so every plan carries the
    // strength-denominated band the doc-16 pacer needs under rate_source "plan"
    strengthRatePctMonth: strengthRateBand(profile, bucket, mt),
    recommendedDurationMonths: recommended,
    durationMonths: months,
    mesoCount,
    phases,
    estimate: true,
    rationale: composeRationale(goal, bucket, profile, months, computed.target),
  };
}

/** The app records weight exclusively in pounds. */
const unit: WeightUnit = "lb";

function computeTarget(
  goal: MacroGoal,
  profile: MacroProfile,
  bucket: ExperienceBucket,
  months: number,
  mt: EngineParams["macro_target"],
): Computed {
  if (goal === "maintain") {
    const zero: MacroRange = { low: 0, high: 0, unit, direction: "none" };
    return { target: zero, perMonthRate: zero, recommendedDurationMonths: months };
  }

  if (goal === "strength") {
    // §2.1: the personalized band (sex factor + age taper with the strength
    // floor); compounding and the total cap are unchanged. With the v21
    // params absent this is the raw bucket band (legacy).
    const rate = strengthRateBand(profile, bucket, mt);
    const cap = mt.strength_cap_total_pct[bucket];
    const compound = (r: number) => (Math.pow(1 + r / 100, months) - 1) * 100;
    const low = Math.min(compound(rate.low), cap);
    const high = Math.min(compound(rate.high), cap);
    return {
      target: { low: round1(low), high: round1(high), unit: "%", direction: "gain" },
      // strength is compounding, so the per-month rate is the band itself
      perMonthRate: {
        low: round1(rate.low),
        high: round1(rate.high),
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
    // §2.3 cut-band guard: when the cap binds the high endpoint, rescale the
    // low endpoint proportionally instead of clamping both to the cap (which
    // collapsed the band to a point on long cuts). Parameterless; when the
    // cap doesn't bind this is byte-identical to the plain min().
    const highRaw = lossFor(rate[1]);
    const lowRaw = lossFor(rate[0]);
    const high = Math.min(highRaw, cap);
    const low = highRaw > cap ? lowRaw * (cap / highRaw) : lowRaw;
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
    // §2.1: recommend off the same personalized band the target compounds on
    const rate = strengthRateBand(profile, bucket, mt);
    const avg = (rate.low + rate.high) / 2;
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
  const target = profile.sex === "female" ? mt.recommend_target_lb.female : mt.recommend_target_lb.male;
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
