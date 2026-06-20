import { describe, it, expect } from "vitest";
import type {
  ExerciseFeedbackRow,
  WorkoutExerciseRow,
  WorkoutFeedbackRow,
} from "@/lib/types/database";
import {
  buildConfigInputs,
  computeDepFingerprint,
  configProjection,
  DERIVED_INPUT_KEYS,
  type ConfigInputArgs,
} from "../fingerprint";
import { buildEngineInputs } from "../progression";

// a full set of buildEngineInputs args, with non-trivial derived history so the
// projection has something to strip
function engineArgs() {
  return {
    we: {
      prescribed_weight: 185,
      prescribed_reps: 8,
      prescribed_sets: 3,
      target_rir: 2,
    } as WorkoutExerciseRow,
    sets: [
      {
        set_number: 1,
        weight: 185,
        reps: 8,
        rir_reported: 2,
        is_warmup: false,
        id: "s1",
      },
      {
        set_number: 2,
        weight: 185,
        reps: 8,
        rir_reported: 1,
        is_warmup: false,
        id: "s2",
      },
    ] as unknown as Parameters<typeof buildEngineInputs>[0]["sets"],
    feedback: {
      joint_pain: 1,
      pump: 7,
      workload: 6,
    } as ExerciseFeedbackRow,
    groupFeedback: { pump: 7, workload: 6 },
    workoutFeedback: {
      overall_fatigue: 2,
      effort_rating: 3,
      performance_rating: 3,
    } as WorkoutFeedbackRow,
    microTargetRir: 2,
    nextWeek: { targetRir: 1, isDeload: false },
    goal: "hypertrophy" as const,
    equipmentType: "barbell",
    profile: { experience_level: "intermediate" as const, units: "lb" as const },
    muscleGroupWeeklySets: 12,
    weekPeak: null,
    strengthAnchor: { value: 230, confidence: "high" as const },
  };
}

/** the config-input args that correspond to the engineArgs above */
function configArgs(a = engineArgs()): ConfigInputArgs {
  return {
    equipmentType: a.equipmentType,
    profile: a.profile,
    goal: a.goal,
    week: a.nextWeek,
    previous: {
      weight: a.we.prescribed_weight,
      reps: a.we.prescribed_reps,
      sets: a.we.prescribed_sets ?? 1,
      targetRir: a.we.target_rir ?? a.microTargetRir,
    },
    initial: null,
  };
}

describe("configProjection", () => {
  it("strips every derived field and keeps the config ones", () => {
    const inputs = buildEngineInputs(engineArgs());
    const projected = configProjection(inputs) as unknown as Record<string, unknown>;
    for (const key of DERIVED_INPUT_KEYS) {
      expect(projected[key], key).toBeUndefined();
    }
    // config keys survive
    for (const key of ["exercise", "user", "goalType", "week", "previous", "initial"]) {
      expect(projected[key], key).toBeDefined();
    }
  });
});

describe("write/check equivalence (doc 14 §3 golden)", () => {
  it("configProjection(buildEngineInputs(x)) === buildConfigInputs(configArgsOf(x))", () => {
    // the only correctness requirement of the framework: the config projection is
    // built the SAME way at write (generation) and at check (the reconcile)
    const projected = configProjection(buildEngineInputs(engineArgs()));
    const direct = buildConfigInputs(configArgs());
    expect(projected).toEqual(direct);
  });
});

describe("computeDepFingerprint", () => {
  const token = { version: 9 };

  it("is stable for the same config + token", () => {
    const c = buildConfigInputs(configArgs());
    expect(computeDepFingerprint(c, token)).toBe(computeDepFingerprint(c, token));
  });

  it("changes when the params token changes", () => {
    const c = buildConfigInputs(configArgs());
    expect(computeDepFingerprint(c, { version: 9 })).not.toBe(
      computeDepFingerprint(c, { version: 10 }),
    );
  });

  it.each([
    ["goal", { goal: "strength" as const }],
    ["week", { week: { targetRir: 0, isDeload: true } }],
    ["previous", { previous: { weight: 999, reps: 8, sets: 3, targetRir: 2 } }],
    ["equipment", { equipmentType: "dumbbell" }],
    ["initial", { initial: { weight: 45, reps: 10, sets: 3 } }],
  ])("changes when the %s config dimension changes", (_label, over) => {
    const base = computeDepFingerprint(buildConfigInputs(configArgs()), token);
    const changed = computeDepFingerprint(
      buildConfigInputs({ ...configArgs(), ...over }),
      token,
    );
    expect(changed).not.toBe(base);
  });

  it("changes when the user profile changes", () => {
    const base = computeDepFingerprint(buildConfigInputs(configArgs()), token);
    const changed = computeDepFingerprint(
      buildConfigInputs({
        ...configArgs(),
        profile: { experience_level: "advanced", units: "lb" },
      }),
      token,
    );
    expect(changed).not.toBe(base);
  });

  it("is INVARIANT to derived (history) inputs (doc 14 §6.4)", () => {
    // two engine inputs that differ only in derived history (sets/feedback/anchor)
    // must hash the same — derived inputs are excluded from the signature
    const a = buildEngineInputs(engineArgs());
    const noisy = engineArgs();
    noisy.sets = [
      { set_number: 1, weight: 999, reps: 20, rir_reported: 0, is_warmup: false, id: "x" },
    ] as unknown as typeof noisy.sets;
    noisy.strengthAnchor = { value: 1, confidence: "low" as "high" };
    noisy.muscleGroupWeeklySets = 99;
    const b = buildEngineInputs(noisy);
    expect(computeDepFingerprint(configProjection(a), token)).toBe(
      computeDepFingerprint(configProjection(b), token),
    );
  });
});
