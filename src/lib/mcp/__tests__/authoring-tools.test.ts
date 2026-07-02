import { describe, it, expect } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "@/lib/engine";
import { mesoActivationBlock } from "@/lib/queries/generation";
import { weeklySetsByGroup, previewVolume } from "../tools/authoring";

// ---------------------------------------------------------------------------
// weeklySetsByGroup — weekly-set aggregation (fractional via roles since R14;
// by-block fallback when no roles are supplied, as in these legacy-shape cases)
// ---------------------------------------------------------------------------

describe("weeklySetsByGroup", () => {
  it("sums a group's slot sets across the week's days", () => {
    const days = [
      {
        groups: [
          { muscle_group: "chest", fills: [{ initial_sets: 3 }, { initial_sets: 2 }] },
          { muscle_group: "back", fills: [{ initial_sets: 3 }] },
        ],
      },
      {
        groups: [
          { muscle_group: "chest", fills: [{ initial_sets: 4 }] },
          { muscle_group: "quads", fills: [{ initial_sets: 5 }] },
        ],
      },
    ];
    expect(weeklySetsByGroup(days)).toEqual([
      { muscle_group: "chest", sets: 9 },
      { muscle_group: "quads", sets: 5 },
      { muscle_group: "back", sets: 3 },
    ]);
  });

  it("treats a null initial_sets as zero", () => {
    const days = [{ groups: [{ muscle_group: "abs", fills: [{ initial_sets: null }] }] }];
    expect(weeklySetsByGroup(days)).toEqual([{ muscle_group: "abs", sets: 0 }]);
  });
});

// ---------------------------------------------------------------------------
// previewVolume — landmark zoning over a proposed plan (no persistence)
// ---------------------------------------------------------------------------

describe("previewVolume", () => {
  it("zones each muscle vs its experience-scaled band", () => {
    const { perMuscle, belowMev, aboveMrv } = previewVolume(
      [
        { muscle_group: "chest", sets: 3 }, // below MEV (8)
        { muscle_group: "back", sets: 16 }, // optimal (10..22)
        { muscle_group: "quads", sets: 30 }, // above MRV (20)
      ],
      DEFAULT_ENGINE_PARAMS,
      "intermediate",
    );
    expect(belowMev).toEqual(["chest"]);
    expect(aboveMrv).toEqual(["quads"]);
    expect(perMuscle.find((m) => m.muscle_group === "back")?.landmark?.zone).toBe(
      "optimal",
    );
  });

  it("returns a null landmark for an unparameterized muscle", () => {
    const { perMuscle } = previewVolume(
      [{ muscle_group: "forearms", sets: 6 }],
      DEFAULT_ENGINE_PARAMS,
      "intermediate",
    );
    expect(perMuscle[0].landmark).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mesoActivationBlock — sequential activation gate within a macrocycle
// ---------------------------------------------------------------------------

describe("mesoActivationBlock", () => {
  it("allows the first block (no earlier siblings)", () => {
    const gate = mesoActivationBlock(
      [{ position: 2, status: "planned" }],
      1,
    );
    expect(gate.blocked).toBe(false);
  });

  it("blocks a later block while an earlier one is incomplete", () => {
    const gate = mesoActivationBlock(
      [
        { position: 1, status: "planned" },
        { position: 2, status: "completed" },
      ],
      3,
    );
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toMatch(/earlier mesocycle/);
  });

  it("blocks when another sibling is already active", () => {
    const gate = mesoActivationBlock(
      [{ position: 1, status: "active" }],
      2,
    );
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toMatch(/currently active/);
  });

  it("allows a later block once every earlier one is completed/abandoned", () => {
    const gate = mesoActivationBlock(
      [
        { position: 1, status: "completed" },
        { position: 2, status: "abandoned" },
      ],
      3,
    );
    expect(gate.blocked).toBe(false);
  });

  it("never blocks a standalone meso (no position)", () => {
    const gate = mesoActivationBlock([], null);
    expect(gate.blocked).toBe(false);
  });
});
