import { describe, it, expect } from "vitest";
import {
  prescribe,
  seedMeso,
  effectiveLoad,
  enteredForEffective,
  toEngineLoadType,
  coerceLoadType,
} from "@/lib/engine";
import { V15_PARAMS, V16_PARAMS, baseInputs } from "./helpers";

// ---------------------------------------------------------------------------
// load.ts — pure effective-load helpers
// ---------------------------------------------------------------------------

describe("toEngineLoadType / coerceLoadType", () => {
  it("maps the library equipment vocabulary to load types", () => {
    expect(toEngineLoadType("bodyweight only")).toBe("bodyweight_only");
    expect(toEngineLoadType("bodyweight loadable")).toBe("bodyweight_loadable");
    expect(toEngineLoadType("machine assistance")).toBe("bodyweight_assisted");
    expect(toEngineLoadType("barbell")).toBe("external");
    expect(toEngineLoadType("anything else")).toBe("external");
  });

  it("prefers a valid stored load_type, else derives from equipment", () => {
    expect(coerceLoadType("bodyweight_only", "barbell")).toBe("bodyweight_only");
    expect(coerceLoadType(null, "bodyweight loadable")).toBe("bodyweight_loadable");
    expect(coerceLoadType("garbage", "machine assistance")).toBe("bodyweight_assisted");
    expect(coerceLoadType(undefined, "cable")).toBe("external");
  });
});

