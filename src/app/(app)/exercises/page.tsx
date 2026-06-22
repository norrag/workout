import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listExercises, listMuscleGroups } from "@/lib/queries/exercises";
import { ExercisesBrowser } from "./ExercisesBrowser";

/** Exercise library (fig 3.1): loads the library; the browser filters client-side. */
export default async function ExercisesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [exercises, muscleGroups, { data: prs, error: prError }] =
    await Promise.all([
      listExercises(supabase, {}),
      listMuscleGroups(supabase),
      supabase.from("v_exercise_prs").select("*").eq("user_id", user.id),
    ]);
  if (prError) throw prError;

  const lastPerformed: Record<string, string> = {};
  for (const p of prs ?? []) {
    if (p.last_performed_at) lastPerformed[p.exercise_id] = p.last_performed_at;
  }

  return (
    <ExercisesBrowser
      exercises={exercises}
      muscleGroups={muscleGroups}
      lastPerformed={lastPerformed}
    />
  );
}
