/**
 * doc 16 §3.7 — the seed route's earned-at-close derivation: the pure
 * source-selection rule (the I/O wrapper is thin assembly over it).
 */
import { describe, expect, it } from "vitest";
import { chooseEarnSources } from "../seed-progression";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 6, 1);

function cand(
  exerciseId: string,
  daysAgo: number,
  source: string,
  isDeload = false,
) {
  return { exerciseId, performedAtMs: T0 - daysAgo * DAY, isDeload, source };
}

describe("chooseEarnSources", () => {
  it("picks the most recent completed instance per exercise", () => {
    const out = chooseEarnSources([
      cand("bench", 10, "old"),
      cand("bench", 2, "new"),
      cand("squat", 5, "only"),
    ]);
    expect(out.get("bench")).toBe("new");
    expect(out.get("squat")).toBe("only");
  });

  it("skips deload-week sessions — the deload boundary is crossed, not read (§3.7)", () => {
    // the deload session is the most recent, but deloads neither earn nor take
    // steps: the FINAL WORKING session is the earn source
    const out = chooseEarnSources([
      cand("bench", 9, "final-working"),
      cand("bench", 2, "deload", true),
    ]);
    expect(out.get("bench")).toBe("final-working");
  });

  it("an exercise with only deload history has no earn source", () => {
    const out = chooseEarnSources([cand("bench", 2, "deload", true)]);
    expect(out.has("bench")).toBe(false);
  });

  it("empty candidates ⇒ empty map (swap/cold start shape)", () => {
    expect(chooseEarnSources([]).size).toBe(0);
  });
});
