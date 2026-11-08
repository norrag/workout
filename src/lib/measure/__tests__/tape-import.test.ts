import { describe, it, expect } from "vitest";
import {
  normalizeMeasurementImport,
  previewMeasurementImport,
} from "../tape-import";
const now = new Date("2026-11-08T01:00:00Z");
const session = {
  date: "2026-01-01",
  unit: "in" as const,
  readings: [{ site_key: "chest" as const, value: 40 }],
};
describe("measurement imports", () => {
  it("normalizes units, sorts dates and defaults to preview", () => {
    const { args, sessions } = normalizeMeasurementImport(
      {
        sessions: [
          { ...session, date: "2026-02-01" },
          {
            ...session,
            unit: "cm",
            readings: [{ site_key: "chest", value: 101.6 }],
          },
        ],
      },
      now,
    );
    expect(args.commit).toBe(false);
    expect(sessions[0].readings[0].value_in).toBe(40);
    expect(sessions[0].note).toBe("");
  });
  it("rejects invalid, duplicate, forged, future or oversize data", () => {
    for (const input of [
      { sessions: [] },
      { sessions: Array(101).fill(session) },
      { sessions: [session, session] },
      { sessions: [{ ...session, date: "2026-02-30" }] },
      { sessions: [{ ...session, date: "2026-11-09" }] },
      {
        sessions: [
          { ...session, readings: [{ site_key: "chest", value: 151 }] },
        ],
      },
      {
        sessions: [
          { ...session, readings: [{ site_key: "chest", value: 0.000001 }] },
        ],
      },
      {
        sessions: [
          { ...session, readings: [{ site_key: "chest", value: Infinity }] },
        ],
      },
      {
        sessions: [
          { ...session, readings: [...session.readings, ...session.readings] },
        ],
      },
      { sessions: [session], user_id: "someone" },
    ])
      expect(() => normalizeMeasurementImport(input as never, now)).toThrow();
  });
  it("uses explicit local offset rather than turning tonight into tomorrow", () => {
    expect(() =>
      normalizeMeasurementImport(
        {
          sessions: [{ ...session, date: "2026-11-08" }],
          utc_offset_minutes: -360,
        },
        now,
      ),
    ).toThrow(/future/);
    expect(
      normalizeMeasurementImport(
        {
          sessions: [{ ...session, date: "2026-11-08" }],
          utc_offset_minutes: 840,
        },
        now,
      ).sessions,
    ).toHaveLength(1);
  });
  it("checks backlogs chronologically and never treats a later reading as baseline", () => {
    const { sessions } = normalizeMeasurementImport(
      {
        sessions: [
          session,
          {
            ...session,
            date: "2026-02-01",
            readings: [{ site_key: "chest", value: 55 }],
          },
        ],
      },
      now,
    );
    const preview = previewMeasurementImport(sessions, []);
    expect(preview.warnings).toHaveLength(1);
    expect(preview.warnings[0]).toMatchObject({
      date: "2026-02-01",
      previous: { date: "2026-01-01", valueIn: 40 },
      reasons: ["change"],
    });
  });
});
