/**
 * R6 — the one date-display definition. Date-only values are calendar days
 * (anchored at local noon so they can never shift across timezones);
 * timestamps are real instants displayed in local time.
 */
import { describe, expect, it } from "vitest";
import {
  dateAtLocalNoon,
  localDayIso,
  shortDate,
  shortDateWithWeekday,
  shortDateWithYear,
} from "../dates";

describe("dateAtLocalNoon", () => {
  it("anchors a date-only value at local noon (never shifts a calendar day)", () => {
    const d = dateAtLocalNoon("2026-06-15");
    expect(d.getDate()).toBe(15);
    expect(d.getMonth()).toBe(5);
    expect(d.getHours()).toBe(12);
  });

  it("parses a timestamp as the real instant", () => {
    const d = dateAtLocalNoon("2026-06-15T23:30:00Z");
    expect(d.getTime()).toBe(Date.parse("2026-06-15T23:30:00Z"));
  });
});

describe("formatters", () => {
  it("renders the ledger date grammar", () => {
    expect(shortDate("2026-06-15")).toBe("15 JUN");
    expect(shortDateWithWeekday("2026-06-15")).toBe("MON 15 JUN");
    expect(shortDateWithYear("2026-06-15")).toBe("15 JUN '26");
  });
});

describe("localDayIso", () => {
  it("formats the device-local calendar day, zero-padded", () => {
    expect(localDayIso(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
