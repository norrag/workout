/**
 * Exercise-level RIR — the pure resolution (doc 21 §4.1, Phase 2).
 *
 * Absolute semantics (A2): the slot's assignment wins where set, the meso's RIR
 * ramp reasserts where unset — in both directions, with no floor and no offset.
 */
import { describe, expect, it } from "vitest";
import {
  applySlotEffortPatch,
  assignmentHardensWeek,
  emptySlotEffort,
  isBackedOffSlot,
  getSlotEffortAssignments,
  planSlotEffortEdit,
  restoreSlotEffortAssignments,
  exerciseRirInput,
  exerciseSetCapInput,
  hasAssignment,
  parseRepPosition,
  repPositionToDb,
  slotEffortInputs,
  orphanedSlotSchedules,
  resolveSlotEffort,
  slotEffortKey,
  slotEffortSignatureInput,
  slotRir,
  slotSetCap,
  type SlotEffortAssignment,
} from "../slot-effort";
import { fakeClient } from "./fake-client";

function assignment(
  o: Partial<SlotEffortAssignment> = {},
): SlotEffortAssignment {
  return {
    target_rir: null,
    rir_schedule: null,
    set_cap: null,
    set_cap_schedule: null,
    rep_position: null,
    effort_reason: null,
    ...o,
  };
}

describe("slotRir (§4.1)", () => {
  it("unassigned resolves to null — the week's ramp is in control", () => {
    expect(slotRir(null, 3)).toBeNull();
    expect(slotRir(undefined, 3)).toBeNull();
    expect(slotRir(assignment(), 3)).toBeNull();
  });

  it("a flat target_rir applies to every week", () => {
    const a = assignment({ target_rir: 4 });
    expect([1, 2, 3, 4, 5].map((w) => slotRir(a, w))).toEqual([4, 4, 4, 4, 4]);
  });

  it("a per-week schedule is indexed 1-based by working week", () => {
    const a = assignment({ rir_schedule: [3, 2, 1, 0] });
    expect([1, 2, 3, 4].map((w) => slotRir(a, w))).toEqual([3, 2, 1, 0]);
  });

  it("the headline case: RIR 4 for weeks 3 and 4 only, ramp otherwise", () => {
    const a = assignment({ rir_schedule: [null, null, 4, 4] });
    expect([1, 2, 3, 4].map((w) => slotRir(a, w))).toEqual([null, null, 4, 4]);
  });

  it("a null element falls back to the flat value, not to the ramp", () => {
    const a = assignment({ target_rir: 6, rir_schedule: [null, 2] });
    expect(slotRir(a, 1)).toBe(6);
    expect(slotRir(a, 2)).toBe(2);
  });

  it("a week past the schedule (the deload) falls back to the flat value", () => {
    // the schedule covers the 4 WORKING weeks; week 5 is the deload
    const a = assignment({ target_rir: 5, rir_schedule: [3, 3, 3, 3] });
    expect(slotRir(a, 5)).toBe(5);
    expect(slotRir(assignment({ rir_schedule: [3, 3, 3, 3] }), 5)).toBeNull();
  });

  it("0 is a real assignment, not an absence", () => {
    expect(slotRir(assignment({ target_rir: 0 }), 1)).toBe(0);
    expect(slotRir(assignment({ rir_schedule: [0] }), 1)).toBe(0);
  });
});

