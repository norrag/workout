import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Local database only");
const client = () =>
  createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
async function user() {
  const c = client();
  const { error } = await c.auth.signUp({
    email: `tape-import-${crypto.randomUUID()}@integration.test`,
    password: "test-password-123",
  });
  if (error) throw error;
  return c;
}
const session = (date: string, value = 40) => ({
  measured_on: date,
  input_unit: "in",
  note: "",
  readings: [{ site_key: "chest", value_in: value }],
});
describe("atomic append-only measurement import RPC", () => {
  it("previews, inserts, repeats safely, and never replaces an existing date", async () => {
    const c = await user();
    const batch = [session("2026-01-01"), session("2026-02-01")];
    expect(
      (await c.rpc("import_measurement_sessions", { p_sessions: batch })).error,
    ).toBeNull();
    expect((await c.from("measurement_sessions").select()).data).toHaveLength(
      0,
    );
    const first = await c.rpc("import_measurement_sessions", {
      p_sessions: batch,
      p_commit: true,
    });
    expect(first.error).toBeNull();
    expect(
      (first.data as { sessions: { status: string }[] }).sessions.map(
        (s) => s.status,
      ),
    ).toEqual(["inserted", "inserted"]);
    const retry = await c.rpc("import_measurement_sessions", {
      p_sessions: batch,
      p_commit: true,
    });
    expect(
      (retry.data as { sessions: { status: string }[] }).sessions.map(
        (s) => s.status,
      ),
    ).toEqual(["unchanged", "unchanged"]);
    const conflict = await c.rpc("import_measurement_sessions", {
      p_sessions: [session("2025-01-01"), session("2026-01-01", 42)],
      p_commit: true,
    });
    expect(conflict.error?.code).toBe("23505");
    expect((await c.from("measurement_sessions").select()).data).toHaveLength(
      2,
    );
    expect(
      (await c.from("measurements").select()).data?.map((r) => r.value_in),
    ).toEqual([40, 40]);
  });
  it("rejects malformed batches atomically including direct RPC bypasses", async () => {
    const c = await user();
    for (const bad of [
      { ...session("2026-02-01"), user_id: crypto.randomUUID() },
      { ...session("2026-02-01"), input_unit: null },
      {
        ...session("2026-02-01"),
        readings: [{ site_key: "fake", value_in: 1 }],
      },
      {
        ...session("2026-02-01"),
        readings: [{ site_key: "chest", value_in: 0 }],
      },
      {
        ...session("2026-02-01"),
        readings: [{ site_key: "chest", value_in: 200 }],
      },
      {
        ...session("2026-02-01"),
        readings: [
          { site_key: "chest", value_in: 40 },
          { site_key: "chest", value_in: 40 },
        ],
      },
      session("2099-01-01"),
    ]) {
      expect(
        (
          await c.rpc("import_measurement_sessions", {
            p_sessions: [session("2026-01-01"), bad],
            p_commit: true,
          })
        ).error,
      ).not.toBeNull();
      expect((await c.from("measurement_sessions").select()).data).toHaveLength(
        0,
      );
    }
  });
  it("isolates owners, denies anonymous execution, and serializes identical concurrent retries", async () => {
    const a = await user(),
      b = await user();
    const payload = { p_sessions: [session("2026-01-01")], p_commit: true };
    const results = await Promise.all([
      a.rpc("import_measurement_sessions", payload),
      a.rpc("import_measurement_sessions", payload),
    ]);
    expect(results.every((r) => !r.error)).toBe(true);
    expect((await a.from("measurement_sessions").select()).data).toHaveLength(
      1,
    );
    expect((await b.from("measurement_sessions").select()).data).toHaveLength(
      0,
    );
    expect(
      (await b.rpc("import_measurement_sessions", payload)).error,
    ).toBeNull();
    expect(
      (await client().rpc("import_measurement_sessions", payload)).error,
    ).not.toBeNull();
  });
});
