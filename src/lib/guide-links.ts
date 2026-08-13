/**
 * doc 22 Phase 7 — every in-app link into the User Guide, in one table.
 *
 * **Literal strings, deliberately**, for the reason `content/releases/links.ts`
 * and `more/connector/manual-links.ts` hold literals: doc 22 D3 guard 1 says
 * nothing outside the manual, its renderer and the guide routes may import
 * `@/content/manual`. These call sites are the day view, the planner board and
 * the stats screens — the exact bundles the guard exists to keep the manual out
 * of. So the module holds strings and the **test** does the resolving
 * (`__tests__/guide-links.test.ts`): one validator, two consumers, the shape
 * doc 23 §7.2 already uses.
 *
 * Three fields, and the third is the load-bearing one:
 *
 * - `section` — the doc 22 §9.4.2 section ID. An API; renaming needs a redirect.
 * - `href`    — `sectionRoute(section)`, spelled out. The test asserts they agree.
 * - `label`   — **the destination section's own title, verbatim.** Not a
 *   hand-written invitation. A link reading `THE STRENGTH ANCHOR ›` promises the
 *   heading the reader lands on, and the test asserts the promise rather than
 *   trusting whoever edits this file next (09-changelog 2026-08-15 §1). The
 *   affordance uppercases it in CSS, so what is stored here stays the title.
 *
 * Which surfaces get one, and why each is earned, is
 * `docs/22e-link-placement-audit.md` §3. Do not add a row without adding it
 * there — the audit is the thing that keeps this from becoming a spray.
 */

export interface GuideLinkTarget {
  /** doc 22 §9.4.2 — `ug/<chapter>#<section>` */
  readonly section: string;
  /** the reader route for that section */
  readonly href: string;
  /** the section's own title; rendered in tracked caps by `GuideLink` */
  readonly label: string;
}

/**
 * Wave 1 (audit §3). Keys name the *reader's question*, not the screen, because
 * a section can be linked from more than one place and the question is what
 * stays true.
 */
export const GUIDE_LINKS = {
  /** Prescription details sheet — what the whole panel is priced off. */
  strengthAnchor: {
    section: "ug/how-your-weight-is-chosen#the-anchor",
    href: "/more/guide/how-your-weight-is-chosen/the-anchor",
    label: "The strength anchor",
  },
  /** Planner board — the band the weekly-sets preview judges each muscle by. */
  volumeBand: {
    section: "ug/volume#the-band",
    href: "/more/guide/volume/the-band",
    label: "The range each muscle is judged against",
  },
  /** Meso BALANCE — why a counted set can be a half. */
  setsCounted: {
    section: "ug/volume#where-your-sets-show-up",
    href: "/more/guide/volume/where-your-sets-show-up",
    label: "Where your sets show up",
  },
  /** Meso PERFORMANCE — what the per-lift percentages are. */
  strengthTrend: {
    section: "ug/reading-your-stats#the-strength-trend",
    href: "/more/guide/reading-your-stats/the-strength-trend",
    label: "The strength trend",
  },
  /** Macro OVERVIEW — what this arc is graded against (the N54-hidden band). */
  macroTarget: {
    section: "ug/macrocycle-goals#the-target-behind-it",
    href: "/more/guide/macrocycle-goals/the-target-behind-it",
    label: "The target behind it",
  },
  /** Macro PERFORMANCE — the cross-phase comparison this screen invites. */
  comparability: {
    section: "ug/reading-your-stats#reading-like-with-like",
    href: "/more/guide/reading-your-stats/reading-like-with-like",
    label: "Reading like with like",
  },
  /** Exercise OVERVIEW — what the lifetime record is made of. */
  exerciseRecord: {
    section: "ug/exercises-and-templates#what-an-exercise-remembers",
    href: "/more/guide/exercises-and-templates/what-an-exercise-remembers",
    label: "What an exercise remembers",
  },
  /** Account & data — asked before the export or the delete, not after. */
  dataStored: {
    section: "ug/your-data#what-is-stored",
    href: "/more/guide/your-data/what-is-stored",
    label: "What is stored",
  },
  /** Plan a meso — the three paths seed loads differently. */
  blockOrigins: {
    section: "ug/planning-a-mesocycle#starting-a-block",
    href: "/more/guide/planning-a-mesocycle/starting-a-block",
    label: "Where a block comes from",
  },
  /**
   * `/more/connector`'s `ACCESS & REVOCATION` hand-off. Phase 6e wrote this line
   * by hand before the primitive existed; it is an adoption, not an addition,
   * and its copy now tracks the section title like every other row.
   */
  connectorControl: {
    section: "ug/connecting-an-ai#staying-in-control",
    href: "/more/guide/connecting-an-ai/staying-in-control",
    label: "Staying in control",
  },
} as const satisfies Record<string, GuideLinkTarget>;

export type GuideLinkKey = keyof typeof GUIDE_LINKS;
