import { describe, expect, it } from "vitest";
import {
  dayCloseOption,
  endWorkoutStatus,
  isRemainingWorkout,
  isWeekLocked,
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

// N74 — the week boundary. Out-of-order WITHIN a week stays free; the gate is
// only ever at the boundary, because week N+1 is priced off the whole of week N.
describe("isWeekLocked", () => {
  it("locks a week whose predecessor has not closed", () => {
    expect(isWeekLocked("pending")).toBe(true);
  });

  it("opens the moment the advance job activates the week", () => {
    expect(isWeekLocked("active")).toBe(false);
  });

  it("leaves a finished week unlocked (it is read-only for other reasons)", () => {
    expect(isWeekLocked("completed")).toBe(false);
  });
});

// N74 — a week must always be closable, or one dropped session strands the
// user; but a day carrying logged work is completed, never skipped (rule #5).
describe("dayCloseOption", () => {
  it("offers skip for an untrained open day", () => {
    expect(dayCloseOption("planned", false)).toBe("skip");
    expect(dayCloseOption("in_progress", false)).toBe("skip");
  });

  it("offers end — never skip — once anything is logged", () => {
    expect(dayCloseOption("planned", true)).toBe("end");
    expect(dayCloseOption("in_progress", true)).toBe("end");
  });

  it("offers nothing for an already-closed day", () => {
    expect(dayCloseOption("completed", true)).toBeNull();
    expect(dayCloseOption("completed", false)).toBeNull();
    expect(dayCloseOption("skipped", false)).toBeNull();
  });
});
