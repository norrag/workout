import { describe, it, expect } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "../params";
import { resolveEffectiveParams } from "../effective-params";
import { incrementFor } from "../rules/rounding";
import { prescribe, seedMeso } from "../index";
import type { EngineInputs } from "../types";

const P = DEFAULT_ENGINE_PARAMS;

describe("resolveEffectiveParams (doc 14 phase 3)", () => {
  it("returns the params unchanged when there is no override (referential, no churn)", () => {
    expect(resolveEffectiveParams(P, null, "barbell")).toBe(P);
    expect(resolveEffectiveParams(P, undefined, "barbell")).toBe(P);
    expect(
      resolveEffectiveParams(P, { weightIncrement: null }, "barbell"),
    ).toBe(P);
  });

  it("sets the loadable step (rounding) AND the legacy increment for only the target equipment", () => {
    const eff = resolveEffectiveParams(P, { weightIncrement: 25 }, "barbell");
    // the override IS the loadable step the engine rounds every weight to
    expect(eff.rounding.barbell).toBe(25);
    expect(eff.increment.barbell).toBe(25);
    // …while OTHER equipment is untouched, both maps
    expect(eff.rounding.dumbbell).toEqual(P.rounding.dumbbell);
    expect(eff.increment.dumbbell).toEqual(P.increment.dumbbell);
  });

  it("does not mutate the input params", () => {
    const beforeRound = P.rounding.barbell;
    const beforeInc = P.increment.barbell;
    resolveEffectiveParams(P, { weightIncrement: 99 }, "barbell");
    expect(P.rounding.barbell).toBe(beforeRound);
    expect(P.increment.barbell).toBe(beforeInc);
  });

  it("composes the legacy increment with experience scaling exactly like the global increment", () => {
    // incrementFor multiplies the base by experience_increment_scale; an override
    // is the BASE (same level the global param sits at), so the scale still applies.
    const eff = resolveEffectiveParams(P, { weightIncrement: 4 }, "barbell");
    const scale = P.experience_increment_scale.advanced!; // 0.5 in defaults
    expect(incrementFor("barbell", "advanced", eff)).toBe(4 * scale);
  });

  it("rounds an ANCHORED rep_window advance to the override step (the v9 path that matters)", () => {
    // under the active params load is priced off the strength anchor, then rounded
    // to the loadable step — so the override must move the prescribed weight here.
    const inputs: EngineInputs = {
      exercise: { equipmentType: "barbell", loadType: "external" },
      user: { experienceLevel: "intermediate" },
      goalType: "hypertrophy",
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
      strengthAnchor: { value: 315, confidence: "high" },
      initial: null,
      bodyweight: null,
    };
    const eff = resolveEffectiveParams(P, { weightIncrement: 25 }, "barbell");
    const out = prescribe(inputs, eff);
    expect(out.weight! % 25).toBe(0); // loadable in 25s
  });

  it("rounds a meso SEED to the override step", () => {
    // seedMeso backs off the prior peak then rounds — the override sets that step.
    const eff = resolveEffectiveParams(P, { weightIncrement: 25 }, "barbell");
    const out = seedMeso(
      { weight: 315, reps: 5, sets: 3 },
      null,
      { equipmentType: "barbell", loadType: "external" },
      { experienceLevel: "intermediate" },
      2,
      eff,
    );
    expect(out.weight! % 25).toBe(0);
    // and it differs from the default 5lb-rounded seed (the override actually bit)
    const def = seedMeso(
      { weight: 315, reps: 5, sets: 3 },
      null,
      { equipmentType: "barbell", loadType: "external" },
      { experienceLevel: "intermediate" },
      2,
      P,
    );
    expect(out.weight).not.toBe(def.weight);
  });

  it("changes the prescribed load on the legacy increment path", () => {
    // weight_selection=increment so the override actually moves a number; the
    // engine adds the (scaled) increment on a met prescription.
    const legacy = { ...P, weight_selection: "increment" as const };
    const inputs: EngineInputs = {
      exercise: { equipmentType: "barbell", loadType: "external" },
      user: { experienceLevel: "intermediate" },
      goalType: "hypertrophy",
      week: { targetRir: 2, isDeload: false },
      previous: { weight: 100, reps: 8, sets: 3, targetRir: 2 },
      actualSets: [
        { setNumber: 1, weight: 100, reps: 8, rirReported: 2, isWarmup: false },
        { setNumber: 2, weight: 100, reps: 8, rirReported: 2, isWarmup: false },
      ],
      exerciseFeedback: null,
      workoutFeedback: null,
      muscleGroupWeeklySets: null,
      weekPeak: null,
      strengthAnchor: null,
      initial: null,
      bodyweight: null,
    };
    const base = prescribe(inputs, legacy); // intermediate scale = 1.0 ⇒ +5 default
    const overridden = prescribe(
      inputs,
      resolveEffectiveParams(legacy, { weightIncrement: 10 }, "barbell"),
    );
    expect(base.weight).toBe(105);
    expect(overridden.weight).toBe(110);
  });
});
