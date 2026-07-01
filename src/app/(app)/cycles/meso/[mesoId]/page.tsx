import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMesoDeletionImpact, getMesoPlan } from "@/lib/queries/cycles";
import { getActiveEngineParams } from "@/lib/queries/generation";
import { saveMesoAsTemplateAction } from "../../actions";
import { ShareRow } from "@/components/ShareRow";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { StartMesoForm } from "./StartMesoForm";
import { DeleteMesoButton } from "./DeleteMesoButton";

const WEEKDAY_LABELS = ["", "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** Meso detail (fig 2.2): RIR ramp matrix with day-completion states. */
export default async function MesoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ mesoId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { mesoId } = await params;
  // saveMesoAsTemplateAction lands back here with ?error=template on failure
  const { error: actionError } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const plan = await getMesoPlan(supabase, mesoId);
  if (!plan) notFound();
  const { meso, days } = plan;

  const deletion = await getMesoDeletionImpact(supabase, user.id, mesoId);

  const { data: micros, error: microError } = await supabase
    .from("microcycles")
    .select("*")
    .eq("mesocycle_id", mesoId)
    .order("week_number");
  if (microError) throw microError;

  let allWorkouts: import("@/lib/types/database").WorkoutRow[] = [];
  if ((micros ?? []).length > 0) {
    const { data, error } = await supabase
      .from("workouts")
      .select("*")
      .in(
        "microcycle_id",
        (micros ?? []).map((m) => m.id),
      );
    if (error) throw error;
    allWorkouts = data ?? [];
  }

  const currentMicro = (micros ?? []).find((m) => m.status === "active");
  const nextWorkout = currentMicro
    ? allWorkouts
        .filter(
          (w) =>
            w.microcycle_id === currentMicro.id &&
            (w.status === "planned" || w.status === "in_progress"),
        )
        .sort((a, b) => a.day_number - b.day_number)[0]
    : null;

  const dayCols = days.length > 0 ? days : [null];
  const gridCols = { gridTemplateColumns: `44px 52px repeat(${dayCols.length}, 1fr)` };

  // ramp values for planned mesos (no microcycles yet). The deload RIR comes from
  // the active engine params (so the preview tracks tuning, e.g. v15's 6); working
  // weeks from the meso's own ramp.
  const { params: engineParams } = await getActiveEngineParams(supabase);
  const previewRir = (weekIdx: number, isDeload: boolean) => {
    if (isDeload) return engineParams.deload.target_rir;
    const working = meso.includes_deload ? meso.weeks - 1 : meso.weeks;
    const t = working === 1 ? 1 : Math.min(weekIdx, working - 1) / (working - 1);
    return Math.round(meso.rir_start + (meso.rir_end - meso.rir_start) * t);
  };

  const weekRows =
    (micros ?? []).length > 0
      ? (micros ?? []).map((m) => ({
          key: m.id,
          weekNumber: m.week_number,
          isDeload: m.is_deload,
          targetRir: m.target_rir,
          status: m.status,
          microId: m.id,
        }))
      : Array.from({ length: meso.weeks }, (_, i) => {
          const isDeload = meso.includes_deload && i === meso.weeks - 1;
          return {
            key: String(i),
            weekNumber: i + 1,
            isDeload,
            targetRir: previewRir(i, isDeload),
            status: "unbuilt" as const,
            microId: null,
          };
        });

  const deloadRow = weekRows.find((w) => w.isDeload);

  return (
    <div>
      <Link
        href="/cycles"
        className="block text-[10px] font-medium tracking-[0.12em] text-ink/55"
      >
        ‹ CYCLES
      </Link>
      <div className="mt-3 flex items-end justify-between">
        <h1 className="text-[27px] font-extrabold leading-none tracking-[-0.02em]">
          {meso.name}
        </h1>
        {meso.status === "active" ? (
          <div className="border-[1.5px] border-accent px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-accent">
            CURRENT
          </div>
        ) : (
          <div className="border border-ink/35 px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-ink/55">
            {meso.status.toUpperCase()}
          </div>
        )}
      </div>
      <div className="mt-2 text-[10.5px] font-medium tracking-[0.1em] text-ink/55">
        <span className="numeral">{meso.weeks}</span> WEEKS ·{" "}
        <span className="numeral">{days.length}</span> DAYS/WK
        {meso.includes_deload ? " · DELOAD" : ""}
      </div>

      {/* ramp matrix */}
      <div className="mt-5 border-t-[1.5px] border-ink">
        <div
          className="grid items-center gap-1.5 pb-[5px] pt-[9px] text-[9px] font-semibold tracking-[0.12em] text-ink/50"
          style={gridCols}
        >
          <div>WK</div>
          <div>RIR</div>
          {dayCols.map((day, i) => (
            <div key={day?.id ?? i} className="text-center">
              {day?.weekday
                ? WEEKDAY_LABELS[day.weekday]
                : `D${day?.day_number ?? i + 1}`}
            </div>
          ))}
        </div>
        {weekRows.map((week, wi) => {
          const isCurrent = week.status === "active";
          const isComplete = week.status === "completed";
          const isLast = wi === weekRows.length - 1;
          return (
            <div
              key={week.key}
              className={`grid items-center gap-1.5 border-t border-ink/15 py-1.5 ${
                isLast ? "border-b-[1.5px] border-b-ink pb-2.5" : ""
              }`}
              style={gridCols}
            >
              <div
                className={`text-[15px] font-bold ${isComplete || isCurrent ? "" : "text-ink/50"} ${week.isDeload ? "text-[13px] tracking-[0.06em]" : ""}`}
              >
                {week.isDeload ? "DL" : week.weekNumber}
              </div>
              <div
                className={`numeral text-xs ${
                  isCurrent
                    ? "font-bold text-accent"
                    : isComplete
                      ? "font-semibold text-ink/60"
                      : "font-semibold text-ink/45"
                }`}
              >
                {week.targetRir}
              </div>
              {dayCols.map((day, di) => {
                const workout = week.microId
                  ? allWorkouts.find(
                      (w) =>
                        w.microcycle_id === week.microId &&
                        w.day_number === day?.day_number,
                    )
                  : null;
                const done = workout?.status === "completed";
                const isNextCell =
                  isCurrent && workout && nextWorkout?.id === workout.id;
                if (done)
                  return (
                    <Link
                      key={day?.id ?? di}
                      href={`/log/${workout!.id}`}
                      className="flex h-[38px] items-center justify-center bg-ink text-xs text-bg-base"
                    >
                      ✓
                    </Link>
                  );
                if (isNextCell)
                  return (
                    <Link
                      key={day?.id ?? di}
                      href={`/log/${workout.id}`}
                      className="flex h-[38px] items-center justify-center border-2 border-accent text-[9.5px] font-bold tracking-[0.06em] text-accent"
                    >
                      D{day?.day_number}
                    </Link>
                  );
                if (isCurrent && workout)
                  return (
                    <Link
                      key={day?.id ?? di}
                      href={`/log/${workout.id}`}
                      className="flex h-[38px] items-center justify-center border border-ink/35 text-[9.5px] font-medium text-ink/50"
                    >
                      D{day?.day_number}
                    </Link>
                  );
                const cellClass = `flex h-[38px] items-center justify-center text-[9px] font-medium tracking-[0.06em] text-ink/40 ${week.isDeload || week.status === "unbuilt" ? "border border-dashed border-ink/35" : "border border-ink/[0.22]"}`;
                // empty/future cell → read-only planned day (basic exercises)
                return day ? (
                  <Link
                    key={day.id}
                    href={`/cycles/meso/${meso.id}/planned/${week.weekNumber}/${day.day_number}`}
                    className={cellClass}
                  >
                    D{day.day_number}
                  </Link>
                ) : (
                  <div key={di} className={cellClass} />
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[9.5px] font-medium tracking-[0.1em] text-ink/50">
        <span>
          RAMP {meso.rir_start} → {meso.rir_end} RIR
        </span>
        {deloadRow && (
          <span>
            DELOAD W{deloadRow.weekNumber} — {deloadRow.targetRir} RIR
          </span>
        )}
      </div>

      <div className="mt-5 flex gap-2.5">
        {/* Once any set is logged the plan is locked here — edits (add/remove/
            reorder/substitute) are made directly from the workout page so the
            engine and logged history stay consistent. */}
        {!deletion.hasHistory && (
          <Link
            href={`/cycles/meso/${meso.id}/plan`}
            className="flex-1 border-[1.5px] border-ink py-[13px] text-center text-[11px] font-bold tracking-[0.1em]"
          >
            {meso.status === "planned" ? "EDIT PLAN" : "EDIT WEEKS"}
          </Link>
        )}
        {meso.status === "active" && nextWorkout && currentMicro ? (
          <Link
            href={`/log/${nextWorkout.id}`}
            className="flex-1 bg-ink py-[13px] text-center text-[11px] font-bold tracking-[0.1em] text-bg-base"
          >
            GO TO W{currentMicro.week_number}·D{nextWorkout.day_number}
          </Link>
        ) : meso.status === "planned" ? (
          <div className="flex-1">
            <StartMesoForm mesoId={meso.id} />
          </div>
        ) : null}
      </div>
      {deletion.hasHistory && (
        <p className="mt-2 text-[11px] leading-normal text-ink/55">
          This mesocycle has logged workouts, so its plan is locked here. Adjust
          exercises, order, or substitutions from the workout page — changes carry
          forward to the same day in future weeks.
        </p>
      )}
      <Link
        href={`/cycles/meso/${meso.id}/stats`}
        className="mt-2.5 block border border-ink/35 py-3 text-center text-[11px] font-semibold tracking-[0.1em] text-ink/70"
      >
        MESO STATS — VOLUME · BALANCE · PERFORMANCE ›
      </Link>
      {days.some((d) => d.groups.some((g) => g.fills.length > 0)) && (
        <form action={saveMesoAsTemplateAction}>
          <input type="hidden" name="meso_id" value={meso.id} />
          <SubmitButton
            pendingLabel="SAVING…"
            className="mt-2.5 w-full border border-ink/35 py-3 text-center text-[11px] font-semibold tracking-[0.1em] text-ink/70"
          >
            SAVE AS TEMPLATE
          </SubmitButton>
          {actionError === "template" && (
            <p className="mt-1.5 text-[11px] leading-normal text-accent">
              Couldn&apos;t save this plan as a template — try again.
            </p>
          )}
        </form>
      )}
      {days.some((d) => d.groups.some((g) => g.fills.length > 0)) && (
        <ShareRow objectType="mesocycle" objectId={meso.id} />
      )}
      <DeleteMesoButton
        mesoId={meso.id}
        mesoName={meso.name}
        loggedSets={deletion.loggedSets}
        hasHistory={deletion.hasHistory}
      />
    </div>
  );
}
