import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "@/lib/engine/params";
import {
  adoptServerRowState,
  daySetTotals,
  exerciseDone,
  loggedSetMarker,
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

describe("loggedSetMarker (P19/N11)", () => {
  const e1rmCfg = DEFAULT_ENGINE_PARAMS.e1rm;
  const asPrescribed = {
    prescribedEffectiveWeight: 100,
    prescribedReps: 10,
    loggedEffectiveWeight: 100,
    loggedReps: 10,
    e1rmCfg,
  };

  // the N11 regression: rir_reported defaulted to 0 while the prescription
  // baked in the week's target RIR, so an exactly-as-prescribed quick-logged
  // set read as a big miss — worst on deloads (the largest target RIR)
  it("exactly-prescribed with unreported RIR shows no marker on a deload", () => {
    expect(
      loggedSetMarker({ ...asPrescribed, loggedRir: null, targetRir: 6 }),
    ).toBeNull();
  });

  it("exactly-prescribed with unreported RIR shows no marker on a working week", () => {
    expect(
      loggedSetMarker({ ...asPrescribed, loggedRir: null, targetRir: 2 }),
    ).toBeNull();
  });

  it("more reps than prescribed reads over, fewer reads under (unreported RIR)", () => {
    expect(
      loggedSetMarker({
        ...asPrescribed,
        loggedReps: 12,
        loggedRir: null,
        targetRir: 6,
      }),
    ).toBe("over");
    expect(
      loggedSetMarker({
        ...asPrescribed,
        loggedReps: 8,
        loggedRir: null,
        targetRir: 6,
      }),
    ).toBe("under");
  });

  // a REPORTED RIR still compares against the week's target: same weight/reps
  // but nothing left in reserve means the set was harder than prescribed
  it("reported RIR below target reads under; above target reads over", () => {
    expect(
      loggedSetMarker({ ...asPrescribed, loggedRir: 0, targetRir: 3 }),
    ).toBe("under");
    expect(
      loggedSetMarker({ ...asPrescribed, loggedRir: 6, targetRir: 3 }),
    ).toBe("over");
  });

  it("heavier load at the same reps and RIR reads over", () => {
    expect(
      loggedSetMarker({
        ...asPrescribed,
        loggedEffectiveWeight: 110,
        loggedRir: null,
        targetRir: 2,
      }),
    ).toBe("over");
  });

  it("returns null without a prescription or a working load", () => {
    expect(
      loggedSetMarker({
        ...asPrescribed,
        prescribedEffectiveWeight: null,
        loggedRir: null,
        targetRir: 2,
      }),
    ).toBeNull();
    expect(
      loggedSetMarker({
        ...asPrescribed,
        prescribedReps: null,
        loggedRir: null,
        targetRir: 2,
      }),
    ).toBeNull();
    expect(
      loggedSetMarker({
        ...asPrescribed,
        loggedEffectiveWeight: 0,
        loggedRir: null,
        targetRir: 2,
      }),
    ).toBeNull();
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

  // N13: "Reset to prescription" reaches the editable row as its override
  // clearing — it must land even on the typed-in row (that row's edit is what
  // made the reset option appear in the first place)
  it("always adopts a prescription reset, even over a typed-in row", () => {
    expect(adoptServerRowState("prescription-reset", true)).toBe(true);
    expect(adoptServerRowState("prescription-reset", false)).toBe(true);
  });
});
