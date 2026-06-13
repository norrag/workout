/**
 * RLS policy tests. Require a running local Supabase stack
 * (`supabase start`) with migrations + seed applied. CI runs these in the
 * dedicated rls-tests job; they are excluded from the unit-test run.
 *
 * Proves: cross-user data access is blocked, stock content is readable,
 * logged history cannot be deleted by clients, engine tables are gated.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

function anonClient(): SupabaseClient {
  return createClient(URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signUpUser(email: string): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signUp({
    email,
    password: "test-password-123",
  });
  if (error && !error.message.includes("already registered")) throw error;
  if (error) {
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: "test-password-123",
    });
    if (signInError) throw signInError;
  }
  return client;
}

let alice: SupabaseClient;
let bob: SupabaseClient;
let aliceId: string;
let aliceMacroId: string;

beforeAll(async () => {
  const stamp = Date.now();
  alice = await signUpUser(`alice-${stamp}@rls.test`);
  bob = await signUpUser(`bob-${stamp}@rls.test`);
  aliceId = (await alice.auth.getUser()).data.user!.id;

  const { data, error } = await alice
    .from("macrocycles")
    .insert({
      user_id: aliceId,
      name: "Alice macro",
      goal_type: "gain",
      start_date: "2026-06-01",
    })
    .select()
    .single();
  if (error) throw error;
  aliceMacroId = data.id;
});

describe("profiles", () => {
  it("signup trigger creates a profile readable by its owner", async () => {
    const { data } = await alice
      .from("profiles")
      .select("*")
      .eq("id", aliceId)
      .maybeSingle();
    expect(data).not.toBeNull();
  });

  it("other users cannot read it", async () => {
    const { data } = await bob.from("profiles").select("*").eq("id", aliceId);
    expect(data).toEqual([]);
  });

  it("owners cannot escalate their own role", async () => {
    const { data } = await alice
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", aliceId)
      .select();
    expect(data).toEqual([]);
  });
});

describe("cycles", () => {
  it("bob cannot read alice's macrocycle", async () => {
    const { data } = await bob
      .from("macrocycles")
      .select("*")
      .eq("id", aliceMacroId);
    expect(data).toEqual([]);
  });

  it("bob cannot insert a cycle owned by alice", async () => {
    const { error } = await bob.from("macrocycles").insert({
      user_id: aliceId,
      name: "spoof",
      goal_type: "gain",
      start_date: "2026-06-01",
    });
    expect(error).not.toBeNull();
  });
});

describe("exercises and templates", () => {
  it("stock exercises are readable by any authenticated user", async () => {
    const { data, error } = await bob
      .from("exercises")
      .select("id")
      .is("user_id", null)
      .limit(1);
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
  });

  it("custom exercises are invisible to other users", async () => {
    const { data: created, error } = await alice
      .from("exercises")
      .insert({ user_id: aliceId, name: "Alice special", equipment_type: "other" })
      .select()
      .single();
    expect(error).toBeNull();
    const { data } = await bob
      .from("exercises")
      .select("*")
      .eq("id", created!.id);
    expect(data).toEqual([]);
  });

  it("users cannot create stock content", async () => {
    const { error } = await bob
      .from("exercises")
      .insert({ user_id: null, name: "fake stock", equipment_type: "other" });
    expect(error).not.toBeNull();
  });

  it("stock templates are readable with their days and exercises", async () => {
    const { data, error } = await bob
      .from("templates")
      .select("*, template_days(*, template_exercises(*))")
      .is("user_id", null)
      .limit(1)
      .single();
    expect(error).toBeNull();
    expect(data!.template_days.length).toBeGreaterThan(0);
  });
});

describe("logged history", () => {
  it("clients cannot delete logged_sets (append-only)", async () => {
    // service role sets up a full chain for alice
    const service = createClient(URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: meso } = await service
      .from("mesocycles")
      .insert({
        macrocycle_id: aliceMacroId,
        user_id: aliceId,
        name: "m",
        weeks: 4,
        days_per_week: 2,
      })
      .select()
      .single();
    const { data: micro } = await service
      .from("microcycles")
      .insert({
        mesocycle_id: meso!.id,
        user_id: aliceId,
        week_number: 1,
        target_rir: 3,
      })
      .select()
      .single();
    const { data: workout } = await service
      .from("workouts")
      .insert({ microcycle_id: micro!.id, user_id: aliceId, day_number: 1 })
      .select()
      .single();
    const { data: stock } = await service
      .from("exercises")
      .select("id")
      .is("user_id", null)
      .limit(1)
      .single();
    const { data: we } = await service
      .from("workout_exercises")
      .insert({ workout_id: workout!.id, exercise_id: stock!.id, position: 1 })
      .select()
      .single();

    const { data: set, error: insertError } = await alice
      .from("logged_sets")
      .insert({
        workout_exercise_id: we!.id,
        user_id: aliceId,
        exercise_id: stock!.id,
        macrocycle_id: aliceMacroId,
        mesocycle_id: meso!.id,
        microcycle_id: micro!.id,
        workout_id: workout!.id,
        set_number: 1,
        weight: 100,
        reps: 8,
      })
      .select()
      .single();
    expect(insertError).toBeNull();

    // delete is silently blocked by the absence of a delete policy
    await alice.from("logged_sets").delete().eq("id", set!.id);
    const { data: stillThere } = await alice
      .from("logged_sets")
      .select("id")
      .eq("id", set!.id);
    expect(stillThere).toHaveLength(1);

    // and bob can't read it
    const { data: bobView } = await bob
      .from("logged_sets")
      .select("id")
      .eq("id", set!.id);
    expect(bobView).toEqual([]);
  });
});

describe("design-pivot tables (0002)", () => {
  it("exclusions and pinned notes are owner-only", async () => {
    const { data: stock } = await alice
      .from("exercises")
      .select("id")
      .is("user_id", null)
      .limit(1)
      .single();

    const { data: exclusion, error: exclusionError } = await alice
      .from("excluded_exercises")
      .insert({ user_id: aliceId, exercise_id: stock!.id, reason: "LOW BACK" })
      .select()
      .single();
    expect(exclusionError).toBeNull();
    const { data: bobExclusions } = await bob
      .from("excluded_exercises")
      .select("*")
      .eq("id", exclusion!.id);
    expect(bobExclusions).toEqual([]);

    const { data: note, error: noteError } = await alice
      .from("exercise_notes")
      .insert({ user_id: aliceId, exercise_id: stock!.id, body: "pinned grip note" })
      .select()
      .single();
    expect(noteError).toBeNull();
    const { data: bobNotes } = await bob
      .from("exercise_notes")
      .select("*")
      .eq("id", note!.id);
    expect(bobNotes).toEqual([]);
  });

  it("bob cannot spoof rows into alice's account", async () => {
    const { data: stock } = await bob
      .from("exercises")
      .select("id")
      .is("user_id", null)
      .limit(1)
      .single();
    const { error } = await bob
      .from("excluded_exercises")
      .insert({ user_id: aliceId, exercise_id: stock!.id });
    expect(error).not.toBeNull();
  });

  it("macro slots and groups-first plan rows are gated through their parents", async () => {
    const { data: slot, error: slotError } = await alice
      .from("macro_slots")
      .insert({
        macrocycle_id: aliceMacroId,
        user_id: aliceId,
        slot_number: 1,
        goal_type: "gain",
        label: "Bulk",
      })
      .select()
      .single();
    expect(slotError).toBeNull();
    const { data: bobSlots } = await bob
      .from("macro_slots")
      .select("*")
      .eq("id", slot!.id);
    expect(bobSlots).toEqual([]);

    // standalone meso (no macro) + groups-first day/group chain
    const { data: meso, error: mesoError } = await alice
      .from("mesocycles")
      .insert({ user_id: aliceId, name: "standalone", weeks: 5, days_per_week: 4 })
      .select()
      .single();
    expect(mesoError).toBeNull();
    expect(meso!.macrocycle_id).toBeNull();

    const { data: day } = await alice
      .from("meso_days")
      .insert({
        mesocycle_id: meso!.id,
        user_id: aliceId,
        day_number: 1,
        label: "Lower A",
        weekday: 1,
      })
      .select()
      .single();
    const { data: mg } = await alice
      .from("muscle_groups")
      .select("id")
      .limit(1)
      .single();
    const { data: group, error: groupError } = await alice
      .from("meso_day_groups")
      .insert({ meso_day_id: day!.id, muscle_group_id: mg!.id, exercise_slots: 2 })
      .select()
      .single();
    expect(groupError).toBeNull();

    const { data: bobGroups } = await bob
      .from("meso_day_groups")
      .select("*")
      .eq("id", group!.id);
    expect(bobGroups).toEqual([]);
    const { error: bobGroupInsert } = await bob
      .from("meso_day_groups")
      .insert({ meso_day_id: day!.id, muscle_group_id: mg!.id });
    expect(bobGroupInsert).not.toBeNull();
  });

  it("stock template day groups are readable; users cannot write them", async () => {
    const { data: stockDay } = await bob
      .from("template_days")
      .select("id, template_id, templates!inner(user_id)")
      .limit(1)
      .single();
    const { data: mg } = await bob
      .from("muscle_groups")
      .select("id")
      .limit(1)
      .single();
    const { data: visible, error: readError } = await bob
      .from("template_day_groups")
      .select("*")
      .eq("template_day_id", stockDay!.id);
    expect(readError).toBeNull();
    expect(Array.isArray(visible)).toBe(true);
    const { error: writeError } = await bob
      .from("template_day_groups")
      .insert({ template_day_id: stockDay!.id, muscle_group_id: mg!.id });
    expect(writeError).not.toBeNull();
  });

  it("users cannot write the MCP audit log directly", async () => {
    const { error } = await alice.from("mcp_write_audit").insert({
      user_id: aliceId,
      tool: "create_mesocycle",
      args_hash: "deadbeef",
    });
    expect(error).not.toBeNull();
    const { data: bobView, error: bobError } = await bob
      .from("mcp_write_audit")
      .select("*")
      .eq("user_id", aliceId);
    expect(bobError).toBeNull();
    expect(bobView).toEqual([]);
  });
});

describe("engine tables", () => {
  it("authenticated users can read engine params", async () => {
    const { data, error } = await bob
      .from("engine_params")
      .select("version, is_active")
      .eq("is_active", true)
      .single();
    expect(error).toBeNull();
    expect(data!.version).toBe(2);
  });

  it("non-admins cannot write engine params", async () => {
    const { error } = await bob
      .from("engine_params")
      .insert({ version: 999, params: {}, is_active: false });
    expect(error).not.toBeNull();
  });

  it("users cannot write engine decisions directly", async () => {
    const { error } = await alice.from("engine_decisions").insert({
      user_id: aliceId,
      inputs: {},
      output: {},
      params_version: 1,
    });
    expect(error).not.toBeNull();
  });
});
