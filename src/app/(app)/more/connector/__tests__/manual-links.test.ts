import { describe, expect, it } from "vitest";
import { chapterRoute } from "@/content/manual";
import { MANUAL_HOME } from "../manual-links";

/**
 * The connector page's promoted chapter row.
 *
 * The page holds it as a **literal string**, because it sits outside doc 22
 * D3's import allowlist and pulling the registry in for a route would put the
 * whole manual in this page's payload (guard 1). `content/releases/links.ts`
 * holds literals for the same reason and is kept honest the same way: the test
 * does the resolving, so a renamed chapter fails CI rather than a reader's tap.
 *
 * Its section-level sibling — the `ACCESS & REVOCATION` hand-off — moved to
 * `src/lib/guide-links.ts` at doc 22 Phase 7 and is covered by
 * `src/lib/__tests__/guide-links.test.ts` under the same rule.
 */
describe("the connector page's manual link", () => {
  it("points at chapter 18 in the main Guide", () => {
    expect(MANUAL_HOME).toBe(chapterRoute("ug", "connecting-an-ai"));
  });
});
