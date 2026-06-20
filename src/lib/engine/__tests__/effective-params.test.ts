import { describe, it, expect } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "../params";
import { resolveEffectiveParams } from "../effective-params";
import { incrementFor } from "../rules/rounding";
import { prescribe } from "../index";
import type { EngineInputs } from "../types";

const P = DEFAULT_ENGINE_PARAMS;

describe("resolveEffectiveParams (doc 14 phase 3)", () => {
  it("returns the params unchanged when there is no override (referential, no churn)", () => {
    expect(resolveEffectiveParams(P, null, "barbell", "lb")).toBe(P);
    expect(resolveEffectiveParams(P, undefined, "barbell", "lb")).toBe(P);
    expect(
      resolveEffectiveParams(P, { weightIncrement: null }, "barbell", "lb"),
    ).toBe(P);
  });

  it("replaces only the target equipment's increment in the user's unit", () => {
    const eff = resolveEffectiveParams(P, { weightIncrement: 2.5 }, "barbell", "lb");
    // the barbell lb base increment is overridden…
    expect(eff.increment.barbell!.lb).toBe(2.5);
    // …while the OTHER unit and OTHER equipment are untouched
    expect(eff.increment.barbell!.kg).toBe(P.increment.barbell!.kg);
    expect(eff.increment.dumbbell).toEqual(P.increment.dumbbell);
  });

  it("does not mutate the input params", () => {
    const before = P.increment.barbell!.lb;
    resolveEffectiveParams(P, { weightIncrement: 99 }, "barbell", "lb");
    expect(P.increment.barbell!.lb).toBe(before);
  });

  it("composes with experience scaling exactly like the global increment", () => {
    // incrementFor multiplies the base by experience_increment_scale; an override
    // is the BASE (same level the global param sits at), so the scale still applies.
    const eff = resolveEffectiveParams(P, { weightIncrement: 4 }, "barbell", "lb");
    const scale = P.experience_increment_scale.advanced!; // 0.5 in defaults
    expect(incrementFor("barbell", "advanced", "lb", eff)).toBe(4 * scale);
  });

  it("changes the prescribed load on the legacy increment path", () => {
    // weight_selection=increment so the override actually moves a number; the
    // engine adds the (scaled) increment on a met prescription.
    const legacy = { ...P, weight_selection: "increment" as const };
    const inputs: EngineInputs = {
      exercise: { equipmentType: "barbell" },
      user: { experienceLevel: "intermediate", units: "lb" },
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
    };
    const base = prescribe(inputs, legacy); // intermediate scale = 1.0 ⇒ +5 default
    const overridden = prescribe(
      inputs,
      resolveEffectiveParams(legacy, { weightIncrement: 10 }, "barbell", "lb"),
    );
    expect(base.weight).toBe(105);
    expect(overridden.weight).toBe(110);
  });
});
