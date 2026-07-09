import {
  toEngineEquipment,
  coerceLoadType,
  type EngineInputs,
} from "@/lib/engine";
import type { ProfileRow } from "@/lib/types/database";
import { hashParams } from "./params-provenance";

/**
 * Prescription freshness: dependency fingerprint (doc 14).
 *
 * A stored prescription (`workout_exercises.prescribed_*` / `target_rir`) is a
 * cached derived value — the output of the pure engine on a set of inputs frozen
 * at one moment (a meso seed or a week N→N+1 advance). It becomes WRONG the
 * instant any input that fed it changes and is not recomputed.
 *
 * Rather than make every source hunt down and flag the rows it affects (N fragile
 * contracts, each able to forget a case), each prescription carries a SIGNATURE of
 * the inputs that produced it. On read we re-resolve the inputs as they are *now*
 * and compare; a mismatch means stale. The signature is self-correcting — a source
 * cannot forget to invalidate, because staleness is computed from the live inputs,
 * not from anyone remembering to mark a flag.
 *
 * The signature hashes the engine's *config projection* (doc 14 §3): the cheap,
 * source-changed inputs (equipment, profile, goal, week, previous, plan defaults)
 * plus the engine_params token. The *derived* inputs (logged history: actual sets,
 * feedback, anchors, peaks) are excluded — they come from immutable completed work,
 * so they don't drift mid-view, and a config-triggered recompute refreshes them
 * anyway (doc 14 §6.4).
 *
 * Pure (hard rule #3): this module does no I/O. Resolution of the live values is
 * the query layer's job (`reconcilePrescriptions`); the engine still takes one
 * resolved `EngineInputs` + `EngineParams`.
 */

/**
 * The derived (history-backed) `EngineInputs` fields — EXCLUDED from the freshness
 * signature. A *denylist*, on purpose (doc 14 §3): a newly added *config* input is
 * included by default, so the failure mode is "recompute a touch too eagerly,"
 * never "silently miss a change."
 */
export const DERIVED_INPUT_KEYS = [
  "actualSets",
  "exerciseFeedback",
  "workoutFeedback",
  "muscleGroupWeeklySets",
  "weekPeak",
  "strengthAnchor",
  // T-I2: the lifter's bodyweight is a drifting, derived input (like the anchor) —
  // excluded from the freshness signature so a routine bodyweight change doesn't
  // mass-stale every bodyweight prescription; refreshed from the live profile on
  // recompute (doc 14 §3).
  "bodyweight",
  // doc 16 §8.2: the progression governors' lookback (assembled from recent
  // engine_decisions) and the caller-computed staleness gap — both derived,
  // recomputed on read, recorded in the decision for replay. Excluding them
  // keeps every pre-v20 fingerprint byte-identical; the `progression` params
  // block itself rides `paramsToken` (activation is the intended v-bump).
  "progressionHistory",
  "daysSincePreviousSession",
] as const;

export type DerivedInputKey = (typeof DERIVED_INPUT_KEYS)[number];

/** The config half of `EngineInputs` — everything except the derived fields. */
export type ConfigInputs = Omit<EngineInputs, DerivedInputKey>;

/**
 * Project the full engine inputs onto their config component by removing the
 * known derived fields. Denylist (not allowlist) so a future config field on
 * `EngineInputs` is captured automatically.
 */
export function configProjection(inputs: EngineInputs): ConfigInputs {
  const out: Record<string, unknown> = { ...inputs };
  for (const key of DERIVED_INPUT_KEYS) delete out[key];
  return out as unknown as ConfigInputs;
}

export interface ConfigInputArgs {
  equipmentType: string;
  /** stored `exercises.load_type`; null/omitted ⇒ derived from equipmentType. A
   * config input (model-changing) — IN the fingerprint, so changing an exercise's
   * load type correctly stales its prescriptions. */
  loadType?: string | null;
  profile: Pick<ProfileRow, "experience_level">;
  goal: EngineInputs["goalType"];
  week: EngineInputs["week"];
  previous: EngineInputs["previous"];
  initial: EngineInputs["initial"];
}

/**
 * The single resolver of the config inputs, used at BOTH write and check
 * (doc 14 §3): generation builds `EngineInputs = buildConfigInputs(...) +
 * deriveHistory(...)`, and the freshness check builds `buildConfigInputs(...)`
 * alone. Because both routes go through this one function, the config projection
 * is built the same way when a prescription is written and when its freshness is
 * checked — they can never drift (guarded by a golden test).
 */
export function buildConfigInputs(args: ConfigInputArgs): ConfigInputs {
  return {
    exercise: {
      equipmentType: toEngineEquipment(args.equipmentType),
      loadType: coerceLoadType(args.loadType, args.equipmentType),
    },
    user: {
      experienceLevel: args.profile.experience_level ?? "beginner",
    },
    goalType: args.goal,
    week: args.week,
    previous: args.previous,
    initial: args.initial,
  };
}

