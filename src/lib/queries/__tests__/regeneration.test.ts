import { describe, it, expect } from "vitest";
import {
  DEFAULT_ENGINE_PARAMS,
  prescribe,
  type EngineInputs,
  type EngineParams,
} from "@/lib/engine";
import {
  planRegeneration,
  type PlannedDecisionCandidate,
} from "../regeneration";

const PARAMS = DEFAULT_ENGINE_PARAMS as EngineParams;

// a minimal valid EngineInputs that yields a deterministic prescription
// (mirrors the admin-tools replay fixture)
function sampleInputs(): Record<string, unknown> {
  return {
    exercise: { equipmentType: "barbell" },
    user: { experienceLevel: "intermediate", units: "lb" },
    goalType: "gain",
    week: { targetRir: 2, isDeload: false },
    previous: { weight: 185, reps: 8, sets: 3, targetRir: 2 },
    actualSets: [
      { setNumber: 1, weight: 185, reps: 8, rirReported: 2, isWarmup: false },
      { setNumber: 2, weight: 185, reps: 8, rirReported: 2, isWarmup: false },
    ],
    exerciseFeedback: { jointPain: null, pump: null, workload: null },
    workoutFeedback: null,
    muscleGroupWeeklySets: null,
    weekPeak: null,
    initial: null,
  };
}

function candidate(
  inputs: Record<string, unknown>,
  output: Record<string, unknown>,
  over: Partial<PlannedDecisionCandidate> = {},
): PlannedDecisionCandidate {
  return {
    decisionId: "d1",
    userId: "u1",
    workoutExerciseId: "we1",
    exerciseId: "e1",
    exerciseName: "Bench Press",
    workoutId: "w1",
    microcycleId: "mc1",
    mesocycleId: "m1",
    coordinate: "W2·D1",
    sourceWorkoutExerciseId: "we0",
    fromParamsVersion: 8,
    inputs,
    output,
    ...over,
  };
}

describe("planRegeneration", () => {
  it("flags a stale prescription the active params would change", () => {
    // store an output that differs from what the engine now produces
    const c = candidate(sampleInputs(), {
      weight: 999,
      reps: 8,
      sets: 3,
      targetRir: 2,
    });
    const plan = planRegeneration([c], PARAMS);
    expect(plan.counts.total).toBe(1);
    expect(plan.counts.changed).toBe(1);
    const item = plan.items[0];
    expect(item.status).toBe("changed");
    // the new output is the engine's, not the stale stored one
    expect(item.output).toBeDefined();
    expect(item.output!.weight).not.toBe(999);
    expect(item.changedFields?.some((f) => f.field === "weight")).toBe(true);
  });

  it("leaves a prescription that already matches the engine untouched", () => {
    const inputs = sampleInputs();
    const engineOut = prescribe(inputs as unknown as EngineInputs, PARAMS);
    const c = candidate(inputs, engineOut as unknown as Record<string, unknown>);
    const plan = planRegeneration([c], PARAMS);
    expect(plan.counts.changed).toBe(0);
    expect(plan.counts.unchanged).toBe(1);
    expect(plan.items[0].status).toBe("unchanged");
  });

  it("classifies a source whose inputs no longer validate as invalid_source", () => {
    const c = candidate(
      { not: "valid inputs" },
      { weight: 1, reps: 1, sets: 1, targetRir: 1 },
    );
    const plan = planRegeneration([c], PARAMS);
    expect(plan.counts.invalid_source).toBe(1);
    expect(plan.counts.changed).toBe(0);
    expect(plan.items[0].status).toBe("invalid_source");
    // nothing to write for an unparseable source
    expect(plan.items[0].output).toBeUndefined();
  });

  it("aggregates a mixed batch", () => {
    const stale = candidate(sampleInputs(), {
      weight: 999,
      reps: 8,
      sets: 3,
      targetRir: 2,
    });
    const bad = candidate(
      { not: "valid" },
      { weight: 1, reps: 1, sets: 1, targetRir: 1 },
    );
    const inputs = sampleInputs();
    const engineOut = prescribe(inputs as unknown as EngineInputs, PARAMS);
    const current = candidate(
      inputs,
      engineOut as unknown as Record<string, unknown>,
    );
    const plan = planRegeneration([stale, bad, current], PARAMS);
    expect(plan.counts).toEqual({
      total: 3,
      changed: 1,
      unchanged: 1,
      invalid_source: 1,
      execution_error: 0,
    });
  });

  it("hands the writer everything it needs for a changed item", () => {
    const stale = candidate(sampleInputs(), {
      weight: 999,
      reps: 8,
      sets: 3,
      targetRir: 2,
    });
    const item = planRegeneration([stale], PARAMS).items[0];
    expect(item.inputs).toBeDefined(); // parsed, ready to re-record
    expect(item.output).toBeDefined();
    expect(item.changedFields!.length).toBeGreaterThan(0);
  });
});
