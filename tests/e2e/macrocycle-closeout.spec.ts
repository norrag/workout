/**
 * E2E closeout flow (doc 17 §4, N40): sign in → open an active macrocycle →
 * ⋮ → End macrocycle → confirm → the macro completes and the Overview renders
 * the retrospective (strength verdict vs the contract, block-outcome mix)
 * in place of the "to date" stats framing.
 *
 * Fixture (user + onboarded profile + an active macro holding one planned
 * meso and two unplanned placeholders) is seeded through the public API (the
 * same RLS surface the app uses); everything after sign-in is driven through
 * the rendered UI.
 */
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const EMAIL = `macro-close-${Date.now()}@e2e.test`;
const PASSWORD = "test-password-123";

let macroId: string;

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

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      display_name: "Closeout Tester",
      age: 30,
      experience_level: "intermediate",
      bodyweight: 180,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (profileError) throw profileError;

  // an active strength macro with a stored contract band (+4–8%), holding one
  // never-started planned block and two unbuilt placeholders
  const { data: macro, error: macroError } = await supabase
    .from("macrocycles")
    .insert({
      user_id: userId,
      name: "Strength arc",
      goal_type: "strength",
      target_metrics: {},
      duration_months: 3,
      meso_length_weeks: 4,
      target_low: 4,
      target_high: 8,
      target_unit: "%",
      target_direction: "gain",
      start_date: "2026-06-01",
      status: "active",
    })
    .select()
    .single();
  if (macroError) throw macroError;
  macroId = macro.id;

  const { error: mesoError } = await supabase.from("mesocycles").insert([
    {
      user_id: userId,
      macrocycle_id: macroId,
      position: 1,
      name: "Block 1",
      weeks: 4,
      days_per_week: 1,
      includes_deload: true,
      rir_start: 3,
      rir_end: 0,
      status: "planned",
    },
    ...[2, 3].map((position) => ({
      user_id: userId,
      macrocycle_id: macroId,
      position,
      name: `Mesocycle ${position}`,
      weeks: 4,
      days_per_week: 1,
      includes_deload: true,
      rir_start: 3,
      rir_end: 0,
      status: "unplanned" as const,
    })),
  ]);
  if (mesoError) throw mesoError;
});

test("end macrocycle from the header menu → completed Overview renders the retrospective", async ({
  page,
}) => {
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("[browser:error]", msg.text());
  });
  page.on("requestfailed", (req) => {
    console.log("[requestfailed]", req.method(), req.url(), req.failure()?.errorText);
  });

  // ---- sign in through the UI ----
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/workout");

  // ---- the active macro Overview: live "to date" framing, ACTIVE badge ----
  await page.goto(`/cycles/macro/${macroId}`);
  await expect(page.getByText("MACROCYCLE STATS · TO DATE")).toBeVisible();
  await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible();

  // ---- ⋮ → End macrocycle → confirm sheet ----
  await page.getByRole("button", { name: "macrocycle options" }).click();
  await page.getByRole("menuitem", { name: "End macrocycle" }).click();
  const confirm = page.getByRole("dialog", { name: "End macrocycle" });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText(/can't be undone/)).toBeVisible();
  await confirm.getByRole("button", { name: "END MACROCYCLE" }).click();

  // ---- the macro completed: badge flips, retrospective replaces "to date" ----
  await expect(page.getByText("COMPLETE", { exact: true })).toBeVisible();
  await expect(page.getByText("RETROSPECTIVE", { exact: true })).toBeVisible();
  await expect(page.getByText("MACROCYCLE STATS · TO DATE")).not.toBeVisible();

  // strength verdict vs the stored contract: nothing was ever logged, so the
  // honest verdict is insufficient data (never a proxy grade)
  await expect(page.getByText("INSUFFICIENT DATA")).toBeVisible();
  // every block was ended: the planned block and both placeholders abandoned
  await expect(page.getByText("3 ABANDONED")).toBeVisible();

  // the timeline shows the abandoned outcome and no planning affordance remains
  await expect(page.getByText("+ PLAN")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "END MACROCYCLE" })).not.toBeVisible();

  // ---- ending is once-only: the menu no longer offers it ----
  await page.getByRole("button", { name: "macrocycle options" }).click();
  await expect(page.getByRole("menuitem", { name: "Edit macrocycle" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "End macrocycle" })).not.toBeVisible();

  // ---- create-flow priming (doc 17 §5): a completed prior block exists, but
  // nothing was ever logged — no measurable rate, so the line honestly stays
  // away (it renders only off a gradable ≥28-day logged span) ----
  await page.goto("/cycles/new");
  await expect(page.getByText("PLAN", { exact: true })).toBeVisible();
  await expect(page.getByText("LAST BLOCK MEASURED")).not.toBeVisible();
});
