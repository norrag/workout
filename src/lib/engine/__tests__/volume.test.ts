import { describe, it, expect } from "vitest";
import { DEFAULT_ENGINE_PARAMS, engineParamsSchema } from "../params";
import {
  muscleVolumeLandmark,
  classifyVolume,
  assessMuscleVolume,
  volumeCountingWeights,
  fractionalSetCount,
} from "../volume";

const P = DEFAULT_ENGINE_PARAMS;

describe("volumeCountingWeights (R14, doc 10 §2)", () => {
  it("defaults to 1.0 / 0.5 when the optional params keys are absent", () => {
    // DEFAULT_ENGINE_PARAMS deliberately omits volume.direct/indirect (v11+
    // .optional() discipline — stored rows stay byte-replayable)
    expect(P.volume.direct).toBeUndefined();
    expect(volumeCountingWeights(P)).toEqual({ direct: 1.0, indirect: 0.5 });
  });

  it("reads explicit weights when a params row carries them", () => {
    const tuned = engineParamsSchema.parse({
      ...P,
      volume: { ...P.volume, direct: 1.0, indirect: 0.33 },
    });
    expect(volumeCountingWeights(tuned)).toEqual({ direct: 1.0, indirect: 0.33 });
  });
});

describe("fractionalSetCount (R14, doc 10 §2)", () => {
  const W = { direct: 1.0, indirect: 0.5 };

  it("credits 1.0 per primary and 0.5 per secondary", () => {
    expect(
      fractionalSetCount(
        [
          { role: "primary", sets: 4 },
          { role: "secondary", sets: 4 },
        ],
        W,
      ),
    ).toBe(6); // 4 + 2
  });

  it("returns 0 for no entries", () => {
    expect(fractionalSetCount([], W)).toBe(0);
  });

  it("rounds to 2 dp so tuned weights can't leak float noise", () => {
    expect(
      fractionalSetCount([{ role: "secondary", sets: 3 }], {
        direct: 1,
        indirect: 0.1,
      }),
    ).toBe(0.3); // not 0.30000000000000004
  });
});

describe("muscleVolumeLandmark", () => {
  it("returns the intermediate baseline unscaled", () => {
    expect(muscleVolumeLandmark(P, "chest", "intermediate")).toEqual({
      mev: 8,
      mav: 20,
      mrv: 22,
    });
  });

  it("is case-insensitive on the muscle name", () => {
    expect(muscleVolumeLandmark(P, "Chest", "intermediate")).toEqual(
      muscleVolumeLandmark(P, "chest", "intermediate"),
    );
  });

  it("scales the whole band down for a beginner (rounded)", () => {
    // chest [8,20,22] × 0.7 → [5.6,14,15.4] → [6,14,15]
    expect(muscleVolumeLandmark(P, "chest", "beginner")).toEqual({
      mev: 6,
      mav: 14,
      mrv: 15,
    });
  });

  it("returns null for an unparameterized muscle", () => {
    expect(muscleVolumeLandmark(P, "traps", "intermediate")).toBeNull();
    expect(muscleVolumeLandmark(P, "forearms", "intermediate")).toBeNull();
  });
});

describe("classifyVolume", () => {
  const lm = { mev: 8, mav: 20, mrv: 22 };
  it("classifies each zone", () => {
    expect(classifyVolume(4, lm)).toBe("below_mev");
    expect(classifyVolume(8, lm)).toBe("optimal"); // at MEV
    expect(classifyVolume(20, lm)).toBe("optimal"); // at MAV
    expect(classifyVolume(21, lm)).toBe("high");
    expect(classifyVolume(22, lm)).toBe("high"); // at MRV
    expect(classifyVolume(30, lm)).toBe("above_mrv");
  });
});

describe("assessMuscleVolume", () => {
  it("bundles band + zone + note", () => {
    const a = assessMuscleVolume(P, "chest", 4, "intermediate");
    expect(a).toMatchObject({ mev: 8, mav: 20, mrv: 22, zone: "below_mev" });
    expect(a!.note).toMatch(/below MEV/i);
  });

  it("returns null for an unparameterized muscle", () => {
    expect(assessMuscleVolume(P, "traps", 10, "intermediate")).toBeNull();
  });
});
