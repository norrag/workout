/**
 * N31 — replace one planned slot's exercise in place. The write must keep the
 * fill's row (position/slot/sets) and only change `exercise_id`, refuse a swap
 * that duplicates an exercise already filled in the same group, and no-op
 * cleanly when the "new" exercise is the one already there.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { replaceSlotExercise } from "../cycles";

interface FillRow {
  id: string;
  meso_day_group_id: string | null;
  exercise_id: string;
}

/** Minimal fake for the exact chains replaceSlotExercise uses. Records
 *  updates so assertions can check what was (or wasn't) written. */
function fakeClient(rows: FillRow[], updates: { id: string; exercise_id: string }[]) {
  function builder() {
    const filters: Record<string, unknown> = {};
    let updatePatch: { exercise_id: string } | null = null;
    const b: Record<string, unknown> = {
      select: () => b,
      update(patch: { exercise_id: string }) {
        updatePatch = patch;
        return b;
      },
      eq(col: string, val: unknown) {
        filters[col] = val;
        if (updatePatch) {
          const row = rows.find((r) => r.id === val);
          if (row) {
            row.exercise_id = updatePatch.exercise_id;
            updates.push({ id: row.id, exercise_id: updatePatch.exercise_id });
          }
          return Promise.resolve({ error: null });
        }
        return b;
      },
      maybeSingle() {
        const row = rows.find((r) => r.id === filters.id) ?? null;
        return Promise.resolve({ data: row, error: null });
      },
      then(resolve: (v: unknown) => unknown) {
        const data = rows.filter(
          (r) => r.meso_day_group_id === filters.meso_day_group_id,
        );
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return b;
  }
  return { from: () => builder() } as unknown as SupabaseClient<Database>;
}

describe("replaceSlotExercise (N31)", () => {
  it("updates only the target fill's exercise_id", async () => {
    const rows: FillRow[] = [
      { id: "f1", meso_day_group_id: "g1", exercise_id: "bench" },
      { id: "f2", meso_day_group_id: "g1", exercise_id: "fly" },
    ];
    const updates: { id: string; exercise_id: string }[] = [];
    const out = await replaceSlotExercise(fakeClient(rows, updates), "f1", "incline");
    expect(out.error).toBeNull();
    expect(updates).toEqual([{ id: "f1", exercise_id: "incline" }]);
    expect(rows[1].exercise_id).toBe("fly");
  });

  it("refuses a swap that duplicates a sibling fill's exercise", async () => {
    const rows: FillRow[] = [
      { id: "f1", meso_day_group_id: "g1", exercise_id: "bench" },
      { id: "f2", meso_day_group_id: "g1", exercise_id: "fly" },
    ];
    const updates: { id: string; exercise_id: string }[] = [];
    const out = await replaceSlotExercise(fakeClient(rows, updates), "f1", "fly");
    expect(out.error).toMatch(/already in this muscle group/i);
    expect(updates).toEqual([]);
    expect(rows[0].exercise_id).toBe("bench");
  });

  it("no-ops (no write, no error) when the pick is the current exercise", async () => {
    const rows: FillRow[] = [
      { id: "f1", meso_day_group_id: "g1", exercise_id: "bench" },
    ];
    const updates: { id: string; exercise_id: string }[] = [];
    const out = await replaceSlotExercise(fakeClient(rows, updates), "f1", "bench");
    expect(out.error).toBeNull();
    expect(updates).toEqual([]);
  });

  it("reports a missing slot instead of writing", async () => {
    const updates: { id: string; exercise_id: string }[] = [];
    const out = await replaceSlotExercise(fakeClient([], updates), "nope", "bench");
    expect(out.error).toBe("Slot not found.");
    expect(updates).toEqual([]);
  });

  it("swaps a legacy fill with no group (no sibling check possible)", async () => {
    const rows: FillRow[] = [
      { id: "f1", meso_day_group_id: null, exercise_id: "bench" },
    ];
    const updates: { id: string; exercise_id: string }[] = [];
    const out = await replaceSlotExercise(fakeClient(rows, updates), "f1", "incline");
    expect(out.error).toBeNull();
    expect(updates).toEqual([{ id: "f1", exercise_id: "incline" }]);
  });
});
