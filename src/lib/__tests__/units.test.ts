import { describe, it, expect } from "vitest";
import {
  formatHeight,
  inchesToFeetInches,
  feetInchesToInches,
  roundWeight,
  formatWeight,
} from "../units";

describe("units (imperial-only)", () => {
  it("formats a stored inches height as feet′inches″", () => {
    expect(formatHeight(70)).toBe("5′10″");
    expect(formatHeight(72)).toBe("6′0″");
    expect(formatHeight(null)).toBeNull();
  });

  it("splits inches into whole feet + inches", () => {
    expect(inchesToFeetInches(70)).toEqual({ feet: 5, inches: 10 });
    expect(inchesToFeetInches(72)).toEqual({ feet: 6, inches: 0 });
  });

  it("builds canonical inches from feet + inches", () => {
    expect(feetInchesToInches(5, 10)).toBe(70);
    expect(feetInchesToInches(6, 0)).toBe(72);
  });

  it("round-trips inches ↔ ft/in exactly", () => {
    for (const inches of [59, 65, 70, 75, 79]) {
      const { feet, inches: rem } = inchesToFeetInches(inches);
      expect(feetInchesToInches(feet, rem)).toBe(inches);
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
});
