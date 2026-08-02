import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * A tiny table-backed stand-in for the Postgrest client, for query modules
 * whose behavior IS the walk (plan-order's two-way order sync, sharing's
 * copy-on-accept). Rows are plain objects mutated in place, so a test asserts
 * on what the writes actually did rather than on call spies.
 *
 * Supports the subset those modules use: select / eq / in / is / not / order /
 * limit, plus update / insert with `.select().single()` and awaiting the
 * builder directly. Not a Postgrest emulator — keep it honest by only teaching
 * it what a real call site needs.
 */

export type FakeRow = Record<string, unknown>;
export type FakeTables = Record<string, FakeRow[]>;

export function fakeClient(tables: FakeTables): SupabaseClient<Database> {
  let nextId = 1;
  const from = (table: string) => {
    const filters: ((r: FakeRow) => boolean)[] = [];
    const orders: { col: string; asc: boolean }[] = [];
    let mode: "select" | "update" | "insert" = "select";
    let patch: FakeRow = {};
    let payload: FakeRow[] = [];
    let cap: number | null = null;

    const rows = () => (tables[table] ??= []);
    const matches = (r: FakeRow) => filters.every((f) => f(r));
    const sorted = (list: FakeRow[]) =>
      [...list].sort((a, b) => {
        for (const o of orders) {
          const av = a[o.col] as number | string | null;
          const bv = b[o.col] as number | string | null;
          if (av === bv) continue;
          if (av == null) return 1;
          if (bv == null) return -1;
          return (av < bv ? -1 : 1) * (o.asc ? 1 : -1);
        }
        return 0;
      });

    const exec = (): FakeRow[] => {
      if (mode === "update") {
        const hit = rows().filter(matches);
        for (const r of hit) Object.assign(r, patch);
        return hit;
      }
      if (mode === "insert") {
        const created = payload.map((r) => ({ id: `gen-${nextId++}`, ...r }));
        rows().push(...created);
        return created;
      }
      const out = sorted(rows().filter(matches));
      return cap == null ? out : out.slice(0, cap);
    };

    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, value: unknown) => {
        filters.push((r) => r[col] === value);
        return builder;
      },
      in: (col: string, values: unknown[]) => {
        filters.push((r) => values.includes(r[col]));
        return builder;
      },
      is: (col: string, value: unknown) => {
        filters.push((r) => (r[col] ?? null) === value);
        return builder;
      },
      not: (col: string, _op: string, value: unknown) => {
        filters.push((r) => (r[col] ?? null) !== value);
        return builder;
      },
      // only the one form the call sites use: comma-separated
      // "<col>.not.is.null" terms, OR-ed (slot-effort's assigned-only read).
      or: (expr: string) => {
        const cols = expr
          .split(",")
          .map((term) => term.trim())
          .filter((term) => term.endsWith(".not.is.null"))
          .map((term) => term.slice(0, -".not.is.null".length));
        if (cols.length !== expr.split(",").length)
          throw new Error(`fakeClient.or() only understands "<col>.not.is.null": ${expr}`);
        filters.push((r) => cols.some((c) => (r[c] ?? null) !== null));
        return builder;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orders.push({ col, asc: opts?.ascending !== false });
        return builder;
      },
      limit: (n: number) => {
        cap = n;
        return builder;
      },
      update: (p: FakeRow) => {
        mode = "update";
        patch = p;
        return builder;
      },
      insert: (p: FakeRow | FakeRow[]) => {
        mode = "insert";
        payload = Array.isArray(p) ? p : [p];
        return builder;
      },
      maybeSingle: async () => ({ data: exec()[0] ?? null, error: null }),
      single: async () => ({ data: exec()[0] ?? null, error: null }),
      then: (resolve: (v: { data: FakeRow[]; error: null }) => unknown) =>
        resolve({ data: exec(), error: null }),
    };
    return builder;
  };
  return { from } as unknown as SupabaseClient<Database>;
}
