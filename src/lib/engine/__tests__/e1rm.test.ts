/** Estimated 1RM — averaged Epley/Brzycki + confidence bands (docs/10 §1). */
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "../params";
import { estimateE1rm } from "../e1rm";
import { V11_PARAMS } from "./helpers";

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

describe("estimateE1rm — §S3 Brzycki ≤ cutoff / Epley above (v11)", () => {
  it("tames the high-rep blow-up: a 100×30 @3 burnout is Epley-only, not the averaged ~555", () => {
    // effReps 33 > brzycki_max_eff_reps(10) ⇒ Epley alone = 100×(1+33/30) = 210
    const v11 = estimateE1rm(100, 30, 3, V11_PARAMS)!;
    expect(v11.value).toBeCloseTo(210, 0);
    // legacy averages in Brzycki (denominator 4) ⇒ ~555, the investigation's bug
    const legacy = estimateE1rm(100, 30, 3, DEFAULT_ENGINE_PARAMS)!;
    expect(legacy.value).toBeGreaterThan(500);
    expect(v11.value).toBeLessThan(legacy.value * 0.45);
  });

  it("is unchanged from legacy at/below the cutoff (they agree there)", () => {
    // effReps 5 ≤ 10 ⇒ still the Epley/Brzycki average, identical to legacy
    expect(estimateE1rm(100, 5, 0, V11_PARAMS)!.value).toBeCloseTo(
      estimateE1rm(100, 5, 0, DEFAULT_ENGINE_PARAMS)!.value,
      1,
    );
    // effReps 10 (10 reps @ 0) ⇒ still averaged at the boundary
    expect(estimateE1rm(100, 10, 0, V11_PARAMS)!.value).toBeCloseTo(
      estimateE1rm(100, 10, 0, DEFAULT_ENGINE_PARAMS)!.value,
      1,
    );
  });

  it("switches to Epley alone just past the cutoff", () => {
    // effReps 11 > 10 ⇒ Epley alone = 100×(1+11/30) = 136.7
    expect(estimateE1rm(100, 11, 0, V11_PARAMS)!.value).toBeCloseTo(136.7, 1);
  });
});
