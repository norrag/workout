import {
  toEngineEquipment,
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
  profile: Pick<ProfileRow, "experience_level" | "units">;
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
    exercise: { equipmentType: toEngineEquipment(args.equipmentType) },
    user: {
      experienceLevel: args.profile.experience_level ?? "beginner",
      units: args.profile.units,
    },
    goalType: args.goal,
    week: args.week,
    previous: args.previous,
    initial: args.initial,
  };
}

/**
 * Identifies the engine params a prescription was (or will be) computed under.
 * Today this is just the active `engine_params.version` (an activated version's
 * content is immutable — a change proposes a NEW version). Doc 14 phase 3 extends
 * it to fold a per-user×exercise override hash in, so the fingerprint reflects the
 * EFFECTIVE params; adding a field here simply re-hashes (a one-time recompute),
 * never a redesign.
 */
export interface ParamsToken {
  version: number;
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
