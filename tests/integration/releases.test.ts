/**
 * Release-notification state (doc 23 §10 "Integration"). Requires a running
 * local Supabase stack — CI runs this in the rls-tests job.
 *
 * Covers the two properties that only exist once the query layer meets the
 * real schema: acknowledgment writes and is monotonic, and priming a fresh
 * account stops it from being shown history it has none of.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import {
  getActiveWorkoutStatus,
  getLastSeenVersion,
  setLastSeenVersion,
} from "@/lib/queries/releases";
import { versionGate } from "@/lib/version/gate";
import type { Release } from "@/content/releases/types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Client = SupabaseClient<Database>;

let user: Client;
let userId: string;

const release = (version: string, kind: Release["kind"]): Release => ({
  version,
  date: "2026-08-06",
  kind,
  headline: kind === "fix" ? undefined : `v${version}`,
  entries: [{ id: `${version}-a`, title: "Something", body: "Something." }],
});
const FIXTURE = [release("1.0.0", "major"), release("1.1.0", "feature")];

beforeAll(async () => {
  user = createClient<Database>(URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `releases-${Date.now()}@integration.test`;
  const { error } = await user.auth.signUp({ email, password: "test-password-123" });
  if (error) throw error;
  userId = (await user.auth.getUser()).data.user!.id;
});

describe("last_seen_version", () => {
  it("starts null on a fresh signup, so the gate primes rather than announces", async () => {
    const row = await getLastSeenVersion(user, userId);
    expect(row?.lastSeenVersion).toBeNull();
    expect(versionGate(row!.lastSeenVersion, FIXTURE, "1.1.0")).toEqual({
      kind: "prime",
    });
  });

  it("acknowledgment writes the current version", async () => {
    expect(await setLastSeenVersion(user, userId, "1.1.0")).toBe("1.1.0");
    const row = await getLastSeenVersion(user, userId);
    expect(row?.lastSeenVersion).toBe("1.1.0");
    expect(versionGate("1.1.0", FIXTURE, "1.1.0")).toEqual({ kind: "none" });
  });

  it("is monotonic — a rollback never re-announces (T8)", async () => {
    expect(await setLastSeenVersion(user, userId, "1.0.0")).toBe("1.1.0");
    const row = await getLastSeenVersion(user, userId);
    expect(row?.lastSeenVersion).toBe("1.1.0");
  });

  it("clears every skipped release in one acknowledgment (T4)", async () => {
    const gate = versionGate("1.0.0", FIXTURE, "1.1.0");
    expect(gate.kind).toBe("whats-new");
    await setLastSeenVersion(user, userId, "1.1.0");
    expect(versionGate("1.1.0", FIXTURE, "1.1.0")).toEqual({ kind: "none" });
  });
});

describe("getActiveWorkoutStatus", () => {
  it("is null for an account with no workouts", async () => {
    // §6.4: with nothing active the Workout tab falls back to the meso summary,
    // which is an ordinary landing state and shows the sheet
    expect(await getActiveWorkoutStatus(user, userId)).toBeNull();
  });
});
