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
 * AI Manual — one section (fig 4.10 reused; 09-changelog 2026-08-13 §1).
 *
 * Identical to the guide's section route but for the manual it resolves in:
 * the header, the body renderer, the related list and prev/next were all
 * parameterized on `ManualId` in Phase 1, so this route is the last thing that
 * had to know which manual it was serving.
 */
export default async function AiManualSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ chapter: string; section: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  if (!releaseActive(UNRELEASED_VERSION)) notFound();
  const { chapter: chapterSlug, section: sectionSlug } = await params;
  const { from } = await searchParams;
  const id = sectionId("ai", chapterSlug, sectionSlug);
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
