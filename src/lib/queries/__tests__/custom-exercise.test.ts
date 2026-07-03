import { describe, it, expect } from "vitest";
import { toEngineLoadType, toEngineEquipment } from "@/lib/engine";
import { dedupeMuscleRoles } from "../exercises";
import {
  customExerciseEquipment,
  equipmentTypeValues,
} from "@/lib/types/equipment";

// R12 — custom exercises must derive an honest load_type from their equipment,
// so the create vocabulary has to be load-type unambiguous, and duplicate
// muscle groups must never strand an orphan exercise row.

describe("custom-exercise equipment vocabulary (R12)", () => {
  it("excludes bare 'bodyweight' (load-type ambiguous → stuck 'external')", () => {
    expect(customExerciseEquipment).not.toContain("bodyweight");
  });

  it("offers all three bodyweight load semantics", () => {
    expect(customExerciseEquipment).toContain("bodyweight only");
    expect(customExerciseEquipment).toContain("bodyweight loadable");
    expect(customExerciseEquipment).toContain("machine assistance");
  });

  it("is a subset of the stored vocabulary (DB check constraint)", () => {
    for (const eq of customExerciseEquipment) {
      expect(equipmentTypeValues).toContain(eq);
    }
  });

  it("derives the intended load_type for every creatable value", () => {
    const expected: Record<string, string> = {
      "bodyweight only": "bodyweight_only",
      "bodyweight loadable": "bodyweight_loadable",
      "machine assistance": "bodyweight_assisted",
    };
    for (const eq of customExerciseEquipment) {
      expect(toEngineLoadType(eq)).toBe(expected[eq] ?? "external");
    }
  });

  it("every creatable value normalizes to a canonical pricing bucket", () => {
    for (const eq of customExerciseEquipment) {
      // toEngineEquipment never returns the input verbatim unless canonical;
      // all creatable values must land in a known step bucket (not throw)
      expect(typeof toEngineEquipment(eq)).toBe("string");
    }
    expect(toEngineEquipment("bodyweight only")).toBe("bodyweight");
    expect(toEngineEquipment("bodyweight loadable")).toBe("bodyweight");
    expect(toEngineEquipment("machine assistance")).toBe("machine");
  });
});

describe("dedupeMuscleRoles (R12)", () => {
  it("passes distinct groups through unchanged", () => {
    const input = [
      { muscle_group_id: "chest", role: "primary" as const },
      { muscle_group_id: "triceps", role: "secondary" as const },
    ];
    expect(dedupeMuscleRoles(input)).toEqual(input);
  });

  it("collapses an exact duplicate (used to unique-violate AFTER the exercise insert)", () => {
    expect(
      dedupeMuscleRoles([
        { muscle_group_id: "back", role: "secondary" },
        { muscle_group_id: "back", role: "secondary" },
      ]),
    ).toEqual([{ muscle_group_id: "back", role: "secondary" }]);
  });

  it("primary beats secondary for the same group, regardless of order", () => {
    expect(
      dedupeMuscleRoles([
        { muscle_group_id: "back", role: "secondary" },
        { muscle_group_id: "back", role: "primary" },
      ]),
    ).toEqual([{ muscle_group_id: "back", role: "primary" }]);
    expect(
      dedupeMuscleRoles([
        { muscle_group_id: "back", role: "primary" },
        { muscle_group_id: "back", role: "secondary" },
      ]),
    ).toEqual([{ muscle_group_id: "back", role: "primary" }]);
  });
});
