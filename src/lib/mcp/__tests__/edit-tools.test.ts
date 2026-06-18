import { describe, it, expect, beforeAll } from "vitest";
import {
  applyMesoEdits,
  registerEditMesocycle,
  EDIT_MESOCYCLE,
  type EditDay,
  type ResolvedEdit,
} from "../tools/edit";
import { captureServer, fakeExtra } from "./harness";

// --- fixtures --------------------------------------------------------------
// A two-day plan: day 1 = chest (2 slots) + back (1 slot); day 2 = quads (1).

function plan(): EditDay[] {
  return [
    {
      day_number: 1,
      label: "Push",
      weekday: 1,
      groups: [
        {
          group_id: "g-chest",
          muscle_group_id: "mg-chest",
          position: 1,
          exercise_slots: 2,
          fills: [
            { slot_id: "s-bench", exercise_id: "e-bench", initial_sets: 3, day_position: 1, slot_number: 1 },
            { slot_id: "s-fly", exercise_id: "e-fly", initial_sets: 2, day_position: 2, slot_number: 2 },
          ],
        },
        {
          group_id: "g-back",
          muscle_group_id: "mg-back",
          position: 2,
          exercise_slots: 1,
          fills: [
            { slot_id: "s-row", exercise_id: "e-row", initial_sets: 3, day_position: 3, slot_number: 1 },
          ],
        },
      ],
    },
    {
      day_number: 2,
      label: "Legs",
      weekday: 3,
      groups: [
        {
          group_id: "g-quads",
          muscle_group_id: "mg-quads",
          position: 1,
          exercise_slots: 1,
          fills: [
            { slot_id: "s-squat", exercise_id: "e-squat", initial_sets: 3, day_position: 1, slot_number: 1 },
          ],
        },
      ],
    },
  ];
}

function ok(r: ReturnType<typeof applyMesoEdits>) {
  if (!r.ok) throw new Error(`expected ok, got error: ${r.error}`);
  return r;
}

function day(r: ReturnType<typeof applyMesoEdits>, n: number) {
  return ok(r).days.find((d) => d.day_number === n)!;
}

// --- applyMesoEdits: add ---------------------------------------------------

