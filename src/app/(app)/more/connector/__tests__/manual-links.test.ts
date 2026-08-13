import { describe, expect, it } from "vitest";
import { chapterRoute, resolveSection, sectionRoute } from "@/content/manual";
import { MANUAL_HOME, RULES_HREF, RULES_SECTION } from "../manual-links";

/**
 * The connector page's two links into the Guide's AI chapter.
 *
 * The page holds them as **literal strings**, because it sits outside doc 22
 * D3's import allowlist and pulling the registry in for a route would put the
 * whole manual in this page's payload (guard 1). `content/releases/links.ts`
 * holds literals for the same reason and is kept honest the same way: the test
 * does the resolving, so a renamed section fails CI rather than a reader's tap.
 */
describe("the connector page's manual links", () => {
  it("points at chapter 18 in the main Guide", () => {
    expect(MANUAL_HOME).toBe(chapterRoute("ug", "connecting-an-ai"));
  });

  it("names a section that exists", () => {
    expect(resolveSection(RULES_SECTION), RULES_SECTION).toBeDefined();
  });

  it("spells that section's route the way the router serves it", () => {
    expect(RULES_HREF).toBe(sectionRoute(RULES_SECTION));
  });
});
