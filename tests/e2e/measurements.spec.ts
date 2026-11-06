import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Measurement E2E tests require local Supabase.");
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const email = `tape-e2e-${Date.now()}@e2e.test`;
const password = "test-password-123";

test("monthly tape capture, corrections, history, units and privacy export", async ({
  page,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_RELEASE_OVERRIDE !== "1.3.0",
    "Requires the staged 1.3.0 build.",
  );
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  await client
    .from("profiles")
    .update({
      display_name: "Tape tester",
      onboarded_at: new Date().toISOString(),
      last_seen_version: "9.9.9",
    })
    .eq("id", data.user!.id);
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/workout");
  await page.goto("/more");
  await page.getByRole("link", { name: "Body measurements" }).click();
  await expect(page.getByText("NO MEASUREMENTS YET")).toBeVisible();

  await page
    .getByRole("button", { name: "+ LOG MEASUREMENTS", exact: true })
    .click();
  await page.getByLabel("Chest (in)", { exact: true }).fill("40");
  await page.getByRole("button", { name: "CM", exact: true }).click();
  await expect(page.getByLabel("Chest (cm)", { exact: true })).toHaveValue(
    "101.6",
  );
  await page.getByRole("button", { name: "IN", exact: true }).click();
  await expect(page.getByLabel("Chest (in)", { exact: true })).toHaveValue(
    "40",
  );
  await page.getByLabel("DATE", { exact: true }).fill("2026-01-01");
  await page.getByLabel("Waist · navel (in)", { exact: true }).fill("34");
  await page
    .getByRole("button", { name: "SAVE MEASUREMENTS", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("MEASUREMENTS SAVED", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("40.00", { exact: false }).first()).toBeVisible();

  await page
    .getByRole("button", { name: "+ LOG MEASUREMENTS", exact: true })
    .click();
  await expect(page.getByLabel("Chest (in)", { exact: true })).toHaveValue("");
  await page.getByLabel("DATE", { exact: true }).fill("2026-02-01");
  await page.getByLabel("Chest (in)", { exact: true }).fill("40.5");
  await page.getByRole("button", { name: "CANCEL", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Discard changes?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByLabel("Chest (in)", { exact: true })).toHaveValue(
    "40.5",
  );
  await page
    .getByRole("button", { name: "SAVE MEASUREMENTS", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("+0.50 IN · 2 readings", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("2 sites · recorded in inches")).toHaveCount(0);
  await page.getByRole("button", { name: "history", exact: true }).click();
  await expect(page.getByText("2 READINGS · RAW DATED VALUES")).toBeVisible();
  await page
    .getByLabel("Measurement site", { exact: true })
    .selectOption("waist_navel");
  await expect(page.getByText("1 READING · RAW DATED VALUES")).toBeVisible();
  await page.getByRole("button").filter({ hasText: "1 FEB '26" }).click();
  await page.getByLabel("Chest (in)", { exact: true }).fill("41");
  await page
    .getByRole("button", { name: "SAVE MEASUREMENTS", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "EXPORT MEASUREMENTS" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^body-measurements-/);
  const rows = await client
    .from("measurements")
    .select("value_in,site_key")
    .eq("user_id", data.user!.id);
  expect(rows.error).toBeNull();
  expect(rows.data).toHaveLength(3);
  expect(
    rows.data
      ?.filter((r) => r.site_key === "chest")
      .map((r) => Number(r.value_in))
      .sort(),
  ).toEqual([40, 41]);
  const profile = await client
    .from("profiles")
    .select("bodyweight,body_fat_pct")
    .eq("id", data.user!.id)
    .single();
  expect(profile.data).toMatchObject({ bodyweight: null, body_fat_pct: null });
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-theme", "dark"),
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).not.toHaveCSS(
    "background-color",
    "rgb(244, 240, 230)",
  );
});
