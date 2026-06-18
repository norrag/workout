import { describe, it, expect } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "@/lib/engine";
import {
  pickSessionE1rm,
  segmentPhases,
  analyzeComparableProgress,
  matchedRirComparison,
  phaseGoals,
  CONFIDENCE_WEIGHT,
  type ExerciseSession,
} from "../comparability";

const P = DEFAULT_ENGINE_PARAMS;

function session(over: Partial<ExerciseSession>): ExerciseSession {
  return {
    performed_on: "2026-01-01",
    mesocycle_id: "m1",
    meso_name: "Block",
    goal_type: "hypertrophy",
    target_rir: 1,
    e1rm: 100,
    confidence: "high",
    top_weight: 100,
    top_reps: 8,
    top_rir: 1,
    working_sets: 3,
    ...over,
  };
}

// --- pickSessionE1rm -------------------------------------------------------

describe("pickSessionE1rm", () => {
  it("returns null when no set yields an estimate", () => {
    expect(pickSessionE1rm([{ weight: 0, reps: 0, rir: 1 }], P)).toBeNull();
    expect(pickSessionE1rm([], P)).toBeNull();
  });

  it("prefers the strongest set within the most trustworthy tier ([10] §1)", () => {
    // A: 100×5 @ rir1 → effReps 6, HIGH confidence, e1RM ≈ 118
    // B: 60×20 @ rir4 → effReps 24, LOW confidence, but a bigger raw number ≈ 137
    const pick = pickSessionE1rm(
      [
        { weight: 100, reps: 5, rir: 1 },
        { weight: 60, reps: 20, rir: 4 },
      ],
      P,
    )!;
    expect(pick.confidence).toBe("high");
    expect(pick.top_weight).toBe(100);
    // a high-confidence set is chosen even though the low one estimates higher
    expect(pick.value).toBeLessThan(130);
  });

  it("falls back to a low-confidence set when that's all there is", () => {
    const pick = pickSessionE1rm([{ weight: 60, reps: 20, rir: 4 }], P)!;
    expect(pick.confidence).toBe("low");
  });

  it("treats an unreported RIR as low confidence", () => {
    const pick = pickSessionE1rm([{ weight: 100, reps: 5, rir: null }], P)!;
    expect(pick.confidence).toBe("low");
  });
});

// --- segmentPhases ---------------------------------------------------------

describe("segmentPhases", () => {
  it("splits into contiguous goal_type runs", () => {
    const segs = segmentPhases([
      session({ performed_on: "2026-01-01", goal_type: "cut", e1rm: 50 }),
      session({ performed_on: "2026-02-01", goal_type: "cut", e1rm: 48 }),
      session({ performed_on: "2026-03-01", goal_type: "hypertrophy", e1rm: 40 }),
      session({ performed_on: "2026-04-01", goal_type: "hypertrophy", e1rm: 44 }),
    ]);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ goal_type: "cut", sessions: 2, best_e1rm: 50 });
    expect(segs[1]).toMatchObject({
      goal_type: "hypertrophy",
      sessions: 2,
      first_e1rm: 40,
      best_e1rm: 44,
      latest_e1rm: 44,
    });
    expect(segs[1].span).toEqual({ from: "2026-03-01", to: "2026-04-01" });
  });
});

// --- analyzeComparableProgress --------------------------------------------

