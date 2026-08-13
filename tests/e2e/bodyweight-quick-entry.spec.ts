/**
 * E2E bodyweight quick entry (doc 17 §5, N41): sign in → More → "Log
 * bodyweight" → sheet → save appends a manual point (same-day re-entry
 * replaces it), and the profile card wears the "as of" freshness label.
 *
 * Fixture (user + onboarded profile) is seeded through the public API; the
 * profile is written directly (no bodyweight_log point), so the quick-entry
 * row starts empty — proving the row reads the SERIES, not the scalar.
 */
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const EMAIL = `bw-entry-${Date.now()}@e2e.test`;
const PASSWORD = "test-password-123";

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
      display_name: "BW Tester",
      age: 30,
      experience_level: "intermediate",
      bodyweight: 200,
      bodyweight_updated_at: new Date().toISOString(),
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (profileError) throw profileError;
});

test("quick entry appends a manual point; same-day re-entry replaces it", async ({
  page,
}) => {
  // ---- sign in through the UI ----
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/workout");

  await page.goto("/more");

  // the profile card wears the freshness label (09 2026-07-11 §2)…
  await expect(page.getByText(/200 LB · AS OF/)).toBeVisible();
  // …and the quick-entry row starts empty: the profile scalar is not a point
  const row = page.getByRole("button", { name: /Log bodyweight/ });
  await expect(row).toContainText("—");

  // ---- first entry: prefilled from the profile scalar, saved as manual ----
  await row.click();
  const weight = page.getByLabel("bodyweight in pounds");
  await expect(weight).toHaveValue("200");
  await weight.fill("202.5");
  await page.getByRole("button", { name: "SAVE" }).click();
  await expect(row).toContainText("202.5");

  // the profile scalar is untouched — the quick entry never writes it
  await expect(page.getByText(/200 LB · AS OF/)).toBeVisible();

  // ---- same-day re-entry replaces the day's manual point (latest wins) ----
  await row.click();
  await expect(page.getByLabel("bodyweight in pounds")).toHaveValue("202.5");
  await page.getByLabel("bodyweight in pounds").fill("203");
  await page.getByRole("button", { name: "SAVE" }).click();
  await expect(row).toContainText("203");
  await expect(row).not.toContainText("202.5");

  // ---- a profile bodyweight edit appends a 'profile' point too, and the
  // series resolves the day to the LATEST entry across sources ----
  await page.goto("/more/profile");
  // the ledger ROW, not the `BODYWEIGHT` equipment chip further down the same
  // screen — /BODYWEIGHT/ alone is a strict-mode violation, since the row's
  // accessible name is `BODYWEIGHT <n> LB AS OF <date>` and the chip's is just
  // `BODYWEIGHT`. The value is what tells them apart.
  await page.getByRole("button", { name: /^BODYWEIGHT \d/ }).click();
  const sheet = page.getByRole("dialog", { name: "bodyweight" });
  await sheet.locator("input").fill("204");
  await sheet.getByRole("button", { name: "SAVE" }).click();
  // the editor row now wears the shared freshness vocabulary
  await expect(page.getByText(/AS OF/).first()).toBeVisible();

  await page.goto("/more");
  await expect(
    page.getByRole("button", { name: /Log bodyweight/ }),
  ).toContainText("204");
});