describe("resolveSlotEffort (§4.1 — absolute)", () => {
  it("unset yields to the week's ramp", () => {
    const r = resolveSlotEffort(null, 2, 2);
    expect(r).toMatchObject({ rir: 2, assignedRir: null, weekRir: 2, backedOff: false });
  });

  it("set wins over the week — upward (backing off)", () => {
    const r = resolveSlotEffort(assignment({ target_rir: 8 }), 3, 1);
    expect(r.rir).toBe(8);
    expect(r.backedOff).toBe(true);
  });

  it("set wins over the week — downward (pushing harder), and is not backed off", () => {
    const r = resolveSlotEffort(assignment({ target_rir: 0 }), 2, 3);
    expect(r.rir).toBe(0);
    expect(r.backedOff).toBe(false);
  });

  it("no clamp against the week: an assignment equal to the week reads as assigned but not backed off", () => {
    const r = resolveSlotEffort(assignment({ target_rir: 2 }), 1, 2);
    expect(r).toMatchObject({ rir: 2, assignedRir: 2, backedOff: false });
  });

  it("wins on a DELOAD week too — including downward, which hardens it (§4.1)", () => {
    // the deload week carries the params deload RIR (6); the coach ramps back in
    const r = resolveSlotEffort(assignment({ target_rir: 3 }), 5, 6);
    expect(r.rir).toBe(3);
    expect(assignmentHardensWeek(r.assignedRir, r.weekRir)).toBe(true);
    // no silent semantics: the week's own default is always carried alongside
    expect(r.weekRir).toBe(6);
  });

  it("carries the reason (A7) and the resolved set cap (A4)", () => {
    const r = resolveSlotEffort(
      assignment({
        target_rir: 5,
        set_cap_schedule: [null, 2],
        effort_reason: "left elbow rehab",
      }),
      2,
      1,
    );
    expect(r.reason).toBe("left elbow rehab");
    expect(r.setCap).toBe(2);
  });

  it("an unbounded ask resolves untouched (§4.3 — the measuring band, not the ceiling, is the guard)", () => {
    expect(resolveSlotEffort(assignment({ target_rir: 21 }), 1, 2).rir).toBe(21);
  });
});

describe("slotSetCap (A4)", () => {
  it("resolves with the same precedence as the RIR lever", () => {
    const a = assignment({ set_cap: 3, set_cap_schedule: [null, 1] });
    expect(slotSetCap(a, 1)).toBe(3);
    expect(slotSetCap(a, 2)).toBe(1);
    expect(slotSetCap(null, 1)).toBeNull();
  });
});

describe("exerciseRirInput (§7.1 byte-identity)", () => {
  it("is undefined — never null — when unassigned, so the key is omitted", () => {
    expect(exerciseRirInput(null, 1)).toBeUndefined();
    expect(exerciseRirInput(assignment(), 1)).toBeUndefined();
    expect(exerciseRirInput(assignment({ rir_schedule: [null] }), 1)).toBeUndefined();
    // and JSON drops it entirely, which is what keeps the fingerprint stable
    expect(JSON.stringify({ exerciseRir: exerciseRirInput(null, 1) })).toBe("{}");
  });

  it("is the assigned value when set, including 0", () => {
    expect(exerciseRirInput(assignment({ target_rir: 0 }), 1)).toBe(0);
    expect(exerciseRirInput(assignment({ target_rir: 8 }), 1)).toBe(8);
  });
});

describe("slotEffortKey", () => {
  it("addresses the day-slot × exercise grain (A3)", () => {
    expect(slotEffortKey(2, "ex-1")).toBe("2::ex-1");
    expect(slotEffortKey(2, "ex-1")).not.toBe(slotEffortKey(3, "ex-1"));
  });
});

describe("hasAssignment", () => {
  it("a reason alone is not an assignment", () => {
    expect(hasAssignment(assignment({ effort_reason: "why" }))).toBe(false);
    expect(hasAssignment(assignment({ target_rir: 4 }))).toBe(true);
    expect(hasAssignment(assignment({ set_cap: 2 }))).toBe(true);
  });
});

