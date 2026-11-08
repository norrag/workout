import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { saveTapeSession } from "@/lib/queries/measure/tape";
import {
  GET_BODY_MEASUREMENTS,
  registerMeasurementTools,
  type formatBodyMeasurements,
} from "@/lib/mcp/tools/measurements";
import {
  captureServer,
  fakeAuthInfo,
  fakeExtra,
} from "@/lib/mcp/__tests__/harness";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Measurement connector tests require local Supabase.");
type Client = SupabaseClient<Database>;
let alice: Client, bob: Client;
async function user(label: string) {
  const client = createClient<Database>(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signUp({
    email: `${label}-${crypto.randomUUID()}@integration.test`,
    password: "test-password-123",
  });
  if (error) throw error;
  return client;
}
async function call(client: Client, args = {}) {
  const { data } = await client.auth.getSession();
  const capture = captureServer();
  registerMeasurementTools(capture.server);
  const result = (await capture.tools
    .get(GET_BODY_MEASUREMENTS)!
    .handler(
      args,
      fakeExtra(
        fakeAuthInfo(data.session!.user.id, data.session!.access_token),
      ),
    )) as {
    structuredContent: {
      units: string;
      data: ReturnType<typeof formatBodyMeasurements>;
    };
  };
  return result.structuredContent;
}
beforeAll(async () => {
  alice = await user("tape-mcp-alice");
  bob = await user("tape-mcp-bob");
  for (const [index, date] of [
    "2026-01-01",
    "2026-02-01",
    "2026-03-01",
  ].entries())
    await saveTapeSession(alice, {
      id: crypto.randomUUID(),
      measured_on: date,
      input_unit: "in",
      note: "synthetic connector test",
      readings: [{ site_key: "chest", value_in: 40 + index }],
    });
  await saveTapeSession(bob, {
    id: crypto.randomUUID(),
    measured_on: "2026-03-01",
    input_unit: "in",
    note: "separate synthetic account",
    readings: [{ site_key: "chest", value_in: 50 }],
  });
});
describe("measurement MCP with token-bound RLS", () => {
  it("returns only the authenticated owner's measurements and same-site deltas", async () => {
    const result = await call(alice);
    expect(result.units).toBe("in");
    expect(result.data.session_count).toBe(3);
    expect(result.data.sessions[0].readings[0]).toMatchObject({
      value: 42,
      delta: 1,
      previous_date: "2026-02-01",
      days_between: 28,
    });
    const other = await call(bob);
    expect(other.data.session_count).toBe(1);
    expect(other.data.sessions[0].readings[0]).toMatchObject({
      value: 50,
      delta: null,
      previous_date: null,
    });
    await expect(
      call(bob, { user_id: (await alice.auth.getUser()).data.user!.id }),
    ).rejects.toThrow();
  });
  it("pages by exclusive date and never invents a baseline outside the page", async () => {
    const first = await call(alice, { limit: 1, unit: "cm" });
    expect(first.units).toBe("cm");
    expect(first.data).toMatchObject({
      session_count: 1,
      has_more: true,
      next_before: "2026-03-01",
    });
    expect(first.data.sessions[0].readings[0]).toMatchObject({
      value: 106.68,
      delta: null,
    });
    const next = await call(alice, {
      limit: 2,
      before: first.data.next_before,
    });
    expect(next.data).toMatchObject({
      session_count: 2,
      has_more: false,
      next_before: null,
    });
    expect(next.data.sessions.map((s) => s.date)).toEqual([
      "2026-02-01",
      "2026-01-01",
    ]);
    expect(next.data.sessions[0].readings[0].delta).toBe(1);
  });
  it("keeps an empty window empty", async () => {
    expect((await call(alice, { before: "2025-01-01" })).data).toMatchObject({
      session_count: 0,
      sessions: [],
      has_more: false,
    });
  });
});
