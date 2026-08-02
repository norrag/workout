/**
 * Exercise-level RIR — the pure resolution (doc 21 §4.1, Phase 2).
 *
 * Absolute semantics (A2): the slot's assignment wins where set, the meso's RIR
 * ramp reasserts where unset — in both directions, with no floor and no offset.
 */
import { describe, expect, it } from "vitest";
import {
  assignmentHardensWeek,
  exerciseRirInput,
  hasAssignment,
  orphanedSlotSchedules,
  resolveSlotEffort,
  slotEffortKey,
  slotEffortSignatureInput,
  slotRir,
  slotSetCap,
  type SlotEffortAssignment,
} from "../slot-effort";

function assignment(
  o: Partial<SlotEffortAssignment> = {},
): SlotEffortAssignment {
  return {
    target_rir: null,
    rir_schedule: null,
    set_cap: null,
    set_cap_schedule: null,
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