describe("slotEffortSignatureInput (§7.2 gate)", () => {
  it("is null with no assignments — the meso signature stays byte-identical", () => {
    expect(slotEffortSignatureInput(new Map())).toBeNull();
  });

  it("is order-stable and changes with any assignment edit", () => {
    const a = new Map([
      ["2::b", assignment({ target_rir: 4 })],
      ["1::a", assignment({ rir_schedule: [null, 3] })],
    ]);
    const b = new Map([
      ["1::a", assignment({ rir_schedule: [null, 3] })],
      ["2::b", assignment({ target_rir: 4 })],
    ]);
    expect(slotEffortSignatureInput(a)).toEqual(slotEffortSignatureInput(b));

    const edited = new Map(a);
    edited.set("2::b", assignment({ target_rir: 5 }));
    expect(slotEffortSignatureInput(edited)).not.toEqual(
      slotEffortSignatureInput(a),
    );

    const cleared = new Map(a);
    cleared.delete("2::b");
    expect(slotEffortSignatureInput(cleared)).not.toEqual(
      slotEffortSignatureInput(a),
    );
  });

  it("distinguishes a null schedule element from a 0 assignment", () => {
    const withNull = new Map([["1::a", assignment({ rir_schedule: [null, 3] })]]);
    const withZero = new Map([["1::a", assignment({ rir_schedule: [0, 3] })]]);
    expect(slotEffortSignatureInput(withNull)).not.toEqual(
      slotEffortSignatureInput(withZero),
    );
  });
});