describe("applyMesoEdits — add_exercise", () => {
  it("adds to an existing group, growing its slot count and appending in day order", () => {
    const r = applyMesoEdits(plan(), [
      { op: "add_exercise", day_number: 1, muscle_group_id: "mg-back", exercise_id: "e-pulldown", sets: 4 },
    ]);
    const d1 = day(r, 1);
    const back = d1.groups.find((g) => g.muscle_group_id === "mg-back")!;
    expect(back.fills.map((f) => f.exercise_id)).toEqual(["e-row", "e-pulldown"]);
    expect(back.exercise_slots).toBe(2);
    expect(back.fills.find((f) => f.exercise_id === "e-pulldown")!.initial_sets).toBe(4);
    // appended last in the day's flat order
    const last = [...d1.groups.flatMap((g) => g.fills)].sort((a, b) => b.day_position - a.day_position)[0];
    expect(last.exercise_id).toBe("e-pulldown");
    expect(ok(r).touched).toEqual([1]);
  });

  it("creates a new muscle-group block when the day lacks it", () => {
    const r = applyMesoEdits(plan(), [
      { op: "add_exercise", day_number: 2, muscle_group_id: "mg-hams", exercise_id: "e-curl" },
    ]);
    const d2 = day(r, 2);
    expect(d2.groups).toHaveLength(2);
    const hams = d2.groups.find((g) => g.muscle_group_id === "mg-hams")!;
    expect(hams.fills.map((f) => f.exercise_id)).toEqual(["e-curl"]);
    expect(hams.fills[0].initial_sets).toBe(3); // default baseline
  });

  it("rejects adding to a day that does not exist", () => {
    const r = applyMesoEdits(plan(), [
      { op: "add_exercise", day_number: 5, muscle_group_id: "mg-chest", exercise_id: "e-x" },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no day 5/);
  });

  it("rejects a group that would exceed the slot cap", () => {
    const ops: ResolvedEdit[] = Array.from({ length: 9 }, (_, i) => ({
      op: "add_exercise" as const,
      day_number: 2,
      muscle_group_id: "mg-quads",
      exercise_id: `e-extra-${i}`,
    }));
    const r = applyMesoEdits(plan(), ops); // 1 existing + 9 = 10 ok, 11 over
    expect(r.ok).toBe(true);
    const r2 = applyMesoEdits(plan(), [
      ...ops,
      { op: "add_exercise", day_number: 2, muscle_group_id: "mg-quads", exercise_id: "e-extra-10" },
    ]);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toMatch(/max 10/);
  });
});

// --- applyMesoEdits: remove ------------------------------------------------

describe("applyMesoEdits — remove_exercise", () => {
  it("removes a slot and shrinks the group, closing the day-position gap", () => {
    const r = applyMesoEdits(plan(), [{ op: "remove_exercise", slot_id: "s-fly" }]);
    const d1 = day(r, 1);
    const chest = d1.groups.find((g) => g.muscle_group_id === "mg-chest")!;
    expect(chest.fills.map((f) => f.exercise_id)).toEqual(["e-bench"]);
    expect(chest.exercise_slots).toBe(1);
    // day positions are contiguous 1..n after the removal
    const positions = d1.groups.flatMap((g) => g.fills.map((f) => f.day_position)).sort();
    expect(positions).toEqual([1, 2]);
  });

  it("drops a group emptied by a removal", () => {
    const r = applyMesoEdits(plan(), [{ op: "remove_exercise", slot_id: "s-row" }]);
    const d1 = day(r, 1);
    expect(d1.groups.find((g) => g.muscle_group_id === "mg-back")).toBeUndefined();
    expect(d1.groups).toHaveLength(1);
  });

  it("rejects an unknown slot id", () => {
    const r = applyMesoEdits(plan(), [{ op: "remove_exercise", slot_id: "nope" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not found/);
  });
});

// --- applyMesoEdits: swap / baseline / reorder -----------------------------

describe("applyMesoEdits — swap_exercise", () => {
  it("replaces the exercise in a slot, keeping its sets and position", () => {
    const r = applyMesoEdits(plan(), [
      { op: "swap_exercise", slot_id: "s-bench", new_exercise_id: "e-db-press" },
    ]);
    const chest = day(r, 1).groups.find((g) => g.muscle_group_id === "mg-chest")!;
    const swapped = chest.fills.find((f) => f.exercise_id === "e-db-press")!;
    expect(swapped).toBeTruthy();
    expect(swapped.initial_sets).toBe(3);
    expect(chest.exercise_slots).toBe(2); // unchanged: a swap doesn't resize
  });
});

describe("applyMesoEdits — set_baseline_sets", () => {
  it("sets the week-1 baseline set count on a slot", () => {
    const r = applyMesoEdits(plan(), [{ op: "set_baseline_sets", slot_id: "s-squat", sets: 5 }]);
    const quads = day(r, 2).groups[0];
    expect(quads.fills[0].initial_sets).toBe(5);
    expect(ok(r).summaries[0]).toMatch(/baseline to 5/);
  });
});

describe("applyMesoEdits — reorder_day", () => {
  it("reorders a day's exercises across groups by the given slot order", () => {
    const r = applyMesoEdits(plan(), [
      { op: "reorder_day", day_number: 1, ordered_slot_ids: ["s-row", "s-bench", "s-fly"] },
    ]);
    const d1 = day(r, 1);
    const byPos = d1.groups
      .flatMap((g) => g.fills.map((f) => ({ id: f.exercise_id, pos: f.day_position })))
      .sort((a, b) => a.pos - b.pos)
      .map((x) => x.id);
    expect(byPos).toEqual(["e-row", "e-bench", "e-fly"]);
  });

  it("rejects a reorder list that does not cover the whole day", () => {
    const r = applyMesoEdits(plan(), [
      { op: "reorder_day", day_number: 1, ordered_slot_ids: ["s-row", "s-bench"] },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/exactly its 3 slot/);
  });
});

// --- composition + purity --------------------------------------------------

describe("applyMesoEdits — composition", () => {
  it("applies several operations in order and reports each touched day", () => {
    const r = applyMesoEdits(plan(), [
      { op: "add_exercise", day_number: 2, muscle_group_id: "mg-quads", exercise_id: "e-legpress", sets: 3 },
      { op: "remove_exercise", slot_id: "s-fly" },
      { op: "set_baseline_sets", slot_id: "s-squat", sets: 4 },
    ]);
    expect(ok(r).touched).toEqual([1, 2]);
    const quads = day(r, 2).groups[0];
    expect(quads.fills.map((f) => f.exercise_id)).toEqual(["e-squat", "e-legpress"]);
    expect(quads.fills[0].initial_sets).toBe(4);
  });

  it("does not mutate the input plan (pure)", () => {
    const input = plan();
    const snapshot = JSON.stringify(input);
    applyMesoEdits(input, [{ op: "remove_exercise", slot_id: "s-bench" }]);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("leaves untouched days untouched and preserves their slot counts", () => {
    const r = applyMesoEdits(plan(), [{ op: "swap_exercise", slot_id: "s-bench", new_exercise_id: "e-x" }]);
    const d2 = day(r, 2);
    expect(d2.groups[0].exercise_slots).toBe(1);
    expect(d2.groups[0].fills.map((f) => f.exercise_id)).toEqual(["e-squat"]);
  });
});

// --- tool contract ---------------------------------------------------------

describe("edit_mesocycle tool", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  });

  it("registers and takes no user_id argument (hard rule #5)", () => {
    const { server, tools } = captureServer();
    registerEditMesocycle(server);
    expect(tools.has(EDIT_MESOCYCLE)).toBe(true);
    const schema = (tools.get(EDIT_MESOCYCLE)!.config.inputSchema ?? {}) as Record<string, unknown>;
    expect(Object.keys(schema)).not.toContain("user_id");
    expect(Object.keys(schema)).toEqual(expect.arrayContaining(["mesocycle_id", "operations"]));
  });

  it("rejects an unauthenticated call before any write", async () => {
    const { server, tools } = captureServer();
    registerEditMesocycle(server);
    await expect(
      tools.get(EDIT_MESOCYCLE)!.handler(
        { mesocycle_id: "11111111-1111-1111-1111-111111111111", operations: [{ op: "remove_exercise", slot_id: "22222222-2222-2222-2222-222222222222" }] },
        fakeExtra(undefined),
      ),
    ).rejects.toThrow(/authenticated session/i);
  });
});
