import { describe, it, expect } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "../params";
import { resolveEffectiveParams } from "../effective-params";
import { prescribe, seedMeso } from "../index";

const P = DEFAULT_ENGINE_PARAMS;

describe("resolveEffectiveParams (doc 14 phase 3)", () => {
  it("returns the params unchanged when there is no override (referential, no churn)", () => {
    expect(resolveEffectiveParams(P, null, "barbell")).toBe(P);
    expect(resolveEffectiveParams(P, undefined, "barbell")).toBe(P);
    expect(
      resolveEffectiveParams(P, { weightIncrement: null }, "barbell"),
    ).toBe(P);
  });

  it("sets the loadable step (rounding) for only the target equipment", () => {
    const eff = resolveEffectiveParams(P, { weightIncrement: 25 }, "barbell");
    // the override IS the loadable step the engine rounds every weight to
    expect(eff.rounding.barbell).toBe(25);
    // other equipment is untouched
    expect(eff.rounding.dumbbell).toEqual(P.rounding.dumbbell);
    // T-I4: the override no longer touches the retired legacy `increment` param
    expect(eff.increment.barbell).toBe(P.increment.barbell);
  });

  it("does not mutate the input params", () => {
    const beforeRound = P.rounding.barbell;
    resolveEffectiveParams(P, { weightIncrement: 99 }, "barbell");
    expect(P.rounding.barbell).toBe(beforeRound);
  });

  it("rounds an ANCHORED rep_window advance to the override step (the live path)", () => {
    // under the active params load is priced off the strength anchor, then rounded
    // to the loadable step — so the override must move the prescribed weight here.
    const inputs = {
      exercise: { equipmentType: "barbell" as const, loadType: "external" as const },
      user: { experienceLevel: "intermediate" as const },
      goalType: "hypertrophy" as const,
      week: { targetRir: 2, isDeload: false },
      previous: { weight: 225, reps: 8, sets: 3, targetRir: 2 },
      actualSets: [
        { setNumber: 1, weight: 225, reps: 8, rirReported: 2, isWarmup: false },
        { setNumber: 2, weight: 225, reps: 8, rirReported: 2, isWarmup: false },
      ],
      exerciseFeedback: null,
      workoutFeedback: null,
      muscleGroupWeeklySets: null,
      weekPeak: null,
      strengthAnchor: { value: 315, confidence: "high" as const },
      initial: null,
      bodyweight: null,
    };
    const eff = resolveEffectiveParams(P, { weightIncrement: 25 }, "barbell");
    const out = prescribe(inputs, eff);
    expect(out.weight! % 25).toBe(0); // loadable in 25s
  });

  it("seeds a manual weight on the LIFTER'S OWN value under an override (N67)", () => {
    // T-I4: the prior-peak seed is retired; the seed precedence is anchor → the
    // user's manual `initial_*` → unseeded. Pre-N67 an override snapped that
    // manual seed onto absolute multiples of the step (315 → 325 in 25s); the
    // lattice now indexes off the entered weight, so the seed IS what the
    // lifter typed and the 25 lb steps run 290 / 315 / 340 off it.
    const eff = resolveEffectiveParams(P, { weightIncrement: 25 }, "barbell");
    const out = seedMeso(
      null,
      { weight: 315, reps: 8, sets: 3 },
      { equipmentType: "barbell", loadType: "external" },
      { experienceLevel: "intermediate" },
      2,
      eff,
    );
    expect(out.weight).toBe(315);

    // the step really is 25 — pinning the lattice back to absolute proves it
    const absolute = seedMeso(
      null,
      { weight: 315, reps: 8, sets: 3 },
      { equipmentType: "barbell", loadType: "external" },
      { experienceLevel: "intermediate" },
      2,
      { ...eff, rounding_origin: "absolute" as const },
    );
    expect(absolute.weight).toBe(325);
  });
});
