import { describe, it, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { TapeSession } from "@/lib/measure/tape";
import { saveTapeSession, getTapeSessions } from "@/lib/queries/measure/tape";
import { mutateTapeSession } from "@/lib/queries/measure/mutate";
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
    email: `tape-mutate-${crypto.randomUUID()}@integration.test`,
    password: "test-password-123",
  });
  if (error) throw error;
  return c;
}
const session = (date = "2026-01-01"): TapeSession => ({
  id: crypto.randomUUID(),
  measured_on: date,
  input_unit: "in",
  note: "Original",
  readings: [
    { site_key: "chest", value_in: 40 },
    { site_key: "waist_navel", value_in: 32 },
  ],
});
const snapshot = ({
  measured_on,
  input_unit,
  note,
  readings,
}: TapeSession) => ({ measured_on, input_unit, note, readings });
async function rows(c: SupabaseClient<Database>) {
  return getTapeSessions(c, (await c.auth.getUser()).data.user!.id);
}
describe("measurement correction and deletion with snapshot concurrency", () => {
  it("previews without writing, replaces the full set, and repeats an update safely", async () => {
    const c = await user();
    const old = session();
    await saveTapeSession(c, old);
    const next: TapeSession = {
      ...old,
      measured_on: "2025-12-01",
      input_unit: "cm",
      note: "Corrected",
      readings: [{ site_key: "chest", value_in: 41 }],
    };
    const input = {
      id: old.id,
      expected: old,
      replacement: next,
      commit: false,
      delete: false,
      confirmDelete: false,
    };
    const preview = await mutateTapeSession(c, input);
    expect(preview).toMatchObject({
      status: "would_update",
      committed: false,
      current: old,
      proposed: next,
    });
    expect(await rows(c)).toEqual([old]);
    const result = await mutateTapeSession(c, { ...input, commit: true });
    expect(result.status).toBe("updated");
    expect(await rows(c)).toEqual([next]);
    expect(
      (await mutateTapeSession(c, { ...input, commit: true })).status,
    ).toBe("unchanged");
    expect(await rows(c)).toEqual([next]);
  });
  it("refuses stale edits and stale deletes after an app correction", async () => {
    const c = await user();
    const old = session();
    await saveTapeSession(c, old);
    const app = { ...old, note: "Newer app edit" };
    await saveTapeSession(c, app);
    await expect(
      mutateTapeSession(c, {
        id: old.id,
        expected: old,
        replacement: { ...old, note: "Stale overwrite" },
        commit: true,
        delete: false,
        confirmDelete: false,
      }),
    ).rejects.toMatchObject({ code: "40001" });
    await expect(
      mutateTapeSession(c, {
        id: old.id,
        expected: old,
        commit: true,
        delete: true,
        confirmDelete: true,
      }),
    ).rejects.toMatchObject({ code: "40001" });
    expect(await rows(c)).toEqual([app]);
  });
  it("requires explicit delete confirmation, previews, then deletes only the chosen session", async () => {
    const c = await user();
    const old = session(),
      other = session("2026-02-01");
    await saveTapeSession(c, old);
    await saveTapeSession(c, other);
    const input = {
      id: old.id,
      expected: old,
      commit: false,
      delete: true,
      confirmDelete: false,
    };
    expect((await mutateTapeSession(c, input)).status).toBe("would_delete");
    expect(await rows(c)).toHaveLength(2);
    await expect(
      mutateTapeSession(c, { ...input, commit: true }),
    ).rejects.toMatchObject({ code: "22023" });
    expect(
      (
        await mutateTapeSession(c, {
          ...input,
          commit: true,
          confirmDelete: true,
        })
      ).status,
    ).toBe("deleted");
    expect(await rows(c)).toEqual([other]);
    expect(
      (await c.from("measurements").select().eq("session_id", old.id)).data,
    ).toHaveLength(0);
    await expect(
      mutateTapeSession(c, { ...input, commit: true, confirmDelete: true }),
    ).rejects.toMatchObject({ code: "P0002" });
  });
  it("rejects occupied destination dates and rolls back all changes", async () => {
    const c = await user();
    const old = session(),
      other = session("2026-02-01");
    await saveTapeSession(c, old);
    await saveTapeSession(c, other);
    for (const commit of [false, true])
      await expect(
        mutateTapeSession(c, {
          id: old.id,
          expected: old,
          replacement: {
            ...old,
            measured_on: other.measured_on,
            note: "Must not save",
          },
          commit,
          delete: false,
          confirmDelete: false,
        }),
      ).rejects.toMatchObject({ code: "23505" });
    expect(await rows(c)).toEqual([other, old]);
  });
  it("serializes competing corrections: one wins, the other must re-read", async () => {
    const c = await user();
    const old = session();
    await saveTapeSession(c, old);
    const results = await Promise.allSettled(
      ["A", "B"].map((note) =>
        mutateTapeSession(c, {
          id: old.id,
          expected: old,
          replacement: { ...old, note },
          commit: true,
          delete: false,
          confirmDelete: false,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const stored = await rows(c);
    expect(stored).toHaveLength(1);
    expect(["A", "B"]).toContain(stored[0].note);
  });
  it("cannot mutate another owner or a missing ID, rejects forged snapshot IDs and anonymous calls", async () => {
    const a = await user(),
      b = await user();
    const old = session();
    await saveTapeSession(a, old);
    const input = {
      id: old.id,
      expected: old,
      replacement: { ...old, note: "Other owner" },
      commit: true,
      delete: false,
      confirmDelete: false,
    };
    await expect(mutateTapeSession(b, input)).rejects.toMatchObject({
      code: "P0002",
    });
    await expect(
      mutateTapeSession(b, {
        ...input,
        delete: true,
        replacement: undefined,
        confirmDelete: true,
      }),
    ).rejects.toMatchObject({ code: "P0002" });
    await expect(
      mutateTapeSession(a, {
        ...input,
        expected: { ...old, id: crypto.randomUUID() },
      }),
    ).rejects.toThrow(/snapshot/);
    await expect(mutateTapeSession(client(), input)).rejects.toBeDefined();
    expect(await rows(a)).toEqual([old]);
    expect(await rows(b)).toEqual([]);
  });
  it("strictly validates direct RPC flags and snapshots without partial writes", async () => {
    const c = await user();
    const old = session();
    await saveTapeSession(c, old);
    const base = {
      p_id: old.id,
      p_expected: snapshot(old),
      p_replacement: { ...snapshot(old), note: "Changed" },
      p_commit: true,
    };
    const bads: Record<string, unknown>[] = [
      { p_commit: null },
      { p_delete: null },
      { p_confirm_delete: null },
      { p_id: null },
      { p_expected: null },
      { p_replacement: null },
      { p_delete: true },
      { p_confirm_delete: true },
      { p_expected: { ...snapshot(old), user_id: crypto.randomUUID() } },
      { p_replacement: { ...snapshot(old), measured_on: "2099-01-01" } },
      { p_replacement: { ...snapshot(old), note: null } },
      { p_replacement: { ...snapshot(old), input_unit: "lb" } },
      { p_replacement: { ...snapshot(old), readings: [] } },
      {
        p_replacement: {
          ...snapshot(old),
          readings: [{ site_key: "chest", value_in: 151 }],
        },
      },
      {
        p_replacement: {
          ...snapshot(old),
          readings: [{ site_key: "chest", value_in: 0.000001 }],
        },
      },
      {
        p_replacement: {
          ...snapshot(old),
          readings: [{ site_key: "chest", value_in: "40" }],
        },
      },
      {
        p_replacement: {
          ...snapshot(old),
          readings: [
            { site_key: "chest", value_in: 40 },
            { site_key: "chest", value_in: 41 },
          ],
        },
      },
    ];
    for (const bad of bads) {
      const result = await c.rpc("mutate_measurement_session", {
        ...base,
        ...bad,
      } as never);
      expect(result.error, JSON.stringify(bad)).not.toBeNull();
      expect(await rows(c)).toEqual([old]);
    }
  });
});
