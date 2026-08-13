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

  // -------------------------------------------------------------------------
  // Wave 2 (audit §3.3) — the surfaces that earned a link on every test but
  // E4, now that their dirty state is intercepted. These are the placements the
  // audit rated highest on "the reader is asking right now": each one is a
  // screen that takes an input, or changes a number that reprices training.
  // -------------------------------------------------------------------------

  /** Feedback sheet — what the three asks actually move. */
  feedbackAnswers: {
    section: "ug/how-it-felt#what-your-answers-do",
    href: "/more/guide/how-it-felt/what-your-answers-do",
    label: "What your answers do",
  },
  /** Workout Complete — the session block, which is a different lever again. */
  sessionQuestions: {
    section: "ug/how-it-felt#the-session-questions",
    href: "/more/guide/how-it-felt/the-session-questions",
    label: "The three questions at the end",
  },
  /** Effort target sheet — one slot off the week's ramp, and the repricing. */
  effortTarget: {
    section: "ug/exercise-level-rir#why-one-exercise-differs",
    href: "/more/guide/exercise-level-rir/why-one-exercise-differs",
    label: "What it does",
  },
  /** Load-step sheet — the N67 step-off-the-last-entered-weight rule. */
  loadStep: {
    section: "ug/exercises-and-templates#the-load-step",
    href: "/more/guide/exercises-and-templates/the-load-step",
    label: "The weight jump for one lift",
  },
  /** Meso Edit details — why the block ramps at all, before the ramp locks. */
  whyARamp: {
    section: "ug/choosing-your-ramp#why-a-ramp",
    href: "/more/guide/choosing-your-ramp/why-a-ramp",
    label: "Why a block ramps instead of picking one effort",
  },
  /** Planner exercise sheet — everything one planned exercise can be (N78). */
  plannedExercise: {
    section: "ug/planning-a-mesocycle#the-exercise-sheet",
    href: "/more/guide/planning-a-mesocycle/the-exercise-sheet",
    label: "The exercise sheet",
  },
  /** Create macrocycle — what the create engine is deciding on your behalf. */
  macroSetup: {
    section: "ug/macrocycle-goals#setting-one-up",
    href: "/more/guide/macrocycle-goals/setting-one-up",
    label: "Setting one up",
  },
  /** Edit macrocycle — the goal is the field with consequences downstream. */
  macroGoals: {
    section: "ug/macrocycle-goals#the-four-goals",
    href: "/more/guide/macrocycle-goals/the-four-goals",
    label: "The four goals",
  },
  /** New custom exercise — the three meanings of an entered weight (R12). */
  customExercise: {
    section: "ug/exercises-and-templates#your-own-exercises",
    href: "/more/guide/exercises-and-templates/your-own-exercises",
    label: "Making your own exercise",
  },
  /** Profile — what the six facts are read for, under the `Drives…` lines. */
  profilePurpose: {
    section: "ug/your-profile#what-it-is-for",
    href: "/more/guide/your-profile/what-it-is-for",
    label: "What the profile is for",
  },
} as const satisfies Record<string, GuideLinkTarget>;

export type GuideLinkKey = keyof typeof GUIDE_LINKS;
