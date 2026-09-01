import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCyclesOverview, getDraftMeso } from "@/lib/queries/cycles";
import { phaseLabel } from "@/lib/queries/macro";
import type { MesocycleRow } from "@/lib/types/database";
import { InlineTerm } from "@/components/ui/InlineTerm";
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
          <div className="text-[15px] font-bold text-ink-muted">
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
        <div className={`text-[15px] font-bold ${muted ? "text-ink-muted" : ""}`}>
          {meso.name}
        </div>
        <StatusMark status={meso.status} />
      </div>
      <div
        className={`mt-[3px] text-[9.5px] font-medium tracking-[0.08em] ${muted ? "text-ink/45" : "text-ink-muted"}`}
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
        <div className={`text-[15px] font-bold ${muted ? "text-ink-muted" : ""}`}>
          {meso.name}
        </div>
        <div
          className={`mt-[3px] text-[9.5px] font-medium tracking-[0.08em] ${muted ? "text-ink/45" : "text-ink-muted"}`}
        >
          {meso.weeks} WK · {meso.days_per_week} D/WK
        </div>
      </div>
      <StatusMark status={meso.status} />
    </Link>
  );
}

/** A macrocycle nobody is training any more: closed outright, or every block in
 *  it finished. Mirrors the `allComplete` line the rows already render from. */
function macroIsClosed(macro: {
  status: string;
  mesos: MesocycleRow[];
}): boolean {
  return (
    macro.status === "completed" ||
    (macro.mesos.length > 0 &&
      macro.mesos.every(
        (m) => m.status === "completed" || m.status === "abandoned",
      ))
  );
}

/** A standalone mesocycle that is over — nothing left to open or log. */
function mesoIsClosed(meso: MesocycleRow): boolean {
  return meso.status === "completed" || meso.status === "abandoned";
}

/** Cycles tab (fig 2.1): macrocycles with positioned mesocycles, standalone mesos. */
export default async function CyclesPage({
  searchParams,
}: {
  searchParams: Promise<{ completed?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [{ macros: allMacros, standaloneMesos: allStandaloneMesos }, draft, { completed }] =
    await Promise.all([
      getCyclesOverview(supabase, user.id),
      getDraftMeso(supabase, user.id),
      searchParams,
    ]);

  // N76: finished cycles are hidden by default — the list is a working surface,
  // and a year of closed blocks buries the one that is live. Only whole closed
  // CYCLES are hidden: a completed mesocycle inside a macrocycle that is still
  // running stays, because it is part of that macro's own record of progress.
  const showCompleted = completed === "1";
  const closedMacros = allMacros.filter(macroIsClosed).length;
  const closedStandalone = allStandaloneMesos.filter(mesoIsClosed).length;
  const closedCount = closedMacros + closedStandalone;
  const macros = showCompleted ? allMacros : allMacros.filter((m) => !macroIsClosed(m));
  const standaloneMesos = showCompleted
    ? allStandaloneMesos
    : allStandaloneMesos.filter((m) => !mesoIsClosed(m));

  // "nothing here" is only true when nothing exists at all — a list emptied by
  // the filter gets the toggle, not the first-run copy.
  const empty = allMacros.length === 0 && allStandaloneMesos.length === 0;

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
          {/* N81 — the two words this paragraph is built out of, marked at
              first use. Second and later uses stay plain: one mark per term per
              screen (09-changelog 2026-08-15 session 3 §2). */}
          <p className="text-sm leading-relaxed text-ink/70">
            A <InlineTerm term="macrocycle">macrocycle</InlineTerm> sets the
            long-term direction — one goal (hypertrophy, strength, cut,
            maintain) and the{" "}
            <InlineTerm term="mesocycle">mesocycles</InlineTerm> that build
            toward it. Or run a single mesocycle on its own.
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
        const allComplete = macroIsClosed(macro);
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
                  <div className="text-[9px] font-medium tracking-[0.1em] text-ink-muted">
                    {dateSpan(macro.start_date, macro.target_end_date)}
                  </div>
                </div>
                <div className="mt-[5px] flex items-center justify-between">
                  <div className="text-[9.5px] font-semibold tracking-[0.1em] text-ink-muted">
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
          <div className="pb-0.5 pt-3 text-[9px] font-semibold tracking-[0.16em] text-ink-muted">
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

      {/* everything the user has is finished — say so, or the page reads as a
          bug rather than as a filter doing its job */}
      {!empty && !showCompleted && macros.length === 0 && standaloneMesos.length === 0 && (
        <div className="mt-6">
          <p className="text-sm leading-relaxed text-ink/70">
            Nothing in progress. Every cycle you&apos;ve run is complete — start
            a new one, or show the finished ones below.
          </p>
          <Link
            href="/cycles/plan"
            className="mt-5 block border-[1.5px] border-dashed border-ink/45 py-[13px] text-center text-[11px] font-bold tracking-[0.12em] text-ink/65"
          >
            + PLAN A MESOCYCLE
          </Link>
        </div>
      )}

      {/* N76: the completed-cycle toggle. Deliberately the quietest thing on the
          page — no border, no accent, muted caps — and it carries the count so
          hidden history never reads as lost history. A link, not a control with
          state to keep: the page is a server render and `?completed=1` is the
          whole mechanism. */}
      {closedCount > 0 && (
        <Link
          href={showCompleted ? "/cycles" : "/cycles?completed=1"}
          scroll={false}
          className="mt-5 block py-3 text-center text-[9.5px] font-semibold tracking-[0.14em] text-ink/40"
        >
          {showCompleted
            ? "HIDE COMPLETED CYCLES"
            : `SHOW ${closedCount} COMPLETED CYCLE${closedCount === 1 ? "" : "S"}`}
        </Link>
      )}
    </div>
  );
}
