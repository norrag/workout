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

import { UG_EFFORT_RIR } from "./ug/effort-rir";
import { parseSectionId, sectionId } from "./ids";
import type { ManualChapter, ManualId, ManualSection } from "./types";

export type {
  Inline,
  ManualBlock,
  ManualBlockKind,
  ManualChapter,
  ManualId,
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
export { budgetBreaches, measureSection, SECTION_BUDGET } from "./budget";
export type { SectionSize } from "./budget";

/**
 * Every chapter, in reading order within each manual.
 *
 * Phase 1 ships one: chapter 6, the exemplar. Phase 3 fills the User Guide and
 * Phase 6 the AI Manual, each appending here.
 */
export const CHAPTERS: readonly ManualChapter[] = Object.freeze([UG_EFFORT_RIR]);

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
 * doc 22 §8.2 — the standing caveat rendered under any section flagged
 * `estimate: true`. One sentence, one place: a guardrail restated in each
 * author's own words is how a manual drifts into overclaiming.
 */
export const ESTIMATE_CAVEAT =
  "Strength figures in this section are estimates worked out from sets you logged — a trend to read, not a max you tested.";
