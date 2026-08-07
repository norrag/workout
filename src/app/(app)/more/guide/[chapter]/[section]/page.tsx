import { notFound } from "next/navigation";
import { resolveSection, sectionId } from "@/content/manual";
import {
  ManualRelated,
  ManualSectionBody,
  ManualSectionNav,
} from "@/components/manual/ManualBlocks";
import { ManualSectionHeader } from "@/components/manual/ManualSectionHeader";
import { releaseActive } from "@/lib/version";
import { UNRELEASED_VERSION } from "@/content/releases/unreleased";

/**
 * Guide — one section (fig 4.10; 09-changelog 2026-08-07 §1, extended
 * 2026-08-08 §3).
 *
 * The atomic unit: one section, one screen, one URL, one link target, one
 * search hit (doc 22 §9.1). Phase 2 adds deep-link entry — `?from=` re-points
 * the back link at the screen the reader came from (N27) and marks the landed
 * section with the accent ■ (doc 22 §9.4.4 / §9.4.6).
 *
 * Reading `searchParams` makes this route render per request, so Phase 1's
 * `generateStaticParams` is gone. It cost nothing: the section renders from a
 * frozen in-memory registry with no I/O, and the prerendered HTML was never
 * reachable offline in the first place (the doc 22 D3 promise-3 correction —
 * see `docs/22-user-manual.md` §4).
 */
export default async function GuideSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ chapter: string; section: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  if (!releaseActive(UNRELEASED_VERSION)) notFound();
  const { chapter: chapterSlug, section: sectionSlug } = await params;
  const { from } = await searchParams;
  const id = sectionId("ug", chapterSlug, sectionSlug);
  const resolved = resolveSection(id);
  if (!resolved) notFound();

  return (
    <div>
      <ManualSectionHeader resolved={resolved} from={from} />
      <ManualSectionBody section={resolved.section} />
      <ManualRelated section={resolved.section} id={id} />
      <ManualSectionNav id={id} />
    </div>
  );
}
