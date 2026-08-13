import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GUIDE_SECTION_IDS } from "../links";
import { LINKABLE_ROUTES } from "../links";
import { allSectionIds, resolveSection } from "@/content/manual";

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

/**
 * doc 23 §7.2 / T11, closed by doc 22 Phase 2 — one validator, two consumers.
 * `links.ts` holds literal strings so the release surfaces never import manual
 * content (doc 22 D3 guard 1); this is the join that keeps them honest.
 */
describe("GUIDE_SECTION_IDS", () => {
  it("is populated — doc 22 Phase 2 owed doc 23 this export", () => {
    expect(GUIDE_SECTION_IDS.length).toBeGreaterThan(0);
  });

  it("resolves every ID through the manual registry", () => {
    for (const id of GUIDE_SECTION_IDS)
      expect(resolveSection(id), `${id} does not resolve`).toBeDefined();
  });

  it("lists each ID once, and none that the manual has dropped", () => {
    expect(new Set(GUIDE_SECTION_IDS).size).toBe(GUIDE_SECTION_IDS.length);
    const live = new Set(allSectionIds());
    for (const id of GUIDE_SECTION_IDS) expect(live.has(id), id).toBe(true);
  });

  it("covers every section the Guide publishes", () => {
    // The list was complete in practice from Phase 3 onward and nothing said
    // so. Asserting it means a new section is a linkable target the moment it
    // exists, rather than the moment someone remembers this file — the same
    // one-validator-two-consumers discipline, applied in the other direction.
    const listed = new Set(GUIDE_SECTION_IDS);
    const missing = allSectionIds().filter((id) => !listed.has(id));
    expect(missing).toEqual([]);
  });
});
