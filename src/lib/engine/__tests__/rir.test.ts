import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "../params";
import { rirRamp } from "../rules/rir";

const params = DEFAULT_ENGINE_PARAMS;

describe("rirRamp", () => {
  it("5 weeks with deload: 3 → 0 across 4 working weeks, then deload", () => {
    expect(rirRamp(5, true, 3, 0, params)).toEqual([
      { weekNumber: 1, targetRir: 3, isDeload: false },
      { weekNumber: 2, targetRir: 2, isDeload: false },
      { weekNumber: 3, targetRir: 1, isDeload: false },
      { weekNumber: 4, targetRir: 0, isDeload: false },
      { weekNumber: 5, targetRir: 4, isDeload: true },
    ]);
  });

  it("4 weeks without deload peaks at 0 RIR in the final week", () => {
    const ramp = rirRamp(4, false, 3, 0, params);
    expect(ramp).toHaveLength(4);
    expect(ramp[0].targetRir).toBe(3);
    expect(ramp.at(-1)).toEqual({ weekNumber: 4, targetRir: 0, isDeload: false });
  });

  it("3 weeks with deload compresses the ramp into 2 working weeks", () => {
    const ramp = rirRamp(3, true, 3, 0, params);
    expect(ramp.map((w) => w.targetRir)).toEqual([3, 0, 4]);
    expect(ramp[2].isDeload).toBe(true);
  });

  it("rejects invalid week counts and inverted ramps", () => {
    expect(() => rirRamp(2, false, 3, 0, params)).toThrow();
    expect(() => rirRamp(7, false, 3, 0, params)).toThrow();
    expect(() => rirRamp(4, false, 0, 3, params)).toThrow();
  });
});
