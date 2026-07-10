/**
 * E2E — prescribed progression Phase 3 (doc 16 §10): the day-view coupling.
 *
 *  1. an earned (stepped) prescription renders in the set row — prefill
 *     flow-through is automatic (§5.1);
 *  2. an athlete-owned weight edit re-derives reps against the recorded
 *     TARGET anchor `A*` (§5.2) — the fixture user has no logged history, so
 *     the measured anchor is null and any live prediction can only come from
 *     the decision-recorded target;
 *  3. the ▲/met/▼ markers reflect the shared gate comparison (§5.3) — an
 *     exactly-as-prescribed set reads `met`, a short set reads `under`.
 *
 * The fixture signs up through the public API like the smoke test; the earned
 * decision is fabricated with the local service role (engine_decisions is
 * service-write-only by design), NOT by activating v20 globally — the stack's
 * active params stay untouched, which is itself the §2.7 posture (the coupling
 * must work off recorded decisions alone).
 */
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const EMAIL = `progression-${Date.now()}@e2e.test`;
const PASSWORD = "test-password-123";

// the fabricated earned ask: prescription 105 × 8 @ target RIR 2, priced off a
// recorded target anchor A* = 150 (well above what 105×8 implies, so the
// re-derived reps move visibly with the weight)
const PRESCRIBED_WEIGHT = 105;
const PRESCRIBED_REPS = 8;
const TARGET_ANCHOR = 150;

let mesoId: string;
let userId: string;

test.beforeAll(async () => {
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signUpError } = await supabase.auth.signUp({
    email: EMAIL,
    password: PASSWORD,
  });
  if (signUpError) throw signUpError;
  userId = (await supabase.auth.getUser()).data.user!.id;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      display_name: "Progression Tester",
      age: 30,
      experience_level: "intermediate",
      bodyweight: 180,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (profileError) throw profileError;

  // one stock external-load exercise + its primary muscle group (seed data)
  const { data: links, error: linkError } = await supabase
    .from("exercise_muscle_groups")
    .select("exercise_id, muscle_group_id, exercise:exercises(user_id, load_type)")
    .eq("role", "primary")
    .limit(100);
  if (linkError) throw linkError;
  const stock = (links ?? []).find((l) => {
    const ex = l.exercise as unknown as {
      user_id: string | null;
      load_type: string | null;
    };
    return ex && ex.user_id === null && (ex.load_type ?? "external") === "external";
  });
  if (!stock) throw new Error("seed data missing a stock external exercise");

  const { data: meso, error: mesoError } = await supabase
    .from("mesocycles")
    .insert({
      user_id: userId,
      name: "Progression block",
      weeks: 3,
      days_per_week: 1,
      includes_deload: false,
      rir_start: 2,
      rir_end: 0,
      status: "planned",
    })
    .select()
    .single();
  if (mesoError) throw mesoError;
  mesoId = meso.id;

  const { error: planError } = await supabase.rpc("save_meso_plan", {
    p_mesocycle_id: mesoId,
    p_days: [
      {
        day_number: 1,
        label: "DAY A",
        weekday: null,
        groups: [
          {
            muscle_group_id: stock.muscle_group_id,
            exercise_slots: 1,
            fills: [
              {
                slot_number: 1,
                exercise_id: stock.exercise_id,
                initial_sets: 2,
                day_position: 1,
              },
            ],
          },
        ],
      },
    ],
  });
  if (planError) throw planError;
});

/** After the meso is started: stamp the W1·D1 prescription with the led ask
 *  and record the `stepped` decision that priced it (service role — the same
 *  write surface the engine job uses). */
