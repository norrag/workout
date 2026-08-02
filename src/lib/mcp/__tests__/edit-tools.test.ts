import { describe, it, expect, beforeAll } from "vitest";
import {
  applyMesoEdits,
  registerEditMesocycle,
  planEffortEdits,
  toEffortOp,
  EDIT_MESOCYCLE,
  type EditDay,
  type EffortContext,
  type EffortPlanResult,
  type EffortSlotRef,
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

  it("accepts the doc-21 effort ops in its operations schema", () => {
    const { server, tools } = captureServer();
    registerEditMesocycle(server);
    const schema = tools.get(EDIT_MESOCYCLE)!.config.inputSchema as {
      operations: { parse: (v: unknown) => unknown };
    };
    const slot = "22222222-2222-2222-2222-222222222222";
    expect(() =>
      schema.operations.parse([
        { op: "set_exercise_rir", slot_id: slot, rir: 4, weeks: [3, 4], reason: "elbow" },
        { op: "set_exercise_rir", slot_id: slot, schedule: [null, null, 4, 4] },
        { op: "set_exercise_sets", slot_id: slot, sets: 2 },
        { op: "set_exercise_rir", slot_id: slot, clear: true },
      ]),
    ).not.toThrow();
    // §4.3: the ask reaches 30 (deload → rehab → deep back-off on one lever)
    expect(() =>
      schema.operations.parse([{ op: "set_exercise_rir", slot_id: slot, rir: 21 }]),
    ).not.toThrow();
    expect(() =>
      schema.operations.parse([{ op: "set_exercise_rir", slot_id: slot, rir: 31 }]),
    ).toThrow();
    expect(() =>
      schema.operations.parse([{ op: "set_exercise_sets", slot_id: slot, sets: 0 }]),
    ).toThrow();
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

// --- applyMesoEdits: add_day / remove_day ----------------------------------

describe("applyMesoEdits — add_day", () => {
  it("lays down a whole new day at the next free slot in one op", () => {
    const r = applyMesoEdits(plan(), [
      {
        op: "add_day",
        day_number: null,
        label: "Pull",
        weekday: 5,
        groups: [
          {
            muscle_group_id: "mg-back",
            exercises: [
              { exercise_id: "e-pullup", sets: 4 },
              { exercise_id: "e-row2" },
            ],
          },
          { muscle_group_id: "mg-biceps", exercises: [{ exercise_id: "e-curl" }] },
        ],
      },
    ]);
    // day 1 and 2 exist ⇒ next free is 3
    const d3 = day(r, 3);
    expect(d3.label).toBe("Pull");
    expect(d3.weekday).toBe(5);
    expect(d3.groups).toHaveLength(2);
    const back = d3.groups.find((g) => g.muscle_group_id === "mg-back")!;
    expect(back.fills.map((f) => f.exercise_id)).toEqual(["e-pullup", "e-row2"]);
    expect(back.fills[0].initial_sets).toBe(4);
    expect(back.fills[1].initial_sets).toBe(3); // default baseline
    // flat day order runs 1..3 across both groups
    expect(d3.groups.flatMap((g) => g.fills.map((f) => f.day_position)).sort()).toEqual([1, 2, 3]);
    expect(ok(r).touched).toEqual([3]);
  });

  it("builds a plan from an empty meso (the core Tier-1 case)", () => {
    const r = applyMesoEdits([], [
      {
        op: "add_day",
        day_number: null,
        label: "Full body",
        weekday: 1,
        groups: [{ muscle_group_id: "mg-chest", exercises: [{ exercise_id: "e-bench" }] }],
      },
    ]);
    expect(ok(r).days).toHaveLength(1);
    expect(day(r, 1).groups[0].fills[0].exercise_id).toBe("e-bench");
  });

  it("rejects an explicit day_number that already exists", () => {
    const r = applyMesoEdits(plan(), [
      { op: "add_day", day_number: 1, label: null, weekday: null, groups: [{ muscle_group_id: "mg-chest", exercises: [{ exercise_id: "e-x" }] }] },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/day 1 already exists/);
  });

  it("rejects a day listing the same muscle group twice (R3)", () => {
    // two resolved blocks with one muscle_group_id would violate the
    // meso_day_groups unique key at save time — refused up front
    const r = applyMesoEdits(plan(), [
      {
        op: "add_day",
        day_number: null,
        label: null,
        weekday: null,
        groups: [
          { muscle_group_id: "mg-back", exercises: [{ exercise_id: "e-row2" }] },
          { muscle_group_id: "mg-back", exercises: [{ exercise_id: "e-pullup" }] },
        ],
      },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/same muscle group twice/);
  });

  it("rejects a day when the week is already full", () => {
    const full: EditDay[] = Array.from({ length: 7 }, (_, i) => ({
      day_number: i + 1,
      label: null,
      weekday: null,
      groups: [
        {
          group_id: `g${i}`,
          muscle_group_id: "mg-chest",
          position: 1,
          exercise_slots: 1,
          fills: [{ slot_id: `s${i}`, exercise_id: "e", initial_sets: 3, day_position: 1, slot_number: 1 }],
        },
      ],
    }));
    const r = applyMesoEdits(full, [
      { op: "add_day", day_number: null, label: null, weekday: null, groups: [{ muscle_group_id: "mg-back", exercises: [{ exercise_id: "e-x" }] }] },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/at most 7/);
  });
});

describe("applyMesoEdits — remove_day", () => {
  it("drops a whole day", () => {
    const r = applyMesoEdits(plan(), [{ op: "remove_day", day_number: 2 }]);
    expect(ok(r).days.map((d) => d.day_number)).toEqual([1]);
    expect(ok(r).touched).toEqual([2]);
  });

  it("rejects removing a day that does not exist", () => {
    const r = applyMesoEdits(plan(), [{ op: "remove_day", day_number: 6 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no day 6/);
  });
});

// --- effort assignments (doc 21 Phase 3) -----------------------------------

function slotRefs(): Map<string, EffortSlotRef> {
  return new Map([
    ["s-bench", { slot_id: "s-bench", day_number: 1, exercise_id: "e-bench", exercise_name: "Bench Press" }],
    ["s-squat", { slot_id: "s-squat", day_number: 2, exercise_id: "e-squat", exercise_name: "Back Squat" }],
  ]);
}

/** a 5-week meso with a deload: working weeks 1–4 ramp 3→0, week 5 deloads at 4 */
function effortCtx(over: Partial<EffortContext> = {}): EffortContext {
  return {
    shape: { weeks: 5, includesDeload: true },
    weekRir: new Map([
      [1, 3],
      [2, 2],
      [3, 1],
      [4, 0],
      [5, 4],
    ]),
    deloadWeek: 5,
    lockedWeeksByDay: new Map(),
    ...over,
  };
}

function effortOk(r: EffortPlanResult) {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r;
}

describe("planEffortEdits — writes", () => {
  it("assigns RIR 4 to weeks 3–4 of one slot and discloses the week defaults", () => {
    const r = effortOk(
      planEffortEdits(
        [
          {
            op: "set_exercise_rir",
            slot_id: "s-bench",
            edit: { lever: "rir", value: 4, weeks: [3, 4], reason: "right elbow" },
          },
        ],
        slotRefs(),
        new Map(),
        effortCtx(),
      ),
    );
    expect(r.writes).toHaveLength(1);
    expect(r.writes[0]).toMatchObject({
      slot_id: "s-bench",
      day_number: 1,
      exercise_id: "e-bench",
      patch: { target_rir: null, rir_schedule: [null, null, 4, 4], effort_reason: "right elbow" },
    });
    expect(r.disclosures[0]).toMatchObject({
      lever: "target_rir",
      by_week: [null, null, 4, 4],
      week_defaults: [3, 2, 1, 0],
      assigned_weeks: [3, 4],
      covers_deload_week: false,
      reason: "right elbow",
    });
    expect(r.summaries[0]).toBe("day 1 Bench Press: RIR 4 on weeks 3, 4");
    // easing an exercise never warns — that is the whole point of the lever
    expect(r.warnings).toEqual([]);
  });

  it("merges two ops on one slot into a single write", () => {
    const r = effortOk(
      planEffortEdits(
        [
          { op: "set_exercise_rir", slot_id: "s-bench", edit: { lever: "rir", value: 4, weeks: [4] } },
          { op: "set_exercise_sets", slot_id: "s-bench", edit: { lever: "sets", value: 2, weeks: [4] } },
        ],
        slotRefs(),
        new Map(),
        effortCtx(),
      ),
    );
    expect(r.writes).toHaveLength(1);
    expect(r.writes[0].patch).toMatchObject({
      rir_schedule: [null, null, null, 4],
      set_cap_schedule: [null, null, null, 2],
    });
    expect(r.summaries).toHaveLength(2);
  });

  it("clears an assignment back to the ramp, reason included", () => {
    const current = new Map([
      [
        "s-bench",
        {
          target_rir: 4,
          rir_schedule: null,
          set_cap: null,
          set_cap_schedule: null,
          effort_reason: "elbow",
        },
      ],
    ]);
    const r = effortOk(
      planEffortEdits(
        [{ op: "set_exercise_rir", slot_id: "s-bench", edit: { lever: "rir", clear: true } }],
        slotRefs(),
        current,
        effortCtx(),
      ),
    );
    expect(r.writes[0].patch).toEqual({
      target_rir: null,
      rir_schedule: null,
      effort_reason: null,
    });
    expect(r.disclosures[0].assigned_weeks).toEqual([]);
  });
});

describe("planEffortEdits — no silent semantics (§4.1)", () => {
  it("warns that a flat assignment also governs the deload week", () => {
    const r = effortOk(
      planEffortEdits(
        [{ op: "set_exercise_rir", slot_id: "s-bench", edit: { lever: "rir", value: 4 } }],
        slotRefs(),
        new Map(),
        effortCtx(),
      ),
    );
    expect(r.disclosures[0].covers_deload_week).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/deload week \(week 5\)/);
  });

  it("warns when the assignment runs a week HARDER than programmed", () => {
    // week 1 ramps at RIR 3; asking for RIR 1 there is legitimate (ramping back
    // into a block) but must be stated
    const r = effortOk(
      planEffortEdits(
        [{ op: "set_exercise_rir", slot_id: "s-bench", edit: { lever: "rir", value: 1, weeks: [1] } }],
        slotRefs(),
        new Map(),
        effortCtx(),
      ),
    );
    expect(r.warnings.join(" ")).toMatch(/week 1: RIR 1 is BELOW the week's 3/);
  });

  it("warns that a flat assignment below the deload RIR hardens the deload", () => {
    const r = effortOk(
      planEffortEdits(
        [{ op: "set_exercise_rir", slot_id: "s-bench", edit: { lever: "rir", value: 2 } }],
        slotRefs(),
        new Map(),
        effortCtx(),
      ),
    );
    expect(r.warnings.join(" ")).toMatch(/deload gets harder/);
  });
});

describe("planEffortEdits — the set cap is honest about Phase 4", () => {
  it("says the engine does not clamp to the cap yet", () => {
    const r = effortOk(
      planEffortEdits(
        [{ op: "set_exercise_sets", slot_id: "s-bench", edit: { lever: "sets", value: 2, weeks: [4] } }],
        slotRefs(),
        new Map(),
        effortCtx(),
      ),
    );
    expect(r.warnings.join(" ")).toMatch(/does not clamp its set count to it yet/);
  });

  it("says nothing of the kind when the cap is cleared", () => {
    const current = new Map([
      ["s-bench", { target_rir: null, rir_schedule: null, set_cap: 2, set_cap_schedule: null, effort_reason: null }],
    ]);
    const r = effortOk(
      planEffortEdits(
        [{ op: "set_exercise_sets", slot_id: "s-bench", edit: { lever: "sets", clear: true } }],
        slotRefs(),
        current,
        effortCtx(),
      ),
    );
    expect(r.warnings).toEqual([]);
  });
});

describe("planEffortEdits — already-trained weeks", () => {
  const trained = () =>
    effortCtx({ lockedWeeksByDay: new Map([[1, [1, 2]]]) });

  it("refuses an explicitly named week that has already been trained", () => {
    const r = planEffortEdits(
      [{ op: "set_exercise_rir", slot_id: "s-bench", edit: { lever: "rir", value: 4, weeks: [2, 3] } }],
      slotRefs(),
      new Map(),
      trained(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/week\(s\) 2 of day 1 are already trained/);
  });

  it("refuses a schedule whose non-null element lands on a trained week", () => {
    const r = planEffortEdits(
      [{ op: "set_exercise_rir", slot_id: "s-bench", edit: { lever: "rir", schedule: [4, null, null, null] } }],
      slotRefs(),
      new Map(),
      trained(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already trained/);
  });

  it("allows a flat assignment over trained weeks, and says which won't change", () => {
    const r = effortOk(
      planEffortEdits(
        [{ op: "set_exercise_rir", slot_id: "s-bench", edit: { lever: "rir", value: 4 } }],
        slotRefs(),
        new Map(),
        trained(),
      ),
    );
    expect(r.warnings.join(" ")).toMatch(/weeks 1, 2 are already trained/);
  });

  it("doesn't apply one day's trained weeks to another day", () => {
    const r = effortOk(
      planEffortEdits(
        [{ op: "set_exercise_rir", slot_id: "s-squat", edit: { lever: "rir", value: 4, weeks: [2] } }],
        slotRefs(),
        new Map(),
        trained(),
      ),
    );
    expect(r.writes).toHaveLength(1);
  });
});

describe("planEffortEdits — refusals", () => {
  it("refuses an unknown slot before anything is written", () => {
    const r = planEffortEdits(
      [{ op: "set_exercise_rir", slot_id: "s-nope", edit: { lever: "rir", value: 4 } }],
      slotRefs(),
      new Map(),
      effortCtx(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not found in this mesocycle/);
  });

  it("surfaces the pure planner's refusal with the day for context", () => {
    const r = planEffortEdits(
      [{ op: "set_exercise_rir", slot_id: "s-bench", edit: { lever: "rir", value: 4, weeks: [5] } }],
      slotRefs(),
      new Map(),
      effortCtx(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/day 1.*outside this mesocycle's 4 working week/);
  });
});

describe("toEffortOp", () => {
  it("maps each tool op onto the lever-neutral intent", () => {
    expect(toEffortOp({ op: "set_exercise_rir", slot_id: "s", rir: 4, weeks: [3] })).toEqual({
      op: "set_exercise_rir",
      slot_id: "s",
      edit: { lever: "rir", value: 4, weeks: [3] },
    });
    expect(toEffortOp({ op: "set_exercise_sets", slot_id: "s", clear: true })).toEqual({
      op: "set_exercise_sets",
      slot_id: "s",
      edit: { lever: "sets", clear: true },
    });
    // an omitted field must stay omitted — `reason: undefined` would read as
    // "clear the reason" in the pure planner
    expect(
      toEffortOp({ op: "set_exercise_rir", slot_id: "s", rir: 4 }).edit,
    ).not.toHaveProperty("reason");
  });
});