describe("orphanedSlotSchedules (§3 — the N18-B clearing rule per slot)", () => {
  const slots = [
    { id: "fits", rir_schedule: [1, 2, 3, 4], set_cap_schedule: null },
    { id: "short", rir_schedule: [1, 2], set_cap_schedule: null },
    { id: "caps", rir_schedule: null, set_cap_schedule: [1, 2, 3] },
    { id: "none", rir_schedule: null, set_cap_schedule: null },
  ];

  it("names only the schedules that no longer cover the working weeks", () => {
    expect(orphanedSlotSchedules(slots, 4)).toEqual([
      { id: "short", rir: true, setCap: false },
      { id: "caps", rir: false, setCap: true },
    ]);
  });

  it("clears nothing when the shape still fits", () => {
    expect(
      orphanedSlotSchedules([{ ...slots[0] }], 4),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// authoring (doc 21 Phase 3 — the write side)
// ---------------------------------------------------------------------------

const FIVE_WITH_DELOAD = { weeks: 5, includesDeload: true }; // 4 working weeks
const FOUR_NO_DELOAD = { weeks: 4, includesDeload: false };

function planned(
  current: SlotEffortAssignment,
  edit: Parameters<typeof planSlotEffortEdit>[1],
  shape = FIVE_WITH_DELOAD,
) {
  const r = planSlotEffortEdit(current, edit, shape);
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.plan;
}

function refused(
  current: SlotEffortAssignment,
  edit: Parameters<typeof planSlotEffortEdit>[1],
  shape = FIVE_WITH_DELOAD,
) {
  const r = planSlotEffortEdit(current, edit, shape);
  if (r.ok) throw new Error(`expected a refusal, got: ${r.plan.summary}`);
  return r.error;
}

describe("planSlotEffortEdit — the value forms", () => {
  it("a flat value assigns every week, deload included (§4.1 absolute)", () => {
    const plan = planned(assignment(), { lever: "rir", value: 4 });
    expect(plan.patch).toEqual({ target_rir: 4, rir_schedule: null });
    expect(plan.byWeek).toEqual([4, 4, 4, 4]);
    expect(plan.assignedWeeks).toEqual([1, 2, 3, 4]);
    // the flat value is what a week off the end of the schedule falls back to,
    // so it governs the deload week too — the thing that must never be silent
    expect(plan.coversDeload).toBe(true);
    expect(plan.summary).toBe("RIR 4 for the whole mesocycle");
  });

  it("value + weeks writes the headline case: RIR 4 on weeks 3–4 only", () => {
    const plan = planned(assignment(), { lever: "rir", value: 4, weeks: [3, 4] });
    expect(plan.patch).toEqual({ target_rir: null, rir_schedule: [null, null, 4, 4] });
    expect(plan.byWeek).toEqual([null, null, 4, 4]);
    expect(plan.assignedWeeks).toEqual([3, 4]);
    // week-targeted ⇒ the deload week keeps its own default
    expect(plan.coversDeload).toBe(false);
    expect(plan.summary).toBe("RIR 4 on weeks 3, 4");
  });

  it("an explicit schedule is taken as given, nulls and all", () => {
    const plan = planned(assignment(), {
      lever: "rir",
      schedule: [null, 5, 4, null],
    });
    expect(plan.patch.rir_schedule).toEqual([null, 5, 4, null]);
    expect(plan.assignedWeeks).toEqual([2, 3]);
    expect(plan.summary).toMatch(/w2:5 w3:4/);
  });

  it("clear removes the lever and, with nothing left, the reason too (A7)", () => {
    const plan = planned(
      assignment({ target_rir: 4, effort_reason: "elbow" }),
      { lever: "rir", clear: true },
    );
    expect(plan.patch).toEqual({
      target_rir: null,
      rir_schedule: null,
      effort_reason: null,
    });
    expect(plan.cleared).toBe(true);
    expect(plan.assignedWeeks).toEqual([]);
  });

  it("an explicit null value is the same as clear", () => {
    expect(planned(assignment({ target_rir: 4 }), { lever: "rir", value: null }).patch)
      .toMatchObject({ target_rir: null, rir_schedule: null });
  });

  it("clearing one lever keeps the reason while the other stays assigned", () => {
    const plan = planned(
      assignment({ target_rir: 4, set_cap: 2, effort_reason: "elbow" }),
      { lever: "rir", clear: true },
    );
    expect(plan.cleared).toBe(false);
    expect(plan.patch.effort_reason).toBeUndefined();
    expect(plan.next.effort_reason).toBe("elbow");
  });

  it("the set lever writes its own columns with the same shape (A4)", () => {
    const plan = planned(assignment(), { lever: "sets", value: 2, weeks: [4] });
    expect(plan.patch).toEqual({ set_cap: null, set_cap_schedule: [null, null, null, 2] });
    expect(plan.summary).toBe("2 sets on week 4");
  });

  it("switching from a schedule to a flat value clears the schedule", () => {
    const plan = planned(assignment({ rir_schedule: [null, null, 4, 4] }), {
      lever: "rir",
      value: 3,
    });
    expect(plan.patch).toEqual({ target_rir: 3, rir_schedule: null });
    expect(plan.byWeek).toEqual([3, 3, 3, 3]);
  });

  it("a meso without a deload never reports deload coverage", () => {
    const plan = planned(assignment(), { lever: "rir", value: 4 }, FOUR_NO_DELOAD);
    expect(plan.byWeek).toEqual([4, 4, 4, 4]);
    expect(plan.coversDeload).toBe(false);
  });
});

describe("planSlotEffortEdit — reason (A7)", () => {
  it("sets, trims, and clears independently of the lever", () => {
    expect(
      planned(assignment(), { lever: "rir", value: 4, reason: "  right elbow  " })
        .patch.effort_reason,
    ).toBe("right elbow");
    expect(
      planned(assignment({ target_rir: 4, effort_reason: "old" }), {
        lever: "rir",
        value: 5,
        reason: null,
      }).patch.effort_reason,
    ).toBeNull();
    // absent ⇒ untouched
    expect(
      planned(assignment({ target_rir: 4, effort_reason: "keep" }), {
        lever: "rir",
        value: 5,
      }).patch.effort_reason,
    ).toBeUndefined();
  });

  it("an empty reason stores null rather than an empty string", () => {
    expect(
      planned(assignment(), { lever: "rir", value: 4, reason: "   " }).patch
        .effort_reason,
    ).toBeNull();
  });
});

describe("planSlotEffortEdit — refusals", () => {
  it("needs exactly one value form", () => {
    expect(refused(assignment(), { lever: "rir" })).toMatch(/nothing to set/);
    expect(
      refused(assignment(), { lever: "rir", value: 4, clear: true }),
    ).toMatch(/exactly one/);
    expect(
      refused(assignment(), { lever: "rir", value: 4, schedule: [1, 1, 1, 1] }),
    ).toMatch(/exactly one/);
  });

  it("refuses weeks without a value", () => {
    expect(refused(assignment(), { lever: "rir", weeks: [3] })).toMatch(/supply the value/);
  });

  it("refuses a week outside the working weeks (the deload can't be named)", () => {
    expect(refused(assignment(), { lever: "rir", value: 4, weeks: [5] })).toMatch(
      /outside this mesocycle's 4 working week/,
    );
  });

  it("refuses a schedule that doesn't cover the working weeks", () => {
    expect(refused(assignment(), { lever: "rir", schedule: [4, 4] })).toMatch(
      /must cover the 4 working week/,
    );
  });

  it("refuses an all-null schedule — that is a clear, and should say so", () => {
    expect(
      refused(assignment(), { lever: "rir", schedule: [null, null, null, null] }),
    ).toMatch(/clear: true/);
  });

  it("refuses values the database would reject, per lever", () => {
    // §4.3: the ask is unbounded in principle, 30 is what the column persists
    expect(planSlotEffortEdit(assignment(), { lever: "rir", value: 30 }, FIVE_WITH_DELOAD).ok).toBe(true);
    expect(refused(assignment(), { lever: "rir", value: 31 })).toMatch(/0–30/);
    expect(refused(assignment(), { lever: "rir", value: -1 })).toMatch(/0–30/);
    expect(refused(assignment(), { lever: "sets", value: 0 })).toMatch(/1–20/);
    expect(refused(assignment(), { lever: "sets", value: 21 })).toMatch(/1–20/);
    expect(
      refused(assignment(), { lever: "rir", schedule: [null, 44, null, null] }),
    ).toMatch(/0–30/);
  });

  it("refuses an over-long reason", () => {
    expect(
      refused(assignment(), { lever: "rir", value: 4, reason: "x".repeat(501) }),
    ).toMatch(/500 characters/);
  });
});

describe("planSlotEffortEdit — composition", () => {
  it("two edits compose through applySlotEffortPatch", () => {
    let a = emptySlotEffort();
    a = applySlotEffortPatch(
      a,
      planned(a, { lever: "rir", value: 4, weeks: [3, 4], reason: "elbow" }).patch,
    );
    a = applySlotEffortPatch(a, planned(a, { lever: "sets", value: 2, weeks: [3, 4] }).patch);
    expect(a).toEqual({
      target_rir: null,
      rir_schedule: [null, null, 4, 4],
      set_cap: null,
      set_cap_schedule: [null, null, 2, 2],
      rep_position: null,
      effort_reason: "elbow",
    });
    // and clearing both levers takes the reason with the last of them
    a = applySlotEffortPatch(a, planned(a, { lever: "rir", clear: true }).patch);
    a = applySlotEffortPatch(a, planned(a, { lever: "sets", clear: true }).patch);
    expect(hasAssignment(a)).toBe(false);
    expect(a.effort_reason).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// doc 21 Phase 4 — the set-cap engine input + the rep-position lever
// ---------------------------------------------------------------------------

describe("exerciseSetCapInput / slotEffortInputs (Phase 4 byte-identity)", () => {
  it("omits every unassigned lever, so the projection is pre-doc-21 shaped", () => {
    expect(slotEffortInputs(assignment(), 2)).toEqual({});
    expect(slotEffortInputs(null, 2)).toEqual({});
    expect(exerciseSetCapInput(assignment(), 2)).toBeUndefined();
  });

  it("carries exactly the levers that are assigned", () => {
    expect(
      slotEffortInputs(
        assignment({ set_cap_schedule: [null, 2, 2, null], rep_position: "top" }),
        2,
      ),
    ).toEqual({ exerciseSetCap: 2, exerciseRepPosition: "top" });
    // week 4 falls outside the cap schedule ⇒ only the flat rep position rides
    expect(
      slotEffortInputs(
        assignment({ set_cap_schedule: [null, 2, 2, null], rep_position: "top" }),
        4,
      ),
    ).toEqual({ exerciseRepPosition: "top" });
  });

  it("a set cap of 1 is a real assignment, not an absence", () => {
    expect(slotEffortInputs(assignment({ set_cap: 1 }), 1)).toEqual({
      exerciseSetCap: 1,
    });
  });
});

describe("parseRepPosition (§4.2)", () => {
  it("round-trips the named positions and explicit counts", () => {
    for (const p of ["bottom", "center", "top"] as const) {
      expect(parseRepPosition(p)).toBe(p);
      expect(repPositionToDb(p)).toBe(p);
    }
    expect(parseRepPosition("12")).toBe(12);
    expect(repPositionToDb(12)).toBe("12");
  });

  it("degrades unparseable text to null rather than failing a prescription", () => {
    expect(parseRepPosition(null)).toBeNull();
    expect(parseRepPosition("middle")).toBeNull();
    expect(parseRepPosition("0")).toBeNull();
    expect(parseRepPosition("99")).toBeNull();
  });

  it("is part of hasAssignment and of the stale signature", () => {
    expect(hasAssignment(assignment({ rep_position: "top" }))).toBe(true);
    const withPosition = new Map([["1::a", assignment({ rep_position: "top" })]]);
    const without = new Map([["1::a", assignment({ rep_position: null })]]);
    expect(slotEffortSignatureInput(withPosition)).not.toEqual(
      slotEffortSignatureInput(without),
    );
  });
});

describe("planSlotEffortEdit — the rep-position lever (§4.2)", () => {
  it("assigns a named position flat for the slot", () => {
    const plan = planned(assignment(), { lever: "rep_position", position: "top" });
    expect(plan.patch).toEqual({ rep_position: "top" });
    expect(plan.summary).toMatch(/top of the rep window/);
    // flat means no week is named: nothing for the batch planner to warn about
    expect(plan.assignedWeeks).toEqual([]);
    expect(plan.coversDeload).toBe(false);
  });

  it("stores an explicit rep count as its canonical text", () => {
    expect(
      planned(assignment(), { lever: "rep_position", position: 15 }).patch,
    ).toEqual({ rep_position: "15" });
  });

  it("clears back to the climb schedule, taking a lone reason with it", () => {
    const current = assignment({ rep_position: "top", effort_reason: "tendon" });
    const plan = planned(current, { lever: "rep_position", clear: true });
    expect(plan.patch).toEqual({ rep_position: null, effort_reason: null });
    expect(plan.cleared).toBe(true);
    expect(plan.summary).toMatch(/climb schedule decides again/);
  });

  it("refuses weeks, a schedule, or an out-of-range position", () => {
    expect(
      refused(assignment(), { lever: "rep_position", position: "top", weeks: [3] }),
    ).toMatch(/flat for the slot/);
    expect(
      refused(assignment(), { lever: "rep_position", schedule: [null, 1] }),
    ).toMatch(/flat for the slot/);
    expect(refused(assignment(), { lever: "rep_position" })).toMatch(
      /nothing to set/,
    );
    expect(
      refused(assignment(), { lever: "rep_position", position: 99 }),
    ).toMatch(/bottom, center, top, or a whole rep count/);
  });

  it("composes with the two week-scheduled levers on one slot", () => {
    let a = emptySlotEffort();
    a = applySlotEffortPatch(
      a,
      planned(a, { lever: "rir", value: 4, weeks: [3, 4] }).patch,
    );
    a = applySlotEffortPatch(
      a,
      planned(a, { lever: "rep_position", position: "top", reason: "elbow" }).patch,
    );
    expect(a.rir_schedule).toEqual([null, null, 4, 4]);
    expect(a.rep_position).toBe("top");
    expect(a.effort_reason).toBe("elbow");
    // clearing the RIR leaves the position — and the reason — standing
    a = applySlotEffortPatch(a, planned(a, { lever: "rir", clear: true }).patch);
    expect(hasAssignment(a)).toBe(true);
    expect(a.effort_reason).toBe("elbow");
  });
});

describe("restoreSlotEffortAssignments (the save_meso_plan replace)", () => {
  // `save_meso_plan` deletes the meso's days and re-inserts every slot from a
  // structure-only payload, so without the re-key a plain reorder would wipe
  // every assignment in the meso.
  function tables(slotRows: Record<string, unknown>[]) {
    return {
      meso_exercises: slotRows,
      meso_days: [{ id: "d1", mesocycle_id: "m1", day_number: 1 }],
      meso_day_groups: [{ id: "g1", meso_day_id: "d1" }],
    };
  }

  it("carries an assignment onto the re-minted row for the same day × exercise", async () => {
    const before = tables([
      {
        id: "old-slot",
        mesocycle_id: "m1",
        meso_day_group_id: "g1",
        day_of_week: null,
        exercise_id: "e-bench",
        target_rir: null,
        rir_schedule: [null, null, 4, 4],
        set_cap: null,
        set_cap_schedule: null,
        effort_reason: "elbow",
      },
    ]);
    const snapshot = await getSlotEffortAssignments(fakeClient(before), "m1");
    expect(snapshot.size).toBe(1);

    // the replace: same day, same exercise, brand-new row id, no assignment
    const after = tables([
      {
        id: "new-slot",
        mesocycle_id: "m1",
        meso_day_group_id: "g1",
        day_of_week: null,
        exercise_id: "e-bench",
        target_rir: null,
        rir_schedule: null,
        set_cap: null,
        set_cap_schedule: null,
        effort_reason: null,
      },
    ]);
    const client = fakeClient(after);
    expect(await restoreSlotEffortAssignments(client, "m1", snapshot)).toBe(1);
    expect(after.meso_exercises[0]).toMatchObject({
      id: "new-slot",
      rir_schedule: [null, null, 4, 4],
      effort_reason: "elbow",
    });
  });

  it("drops the assignment of a slot the edit removed, and leaves others alone", async () => {
    const snapshot = new Map([
      [
        slotEffortKey(1, "e-gone"),
        assignment({ target_rir: 4, effort_reason: "elbow" }),
      ],
    ]);
    const after = tables([
      {
        id: "kept",
        mesocycle_id: "m1",
        meso_day_group_id: "g1",
        day_of_week: null,
        exercise_id: "e-bench",
        target_rir: null,
        rir_schedule: null,
        set_cap: null,
        set_cap_schedule: null,
        effort_reason: null,
      },
    ]);
    expect(await restoreSlotEffortAssignments(fakeClient(after), "m1", snapshot)).toBe(0);
    expect(after.meso_exercises[0].target_rir).toBeNull();
  });

  it("writes nothing at all when the meso has no assignments", async () => {
    const after = tables([]);
    expect(await restoreSlotEffortAssignments(fakeClient(after), "m1", new Map())).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// doc 21 §6.2 (Phase 5) — the intent key the stats policy reads
// ---------------------------------------------------------------------------

describe("isBackedOffSlot (§6.2)", () => {
  it("is true only when the slot runs EASIER than its week", () => {
    expect(isBackedOffSlot(4, 1)).toBe(true);
    expect(isBackedOffSlot(21, 2)).toBe(true);
  });

  it("is not symmetric: a slot run HARDER stays fully comparable", () => {
    // an assignment below the ramp is disclosed at authoring time (§4.1) and
    // keeps every strength claim it earns — the athlete really did that work
    expect(isBackedOffSlot(0, 2)).toBe(false);
  });

  it("equal is not backed off — an assignment matching the week changes nothing", () => {
    expect(isBackedOffSlot(2, 2)).toBe(false);
  });

  it("null on either side is never backed off (pre-doc-21 rows, unassigned slots)", () => {
    expect(isBackedOffSlot(null, 2)).toBe(false);
    expect(isBackedOffSlot(4, null)).toBe(false);
    expect(isBackedOffSlot(undefined, undefined)).toBe(false);
  });

  it("agrees with resolveSlotEffort, which is the same rule at plan grain", () => {
    const r = resolveSlotEffort(assignment({ target_rir: 6 }), 2, 2);
    expect(r.backedOff).toBe(isBackedOffSlot(r.assignedRir, r.weekRir));
  });
});
