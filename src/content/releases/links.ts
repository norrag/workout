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
 * Filled by doc 22 Phase 2 with chapter 6, the only chapter that existed then.
 * Phases 3 and 6 append as their chapters land.
 */
export const GUIDE_SECTION_IDS: readonly string[] = [
  // ch. 1 — What WORKOUT is (Phase 3a)
  "ug/what-workout-is#the-idea",
  "ug/what-workout-is#the-five-tabs",
  "ug/what-workout-is#the-workout-page",
  // ch. 2 — Your profile (Phase 3a)
  "ug/your-profile#what-it-is-for",
  "ug/your-profile#body-and-age",
  "ug/your-profile#experience",
  "ug/your-profile#equipment-and-exclusions",
  // ch. 3 — The cycle model (Phase 3a)
  "ug/cycle-model#the-four-layers",
  "ug/cycle-model#day-slots",
  "ug/cycle-model#finding-your-cycles",
  "ug/cycle-model#one-block-at-a-time",
  // ch. 4 — Planning a mesocycle (Phase 3b)
  "ug/planning-a-mesocycle#starting-a-block",
  "ug/planning-a-mesocycle#the-planner-board",
  "ug/planning-a-mesocycle#the-exercise-sheet",
  "ug/planning-a-mesocycle#the-volume-check",
  "ug/planning-a-mesocycle#naming-and-starting",
  "ug/planning-a-mesocycle#editing-a-running-block",
  // ch. 5 — Training a session (Phase 3c)
  "ug/training-a-session#the-day-screen",
  "ug/training-a-session#moving-between-days",
  "ug/training-a-session#logging-a-set",
  "ug/training-a-session#adjusting-as-you-go",
  "ug/training-a-session#notes",
  "ug/training-a-session#how-it-went",
  "ug/training-a-session#finishing-the-session",
  // ch. 6 — Effort: RIR and the ramp (Phase 1)
  "ug/effort-rir#what-rir-means",
  "ug/effort-rir#the-weeks-ramp",
  "ug/effort-rir#report-what-you-did",
  "ug/effort-rir#why-honesty-matters",
  "ug/effort-rir#missing-the-ask",
  "ug/effort-rir#per-exercise",
  // ch. 7 — Choosing your ramp: training styles (Phase 3d)
  "ug/choosing-your-ramp#effort-and-fatigue",
  "ug/choosing-your-ramp#why-a-ramp",
  "ug/choosing-your-ramp#four-shapes",
  "ug/choosing-your-ramp#judging-your-own-effort",
  "ug/choosing-your-ramp#what-else-a-ramp-moves",
  // ch. 8 — Exercise-level RIR (Phase 3d)
  "ug/exercise-level-rir#why-one-exercise-differs",
  "ug/exercise-level-rir#backing-an-exercise-off",
  "ug/exercise-level-rir#what-it-does-to-your-numbers",
  "ug/exercise-level-rir#pushing-an-exercise-harder",
  "ug/exercise-level-rir#how-far-it-reaches",
  // ch. 9 — Deloads (Phase 3d)
  "ug/deloads#what-a-deload-is",
  "ug/deloads#the-week-itself",
  "ug/deloads#how-it-reads-afterwards",
  "ug/deloads#when-you-need-one",
  "ug/deloads#choosing-to-have-one",
  // ch. 10 — How your next weight is chosen (Phase 3f)
  "ug/how-your-weight-is-chosen#the-anchor",
  "ug/how-your-weight-is-chosen#how-sharp-the-estimate-is",
  "ug/how-your-weight-is-chosen#from-a-number-to-a-weight",
  "ug/how-your-weight-is-chosen#reps-first-then-weight",
  "ug/how-your-weight-is-chosen#leading-by-one-step",
  "ug/how-your-weight-is-chosen#how-often-a-step-comes",
  // ch. 11 — Why the app asks how it felt (Phase 3e)
  "ug/how-it-felt#what-your-answers-do",
  "ug/how-it-felt#joint-pain-first",
  "ug/how-it-felt#workload",
  "ug/how-it-felt#pump-and-soreness",
  "ug/how-it-felt#the-session-questions",
  // ch. 12 — Volume (Phase 3e)
  "ug/volume#what-volume-means-here",
  "ug/volume#why-a-set-can-count-as-half",
  "ug/volume#the-band",
  "ug/volume#where-your-sets-show-up",
  "ug/volume#weight-lifted-is-a-different-number",
  // ch. 13 — Reading your stats (Phase 3g)
  "ug/reading-your-stats#where-to-look",
  "ug/reading-your-stats#one-lift-at-a-time",
  "ug/reading-your-stats#the-strength-trend",
  "ug/reading-your-stats#records",
  "ug/reading-your-stats#what-a-strength-read-leaves-out",
  "ug/reading-your-stats#reading-like-with-like",
  // ch. 14 — Macrocycle goals (Phase 3g)
  "ug/macrocycle-goals#the-four-goals",
  "ug/macrocycle-goals#setting-one-up",
  "ug/macrocycle-goals#the-target-behind-it",
  "ug/macrocycle-goals#how-it-paces-your-weights",
  "ug/macrocycle-goals#finishing-an-arc",
  // ch. 15 — Exercises & templates (Phase 3b)
  "ug/exercises-and-templates#finding-an-exercise",
  "ug/exercises-and-templates#what-an-exercise-remembers",
  "ug/exercises-and-templates#the-load-step",
  "ug/exercises-and-templates#your-own-exercises",
  "ug/exercises-and-templates#templates",
  "ug/exercises-and-templates#sharing-by-code",
];

export function isGuideSectionId(id: string): boolean {
  return GUIDE_SECTION_IDS.includes(id);
}
