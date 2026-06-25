import { describe, expect, it } from "vitest";
import { readTrace } from "../audit";

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
