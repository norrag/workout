import Link from "next/link";

/** Plan-a-meso entry (fig 2.3). Copy/template/builder paths land later
 * phases; from-scratch is the working path in v1. */
export default async function PlanMesoPage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string }>;
}) {
  const { slot } = await searchParams;
  const slotQuery = slot ? `?slot=${slot}` : "";

  const options = [
    {
      label: "FROM SCRATCH",
      detail: "Build days and muscle groups on an empty board",
      href: `/cycles/plan/new${slotQuery}`,
    },
    {
      label: "START WITH A TEMPLATE",
      detail: "Prefill the board from a template — soon",
      href: null,
    },
    {
      label: "COPY A MESOCYCLE",
      detail: "Repeat a previous meso's structure — soon",
      href: null,
    },
    {
      label: "MESO BUILDER",
      detail: "Guided build from your goals — soon",
      href: null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="border-b-[1.5px] border-ink pb-3">
        <Link
          href="/cycles"
          className="label-caps text-[10px] font-semibold text-ink/45"
        >
          ← CYCLES
        </Link>
        <h1 className="title-display mt-1 text-4xl">plan a mesocycle</h1>
      </header>

      <div className="flex flex-col gap-2">
        {options.map((opt) =>
          opt.href ? (
            <Link
              key={opt.label}
              href={opt.href}
              className="border-[1.5px] border-ink px-4 py-4"
            >
              <p className="label-caps text-[11px] font-bold tracking-[0.12em]">
                {opt.label}
              </p>
              <p className="mt-1 text-sm text-ink/55">{opt.detail}</p>
            </Link>
          ) : (
            <div
              key={opt.label}
              className="border border-dashed border-ink/40 px-4 py-4"
            >
              <p className="label-caps text-[11px] font-semibold tracking-[0.12em] text-ink/45">
                {opt.label}
              </p>
              <p className="mt-1 text-sm text-ink/40">{opt.detail}</p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
