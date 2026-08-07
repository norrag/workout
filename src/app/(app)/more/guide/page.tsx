import Link from "next/link";
import { notFound } from "next/navigation";
import { chaptersFor } from "@/content/manual";
import { releaseActive } from "@/lib/version";
import { UNRELEASED_VERSION } from "@/content/releases/unreleased";

/**
 * Guide — the map (fig 4.8; 09-changelog 2026-08-07 §3, built 2026-08-08 §1,
 * **amended 2026-08-09 §1**).
 *
 * A table of contents: one row per chapter, title and summary, click through
 * for its sections. It listed every section inline until owner review round 3
 * reversed that — at 21 chapters × ~6 sections an inline map is a ~130-row wall,
 * which is the untraversable-document failure doc 22 §9 exists to prevent,
 * moved onto the one screen whose whole job is orientation. The old derivation
 * optimized the tap count and ignored legibility.
 *
 * Search is what keeps the second tap from mattering: it is the 1-tap path for
 * a reader who knows what they want, and this list is for one who does not.
 */
export default async function GuideMapPage() {
  if (!releaseActive(UNRELEASED_VERSION)) notFound();
  const chapters = chaptersFor("ug");
  const sections = chapters.reduce((n, c) => n + c.sections.length, 0);

  return (
    <div>
      <Link
        href="/more"
        className="label-caps text-[10px] font-bold tracking-[0.14em] text-ink/55"
      >
        ‹ More
      </Link>
      <h1 className="title-display mt-4 text-[32px]">guide</h1>
      <p className="mt-2 text-[10px] font-medium tracking-[0.1em] text-ink/45">
        <span className="label-caps">USER GUIDE · </span>
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
        href="/more/guide/search"
        className="mt-5 flex items-center justify-between border-[1.5px] border-ink px-4 py-3.5"
      >
        <span className="text-sm font-semibold">Search the guide</span>
        <span className="label-caps text-[9.5px] font-semibold tracking-[0.1em] text-ink/55">
          Search ›
        </span>
      </Link>

      <div className="mt-6 border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
        CHAPTERS
      </div>
      {chapters.map((chapter) => (
        <Link
          key={chapter.slug}
          href={`/more/guide/${chapter.slug}`}
          className="flex items-start gap-3 border-b border-ink/15 py-3.5"
        >
          <span className="numeral mt-[2px] w-[16px] flex-shrink-0 text-[13px] font-semibold text-ink/40">
            {chapter.number}
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-bold">{chapter.title}</span>
            <span className="mt-0.5 block text-[13px] leading-[1.5] text-ink/60">
              {chapter.summary}
            </span>
          </span>
          <span className="mt-[2px] text-base text-ink/50">›</span>
        </Link>
      ))}
    </div>
  );
}
