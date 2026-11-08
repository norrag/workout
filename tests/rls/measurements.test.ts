import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
// These tests exercise deletes and deliberately malformed writes: local stack only.
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Measurement RLS tests require local Supabase.");
const anonKey =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
function client() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
const anonymous = client();
let alice: SupabaseClient, bob: SupabaseClient, aliceId: string, bobId: string;
const ids: string[] = [];
const args = (id = crypto.randomUUID(), date = "2026-01-01") => ({
  p_id: id,
  p_measured_on: date,
  p_input_unit: "in",
  p_note: "synthetic test",
  p_readings: [
    { site_key: "chest", value_in: 40 },
    { site_key: "waist_navel", value_in: 34 },
  ],
});
async function seed(date: string) {
  const a = args(crypto.randomUUID(), date);
  ids.push(a.p_id);
  const { error } = await alice.rpc("save_measurement_session", a);
  expect(error).toBeNull();
  return a;
}
beforeAll(async () => {
  alice = client();
  bob = client();
  for (const [i, c] of [alice, bob].entries()) {
    const { error } = await c.auth.signUp({
      email: `tape-${Date.now()}-${i}@rls.test`,
      password: "test-password-123",
    });
    if (error) throw error;
  }
  aliceId = (await alice.auth.getUser()).data.user!.id;
  bobId = (await bob.auth.getUser()).data.user!.id;
});
afterAll(async () => {
  if (aliceId)
    await alice.from("measurement_sessions").delete().eq("user_id", aliceId);
});

describe("measurement ownership and atomicity", () => {
  it("stock sites are authenticated read-only; anonymous cannot read or call the RPC", async () => {
    expect(
      (await alice.from("measurement_sites").select("*")).data,
    ).toHaveLength(12);
    expect(
      (
        await alice
          .from("measurement_sites")
          .insert({ key: "forged", display_order: 99 })
      ).error,
    ).not.toBeNull();
    expect(
      (await anonymous.from("measurement_sites").select("*")).data ?? [],
    ).toHaveLength(0);
    expect(
      (await anonymous.rpc("save_measurement_session", args())).error,
    ).not.toBeNull();
  });
  it("owner can save, read, correct and retry a session without duplicates", async () => {
    const a = await seed("2026-01-01");
    const corrected = {
      ...a,
      p_note: "corrected",
      p_readings: [{ site_key: "chest", value_in: 41 }],
    };
    expect(
      (await alice.rpc("save_measurement_session", corrected)).error,
    ).toBeNull();
    expect(
      (await alice.rpc("save_measurement_session", corrected)).error,
    ).toBeNull();
    expect(
      (await alice.from("measurements").select("*").eq("session_id", a.p_id))
        .data,
    ).toMatchObject([{ value_in: 41 }]);
    expect(
      (await alice.from("measurement_sessions").select("*").eq("id", a.p_id))
        .data,
    ).toHaveLength(1);
  });
  it("another user cannot read, update, delete or replace either layer", async () => {
    const a = await seed("2026-02-01");
    for (const table of ["measurement_sessions", "measurements"]) {
      const key = table === "measurements" ? "session_id" : "id";
      expect((await bob.from(table).select("*").eq(key, a.p_id)).data).toEqual(
        [],
      );
      expect(
        (await bob.from(table).delete().eq(key, a.p_id).select()).data,
      ).toEqual([]);
    }
    expect(
      (
        await bob
          .from("measurement_sessions")
          .update({ note: "forged" })
          .eq("id", a.p_id)
          .select()
      ).data,
    ).toEqual([]);
    expect(
      (
        await bob
          .from("measurements")
          .update({ value_in: 1 })
          .eq("session_id", a.p_id)
          .select()
      ).data,
    ).toEqual([]);
    expect(
      (await bob.rpc("save_measurement_session", { ...a, p_note: "forged" }))
        .error,
    ).not.toBeNull();
    expect(
      (
        await alice
          .from("measurement_sessions")
          .select("note")
          .eq("id", a.p_id)
          .single()
      ).data?.note,
    ).toBe("synthetic test");
  });
  it("cannot forge a parent attachment or reassign ownership", async () => {
    const a = await seed("2026-03-01");
    expect(
      (
        await bob
          .from("measurements")
          .insert({
            session_id: a.p_id,
            user_id: bobId,
            site_key: "hips",
            value_in: 40,
          })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await alice
          .from("measurement_sessions")
          .update({ user_id: bobId })
          .eq("id", a.p_id)
      ).error,
    ).not.toBeNull();
    expect(
      (
        await alice
          .from("measurements")
          .update({ user_id: bobId })
          .eq("session_id", a.p_id)
      ).error,
    ).not.toBeNull();
    expect(
      (
        await bob
          .from("measurement_sessions")
          .insert({
            user_id: aliceId,
            measured_on: "2026-03-02",
            input_unit: "in",
          })
      ).error,
    ).not.toBeNull();
  });
  it("invalid readings roll back both replacement values and the header", async () => {
    const a = await seed("2026-04-01");
    for (const p_readings of [
      [{ site_key: "chest", value_in: 0 }],
      [{ site_key: "unknown", value_in: 40 }],
      [a.p_readings[0], a.p_readings[0]],
      [],
      null,
    ]) {
      expect(
        (
          await alice.rpc("save_measurement_session", {
            ...a,
            p_note: "must roll back",
            p_readings,
          })
        ).error,
      ).not.toBeNull();
      expect(
        (
          await alice
            .from("measurement_sessions")
            .select("note")
            .eq("id", a.p_id)
            .single()
        ).data?.note,
      ).toBe(a.p_note);
      expect(
        (await alice.from("measurements").select("*").eq("session_id", a.p_id))
          .data,
      ).toHaveLength(2);
    }
  });
  it("duplicate dates and invalid new sessions cannot leave partial rows", async () => {
    await seed("2026-05-01");
    const duplicate = args(crypto.randomUUID(), "2026-05-01");
    expect(
      (await alice.rpc("save_measurement_session", duplicate)).error?.code,
    ).toBe("23505");
    const invalid = {
      ...args(crypto.randomUUID(), "2026-05-02"),
      p_readings: [{ site_key: "chest", value_in: -2 }],
    };
    expect(
      (await alice.rpc("save_measurement_session", invalid)).error,
    ).not.toBeNull();
    expect(
      (
        await alice
          .from("measurement_sessions")
          .select("id")
          .eq("id", invalid.p_id)
      ).data,
    ).toEqual([]);
  });
  it("owner deletion cascades to readings", async () => {
    const a = await seed("2026-06-01");
    expect(
      (await alice.from("measurement_sessions").delete().eq("id", a.p_id))
        .error,
    ).toBeNull();
    expect(
      (await alice.from("measurements").select("*").eq("session_id", a.p_id))
        .data,
    ).toEqual([]);
  });
});
