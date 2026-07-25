/**
 * Pure-helper tests for the copy-a-meso path (fig 2.4 option 01): mapping a
 * source meso's planner structure into copy-insert rows. The DB walk
 * (copyMesoStructure) is covered by integration smoke.
 */
import { describe, expect, it } from "vitest";
import { planMesoCopy } from "../cycles";

const fill = (
  exercise_id: string,
  slot_number: number,
  initial_sets = 3,
  position?: number,
) => ({
  slot_number,
  exercise_id,
  initial_sets,
  ...(position != null ? { position } : {}),
});

const day = () => [
  {
    day_number: 1,
    label: "Push",
    weekday: 1,
    groups: [
      {
        muscle_group_id: "chest",
        position: 1,
        exercise_slots: 2,
        fills: [fill("bench", 1, 4), fill("flye", 2)],
      },
      {
        muscle_group_id: "triceps",
        position: 2,
        exercise_slots: 1,
        fills: [fill("pushdown", 1)],
      },
    ],
  },
  {
    day_number: 2,
    label: "Pull",
    weekday: 3,
    groups: [
      {
        muscle_group_id: "back",
        position: 1,
        exercise_slots: 2,
        fills: [fill("row", 1)],
      },
    ],
  },
];

describe("planMesoCopy", () => {
  it("clones every day, group, and fill, carrying weekday/label/sets", () => {
    const out = planMesoCopy(day(), new Set());
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ day_number: 1, label: "Push", weekday: 1 });
    expect(out[0].groups[0].muscle_group_id).toBe("chest");
    expect(out[0].groups[0].fills).toEqual([
      { slot_number: 1, exercise_id: "bench", initial_sets: 4, day_position: 1 },
      { slot_number: 2, exercise_id: "flye", initial_sets: 3, day_position: 2 },
    ]);
    expect(out[1].groups[0].fills.map((f) => f.exercise_id)).toEqual(["row"]);
  });

  // N64: a copy has to reproduce the order the source is TRAINED in, which is
  // the flat day order across groups — not the order the group rows read in.
  it("carries the source's flat day order across groups", () => {
    const out = planMesoCopy(
      [
        {
          day_number: 1,
          label: "Push",
          weekday: 1,
          groups: [
            {
              muscle_group_id: "chest",
              position: 1,
              exercise_slots: 2,
              // interleaved: the lifter opens with the triceps movement and
              // finishes on the flye
              fills: [fill("bench", 1, 4, 2), fill("flye", 2, 3, 4)],
            },
            {
              muscle_group_id: "triceps",
              position: 2,
              exercise_slots: 2,
              fills: [fill("pushdown", 1, 3, 1), fill("skullcrusher", 2, 3, 3)],
            },
          ],
        },
      ],
      new Set(),
    );
    const flat = out[0].groups
      .flatMap((g) => g.fills)
      .sort((a, b) => a.day_position - b.day_position);
    expect(flat.map((f) => f.exercise_id)).toEqual([
      "pushdown",
      "bench",
      "skullcrusher",
      "flye",
    ]);
    expect(flat.map((f) => f.day_position)).toEqual([1, 2, 3, 4]);
  });

  it("renumbers the flat order 1..n after an exclusion drops a fill", () => {
    const out = planMesoCopy(
      [
        {
          day_number: 1,
          label: null,
          weekday: null,
          groups: [
            {
              muscle_group_id: "chest",
              position: 1,
              exercise_slots: 2,
              fills: [fill("bench", 1, 3, 1), fill("flye", 2, 3, 3)],
            },
            {
              muscle_group_id: "triceps",
              position: 2,
              exercise_slots: 1,
              fills: [fill("pushdown", 1, 3, 2)],
            },
          ],
        },
      ],
      new Set(["pushdown"]),
    );
    const flat = out[0].groups
      .flatMap((g) => g.fills)
      .sort((a, b) => a.day_position - b.day_position);
    expect(flat.map((f) => f.exercise_id)).toEqual(["bench", "flye"]);
    expect(flat.map((f) => f.day_position)).toEqual([1, 2]);
  });

  it("falls back to group order when the source stored no positions", () => {
    const out = planMesoCopy(day(), new Set());
    const flat = out[0].groups
      .flatMap((g) => g.fills)
      .sort((a, b) => a.day_position - b.day_position);
    expect(flat.map((f) => f.exercise_id)).toEqual(["bench", "flye", "pushdown"]);
  });

  it("drops excluded exercises but preserves the open slot", () => {
    const out = planMesoCopy(day(), new Set(["flye"]));
    const chest = out[0].groups[0];
    // the flye fill is gone, but the group still has its 2 slots
    expect(chest.fills.map((f) => f.exercise_id)).toEqual(["bench"]);
    expect(chest.exercise_slots).toBe(2);
  });

  it("widens slot count to fit when a source group had more fills than slots", () => {
    const out = planMesoCopy(
      [
        {
          day_number: 1,
          label: null,
          weekday: null,
          groups: [
            {
              muscle_group_id: "chest",
              position: 1,
              exercise_slots: 1,
              fills: [fill("a", 1), fill("b", 2), fill("c", 3)],
            },
          ],
        },
      ],
      new Set(),
    );
    expect(out[0].groups[0].exercise_slots).toBe(3);
  });

  it("returns [] for an empty plan", () => {
    expect(planMesoCopy([], new Set())).toEqual([]);
  });
});
