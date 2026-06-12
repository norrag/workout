import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCyclesOverview } from "@/lib/queries/cycles";
import type { MesocycleRow } from "@/lib/types/database";

function MesoRow({ meso }: { meso: MesocycleRow }) {
  const isCurrent = meso.status === "active";
  return (
    <Link
      href={`/cycles/meso/${meso.id}${meso.status === "planned" ? "/plan" : ""}`}
      className="flex min-h-12 items-center justify-between py-2"
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        {isCurrent && <span className="h-2 w-2 bg-accent" aria-hidden />}
        {meso.name}
      </span>
      <span className="label-caps text-[9px] font-semibold text-ink/45">
        {meso.status === "active"
          ? "CURRENT"
          : meso.status === "planned"
            ? "PLANNED"
            : meso.status.toUpperCase()}
        {" · "}
        <span className="numeral">{meso.weeks}W</span>
      </span>
    </Link>
  );
}

/** Cycles tab (fig 2.1): macros with goal-arc slots, standalone mesos. */
export default async function CyclesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { macros, standaloneMesos } = await getCyclesOverview(
    supabase,
    user.id,
  );
  const empty = macros.length === 0 && standaloneMesos.length === 0;

  return (
    <div className="flex flex-col gap-7">
      <header className="border-b-[1.5px] border-ink pb-3">
        <h1 className="title-display text-4xl">cycles</h1>
      </header>

      {empty && (
        <section>
          <p className="text-sm text-ink/55">
            A macrocycle sets your long-term direction as an ordered arc of
            goals — cut, gain, maintain, peak. Mesocycles fill the slots and
            do the work.
          </p>
          <Link
            href="/cycles/new"
            className="label-caps mt-5 flex min-h-12 items-center justify-center border border-dashed border-ink/40 text-[11px] font-semibold text-ink/55"
          >
            + NEW MACROCYCLE
          </Link>
          <Link
            href="/cycles/plan"
            className="label-caps mt-2 flex min-h-12 items-center justify-center border border-dashed border-ink/40 text-[11px] font-semibold text-ink/55"
          >
            + PLAN A STANDALONE MESO
          </Link>
        </section>
      )}

      {macros.map((macro) => (
        <section key={macro.id}>
          <div className="flex items-baseline justify-between border-b-[1.5px] border-ink pb-1.5">
            <h2 className="label-caps text-[10px] font-bold tracking-[0.14em]">
              {macro.name}
            </h2>
            <span className="numeral text-[10px] font-semibold text-ink/45">
              {macro.start_date}
              {macro.target_end_date ? ` — ${macro.target_end_date}` : ""}
            </span>
          </div>
          <div className="flex flex-col divide-y divide-ink/15">
            {macro.slots.map((slot) => (
              <div key={slot.id} className="py-1">
                <div className="flex items-center justify-between pt-2">
                  <span className="label-caps text-[9px] font-semibold text-ink/45">
                    <span className="numeral">
                      {String(slot.slot_number).padStart(2, "0")}
                    </span>
                    {" — "}
                    {(slot.label ?? slot.goal_type).toUpperCase()}
                  </span>
                </div>
                {slot.mesocycle ? (
                  <MesoRow meso={slot.mesocycle} />
                ) : (
                  <Link
                    href={`/cycles/plan?slot=${slot.id}`}
                    className="label-caps my-2 flex min-h-11 items-center justify-center border border-dashed border-ink/40 text-[10px] font-semibold text-ink/55"
                  >
                    + PLAN
                  </Link>
                )}
              </div>
            ))}
            {macro.unslotted.map((meso) => (
              <MesoRow key={meso.id} meso={meso} />
            ))}
            {macro.slots.length === 0 && macro.unslotted.length === 0 && (
              <p className="py-3 text-sm text-ink/45">No goal slots.</p>
            )}
          </div>
        </section>
      ))}

      {standaloneMesos.length > 0 && (
        <section>
          <h2 className="label-caps border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
            STANDALONE
          </h2>
          <div className="flex flex-col divide-y divide-ink/15">
            {standaloneMesos.map((meso) => (
              <MesoRow key={meso.id} meso={meso} />
            ))}
          </div>
        </section>
      )}

      {!empty && (
        <div className="flex flex-col gap-2">
          <Link
            href="/cycles/plan"
            className="label-caps flex min-h-12 items-center justify-center border border-dashed border-ink/40 text-[11px] font-semibold text-ink/55"
          >
            + PLAN A MESOCYCLE
          </Link>
          <Link
            href="/cycles/new"
            className="label-caps flex min-h-12 items-center justify-center border border-dashed border-ink/40 text-[11px] font-semibold text-ink/55"
          >
            + NEW MACROCYCLE
          </Link>
        </div>
      )}
    </div>
  );
}
