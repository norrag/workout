/**
 * Write-pipeline integration tests (R21). Require a running local Supabase
 * stack (`supabase start`, migrations + seed applied) — CI runs these in the
 * rls-tests job; excluded from the unit run.
 *
 * Covers the round-trip the app's daily loop depends on, through the REAL
 * query layer against the REAL schema/RLS/RPCs:
 *
 *   createMesocycle → saveMesoPlan (RPC) → startMeso (activate + seed wk 1)
 *   → logSet (upsert + in_progress flip) → feedback → completeWorkout
 *   → advanceWeekAfterWorkout (engine decision + next-week generation)
 *   → full-week close-out (microcycle rollover)
 *
 * Tests are ordered stages of ONE user's meso — they share state and must run
 * sequentially (vitest's default within a file).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProfileRow } from "@/lib/types/database";
import { createMesocycle, saveMesoPlan } from "@/lib/queries/cycles";
import { startMeso } from "@/lib/queries/generation";
import {
  completeWorkout,
  logSet,
  saveExerciseFeedback,
  saveWorkoutFeedback,
} from "@/lib/queries/logging";
import { advanceWeekAfterWorkout } from "@/lib/queries/progression";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Client = SupabaseClient<Database>;

async function signUpUser(email: string): Promise<Client> {
  const client = createClient<Database>(URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

let user: Client;
let service: Client;
let userId: string;
let profile: ProfileRow;
let mesoId: string;
let day1WorkoutId: string;
let day2WorkoutId: string;
let day1WeId: string;
let activeParamsVersion: number;

/** Two stock external-load exercises + their primary muscle groups. */
let exA: { id: string; mgId: string };
let exB: { id: string; mgId: string };

