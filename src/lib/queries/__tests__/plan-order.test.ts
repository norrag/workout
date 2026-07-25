/**
 * N64 — one exercise order, two surfaces.
 *
 * The planner board (`meso_exercises.position`, what the cycles view and every
 * share/copy read) and the generated session (`workout_exercises.position`,
 * what the day view reads) are written by different flows and used to drift:
 * a plan-side reorder never reached an already-generated week, and a day-view
 * reorder never reached the plan (so it never reached the person you shared
 * with either). These tests drive both directions of the sync against a small
 * in-memory stand-in for the Postgrest client.
 */
import { describe, expect, it } from "vitest";
import {
  applyPlanOrderToWorkout,
  planDayExerciseOrder,
  syncPlanAddedExercises,
  syncPlanOrderFromWorkout,
  syncPlanSubstitution,
} from "../plan-order";
import { fakeClient, type FakeRow as Row } from "./fake-client";

/** An active meso with one plan day (D1) and one generated workout on it. */
function fixture(
  over: {
    mesoStatus?: string;
    planFills?: { id: string; group: string; exercise_id: string; position: number; slot_number: number }[];
    workoutRows?: { id: string; exercise_id: string; position: number; muscle_group_id?: string | null; prescribed_sets?: number }[];
    groups?: { id: string; muscle_group_id: string; position: number; exercise_slots: number }[];
  } = {},
) {
  return {
    mesocycles: [{ id: "meso1", status: over.mesoStatus ?? "active" }],
    microcycles: [{ id: "micro1", mesocycle_id: "meso1" }],
    workouts: [{ id: "w1", microcycle_id: "micro1", day_number: 1 }],
    meso_days: [{ id: "day1", mesocycle_id: "meso1", day_number: 1 }],
    meso_day_groups: over.groups ?? [
      { id: "g-chest", meso_day_id: "day1", muscle_group_id: "chest", position: 1, exercise_slots: 2 },
      { id: "g-tri", meso_day_id: "day1", muscle_group_id: "triceps", position: 2, exercise_slots: 1 },
    ],
    meso_exercises: (
      over.planFills ?? [
        { id: "f-bench", group: "g-chest", exercise_id: "bench", position: 1, slot_number: 1 },
        { id: "f-flye", group: "g-chest", exercise_id: "flye", position: 2, slot_number: 2 },
        { id: "f-push", group: "g-tri", exercise_id: "pushdown", position: 3, slot_number: 1 },
      ]
    ).map((f) => ({
      id: f.id,
      mesocycle_id: "meso1",
      meso_day_group_id: f.group,
      exercise_id: f.exercise_id,
      position: f.position,
      slot_number: f.slot_number,
      initial_sets: 3,
    })),
    workout_exercises: (
      over.workoutRows ?? [
        { id: "we-bench", exercise_id: "bench", position: 1 },
        { id: "we-flye", exercise_id: "flye", position: 2 },
        { id: "we-push", exercise_id: "pushdown", position: 3 },
      ]
    ).map((w) => ({
      id: w.id,
      workout_id: "w1",
      exercise_id: w.exercise_id,
      position: w.position,
      muscle_group_id: w.muscle_group_id ?? null,
      prescribed_sets: w.prescribed_sets ?? 3,
    })),
  } as Record<string, Row[]>;
}

const byPosition = (rows: Row[], key = "exercise_id") =>
  [...rows]
    .sort((a, b) => (a.position as number) - (b.position as number))
    .map((r) => r[key]);

// ---------------------------------------------------------------------------

describe("planDayExerciseOrder", () => {
  it("flattens across groups by the day-level position", () => {
    expect(
      planDayExerciseOrder([
        {
          position: 1,
          fills: [
            { exercise_id: "bench", position: 2, slot_number: 1 },
            { exercise_id: "flye", position: 4, slot_number: 2 },
          ],
        },
        {
          position: 2,
          fills: [
            { exercise_id: "pushdown", position: 1, slot_number: 1 },
            { exercise_id: "skull", position: 3, slot_number: 2 },
          ],
        },
      ]),
    ).toEqual(["pushdown", "bench", "skull", "flye"]);
  });

  it("breaks ties by group order then slot (legacy group-clustered rows)", () => {
    expect(
      planDayExerciseOrder([
        {
          position: 2,
          fills: [
            { exercise_id: "curl", position: 1, slot_number: 2 },
            { exercise_id: "hammer", position: 1, slot_number: 1 },
          ],
        },
        {
          position: 1,
          fills: [{ exercise_id: "row", position: 1, slot_number: 1 }],
        },
      ]),
    ).toEqual(["row", "hammer", "curl"]);
  });
});

