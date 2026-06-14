/** Estimated 1RM — averaged Epley/Brzycki + confidence bands (docs/10 §1). */
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "../params";
import { estimateE1rm } from "../e1rm";

const params = DEFAULT_ENGINE_PARAMS;

describe("estimateE1rm", () => {
  it("averages Epley and Brzycki over effective reps", () => {
    // 100 × 5 @ 0 RIR → effReps 5; Epley 116.67, Brzycki 112.5 → 114.6
    const e = estimateE1rm(100, 5, 0, params)!;
    expect(e.value).toBeCloseTo(114.6, 1);
    expect(e.effectiveReps).toBe(5);
    expect(e.confidence).toBe("high");
  });

  it("folds RIR into effective reps and rates moderate confidence", () => {
    // 100 × 10 @ 2 RIR → effReps 12; Epley 140, Brzycki 144 → 142
    const e = estimateE1rm(100, 10, 2, params)!;
    expect(e.value).toBeCloseTo(142, 0);
    expect(e.confidence).toBe("moderate");
  });

  it("flags low confidence far from failure", () => {
    expect(estimateE1rm(100, 15, 5, params)!.confidence).toBe("low");
  });

  it("treats an unreported RIR as low confidence", () => {
    const e = estimateE1rm(100, 5, null, params)!;
    expect(e.confidence).toBe("low");
    expect(e.value).toBeCloseTo(114.6, 1);
  });

  it("falls back to Epley alone past Brzycki's valid range", () => {
    // effReps 40 → Brzycki denominator non-positive; Epley = 466.7
    const e = estimateE1rm(200, 40, 0, params)!;
    expect(e.value).toBeCloseTo(466.7, 1);
    expect(e.confidence).toBe("low");
  });

  it("returns null for non-working input", () => {
    expect(estimateE1rm(0, 5, 0, params)).toBeNull();
    expect(estimateE1rm(100, 0, 0, params)).toBeNull();
  });
});
