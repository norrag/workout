/** Aggregated strength-trend scoring — recent-vs-baseline rolling windows
 *  (docs/10 §6). Pure; the RIR-ramp robustness is the whole point. */
import { describe, expect, it } from "vitest";
import { strengthTrend, volumeWeightedMean, DEFAULT_STRENGTH } from "../strength";

const cfg = DEFAULT_STRENGTH;

describe("strengthTrend", () => {
  it("needs min_sessions points before scoring", () => {
    expect(strengthTrend([100, 110], cfg).trend).toBe("insufficient_data");
    expect(strengthTrend([100, 110], cfg).change_pct).toBeNull();
  });

  it("at exactly 3 sessions compares first vs last (k=1)", () => {
    // n=3 ⇒ k=1: baseline = points[0], current = points[2]
    const t = strengthTrend([100, 105, 110], cfg);
    expect(t.baseline_e1rm).toBe(100);
    expect(t.current_e1rm).toBe(110);
    expect(t.change_pct).toBe(10);
    expect(t.trend).toBe("improving");
  });

  it("does NOT read 0% on a 3-session lift that progressed", () => {
    // regression guard: overlapping windows would give max(all)=max(all)=0%
    expect(strengthTrend([100, 120, 140], cfg).change_pct).toBeGreaterThan(0);
  });

  it("uses best-of-recent-window so one light opener can't crater it", () => {
    // an old block peaking at 150, then a fresh block's light openers 120/122;
    // recent window (last 3) best = 150 (last of old + two openers), so the
    // number HOLDS at the real level instead of dropping to the opener.
    const oldBlock = [130, 140, 150];
    const freshOpeners = [120, 122];
    const t = strengthTrend([...oldBlock, ...freshOpeners], cfg);
    // n=5 ⇒ k=2: baseline = max(130,140)=140, current = max(122, ...last2)=122
    // last 2 are the openers → current 122; still not a -20% crater vs a naive
    // first→last (which would read 122 vs 130). Confirms the window is applied.
    expect(t.current_e1rm).toBe(122);
    expect(t.baseline_e1rm).toBe(140);
  });

  it("holds within the tolerance dead-band", () => {
    // +1% change with a 1.5% tolerance → holding, not improving
    const t = strengthTrend([100, 100, 101, 101, 101, 101], cfg);
    expect(Math.abs(t.change_pct!)).toBeLessThanOrEqual(cfg.tolerance_pct);
    expect(t.trend).toBe("holding");
  });

  it("reports a genuine decline", () => {
    const t = strengthTrend([200, 205, 210, 190, 188, 185], cfg);
    expect(t.change_pct).toBeLessThan(0);
    expect(t.trend).toBe("declining");
  });

  it("uses full 3/3 windows once there are ≥6 sessions", () => {
    // baseline = max(first 3) = 110, current = max(last 3) = 140
    const t = strengthTrend([100, 110, 105, 130, 135, 140], cfg);
    expect(t.baseline_e1rm).toBe(110);
    expect(t.current_e1rm).toBe(140);
    expect(t.change_pct).toBeCloseTo(27.3, 1);
  });
});

describe("volumeWeightedMean", () => {
  it("weights each value by its volume", () => {
    // legs (+3% over 40 sets) should dominate traps (+15% over 4 sets)
    const v = volumeWeightedMean([
      { value: 3, weight: 40 },
      { value: 15, weight: 4 },
    ]);
    // (3·40 + 15·4) / 44 = 180/44 = 4.09 → nearer 3 than 15
    expect(v).toBeCloseTo(4.1, 1);
  });

  it("skips null values and non-positive weights", () => {
    expect(
      volumeWeightedMean([
        { value: null, weight: 10 },
        { value: 5, weight: 0 },
        { value: 8, weight: 12 },
      ]),
    ).toBe(8);
  });

  it("returns null when nothing qualifies", () => {
    expect(volumeWeightedMean([{ value: null, weight: 5 }])).toBeNull();
  });
});