describe("applyPlanOrderToWorkout (plan → session)", () => {
  it("renumbers an already-generated day to the plan's order", async () => {
    const db = fixture();
    await applyPlanOrderToWorkout(fakeClient(db), "w1", [
      "pushdown",
      "bench",
      "flye",
    ]);
    expect(byPosition(db.workout_exercises)).toEqual([
      "pushdown",
      "bench",
      "flye",
    ]);
  });

  it("keeps rows the plan dropped (logged history) at the end, in order", async () => {
    const db = fixture({
      workoutRows: [
        { id: "we-bench", exercise_id: "bench", position: 1 },
        { id: "we-legacy", exercise_id: "legacy", position: 2 },
        { id: "we-push", exercise_id: "pushdown", position: 3 },
      ],
    });
    await applyPlanOrderToWorkout(fakeClient(db), "w1", ["pushdown", "bench"]);
    expect(byPosition(db.workout_exercises)).toEqual([
      "pushdown",
      "bench",
      "legacy",
    ]);
  });

  it("does nothing when the plan day is empty", async () => {
    const db = fixture();
    await applyPlanOrderToWorkout(fakeClient(db), "w1", []);
    expect(byPosition(db.workout_exercises)).toEqual([
      "bench",
      "flye",
      "pushdown",
    ]);
  });
});

describe("syncPlanOrderFromWorkout (session → plan)", () => {
  it("rewrites the plan day to the day view's order", async () => {
    const db = fixture({
      workoutRows: [
        { id: "we-push", exercise_id: "pushdown", position: 1 },
        { id: "we-bench", exercise_id: "bench", position: 2 },
        { id: "we-flye", exercise_id: "flye", position: 3 },
      ],
    });
    await syncPlanOrderFromWorkout(fakeClient(db), "w1");
    expect(byPosition(db.meso_exercises)).toEqual([
      "pushdown",
      "bench",
      "flye",
    ]);
  });

  it("keeps a plan fill the session dropped at the end (week-local removal)", async () => {
    const db = fixture({
      workoutRows: [
        { id: "we-push", exercise_id: "pushdown", position: 1 },
        { id: "we-bench", exercise_id: "bench", position: 2 },
      ],
    });
    await syncPlanOrderFromWorkout(fakeClient(db), "w1");
    expect(byPosition(db.meso_exercises)).toEqual([
      "pushdown",
      "bench",
      "flye",
    ]);
  });

  it("never rewrites a completed meso's plan", async () => {
    const db = fixture({
      mesoStatus: "completed",
      workoutRows: [
        { id: "we-push", exercise_id: "pushdown", position: 1 },
        { id: "we-bench", exercise_id: "bench", position: 2 },
        { id: "we-flye", exercise_id: "flye", position: 3 },
      ],
    });
    await syncPlanOrderFromWorkout(fakeClient(db), "w1");
    expect(byPosition(db.meso_exercises)).toEqual([
      "bench",
      "flye",
      "pushdown",
    ]);
  });

  it("no-ops when the workout's day is no longer in the plan", async () => {
    const db = fixture();
    db.meso_days = [{ id: "day1", mesocycle_id: "meso1", day_number: 4 }];
    await syncPlanOrderFromWorkout(fakeClient(db), "w1");
    expect(byPosition(db.meso_exercises)).toEqual([
      "bench",
      "flye",
      "pushdown",
    ]);
  });
});

