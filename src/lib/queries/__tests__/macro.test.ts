/**
 * Pure-helper tests for the macrocycle query layer: profile → engine-profile
 * mapping (training-age math), phase labels, and the create-time plan snapshot.
 * The Supabase I/O (createMacrocycleWithMesos, getMacroOverview) is covered by
 * the hosted-DB integration smoke.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "@/lib/engine";
import {
  macroEditImpact,
  phaseLabel,
  placeholderName,
  planForMacro,
  profileToMacroProfile,
  reconcileMacroSlots,
} from "../macro";
import type { MesocycleRow, ProfileRow } from "@/lib/types/database";

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "u1",
    display_name: "Test",
    age: 34,
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
  };
}

describe("profileToMacroProfile", () => {
  it("carries the profile fields onto the engine inputs", () => {
    const mp = profileToMacroProfile(profile());
    expect(mp).toMatchObject({
      sex: "male",
      age: 34,
      bodyweight: 198,
      heightIn: 71,
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

function meso(
  id: string,
  status: MesocycleRow["status"],
): Pick<MesocycleRow, "id" | "status"> {
  return { id, status };
}

describe("macroEditImpact", () => {
  it("counts unplanned vs locked mesos", () => {
    const impact = macroEditImpact([
      meso("a", "completed"),
      meso("b", "active"),
      meso("c", "unplanned"),
      meso("d", "unplanned"),
    ] as MesocycleRow[]);
    expect(impact).toEqual({ lockedCount: 2, unplannedCount: 2 });
  });
});

describe("placeholderName", () => {
  it("realigns a stale auto-name to its new position", () => {
    expect(placeholderName("Mesocycle 4", "unplanned", 3)).toBe("Mesocycle 3");
    expect(placeholderName("Mesocycle", "unplanned", 5)).toBe("Mesocycle 5");
  });

  it("leaves user-renamed placeholders untouched", () => {
    expect(placeholderName("Peak Block", "unplanned", 3)).toBe("Peak Block");
  });

  it("never renames planned or locked mesos", () => {
    expect(placeholderName("Mesocycle 4", "planned", 3)).toBe("Mesocycle 4");
    expect(placeholderName("Mesocycle 2", "completed", 1)).toBe("Mesocycle 2");
  });
});

describe("reconcileMacroSlots", () => {
  it("adds unplanned placeholders when the plan grew", () => {
    const mesos = [meso("a", "active"), meso("b", "unplanned")];
    expect(reconcileMacroSlots(mesos, 4)).toEqual({
      removeIds: [],
      addCount: 2,
    });
  });

  it("removes surplus unplanned from the tail when the plan shrank", () => {
    const mesos = [
      meso("a", "active"),
      meso("b", "unplanned"),
      meso("c", "unplanned"),
      meso("d", "unplanned"),
    ];
    // target 2 ⇒ keep the locked + the earliest open slot, drop c & d
    expect(reconcileMacroSlots(mesos, 2)).toEqual({
      removeIds: ["c", "d"],
      addCount: 0,
    });
  });

  it("never drops below the locked count", () => {
    const mesos = [
      meso("a", "completed"),
      meso("b", "active"),
      meso("c", "unplanned"),
    ];
    // plan asks for 1 but 2 are locked ⇒ remove the lone unplanned, add none
    expect(reconcileMacroSlots(mesos, 1)).toEqual({
      removeIds: ["c"],
      addCount: 0,
    });
  });

  it("is a no-op when the plan already matches", () => {
    const mesos = [
      meso("a", "active"),
      meso("b", "unplanned"),
      meso("c", "unplanned"),
    ];
    expect(reconcileMacroSlots(mesos, 3)).toEqual({
      removeIds: [],
      addCount: 0,
    });
  });
});
