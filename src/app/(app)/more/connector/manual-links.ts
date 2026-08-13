/**
 * The connector page points into the AI chapter of the main Guide.
 *
 * **Literal strings, deliberately**, for the reason `content/releases/links.ts`
 * holds literals: this page sits outside doc 22 D3's import allowlist, so
 * pulling the manual registry in for a route (or a chapter count) would put the
 * whole manual into this page's payload and break guard 1 on its first use.
 *
 * Their own module rather than constants on `page.tsx`, because a route file
 * may only export the fields Next reserves — the build rejects anything else.
 * `__tests__/manual-links.test.ts` resolves both through the registry, so a
 * renamed section fails CI rather than a reader's tap: one validator, two
 * consumers, the same shape doc 23 §7.2 already uses.
 */

/**
 * Chapter 18's contents page — the bordered promoted row near the top.
 *
 * A *chapter* target, which is why it stays here rather than moving into
 * `src/lib/guide-links.ts`: that table is the section-level affordance
 * (doc 22 Phase 7). The `ACCESS & REVOCATION` hand-off, which *was* a pair of
 * constants here, is now `GUIDE_LINKS.connectorControl` — Phase 6e improvised
 * the line before the primitive existed.
 */
export const MANUAL_HOME = "/more/guide/connecting-an-ai";
