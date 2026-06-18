/**
 * Deletion-impact guards for the MCP undo tools (review §5.8). These decide
 * whether a create can be safely undone — the core invariant being that logged
 * history is never destroyed (hard rule #5 / the report's editor note). The
 * Supabase query chain is faked so the guard logic is tested in isolation.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { getMacroDeletionImpact } from "../macro";
import { getExerciseDeletionImpact } from "../exercises";
import { getParamsDeletionImpact } from "../engine-admin";

type Resp = { data?: unknown; count?: number; error?: unknown };
type Handler = (table: string, ctx: { single: boolean; count: boolean }) => Resp;

/** A minimal thenable query builder: resolves via the per-table handler. */
function fakeClient(handler: Handler): SupabaseClient<Database> {
  function makeBuilder(table: string) {
    const ctx = { single: false, count: false };
    const builder: Record<string, unknown> = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.count) ctx.count = true;
        return builder;
      },
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      maybeSingle() {
        ctx.single = true;
        return Promise.resolve(handler(table, ctx));
      },
      then(resolve: (v: unknown) => unknown) {
        return Promise.resolve(handler(table, ctx)).then(resolve);
      },
    };
    return builder;
  }
  return { from: (table: string) => makeBuilder(table) } as unknown as SupabaseClient<Database>;
}

describe("getMacroDeletionImpact (§5.8)", () => {
  it("reports not-found when the macro isn't visible", async () => {
    const client = fakeClient((t) => (t === "macrocycles" ? { data: null } : {}));
    const out = await getMacroDeletionImpact(client, "u1", "M1");
    expect(out.found).toBe(false);
  });

  it("is deletable for an unstarted macro (no logs, no active/completed mesos)", async () => {
    const client = fakeClient((t, ctx) => {
      if (t === "macrocycles") return { data: { id: "M1" } };
      if (t === "mesocycles")
        return { data: [{ id: "m1", name: "Mesocycle 1", status: "unplanned" }] };
      if (t === "logged_sets" && ctx.count) return { count: 0 };
      return {};
    });
    const out = await getMacroDeletionImpact(client, "u1", "M1");
    expect(out).toMatchObject({ found: true, hasHistory: false, mesoCount: 1, blockingMesos: [] });
  });

  it("flags logged history (the hard-rule guard)", async () => {
    const client = fakeClient((t, ctx) => {
      if (t === "macrocycles") return { data: { id: "M1" } };
      if (t === "mesocycles") return { data: [{ id: "m1", name: "B1", status: "completed" }] };
      if (t === "logged_sets" && ctx.count) return { count: 42 };
      return {};
    });
    const out = await getMacroDeletionImpact(client, "u1", "M1");
    expect(out.hasHistory).toBe(true);
    expect(out.loggedSets).toBe(42);
  });

  it("lists active/completed mesos as blocking even with no logged sets", async () => {
    const client = fakeClient((t, ctx) => {
      if (t === "macrocycles") return { data: { id: "M1" } };
      if (t === "mesocycles")
        return {
          data: [
            { id: "m1", name: "Live block", status: "active" },
            { id: "m2", name: "Placeholder", status: "unplanned" },
          ],
        };
      if (t === "logged_sets" && ctx.count) return { count: 0 };
      return {};
    });
    const out = await getMacroDeletionImpact(client, "u1", "M1");
    expect(out.hasHistory).toBe(false);
    expect(out.blockingMesos).toEqual([{ id: "m1", name: "Live block", status: "active" }]);
  });
});

describe("getExerciseDeletionImpact (§5.8)", () => {
  it("never deletable for a stock library exercise", async () => {
    const client = fakeClient((t) =>
      t === "exercises" ? { data: { id: "e1", user_id: null } } : {},
    );
    const out = await getExerciseDeletionImpact(client, "u1", "e1");
    expect(out).toMatchObject({ found: true, isCustom: false, deletable: false });
  });

  it("not deletable for a custom exercise with logged sets (no rewriting the past)", async () => {
    const client = fakeClient((t, ctx) => {
      if (t === "exercises") return { data: { id: "e1", user_id: "u1" } };
      if (t === "logged_sets" && ctx.count) return { count: 5 };
      if (ctx.count) return { count: 0 };
      return {};
    });
    const out = await getExerciseDeletionImpact(client, "u1", "e1");
    expect(out).toMatchObject({ isCustom: true, loggedSets: 5, deletable: false });
  });

  it("not deletable while referenced by a planned slot", async () => {
    const client = fakeClient((t, ctx) => {
      if (t === "exercises") return { data: { id: "e1", user_id: "u1" } };
      if (t === "meso_exercises" && ctx.count) return { count: 2 };
      if (ctx.count) return { count: 0 };
      return {};
    });
    const out = await getExerciseDeletionImpact(client, "u1", "e1");
    expect(out).toMatchObject({ plannedRefs: 2, deletable: false });
  });

  it("deletable for a clean, unused custom exercise", async () => {
    const client = fakeClient((t, ctx) => {
      if (t === "exercises") return { data: { id: "e1", user_id: "u1" } };
      if (ctx.count) return { count: 0 };
      return {};
    });
    const out = await getExerciseDeletionImpact(client, "u1", "e1");
    expect(out).toMatchObject({ isCustom: true, deletable: true });
  });
});

describe("getParamsDeletionImpact (§5.8)", () => {
  it("not deletable when the version is active", async () => {
    const client = fakeClient((t) =>
      t === "engine_params" ? { data: { version: 6, is_active: true } } : { count: 0 },
    );
    const out = await getParamsDeletionImpact(client, 6);
    expect(out).toMatchObject({ isActive: true, deletable: false });
  });

  it("not deletable when referenced by recorded decisions (keeps them reproducible)", async () => {
    const client = fakeClient((t) =>
      t === "engine_params" ? { data: { version: 6, is_active: false } } : { count: 25 },
    );
    const out = await getParamsDeletionImpact(client, 6);
    expect(out).toMatchObject({ decisionRefs: 25, deletable: false });
  });

  it("deletable for an unused inactive proposal (the undeletable-v7 case)", async () => {
    const client = fakeClient((t) =>
      t === "engine_params" ? { data: { version: 7, is_active: false } } : { count: 0 },
    );
    const out = await getParamsDeletionImpact(client, 7);
    expect(out).toMatchObject({ found: true, deletable: true });
  });
});
