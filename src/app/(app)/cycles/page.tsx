import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCyclesOverview, getDraftMeso } from "@/lib/queries/cycles";
import { phaseLabel } from "@/lib/queries/macro";
import type { MesocycleRow } from "@/lib/types/database";
import { NewCycleButton } from "./NewCycleButton";
import { planMesoAction } from "./actions";

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function ym(iso: string): { mon: string; yy: string } {
  const d = new Date(`${iso}T12:00:00`);
  return { mon: MONTHS[d.getMonth()], yy: String(d.getFullYear()).slice(2) };
}

function dateSpan(start: string, end: string | null): string {
  const s = ym(start);
  if (!end) return `${s.mon} '${s.yy}`;
  const e = ym(end);
  return s.yy === e.yy
    ? `${s.mon} — ${e.mon} '${e.yy}`
    : `${s.mon} '${s.yy} — ${e.mon} '${e.yy}`;
}

function StatusMark({ status }: { status: MesocycleRow["status"] }) {
  if (status === "completed")
    return (
      <div className="flex h-5 w-5 items-center justify-center bg-ink text-[11px] text-bg-base">
        ✓
      </div>
    );
  if (status === "active")
    return (
      <div className="border-[1.5px] border-accent px-[7px] py-[3px] text-[8.5px] font-bold tracking-[0.12em] text-accent">
        CURRENT
      </div>
    );
  // N8: planned reads as a text badge (CURRENT's geometry in ink) — the
  // checkbox vocabulary is reserved for completion
  if (status === "planned")
    return (
      <div className="border-[1.5px] border-ink px-[7px] py-[3px] text-[8.5px] font-bold tracking-[0.12em] text-ink">
        PLANNED
      </div>
    );
  return <div className="h-5 w-5 border-[1.5px] border-ink/35" />;
}

/** N8: only current/completed render full ink — future mesos stay muted. */
function isFutureMeso(status: MesocycleRow["status"]): boolean {
  return status !== "active" && status !== "completed";
}

function MesoSubline({ meso }: { meso: MesocycleRow }) {
  const phase = phaseLabel(meso.phase);
  const dims = `${meso.weeks} WK · ${meso.days_per_week} D/WK`;
  if (meso.status === "unplanned")
    return (
      <>SUGGESTED — {phase || "—"} · NOT PLANNED</>
    );
  const pos = meso.position ? `MESO ${meso.position}` : "MESO";
  return (
    <>
      {pos}
      {phase ? ` · ${phase}` : ""} · {dims}
    </>
  );
}

/** A planned/active/completed meso row inside a macro. */
function MacroMesoRow({ meso }: { meso: MesocycleRow }) {
  if (meso.status === "unplanned") {
    return (
      <div className="flex items-center justify-between border-b border-ink/[0.18] py-[11px] last:border-b-0">
        <div>
          <div className="text-[15px] font-bold text-ink/50">
            Mesocycle {meso.position ?? ""}
          </div>
          <div className="mt-[3px] text-[9.5px] font-medium tracking-[0.08em] text-ink/45">
            <MesoSubline meso={meso} />
          </div>
        </div>
        <form action={planMesoAction}>
          <input type="hidden" name="meso_id" value={meso.id} />
          <button
            type="submit"
            className="border-[1.5px] border-dashed border-ink/50 px-2.5 py-1.5 text-[9px] font-bold tracking-[0.1em] text-ink/65"
          >
            + PLAN
          </button>
        </form>
      </div>
    );
  }
  const muted = isFutureMeso(meso.status);
  return (
    <Link
      href={`/cycles/meso/${meso.id}`}
      className="block border-b border-ink/[0.18] py-[11px] last:border-b-0"
    >
      <div className="flex items-center justify-between">
        <div className={`text-[15px] font-bold ${muted ? "text-ink/50" : ""}`}>
          {meso.name}
        </div>
        <StatusMark status={meso.status} />
      </div>
      <div
        className={`mt-[3px] text-[9.5px] font-medium tracking-[0.08em] ${muted ? "text-ink/45" : "text-ink/55"}`}
      >
        <MesoSubline meso={meso} />
      </div>
    </Link>
  );
}

