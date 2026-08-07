// The manual registry — doc 22 D2/D4.
//
// One artifact behind every consumer: the reader, the (Phase 2) search index
// and anchor map, and the (Phase 5) connector retrieval surface. Both manuals
// live in the same registry because they are one system with two surfaces (D4).
//
// **Import discipline (doc 22 D3, guard 1).** Nothing outside
// `src/content/manual/**`, `src/components/manual/**` and the guide routes may
// import this module — a link placed elsewhere in the app passes a section ID
// *string*, never an imported chapter. That is what keeps the manual out of the
// Workout tab's first load. Phase 2 turns the rule into an import-guard test in
// the WS-J style; until then it is this comment and code review.

import { UG_CHOOSING_YOUR_RAMP } from "./ug/choosing-your-ramp";
import { UG_CYCLE_MODEL } from "./ug/cycle-model";
import { UG_DELOADS } from "./ug/deloads";
import { UG_EFFORT_RIR } from "./ug/effort-rir";
import { UG_EXERCISE_LEVEL_RIR } from "./ug/exercise-level-rir";
import { UG_EXERCISES_AND_TEMPLATES } from "./ug/exercises-and-templates";
import { UG_HOW_IT_FELT } from "./ug/how-it-felt";
import { UG_PLANNING_A_MESOCYCLE } from "./ug/planning-a-mesocycle";
import { UG_TRAINING_A_SESSION } from "./ug/training-a-session";
import { UG_VOLUME } from "./ug/volume";
import { UG_WHAT_WORKOUT_IS } from "./ug/what-workout-is";
import { UG_YOUR_PROFILE } from "./ug/your-profile";
import { parseSectionId, sectionId } from "./ids";
import type { ManualChapter, ManualId, ManualSection } from "./types";

export type {
  Inline,
  ManualBlock,
  ManualBlockKind,
  ManualChapter,
  ManualId,
  ManualMark,
  ManualSection,
  RichText,
} from "./types";
export {
  chapterId,
  chapterRoute,
  isManualId,
  isSlug,
  MANUAL_LABEL,
  MANUAL_ROOT,
  parseSectionId,
  sectionId,
  sectionRoute,
} from "./ids";
export type { ParsedSectionId } from "./ids";
export {
  budgetBreaches,
  markLabel,
  measureSection,
  SECTION_BUDGET,
} from "./budget";
export type { SectionSize } from "./budget";
export { resolveOrigin } from "./origin";
export type { ManualOrigin } from "./origin";
export { FIGURE_ROOT } from "./types";

/**
 * Every chapter, in reading order within each manual.
 *
 * Phase 1 shipped one: chapter 6, the exemplar. Phase 3 fills the User Guide
 * and Phase 6 the AI Manual, each appending here. Order in this array does not
 * matter — `chaptersFor` sorts on `number`, so a chapter written out of
 * sequence still reads in its place.
 */
export const CHAPTERS: readonly ManualChapter[] = Object.freeze([
  UG_WHAT_WORKOUT_IS, // 1
  UG_YOUR_PROFILE, // 2
  UG_CYCLE_MODEL, // 3
  UG_PLANNING_A_MESOCYCLE, // 4
  UG_TRAINING_A_SESSION, // 5
  UG_EFFORT_RIR, // 6
  UG_CHOOSING_YOUR_RAMP, // 7
  UG_EXERCISE_LEVEL_RIR, // 8
  UG_DELOADS, // 9
  UG_HOW_IT_FELT, // 11
  UG_VOLUME, // 12
  UG_EXERCISES_AND_TEMPLATES, // 15
]);

export function chaptersFor(manual: ManualId): readonly ManualChapter[] {
  return CHAPTERS.filter((c) => c.manual === manual).sort(
    (a, b) => a.number - b.number,
  );
}

export function resolveChapter(
  manual: ManualId,
  slug: string,
): ManualChapter | undefined {
  return CHAPTERS.find((c) => c.manual === manual && c.slug === slug);
}

export interface ResolvedSection {
  readonly chapter: ManualChapter;
  readonly section: ManualSection;
  /** 1-based position within its chapter — the meta line's "3 OF 6" */
  readonly index: number;
  readonly id: string;
}

/**
 * The validator. doc 23 §7.2 gives it a second consumer: a release note's
 * `guide` target resolves through this, so a section ID that stops resolving
 * breaks CI rather than a reader's tap.
 */
export function resolveSection(id: string): ResolvedSection | undefined {
  const parsed = parseSectionId(id);
  if (!parsed) return undefined;
  const chapter = resolveChapter(parsed.manual, parsed.chapter);
  if (!chapter) return undefined;
  const index = chapter.sections.findIndex((s) => s.slug === parsed.section);
  if (index < 0) return undefined;
  return {
    chapter,
    section: chapter.sections[index],
    index: index + 1,
    id,
  };
}

/** Every section ID that exists, in reading order. */
export function allSectionIds(): string[] {
  return CHAPTERS.flatMap((chapter) =>
    chapter.sections.map((s) => sectionId(chapter.manual, chapter.slug, s.slug)),
  );
}

/**
 * doc 22 §9.2 — prev/next, **crossing chapter boundaries**, so reading a manual
 * cover to cover stays "next, next, next" and an adjacent section never costs a
 * trip up to the chapter page and back down (owner review round 2).
 *
 * Reading order is chapter number, then section order, within one manual: the
 * User Guide and the AI Manual are separate reads (D4), so neither ever runs
 * into the other.
 */
export function readingOrder(manual: ManualId): string[] {
  return chaptersFor(manual).flatMap((chapter) =>
    chapter.sections.map((s) => sectionId(manual, chapter.slug, s.slug)),
  );
}

export interface Adjacent {
  readonly prev?: ResolvedSection;
  readonly next?: ResolvedSection;
}

export interface AdjacentChapters {
  readonly prev?: ManualChapter;
  readonly next?: ManualChapter;
}

/**
 * doc 22 §9.2 as amended 2026-08-08 (owner review round 3). The map now lists
 * chapters only, so the chapter page is on the critical path and takes the same
 * prev/next affordance sections have — one level up, so browsing the manual
 * cover to cover works the way reading it already does.
 *
 * Ordered within one manual, like `readingOrder`: the User Guide and the AI
 * Manual are separate reads (D4), so neither ever runs into the other.
 */
export function adjacentChapters(
  manual: ManualId,
  slug: string,
): AdjacentChapters {
  const chapters = chaptersFor(manual);
  const at = chapters.findIndex((c) => c.slug === slug);
  if (at < 0) return {};
  return {
    prev: at > 0 ? chapters[at - 1] : undefined,
    next: at < chapters.length - 1 ? chapters[at + 1] : undefined,
  };
}

export function adjacentSections(id: string): Adjacent {
  const parsed = parseSectionId(id);
  if (!parsed) return {};
  const order = readingOrder(parsed.manual);
  const at = order.indexOf(id);
  if (at < 0) return {};
  return {
    prev: at > 0 ? resolveSection(order[at - 1]) : undefined,
    next: at < order.length - 1 ? resolveSection(order[at + 1]) : undefined,
  };
}

/**
 * doc 22 §8.2 — the standing caveat rendered under any section flagged
 * `estimate: true`. One sentence, one place: a guardrail restated in each
 * author's own words is how a manual drifts into overclaiming.
 */
export const ESTIMATE_CAVEAT =
  "Strength figures in this section are estimates worked out from sets you logged — a trend to read, not a max you tested.";
