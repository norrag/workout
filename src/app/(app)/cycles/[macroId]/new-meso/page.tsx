import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMacrocycle } from "@/lib/queries/cycles";
import { getActiveEngineParams } from "@/lib/queries/engine";
import { listExercises } from "@/lib/queries/exercises";
import { MesoBuilder } from "./MesoBuilder";

export default async function NewMesocyclePage({
  params,
}: {
  params: Promise<{ macroId: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { macroId } = await params;
  const [macro, exercises, engine] = await Promise.all([
    getMacrocycle(supabase, macroId),
    listExercises(supabase),
    getActiveEngineParams(supabase),
  ]);
  if (!macro) notFound();

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="label-caps text-lg font-bold">New mesocycle</h1>
        <p className="text-sm text-text-secondary">
          {macro.name} · {macro.goal_type}
        </p>
      </header>
      <MesoBuilder
        macroId={macro.id}
        engineParams={engine.params}
        exercises={exercises.map((e) => ({
          id: e.id,
          name: e.name,
          equipment: e.equipment_type,
          primaryMuscle:
            e.muscles.find((m) => m.role === "primary")?.name ?? null,
        }))}
      />
    </div>
  );
}
