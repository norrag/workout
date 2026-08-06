import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMesoDeletionImpact, getMesoPlan } from "@/lib/queries/cycles";
import {
  listMuscleGroups,
  listPickerExercises,
} from "@/lib/queries/exercises";
import { getProfile } from "@/lib/queries/profiles";
import { getActiveEngineParams } from "@/lib/queries/generation";
import {
  muscleVolumeLandmark,
  volumeCountingWeights,
} from "@/lib/engine/volume";
import {
  PlannerBoard,
  type MacroContext,
  type VolumePreviewData,
} from "./PlannerBoard";

/** Planner board (fig 2.4): days as columns of muscle-group slots. */
export default async function MesoPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ mesoId: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { mesoId } = await params;
  const { day } = await searchParams;
  const initialDayNumber = day ? Number(day) : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [
    plan,
    muscleGroups,
    exercises,
    { data: links, error: linkError },
    profile,
    { params: engineParams },
  ] = await Promise.all([
    getMesoPlan(supabase, mesoId),
    listMuscleGroups(),
    listPickerExercises(supabase, user.id),
    supabase
      .from("exercise_muscle_groups")
      .select("exercise_id, muscle_group_id, role"),
    getProfile(supabase, user.id),
    getActiveEngineParams(supabase),
  ]);
  if (linkError) throw linkError;
  if (!plan) notFound();
  // N78 opened this surface to an in-progress meso (the save reaches only
  // not-yet-started days). A FINISHED one stays closed — its plan is part of
  // the record, and there is nothing left for an edit to reach.
  if (plan.meso.status === "completed" || plan.meso.status === "abandoned")
    redirect(`/cycles/meso/${mesoId}`);

  // logged-history flag → drives the immutability warning on SAVE CHANGES
  const { hasHistory } = await getMesoDeletionImpact(supabase, user.id, mesoId);

  const groupIdsByExercise = new Map<string, string[]>();
  for (const link of links ?? []) {
    const cur = groupIdsByExercise.get(link.exercise_id) ?? [];
    cur.push(link.muscle_group_id);
    groupIdsByExercise.set(link.exercise_id, cur);
  }

  // I12: live weekly-set preview — the board re-folds its slots per edit with
  // the shared R14 counting (roles + weights below); the landmark bands are
  // resolved here so the client never touches the params schema.
  const mgNameById = new Map(muscleGroups.map((g) => [g.id, g.name]));
  const rolesByExercise: VolumePreviewData["rolesByExercise"] = {};
  for (const link of links ?? []) {
    const name = mgNameById.get(link.muscle_group_id);
    if (!name) continue;
    (rolesByExercise[link.exercise_id] ??= []).push({
      name,
      role: link.role as "primary" | "secondary",
    });
  }
  const experience = profile?.experience_level ?? "intermediate";
  const landmarks: VolumePreviewData["landmarks"] = {};
  for (const g of muscleGroups) {
    const lm = muscleVolumeLandmark(engineParams, g.name, experience);
    if (lm) landmarks[g.name] = { mev: lm.mev, mrv: lm.mrv };
  }
  const volumePreview: VolumePreviewData = {
    rolesByExercise,
    landmarks,
    weights: volumeCountingWeights(engineParams),
  };

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
        volumePreview={volumePreview}
        hasHistory={hasHistory}
        initialDayNumber={
          initialDayNumber && !Number.isNaN(initialDayNumber)
            ? initialDayNumber
            : null
        }
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
