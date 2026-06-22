import { describe, it, expect } from "vitest";
import {
  isImperial,
  formatHeight,
  cmToFeetInches,
  feetInchesToCm,
} from "../units";

describe("units (PH28)", () => {
  it("treats lb as imperial, kg as metric", () => {
    expect(isImperial("lb")).toBe(true);
    expect(isImperial("kg")).toBe(false);
    expect(isImperial(null)).toBe(false);
    expect(isImperial(undefined)).toBe(false);
  });

  it("formats height in the chosen system", () => {
    expect(formatHeight(178, "kg")).toBe("178 CM");
    expect(formatHeight(178, "lb")).toBe("5′10″");
    expect(formatHeight(null, "lb")).toBeNull();
    expect(formatHeight(null, "kg")).toBeNull();
  });

  it("splits cm into whole feet + inches", () => {
    expect(cmToFeetInches(178)).toEqual({ feet: 5, inches: 10 });
    // 183cm ≈ 72in = exactly 6'0"
    expect(cmToFeetInches(183)).toEqual({ feet: 6, inches: 0 });
  });

  it("builds canonical cm from feet + inches", () => {
    expect(feetInchesToCm(5, 10)).toBe(178);
    expect(feetInchesToCm(6, 0)).toBe(183);
  });

  it("round-trips cm ↔ ft/in within a cm", () => {
    for (const cm of [150, 165, 178, 190, 200]) {
      const { feet, inches } = cmToFeetInches(cm);
      expect(Math.abs(feetInchesToCm(feet, inches) - cm)).toBeLessThanOrEqual(1);
    }
  });
});
