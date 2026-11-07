import { expect, test, type Page } from "@playwright/test";
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
  await expect(page.getByRole("checkbox")).toHaveCount(12);
  await expect(page.locator('input[inputmode="decimal"]')).toHaveCount(12);
  const chestCheck = page.getByRole("checkbox", {
    name: "Chest complete",
    exact: true,
  });
  await expect(chestCheck).not.toBeChecked();
  await chestCheck.click();
  await expect(chestCheck).toBeChecked();
  await page.getByRole("button", { name: "CM", exact: true }).click();
  await expect(page.getByLabel("Chest (cm)", { exact: true })).toHaveValue(
    "101.6",
  );
  await expect(chestCheck).toBeChecked();
  await page.getByRole("button", { name: "IN", exact: true }).click();
  await expect(page.getByLabel("Chest (in)", { exact: true })).toHaveValue(
    "40",
  );
  await page.getByLabel("DATE", { exact: true }).fill("2026-01-01");
  await page.getByLabel("Waist · navel (in)", { exact: true }).fill("34");
  await page
    .getByRole("button", { name: "Complete measurements", exact: true })
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
    .getByRole("button", { name: "Complete measurements", exact: true })
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
    .getByRole("button", { name: "Complete measurements", exact: true })
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
  // Partial sessions save checked and unchecked entered values. Deletion uses
  // the app's themed confirmation, never the browser's native prompt.
  let nativeDialogs = 0;
  page.on("dialog", async (dialog) => {
    nativeDialogs += 1;
    await dialog.dismiss();
  });
  await page.getByRole("button").filter({ hasText: "1 FEB '26" }).click();
  await page
    .getByRole("button", { name: "DELETE SESSION", exact: true })
    .click();
  const deleteDialog = page.getByRole("dialog", {
    name: "Delete measurements?",
    exact: true,
  });
  await expect(deleteDialog).toBeVisible();
  await page.getByRole("button", { name: "Keep session", exact: true }).click();
  await expect(deleteDialog).not.toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "edit measurements", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "DELETE SESSION", exact: true })
    .click();
  await deleteDialog
    .getByRole("button", { name: "DELETE", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("SESSION DELETED", { exact: true }),
  ).toBeVisible();
  expect(nativeDialogs).toBe(0);
  const remaining = await client
    .from("measurements")
    .select("site_key")
    .eq("user_id", data.user!.id);
  expect(remaining.error).toBeNull();
  expect(remaining.data).toHaveLength(2);
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-theme", "dark"),
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).not.toHaveCSS(
    "background-color",
    "rgb(244, 240, 230)",
  );
});

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    document:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.documentElement.clientWidth,
    dialog: (() => {
      const el = document.querySelector('[role="dialog"]');
      return el ? el.scrollWidth - el.clientWidth : 0;
    })(),
  }));
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.body).toBeLessThanOrEqual(1);
  expect(overflow.dialog).toBeLessThanOrEqual(1);
}

