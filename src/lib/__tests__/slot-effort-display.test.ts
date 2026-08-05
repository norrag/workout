/**
 * doc 21 Phase 6 — how an effort assignment READS (`slot-effort-display.ts`).
 *
 * Three things these pin, in order of how badly they break if wrong:
 *
 * 1. **The §9.4 qualitative band.** Past the measuring band the app must stop
 *    printing an RIR number it refuses to treat as a measurement. The ask and
 *    the assignment line must agree about that — a strip that says "kept well
 *    short of failure" above a line that says "set to 21 reps short of failure"
 *    is worse than either alone.
 * 2. **Nothing renders for an unassigned slot.** Every surface composes from
 *    here, so this is where "an unassigned plan reads byte-identical to before
 *    the lever existed" is actually enforced.
 * 3. **The asymmetry (§6.2).** A slot run HARDER than its week is not backed
 *    off, keeps every strength claim, and must never be described as eased.
 */
import { describe, expect, it } from "vitest";
import {
  composeAssignmentLine,
  composeBandLine,
  composeComparabilityLine,
  composeEffortLines,
  composeReasonLine,
  composeSetCapLine,
  effortAskPhrase,
  effortEyebrowParts,
  effortEyebrowSuffix,
  effortRirLabel,
  hasEffortDisclosure,
  isPushedHarder,
  repPositionLabel,
  repPositionPhrase,
  type SlotEffortView,
} from "../slot-effort-display";

function view(over: Partial<SlotEffortView> = {}): SlotEffortView {
  return {
    rir: 4,
    assignedRir: 4,
    weekRir: 1,
    isDeload: false,
    setCap: null,
    repPosition: null,
    reason: null,
    backedOff: true,
    measuring: true,
    ...over,
  };
}

describe("hasEffortDisclosure — nothing to say for an unassigned slot", () => {
  it("is false for null/undefined", () => {
    expect(hasEffortDisclosure(null)).toBe(false);
    expect(hasEffortDisclosure(undefined)).toBe(false);
  });

  it("is false when every lever is unset, even with a stray reason", () => {
    expect(
      hasEffortDisclosure(
        view({
          assignedRir: null,
          setCap: null,
          repPosition: null,
          backedOff: false,
          reason: "left over",
        }),
      ),
    ).toBe(false);
  });

  it("is true for a cap or a rep position ALONE — those are assignments too", () => {
    expect(
      hasEffortDisclosure(view({ assignedRir: null, backedOff: false, setCap: 2 })),
    ).toBe(true);
    expect(
      hasEffortDisclosure(
        view({ assignedRir: null, backedOff: false, repPosition: "top" }),
      ),
    ).toBe(true);
  });

  it("renders no lines and no suffix when unassigned", () => {
    expect(composeEffortLines(null)).toEqual([]);
    expect(effortEyebrowSuffix(null)).toBe("");
    expect(effortEyebrowParts(undefined)).toEqual([]);
  });
});

describe("the eyebrow suffix", () => {
  it("names the RIR state first and caps at two parts", () => {
    const parts = effortEyebrowParts(view({ setCap: 2, repPosition: "top" }));
    expect(parts).toEqual(["BACKED OFF", "CAPPED 2", "TOP OF WINDOW"]);
    expect(effortEyebrowSuffix(view({ setCap: 2, repPosition: "top" }))).toBe(
      " · BACKED OFF · CAPPED 2",
    );
  });

  it("calls a harder-than-the-week assignment what it is", () => {
    const harder = view({ assignedRir: 0, weekRir: 2, backedOff: false });
    expect(isPushedHarder(harder)).toBe(true);
    expect(effortEyebrowParts(harder)).toEqual(["PUSHED HARDER"]);
  });

  it("says nothing about RIR when only a cap is assigned", () => {
    expect(
      effortEyebrowParts(view({ assignedRir: null, backedOff: false, setCap: 1 })),
    ).toEqual(["CAPPED 1"]);
  });
});

describe("§9.4 — the qualitative band", () => {
  it("prints the number inside the band", () => {
    expect(effortAskPhrase(0)).toBe("taken right to failure");
    expect(effortAskPhrase(1)).toBe("stopped 1 rep short of failure");
    expect(effortAskPhrase(8)).toBe("stopped 8 reps short of failure");
    expect(effortRirLabel(8)).toBe("8 RIR");
  });

  it("states the band, never the number, past it", () => {
    expect(effortAskPhrase(21, false)).toBe("kept well short of failure");
    expect(effortAskPhrase(21, false)).not.toMatch(/21/);
    expect(effortRirLabel(21, false)).toBe("LIGHT");
  });

  it("keeps the assignment line and the ask agreeing about the band", () => {
    const deep = view({ assignedRir: 21, rir: 21, measuring: false });
    const line = composeAssignmentLine(deep)!;
    expect(line).toMatch(/well short of failure/);
    expect(line).not.toMatch(/21/);
  });
});

