import { describe, it, expect } from "vitest";
import {
  pplCategory,
  classifyDayEmphasis,
  type DaySlotVolume,
} from "../classification";

// helpers — a slot of N sets of an exercise with the given (primary, …secondary) muscles
const slot = (
  sets: number,
  primary: string,
  ...secondary: string[]
): DaySlotVolume => ({
  sets,
  muscles: [
    { name: primary, role: "primary" as const },
    ...secondary.map((name) => ({ name, role: "secondary" as const })),
  ],
});

describe("pplCategory (10 §7 map on the app vocabulary)", () => {
  it("maps push muscles", () => {
    for (const m of ["chest", "shoulders", "triceps"]) {
      expect(pplCategory(m)).toBe("push");
    }
  });
  it("maps pull muscles (incl. traps/forearms)", () => {
    for (const m of ["back", "biceps", "traps", "forearms"]) {
      expect(pplCategory(m)).toBe("pull");
    }
  });
  it("maps leg muscles", () => {
    for (const m of ["quads", "hamstrings", "glutes", "calves"]) {
      expect(pplCategory(m)).toBe("legs");
    }
  });
  it("is case/whitespace insensitive and leaves abs/unknown unmapped", () => {
    expect(pplCategory(" Chest ")).toBe("push");
    expect(pplCategory("abs")).toBeNull();
    expect(pplCategory("neck")).toBeNull();
  });
});

describe("classifyDayEmphasis", () => {
  it("classifies a pure leg day as legs", () => {
    const out = classifyDayEmphasis([
      slot(4, "quads", "glutes"),
      slot(3, "hamstrings", "glutes"),
      slot(3, "calves"),
    ]);
    expect(out.classification).toBe("legs");
    expect(out.dominant).toBe("legs");
    expect(out.fractional_sets.legs).toBeGreaterThan(0);
    expect(out.fractional_sets.push).toBe(0);
    expect(out.fractional_sets.pull).toBe(0);
  });

  it("classifies a chest/shoulder/triceps day as upper-push", () => {
    const out = classifyDayEmphasis([
      slot(4, "chest", "triceps"),
      slot(3, "shoulders"),
      slot(3, "triceps"),
    ]);
    expect(out.classification).toBe("upper-push");
    expect(out.dominant).toBe("push");
  });

  it("classifies a back/biceps day as upper-pull", () => {
    const out = classifyDayEmphasis([
      slot(4, "back", "biceps"),
      slot(3, "back"),
      slot(3, "biceps"),
    ]);
    expect(out.classification).toBe("upper-pull");
    expect(out.dominant).toBe("pull");
  });

  it("classifies a balanced push+pull day as upper", () => {
    const out = classifyDayEmphasis([
      slot(4, "chest", "triceps"),
      slot(4, "back", "biceps"),
    ]);
    expect(out.classification).toBe("upper");
  });

  it("classifies a meaningful legs+upper mix as full-body", () => {
    const out = classifyDayEmphasis([
      slot(4, "quads", "glutes"),
      slot(4, "chest", "triceps"),
    ]);
    expect(out.classification).toBe("full-body");
  });

  it("returns unclassified when nothing maps (abs-only)", () => {
    const out = classifyDayEmphasis([slot(4, "abs")]);
    expect(out.classification).toBe("unclassified");
    expect(out.dominant).toBeNull();
    expect(out.total_fractional_sets).toBe(0);
  });

  it("counts secondaries at 0.5 (fractional 1.0/0.5)", () => {
    // 2 sets bench: chest primary (1.0) + triceps secondary (0.5)
    const out = classifyDayEmphasis([slot(2, "chest", "triceps")]);
    // both chest and triceps are push, so push = 2*1.0 + 2*0.5 = 3.0
    expect(out.fractional_sets.push).toBe(3);
    expect(out.total_fractional_sets).toBe(3);
  });

  it("ignores zero/negative set counts", () => {
    const out = classifyDayEmphasis([slot(0, "chest"), slot(-1, "back")]);
    expect(out.total_fractional_sets).toBe(0);
    expect(out.classification).toBe("unclassified");
  });

  it("is deterministic for the same input", () => {
    const slots = [slot(4, "quads", "glutes"), slot(3, "hamstrings")];
    expect(classifyDayEmphasis(slots)).toEqual(classifyDayEmphasis(slots));
  });
});
