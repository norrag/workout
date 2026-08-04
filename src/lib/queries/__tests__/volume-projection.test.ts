/**
 * projectWeekSets (PH34) — the pure set-count projection for unmaterialized meso
 * weeks. Carries each group's last materialized weekly count forward (deload
 * weeks scaled by deload.set_pct, floored at min_sets), seeded by the planner
 * baseline only when a group never materialized. Mirrors the engine's
 * carry-forward set logic under neutral feedback (no future-week feedback).
 */
import { describe, expect, it } from "vitest";
import {
  projectWeekSets,
  weightWeekMuscleSets,
  type BaselineSeed,
} from "../volume-projection";
import type { VMesoWeekMuscleSetsRow } from "@/lib/types/database";

const weeks = [
  { week_number: 1, is_deload: false },
  { week_number: 2, is_deload: false },
  { week_number: 3, is_deload: false },
  { week_number: 4, is_deload: true },
];

function row(
  week_number: number,
  muscle_group: string,
  planned_sets: number | null,
) {
  return { week_number, muscle_group, muscle_group_id: muscle_group, planned_sets };
}

function roleRow(
  overrides: Partial<VMesoWeekMuscleSetsRow>,
): VMesoWeekMuscleSetsRow {
  return {
    user_id: "u1",
    mesocycle_id: "m1",
    week_number: 1,
    is_deload: false,
    muscle_group_id: "chest",
    muscle_group: "chest",
    role: "primary",
    planned_sets: null,
    logged_sets: 0,
    logged_hard_sets: 0,
    logged_backed_off_sets: 0,
    ...overrides,
  };
}

describe("weightWeekMuscleSets (R14, doc 10 §2 fractional counting)", () => {
  const W = { direct: 1.0, indirect: 0.5 };

  it("weights primary 1.0 and secondary 0.5 into one row per (week, muscle)", () => {
    const out = weightWeekMuscleSets(
      [
        roleRow({ role: "primary", planned_sets: 8, logged_hard_sets: 6 }),
        roleRow({ role: "secondary", planned_sets: 4, logged_hard_sets: 4 }),
      ],
      W,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      week_number: 1,
      muscle_group: "chest",
      planned_sets: 10, // 8 + 4×0.5
      logged_sets: 8, // 6 + 4×0.5
    });
  });

  it("logged counts read logged_hard_sets (the §2 RIR≤4 rule), not all sets", () => {
    const out = weightWeekMuscleSets(
      [roleRow({ role: "primary", logged_sets: 5, logged_hard_sets: 3 })],
      W,
    );
    expect(out[0].logged_sets).toBe(3);
  });

  it("keeps planned null when no contributing row has a planned count", () => {
    const out = weightWeekMuscleSets(
      [roleRow({ role: "primary", planned_sets: null, logged_hard_sets: 2 })],
      W,
    );
    expect(out[0].planned_sets).toBeNull();
    expect(out[0].logged_sets).toBe(2);
  });

  it("separates weeks and muscles; carries is_deload through", () => {
    const out = weightWeekMuscleSets(
      [
        roleRow({ week_number: 1, planned_sets: 6 }),
        roleRow({
          week_number: 2,
          is_deload: true,
          muscle_group: "back",
          muscle_group_id: "back",
          planned_sets: 4,
        }),
      ],
      W,
    );
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.muscle_group === "back")).toMatchObject({
      week_number: 2,
      is_deload: true,
      planned_sets: 4,
    });
  });

  it("weekOf remaps rows onto a global week axis and drops unmapped rows (M8)", () => {
    // two mesos, both week 1 — the macro fold remaps m2's week onto slot 5
    const out = weightWeekMuscleSets(
      [
        roleRow({ mesocycle_id: "m1", week_number: 1, logged_hard_sets: 4 }),
        roleRow({ mesocycle_id: "m2", week_number: 1, logged_hard_sets: 6 }),
        roleRow({ mesocycle_id: "orphan", week_number: 1, logged_hard_sets: 9 }),
      ],
      W,
      (r) =>
        r.mesocycle_id === "m1" ? 1 : r.mesocycle_id === "m2" ? 5 : undefined,
    );
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.week_number === 1)?.logged_sets).toBe(4);
    expect(out.find((r) => r.week_number === 5)?.logged_sets).toBe(6);
  });
});

