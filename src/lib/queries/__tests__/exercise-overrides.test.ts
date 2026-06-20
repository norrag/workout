import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import {
  getExerciseParamOverrides,
  getExerciseIncrementOverride,
} from "../exercise-overrides";

/** A chainable select stub that resolves to `rows`, recording the calls made. */
function selectClient(rows: { exercise_id: string; weight_increment: number }[]) {
  const calls = { in: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (...a: unknown[]) => {
    calls.eq(...a);
    return builder;
  };
  builder.in = (...a: unknown[]) => {
    calls.in(...a);
    return builder;
  };
  builder.maybeSingle = () => {
    calls.maybeSingle();
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  };
  // awaiting the builder (no maybeSingle) resolves the list
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: rows, error: null });
  const client = { from: vi.fn(() => builder) } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

describe("getExerciseParamOverrides (doc 14 phase 3)", () => {
  it("keys overrides by exercise id with the increment value", async () => {
    const { client } = selectClient([
      { exercise_id: "e1", weight_increment: 10 },
      { exercise_id: "e2", weight_increment: 2.5 },
    ]);
    const map = await getExerciseParamOverrides(client, "u1", ["e1", "e2"]);
    expect(map.get("e1")).toEqual({ weightIncrement: 10 });
    expect(map.get("e2")).toEqual({ weightIncrement: 2.5 });
    expect(map.has("e3")).toBe(false);
  });

  it("short-circuits to an empty map for an empty exercise list (no query)", async () => {
    const { client } = selectClient([{ exercise_id: "e1", weight_increment: 10 }]);
    const map = await getExerciseParamOverrides(client, "u1", []);
    expect(map.size).toBe(0);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("getExerciseIncrementOverride returns the value or null", async () => {
    const present = selectClient([{ exercise_id: "e1", weight_increment: 15 }]);
    expect(await getExerciseIncrementOverride(present.client, "u1", "e1")).toBe(15);

    const absent = selectClient([]);
    expect(await getExerciseIncrementOverride(absent.client, "u1", "e9")).toBeNull();
  });
});
