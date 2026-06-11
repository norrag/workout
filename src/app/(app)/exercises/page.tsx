import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { MuscleChip } from "@/components/ui/MuscleChip";
import { createClient } from "@/lib/supabase/server";
import { listExercises, listMuscleGroups } from "@/lib/queries/exercises";
import { NewExerciseForm } from "./NewExerciseForm";

export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { q } = await searchParams;
  const [exercises, muscleGroups] = await Promise.all([
    listExercises(supabase, { search: q }),
    listMuscleGroups(supabase),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="label-caps text-lg font-bold">Library</h1>

      <form method="get">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search exercises"
          className="min-h-11 w-full rounded-[6px] border border-border-subtle bg-bg-raised px-3 text-base placeholder:text-text-secondary/60 focus:border-accent focus:outline-none"
        />
      </form>

      <Card>
        {exercises.length === 0 ? (
          <p className="text-sm text-text-secondary">No exercises found.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {exercises.map((ex) => {
              const primary =
                ex.muscles.find((m) => m.role === "primary")?.name ?? null;
              return (
                <li key={ex.id} className="flex items-center justify-between py-3">
                  <div>
                    <MuscleChip name={primary} />
                    <p className="text-sm">{ex.name}</p>
                    <p className="text-xs text-text-secondary">
                      {ex.equipment_type}
                    </p>
                  </div>
                  {ex.user_id !== null && (
                    <span className="label-caps text-[10px] text-text-secondary">
                      Custom
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card header="Custom">
        <NewExerciseForm muscleGroups={muscleGroups} />
      </Card>
    </div>
  );
}
