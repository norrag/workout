/**
 * doc 22 Phase 6e — where the connector page points into the AI Manual.
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

/** The AI Manual's map — `MANUAL_ROOT.ai`. */
export const MANUAL_HOME = "/more/connector/guide";

/** The section the `ACCESS & REVOCATION` block hands off to. */
export const RULES_SECTION = "ai/the-rules#it-acts-as-you";

/** That section's route — `sectionRoute(RULES_SECTION)`. */
export const RULES_HREF = "/more/connector/guide/the-rules/it-acts-as-you";
