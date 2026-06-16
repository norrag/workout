/** Live reps ⇄ weight ⇄ RIR linkage (doc 11) — pure helpers. */
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "../params";
import { estimateE1rm } from "../e1rm";
import {
  effectiveRepsForE1rm,
  predictRepsAtWeight,
  impliedRirAtReps,
  recencyWeightedE1rm,
  type E1rmSample,
} from "../reps";

const params = DEFAULT_ENGINE_PARAMS;

describe("effectiveRepsForE1rm (inverse of the averaged curve)", () => {
  it("round-trips the forward e1RM model", () => {
    // 100 × 8 @ 0 RIR → some e1RM; inverting at 100 returns ≈ 8 effective reps
    const e = estimateE1rm(100, 8, 0, params)!;
    const effReps = effectiveRepsForE1rm(e.value, 100, params);
    expect(effReps).toBeCloseTo(8, 1);
  });

  it("returns 0 at or above the estimated 1RM", () => {
    expect(effectiveRepsForE1rm(150, 150, params)).toBe(0);
    expect(effectiveRepsForE1rm(150, 160, params)).toBe(0);
  });

  it("is monotonic: lighter weight → more effective reps", () => {
    const e1rm = 150;
    const light = effectiveRepsForE1rm(e1rm, 100, params);
    const heavy = effectiveRepsForE1rm(e1rm, 130, params);
    expect(light).toBeGreaterThan(heavy);
  });
});

describe("predictRepsAtWeight", () => {
  it("reproduces the prescribed reps at the prescribed weight + RIR", () => {
    // anchor derived from 100 × 8 @ 2 RIR; predicting at 100 @ 2 RIR ⇒ ≈ 8
    const anchor = estimateE1rm(100, 8, 2, params)!.value;
    expect(predictRepsAtWeight(anchor, 100, 2, params)).toBe(8);
  });

  it("drops reps as the weight climbs", () => {
    const anchor = estimateE1rm(100, 8, 2, params)!.value;
    const at100 = predictRepsAtWeight(anchor, 100, 2, params)!;
    const at110 = predictRepsAtWeight(anchor, 110, 2, params)!;
    expect(at110).toBeLessThan(at100);
  });

  it("prescribes fewer reps for a lower target RIR at the same weight", () => {
    const anchor = estimateE1rm(100, 8, 2, params)!.value;
    const at2 = predictRepsAtWeight(anchor, 100, 2, params)!;
    const at0 = predictRepsAtWeight(anchor, 100, 0, params)!;
    expect(at0).toBeGreaterThan(at2); // 0 RIR ⇒ grind out more reps
  });

  it("clamps to at least 1 rep at very heavy loads", () => {
    const anchor = estimateE1rm(100, 8, 2, params)!.value;
    expect(predictRepsAtWeight(anchor, 200, 0, params)).toBe(1);
  });

  it("returns null without a usable anchor or weight", () => {
    expect(predictRepsAtWeight(null, 100, 2, params)).toBeNull();
    expect(predictRepsAtWeight(120, 0, 2, params)).toBeNull();
  });
});

describe("impliedRirAtReps (converse hint)", () => {
  it("recovers the target RIR at the prescribed weight/reps", () => {
    const anchor = estimateE1rm(100, 8, 2, params)!.value;
    expect(impliedRirAtReps(anchor, 100, 8, params)).toBe(2);
  });

  it("more reps at the same weight ⇒ lower implied RIR", () => {
    const anchor = estimateE1rm(100, 8, 2, params)!.value;
    const few = impliedRirAtReps(anchor, 100, 6, params)!;
    const many = impliedRirAtReps(anchor, 100, 10, params)!;
    expect(many).toBeLessThan(few);
  });
});

describe("recencyWeightedE1rm", () => {
  it("returns null with no usable samples", () => {
    expect(recencyWeightedE1rm([], params)).toBeNull();
  });

  it("weights recent sessions over old ones", () => {
    // an old strong set and a fresh weaker set: the anchor sits below the old
    // peak because recency pulls toward the fresh, lower estimate
    const old = estimateE1rm(120, 8, 2, params)!.value;
    const fresh = estimateE1rm(100, 8, 2, params)!.value;
    const samples: E1rmSample[] = [
      { weight: 120, reps: 8, targetRir: 2, ageDays: 90 },
      { weight: 100, reps: 8, targetRir: 2, ageDays: 0 },
    ];
    const anchor = recencyWeightedE1rm(samples, params)!;
    expect(anchor.value).toBeLessThan(old);
    expect(anchor.value).toBeGreaterThan(fresh);
    // and closer to the fresh estimate than the old one (3 half-lives apart)
    expect(Math.abs(anchor.value - fresh)).toBeLessThan(
      Math.abs(anchor.value - old),
    );
  });

  it("a single recent set anchors at that set's e1RM", () => {
    const expected = estimateE1rm(100, 8, 2, params)!;
    const anchor = recencyWeightedE1rm(
      [{ weight: 100, reps: 8, targetRir: 2, ageDays: 0 }],
      params,
    )!;
    expect(anchor.value).toBeCloseTo(expected.value, 1);
    expect(anchor.confidence).toBe(expected.confidence);
  });
});
