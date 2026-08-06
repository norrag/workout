import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LINKABLE_ROUTES } from "../links";

/**
 * doc 23 §7.1 — the allowlist is asserted against the App Router's route files,
 * so renaming a route breaks CI rather than a user's tap.
 */

const APP_DIR = path.resolve(__dirname, "../../../app");

/** Every route the App Router serves as a page, with route groups stripped. */
function collectRoutes(dir: string, segments: string[] = []): string[] {
  const routes: string[] = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) {
      // "(app)" is a route group — it organizes files, not URLs
      const next = /^\(.+\)$/.test(item.name)
        ? segments
        : [...segments, item.name];
      routes.push(...collectRoutes(path.join(dir, item.name), next));
    } else if (/^page\.(tsx|ts|jsx|js)$/.test(item.name)) {
      routes.push(`/${segments.join("/")}`.replace(/\/$/, "") || "/");
    }
  }
  return routes;
}

const ROUTES = new Set(collectRoutes(APP_DIR));

describe("LINKABLE_ROUTES", () => {
  it("finds the app's routes at all (guards the walker itself)", () => {
    expect(ROUTES.has("/workout")).toBe(true);
    expect(ROUTES.size).toBeGreaterThan(10);
  });

  it("every allowlisted route resolves to a page", () => {
    for (const route of LINKABLE_ROUTES)
      expect(ROUTES.has(route), `${route} has no page`).toBe(true);
  });

  it("excludes dynamic segments by construction (T7)", () => {
    for (const route of LINKABLE_ROUTES)
      expect(route.includes("["), `${route} is ID-bearing`).toBe(false);
  });

  it("lists each route once", () => {
    expect(new Set(LINKABLE_ROUTES).size).toBe(LINKABLE_ROUTES.length);
  });
});
