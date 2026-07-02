import { redirect } from "next/navigation";

// P16 (2026-07-02): the standalone meso-stats screen is absorbed into the meso
// page's OVERVIEW | BALANCE | PERFORMANCE toggle. Old deep links land there.
export default async function MesoStatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ mesoId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { mesoId } = await params;
  const { view } = await searchParams;
  const target = view === "performance" ? "performance" : "balance";
  redirect(`/cycles/meso/${mesoId}?view=${target}`);
}
