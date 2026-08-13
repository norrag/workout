import { notFound } from "next/navigation";
import { chaptersFor, resolveChapter } from "@/content/manual";
import { ManualChapterContents } from "@/components/manual/ManualScreens";
import { releaseActive } from "@/lib/version";

/**
 * Guide — chapter contents (fig 4.9; 09-changelog 2026-08-07 §2, amended
 * 2026-08-09 §2). The screen is `ManualChapterContents`, shared with the AI
 * Manual (09-changelog 2026-08-13 §1).
 *
 * Gated on the manuals' release (doc 23 §9.2 / 22b §10.1): content lands over
 * many PRs, and ungated the guide would go live chapter by chapter with nothing
 * left for 1.1.0 to announce. Reviewed on a preview deploy through
 * `NEXT_PUBLIC_RELEASE_OVERRIDE`.
 */
export function generateStaticParams() {
  // nothing to prerender while the release is dark — the gate below is what
  // makes it a 404, this just keeps the build from emitting them
  if (!releaseActive("1.1.0")) return [];
  return chaptersFor("ug").map((c) => ({ chapter: c.slug }));
}

export default async function GuideChapterPage({
  params,
}: {
  params: Promise<{ chapter: string }>;
}) {
  if (!releaseActive("1.1.0")) notFound();
  const { chapter: slug } = await params;
  const chapter = resolveChapter("ug", slug);
  if (!chapter) notFound();

  return <ManualChapterContents chapter={chapter} />;
}
