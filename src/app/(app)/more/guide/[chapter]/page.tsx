import Link from "next/link";
import { notFound } from "next/navigation";
import { chaptersFor, resolveChapter } from "@/content/manual";
import { releaseActive } from "@/lib/version";
import { UNRELEASED_VERSION } from "@/content/releases/unreleased";

/**
 * Guide — chapter contents (fig 4.9; 09-changelog 2026-08-07 §2).
 *
 * A contents page, never prose: doc 22 §9.1 makes the **section** the unit, and
 * this page exists for orientation and for a stable breadcrumb parent. It is
 * deliberately not on the critical path to a section — Phase 2's map (fig 4.8)
 * lists sections inline so reaching one is a single tap.
 *
 * Gated on the manuals' release (doc 23 §9.2 / 22b §10.1): content lands over
 * many PRs, and ungated the guide would go live chapter by chapter with nothing
 * left for 1.1.0 to announce. Reviewed on a preview deploy through
 * `NEXT_PUBLIC_RELEASE_OVERRIDE`.
 */
export function generateStaticParams() {
  // nothing to prerender while the release is dark — the gate below is what
  // makes it a 404, this just keeps the build from emitting them
  if (!releaseActive(UNRELEASED_VERSION)) return [];
  return chaptersFor("ug").map((c) => ({ chapter: c.slug }));
}

export default async function GuideChapterPage({
  params,
}: {
  params: Promise<{ chapter: string }>;
}) {
  if (!releaseActive(UNRELEASED_VERSION)) notFound();
  const { chapter: slug } = await params;
  const chapter = resolveChapter("ug", slug);
  if (!chapter) notFound();

  return (
    <div>
      <Link
        href="/more/guide"
        className="label-caps text-[10px] font-bold tracking-[0.14em] text-ink/55"
      >
        ‹ Guide
      </Link>
      <h1 className="title-display mt-4 text-[32px]">{chapter.title}</h1>
      <p className="mt-2 text-[10px] font-medium tracking-[0.1em] text-ink/45">
        <span className="label-caps">USER GUIDE · CHAPTER </span>
        <span className="numeral">{chapter.number}</span>
      </p>
      <p className="mt-4 text-sm leading-[1.65] text-ink/60">{chapter.summary}</p>

      <div className="mt-6 border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
        SECTIONS
      </div>
      {chapter.sections.map((section, i) => (
        <Link
          key={section.slug}
          href={`/more/guide/${chapter.slug}/${section.slug}`}
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
    </div>
  );
}
