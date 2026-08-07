import Link from "next/link";
import { notFound } from "next/navigation";
import { chaptersFor, sectionRoute, sectionId } from "@/content/manual";
import { releaseActive } from "@/lib/version";
import { UNRELEASED_VERSION } from "@/content/releases/unreleased";

/**
 * Guide — the map (fig 4.8; 09-changelog 2026-08-07 §3, built 2026-08-08 §1).
 *
 * Every chapter with **its sections inline**, so a section is never behind a
 * chapter page: doc 22 §9.2 requires one tap from here to anywhere. Expanding
 * chapter by chapter would hide the thing being navigated, which is the whole
 * complaint the map answers.
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

      {chapters.map((chapter) => (
        <div key={chapter.slug} className="mt-6">
          <Link
            href={`/more/guide/${chapter.slug}`}
            className="label-caps flex items-baseline justify-between border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]"
          >
            <span>
              <span className="numeral">{chapter.number}</span>
              {" · "}
              {chapter.title}
            </span>
            <span className="text-ink/45">›</span>
          </Link>
          {chapter.sections.map((section) => (
            <Link
              key={section.slug}
              href={
                sectionRoute(
                  sectionId(chapter.manual, chapter.slug, section.slug),
                ) ?? "/more/guide"
              }
              className="flex items-start gap-3 border-b border-ink/15 py-3.5"
            >
              <span className="flex-1">
                <span className="block text-[15px] font-bold">
                  {section.title}
                </span>
                <span className="mt-0.5 block text-[13px] leading-[1.5] text-ink/60">
                  {section.summary}
                </span>
              </span>
              <span className="mt-[2px] text-base text-ink/50">›</span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
