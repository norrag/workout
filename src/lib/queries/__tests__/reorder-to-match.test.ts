import { describe, expect, it } from "vitest";
import { reorderToMatch } from "../logging";

type Row = { id: string; exercise_id: string };

const rows = (...pairs: [string, string][]): Row[] =>
  pairs.map(([id, exercise_id]) => ({ id, exercise_id }));

describe("reorderToMatch", () => {
  it("reorders targets to the source exercise order", () => {
    const targets = rows(["t1", "A"], ["t2", "B"], ["t3", "C"]);
    const result = reorderToMatch(targets, ["C", "A", "B"]);
    expect(result.map((r) => r.exercise_id)).toEqual(["C", "A", "B"]);
  });

  it("keeps unmatched targets at the end in their original order", () => {
    const targets = rows(["t1", "A"], ["t2", "X"], ["t3", "B"], ["t4", "Y"]);
    const result = reorderToMatch(targets, ["B", "A"]);
    // matched (B, A) first, then the source-absent ones (X, Y) in original order
    expect(result.map((r) => r.exercise_id)).toEqual(["B", "A", "X", "Y"]);
  });

  it("is a no-op when target already matches the source order", () => {
    const targets = rows(["t1", "A"], ["t2", "B"]);
    const result = reorderToMatch(targets, ["A", "B"]);
    expect(result.map((r) => r.id)).toEqual(["t1", "t2"]);
  });

  it("handles a source with extra exercises the target lacks", () => {
    const targets = rows(["t1", "B"], ["t2", "A"]);
    const result = reorderToMatch(targets, ["A", "Z", "B"]);
    expect(result.map((r) => r.exercise_id)).toEqual(["A", "B"]);
  });

  it("returns an empty list unchanged", () => {
    expect(reorderToMatch([], ["A"])).toEqual([]);
  });
});
