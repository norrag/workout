import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDraftMeso } from "@/lib/queries/cycles";
import { discardDraftAction, startScratchDraftAction } from "../actions";
import { GuideLink } from "@/components/ui/GuideLink";
import { GUIDE_LINKS } from "@/lib/guide-links";

/** Plan-a-meso entry (fig 2.4). Every path opens the planner as a draft. */
export default async function PlanMesoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const draft = await getDraftMeso(supabase, user.id);

  const options = [
    {
      n: "01",
      title: "Copy a mesocycle",
      detail: "Carry progressive overload forward — start from where you left off.",
      href: "/cycles/plan/copy",
    },
    {
      n: "02",
      title: "Start with a template",
      detail: "Pick a saved split and adjust from there.",
      href: "/cycles/plan/template",
    },
    {
      n: "03",
      title: "Meso builder",
      detail: "Generated from your muscle-group priorities — emphasize, grow, maintain.",
      href: null,
    },
    {
      n: "04",
      title: "From scratch",
      detail: "Blank board. You name it and set the weeks at the end.",
      href: null,
      scratch: true,
    },
  ];

  return (
    <div>
      <Link
        href="/cycles"
        className="block text-[10px] font-medium tracking-[0.12em] text-ink-muted"
      >
        ‹ CYCLES
      </Link>
      <h1 className="title-display mt-3 text-[32px]">plan a meso</h1>

      {draft && (
        <div className="mt-4 border-[1.5px] border-ink bg-paper px-3.5 py-3">
          <div className="text-[9px] font-bold tracking-[0.14em] text-accent">
            DRAFT IN PROGRESS
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="text-[15px] font-bold">
              {draft.name.trim() || "Untitled draft"}
            </div>
            <Link
              href={`/cycles/meso/${draft.id}/plan`}
              className="shrink-0 bg-ink px-3.5 py-2 text-[10px] font-bold tracking-[0.1em] text-bg-base"
            >
              CONTINUE EDITING ›
            </Link>
          </div>
          <p className="mt-2 text-[11px] leading-normal text-ink/60">
            Starting a new plan below replaces this draft.
          </p>
          <form action={discardDraftAction} className="mt-2.5">
            <input type="hidden" name="meso_id" value={draft.id} />
            <button
              type="submit"
              className="text-[10px] font-bold tracking-[0.1em] text-accent"
            >
              DISCARD DRAFT
            </button>
          </form>
        </div>
      )}

      <div className="mt-5 border-t-[1.5px] border-ink">
        {options.map((opt) => {
          const inner = (
            <>
              <div className="numeral text-[11px] font-semibold text-ink/45">
                {opt.n}
              </div>
              <div className="flex-1">
                <div
                  className={`text-lg font-bold ${opt.href || opt.scratch ? "" : "text-ink/45"}`}
                >
                  {opt.title}
                </div>
                <div
                  className={`mt-1 text-[12.5px] leading-[1.45] ${opt.href || opt.scratch ? "text-ink/60" : "text-ink/35"}`}
                >
                  {opt.detail}
                  {!opt.href && !opt.scratch && " (soon)"}
                </div>
              </div>
              <div className="text-base text-ink/40">›</div>
            </>
          );
          const rowClass =
            "flex w-full items-baseline gap-3.5 border-b border-ink/[0.18] py-[18px] text-left";
          if (opt.scratch) {
            return (
              <form key={opt.n} action={startScratchDraftAction}>
                <button type="submit" className={rowClass}>
                  {inner}
                </button>
              </form>
            );
          }
          return opt.href ? (
            <Link key={opt.n} href={opt.href} className={rowClass}>
              {inner}
            </Link>
          ) : (
            <div key={opt.n} className={rowClass}>
              {inner}
            </div>
          );
        })}
      </div>
      {/* doc 22 Phase 7, audit §3 #9 — the three live paths seed loads
          differently, and this screen exists to be deliberated over (E2) */}
      <GuideLink
        className="mt-4"
        to={GUIDE_LINKS.blockOrigins}
        from="/cycles/plan"
      />
    </div>
  );
}
