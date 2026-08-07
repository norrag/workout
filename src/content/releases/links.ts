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
  // doc 22 Phase 2 — the guide map. Safe as a release-note target because the
  // release that announces it is the same one that ungates it (doc 23 §9.2).
  "/more/guide",
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
 * (`ug/effort-rir#per-exercise`), resolved by the *same* validator (doc 22
 * `resolveSection`): one validator, two consumers (T11).
 *
 * **Literal strings, deliberately.** This module is imported by the release
 * surfaces, which the What's New sheet mounts into the app shell — so importing
 * `@/content/manual` here would pull the whole manual into every page's payload
 * and break doc 22 D3's first guard on its first use. The coupling is enforced
 * the other way instead: `link-targets.test.ts` resolves every ID below through
 * the registry, so a renamed or deleted section fails CI rather than a reader's
 * tap. Phase 7's in-app links follow the same rule for the same reason.
 *
 * Filled by doc 22 Phase 2 with chapter 6, the only chapter that exists.
 * Phases 3 and 6 append as their chapters land.
 */
export const GUIDE_SECTION_IDS: readonly string[] = [
  "ug/effort-rir#what-rir-means",
  "ug/effort-rir#the-weeks-ramp",
  "ug/effort-rir#report-what-you-did",
  "ug/effort-rir#why-honesty-matters",
  "ug/effort-rir#missing-the-ask",
  "ug/effort-rir#per-exercise",
];

export function isGuideSectionId(id: string): boolean {
  return GUIDE_SECTION_IDS.includes(id);
}
