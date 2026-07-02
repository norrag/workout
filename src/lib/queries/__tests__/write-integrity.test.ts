import { describe, it, expect } from "vitest";
import { withoutLoggedHistory } from "../generation";
import { validateMesoDayPlan } from "@/lib/mcp/tools/write";

// R4 (hard rule #5): plan regeneration must never delete a workout or
// workout_exercise that carries logged sets — the FK cascade would destroy
// logged history. The `planned` status alone is porous (logSet's in_progress
// flip is a separate statement), so removability is decided by this rule.
describe("withoutLoggedHistory (R4)", () => {
  const candidates = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("removes only candidates with no logged sets", () => {
    const out = withoutLoggedHistory(candidates, new Set(["b"]));
    expect(out.map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("preserves everything when every candidate has history", () => {
    expect(withoutLoggedHistory(candidates, new Set(["a", "b", "c"]))).toEqual([]);
  });

  it("passes everything through when nothing has history", () => {
    expect(withoutLoggedHistory(candidates, new Set())).toEqual(candidates);
  });

  it("handles no candidates", () => {
    expect(withoutLoggedHistory([], new Set(["a"]))).toEqual([]);
  });
});

// R3: everything that could violate a DB unique mid-save is refused BEFORE any
// write. Zod can't see these two: a repeated day_number, and two group names
// resolving to the same muscle group ("Chest"/"chest").
describe("validateMesoDayPlan (R3)", () => {
  const idByName = new Map([
    ["Chest", "mg-chest"],
    ["chest", "mg-chest"],
    ["Back", "mg-back"],
  ]);

  it("accepts a clean plan", () => {
    const days = [
      { day_number: 1, groups: [{ muscle_group: "Chest" }, { muscle_group: "Back" }] },
      { day_number: 2, groups: [{ muscle_group: "Back" }] },
    ];
    expect(validateMesoDayPlan(days, idByName)).toBeNull();
  });

  it("rejects a repeated day_number", () => {
    const days = [
      { day_number: 1, groups: [{ muscle_group: "Chest" }] },
      { day_number: 1, groups: [{ muscle_group: "Back" }] },
    ];
    expect(validateMesoDayPlan(days, idByName)).toMatch(/day_number 1/);
  });

  it("rejects two names resolving to one muscle group in the same day", () => {
    const days = [
      { day_number: 1, groups: [{ muscle_group: "Chest" }, { muscle_group: "chest" }] },
    ];
    expect(validateMesoDayPlan(days, idByName)).toMatch(/twice/);
  });

  it("allows the same muscle group on different days", () => {
    const days = [
      { day_number: 1, groups: [{ muscle_group: "Chest" }] },
      { day_number: 2, groups: [{ muscle_group: "chest" }] },
    ];
    expect(validateMesoDayPlan(days, idByName)).toBeNull();
  });

  it("ignores unresolved names (reported separately as unknown groups)", () => {
    const days = [
      { day_number: 1, groups: [{ muscle_group: "Nope" }, { muscle_group: "Nope" }] },
    ];
    expect(validateMesoDayPlan(days, idByName)).toBeNull();
  });
});
