/**
 * Pure-helper tests for the copy-a-meso path (fig 2.4 option 01): mapping a
 * source meso's planner structure into copy-insert rows. The DB walk
 * (copyMesoStructure) is covered by integration smoke.
 */
import { describe, expect, it } from "vitest";
import { planMesoCopy } from "../cycles";

const fill = (exercise_id: string, slot_number: number, initial_sets = 3) => ({
  slot_number,
  exercise_id,
  initial_sets,
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
      { slot_number: 1, exercise_id: "bench", initial_sets: 4 },
      { slot_number: 2, exercise_id: "flye", initial_sets: 3 },
    ]);
    expect(out[1].groups[0].fills.map((f) => f.exercise_id)).toEqual(["row"]);
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
