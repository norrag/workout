import { notFound } from "next/navigation";
import { ManualMap } from "@/components/manual/ManualScreens";
import { releaseActive } from "@/lib/version";
import { UNRELEASED_VERSION } from "@/content/releases/unreleased";

/**
 * Guide — the map (fig 4.8; 09-changelog 2026-08-07 §3, built 2026-08-08 §1,
 * amended 2026-08-09 §1).
 *
 * The screen itself is the shared `ManualMap` reader.
 */
export default async function GuideMapPage() {
  if (!releaseActive(UNRELEASED_VERSION)) notFound();
  return <ManualMap manual="ug" />;
}
