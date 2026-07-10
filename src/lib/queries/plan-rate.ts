import {
  planMacrocycle,
  type EngineInputs,
  type EngineParams,
  type MacroProfile,
} from "@/lib/engine";
import type { ProfileRow } from "@/lib/types/database";
import { profileAge } from "./profiles";
import type { EngineGoal } from "./engine-goal";

/**
 * doc 17 §3 (N37) — the pacer's `planStrengthRate` derived input, assembled in
 * the queries layer by evaluating the pure `planMacrocycle` on the live
 * profile and reading `strengthRatePctMonth` (the §2.1-personalized monthly
 * strength band — profile-only, so it exists for every goal and is always
 * strength-denominated; the per-goal `goal_rate_factor` composes in the pacer).
 *
 * A LEAF module (engine + leaf query helpers only): the assembly sites are the
 * same as `progressionHistory`'s — the seed path (`queries/generation.ts`),
 * the advance path (`queries/progression.ts`), and the projection — and those
 * cannot reach through `queries/macro.ts` (macro → stats → generation would
 * cycle). `profileToMacroProfile` therefore lives HERE and `macro.ts`
 * re-exports it, the `engine-goal.ts` / `progression-history.ts` pattern.
 *
 * Doc-14 treatment (§3 denylist): the value depends on bodyweight / body-fat /
 * age — none of which are config dimensions — so it is EXCLUDED from the
 * freshness fingerprint (a routine bodyweight edit must not churn open rows),
 * recorded in the decision `inputs` for replay, and replayed FROZEN by the
 * recompute exactly like `progressionHistory`.
 */

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Map a stored profile onto the engine's pure macro-profile inputs. */
export function profileToMacroProfile(
  profile: ProfileRow,
  now: Date = new Date(),
): MacroProfile {
  let trainingYears: number | null = null;
  if (profile.training_since) {
    const since = new Date(`${profile.training_since}T12:00:00`);
    if (!Number.isNaN(since.getTime())) {
      trainingYears = Math.max(0, (now.getTime() - since.getTime()) / MS_PER_YEAR);
    }
  }
  return {
    sex: profile.gender ?? null,
    // birthdate-derived age preferred (doc 17 §2.5 — a static int goes stale
    // a year at a time); the legacy `age` int is the fallback until re-saved
    age: profileAge(profile, now),
    bodyweight: profile.bodyweight,
    heightIn: profile.height_in,
    experienceLevel: profile.experience_level,
    trainingYears,
    bodyFatPct: profile.body_fat_pct,
  };
}

export type PlanStrengthRate = NonNullable<EngineInputs["planStrengthRate"]>;

/**
 * Derive the `planStrengthRate` engine input for one user × resolved goal.
 * Self-gates like `getProgressionHistories`: null while the progression mode
 * is inactive, so callers that spread it under their existing mode gate record
 * nothing new and stored decision inputs stay byte-identical (doc 17
 * principle 7). Standalone mesos pass `engineGoal(null)` → hypertrophy — one
 * code path, no macro row needed. Never throws: an unresolvable plan degrades
 * to null, and the pacer degrades to the bucket band (`"band"`), never to
 * unpaced.
 */
export function derivePlanStrengthRate(
  profile: ProfileRow,
  goal: EngineGoal,
  params: EngineParams,
  now: Date = new Date(),
): PlanStrengthRate | null {
  if (params.progression?.mode !== "earned_step") return null;
  try {
    return planMacrocycle(
      { goal, profile: profileToMacroProfile(profile, now) },
      params,
    ).strengthRatePctMonth;
  } catch {
    return null;
  }
}
