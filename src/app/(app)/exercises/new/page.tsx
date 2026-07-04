import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMuscleGroups } from "@/lib/queries/exercises";
import { getActiveEngineParams } from "@/lib/queries/generation";
import { toEngineEquipment } from "@/lib/engine";
import {
  customExerciseEquipment,
  type CustomExerciseEquipment,
} from "@/lib/types/equipment";
import { NewExerciseForm } from "./NewExerciseForm";

export default async function NewExercisePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [muscleGroups, activeParams] = await Promise.all([
    listMuscleGroups(supabase),
    getActiveEngineParams(supabase),
  ]);

  // N22 — the load step is settable at creation; each creatable equipment
  // value carries its engine default rounding step so the DEFAULT chip is
  // honest about what "default" means for the current pick.
  const defaultSteps = Object.fromEntries(
    customExerciseEquipment.map((eq) => [
      eq,
      activeParams.params.rounding[toEngineEquipment(eq)] ?? 5,
    ]),
  ) as Record<CustomExerciseEquipment, number>;

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
      <NewExerciseForm muscleGroups={muscleGroups} defaultSteps={defaultSteps} />
    </div>
  );
}
