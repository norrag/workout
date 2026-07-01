/**
 * R8 (repo review 2026-07-01): doc 10 §3 step 0 — joint pain is the ONE hard
 * safety gate and must modulate SET COUNTS, not just load. Pain ≥ pain_gate
 * never adds a set; pain ≥ pain_cut_gate cuts one and suggests substitution,
 * regardless of workload/pump. Gated on `pain_cut_gate` (v17); absent ⇒ legacy
 * (pain never touches sets), so pre-v17 decisions replay byte-identically.
 */
import { describe, expect, it } from "vitest";
import { prescribe } from "../index";
import { modulateFromFeedback } from "../rules/feedback";
import { baseInputs, V16_PARAMS, V17_PARAMS } from "./helpers";

// feedback that (absent pain) qualifies for a set ADD: easy workload, strong
// pump, gain goal, under the muscle-group ceiling — the exact combination that
// used to slip past the pain gate.
const addTrigger = { pump: 8, workload: 2 };

describe("modulateFromFeedback — pain gate on set counts (v17, doc 10 §3 step 0)", () => {
  const table: Array<{
    name: string;
    jointPain: number;
    pump: number;
    workload: number;
    expected: -1 | 0 | 1;
    note?: RegExp;
  }> = [
    {
      name: "pain 0 + add trigger: set added",
      jointPain: 0,
      ...addTrigger,
      expected: 1,
      note: /set added/,
    },
    {
      name: "pain 1 (below pain_gate) + add trigger: set added",
      jointPain: 1,
      ...addTrigger,
      expected: 1,
      note: /set added/,
    },
    {
      name: "pain 2 (at pain_gate) + add trigger: addition vetoed",
      jointPain: 2,
      ...addTrigger,
      expected: 0,
      note: /set addition vetoed/,
    },
    {
      name: "pain 3 (at pain_cut_gate) + add trigger: set removed",
      jointPain: 3,
      ...addTrigger,
      expected: -1,
      note: /set removed — consider substituting/,
    },
    {
      name: "pain 3 + on-target workload: set removed",
      jointPain: 3,
      pump: 5,
      workload: 5,
      expected: -1,
      note: /substituting/,
    },
    {
      name: "pain 3 + hot workload: one cut, not two",
      jointPain: 3,
      pump: 5,
      workload: 9,
      expected: -1,
    },
    {
      name: "pain 2 + hot workload: the workload cut still applies",
      jointPain: 2,
      pump: 5,
      workload: 9,
      expected: -1,
      note: /past just right/,
    },
  ];

  for (const row of table) {
    it(row.name, () => {
      const mod = modulateFromFeedback(
        baseInputs({
          exerciseFeedback: {
            jointPain: row.jointPain,
            pump: row.pump,
            workload: row.workload,
          },
        }),
        V17_PARAMS,
      );
      expect(mod.setDelta).toBe(row.expected);
      if (row.note) expect(mod.notes.join("; ")).toMatch(row.note);
    });
  }

  it("pain 3 with null workload/pump still cuts (the gate needs no corroboration)", () => {
    const mod = modulateFromFeedback(
      baseInputs({
        exerciseFeedback: { jointPain: 3, pump: null, workload: null },
      }),
      V17_PARAMS,
    );
    expect(mod.setDelta).toBe(-1);
  });

  it("no feedback at all: no set change", () => {
    const mod = modulateFromFeedback(
      baseInputs({ exerciseFeedback: null }),
      V17_PARAMS,
    );
    expect(mod.setDelta).toBe(0);
  });
});

describe("modulateFromFeedback — legacy (pain_cut_gate absent, pre-v17 replay)", () => {
  it("pain 3 + add trigger still adds a set (the pre-v17 defect, preserved for replay)", () => {
    const mod = modulateFromFeedback(
      baseInputs({
        exerciseFeedback: { jointPain: 3, ...addTrigger },
      }),
      V16_PARAMS,
    );
    expect(mod.setDelta).toBe(1);
    expect(mod.painGated).toBe(true); // load stays gated, as before
  });
});

describe("prescribe — pain gate end to end (v17)", () => {
  it("pain 3/3 with easy workload + strong pump removes a set (never adds)", () => {
    const out = prescribe(
      baseInputs({
        exerciseFeedback: { jointPain: 3, ...addTrigger },
      }),
      V17_PARAMS,
    );
    expect(out.sets).toBe(2);
    expect(out.rationale).toMatch(/set removed — consider substituting/);
    expect(out.rationale).not.toMatch(/set added/);
  });

  it("pain 2/3 with the same feedback holds volume with the veto noted", () => {
    const out = prescribe(
      baseInputs({
        exerciseFeedback: { jointPain: 2, ...addTrigger },
      }),
      V17_PARAMS,
    );
    expect(out.sets).toBe(3);
    expect(out.rationale).toMatch(/set addition vetoed/);
  });

  it("the cut is floored at min_sets", () => {
    const out = prescribe(
      baseInputs({
        previous: { weight: 100, reps: 8, sets: 2, targetRir: 3 },
        exerciseFeedback: { jointPain: 3, pump: 5, workload: 5 },
      }),
      V17_PARAMS,
    );
    expect(out.sets).toBe(2); // min_sets
  });
});
