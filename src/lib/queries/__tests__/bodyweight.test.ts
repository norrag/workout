/**
 * doc 17 §5 (N41 Phase 4) — the bodyweight series' pure folds: same-day
 * resolution, the ±14-day bracketing tolerance behind the retrospective's
 * mass verdict, and the create-flow priming normalization. The Supabase I/O
 * (append/upsert, cross-user RLS) lives in tests/rls/rls.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  BRACKET_TOLERANCE_DAYS,
  MIN_RATE_SPAN_DAYS,
  bodyDeltaForSpan,
  measuredRatePctMonth,
  resolveDailyBodyweight,
  type BodyweightPoint,
} from "../bodyweight";
import { macroRetrospective } from "../macro-retrospective";

const point = (
  measured_on: string,
  weight: number,
  source: BodyweightPoint["source"] = "manual",
  created_at = `${measured_on}T10:00:00Z`,
): BodyweightPoint => ({ measured_on, weight, source, created_at });

describe("resolveDailyBodyweight — one point per day", () => {
  it("keeps distinct days and sorts by day", () => {
    const daily = resolveDailyBodyweight([
      point("2026-03-05", 201),
      point("2026-03-01", 200),
    ]);
    expect(daily.map((p) => p.measured_on)).toEqual([
      "2026-03-01",
      "2026-03-05",
    ]);
  });

  it("the latest same-day entry wins across sources (doc 17 §5)", () => {
    // profile edit in the morning, quick entry after the evening weigh-in —
    // the later manual point is the day's measurement
    const daily = resolveDailyBodyweight([
      point("2026-03-01", 205, "profile", "2026-03-01T08:00:00Z"),
      point("2026-03-01", 202, "manual", "2026-03-01T20:00:00Z"),
    ]);
    expect(daily).toHaveLength(1);
    expect(daily[0].weight).toBe(202);
    expect(daily[0].source).toBe("manual");
  });

  it("created_at ties break deterministically by source rank", () => {
    const t = "2026-03-01T08:00:00Z";
    const daily = resolveDailyBodyweight([
      point("2026-03-01", 205, "profile", t),
      point("2026-03-01", 202, "manual", t),
      point("2026-03-01", 204, "dexa", t),
    ]);
    expect(daily[0].source).toBe("manual");
  });
});

describe("bodyDeltaForSpan — the mass verdict's bracketing fold", () => {
  const spanStart = "2026-01-10T18:00:00Z";
  const spanEnd = "2026-04-10T18:00:00Z";

  it("points at both endpoints measure the delta", () => {
    const delta = bodyDeltaForSpan(
      [point("2026-01-10", 200), point("2026-04-10", 206.5)],
      spanStart,
      spanEnd,
    );
    expect(delta).toEqual({ measuredDeltaLb: 6.5, source: "bodyweight_log" });
  });

  it("a point within the ±14-day tolerance brackets; one outside does not", () => {
    // 14 days before the span starts — still brackets
    const inside = bodyDeltaForSpan(
      [point("2025-12-27", 200), point("2026-04-10", 204)],
      spanStart,
      spanEnd,
    );
    expect(inside?.measuredDeltaLb).toBe(4);

    // 15 days out — outside the window, no verdict
    const outside = bodyDeltaForSpan(
      [point("2025-12-26", 200), point("2026-04-10", 204)],
      spanStart,
      spanEnd,
    );
    expect(outside).toBeNull();
    expect(BRACKET_TOLERANCE_DAYS).toBe(14);
  });

  it("needs BOTH endpoints — a mid-block series doesn't grade", () => {
    expect(
      bodyDeltaForSpan(
        [point("2026-02-10", 202), point("2026-03-01", 203)],
        spanStart,
        spanEnd,
      ),
    ).toBeNull();
  });

  it("one measurement can't measure a change (same day resolves both ends)", () => {
    // a short span where a single point sits within tolerance of both endpoints
    expect(
      bodyDeltaForSpan(
        [point("2026-01-15", 200)],
        "2026-01-10T18:00:00Z",
        "2026-01-20T18:00:00Z",
      ),
    ).toBeNull();
  });

  it("the nearest qualifying point per endpoint wins", () => {
    const delta = bodyDeltaForSpan(
      [
        point("2026-01-05", 199), // 5 days out
        point("2026-01-11", 200), // 1 day out — nearer
        point("2026-04-08", 205), // 2 days out — nearer
        point("2026-04-20", 207), // 10 days out
      ],
      spanStart,
      spanEnd,
    );
    expect(delta?.measuredDeltaLb).toBe(5);
  });

  it("flips the retrospective's mass row from 'not measured' to a graded Δbw", () => {
    const contract = {
      goalType: "hypertrophy",
      targetLow: 3,
      targetHigh: 8,
      targetUnit: "lb",
      targetDirection: "gain",
    };
    const strength = {
      estStrengthPct: null,
      qualifyingLifts: 0,
      minQualifyingLifts: 3,
      muscles: [],
    };
    const adherence = {
      adherencePct: null,
      sessionsLogged: 0,
      totalVolume: 0,
    };
    const blocks = { completed: 1, abandoned: 0, notBuilt: 0 };

    const unmeasured = macroRetrospective(
      contract,
      strength,
      null,
      adherence,
      blocks,
      bodyDeltaForSpan([], spanStart, spanEnd),
    );
    expect(unmeasured.mass).toMatchObject({ measured: false, verdict: null });

    const measured = macroRetrospective(
      contract,
      strength,
      null,
      adherence,
      blocks,
      bodyDeltaForSpan(
        [point("2026-01-10", 200), point("2026-04-10", 206.5)],
        spanStart,
        spanEnd,
      ),
    );
    expect(measured.mass).toMatchObject({
      measured: true,
      measuredDeltaLb: 6.5,
      verdict: "within band",
    });
  });
});

describe("measuredRatePctMonth — the create-flow priming normalization", () => {
  it("normalizes the block headline to %/mo over the logged span", () => {
    // 91.32 days = 3 mean months; +6% over it → +2%/mo
    expect(
      measuredRatePctMonth(6, "2026-01-01T12:00:00Z", "2026-04-02T19:41:00Z"),
    ).toBeCloseTo(2, 0);
  });

  it("null without a headline or span (no completed prior block ⇒ no line)", () => {
    expect(measuredRatePctMonth(null, "2026-01-01", "2026-04-01")).toBeNull();
    expect(measuredRatePctMonth(6, null, "2026-04-01")).toBeNull();
    expect(measuredRatePctMonth(6, "2026-01-01", null)).toBeNull();
  });

  it("a span under the minimum can't denominate a monthly rate", () => {
    expect(MIN_RATE_SPAN_DAYS).toBe(28);
    expect(measuredRatePctMonth(6, "2026-01-01", "2026-01-27")).toBeNull();
    expect(measuredRatePctMonth(6, "2026-01-01", "2026-01-29")).not.toBeNull();
  });
});
