import Link from "next/link";
import { notFound } from "next/navigation";
import { chaptersFor, resolveSection, sectionId } from "@/content/manual";
import {
  ManualRelated,
  ManualSectionBody,
  ManualSectionNav,
} from "@/components/manual/ManualBlocks";
import { releaseActive } from "@/lib/version";
import { UNRELEASED_VERSION } from "@/content/releases/unreleased";

/**
 * Guide — one section (fig 4.10; 09-changelog 2026-08-07 §1).
 *
 * The atomic unit: one section, one screen, one URL, one link target, one
 * search hit (doc 22 §9.1). Carries its related list and prev/next, both pulled
 * forward from Phase 2 in owner review round 2 — an adjacent section should not
 * cost a trip up to the chapter page and back down. The map, search,
 * breadcrumb-back to origin, and the deep-link landing mark remain Phase 2.
 */
export function generateStaticParams() {
  if (!releaseActive(UNRELEASED_VERSION)) return [];
  return chaptersFor("ug").flatMap((c) =>
    c.sections.map((s) => ({ chapter: c.slug, section: s.slug })),
  );
}

export default async function GuideSectionPage({
  params,
}: {
  params: Promise<{ chapter: string; section: string }>;
}) {
  if (!releaseActive(UNRELEASED_VERSION)) notFound();
  const { chapter: chapterSlug, section: sectionSlug } = await params;
  const id = sectionId("ug", chapterSlug, sectionSlug);
  const resolved = resolveSection(id);
  if (!resolved) notFound();
  const { chapter, section, index } = resolved;

  return (
    <div>
      <Link
        href={`/more/guide/${chapter.slug}`}
        className="label-caps block text-[10px] font-bold tracking-[0.14em] text-ink/55"
      >
        ‹ {chapter.title}
      </Link>
      {/* a section title is a sentence, not a screen name — the app's other
          bold-heading form rather than `title-display` (09-changelog §1) */}
      <h1 className="mt-3.5 text-[22px] font-extrabold leading-[1.15] tracking-[-0.01em]">
        {section.title}
      </h1>
      <p className="mt-2 text-[10px] font-medium tracking-[0.1em] text-ink/45">
        <span className="label-caps">USER GUIDE · CH </span>
        <span className="numeral">{chapter.number}</span>
        <span className="label-caps"> · </span>
        <span className="numeral">{index}</span>
        <span className="label-caps"> OF </span>
        <span className="numeral">{chapter.sections.length}</span>
      </p>

      <ManualSectionBody section={section} />
      <ManualRelated section={section} id={id} />
      <ManualSectionNav id={id} />
    </div>
  );
}
