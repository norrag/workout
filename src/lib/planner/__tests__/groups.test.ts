/**
 * Pure-helper tests for the planner "Add groups" region picker (fig 2.6b) and
 * the group-centric "Pick exercise" multi-select layout (fig 2.7).
 */
import { describe, expect, it } from "vitest";
import { groupByRegion, planGroupExercises, regionForMuscle } from "../groups";

describe("regionForMuscle", () => {
  it("maps the canonical groups", () => {
    expect(regionForMuscle("quads")).toBe("LEGS");
    expect(regionForMuscle("Chest")).toBe("PUSH"); // case-insensitive
    expect(regionForMuscle("back")).toBe("PULL");
    expect(regionForMuscle("abs")).toBe("CORE");
  });

  it("falls unknown names to OTHER (never dropped)", () => {
    expect(regionForMuscle("neck")).toBe("OTHER");
  });
});

describe("groupByRegion", () => {
  it("orders regions LEGS→PUSH→PULL→CORE→OTHER and alphabetises within", () => {
    const sections = groupByRegion([
      { id: "1", name: "triceps" },
      { id: "2", name: "quads" },
      { id: "3", name: "back" },
      { id: "4", name: "abs" },
      { id: "5", name: "chest" },
      { id: "6", name: "glutes" },
    ]);
    expect(sections.map((s) => s.region)).toEqual([
      "LEGS",
      "PUSH",
      "PULL",
      "CORE",
    ]);
    expect(sections[0].groups.map((g) => g.name)).toEqual(["glutes", "quads"]);
    expect(sections[1].groups.map((g) => g.name)).toEqual(["chest", "triceps"]);
  });

  it("omits empty regions and surfaces OTHER last", () => {
    const sections = groupByRegion([
      { id: "1", name: "neck" },
      { id: "2", name: "chest" },
    ]);
    expect(sections.map((s) => s.region)).toEqual(["PUSH", "OTHER"]);
  });
});

describe("planGroupExercises", () => {
  it("lays selected exercises into consecutive slots in order", () => {
    const out = planGroupExercises([], ["a", "b", "c"], 3);
    expect(out).toEqual([
      { slot_number: 1, exercise_id: "a", initial_sets: 3 },
      { slot_number: 2, exercise_id: "b", initial_sets: 3 },
      { slot_number: 3, exercise_id: "c", initial_sets: 3 },
    ]);
  });

  it("preserves an existing exercise's initial_sets, defaults a new one", () => {
    const out = planGroupExercises(
      [{ exercise_id: "a", initial_sets: 5 }],
      ["a", "b"],
      3,
    );
    expect(out).toEqual([
      { slot_number: 1, exercise_id: "a", initial_sets: 5 },
      { slot_number: 2, exercise_id: "b", initial_sets: 3 },
    ]);
  });

  it("drops a deselected exercise and renumbers", () => {
    const out = planGroupExercises(
      [
        { exercise_id: "a", initial_sets: 3 },
        { exercise_id: "b", initial_sets: 4 },
      ],
      ["b"],
      3,
    );
    expect(out).toEqual([{ slot_number: 1, exercise_id: "b", initial_sets: 4 }]);
  });

  it("dedupes repeated selections and handles an empty selection", () => {
    expect(planGroupExercises([], ["a", "a", "b"], 3)).toEqual([
      { slot_number: 1, exercise_id: "a", initial_sets: 3 },
      { slot_number: 2, exercise_id: "b", initial_sets: 3 },
    ]);
    expect(planGroupExercises([{ exercise_id: "a", initial_sets: 3 }], [], 3)).toEqual(
      [],
    );
  });
});
