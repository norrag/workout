/**
 * doc 17 §3 (N37) — the pacer's `planStrengthRate` assembly: the pure
 * queries-layer derivation over `planMacrocycle`'s `strengthRatePctMonth`.
 * Mode gate (inactive ⇒ null, recorded inputs byte-identical), standalone-meso
 * assembly under the hypertrophy default, goal independence (the band is
 * profile-only and strength-denominated for every goal), agreement with the
 * plan the create flow computes, and the never-throw degradation toward the
 * band source.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS, planMacrocycle } from "@/lib/engine";
import type { EngineParams } from "@/lib/engine";
import { V19_PARAMS, V20_PARAMS } from "@/lib/engine/__tests__/helpers";
import { derivePlanStrengthRate, profileToMacroProfile } from "../plan-rate";
import { engineGoal } from "../engine-goal";
import type { ProfileRow } from "@/lib/types/database";

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "u1",
    display_name: "Test",
    age: 34,
    birthdate: null,
    gender: "male",
    height_in: 71,
    bodyweight: 198,
    bodyweight_updated_at: null,
    body_fat_pct: null,
    training_since: null,
    experience_level: "intermediate",
    preferred_equipment: [],
    week_starts_on: 1,
    auto_match_weights: false,
    role: "user",
    onboarded_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as ProfileRow;
}

const NOW = new Date("2026-07-10T12:00:00Z");

describe("derivePlanStrengthRate", () => {
  it("null while the progression mode is inactive (recorded inputs stay byte-identical)", () => {
    expect(derivePlanStrengthRate(profile(), "hypertrophy", V19_PARAMS, NOW)).toBeNull();
    expect(
      derivePlanStrengthRate(profile(), "hypertrophy", DEFAULT_ENGINE_PARAMS as EngineParams, NOW),
    ).toBeNull();
    const off: EngineParams = {
      ...V20_PARAMS,
      progression: { ...V20_PARAMS.progression!, mode: "off" },
    };
    expect(derivePlanStrengthRate(profile(), "hypertrophy", off, NOW)).toBeNull();
  });

  it("mode active: returns planMacrocycle's strengthRatePctMonth for the profile", () => {
    const rate = derivePlanStrengthRate(profile(), "hypertrophy", V20_PARAMS, NOW);
    const plan = planMacrocycle(
      { goal: "hypertrophy", profile: profileToMacroProfile(profile(), NOW) },
      V20_PARAMS,
    );
    expect(rate).toEqual(plan.strengthRatePctMonth);
    expect(rate!.low).toBeGreaterThan(0);
    expect(rate!.high).toBeGreaterThanOrEqual(rate!.low);
  });

  it("standalone-meso assembly: engineGoal(null) → hypertrophy, one code path", () => {
    const standalone = derivePlanStrengthRate(
      profile(),
      engineGoal(null),
      V20_PARAMS,
      NOW,
    );
    expect(engineGoal(null)).toBe("hypertrophy");
    expect(standalone).toEqual(
      derivePlanStrengthRate(profile(), "hypertrophy", V20_PARAMS, NOW),
    );
    expect(standalone).not.toBeNull();
  });

  it("goal denomination: the band is profile-only — identical across goals, %/mo strength for a mass goal too", () => {
    // a hypertrophy (mass) macro's pacer source must be the STRENGTH band,
    // never lb/mo — the derivation returns the same personalized strength
    // band whatever the goal; the per-goal factor composes in the pacer.
    const goals = ["hypertrophy", "strength", "cut", "maintain"] as const;
    const rates = goals.map((g) =>
      derivePlanStrengthRate(profile(), g, V20_PARAMS, NOW),
    );
    for (const rate of rates) expect(rate).toEqual(rates[0]);
  });

  it("personalization flows: an older lifter's plan band sits below a younger one's", () => {
    // the v21 strength params (age taper with the strength floor); with them
    // absent the band is the raw bucket table — either way the derivation just
    // carries what planMacrocycle computes, so assert on relative order only
    // when the taper params are present.
    const withTaper: EngineParams = {
      ...V20_PARAMS,
      macro_target: {
        ...V20_PARAMS.macro_target,
        age_taper_floor_strength: 0.7,
      },
    };
    const young = derivePlanStrengthRate(profile({ age: 25 }), "hypertrophy", withTaper, NOW)!;
    const old = derivePlanStrengthRate(profile({ age: 65 }), "hypertrophy", withTaper, NOW)!;
    expect(old.high).toBeLessThan(young.high);
    expect(old.low).toBeLessThanOrEqual(young.low);
  });

  it("never throws: an unresolvable plan degrades to null (band fallback, never unpaced)", () => {
    // body_fat_pct 99 breaches the macro profile schema (max 70) →
    // planMacrocycle throws → the derivation swallows it and returns null
    expect(
      derivePlanStrengthRate(profile({ body_fat_pct: 99 }), "hypertrophy", V20_PARAMS, NOW),
    ).toBeNull();
  });
});