beforeAll(async () => {
  service = createClient<Database>(URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  user = await signUpUser(`pipeline-${Date.now()}@integration.test`);
  userId = (await user.auth.getUser()).data.user!.id;

  // the signup trigger created the profile; give the engine what it reads
  const { data: prof, error: profErr } = await user
    .from("profiles")
    .update({ experience_level: "intermediate", bodyweight: 180 })
    .eq("id", userId)
    .select()
    .single();
  if (profErr) throw profErr;
  profile = prof;

  // two stock external-load exercises with a primary muscle group (seed data)
  const { data: links, error: exErr } = await service
    .from("exercise_muscle_groups")
    .select("exercise_id, muscle_group_id, role, exercise:exercises(id, user_id, load_type)")
    .eq("role", "primary")
    .limit(200);
  if (exErr) throw exErr;
  const stock = (links ?? []).filter((l) => {
    const ex = l.exercise as unknown as { user_id: string | null; load_type: string | null };
    return ex && ex.user_id === null && (ex.load_type ?? "external") === "external";
  });
  if (stock.length < 2) throw new Error("seed data missing stock exercises");
  const [a, b] = [stock[0], stock[1]];
  exA = { id: a.exercise_id, mgId: a.muscle_group_id };
  exB = { id: b.exercise_id, mgId: b.muscle_group_id };

  const { data: params, error: paramsErr } = await service
    .from("engine_params")
    .select("version")
    .eq("is_active", true)
    .single();
  if (paramsErr) throw paramsErr;
  activeParamsVersion = params.version;
});

describe("write pipeline: activate/seed → log → complete → generate", () => {
  it("creates and plans a mesocycle through the save_meso_plan RPC", async () => {
    // 3 weeks is the schema floor (`mesocycles_weeks_check`: 3–8)
    const meso = await createMesocycle(user, userId, {
      name: "Integration block",
      weeks: 3,
      includes_deload: false,
      rir_start: 2,
      rir_end: 0,
    });
    mesoId = meso.id;
    expect(meso.status).toBe("planned");

    await saveMesoPlan(user, userId, mesoId, [
      {
        day_number: 1,
        label: "DAY A",
        weekday: null,
        groups: [
          {
            muscle_group_id: exA.mgId,
            exercise_slots: 1,
            fills: [
              { slot_number: 1, exercise_id: exA.id, initial_sets: 2, day_position: 1 },
            ],
          },
        ],
      },
      {
        day_number: 2,
        label: "DAY B",
        weekday: null,
        groups: [
          {
            muscle_group_id: exB.mgId,
            exercise_slots: 1,
            fills: [
              { slot_number: 1, exercise_id: exB.id, initial_sets: 2, day_position: 1 },
            ],
          },
        ],
      },
    ]);

    const { data: days } = await user
      .from("meso_days")
      .select("id, day_number")
      .eq("mesocycle_id", mesoId);
    expect(days).toHaveLength(2);
  });

  it("startMeso activates the block and seeds week 1", async () => {
    const { error } = await startMeso(user, userId, mesoId, profile);
    expect(error).toBeNull();

    const { data: meso } = await user
      .from("mesocycles")
      .select("status, start_date")
      .eq("id", mesoId)
      .single();
    expect(meso?.status).toBe("active");

    // one microcycle per week: week 1 active, the rest pending
    const { data: micros } = await user
      .from("microcycles")
      .select("id, week_number, status")
      .eq("mesocycle_id", mesoId)
      .order("week_number");
    expect(micros?.map((m) => ({ week: m.week_number, status: m.status }))).toEqual([
      { week: 1, status: "active" },
      { week: 2, status: "pending" },
      { week: 3, status: "pending" },
    ]);

    // week-1 workouts exist for both days, planned
    const { data: workouts } = await user
      .from("workouts")
      .select("id, day_number, status")
      .eq("microcycle_id", micros![0].id)
      .order("day_number");
    expect(workouts?.map((w) => ({ day: w.day_number, status: w.status }))).toEqual([
      { day: 1, status: "planned" },
      { day: 2, status: "planned" },
    ]);
    day1WorkoutId = workouts![0].id;
    day2WorkoutId = workouts![1].id;

    // seeded workout_exercises carry the prescription envelope (doc 14): the
    // fingerprint + params stamp, target RIR from the ramp, planned set count.
    // A fresh user has no history/anchor, so the v14+ seed DEFERS the load
    // (null weight — "enter a starting weight"), never fabricates one.
    const { data: wes } = await user
      .from("workout_exercises")
      .select(
        "id, status, prescribed_weight, prescribed_sets, target_rir, dep_fingerprint, params_version",
      )
      .eq("workout_id", day1WorkoutId);
    expect(wes).toHaveLength(1);
    const we = wes![0];
    day1WeId = we.id;
    expect(we.status).toBe("pending");
    expect(we.prescribed_sets).toBe(2);
    expect(we.target_rir).toBe(2);
    expect(we.prescribed_weight).toBeNull();
    expect(we.dep_fingerprint).toBeTruthy();
    expect(we.params_version).toBe(activeParamsVersion);

    // the seed recorded engine decisions (kind:"seed") via the service path
    const { data: decisions } = await service
      .from("engine_decisions")
      .select("id, kind")
      .eq("user_id", userId)
      .eq("kind", "seed");
    expect((decisions ?? []).length).toBeGreaterThan(0);
  });

  it("startMeso refuses a second activation while a block is live (R15)", async () => {
    const second = await createMesocycle(user, userId, {
      name: "Second block",
      weeks: 3,
      includes_deload: false,
      rir_start: 2,
      rir_end: 0,
    });
    await saveMesoPlan(user, userId, second.id, [
      {
        day_number: 1,
        label: null,
        weekday: null,
        groups: [
          {
            muscle_group_id: exA.mgId,
            exercise_slots: 1,
            fills: [
              { slot_number: 1, exercise_id: exA.id, initial_sets: 2, day_position: 1 },
            ],
          },
        ],
      },
    ]);
    const { error } = await startMeso(user, userId, second.id, profile);
    expect(error).toBeTruthy();
    const { data: still } = await user
      .from("mesocycles")
      .select("status")
      .eq("id", second.id)
      .single();
    expect(still?.status).toBe("planned");
  });

  it("logSet stamps the cycle chain, flips the workout in_progress, and upserts on retry (R3)", async () => {
    const first = await logSet(user, userId, {
      workout_exercise_id: day1WeId,
      set_number: 1,
      weight: 100,
      reps: 8,
      rir_reported: 2,
      set_type: "straight",
      e1rm: 133.3,
      e1rm_confidence: "moderate",
      bodyweight: 180,
      performed_on: "2026-07-03",
    });
    expect(first.workout_id).toBe(day1WorkoutId);
    expect(first.mesocycle_id).toBe(mesoId);

    // the first set flips the parent planned → in_progress
    const { data: w1 } = await user
      .from("workouts")
      .select("status")
      .eq("id", day1WorkoutId)
      .single();
    expect(w1?.status).toBe("in_progress");

    // a retry / double-tap of the same set number converges on ONE row,
    // newest values winning (unique key + upsert, R3)
    const amended = await logSet(user, userId, {
      workout_exercise_id: day1WeId,
      set_number: 1,
      weight: 100,
      reps: 9,
      rir_reported: 2,
      set_type: "straight",
      e1rm: 138,
      e1rm_confidence: "moderate",
      bodyweight: 180,
      performed_on: "2026-07-03",
    });
    expect(amended.id).toBe(first.id);
    const { data: rows } = await user
      .from("logged_sets")
      .select("id, reps")
      .eq("workout_exercise_id", day1WeId)
      .eq("set_number", 1);
    expect(rows).toHaveLength(1);
    expect(rows![0].reps).toBe(9);

    await logSet(user, userId, {
      workout_exercise_id: day1WeId,
      set_number: 2,
      weight: 100,
      reps: 8,
      rir_reported: 2,
      set_type: "straight",
      e1rm: 133.3,
      e1rm_confidence: "moderate",
      bodyweight: 180,
      performed_on: "2026-07-03",
    });
  });

  it("feedback + completeWorkout close the session and mark exercise statuses", async () => {
    // feedback must land BEFORE completion — RLS locks it once the workout
    // leaves in_progress (R5); this ordering is the app's contract.
    await saveExerciseFeedback(user, userId, {
      workout_exercise_id: day1WeId,
      joint_pain: 0,
      muscle_group_id: exA.mgId,
      pump: 6,
      workload: 5,
      soreness: null,
      soreness_days: null,
    });
    await saveWorkoutFeedback(user, userId, {
      workout_id: day1WorkoutId,
      overall_fatigue: 3,
      effort_rating: 5,
      performance_rating: 7,
    });
    await completeWorkout(user, userId, day1WorkoutId, "integration run");

    const { data: w } = await user
      .from("workouts")
      .select("status, notes")
      .eq("id", day1WorkoutId)
      .single();
    expect(w?.status).toBe("completed");
    expect(w?.notes).toBe("integration run");

    const { data: wes } = await user
      .from("workout_exercises")
      .select("status")
      .eq("workout_id", day1WorkoutId);
    expect(wes![0].status).toBe("completed");

    // day 2 untouched → the microcycle stays active (not every sibling closed)
    const { data: micro } = await user
      .from("microcycles")
      .select("status")
      .eq("mesocycle_id", mesoId)
      .eq("week_number", 1)
      .single();
    expect(micro?.status).toBe("active");
  });

  it("advanceWeekAfterWorkout generates the week-2 counterpart with an engine decision", async () => {
    const result = await advanceWeekAfterWorkout(service, userId, day1WorkoutId);
    expect(result.summary.length).toBeGreaterThan(0);

    const { data: micro2 } = await user
      .from("microcycles")
      .select("id")
      .eq("mesocycle_id", mesoId)
      .eq("week_number", 2)
      .single();
    const { data: nextWorkouts } = await user
      .from("workouts")
      .select("id, day_number, status")
      .eq("microcycle_id", micro2!.id);
    expect(nextWorkouts?.map((w) => w.day_number)).toEqual([1]);

    // the generated day is prescribed off the logged week-1 work: the anchor
    // now exists, so the engine prices a real load at week 2's target RIR
    const { data: nextWes } = await user
      .from("workout_exercises")
      .select("prescribed_weight, prescribed_sets, target_rir, params_version, dep_fingerprint")
      .eq("workout_id", nextWorkouts![0].id);
    expect(nextWes).toHaveLength(1);
    expect(nextWes![0].target_rir).toBe(1);
    expect(nextWes![0].prescribed_weight).not.toBeNull();
    expect(nextWes![0].prescribed_weight!).toBeGreaterThan(0);
    expect(nextWes![0].params_version).toBe(activeParamsVersion);
    expect(nextWes![0].dep_fingerprint).toBeTruthy();

    // the decision trail recorded the advance
    const { data: decisions } = await service
      .from("engine_decisions")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "advance");
    expect((decisions ?? []).length).toBeGreaterThan(0);

    // idempotent: running the job again generates nothing new
    await advanceWeekAfterWorkout(service, userId, day1WorkoutId);
    const { data: again } = await user
      .from("workouts")
      .select("id")
      .eq("microcycle_id", micro2!.id);
    expect(again).toHaveLength(1);
  });

  it("closing out the week completes the microcycle and activates week 2", async () => {
    // complete day 2 (sets logged + feedback + complete, same contract)
    const { data: wes2 } = await user
      .from("workout_exercises")
      .select("id")
      .eq("workout_id", day2WorkoutId);
    const day2WeId = wes2![0].id;
    await logSet(user, userId, {
      workout_exercise_id: day2WeId,
      set_number: 1,
      weight: 80,
      reps: 10,
      rir_reported: 2,
      set_type: "straight",
      e1rm: 115,
      e1rm_confidence: "moderate",
      bodyweight: 180,
      performed_on: "2026-07-03",
    });
    await saveWorkoutFeedback(user, userId, {
      workout_id: day2WorkoutId,
      overall_fatigue: 3,
      effort_rating: 5,
      performance_rating: 7,
    });
    await completeWorkout(user, userId, day2WorkoutId, null);

    // every sibling closed → completeWorkout flips the microcycle
    const { data: micro1 } = await user
      .from("microcycles")
      .select("status")
      .eq("mesocycle_id", mesoId)
      .eq("week_number", 1)
      .single();
    expect(micro1?.status).toBe("completed");

    // the advance job for day 2 activates week 2 once the week is closed
    await advanceWeekAfterWorkout(service, userId, day2WorkoutId);
    const { data: micro2 } = await user
      .from("microcycles")
      .select("id, status")
      .eq("mesocycle_id", mesoId)
      .eq("week_number", 2)
      .single();
    expect(micro2?.status).toBe("active");

    // both week-2 days now exist (day 2's counterpart backfilled)
    const { data: wk2 } = await user
      .from("workouts")
      .select("day_number")
      .eq("microcycle_id", micro2!.id)
      .order("day_number");
    expect(wk2?.map((w) => w.day_number)).toEqual([1, 2]);
  });
});