describe("the assignment line names the week it departs from (§4.1)", () => {
  it("reads an eased assignment as easier than the week", () => {
    expect(composeAssignmentLine(view())).toBe(
      "This exercise is set to 4 reps short of failure this week, easier than the week's 1 rep short of failure.",
    );
  });

  it("reads a hardened assignment as harder than the week", () => {
    expect(
      composeAssignmentLine(view({ assignedRir: 0, weekRir: 2, backedOff: false })),
    ).toBe(
      "This exercise is set to failure this week, harder than the week's 2 reps short of failure.",
    );
  });

  it("names the deload week as the deload week", () => {
    expect(
      composeAssignmentLine(
        view({ assignedRir: 3, weekRir: 6, isDeload: true, backedOff: false }),
      ),
    ).toMatch(/harder than the deload week's 6 reps short of failure/);
  });

  it("is null when no RIR is assigned (a cap-only slot)", () => {
    expect(
      composeAssignmentLine(view({ assignedRir: null, backedOff: false, setCap: 2 })),
    ).toBeNull();
  });
});

describe("the consequence lines", () => {
  it("punctuates a reason without doubling an existing period", () => {
    expect(composeReasonLine(view({ reason: "nerve flare" }))).toBe(
      "Noted: nerve flare.",
    );
    expect(composeReasonLine(view({ reason: "nerve flare." }))).toBe(
      "Noted: nerve flare.",
    );
    expect(composeReasonLine(view())).toBeNull();
  });

  it("band and comparability are mutually exclusive — one exclusion, one sentence", () => {
    const past = view({ measuring: false });
    expect(composeBandLine(past)).not.toBeNull();
    expect(composeComparabilityLine(past)).toBeNull();

    const inside = view();
    expect(composeBandLine(inside)).toBeNull();
    expect(composeComparabilityLine(inside)).not.toBeNull();
  });

  it("says nothing about comparability for a slot run HARDER (§6.2 asymmetry)", () => {
    expect(
      composeComparabilityLine(
        view({ assignedRir: 0, weekRir: 2, backedOff: false }),
      ),
    ).toBeNull();
  });

  it("states the cap as a ceiling, never as a set count", () => {
    expect(composeSetCapLine(view({ setCap: 1 }))).toBe(
      "Working sets are capped at 1 set here — the program can go lower, never higher.",
    );
    expect(composeSetCapLine(view({ setCap: 3 }))).toMatch(/capped at 3 sets/);
  });
});

describe("composeEffortLines — assignment, reason, then ONE consequence", () => {
  it("orders the block and caps it at three lines", () => {
    const lines = composeEffortLines(
      view({ reason: "nerve flare", setCap: 2, repPosition: "top" }),
    );
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^This exercise is set to/);
    expect(lines[1]).toBe("Noted: nerve flare.");
    // in the band + backed off ⇒ comparability wins over the two shape levers
    expect(lines[2]).toMatch(/left out of the strength trend/);
  });

  it("falls through to the cap when there is no RIR assignment to explain", () => {
    const lines = composeEffortLines(
      view({ assignedRir: null, backedOff: false, setCap: 2 }),
    );
    expect(lines).toEqual([
      "Working sets are capped at 2 sets here — the program can go lower, never higher.",
    ]);
  });

  it("puts the not-a-measurement note above every other consequence", () => {
    const lines = composeEffortLines(
      view({ assignedRir: 21, rir: 21, measuring: false, setCap: 2 }),
    );
    expect(lines[1]).toMatch(/not read as a strength measurement/);
  });
});

describe("rep-position vocabulary", () => {
  it("reads a named position as a place in the window", () => {
    expect(repPositionPhrase("top")).toBe("the top of the rep window");
    expect(repPositionLabel("bottom")).toBe("BOTTOM OF WINDOW");
  });

  it("reads an explicit count as reps", () => {
    expect(repPositionPhrase(9)).toBe("9 reps");
    expect(repPositionPhrase(1)).toBe("1 rep");
    expect(repPositionLabel(15)).toBe("15 REPS");
  });
});
