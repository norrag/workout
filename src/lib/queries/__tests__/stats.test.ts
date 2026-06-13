/**
 * Pure-helper tests for the meso-stats screens (figs 4.1–4.3): the volume
 * matrix states, balance aggregation/copy, key-lift grid badges, and PR
 * detection. Data assembly itself is covered by integration smoke.
 */
import { describe, expect, it } from "vitest";
import {
  balanceCategory,
  buildBalance,
  buildKeyLifts,
  buildPrs,
  buildVolumeMatrix,
  type MesoStatsWeek,
} from "../stats";
import { templateEmphasis } from "../templates";

const weeks: MesoStatsWeek[] = [
  { week_number: 1, is_deload: false, status: "completed" },
  { week_number: 2, is_deload: false, status: "active" },
  { week_number: 3, is_deload: false, status: "pending" },
  { week_number: 4, is_deload: true, status: "pending" },
];

function viewRow(
  week_number: number,
  muscle_group: string,
  planned_sets: number | null,
  logged_sets: number,
) {
  return { week_number, muscle_group, planned_sets, logged_sets };
}

describe("buildVolumeMatrix", () => {
  const rows = [
    viewRow(1, "quads", 6, 6),
    viewRow(2, "quads", 7, 3),
    viewRow(1, "back", 4, 4),
    viewRow(2, "back", 4, 0),
  ];
  const baseline = new Map([
    ["quads", 6],
    ["back", 4],
  ]);

  it("shows logged for closed weeks, logged-so-far for the active week", () => {
    const volume = buildVolumeMatrix(weeks, rows, baseline);
    const quads = volume.groups.find((g) => g.name === "quads")!;
    expect(quads.cells[0]).toEqual({ value: 6, kind: "logged" });
    expect(quads.cells[1]).toEqual({ value: 3, kind: "current" });
  });

  it("falls back to the planner baseline for ungenerated weeks", () => {
    const volume = buildVolumeMatrix(weeks, rows, baseline);
    const quads = volume.groups.find((g) => g.name === "quads")!;
    expect(quads.cells[2]).toEqual({ value: 6, kind: "planned" });
  });

  it("leaves ungenerated deload weeks empty — the engine sizes them later", () => {
    const volume = buildVolumeMatrix(weeks, rows, baseline);
    const quads = volume.groups.find((g) => g.name === "quads")!;
    expect(quads.cells[3]).toEqual({ value: null, kind: "empty" });
  });

  it("uses the autoregulated plan when a future week is generated", () => {
    const volume = buildVolumeMatrix(
      weeks,
      [...rows, viewRow(3, "quads", 8, 0)],
      baseline,
    );
    const quads = volume.groups.find((g) => g.name === "quads")!;
    expect(quads.cells[2]).toEqual({ value: 8, kind: "planned" });
  });

  it("totals per week and reports the current-week footer", () => {
    const volume = buildVolumeMatrix(weeks, rows, baseline);
    expect(volume.totals[0].value).toBe(10);
    expect(volume.currentLogged).toBe(3);
    expect(volume.currentPlanned).toBe(11);
  });
});

describe("buildBalance", () => {
  it("classifies the seeded vocabulary", () => {
    expect(balanceCategory("chest")).toBe("push");
    expect(balanceCategory("back")).toBe("pull");
    expect(balanceCategory("glutes")).toBe("legs");
    expect(balanceCategory("abs")).toBeNull();
  });

  it("averages non-deload weeks into cards and bars, and writes the note", () => {
    const rows = [
      viewRow(1, "chest", 10, 10),
      viewRow(2, "chest", 12, 5),
      viewRow(1, "back", 8, 8),
      viewRow(2, "back", 8, 2),
      viewRow(1, "quads", 4, 4),
      viewRow(2, "quads", 4, 1),
    ];
    const volume = buildVolumeMatrix(weeks, rows, new Map());
    const balance = buildBalance(volume, weeks);
    // chest avg over W1 logged 10, W2 logged 5, W3 — no baseline → 2 weeks
    expect(balance.push).toBe(8);
    expect(balance.pull).toBe(5);
    expect(balance.legs).toBe(3);
    expect(balance.note).toContain("Push : pull is 1.6 : 1");
    expect(balance.note).toContain("Quads");
  });
});

describe("buildKeyLifts", () => {
  const topSets = [
    { exercise_id: "hack", exercise_name: "Hack Squat", week_number: 1, weight: 240, reps: 10, e1rm: 320 },
    { exercise_id: "hack", exercise_name: "Hack Squat", week_number: 2, weight: 250, reps: 8, e1rm: 316 },
    { exercise_id: "curl", exercise_name: "Lying Leg Curl", week_number: 1, weight: 115, reps: 12, e1rm: 161 },
  ];

  it("ranks by best e1RM and renders the week grid with the +lb badge", () => {
    const lifts = buildKeyLifts(topSets, weeks, 2);
    expect(lifts[0].name).toBe("Hack Squat");
    expect(lifts[0].badge).toBe("+10 LB VS W1");
    expect(lifts[0].cells[0]).toEqual({ weight: 240, reps: 10, isCurrent: false });
    expect(lifts[0].cells[1]).toEqual({ weight: 250, reps: 8, isCurrent: true });
    expect(lifts[0].cells[2]).toBeNull();
  });

  it("shows no badge with a single logged week", () => {
    const lifts = buildKeyLifts(topSets, weeks, 2);
    expect(lifts[1].name).toBe("Lying Leg Curl");
    expect(lifts[1].badge).toBeNull();
  });
});

describe("buildPrs", () => {
  const mesoBest = [
    { exercise_id: "hack", name: "Hack Squat", weight: 250, reps: 8, coordinate: "W2·D1", e1rm: 316.7 },
    { exercise_id: "curl", name: "Lying Leg Curl", weight: 120, reps: 10, coordinate: "W2·D1", e1rm: 160 },
    { exercise_id: "press", name: "Incline DB Press", weight: 80, reps: 9, coordinate: "W1·D2", e1rm: 104 },
  ];

  it("labels heavier top weight ALL-TIME and better e1RM at old weight REP PR", () => {
    const prs = buildPrs(
      mesoBest,
      new Map([
        ["hack", { weight: 245, e1rm: 310 }],
        ["curl", { weight: 120, e1rm: 150 }],
        ["press", { weight: 85, e1rm: 110 }],
      ]),
    );
    expect(prs).toEqual([
      { label: "Hack Squat — 250 × 8", coordinate: "W2·D1", kind: "ALL-TIME" },
      { label: "Lying Leg Curl — 120 × 10", coordinate: "W2·D1", kind: "REP PR" },
    ]);
  });

  it("never PRs a lift without prior history", () => {
    expect(buildPrs(mesoBest, new Map())).toEqual([]);
  });
});

describe("templateEmphasis", () => {
  it("classifies saved templates from their groups", () => {
    expect(templateEmphasis(["chest", "quads"])).toBe("whole body");
    expect(templateEmphasis(["chest", "back", "biceps"])).toBe("upper body");
    expect(templateEmphasis(["quads", "glutes"])).toBe("lower body");
    expect(templateEmphasis(["abs"])).toBe("general");
  });
});
