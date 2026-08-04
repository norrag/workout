import { describe, it, expect } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "@/lib/engine";
import {
  pickSessionE1rm,
  segmentPhases,
  analyzeComparableProgress,
  matchedRirComparison,
  analyzeByDaySlot,
  fatiguePosition,
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
    backed_off: false,
    e1rm: 100,
    confidence: "high",
    top_weight: 100,
    top_reps: 8,
    top_rir: 1,
    working_sets: 3,
    day_number: 1,
    day_label: null,
    session_position: 1,
    session_size: 4,
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

  it("reads a short phase's trend within the window instead of asserting improvement (R9)", () => {
    // ≤ window points: rolling == best, prior is empty — before R9 every
    // short phase (i.e. every phase start) reported "improving"
    const decline = analyzeComparableProgress([
      session({ performed_on: "2026-05-01", e1rm: 120 }),
      session({ performed_on: "2026-05-08", e1rm: 110 }),
      session({ performed_on: "2026-05-15", e1rm: 100 }),
    ]);
    expect(decline.trend).toBe("declining");

    const climb = analyzeComparableProgress([
      session({ performed_on: "2026-05-01", e1rm: 100 }),
      session({ performed_on: "2026-05-08", e1rm: 110 }),
      session({ performed_on: "2026-05-15", e1rm: 120 }),
    ]);
    expect(climb.trend).toBe("improving");

    const flat = analyzeComparableProgress([
      session({ performed_on: "2026-05-01", e1rm: 100 }),
      session({ performed_on: "2026-05-08", e1rm: 101 }),
      session({ performed_on: "2026-05-15", e1rm: 100 }),
    ]);
    expect(flat.trend).toBe("plateau");

    // two points are enough for an honest within-window read
    const twoPointDrop = analyzeComparableProgress([
      session({ performed_on: "2026-05-01", e1rm: 120 }),
      session({ performed_on: "2026-05-08", e1rm: 100 }),
    ]);
    expect(twoPointDrop.trend).toBe("declining");
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

// --- analyzeByDaySlot (Stage 5) --------------------------------------------

describe("analyzeByDaySlot", () => {
  it("splits a movement's two day-slots into clean series instead of a pooled sawtooth", () => {
    // the Dumbbell Curl: Day 1 flat at ~33, Day 3 flat at ~27. Pooled they
    // alternate; per-slot each is flat (a plateau, never a decline).
    const d = (date: string, day: number, e1rm: number) =>
      session({ performed_on: date, day_number: day, e1rm, confidence: "moderate" });
    const slots = analyzeByDaySlot([
      d("2026-05-01", 1, 33),
      d("2026-05-04", 3, 27),
      d("2026-05-08", 1, 33),
      d("2026-05-11", 3, 27),
      d("2026-05-15", 1, 33),
      d("2026-05-18", 3, 27),
    ]);
    expect(slots).toHaveLength(2);
    const day1 = slots.find((s) => s.day_number === 1)!;
    const day3 = slots.find((s) => s.day_number === 3)!;
    expect(day1.sessions).toBe(3);
    expect(day1.progress.trend).not.toBe("declining");
    expect(day1.progress.rolling_e1rm).toBe(33);
    expect(day3.progress.rolling_e1rm).toBe(27);
  });

  it("drops slots below the minimum session count and ignores null day_number", () => {
    const slots = analyzeByDaySlot([
      session({ day_number: 1, e1rm: 100 }),
      session({ day_number: 1, e1rm: 102 }),
      session({ day_number: 2, e1rm: 80 }), // only one session on day 2 → dropped
      session({ day_number: null, e1rm: 90 }), // no day-slot → ignored
    ]);
    expect(slots.map((s) => s.day_number)).toEqual([1]);
  });

  it("averages the performed position per slot", () => {
    const slots = analyzeByDaySlot([
      session({ day_number: 1, e1rm: 100, session_position: 2 }),
      session({ day_number: 1, e1rm: 101, session_position: 4 }),
    ]);
    expect(slots[0].avg_position).toBe(3);
  });
});

// --- fatiguePosition (Stage 5) ---------------------------------------------

describe("fatiguePosition", () => {
  it("summarises a stable session position", () => {
    const out = fatiguePosition([
      session({ session_position: 2, session_size: 6 }),
      session({ session_position: 2, session_size: 6 }),
      session({ session_position: 3, session_size: 6 }),
    ]);
    expect(out.sessions).toBe(3);
    expect(out.avg_position).toBeCloseTo(2.3, 1);
    expect(out.min_position).toBe(2);
    expect(out.max_position).toBe(3);
    expect(out.avg_session_size).toBe(6);
    expect(out.varies).toBe(false);
  });

  it("flags a movement trained at variable session depth", () => {
    const out = fatiguePosition([
      session({ session_position: 2 }),
      session({ session_position: 5 }), // fresh some weeks, deep others
    ]);
    expect(out.varies).toBe(true);
  });

  it("is empty-safe when no position is known", () => {
    const out = fatiguePosition([session({ session_position: null })]);
    expect(out).toMatchObject({ sessions: 0, avg_position: null, varies: false });
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

// ---------------------------------------------------------------------------
// doc 21 §6 (Phase 5) — the read-side series obeys the same two rules the
// stamp does: the measuring band (§6.1) and the assumed-RIR resolution (§2)
// ---------------------------------------------------------------------------

describe("pickSessionE1rm — the measuring band (§6.1)", () => {
  const BAND = {
    ...P,
    e1rm: { ...P.e1rm, max_measuring_rir: 8 },
  };

  it("ignores a set priced past the band — it was never a measurement", () => {
    // a rehab slot at RIR 21: priced and performed, but ~70% assumption
    const pick = pickSessionE1rm(
      [
        { weight: 170, reps: 9, rir: 21 },
        { weight: 200, reps: 8, rir: 2 },
      ],
      BAND,
    );
    expect(pick!.top_weight).toBe(200);
  });

  it("a session made ONLY of non-measuring sets yields no estimate at all", () => {
    expect(pickSessionE1rm([{ weight: 170, reps: 9, rir: 21 }], BAND)).toBeNull();
  });

  it("with the param absent nothing is excluded — today's behavior", () => {
    expect(pickSessionE1rm([{ weight: 170, reps: 9, rir: 21 }], P)).not.toBeNull();
  });

  it("a set INSIDE the band still counts, however far from failure", () => {
    // §5: a backed-off set is RIR-adjusted and therefore comparable — the band
    // is about fabrication, not about effort
    expect(pickSessionE1rm([{ weight: 180, reps: 9, rir: 8 }], BAND)).not.toBeNull();
  });
});
