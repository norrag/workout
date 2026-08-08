import { notFound } from "next/navigation";
import { chaptersFor, resolveChapter } from "@/content/manual";
import { ManualChapterContents } from "@/components/manual/ManualScreens";
import { releaseActive } from "@/lib/version";
import { UNRELEASED_VERSION } from "@/content/releases/unreleased";

/** AI Manual — chapter contents (fig 4.9 reused; 09-changelog 2026-08-13 §1). */
export function generateStaticParams() {
  if (!releaseActive(UNRELEASED_VERSION)) return [];
  return chaptersFor("ai").map((c) => ({ chapter: c.slug }));
}

export default async function AiManualChapterPage({
  params,
}: {
  params: Promise<{ chapter: string }>;
}) {
  if (!releaseActive(UNRELEASED_VERSION)) notFound();
  const { chapter: slug } = await params;
  const chapter = resolveChapter("ai", slug);
  if (!chapter) notFound();

  return <ManualChapterContents chapter={chapter} />;
}
