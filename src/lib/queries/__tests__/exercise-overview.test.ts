/**
 * Pure-helper tests for the Exercise page (figs 3.1a/3.1b): the est-1RM
 * across-macro bars (state classification + rounding) and the history
 * meso-grouping. Data assembly itself is covered by integration smoke.
 */
import { describe, expect, it } from "vitest";
import { buildExerciseMacroBars } from "../exercises";
import {
  groupHistoryByMeso,
  sessionAvgE1rm,
  type HistoryEntry,
} from "../history";

describe("buildExerciseMacroBars", () => {
  const ids = ["m1", "m2", "m3", "m4"];

  it("labels M1..Mn, marks the current meso, and rounds e1RM", () => {
    const e1rm = new Map([
      ["m1", 285.4],
      ["m2", 319.8],
    ]);
    const bars = buildExerciseMacroBars(ids, "m2", e1rm);
    expect(bars).toEqual([
      { label: "M1", e1rm: 285, state: "past" },
      { label: "M2", e1rm: 320, state: "current" },
      { label: "M3", e1rm: null, state: "future" },
      { label: "M4", e1rm: null, state: "future" },
    ]);
  });

  it("the current meso stays current even if it has no logged e1RM yet", () => {
    const bars = buildExerciseMacroBars(ids, "m3", new Map([["m1", 200]]));
    expect(bars[2]).toEqual({ label: "M3", e1rm: null, state: "current" });
    expect(bars[0].state).toBe("past");
  });

  it("with no current meso, logged mesos are past and the rest future", () => {
    const bars = buildExerciseMacroBars(ids, null, new Map([["m1", 100]]));
    expect(bars.map((b) => b.state)).toEqual([
      "past",
      "future",
      "future",
      "future",
    ]);
  });

  it("returns no bars for an empty macro", () => {
    expect(buildExerciseMacroBars([], "m1", new Map())).toEqual([]);
  });
});

describe("sessionAvgE1rm", () => {
  it("averages the stored per-set estimates across the session (N2)", () => {
    // (220.5 + 281.3 + 250) / 3 = 250.6, not the max 281.3
    expect(sessionAvgE1rm([220.5, 281.3, 250])).toBe(250.6);
  });

  it("ignores sets without a stored estimate (averages only the present ones)", () => {
    expect(sessionAvgE1rm([null, 200, null])).toBe(200);
    expect(sessionAvgE1rm([null, 200, 210])).toBe(205);
  });

  it("rounds to one decimal to match stored per-set precision", () => {
    expect(sessionAvgE1rm([100, 101])).toBe(100.5);
    expect(sessionAvgE1rm([100, 100, 101])).toBe(100.3);
  });

  it("returns null when no set carries an estimate (bodyweight session)", () => {
    expect(sessionAvgE1rm([null, null])).toBeNull();
    expect(sessionAvgE1rm([])).toBeNull();
  });
});

describe("groupHistoryByMeso", () => {
  const entry = (mesocycle_id: string, meso_name: string, coordinate: string): HistoryEntry => ({
    mesocycle_id,
    meso_name,
    coordinate,
    performed_on: "2026-06-10",
    top_weight: 200,
    reps: "10, 10",
    e1rm: 266.7,
    effective_load: null,
    is_deload: false,
    session_note: null,
  });

  it("groups consecutive sessions of the same meso, preserving order", () => {
    const groups = groupHistoryByMeso([
      entry("a", "Bulk", "W2·D2"),
      entry("a", "Bulk", "W1·D2"),
      entry("b", "Girl Squad", "W5·D1"),
      entry("b", "Girl Squad", "W4·D1"),
    ]);
    expect(groups.map((g) => g.meso_name)).toEqual(["Bulk", "Girl Squad"]);
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[1].entries).toHaveLength(2);
  });

  it("keeps two same-named-but-distinct mesos separate", () => {
    const groups = groupHistoryByMeso([
      entry("a", "Bulk", "W1·D1"),
      entry("b", "Bulk", "W1·D1"),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("returns [] for no history", () => {
    expect(groupHistoryByMeso([])).toEqual([]);
  });
});
