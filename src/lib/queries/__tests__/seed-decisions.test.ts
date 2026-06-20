import { describe, it, expect } from "vitest";
import type { EngineInputs, Prescription } from "@/lib/engine";
import { buildSeedDecisionRows, type SeededDecision } from "../seed-decisions";

const inputs = { goalType: "hypertrophy" } as unknown as EngineInputs;
const output = {
  weight: 100,
  reps: 8,
  sets: 3,
  targetRir: 3,
  rationale: "seed",
  trace: [],
} as Prescription;

describe("buildSeedDecisionRows (doc 14 §6.2)", () => {
  const rows: SeededDecision[] = [
    { workoutExerciseId: "we1", exerciseId: "e1", inputs, output },
    { workoutExerciseId: "we2", exerciseId: "e2", inputs, output },
  ];
  const coords = { workoutId: "w1", microcycleId: "mc1", mesocycleId: "m1" };

  it("tags every row kind:\"seed\" with a null source and the cycle coordinates", () => {
    const built = buildSeedDecisionRows("u1", rows, coords, 9, "hash", "sha");
    expect(built).toHaveLength(2);
    for (const r of built) {
      expect(r.kind).toBe("seed");
      // a seed is a cold start, never a progression off a week-N row
      expect(r.source_workout_exercise_id).toBeNull();
      expect(r.user_id).toBe("u1");
      expect(r.workout_id).toBe("w1");
      expect(r.microcycle_id).toBe("mc1");
      expect(r.mesocycle_id).toBe("m1");
      expect(r.params_version).toBe(9);
      expect(r.params_hash).toBe("hash");
    }
    expect(built[0].workout_exercise_id).toBe("we1");
    expect(built[1].exercise_id).toBe("e2");
  });

  it("carries the seed provenance (code build + no RIR fallback)", () => {
    const [r] = buildSeedDecisionRows("u1", rows, coords, 9, "hash", "sha-123");
    const prov = r.provenance as Record<string, unknown>;
    expect(prov.code_sha).toBe("sha-123");
    expect((prov.rir_fallback as Record<string, unknown>).applied).toBe(false);
    expect(prov.seed).toBeDefined();
  });

  it("returns [] for no rows", () => {
    expect(buildSeedDecisionRows("u1", [], coords, 9, "hash", "sha")).toEqual([]);
  });
});