async function fabricateEarnedPrescription() {
  const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: micro, error: microError } = await service
    .from("microcycles")
    .select("id")
    .eq("mesocycle_id", mesoId)
    .eq("week_number", 1)
    .single();
  if (microError) throw microError;
  const { data: workout, error: workoutError } = await service
    .from("workouts")
    .select("id")
    .eq("microcycle_id", micro.id)
    .eq("day_number", 1)
    .single();
  if (workoutError) throw workoutError;
  const { data: we, error: weError } = await service
    .from("workout_exercises")
    .select("id, exercise_id, target_rir")
    .eq("workout_id", workout.id)
    .single();
  if (weError) throw weError;

  const targetRir = we.target_rir ?? 2;
  const { error: updateError } = await service
    .from("workout_exercises")
    .update({
      prescribed_weight: PRESCRIBED_WEIGHT,
      prescribed_reps: PRESCRIBED_REPS,
    })
    .eq("id", we.id);
  if (updateError) throw updateError;

  const { data: active, error: paramsError } = await service
    .from("engine_params")
    .select("version")
    .eq("is_active", true)
    .single();
  if (paramsError) throw paramsError;

  const output = {
    weight: PRESCRIBED_WEIGHT,
    reps: PRESCRIBED_REPS,
    sets: 2,
    targetRir,
    rationale: `Earned overload: targeting e1RM ${TARGET_ANCHOR}.`,
    trace: [
      {
        rule: "progression",
        detail: `earned overload: targeting e1RM ${TARGET_ANCHOR}`,
        status: "stepped",
        deltaTarget: 4.8,
        deltaRealized: 5,
        targetAnchor: TARGET_ANCHOR,
      },
    ],
  };
  const { error: insertError } = await service.from("engine_decisions").insert({
    user_id: userId,
    workout_exercise_id: we.id,
    exercise_id: we.exercise_id,
    workout_id: workout.id,
    microcycle_id: micro.id,
    mesocycle_id: mesoId,
    inputs: { fixture: "e2e prescribed-progression phase 3" },
    output,
    params_version: active.version,
    kind: "advance",
  });
  if (insertError) throw insertError;
}

test("earned prescription renders; weight edit re-derives reps off the target anchor; markers are three-state", async ({
  page,
}) => {
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("[browser:error]", msg.text());
  });

  // ---- sign in and start the meso through the UI ----
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/workout");
  await page.goto(`/cycles/meso/${mesoId}`);
  await page.getByRole("button", { name: "START MESOCYCLE" }).click();
  await page.waitForURL("**/workout");
  await expect(page.getByText("W1·D1").first()).toBeVisible();

  // ---- fabricate the earned decision, then re-read the day ----
  await fabricateEarnedPrescription();
  await page.reload();

  // 1. the earned prescription renders in the set row (prefill flow-through)
  const weightCell = page.getByLabel("set 1 weight");
  await expect(weightCell).toHaveValue(String(PRESCRIBED_WEIGHT));

  // 2. the live predictor prices off the recorded target anchor: this user
  // has NO logged history (measured anchor null), so reps can only re-derive
  // from A*. Lighter weight ⇒ strictly more predicted reps.
  const repsAtPrescribed = Number(
    await page.getByLabel("set 1 reps").inputValue(),
  );
  expect(Number.isFinite(repsAtPrescribed)).toBe(true);
  await weightCell.fill("85");
  await weightCell.blur();
  await expect
    .poll(async () => Number(await page.getByLabel("set 1 reps").inputValue()))
    .toBeGreaterThan(repsAtPrescribed);

  // Focusing the reps cell blurs the weight cell, whose handler ASYNCHRONOUSLY
  // rewrites the reps input with the re-derived prediction. At robot speed a
  // plain fill() races that rewrite: the insert lands after the re-render with
  // the selection collapsed, so the typed digits APPEND to the predicted value
  // ("11" + "8" → reps 118 → the server rejects > 100 and the set never logs).
  // A human can't type inside that window; retry until the fill sticks.
  const fillReps = async (setNumber: number, value: number) => {
    const repsCell = page.getByLabel(`set ${setNumber} reps`);
    await expect(async () => {
      await repsCell.fill(String(value));
      await expect(repsCell).toHaveValue(String(value));
    }).toPass();
  };

  // 3a. log set 1 exactly as prescribed ⇒ the shared comparison reads `met`.
  // Blur the weight edit and wait for its re-derive to land (back at the
  // weight-105 prediction we sampled above) so no rewrite is still in flight.
  await weightCell.fill(String(PRESCRIBED_WEIGHT));
  await weightCell.blur();
  await expect
    .poll(async () => Number(await page.getByLabel("set 1 reps").inputValue()))
    .toBe(repsAtPrescribed);
  await fillReps(1, PRESCRIBED_REPS);
  await page.getByRole("button", { name: "log set 1" }).click();
  await expect(page.getByRole("button", { name: "uncheck set 1" })).toBeVisible();
  await expect(page.getByLabel("met prescription")).toBeVisible();

  // 3b. log set 2 short ⇒ `under`
  await page.getByLabel("set 2 weight").fill(String(PRESCRIBED_WEIGHT));
  await page.getByLabel("set 2 weight").blur();
  await fillReps(2, PRESCRIBED_REPS - 2);
  await page.getByRole("button", { name: "log set 2" }).click();
  await expect(page.getByRole("button", { name: "uncheck set 2" })).toBeVisible();
  await expect(page.getByLabel("below prescription")).toBeVisible();
});