describe("syncPlanSubstitution (session → plan)", () => {
  it("swaps the movement on the plan fill, keeping its slot and order", async () => {
    const db = fixture();
    await syncPlanSubstitution(fakeClient(db), "w1", "flye", "cable-flye");
    const fill = db.meso_exercises.find((f) => f.id === "f-flye")!;
    expect(fill.exercise_id).toBe("cable-flye");
    expect(fill.position).toBe(2);
    expect(fill.slot_number).toBe(2);
  });

  it("no-ops when the plan day already holds the incoming exercise", async () => {
    const db = fixture();
    await syncPlanSubstitution(fakeClient(db), "w1", "flye", "bench");
    expect(byPosition(db.meso_exercises)).toEqual([
      "bench",
      "flye",
      "pushdown",
    ]);
  });

  it("no-ops when the plan day never held the outgoing exercise", async () => {
    const db = fixture();
    await syncPlanSubstitution(fakeClient(db), "w1", "ghost", "cable-flye");
    expect(byPosition(db.meso_exercises)).toEqual([
      "bench",
      "flye",
      "pushdown",
    ]);
  });
});

describe("syncPlanAddedExercises (session → plan)", () => {
  it("adds the exercise to the plan day's existing block and grows its slots", async () => {
    const db = fixture({
      workoutRows: [
        { id: "we-bench", exercise_id: "bench", position: 1 },
        { id: "we-flye", exercise_id: "flye", position: 2 },
        { id: "we-push", exercise_id: "pushdown", position: 3 },
        {
          id: "we-skull",
          exercise_id: "skull",
          position: 4,
          muscle_group_id: "triceps",
          prescribed_sets: 4,
        },
      ],
    });
    await syncPlanAddedExercises(fakeClient(db), "w1", ["skull"]);
    const added = db.meso_exercises.find((f) => f.exercise_id === "skull")!;
    expect(added.meso_day_group_id).toBe("g-tri");
    expect(added.slot_number).toBe(2);
    expect(added.position).toBe(4);
    expect(added.initial_sets).toBe(4);
    const triceps = db.meso_day_groups.find((g) => g.id === "g-tri")!;
    expect(triceps.exercise_slots).toBe(2);
  });

  it("creates the muscle-group block when the plan day doesn't have one", async () => {
    const db = fixture({
      workoutRows: [
        { id: "we-bench", exercise_id: "bench", position: 1 },
        {
          id: "we-curl",
          exercise_id: "curl",
          position: 2,
          muscle_group_id: "biceps",
        },
      ],
    });
    await syncPlanAddedExercises(fakeClient(db), "w1", ["curl"]);
    const block = db.meso_day_groups.find((g) => g.muscle_group_id === "biceps")!;
    expect(block).toBeDefined();
    expect(block.position).toBe(3);
    const added = db.meso_exercises.find((f) => f.exercise_id === "curl")!;
    expect(added.meso_day_group_id).toBe(block.id);
    expect(added.slot_number).toBe(1);
  });

  it("leaves a block at the 10-slot planner ceiling alone", async () => {
    const fills = Array.from({ length: 10 }, (_, i) => ({
      id: `f-${i}`,
      group: "g-chest",
      exercise_id: `ex-${i}`,
      position: i + 1,
      slot_number: i + 1,
    }));
    const db = fixture({
      groups: [
        {
          id: "g-chest",
          meso_day_id: "day1",
          muscle_group_id: "chest",
          position: 1,
          exercise_slots: 10,
        } as unknown as { id: string; muscle_group_id: string; position: number; exercise_slots: number },
      ],
      planFills: fills,
      workoutRows: [
        {
          id: "we-new",
          exercise_id: "eleventh",
          position: 1,
          muscle_group_id: "chest",
        },
      ],
    });
    await syncPlanAddedExercises(fakeClient(db), "w1", ["eleventh"]);
    expect(db.meso_exercises).toHaveLength(10);
  });

  it("skips an exercise the plan day already lists", async () => {
    const db = fixture({
      workoutRows: [
        {
          id: "we-bench",
          exercise_id: "bench",
          position: 1,
          muscle_group_id: "chest",
        },
      ],
    });
    await syncPlanAddedExercises(fakeClient(db), "w1", ["bench"]);
    expect(db.meso_exercises).toHaveLength(3);
  });
});
