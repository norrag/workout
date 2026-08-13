import { permanentRedirect } from "next/navigation";
import { legacyAiGuideDestination } from "../legacy-routes";

/** Preserve chapter bookmarks from the retired AI Manual. */
export default async function LegacyAiManualChapterPage({
  params,
}: {
  params: Promise<{ chapter: string }>;
}) {
  const { chapter } = await params;
  permanentRedirect(legacyAiGuideDestination(chapter));
}
