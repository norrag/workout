import { describe, expect, it } from "vitest";
import {
  prescriptionMatchesDecision,
  readOutputNumbers,
  readTrace,
} from "../audit";

describe("readTrace", () => {
  it("reads well-formed trace steps from the stored output jsonb", () => {
    const out = {
      rationale: "Seeded from strength anchor.",
      trace: [
        { rule: "seed_anchor", detail: "120 lb for 8 reps at 3 RIR" },
        { rule: "rir", detail: "target RIR steps 3 to 2" },
      ],
    };
    expect(readTrace(out)).toEqual([
      { rule: "seed_anchor", detail: "120 lb for 8 reps at 3 RIR" },
      { rule: "rir", detail: "target RIR steps 3 to 2" },
    ]);
  });

  it("is defensive about missing / malformed output (untyped jsonb)", () => {
    expect(readTrace(null)).toEqual([]);
    expect(readTrace({})).toEqual([]);
    expect(readTrace({ trace: "nope" })).toEqual([]);
    expect(readTrace({ trace: [null, 7, { rule: "seed" }] })).toEqual([
      { rule: "seed", detail: "" },
    ]);
  });
});

describe("readOutputNumbers (N33 S4)", () => {
  it("reads the prescribed tuple from the stored decision output", () => {
    expect(
      readOutputNumbers({ weight: 215, reps: 10, sets: 2, targetRir: 6, rationale: "…" }),
    ).toEqual({ weight: 215, reps: 10, sets: 2, targetRir: 6 });
  });

  it("nulls missing / non-numeric fields, and returns null when nothing numeric exists", () => {
    expect(readOutputNumbers({ weight: 100, reps: "8" })).toEqual({
      weight: 100,
      reps: null,
      sets: null,
      targetRir: null,
    });
    expect(readOutputNumbers({ rationale: "only prose" })).toBeNull();
    expect(readOutputNumbers(null)).toBeNull();
    expect(readOutputNumbers("junk")).toBeNull();
  });
});

describe("prescriptionMatchesDecision (N33 S4 tripwire)", () => {
  const decision = { weight: 215, reps: 10, sets: 2, targetRir: 6 };

  it("matches when the live row still carries the decision's numbers", () => {
    expect(prescriptionMatchesDecision({ ...decision }, decision)).toBe(true);
  });

  it("flags the owner's swap chimera (PR weight/reps over the deload's sets/RIR)", () => {
    expect(
      prescriptionMatchesDecision(
        { weight: 245, reps: 15, sets: 2, targetRir: 6 },
        decision,
      ),
    ).toBe(false);
  });

  it("treats null-vs-number as divergence (the whole tuple is engine-written)", () => {
    expect(
      prescriptionMatchesDecision(
        { weight: 215, reps: 10, sets: 2, targetRir: null },
        decision,
      ),
    ).toBe(false);
  });
});
