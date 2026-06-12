import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { getMesoPlan } from "@/lib/queries/cycles";
import { StartMesoForm } from "./StartMesoForm";

const WEEKDAY_LABELS = ["", "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** Meso detail (fig 2.2): RIR ramp matrix with day-completion states. */
export default async function MesoDetailPage({
  params,
}: {
  params: Promise<{ mesoId: string }>;
}) {
  const { mesoId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const plan = await getMesoPlan(supabase, mesoId);
  if (!plan) notFound();
  const { meso, days } = plan;

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

  return (
    <div className="flex flex-col gap-6">
      <header className="border-b-[1.5px] border-ink pb-3">
        <Link
          href="/cycles"
          className="label-caps text-[10px] font-semibold text-ink/45"
        >
          ← CYCLES
        </Link>
        <h1 className="title-display mt-1 text-3xl">{meso.name}</h1>
        <p className="label-caps mt-1 text-[10px] font-semibold text-ink/55">
          {meso.status.toUpperCase()} ·{" "}
          <span className="numeral">{meso.weeks}</span> WEEKS ·{" "}
          <span className="numeral">{days.length}</span> DAYS
          {meso.includes_deload ? " · DELOAD" : ""}
        </p>
      </header>

      {/* RIR ramp matrix: weeks down, days across */}
      <section>
        <h2 className="label-caps border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
          RIR RAMP
        </h2>
        <div className="flex flex-col gap-1 pt-3">
          {(micros ?? []).length > 0
            ? (micros ?? []).map((micro) => {
                const isCurrent = micro.status === "active";
                return (
                  <div key={micro.id} className="flex items-center gap-1.5">
                    <span
                      className={`label-caps w-16 shrink-0 text-[10px] ${
                        isCurrent ? "font-bold text-accent" : "font-semibold text-ink/55"
                      }`}
                    >
                      W{micro.week_number}
                      {micro.is_deload ? " DL" : ""}
                    </span>
                    <span className="numeral w-12 shrink-0 text-[11px] font-semibold">
                      {micro.target_rir} RIR
                    </span>
                    <div className="flex flex-1 gap-1">
                      {days.map((day) => {
                        const workout = allWorkouts.find(
                          (w) =>
                            w.microcycle_id === micro.id &&
                            w.day_number === day.day_number,
                        );
                        const state = workout
                          ? workout.status
                          : micro.status === "completed"
                            ? "skipped"
                            : "unbuilt";
                        const cls =
                          state === "completed"
                            ? "bg-ink"
                            : state === "in_progress"
                              ? "border-2 border-accent"
                              : state === "planned"
                                ? "border border-ink/40"
                                : "border border-dashed border-ink/25";
                        return (
                          <div key={day.id} className={`h-6 flex-1 ${cls}`} />
                        );
                      })}
                    </div>
                  </div>
                );
              })
            : // planned meso: preview ramp, all dashed
              Array.from({ length: meso.weeks }, (_, i) => {
                const isDeload = meso.includes_deload && i === meso.weeks - 1;
                const working = meso.includes_deload
                  ? meso.weeks - 1
                  : meso.weeks;
                const t = working === 1 ? 1 : Math.min(i, working - 1) / (working - 1);
                const rir = isDeload
                  ? 4
                  : Math.round(
                      meso.rir_start + (meso.rir_end - meso.rir_start) * t,
                    );
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="label-caps w-16 shrink-0 text-[10px] font-semibold text-ink/55">
                      W{i + 1}
                      {isDeload ? " DL" : ""}
                    </span>
                    <span className="numeral w-12 shrink-0 text-[11px] font-semibold text-ink/45">
                      {rir} RIR
                    </span>
                    <div className="flex flex-1 gap-1">
                      {(days.length > 0 ? days : [null]).map((day, di) => (
                        <div
                          key={day?.id ?? di}
                          className="h-6 flex-1 border border-dashed border-ink/25"
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
        </div>
        {days.length > 0 && (
          <div className="mt-1 flex gap-1 pl-[7.5rem]">
            {days.map((day) => (
              <span
                key={day.id}
                className="label-caps flex-1 text-center text-[8px] font-medium text-ink/45"
              >
                {day.weekday ? WEEKDAY_LABELS[day.weekday] : `D${day.day_number}`}
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-col gap-2">
        {meso.status === "planned" && (
          <>
            <StartMesoForm mesoId={meso.id} />
            <Link href={`/cycles/meso/${meso.id}/plan`}>
              <Button variant="secondary" className="w-full">
                Edit plan
              </Button>
            </Link>
          </>
        )}
        {meso.status === "active" && (
          <>
            {nextWorkout && currentMicro && (
              <Link href="/workout">
                <Button variant="primary" className="w-full">
                  GO TO W{currentMicro.week_number} · D{nextWorkout.day_number}
                </Button>
              </Link>
            )}
            <Button variant="secondary" className="w-full" disabled>
              MESO STATS — SOON
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
