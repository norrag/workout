import { notFound } from "next/navigation";
import { ManualMap } from "@/components/manual/ManualScreens";
import { releaseActive } from "@/lib/version";
import { UNRELEASED_VERSION } from "@/content/releases/unreleased";

/**
 * AI Manual — the map (fig 4.8 reused; 09-changelog 2026-08-13 §1).
 *
 * doc 22 D1 puts this manual under the connector page it documents, so a reader
 * who went looking for the connector finds its manual without leaving the
 * settings branch. The screen is the guide's own map component, rendering the
 * `ai` half of the registry — D4's two surfaces, one system.
 */
export default async function AiManualMapPage() {
  if (!releaseActive(UNRELEASED_VERSION)) notFound();
  return <ManualMap manual="ai" />;
}
