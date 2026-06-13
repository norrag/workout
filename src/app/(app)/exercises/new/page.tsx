import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMuscleGroups } from "@/lib/queries/exercises";
import { NewExerciseForm } from "./NewExerciseForm";

export default async function NewExercisePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const muscleGroups = await listMuscleGroups(supabase);

  return (
    <div>
      <Link
        href="/exercises"
        className="block text-[10px] font-medium tracking-[0.12em] text-ink/55"
      >
        ‹ EXERCISES
      </Link>
      <h1 className="title-display mt-3 text-[27px]">new exercise</h1>
      <div className="mt-1 text-[10px] font-medium tracking-[0.12em] text-ink/55">
        CUSTOM — ONLY VISIBLE TO YOU
      </div>
      <NewExerciseForm muscleGroups={muscleGroups} />
    </div>
  );
}
