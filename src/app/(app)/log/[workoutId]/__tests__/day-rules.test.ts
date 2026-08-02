import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "@/lib/engine/params";
import { complianceBand } from "@/lib/engine/rules/progression";
import { predictRepsAtWeight } from "@/lib/engine/predict";
import {
  adoptServerRowState,
  daySetTotals,
  exerciseDone,
  impliedPrescriptionE1rm,
  loggedSetMarker,
  plannedSetCount,
  prescriptionBasisE1rm,
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

describe("pending sets count as logged (N68)", () => {
  it("widens the planned slot count like a server row does", () => {
    expect(plannedSetCount(ex({ pending_set_numbers: [1, 2, 3, 4, 5] }))).toBe(5);
  });

  it("completes an exercise whose last sets are still in the write queue", () => {
    expect(exerciseDone(ex({ logged: [1, 2] }))).toBe(false);
    expect(exerciseDone(ex({ logged: [1, 2], pending_set_numbers: [3] }))).toBe(
      true,
    );
  });

  it("counts a queued set once, not twice, when its echo lands", () => {
    // the revalidation has landed for set 1 but the queue entry is a frame from
    // being retired — the progress bar must not read 4 / 3
    const totals = daySetTotals([
      ex({ logged: [1, 2], pending_set_numbers: [1, 3] }),
    ]);
    expect(totals).toEqual({ loggedSets: 3, totalSets: 3 });
  });

  it("is absent for every caller reading server state alone", () => {
    expect(daySetTotals([ex({ logged: [1] })])).toEqual({
      loggedSets: 1,
      totalSets: 3,
    });
  });
});

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

describe("loggedSetMarker (P19/N11 → doc 16 §5.3 three-state)", () => {
  const e1rmCfg = DEFAULT_ENGINE_PARAMS.e1rm;
  // band absent from params ⇒ the shared default (±1.5%, the old MARKER_BAND)
  const band = complianceBand(DEFAULT_ENGINE_PARAMS);
  const asPrescribed = {
    prescribedEffectiveWeight: 100,
    prescribedReps: 10,
    loggedEffectiveWeight: 100,
    loggedReps: 10,
    band,
    e1rmCfg,
  };

  // the N11 regression: rir_reported defaulted to 0 while the prescription
  // baked in the week's target RIR, so an exactly-as-prescribed quick-logged
  // set read as a big miss — worst on deloads (the largest target RIR). Under
  // doc 16 §5.3 the in-band case is the positive `met` state, not absence.
  it("exactly-prescribed with unreported RIR reads met on a deload", () => {
    expect(
      loggedSetMarker({ ...asPrescribed, loggedRir: null, targetRir: 6 }),
    ).toBe("met");
  });

  it("exactly-prescribed with unreported RIR reads met on a working week", () => {
    expect(
      loggedSetMarker({ ...asPrescribed, loggedRir: null, targetRir: 2 }),
    ).toBe("met");
  });

  it("reported RIR equal to the target reads met", () => {
    expect(
      loggedSetMarker({ ...asPrescribed, loggedRir: 2, targetRir: 2 }),
    ).toBe("met");
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

  it("the band is params-fed: a wide band absorbs a small beat into met", () => {
    const overAtDefault = {
      ...asPrescribed,
      loggedReps: 11,
      loggedRir: null,
      targetRir: 2,
    };
    expect(loggedSetMarker(overAtDefault)).toBe("over");
    expect(loggedSetMarker({ ...overAtDefault, band: 0.2 })).toBe("met");
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

// --- prescriptionBasisE1rm (N56) -------------------------------------------
// The set rows must price against the GRADED ask. Numbers below are the real
// N56 field case (2026-07-19 review doc): stored W2·D4 prescription 250×9@2
// (implied e1RM 341.7) vs a live measured anchor of 333.1 after the other
// day-slot's weaker session — the old measured-anchor fallback displayed 8
// reps for an ask the earn gate scored at 9.

describe("impliedPrescriptionE1rm", () => {
  const e1rmCfg = DEFAULT_ENGINE_PARAMS.e1rm;

  it("prices the stored prescription at the target RIR (external load)", () => {
    const v = impliedPrescriptionE1rm({
      prescribedWeight: 250,
      prescribedReps: 9,
      targetRir: 2,
      loadType: "external",
      bodyweight: null,
      e1rmCfg,
    });
    // 250 × k(9 + 2 effective reps) under the default averaged Epley/Brzycki
    // curve — the same number the detail sheet's PRESCRIBED IMPLIES line and
    // the earn gate's comparison see
    expect(v).toBeCloseTo(343.9, 1);
  });

  it("prices bodyweight-loadable prescriptions on effective load", () => {
    const external = impliedPrescriptionE1rm({
      prescribedWeight: 185,
      prescribedReps: 8,
      targetRir: 2,
      loadType: "external",
      bodyweight: null,
      e1rmCfg,
    });
    const loadable = impliedPrescriptionE1rm({
      prescribedWeight: 25,
      prescribedReps: 8,
      targetRir: 2,
      loadType: "bodyweight_loadable",
      bodyweight: 160,
      e1rmCfg,
    });
    expect(loadable).not.toBeNull();
    expect(loadable).toBeCloseTo(external!, 5);
  });

  it("is null without a comparable prescription", () => {
    expect(
      impliedPrescriptionE1rm({
        prescribedWeight: null,
        prescribedReps: 9,
        targetRir: 2,
        loadType: "external",
        bodyweight: null,
        e1rmCfg,
      }),
    ).toBeNull();
    expect(
      impliedPrescriptionE1rm({
        prescribedWeight: 25,
        prescribedReps: 8,
        targetRir: 2,
        loadType: "bodyweight_loadable",
        bodyweight: null, // no bodyweight → no effective load
        e1rmCfg,
      }),
    ).toBeNull();
  });
});

describe("prescriptionBasisE1rm (N56)", () => {
  const e1rmCfg = DEFAULT_ENGINE_PARAMS.e1rm;
  const holdRow = {
    prescriptionAnchor: null,
    prescribedWeight: 250,
    prescribedReps: 9,
    targetRir: 2,
    loadType: "external" as const,
    bodyweight: null,
    measuredAnchor: 333.1,
    e1rmCfg,
  };

  it("a stepped row prices off the recorded target A*", () => {
    expect(
      prescriptionBasisE1rm({ ...holdRow, prescriptionAnchor: 346.7 }),
    ).toBe(346.7);
  });

  it("a hold/paced row prices off the prescription's own implied e1RM, not the live measurement", () => {
    expect(prescriptionBasisE1rm(holdRow)).toBeCloseTo(343.9, 1);
  });

  it("only a row with no prescription falls back to the measured anchor", () => {
    expect(
      prescriptionBasisE1rm({ ...holdRow, prescribedReps: null }),
    ).toBe(333.1);
  });

  it("display faithfulness: predicting reps at the prescribed weight off the basis returns the prescribed reps", () => {
    const basis = prescriptionBasisE1rm(holdRow);
    // the fix: the cells show the graded ask (9), where the old measured-anchor
    // fallback showed 8 — the un-earnable ask of the N56 report
    expect(predictRepsAtWeight(basis, 250, 2, e1rmCfg)).toBe(9);
    expect(predictRepsAtWeight(holdRow.measuredAnchor, 250, 2, e1rmCfg)).toBe(8);
  });
});
