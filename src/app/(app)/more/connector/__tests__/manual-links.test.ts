import { describe, expect, it } from "vitest";
import { resolveSection, sectionRoute, MANUAL_ROOT } from "@/content/manual";
import { MANUAL_HOME, RULES_HREF, RULES_SECTION } from "../manual-links";

/**
 * doc 22 Phase 6e — the connector page's two links into the AI Manual.
 *
 * The page holds them as **literal strings**, because it sits outside doc 22
 * D3's import allowlist and pulling the registry in for a route would put the
 * whole manual in this page's payload (guard 1). `content/releases/links.ts`
 * holds literals for the same reason and is kept honest the same way: the test
 * does the resolving, so a renamed section fails CI rather than a reader's tap.
 */
describe("the connector page's manual links", () => {
  it("points at the AI Manual's own root", () => {
    expect(MANUAL_HOME).toBe(MANUAL_ROOT.ai);
  });

  it("names a section that exists", () => {
    expect(resolveSection(RULES_SECTION), RULES_SECTION).toBeDefined();
  });

  it("spells that section's route the way the router serves it", () => {
    expect(RULES_HREF).toBe(sectionRoute(RULES_SECTION));
  });
});