/** A standalone meso row (no macro). */
function StandaloneRow({ meso }: { meso: MesocycleRow }) {
  const muted = isFutureMeso(meso.status);
  return (
    <Link
      href={`/cycles/meso/${meso.id}`}
      className="flex items-center justify-between border-b border-ink/[0.15] py-[11px] last:border-b-0"
    >
      <div>
        <div className={`text-[15px] font-bold ${muted ? "text-ink/50" : ""}`}>
          {meso.name}
        </div>
        <div
          className={`mt-[3px] text-[9.5px] font-medium tracking-[0.08em] ${muted ? "text-ink/45" : "text-ink/55"}`}
        >
          {meso.weeks} WK · {meso.days_per_week} D/WK
        </div>
      </div>
      <StatusMark status={meso.status} />
    </Link>
  );
}

/** Cycles tab (fig 2.1): macrocycles with positioned mesocycles, standalone mesos. */
export default async function CyclesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [{ macros, standaloneMesos }, draft] = await Promise.all([
    getCyclesOverview(supabase, user.id),
    getDraftMeso(supabase, user.id),
  ]);
  const empty = macros.length === 0 && standaloneMesos.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="title-display text-[32px]">cycles</h1>
        <NewCycleButton />
      </div>

      {draft && (
        <Link
          href={`/cycles/meso/${draft.id}/plan`}
          className="mt-4 flex items-center justify-between border-[1.5px] border-dashed border-accent/60 px-3.5 py-3"
        >
          <div>
            <div className="text-[9px] font-bold tracking-[0.14em] text-accent">
              DRAFT IN PROGRESS
            </div>
            <div className="mt-1 text-[15px] font-bold">
              {draft.name.trim() || "Untitled draft"}
            </div>
          </div>
          <div className="text-[10px] font-bold tracking-[0.1em] text-accent">
            CONTINUE EDITING ›
          </div>
        </Link>
      )}

      {empty && (
        <div className="mt-6">
          <p className="text-sm leading-relaxed text-ink/70">
            A macrocycle sets the long-term direction — one goal
            (hypertrophy, strength, cut, maintain) and the mesocycles that
            build toward it. Or run a single mesocycle on its own.
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
        const hasActive = macro.mesos.some((m) => m.status === "active");
        const allComplete =
          macro.status === "completed" ||
          (macro.mesos.length > 0 &&
            macro.mesos.every(
              (m) => m.status === "completed" || m.status === "abandoned",
            ));
        const goalLine = `GOAL ${macro.goal_type.toUpperCase()} · ${macro.mesos.length} MESOCYCLE${macro.mesos.length === 1 ? "" : "S"}${allComplete ? " · COMPLETE" : ""}`;
        return (
          <details
            key={macro.id}
            open={hasActive || (!allComplete && macro.status === "active")}
            className="group mt-4 border-t-[1.5px] border-ink"
          >
            <summary className="flex cursor-pointer list-none items-start gap-2.5 py-[13px] [&::-webkit-details-marker]:hidden">
              <div className="mt-1 text-[10px]">
                <span className="hidden group-open:inline">▼</span>
                <span className="group-open:hidden">▶</span>
              </div>
              <div className="flex-1">
                <div className="flex items-baseline justify-between">
                  <Link
                    href={`/cycles/macro/${macro.id}`}
                    className={`text-sm font-extrabold tracking-[0.03em] ${allComplete ? "text-ink/65" : ""}`}
                  >
                    {macro.name.toUpperCase()}
                  </Link>
                  <div className="text-[9px] font-medium tracking-[0.1em] text-ink/50">
                    {dateSpan(macro.start_date, macro.target_end_date)}
                  </div>
                </div>
                <div className="mt-[5px] flex items-center justify-between">
                  <div className="text-[9.5px] font-semibold tracking-[0.1em] text-ink/55">
                    {goalLine}
                  </div>
                  {!allComplete && (
                    <Link
                      href={`/cycles/macro/${macro.id}`}
                      className="border-b-[1.5px] border-ink text-[9px] font-bold tracking-[0.1em] text-ink"
                    >
                      OVERVIEW ›
                    </Link>
                  )}
                </div>
              </div>
            </summary>
            <div className="mb-3 ml-1 border-l-2 border-ink pl-3.5">
              {macro.mesos.map((meso) => (
                <MacroMesoRow key={meso.id} meso={meso} />
              ))}
            </div>
          </details>
        );
      })}

      {standaloneMesos.length > 0 && (
        <div className="mt-4 border-t-[1.5px] border-ink">
          <div className="pb-0.5 pt-3 text-[9px] font-semibold tracking-[0.16em] text-ink/50">
            STANDALONE — NO MACROCYCLE
          </div>
          {standaloneMesos.map((meso) => (
            <StandaloneRow key={meso.id} meso={meso} />
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
