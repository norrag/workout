import { describe, it, expect } from "vitest";
import { prescribe } from "../index";
import { predictRepsAtWeight, impliedRirAtReps } from "../reps";
import { DEFAULT_ENGINE_PARAMS } from "../params";
import { baseInputs, V14_PARAMS, V15_PARAMS } from "./helpers";

// A confident, strong anchor so rep-window selection engages (mirrors a lifter
// whose peak working sets were ~135×8). The deload week carries the deload RIR
// in `week.targetRir` (the rir ramp sets it from params.deload.target_rir).
const anchor = { value: 175, confidence: "high" as const };

function deloadInputs(params: typeof V15_PARAMS) {
  return baseInputs({
    goalType: "hypertrophy",
    week: { targetRir: params.deload.target_rir, isDeload: true },
    previous: { weight: 135, reps: 8, sets: 4, targetRir: 0 },
    weekPeak: { weight: 135, reps: 8, sets: 4, targetRir: 0 },
    strengthAnchor: anchor,
  });
}

describe("anchor-based deload (v15)", () => {
  it("prescribes a triple that is internally consistent: reps = predicted at the prescribed weight + deload RIR", () => {
    const out = prescribe(deloadInputs(V15_PARAMS), V15_PARAMS);
    expect(out.weight).not.toBeNull();
    const predicted = predictRepsAtWeight(
      anchor.value,
      out.weight!,
      out.targetRir,
      V15_PARAMS,
    );
    // the displayed predictor (same anchor, weight, RIR) reproduces the
    // prescribed reps — no disagreement between prescription and logging field.
    expect(out.reps).toBe(predicted);
    // and the implied RIR of the prescribed weight × reps is the deload RIR, not
    // some far-higher reserve the legacy heuristic produced.
    expect(
      impliedRirAtReps(anchor.value, out.weight!, out.reps!, V15_PARAMS),
    ).toBe(out.targetRir);
  });

  it("targets the deload RIR (~6) and lands reps centered in the goal window", () => {
    const out = prescribe(deloadInputs(V15_PARAMS), V15_PARAMS);
    expect(out.targetRir).toBe(6);
    const win = V15_PARAMS.rep_window.hypertrophy!;
    expect(out.reps!).toBeGreaterThanOrEqual(win.target_low);
    expect(out.reps!).toBeLessThanOrEqual(win.target_high);
  });

  it("is genuinely a deload: lighter than the same anchor's working-week load and with reduced sets", () => {
    const deload = prescribe(deloadInputs(V15_PARAMS), V15_PARAMS);
    // a working week at the same anchor/goal but a hard 1-RIR target
    const working = prescribe(
      baseInputs({
        goalType: "hypertrophy",
        week: { targetRir: 1, isDeload: false },
        previous: { weight: 135, reps: 8, sets: 4, targetRir: 1 },
        strengthAnchor: anchor,
      }),
      V15_PARAMS,
    );
    expect(deload.weight!).toBeLessThan(working.weight!);
    // half the peak sets (set_pct 0.5 of 4 = 2), floored at min_sets
    expect(deload.sets).toBe(2);
  });

  it("records the anchor in the trace/rationale (no load_pct heuristic)", () => {
    const out = prescribe(deloadInputs(V15_PARAMS), V15_PARAMS);
    expect(out.trace[0].rule).toBe("deload");
    expect(out.rationale).toContain("strength anchor");
    expect(out.rationale).not.toContain("% of peak load");
  });

  it("falls back to the legacy load_pct deload when there is no confident anchor", () => {
    const out = prescribe(
      { ...deloadInputs(V15_PARAMS), strengthAnchor: null },
      V15_PARAMS,
    );
    // legacy path: 55% of peak (135) rounded to barbell 5 = 75, carries peak reps
    expect(out.weight).toBe(75);
    expect(out.reps).toBe(8);
    expect(out.rationale).toContain("% of peak load");
  });
});

describe("legacy deload parity (flag off)", () => {
  it("v14 (deload_anchor_rir absent) keeps the load_pct heuristic even with a confident anchor", () => {
    const out = prescribe(deloadInputs(V14_PARAMS), V14_PARAMS);
    expect(out.weight).toBe(75); // 0.55 × 135 → 75
    expect(out.reps).toBe(8); // carries the peak reps
    expect(out.targetRir).toBe(V14_PARAMS.deload.target_rir); // 4
    expect(out.rationale).toContain("% of peak load");
  });

  it("DEFAULT params (production v10) are unchanged: legacy deload", () => {
    const out = prescribe(
      {
        ...deloadInputs(V15_PARAMS),
        week: { targetRir: DEFAULT_ENGINE_PARAMS.deload.target_rir, isDeload: true },
      },
      DEFAULT_ENGINE_PARAMS,
    );
    expect(out.weight).toBe(75);
    expect(out.reps).toBe(8);
  });
});
