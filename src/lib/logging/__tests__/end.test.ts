import { describe, expect, it } from "vitest";
import {
  endWorkoutStatus,
  isRemainingWorkout,
  remainingSetNumbers,
} from "../end";

describe("isRemainingWorkout", () => {
  it("treats planned and in_progress as remaining", () => {
    expect(isRemainingWorkout("planned")).toBe(true);
    expect(isRemainingWorkout("in_progress")).toBe(true);
  });

  it("treats finished workouts as not remaining", () => {
    expect(isRemainingWorkout("completed")).toBe(false);
    expect(isRemainingWorkout("skipped")).toBe(false);
  });
});

describe("endWorkoutStatus", () => {
  it("keeps a partially-logged day as completed", () => {
    expect(endWorkoutStatus(true)).toBe("completed");
  });

  it("skips an untouched day", () => {
    expect(endWorkoutStatus(false)).toBe("skipped");
  });
});

describe("remainingSetNumbers", () => {
  it("returns every open slot when nothing is logged or skipped", () => {
    expect(remainingSetNumbers(3, [], [])).toEqual([1, 2, 3]);
  });

  it("excludes logged and already-skipped slots", () => {
    expect(remainingSetNumbers(4, [1], [2])).toEqual([3, 4]);
  });

  it("widens past prescribed to cover manually-added logged/skipped sets", () => {
    expect(remainingSetNumbers(2, [3], [])).toEqual([1, 2]);
    expect(remainingSetNumbers(2, [], [4])).toEqual([1, 2, 3]);
  });

  it("returns nothing when every slot is resolved", () => {
    expect(remainingSetNumbers(2, [1, 2], [])).toEqual([]);
    expect(remainingSetNumbers(2, [1], [2])).toEqual([]);
  });
});
