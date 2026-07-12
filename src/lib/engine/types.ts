import { z } from "zod";
import {
  engineParamsSchema,
  equipmentTypes,
  experienceLevels,
  goalTypes,
} from "./params";
import { loadTypes } from "./load";

export const loggedSetInputSchema = z.object({
  setNumber: z.number().int().min(1),
  weight: z.number().min(0),
  reps: z.number().int().min(0),
  rirReported: z.number().int().min(0).max(10).nullable().default(null),
  isWarmup: z.boolean().default(false),
  // immutable identity of the logged set this input came from + its stable
  // position in the source workout (P0-4). `setNumber` alone is not a reliable
  // key — warmup and working sets can both number from 1 — so a decision keyed
  // only by set number showed duplicates (1, 1, 2). The engine ignores these;
  // they make the recorded decision auditable back to the exact rows.
  loggedSetId: z.string().uuid().nullish(),
  sequenceIndex: z.number().int().min(0).nullish(),
});

// fig 1.4: joint pain 0–3 per exercise; pump and workload 0–10 sliders
// scoped to the exercise's muscle group ("just right" workload = 5)
export const exerciseFeedbackInputSchema = z.object({
  jointPain: z.number().int().min(0).max(3).nullable(),
  pump: z.number().int().min(0).max(10).nullable(),
  workload: z.number().int().min(0).max(10).nullable(),
});

// I14 (2026-07-02): session sliders unified onto the per-exercise 0–10 scale.
// Stored rows were rescaled round(x × 2.5) (0→0, 1→3, 2→5, 3→8, 4→10); pre-I14
// decisions replay their own 0–4 inputs, which stay valid under the wider bound.
export const workoutFeedbackInputSchema = z.object({
  overallFatigue: z.number().int().min(0).max(10).nullable(),
  effortRating: z.number().int().min(0).max(10).nullable(),
  performanceRating: z.number().int().min(0).max(10).nullable(),
});

export const prescriptionSchema = z.object({
  weight: z.number().min(0).nullable(),
  reps: z.number().int().min(1).nullable(),
  sets: z.number().int().min(1),
  // 0–8: working weeks ramp 0–3, but a deload prescribes a higher recovery RIR
  // (≈6, anchor-based deload selection) — see engine_params.deload.target_rir.
  targetRir: z.number().int().min(0).max(8),
});

/**
 * Everything `prescribe` needs, assembled by the caller (route handler,
 * MCP tool, admin replay). The engine itself does no I/O.
 */
