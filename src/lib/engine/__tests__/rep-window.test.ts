/**
 * Rep-window prescription (doc 13 + §9 amendments): anchor-driven weight
 * selection, Option-A double progression, RIR grading, per-goal windows, and the
 * mode gate. All run against DEFAULT_ENGINE_PARAMS (v9: rep_window + rir +
 * session_best); the legacy increment path stays covered by prescribe.test.ts.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS, prescribe } from "../index";
import { estimateE1rm } from "../e1rm";
import type { EngineInputs } from "../types";
import { baseInputs } from "./helpers";

const params = DEFAULT_ENGINE_PARAMS;
// anchor that lands 100 lb ≈ 8 reps at 3 RIR — i.e. flat strength for the start
const flatAnchor = {
  value: estimateE1rm(100, 8, 3, params)!.value,
  confidence: "moderate" as const,
};

function repWeek(over: Partial<EngineInputs> = {}): EngineInputs {
  return baseInputs({ strengthAnchor: flatAnchor, ...over });
}

describe("rep-window — Option-A schedule (reps climb, load held at flat strength)", () => {
  it("holds the weight and steps reps up as the RIR ramp descends", () => {
    // week 2 (target 2 RIR) off a clean 100×8 @3
    const w2 = prescribe(repWeek({ week: { targetRir: 2, isDeload: false } }), params);
    expect(w2.weight).toBe(100); // load held, not +5
    expect(w2.reps).toBe(9); // reps climb 8 → 9
    expect(w2.targetRir).toBe(2);

    // week 3 (target 1) off the 100×9 @2 the engine just wrote
    const w3 = prescribe(
      repWeek({
        week: { targetRir: 1, isDeload: false },
        previous: { weight: 100, reps: 9, sets: 3, targetRir: 2 },
        actualSets: [
          { setNumber: 1, weight: 100, reps: 9, rirReported: 2, isWarmup: false },
          { setNumber: 2, weight: 100, reps: 9, rirReported: 2, isWarmup: false },
        ],
      }),
      params,
    );
    expect(w3.weight).toBe(100);
    expect(w3.reps).toBe(10);
  });

  it("reads as a held-load / rep-climb rationale, not a +increment", () => {
    const out = prescribe(repWeek({ week: { targetRir: 2, isDeload: false } }), params);
    expect(out.rationale).toMatch(/hold 100 lb/i);
    expect(out.rationale).toMatch(/anchor e1RM/);
  });
});

describe("rep-window — anchor catches overperformance", () => {
  it("reprices the load up when the strength anchor sits above the held weight", () => {
    // a sandbagger whose true e1RM is much higher than 100 lb × 8 implies
    const strong = { value: 165, confidence: "high" as const };
    const out = prescribe(
      repWeek({ strengthAnchor: strong, week: { targetRir: 2, isDeload: false } }),
      params,
    );
    expect(out.weight).toBeGreaterThan(100); // pulled up toward real strength
    expect(out.reps).toBeGreaterThanOrEqual(params.rep_window.gain!.min);
    expect(out.reps).toBeLessThanOrEqual(params.rep_window.gain!.max);
  });

  it("a bigger anchor ⇒ a heavier prescription (monotonic)", () => {
    const lo = prescribe(repWeek({ strengthAnchor: { value: 150, confidence: "high" } }), params);
    const hi = prescribe(repWeek({ strengthAnchor: { value: 180, confidence: "high" } }), params);
    expect(hi.weight!).toBeGreaterThan(lo.weight!);
  });
});

describe("rep-window — per-goal windows", () => {
  it("strength goal prescribes inside the low (3–5) window", () => {
    const out = prescribe(
      repWeek({
        goalType: "strength",
        week: { targetRir: 2, isDeload: false },
        previous: { weight: 120, reps: 4, sets: 3, targetRir: 3 },
        actualSets: [
          { setNumber: 1, weight: 120, reps: 4, rirReported: 3, isWarmup: false },
        ],
        strengthAnchor: { value: estimateE1rm(120, 4, 3, params)!.value, confidence: "high" },
      }),
      params,
    );
    expect(out.reps!).toBeGreaterThanOrEqual(params.rep_window.strength!.min);
    expect(out.reps!).toBeLessThanOrEqual(params.rep_window.strength!.max);
  });

  it("same anchor: hypertrophy prescribes more reps than strength", () => {
    const anchor = { value: 150, confidence: "high" as const };
    const hyp = prescribe(repWeek({ goalType: "hypertrophy", strengthAnchor: anchor }), params);
    const str = prescribe(
      repWeek({
        goalType: "strength",
        strengthAnchor: anchor,
        previous: { weight: 120, reps: 4, sets: 3, targetRir: 3 },
        actualSets: [{ setNumber: 1, weight: 120, reps: 4, rirReported: 3, isWarmup: false }],
      }),
      params,
    );
    expect(hyp.reps!).toBeGreaterThan(str.reps!);
  });
});

describe("rep-window — bounds & grading", () => {
  it("prescribed reps always stay inside the window's hard bounds", () => {
    for (const value of [120, 140, 160, 200, 260]) {
      const out = prescribe(repWeek({ strengthAnchor: { value, confidence: "high" } }), params);
      expect(out.reps!).toBeGreaterThanOrEqual(params.rep_window.gain!.min);
      expect(out.reps!).toBeLessThanOrEqual(params.rep_window.gain!.max);
    }
  });

  it("a harder-than-asked set is held, never graded a miss", () => {
    // anchor implies 100×8 was already ~0 RIR though 3 was prescribed → harder
    const out = prescribe(
      repWeek({
        strengthAnchor: { value: 120, confidence: "high" },
        week: { targetRir: 3, isDeload: false },
      }),
      params,
    );
    expect(out.rationale).toMatch(/held, not a miss/);
  });
});

describe("rep-window — seeding & fallback", () => {
  it("seeds a swap-in (history but no previous) from the strength anchor", () => {
    const out = prescribe(
      repWeek({
        previous: null,
        actualSets: [],
        strengthAnchor: { value: 150, confidence: "high" },
        week: { targetRir: 3, isDeload: false },
      }),
      params,
    );
    expect(out.weight).not.toBeNull();
    expect(out.weight!).toBeGreaterThan(0);
    expect(out.reps!).toBeGreaterThanOrEqual(params.rep_window.gain!.min);
    expect(out.rationale).toMatch(/seeded from strength anchor/i);
  });

  it("with no anchor, holds the load (T-I4: legacy increment path retired)", () => {
    const out = prescribe(baseInputs(), params); // no strengthAnchor
    expect(out.weight).toBe(100); // hold, no fabricated +increment
    expect(out.rationale).toMatch(/not enough recent data to reprice/i);
  });

  it("below min_confidence, holds the load (no shaky-anchor repricing)", () => {
    const strict = { ...params, reps_predict: { min_confidence: "high" as const } };
    const out = prescribe(
      repWeek({ strengthAnchor: { value: 160, confidence: "moderate" } }),
      strict,
    );
    // the moderate anchor is below the `high` floor → no rep-window repricing → hold
    expect(out.weight).toBe(100);
  });
});
