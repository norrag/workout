import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLATE_SIZES_LB,
  clampStep,
  defaultPlateSetup,
  planPlateLoad,
  swipeTarget,
} from "./plates";

/** the plan as the tray prints it: "45×1 · 25×1" */
function stacks(perSide: readonly { weight: number; count: number }[]): string {
  return perSide.map((p) => `${p.weight}x${p.count}`).join(" ");
}

describe("planPlateLoad", () => {
  it("reproduces the shortcut's worked example (185 on a 45 bar)", () => {
    const load = planPlateLoad({
      targetWeight: 185,
      startWeight: 45,
      sides: 2,
    });
    expect(stacks(load.perSide)).toBe("45x1 25x1");
    expect(load.perSideWeight).toBe(70);
    expect(load.closestMatch).toBe(185);
    expect(load.shortBy).toBe(0);
    expect(load.belowStart).toBe(false);
  });

  it("spends largest first and never exceeds the ask", () => {
    // 315 on a 45 bar → 135/side → 45×3 exactly
    expect(stacks(planPlateLoad({ targetWeight: 315, startWeight: 45, sides: 2 }).perSide))
      .toBe("45x3");
    // 137.5 on a 45 bar → 46.25/side, floored to 46 → 45 + nothing else fits
    const odd = planPlateLoad({ targetWeight: 137.5, startWeight: 45, sides: 2 });
    expect(stacks(odd.perSide)).toBe("45x1");
    expect(odd.closestMatch).toBe(135);
    expect(odd.shortBy).toBe(2.5);
  });

  it("loads a single-sided machine across one point", () => {
    const load = planPlateLoad({ targetWeight: 100, startWeight: 0, sides: 1 });
    expect(stacks(load.perSide)).toBe("45x2 10x1");
    expect(load.closestMatch).toBe(100);
    expect(load.shortBy).toBe(0);
  });

  it("reports how far short an unreachable ask lands", () => {
    // 2.5 is the smallest plate, so a 2-sided implement moves in 5 lb steps
    const load = planPlateLoad({ targetWeight: 187, startWeight: 45, sides: 2 });
    expect(load.closestMatch).toBe(185);
    expect(load.shortBy).toBe(2);
    expect(load.targetWeight).toBe(187);
  });

  it("stays exact across a long greedy descent (no float drift)", () => {
    // 45+25+10+5+2.5 = 87.5 per side, twice, on a 45 bar
    const load = planPlateLoad({ targetWeight: 220, startWeight: 45, sides: 2 });
    expect(stacks(load.perSide)).toBe("45x1 25x1 10x1 5x1 2.5x1");
    expect(load.perSideWeight).toBe(87.5);
    expect(load.closestMatch).toBe(220);
    expect(load.shortBy).toBe(0);
  });

  it("loads nothing when the ask is the bare implement", () => {
    const load = planPlateLoad({ targetWeight: 45, startWeight: 45, sides: 2 });
    expect(load.perSide).toEqual([]);
    expect(load.closestMatch).toBe(45);
    expect(load.shortBy).toBe(0);
    expect(load.belowStart).toBe(false);
  });

  it("flags an ask below the bare implement instead of going negative", () => {
    const load = planPlateLoad({ targetWeight: 30, startWeight: 45, sides: 2 });
    expect(load.perSide).toEqual([]);
    expect(load.closestMatch).toBe(45);
    expect(load.shortBy).toBe(0);
    expect(load.belowStart).toBe(true);
  });

  it("takes a different rack when one is passed", () => {
    // a gym with no 2.5s or 25s
    const load = planPlateLoad({
      targetWeight: 185,
      startWeight: 45,
      sides: 2,
      plates: [45, 10, 5],
    });
    expect(stacks(load.perSide)).toBe("45x1 10x2 5x1");
    expect(load.closestMatch).toBe(185);
  });

  it("sorts an unordered rack before spending it", () => {
    const load = planPlateLoad({
      targetWeight: 185,
      startWeight: 45,
      sides: 2,
      plates: [2.5, 45, 5, 25, 10],
    });
    expect(stacks(load.perSide)).toBe("45x1 25x1");
  });

  it("keeps the standard rack largest-first", () => {
    expect([...DEFAULT_PLATE_SIZES_LB]).toEqual([45, 25, 10, 5, 2.5]);
  });
});

describe("defaultPlateSetup", () => {
  it("opens a barbell on a 45 lb bar loaded both ends", () => {
    expect(defaultPlateSetup("barbell")).toEqual({ startWeight: 45, sides: 2 });
  });

  it("carries the smith's counterweighted carriage", () => {
    expect(defaultPlateSetup("smith")).toEqual({ startWeight: 25, sides: 2 });
    expect(defaultPlateSetup("smith machine")).toEqual({
      startWeight: 25,
      sides: 2,
    });
  });

  it("takes the conservative single point for a machine, and for the unknown", () => {
    expect(defaultPlateSetup("machine")).toEqual({ startWeight: 0, sides: 1 });
    expect(defaultPlateSetup("cable")).toEqual({ startWeight: 0, sides: 1 });
    expect(defaultPlateSetup(null)).toEqual({ startWeight: 0, sides: 1 });
    expect(defaultPlateSetup("freemotion")).toEqual({
      startWeight: 0,
      sides: 1,
    });
  });

  it("loads a pair of dumbbell handles from zero", () => {
    expect(defaultPlateSetup("dumbbell")).toEqual({ startWeight: 0, sides: 2 });
  });
});

describe("clampStep", () => {
  it("holds at both ends", () => {
    expect(clampStep(-1)).toBe(0);
    expect(clampStep(0)).toBe(0);
    expect(clampStep(3)).toBe(3);
    expect(clampStep(4)).toBe(3);
  });
});

describe("swipeTarget", () => {
  const width = 300;

  it("ignores a drag that neither travels nor flicks", () => {
    expect(swipeTarget({ index: 1, dx: -40, width })).toBe(1);
  });

  it("advances on a leftward drag past a third of the width", () => {
    expect(swipeTarget({ index: 1, dx: -120, width })).toBe(2);
  });

  it("goes back on a rightward drag", () => {
    expect(swipeTarget({ index: 1, dx: 120, width })).toBe(0);
  });

  it("advances on a short fast flick", () => {
    expect(swipeTarget({ index: 0, dx: -20, width, velocity: -1.2 })).toBe(1);
  });

  it("does not treat a fast twitch as a flick", () => {
    expect(swipeTarget({ index: 0, dx: -6, width, velocity: -2 })).toBe(0);
  });

  it("cannot swipe off either end", () => {
    expect(swipeTarget({ index: 0, dx: 200, width })).toBe(0);
    expect(swipeTarget({ index: 3, dx: -200, width })).toBe(3);
  });
});
