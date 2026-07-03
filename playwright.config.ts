import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke (R21). Requires a running local Supabase stack (`supabase start`,
 * migrations + seed applied) and a production build (`npm run build`) — the
 * webServer block then serves it. CI runs this in the dedicated e2e job.
 *
 * The app is a phone-first PWA, so the smoke drives a mobile viewport on
 * Chromium (Pixel 7 descriptor — WebKit isn't installed in CI or the
 * sandbox).
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
