import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMesoPlan } from "@/lib/queries/cycles";
import {
  listMuscleGroups,
  listPickerExercises,
} from "@/lib/queries/exercises";
import { PlannerBoard } from "./PlannerBoard";

/** Planner board (fig 2.4): days as columns of muscle-group slots. */
export default async function MesoPlanPage({
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

  const [plan, muscleGroups, exercises, { data: links, error: linkError }] =
    await Promise.all([
      getMesoPlan(supabase, mesoId),
      listMuscleGroups(supabase),
      listPickerExercises(supabase, user.id),
      supabase.from("exercise_muscle_groups").select("exercise_id, muscle_group_id"),
    ]);
  if (linkError) throw linkError;
  if (!plan) notFound();

  const groupIdsByExercise = new Map<string, string[]>();
  for (const link of links ?? []) {
    const cur = groupIdsByExercise.get(link.exercise_id) ?? [];
    cur.push(link.muscle_group_id);
    groupIdsByExercise.set(link.exercise_id, cur);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="border-b-[1.5px] border-ink pb-3">
        <Link
          href="/cycles"
          className="label-caps text-[10px] font-semibold text-ink/45"
        >
          ← CYCLES
        </Link>
        <div className="flex items-baseline justify-between">
          <h1 className="title-display mt-1 text-3xl">{plan.meso.name}</h1>
          <Link
            href={`/cycles/meso/${mesoId}`}
            className="label-caps text-[10px] font-bold"
          >
            DONE →
          </Link>
        </div>
        <p className="label-caps mt-1 text-[10px] font-semibold text-ink/55">
          PLANNER · <span className="numeral">{plan.meso.weeks}</span> WEEKS
          {plan.meso.includes_deload ? " · DELOAD" : ""}
        </p>
      </header>
      <PlannerBoard
        plan={plan}
        muscleGroups={muscleGroups}
        exercises={exercises.map((e) => ({
          id: e.id,
          name: e.name,
          equipment_type: e.equipment_type,
          last_performed_at: e.last_performed_at,
          best_weight: e.best_weight,
          best_reps: e.best_reps,
          muscle_group_ids: groupIdsByExercise.get(e.id) ?? [],
        }))}
      />
    </div>
  );
}
