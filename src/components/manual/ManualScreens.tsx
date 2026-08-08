import Link from "next/link";
import {
  chapterRoute,
  chaptersFor,
  MANUAL_HOME,
  MANUAL_LABEL,
  MANUAL_NAME,
  MANUAL_SEARCH_ROUTE,
  MANUAL_TITLE,
  MANUAL_ROOT,
  type ManualChapter,
  type ManualId,
} from "@/content/manual";
import { ManualChapterNav } from "./ManualBlocks";

/**
 * The two browse screens — the map (fig 4.8) and a chapter's contents (fig 4.9)
 * — as components rather than as route files (09-changelog 2026-08-13 §1).
 *
 * Phase 6 mounts both manuals' readers, and D4 says they are one system with
 * two surfaces. The section screen was already parameterized on `ManualId`
 * (`ManualSectionHeader`, `ManualBlocks`); these two were not, only because
 * Phase 1 had one manual to render. Lifting them here is what keeps the AI
 * Manual from becoming a copy of the guide that drifts a row at a time.
 *
 * Everything that varies between the manuals is *data* the screens already
 * read: the label, the title, and the screen each one hangs off.
 */

function ChapterRow({
  chapter,
  index,
}: {
  chapter: ManualChapter;
  /** what the leading numeral shows — the chapter number, or a position */
  index: number;
}) {
  return (
    <Link
      href={chapterRoute(chapter.manual, chapter.slug)}
      className="flex items-start gap-3 border-b border-ink/15 py-3.5"
    >
      <span className="numeral mt-[2px] w-[16px] flex-shrink-0 text-[13px] font-semibold text-ink/40">
        {index}
      </span>
      <span className="flex-1">
        <span className="block text-[15px] font-bold">{chapter.title}</span>
        <span className="mt-0.5 block text-[13px] leading-[1.5] text-ink/60">
          {chapter.summary}
        </span>
      </span>
      <span className="mt-[2px] text-base text-ink/50">›</span>
    </Link>
  );
}

/**
 * The map (fig 4.8, amended 2026-08-09 §1).
 *
 * A table of contents: one row per chapter, title and summary, click through
 * for its sections. It listed every section inline until owner review round 3
 * reversed that — at 21 chapters × ~6 sections an inline map is a ~130-row
 * wall, which is the untraversable-document failure doc 22 §9 exists to
 * prevent, moved onto the one screen whose whole job is orientation.
 *
 * Search is what keeps the second tap from mattering: it is the 1-tap path for
 * a reader who knows what they want, and this list is for one who does not. It
 * carries `?from=` so the search screen can send the reader back to whichever
 * manual they left (09-changelog 2026-08-13 §2).
 */
export function ManualMap({ manual }: { manual: ManualId }) {
  const chapters = chaptersFor(manual);
  const sections = chapters.reduce((n, c) => n + c.sections.length, 0);
  const home = MANUAL_HOME[manual];
  const searchHref = `${MANUAL_SEARCH_ROUTE}?from=${encodeURIComponent(MANUAL_ROOT[manual])}`;

  return (
    <div>
      <Link
        href={home.href}
        className="label-caps text-[10px] font-bold tracking-[0.14em] text-ink/55"
      >
        ‹ {home.label}
      </Link>
      <h1 className="title-display mt-4 text-[32px]">{MANUAL_TITLE[manual]}</h1>
      <p className="mt-2 text-[10px] font-medium tracking-[0.1em] text-ink/45">
        <span className="label-caps">{MANUAL_LABEL[manual]} · </span>
        <span className="numeral">{chapters.length}</span>
        <span className="label-caps">
          {chapters.length === 1 ? " CHAPTER · " : " CHAPTERS · "}
        </span>
        <span className="numeral">{sections}</span>
        <span className="label-caps">
          {sections === 1 ? " SECTION" : " SECTIONS"}
        </span>
      </p>

      <Link
        href={searchHref}
        className="mt-5 flex items-center justify-between border-[1.5px] border-ink px-4 py-3.5"
      >
        <span className="text-sm font-semibold">Search the manuals</span>
        <span className="label-caps text-[9.5px] font-semibold tracking-[0.1em] text-ink/55">
          Search ›
        </span>
      </Link>

      <div className="mt-6 border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
        CHAPTERS
      </div>
      {chapters.map((chapter) => (
        <ChapterRow
          key={chapter.slug}
          chapter={chapter}
          index={chapter.number}
        />
      ))}
    </div>
  );
}

/**
 * A chapter's contents (fig 4.9, amended 2026-08-09 §2).
 *
 * A contents page, never prose: doc 22 §9.1 makes the **section** the unit.
 * Since owner review round 3 this page is also the map's click-through, so it
 * carries chapter-level prev/next — the section footer's affordance one level
 * up, so a reader browsing the manual is never sent back to the map to move on.
 */
export function ManualChapterContents({ chapter }: { chapter: ManualChapter }) {
  const root = MANUAL_ROOT[chapter.manual];

  return (
    <div>
      <Link
        href={root}
        className="label-caps text-[10px] font-bold tracking-[0.14em] text-ink/55"
      >
        ‹ {MANUAL_NAME[chapter.manual]}
      </Link>
      <h1 className="title-display mt-4 text-[32px]">{chapter.title}</h1>
      <p className="mt-2 text-[10px] font-medium tracking-[0.1em] text-ink/45">
        <span className="label-caps">
          {MANUAL_LABEL[chapter.manual]} · CHAPTER{" "}
        </span>
        <span className="numeral">{chapter.number}</span>
      </p>
      <p className="mt-4 text-sm leading-[1.65] text-ink/60">
        {chapter.summary}
      </p>

      <div className="mt-6 border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
        SECTIONS
      </div>
      {chapter.sections.map((section, i) => (
        <Link
          key={section.slug}
          href={`${root}/${chapter.slug}/${section.slug}`}
          className="flex items-start gap-3 border-b border-ink/15 py-3.5"
        >
          <span className="numeral mt-[2px] w-[16px] flex-shrink-0 text-[13px] font-semibold text-ink/40">
            {i + 1}
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-bold">{section.title}</span>
            <span className="mt-0.5 block text-[13px] leading-[1.5] text-ink/60">
              {section.summary}
            </span>
          </span>
          <span className="mt-[2px] text-base text-ink/50">›</span>
        </Link>
      ))}

      <ManualChapterNav manual={chapter.manual} slug={chapter.slug} />
    </div>
  );
}
