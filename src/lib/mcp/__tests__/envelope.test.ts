import { describe, it, expect } from "vitest";
import {
  MCP_SCHEMA_VERSION,
  FEEDBACK_SCALES,
  envelope,
  toolResult,
  feedbackCoverage,
  scaleLegend,
  toStructuredError,
  toolError,
  roundTo,
  round1,
} from "../envelope";

describe("envelope", () => {
  it("wraps data with schema_version, generated_at, units, data_quality", () => {
    const e = envelope({ a: 1 });
    expect(e.schema_version).toBe(MCP_SCHEMA_VERSION);
    expect(e.units).toBe("lb");
    expect(e.data).toEqual({ a: 1 });
    expect(e.data_quality).toBeNull();
    expect(typeof e.generated_at).toBe("string");
    expect(Number.isNaN(Date.parse(e.generated_at))).toBe(false);
  });

  it("always reports units as lb and defaults data_quality to null", () => {
    const e = envelope({});
    expect(e.units).toBe("lb");
    expect(e.data_quality).toBeNull();
  });
});

describe("toolResult", () => {
  it("returns text + structuredContent that both carry the envelope", () => {
    const r = toolResult({ ok: true });
    expect(r.structuredContent.schema_version).toBe(MCP_SCHEMA_VERSION);
    expect((r.structuredContent.data as Record<string, unknown>).ok).toBe(true);
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.units).toBe("lb");
    expect(parsed.data.ok).toBe(true);
  });
});

describe("toStructuredError", () => {
  it("serializes a PostgREST-shaped error object (no more [object Object], §5.6)", () => {
    const e = toStructuredError({
      code: "PGRST116",
      message: "URI too long",
      details: "the query string exceeded the limit",
      hint: "use a smaller filter",
    });
    expect(e).toEqual({
      code: "PGRST116",
      message: "URI too long",
      detail: "the query string exceeded the limit",
    });
  });

  it("serializes a thrown Error with its name as the code", () => {
    const e = toStructuredError(new TypeError("boom"));
    expect(e.code).toBe("TypeError");
    expect(e.message).toBe("boom");
    expect(e.detail).toBeNull();
  });

  it("falls back to String() for primitives", () => {
    expect(toStructuredError("nope")).toEqual({
      code: "tool_error",
      message: "nope",
      detail: null,
    });
  });
});

describe("toolError", () => {
  it("flags isError and carries a structured error body", () => {
    const r = toolError({ message: "bad" });
    expect(r.isError).toBe(true);
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error.message).toBe("bad");
    expect((r.structuredContent.error as Record<string, unknown>).message).toBe("bad");
    // crucially: never the opaque stringified object the SDK would emit
    expect(r.content[0].text).not.toContain("[object Object]");
  });
});

describe("scaleLegend", () => {
  it("returns only the requested scales (§5.3)", () => {
    const legend = scaleLegend("overall_fatigue", "effort_rating", "performance_rating");
    expect(legend).toEqual({
      overall_fatigue: FEEDBACK_SCALES.overall_fatigue,
      effort_rating: FEEDBACK_SCALES.effort_rating,
      performance_rating: FEEDBACK_SCALES.performance_rating,
    });
    // does not leak scales the tool never reports
    expect(legend).not.toHaveProperty("joint_pain");
    expect(legend).not.toHaveProperty("pump");
  });
});

describe("roundTo / round1 (§5.7)", () => {
  it("rounds to the requested precision and strips float noise", () => {
    expect(round1(73.33333333333333)).toBe(73.3);
    expect(round1(5.1230769230769235)).toBe(5.1);
    expect(roundTo(137773.123456, 2)).toBe(137773.12);
    expect(roundTo(27, 0)).toBe(27);
  });

  it("passes null/undefined through (null-safe)", () => {
    expect(round1(null)).toBeNull();
    expect(round1(undefined)).toBeNull();
    expect(roundTo(null)).toBeNull();
  });

  it("leaves non-finite values alone", () => {
    expect(round1(Infinity)).toBe(Infinity);
    expect(Number.isNaN(round1(NaN) as number)).toBe(true);
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
