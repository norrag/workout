/**
 * What's New (doc 23 §10 e2e). Three assertions, because §6.4's rule is the one
 * piece of this framework that cannot be checked by a unit test alone:
 *
 *   1. a returning user with a pending release sees the sheet once, and it does
 *      not come back after dismissal;
 *   2. it is ABSENT on the Workout tab once a set has been logged — the tab
 *      renders the day view inline, so the suppression signal is the workout's
 *      status, not its route (T5);
 *   3. it APPEARS on another tab in that same state — the release valve that
 *      makes a stale `in_progress` session unable to block the sheet forever.
 *
 * The fixture drives `profiles.last_seen_version` directly (a self-write the
 * RLS policy allows) to put the account behind the deployed version; the
 * registry itself is compiled in and is never mocked.
 */
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const EMAIL = `whatsnew-${Date.now()}@e2e.test`;
const PASSWORD = "test-password-123";
/** below every shipped release, so whatever the registry holds is pending */
const BEHIND = "0.0.1";

const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let userId: string;
let mesoId: string;

/** The sheet's dismiss control — stable across whatever the current copy is. */
const dismissButton = (page: Page) =>
  page.getByRole("button", { name: "GOT IT" });

async function setLastSeen(version: string) {
  const { error } = await supabase
    .from("profiles")
    .update({ last_seen_version: version })
    .eq("id", userId);
  if (error) throw error;
}

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/workout");
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const { error: signUpError } = await supabase.auth.signUp({
    email: EMAIL,
    password: PASSWORD,
  });
  if (signUpError) throw signUpError;
  userId = (await supabase.auth.getUser()).data.user!.id;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      display_name: "Release Tester",
      age: 30,
      experience_level: "intermediate",
      bodyweight: 180,
      onboarded_at: new Date().toISOString(),
      // caught up to start with: the fixture setup must not trip the sheet
      last_seen_version: "9.9.9",
    })
    .eq("id", userId);
  if (profileError) throw profileError;

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
      name: "Release block",
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

test("shows once for a returning user and does not reappear after dismissal", async ({
  page,
}) => {
  // start the block first, still caught up, so the sheet can't interfere
  await signIn(page);
  await page.goto(`/cycles/meso/${mesoId}`);
  await page.getByRole("button", { name: "START MESOCYCLE" }).click();
  await page.waitForURL("**/workout");
  await expect(page.getByText("W1·D1").first()).toBeVisible();

  // now fall behind the deployed version: the workout is `planned`, which is
  // the ordinary landing state and the right moment to interrupt
  await setLastSeen(BEHIND);
  await page.reload();
  await expect(dismissButton(page)).toBeVisible();

  await dismissButton(page).click();
  await expect(dismissButton(page)).toBeHidden();

  // acknowledgment is a write, not a render side effect — it survives a reload
  await expect
    .poll(
      async () => {
        const { data } = await supabase
          .from("profiles")
          .select("last_seen_version")
          .eq("id", userId)
          .maybeSingle();
        return data?.last_seen_version;
      },
      { timeout: 15_000 },
    )
    .not.toBe(BEHIND);
  await page.reload();
  await expect(dismissButton(page)).toBeHidden();
});

test("is absent on the Workout tab once a set has been logged", async ({
  page,
}) => {
  // log a set while caught up: `logSet` flips the workout planned → in_progress
  await setLastSeen("9.9.9");
  await signIn(page);
  await page.getByLabel("set 1 weight").fill("100");
  await page.getByLabel("set 1 reps").fill("8");
  await page.getByRole("button", { name: "log set 1" }).click();
  await expect(page.getByRole("button", { name: "uncheck set 1" })).toBeVisible();

  // fall behind again; a fresh load of the Workout tab must stay silent —
  // this user is training, not browsing
  await setLastSeen(BEHIND);
  await page.reload();
  await expect(page.getByText("W1·D1").first()).toBeVisible();
  await expect(dismissButton(page)).toBeHidden();
});

test("appears on another tab in that same mid-session state", async ({
  page,
}) => {
  // same `in_progress` workout, same pending release, different surface: the
  // sheet waits for the user to navigate off the Workout tab rather than being
  // blocked forever by a session left open
  await signIn(page);
  await expect(dismissButton(page)).toBeHidden();
  await page.goto("/cycles");
  await expect(dismissButton(page)).toBeVisible();
});
