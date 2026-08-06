/**
 * Pure-helper tests for the macrocycle query layer: profile → engine-profile
 * mapping (training-age math), phase labels, and the create-time plan snapshot.
 * The Supabase I/O (createMacrocycleWithMesos, getMacroOverview) is covered by
 * the hosted-DB integration smoke.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "@/lib/engine";
import {
  isGoalsEdit,
  macroEditImpact,
  phaseLabel,
  placeholderName,
  planForMacro,
  planInputsSnapshot,
  planMacroPlacement,
  profileToMacroProfile,
  reconcileMacroSlots,
  type SlotMeso,
} from "../macro";
import { profileAge } from "../profiles";
import type { MesocycleRow, ProfileRow } from "@/lib/types/database";

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
    body_fat_source: null,
    training_since: null,
    experience_level: "intermediate",
    preferred_equipment: [],
    week_starts_on: 1,
    auto_match_weights: false,
    role: "user",
    onboarded_at: null,
    last_seen_version: null,
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

  it("prefers birthdate-derived age over the static int (doc 17 §2.5)", () => {
    const now = new Date("2026-07-10T12:00:00Z");
    const mp = profileToMacroProfile(
      profile({ age: 34, birthdate: "1990-07-01" }),
      now,
    );
    expect(mp.age).toBe(36); // 1990-07-01 → just turned 36; the stale int said 34
  });

  it("falls back to the static age int when birthdate is unset or invalid", () => {
    expect(profileToMacroProfile(profile({ birthdate: null })).age).toBe(34);
    expect(profileToMacroProfile(profile({ birthdate: "not-a-date" })).age).toBe(34);
  });

  // doc 17 §6 5c / doc 15 §3.1: measured values ride the SAME bodyFatPct input
  // as an estimate — provenance is display-layer only, the engine path is one
  it("carries a DEXA-measured body-fat identically to a self-estimate", () => {
    const now = new Date("2026-07-11T12:00:00Z");
    const measured = profileToMacroProfile(
      profile({ body_fat_pct: 18.2, body_fat_source: "dexa" }),
      now,
    );
    const estimated = profileToMacroProfile(
      profile({ body_fat_pct: 18.2, body_fat_source: "estimate" }),
      now,
    );
    expect(measured).toEqual(estimated);
    expect(measured.bodyFatPct).toBe(18.2);
  });
});

describe("profileAge", () => {
  const now = new Date("2026-07-10T12:00:00Z");

  it("derives whole years from birthdate against `now`", () => {
    expect(profileAge({ age: null, birthdate: "1990-07-11" }, now)).toBe(35);
    expect(profileAge({ age: null, birthdate: "1990-07-09" }, now)).toBe(36);
  });

  it("falls back to the legacy int, tolerating null everywhere", () => {
    expect(profileAge({ age: 34, birthdate: null }, now)).toBe(34);
    expect(profileAge({ age: null, birthdate: null }, now)).toBeNull();
  });
});

describe("planInputsSnapshot (doc 17 §2.5 contract snapshot)", () => {
  it("stamps the resolved profile, params version, and time", () => {
    const now = new Date("2026-07-10T12:00:00Z");
    const mp = profileToMacroProfile(profile(), now);
    expect(planInputsSnapshot(mp, 21, now)).toEqual({
      profile: mp,
      params_version: 21,
      stamped_at: "2026-07-10T12:00:00.000Z",
    });
  });
});

describe("isGoalsEdit (contract rewrites only on a re-contract)", () => {
  const macro = {
    goal_type: "hypertrophy",
    duration_months: 6,
    meso_length_weeks: 5,
  } as const;

  it("rename/notes-only edits are NOT goals edits", () => {
    expect(
      isGoalsEdit(macro, {
        goal_type: "hypertrophy",
        duration_months: 6,
        meso_length_weeks: 5,
      }),
    ).toBe(false);
  });

  it("changing goal, duration, or block length is a goals edit", () => {
    expect(isGoalsEdit(macro, { ...macro, goal_type: "cut" })).toBe(true);
    expect(isGoalsEdit(macro, { ...macro, duration_months: 8 })).toBe(true);
    expect(isGoalsEdit(macro, { ...macro, meso_length_weeks: 4 })).toBe(true);
  });

  it("a null duration (re-recommend) is always a re-contract", () => {
    expect(isGoalsEdit(macro, { ...macro, duration_months: null })).toBe(true);
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

// ---------------------------------------------------------------------------
// planMacroPlacement — where a placed meso lands & how the macro re-sequences
// ---------------------------------------------------------------------------

function slot(
  id: string,
  status: MesocycleRow["status"],
  position: number | null,
  phase: SlotMeso["phase"] = null,
): SlotMeso {
  return { id, status, position, phase };
}

describe("planMacroPlacement", () => {
  it("fills the earliest unplanned slot when no position is given", () => {
    const existing = [
      slot("a", "completed", 1),
      slot("b", "unplanned", 2, "intensification"),
      slot("c", "unplanned", 3, "peak"),
    ];
    const plan = planMacroPlacement(existing, "new", null, null);
    expect(plan.consumePlaceholderId).toBe("b");
    expect(plan.targetPosition).toBe(2);
    expect(plan.inheritedPhase).toBe("intensification");
    expect(plan.resequence).toEqual([
      { id: "a", position: 1 },
      { id: "new", position: 2 },
      { id: "c", position: 3 },
    ]);
  });

  it("keeps the placed meso's own phase over the placeholder's", () => {
    const existing = [slot("b", "unplanned", 1, "peak")];
    const plan = planMacroPlacement(existing, "new", "accumulation", null);
    expect(plan.inheritedPhase).toBe("accumulation");
  });

  it("consumes the placeholder sitting exactly at a requested position", () => {
    const existing = [
      slot("a", "planned", 1),
      slot("b", "unplanned", 2, "peak"),
    ];
    const plan = planMacroPlacement(existing, "new", null, 2);
    expect(plan.consumePlaceholderId).toBe("b");
    expect(plan.targetPosition).toBe(2);
    expect(plan.resequence).toEqual([
      { id: "a", position: 1 },
      { id: "new", position: 2 },
    ]);
  });

  it("inserts and shifts when the requested slot has no placeholder (grows the macro)", () => {
    const existing = [slot("a", "planned", 1), slot("b", "planned", 2)];
    const plan = planMacroPlacement(existing, "new", null, 2);
    expect(plan.consumePlaceholderId).toBeNull();
    expect(plan.targetPosition).toBe(2);
    expect(plan.resequence).toEqual([
      { id: "a", position: 1 },
      { id: "new", position: 2 },
      { id: "b", position: 3 },
    ]);
  });

  it("appends when there are no open slots and no position", () => {
    const existing = [slot("a", "completed", 1), slot("b", "active", 2)];
    const plan = planMacroPlacement(existing, "new", null, null);
    expect(plan.consumePlaceholderId).toBeNull();
    expect(plan.targetPosition).toBe(3);
    expect(plan.resequence.at(-1)).toEqual({ id: "new", position: 3 });
  });

  it("places into an empty macro", () => {
    const plan = planMacroPlacement([], "new", null, null);
    expect(plan.targetPosition).toBe(1);
    expect(plan.resequence).toEqual([{ id: "new", position: 1 }]);
  });
});
