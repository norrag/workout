/**
 * E2E smoke (R21): the daily loop end to end through the real UI against the
 * local Supabase stack — sign in → start a planned meso → log a workout
 * (including exercise feedback) → complete it → land on the engine-generated
 * next-week day.
 *
 * Fixture (user + onboarded profile + planned one-day meso) is seeded through
 * the public API (same RLS surface the app uses); everything after sign-in is
 * driven through the rendered UI.
 */
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const EMAIL = `smoke-${Date.now()}@e2e.test`;
const PASSWORD = "test-password-123";

let mesoId: string;

test.beforeAll(async () => {
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signUpError } = await supabase.auth.signUp({
    email: EMAIL,
    password: PASSWORD,
  });
  if (signUpError) throw signUpError;
  const userId = (await supabase.auth.getUser()).data.user!.id;

  // onboard via the profile row (the signup trigger created it)
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      display_name: "Smoke Tester",
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

  // planned one-day meso, 2 weeks, one exercise × 2 sets
  const { data: meso, error: mesoError } = await supabase
    .from("mesocycles")
    .insert({
      user_id: userId,
      name: "Smoke block",
      weeks: 2,
      days_per_week: 1,
      includes_deload: false,
      rir_start: 2,
      rir_end: 1,
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

test("sign in → start meso → log workout with feedback → complete → next week generated", async ({
  page,
}) => {
  // ---- sign in through the UI ----
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/workout");

  // ---- start the planned meso from its page ----
  await page.goto(`/cycles/meso/${mesoId}`);
  await page.getByRole("button", { name: "START MESOCYCLE" }).click();
  await page.waitForURL("**/workout");

  // W1·D1 day view with the seeded exercise's 2-set grid
  await expect(page.getByText("W1·D1")).toBeVisible();

  // ---- log set 1 (deferred seed: enter a starting weight) ----
  await page.getByLabel("set 1 weight").fill("100");
  await page.getByLabel("set 1 reps").fill("8");
  await page.getByLabel("log set 1").click();
  await expect(page.getByLabel("uncheck set 1")).toBeVisible();

  // ---- log set 2 (row becomes editable after set 1 confirms) ----
  await page.getByLabel("set 2 weight").fill("100");
  await page.getByLabel("set 2 reps").fill("8");
  await page.getByLabel("log set 2").click();

  // ---- exercise feedback auto-prompts after the exercise's last set ----
  const feedback = page.getByRole("dialog", { name: "Feedback" });
  await expect(feedback).toBeVisible();
  await feedback.getByRole("button", { name: "0", exact: true }).click(); // days sore
  await feedback.getByRole("button", { name: "None" }).click(); // joint pain
  const save = feedback.getByRole("button", { name: "SAVE" });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(feedback).not.toBeVisible();

  // ---- complete the workout ----
  await expect(page.getByLabel("uncheck set 2")).toBeVisible();
  await page.getByRole("button", { name: "COMPLETE WORKOUT" }).click();
  const completeSheet = page.getByRole("dialog", { name: /complete/i });
  await expect(completeSheet).toBeVisible();
  await expect(completeSheet.getByText("W1·D1 complete.")).toBeVisible();
  // session sliders default to 5 — accept and confirm
  await completeSheet.getByRole("button", { name: /NEXT WORKOUT/ }).click();

  // ---- the engine generated week 2's counterpart; we land on it ----
  await page.waitForURL("**/log/**");
  await expect(page.getByText("W2·D1")).toBeVisible();
});
