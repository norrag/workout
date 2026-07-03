import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS, engineParamsSchema } from "../params";
import { V17_PARAMS } from "./helpers";

// R24 — doc 04 requires the schema gate to make a bad row unactivatable, but
// shape checks alone let semantic nonsense through. These are the cross-field
// invariants (superRefine): every stored row v1–v18 satisfies them (verified on
// hosted before shipping), so replayability is untouched.

describe("engineParamsSchema cross-field invariants (R24)", () => {
  it("accepts the defaults and the live v17 materialization", () => {
    expect(() => engineParamsSchema.parse(DEFAULT_ENGINE_PARAMS)).not.toThrow();
    expect(() => engineParamsSchema.parse(V17_PARAMS)).not.toThrow();
  });

  it("rejects an inverted rep window (target_high < target_low)", () => {
    const bad = {
      ...DEFAULT_ENGINE_PARAMS,
      rep_window: {
        ...DEFAULT_ENGINE_PARAMS.rep_window,
        hypertrophy: { target_low: 12, target_high: 8, min: 6, max: 15 },
      },
    };
    const res = engineParamsSchema.safeParse(bad);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(JSON.stringify(res.error.issues)).toMatch(/rep_window\.hypertrophy/);
    }
  });

  it("rejects hard bounds tighter than the target band (min > target_low)", () => {
    const bad = {
      ...DEFAULT_ENGINE_PARAMS,
      rep_window: {
        ...DEFAULT_ENGINE_PARAMS.rep_window,
        strength: { target_low: 3, target_high: 5, min: 4, max: 6 },
      },
    };
    expect(engineParamsSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects min_sets above max_sets_per_exercise", () => {
    const bad = { ...DEFAULT_ENGINE_PARAMS, min_sets: 7, max_sets_per_exercise: 6 };
    const res = engineParamsSchema.safeParse(bad);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(JSON.stringify(res.error.issues)).toMatch(/min_sets/);
    }
  });

  it("rejects a brzycki cutoff above the Epley/Brzycki crossing (10)", () => {
    // above 10 Brzycki > Epley, so a higher cutoff puts a downward jump in
    // k(effReps) — more reps would prescribe a heavier load (monotonicity
    // property in predict.test.ts). Every stored row is 10.
    const bad = {
      ...DEFAULT_ENGINE_PARAMS,
      e1rm: { ...DEFAULT_ENGINE_PARAMS.e1rm, brzycki_max_eff_reps: 14 },
    };
    expect(engineParamsSchema.safeParse(bad).success).toBe(false);
    const ok = {
      ...DEFAULT_ENGINE_PARAMS,
      e1rm: { ...DEFAULT_ENGINE_PARAMS.e1rm, brzycki_max_eff_reps: 10 },
    };
    expect(engineParamsSchema.safeParse(ok).success).toBe(true);
  });
});
