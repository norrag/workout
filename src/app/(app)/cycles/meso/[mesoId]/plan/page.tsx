import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMesoPlan } from "@/lib/queries/cycles";
import {
  listMuscleGroups,
  listPickerExercises,
} from "@/lib/queries/exercises";
import { PlannerBoard, type MacroContext } from "./PlannerBoard";

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

  // macro context strip (fig 2.5) — positioned mesos, no more slots
  let macroContext: MacroContext | null = null;
  if (plan.meso.macrocycle_id) {
    const [{ data: macro, error: macroError }, { data: mesos, error: mesoError }] =
      await Promise.all([
        supabase
          .from("macrocycles")
          .select("id, name, goal_type")
          .eq("id", plan.meso.macrocycle_id)
          .single(),
        supabase
          .from("mesocycles")
          .select("id, position, phase, status")
          .eq("macrocycle_id", plan.meso.macrocycle_id)
          .order("position", { ascending: true, nullsFirst: false }),
      ]);
    if (macroError) throw macroError;
    if (mesoError) throw mesoError;
    const ordered = mesos ?? [];
    const thisPos = ordered.findIndex((m) => m.id === mesoId) + 1;
    const phase = plan.meso.phase ? ` · ${plan.meso.phase.toUpperCase()}` : "";
    macroContext = {
      label: `MACRO ${macro.name.toUpperCase()} — MESO ${thisPos || "?"} OF ${ordered.length}${phase}`,
      slots: ordered.map((m) => ({
        state:
          m.id === mesoId
            ? ("this" as const)
            : m.status === "unplanned"
              ? ("open" as const)
              : ("filled" as const),
      })),
    };
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link
          href="/cycles"
          className="text-[10px] font-medium tracking-[0.12em] text-ink/55"
        >
          ‹ CYCLES
        </Link>
        <Link
          href={`/cycles/meso/${mesoId}`}
          aria-label="close planner"
          className="text-[15px] text-ink/50"
        >
          ✕
        </Link>
      </div>
      <h1 className="title-display mt-2.5 text-[27px]">
        {plan.meso.status === "planned" ? "meso plan" : "edit plan"}
      </h1>
      <div className="mt-1 text-[10px] font-medium tracking-[0.12em] text-ink/55">
        {plan.meso.name.toUpperCase()} ·{" "}
        <span className="numeral">{plan.meso.weeks}</span> WEEKS
      </div>
      <PlannerBoard
        plan={plan}
        macroContext={macroContext}
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
