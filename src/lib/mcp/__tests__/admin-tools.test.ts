import { describe, it, expect } from "vitest";
import {
  DEFAULT_ENGINE_PARAMS,
  prescribe,
  seedMeso,
  type EngineInputs,
  type EngineParams,
} from "@/lib/engine";
import { buildSeedInputs } from "@/lib/queries/fingerprint";
import { V16_PARAMS, V20_PARAMS } from "@/lib/engine/__tests__/helpers";
import type { DecisionRecord } from "@/lib/queries/engine-admin";
import {
  deepMerge,
  diffParams,
  diffPrescription,
  replayDecisions,
  registerAdminTools,
  GET_ENGINE_PARAMS,
  PROPOSE_ENGINE_PARAMS,
  ACTIVATE_ENGINE_PARAMS,
  GET_ENGINE_DECISIONS,
  GET_PROGRESSION_HISTORY,
  REPLAY_DECISIONS,
  SIMULATE_PRESCRIPTIONS,
  DISCARD_ENGINE_PARAMS,
} from "../tools/admin";
import {
  GET_LLM_EXPLANATION_STATUS,
  TEST_LLM_EXPLANATION,
  GENERATE_EXPLANATIONS,
  RECOMPUTE_PRESCRIPTIONS,
  validateRecomputeScope,
} from "../tools/admin-llm";
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

function decision(
  inputs: Record<string, unknown>,
  output: Record<string, unknown>,
  kind: DecisionRecord["kind"] = "advance",
  incrementOverride: number | null = null,
): DecisionRecord {
  return {
    id: "d1",
    kind,
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
    incrementOverride,
  };
}