test("mobile measurement entry pins actions and contains scrolling and keyboard focus", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.NEXT_PUBLIC_RELEASE_OVERRIDE !== "1.3.0",
    "Requires the staged build.",
  );
  const local = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const layoutEmail = `tape-layout-${Date.now()}@e2e.test`;
  const { data, error } = await local.auth.signUp({
    email: layoutEmail,
    password,
  });
  if (error) throw error;
  const profile = await local
    .from("profiles")
    .update({
      display_name: "Mobile tester",
      onboarded_at: new Date().toISOString(),
      last_seen_version: "9.9.9",
    })
    .eq("id", data.user!.id);
  if (profile.error) throw profile.error;
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(layoutEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/workout");
  await page.goto("/more/measurements");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /maximum-scale=1/,
  );
  await page
    .getByRole("button", { name: "+ LOG MEASUREMENTS", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "log measurements",
    exact: true,
  });
  const scroll = page.getByRole("region", { name: "Measurement fields" });
  const complete = page.getByRole("button", {
    name: "Complete measurements",
    exact: true,
  });
  const cancel = dialog.getByRole("button", { name: "CANCEL", exact: true });
  await expect(dialog).toBeVisible();
  await expect.poll(async () => (await dialog.boundingBox())!.y).toBe(0);
  expect(
    await dialog.evaluate((el) => el.parentElement === document.body),
  ).toBe(true);
  const actions = page.getByRole("group", {
    name: "Measurement actions",
    exact: true,
  });
  await expect(actions).toHaveCSS("position", "fixed");
  await expect(dialog.getByRole("checkbox")).toHaveCount(12);
  const renderedFields = await dialog
    .locator('input[inputmode="decimal"]')
    .evaluateAll((fields) =>
      fields.every(
        (field) =>
          field.getClientRects().length > 0 && !field.closest("details"),
      ),
    );
  expect(renderedFields).toBe(true);

  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 740 });
    await expect
      .poll(async () => (await dialog.boundingBox())!.height)
      .toBe(740);
    await expect(complete).toBeInViewport({ ratio: 1 });
    await scroll.evaluate((el) => {
      el.scrollTop = 0;
    });
    await expectNoHorizontalOverflow(page);
    await testInfo.attach(`measurement-${width}px-top`, {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    const before = (await complete.boundingBox())!;
    await scroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect
      .poll(async () => (await complete.boundingBox())!.y)
      .toBeCloseTo(before.y, 0);
    const cancelBox = (await cancel.boundingBox())!;
    expect(cancelBox.y + cancelBox.height).toBeCloseTo(740, 0);
    const completeBox = (await complete.boundingBox())!;
    expect(completeBox.y + completeBox.height).toBeCloseTo(740, 0);
    const actionsBox = (await actions.boundingBox())!;
    expect(actionsBox.x).toBe(0);
    expect(actionsBox.width).toBe(width);
    await expect(complete).toBeInViewport({ ratio: 1 });
    await expect(cancel).toBeInViewport({ ratio: 1 });
    await testInfo.attach(`measurement-${width}px`, {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  }

  await page.setViewportSize({ width: 768, height: 740 });
  await expect
    .poll(
      async () => (await scroll.locator(":scope > div").boundingBox())!.width,
    )
    .toBe(512);

  await scroll.evaluate((el) => {
    el.scrollTop = 0;
  });
  const mobileChestCheck = page.getByRole("checkbox", {
    name: "Chest complete",
    exact: true,
  });
  await mobileChestCheck.click();
  await expect(mobileChestCheck).not.toBeChecked();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Enter a measurement before checking this site.",
  );
  await expect(page.getByLabel("Chest (in)", { exact: true })).toBeFocused();
  await page.getByLabel("Chest (in)", { exact: true }).fill("40.5");
  await mobileChestCheck.click();
  await expect(mobileChestCheck).toBeChecked();
  await page.getByLabel("Chest (in)", { exact: true }).fill("40.75");
  await expect(mobileChestCheck).not.toBeChecked();
  await page.getByLabel("Chest (in)", { exact: true }).fill("40.5");
  await page.getByRole("button", { name: "CM", exact: true }).click();
  await expect(page.getByLabel("Chest (cm)", { exact: true })).toHaveValue(
    "102.87",
  );
  await page.getByRole("button", { name: "IN", exact: true }).click();
  await page.getByLabel("Upper arm · left (in)", { exact: true }).fill("14.5");
  await page
    .getByLabel("Upper arm · left (in)", { exact: true })
    .press("Enter");
  await expect(
    page.getByLabel("Upper arm · right (in)", { exact: true }),
  ).toBeFocused();
  await page.getByLabel("Calf · right (in)", { exact: true }).press("Enter");
  const note = page.getByLabel("SESSION NOTE · OPTIONAL", { exact: true });
  await expect(note).toBeFocused();
  await expect(dialog).toBeVisible();
  await page.getByLabel("Forearm · right (in)", { exact: true }).fill("11.5");
  await note.fill("A".repeat(500));
  await expectNoHorizontalOverflow(page);
  const smallFonts = await dialog
    .locator('input:not([inputmode="decimal"]), textarea, select')
    .evaluateAll((fields) =>
      fields
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
        .map((el) => el.getAttribute("aria-label") ?? el.tagName),
    );
  expect(smallFonts).toEqual([]);
  const cells = await dialog
    .locator('input[inputmode="decimal"]')
    .evaluateAll((fields) =>
      fields.map((field) => ({
        height: field.getBoundingClientRect().height,
        font: getComputedStyle(field).fontSize,
      })),
    );
  expect(cells).toEqual(
    Array.from({ length: 12 }, () => ({ height: 35, font: "15px" })),
  );
  const boxSize = await mobileChestCheck.locator("span").boundingBox();
  expect(boxSize!.width).toBe(23);
  expect(boxSize!.height).toBe(23);

  // Desktop emulation cannot open an iOS keyboard. Exercise its distinct
  // visual-viewport resize/offset contract without changing the layout viewport.
  await page.setViewportSize({ width: 320, height: 740 });
  await note.focus();
  await page.evaluate(() => {
    const visible = window.visualViewport!;
    Object.defineProperty(visible, "height", {
      configurable: true,
      value: 360,
    });
    Object.defineProperty(visible, "offsetTop", {
      configurable: true,
      value: 24,
    });
    visible.dispatchEvent(new Event("resize"));
  });
  await expect
    .poll(async () => {
      const box = (await cancel.boundingBox())!;
      return box.y + box.height;
    })
    .toBeLessThanOrEqual(384);
  await expect
    .poll(async () => {
      const field = (await note.boundingBox())!;
      const region = (await scroll.boundingBox())!;
      return field.y + field.height - (region.y + region.height);
    })
    .toBeLessThanOrEqual(1);
  await expectNoHorizontalOverflow(page);
  await testInfo.attach("measurement-simulated-keyboard", {
    body: await page.screenshot({
      clip: { x: 0, y: 24, width: 320, height: 360 },
    }),
    contentType: "image/png",
  });
  await page.evaluate(() => {
    const visible = window.visualViewport!;
    Reflect.deleteProperty(visible, "height");
    Reflect.deleteProperty(visible, "offsetTop");
    visible.dispatchEvent(new Event("resize"));
  });
  await cancel.click();
  await expect(
    page.getByRole("dialog", { name: "Discard changes?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByLabel("Chest (in)", { exact: true })).toHaveValue(
    "40.5",
  );
  await expect(
    page.getByLabel("Forearm · right (in)", { exact: true }),
  ).toHaveValue("11.5");
  await complete.click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("MEASUREMENTS SAVED", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("A".repeat(500), { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page
    .getByRole("button", { name: "+ LOG MEASUREMENTS", exact: true })
    .click();
  await complete.click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(complete).toBeInViewport({ ratio: 1 });
  await expect(cancel).toBeInViewport({ ratio: 1 });
});