export const engineInputsSchema = z.object({
  exercise: z.object({
    equipmentType: z.enum(equipmentTypes),
    // T-I2: how the entered weight maps to effective load. Defaults to `external`
    // so inputs built before the bodyweight model parse unchanged; only consulted
    // when `params.bodyweight_model` is on.
    loadType: z.enum(loadTypes).default("external"),
  }),
  user: z.object({
    experienceLevel: z.enum(experienceLevels),
  }),
  goalType: z.enum(goalTypes),
  // the week being generated
  week: z.object({
    // 0–8: a deload week carries the higher recovery RIR (≈6) into prescribe()
    targetRir: z.number().int().min(0).max(8),
    isDeload: z.boolean(),
  }),
  // last week's prescription for this exercise (null in week 1)
  previous: prescriptionSchema.nullable(),
  // what was actually performed against `previous`
  actualSets: z.array(loggedSetInputSchema).default([]),
  exerciseFeedback: exerciseFeedbackInputSchema.nullable().default(null),
  workoutFeedback: workoutFeedbackInputSchema.nullable().default(null),
  // current weekly working sets for the exercise's assigned muscle group.
  // Fractional since R14 (doc 10 §2): sets credit 1.0 per primary + 0.5 per
  // secondary muscle link, so the ceiling gate sees direct-equivalent volume
  // (pre-R14 decisions stored integers — still valid under this schema).
  muscleGroupWeeklySets: z.number().min(0).nullable().default(null),
  // peak (heaviest) working prescription of the meso, for deload sizing
  weekPeak: prescriptionSchema.nullable().default(null),
  // recency-weighted strength anchor (e1RM + its confidence) for rep-window
  // weight selection + RIR grading (doc 13). The caller computes it from history
  // (engine stays pure); null — or a confidence below reps_predict.min_confidence
  // — falls back to the carried-forward plan / increment path.
  strengthAnchor: z
    .object({
      value: z.number().positive(),
      confidence: z.enum(["high", "moderate", "low"]),
      // N45: the winning set behind the anchor — pure provenance, never read by
      // any rule. `.nullish()` with NO default so historical shapes (stored
      // decision inputs, existing literals) parse byte-identically; the anchor
      // is already on the doc-14 §3 derived denylist, so the widened shape is
      // fingerprint-neutral by construction.
      source: z
        .object({
          weight: z.number(),
          reps: z.number(),
          ageDays: z.number(),
          sessionKey: z.string().nullable(),
          performedAt: z.string().nullish(),
        })
        .nullish(),
    })
    .nullable()
    .default(null),
  // plan defaults for cold starts (meso_exercises.initial_*)
  initial: z
    .object({
      weight: z.number().min(0).nullable(),
      reps: z.number().int().min(1).nullable(),
      sets: z.number().int().min(1),
    })
    .nullable()
    .default(null),
  // T-I2: the lifter's current bodyweight (lb), the effective-load base for
  // bodyweight movements (see load.ts). A drifting, DERIVED input — excluded from
  // the freshness fingerprint (doc 14 §3, like strengthAnchor) and refreshed from
  // the live profile on recompute. Null when unknown ⇒ a bodyweight lift defers to
  // a manual seed. Only consulted when `params.bodyweight_model` is on.
  bodyweight: z.number().positive().nullable().default(null),
  // doc 16 §8.2: the progression governors' lookback, assembled by the caller
  // from recent `engine_decisions` (same pattern and doc-14 treatment as the
  // strength anchor: DERIVED — recomputed on read, excluded from the freshness
  // fingerprint, recorded in the decision for replay). Null ⇒ no history: the
  // cadence/pacer/throttle governors are permissive (an athlete's first steps
  // are how the trajectory starts). Only consulted when `params.progression`
  // is active.
  // `.nullish()` with NO default, so parsing inputs that predate the feature
  // injects nothing (stored decision inputs stay byte-identical) and existing
  // input literals keep compiling.
  progressionHistory: z
    .object({
      /** a `stepped` decision already targets the microcycle being generated */
      earnedThisMicrocycle: z.boolean(),
      /** trailing prescribed-e1RM gain, normalized to %/30 days (pacer input) */
      trailing30dPrescribedGainPct: z.number().nullable(),
      /** current run of earned-then-missed cycles, 0 once re-armed (§3.5) */
      consecutiveMissedEarns: z.number().int().min(0),
    })
    .nullish(),
  // doc 17 §3 (N37): the profile-personalized monthly strength band the
  // macro-rate pacer reads under `rate_source: "plan"` — `planMacrocycle`'s
  // `strengthRatePctMonth`, evaluated in the queries layer at the same sites as
  // `progressionHistory` (generation/advance/recompute/replay; standalone mesos
  // under the hypertrophy default). Strength-denominated for EVERY goal — the
  // per-goal `goal_rate_factor` composes on top in the pacer, never here.
  // DERIVED (doc 14 §3 denylist): depends on bodyweight/bf%/age, none of which
  // are config dimensions — excluded from the freshness fingerprint (a routine
  // bodyweight edit must not churn open rows), recorded in the decision for
  // replay (the recorded rate replays frozen). Null ⇒ no plan rate: the pacer
  // degrades to the bucket band (`"band"`), never to unpaced.
  // `.nullish()` with NO default, so inputs that predate the feature parse
  // byte-identically and existing input literals keep compiling.
  planStrengthRate: z
    .object({ low: z.number(), high: z.number() })
    .nullish(),
  // doc 17 §7 (N36): the envelope loop's per-USER band position — where within
  // the macro rate band the pacer targets (0 = floor, 1 = top). A pure fold
  // over the trailing completed mesos' demand-side outcomes, assembled in the
  // queries layer (queries/envelope.ts → rules/envelope.ts) at the same sites
  // as `progressionHistory`; constant for the whole meso being generated
  // (updates land at meso boundaries only, by construction). DERIVED (doc 14
  // §3 denylist): recorded decisions are its only source — excluded from the
  // freshness fingerprint, recorded in the decision for replay (the recorded
  // position replays frozen; position history is reconstructible from the
  // decisions that consumed it). Null/absent ⇒ loop off: the pacer reads the
  // fixed params `progression.band_position`, byte-identical to today.
  // `.nullish()` with NO default, so inputs that predate the feature parse
  // byte-identically and existing input literals keep compiling.
  bandPosition: z.number().min(0).max(1).nullish(),
  // doc 16 §3.4 staleness gate: days since the source session was performed,
  // caller-supplied (the engine is clockless). DERIVED like the anchor — at
  // normal advance-at-completion it is ~0; a catch-up run or freshness
  // recompute after a layoff correctly disarms the earn. Null ⇒ unknown ⇒
  // the gate passes (the advance chain always supplies it).
  daysSincePreviousSession: z.number().min(0).nullish(),
  // doc 16 §3.7 — the SEED route's earn context: the prior meso's final WORKING
  // session (its prescription + what was performed against it + its feedback),
  // assembled by the caller exactly like the advance chain's inputs, so an earn
  // at meso close carries across the deload boundary into the next seed.
  // DERIVED (doc 14 §3 denylist): excluded from the freshness fingerprint,
  // recorded in the seed decision for replay. `.nullish()` with NO default —
  // absent on every input that predates the feature (stored decision inputs
  // parse byte-identically) and on swaps/cold starts, which have no compliance
  // context and therefore never earn (§3.7). Only consulted by `seedMeso` while
  // `params.progression` is active; `prescribe` ignores it.
  seedEarn: z
    .object({
      /** the final working session's prescription (the compliance target) */
      previous: prescriptionSchema,
      /** what was actually performed against it */
      actualSets: z.array(loggedSetInputSchema),
      exerciseFeedback: exerciseFeedbackInputSchema.nullable(),
      workoutFeedback: workoutFeedbackInputSchema.nullable(),
    })
    .nullish(),
});

