import { describe, expect, it } from "vitest";
import { resolveJointPainAttribution } from "../feedback-attribution";

/** sort `others` by id so assertions are order-independent */
const sortOthers = (r: ReturnType<typeof resolveJointPainAttribution>) => ({
  ...r,
  others: [...r.others].sort((a, b) => a.id.localeCompare(b.id)),
});

describe("resolveJointPainAttribution", () => {
  it("single-exercise group: pain lands on the closer, no others", () => {
    const r = resolveJointPainAttribution({
      closerId: "A",
      jointPain: 2,
      painExerciseIds: [],
      groupExerciseIds: ["A"],
    });
    expect(r).toEqual({ closerPain: 2, others: [] });
  });

  it("empty selection with real pain → attribute to every performed exercise", () => {
    const r = sortOthers(
      resolveJointPainAttribution({
        closerId: "C",
        jointPain: 3,
        painExerciseIds: [],
        groupExerciseIds: ["A", "B", "C"],
      }),
    );
    expect(r.closerPain).toBe(3);
    expect(r.others).toEqual([
      { id: "A", jointPain: 3 },
      { id: "B", jointPain: 3 },
    ]);
  });

  it("pins pain to a non-closer and clears the closer", () => {
    // the reported case: bench (A) hurt, incline (C) closed the group
    const r = sortOthers(
      resolveJointPainAttribution({
        closerId: "C",
        jointPain: 2,
        painExerciseIds: ["A"],
        groupExerciseIds: ["A", "B", "C"],
      }),
    );
    expect(r.closerPain).toBeNull();
    expect(r.others).toEqual([
      { id: "A", jointPain: 2 },
      { id: "B", jointPain: null },
    ]);
  });

  it("selecting the closer plus a sibling attributes to both", () => {
    const r = sortOthers(
      resolveJointPainAttribution({
        closerId: "C",
        jointPain: 1,
        painExerciseIds: ["A", "C"],
        groupExerciseIds: ["A", "B", "C"],
      }),
    );
    expect(r.closerPain).toBe(1);
    expect(r.others).toEqual([
      { id: "A", jointPain: 1 },
      { id: "B", jointPain: null },
    ]);
  });

  it("None (0) records no pain on the closer and clears every sibling", () => {
    const r = sortOthers(
      resolveJointPainAttribution({
        closerId: "C",
        jointPain: 0,
        painExerciseIds: [],
        groupExerciseIds: ["A", "B", "C"],
      }),
    );
    expect(r.closerPain).toBe(0);
    expect(r.others).toEqual([
      { id: "A", jointPain: null },
      { id: "B", jointPain: null },
    ]);
  });

  it("null pain (soreness-only prompt) touches nothing but the closer's null", () => {
    const r = resolveJointPainAttribution({
      closerId: "A",
      jointPain: null,
      painExerciseIds: null,
      groupExerciseIds: null,
    });
    expect(r).toEqual({ closerPain: null, others: [] });
  });

  it("closer absent from group ids is still a candidate for the default-all", () => {
    const r = sortOthers(
      resolveJointPainAttribution({
        closerId: "C",
        jointPain: 2,
        painExerciseIds: [],
        groupExerciseIds: ["A"],
      }),
    );
    expect(r.closerPain).toBe(2);
    expect(r.others).toEqual([{ id: "A", jointPain: 2 }]);
  });
});
