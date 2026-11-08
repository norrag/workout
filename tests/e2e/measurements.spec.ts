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

async function signInSynthetic(page: Page, label: string) {
  const local = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const address = `${label}-${Date.now()}@e2e.test`;
  const { data, error } = await local.auth.signUp({ email: address, password });
  if (error) throw error;
  const profile = await local
    .from("profiles")
    .update({
      display_name: "Review tester",
      onboarded_at: new Date().toISOString(),
      last_seen_version: "9.9.9",
    })
    .eq("id", data.user!.id);
  if (profile.error) throw profile.error;
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(address);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/workout");
  return { local, userId: data.user!.id };
}

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
  await page
    .getByRole("button", { name: "Close measurements", exact: true })
    .click();
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
    page.getByRole("form", { name: "edit measurements", exact: true }),
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

test("mobile measurements use document flow with actions only at the end", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.NEXT_PUBLIC_RELEASE_OVERRIDE !== "1.3.0",
    "Requires the staged build.",
  );
  const local = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const layoutEmail = "tape-layout-" + Date.now() + "@e2e.test";
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
  const entry = page.getByRole("form", {
    name: "log measurements",
    exact: true,
  });
  const fields = page.getByRole("region", {
    name: "Measurement fields",
    exact: true,
  });
  const actions = entry.getByRole("group", {
    name: "Measurement actions",
    exact: true,
  });
  const complete = entry.getByRole("button", {
    name: "Complete measurements",
    exact: true,
  });
  const close = page.getByRole("button", {
    name: "Close measurements",
    exact: true,
  });
  await expect(
    entry.getByRole("button", { name: "CANCEL", exact: true }),
  ).toHaveCount(0);
  await expect(entry).toBeVisible();
  await expect(fields).toHaveCSS("overflow-y", "visible");
  await expect(actions).toHaveCSS("position", "static");
  const anchoredAncestors = await actions.evaluate((el) => {
    const anchored: string[] = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      if (["fixed", "sticky"].includes(getComputedStyle(node).position))
        anchored.push(node.tagName);
    }
    return anchored;
  });
  expect(anchoredAncestors).toEqual([]);
  await expect(entry.getByRole("checkbox")).toHaveCount(12);
  expect(
    await entry
      .locator('input[inputmode="decimal"]')
      .evaluateAll((inputs) =>
        inputs.every(
          (input) =>
            input.getClientRects().length > 0 && !input.closest("details"),
        ),
      ),
  ).toBe(true);
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 740 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(complete).not.toBeInViewport();
    await expectNoHorizontalOverflow(page);
    const position = await actions.evaluate(
      (el) => el.getBoundingClientRect().top + window.scrollY,
    );
    await testInfo.attach("measurement-" + width + "px-top", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    const middle = Math.max(1, Math.floor((position - 740) / 2));
    await page.evaluate((top) => window.scrollTo(0, top), middle);
    await expect(complete).not.toBeInViewport();
    await testInfo.attach("measurement-" + width + "px-middle", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect(complete).toBeInViewport({ ratio: 1 });
    expect(
      await actions.evaluate(
        (el) => el.getBoundingClientRect().top + window.scrollY,
      ),
    ).toBeCloseTo(position, 0);
    const completeBox = (await complete.boundingBox())!;
    const navBox = (await page.getByRole("navigation").boundingBox())!;
    expect(completeBox.y + completeBox.height).toBeLessThanOrEqual(navBox.y);
    await expectNoHorizontalOverflow(page);
    await testInfo.attach("measurement-" + width + "px-bottom", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    const date = (await entry
      .getByLabel("DATE", { exact: true })
      .boundingBox())!;
    expect(date.height).toBe(35);
    expect(date.width).toBe(160);
    const units = (await entry
      .getByRole("group", { name: "Measurement units", exact: true })
      .locator(":scope > div")
      .boundingBox())!;
    expect(units.height).toBe(35);
    expect(units.width).toBe(88);
  }
  await page.setViewportSize({ width: 768, height: 740 });
  expect((await page.getByRole("main").boundingBox())!.width).toBe(512);
  expect((await entry.boundingBox())!.width).toBe(480);
  const chest = entry.getByLabel("Chest (in)", { exact: true });
  const check = entry.getByRole("checkbox", {
    name: "Chest complete",
    exact: true,
  });
  await check.click();
  await expect(check).not.toBeChecked();
  await expect(entry.getByRole("alert")).toHaveText(
    "Enter a measurement before checking this site.",
  );
  await expect(chest).toBeFocused();
  await expect(complete).not.toBeInViewport();
  await chest.fill("40.5");
  await expect(check).toBeChecked();
  await chest.fill("40.75");
  await expect(check).toBeChecked();
  await chest.fill("0");
  await expect(check).not.toBeChecked();
  await chest.fill("40.5");
  await entry.getByRole("button", { name: "CM", exact: true }).click();
  await expect(entry.getByLabel("Chest (cm)", { exact: true })).toHaveValue(
    "102.87",
  );
  await entry.getByRole("button", { name: "IN", exact: true }).click();
  await entry.getByLabel("Upper arm · left (in)", { exact: true }).fill("14.5");
  await entry
    .getByLabel("Upper arm · left (in)", { exact: true })
    .press("Enter");
  await expect(
    entry.getByLabel("Upper arm · right (in)", { exact: true }),
  ).toBeFocused();
  await entry.getByLabel("Calf · right (in)", { exact: true }).press("Enter");
  const note = entry.getByLabel("SESSION NOTE · OPTIONAL", { exact: true });
  await expect(note).toBeFocused();
  await entry.getByLabel("Forearm · right (in)", { exact: true }).fill("11.5");
  await note.fill("A".repeat(500));
  const cells = await entry
    .locator('input[inputmode="decimal"]')
    .evaluateAll((inputs) =>
      inputs.map((input) => ({
        height: input.getBoundingClientRect().height,
        font: getComputedStyle(input).fontSize,
      })),
    );
  expect(cells).toEqual(
    Array.from({ length: 12 }, () => ({ height: 35, font: "15px" })),
  );
  const square = (await check.locator("span").boundingBox())!;
  expect(square.width).toBe(23);
  expect(square.height).toBe(23);
  await page.setViewportSize({ width: 320, height: 400 });
  await chest.focus();
  await expect(complete).not.toBeInViewport();
  await expectNoHorizontalOverflow(page);
  await close.click();
  await expect(
    page.getByRole("dialog", { name: "Discard changes?", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(chest).toHaveValue("40.5");
  await expect(
    entry.getByLabel("Forearm · right (in)", { exact: true }),
  ).toHaveValue("11.5");
  for (const name of [
    "Chest complete",
    "Upper arm · left complete",
    "Forearm · right complete",
  ]) {
    const box = entry.getByRole("checkbox", { name, exact: true });
    await expect(box).toBeChecked();
    await box.click();
    await expect(box).not.toBeChecked();
  }
  await expect(complete).toBeEnabled();
  await complete.click();
  await expect(entry).toHaveCount(0);
  await expect(
    page.getByText("MEASUREMENTS SAVED", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("A".repeat(500), { exact: true })).toBeVisible();
  const saved = await local
    .from("measurements")
    .select("site_key")
    .eq("user_id", data.user!.id);
  expect(saved.error).toBeNull();
  expect(saved.data).toHaveLength(3);
  await expectNoHorizontalOverflow(page);
  await page
    .getByRole("button", { name: "+ LOG MEASUREMENTS", exact: true })
    .click();
  await complete.click();
  await expect(entry.getByRole("alert")).toHaveText(
    "Enter at least one measurement.",
  );
  await expect(complete).toBeInViewport({ ratio: 1 });
});

test("automatic checks and typo review allow correction or explicit confirmation", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.NEXT_PUBLIC_RELEASE_OVERRIDE !== "1.3.0",
    "Requires staged build.",
  );
  const { local, userId } = await signInSynthetic(page, "tape-typos");
  await page.goto("/more/measurements");
  const open = () =>
    page
      .getByRole("button", { name: "+ LOG MEASUREMENTS", exact: true })
      .click();
  const complete = () =>
    page
      .getByRole("button", { name: "Complete measurements", exact: true })
      .click();
  await open();
  const chest = page.getByLabel("Chest (in)", { exact: true });
  const checked = page.getByRole("checkbox", {
    name: "Chest complete",
    exact: true,
  });
  await chest.fill("405");
  await expect(checked).not.toBeChecked();
  await complete();
  await expect(
    page
      .getByRole("form", { name: "log measurements", exact: true })
      .getByRole("alert"),
  ).toHaveText("Check the measurement and unit.");
  await expect(chest).toBeFocused();
  await chest.fill("40");
  await expect(checked).toBeChecked();
  await page.getByLabel("DATE", { exact: true }).fill("2026-01-01");
  await complete();
  await expect(
    page.getByText("MEASUREMENTS SAVED", { exact: true }),
  ).toBeVisible();
  await open();
  await page.getByLabel("DATE", { exact: true }).fill("2026-02-01");
  await chest.fill("60");
  await expect(checked).toBeChecked();
  await complete();
  const review = page.getByRole("dialog", {
    name: "Check these measurements",
    exact: true,
  });
  await expect(review).toBeVisible();
  await expect(review.getByText(/Previous 40.00 IN/)).toBeVisible();
  await testInfo.attach("measurement-typo-review", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  const before = await local
    .from("measurement_sessions")
    .select("id")
    .eq("user_id", userId);
  expect(before.data).toHaveLength(1);
  await review
    .getByRole("button", { name: "Edit values", exact: true })
    .click();
  await expect(chest).toBeFocused();
  await chest.fill("41");
  await complete();
  await expect(
    page.getByText("MEASUREMENTS SAVED", { exact: true }),
  ).toBeVisible();
  await open();
  await page.getByLabel("DATE", { exact: true }).fill("2026-03-01");
  await page.getByLabel("Forearm · left (in)", { exact: true }).fill("1");
  await complete();
  await expect(review.getByText(/outside a broad entry range/)).toBeVisible();
  await review
    .getByRole("button", { name: "SAVE AS ENTERED", exact: true })
    .click();
  await expect(
    page.getByText("MEASUREMENTS SAVED", { exact: true }),
  ).toBeVisible();
  const unusual = await local
    .from("measurements")
    .select("value_in")
    .eq("user_id", userId)
    .eq("site_key", "forearm_left");
  expect(unusual.error).toBeNull();
  expect(unusual.data?.map((row) => Number(row.value_in))).toEqual([1]);
});

test("proposed 1.3 modal makes measurements the flagship without acknowledging a release", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.NEXT_PUBLIC_RELEASE_OVERRIDE !== "1.3.0",
    "Requires staged build.",
  );
  await signInSynthetic(page, "release-proposal");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/more/whats-new/preview");
  const dialog = page.getByRole("dialog", {
    name: "What's new in WORKOUT",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("opacity", "1");
  await expect(
    dialog.getByText("FOR REVIEW · NOT RELEASED", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Keep a monthly record of body measurements", {
      exact: true,
    }),
  ).toHaveCSS("font-size", "20px");
  await expect(
    dialog.getByText("Know when your AI tools need a refresh", { exact: true }),
  ).toHaveCSS("font-size", "13px");
  await expectNoHorizontalOverflow(page);
  await testInfo.attach("release-1.3-proposal-light", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  const content = dialog.locator("div.overflow-y-auto");
  const controls = [
    dialog.getByRole("button", { name: "Close release notes", exact: true }),
    dialog.getByRole("link", { name: "VIEW ALL RELEASE NOTES", exact: true }),
    dialog.getByRole("button", { name: "GOT IT", exact: true }),
  ];
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 740 });
    await expectNoHorizontalOverflow(page);
    const bounds = await dialog.boundingBox();
    expect(bounds?.width).toBe(width - 32);
    expect(bounds?.height).toBeLessThanOrEqual(708);
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveCSS(
      "font-size",
      "26px",
    );
    await expect(
      dialog.getByText("Keep a monthly record of body measurements", {
        exact: true,
      }),
    ).toHaveCSS("font-size", "20px");
    for (const control of controls) {
      await expect(control).toBeInViewport({ ratio: 1 });
      expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.setViewportSize({ width: 320, height: 480 });
  await expectNoHorizontalOverflow(page);
  await content.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(
    dialog.getByRole("link", { name: /HOW TO REFRESH/ }),
  ).toBeInViewport();
  for (const control of controls) {
    await expect(control).toBeInViewport({ ratio: 1 });
  }
  await page.setViewportSize({ width: 375, height: 844 });
  await expect(dialog.getByRole("heading", { level: 2 })).toHaveCSS(
    "font-size",
    "26px",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await content.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-theme", "dark"),
  );
  await testInfo.attach("release-1.3-proposal-dark", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  let actions = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"])
      actions += 1;
  });
  await dialog.getByRole("button", { name: "GOT IT", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto("/more/measurements");
  await expect(
    page.getByRole("button", { name: "+ LOG MEASUREMENTS", exact: true }),
  ).toBeVisible();
  expect(actions).toBe(0);
});
