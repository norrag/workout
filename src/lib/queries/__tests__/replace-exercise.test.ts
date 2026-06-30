/**
 * replaceWorkoutExercise (fig 1.2 swap menu). The defect (PH38): swapping a
 * movement carried the outgoing exercise's per-set weight overrides
 * (`set_weights`) onto the incoming one, so the first set rendered the old
 * planned weight (and reps predicted off it) until the user hit "reset to
 * prescription". The fix clears `set_weights` as part of the swap. The Supabase
 * query chain is faked so we can assert the persisted update payload.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { replaceWorkoutExercise } from "../logging";

type Resp = { data?: unknown; count?: number; error?: unknown };

/** Capture the update payload pushed to `workout_exercises`. */
function fakeClient(opts: {
  loggedCount: number;
  pr: Resp;
  capture: (payload: Record<string, unknown>) => void;
}): SupabaseClient<Database> {
  function makeBuilder(table: string) {
    const ctx = { count: false };
    const builder: Record<string, unknown> = {
      select(_cols?: string, o?: { count?: string; head?: boolean }) {
        if (o?.count) ctx.count = true;
        return builder;
      },
      update(payload: Record<string, unknown>) {
        opts.capture(payload);
        return builder;
      },
      eq() {
        // terminal for the count head-select and for the update's `.eq("id", …)`
        if (table === "logged_sets" && ctx.count) {
          return Promise.resolve({ count: opts.loggedCount, error: null });
        }
        if (table === "workout_exercises") {
          return Promise.resolve({ error: null });
        }
        return builder;
      },
      maybeSingle() {
        return Promise.resolve(opts.pr);
      },
    };
    return builder;
  }
  return {
    from: (table: string) => makeBuilder(table),
  } as unknown as SupabaseClient<Database>;
}

describe("replaceWorkoutExercise (PH38)", () => {
  it("clears stale set_weights so the incoming exercise starts from its own seed", async () => {
    let payload: Record<string, unknown> = {};
    const client = fakeClient({
      loggedCount: 0,
      pr: { data: { best_weight: 185, best_reps: 8 }, error: null },
      capture: (p) => {
        payload = p;
      },
    });

    const out = await replaceWorkoutExercise(client, "u1", "we1", "newEx");

    expect(out.error).toBeNull();
    expect(payload.set_weights).toEqual({});
    expect(payload.exercise_id).toBe("newEx");
    expect(payload.prescribed_weight).toBe(185);
    expect(payload.prescribed_reps).toBe(8);
  });

  it("clears set_weights even when the incoming exercise has no history", async () => {
    let payload: Record<string, unknown> = {};
    const client = fakeClient({
      loggedCount: 0,
      pr: { data: null, error: null },
      capture: (p) => {
        payload = p;
      },
    });

    const out = await replaceWorkoutExercise(client, "u1", "we1", "freshEx");

    expect(out.error).toBeNull();
    expect(payload.set_weights).toEqual({});
    expect(payload.prescribed_weight).toBeNull();
    expect(payload.prescribed_reps).toBeNull();
  });

  it("refuses the swap (and writes nothing) once sets are logged on the slot", async () => {
    let captured = false;
    const client = fakeClient({
      loggedCount: 3,
      pr: { data: null, error: null },
      capture: () => {
        captured = true;
      },
    });

    const out = await replaceWorkoutExercise(client, "u1", "we1", "newEx");

    expect(out.error).toMatch(/logged/i);
    expect(captured).toBe(false);
  });
});
