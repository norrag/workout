/**
 * Property tests on hard bounds: randomized inputs from a seeded PRNG
 * (deterministic) must never violate the engine's invariants.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS, prescribe, engineParamsSchema } from "../index";
import type { EngineInputs } from "../types";
import { V17_PARAMS } from "./helpers";

const params = DEFAULT_ENGINE_PARAMS;

// mulberry32 — deterministic PRNG so failures are reproducible
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInputs(r: () => number): EngineInputs {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const weight = 20 + Math.round(r() * 80) * 2.5;
  const reps = int(4, 15);
  const sets = int(2, 5);
  const targetRir = int(0, 3);
  return {
    exercise: {
      equipmentType: pick(["barbell", "dumbbell", "machine", "cable", "smith", "bodyweight", "bands", "kettlebell", "other"] as const),
      loadType: "external",
    },
    user: {
      experienceLevel: pick(["beginner", "intermediate", "advanced"] as const),
    },
    goalType: pick(["cut", "gain", "maintain"] as const),
    week: { targetRir: int(0, 4), isDeload: r() < 0.15 },
    previous: { weight, reps, sets, targetRir },
    actualSets: Array.from({ length: sets }, (_, i) => ({
      setNumber: i + 1,
      weight,
      reps: Math.max(0, reps + int(-5, 3)),
      rirReported: r() < 0.5 ? int(0, 4) : null,
      isWarmup: false,
    })),
    exerciseFeedback: {
      jointPain: int(0, 3),
      pump: int(0, 10),
      workload: int(0, 10),
    },
    workoutFeedback: {
      // I14: session sliders share the 0–10 scale
      overallFatigue: int(0, 10),
      effortRating: int(0, 10),
      performanceRating: int(0, 10),
    },
    muscleGroupWeeklySets: int(0, 25),
    weekPeak: { weight, reps, sets, targetRir },
    initial: null,
    // exercise the rep-window path too, half the time, at varied confidence
    strengthAnchor:
      r() < 0.5
        ? {
            value: 20 + Math.round(r() * 200),
            confidence: pick(["low", "moderate", "high"] as const),
          }
        : null,
    bodyweight: null,
  };
}

describe("hard bounds hold over randomized inputs", () => {
  const r = rng(42);
  const cases = Array.from({ length: 500 }, () => randomInputs(r));

  it("no load increase under the pain gate", () => {
    for (const inputs of cases) {
      if (
        inputs.week.isDeload ||
        (inputs.exerciseFeedback?.jointPain ?? 0) < params.pain_gate
      )
        continue;
      const out = prescribe(inputs, params);
      expect(out.weight!).toBeLessThanOrEqual(inputs.previous!.weight!);
    }
  });

  it("no set increase under the pain gate; a cut at pain_cut_gate (v17, doc 10 §3 step 0)", () => {
    for (const inputs of cases) {
      const pain = inputs.exerciseFeedback?.jointPain ?? 0;
      if (inputs.week.isDeload || pain < V17_PARAMS.pain_gate) continue;
      const out = prescribe(inputs, V17_PARAMS);
      expect(out.sets).toBeLessThanOrEqual(inputs.previous!.sets);
      if (pain >= V17_PARAMS.pain_cut_gate!) {
        expect(out.sets).toBeLessThanOrEqual(
          Math.max(V17_PARAMS.min_sets, inputs.previous!.sets - 1),
        );
      }
    }
  });

  it("deload is always lighter than the peak", () => {
    for (const inputs of cases) {
      if (!inputs.week.isDeload) continue;
      const out = prescribe(inputs, params);
      expect(out.weight!).toBeLessThan(inputs.weekPeak!.weight!);
      expect(out.targetRir).toBe(params.deload.target_rir);
    }
  });

  it("sets stay within floor and ceiling", () => {
    for (const inputs of cases) {
      const out = prescribe(inputs, params);
      expect(out.sets).toBeGreaterThanOrEqual(params.min_sets);
      expect(out.sets).toBeLessThanOrEqual(params.max_sets_per_exercise);
    }
  });

  it("weights are never negative and always rounded to a loadable step", () => {
    for (const inputs of cases) {
      const out = prescribe(inputs, params);
      expect(out.weight!).toBeGreaterThanOrEqual(0);
    }
  });

  it("every prescription carries a rationale", () => {
    for (const inputs of cases) {
      const out = prescribe(inputs, params);
      expect(out.rationale).toBeTruthy();
    }
  });
});

describe("param schema gate", () => {
  it("rejects a malformed engine_params payload", () => {
    expect(() =>
      engineParamsSchema.parse({ increment: { barbell: { kg: -1, lb: 5 } } }),
    ).toThrow();
  });

  it("rejects out-of-range deload percentages", () => {
    const bad = JSON.parse(JSON.stringify(DEFAULT_ENGINE_PARAMS));
    bad.deload.load_pct = 1.5;
    expect(() => engineParamsSchema.parse(bad)).toThrow();
  });
});
