import { describe, it, expect } from "vitest";
import {
  parseTapeNumber,
  validTapeEntry,
  tapeEntryWarnings,
} from "../tape-plausibility";
import { toInches, type TapeSession } from "../tape";
const session = (
  date: string,
  key: "chest" | "upper_arm_left" | "upper_arm_right",
  value: number,
): TapeSession => ({
  id: date,
  measured_on: date,
  input_unit: "in",
  note: "",
  readings: [{ site_key: key, value_in: value }],
});

describe("tape entry checks", () => {
  it("checks decimal numbers only and clears completion for invalid/empty values", () => {
    for (const text of ["40", "40.5", "40.", " 40.5 "])
      expect(validTapeEntry(text, "chest", "in")).toBe(true);
    for (const text of [
      "",
      " ",
      "abc",
      "1e2",
      "0x20",
      "Infinity",
      "-2",
      "0",
      "405",
    ])
      expect(validTapeEntry(text, "chest", "in")).toBe(false);
    expect(parseTapeNumber(".5")).toBe(0.5);
  });
  it("handles units before validity/range checks", () => {
    expect(validTapeEntry("200", "chest", "cm")).toBe(true);
    const metric = session("2026-02-01", "chest", toInches(102.87, "cm"));
    expect(
      tapeEntryWarnings(metric, [session("2026-01-01", "chest", 40)]),
    ).toEqual([]);
  });
  it("flags broad site ranges without changing or rejecting the reading", () => {
    const reading = session("2026-02-01", "upper_arm_left", 1);
    expect(tapeEntryWarnings(reading, [])[0].reasons).toEqual(["range"]);
    expect(reading.readings[0].value_in).toBe(1);
  });
  it("needs both a large absolute and relative difference", () => {
    const old = session("2026-01-01", "upper_arm_left", 5);
    expect(
      tapeEntryWarnings(session("2026-02-01", "upper_arm_left", 6.1), [old]),
    ).toEqual([]);
    expect(
      tapeEntryWarnings(session("2026-02-01", "upper_arm_left", 8), [old])[0]
        .reasons,
    ).toContain("change");
    expect(
      tapeEntryWarnings(session("2026-02-01", "chest", 48), [
        session("2026-01-01", "chest", 40),
      ]),
    ).toEqual([]);
  });
  it("uses only the same side and latest strictly earlier dated observation", () => {
    const history = [
      session("2026-01-01", "upper_arm_left", 14),
      session("2026-02-01", "upper_arm_left", 16),
      session("2026-03-01", "upper_arm_left", 25),
      session("2026-01-15", "upper_arm_right", 29),
    ];
    expect(
      tapeEntryWarnings(session("2026-02-15", "upper_arm_left", 20), history)[0]
        .previous,
    ).toEqual({ date: "2026-02-01", valueIn: 16 });
    expect(
      tapeEntryWarnings(
        session("2026-02-15", "upper_arm_right", 20),
        history,
      )[0].previous?.valueIn,
    ).toBe(29);
  });
  it("keeps missing history missing and excludes the session being edited", () => {
    const current = session("2026-02-01", "chest", 40);
    expect(
      tapeEntryWarnings(current, [current, session("2026-03-01", "chest", 70)]),
    ).toEqual([]);
  });
});
