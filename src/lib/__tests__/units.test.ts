import { describe, it, expect } from "vitest";
import {
  isImperial,
  formatHeight,
  cmToFeetInches,
  feetInchesToCm,
  roundWeight,
  formatWeight,
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

  it("snaps weights to the nearest 0.5", () => {
    expect(roundWeight(19.92)).toBe(20);
    expect(roundWeight(22.4)).toBe(22.5);
    expect(roundWeight(6.8)).toBe(7);
    expect(roundWeight(45.36)).toBe(45.5);
  });

  it("formats a weight without a trailing .0", () => {
    expect(formatWeight(20.0)).toBe("20");
    expect(formatWeight(22.5)).toBe("22.5");
    expect(formatWeight(19.92)).toBe("20");
  });

  it("displays a clean lb↔kg↔lb toggle (stored stays finer than display)", () => {
    // mirrors the migration's round-to-0.1 storage + 0.5 display snap
    const r1 = (x: number) => Math.round(x * 10) / 10;
    for (const lb of [15, 20, 22.5, 25, 100, 135]) {
      const kg = r1(lb * 0.45359237);
      const back = r1(kg * 2.20462262);
      expect(formatWeight(back)).toBe(formatWeight(lb));
    }
  });
});
