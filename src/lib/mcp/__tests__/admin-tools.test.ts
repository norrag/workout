import { describe, it, expect } from "vitest";
import {
  DEFAULT_ENGINE_PARAMS,
  prescribe,
  type EngineInputs,
  type EngineParams,
} from "@/lib/engine";
import type { DecisionRecord } from "@/lib/queries/engine-admin";
import {
  deepMerge,
  diffParams,
  diffPrescription,
  replayDecisions,
  registerAdminTools,
  LIST_ENGINE_PARAMS,
  GET_ENGINE_PARAMS,
  PROPOSE_ENGINE_PARAMS,
  ACTIVATE_ENGINE_PARAMS,
  GET_ENGINE_DECISIONS,
  REPLAY_DECISIONS,
  SIMULATE_PRESCRIPTIONS,
} from "../tools/admin";
import { captureServer, fakeExtra } from "./harness";

// --- deepMerge -------------------------------------------------------------

describe("deepMerge", () => {
  it("overrides nested leaves without dropping siblings", () => {
    const base = { a: 1, nested: { x: 1, y: 2 }, arr: [1, 2] };
    const out = deepMerge(base, { nested: { y: 9 }, arr: [3] });
    expect(out).toEqual({ a: 1, nested: { x: 1, y: 9 }, arr: [3] });
  });

  it("does not mutate the base", () => {
    const base = { nested: { x: 1 } };
    deepMerge(base, { nested: { x: 2 } });
    expect(base.nested.x).toBe(1);
  });
});

// --- diffParams ------------------------------------------------------------

describe("diffParams", () => {
  it("returns only differing dot-paths", () => {
    const a = { min_sets: 2, deload: { load_pct: 0.5, set_pct: 0.5 } };
    const b = { min_sets: 3, deload: { load_pct: 0.5, set_pct: 0.6 } };
    const diff = diffParams(a, b);
    expect(diff).toEqual([
      { path: "deload.set_pct", from: 0.5, to: 0.6 },
      { path: "min_sets", from: 2, to: 3 },
    ]);
  });

  it("is empty for identical objects", () => {
    expect(diffParams({ a: 1 }, { a: 1 })).toEqual([]);
  });
});

// --- diffPrescription ------------------------------------------------------

describe("diffPrescription", () => {
  it("flags changed prescription fields and ignores rationale", () => {
    const stored = { weight: 100, reps: 8, sets: 3, targetRir: 2, rationale: "x" };
    const diff = diffPrescription(stored, {
      weight: 105,
      reps: 8,
      sets: 3,
      targetRir: 2,
      rationale: "different prose",
    });
    expect(diff.changed).toBe(true);
    expect(diff.fields.weight).toEqual({ from: 100, to: 105 });
    expect(diff.fields.reps).toBeUndefined();
  });

  it("reports no change when numbers match", () => {
    const stored = { weight: 100, reps: 8, sets: 3, targetRir: 2 };
    const diff = diffPrescription(stored, {
      weight: 100,
      reps: 8,
      sets: 3,
      targetRir: 2,
      rationale: "y",
    });
    expect(diff.changed).toBe(false);
  });
});

// --- replayDecisions -------------------------------------------------------

function decision(inputs: Record<string, unknown>, output: Record<string, unknown>): DecisionRecord {
  return {
    id: "d1",
    workout_exercise_id: "we1",
    source_workout_exercise_id: "we0",
    exercise_id: "e1",
    exercise_name: "Bench Press",
    workout_id: "w1",
    microcycle_id: "mc1",
    mesocycle_id: "m1",
    coordinate: "W2·D1",
    params_version: 1,
    params_hash: null,
    provenance: null,
    created_at: "2026-06-10T00:00:00Z",
    inputs,
    output,
  };
}

// a minimal valid EngineInputs that yields a deterministic prescription
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

