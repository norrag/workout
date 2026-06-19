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
  it("sums prescribed sets per muscle group, ignoring skipped exercises", () => {
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
    profile: { experience_level: "intermediate" as const, units: "lb" as const },
    muscleGroupWeeklySets: 12,
    weekPeak: null,
    strengthAnchor: null,
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
    expect(inputs.user).toEqual({ experienceLevel: "intermediate", units: "lb" });
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