describe("projectWeekSets", () => {
  it("carries the last materialized week's count forward across working weeks", () => {
    // W1–W2 materialized at 5 sets; W3 (working) projects 5.
    const out = projectWeekSets({
      weeks,
      viewRows: [row(1, "quads", 4), row(2, "quads", 5)],
      baseline: [],
      deloadSetPct: 0.5,
      minSets: 2,
    });
    const w3 = out.find((c) => c.week_number === 3 && c.muscle_group === "quads");
    expect(w3?.projected_sets).toBe(5); // not the W1 count, not the baseline
  });

  it("scales a deload week by deload.set_pct, floored at min_sets", () => {
    const out = projectWeekSets({
      weeks,
      viewRows: [row(1, "quads", 5), row(2, "quads", 5)],
      baseline: [],
      deloadSetPct: 0.5,
      minSets: 2,
    });
    const w4 = out.find((c) => c.week_number === 4 && c.muscle_group === "quads");
    // R14: fractional counts survive deload scaling (1 dp) — 5 × 0.5 = 2.5
    expect(w4).toMatchObject({ projected_sets: 2.5, is_deload: true });
  });

  it("floors the deload count at min_sets", () => {
    const out = projectWeekSets({
      weeks,
      viewRows: [row(1, "abs", 2), row(2, "abs", 2)],
      baseline: [],
      deloadSetPct: 0.5,
      minSets: 2,
    });
    const w4 = out.find((c) => c.week_number === 4 && c.muscle_group === "abs");
    expect(w4?.projected_sets).toBe(2); // round(2 × 0.5)=1 → floored to min_sets 2
  });

  it("seeds from the planner baseline only when a group never materialized", () => {
    const baseline: BaselineSeed[] = [
      { muscle_group: "calves", muscle_group_id: "calves", sets: 4 },
    ];
    // only week 1 materialized, and not for calves → calves seeds from baseline.
    const out = projectWeekSets({
      weeks,
      viewRows: [row(1, "quads", 6)],
      baseline,
      deloadSetPct: 0.5,
      minSets: 2,
    });
    const calvesW2 = out.find((c) => c.week_number === 2 && c.muscle_group === "calves");
    expect(calvesW2?.projected_sets).toBe(4); // baseline seed carried forward
    // and the materialized group prefers its view count over any baseline
    const quadsW2 = out.find((c) => c.week_number === 2 && c.muscle_group === "quads");
    expect(quadsW2?.projected_sets).toBe(6);
  });

  it("returns nothing when every week is already materialized", () => {
    const out = projectWeekSets({
      weeks: [
        { week_number: 1, is_deload: false },
        { week_number: 2, is_deload: false },
      ],
      viewRows: [row(1, "quads", 5), row(2, "quads", 5)],
      baseline: [],
      deloadSetPct: 0.5,
      minSets: 2,
    });
    expect(out).toEqual([]);
  });

  it("carries the reduced count forward after a mid-meso deload", () => {
    // W1 materialized at 6; W2 deload, W3 working → W2 = 3, W3 carries 3.
    const out = projectWeekSets({
      weeks: [
        { week_number: 1, is_deload: false },
        { week_number: 2, is_deload: true },
        { week_number: 3, is_deload: false },
      ],
      viewRows: [row(1, "quads", 6)],
      baseline: [],
      deloadSetPct: 0.5,
      minSets: 2,
    });
    expect(out.find((c) => c.week_number === 2)?.projected_sets).toBe(3);
    expect(out.find((c) => c.week_number === 3)?.projected_sets).toBe(3);
  });
});
