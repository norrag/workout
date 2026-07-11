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
import { appendBodyweightPoint } from "@/lib/queries/bodyweight";

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

describe("completion-lock hardening (R5)", () => {
  const service = createClient(URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /** Full meso→micro→workout→exercise chain for alice (service role). */
  async function buildChain(
    workoutStatus: "planned" | "in_progress" | "completed",
  ) {
    const { data: meso, error } = await service
      .from("mesocycles")
      .insert({
        macrocycle_id: aliceMacroId,
        user_id: aliceId,
        name: "r5",
        weeks: 4,
        days_per_week: 2,
      })
      .select()
      .single();
    if (error) throw error;
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
    return {
      mesoId: meso!.id as string,
      microId: micro!.id as string,
      workoutId: workout!.id as string,
      weId: we!.id as string,
      stockId: stock!.id as string,
    };
  }

  it("a completed workout cannot be reopened or annotated", async () => {
    const { workoutId } = await buildChain("completed");

    // both updates are filtered by USING → silent 0-row no-ops
    await alice
      .from("workouts")
      .update({ status: "in_progress" })
      .eq("id", workoutId);
    await alice.from("workouts").update({ notes: "rewrite" }).eq("id", workoutId);

    const { data: after } = await alice
      .from("workouts")
      .select("status, notes")
      .eq("id", workoutId)
      .single();
    expect(after?.status).toBe("completed");
    expect(after?.notes).toBeNull();
  });

  it("completing an in_progress workout still works", async () => {
    const { workoutId } = await buildChain("in_progress");
    const { error } = await alice
      .from("workouts")
      .update({ status: "completed", performed_at: new Date().toISOString() })
      .eq("id", workoutId);
    expect(error).toBeNull();
    const { data } = await alice
      .from("workouts")
      .select("status")
      .eq("id", workoutId)
      .single();
    expect(data?.status).toBe("completed");
  });

  it("workout inserts must target an owned microcycle and enter as planned", async () => {
    const { microId } = await buildChain("planned");

    // fabricated completed history is rejected
    const { error: fabricated } = await alice.from("workouts").insert({
      microcycle_id: microId,
      user_id: aliceId,
      day_number: 5,
      status: "completed",
    });
    expect(fabricated?.code).toBe("42501");

    // bob cannot insert into alice's week even claiming his own user_id
    const { error: foreign } = await bob.from("workouts").insert({
      microcycle_id: microId,
      user_id: bobId,
      day_number: 6,
      status: "planned",
    });
    expect(foreign?.code).toBe("42501");

    // alice's own planned insert passes
    const { error: ok } = await alice.from("workouts").insert({
      microcycle_id: microId,
      user_id: aliceId,
      day_number: 7,
      status: "planned",
    });
    expect(ok).toBeNull();
  });

  it("prescriptions on a completed workout are locked; planned days stay editable", async () => {
    const done = await buildChain("completed");
    const open = await buildChain("planned");

    await alice
      .from("workout_exercises")
      .update({ prescribed_weight: 999 })
      .eq("id", done.weId);
    const { data: locked } = await alice
      .from("workout_exercises")
      .select("prescribed_weight")
      .eq("id", done.weId)
      .single();
    expect(locked?.prescribed_weight).toBeNull();

    const { error: editable } = await alice
      .from("workout_exercises")
      .update({ prescribed_weight: 42 })
      .eq("id", open.weId);
    expect(editable).toBeNull();
  });

  it("no new sets or exercise slots can enter a completed workout", async () => {
    const { workoutId, weId, stockId, mesoId, microId } =
      await buildChain("completed");

    const { error: slot } = await alice.from("workout_exercises").insert({
      workout_id: workoutId,
      exercise_id: stockId,
      position: 2,
    });
    expect(slot?.code).toBe("42501");

    const { error: set } = await alice.from("logged_sets").insert({
      workout_exercise_id: weId,
      user_id: aliceId,
      exercise_id: stockId,
      macrocycle_id: aliceMacroId,
      mesocycle_id: mesoId,
      microcycle_id: microId,
      workout_id: workoutId,
      set_number: 1,
      weight: 100,
      reps: 8,
    });
    expect(set?.code).toBe("42501");
  });

  it("a logged set's exercise slot must belong to the same workout", async () => {
    const a = await buildChain("in_progress");
    const b = await buildChain("in_progress");

    const { error } = await alice.from("logged_sets").insert({
      workout_exercise_id: b.weId, // slot from another workout
      user_id: aliceId,
      exercise_id: a.stockId,
      macrocycle_id: aliceMacroId,
      mesocycle_id: a.mesoId,
      microcycle_id: a.microId,
      workout_id: a.workoutId,
      set_number: 1,
      weight: 100,
      reps: 8,
    });
    expect(error?.code).toBe("42501");
  });

  it("session feedback locks when the workout completes", async () => {
    const { workoutId, weId } = await buildChain("in_progress");

    // feedback lands while the session is open (the app saves pre-flip)
    const { error: wf } = await alice.from("workout_feedback").insert({
      workout_id: workoutId,
      user_id: aliceId,
      overall_fatigue: 5,
    });
    expect(wf).toBeNull();
    const { error: ef } = await alice.from("exercise_feedback").insert({
      workout_exercise_id: weId,
      user_id: aliceId,
      pump: 2,
    });
    expect(ef).toBeNull();

    await service
      .from("workouts")
      .update({ status: "completed" })
      .eq("id", workoutId);

    // the dampener is no longer editable or deletable
    await alice
      .from("workout_feedback")
      .update({ overall_fatigue: 0 })
      .eq("workout_id", workoutId);
    await alice.from("workout_feedback").delete().eq("workout_id", workoutId);
    const { data: kept } = await alice
      .from("workout_feedback")
      .select("overall_fatigue")
      .eq("workout_id", workoutId)
      .single();
    expect(kept?.overall_fatigue).toBe(5);

    // and late feedback on the completed session is rejected outright
    const { error: late } = await alice.from("exercise_feedback").insert({
      workout_exercise_id: weId,
      user_id: aliceId,
      pump: 0,
    });
    expect(late?.code).toBe("42501");
  });

  it("a stranger cannot squat a feedback slot", async () => {
    const { workoutId, weId } = await buildChain("in_progress");

    // exercise_feedback is UNIQUE (workout_exercise_id): before R5, bob could
    // insert a row keyed to alice's slot and permanently block her feedback
    const { error: efSquat } = await bob.from("exercise_feedback").insert({
      workout_exercise_id: weId,
      user_id: bobId,
      pump: 2,
    });
    expect(efSquat?.code).toBe("42501");

    const { error: wfSquat } = await bob.from("workout_feedback").insert({
      workout_id: workoutId,
      user_id: bobId,
      overall_fatigue: 1,
    });
    expect(wfSquat?.code).toBe("42501");

    // alice's own feedback still lands
    const { error: own } = await alice.from("exercise_feedback").insert({
      workout_exercise_id: weId,
      user_id: aliceId,
      pump: 2,
    });
    expect(own).toBeNull();
  });

  it("a completed week cannot be reopened; a logged week cannot be deleted", async () => {
    const { mesoId, microId, workoutId, weId, stockId } =
      await buildChain("in_progress");
    await service.from("logged_sets").insert({
      workout_exercise_id: weId,
      user_id: aliceId,
      exercise_id: stockId,
      macrocycle_id: aliceMacroId,
      mesocycle_id: mesoId,
      microcycle_id: microId,
      workout_id: workoutId,
      set_number: 1,
      weight: 100,
      reps: 8,
    });
    await service
      .from("microcycles")
      .update({ status: "completed" })
      .eq("id", microId);

    await alice
      .from("microcycles")
      .update({ status: "active" })
      .eq("id", microId);
    await alice.from("microcycles").delete().eq("id", microId);
    const { data: micro } = await alice
      .from("microcycles")
      .select("status")
      .eq("id", microId)
      .single();
    expect(micro?.status).toBe("completed");

    // and bob cannot add weeks to alice's meso
    const { error: foreign } = await bob.from("microcycles").insert({
      mesocycle_id: mesoId,
      user_id: bobId,
      week_number: 9,
      target_rir: 3,
    });
    expect(foreign?.code).toBe("42501");
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

describe("bodyweight_log (doc 17 §5, N41)", () => {
  it("owners append their own points; other users see and spoof nothing", async () => {
    const { error: own } = await alice.from("bodyweight_log").insert({
      user_id: aliceId,
      measured_on: "2026-07-01",
      weight: 205,
      source: "manual",
    });
    expect(own).toBeNull();

    // bob reads nothing of alice's series…
    const { data: bobView, error: bobReadError } = await bob
      .from("bodyweight_log")
      .select("*")
      .eq("user_id", aliceId);
    expect(bobReadError).toBeNull();
    expect(bobView).toEqual([]);

    // …and cannot write points into her account
    const { error: spoof } = await bob.from("bodyweight_log").insert({
      user_id: aliceId,
      measured_on: "2026-07-01",
      weight: 90,
      source: "manual",
    });
    expect(spoof).not.toBeNull();
  });

  it("source is constrained to the doc-17 vocabulary", async () => {
    const { error } = await alice.from("bodyweight_log").insert({
      user_id: aliceId,
      measured_on: "2026-07-02",
      weight: 205,
      source: "guess",
    });
    expect(error?.code).toBe("23514"); // check constraint
  });

  it("one row per (user, day, source); the writer's upsert replaces same-day", async () => {
    const day = "2026-07-03";
    const { error: first } = await alice.from("bodyweight_log").insert({
      user_id: aliceId,
      measured_on: day,
      weight: 204,
      source: "profile",
    });
    expect(first).toBeNull();

    // a plain duplicate insert hits the unique key…
    const { error: dup } = await alice.from("bodyweight_log").insert({
      user_id: aliceId,
      measured_on: day,
      weight: 203,
      source: "profile",
    });
    expect(dup?.code).toBe("23505");

    // …and the appendBodyweightPoint upsert path (what every writer —
    // profile edit, BW chip, onboarding, quick entry — calls) replaces the
    // day's point instead: latest same-day entry wins
    await appendBodyweightPoint(
      alice as unknown as Parameters<typeof appendBodyweightPoint>[0],
      aliceId,
      { measuredOn: day, weight: 202.5, source: "profile" },
    );
    const { data: after } = await alice
      .from("bodyweight_log")
      .select("weight")
      .eq("measured_on", day)
      .eq("source", "profile");
    expect(after).toHaveLength(1);
    expect(Number(after![0].weight)).toBe(202.5);
  });

  it("owners can correct (delete) a fat-fingered point — it is measurement substrate, not logged history", async () => {
    const { data: created, error } = await alice
      .from("bodyweight_log")
      .insert({
        user_id: aliceId,
        measured_on: "2026-07-04",
        weight: 999,
        source: "manual",
      })
      .select()
      .single();
    expect(error).toBeNull();

    // bob can't delete it…
    await bob.from("bodyweight_log").delete().eq("id", created!.id);
    const { data: still } = await alice
      .from("bodyweight_log")
      .select("id")
      .eq("id", created!.id);
    expect(still).toHaveLength(1);

    // …alice can
    await alice.from("bodyweight_log").delete().eq("id", created!.id);
    const { data: gone } = await alice
      .from("bodyweight_log")
      .select("id")
      .eq("id", created!.id);
    expect(gone).toEqual([]);
  });
});

describe("bodyspec connect tables (doc 15 §2.2, N34 Phase 5a)", () => {
  let aliceConnectionId: string;

  it("owners manage their own connection row; other users see and spoof nothing", async () => {
    const { data: created, error: own } = await alice
      .from("external_connections")
      .insert({
        user_id: aliceId,
        provider: "bodyspec",
        provider_email: "alice@example.com",
      })
      .select()
      .single();
    expect(own).toBeNull();
    aliceConnectionId = created!.id;

    const { data: bobView, error: bobReadError } = await bob
      .from("external_connections")
      .select("*")
      .eq("user_id", aliceId);
    expect(bobReadError).toBeNull();
    expect(bobView).toEqual([]);

    const { error: spoof } = await bob.from("external_connections").insert({
      user_id: aliceId,
      provider: "bodyspec",
    });
    expect(spoof).not.toBeNull();
  });

  it("one connection per (user, provider); provider vocabulary constrained", async () => {
    const { error: dup } = await alice.from("external_connections").insert({
      user_id: aliceId,
      provider: "bodyspec",
    });
    expect(dup?.code).toBe("23505");

    const { error: vocab } = await alice.from("external_connections").insert({
      user_id: aliceId,
      provider: "fitbit",
    });
    expect(vocab?.code).toBe("23514");
  });

  it("token material is deny-all: not even the owner can read or write secrets", async () => {
    // seed a secrets row as the service role (the only legitimate writer)
    const service = createClient(URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: seeded } = await service
      .from("external_connection_secrets")
      .insert({
        connection_id: aliceConnectionId,
        user_id: aliceId,
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
      });
    expect(seeded).toBeNull();

    // the owner cannot select it (grants revoked / no policies)…
    const { data: ownRead, error: ownReadError } = await alice
      .from("external_connection_secrets")
      .select("*")
      .eq("user_id", aliceId);
    expect(ownRead ?? []).toEqual([]);
    expect(ownReadError).not.toBeNull();

    // …nor write one, nor read anyone else's
    const { error: ownWrite } = await alice
      .from("external_connection_secrets")
      .update({ access_token: "forged" })
      .eq("connection_id", aliceConnectionId);
    expect(ownWrite).not.toBeNull();
    const { data: bobRead, error: bobReadError } = await bob
      .from("external_connection_secrets")
      .select("*");
    expect(bobRead ?? []).toEqual([]);
    expect(bobReadError).not.toBeNull();
  });

  it("owner-deleting the connection cascades the secrets (disconnect of record)", async () => {
    await alice
      .from("external_connections")
      .delete()
      .eq("id", aliceConnectionId);
    const service = createClient(URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: orphans } = await service
      .from("external_connection_secrets")
      .select("connection_id")
      .eq("connection_id", aliceConnectionId);
    expect(orphans).toEqual([]);
  });

  it("body_scans: owner-only read/write/delete; idempotent upsert key; cross-user deny", async () => {
    const { data: scan, error: own } = await alice
      .from("body_scans")
      .insert({
        user_id: aliceId,
        provider: "bodyspec",
        provider_result_id: "res-1",
        scanned_at: "2026-07-08T10:00:00Z",
        scanner_model: "GE Lunar iDXA",
        body_fat_pct: 18.2,
        lean_mass_lb: 158.4,
        raw: { composition: { total: {} } },
      })
      .select()
      .single();
    expect(own).toBeNull();

    // duplicate (user, provider, provider_result_id) hits the unique key —
    // the sync path upserts on it
    const { error: dup } = await alice.from("body_scans").insert({
      user_id: aliceId,
      provider: "bodyspec",
      provider_result_id: "res-1",
      scanned_at: "2026-07-08T10:00:00Z",
      raw: {},
    });
    expect(dup?.code).toBe("23505");

    // bob sees nothing, spoofs nothing, deletes nothing
    const { data: bobView } = await bob
      .from("body_scans")
      .select("*")
      .eq("user_id", aliceId);
    expect(bobView).toEqual([]);
    const { error: spoof } = await bob.from("body_scans").insert({
      user_id: aliceId,
      provider: "bodyspec",
      provider_result_id: "res-2",
      scanned_at: "2026-07-08T10:00:00Z",
      raw: {},
    });
    expect(spoof).not.toBeNull();
    await bob.from("body_scans").delete().eq("id", scan!.id);
    const { data: still } = await alice
      .from("body_scans")
      .select("id")
      .eq("id", scan!.id);
    expect(still).toHaveLength(1);

    // the owner may purge imported scans (doc 15 §2.3 — third-party health
    // data, not logged training history)
    await alice.from("body_scans").delete().eq("id", scan!.id);
    const { data: gone } = await alice
      .from("body_scans")
      .select("id")
      .eq("id", scan!.id);
    expect(gone).toEqual([]);
  });

  it("v_body_comp_history: deltas + same-scanner flag per the view definition; security_invoker denies cross-user (5b)", async () => {
    const base = {
      user_id: aliceId,
      provider: "bodyspec" as const,
      raw: {},
    };
    const { error: seedError } = await alice.from("body_scans").insert([
      {
        ...base,
        provider_result_id: "hist-1",
        scanned_at: "2026-03-01T10:00:00Z",
        scanner_model: "GE Lunar iDXA",
        weight_lb: 184,
        body_fat_pct: 25.5,
        lean_mass_lb: 132,
        fat_mass_lb: 45,
      },
      {
        ...base,
        provider_result_id: "hist-2",
        scanned_at: "2026-06-01T10:00:00Z",
        scanner_model: "GE Lunar iDXA",
        weight_lb: 186.5,
        body_fat_pct: 24.9,
        lean_mass_lb: 134.6,
        fat_mass_lb: 44.2,
      },
      {
        ...base,
        provider_result_id: "hist-3",
        scanned_at: "2026-09-01T10:00:00Z",
        scanner_model: "GE Lunar Prodigy",
        lean_mass_lb: 137,
        fat_mass_lb: 44,
      },
    ]);
    expect(seedError).toBeNull();

    const { data: rows, error } = await alice
      .from("v_body_comp_history")
      .select("*")
      .eq("user_id", aliceId)
      .order("scanned_at", { ascending: true });
    expect(error).toBeNull();
    expect(rows).toHaveLength(3);
    // first scan: nothing to compare
    expect(rows![0].prev_scanned_at).toBeNull();
    expect(rows![0].delta_lean_lb).toBeNull();
    expect(rows![0].same_scanner_as_prev).toBeNull();
    // second: same machine, deltas vs the first
    expect(Number(rows![1].delta_lean_lb)).toBe(2.6);
    expect(Number(rows![1].delta_fat_lb)).toBe(-0.8);
    expect(Number(rows![1].delta_weight_lb)).toBe(2.5);
    expect(Number(rows![1].delta_body_fat_pct)).toBe(-0.6);
    expect(rows![1].same_scanner_as_prev).toBe(true);
    // third: different machine — flagged, and a missing weight degrades to null
    expect(rows![2].same_scanner_as_prev).toBe(false);
    expect(rows![2].delta_weight_lb).toBeNull();
    expect(Number(rows![2].delta_lean_lb)).toBe(2.4);

    // security_invoker: bob sees nothing of alice's history
    const { data: bobRows } = await bob
      .from("v_body_comp_history")
      .select("*")
      .eq("user_id", aliceId);
    expect(bobRows).toEqual([]);

    await alice.from("body_scans").delete().like("provider_result_id", "hist-%");
  });

  it("body_scans proposal stamps: owner may resolve; a resolved scan stays resolved (5b)", async () => {
    const { data: scan, error: seedError } = await alice
      .from("body_scans")
      .insert({
        user_id: aliceId,
        provider: "bodyspec",
        provider_result_id: "prop-1",
        scanned_at: "2026-07-08T10:00:00Z",
        weight_lb: 184.5,
        raw: {},
      })
      .select()
      .single();
    expect(seedError).toBeNull();
    expect(scan!.profile_applied_at).toBeNull();
    expect(scan!.profile_dismissed_at).toBeNull();

    // the resolve path's guard: update only while both stamps are null
    const stamp = new Date().toISOString();
    const { data: resolved } = await alice
      .from("body_scans")
      .update({ profile_dismissed_at: stamp })
      .eq("id", scan!.id)
      .is("profile_applied_at", null)
      .is("profile_dismissed_at", null)
      .select();
    expect(resolved).toHaveLength(1);
    // a second resolution (either kind) matches no rows — never restamped
    const { data: again } = await alice
      .from("body_scans")
      .update({ profile_applied_at: stamp })
      .eq("id", scan!.id)
      .is("profile_applied_at", null)
      .is("profile_dismissed_at", null)
      .select();
    expect(again).toEqual([]);

    // cross-user: bob cannot resolve alice's proposal
    const { data: bobResolve } = await bob
      .from("body_scans")
      .update({ profile_applied_at: stamp })
      .eq("id", scan!.id)
      .select();
    expect(bobResolve).toEqual([]);

    await alice.from("body_scans").delete().eq("id", scan!.id);
  });

  it("oauth_transactions is deny-all: not even the flow's own user can touch a round trip (§8.5)", async () => {
    // seed a transaction as the service role (the only legitimate writer —
    // the /connect route binds the session-derived user id server-side)
    const service = createClient(URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const state = `rls-test-state-${Date.now()}`;
    const { error: seeded } = await service.from("oauth_transactions").insert({
      state,
      user_id: aliceId,
      provider: "bodyspec",
      code_verifier: "test-verifier",
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    expect(seeded).toBeNull();

    // the initiating user cannot read their own row (grants revoked / no
    // policies) — the state + verifier never reach a client role…
    const { data: ownRead, error: ownReadError } = await alice
      .from("oauth_transactions")
      .select("*")
      .eq("user_id", aliceId);
    expect(ownRead ?? []).toEqual([]);
    expect(ownReadError).not.toBeNull();

    // …nor forge one, nor consume (delete) one
    const { error: forge } = await alice.from("oauth_transactions").insert({
      state: "forged-state",
      user_id: aliceId,
      provider: "bodyspec",
      code_verifier: "forged",
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    expect(forge).not.toBeNull();
    const { error: burn } = await bob
      .from("oauth_transactions")
      .delete()
      .eq("state", state);
    expect(burn).not.toBeNull();

    // single-use consumption: the service role's delete-returning redeems the
    // row exactly once (the callback's replay defense)
    const { data: consumed } = await service
      .from("oauth_transactions")
      .delete()
      .eq("state", state)
      .select()
      .maybeSingle();
    expect(consumed?.user_id).toBe(aliceId);
    const { data: replay } = await service
      .from("oauth_transactions")
      .delete()
      .eq("state", state)
      .select()
      .maybeSingle();
    expect(replay).toBeNull();
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

// ---------------------------------------------------------------------------
// write integrity (R3/R4 — 20260702000005): atomic plan/param writes + the
// race-duplication unique keys
// ---------------------------------------------------------------------------

describe("write integrity (R3/R4)", () => {
  const service = createClient(URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /** A planned meso for alice plus the ids a plan payload needs. */
  async function buildPlannedMeso() {
    const { data: meso, error } = await service
      .from("mesocycles")
      .insert({
        macrocycle_id: aliceMacroId,
        user_id: aliceId,
        name: "atomic-save",
        weeks: 4,
        days_per_week: 1,
      })
      .select()
      .single();
    if (error) throw error;
    const { data: mg } = await service
      .from("muscle_groups")
      .select("id")
      .limit(1)
      .single();
    const { data: stock } = await service
      .from("exercises")
      .select("id")
      .is("user_id", null)
      .limit(1)
      .single();
    return { mesoId: meso!.id as string, mgId: mg!.id as string, exId: stock!.id as string };
  }

  function planDays(mgId: string, exId: string) {
    return [
      {
        day_number: 1,
        label: "push",
        weekday: null,
        groups: [
          {
            muscle_group_id: mgId,
            exercise_slots: 1,
            fills: [
              { slot_number: 1, exercise_id: exId, initial_sets: 3, day_position: 1 },
            ],
          },
        ],
      },
    ];
  }

  it("save_meso_plan writes the owner's plan atomically", async () => {
    const { mesoId, mgId, exId } = await buildPlannedMeso();
    const { error } = await alice.rpc("save_meso_plan", {
      p_mesocycle_id: mesoId,
      p_days: planDays(mgId, exId),
    });
    expect(error).toBeNull();
    const { data: days } = await alice
      .from("meso_days")
      .select("id, day_number")
      .eq("mesocycle_id", mesoId);
    expect(days).toHaveLength(1);
    const { data: fills } = await alice
      .from("meso_exercises")
      .select("exercise_id")
      .eq("mesocycle_id", mesoId);
    expect(fills).toHaveLength(1);
    const { data: meso } = await alice
      .from("mesocycles")
      .select("days_per_week")
      .eq("id", mesoId)
      .single();
    expect(meso!.days_per_week).toBe(1);
  });

  it("save_meso_plan refuses another user's meso and leaves the plan intact", async () => {
    const { mesoId, mgId, exId } = await buildPlannedMeso();
    const { error: ownError } = await alice.rpc("save_meso_plan", {
      p_mesocycle_id: mesoId,
      p_days: planDays(mgId, exId),
    });
    expect(ownError).toBeNull();

    const { error } = await bob.rpc("save_meso_plan", {
      p_mesocycle_id: mesoId,
      p_days: [],
    });
    expect(error).not.toBeNull();
    // alice's plan is untouched — the refusal happened before the delete
    const { data: days } = await alice
      .from("meso_days")
      .select("id")
      .eq("mesocycle_id", mesoId);
    expect(days).toHaveLength(1);
  });

  it("activate_engine_params refuses a non-admin and keeps exactly one active row", async () => {
    const { data: before } = await bob
      .from("engine_params")
      .select("version")
      .eq("is_active", true)
      .single();

    // v11 exists in the chain but ships inactive — a non-admin must not be
    // able to flip it (RLS updates 0 rows → the function raises)
    const { error } = await bob.rpc("activate_engine_params", { p_version: 11 });
    expect(error).not.toBeNull();

    const { data: after } = await bob
      .from("engine_params")
      .select("version")
      .eq("is_active", true)
      .single();
    expect(after!.version).toBe(before!.version);
  });

  it("insert_generated_day is not callable by authenticated users", async () => {
    const { error } = await alice.rpc("insert_generated_day", {
      p_mesocycle_id: "00000000-0000-0000-0000-000000000000",
      p_workout: {},
      p_exercises: [],
      p_decisions: [],
    });
    expect(error).not.toBeNull();
  });

  it("workouts are unique per (microcycle, day)", async () => {
    const { mesoId } = await buildPlannedMeso();
    const { data: micro } = await service
      .from("microcycles")
      .insert({
        mesocycle_id: mesoId,
        user_id: aliceId,
        week_number: 1,
        target_rir: 3,
      })
      .select()
      .single();
    const workout = {
      microcycle_id: micro!.id,
      user_id: aliceId,
      day_number: 1,
      status: "planned",
    };
    const { error: first } = await service.from("workouts").insert(workout);
    expect(first).toBeNull();
    const { error: dup } = await service.from("workouts").insert(workout);
    expect(dup).not.toBeNull();
    expect(dup!.code).toBe("23505");
  });

  it("logged sets are unique per (exercise, set_number)", async () => {
    const { mesoId, exId } = await buildPlannedMeso();
    const { data: micro } = await service
      .from("microcycles")
      .insert({
        mesocycle_id: mesoId,
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
        status: "in_progress",
      })
      .select()
      .single();
    const { data: we } = await service
      .from("workout_exercises")
      .insert({
        workout_id: workout!.id,
        exercise_id: exId,
        position: 1,
        prescribed_sets: 3,
      })
      .select()
      .single();
    const set = {
      workout_exercise_id: we!.id,
      user_id: aliceId,
      exercise_id: exId,
      mesocycle_id: mesoId,
      microcycle_id: micro!.id,
      workout_id: workout!.id,
      performed_at: new Date().toISOString(),
      set_number: 1,
      weight: 100,
      reps: 8,
      is_warmup: false,
    };
    const { error: first } = await service.from("logged_sets").insert(set);
    expect(first).toBeNull();
    const { error: dup } = await service.from("logged_sets").insert(set);
    expect(dup).not.toBeNull();
    expect(dup!.code).toBe("23505");
  });
});

describe("single active meso (R15)", () => {
  const service = createClient(URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function plannedMeso(name: string): Promise<string> {
    const { data, error } = await service
      .from("mesocycles")
      .insert({
        // standalone (no macro) — exactly the path the old same-macro gate missed
        user_id: aliceId,
        name,
        weeks: 4,
        days_per_week: 2,
        status: "planned",
      })
      .select()
      .single();
    if (error) throw error;
    return data.id;
  }

  it("the partial unique index allows one active meso and rejects a second (any macro)", async () => {
    const first = await plannedMeso("r15 first");
    const second = await plannedMeso("r15 second");

    const { error: firstFlip } = await service
      .from("mesocycles")
      .update({ status: "active" })
      .eq("id", first);
    expect(firstFlip).toBeNull();

    // a second concurrent activation must fail at the DB even though the two
    // mesos share no macrocycle — the app gate is user-wide, this is its backstop
    const { error: secondFlip } = await service
      .from("mesocycles")
      .update({ status: "active" })
      .eq("id", second);
    expect(secondFlip).not.toBeNull();
    expect(secondFlip!.code).toBe("23505");

    // completing the live block frees the slot — the next activation succeeds
    const { error: complete } = await service
      .from("mesocycles")
      .update({ status: "completed" })
      .eq("id", first);
    expect(complete).toBeNull();
    const { error: thirdFlip } = await service
      .from("mesocycles")
      .update({ status: "active" })
      .eq("id", second);
    expect(thirdFlip).toBeNull();

    // cleanup so other tests (and reruns) never see a lingering active meso
    await service.from("mesocycles").delete().in("id", [first, second]);
  });
});