/**
 * A cold-start prior peak (the user's best weight×reps for the lift) — the
 * derived basis `seedMeso` backs off from. Weight/reps are history-derived (so
 * they live in the EXCLUDED `weekPeak` slot, doc 14 §6.4); `sets` is the plan's
 * configured set count.
 */
export interface SeedPeak {
  weight: number | null;
  reps: number | null;
  sets: number;
}

/**
 * Wrap a resolved `ConfigInputs` into a full `EngineInputs` for a SEED row
 * (doc 14 §6.2): a cold start has no logged history, so every derived field is
 * empty except `weekPeak`, which carries the prior-peak basis `seedMeso` used.
 * Because `weekPeak` is a derived key (doc 14 §3 denylist), it is excluded from
 * the fingerprint — so `configProjection(seedEngineInputs(c, peak)) === c` for any
 * peak, exactly like an advance's history is excluded. One construction path used
 * at both write (generation/seed) and replay (recompute), so they cannot drift.
 */
export function seedEngineInputs(
  config: ConfigInputs,
  priorPeak: SeedPeak | null,
  strengthAnchor: EngineInputs["strengthAnchor"] = null,
  bodyweight: EngineInputs["bodyweight"] = null,
): EngineInputs {
  return {
    ...config,
    actualSets: [],
    exerciseFeedback: null,
    workoutFeedback: null,
    muscleGroupWeeklySets: null,
    weekPeak: priorPeak
      ? {
          weight: priorPeak.weight,
          reps: priorPeak.reps,
          sets: priorPeak.sets,
          targetRir: config.week.targetRir,
        }
      : null,
    // §S1: the seed's recency anchor (when seed_from_anchor is active). A DERIVED
    // input (doc 14 §3 denylist) — excluded from the freshness fingerprint, so
    // carrying it never changes a seed row's signature; it is refreshed from live
    // history on recompute exactly like an advance's anchor.
    strengthAnchor,
    // T-I2: the lifter's bodyweight (effective-load base for bodyweight movements).
    // Also a DERIVED input — excluded from the fingerprint, refreshed on recompute.
    bodyweight,
  };
}

export interface SeedInputArgs {
  equipmentType: string;
  /** stored `exercises.load_type`; null ⇒ derived from equipmentType (config input) */
  loadType?: string | null;
  profile: Pick<ProfileRow, "experience_level">;
  goal: EngineInputs["goalType"];
  startRir: number;
  isDeload: boolean;
  /** plan cold-start defaults (meso_exercises.initial_*); null for a bare add */
  initial: EngineInputs["initial"];
  /** the user's prior peak for the lift, when one exists (else seed from initial) */
  priorPeak: SeedPeak | null;
  /** §S1: the recency strength anchor the anchor-seed used (derived; null otherwise) */
  strengthAnchor?: EngineInputs["strengthAnchor"];
  /** T-I2: the lifter's bodyweight (derived; null otherwise) */
  bodyweight?: EngineInputs["bodyweight"];
}

/**
 * Build the full seed `EngineInputs` from raw scope values (the write side):
 * resolves the config half through the shared `buildConfigInputs` (so the
 * fingerprint matches the check) and attaches the cold-start derived shell.
 */
export function buildSeedInputs(args: SeedInputArgs): EngineInputs {
  const config = buildConfigInputs({
    equipmentType: args.equipmentType,
    loadType: args.loadType,
    profile: args.profile,
    goal: args.goal,
    week: { targetRir: args.startRir, isDeload: args.isDeload },
    previous: null,
    initial: args.initial,
  });
  return seedEngineInputs(
    config,
    args.priorPeak,
    args.strengthAnchor ?? null,
    args.bodyweight ?? null,
  );
}

/**
 * Identifies the EFFECTIVE engine params a prescription was (or will be) computed
 * under. `version` is the active `engine_params.version` (an activated version's
 * content is immutable — a change proposes a NEW version). Doc 14 phase 3 folds the
 * per-user×exercise increment override in as `incrementOverride`, so the fingerprint
 * reflects the effective params and a change to an exercise's increment makes
 * exactly that exercise's open rows go stale (the scope falls out of the
 * fingerprint, §7).
 *
 * `incrementOverride` is OMITTED when the exercise has no override, so a row with no
 * override hashes identically to its phase-1/2 fingerprint — the override surface
 * churns nothing for the (vast) majority of rows that don't have one.
 */
export interface ParamsToken {
  version: number;
  incrementOverride?: number;
}

/**
 * Build the params token for an exercise, folding in its increment override when
 * one exists (doc 14 phase 3). No override ⇒ `{ version }`, byte-identical to the
 * pre-phase-3 token, so existing fingerprints are preserved.
 */
export function paramsTokenFor(
  version: number,
  incrementOverride?: number | null,
): ParamsToken {
  return incrementOverride == null ? { version } : { version, incrementOverride };
}

/**
 * The freshness fingerprint: a canonical sha256 over the config projection + the
 * params token. Same inputs ⇒ same hash, across the app, migrations, and tests.
 */
export function computeDepFingerprint(
  config: ConfigInputs,
  token: ParamsToken,
): string {
  return hashParams({ config, params: token });
}
