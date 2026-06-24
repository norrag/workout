/**
 * Standalone-prescription investigation (docs/reviews/2026-06-23) — the gated
 * engine fixes S1 (anchor seed), S5 (rep-consistent hold + de-blunt dampener).
 * S3 (e1RM cutoff) is covered in e1rm.test.ts / reps.test.ts. Each behavior is
 * asserted against V11_PARAMS (flags on) AND shown unchanged under
 * DEFAULT_ENGINE_PARAMS (flags off) so the gate is real.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS, prescribe, seedMeso } from "../index";
import { estimateE1rm } from "../e1rm";
import { predictRepsAtWeight, impliedRirAtReps } from "../reps";
import type { EngineInputs } from "../types";
import { baseInputs, V11_PARAMS } from "./helpers";

const exercise = { equipmentType: "machine" as const };
const user = { experienceLevel: "intermediate" as const };

// the §2.4 leg-curl shape: a bad week-1 seed of 100×30, an inflated anchor, a
// fatigued-but-good session, target RIR stepping 3 → 2.
function legCurlHold(over: Partial<EngineInputs> = {}): EngineInputs {
  return baseInputs({
    exercise,
    goalType: "hypertrophy",
    week: { targetRir: 2, isDeload: false },
    previous: { weight: 100, reps: 30, sets: 2, targetRir: 3 },
    actualSets: [
      { setNumber: 1, weight: 100, reps: 20, rirReported: 3, isWarmup: false },
      { setNumber: 2, weight: 100, reps: 30, rirReported: 3, isWarmup: false },
    ],
    strengthAnchor: { value: 386, confidence: "low" },
    exerciseFeedback: { jointPain: 0, pump: 5, workload: 5 },
    workoutFeedback: { overallFatigue: 3, effortRating: 3, performanceRating: 3 },
    ...over,
  });
}

describe("§S5 — rep-consistent hold under a gate", () => {
  it("legacy clamps the held load's reps to the window ceiling (the dishonest @RIR)", () => {
    // pain gate fires → load held at 100; legacy re-derives reps from the inflated
    // anchor (predict ~34) clamped to max 15 → 100×15 @2, an implied RIR nowhere
    // near 2.
    const out = prescribe(
      legCurlHold({ exerciseFeedback: { jointPain: 2, pump: 5, workload: 5 } }),
      DEFAULT_ENGINE_PARAMS,
    );
    expect(out.weight).toBe(100);
    expect(out.reps).toBe(15); // clamped to the window ceiling
    // the triple is internally inconsistent: 100×15 implies ~19 RIR off a 386 anchor
    expect(impliedRirAtReps(386, 100, 15, DEFAULT_ENGINE_PARAMS)).toBeGreaterThan(10);
  });

  it("v11 holds the load and prescribes the Option-A schedule reps (held workload)", () => {
    const out = prescribe(
      legCurlHold({ exerciseFeedback: { jointPain: 2, pump: 5, workload: 5 } }),
      V11_PARAMS,
    );
    expect(out.weight).toBe(100);
    // prev reps 30 ≥ target_high(12) ⇒ schedule resets to target_low(8); the held
    // triple 100×8 @2 is internally consistent, not a ceiling-clamped 15
    expect(out.reps).toBe(8);
    expect(out.rationale).toMatch(/hold 100 lb, reps to 8/i);
  });

  it("v11 holds the effective workload across a normal +1 rep climb when gated", () => {
    // a clean 100×8 @3 prior, held by a pain gate while the RIR ramp drops to 2:
    // reps climb 8 → 9 at the held load (effective reps constant).
    const out = prescribe(
      baseInputs({
        exercise,
        goalType: "hypertrophy",
        week: { targetRir: 2, isDeload: false },
        previous: { weight: 100, reps: 8, sets: 2, targetRir: 3 },
        actualSets: [
          { setNumber: 1, weight: 100, reps: 8, rirReported: 3, isWarmup: false },
        ],
        strengthAnchor: { value: 300, confidence: "high" }, // wants more → blocked
        exerciseFeedback: { jointPain: 2, pump: 5, workload: 5 },
      }),
      V11_PARAMS,
    );
    expect(out.weight).toBe(100);
    expect(out.reps).toBe(9);
  });
});

describe("§S5 — de-blunt the session dampener", () => {
  // an anchor well above the held load wants a material increase
  function strong(over: Partial<EngineInputs> = {}): EngineInputs {
    return baseInputs({
      exercise,
      goalType: "hypertrophy",
      week: { targetRir: 2, isDeload: false },
      previous: { weight: 100, reps: 8, sets: 2, targetRir: 3 },
      actualSets: [
        { setNumber: 1, weight: 100, reps: 8, rirReported: 3, isWarmup: false },
      ],
      strengthAnchor: { value: 165, confidence: "high" },
      ...over,
    });
  }

  it("legacy (OR): a single high-fatigue rating with good performance blocks the increase", () => {
    const out = prescribe(
      strong({
        workoutFeedback: { overallFatigue: 3, effortRating: 3, performanceRating: 3 },
      }),
      DEFAULT_ENGINE_PARAMS,
    );
    expect(out.weight).toBe(100); // dampened, held
  });

  it("v11 (require both): fatigued-but-strong still reprices up", () => {
    const out = prescribe(
      strong({
        workoutFeedback: { overallFatigue: 3, effortRating: 3, performanceRating: 3 },
      }),
      V11_PARAMS,
    );
    expect(out.weight).toBeGreaterThan(100); // not dampened — increase lands
  });

  it("v11 still dampens when BOTH fatigue and poor performance are present", () => {
    const out = prescribe(
      strong({
        workoutFeedback: { overallFatigue: 3, effortRating: 1, performanceRating: 1 },
      }),
      V11_PARAMS,
    );
    expect(out.weight).toBe(100); // both signals → genuine hold
    expect(out.reps).toBe(9); // …with rep-consistent schedule reps
  });
});

describe("§S1 — seed week 1 from the strength anchor", () => {
  const anchor = { value: estimateE1rm(100, 8, 3, V11_PARAMS)!.value, confidence: "moderate" as const };
  // a fabricated all-time peak like v_exercise_prs used to hand seedMeso
  const priorPeak = { weight: 140, reps: 30, sets: 3 };

  it("legacy seed carries the peak's rep count verbatim (the runaway-reps bug)", () => {
    const out = seedMeso(priorPeak, null, exercise, user, 3, DEFAULT_ENGINE_PARAMS, {
      goalType: "hypertrophy",
      anchor,
    });
    expect(out.reps).toBe(30); // escapes the 6–15 window
    expect(out.weight).toBe(130); // 140 × 0.925 backoff
  });

  it("v11 seeds in-window reps from the anchor (≈ target_low at the start RIR)", () => {
    const out = seedMeso(priorPeak, null, exercise, user, 3, V11_PARAMS, {
      goalType: "hypertrophy",
      anchor,
    });
    expect(out.reps).toBeGreaterThanOrEqual(V11_PARAMS.rep_window.hypertrophy!.min);
    expect(out.reps).toBeLessThanOrEqual(V11_PARAMS.rep_window.hypertrophy!.max);
    expect(out.reps).toBeLessThanOrEqual(10); // near the window's low rep, not 30
    expect(out.rationale).toMatch(/seeded from strength anchor/i);
    // the seeded triple is internally consistent at the start RIR
    expect(predictRepsAtWeight(anchor.value, out.weight!, 3, V11_PARAMS)).toBe(out.reps);
  });

  it("v11 falls back to the legacy peak seed when there is no confident anchor", () => {
    const out = seedMeso(priorPeak, null, exercise, user, 3, V11_PARAMS, {
      goalType: "hypertrophy",
      anchor: null,
    });
    expect(out.reps).toBe(30); // no anchor ⇒ legacy peak-backoff seed
    expect(out.weight).toBe(130);
  });

  it("v11 falls back to plan defaults when there is neither a peak nor an anchor", () => {
    const out = seedMeso(
      null,
      { weight: 80, reps: 10, sets: 3 },
      exercise,
      user,
      3,
      V11_PARAMS,
      { goalType: "hypertrophy", anchor: null },
    );
    expect(out.weight).toBe(80);
    expect(out.reps).toBe(10);
  });
});
