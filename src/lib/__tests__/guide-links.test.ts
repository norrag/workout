import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSection, sectionRoute } from "@/content/manual";
import { GUIDE_LINKS } from "../guide-links";

/**
 * doc 22 Phase 7 — the contract that lets `guide-links.ts` hold literal strings
 * (D3 guard 1) without them rotting. The module holds strings; this file does
 * the resolving, so a renamed *or retitled* section breaks CI rather than a
 * reader's tap. Same one-validator-two-consumers shape as doc 23 §7.2's release
 * targets.
 */

const ENTRIES = Object.entries(GUIDE_LINKS);

describe("every in-app Guide link resolves", () => {
  it("has entries at all (guards the table itself)", () => {
    expect(ENTRIES.length).toBeGreaterThan(0);
  });

  it.each(ENTRIES)("%s names a section that exists", (_key, target) => {
    expect(resolveSection(target.section), target.section).toBeDefined();
  });

  it.each(ENTRIES)(
    "%s spells the route the way the router serves it",
    (_key, target) => {
      expect(target.href).toBe(sectionRoute(target.section));
    },
  );

  /**
   * The label contract (09-changelog 2026-08-14 session 2 §1). A link promises
   * the heading the reader lands on, and the promise is asserted rather than
   * remembered: retitle a section and this fails, which is the only way the
   * promise survives someone editing one file and not the other.
   */
  it.each(ENTRIES)("%s is labelled with the section's own title", (_key, target) => {
    expect(target.label).toBe(resolveSection(target.section)!.section.title);
  });

  it("never points two links at the same section", () => {
    const sections = ENTRIES.map(([, t]) => t.section);
    expect(new Set(sections).size).toBe(sections.length);
  });
});

// ---------------------------------------------------------------------------
// source assertions — the properties that are about *where the code is*, in the
// WS-J style the manual's own guards use (`content/manual/__tests__/guards`).
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SRC = path.join(REPO_ROOT, "src");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(item.name) ? [full] : [];
  });
}

const SOURCES = walk(SRC).map((file) => ({
  rel: path.relative(REPO_ROOT, file).split(path.sep).join("/"),
  text: readFileSync(file, "utf8"),
}));

const isTest = (rel: string) =>
  rel.includes("/__tests__/") || rel.endsWith(".test.ts");

describe("the link table stays a table of strings", () => {
  it("does not import the manual registry", () => {
    // The whole reason the routes are spelled out. These call sites are the day
    // view, the planner board and the stats screens — exactly the bundles D3
    // guard 1 exists to keep the manual out of.
    const table = SOURCES.find((s) => s.rel === "src/lib/guide-links.ts")!;
    // the import form specifically — the module's own docs name the registry in
    // prose, which is the opposite of a leak
    expect(table.text).not.toMatch(
      /(?:from\s*|import\s*\(\s*)["'][^"']*content\/manual[^"']*["']/,
    );
  });
});

describe("the release gate lives in the primitive, once", () => {
  const CALLERS = SOURCES.filter(
    ({ rel, text }) =>
      !isTest(rel) &&
      rel !== "src/components/ui/GuideLink.tsx" &&
      /from\s+["']@\/components\/ui\/GuideLink["']/.test(text),
  );

  it("finds the wave-1 call sites (guards the matcher)", () => {
    expect(CALLERS.length).toBeGreaterThanOrEqual(8);
  });

  it("gates the affordance itself", () => {
    // Guide routes 404 before 1.1.0 (doc 23 §9.2), so an ungated link would
    // hand out addresses the reader cannot open. One gate, in the one place
    // that cannot be forgotten.
    const link = SOURCES.find(
      (s) => s.rel === "src/components/ui/GuideLink.tsx",
    )!;
    expect(link.text).toMatch(/releaseActive\(UNRELEASED_VERSION\)/);
  });

  it("keeps every call site on the shared table", () => {
    // A call site that hand-wrote an href would skip both the resolution and
    // the label contract above — the two things that keep a link honest.
    const freehand = CALLERS.filter(
      ({ text }) => !/GUIDE_LINKS\./.test(text),
    ).map(({ rel }) => rel);
    expect(freehand).toEqual([]);
  });
});
