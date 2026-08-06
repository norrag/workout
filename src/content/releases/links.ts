// doc 23 §7.1 — deep-link targets.
//
// T7: a release note may never link to a route with a dynamic segment. "See
// your new macrocycle overview" cannot point at `/cycles/macro/<id>` because
// the reader may have no macrocycle; it points at `/cycles`, whose empty state
// does the rest. So the allowlist below is stable, ID-free routes only, and
// `link-targets.test.ts` asserts every one of them still resolves to a route
// file — a rename breaks CI rather than a user's tap.

/**
 * Every route a release entry may link to. Tab roots plus the stable pages
 * reachable without owning any particular row.
 */
export const LINKABLE_ROUTES = [
  "/workout",
  "/cycles",
  "/cycles/new",
  "/exercises",
  "/templates",
  // stats have no tab root of their own — they hang off a meso, which is
  // ID-bearing, so the linkable destination is the Cycles tab (T7)
  "/more",
  "/more/profile",
  "/more/connector",
  "/more/account",
  "/more/bodyspec",
  "/more/whats-new",
] as const;

export type LinkableRoute = (typeof LINKABLE_ROUTES)[number];

export function isLinkableRoute(href: string): href is LinkableRoute {
  return (LINKABLE_ROUTES as readonly string[]).includes(href);
}

/**
 * doc 23 §7.2 — guide targets are doc 22 §9.4 section IDs
 * (`ug/effort-rir#per-exercise`), resolved by the *same* validator doc 22
 * Phase 2 builds: one validator, two consumers (T11).
 *
 * Until that phase lands there are no valid values, which is a dependency
 * rather than a blocker — the `guide` variant simply cannot be used yet, and
 * the registry test asserts exactly that instead of silently accepting an
 * unresolvable link.
 */
export const GUIDE_SECTION_IDS: readonly string[] = [];

export function isGuideSectionId(id: string): boolean {
  return GUIDE_SECTION_IDS.includes(id);
}
