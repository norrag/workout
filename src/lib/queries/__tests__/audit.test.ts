import { describe, expect, it } from "vitest";
import {
  prescriptionMatchesDecision,
  readEffortObserved,
  readOutputNumbers,
  readPerformedWork,
  readTrace,
} from "../audit";
import { assessPerformance } from "@/lib/engine/rules/performance";
import type { EngineInputs, LoggedSetInput } from "@/lib/engine/types";

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

describe("readPerformedWork (N89 — what 'last session' actually was)", () => {
  const set = (
    weight: number,
    reps: number,
    over: Partial<Record<string, unknown>> = {},
  ) => ({ weight, reps, isWarmup: false, setNumber: 1, ...over });

  it("reduces the source session to its best working set", () => {
    // the owner's field case: prescribed 30 x 7, LOADED 40 and did 8, 8, 8
    expect(
      readPerformedWork({ actualSets: [set(40, 8), set(40, 8), set(40, 8)] }),
    ).toEqual({ weight: 40, reps: 8, sets: 3, uniformReps: true });
  });

  it("breaks a weight tie on reps, and a heavier set always wins", () => {
    expect(readPerformedWork({ actualSets: [set(40, 8), set(40, 10)] })?.reps).toBe(10);
    expect(
      readPerformedWork({ actualSets: [set(45, 5), set(40, 12)] })?.weight,
    ).toBe(45);
  });

  it("flags a ragged session so no line may claim a per-set delta", () => {
    expect(readPerformedWork({ actualSets: [set(40, 8), set(40, 6)] })).toEqual({
      weight: 40,
      reps: 8,
      sets: 2,
      uniformReps: false,
    });
  });

  it("ignores warmups and counts only working sets", () => {
    expect(
      readPerformedWork({
        actualSets: [set(20, 10, { isWarmup: true }), set(40, 8), set(40, 8)],
      }),
    ).toEqual({ weight: 40, reps: 8, sets: 2, uniformReps: true });
  });

  it("is null without usable actualSets — a seed, or pre-actuals inputs", () => {
    expect(readPerformedWork(null)).toBeNull();
    expect(readPerformedWork({})).toBeNull();
    expect(readPerformedWork({ actualSets: "nope" })).toBeNull();
    expect(readPerformedWork({ actualSets: [] })).toBeNull();
    expect(readPerformedWork({ actualSets: [{ isWarmup: true }] })).toBeNull();
  });

  it("picks the SAME set the engine prices from — the two must never drift", () => {
    // the whole point of the fix: if this reader and `assessPerformance`
    // disagreed, the explanation would contradict the trace all over again.
    const actualSets: LoggedSetInput[] = [
      { weight: 40, reps: 8, isWarmup: false, setNumber: 1, rirReported: 2 },
      { weight: 45, reps: 6, isWarmup: false, setNumber: 2, rirReported: 1 },
      { weight: 45, reps: 7, isWarmup: false, setNumber: 3, rirReported: 1 },
      { weight: 20, reps: 12, isWarmup: true, setNumber: 0, rirReported: null },
    ];
    const perf = assessPerformance(
      {
        actualSets,
        previous: { weight: 40, reps: 8, sets: 3, targetRir: 2 },
      } as unknown as EngineInputs,
      2,
    );
    const read = readPerformedWork({ actualSets });
    expect([read?.weight, read?.reps]).toEqual([perf.bestWeight, perf.bestReps]);
  });
});
