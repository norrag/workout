import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { listExercises } from "@/lib/queries/exercises";

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
  const exercises = await listExercises(supabase, { search: q });

  return (
    <div className="flex flex-col gap-6">
      <header className="border-b-[1.5px] border-ink pb-3">
        <h1 className="title-display text-4xl">exercises</h1>
      </header>

      <form method="get">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search exercises"
          className="min-h-11 w-full border border-ink/30 bg-paper px-3 text-base placeholder:text-ink/40 focus:border-ink focus:ring-1 focus:ring-ink focus:outline-none"
        />
      </form>

      <Card>
        {exercises.length === 0 ? (
          <p className="text-sm text-ink/55">No exercises found.</p>
        ) : (
          <ul className="divide-y divide-ink/15">
            {exercises.map((ex) => {
              const primary = ex.muscles.find(
                (m) => m.role === "primary",
              )?.name;
              return (
                <li key={ex.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm">{ex.name}</p>
                    <p className="text-xs text-ink/55">
                      {[primary, ex.equipment_type].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {ex.user_id !== null && (
                    <span className="label-caps text-[10px] text-ink/55">
                      Custom
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
