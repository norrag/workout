import { describe, expect, it } from "vitest";
import {
  compareTapeSessions,
  daySpan,
  nextMonthlyDate,
  siteHistory,
  tapeDelta,
  tapeSessionSchema,
  tapeValue,
  toInches,
  todayAtOffset,
  type TapeSession,
} from "../tape";

const first: TapeSession = {
  id: "a1a1a1a1-1111-4111-8111-111111111111",
  measured_on: "2026-01-31",
  input_unit: "in",
  note: "",
  readings: [
    { site_key: "upper_arm_left", value_in: 14 },
    { site_key: "waist_navel", value_in: 34 },
  ],
};
const second: TapeSession = {
  ...first,
  id: "b1b1b1b1-1111-4111-8111-111111111111",
  measured_on: "2026-02-28",
  readings: [
    { site_key: "upper_arm_left", value_in: 14.5 },
    { site_key: "upper_arm_right", value_in: 15 },
  ],
};

describe("tape facts", () => {
  it("accepts partial sessions without inventing missing sites", () =>
    expect(tapeSessionSchema.parse(second).readings).toHaveLength(2));
  it.each([0, -1, 151, Infinity, NaN])(
    "rejects invalid circumference %s",
    (value_in) =>
      expect(
        tapeSessionSchema.safeParse({
          ...first,
          readings: [{ site_key: "chest", value_in }],
        }).success,
      ).toBe(false),
  );
  it("rejects empty sessions and duplicate sites", () => {
    expect(
      tapeSessionSchema.safeParse({ ...first, readings: [] }).success,
    ).toBe(false);
    expect(
      tapeSessionSchema.safeParse({
        ...first,
        readings: [first.readings[0], first.readings[0]],
      }).success,
    ).toBe(false);
  });
  it.each(["2026-02-30", "2025-02-29", "2026-13-01", "1899-01-01"])(
    "rejects impossible/unsupported day %s",
    (measured_on) =>
      expect(
        tapeSessionSchema.safeParse({ ...first, measured_on }).success,
      ).toBe(false),
  );
  it("compares only matched site and side, over explicit dates", () => {
    expect(compareTapeSessions(second, first).map((r) => r.deltaIn)).toEqual([
      0.5,
      null,
    ]);
    expect(daySpan(first.measured_on, second.measured_on)).toBe(28);
  });
  it("does not fill gaps or merge left and right histories", () => {
    expect(
      siteHistory([second, first], "upper_arm_left").map((r) => r.valueIn),
    ).toEqual([14, 14.5]);
    expect(siteHistory([second, first], "upper_arm_right")).toHaveLength(1);
    expect(siteHistory([second, first], "waist_navel")).toHaveLength(1);
  });
  it("unit conversion preserves the physical quantity and a negative zero stays neutral", () => {
    expect(toInches(35.56, "cm")).toBe(14);
    expect(tapeValue(14, "cm")).toBe("35.56");
    expect(tapeDelta(-0.00001, "in")).toBe("0.00");
    expect(tapeDelta(0.5, "in")).toBe("+0.50");
  });
  it("monthly check dates clamp to month end, including leap years", () => {
    expect(nextMonthlyDate("2026-01-31")).toBe("2026-02-28");
    expect(nextMonthlyDate("2028-01-31")).toBe("2028-02-29");
    expect(nextMonthlyDate("2026-12-31")).toBe("2027-01-31");
  });
  it("checks future dates against the device's timezone using the server's clock", () => {
    const now = new Date("2026-11-06T23:30:00Z");
    expect(todayAtOffset(now, -120)).toBe("2026-11-07");
    expect(todayAtOffset(now, 480)).toBe("2026-11-06");
  });
});
