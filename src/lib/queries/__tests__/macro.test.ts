/**
 * Pure-helper tests for the macrocycle query layer: profile → engine-profile
 * mapping (training-age math), phase labels, and the create-time plan snapshot.
 * The Supabase I/O (createMacrocycleWithMesos, getMacroOverview) is covered by
 * the hosted-DB integration smoke.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "@/lib/engine";
import { phaseLabel, planForMacro, profileToMacroProfile } from "../macro";
import type { ProfileRow } from "@/lib/types/database";

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "u1",
    display_name: "Test",
    age: 34,
    gender: "male",
    height_cm: 180,
    bodyweight: 198,
    bodyweight_updated_at: null,
    body_fat_pct: null,
    training_since: null,
    experience_level: "intermediate",
    preferred_equipment: [],
    units: "lb",
    week_starts_on: 1,
    role: "user",
    onboarded_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("profileToMacroProfile", () => {
  it("carries the profile fields onto the engine inputs", () => {
    const mp = profileToMacroProfile(profile());
    expect(mp).toMatchObject({
      sex: "male",
      age: 34,
      bodyweight: 198,
      bodyweightUnit: "lb",
      heightCm: 180,
      experienceLevel: "intermediate",
    });
  });

  it("derives training years from training_since against `now`", () => {
    const now = new Date("2026-06-14T12:00:00Z");
    const mp = profileToMacroProfile(
      profile({ training_since: "2022-06-14" }),
      now,
    );
    expect(mp.trainingYears).toBeGreaterThan(3.9);
    expect(mp.trainingYears).toBeLessThan(4.1);
  });

  it("leaves training years null when training_since is unset", () => {
    expect(profileToMacroProfile(profile()).trainingYears).toBeNull();
  });
});

describe("phaseLabel", () => {
  it("uppercases known phases and tolerates null", () => {
    expect(phaseLabel("accumulation")).toBe("ACCUMULATION");
    expect(phaseLabel("peak")).toBe("PEAK");
    expect(phaseLabel(null)).toBe("");
  });
});

describe("planForMacro", () => {
  it("produces a gain target with per-month rate for a hypertrophy macro", () => {
    const now = new Date("2026-06-14T12:00:00Z");
    const plan = planForMacro(
      { goal_type: "hypertrophy", duration_months: 6, meso_length_weeks: 5 },
      profile({ training_since: "2022-06-14" }),
      DEFAULT_ENGINE_PARAMS,
      now,
    );
    expect(plan.target.direction).toBe("gain");
    expect(plan.durationMonths).toBe(6);
    // 6 mo × 4.33 wk/mo ÷ 5-wk blocks ⇒ 5 mesocycles
    expect(plan.mesoCount).toBe(5);
    expect(plan.phases).toHaveLength(5);
    expect(plan.estimate).toBe(true);
  });

  it("falls back to the engine's recommended duration when none is chosen", () => {
    const plan = planForMacro(
      { goal_type: "strength", duration_months: null, meso_length_weeks: 5 },
      profile(),
      DEFAULT_ENGINE_PARAMS,
    );
    expect(plan.durationMonths).toBe(plan.recommendedDurationMonths);
    expect(plan.target.unit).toBe("%");
  });
});
