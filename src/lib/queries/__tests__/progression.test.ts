/**
 * Pure-helper tests for the week N→N+1 job: engine-input assembly from DB
 * rows, weekly group volumes, peak tracking, and goal mapping. The job's
 * I/O itself is covered by the hosted-DB integration smoke.
 */
import { describe, expect, it } from "vitest";
import {
  buildEngineInputs,
  engineGoal,
  peakByExercise,
  planCatchUp,
  weeklySetsByGroup,
} from "../progression";
import type {
  ExerciseFeedbackRow,
  LoggedSetRow,
  WorkoutExerciseRow,
} from "@/lib/types/database";

function we(overrides: Partial<WorkoutExerciseRow> = {}): WorkoutExerciseRow {
  return {
    id: "we-1",
    workout_id: "w-1",
    exercise_id: "ex-1",
    muscle_group_id: "mg-1",
    position: 1,
    prescribed_weight: 100,
    prescribed_reps: 8,
    prescribed_sets: 3,
    target_rir: 2,
    status: "completed",
    skipped_set_numbers: [],
    set_weights: {},
    notes: null,
    dep_fingerprint: null,
    params_version: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function loggedSet(overrides: Partial<LoggedSetRow> = {}): LoggedSetRow {
  return {
    id: "s-1",
    workout_exercise_id: "we-1",
    user_id: "u-1",
    exercise_id: "ex-1",
    macrocycle_id: null,
    mesocycle_id: "meso-1",
    microcycle_id: "micro-1",
    workout_id: "w-1",
    performed_at: "2026-06-12T10:00:00Z",
    set_number: 1,
    weight: 100,
    unit: "lb",
    reps: 8,
    set_type: "straight",
    rir_reported: 2,
    is_warmup: false,
    notes: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  } as LoggedSetRow;
}

function feedback(
  overrides: Partial<ExerciseFeedbackRow> = {},
): ExerciseFeedbackRow {
  return {
    id: "f-1",
    workout_exercise_id: "we-1",
    user_id: "u-1",
    muscle_group_id: "mg-1",
    joint_pain: 1,
    pump: 7,
    workload: 5,
    soreness: null,
    soreness_days: null,
    notes: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("engineGoal", () => {
  it("keeps hypertrophy and strength distinct (doc 13 §9.1 per-goal windows)", () => {
    expect(engineGoal("hypertrophy")).toBe("hypertrophy");
    expect(engineGoal("strength")).toBe("strength");
  });
  it("passes cut and maintain through", () => {
    expect(engineGoal("cut")).toBe("cut");
    expect(engineGoal("maintain")).toBe("maintain");
  });
  it("defaults to the hypertrophy window for standalone mesos (no macro goal)", () => {
    expect(engineGoal(null)).toBe("hypertrophy");
  });
});

describe("weeklySetsByGroup", () => {
  it("sums prescribed sets per muscle group, ignoring skipped exercises (no roles → slot fallback)", () => {
    const sets = weeklySetsByGroup([
      we({ id: "a", prescribed_sets: 3 }),
      we({ id: "b", workout_id: "w-2", prescribed_sets: 4 }),
      we({ id: "c", muscle_group_id: "mg-2", prescribed_sets: 5 }),
      we({ id: "d", prescribed_sets: 6, status: "skipped" }),
      we({ id: "e", muscle_group_id: null, prescribed_sets: 2 }),
    ]);
    expect(sets.get("mg-1")).toBe(7);
    expect(sets.get("mg-2")).toBe(5);
  });

  it("counts fractionally via exercise muscle roles (R14, doc 10 §2)", () => {
    // ex-1 = bench-like: chest primary, delts + triceps secondary;
    // ex-2 = pushdown-like: triceps primary
    const roles = new Map<
      string,
      { muscleGroupId: string; role: "primary" | "secondary" }[]
    >([
      [
        "ex-1",
        [
          { muscleGroupId: "chest", role: "primary" },
          { muscleGroupId: "delts", role: "secondary" },
          { muscleGroupId: "triceps", role: "secondary" },
        ],
      ],
      ["ex-2", [{ muscleGroupId: "triceps", role: "primary" }]],
    ]);
    const sets = weeklySetsByGroup(
      [
        we({ id: "a", exercise_id: "ex-1", prescribed_sets: 4 }),
        we({ id: "b", exercise_id: "ex-2", muscle_group_id: "triceps", prescribed_sets: 3 }),
      ],
      roles,
      { direct: 1.0, indirect: 0.5 },
    );
    expect(sets.get("chest")).toBe(4); // 4 × 1.0
    expect(sets.get("delts")).toBe(2); // 4 × 0.5
    expect(sets.get("triceps")).toBe(5); // 4 × 0.5 + 3 × 1.0
  });

  it("falls back to the slot's group (direct weight) for an exercise with no links", () => {
    const sets = weeklySetsByGroup(
      [we({ id: "a", exercise_id: "ex-unlinked", prescribed_sets: 3 })],
      new Map(),
      { direct: 1.0, indirect: 0.5 },
    );
    expect(sets.get("mg-1")).toBe(3);
  });

  it("skipped slots contribute nothing even with roles", () => {
    const roles = new Map<
      string,
      { muscleGroupId: string; role: "primary" | "secondary" }[]
    >([["ex-1", [{ muscleGroupId: "chest", role: "primary" }]]]);
    const sets = weeklySetsByGroup(
      [we({ id: "a", exercise_id: "ex-1", prescribed_sets: 4, status: "skipped" })],
      roles,
    );
    expect(sets.size).toBe(0);
  });
});

describe("peakByExercise", () => {
  it("keeps the heaviest prescription per exercise", () => {
    const peaks = peakByExercise(
      [
        we({ id: "a", prescribed_weight: 100, target_rir: 3 }),
        we({ id: "b", prescribed_weight: 105, target_rir: 2, prescribed_reps: 7 }),
        we({ id: "c", exercise_id: "ex-2", prescribed_weight: null }),
      ],
      2,
    );
    expect(peaks.get("ex-1")).toMatchObject({ weight: 105, reps: 7 });
    expect(peaks.has("ex-2")).toBe(false);
  });
});

describe("buildEngineInputs", () => {
  const base = {
    we: we(),
    sets: [loggedSet(), loggedSet({ id: "s-2", set_number: 2, reps: 9 })],
    feedback: feedback(),
    groupFeedback: { pump: 7, workload: 6 },
    workoutFeedback: null,
    microTargetRir: 2,
    nextWeek: { targetRir: 1, isDeload: false },
    goal: "hypertrophy" as const,
    equipmentType: "barbell",
    profile: { experience_level: "intermediate" as const },
    muscleGroupWeeklySets: 12,
    weekPeak: null,
    strengthAnchor: null,
    bodyweight: null,
  };

  it("maps week-N rows onto the engine input shape", () => {
    const inputs = buildEngineInputs(base);
    expect(inputs.previous).toEqual({
      weight: 100,
      reps: 8,
      sets: 3,
      targetRir: 2,
    });
    expect(inputs.actualSets).toHaveLength(2);
    expect(inputs.actualSets[1]).toMatchObject({ setNumber: 2, reps: 9 });
    expect(inputs.exerciseFeedback).toEqual({
      jointPain: 1,
      pump: 7,
      workload: 6,
    });
    expect(inputs.week).toEqual({ targetRir: 1, isDeload: false });
    expect(inputs.user).toEqual({ experienceLevel: "intermediate" });
  });

  it("joint pain stays per-exercise while pump/workload come from the group scope", () => {
    const inputs = buildEngineInputs({
      ...base,
      feedback: feedback({ joint_pain: 3, pump: null, workload: null }),
      groupFeedback: { pump: 2, workload: 9 },
    });
    expect(inputs.exerciseFeedback).toEqual({
      jointPain: 3,
      pump: 2,
      workload: 9,
    });
  });

  it("carries the immutable logged_set id + stable sequence index (P0-4)", () => {
    const inputs = buildEngineInputs(base);
    expect(inputs.actualSets[0]).toMatchObject({ loggedSetId: "s-1", sequenceIndex: 0 });
    expect(inputs.actualSets[1]).toMatchObject({ loggedSetId: "s-2", sequenceIndex: 1 });
  });

  it("tolerates missing feedback and null prescription fields", () => {
    const inputs = buildEngineInputs({
      ...base,
      we: we({ prescribed_sets: null, target_rir: null }),
      feedback: null,
      groupFeedback: null,
      sets: [],
    });
    expect(inputs.previous).toMatchObject({ sets: 1, targetRir: 2 });
    expect(inputs.exerciseFeedback).toEqual({
      jointPain: null,
      pump: null,
      workload: null,
    });
  });
});

describe("planCatchUp", () => {
  const weeks = [
    { id: "m1", week_number: 1 },
    { id: "m2", week_number: 2 },
    { id: "m3", week_number: 3 },
    { id: "m4", week_number: 4 },
  ];

  // mirrors the real data: W3 D1 completed (seeded) but its W4·D1 counterpart
  // was never generated; D2/D3 completions did generate theirs; D4 still planned.
  const workouts = [
    { id: "w3d1", microcycle_id: "m3", day_number: 1, status: "completed" },
    { id: "w3d2", microcycle_id: "m3", day_number: 2, status: "completed" },
    { id: "w3d3", microcycle_id: "m3", day_number: 3, status: "completed" },
    { id: "w3d4", microcycle_id: "m3", day_number: 4, status: "planned" },
    { id: "w4d2", microcycle_id: "m4", day_number: 2, status: "planned" },
    { id: "w4d3", microcycle_id: "m4", day_number: 3, status: "planned" },
  ];

  it("flags only the closed day whose next-week counterpart is missing", () => {
    const gaps = planCatchUp(weeks, workouts);
    expect(gaps).toEqual([{ workoutId: "w3d1", week: 3, day: 1 }]);
  });

  it("ignores a planned source (W3·D4 is not yet completed)", () => {
    const gaps = planCatchUp(weeks, workouts);
    expect(gaps.some((g) => g.day === 4)).toBe(false);
  });

  it("never flags the final week (no next week to generate into)", () => {
    const lastWeekOnly = [{ id: "m4", week_number: 4 }];
    const gaps = planCatchUp(lastWeekOnly, [
      { id: "w4d1", microcycle_id: "m4", day_number: 1, status: "completed" },
    ]);
    expect(gaps).toEqual([]);
  });

  it("treats a skipped day as a closed source", () => {
    const gaps = planCatchUp(weeks, [
      { id: "w3d1", microcycle_id: "m3", day_number: 1, status: "skipped" },
    ]);
    expect(gaps).toEqual([{ workoutId: "w3d1", week: 3, day: 1 }]);
  });

  it("returns nothing when every counterpart already exists", () => {
    const gaps = planCatchUp(weeks, [
      { id: "w3d1", microcycle_id: "m3", day_number: 1, status: "completed" },
      { id: "w4d1", microcycle_id: "m4", day_number: 1, status: "planned" },
    ]);
    expect(gaps).toEqual([]);
  });

  it("orders gaps by week then day", () => {
    // each source's counterpart is absent (different days), so all are gaps
    const gaps = planCatchUp(weeks, [
      { id: "w3d3", microcycle_id: "m3", day_number: 3, status: "completed" },
      { id: "w2d2", microcycle_id: "m2", day_number: 2, status: "completed" },
      { id: "w3d1", microcycle_id: "m3", day_number: 1, status: "completed" },
    ]);
    expect(gaps.map((g) => `${g.week}.${g.day}`)).toEqual(["2.2", "3.1", "3.3"]);
  });
});
