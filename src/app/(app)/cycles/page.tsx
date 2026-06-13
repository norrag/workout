import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCyclesOverview } from "@/lib/queries/cycles";
import type { MesocycleRow } from "@/lib/types/database";

function StatusMark({ meso }: { meso: MesocycleRow }) {
  if (meso.status === "completed")
    return (
      <div className="flex h-5 w-5 items-center justify-center bg-ink text-[11px] text-bg-base">
        ✓
      </div>
    );
  if (meso.status === "active")
    return (
      <div className="border-[1.5px] border-accent px-[7px] py-[3px] text-[8.5px] font-bold tracking-[0.12em] text-accent">
        CURRENT
      </div>
    );
  return <div className="h-5 w-5 border-[1.5px] border-ink/35" />;
}

function MesoRow({ meso }: { meso: MesocycleRow & { slotLine?: string } }) {
  return (
    <Link
      href={`/cycles/meso/${meso.id}${meso.status === "planned" ? "/plan" : ""}`}
      className="block border-b border-ink/[0.18] py-[11px] last:border-b-0"
    >
      <div className="flex items-center justify-between">
        <div className="text-[15px] font-bold">{meso.name}</div>
        <StatusMark meso={meso} />
      </div>
      <div className="mt-[3px] text-[9.5px] font-medium tracking-[0.08em] text-ink/55">
        {meso.slotLine ?? `${meso.weeks} WK · ${meso.days_per_week} D/WK`}
      </div>
    </Link>
  );
}

/** Cycles tab (fig 2.1): expandable macros with goal-arc slots, standalone mesos. */
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
    <div>
      <div className="flex items-center justify-between">
        <h1 className="title-display text-[32px]">cycles</h1>
        <Link
          href="/cycles/new"
          className="border-[1.5px] border-ink px-3.5 py-[9px] text-[11px] font-bold tracking-[0.1em]"
        >
          + NEW
        </Link>
      </div>

      {empty && (
        <div className="mt-6">
          <p className="text-sm leading-relaxed text-ink/70">
            A macrocycle sets the long-term direction as an ordered arc of
            goals — cut, bulk, maintain, peak. Mesocycles fill the slots and
            do the work.
          </p>
          <Link
            href="/cycles/new"
            className="mt-5 block border-[1.5px] border-dashed border-ink/45 py-[13px] text-center text-[11px] font-bold tracking-[0.12em] text-ink/65"
          >
            + NEW MACROCYCLE
          </Link>
          <Link
            href="/cycles/plan"
            className="mt-2.5 block border-[1.5px] border-dashed border-ink/45 py-[13px] text-center text-[11px] font-bold tracking-[0.12em] text-ink/65"
          >
            + PLAN A STANDALONE MESO
          </Link>
        </div>
      )}

      {macros.map((macro) => {
        const currentSlot = macro.slots.find(
          (s) => s.mesocycle?.status === "active",
        );
        const arc = macro.slots
          .map((s) => (s.label ?? s.goal_type).toUpperCase())
          .join(" → ");
        const allComplete =
          macro.slots.length > 0 &&
          macro.slots.every((s) => s.mesocycle?.status === "completed");
        return (
          <details
            key={macro.id}
            open={!allComplete}
            className="group mt-4 border-t-[1.5px] border-ink"
          >
            <summary className="flex cursor-pointer list-none items-start gap-2.5 py-[13px] [&::-webkit-details-marker]:hidden">
              <div className="mt-1 text-[10px]">
                <span className="hidden group-open:inline">▼</span>
                <span className="group-open:hidden">▶</span>
              </div>
              <div className="flex-1">
                <div className="flex items-baseline justify-between">
                  <div
                    className={`text-sm font-extrabold tracking-[0.04em] ${allComplete ? "text-ink/65" : ""}`}
                  >
                    {macro.name.toUpperCase()}
                  </div>
                  <div className="text-[9px] font-medium tracking-[0.1em] text-ink/50">
                    <span className="numeral">{macro.start_date}</span>
                    {macro.target_end_date ? (
                      <>
                        {" — "}
                        <span className="numeral">{macro.target_end_date}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="mt-1 text-[9.5px] font-medium tracking-[0.1em] text-ink/55">
                  {arc ? `GOAL ARC: ${arc}` : "NO GOAL SLOTS"}
                  {currentSlot && (
                    <>
                      {" · "}
                      <span className="font-bold text-accent">
                        ● NOW IN SLOT {currentSlot.slot_number}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </summary>
            <div className="mb-3 ml-1 border-l-2 border-ink pl-3.5">
              {macro.slots.map((slot) =>
                slot.mesocycle ? (
                  <MesoRow
                    key={slot.id}
                    meso={{
                      ...slot.mesocycle,
                      slotLine: `SLOT ${slot.slot_number} — ${(slot.label ?? slot.goal_type).toUpperCase()} · ${slot.mesocycle.weeks} WK · ${slot.mesocycle.days_per_week} D/WK`,
                    }}
                  />
                ) : (
                  <div
                    key={slot.id}
                    className="flex items-center justify-between border-b border-ink/[0.18] py-[11px] last:border-b-0"
                  >
                    <div>
                      <div className="text-[15px] font-bold text-ink/50">
                        Slot {slot.slot_number} —{" "}
                        {(slot.label ?? slot.goal_type)
                          .charAt(0)
                          .toUpperCase() +
                          (slot.label ?? slot.goal_type).slice(1)}
                      </div>
                      <div className="mt-[3px] text-[9.5px] font-medium tracking-[0.08em] text-ink/45">
                        NOT PLANNED YET
                      </div>
                    </div>
                    <Link
                      href={`/cycles/plan?slot=${slot.id}`}
                      className="border-[1.5px] border-dashed border-ink/50 px-2.5 py-1.5 text-[9px] font-bold tracking-[0.1em] text-ink/65"
                    >
                      + PLAN
                    </Link>
                  </div>
                ),
              )}
              {macro.unslotted.map((meso) => (
                <MesoRow key={meso.id} meso={meso} />
              ))}
            </div>
          </details>
        );
      })}

      {(standaloneMesos.length > 0 || !empty) && (
        <div className="mt-4 border-t-[1.5px] border-ink">
          <div className="pb-0.5 pt-3 text-[9px] font-semibold tracking-[0.16em] text-ink/50">
            STANDALONE — NO MACRO
          </div>
          {standaloneMesos.map((meso) => (
            <MesoRow key={meso.id} meso={meso} />
          ))}
          <Link
            href="/cycles/plan"
            className="my-3 block border-[1.5px] border-dashed border-ink/45 py-[11px] text-center text-[10.5px] font-semibold tracking-[0.1em] text-ink/60"
          >
            + PLAN A MESOCYCLE
          </Link>
        </div>
      )}
    </div>
  );
}
