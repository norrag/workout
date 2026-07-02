import { describe, expect, it } from "vitest";
import {
  adoptServerRowState,
  daySetTotals,
  exerciseDone,
  plannedSetCount,
  type SetProgressExercise,
} from "../day-rules";

function ex(
  over: Partial<SetProgressExercise> & { logged?: number[] },
): SetProgressExercise {
  const { logged = [], ...rest } = over;
  return {
    status: "planned",
    prescribed_sets: 3,
    skipped_set_numbers: [],
    sets: logged.map((set_number) => ({ set_number })),
    ...rest,
  };
}

describe("plannedSetCount", () => {
  it("uses the prescription when nothing is logged or skipped", () => {
    expect(plannedSetCount(ex({}))).toBe(3);
  });

  it("widens to sets logged beyond the prescription", () => {
    expect(plannedSetCount(ex({ logged: [1, 2, 3, 4, 5] }))).toBe(5);
  });

  it("widens to skipped slots beyond the prescription", () => {
    expect(plannedSetCount(ex({ skipped_set_numbers: [4] }))).toBe(4);
  });

  it("falls back to one slot without a prescription", () => {
    expect(plannedSetCount(ex({ prescribed_sets: null }))).toBe(1);
  });
});

describe("exerciseDone", () => {
  it("is done when every slot is logged", () => {
    expect(exerciseDone(ex({ logged: [1, 2, 3] }))).toBe(true);
  });

  it("is done when the open slots are skipped", () => {
    expect(exerciseDone(ex({ logged: [1], skipped_set_numbers: [2, 3] }))).toBe(
      true,
    );
  });

  it("is not done with an unresolved slot", () => {
    expect(exerciseDone(ex({ logged: [1, 3] }))).toBe(false);
  });

  it("a skipped exercise is done regardless of its slots", () => {
    expect(exerciseDone(ex({ status: "skipped" }))).toBe(true);
  });
});

describe("daySetTotals", () => {
  it("counts logged sets over planned slots", () => {
    expect(daySetTotals([ex({ logged: [1, 2] }), ex({})])).toEqual({
      loggedSets: 2,
      totalSets: 6,
    });
  });

  it("excludes skipped exercises from the denominator (but keeps their logged sets)", () => {
    expect(
      daySetTotals([ex({ logged: [1, 2, 3] }), ex({ status: "skipped", logged: [1] })]),
    ).toEqual({ loggedSets: 4, totalSets: 3 });
  });

  // the R19 disagreement: skipped SET slots were excluded from the header
  // denominator but not the CompleteSheet's — one shared rule now
  it("excludes skipped set slots from the denominator", () => {
    expect(
      daySetTotals([ex({ logged: [1, 2], skipped_set_numbers: [3] })]),
    ).toEqual({ loggedSets: 2, totalSets: 2 });
  });

  it("a fully-resolved day reads n / n", () => {
    const day = [
      ex({ logged: [1, 2], skipped_set_numbers: [3] }),
      ex({ status: "skipped" }),
      ex({ logged: [1, 2, 3] }),
    ];
    const { loggedSets, totalSets } = daySetTotals(day);
    expect(loggedSets).toBe(totalSets);
    expect(day.every(exerciseDone)).toBe(true);
  });
});

describe("adoptServerRowState (R13)", () => {
  it("always adopts the row's own logged-set change", () => {
    expect(adoptServerRowState("own-logged-set", false)).toBe(true);
    expect(adoptServerRowState("own-logged-set", true)).toBe(true);
  });

  it("adopts a planned-input change on an untouched row", () => {
    expect(adoptServerRowState("planned-input", false)).toBe(true);
  });

  it("never adopts a planned-input change over uncommitted typing", () => {
    expect(adoptServerRowState("planned-input", true)).toBe(false);
  });
});