describe("replayDecisions", () => {
  it("counts changed decisions against candidate params", () => {
    const inputs = sampleInputs();
    // store an output that differs from what the engine would now produce
    const stored = decision(inputs, { weight: 999, reps: 8, sets: 3, targetRir: 2 });
    const outcome = replayDecisions([stored], DEFAULT_ENGINE_PARAMS as EngineParams);
    expect(outcome.total).toBe(1);
    expect(outcome.changed).toBe(1);
    expect(outcome.diffs[0].exercise_name).toBe("Bench Press");
    expect(outcome.errors).toBe(0);
  });

  it("counts malformed inputs as errors, not crashes", () => {
    const bad = decision({ not: "valid inputs" }, { weight: 1, reps: 1, sets: 1, targetRir: 1 });
    const outcome = replayDecisions([bad], DEFAULT_ENGINE_PARAMS as EngineParams);
    expect(outcome.errors).toBe(1);
    expect(outcome.changed).toBe(0);
  });

  it("reports no change when stored output already matches the engine", () => {
    const inputs = sampleInputs();
    // store exactly what the engine produces for these inputs
    const engineOut = prescribe(inputs as unknown as EngineInputs, DEFAULT_ENGINE_PARAMS);
    const stored = decision(inputs, engineOut as unknown as Record<string, unknown>);
    const outcome = replayDecisions([stored], DEFAULT_ENGINE_PARAMS as EngineParams);
    expect(outcome.total).toBe(1);
    expect(outcome.changed).toBe(0);
    expect(outcome.errors).toBe(0);
  });

  it("classifies outcomes and reports rule coverage (P1-3)", () => {
    const good = decision(sampleInputs(), { weight: 999, reps: 8, sets: 3, targetRir: 2 });
    const bad = decision({ not: "valid" }, { weight: 1, reps: 1, sets: 1, targetRir: 1 });
    const outcome = replayDecisions([good, bad], DEFAULT_ENGINE_PARAMS as EngineParams);
    expect(outcome.outcomes.changed).toBe(1);
    expect(outcome.outcomes.invalid_source).toBe(1);
    expect(outcome.outcomes.execution_error).toBe(0);
    // the valid case exercised the load rule
    expect(outcome.rule_coverage.load).toBe(1);
  });

  it("includes a bounded sample of unchanged decisions when asked", () => {
    const inputs = sampleInputs();
    const engineOut = prescribe(inputs as unknown as EngineInputs, DEFAULT_ENGINE_PARAMS);
    const stored = decision(inputs, engineOut as unknown as Record<string, unknown>);
    const none = replayDecisions([stored], DEFAULT_ENGINE_PARAMS as EngineParams, 0);
    expect(none.unchanged_sample).toHaveLength(0);
    const sampled = replayDecisions([stored], DEFAULT_ENGINE_PARAMS as EngineParams, 5);
    expect(sampled.unchanged_sample).toHaveLength(1);
    expect(sampled.outcomes.unchanged).toBe(1);
  });
});

// --- registration + admin gating -------------------------------------------

const ALL_ADMIN_TOOLS = [
  LIST_ENGINE_PARAMS,
  GET_ENGINE_PARAMS,
  PROPOSE_ENGINE_PARAMS,
  ACTIVATE_ENGINE_PARAMS,
  GET_ENGINE_DECISIONS,
  REPLAY_DECISIONS,
  SIMULATE_PRESCRIPTIONS,
];

describe("admin-tool registration", () => {
  it("registers every Slice 4 admin tool", () => {
    const { server, tools } = captureServer();
    registerAdminTools(server);
    for (const name of ALL_ADMIN_TOOLS) {
      expect(tools.has(name), name).toBe(true);
    }
  });

  it("no admin tool takes a user_id argument (hard rule #5)", () => {
    const { server, tools } = captureServer();
    registerAdminTools(server);
    for (const [, tool] of tools) {
      const schema = (tool.config.inputSchema ?? {}) as Record<string, unknown>;
      expect(Object.keys(schema)).not.toContain("user_id");
    }
  });

  it("rejects unauthenticated calls before any work", async () => {
    const { server, tools } = captureServer();
    registerAdminTools(server);
    for (const name of ALL_ADMIN_TOOLS) {
      const tool = tools.get(name)!;
      await expect(tool.handler({}, fakeExtra(undefined)), name).rejects.toThrow(
        /authenticated session/i,
      );
    }
  });
});
