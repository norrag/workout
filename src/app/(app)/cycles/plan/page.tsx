import Link from "next/link";

/** Plan-a-meso entry (fig 2.3). Copy/template/builder land in later phases. */
export default async function PlanMesoPage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string }>;
}) {
  const { slot } = await searchParams;
  const slotQuery = slot ? `?slot=${slot}` : "";

  const options = [
    {
      n: "01",
      title: "Copy a mesocycle",
      detail: "Carry progressive overload forward — start from where you left off.",
      href: `/cycles/plan/copy${slotQuery}`,
    },
    {
      n: "02",
      title: "Start with a template",
      detail: "Pick a saved split and adjust from there.",
      href: `/cycles/plan/template${slotQuery}`,
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
      detail: "Blank board. You know what you're doing.",
      href: `/cycles/plan/new${slotQuery}`,
    },
  ];

  return (
    <div>
      <Link
        href="/cycles"
        className="block text-[10px] font-medium tracking-[0.12em] text-ink/55"
      >
        ‹ CYCLES
      </Link>
      <h1 className="title-display mt-3 text-[32px]">plan a meso</h1>

      <div className="mt-5 border-t-[1.5px] border-ink">
        {options.map((opt) => {
          const inner = (
            <>
              <div className="numeral text-[11px] font-semibold text-ink/45">
                {opt.n}
              </div>
              <div className="flex-1">
                <div
                  className={`text-lg font-bold ${opt.href ? "" : "text-ink/45"}`}
                >
                  {opt.title}
                </div>
                <div
                  className={`mt-1 text-[12.5px] leading-[1.45] ${opt.href ? "text-ink/60" : "text-ink/35"}`}
                >
                  {opt.detail}
                  {!opt.href && " (soon)"}
                </div>
              </div>
              <div className="text-base text-ink/40">›</div>
            </>
          );
          return opt.href ? (
            <Link
              key={opt.n}
              href={opt.href}
              className="flex items-baseline gap-3.5 border-b border-ink/[0.18] py-[18px]"
            >
              {inner}
            </Link>
          ) : (
            <div
              key={opt.n}
              className="flex items-baseline gap-3.5 border-b border-ink/[0.18] py-[18px]"
            >
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
