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
let bobId: string;
let aliceMacroId: string;

beforeAll(async () => {
  const stamp = Date.now();
  alice = await signUpUser(`alice-${stamp}@rls.test`);
  bob = await signUpUser(`bob-${stamp}@rls.test`);
  aliceId = (await alice.auth.getUser()).data.user!.id;
  bobId = (await bob.auth.getUser()).data.user!.id;

  const { data, error } = await alice
    .from("macrocycles")
    .insert({
      user_id: aliceId,
      name: "Alice macro",
      goal_type: "hypertrophy",
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
    // the escalation is rejected by profiles_update_own's WITH CHECK, which
    // surfaces as a 42501 error (null data), not a silent 0-row update —
    // matches the hosted-verified behavior (2026-06-22 recursion-fix probe)
    const { data, error } = await alice
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", aliceId)
      .select();
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
    const { data: after } = await alice
      .from("profiles")
      .select("role")
      .eq("id", aliceId)
      .maybeSingle();
    expect(after?.role).toBe("user");
  });

  it("owners can toggle their own auto-match-weights setting", async () => {
    const { data } = await alice
      .from("profiles")
      .update({ auto_match_weights: true })
      .eq("id", aliceId)
      .select("auto_match_weights")
      .maybeSingle();
    expect(data?.auto_match_weights).toBe(true);
  });

  it("owners can update a benign field without policy recursion", async () => {
    // guards the profiles_update_own recursion fix (42P17): the WITH CHECK must
    // not re-query profiles, or every owner update errors out. (Was `units`,
    // dropped by 20260623120000_imperial_units_only — R2 stale-assertion repair.)
    const { data, error } = await alice
      .from("profiles")
      .update({ display_name: "Alice" })
      .eq("id", aliceId)
      .select("display_name")
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.display_name).toBe("Alice");
  });

  it("other users cannot change someone else's settings", async () => {
    const { data } = await bob
      .from("profiles")
      .update({ auto_match_weights: true })
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
      goal_type: "hypertrophy",
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

describe("shares (R1 lockdown)", () => {
  let shareId: string;
  const objectId = crypto.randomUUID();

  beforeAll(async () => {
    // alice mints a share and (via her owner policy) marks bob the grantee —
    // the accepted-share state the dropped grantee-update policy used to cover.
    const { data, error } = await alice
      .from("shares")
      .insert({
        owner_id: aliceId,
        grantee_id: bobId,
        object_type: "mesocycle",
        object_id: objectId,
        share_code: crypto.randomUUID().slice(0, 8).toUpperCase(),
        accepted_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    shareId = data.id;
  });

  it("the grantee can read their share", async () => {
    const { data } = await bob.from("shares").select("id").eq("id", shareId);
    expect(data).toEqual([{ id: shareId }]);
  });

  it("the grantee cannot re-point the share at another object", async () => {
    const { data } = await bob
      .from("shares")
      .update({ object_id: crypto.randomUUID() })
      .eq("id", shareId)
      .select();
    expect(data).toEqual([]);
    // and the row is untouched
    const { data: after } = await alice
      .from("shares")
      .select("object_id")
      .eq("id", shareId)
      .single();
    expect(after!.object_id).toBe(objectId);
  });

  it("the grantee cannot update the share at all (no grantee update policy)", async () => {
    const { data } = await bob
      .from("shares")
      .update({ accepted_at: null })
      .eq("id", shareId)
      .select();
    expect(data).toEqual([]);
  });

  it("the grantee cannot delete the share", async () => {
    const { data } = await bob
      .from("shares")
      .delete()
      .eq("id", shareId)
      .select();
    expect(data).toEqual([]);
  });

  it("the owner keeps full control", async () => {
    const { data, error } = await alice
      .from("shares")
      .update({ expires_at: new Date().toISOString() })
      .eq("id", shareId)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: shareId }]);
  });

  it("non-parties cannot see the share", async () => {
    // bob is the grantee; a share where he is neither owner nor grantee is
    // invisible to him
    const { data: foreign, error } = await alice
      .from("shares")
      .insert({
        owner_id: aliceId,
        grantee_id: null,
        object_type: "template",
        object_id: crypto.randomUUID(),
        share_code: crypto.randomUUID().slice(0, 8).toUpperCase(),
      })
      .select()
      .single();
    expect(error).toBeNull();
    const { data } = await bob
      .from("shares")
      .select("*")
      .eq("id", foreign!.id);
    expect(data).toEqual([]);
  });
});

describe("logged history (completion lock)", () => {
  const service = createClient(URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /** Build a full meso→workout chain for alice and log one set (service role). */
  async function buildLoggedSet(workoutStatus: "in_progress" | "completed") {
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
      .insert({
        microcycle_id: micro!.id,
        user_id: aliceId,
        day_number: 1,
        status: workoutStatus,
      })
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
    // the set itself is always inserted by the service role so the test is
    // independent of the insert path (which flips planned → in_progress)
    const { data: set } = await service
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
    return set!;
  }

  it("owner can amend and delete a set while the workout is in_progress", async () => {
    const set = await buildLoggedSet("in_progress");

    const { error: amendError } = await alice
      .from("logged_sets")
      .update({ weight: 105 })
      .eq("id", set.id);
    expect(amendError).toBeNull();

    await alice.from("logged_sets").delete().eq("id", set.id);
    const { data: gone } = await alice
      .from("logged_sets")
      .select("id")
      .eq("id", set.id);
    expect(gone).toEqual([]);
  });

  it("a completed workout locks its sets — no amend, no delete", async () => {
    const set = await buildLoggedSet("completed");

    // update is rejected by the with-check (row stays at weight 100)
    await alice.from("logged_sets").update({ weight: 999 }).eq("id", set.id);
    // delete is blocked
    await alice.from("logged_sets").delete().eq("id", set.id);

    const { data: stillThere } = await alice
      .from("logged_sets")
      .select("id, weight")
      .eq("id", set.id)
      .single();
    expect(stillThere?.weight).toBe(100);

    // and bob still can't read it
    const { data: bobView } = await bob
      .from("logged_sets")
      .select("id")
      .eq("id", set.id);
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

  it("exercise param overrides are owner-only and unspoofable (doc 14 phase 3)", async () => {
    const { data: stock } = await alice
      .from("exercises")
      .select("id")
      .is("user_id", null)
      .limit(1)
      .single();

    const { data: override, error: overrideError } = await alice
      .from("exercise_param_overrides")
      .insert({ user_id: aliceId, exercise_id: stock!.id, weight_increment: 10 })
      .select()
      .single();
    expect(overrideError).toBeNull();
    expect(override!.weight_increment).toBe(10);

    // bob cannot read alice's override…
    const { data: bobView } = await bob
      .from("exercise_param_overrides")
      .select("*")
      .eq("id", override!.id);
    expect(bobView).toEqual([]);

    // …nor write one into her account
    const { error: spoofError } = await bob
      .from("exercise_param_overrides")
      .insert({ user_id: aliceId, exercise_id: stock!.id, weight_increment: 5 });
    expect(spoofError).not.toBeNull();
  });

  it("positioned macro mesos and groups-first plan rows are gated through their parents", async () => {
    // an unplanned, phased placeholder inside alice's macro (replaces slots)
    const { data: placeholder, error: phError } = await alice
      .from("mesocycles")
      .insert({
        macrocycle_id: aliceMacroId,
        user_id: aliceId,
        position: 1,
        phase: "accumulation",
        name: "Mesocycle 1",
        weeks: 5,
        days_per_week: 1,
        status: "unplanned",
      })
      .select()
      .single();
    expect(phError).toBeNull();
    expect(placeholder!.status).toBe("unplanned");
    const { data: bobView } = await bob
      .from("mesocycles")
      .select("*")
      .eq("id", placeholder!.id);
    expect(bobView).toEqual([]);

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
    // `.single()` also asserts exactly ONE active row. The version is not
    // pinned: the migration chain activates v10 (v11+ ship INACTIVE; live
    // activation happens via the admin MCP tool, not a migration), so pinning
    // goes stale on every activation — the old `=== 5` did exactly that (R2).
    const { data, error } = await bob
      .from("engine_params")
      .select("version, is_active")
      .eq("is_active", true)
      .single();
    expect(error).toBeNull();
    expect(data!.version).toBeGreaterThanOrEqual(10);
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
