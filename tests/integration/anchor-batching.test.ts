/**
 * N88 — the strength anchor must not starve on batch width. Requires a running
 * local Supabase stack (`supabase start`, migrations + seed applied); CI runs
 * this in the rls-tests job, excluded from the unit run.
 *
 * This lives in the integration suite ON PURPOSE. The defect was in the SQL
 * semantics of the candidate fetch, not in any branch of the TypeScript around
 * it: `getExerciseE1rmAnchors` bounded egress with a global `.limit(600)` over a
 * recency-ordered read spanning the whole batch of exercises. A cold exercise —
 * one trained on a longer rotation than its batch-mates — had its entire
 * history evicted by other exercises' recent sets, came back empty, and seeded a
 * blank starting weight. Only a real Postgres can regress that: a fake client
 * would have to reimplement the ranking, i.e. assert against itself.
 *
 * The fixture reproduces the owner's 2026-08-10 meso seed in miniature: one hot
 * exercise with more recent sets than the OLD global cap, one cold exercise
 * whose (older, but perfectly good) history sits entirely behind them.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { getExerciseE1rmAnchors } from "@/lib/queries/anchors";
import { getActiveEngineParams } from "@/lib/queries/generation";
import type { EngineParams } from "@/lib/engine";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Client = SupabaseClient<Database>;

/** Comfortably more than the retired global cap of 600, so the old code path is
 *  genuinely starved rather than marginally so. */
const HOT_SETS = 700;

let user: Client;
let service: Client;
let userId: string;
let params: EngineParams;
let hotExerciseId: string;
let coldExerciseId: string;

const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  service = createClient<Database>(URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  user = createClient<Database>(URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signUpError } = await user.auth.signUp({
    email: `anchor-batching-${Date.now()}@integration.test`,
    password: "test-password-123",
  });
  if (signUpError) throw signUpError;
  userId = (await user.auth.getUser()).data.user!.id;

  ({ params } = await getActiveEngineParams(service));

  // two stock external-load exercises — the anchor prices on entered weight for
  // these, so the fixture is independent of the bodyweight model's flag state
  const { data: exercises, error: exError } = await service
    .from("exercises")
    .select("id")
    .is("user_id", null)
    .eq("load_type", "external")
    .limit(2);
  if (exError) throw exError;
  if (!exercises || exercises.length < 2) throw new Error("seed data missing stock exercises");
  hotExerciseId = exercises[0].id;
  coldExerciseId = exercises[1].id;

  const { data: meso, error: mesoError } = await service
    .from("mesocycles")
    .insert({
      user_id: userId,
      macrocycle_id: null,
      position: null,
      phase: null,
      name: "N88 anchor batching",
      weeks: 3,
      days_per_week: 2,
      includes_deload: false,
      rir_start: 3,
      rir_end: 0,
      rir_schedule: null,
      status: "completed",
      template_id: null,
      start_date: null,
      last_reconcile_sig: null,
    })
    .select("id")
    .single();
  if (mesoError) throw mesoError;

  const { data: micro, error: microError } = await service
    .from("microcycles")
    .insert({
      mesocycle_id: meso.id,
      user_id: userId,
      week_number: 1,
      target_rir: 2,
      is_deload: false,
      start_date: null,
      status: "completed",
    })
    .select("id")
    .single();
  if (microError) throw microError;

  // one COMPLETED workout per exercise — the view only ranks completed work
  const makeSession = async (exerciseId: string, dayNumber: number, daysAgo: number) => {
    const performedAt = new Date(Date.now() - daysAgo * DAY_MS).toISOString();
    const { data: workout, error: workoutError } = await service
      .from("workouts")
      .insert({
        microcycle_id: micro.id,
        user_id: userId,
        day_number: dayNumber,
        scheduled_date: null,
        performed_at: performedAt,
        status: "completed",
        notes: null,
      })
      .select("id")
      .single();
    if (workoutError) throw workoutError;
    const { data: we, error: weError } = await service
      .from("workout_exercises")
      .insert({
        workout_id: workout.id,
        exercise_id: exerciseId,
        muscle_group_id: null,
        position: 1,
        prescribed_weight: 100,
        prescribed_reps: 10,
        prescribed_sets: 3,
        target_rir: 2,
        status: "completed",
        notes: null,
      })
      .select("id")
      .single();
    if (weError) throw weError;
    return { workoutId: workout.id, weId: we.id, performedAt };
  };

  // COLD: real history, but every set older than every hot set (90 days back)
  const cold = await makeSession(coldExerciseId, 1, 90);
  // HOT: more recent sets than the retired 600-row global cap could hold
  const hot = await makeSession(hotExerciseId, 2, 1);

  const set = (
    session: { workoutId: string; weId: string; performedAt: string },
    exerciseId: string,
    setNumber: number,
    weight: number,
  ) => ({
    workout_exercise_id: session.weId,
    user_id: userId,
    exercise_id: exerciseId,
    macrocycle_id: null,
    mesocycle_id: meso.id,
    microcycle_id: micro.id,
    workout_id: session.workoutId,
    performed_at: session.performedAt,
    performed_on: session.performedAt.slice(0, 10),
    set_number: setNumber,
    weight,
    reps: 10,
    set_type: "straight" as const,
    rir_reported: 2,
    // the engine stamps these on the real log path; the anchor recomputes from
    // weight/reps/RIR and never reads them, so the fixture leaves them unset
    e1rm: null,
    e1rm_confidence: null,
    bodyweight: null,
    is_warmup: false,
    notes: null,
  });

  const rows = [
    ...Array.from({ length: 3 }, (_, i) => set(cold, coldExerciseId, i + 1, 100)),
    ...Array.from({ length: HOT_SETS }, (_, i) => set(hot, hotExerciseId, i + 1, 50)),
  ];
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await service.from("logged_sets").insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
});

describe("getExerciseE1rmAnchors: the bound is per exercise, not per call", () => {
  it("anchors a cold exercise even when batch-mates have more recent sets than the old global cap", async () => {
    const anchors = await getExerciseE1rmAnchors(
      user,
      userId,
      [hotExerciseId, coldExerciseId],
      params,
    );

    // the regression: under the retired global `.limit(600)` the 700 hot sets
    // filled the window and the cold exercise came back with no anchor at all,
    // which the seed reported as "no confident data" and left blank
    expect(anchors.get(coldExerciseId)).toBeDefined();
    expect(anchors.get(coldExerciseId)!.value).toBeGreaterThan(0);
    expect(anchors.get(hotExerciseId)).toBeDefined();
  });

  it("gives the cold exercise the same anchor it gets when fetched alone", async () => {
    const batched = await getExerciseE1rmAnchors(
      user,
      userId,
      [hotExerciseId, coldExerciseId],
      params,
    );
    const alone = await getExerciseE1rmAnchors(user, userId, [coldExerciseId], params);

    // batch width must not be an input to the answer — re-seeding one exercise
    // on its own is exactly how the defect used to "fix itself"
    expect(batched.get(coldExerciseId)).toEqual(alone.get(coldExerciseId));
  });

  it("keeps the anchor sourced from the cold exercise's own history", async () => {
    const anchors = await getExerciseE1rmAnchors(user, userId, [coldExerciseId], params);
    const anchor = anchors.get(coldExerciseId)!;
    // 100 lb × 10 @ 2 RIR — an old set is still a real measurement (the module
    // deliberately has no recency floor); it must not be silently discarded
    expect(anchor.source?.weight).toBe(100);
    expect(anchor.source?.reps).toBe(10);
    expect(anchor.source?.ageDays).toBeGreaterThan(80);
  });
});
