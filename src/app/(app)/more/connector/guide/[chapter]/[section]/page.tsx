import { permanentRedirect } from "next/navigation";
import { legacyAiGuideDestination } from "../../legacy-routes";

/** Preserve section bookmarks from the retired AI Manual. */
export default async function LegacyAiManualSectionPage({
  params,
}: {
  params: Promise<{ chapter: string; section: string }>;
}) {
  const { chapter } = await params;
  permanentRedirect(legacyAiGuideDestination(chapter));
}