describe("analyzeComparableProgress", () => {
  it("reports insufficient data for fewer than two estimable points", () => {
    expect(analyzeComparableProgress([]).trend).toBe("insufficient_data");
    expect(analyzeComparableProgress([session({ e1rm: 100 })]).trend).toBe("insufficient_data");
  });

  it("flags a clean improving trend", () => {
    const out = analyzeComparableProgress([
      session({ performed_on: "2026-05-01", e1rm: 100 }),
      session({ performed_on: "2026-05-08", e1rm: 105 }),
      session({ performed_on: "2026-05-15", e1rm: 110 }),
      session({ performed_on: "2026-05-22", e1rm: 120 }),
    ]);
    expect(out.trend).toBe("improving");
    expect(out.stalled).toBe(false);
    expect(out.best_e1rm).toBe(120);
    expect(out.rolling_e1rm).toBe(120);
  });

  it("flags a plateau when the recent window sets no new best", () => {
    const out = analyzeComparableProgress([
      session({ e1rm: 100 }),
      session({ e1rm: 120 }),
      session({ e1rm: 120 }),
      session({ e1rm: 119 }),
      session({ e1rm: 120 }),
    ]);
    expect(out.trend).toBe("plateau");
    expect(out.stalled).toBe(true);
  });

  it("flags a decline only when the recent peak sits below the phase best", () => {
    const out = analyzeComparableProgress([
      session({ e1rm: 100 }),
      session({ e1rm: 130 }),
      session({ e1rm: 125 }),
      session({ e1rm: 110 }),
      session({ e1rm: 108 }),
    ]);
    expect(out.trend).toBe("declining");
    expect(out.stalled).toBe(true);
  });

  it("does not read an alternating day-slot sawtooth as declining (12 §Stage 3 #1)", () => {
    const saw = (date: string, e1rm: number) =>
      session({ performed_on: date, e1rm, confidence: "moderate" });
    const out = analyzeComparableProgress([
      saw("2026-05-01", 33),
      saw("2026-05-04", 27),
      saw("2026-05-08", 33),
      saw("2026-05-11", 27),
      saw("2026-05-15", 33),
      saw("2026-05-18", 27),
    ]);
    expect(out.trend).not.toBe("declining");
    expect(out.rolling_e1rm).toBe(33);
  });

  it("scopes the headline to the current phase (12 §Stage 3 #2)", () => {
    const out = analyzeComparableProgress([
      session({ performed_on: "2026-01-01", goal_type: "cut", e1rm: 49 }),
      session({ performed_on: "2026-02-01", goal_type: "cut", e1rm: 48 }),
      session({ performed_on: "2026-05-01", goal_type: "hypertrophy", e1rm: 30 }),
      session({ performed_on: "2026-05-08", goal_type: "hypertrophy", e1rm: 30 }),
    ]);
    expect(out.goal_type).toBe("hypertrophy");
    expect(out.sessions).toBe(2);
    expect(out.best_e1rm).toBe(30); // not the 49 from the cut
  });

  it("down-weights a low-confidence spike out of the phase best (12 §Stage 3 #3)", () => {
    const out = analyzeComparableProgress([
      session({ e1rm: 100, confidence: "high" }),
      session({ e1rm: 100, confidence: "high" }),
      session({ e1rm: 140, confidence: "low" }),
    ]);
    // the trustworthy best is 100; a lone low-confidence 140 doesn't define it
    expect(out.best_e1rm).toBe(100);
    expect(out.confidence_mix).toEqual({ high: 2, moderate: 0, low: 1 });
  });
});

// --- matchedRirComparison --------------------------------------------------

describe("matchedRirComparison", () => {
  it("compares current vs previous meso at matched prescribed RIR (decision #2)", () => {
    const out = matchedRirComparison([
      session({ mesocycle_id: "m1", meso_name: "Cut", goal_type: "cut", target_rir: 1, e1rm: 50 }),
      session({ mesocycle_id: "m1", meso_name: "Cut", goal_type: "cut", target_rir: 2, e1rm: 45 }),
      session({
        mesocycle_id: "m2",
        meso_name: "Bulk",
        goal_type: "hypertrophy",
        target_rir: 1,
        e1rm: 40,
      }),
      session({
        mesocycle_id: "m2",
        meso_name: "Bulk",
        goal_type: "hypertrophy",
        target_rir: 2,
        e1rm: 38,
      }),
    ]);
    expect(out).toHaveLength(2);
    const rir1 = out.find((c) => c.target_rir === 1)!;
    expect(rir1.current.e1rm).toBe(40);
    expect(rir1.previous.e1rm).toBe(50);
    expect(rir1.delta_pct).toBeCloseTo(-20, 1);
    expect(rir1.cross_phase).toBe(true);
  });

  it("returns nothing without a comparable pair", () => {
    expect(matchedRirComparison([session({ mesocycle_id: "m1" })])).toEqual([]);
  });
});

// --- helpers ---------------------------------------------------------------

describe("phaseGoals + CONFIDENCE_WEIGHT", () => {
  it("lists distinct goal_types oldest → newest", () => {
    expect(
      phaseGoals([
        session({ goal_type: "cut" }),
        session({ goal_type: "cut" }),
        session({ goal_type: "hypertrophy" }),
      ]),
    ).toEqual(["cut", "hypertrophy"]);
  });

  it("ranks confidence weights high > moderate > low", () => {
    expect(CONFIDENCE_WEIGHT.high).toBeGreaterThan(CONFIDENCE_WEIGHT.moderate);
    expect(CONFIDENCE_WEIGHT.moderate).toBeGreaterThan(CONFIDENCE_WEIGHT.low);
  });
});
