import { describe, it, expect } from "vitest";
import {
  MCP_SCHEMA_VERSION,
  FEEDBACK_SCALES,
  envelope,
  toolResult,
  feedbackCoverage,
} from "../envelope";

describe("envelope", () => {
  it("wraps data with schema_version, generated_at, units, data_quality", () => {
    const e = envelope({ a: 1 }, { units: "lb" });
    expect(e.schema_version).toBe(MCP_SCHEMA_VERSION);
    expect(e.units).toBe("lb");
    expect(e.data).toEqual({ a: 1 });
    expect(e.data_quality).toBeNull();
    expect(typeof e.generated_at).toBe("string");
    expect(Number.isNaN(Date.parse(e.generated_at))).toBe(false);
  });

  it("defaults units and data_quality to null", () => {
    const e = envelope({});
    expect(e.units).toBeNull();
    expect(e.data_quality).toBeNull();
  });
});

describe("toolResult", () => {
  it("returns text + structuredContent that both carry the envelope", () => {
    const r = toolResult({ ok: true }, { units: "kg" });
    expect(r.structuredContent.schema_version).toBe(MCP_SCHEMA_VERSION);
    expect((r.structuredContent.data as Record<string, unknown>).ok).toBe(true);
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.units).toBe("kg");
    expect(parsed.data.ok).toBe(true);
  });
});

describe("feedbackCoverage", () => {
  it("reports sample counts, denominator, and the scale ranges", () => {
    const dq = feedbackCoverage(
      { joint_pain: 60, pump: 60, overall_fatigue: 15, performance: null },
      16,
    );
    expect(dq.samples).toEqual({
      joint_pain: 60,
      pump: 60,
      overall_fatigue: 15,
      performance: 0,
    });
    expect(dq.denominator).toBe(16);
    expect(dq.scales).toBe(FEEDBACK_SCALES);
  });
});
