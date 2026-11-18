import { describe, expect, it } from "vitest";
import {
  TAPE_SITES,
  tapeSessionSchema,
  siteHistory,
  type TapeSession,
} from "../tape";
import { normalizeMeasurementImport } from "../tape-import";
import { tapeEntryWarnings, validTapeEntry } from "../tape-plausibility";
import { measurementUpdateArgs } from "@/lib/mcp/tools/measurement-mutate";
import { formatBodyMeasurements } from "@/lib/mcp/tools/measurements";
const old: TapeSession = {
  id: "11111111-1111-4111-8111-111111111111",
  measured_on: "2020-01-01",
  input_unit: "in",
  note: "",
  readings: [{ site_key: "chest", value_in: 40 }],
};
const first: TapeSession = {
  ...old,
  id: "22222222-2222-4222-8222-222222222222",
  measured_on: "2020-02-01",
  readings: [{ site_key: "shoulders", value_in: 48 }],
};
describe("shoulder circumference", () => {
  it("accepts a full 13-site capture, import and connector replacement", () => {
    const readings = TAPE_SITES.map((s) => ({
      site_key: s.key,
      value_in: s.key === "shoulders" ? 48 : 20,
    }));
    expect(readings).toHaveLength(13);
    expect(
      tapeSessionSchema.parse({ ...first, readings }).readings,
    ).toHaveLength(13);
    const input = readings.map((r) => ({
      site_key: r.site_key,
      value: r.value_in * 2.54,
    }));
    expect(
      normalizeMeasurementImport({
        sessions: [{ date: "2020-02-01", unit: "cm", readings: input }],
      }).sessions[0].readings,
    ).toEqual(readings);
    expect(
      measurementUpdateArgs.safeParse({
        session_id: first.id,
        changes: { readings: input },
      }).success,
    ).toBe(true);
  });
  it("keeps shoulders distinct from chest and absent in older records", () => {
    const next: TapeSession = {
      ...first,
      measured_on: "2020-03-01",
      readings: [
        { site_key: "shoulders", value_in: 48.5 },
        { site_key: "chest", value_in: 41 },
      ],
    };
    expect(
      siteHistory([old, first, next], "shoulders").map((r) => r.valueIn),
    ).toEqual([48, 48.5]);
    const data = formatBodyMeasurements([next, first, old], "in", false);
    expect(data.sessions[0].readings.map((r) => r.delta)).toEqual([0.5, 1]);
    expect(data.sessions[1].readings[0].delta).toBeNull();
    expect(old.readings).toEqual([{ site_key: "chest", value_in: 40 }]);
  });
  it("uses the same unit, broad typo and earlier-value review paths", () => {
    expect(validTapeEntry("121.92", "shoulders", "cm")).toBe(true);
    const next = {
      ...first,
      id: "33333333-3333-4333-8333-333333333333",
      measured_on: "2020-03-01",
      readings: [{ site_key: "shoulders" as const, value_in: 75 }],
    };
    expect(tapeEntryWarnings(next, [first])[0].reasons).toEqual(["change"]);
    expect(
      tapeEntryWarnings(
        { ...next, readings: [{ site_key: "shoulders", value_in: 5 }] },
        [first],
      )[0].reasons,
    ).toEqual(["range", "change"]);
    expect(TAPE_SITES.find((s) => s.key === "shoulders")?.guidance).toContain(
      "upper chest and back",
    );
  });
});