// a minimal valid EngineInputs that yields a deterministic prescription
function sampleInputs(): Record<string, unknown> {
  return {
    exercise: { equipmentType: "barbell", loadType: "external" },
    user: { experienceLevel: "intermediate" },
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

  it("replays a seed decision through seedMeso, not prescribe (doc 14 §6.2)", () => {
    // a meso seed: its stored output is what seedMeso produced. (T-I4: the prior-peak
    // back-off seed is retired, so the seed defers to the plan `initial`.)
    const seedIn = buildSeedInputs({
      equipmentType: "barbell",
      profile: { experience_level: "intermediate" },
      goal: "hypertrophy",
      startRir: 3,
      isDeload: false,
      initial: { weight: 100, reps: 8, sets: 3 },
      priorPeak: { weight: 200, reps: 5, sets: 3 },
    });
    const seedOut = seedMeso(
      { weight: 200, reps: 5, sets: 3 },
      { weight: 100, reps: 8, sets: 3 },
      { equipmentType: "barbell", loadType: "external" },
      { experienceLevel: "intermediate" },
      3,
      DEFAULT_ENGINE_PARAMS,
    );
    const stored = decision(
      seedIn as unknown as Record<string, unknown>,
      seedOut as unknown as Record<string, unknown>,
      "seed",
    );
    // dispatched to seedMeso → reproduces the stored output (unchanged).
    const outcome = replayDecisions([stored], DEFAULT_ENGINE_PARAMS as EngineParams);
    expect(outcome.changed).toBe(0);
    expect(outcome.outcomes.unchanged).toBe(1);
    expect(outcome.errors).toBe(0);
  });

  it("replays a STEPPED seed with its recorded earn context (doc 16 §3.7)", () => {
    // a mode-active meso seed that earned at close: the decision inputs carry
    // the earn context + governors' lookback, so the replay reproduces the led
    // (stepped) output byte-for-byte under the same params.
    const anchor = { value: 198.2, confidence: "moderate" as const };
    const progression = {
      seedEarn: {
        previous: { weight: 145, reps: 8, sets: 3, targetRir: 3 },
        actualSets: [1, 2, 3].map((n) => ({
          setNumber: n,
          weight: 145,
          reps: 8,
          rirReported: null,
          isWarmup: false,
        })),
        exerciseFeedback: null,
        workoutFeedback: null,
      },
      progressionHistory: {
        earnedThisMicrocycle: false,
        trailing30dPrescribedGainPct: null,
        consecutiveMissedEarns: 0,
      },
      daysSincePreviousSession: 8,
    };
    const seedIn = buildSeedInputs({
      equipmentType: "barbell",
      profile: { experience_level: "intermediate" },
      goal: "hypertrophy",
      startRir: 3,
      isDeload: false,
      initial: null,
      priorPeak: null,
      strengthAnchor: anchor,
      progression,
    });
    const seedOut = seedMeso(
      null,
      null,
      { equipmentType: "barbell", loadType: "external" },
      { experienceLevel: "intermediate" },
      3,
      V20_PARAMS,
      {
        goalType: "hypertrophy",
        anchor,
        earn: progression.seedEarn,
        progressionHistory: progression.progressionHistory,
        daysSincePreviousSession: progression.daysSincePreviousSession,
      },
    );
    expect(
      seedOut.trace.some((s) => s.rule === "progression" && s.status === "stepped"),
    ).toBe(true);
    const stored = decision(
      seedIn as unknown as Record<string, unknown>,
      seedOut as unknown as Record<string, unknown>,
      "seed",
    );
    const outcome = replayDecisions([stored], V20_PARAMS);
    expect(outcome.changed).toBe(0);
    expect(outcome.outcomes.unchanged).toBe(1);
    expect(outcome.errors).toBe(0);
    // ...and a candidate WITHOUT the block honestly diffs the led seed away
    const reverted = replayDecisions([stored], V16_PARAMS);
    expect(reverted.changed).toBe(1);
  });

  it("replays the recorded plan rate on a seed, so a rate_source flip diffs honestly (doc 17 §3)", () => {
    // a stepped seed recorded under "band" whose inputs carried a tiny
    // personalized plan band: replaying under the SAME params reproduces it,
    // and a candidate that flips rate_source to "plan" reads the recorded rate
    // verbatim — the pacer now declines the step, so the decision diffs. This
    // is exactly the Phase-R v22 replay-diff review path.
    const anchor = { value: 198.2, confidence: "moderate" as const };
    const progression = {
      seedEarn: {
        previous: { weight: 145, reps: 8, sets: 3, targetRir: 3 },
        actualSets: [1, 2, 3].map((n) => ({
          setNumber: n,
          weight: 145,
          reps: 8,
          rirReported: null,
          isWarmup: false,
        })),
        exerciseFeedback: null,
        workoutFeedback: null,
      },
      progressionHistory: {
        earnedThisMicrocycle: false,
        // under the band target (1.6875 %/mo) this flows; under the recorded
        // plan band [0.1, 0.1] × 0.75 it paces
        trailing30dPrescribedGainPct: 1.0,
        consecutiveMissedEarns: 0,
      },
      daysSincePreviousSession: 8,
      planStrengthRate: { low: 0.1, high: 0.1 },
    };
    const seedIn = buildSeedInputs({
      equipmentType: "barbell",
      profile: { experience_level: "intermediate" },
      goal: "hypertrophy",
      startRir: 3,
      isDeload: false,
      initial: null,
      priorPeak: null,
      strengthAnchor: anchor,
      progression,
    });
    const seedOut = seedMeso(
      null,
      null,
      { equipmentType: "barbell", loadType: "external" },
      { experienceLevel: "intermediate" },
      3,
      V20_PARAMS,
      {
        goalType: "hypertrophy",
        anchor,
        earn: progression.seedEarn,
        progressionHistory: progression.progressionHistory,
        daysSincePreviousSession: progression.daysSincePreviousSession,
        planStrengthRate: progression.planStrengthRate,
      },
    );
    expect(
      seedOut.trace.some((s) => s.rule === "progression" && s.status === "stepped"),
    ).toBe(true);
    const stored = decision(
      seedIn as unknown as Record<string, unknown>,
      seedOut as unknown as Record<string, unknown>,
      "seed",
    );
    expect(replayDecisions([stored], V20_PARAMS).changed).toBe(0);
    const planSource: EngineParams = {
      ...V20_PARAMS,
      progression: { ...V20_PARAMS.progression!, rate_source: "plan" },
    };
    const flipped = replayDecisions([stored], planSource);
    expect(flipped.changed).toBe(1);
  });

  it("replays a bodyweight seed with the stored bodyweight (R10)", () => {
    // R10: stored seed inputs carry `bodyweight`; the replay used to drop it,
    // so under the live bodyweight model every bodyweight-lift seed replayed
    // as the deferred null-weight prescription and diffed spuriously.
    const anchor = { value: 220, confidence: "high" as const };
    const seedIn = buildSeedInputs({
      equipmentType: "bodyweight",
      loadType: "bodyweight_loadable",
      profile: { experience_level: "intermediate" },
      goal: "hypertrophy",
      startRir: 3,
      isDeload: false,
      initial: null,
      priorPeak: null,
      strengthAnchor: anchor,
      bodyweight: 180,
    });
    const seedOut = seedMeso(
      null,
      null,
      { equipmentType: "bodyweight", loadType: "bodyweight_loadable" },
      { experienceLevel: "intermediate" },
      3,
      V16_PARAMS,
      { goalType: "hypertrophy", anchor, bodyweight: 180 },
    );
    // sanity: with the bodyweight present the seed prices a real load —
    // if this were the deferred null-weight seed the test would prove nothing
    expect(seedOut.weight).not.toBeNull();

    const stored = decision(
      seedIn as unknown as Record<string, unknown>,
      seedOut as unknown as Record<string, unknown>,
      "seed",
    );
    const outcome = replayDecisions([stored], V16_PARAMS);
    expect(outcome.changed).toBe(0);
    expect(outcome.outcomes.unchanged).toBe(1);
    expect(outcome.errors).toBe(0);
  });

  it("folds the per-exercise increment override into the candidate params (replay fidelity)", () => {
    // cold start (no previous/anchor) so the weight is just the plan default
    // rounded to the loadable step — which is exactly what the override changes.
    const coldStart = {
      ...sampleInputs(),
      previous: null,
      actualSets: [],
      strengthAnchor: null,
      initial: { weight: 184, reps: 8, sets: 3 },
    };
    // a stored output that always differs, so fields.weight.to is the replayed load
    const out = { weight: 999, reps: 8, sets: 3, targetRir: 2 };

    // no override → stock barbell step 5: 184 → 185
    const stock = replayDecisions(
      [decision(coldStart, out)],
      DEFAULT_ENGINE_PARAMS as EngineParams,
    );
    expect(stock.diffs[0].fields.weight!.to).toBe(185);

    // custom 3 lb loadable step → 184 → 183 (rounds to the custom step, not 5)
    const overridden = replayDecisions(
      [decision(coldStart, out, "advance", 3)],
      DEFAULT_ENGINE_PARAMS as EngineParams,
    );
    expect(overridden.diffs[0].fields.weight!.to).toBe(183);
  });
});

