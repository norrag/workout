import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/queries/profiles";
import { getMesoStats } from "@/lib/queries/stats";
import {
  BalanceView,
  PerformanceView,
} from "@/components/stats/MesoStatsViews";

// 09 2026-06-14 §4: the Volume tab was removed; meso stats are Balance (4.1) ·
// Performance (4.2) and default to Balance.
const VIEWS = ["balance", "performance"] as const;
type View = (typeof VIEWS)[number];

/** Meso stats (figs 4.1–4.2): two views (Balance · Performance) via the segmented control. */
export default async function MesoStatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ mesoId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { mesoId } = await params;
  const { view: viewParam } = await searchParams;
  const view: View = VIEWS.includes(viewParam as View)
    ? (viewParam as View)
    : "balance";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [stats, profile] = await Promise.all([
    getMesoStats(supabase, user.id, mesoId),
    getProfile(supabase, user.id),
  ]);
  if (!stats) notFound();
  const unit = profile?.units ?? "lb";

  return (
    <div>
      <Link
        href={`/cycles/meso/${mesoId}`}
        className="block text-[10px] font-medium tracking-[0.12em] text-ink/55"
      >
        ‹ MESO
      </Link>
      <div className="mt-3 flex items-end justify-between">
        <h1 className="text-[27px] font-extrabold leading-none tracking-[-0.02em]">
          Meso stats
        </h1>
        {stats.meso.status === "active" ? (
          <div className="border-[1.5px] border-accent px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-accent">
            CURRENT
          </div>
        ) : (
          <div className="border border-ink/35 px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-ink/55">
            {stats.meso.status.toUpperCase()}
          </div>
        )}
      </div>
      <div className="mt-2 text-[10.5px] font-medium tracking-[0.1em] text-ink/55">
        {stats.meso.name.toUpperCase()} · {stats.contextLine}
      </div>

      {/* segmented control */}
      <div className="mt-4 flex border-[1.5px] border-ink">
        {VIEWS.map((v, i) => {
          const active = v === view;
          return (
            <Link
              key={v}
              href={`/cycles/meso/${mesoId}/stats?view=${v}`}
              className={`flex-1 py-2.5 text-center text-[10px] tracking-[0.1em] ${
                active
                  ? "bg-ink font-bold text-bg-base"
                  : `font-medium text-ink/55 ${i > 0 ? "border-l border-ink/30" : ""}`
              }`}
            >
              {v.toUpperCase()}
            </Link>
          );
        })}
      </div>

      {view === "balance" && <BalanceView stats={stats} />}
      {view === "performance" && <PerformanceView stats={stats} unit={unit} />}
    </div>
  );
}

