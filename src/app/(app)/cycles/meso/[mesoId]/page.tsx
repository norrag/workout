import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { MuscleChip } from "@/components/ui/MuscleChip";
import { RirBadge } from "@/components/ui/RirBadge";
import { createClient } from "@/lib/supabase/server";
import { getMesocycleDetail } from "@/lib/queries/cycles";
import { getActiveEngineParams } from "@/lib/queries/engine";
import { rirRamp } from "@/lib/engine";
import { StartMesoButton } from "./StartMesoButton";

export default async function MesocyclePage({
  params,
}: {
  params: Promise<{ mesoId: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { mesoId } = await params;
  const detail = await getMesocycleDetail(supabase, mesoId);
  if (!detail) notFound();
  const { meso, planItems, microcycles } = detail;

  // planned mesos have no microcycles yet — preview the ramp instead
  const weekPlans =
    microcycles.length > 0
      ? microcycles.map((m) => ({
          weekNumber: m.week_number,
          targetRir: m.target_rir,
          isDeload: m.is_deload,
          status: m.status as string | null,
        }))
      : rirRamp(
          meso.weeks,
          meso.includes_deload,
          meso.rir_start,
          meso.rir_end,
          (await getActiveEngineParams(supabase)).params,
        ).map((w) => ({ ...w, status: null }));

  const dayNumbers = Array.from(
    { length: meso.days_per_week },
    (_, i) => i + 1,
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h1 className="label-caps text-lg font-bold">{meso.name}</h1>
        <span className="label-caps text-xs text-text-secondary">
          {meso.status}
        </span>
      </header>

      <Card header="Weeks">
        <ol className="flex flex-col gap-2">
          {weekPlans.map((week) => (
            <li
              key={week.weekNumber}
              className="flex items-center justify-between text-sm"
            >
              <span
                className={
                  week.status === "active" ? "text-accent" : undefined
                }
              >
                Week {week.weekNumber}
                {week.status === "active" ? " — current" : ""}
              </span>
              <RirBadge rir={week.targetRir} isDeload={week.isDeload} />
            </li>
          ))}
        </ol>
      </Card>

      {dayNumbers.map((day) => {
        const slots = planItems.filter((p) => p.day_of_week === day);
        return (
          <Card key={day} header={`Day ${day}`}>
            {slots.length === 0 ? (
              <p className="text-sm text-text-secondary">Rest / unplanned.</p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {slots.map((slot) => (
                  <li key={slot.id} className="py-2">
                    <MuscleChip name={slot.primary_muscle} />
                    <p className="text-sm">{slot.exercise_name}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}

      {meso.status === "planned" && <StartMesoButton mesoId={meso.id} />}
    </div>
  );
}
