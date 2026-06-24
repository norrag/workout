/** Live reps ⇄ weight ⇄ RIR linkage (doc 11) — pure helpers. */
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "../params";
import { estimateE1rm } from "../e1rm";
import {
  effectiveRepsForE1rm,
  predictRepsAtWeight,
  weightForRepsAtRir,
  impliedRirAtReps,
  recencyWeightedE1rm,
  type E1rmSample,
} from "../reps";
import { V11_PARAMS } from "./helpers";

const params = DEFAULT_ENGINE_PARAMS; // anchor_method = session_best (v9)
const meanParams = {
  ...params,
  e1rm: { ...params.e1rm, anchor_method: "mean" as const },
};
const bestParams = {
  ...params,
  e1rm: { ...params.e1rm, anchor_method: "best" as const },
};

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

  it("mean: weights recent sessions over old ones", () => {
    // an old strong set and a fresh weaker set: the anchor sits below the old
    // peak because recency pulls toward the fresh, lower estimate
    const old = estimateE1rm(120, 8, 2, meanParams)!.value;
    const fresh = estimateE1rm(100, 8, 2, meanParams)!.value;
    const samples: E1rmSample[] = [
      { weight: 120, reps: 8, targetRir: 2, ageDays: 90 },
      { weight: 100, reps: 8, targetRir: 2, ageDays: 0 },
    ];
    const anchor = recencyWeightedE1rm(samples, meanParams)!;
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

  it("best: takes the recency-weighted single max set", () => {
    const samples: E1rmSample[] = [
      { weight: 100, reps: 8, targetRir: 2, ageDays: 0 },
      { weight: 110, reps: 8, targetRir: 2, ageDays: 0 },
      { weight: 90, reps: 8, targetRir: 2, ageDays: 0 },
    ];
    const anchor = recencyWeightedE1rm(samples, bestParams)!;
    const top = estimateE1rm(110, 8, 2, bestParams)!.value;
    expect(anchor.value).toBeCloseTo(top, 1);
  });

  it("session_best: averages the blow-out set's session, taming a fluke", () => {
    // a sandbagged session that finally goes hard: one huge set then two
    // diminished ones. `best` would anchor on the 20-rep fluke; `session_best`
    // averages the whole session so it lands between.
    const session = "we-1";
    const samples: E1rmSample[] = [
      { weight: 190, reps: 20, targetRir: 0, ageDays: 0, sessionKey: session },
      { weight: 190, reps: 12, targetRir: 0, ageDays: 0, sessionKey: session },
      { weight: 190, reps: 8, targetRir: 0, ageDays: 0, sessionKey: session },
    ];
    const sessionBest = recencyWeightedE1rm(samples, params)!.value;
    const rawBest = recencyWeightedE1rm(samples, bestParams)!.value;
    const meanOfSession =
      (estimateE1rm(190, 20, 0, params)!.value +
        estimateE1rm(190, 12, 0, params)!.value +
        estimateE1rm(190, 8, 0, params)!.value) /
      3;
    expect(sessionBest).toBeCloseTo(meanOfSession, 1);
    expect(sessionBest).toBeLessThan(rawBest); // tempered vs the lone fluke
  });

  it("session_best: only averages within the best set's session", () => {
    const samples: E1rmSample[] = [
      // strongest session (recent)
      { weight: 150, reps: 5, targetRir: 1, ageDays: 1, sessionKey: "A" },
      { weight: 150, reps: 4, targetRir: 1, ageDays: 1, sessionKey: "A" },
      // an unrelated lighter session the same week must not dilute it
      { weight: 90, reps: 12, targetRir: 1, ageDays: 0, sessionKey: "B" },
    ];
    const anchor = recencyWeightedE1rm(samples, params)!.value;
    const sessionAMean =
      (estimateE1rm(150, 5, 1, params)!.value +
        estimateE1rm(150, 4, 1, params)!.value) /
      2;
    expect(anchor).toBeCloseTo(sessionAMean, 1);
  });
});

describe("weightForRepsAtRir (converse of predictRepsAtWeight)", () => {
  it("round-trips: pick a weight for N reps → predict N back", () => {
    const anchor = estimateE1rm(100, 8, 2, params)!.value;
    for (const reps of [5, 8, 10, 12]) {
      const w = weightForRepsAtRir(anchor, reps, 2, params)!;
      expect(predictRepsAtWeight(anchor, w, 2, params)).toBe(reps);
    }
  });

  it("more target reps ⇒ lighter weight at the same RIR", () => {
    const anchor = estimateE1rm(100, 8, 2, params)!.value;
    const heavy = weightForRepsAtRir(anchor, 5, 2, params)!;
    const light = weightForRepsAtRir(anchor, 12, 2, params)!;
    expect(light).toBeLessThan(heavy);
  });

  it("a lower target RIR ⇒ heavier weight for the same reps", () => {
    const anchor = estimateE1rm(100, 8, 2, params)!.value;
    const at2 = weightForRepsAtRir(anchor, 8, 2, params)!;
    const at0 = weightForRepsAtRir(anchor, 8, 0, params)!;
    expect(at0).toBeGreaterThan(at2);
  });

  it("returns null without a usable anchor or reps", () => {
    expect(weightForRepsAtRir(null, 8, 2, params)).toBeNull();
    expect(weightForRepsAtRir(120, 0, 2, params)).toBeNull();
  });
});

describe("§S3 — forward/inverse stay consistent under the Brzycki cutoff (v11)", () => {
  it("round-trips weightForRepsAtRir ⇄ predictRepsAtWeight across the cutoff", () => {
    const anchor = estimateE1rm(100, 8, 2, V11_PARAMS)!.value;
    // 5 & 8 sit below the cutoff (averaged); 12 & 14 sit above it (Epley alone)
    for (const reps of [5, 8, 12, 14]) {
      const w = weightForRepsAtRir(anchor, reps, 2, V11_PARAMS)!;
      expect(predictRepsAtWeight(anchor, w, 2, V11_PARAMS)).toBe(reps);
    }
  });

  it("effectiveRepsForE1rm still round-trips the v11 forward model", () => {
    const e = estimateE1rm(100, 14, 0, V11_PARAMS)!; // above the cutoff (Epley)
    expect(effectiveRepsForE1rm(e.value, 100, V11_PARAMS)).toBeCloseTo(14, 1);
  });
});

describe("§S3 — session_best down-weights low-confidence sets (v11)", () => {
  it("a low-confidence burnout in the anchor session pulls less weight than a clean set", () => {
    // one clean high-confidence set + one 25-rep burnout (low confidence), same
    // session. The burnout is the recency-weighted max e1RM (so its session is
    // chosen), but v11 weights it down in the averaged value.
    const samples: E1rmSample[] = [
      { weight: 100, reps: 5, targetRir: 1, ageDays: 0, sessionKey: "S" },
      { weight: 100, reps: 25, targetRir: 3, ageDays: 0, sessionKey: "S" },
    ];
    // compare against the same cutoff but equal weights, to isolate the weighting
    const v11EqualWeights = {
      ...V11_PARAMS,
      e1rm: { ...V11_PARAMS.e1rm, session_value_confidence_weights: undefined },
    };
    const weighted = recencyWeightedE1rm(samples, V11_PARAMS)!.value;
    const equalMean = recencyWeightedE1rm(samples, v11EqualWeights)!.value;
    expect(weighted).toBeLessThan(equalMean); // burnout contributes less
  });
});
