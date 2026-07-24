import { describe, expect, it } from "vitest";
import {
  prescriptionMatchesDecision,
  readEffortObserved,
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

  // doc 16 §3.6: the progression step's status coding is preserved
  // structurally — the quick-read narrative and the audit panel's labels read
  // it without parsing the detail prose
  it("preserves progression status / governor / predicate fields", () => {
    const out = {
      trace: [
        {
          rule: "progression",
          detail: "earned; skipped by rate pacer",
          status: "paced",
          governor: "rate_pacer",
          deltaTarget: 6.8,
        },
        {
          rule: "progression",
          detail: "not earned: set 2 under",
          status: "not_earned",
          predicate: "compliance",
        },
      ],
    };
    expect(readTrace(out)).toEqual([
      {
        rule: "progression",
        detail: "earned; skipped by rate pacer",
        status: "paced",
        governor: "rate_pacer",
      },
      {
        rule: "progression",
        detail: "not earned: set 2 under",
        status: "not_earned",
        predicate: "compliance",
      },
    ]);
    // non-string status-ish values are dropped, not passed through
    expect(readTrace({ trace: [{ rule: "progression", status: 7 }] })).toEqual([
      { rule: "progression", detail: "" },
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

describe("readEffortObserved (doc 19 §4.3 — the effort-honesty gate, N63)", () => {
  it("is observed when any working set carried a reported RIR", () => {
    expect(
      readEffortObserved({
        actualSets: [
          { reps: 10, rirReported: null },
          { reps: 9, rirReported: 1 },
        ],
      }),
    ).toBe(true);
  });

  it("is inferred when the session logged no RIR at all", () => {
    expect(
      readEffortObserved({ actualSets: [{ reps: 10 }, { reps: 9, rirReported: null }] }),
    ).toBe(false);
  });

  it("ignores warmups — only working sets speak to effort", () => {
    expect(
      readEffortObserved({
        actualSets: [
          { reps: 5, isWarmup: true, rirReported: 4 },
          { reps: 10 },
        ],
      }),
    ).toBe(false);
    expect(
      readEffortObserved({ actualSets: [{ reps: 5, isWarmup: true, rirReported: 4 }] }),
    ).toBeNull();
  });

  it("is unknown (null) without usable actualSets — a seed, or older inputs", () => {
    expect(readEffortObserved(null)).toBeNull();
    expect(readEffortObserved({})).toBeNull();
    expect(readEffortObserved({ actualSets: "nope" })).toBeNull();
    expect(readEffortObserved({ actualSets: [] })).toBeNull();
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