// --- registration + admin gating -------------------------------------------

const ALL_ADMIN_TOOLS = [
  GET_ENGINE_PARAMS,
  PROPOSE_ENGINE_PARAMS,
  ACTIVATE_ENGINE_PARAMS,
  GET_ENGINE_DECISIONS,
  GET_PROGRESSION_HISTORY,
  REPLAY_DECISIONS,
  SIMULATE_PRESCRIPTIONS,
  DISCARD_ENGINE_PARAMS,
  // N58 follow-up: the LLM-explanation test loop + forced recompute
  GET_LLM_EXPLANATION_STATUS,
  TEST_LLM_EXPLANATION,
  GENERATE_EXPLANATIONS,
  RECOMPUTE_PRESCRIPTIONS,
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

// --- R25 consolidation: list_engine_params folded into get_engine_params ----

describe("get_engine_params consolidation (R25)", () => {
  it("list_engine_params is retired; get_engine_params stands alone", () => {
    const { server, tools } = captureServer();
    registerAdminTools(server);
    expect(tools.has("list_engine_params")).toBe(false);
    expect(tools.has(GET_ENGINE_PARAMS)).toBe(true);
  });

  it("the visibility roster no longer lists the retired tool", async () => {
    const { ADMIN_TOOL_NAMES } = await import("../tools/admin");
    expect(ADMIN_TOOL_NAMES.has("list_engine_params")).toBe(false);
    expect(ADMIN_TOOL_NAMES.has(GET_ENGINE_PARAMS)).toBe(true);
  });
});

// --- N58 follow-up: LLM/recompute admin tools --------------------------------

describe("llm admin tools (N58 follow-up)", () => {
  it("the visibility roster hides them from non-admins (PH33)", async () => {
    const { ADMIN_TOOL_NAMES } = await import("../tools/admin");
    for (const name of [
      GET_LLM_EXPLANATION_STATUS,
      TEST_LLM_EXPLANATION,
      GENERATE_EXPLANATIONS,
      RECOMPUTE_PRESCRIPTIONS,
    ]) {
      expect(ADMIN_TOOL_NAMES.has(name), name).toBe(true);
    }
  });

  it("recompute scope validation: unscoped calls are refused (all=true is the explicit opt-in)", () => {
    expect(validateRecomputeScope({})).toMatch(/scope/i);
    expect(validateRecomputeScope({ all: true })).toBeNull();
    expect(validateRecomputeScope({ exercise_id: "e1" })).toBeNull();
    expect(validateRecomputeScope({ week: 2, day: 1 })).toBeNull();
  });

  it("recompute scope validation: all=true cannot combine with a narrower scope", () => {
    expect(validateRecomputeScope({ all: true, week: 2 })).toMatch(
      /cannot be combined/i,
    );
    expect(validateRecomputeScope({ all: true, exercise_id: "e1" })).toMatch(
      /cannot be combined/i,
    );
  });
});

// --- N61: editable coaching-prompt tools -------------------------------------

describe("coaching-prompt admin tools (N61)", () => {
  it("the visibility roster hides them from non-admins (PH33)", async () => {
    const { ADMIN_TOOL_NAMES } = await import("../tools/admin");
    const { COACHING_PROMPT_TOOL_NAMES } = await import("../tools/admin-prompt");
    expect(COACHING_PROMPT_TOOL_NAMES.length).toBe(4);
    for (const name of COACHING_PROMPT_TOOL_NAMES) {
      expect(ADMIN_TOOL_NAMES.has(name), name).toBe(true);
    }
  });
});
