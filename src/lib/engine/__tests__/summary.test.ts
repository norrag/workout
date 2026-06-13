import { describe, expect, it } from "vitest";
import {
  composeAutoregulationSummary,
  composeMesoCompleteSummary,
} from "../summary";

const base = {
  nextWeekNumber: 3,
  nextTargetRir: 1,
  nextIsDeload: false,
  currentTargetRir: 1,
  units: "lb" as const,
};

describe("composeAutoregulationSummary (fig 1.5 copy)", () => {
  it("lists per-exercise load and set changes with the ramp line", () => {
    const out = composeAutoregulationSummary({
      ...base,
      deltas: [
        {
          exerciseName: "Hack Squat",
          previousWeight: 180,
          previousSets: 3,
          nextWeight: 185,
          nextSets: 3,
        },
        {
          exerciseName: "Cable Pushdown",
          previousWeight: 42.5,
          previousSets: 3,
          nextWeight: 42.5,
          nextSets: 4,
        },
      ],
    });
    expect(out).toBe(
      "Feedback recorded. W3 targets recalculated — Hack Squat +5 lb, " +
        "Cable Pushdown +1 set. Ramp holds at 1 RIR next week.",
    );
  });

  it("says when everything holds and when the ramp steps", () => {
    const out = composeAutoregulationSummary({
      ...base,
      currentTargetRir: 2,
      deltas: [
        {
          exerciseName: "Bench Press",
          previousWeight: 100,
          previousSets: 3,
          nextWeight: 100,
          nextSets: 3,
        },
      ],
    });
    expect(out).toBe(
      "Feedback recorded. W3 targets recalculated — all targets hold. " +
        "Ramp moves to 1 RIR next week.",
    );
  });

  it("caps the clause list and counts the rest", () => {
    const delta = (name: string) => ({
      exerciseName: name,
      previousWeight: 100,
      previousSets: 3,
      nextWeight: 105,
      nextSets: 3,
    });
    const out = composeAutoregulationSummary({
      ...base,
      deltas: ["A", "B", "C", "D", "E"].map(delta),
    });
    expect(out).toContain("A +5 lb, B +5 lb, C +5 lb and 2 more.");
  });

  it("announces the deload instead of listing changes", () => {
    const out = composeAutoregulationSummary({
      ...base,
      nextWeekNumber: 5,
      nextTargetRir: 4,
      nextIsDeload: true,
      deltas: [],
    });
    expect(out).toBe(
      "Feedback recorded. W5 is the deload — loads pulled back from peak " +
        "at 4+ RIR. Recover.",
    );
  });

  it("reports load drops with a minus sign", () => {
    const out = composeAutoregulationSummary({
      ...base,
      deltas: [
        {
          exerciseName: "Leg Press",
          previousWeight: 300,
          previousSets: 3,
          nextWeight: 270,
          nextSets: 3,
        },
      ],
    });
    expect(out).toContain("Leg Press −30 lb");
  });
});

describe("composeMesoCompleteSummary", () => {
  it("closes the meso without a next week", () => {
    expect(composeMesoCompleteSummary("Spring Block")).toBe(
      "Feedback recorded. That closes Spring Block — plan the next meso from Cycles.",
    );
  });
});
