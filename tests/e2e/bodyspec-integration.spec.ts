/**
 * E2E BodySpec integration screen (doc 17 §6, N34 Phase 5a): sign in → More →
 * "BodySpec DEXA" row → the integration screen renders in its disconnected
 * state, and — with an imported scan seeded directly (the OAuth flow needs a
 * real provider, so e2e enters below it) — the scan list and detail ledger
 * render from `body_scans`.
 *
 * CI has no BODYSPEC_CLIENT_ID, so the disconnected state must show the
 * NOT AVAILABLE line (the configured path is covered by unit tests + the
 * owner's first real login, doc 15 §8.3).
 */
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const EMAIL = `bodyspec-${Date.now()}@e2e.test`;
const PASSWORD = "test-password-123";
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
      display_name: "DEXA Tester",
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (profileError) throw profileError;

  // an imported scan, as the sync would store it (owner-scoped insert)
  const { error: scanError } = await supabase.from("body_scans").insert({
    user_id: userId,
    provider: "bodyspec",
    provider_result_id: "e2e-res-1",
    scanned_at: "2026-07-08T10:15:00-07:00",
    scanner_model: "GE Lunar iDXA",
    weight_lb: 184.53,
    height_in: 70.9,
    age_years: 38.4,
    body_fat_pct: 25.5,
    lean_mass_lb: 132.28,
    fat_mass_lb: 45.19,
    bone_mass_lb: 7.05,
    vat_mass_lb: 6.17,
    vat_volume_cm3: 2966,
    android_gynoid_ratio: 0.91,
    lmi_kg_m2: 22.5,
    almi_kg_m2: 8.5,
    bmd_total_g_cm2: 1.25,
    rmr_kcal_cunningham: 1798,
    rmr_kcal_mifflin: 1780,
    regions: {
      trunk: {
        lean_mass_lb: 38.18,
        fat_mass_lb: 15.92,
        bone_mass_lb: 1.26,
        total_mass_lb: 55.36,
        tissue_fat_pct: 29.42,
        region_fat_pct: 28.75,
      },
    },
    percentiles: {
      params: { gender: "male" },
      metrics: {
        limb_lmi_kg_m2: { value: 8.5, percentile: 85 },
        total_body_fat_pct: { value: 25.5, percentile: 45 },
      },
    },
    raw: { composition: {} },
  });
  if (scanError) throw scanError;

  // an earlier same-machine scan (5b): gives the newest scan a VS PREVIOUS
  // SCAN section from v_body_comp_history
  const { error: priorError } = await supabase.from("body_scans").insert({
    user_id: userId,
    provider: "bodyspec",
    provider_result_id: "e2e-res-0",
    scanned_at: "2026-04-08T10:15:00-07:00",
    scanner_model: "GE Lunar iDXA",
    weight_lb: 182.9,
    body_fat_pct: 26.1,
    lean_mass_lb: 130.5,
    fat_mass_lb: 46.0,
    bone_mass_lb: 7.0,
    raw: { composition: {} },
  });
  if (priorError) throw priorError;
});

test("More row → integration screen → scan list → detail ledger", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/workout");

  // the More settings row (09 2026-07-11 §1) — disconnected ⇒ SET UP
  await page.goto("/more");
  const row = page.getByRole("link", { name: /BodySpec DEXA/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("SET UP");
  await row.click();
  await page.waitForURL("**/more/bodyspec");

  // disconnected + unconfigured environment ⇒ the NOT AVAILABLE line, and
  // no connection/disconnect sections
  await expect(
    page.getByText("NOT AVAILABLE IN THIS ENVIRONMENT"),
  ).toBeVisible();
  await expect(page.getByText("SYNC NOW")).toHaveCount(0);
  await expect(page.getByText("DISCONNECT BODYSPEC")).toHaveCount(0);

  // imported scans render even without a live connection (they persist
  // through a disconnect unless purged, doc 15 §2.3) — newest first
  const scanRow = page.getByRole("link", { name: /8 JUL '26/ });
  await expect(scanRow).toBeVisible();
  await expect(scanRow).toContainText("GE LUNAR IDXA");
  await expect(scanRow).toContainText("25.5%");
  await expect(scanRow).toContainText("132.28");

  // …and the detail ledger renders straight off body_scans
  await scanRow.click();
  await page.waitForURL("**/more/bodyspec/*");
  await expect(page.getByText("COMPOSITION")).toBeVisible();
  await expect(page.getByText("132.28 LB")).toBeVisible();
  await expect(page.getByText("TRUNK")).toBeVisible();
  // percentile rows state flat ledger copy (doc 15 §6.2)
  await expect(page.getByText("APPENDICULAR LMI")).toBeVisible();
  await expect(page.getByText("85TH · 8.5")).toBeVisible();

  // 5b: the VS PREVIOUS SCAN section reads v_body_comp_history — a same-
  // machine pair, so deltas render, sub-LSC ones stated as in-range
  await expect(page.getByText("VS PREVIOUS SCAN")).toBeVisible();
  await expect(page.getByText("+1.78 LB")).toBeVisible();
  await expect(
    page.getByText("WITHIN MEASUREMENT RANGE").first(),
  ).toBeVisible();
  await expect(page.getByText(/DIFFERENT SCANNER/)).toHaveCount(0);
});

test("5b: the profile-update proposal is consented and resolves permanently", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/workout");

  // the newest unresolved scan proposes its measured values — the import
  // itself wrote nothing to the profile (doc 15 §2.3, never silent)
  await page.goto("/more/bodyspec");
  await expect(page.getByText(/UPDATE PROFILE\?/)).toBeVisible();
  await expect(page.getByText("184.5 LB")).toBeVisible();

  // keep current ⇒ the resolution is per-scan and permanent — no nagging
  await page.getByRole("button", { name: "KEEP CURRENT" }).click();
  await expect(page.getByText(/UPDATE PROFILE\?/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/UPDATE PROFILE\?/)).toHaveCount(0);
});