describe("effectiveLoad / enteredForEffective", () => {
  it("external: effective = entered (bodyweight ignored)", () => {
    expect(effectiveLoad("external", 135, 180)).toBe(135);
    expect(enteredForEffective("external", 135, 180)).toBe(135);
  });

  it("bodyweight_only: effective = bodyweight; displayed load = bodyweight", () => {
    expect(effectiveLoad("bodyweight_only", 0, 180)).toBe(180);
    expect(enteredForEffective("bodyweight_only", 180, 180)).toBe(180);
  });

  it("bodyweight_loadable: effective = bodyweight + added (floored at 0)", () => {
    expect(effectiveLoad("bodyweight_loadable", 25, 180)).toBe(205);
    expect(enteredForEffective("bodyweight_loadable", 205, 180)).toBe(25);
    // a target below bodyweight can't be reached by adding plates ⇒ 0 added
    expect(enteredForEffective("bodyweight_loadable", 150, 180)).toBe(0);
  });

  it("bodyweight_assisted: effective = bodyweight − assist (the inverse of loadable)", () => {
    expect(effectiveLoad("bodyweight_assisted", 40, 180)).toBe(140);
    expect(enteredForEffective("bodyweight_assisted", 140, 180)).toBe(40);
    // assistance never drives the effective load negative
    expect(effectiveLoad("bodyweight_assisted", 250, 180)).toBe(0);
    // a target above bodyweight needs no assistance ⇒ 0 assist
    expect(enteredForEffective("bodyweight_assisted", 200, 180)).toBe(0);
  });

  it("returns null when a bodyweight type has no known bodyweight", () => {
    expect(effectiveLoad("bodyweight_only", 0, null)).toBeNull();
    expect(effectiveLoad("bodyweight_loadable", 25, null)).toBeNull();
    expect(enteredForEffective("bodyweight_assisted", 100, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// prescribe() — bodyweight model (v16). win = hypertrophy 8–12 (min 6, max 15).
// ---------------------------------------------------------------------------

const BW = 180;
function bwInputs(over: Parameters<typeof baseInputs>[0] = {}) {
  return baseInputs({
    goalType: "hypertrophy",
    week: { targetRir: 2, isDeload: false },
    previous: null,
    actualSets: [],
    bodyweight: BW,
    ...over,
  });
}

describe("prescribe — bodyweight_only", () => {
  it("prescribes the bodyweight as a (read-only) load and reps in the window", () => {
    const out = prescribe(
      bwInputs({
        exercise: { equipmentType: "bodyweight", loadType: "bodyweight_only" },
        strengthAnchor: { value: 230, confidence: "high" },
      }),
      V16_PARAMS,
    );
    expect(out.weight).toBe(BW); // the load IS the bodyweight
    const win = V16_PARAMS.rep_window.hypertrophy!;
    expect(out.reps).toBeGreaterThanOrEqual(win.min);
    expect(out.reps).toBeLessThanOrEqual(win.max);
    expect(out.rationale.toLowerCase()).toContain("bodyweight");
  });

  it("progresses on reps as the anchor rises (fixed load, more reps)", () => {
    const weak = prescribe(
      bwInputs({
        exercise: { equipmentType: "bodyweight", loadType: "bodyweight_only" },
        strengthAnchor: { value: 200, confidence: "high" },
      }),
      V16_PARAMS,
    );
    const strong = prescribe(
      bwInputs({
        exercise: { equipmentType: "bodyweight", loadType: "bodyweight_only" },
        strengthAnchor: { value: 280, confidence: "high" },
      }),
      V16_PARAMS,
    );
    expect(strong.reps!).toBeGreaterThanOrEqual(weak.reps!);
  });

  it("defers (null weight) when the lifter has no bodyweight on file", () => {
    const out = prescribe(
      bwInputs({
        exercise: { equipmentType: "bodyweight", loadType: "bodyweight_only" },
        strengthAnchor: { value: 230, confidence: "high" },
        bodyweight: null,
      }),
      V16_PARAMS,
    );
    expect(out.weight).toBeNull();
    expect(out.rationale.toLowerCase()).toContain("bodyweight");
  });
});

describe("prescribe — bodyweight_loadable / assisted", () => {
  it("loadable: prescribes the ADDED weight (rounded to step), reps in window", () => {
    const out = prescribe(
      bwInputs({
        exercise: { equipmentType: "bodyweight", loadType: "bodyweight_loadable" },
        strengthAnchor: { value: 250, confidence: "high" },
      }),
      V16_PARAMS,
    );
    expect(out.weight).not.toBeNull();
    expect(out.weight!).toBeGreaterThanOrEqual(0);
    expect(out.weight! % V16_PARAMS.rounding.bodyweight!).toBe(0); // clean plates
    const win = V16_PARAMS.rep_window.hypertrophy!;
    expect(out.reps!).toBeGreaterThanOrEqual(win.min);
    expect(out.reps!).toBeLessThanOrEqual(win.max);
    expect(out.rationale.toLowerCase()).toContain("added");
  });

  it("assisted: prescribes the ASSIST amount (≥ 0), reps in window", () => {
    const out = prescribe(
      bwInputs({
        exercise: { equipmentType: "machine", loadType: "bodyweight_assisted" },
        // a weaker effective lift than bodyweight ⇒ genuine assistance
        strengthAnchor: { value: 120, confidence: "high" },
      }),
      V16_PARAMS,
    );
    expect(out.weight).not.toBeNull();
    expect(out.weight!).toBeGreaterThanOrEqual(0);
    expect(out.rationale.toLowerCase()).toContain("assist");
  });

  it("defers when there is no anchor and no plan seed (never fabricate)", () => {
    const out = prescribe(
      bwInputs({
        exercise: { equipmentType: "bodyweight", loadType: "bodyweight_loadable" },
        strengthAnchor: null,
        initial: null,
      }),
      V16_PARAMS,
    );
    expect(out.weight).toBeNull();
    expect(out.rationale.toLowerCase()).toMatch(/enter a starting/);
  });
});

describe("bodyweight model gating", () => {
  it("is off under v15: a bodyweight_only lift does NOT price on bodyweight", () => {
    const inputs = bwInputs({
      exercise: { equipmentType: "bodyweight", loadType: "bodyweight_only" },
      strengthAnchor: { value: 230, confidence: "high" },
    });
    const off = prescribe(inputs, V15_PARAMS);
    expect(off.weight).not.toBe(BW); // legacy path, not the bodyweight load
    const on = prescribe(inputs, V16_PARAMS);
    expect(on.weight).toBe(BW);
  });
});

describe("seedMeso — bodyweight model", () => {
  it("seeds a bodyweight_only lift at the bodyweight load", () => {
    const out = seedMeso(
      null,
      null,
      { equipmentType: "bodyweight", loadType: "bodyweight_only" },
      { experienceLevel: "intermediate" },
      3,
      V16_PARAMS,
      { goalType: "hypertrophy", anchor: { value: 230, confidence: "high" }, bodyweight: BW },
    );
    expect(out.weight).toBe(BW);
    expect(out.rationale.toLowerCase()).toContain("bodyweight");
  });
});
