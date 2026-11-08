import { expect, test } from "@playwright/test";

// The leading hidden action metadata must hydrate before the redirect boundary.
// An action response verifies hydration, rather than just finding static HTML.
test("sign-in hydrates and retains an optional return path", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const returnPath of [null, "/more/measurements"]) {
    await page.goto(
      returnPath
        ? `/sign-in?redirect=${encodeURIComponent(returnPath)}`
        : "/sign-in",
    );
    await page
      .getByLabel("Email", { exact: true })
      .filter({ visible: true })
      .fill("hydration@example.test");
    // This fails local zod validation and makes no auth-provider request.
    await page
      .getByLabel("Password", { exact: true })
      .filter({ visible: true })
      .fill("short");
    const signIn = page.getByRole("button", { name: "Sign in", exact: true });
    await signIn.click();
    await expect(
      page
        .getByText("Password must be at least 8 characters", { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(signIn).toBeEnabled();
    if (returnPath) {
      await expect(page.locator('input[name="redirect"]')).toHaveValue(
        returnPath,
      );
    } else {
      await expect(page.locator('input[name="redirect"]')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  }
});