export type EngineInputs = z.infer<typeof engineInputsSchema>;
export type LoggedSetInput = z.infer<typeof loggedSetInputSchema>;
export type PrescriptionBase = z.infer<typeof prescriptionSchema>;
/** doc 16 §3.7 — the seed route's caller-assembled earn context. */
export type SeedEarnContext = NonNullable<EngineInputs["seedEarn"]>;

/**
 * One structured step in the engine's reasoning (P0-4). The human `rationale`
 * is derived from these on the autoregulation path, so the trace and the prose
 * can never drift; `rule` is a stable code (performance, feedback, load, rir,
 * deload, seed, cold_start) callers can group/filter on.
 */
export interface DecisionTraceStep {
  rule: string;
  detail: string;
  /**
   * doc 16 §3.6 — the `progression` rule's structured payload (absent on every
   * other rule). Additive JSONB inside the recorded decision output; the
   * always-on status-coded step is what makes cadence/pacer behavior auditable
   * (`stepped | vanished | paced | not_earned`).
   */
  status?: string;
  /** the intended quantum δ in e1RM space (lb) */
  deltaTarget?: number | null;
  /** the realized (post-rounding) ask above the unearned prescription (lb) */
  deltaRealized?: number | null;
  /** which governor skipped an earned step (`paced` only) */
  governor?: string;
  /** the first failing gate predicate (`not_earned` only) */
  predicate?: string;
  /** the prescription-basis anchor A* recorded for the day view (`stepped` only) */
  targetAnchor?: number;
}

export interface Prescription extends PrescriptionBase {
  /** human-readable explanation surfaced in the UI and over MCP */
  rationale: string;
  /** structured reasoning the rationale is composed from */
  trace: DecisionTraceStep[];
}

export type EngineParams = z.infer<typeof engineParamsSchema>;
